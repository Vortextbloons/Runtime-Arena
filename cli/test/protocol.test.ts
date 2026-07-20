import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runHarnessProtocol } from "../src/protocol.js";
import {
  bootstrapMedianConfidenceInterval,
  readTimingSamples,
  relativeMedianConfidenceIntervalWidth,
  shouldStopMeasuring
} from "../src/timing.js";
import { parseProtocolLine } from "../src/protocol.js";

const fixtures = path.dirname(fileURLToPath(import.meta.url)) + "/fixtures";

const policy = {
  minMeasuredIterations: 2,
  maxMeasuredIterations: 5,
  targetRelativeConfidenceInterval: 0.05,
  mode: "adaptive-median-confidence-interval" as const
};

test("bootstrap median CI is deterministic for a fixed sample sequence", () => {
  const samples = [1_000_000, 1_050_000, 990_000, 1_020_000, 1_010_000];
  assert.deepEqual(bootstrapMedianConfidenceInterval(samples), bootstrapMedianConfidenceInterval(samples));
});

test("stops once the median confidence interval is narrow enough", () => {
  const stable = Array.from({ length: 10 }, () => 1_000_000);
  assert.equal(shouldStopMeasuring(stable, { minMeasuredIterations: 10, maxMeasuredIterations: 30, targetRelativeConfidenceInterval: 0.05 }), true);
});

test("keeps measuring multimodal samples until max iterations", () => {
  const multimodal = [1_000_000, 1_000_000, 50_000_000, 1_000_000, 1_000_000, 50_000_000, 1_000_000, 1_000_000, 50_000_000, 1_000_000];
  assert.ok(relativeMedianConfidenceIntervalWidth(multimodal) > 0.05);
  assert.equal(shouldStopMeasuring(multimodal.slice(0, 9), { ...policy, minMeasuredIterations: 2, maxMeasuredIterations: 10 }), false);
  assert.equal(shouldStopMeasuring(multimodal, { ...policy, minMeasuredIterations: 2, maxMeasuredIterations: 10 }), true);
});

test("nonpositive medians always continue until max iterations", () => {
  assert.equal(shouldStopMeasuring([0, 0], { ...policy, minMeasuredIterations: 2, maxMeasuredIterations: 5 }), false);
  assert.equal(shouldStopMeasuring(Array.from({ length: 5 }, () => 0), { ...policy, minMeasuredIterations: 2, maxMeasuredIterations: 5 }), true);
});

test("fixed mode honors exact iteration count via policy bounds", () => {
  const fixed = { minMeasuredIterations: 3, maxMeasuredIterations: 3, targetRelativeConfidenceInterval: 0, mode: "fixed" as const };
  assert.equal(shouldStopMeasuring([1, 2], fixed), false);
  assert.equal(shouldStopMeasuring([1, 2, 3], fixed), true);
});

test("parseProtocolLine rejects malformed and mismatched messages", () => {
  assert.throws(() => parseProtocolLine("{", "ready"));
  assert.throws(() => parseProtocolLine(JSON.stringify({ type: "ready", protocolVersion: "1.0.0" }), "ready"));
  assert.throws(() => parseProtocolLine(JSON.stringify({ type: "result", requestId: 2, digest: "a".repeat(64) }), "result", 1));
});

test("legacy timing sidecar reader still validates 1.x samples", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arena-timing-"));
  const file = path.join(directory, "timing.json");
  await writeFile(file, JSON.stringify({ samples: [{ iteration: 1, kernelTimeNanoseconds: 0 }, { iteration: 2, kernelTimeNanoseconds: 1 }] }));
  try {
    assert.deepEqual(await readTimingSamples(file, policy), [
      { iteration: 1, kernelTimeNanoseconds: 0 },
      { iteration: 2, kernelTimeNanoseconds: 1 }
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fake worker protocol obeys sequencing and digest contract", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arena-protocol-"));
  const output = path.join(directory, "output.json");
  const result = await runHarnessProtocol({
    command: process.execPath,
    args: [path.join(fixtures, "fake-worker.mjs"), "--input", path.join(fixtures, "input.json"), "--output", output, "--protocol-version", "2.0.0"],
    cwd: directory,
    outputFile: output,
    warmups: 0,
    measurement: { minMeasuredIterations: 1, maxMeasuredIterations: 1, targetRelativeConfidenceInterval: 0, mode: "fixed" },
    timeoutMilliseconds: 5_000,
    maxCapturedBytes: 1_000_000
  });
  assert.equal(result.success, true);
  await rm(directory, { recursive: true, force: true });
});

for (const [behavior, expectedError] of [["extra-output", "unexpected extra protocol output|malformed protocol JSON"], ["nonzero-exit", "worker exited with code 7"]] as const) {
  test(`fake worker rejects ${behavior}`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "arena-protocol-"));
    const output = path.join(directory, "output.json");
    try {
      const result = await runHarnessProtocol({
        command: process.execPath,
        args: [path.join(fixtures, "fake-worker.mjs"), "--output", output, "--behavior", behavior],
        cwd: directory,
        outputFile: output,
        warmups: 0,
        measurement: { minMeasuredIterations: 1, maxMeasuredIterations: 1, targetRelativeConfidenceInterval: 0, mode: "fixed" },
        timeoutMilliseconds: 5_000,
        maxCapturedBytes: 1_000_000
      });
      assert.equal(result.success, false);
      assert.match(result.error ?? "", new RegExp(expectedError));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
