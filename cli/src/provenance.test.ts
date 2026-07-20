import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isSourceArtifact, restoreCachedArtifact, storeCachedArtifact } from "./provenance.js";

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
