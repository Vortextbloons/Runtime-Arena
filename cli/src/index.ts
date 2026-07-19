#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants, existsSync, statSync } from "node:fs";
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
import { readTimingSamples } from "./timing.js";
import { RunnerCache, stageIsolatedDatasets } from "./runner-cache.js";

type Command = { command: string; arguments: string[]; workingDirectory?: string; artifact?: string };
type Language = { id: string; name: string; enabled: boolean; detect: Command; build: Command & { artifact: string }; run: Command; environment: Record<string, string>; sourceExtensions?: string[] };
type Benchmark = { id: string; name: string; version: number; sizes: Record<string, SizeConfig>; metrics: string[]; limits: { timeoutMilliseconds: number; maxOutputBytes: number } };
type Proc = { code: number | null; stdout: string; stderr: string; durationNs: number; timedOut: boolean; limitExceeded: boolean };
type Machine = { operatingSystem: { platform: string; release: string }; cpu: { model: string; architecture: string; logicalCores: number }; memoryBytes: number };
type Provenance = { fingerprint: string; measurementContractVersion?: string; measuredAt: string; machine: Machine };
type BenchmarkResult = Record<string, any> & { benchmark: Record<string, any> & { id: string; version: number; size: string }; language: Record<string, any> & { id: string; name: string; version: string }; checker: Record<string, any> & { status: string }; provenance?: Provenance };
type Snapshot = { schemaVersion: string; snapshotId: string; updatedAt: string; arenaVersion: string; gitCommit?: string | null; gitDirty?: boolean | null; results: BenchmarkResult[] };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const config = JSON.parse(await readFile(path.join(root, "arena.config.json"), "utf8")) as {
  benchmarkDirectory: string; languageDirectory: string; resultDirectory: string; checkerExecutable: string;
  defaults: { sizes: string[]; warmupIterations: number; measuredIterations: number; metrics: string[] };
  execution: { parallelism: number; preserveTemporaryFiles: boolean };
};

const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
const exists = async (file: string) => access(file).then(() => true, () => false);
const executable = (p: string) => process.platform === "win32" && existsSync(`${p}.exe`) ? `${p}.exe` : p;

async function discoverLanguages(): Promise<Language[]> {
  const dir = path.join(root, config.languageDirectory);
  return (await readdir(dir)).filter(x => x.endsWith(".json")).sort().map(x => json<Language>(path.join(dir, x))).reduce(async (a, p) => [...await a, await p], Promise.resolve([] as Language[]));
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

function runProcess(command: string, args: string[], cwd = root, timeout = 30_000, env: Record<string, string> = {}, maxCapturedBytes = 10 * 1024 * 1024, watchedOutputFile?: string): Promise<Proc> {
  return new Promise(resolve => {
    const started = process.hrtime.bigint();
    let stdout = "", stderr = "", timedOut = false, limitExceeded = false;
    const platformCommand = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
    const resolvedEnv: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const [k, v] of Object.entries(env)) resolvedEnv[k] = v.replaceAll("{PATH}", process.env[k] ?? "");
    const child = spawn(platformCommand, args, { cwd, env: resolvedEnv, windowsHide: true, shell: false });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeout);
    let capturedBytes = 0;
    const capture = (target: "stdout" | "stderr", data: Buffer) => {
      capturedBytes += data.byteLength;
      if (capturedBytes > maxCapturedBytes) {
        limitExceeded = true;
        child.kill("SIGKILL");
        stderr += "process output exceeded configured limit";
        return;
      }
      if (target === "stdout") stdout += String(data); else stderr += String(data);
    };
    child.stdout.on("data", (b: Buffer) => capture("stdout", b));
    child.stderr.on("data", (b: Buffer) => capture("stderr", b));
    child.on("error", e => stderr += e.message);
    const outputWatcher = watchedOutputFile ? setInterval(() => {
      try {
        if (statSync(watchedOutputFile).size > maxCapturedBytes) {
          limitExceeded = true;
          stderr += "output file exceeded configured limit";
          child.kill("SIGKILL");
        }
      } catch { /* The implementation has not created the file yet. */ }
    }, 10) : undefined;
    child.on("close", code => {
      clearTimeout(timer);
      if (outputWatcher) clearInterval(outputWatcher);
      resolve({ code, stdout, stderr, timedOut, limitExceeded, durationNs: Number(process.hrtime.bigint() - started) });
    });
  });
}

