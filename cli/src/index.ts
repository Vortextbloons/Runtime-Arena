#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { metricAvailability } from "./metrics.js";
import {
  GENERATOR_VERSION,
  cellKey,
  expandSizeCells,
  generateDatasetContent,
  groupKey,
  type SizeConfig
} from "./mutations.js";
import { type MeasurementPolicy } from "./timing.js";
import { MEASUREMENT_PROTOCOL_VERSION, runHarnessProtocol } from "./protocol.js";
import {
  artifactSize,
  collectBuildProvenance,
  fingerprintCell as fingerprintCellInputs,
  restoreCachedArtifact,
  storeCachedArtifact,
  type LanguageProvenance
} from "./provenance.js";
import { runProcess } from "./process.js";
import { RunnerCache, stageIsolatedDatasets } from "./runner-cache.js";
import { jdkPathEnvironment, resolveJdkTool } from "./jdk.js";
import { resolveLanguageProvenance } from "./provenance-defaults.js";
import { runProtocolConformance } from "./protocol-conformance.js";
import { prepareMinimalWorkerRun } from "./minimal-workers.js";

type Command = { command: string; arguments: string[]; workingDirectory?: string; artifact?: string };
type Language = {
  id: string;
  name: string;
  enabled: boolean;
  detect: Command;
  build: Command & { artifact: string };
  run: Command;
  environment: Record<string, string>;
  sourceExtensions?: string[];
  provenance?: LanguageProvenance;
};
type Benchmark = { id: string; name: string; version: number; sizes: Record<string, SizeConfig>; metrics: string[]; limits: { timeoutMilliseconds: number; maxOutputBytes: number } };
type Machine = { operatingSystem: { platform: string; release: string }; cpu: { model: string; architecture: string; logicalCores: number }; memoryBytes: number };
type Provenance = {
  fingerprint: string;
  measurementContractVersion?: string;
  measuredAt: string;
  machine: Machine;
  buildFingerprint?: string;
  artifactSha256?: string;
  toolchain?: Record<string, unknown>;
};
type BenchmarkResult = Record<string, any> & { benchmark: Record<string, any> & { id: string; version: number; size: string }; language: Record<string, any> & { id: string; name: string; version: string }; checker: Record<string, any> & { status: string }; provenance?: Provenance };
type Snapshot = { schemaVersion: string; snapshotId: string; updatedAt: string; arenaVersion: string; gitCommit?: string | null; gitDirty?: boolean | null; results: BenchmarkResult[] };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const config = JSON.parse(await readFile(path.join(root, "arena.config.json"), "utf8")) as {
  benchmarkDirectory: string; languageDirectory: string; resultDirectory: string; checkerExecutable: string;
  defaults: { sizes: string[]; warmupIterations: number; measuredIterations: number; metrics: string[] };
  measurement?: { minMeasuredIterations?: number; maxMeasuredIterations?: number; targetRelativeConfidenceInterval?: number };
  warmupOverrides?: Record<string, number>;
  execution: { parallelism: number; preserveTemporaryFiles: boolean };
};

function resolveWarmupIterations(cellWarmups: number, languageId: string, flagOverride?: string) {
  if (flagOverride !== undefined) return Number(flagOverride);
  const languageFloor = config.warmupOverrides?.[languageId] ?? 0;
  return Math.max(cellWarmups, languageFloor);
}

const MEASUREMENT_CONTRACT_VERSION = "2.0.0";
const EXECUTION_MODE = "harness-timed-persistent-worker";

function resolveMeasurementPolicy(flags: ReturnType<typeof parseFlags>, minOverride?: number): MeasurementPolicy {
  const minDefault = minOverride ?? config.measurement?.minMeasuredIterations ?? config.defaults.measuredIterations;
  const fixed = flags.get("--iterations");
  if (fixed) {
    const iterations = Number(fixed);
    return { minMeasuredIterations: iterations, maxMeasuredIterations: iterations, targetRelativeConfidenceInterval: 0, mode: "fixed" };
  }
  return {
    minMeasuredIterations: Number(flags.get("--min-iterations") ?? minDefault),
    maxMeasuredIterations: Number(flags.get("--max-iterations") ?? config.measurement?.maxMeasuredIterations ?? 30),
    targetRelativeConfidenceInterval: Number(flags.get("--target-ci") ?? config.measurement?.targetRelativeConfidenceInterval ?? 0.05),
    mode: "adaptive-median-confidence-interval"
  };
}

const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
const exists = async (file: string) => access(file).then(() => true, () => false);
const executable = (p: string) => process.platform === "win32" && existsSync(`${p}.exe`) ? `${p}.exe` : p;

async function discoverLanguages(): Promise<Language[]> {
  const dir = path.join(root, config.languageDirectory);
  const languages = await Promise.all(
    (await readdir(dir)).filter(x => x.endsWith(".json")).sort().map(x => json<Language>(path.join(dir, x)))
  );
  return Promise.all(languages.map(async language => ({
    ...language,
    provenance: await resolveLanguageProvenance(root, language)
  })));
}

async function discoverBenchmarks(): Promise<Benchmark[]> {
  const dir = path.join(root, config.benchmarkDirectory);
  const entries = await readdir(dir, { withFileTypes: true });
  const out: Benchmark[] = [];
  for (const entry of entries.filter(x => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name, "benchmark.json");
    if (await exists(file)) out.push(await json<Benchmark>(file));
  }
  return out;
}

