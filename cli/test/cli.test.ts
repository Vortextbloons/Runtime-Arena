import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function arena(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "cli/src/index.ts", ...args], {
    cwd: root, encoding: "utf8", windowsHide: true
  });
}

test("discovers all required languages", () => {
  const result = arena("list", "languages");
  assert.equal(result.status, 0, result.stderr);
  for (const language of ["rust", "go", "typescript"]) assert.match(result.stdout, new RegExp(language));
});

test("discovers all initial benchmarks", () => {
  const result = arena("list", "benchmarks");
  assert.equal(result.status, 0, result.stderr);
  for (const benchmark of ["nbody", "shortest-path", "aggregation"]) assert.match(result.stdout, new RegExp(benchmark));
});

test("prints metric availability", () => {
  const result = arena("list", "metrics");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /wallTime/);
  assert.match(result.stdout, /peakMemory/);
});

test("runs a filtered benchmark and emits clean JSON", () => {
  const result = arena("run", "--language", "typescript", "--benchmark", "aggregation", "--size", "small", "--warmup", "0", "--iterations", "1", "--format", "json", "--quiet", "--no-save");
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout) as { snapshotId: string; results: Array<{ checker: { status: string }; execution: { samples: unknown[] } }> };
  assert.match(record.snapshotId, /Z$/);
  const measured = record.results.find((entry: any) =>
    entry.benchmark.id === "aggregation" && entry.benchmark.size === "small" && entry.language.id === "typescript"
  );
  assert.equal(measured?.checker.status, "accepted");
  assert.equal(measured?.execution.samples.length, 1);
});

test("reports canonical cell freshness without running benchmarks", () => {
  const result = arena("results", "status", "--benchmark", "aggregation", "--language", "typescript", "--size", "small");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /aggregation\/small\/typescript\s+current/);
});

test("doctor validates the complete repository", () => {
  const result = arena("doctor");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Checker\s+ok/);
  assert.match(result.stdout, /Results\s+writable/);
});

test("check rejects malformed output with the correct status", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "arena-check-"));
  try {
    const output = path.join(directory, "output.json");
    writeFileSync(output, `{"benchmark":"nbody",`);
    const input = path.join(root, "benchmarks", "nbody", "datasets", "small.json");
    const result = arena("check", "--benchmark", "nbody", "--input", input, "--output", output);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /malformed-output/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("check reports unsupported output versions", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "arena-version-"));
  try {
    const output = path.join(directory, "output.json");
    writeFileSync(output, JSON.stringify({ benchmark: "nbody", version: 99, bodyCount: 1, finalEnergy: 0, positionChecksum: "x", velocityChecksum: "y" }));
    const input = path.join(root, "benchmarks", "nbody", "datasets", "small.json");
    const result = arena("check", "--benchmark", "nbody", "--input", input, "--output", output);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /unsupported-version/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
