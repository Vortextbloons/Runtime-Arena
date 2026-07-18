import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
