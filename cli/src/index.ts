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

type Command = { command: string; arguments: string[]; workingDirectory?: string; artifact?: string };
type Language = { id: string; name: string; enabled: boolean; detect: Command; build: Command & { artifact: string }; run: Command; environment: Record<string, string>; sourceExtensions?: string[] };
type Size = { dataset: string; warmupIterations: number; measuredIterations: number };
type Benchmark = { id: string; name: string; version: number; sizes: Record<string, Size>; metrics: string[]; limits: { timeoutMilliseconds: number; maxOutputBytes: number } };
type Proc = { code: number | null; stdout: string; stderr: string; durationNs: number; timedOut: boolean; limitExceeded: boolean };
type Machine = { operatingSystem: { platform: string; release: string }; cpu: { model: string; architecture: string; logicalCores: number }; memoryBytes: number };
type Provenance = { fingerprint: string; measuredAt: string; machine: Machine };
type BenchmarkResult = Record<string, any> & { benchmark: Record<string, any> & { id: string; version: number; size: string }; language: Record<string, any> & { id: string; name: string; version: string }; checker: Record<string, any> & { status: string }; provenance?: Provenance };
type Snapshot = { schemaVersion: string; snapshotId: string; updatedAt: string; arenaVersion: string; gitCommit?: string | null; gitDirty?: boolean | null; results: BenchmarkResult[] };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const config = JSON.parse(await readFile(path.join(root, "arena.config.json"), "utf8")) as {
  benchmarkDirectory: string; languageDirectory: string; resultDirectory: string; checkerExecutable: string;
  defaults: { sizes: string[]; warmupIterations: number; measuredIterations: number; metrics: string[] };
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
    const child = spawn(platformCommand, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: false });
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
    if (["--no-save", "--quiet", "--preserve-temp", "--force", "--all"].includes(key)) bools.add(key);
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
const cellKey = (benchmarkId: string, size: string, languageId: string) => `${benchmarkId}/${size}/${languageId}`;
const resultKey = (result: BenchmarkResult) => cellKey(result.benchmark.id, result.benchmark.size, result.language.id);

function currentMachine(): Machine {
  return {
    operatingSystem: { platform: process.platform, release: os.release() },
    cpu: { model: os.cpus()[0]?.model ?? "unknown", architecture: process.arch, logicalCores: os.cpus().length },
    memoryBytes: os.totalmem()
  };
}