function parseFlags(args: string[]) {
  const values = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!key.startsWith("-")) continue;
    if (["--no-save", "--quiet", "--preserve-temp", "--force", "--all", "--parallel", "--minimal"].includes(key)) bools.add(key);
    else {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${key}`);
      const normalized = key === "-l" || key === "--languages" ? "--language" : key === "-b" || key === "--benchmarks" ? "--benchmark" : key;
      values.set(normalized, [...(values.get(normalized) ?? []), value]);
    }
  }
  return { get: (k: string) => values.get(k)?.at(-1), all: (k: string) => values.get(k) ?? [], has: (k: string) => bools.has(k) };
}

function versionTuple(text: string): number[] {
  return text.match(/\d+(?:\.\d+){1,2}/)?.[0].split(".").map(Number) ?? [0];
}
function atLeast(text: string, minimum: number[]) {
  const got = versionTuple(text);
  return minimum.every((n, i) => (got[i] ?? 0) === n || (got[i] ?? 0) > n || got.slice(0, i).some((v, j) => v > minimum[j]!))
    && !got.some((v, i) => v < (minimum[i] ?? 0) && got.slice(0, i).every((x, j) => x === minimum[j]));
}

/** Keep a single version-bearing line so copyright banners do not churn fingerprints. */
function normalizeVersion(text: string): string {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.find(line => /\d+(?:\.\d+){1,2}/.test(line)) ?? lines[0] ?? "";
}

function withLanguageEnvironment(language: Language): Language {
  if (language.id !== "java") return language;
  return {
    ...language,
    environment: { ...language.environment, ...jdkPathEnvironment() }
  };
}

async function detections() {
  const minima: Record<string, number[]> = { rust: [1, 97], go: [1, 26], typescript: [26, 4], python: [3, 8] };
  return Promise.all((await discoverLanguages()).map(async raw => {
    const language = withLanguageEnvironment(raw);
    const detectCommand = language.id === "java" ? resolveJdkTool("javac") : language.detect.command;
    const p = await runProcess(detectCommand, language.detect.arguments, root, 30_000, language.environment);
    const version = normalizeVersion(p.stdout || p.stderr);
    const compiler = language.id === "typescript"
      ? await runProcess(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--version"], root)
      : p;
    const compilerVersion = normalizeVersion(compiler.stdout || compiler.stderr);
    return { language, available: p.code === 0 && atLeast(version, minima[language.id] ?? [0]), version, compilerVersion };
  }));
}

const currentResultPath = path.join(root, config.resultDirectory, "current.json");
const resultKey = (result: BenchmarkResult) => cellKey(
  result.benchmark.id,
  result.benchmark.size,
  result.language.id,
  result.benchmark.mutation as string | undefined
);

function currentMachine(): Machine {
  return {
    operatingSystem: { platform: process.platform, release: os.release() },
    cpu: { model: os.cpus()[0]?.model ?? "unknown", architecture: process.arch, logicalCores: os.cpus().length },
    memoryBytes: os.totalmem()
  };
}

async function fingerprintCell(
  language: Language,
  benchmark: Benchmark,
  sizeName: string,
  mutation: string | undefined,
  datasetFile: string,
  toolchainVersion: string,
  compilerVersion: string,
  warmups: number,
  measurement: MeasurementPolicy,
  buildProvenance: Awaited<ReturnType<typeof collectBuildProvenance>>,
  cache?: RunnerCache
) {
  return fingerprintCellInputs({
    root,
    languageManifestPath: path.join(root, config.languageDirectory, `${language.id}.json`),
    benchmarkManifestPath: path.join(root, config.benchmarkDirectory, benchmark.id, "benchmark.json"),
    datasetPath: path.join(root, config.benchmarkDirectory, benchmark.id, "datasets", datasetFile),
    implementationDir: path.join(root, config.benchmarkDirectory, benchmark.id, "implementations", language.id),
    checkerDir: path.join(root, "checker"),
    metricsPath: path.join(root, "cli", "src", "metrics.ts"),
    protocolPath: path.join(root, "cli", "src", "protocol.ts"),
    timingPath: path.join(root, "cli", "src", "timing.ts"),
    buildProvenance,
    cache,
    metadata: {
      benchmarkVersion: benchmark.version,
      measurementContractVersion: MEASUREMENT_CONTRACT_VERSION,
      size: sizeName,
      mutation: mutation ?? null,
      warmups,
      measurement,
      metrics: benchmark.metrics ?? config.defaults.metrics,
      toolchainVersion,
      compilerVersion
    }
  });
}

async function readSnapshot(): Promise<Snapshot | null> {
  return await exists(currentResultPath) ? json<Snapshot>(currentResultPath) : null;
}

async function doctor(): Promise<number> {
  console.log("Runtime Arena doctor\n");
  let bad = false;
  for (const d of await detections()) {
    const status = d.available ? "ok" : "unsupported/missing";
    console.log(`${d.language.name.padEnd(12)} ${status.padEnd(20)} ${d.version || "not found"}`);
    bad ||= !d.available;
  }
  const checker = executable(path.join(root, config.checkerExecutable));
  const checkerOk = await exists(checker);
  console.log(`${"Checker".padEnd(12)} ${(checkerOk ? "ok" : "missing (run npm run build:checker)").padEnd(20)} ${checkerOk ? checker : ""}`);
  const resultDir = path.join(root, config.resultDirectory);
  await mkdir(resultDir, { recursive: true });
  const writable = await access(resultDir, constants.W_OK).then(() => true, () => false);
  console.log(`${"Results".padEnd(12)} ${writable ? "writable" : "not writable"}`);
  bad ||= !checkerOk || !writable;
  const ajv = createAjv();
  const languageSchema = await json<Record<string, unknown>>(path.join(root, "schemas", "language.schema.json"));
  const benchmarkSchema = await json<Record<string, unknown>>(path.join(root, "schemas", "benchmark.schema.json"));
  const validateLanguage = ajv.compile(languageSchema);
  const validateBenchmark = ajv.compile(benchmarkSchema);
  for (const language of await discoverLanguages()) {
    if (!validateLanguage(language)) {
      bad = true;
      console.log(`${`Manifest ${language.id}`.padEnd(24)} invalid: ${ajv.errorsText(validateLanguage.errors)}`);
    }
  }
  for (const benchmark of await discoverBenchmarks()) {
    if (!validateBenchmark(benchmark)) {
      bad = true;
      console.log(`${`Manifest ${benchmark.id}`.padEnd(24)} invalid: ${ajv.errorsText(validateBenchmark.errors)}`);
    }
    for (const [size, settings] of Object.entries(benchmark.sizes)) {
      const datasets = settings.mutations
        ? Object.entries(settings.mutations).map(([mutation, entry]) => ({ label: `${size}/${mutation}`, file: entry.dataset }))
        : [{ label: size, file: settings.dataset! }];
      for (const { label, file } of datasets) {
        const dataset = path.join(root, config.benchmarkDirectory, benchmark.id, "datasets", file);
        if (!await exists(dataset)) {
          bad = true;
          console.log(`${`Dataset ${benchmark.id}/${label}`.padEnd(24)} missing`);
        }
      }
    }
    const implementationRoot = path.join(root, config.benchmarkDirectory, benchmark.id, "implementations");
    if (await exists(path.join(implementationRoot, ".gitkeep"))) {
      console.log(`${`Impl ${benchmark.id}`.padEnd(24)} pending (definition only)`);
    } else {
      for (const language of await discoverLanguages()) {
        const implementation = path.join(implementationRoot, language.id);
        if (!await exists(implementation)) {
          bad = true;
          console.log(`${`Impl ${benchmark.id}/${language.id}`.padEnd(24)} missing`);
        }
      }
    }
  }
  return bad ? 1 : 0;
}

function expand(value: string, vars: Record<string, string>) {
  return value.replace(/\{([^}]+)\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Unknown placeholder {${key}}`);
    return vars[key]!;
  });
}

