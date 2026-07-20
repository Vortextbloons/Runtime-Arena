import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runProcess } from "./process.js";
import type { RunnerCache } from "./runner-cache.js";

export type ProvenanceInput = {
  path: string;
  recursive?: boolean;
};

export type ProvenanceProbe = {
  id: string;
  command: string;
  arguments?: string[];
};

export type LanguageProvenance = {
  environmentAllowlist?: string[];
  externalInputs?: ProvenanceInput[];
  probes?: ProvenanceProbe[];
};

export type ToolchainSummary = {
  executables: Record<string, { path: string; sha256: string }>;
  versions: Record<string, string>;
  target: string;
  compilerFlags: string[];
  environment: Record<string, string>;
};

export type BuildProvenance = ToolchainSummary & {
  inputHashes: Record<string, string>;
  inputAggregateHash: string;
  buildFingerprint: string;
};

export type CacheManifest = {
  schemaVersion: "1.0.0";
  cacheFingerprint: string;
  benchmarkId: string;
  languageId: string;
  command: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  toolchain: ToolchainSummary;
  inputAggregateHash: string;
  artifactPath: string;
  artifactSha256: string;
};

const CACHE_MANIFEST = "manifest.json";
const SHA256_HEX = /^[a-f0-9]{64}$/;

async function exists(file: string) {
  return access(file).then(() => true, () => false);
}

