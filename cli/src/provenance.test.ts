import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fingerprintCell, isSourceArtifact, restoreCachedArtifact, storeCachedArtifact } from "./provenance.js";
import { RunnerCache } from "./runner-cache.js";

test("isSourceArtifact detects implementation-root source files", () => {
  const implementationDir = path.join("/repo", "benchmarks", "nbody", "implementations", "javascript");
  assert.equal(isSourceArtifact(path.join(implementationDir, "index.mjs"), implementationDir, [".mjs"]), true);
  assert.equal(isSourceArtifact(path.join(implementationDir, "dist", "index.js"), implementationDir, [".ts", ".js"]), false);
  assert.equal(isSourceArtifact(path.join(implementationDir, "nbody.exe"), implementationDir, [".c"]), false);
});

test("source artifacts restore from manifest without copying over source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "arena-provenance-"));
  const implementationDir = path.join(root, "impl");
  const cacheDir = path.join(root, "cache");
  const artifact = path.join(implementationDir, "index.mjs");
  await mkdir(implementationDir, { recursive: true });
  await writeFile(artifact, "export const answer = 42;\n");

  const buildProvenance = {
    executables: {},
    versions: {},
    target: "win32/x64",
    compilerFlags: [],
    environment: {},
    inputHashes: {},
    inputAggregateHash: "inputs",
    buildFingerprint: "fingerprint"
  };

  await storeCachedArtifact({
    cacheDir,
    artifact,
    implementationDir,
    sourceExtensions: [".mjs"],
    buildProvenance,
    benchmarkId: "nbody",
    languageId: "javascript",
    command: ["node", "-e", "0"],
    workingDirectory: implementationDir,
    environment: {}
  });

  const restored = await restoreCachedArtifact({
    cacheDir,
    artifact,
    implementationDir,
    sourceExtensions: [".mjs"],
    buildProvenance,
    benchmarkId: "nbody",
    languageId: "javascript",
    command: ["node", "-e", "0"],
    workingDirectory: implementationDir,
    environment: {}
  });

  assert.equal(restored, true);
  assert.equal(await readFile(artifact, "utf8"), "export const answer = 42;\n");
});

test("corrupted cache manifests are treated as cache misses", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "arena-provenance-"));
  const implementationDir = path.join(root, "impl");
  const cacheDir = path.join(root, "cache");
  const artifact = path.join(implementationDir, "program.exe");
  await mkdir(implementationDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, "manifest.json"), "not json");

  const restored = await restoreCachedArtifact({
    cacheDir,
    artifact,
    implementationDir,
    sourceExtensions: [".ts"],
    buildProvenance: {
      executables: {}, versions: {}, target: "test", compilerFlags: [], environment: {},
      inputHashes: {}, inputAggregateHash: "a".repeat(64), buildFingerprint: "b".repeat(64)
    },
    benchmarkId: "demo",
    languageId: "demo",
    command: [],
    workingDirectory: implementationDir,
    environment: {}
  });

  assert.equal(restored, false);
});

test("cached tree hashing preserves cell fingerprints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "arena-fingerprint-"));
  try {
    const implementationDir = path.join(root, "implementation");
    const checkerDir = path.join(root, "checker");
    await mkdir(implementationDir);
    await mkdir(checkerDir);
    await writeFile(path.join(implementationDir, "main.ts"), "export const value = 1;\n");
    await writeFile(path.join(checkerDir, "main.go"), "package main\n");

    const files = ["language.json", "benchmark.json", "dataset.json", "metrics.ts", "protocol.ts", "timing.ts"];
    await Promise.all(files.map(file => writeFile(path.join(root, file), `${file}\n`)));
    const buildProvenance = {
      executables: {}, versions: {}, target: "test", compilerFlags: [], environment: {}, inputHashes: {},
      inputAggregateHash: "a".repeat(64), buildFingerprint: "b".repeat(64)
    };
    const options = {
      root,
      languageManifestPath: path.join(root, "language.json"),
      benchmarkManifestPath: path.join(root, "benchmark.json"),
      datasetPath: path.join(root, "dataset.json"),
      implementationDir,
      checkerDir,
      metricsPath: path.join(root, "metrics.ts"),
      protocolPath: path.join(root, "protocol.ts"),
      timingPath: path.join(root, "timing.ts"),
      metadata: { size: "small" },
      buildProvenance
    };

    const uncached = await fingerprintCell(options);
    const cache = new RunnerCache(root);
    const cached = await fingerprintCell({ ...options, cache });
    const cachedAgain = await fingerprintCell({ ...options, cache });
    assert.equal(cached, uncached);
    assert.equal(cachedAgain, uncached);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