async function buildOne(language: Language, benchmark: Benchmark, cache?: RunnerCache) {
  const implementationDir = path.join(root, "benchmarks", benchmark.id, "implementations", language.id);
  const command = [language.build.command, ...language.build.arguments];
  if (!await exists(implementationDir)) {
    return { status: "missing" as const, implementationDir, durationNs: 0, artifact: "", command, artifactSizeBytes: 0, diagnostics: [] as string[], buildProvenance: null as Awaited<ReturnType<typeof collectBuildProvenance>> | null };
  }
  const vars = { projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id), implementationDir, artifact: "" };
  const rawArtifact = expand(language.build.artifact, vars);
  const artifact = path.resolve(implementationDir, process.platform === "win32" && !path.extname(rawArtifact) ? `${rawArtifact}.exe` : rawArtifact);
  vars.artifact = artifact;
  const cwd = path.resolve(root, expand(language.build.workingDirectory ?? "{implementationDir}", vars));
  const buildEnv: Record<string, string> = language.id === "go" ? { GOCACHE: path.join(root, ".arena", "go-build-cache") } : {};
  if (language.id === "go") await mkdir(buildEnv.GOCACHE!, { recursive: true });
  const buildProvenance = await collectBuildProvenance({
    root,
    languageId: language.id,
    languageManifestPath: path.join(root, config.languageDirectory, `${language.id}.json`),
    implementationDir,
    benchmarkId: benchmark.id,
    build: language.build,
    environment: { ...language.environment, ...buildEnv },
    provenance: language.provenance,
    vars,
    cache
  });
  const cacheDir = path.join(root, ".arena", "build-cache", buildProvenance.buildFingerprint);
  const restored = await restoreCachedArtifact({
    cacheDir,
    artifact,
    implementationDir,
    sourceExtensions: language.sourceExtensions ?? [],
    buildProvenance,
    benchmarkId: benchmark.id,
    languageId: language.id,
    command,
    workingDirectory: cwd,
    environment: buildProvenance.environment
  });
  if (restored) {
    return { status: "cached" as const, implementationDir, durationNs: 0, artifact, command, artifactSizeBytes: await artifactSize(artifact), diagnostics: [] as string[], buildProvenance };
  }

  await mkdir(path.dirname(artifact), { recursive: true });
  const proc = await runProcess(expand(language.build.command, vars), language.build.arguments.map(x => expand(x, vars)), cwd, 180_000, { ...language.environment, ...buildEnv });
  if (proc.code !== 0) {
    return {
      status: "failed" as const,
      implementationDir,
      durationNs: proc.durationNs,
      artifact: "",
      command,
      artifactSizeBytes: 0,
      diagnostics: [proc.stderr || proc.stdout || `build exited with ${proc.code}`],
      buildProvenance
    };
  }
  if (!await exists(artifact)) {
    return {
      status: "failed" as const,
      implementationDir,
      durationNs: proc.durationNs,
      artifact: "",
      command,
      artifactSizeBytes: 0,
      diagnostics: ["build succeeded but artifact was not produced"],
      buildProvenance
    };
  }

  await storeCachedArtifact({
    cacheDir,
    artifact,
    implementationDir,
    sourceExtensions: language.sourceExtensions ?? [],
    buildProvenance,
    benchmarkId: benchmark.id,
    languageId: language.id,
    command,
    workingDirectory: cwd,
    environment: buildProvenance.environment
  });

  return { status: "success" as const, implementationDir, durationNs: proc.durationNs, artifact, command, artifactSizeBytes: await artifactSize(artifact), diagnostics: [] as string[], buildProvenance };
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
}
function iterationSummary(samples: Array<{ valid: boolean; iterationTimeNanoseconds: number }>) {
  const accepted = samples.filter(sample => sample.valid).map(sample => sample.iterationTimeNanoseconds).sort((left, right) => left - right);
  const mean = accepted.reduce((sum, value) => sum + value, 0) / (accepted.length || 1);
  return {
    validSamples: accepted.length,
    rejectedSamples: samples.length - accepted.length,
    minimumIterationTimeNanoseconds: accepted[0] ?? 0,
    maximumIterationTimeNanoseconds: accepted.at(-1) ?? 0,
    medianIterationTimeNanoseconds: percentile(accepted, .5),
    meanIterationTimeNanoseconds: mean,
    standardDeviationIterationTimeNanoseconds: Math.sqrt(accepted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (accepted.length || 1)),
    p95IterationTimeNanoseconds: percentile(accepted, .95),
    interquartileRangeIterationTimeNanoseconds: percentile(accepted, .75) - percentile(accepted, .25)
  };
}

function medianNanoseconds(summary: Record<string, number>) {
  return summary.medianIterationTimeNanoseconds ?? summary.medianKernelTimeNanoseconds ?? 0;
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let active = 0;
  let resolveNext: (() => void) | null = null;
  const wait = () => new Promise<void>(r => { resolveNext = r; });
  const schedule = () => {
    while (active < concurrency && items.length > 0) {
      const item = items.shift()!;
      active++;
      fn(item).finally(() => {
        active--;
        if (resolveNext) { resolveNext(); resolveNext = null; }
        schedule();
      });
    }
  };
  schedule();
  while (active > 0) await wait();
}


async function ensureChecker() {
  const checker = executable(path.join(root, config.checkerExecutable));
  if (!await exists(checker)) {
    throw new Error(`Checker not found at ${checker}. Run npm run build:checker before arena run or arena check.`);
  }
  return checker;
}

async function checkOutput(benchmark: Benchmark, input: string, output: string) {
  const checker = await ensureChecker();
  const p = await runProcess(checker, ["check", "--benchmark", benchmark.id, "--input", input, "--output", output], root, 30_000);
  try { return JSON.parse(p.stdout) as { status: string; checkerVersion: string; diagnostics: string[] }; }
  catch { return { status: "checker-error", checkerVersion: "unknown", diagnostics: [p.stderr || "Checker returned invalid JSON"] }; }
}

