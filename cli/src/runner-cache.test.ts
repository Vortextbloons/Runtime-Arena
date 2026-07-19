import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RunnerCache, stageIsolatedDatasets } from "./runner-cache.js";

test("RunnerCache reuses dataset hashes for the same file", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "arena-cache-"));
  try {
    const file = path.join(directory, "data.json");
    writeFileSync(file, "{\"value\":1}\n");
    const cache = new RunnerCache(directory);
    const first = await cache.sha256(file);
    const second = await cache.sha256(file);
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("stageIsolatedDatasets copies each unique dataset once", async () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), "arena-source-"));
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "arena-temp-"));
  try {
    const dataset = path.join(sourceRoot, "small.json");
    writeFileSync(dataset, "{\"records\":[]}\n");
    const staged = await stageIsolatedDatasets([
      { benchmark: { id: "record-sorting" }, input: dataset },
      { benchmark: { id: "record-sorting" }, input: dataset }
    ], tempRoot);
    assert.equal(staged.size, 1);
    assert.match(staged.get(dataset)!, /record-sorting[\\/]+small\.json$/);
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
