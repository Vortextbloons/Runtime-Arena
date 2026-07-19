import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readTimingSamples,
  relativeMeanConfidenceIntervalWidth,
  shouldStopMeasuring,
  type MeasurementPolicy
} from "./timing.js";

const policy: MeasurementPolicy = {
  minMeasuredIterations: 2,
  maxMeasuredIterations: 5,
  targetRelativeConfidenceInterval: 0.05
};

async function sidecar(value: unknown) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "arena-timing-"));
  const file = path.join(directory, "timing.json");
  await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
  return { file, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("accepts adaptive kernel timing samples within policy bounds", async () => {
  const fixture = await sidecar({ samples: [{ iteration: 1, kernelTimeNanoseconds: 0 }, { iteration: 2, kernelTimeNanoseconds: 1 }] });
  try {
    assert.deepEqual(await readTimingSamples(fixture.file, policy), [
      { iteration: 1, kernelTimeNanoseconds: 0 },
      { iteration: 2, kernelTimeNanoseconds: 1 }
    ]);
  } finally {
    await fixture.cleanup();
  }
});

for (const [name, value] of [
  ["malformed JSON", "{"],
  ["too few samples", { samples: [{ iteration: 1, kernelTimeNanoseconds: 0 }] }],
  ["too many samples", { samples: Array.from({ length: 6 }, (_, index) => ({ iteration: index + 1, kernelTimeNanoseconds: index })) }],
  ["negative duration", { samples: [{ iteration: 1, kernelTimeNanoseconds: -1 }, { iteration: 2, kernelTimeNanoseconds: 1 }] }],
  ["fractional duration", { samples: [{ iteration: 1, kernelTimeNanoseconds: 1.5 }, { iteration: 2, kernelTimeNanoseconds: 2 }] }],
  ["wrong iteration", { samples: [{ iteration: 2, kernelTimeNanoseconds: 1 }, { iteration: 2, kernelTimeNanoseconds: 2 }] }],
  ["extra fields", { samples: [{ iteration: 1, kernelTimeNanoseconds: 1, extra: true }, { iteration: 2, kernelTimeNanoseconds: 2 }] }]
] as const) {
  test(`rejects ${name}`, async () => {
    const fixture = await sidecar(value);
    try {
      await assert.rejects(readTimingSamples(fixture.file, policy));
    } finally {
      await fixture.cleanup();
    }
  });
}

test("stops once the confidence interval is narrow enough", () => {
  const stable = Array.from({ length: 10 }, () => 1_000_000);
  assert.equal(shouldStopMeasuring(stable, { minMeasuredIterations: 10, maxMeasuredIterations: 30, targetRelativeConfidenceInterval: 0.05 }), true);
});

test("keeps measuring noisy samples until max iterations", () => {
  const noisy = [1_000_000, 2_000_000, 500_000, 1_500_000, 1_200_000, 800_000, 1_100_000, 900_000, 1_050_000, 950_000];
  assert.equal(relativeMeanConfidenceIntervalWidth(noisy) > 0.05, true);
  assert.equal(shouldStopMeasuring(noisy, { minMeasuredIterations: 10, maxMeasuredIterations: 10, targetRelativeConfidenceInterval: 0.05 }), true);
});