async function runCommand(args: string[]) {
  const flags = parseFlags(args);
  await ensureChecker();
  const ds = await detections();
  const requestedLanguages = flags.all("--language");
  const requestedBenchmarks = flags.all("--benchmark");
  const selectedDetections = ds.filter(d => d.language.enabled && (!requestedLanguages.length || requestedLanguages.includes(d.language.id)));
  const languages = selectedDetections.filter(d => d.available);
  const unavailableToolchains = selectedDetections.filter(d => !d.available).map(d => d.language.id);
  const benchmarks = (await discoverBenchmarks()).filter(b => !requestedBenchmarks.length || requestedBenchmarks.includes(b.id));
  if (!languages.length || !benchmarks.length) throw new Error("No available language/benchmark combinations selected");
  const createdAt = new Date().toISOString();
  const snapshotId = `${createdAt.replaceAll(":", "-").replace(".", "-").replace("Z", "")}-${randomUUID().slice(0, 8)}Z`;
  const tempRoot = path.join(root, ".arena", "runs", snapshotId);
  await mkdir(tempRoot, { recursive: true });
  const current = await readSnapshot();
  const canonical = new Map((current?.results ?? [])
    .filter(result => result.execution?.mode === EXECUTION_MODE || result.execution?.mode === "persistent-worker")
    .map(result => [resultKey(result), result]));

  type Cell = {
    benchmark: Benchmark;
    sizeName: string;
    mutation?: string;
    language: Language;
    version: string;
    compilerVersion: string;
    fingerprint: string;
    key: string;
    input: string;
    datasetHash: string;
    datasetSeed?: number;
    warmups: number;
    measurement: MeasurementPolicy;
  };
  const staleCells: Cell[] = [];
  let currentCells = 0;
  const missingImplementationCells = new Map<string, number>();
  const mutationFilter = flags.get("--mutation");
  const runnerCache = new RunnerCache(root);
  const verbose = !flags.has("--quiet") && flags.get("--format") !== "json";

  for (const benchmark of benchmarks) {
    const sizeNames = flags.get("--size") ? [flags.get("--size")!] : config.defaults.sizes.filter(name => benchmark.sizes[name]);
    for (const sizeName of sizeNames) {
      const cells = expandSizeCells(benchmark.sizes, sizeName, mutationFilter);
      if (!cells.length) throw new Error(`Unknown size '${sizeName}' for ${benchmark.id}${mutationFilter ? ` (mutation '${mutationFilter}')` : ""}`);
      for (const cell of cells) {
        const input = path.join(root, "benchmarks", benchmark.id, "datasets", cell.dataset);
        if (!await exists(input)) throw new Error(`Missing dataset: ${input}`);
        const datasetHash = await runnerCache.sha256(input);
        for (const { language, version, compilerVersion } of languages) {
          const implementationDir = path.join(root, "benchmarks", benchmark.id, "implementations", language.id);
          if (!await exists(implementationDir)) {
            const missingKey = `${benchmark.id}/${language.id}`;
            missingImplementationCells.set(missingKey, (missingImplementationCells.get(missingKey) ?? 0) + 1);
            continue;
          }
          const warmups = resolveWarmupIterations(cell.warmupIterations, language.id, flags.get("--warmup"));
          const measurement = resolveMeasurementPolicy(flags, cell.measuredIterations);
          const vars = {
            projectRoot: root,
            benchmarkId: benchmark.id,
            benchmarkDir: path.join(root, "benchmarks", benchmark.id),
            implementationDir,
            artifact: ""
          };
          const buildProvenance = await collectBuildProvenance({
            root,
            languageId: language.id,
            languageManifestPath: path.join(root, config.languageDirectory, `${language.id}.json`),
            implementationDir,
            benchmarkId: benchmark.id,
            build: language.build,
            environment: language.environment,
            provenance: language.provenance,
            vars,
            cache: runnerCache
          });
          const fingerprint = await fingerprintCell(
            language, benchmark, sizeName, cell.mutation, cell.dataset, version, compilerVersion, warmups, measurement, buildProvenance, runnerCache
          );
          const key = cellKey(benchmark.id, sizeName, language.id, cell.mutation);
          const previous = canonical.get(key);
          if (!flags.has("--force") && previous?.provenance?.fingerprint === fingerprint && previous?.provenance?.measurementContractVersion === MEASUREMENT_CONTRACT_VERSION) {
            currentCells++;
            continue;
          }
          staleCells.push({
            benchmark, sizeName, mutation: cell.mutation, language, version, compilerVersion, fingerprint, key,
            input, datasetHash, datasetSeed: cell.seed, warmups, measurement
          });
        }
      }
    }
  }

  const plannedCells = staleCells.length;
  if (verbose) {
    const missingImplementationSummary = [...missingImplementationCells.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => `${key} (${count} cell${count === 1 ? "" : "s"})`)
      .join(", ");
    const unavailableParts = [
      unavailableToolchains.length ? `toolchain: ${unavailableToolchains.join(", ")}` : "",
      missingImplementationCells.size ? `missing: ${missingImplementationSummary}` : ""
    ].filter(Boolean);
    console.log(
      `Plan: ${currentCells} current (skip) · ${plannedCells} stale/missing (run)`
      + (unavailableParts.length ? ` · unavailable (${unavailableParts.join("; ")})` : "")
    );
  }

  const parallelism = flags.has("--parallel") ? Math.max(1, os.cpus().length) : (config.execution?.parallelism ?? 1);
  const results: BenchmarkResult[] = [];

  type BuildResult = Awaited<ReturnType<typeof buildOne>>;
  const builds = new Map<string, BuildResult>();
  const buildTargets = [...new Map(
    staleCells.map(cell => [`${cell.benchmark.id}/${cell.language.id}`, { language: cell.language, benchmark: cell.benchmark }])
  ).values()];
  await pool(buildTargets, Math.min(parallelism, buildTargets.length || 1), async ({ language, benchmark }) => {
    const built = await buildOne(language, benchmark, runnerCache);
    builds.set(`${benchmark.id}/${language.id}`, built);
    if (built.status === "failed" && verbose) {
      console.log(`Build failed for ${benchmark.id}/${language.id}:\n${built.diagnostics.join("\n")}`);
    }
  });

  const isolatedInputs = plannedCells ? await stageIsolatedDatasets(staleCells, tempRoot) : new Map<string, string>();

  await pool(staleCells, parallelism, async (cell) => {
    const { benchmark, sizeName, mutation, language, version, compilerVersion, fingerprint, key, input, datasetHash, datasetSeed, warmups, measurement } = cell;
    const build = builds.get(`${benchmark.id}/${language.id}`);
    if (!build || build.status === "missing") return;

    const datasetId = mutation
      ? `${benchmark.id}-${sizeName}-${mutation}-${benchmark.version}`
      : `${benchmark.id}-${sizeName}-${benchmark.version}`;
    let samples: Array<Record<string, unknown> & { valid: boolean; iterationTimeNanoseconds: number }> = [];
    let totalProcessDurationNanoseconds = 0;
    let lastChecker = { status: "checker-error", checkerVersion: "unknown", diagnostics: [] as string[] };
    let artifactSha256 = "";

    if (build.status === "failed") {
      lastChecker = {
        status: "checker-error",
        checkerVersion: "unknown",
        diagnostics: build.diagnostics.length ? build.diagnostics : ["build failed"]
      };
    } else {
      const iterationDir = path.join(tempRoot, benchmark.id, language.id, sizeName, mutation ?? "default");
      await mkdir(iterationDir, { recursive: true });
      const isolatedInput = isolatedInputs.get(input)!;
      const output = path.join(iterationDir, "output.json");
      const vars = {
        projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id),
        implementationDir: build.implementationDir, inputFile: isolatedInput, outputFile: output,
        protocolVersion: MEASUREMENT_PROTOCOL_VERSION,
        artifact: build.artifact, runId: snapshotId, size: sizeName
      };
      const harness = await runHarnessProtocol({
        command: expand(language.run.command, vars),
        args: language.run.arguments.map(x => expand(x, vars)),
        cwd: iterationDir,
        env: language.environment,
        outputFile: output,
        warmups,
        measurement,
        timeoutMilliseconds: benchmark.limits.timeoutMilliseconds,
        maxCapturedBytes: benchmark.limits.maxOutputBytes
      });
      totalProcessDurationNanoseconds = harness.totalProcessDurationNanoseconds;
      artifactSha256 = harness.outputDigest;
      const accepted = harness.success && harness.outputSizeBytes <= benchmark.limits.maxOutputBytes;
      lastChecker = accepted
        ? await checkOutput(benchmark, isolatedInput, output)
        : {
          status: "checker-error",
          checkerVersion: "unknown",
          diagnostics: [
            harness.error,
            !harness.success && !harness.error ? "harness protocol failed" : "",
            harness.timedOut ? "implementation timed out" : "",
            harness.limitExceeded ? "implementation exceeded an output limit" : "",
            harness.exitCode !== null && harness.exitCode !== 0 ? `implementation exited with ${harness.exitCode}` : ""
          ].filter(Boolean) as string[]
        };
      const valid = lastChecker.status === "accepted";
      samples = harness.measuredSamples.map(sample => ({
        iteration: sample.iteration,
        valid,
        iterationTimeNanoseconds: sample.iterationTimeNanoseconds,
        exitCode: harness.exitCode ?? -1,
        outputSizeBytes: harness.outputSizeBytes,
        timedOut: harness.timedOut,
        outputLimitExceeded: harness.limitExceeded
      }));
    }

    const result: BenchmarkResult = {
      benchmark: { id: benchmark.id, version: benchmark.version, size: sizeName, ...(mutation ? { mutation } : {}) },
      dataset: {
        id: datasetId,
        sha256: datasetHash,
        seed: datasetSeed ?? 0,
        generatorVersion: mutation ? GENERATOR_VERSION : "committed-fixture-1.0.0",
        ...(mutation ? { mutation } : {})
      },
      language: { id: language.id, name: language.name, version, compilerVersion, compilerFlags: language.build.arguments },
      build: { status: build.status, durationNanoseconds: build.durationNs, artifactSizeBytes: build.artifactSizeBytes, command: build.command },
      execution: {
        mode: EXECUTION_MODE,
        measurementContractVersion: MEASUREMENT_CONTRACT_VERSION,
        totalProcessDurationNanoseconds,
        warmupIterations: warmups,
        measuredIterations: samples.length,
        measurement: { ...measurement },
        samples,
        summary: iterationSummary(samples),
        metrics: metricAvailability(benchmark.metrics ?? config.defaults.metrics)
      },
      checker: { language: "go", version: lastChecker.checkerVersion, status: lastChecker.status, diagnostics: lastChecker.diagnostics },
      provenance: {
        fingerprint,
        measurementContractVersion: MEASUREMENT_CONTRACT_VERSION,
        measuredAt: createdAt,
        machine: currentMachine(),
        buildFingerprint: build.buildProvenance?.buildFingerprint,
        artifactSha256: artifactSha256 || undefined,
        toolchain: build.buildProvenance ? {
          target: build.buildProvenance.target,
          versions: build.buildProvenance.versions,
          compilerFlags: build.buildProvenance.compilerFlags
        } : undefined
      }
    };
    results.push(result);
    canonical.set(key, result);
    if (verbose) {
      const label = groupKey(benchmark.id, sizeName, mutation);
      if (build.status === "failed") console.log(`${label} ${language.name}: build-failed`);
      else console.log(`${label} ${language.name}: ${lastChecker.status} (${(medianNanoseconds(iterationSummary(samples)) / 1e6).toFixed(2)} ms median)`);
    }
  });

  const git = await runProcess("git", ["rev-parse", "HEAD"], root).then(p => p.code === 0 ? p.stdout.trim() : "unknown");
  const gitDirty = await runProcess("git", ["status", "--porcelain"], root).then(p => p.code === 0 ? p.stdout.trim().length > 0 : null);
  const snapshot: Snapshot = plannedCells === 0 && current ? current : {
    schemaVersion: "3.0.0", snapshotId, updatedAt: createdAt, arenaVersion: "0.2.0",
    gitCommit: git, gitDirty, results: [...canonical.values()].sort((a, b) => resultKey(a).localeCompare(resultKey(b)))
  };
  await validateResult(snapshot);
  if (results.length && verbose) printSummary(results);
  if (!flags.has("--no-save") && plannedCells > 0) await saveResult(snapshot, flags.get("--output"), flags.get("--format") === "json" || flags.has("--quiet"));
  if (verbose && plannedCells === 0) console.log(`All ${currentCells} selected cells are current.`);
  if (flags.get("--format") === "json") console.log(JSON.stringify(snapshot, null, flags.has("--quiet") ? 0 : 2));
  if (!flags.has("--preserve-temp")) await rm(tempRoot, { recursive: true, force: true });
  return 0;
}