async function hashTree(directory: string, hash: ReturnType<typeof createHash>) {
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

async function fingerprintCell(language: Language, benchmark: Benchmark, sizeName: string, toolchainVersion: string, compilerVersion: string, warmups: number, iterations: number) {
  const hash = createHash("sha256");
  const size = benchmark.sizes[sizeName]!;
  for (const file of [
    path.join(root, config.languageDirectory, `${language.id}.json`),
    path.join(root, config.benchmarkDirectory, benchmark.id, "benchmark.json"),
    path.join(root, config.benchmarkDirectory, benchmark.id, "datasets", size.dataset),
    path.join(root, "cli", "src", "metrics.ts")
  ]) {
    hash.update(path.relative(root, file).replaceAll("\\", "/"));
    hash.update(await readFile(file));
  }
  await hashTree(path.join(root, config.benchmarkDirectory, benchmark.id, "implementations", language.id), hash);
  await hashTree(path.join(root, "checker"), hash);
  hash.update(JSON.stringify({
    benchmarkVersion: benchmark.version, size: sizeName, warmups, iterations,
    metrics: benchmark.metrics ?? config.defaults.metrics, toolchainVersion, compilerVersion
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
      const dataset = path.join(root, config.benchmarkDirectory, benchmark.id, "datasets", settings.dataset);
      if (!await exists(dataset)) {
        bad = true;
        console.log(`${`Dataset ${benchmark.id}/${size}`.padEnd(24)} missing`);
      }
    }
    for (const language of await discoverLanguages()) {
      const implementation = path.join(root, config.benchmarkDirectory, benchmark.id, "implementations", language.id);
      if (!await exists(implementation)) {
        bad = true;
        console.log(`${`Impl ${benchmark.id}/${language.id}`.padEnd(24)} missing`);
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

async function buildOne(language: Language, benchmark: Benchmark) {
  const implementationDir = path.join(root, "benchmarks", benchmark.id, "implementations", language.id);
  if (!await exists(implementationDir)) return { status: "missing", implementationDir, durationNs: 0, artifact: "" };
  const rawArtifact = expand(language.build.artifact, { benchmarkId: benchmark.id });
  const artifact = path.resolve(implementationDir, process.platform === "win32" && !["typescript", "python", "lua"].includes(language.id) ? `${rawArtifact}.exe` : rawArtifact);
  await mkdir(path.dirname(artifact), { recursive: true });
  const vars = { projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id), implementationDir, artifact };
  const cwd = path.resolve(root, expand(language.build.workingDirectory ?? "{implementationDir}", vars));
  const buildEnv: Record<string, string> = language.id === "go" ? { GOCACHE: path.join(root, ".arena", "go-build-cache") } : {};
  if (language.id === "go") await mkdir(buildEnv.GOCACHE!, { recursive: true });
  const proc = await runProcess(expand(language.build.command, vars), language.build.arguments.map(x => expand(x, vars)), cwd, 180_000, buildEnv);
  if (proc.code !== 0) throw new Error(`Build failed for ${benchmark.id}/${language.id}:\n${proc.stderr || proc.stdout}`);
  return { status: "success", implementationDir, durationNs: proc.durationNs, artifact, command: [language.build.command, ...language.build.arguments], artifactSizeBytes: (await stat(artifact)).size };
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
}
function summary(samples: Array<{ valid: boolean; wallTimeNanoseconds: number }>) {
  const a = samples.filter(x => x.valid).map(x => x.wallTimeNanoseconds).sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / (a.length || 1);
  return {
    validSamples: a.length, rejectedSamples: samples.length - a.length, minimumWallTimeNanoseconds: a[0] ?? 0,
    maximumWallTimeNanoseconds: a.at(-1) ?? 0, medianWallTimeNanoseconds: percentile(a, .5), meanWallTimeNanoseconds: mean,
    standardDeviationWallTimeNanoseconds: Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length || 1)),
    p95WallTimeNanoseconds: percentile(a, .95), interquartileRangeWallTimeNanoseconds: percentile(a, .75) - percentile(a, .25)
  };
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
  const canonical = new Map((current?.results ?? []).map(result => [resultKey(result), result]));
  const results: BenchmarkResult[] = [];
  let currentCells = 0;
  let plannedCells = 0;
  for (const benchmark of benchmarks) {
    const sizeNames = flags.get("--size") ? [flags.get("--size")!] : config.defaults.sizes.filter(name => benchmark.sizes[name]);
    for (const sizeName of sizeNames) {
    const size = benchmark.sizes[sizeName];
    if (!size) throw new Error(`Unknown size '${sizeName}' for ${benchmark.id}`);
    const input = path.join(root, "benchmarks", benchmark.id, "datasets", size.dataset);
    if (!await exists(input)) throw new Error(`Missing dataset: ${input}`);
    const datasetHash = createHash("sha256").update(await readFile(input)).digest("hex");
    for (const { language, version, compilerVersion } of languages) {
      const implementationDir = path.join(root, "benchmarks", benchmark.id, "implementations", language.id);
      if (!await exists(implementationDir)) continue;
      const warmups = Number(flags.get("--warmup") ?? size.warmupIterations);
      const iterations = Number(flags.get("--iterations") ?? size.measuredIterations);
      const fingerprint = await fingerprintCell(language, benchmark, sizeName, version, compilerVersion, warmups, iterations);
      const key = cellKey(benchmark.id, sizeName, language.id);
      const previous = canonical.get(key);
      if (!flags.has("--force") && previous?.provenance?.fingerprint === fingerprint) {
        currentCells++;
        if (!flags.has("--quiet") && flags.get("--format") !== "json") console.log(`${key}: current`);
        continue;
      }
      plannedCells++;
      const build = await buildOne(language, benchmark);
      if (build.status === "missing") continue;
      const samples: Array<Record<string, unknown> & { valid: boolean; wallTimeNanoseconds: number }> = [];
      let lastChecker = { status: "checker-error", checkerVersion: "unknown", diagnostics: [] as string[] };
      for (let iteration = -warmups; iteration < iterations; iteration++) {
        const iterationDir = path.join(tempRoot, benchmark.id, language.id, String(iteration));
        await mkdir(iterationDir, { recursive: true });
        const isolatedInput = path.join(iterationDir, `input${path.extname(input)}`);
        await writeFile(isolatedInput, await readFile(input));
        await chmod(isolatedInput, 0o444);
        const output = path.join(iterationDir, "output.json");
        const vars = { projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id), implementationDir: build.implementationDir, inputFile: isolatedInput, outputFile: output, artifact: build.artifact, runId: snapshotId, size: sizeName };
        const p = await runProcess(expand(language.run.command, vars), language.run.arguments.map(x => expand(x, vars)), iterationDir, benchmark.limits.timeoutMilliseconds, language.environment, benchmark.limits.maxOutputBytes, output);
        const outputSize = await exists(output) ? (await stat(output)).size : 0;
        lastChecker = p.code === 0 && outputSize <= benchmark.limits.maxOutputBytes
          ? await checkOutput(benchmark, isolatedInput, output)
          : { status: "checker-error", checkerVersion: "unknown", diagnostics: [p.timedOut ? "implementation timed out" : p.limitExceeded ? "implementation exceeded an output limit" : p.stderr || "implementation failed"] };
        await chmod(isolatedInput, 0o666);
        if (iteration >= 0) samples.push({ iteration: iteration + 1, valid: p.code === 0 && lastChecker.status === "accepted", wallTimeNanoseconds: p.durationNs, exitCode: p.code ?? -1, outputSizeBytes: outputSize, timedOut: p.timedOut, outputLimitExceeded: p.limitExceeded });
      }
      const result: BenchmarkResult = {
        benchmark: { id: benchmark.id, version: benchmark.version, size: sizeName },
        dataset: { id: `${benchmark.id}-${sizeName}-${benchmark.version}`, sha256: datasetHash, seed: 0, generatorVersion: "committed-fixture-1.0.0" },
        language: { id: language.id, name: language.name, version, compilerVersion, compilerFlags: language.build.arguments },
        build: { status: build.status, durationNanoseconds: build.durationNs, artifactSizeBytes: build.artifactSizeBytes, command: build.command },
        execution: {
          mode: "cold-process", warmupIterations: warmups, measuredIterations: iterations, samples, summary: summary(samples),
          metrics: metricAvailability(benchmark.metrics ?? config.defaults.metrics)
        },
        checker: { language: "go", version: lastChecker.checkerVersion, status: lastChecker.status, diagnostics: lastChecker.diagnostics },
        provenance: { fingerprint, measuredAt: createdAt, machine: currentMachine() }
      };
      results.push(result);
      if (lastChecker.status === "accepted") canonical.set(key, result);
      if (!flags.has("--quiet") && flags.get("--format") !== "json") console.log(`${benchmark.id}/${sizeName} ${language.name}: ${lastChecker.status} (${(summary(samples).medianWallTimeNanoseconds / 1e6).toFixed(2)} ms median)`);
    }
    }
  }
  const git = await runProcess("git", ["rev-parse", "HEAD"]).then(p => p.code === 0 ? p.stdout.trim() : "unknown");
  const gitDirty = await runProcess("git", ["status", "--porcelain"]).then(p => p.code === 0 ? p.stdout.trim().length > 0 : null);
  const snapshot: Snapshot = plannedCells === 0 && current ? current : {
    schemaVersion: "2.0.0", snapshotId, updatedAt: createdAt, arenaVersion: "0.1.0",
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

function printSummary(results: any[]) {
  console.log("\nBenchmark         Language      Correct  Median       Relative");
  console.log("----------------  ------------  -------  -----------  --------");
  const fastest = new Map<string, number>();
  for (const result of results) {
    if (result.checker.status !== "accepted") continue;
    const key = `${result.benchmark.id}/${result.benchmark.size}`;
    const median = result.execution.summary.medianWallTimeNanoseconds as number;
    fastest.set(key, Math.min(fastest.get(key) ?? Number.POSITIVE_INFINITY, median));
  }
  for (const result of results) {
    const key = `${result.benchmark.id}/${result.benchmark.size}`;
    const accepted = result.checker.status === "accepted";
    const median = result.execution.summary.medianWallTimeNanoseconds as number;
    const relative = accepted ? `${(median / fastest.get(key)!).toFixed(2)}x` : "unranked";
    console.log(`${key.padEnd(16)}  ${result.language.name.padEnd(12)}  ${(accepted ? "Yes" : "No").padEnd(7)}  ${(accepted ? `${(median / 1e6).toFixed(2)} ms` : "INVALID").padEnd(11)}  ${relative}`);
  }
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
  const rows: Array<{ key: string; status: string; detail: string }> = [];
  for (const benchmark of benchmarks) {
    const sizes = flags.get("--size") ? [flags.get("--size")!] : config.defaults.sizes.filter(name => benchmark.sizes[name]);
    for (const sizeName of sizes) for (const detection of detectionsById) {
      const { language, version, compilerVersion } = detection;
      if (!language.enabled || (requestedLanguages.length && !requestedLanguages.includes(language.id))) continue;
      const key = cellKey(benchmark.id, sizeName, language.id);
      const implementationDir = path.join(root, "benchmarks", benchmark.id, "implementations", language.id);
      if (!await exists(implementationDir)) {
        rows.push({ key, status: "unavailable", detail: "implementation missing" });
        continue;
      }
      if (!detection.available) {
        rows.push({ key, status: "unavailable", detail: "toolchain missing or unsupported" });
        continue;
      }
      const size = benchmark.sizes[sizeName]!;
      const fingerprint = await fingerprintCell(
        language, benchmark, sizeName, version, compilerVersion,
        Number(flags.get("--warmup") ?? size.warmupIterations),
        Number(flags.get("--iterations") ?? size.measuredIterations)
      );
      const saved = canonical.get(key);
      const status = !saved ? "missing" : saved.provenance?.fingerprint === fingerprint ? "current" : "stale";
      const machine = saved?.provenance?.machine;
      const differentMachine = machine && (machine.cpu.model !== currentMachine().cpu.model || machine.operatingSystem.platform !== process.platform);
      rows.push({ key, status, detail: differentMachine ? "different machine" : "" });
    }
  }
  const width = Math.max(4, ...rows.map(row => row.key.length));
  for (const row of rows) console.log(`${row.key.padEnd(width)}  ${row.status.padEnd(11)}${row.detail}`);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  console.log(`\n${["current", "stale", "missing", "unavailable"].map(status => `${status}: ${counts.get(status) ?? 0}`).join(" · ")}`);
}

async function resultsCommand(args: string[]) {
  if (!args[0] || args[0] === "current") {
    if (!await exists(currentResultPath)) throw new Error("No canonical results yet. Run `arena run`.");
    return console.log(await readFile(currentResultPath, "utf8"));
  }
  if (args[0] === "status") return resultsStatus(args.slice(1));
  throw new Error("Usage: arena results current|status");
}
async function listCommand(kind: string) {
  if (kind === "languages") for (const d of await detections()) console.log(`${d.language.id.padEnd(14)} ${d.available ? "available" : "unavailable"}  ${d.version}`);
  else if (kind === "benchmarks") for (const b of await discoverBenchmarks()) console.log(`${b.id.padEnd(16)} ${b.name}`);
  else if (kind === "metrics") console.log("wallTime\ncpuTime (platform dependent)\npeakMemory (platform dependent)\nexitCode\noutputSize\nbuildTime\nartifactSize\ncorrectness");
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
  if (args[0] !== "generate") throw new Error("Usage: arena dataset generate --benchmark <id> --size <size> [--seed <integer>]");
  const flags = parseFlags(args.slice(1));
  const benchmarkId = flags.get("--benchmark");
  const sizeName = flags.get("--size");
  const seed = Number(flags.get("--seed") ?? 729418);
  if (!benchmarkId || !sizeName || !Number.isSafeInteger(seed)) throw new Error("A benchmark, size, and integer seed are required");
  const benchmark = (await discoverBenchmarks()).find(x => x.id === benchmarkId);
  const size = benchmark?.sizes[sizeName];
  if (!benchmark || !size) throw new Error(`Unknown benchmark/size: ${benchmarkId}/${sizeName}`);
  const random = seeded(seed);
  let content: string;
  const scale = sizeName === "small" ? 1 : sizeName === "medium" ? 5 : 20;
  if (benchmarkId === "nbody") {
    const bodies = Array.from({ length: 3 + scale }, () => ({
      mass: Number((0.1 + random() * 1.9).toFixed(9)),
      position: [Number((random() * 4 - 2).toFixed(9)), Number((random() * 4 - 2).toFixed(9)), Number((random() * .2 - .1).toFixed(9))],
      velocity: [Number((random() * .5 - .25).toFixed(9)), Number((random() * .5 - .25).toFixed(9)), 0]
    }));
    content = `${JSON.stringify({ steps: 1000 * scale, deltaTime: 0.01 / Math.sqrt(scale), bodies })}\n`;
  } else if (benchmarkId === "shortest-path") {
    const vertexCount = 10 * scale;
    const edges: Array<{ from: number; to: number; weight: number }> = [];
    for (let i = 0; i < vertexCount - 1; i++) edges.push({ from: i, to: i + 1, weight: 1 + Math.floor(random() * 20) });
    for (let i = 0; i < vertexCount * 3; i++) {
      const from = Math.floor(random() * vertexCount), to = Math.floor(random() * vertexCount);
      if (from !== to) edges.push({ from, to, weight: 1 + Math.floor(random() * 100) });
    }
    const queries = Array.from({ length: 3 * scale }, (_, i) => ({ id: i + 1, source: Math.floor(random() * vertexCount), destination: Math.floor(random() * vertexCount) }));
    content = `${JSON.stringify({ vertexCount, edges, queries })}\n`;
  } else if (benchmarkId === "aggregation") {
    const categories = ["books", "games", "garden", "tools"];
    const rows = ["timestamp,account_id,category,quantity,unit_price"];
    for (let i = 0; i < 1000 * scale; i++) rows.push(`2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z,A${1 + Math.floor(random() * 100)},${categories[Math.floor(random() * categories.length)]},${1 + Math.floor(random() * 10)},${99 + Math.floor(random() * 9901)}`);
    content = `${rows.join("\n")}\n`;
  } else throw new Error(`No generator registered for ${benchmarkId}`);
  const destination = path.join(root, config.benchmarkDirectory, benchmarkId, "datasets", size.dataset);
  await writeFile(destination, content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  await atomicJson(`${destination}.metadata.json`, { benchmark: benchmarkId, version: benchmark.version, size: sizeName, seed, generatorVersion: "1.0.0", sha256 });
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