async function sha256Bytes(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(file: string, cache?: RunnerCache) {
  const bytes = cache ? await cache.readFile(file) : await readFile(file);
  return sha256Bytes(bytes);
}

async function hashTree(directory: string, hash: ReturnType<typeof createHash>, root: string, cache?: RunnerCache) {
  if (!await exists(directory)) return;
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (["node_modules", "target", "dist", "build", "__pycache__", ".arena"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashTree(file, hash, root, cache);
    else if (!entry.name.endsWith(".exe") && !entry.name.endsWith(".pyc")) {
      hash.update(path.relative(root, file).replaceAll("\\", "/"));
      hash.update(cache ? await cache.readFile(file) : await readFile(file));
    }
  }
}

async function hashInput(root: string, input: ProvenanceInput, cache?: RunnerCache) {
  const resolved = path.resolve(root, input.path);
  if (!(await exists(resolved))) return "";
  if (input.recursive) {
    const hash = createHash("sha256");
    await hashTree(resolved, hash, root, cache);
    return hash.digest("hex");
  }
  return sha256File(resolved, cache);
}

function resolveExecutable(command: string, cwd: string) {
  if (path.isAbsolute(command) || command.includes(path.sep)) return command;
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const search = (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter);
  for (const directory of [cwd, ...search]) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}

export async function collectBuildProvenance(options: {
  root: string;
  languageId: string;
  languageManifestPath: string;
  implementationDir: string;
  benchmarkId: string;
  build: { command: string; arguments: string[]; workingDirectory?: string; artifact: string };
  environment: Record<string, string>;
  provenance?: LanguageProvenance;
  vars: Record<string, string>;
  cache?: RunnerCache;
}): Promise<BuildProvenance> {
  const expand = (value: string) => value.replace(/\{([^}]+)\}/g, (_, key: string) => options.vars[key] ?? `{${key}}`);
  const cwd = path.resolve(options.root, expand(options.build.workingDirectory ?? "{implementationDir}"));
  const buildCommand = expand(options.build.command);
  const buildArgs = options.build.arguments.map(expand);
  const compilerFlags = buildArgs.filter(argument => argument.startsWith("-"));
  const executables: ToolchainSummary["executables"] = {};
  const versions: ToolchainSummary["versions"] = {};
  const resolvedBuild = resolveExecutable(buildCommand, cwd);
  executables.build = { path: resolvedBuild, sha256: await sha256File(resolvedBuild, options.cache).catch(() => "missing") };

  for (const probe of options.provenance?.probes ?? []) {
    const command = expand(probe.command);
    const args = (probe.arguments ?? []).map(expand);
    const resolved = resolveExecutable(command, cwd);
    executables[probe.id] = { path: resolved, sha256: await sha256File(resolved, options.cache).catch(() => "missing") };
    const proc = await runProcess(resolved, args, cwd, 30_000, options.environment);
    versions[probe.id] = (proc.stdout || proc.stderr).split(/\r?\n/).map(line => line.trim()).find(line => /\d/.test(line)) ?? "unknown";
  }

  const env: Record<string, string> = {};
  for (const key of options.provenance?.environmentAllowlist ?? []) {
    const value = options.environment[key] ?? process.env[key];
    if (value !== undefined) env[key] = value;
  }

  const inputHashes: Record<string, string> = {};
  const manifestBytes = options.cache ? await options.cache.readFile(options.languageManifestPath) : await readFile(options.languageManifestPath);
  inputHashes.languageManifest = await sha256Bytes(manifestBytes);
  const implementationHash = createHash("sha256");
  await hashTree(options.implementationDir, implementationHash, options.root, options.cache);
  inputHashes.implementationTree = implementationHash.digest("hex");

  for (const input of options.provenance?.externalInputs ?? []) {
    const key = path.relative(options.root, path.resolve(options.root, expand(input.path))).replaceAll("\\", "/");
    inputHashes[key] = await hashInput(options.root, { ...input, path: expand(input.path) }, options.cache);
  }

  const aggregate = createHash("sha256");
  for (const key of Object.keys(inputHashes).sort()) {
    aggregate.update(key);
    aggregate.update(inputHashes[key]!);
  }
  const inputAggregateHash = aggregate.digest("hex");
  const buildFingerprint = createHash("sha256")
    .update(manifestBytes)
    .update(JSON.stringify({ benchmarkId: options.benchmarkId, build: options.build, inputAggregateHash, executables, versions, target: process.arch, compilerFlags, environment: env }))
    .digest("hex");

  return {
    executables,
    versions,
    target: `${process.platform}/${process.arch}`,
    compilerFlags,
    environment: env,
    inputHashes,
    inputAggregateHash,
    buildFingerprint
  };
}

export function isSourceArtifact(artifact: string, implementationDir: string, sourceExtensions: string[]): boolean {
  const resolvedArtifact = path.resolve(artifact);
  const resolvedImplementation = path.resolve(implementationDir);
  if (path.dirname(resolvedArtifact) !== resolvedImplementation) return false;
  return sourceExtensions.includes(path.extname(resolvedArtifact));
}

export async function restoreCachedArtifact(options: {
  cacheDir: string;
  artifact: string;
  implementationDir: string;
  sourceExtensions: string[];
  buildProvenance: BuildProvenance;
  benchmarkId: string;
  languageId: string;
  command: string[];
  workingDirectory: string;
  environment: Record<string, string>;
}) {
  const manifestPath = path.join(options.cacheDir, CACHE_MANIFEST);
  if (!await exists(manifestPath)) return false;
  let manifest: CacheManifest;
  try {
    const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const candidate = value as Partial<CacheManifest>;
    if (candidate.schemaVersion !== "1.0.0"
      || typeof candidate.cacheFingerprint !== "string"
      || typeof candidate.artifactSha256 !== "string"
      || !SHA256_HEX.test(candidate.artifactSha256)) return false;
    manifest = candidate as CacheManifest;
  } catch {
    return false;
  }
  if (manifest.cacheFingerprint !== options.buildProvenance.buildFingerprint) return false;

  if (isSourceArtifact(options.artifact, options.implementationDir, options.sourceExtensions)) {
    if (!await exists(options.artifact)) return false;
    return (await sha256File(options.artifact)) === manifest.artifactSha256;
  }

  const cachedArtifact = path.join(options.cacheDir, path.basename(options.artifact));
  if (!await exists(cachedArtifact)) return false;
  const artifactSha256 = await sha256File(cachedArtifact);
  if (artifactSha256 !== manifest.artifactSha256) return false;
  await mkdir(path.dirname(options.artifact), { recursive: true });
  await copyFile(cachedArtifact, options.artifact);
  return true;
}

export async function storeCachedArtifact(options: {
  cacheDir: string;
  artifact: string;
  implementationDir: string;
  sourceExtensions: string[];
  buildProvenance: BuildProvenance;
  benchmarkId: string;
  languageId: string;
  command: string[];
  workingDirectory: string;
  environment: Record<string, string>;
}) {
  await mkdir(options.cacheDir, { recursive: true });
  const artifactSha256 = await sha256File(options.artifact);
  if (!isSourceArtifact(options.artifact, options.implementationDir, options.sourceExtensions)) {
    const cachedArtifact = path.join(options.cacheDir, path.basename(options.artifact));
    await copyFile(options.artifact, cachedArtifact);
  }
  const manifest: CacheManifest = {
    schemaVersion: "1.0.0",
    cacheFingerprint: options.buildProvenance.buildFingerprint,
    benchmarkId: options.benchmarkId,
    languageId: options.languageId,
    command: options.command,
    workingDirectory: path.relative(options.workingDirectory, options.workingDirectory).replaceAll("\\", "/") || ".",
    environment: options.environment,
    toolchain: {
      executables: options.buildProvenance.executables,
      versions: options.buildProvenance.versions,
      target: options.buildProvenance.target,
      compilerFlags: options.buildProvenance.compilerFlags,
      environment: options.buildProvenance.environment
    },
    inputAggregateHash: options.buildProvenance.inputAggregateHash,
    artifactPath: path.basename(options.artifact),
    artifactSha256
  };
  const temp = path.join(options.cacheDir, `${process.pid}.manifest.tmp`);
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temp, path.join(options.cacheDir, CACHE_MANIFEST));
}

export async function fingerprintCell(options: {
  root: string;
  languageManifestPath: string;
  benchmarkManifestPath: string;
  datasetPath: string;
  implementationDir: string;
  checkerDir: string;
  metricsPath: string;
  protocolPath: string;
  timingPath: string;
  metadata: Record<string, unknown>;
  buildProvenance: BuildProvenance;
  cache?: RunnerCache;
}) {
  const hash = createHash("sha256");
  for (const file of [
    options.languageManifestPath,
    options.benchmarkManifestPath,
    options.datasetPath,
    options.metricsPath,
    options.protocolPath,
    options.timingPath
  ]) {
    hash.update(path.relative(options.root, file).replaceAll("\\", "/"));
    hash.update(options.cache ? await options.cache.readFile(file) : await readFile(file));
  }
  await hashTree(options.implementationDir, hash, options.root, options.cache);
  await hashTree(options.checkerDir, hash, options.root, options.cache);
  hash.update(JSON.stringify({ ...options.metadata, buildFingerprint: options.buildProvenance.buildFingerprint }));
  return hash.digest("hex");
}

export async function artifactSize(file: string) {
  return (await stat(file)).size;
}