function stripAnsi(text: string) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function padCell(text: string, width: number, align: "left" | "right" = "left") {
  const visible = stripAnsi(text).length;
  const pad = Math.max(0, width - visible);
  return align === "right" ? `${" ".repeat(pad)}${text}` : `${text}${" ".repeat(pad)}`;
}

function formatKernelMs(nanoseconds: number) {
  const ms = nanoseconds / 1e6;
  if (ms < 0.01) return `${(nanoseconds / 1e3).toFixed(1)} µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function printSummary(results: any[]) {
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  const paint = (code: string, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const dim = (text: string) => paint("2", text);
  const bold = (text: string) => paint("1", text);
  const green = (text: string) => paint("32", text);
  const yellow = (text: string) => paint("33", text);
  const red = (text: string) => paint("31", text);
  const cyan = (text: string) => paint("36", text);

  const fastest = new Map<string, number>();
  for (const result of results) {
    if (result.checker.status !== "accepted") continue;
    const key = groupKey(result.benchmark.id, result.benchmark.size, result.benchmark.mutation);
    const median = medianNanoseconds(result.execution.summary as Record<string, number>);
    fastest.set(key, Math.min(fastest.get(key) ?? Number.POSITIVE_INFINITY, median));
  }

  type Row = { benchmark: string; language: string; correct: string; median: string; relative: string; sortKey: string; relativeValue: number };
  const rows: Row[] = results.map(result => {
    const benchmark = groupKey(result.benchmark.id, result.benchmark.size, result.benchmark.mutation);
    const accepted = result.checker.status === "accepted";
    const medianNs = medianNanoseconds(result.execution.summary as Record<string, number>);
    const best = fastest.get(benchmark);
    const relativeValue = accepted && best ? medianNs / best : Number.POSITIVE_INFINITY;
    const isFastest = accepted && relativeValue <= 1.0001;
    let relativeText = "—";
    if (accepted && best) {
      const label = `${relativeValue.toFixed(2)}x`;
      relativeText = isFastest ? bold(green(`${label} ★`)) : relativeValue < 2 ? green(label) : relativeValue < 10 ? yellow(label) : red(label);
    } else if (!accepted) {
      relativeText = dim("unranked");
    }
    return {
      benchmark: cyan(benchmark),
      language: result.language.name,
      correct: accepted ? green("yes") : red("no"),
      median: accepted ? formatKernelMs(medianNs) : red("INVALID"),
      relative: relativeText,
      sortKey: benchmark,
      relativeValue
    };
  }).sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.relativeValue - b.relativeValue);

  const headers = ["Benchmark", "Language", "Correct", "Median", "Relative"];
  const plainRows = rows.map(row => [row.benchmark, row.language, row.correct, row.median, row.relative]);
  const widths = headers.map((header, i) => Math.max(header.length, ...plainRows.map(row => stripAnsi(row[i]!).length)));
  const alignRight = new Set([3, 4]);

  const rule = (left: string, mid: string, right: string, fill: string) =>
    `${left}${widths.map(w => fill.repeat(w + 2)).join(mid)}${right}`;
  const line = (cells: string[], paintRow?: (text: string) => string) => {
    const body = cells.map((cell, i) => ` ${padCell(cell, widths[i]!, alignRight.has(i) ? "right" : "left")} `).join(dim("│"));
    const framed = `${dim("│")}${body}${dim("│")}`;
    return paintRow ? paintRow(framed) : framed;
  };

  console.log();
  console.log(dim(rule("┌", "┬", "┐", "─")));
  console.log(line(headers.map(h => bold(h))));
  console.log(dim(rule("├", "┼", "┤", "─")));
  let previous = "";
  for (const row of rows) {
    if (previous && previous !== row.sortKey) console.log(dim(rule("├", "┼", "┤", "─")));
    console.log(line([row.benchmark, row.language, row.correct, row.median, row.relative]));
    previous = row.sortKey;
  }
  console.log(dim(rule("└", "┴", "┘", "─")));
  console.log(dim(`${rows.length} result${rows.length === 1 ? "" : "s"} · ★ = fastest in group`));
}

async function validateResult(record: unknown) {
  const schema = await json<Record<string, unknown>>(path.join(root, "schemas", "result.schema.json"));
  const ajv = createAjv();
  if (!ajv.validate(schema, record)) {
    throw new Error(`Generated result failed schema validation: ${ajv.errorsText(ajv.errors)}`);
  }
}

function createAjv() {
  const Ajv2020 = require("ajv/dist/2020").default as new (options: Record<string, unknown>) => {
    validate(schema: unknown, data: unknown): boolean;
    errors: unknown;
    errorsText(errors: unknown): string;
    compile(schema: unknown): { (data: unknown): boolean; errors?: unknown };
  };
  const addFormats = require("ajv-formats").default as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, file);
}
async function saveResult(snapshot: Snapshot, explicit?: string, silent = false) {
  const output = explicit ? path.resolve(root, explicit) : currentResultPath;
  await atomicJson(output, snapshot);
  if (!silent) console.log(`Updated: ${path.relative(root, output)}`);
}

async function resultsStatus(args: string[]) {
  const flags = parseFlags(args);
  const current = await readSnapshot();
  const canonical = new Map((current?.results ?? []).map(result => [resultKey(result), result]));
  const requestedLanguages = flags.all("--language");
  const requestedBenchmarks = flags.all("--benchmark");
  const detectionsById = await detections();
  const benchmarks = (await discoverBenchmarks()).filter(b => !requestedBenchmarks.length || requestedBenchmarks.includes(b.id));
  const mutationFilter = flags.get("--mutation");
  const runnerCache = new RunnerCache(root);
  const rows: Array<{ key: string; status: string; detail: string }> = [];
  for (const benchmark of benchmarks) {
    const sizes = flags.get("--size") ? [flags.get("--size")!] : config.defaults.sizes.filter(name => benchmark.sizes[name]);
    for (const sizeName of sizes) {
      const cells = expandSizeCells(benchmark.sizes, sizeName, mutationFilter);
      for (const cell of cells) for (const detection of detectionsById) {
        const { language, version, compilerVersion } = detection;
        if (!language.enabled || (requestedLanguages.length && !requestedLanguages.includes(language.id))) continue;
        const key = cellKey(benchmark.id, sizeName, language.id, cell.mutation);
        const implementationDir = path.join(root, "benchmarks", benchmark.id, "implementations", language.id);
        if (!await exists(implementationDir)) {
          rows.push({ key, status: "unavailable", detail: "implementation missing" });
          continue;
        }
        if (!detection.available) {
          rows.push({ key, status: "unavailable", detail: "toolchain missing or unsupported" });
          continue;
        }
        const warmups = resolveWarmupIterations(cell.warmupIterations, language.id, flags.get("--warmup"));
        const measurement = resolveMeasurementPolicy(flags, cell.measuredIterations);
        const vars = {
          projectRoot: root,
          benchmarkId: benchmark.id,
          benchmarkDir: path.join(root, "benchmarks", benchmark.id),
          implementationDir,
          artifact: ""
        };
        const buildProvenance = await collectBuildProvenance({
          root,
          languageId: language.id,
          languageManifestPath: path.join(root, config.languageDirectory, `${language.id}.json`),
          implementationDir,
          benchmarkId: benchmark.id,
          build: language.build,
          environment: language.environment,
          provenance: language.provenance,
          vars,
          cache: runnerCache
        });
        const fingerprint = await fingerprintCell(
          language, benchmark, sizeName, cell.mutation, cell.dataset, version, compilerVersion, warmups, measurement, buildProvenance, runnerCache
        );
        const saved = canonical.get(key);
        const legacy = saved?.provenance?.measurementContractVersion !== MEASUREMENT_CONTRACT_VERSION;
        const status = !saved ? "missing" : legacy || saved.provenance?.fingerprint !== fingerprint ? "stale" : "current";
        const machine = saved?.provenance?.machine;
        const differentMachine = machine && (machine.cpu.model !== currentMachine().cpu.model || machine.operatingSystem.platform !== process.platform);
        rows.push({ key, status, detail: legacy ? "legacy measurement contract" : differentMachine ? "different machine" : "" });
      }
    }
  }
  const width = Math.max(4, ...rows.map(row => row.key.length));
  for (const row of rows) console.log(`${row.key.padEnd(width)}  ${row.status.padEnd(11)}${row.detail}`);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  console.log(`\n${["current", "stale", "missing", "unavailable"].map(status => `${status}: ${counts.get(status) ?? 0}`).join(" · ")}`);
}

async function resultsSummary(args: string[]) {
  const flags = parseFlags(args);
  const current = await readSnapshot();
  if (!current) throw new Error("No canonical results yet. Run `arena run`.");
  const languages = flags.all("--language");
  const benchmarks = flags.all("--benchmark");
  const size = flags.get("--size");
  const mutation = flags.get("--mutation");
  const filtered = current.results.filter(result =>
    (!languages.length || languages.includes(result.language.id))
    && (!benchmarks.length || benchmarks.includes(result.benchmark.id))
    && (!size || result.benchmark.size === size)
    && (!mutation || result.benchmark.mutation === mutation)
  );
  if (!filtered.length) throw new Error("No results matched the given filters");
  printSummary(filtered);
}

async function resultsCommand(args: string[]) {
  if (!args[0] || args[0] === "current") {
    if (!await exists(currentResultPath)) throw new Error("No canonical results yet. Run `arena run`.");
    return console.log(await readFile(currentResultPath, "utf8"));
  }
  if (args[0] === "summary") return resultsSummary(args.slice(1));
  if (args[0] === "status") return resultsStatus(args.slice(1));
  throw new Error("Usage: arena results current|summary|status");
}
async function listCommand(kind: string) {
  if (kind === "languages") for (const d of await detections()) console.log(`${d.language.id.padEnd(14)} ${d.available ? "available" : "unavailable"}  ${d.version}`);
  else if (kind === "benchmarks") for (const b of await discoverBenchmarks()) console.log(`${b.id.padEnd(16)} ${b.name}`);
  else if (kind === "metrics") console.log("iterationTime\nkernelTime (legacy)\nprocessDuration (diagnostic)\nexitCode\noutputSize\nbuildTime\nartifactSize\ncorrectness");
  else throw new Error("Usage: arena list languages|benchmarks|metrics");
}
async function buildCommand(args: string[]) {
  const f = parseFlags(args);
  const ls = (await discoverLanguages()).map(withLanguageEnvironment);
  const bs = await discoverBenchmarks();
  let failed = false;
  for (const b of bs.filter(x => !f.all("--benchmark").length || f.all("--benchmark").includes(x.id)))
    for (const l of ls.filter(x => !f.all("--language").length || f.all("--language").includes(x.id))) {
      const built = await buildOne(l, b);
      console.log(`${b.id}/${l.id}: ${built.status}`);
      if (built.status === "failed") {
        failed = true;
        if (built.diagnostics.length) console.log(built.diagnostics.join("\n"));
      }
    }
  if (failed) throw new Error("One or more builds failed");
}

function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

async function datasetCommand(args: string[]) {
  if (args[0] !== "generate") throw new Error("Usage: arena dataset generate --benchmark <id> --size <size> [--mutation <name>] [--seed <integer>]");
  const flags = parseFlags(args.slice(1));
  const benchmarkId = flags.get("--benchmark");
  const sizeName = flags.get("--size");
  const mutationName = flags.get("--mutation");
  const seedOverride = flags.get("--seed");
  if (!benchmarkId || !sizeName) throw new Error("A benchmark and size are required");
  const benchmark = (await discoverBenchmarks()).find(x => x.id === benchmarkId);
  const size = benchmark?.sizes[sizeName];
  if (!benchmark || !size) throw new Error(`Unknown benchmark/size: ${benchmarkId}/${sizeName}`);

  let content: string;
  let mutation: string | undefined;
  let seed: number;
  let datasetFile: string;

  if (size.mutations) {
    if (!mutationName) throw new Error(`--mutation is required for ${benchmarkId}; available: ${Object.keys(size.mutations).join(", ")}`);
    const entry = size.mutations[mutationName];
    if (!entry) throw new Error(`Unknown mutation '${mutationName}' for ${benchmarkId}/${sizeName}`);
    mutation = mutationName;
    seed = Number(seedOverride ?? entry.seed);
    if (!Number.isSafeInteger(seed)) throw new Error("Seed must be a safe integer");
    datasetFile = entry.dataset;
    content = generateDatasetContent(benchmarkId, sizeName, mutation, seed, seeded(seed));
  } else {
    seed = Number(seedOverride ?? 729418);
    if (!Number.isSafeInteger(seed)) throw new Error("Seed must be a safe integer");
    datasetFile = size.dataset!;
    const random = seeded(seed);
    if (benchmarkId === "nbody") {
      const profile = {
        small: { bodies: 12, steps: 10_000 },
        medium: { bodies: 10, steps: 18_000 },
        large: { bodies: 12, steps: 40_000 }
      }[sizeName];
      if (!profile) throw new Error(`No nbody generation profile for size '${sizeName}'`);
      const bodies = Array.from({ length: profile.bodies }, (_, index) => {
        const angle = 2 * Math.PI * index / profile.bodies;
        return {
          mass: Number((0.1 + random() * 0.1).toFixed(9)),
          position: [Number((5 * Math.cos(angle)).toFixed(9)), Number((5 * Math.sin(angle)).toFixed(9)), 0],
          velocity: [Number((-0.01 * Math.sin(angle)).toFixed(9)), Number((0.01 * Math.cos(angle)).toFixed(9)), 0]
        };
      });
      content = `${JSON.stringify({ steps: profile.steps, deltaTime: 0.0001, bodies })}\n`;
    } else if (benchmarkId === "aggregation") {
      const recordCount = { small: 100_000, medium: 120_000, large: 200_000 }[sizeName];
      if (!recordCount) throw new Error(`No aggregation generation profile for size '${sizeName}'`);
      const categories = ["books", "games", "garden", "tools"];
      const rows = ["timestamp,account_id,category,quantity,unit_price"];
      for (let i = 0; i < recordCount; i++) rows.push(`2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z,A${1 + Math.floor(random() * 100)},${categories[Math.floor(random() * categories.length)]},${1 + Math.floor(random() * 10)},${99 + Math.floor(random() * 9901)}`);
      content = `${rows.join("\n")}\n`;
    } else if (benchmarkId === "barrier-wave") {
      const profile = {
        small: { workerCount: 2, phaseCount: 1500, itemsPerWorker: 64, roundsPerItem: 8 },
        medium: { workerCount: 4, phaseCount: 250, itemsPerWorker: 1024, roundsPerItem: 16 },
        large: { workerCount: 8, phaseCount: 100, itemsPerWorker: 8192, roundsPerItem: 16 }
      }[sizeName];
      if (!profile) throw new Error(`No barrier-wave generation profile for size '${sizeName}'`);
      content = `${JSON.stringify({ schemaVersion: "1.0.0", ...profile, initialSeed: seed.toString(16).padStart(8, "0") })}\n`;
    } else throw new Error(`No generator registered for ${benchmarkId}`);
  }

  const destination = path.join(root, config.benchmarkDirectory, benchmarkId, "datasets", datasetFile);
  await writeFile(destination, content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  await atomicJson(`${destination}.metadata.json`, {
    benchmark: benchmarkId,
    version: benchmark.version,
    size: sizeName,
    ...(mutation ? { mutation } : {}),
    seed,
    generatorVersion: GENERATOR_VERSION,
    sha256
  });
  console.log(`Generated ${path.relative(root, destination)}\nSHA-256 ${sha256}`);
}

async function webCommand() {
  const build = path.join(root, "web", "build");
  if (!await exists(build)) throw new Error("Web build is missing. Run `npm run build:web` first.");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--config", path.join(root, "web", "vite.config.ts")], {
      cwd: path.join(root, "web"), env: process.env, stdio: "inherit", windowsHide: true, shell: false
    });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Web server exited with code ${code}`)));
  });
}