function parseFlags(args: string[]) {
  const values = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!key.startsWith("-")) continue;
    if (["--no-save", "--quiet", "--preserve-temp", "--force", "--all", "--parallel"].includes(key)) bools.add(key);
    else {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${key}`);
      const normalized = key === "-l" ? "--language" : key === "-b" ? "--benchmark" : key;
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

async function detections() {
  const minima: Record<string, number[]> = { rust: [1, 97], go: [1, 26], typescript: [26, 4], python: [3, 8] };
  return Promise.all((await discoverLanguages()).map(async language => {
    const p = await runProcess(language.detect.command, language.detect.arguments);
    const version = (p.stdout || p.stderr).trim();
    const compiler = language.id === "typescript"
      ? await runProcess(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--version"])
      : p;
    return { language, available: p.code === 0 && atLeast(version, minima[language.id] ?? [0]), version, compilerVersion: (compiler.stdout || compiler.stderr).trim() };
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

async function hashTree(directory: string, hash: ReturnType<typeof createHash>, cache?: RunnerCache) {
  if (cache) {
    await cache.appendTreeHash(directory, hash);
    return;
  }
  if (!await exists(directory)) return;
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (["node_modules", "target", "dist", "build", "__pycache__", ".arena"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashTree(file, hash);
    else if (!entry.name.endsWith(".exe") && !entry.name.endsWith(".pyc")) {
      hash.update(path.relative(root, file).replaceAll("\\", "/"));
      hash.update(await readFile(file));
    }
  }
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
  iterations: number,
  cache?: RunnerCache
) {
  const hash = createHash("sha256");
  for (const file of [
    path.join(root, config.languageDirectory, `${language.id}.json`),
    path.join(root, config.benchmarkDirectory, benchmark.id, "benchmark.json"),
    path.join(root, config.benchmarkDirectory, benchmark.id, "datasets", datasetFile),
    path.join(root, "cli", "src", "metrics.ts")
  ]) {
    hash.update(path.relative(root, file).replaceAll("\\", "/"));
    hash.update(cache ? await cache.readFile(file) : await readFile(file));
  }
  await hashTree(path.join(root, config.benchmarkDirectory, benchmark.id, "implementations", language.id), hash, cache);
  await hashTree(path.join(root, "checker"), hash, cache);
  hash.update(JSON.stringify({
    benchmarkVersion: benchmark.version,
    measurementContractVersion: "1.0.0",
    size: sizeName,
    mutation: mutation ?? null,
    warmups,
    iterations,
    metrics: benchmark.metrics ?? config.defaults.metrics,
    toolchainVersion,
    compilerVersion
  }));
  return hash.digest("hex");
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
  if (!await exists(implementationDir)) return { status: "missing" as const, implementationDir, durationNs: 0, artifact: "" };
  const rawArtifact = expand(language.build.artifact, { benchmarkId: benchmark.id });
  const artifact = path.resolve(implementationDir, process.platform === "win32" && !["typescript", "python", "lua", "javascript"].includes(language.id) ? `${rawArtifact}.exe` : rawArtifact);
  await mkdir(path.dirname(artifact), { recursive: true });

  const fingerprint = await buildFingerprint(language, benchmark, cache);
  const cacheDir = path.join(root, ".arena", "build-cache", fingerprint);
  const cachedArtifact = path.join(cacheDir, path.relative(implementationDir, artifact));
  if (await exists(cachedArtifact)) {
    await mkdir(path.dirname(artifact), { recursive: true });
    const { copyFile } = await import("node:fs/promises");
    await copyFile(cachedArtifact, artifact);
    return { status: "cached", implementationDir, durationNs: 0, artifact, command: [language.build.command, ...language.build.arguments], artifactSizeBytes: (await stat(artifact)).size };
  }

  const vars = { projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id), implementationDir, artifact };
  const cwd = path.resolve(root, expand(language.build.workingDirectory ?? "{implementationDir}", vars));
  const buildEnv: Record<string, string> = language.id === "go" ? { GOCACHE: path.join(root, ".arena", "go-build-cache") } : {};
  if (language.id === "go") await mkdir(buildEnv.GOCACHE!, { recursive: true });
  const proc = await runProcess(expand(language.build.command, vars), language.build.arguments.map(x => expand(x, vars)), cwd, 180_000, { ...language.environment, ...buildEnv });
  if (proc.code !== 0) throw new Error(`Build failed for ${benchmark.id}/${language.id}:\n${proc.stderr || proc.stdout}`);

  if (await exists(artifact)) {
    const cacheArtifact = path.join(cacheDir, path.relative(implementationDir, artifact));
    await mkdir(path.dirname(cacheArtifact), { recursive: true });
    const { copyFile } = await import("node:fs/promises");
    await copyFile(artifact, cacheArtifact);
  }

  return { status: "success", implementationDir, durationNs: proc.durationNs, artifact, command: [language.build.command, ...language.build.arguments], artifactSizeBytes: (await stat(artifact)).size };
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
}
function summary(samples: Array<{ valid: boolean; kernelTimeNanoseconds: number }>) {
  const a = samples.filter(x => x.valid).map(x => x.kernelTimeNanoseconds).sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / (a.length || 1);
  return {
    validSamples: a.length, rejectedSamples: samples.length - a.length, minimumKernelTimeNanoseconds: a[0] ?? 0,
    maximumKernelTimeNanoseconds: a.at(-1) ?? 0, medianKernelTimeNanoseconds: percentile(a, .5), meanKernelTimeNanoseconds: mean,
    standardDeviationKernelTimeNanoseconds: Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length || 1)),
    p95KernelTimeNanoseconds: percentile(a, .95), interquartileRangeKernelTimeNanoseconds: percentile(a, .75) - percentile(a, .25)
  };
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

async function buildFingerprint(language: Language, benchmark: Benchmark, cache?: RunnerCache) {
  const hash = createHash("sha256");
  const languageManifest = path.join(root, config.languageDirectory, `${language.id}.json`);
  hash.update(cache ? await cache.readFile(languageManifest) : await readFile(languageManifest));
  const implementationDir = path.join(root, config.benchmarkDirectory, benchmark.id, "implementations", language.id);
  await hashTree(implementationDir, hash, cache);
  hash.update(JSON.stringify({ benchmarkId: benchmark.id, build: language.build }));
  return hash.digest("hex");
}

async function checkOutput(benchmark: Benchmark, input: string, output: string) {
  const checker = executable(path.join(root, config.checkerExecutable));
  const p = await runProcess(checker, ["check", "--benchmark", benchmark.id, "--input", input, "--output", output], root, 30_000);
  try { return JSON.parse(p.stdout) as { status: string; checkerVersion: string; diagnostics: string[] }; }
  catch { return { status: "checker-error", checkerVersion: "unknown", diagnostics: [p.stderr || "Checker returned invalid JSON"] }; }
}

async function runCommand(args: string[]) {
  const flags = parseFlags(args);
  const ds = await detections();
  const requestedLanguages = flags.all("--language");
  const requestedBenchmarks = flags.all("--benchmark");
  const languages = ds.filter(d => d.language.enabled && d.available && (!requestedLanguages.length || requestedLanguages.includes(d.language.id)));
  const benchmarks = (await discoverBenchmarks()).filter(b => !requestedBenchmarks.length || requestedBenchmarks.includes(b.id));
  if (!languages.length || !benchmarks.length) throw new Error("No available language/benchmark combinations selected");
  const createdAt = new Date().toISOString();
  const snapshotId = `${createdAt.replaceAll(":", "-").replace(".", "-").replace("Z", "")}-${randomUUID().slice(0, 8)}Z`;
  const tempRoot = path.join(root, ".arena", "runs", snapshotId);
  await mkdir(tempRoot, { recursive: true });
  const current = await readSnapshot();
  const canonical = new Map((current?.results ?? []).filter(result => result.execution?.mode === "persistent-worker" && result.provenance?.measurementContractVersion === "1.0.0").map(result => [resultKey(result), result]));

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
    iterations: number;
  };
  const staleCells: Cell[] = [];
  let currentCells = 0;
  const mutationFilter = flags.get("--mutation");
  const runnerCache = new RunnerCache(root);

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
          if (!await exists(implementationDir)) continue;
          const warmups = Number(flags.get("--warmup") ?? cell.warmupIterations);
          const iterations = Number(flags.get("--iterations") ?? cell.measuredIterations);
          const fingerprint = await fingerprintCell(
            language, benchmark, sizeName, cell.mutation, cell.dataset, version, compilerVersion, warmups, iterations, runnerCache
          );
          const key = cellKey(benchmark.id, sizeName, language.id, cell.mutation);
          const previous = canonical.get(key);
          if (!flags.has("--force") && previous?.provenance?.fingerprint === fingerprint) {
            currentCells++;
            if (!flags.has("--quiet") && flags.get("--format") !== "json") console.log(`${key}: current`);
            continue;
          }
          staleCells.push({
            benchmark, sizeName, mutation: cell.mutation, language, version, compilerVersion, fingerprint, key,
            input, datasetHash, datasetSeed: cell.seed, warmups, iterations
          });
        }
      }
    }
  }

  const parallelism = flags.has("--parallel") ? Math.max(1, os.cpus().length) : (config.execution?.parallelism ?? 1);
  const results: BenchmarkResult[] = [];
  const plannedCells = staleCells.length;

  type BuildResult = Awaited<ReturnType<typeof buildOne>>;
  const builds = new Map<string, BuildResult>();
  const buildTargets = [...new Map(
    staleCells.map(cell => [`${cell.benchmark.id}/${cell.language.id}`, { language: cell.language, benchmark: cell.benchmark }])
  ).values()];
  await pool(buildTargets, Math.min(parallelism, buildTargets.length || 1), async ({ language, benchmark }) => {
    builds.set(`${benchmark.id}/${language.id}`, await buildOne(language, benchmark, runnerCache));
  });

  const isolatedInputs = plannedCells ? await stageIsolatedDatasets(staleCells, tempRoot) : new Map<string, string>();

  await pool(staleCells, parallelism, async (cell) => {
    const { benchmark, sizeName, mutation, language, version, compilerVersion, fingerprint, key, input, datasetHash, datasetSeed, warmups, iterations } = cell;
    const build = builds.get(`${benchmark.id}/${language.id}`);
    if (!build || build.status === "missing") return;
    let samples: Array<Record<string, unknown> & { valid: boolean; kernelTimeNanoseconds: number }> = [];
    let totalProcessDurationNanoseconds = 0;
    let lastChecker = { status: "checker-error", checkerVersion: "unknown", diagnostics: [] as string[] };
    {
      const iterationDir = path.join(tempRoot, benchmark.id, language.id, sizeName, mutation ?? "default");
      await mkdir(iterationDir, { recursive: true });
      const isolatedInput = isolatedInputs.get(input)!;
      const output = path.join(iterationDir, "output.json");
      const timingOutput = path.join(iterationDir, "timing.json");
      const vars = { projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id), implementationDir: build.implementationDir, inputFile: isolatedInput, outputFile: output, timingOutputFile: timingOutput, warmupIterations: String(warmups), measuredIterations: String(iterations), artifact: build.artifact, runId: snapshotId, size: sizeName };
      const batchTimeout = benchmark.limits.timeoutMilliseconds * Math.max(1, warmups + iterations);
      const p = await runProcess(expand(language.run.command, vars), language.run.arguments.map(x => expand(x, vars)), iterationDir, batchTimeout, language.environment, benchmark.limits.maxOutputBytes, output);
      totalProcessDurationNanoseconds = p.durationNs;
      const outputSize = await exists(output) ? (await stat(output)).size : 0;
      lastChecker = p.code === 0 && outputSize <= benchmark.limits.maxOutputBytes
        ? await checkOutput(benchmark, isolatedInput, output)
        : { status: "checker-error", checkerVersion: "unknown", diagnostics: [p.timedOut ? "implementation timed out" : p.limitExceeded ? "implementation exceeded an output limit" : p.stderr || "implementation failed"] };
      try {
        if (await exists(timingOutput) && (await stat(timingOutput)).size > benchmark.limits.maxOutputBytes) throw new Error("timing sidecar exceeded the output limit");
        const timings = p.code === 0 ? await readTimingSamples(timingOutput, iterations) : [];
        samples = timings.map(timing => ({ ...timing, valid: lastChecker.status === "accepted", exitCode: p.code ?? -1, outputSizeBytes: outputSize, timedOut: p.timedOut, outputLimitExceeded: p.limitExceeded }));
      } catch (error) {
        lastChecker = { status: "checker-error", checkerVersion: lastChecker.checkerVersion, diagnostics: [`Invalid timing output: ${(error as Error).message}`] };
      }
    }
    const datasetId = mutation
      ? `${benchmark.id}-${sizeName}-${mutation}-${benchmark.version}`
      : `${benchmark.id}-${sizeName}-${benchmark.version}`;
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
        mode: "persistent-worker", measurementContractVersion: "1.0.0", totalProcessDurationNanoseconds,
        warmupIterations: warmups, measuredIterations: iterations, samples, summary: summary(samples),
        metrics: metricAvailability(benchmark.metrics ?? config.defaults.metrics)
      },
      checker: { language: "go", version: lastChecker.checkerVersion, status: lastChecker.status, diagnostics: lastChecker.diagnostics },
      provenance: { fingerprint, measurementContractVersion: "1.0.0", measuredAt: createdAt, machine: currentMachine() }
    };
    results.push(result);
    if (lastChecker.status === "accepted") canonical.set(key, result);
    if (!flags.has("--quiet") && flags.get("--format") !== "json") {
      const label = groupKey(benchmark.id, sizeName, mutation);
      console.log(`${label} ${language.name}: ${lastChecker.status} (${(summary(samples).medianKernelTimeNanoseconds / 1e6).toFixed(2)} ms median kernel)`);
    }
  });

  const git = await runProcess("git", ["rev-parse", "HEAD"]).then(p => p.code === 0 ? p.stdout.trim() : "unknown");
  const gitDirty = await runProcess("git", ["status", "--porcelain"]).then(p => p.code === 0 ? p.stdout.trim().length > 0 : null);
  const snapshot: Snapshot = plannedCells === 0 && current ? current : {
    schemaVersion: "3.0.0", snapshotId, updatedAt: createdAt, arenaVersion: "0.2.0",
    gitCommit: git, gitDirty, results: [...canonical.values()].sort((a, b) => resultKey(a).localeCompare(resultKey(b)))
  };
  await validateResult(snapshot);
  if (results.length && !flags.has("--quiet") && flags.get("--format") !== "json") printSummary(results);
  if (!flags.has("--no-save") && plannedCells > 0) await saveResult(snapshot, flags.get("--output"), flags.get("--format") === "json" || flags.has("--quiet"));
  if (!flags.has("--quiet") && flags.get("--format") !== "json" && plannedCells === 0) console.log(`All ${currentCells} selected cells are current.`);
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
    const median = result.execution.summary.medianKernelTimeNanoseconds as number;
    fastest.set(key, Math.min(fastest.get(key) ?? Number.POSITIVE_INFINITY, median));
  }

  type Row = { benchmark: string; language: string; correct: string; median: string; relative: string; sortKey: string; relativeValue: number };
  const rows: Row[] = results.map(result => {
    const benchmark = groupKey(result.benchmark.id, result.benchmark.size, result.benchmark.mutation);
    const accepted = result.checker.status === "accepted";
    const medianNs = result.execution.summary.medianKernelTimeNanoseconds as number;
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
        const warmups = Number(flags.get("--warmup") ?? cell.warmupIterations);
        const iterations = Number(flags.get("--iterations") ?? cell.measuredIterations);
        const fingerprint = await fingerprintCell(
          language, benchmark, sizeName, cell.mutation, cell.dataset, version, compilerVersion, warmups, iterations, runnerCache
        );
        const saved = canonical.get(key);
        const status = !saved ? "missing" : saved.provenance?.fingerprint === fingerprint ? "current" : "stale";
        const machine = saved?.provenance?.machine;
        const differentMachine = machine && (machine.cpu.model !== currentMachine().cpu.model || machine.operatingSystem.platform !== process.platform);
        rows.push({ key, status, detail: differentMachine ? "different machine" : "" });
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
  else if (kind === "metrics") console.log("kernelTime\nprocessDuration (diagnostic)\nexitCode\noutputSize\nbuildTime\nartifactSize\ncorrectness");
  else throw new Error("Usage: arena list languages|benchmarks|metrics");
}
async function buildCommand(args: string[]) {
  const f = parseFlags(args), ls = await discoverLanguages(), bs = await discoverBenchmarks();
  for (const b of bs.filter(x => !f.all("--benchmark").length || f.all("--benchmark").includes(x.id)))
    for (const l of ls.filter(x => !f.all("--language").length || f.all("--language").includes(x.id))) {
      const built = await buildOne(l, b);
      console.log(`${b.id}/${l.id}: ${built.status}`);
    }
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
        medium: { bodies: 7, steps: 25_000 },
        large: { bodies: 8, steps: 50_000 }
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
    generatorVersion: mutation ? GENERATOR_VERSION : "2.0.0",
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

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  if (command === "doctor") return doctor();
  if (command === "list") { await listCommand(sub ?? ""); return 0; }
  if (command === "run") return runCommand([sub, ...rest].filter(Boolean) as string[]);
  if (command === "build") { await buildCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "dataset") { await datasetCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "web") { await webCommand(); return 0; }
  if (command === "results") { await resultsCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "check") {
    const f = parseFlags([sub, ...rest].filter(Boolean) as string[]);
    const benchmark = (await discoverBenchmarks()).find(x => x.id === f.get("--benchmark"));
    if (!benchmark || !f.get("--input") || !f.get("--output")) throw new Error("Usage: arena check --benchmark <id> --input <file> --output <file>");
    const result = await checkOutput(benchmark, path.resolve(f.get("--input")!), path.resolve(f.get("--output")!));
    console.log(JSON.stringify(result, null, 2)); return result.status === "accepted" ? 0 : 1;
  }
  console.log("Runtime Arena\n\nUsage: arena <doctor|list|build|run|check|dataset|results|web>");
  return command ? 1 : 0;
}

try { process.exitCode = await main(); }
catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
