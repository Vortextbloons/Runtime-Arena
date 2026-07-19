import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("discovers all benchmark definitions", () => {
  const result = arena("list", "benchmarks");
  assert.equal(result.status, 0, result.stderr);
  for (const benchmark of ["nbody", "shortest-path", "aggregation", "word-frequency", "record-sorting", "matrix-multiplication"]) assert.match(result.stdout, new RegExp(benchmark));
});

test("generates deterministic new benchmark fixtures", () => {
  const cases = [
    { benchmark: "record-sorting", mutation: "random" },
    { benchmark: "record-sorting", mutation: "mostly-sorted" },
    { benchmark: "word-frequency", mutation: "repeated-vocabulary" },
    { benchmark: "matrix-multiplication", mutation: "row-major" }
  ];
  for (const { benchmark, mutation } of cases) {
    const first = arena("dataset", "generate", "--benchmark", benchmark, "--size", "small", "--mutation", mutation);
    assert.equal(first.status, 0, first.stderr);
    const dataset = path.join(root, "benchmarks", benchmark, "datasets", `small-${mutation}.json`);
    const firstContent = readFileSync(dataset, "utf8");
    const second = arena("dataset", "generate", "--benchmark", benchmark, "--size", "small", "--mutation", mutation);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(dataset, "utf8"), firstContent);
  }
});

test("prints metric availability", () => {
  const result = arena("list", "metrics");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /kernelTime/);
});

test("runs a filtered benchmark and emits clean JSON", () => {
  const result = arena("run", "--language", "typescript", "--benchmark", "aggregation", "--size", "small", "--warmup", "0", "--iterations", "1", "--format", "json", "--quiet", "--no-save");
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout) as { snapshotId: string; results: Array<{ checker: { status: string }; execution: { mode: string; samples: Array<{ kernelTimeNanoseconds: number }> } }> };
  assert.match(record.snapshotId, /Z$/);
  const measured = record.results.find((entry: any) =>
    entry.benchmark.id === "aggregation" && entry.benchmark.size === "small" && entry.language.id === "typescript"
  );
  assert.equal(measured?.checker.status, "accepted");
  assert.equal(measured?.execution.samples.length, 1);
  assert.equal(measured?.execution.mode, "persistent-worker");
  assert.ok(Number.isSafeInteger(measured?.execution.samples[0]?.kernelTimeNanoseconds));
});

test("reports canonical cell freshness without running benchmarks", () => {
  const result = arena("results", "status", "--benchmark", "aggregation", "--language", "typescript", "--size", "small");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /aggregation\/small\/typescript\s+(?:current|stale)/);
});

test("summarizes canonical results with filters", () => {
  const result = arena("results", "summary", "--benchmark", "aggregation", "--size", "small");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Benchmark/);
  assert.match(result.stdout, /Relative/);
  assert.match(result.stdout, /aggregation\/small/);
  assert.match(result.stdout, /★ = fastest in group/);
});

test("doctor reports repository health", () => {
  const result = arena("doctor");
  assert.ok([0, 1].includes(result.status ?? -1), result.stdout + result.stderr);
  assert.match(result.stdout, /Checker\s+ok/);
  assert.match(result.stdout, /Results\s+writable/);
  assert.match(result.stdout, /Impl word-frequency\s+pending \(definition only\)/);
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