async function protocolCommand(args: string[]) {
  const [sub, ...rest] = args;
  if (sub !== "test") throw new Error("Usage: arena protocol test --language <id> [--minimal] [--benchmark <id>]");
  const flags = parseFlags(rest);
  const languageId = flags.get("--language");
  if (!languageId) throw new Error("Usage: arena protocol test --language <id> [--minimal] [--benchmark <id>]");

  const language = (await discoverLanguages()).find(entry => entry.id === languageId);
  if (!language) throw new Error(`Unknown language: ${languageId}`);

  const workDir = path.join(root, ".arena", "protocol-test", randomUUID());
  await mkdir(workDir, { recursive: true });
  const inputFile = path.join(root, "examples/minimal-workers/fixtures/input.json");
  const outputFile = path.join(workDir, "output.json");

  let command: string;
  let runArgs: string[];
  let cwd: string;
  let env: Record<string, string> | undefined;

  if (flags.has("--minimal")) {
    const run = await prepareMinimalWorkerRun(root, languageId, inputFile, outputFile, workDir);
    command = run.command;
    runArgs = run.args;
    cwd = run.cwd;
  } else {
    const benchmarkId = flags.get("--benchmark") ?? "nbody";
    const benchmark = (await discoverBenchmarks()).find(entry => entry.id === benchmarkId);
    if (!benchmark) throw new Error(`Unknown benchmark: ${benchmarkId}`);
    const built = await buildOne(language, benchmark);
    if (built.status !== "success" && built.status !== "cached") {
      throw new Error(`Build failed:\n${built.diagnostics.join("\n")}`);
    }
    const vars = {
      projectRoot: root,
      benchmarkId: benchmark.id,
      benchmarkDir: path.join(root, "benchmarks", benchmark.id),
      implementationDir: built.implementationDir,
      inputFile,
      outputFile,
      protocolVersion: MEASUREMENT_PROTOCOL_VERSION,
      artifact: built.artifact,
      runId: "protocol-test",
      size: "small"
    };
    command = expand(language.run.command, vars);
    runArgs = language.run.arguments.map(value => expand(value, vars));
    cwd = workDir;
    env = language.environment;
  }

  const report = await runProtocolConformance({
    command,
    args: runArgs,
    cwd,
    outputFile,
    env,
    language
  });

  console.log(report.passed ? "protocol conformance: passed" : "protocol conformance: failed");
  if (report.diagnostics.length) {
    console.log("\nDiagnostics:");
    for (const line of report.diagnostics) console.log(`  - ${line}`);
  }
  if (report.hints.length) {
    console.log("\nHints:");
    for (const line of report.hints) console.log(`  - ${line}`);
  }
  if (!flags.has("--preserve-temp")) await rm(workDir, { recursive: true, force: true });
  return report.passed ? 0 : 1;
}

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  if (command === "doctor") return doctor();
  if (command === "list") { await listCommand(sub ?? ""); return 0; }
  if (command === "run") return runCommand([sub, ...rest].filter(Boolean) as string[]);
  if (command === "build") { await buildCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "dataset") { await datasetCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "web") { await webCommand(); return 0; }
  if (command === "results") { await resultsCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "protocol") return protocolCommand([sub, ...rest].filter(Boolean) as string[]);
  if (command === "check") {
    const f = parseFlags([sub, ...rest].filter(Boolean) as string[]);
    const benchmark = (await discoverBenchmarks()).find(x => x.id === f.get("--benchmark"));
    if (!benchmark || !f.get("--input") || !f.get("--output")) throw new Error("Usage: arena check --benchmark <id> --input <file> --output <file>");
    const result = await checkOutput(benchmark, path.resolve(f.get("--input")!), path.resolve(f.get("--output")!));
    console.log(JSON.stringify(result, null, 2)); return result.status === "accepted" ? 0 : 1;
  }
  console.log("Runtime Arena\n\nUsage: arena <doctor|list|build|run|check|protocol|dataset|results|web>");
  return command ? 1 : 0;
}

try { process.exitCode = await main(); }
catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
