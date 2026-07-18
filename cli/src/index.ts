#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

type Command = { command: string; arguments: string[]; workingDirectory?: string; artifact?: string };
type Language = { id: string; name: string; enabled: boolean; detect: Command; build: Command & { artifact: string }; run: Command; environment: Record<string, string> };
type Size = { dataset: string; warmupIterations: number; measuredIterations: number };
type Benchmark = { id: string; name: string; version: number; sizes: Record<string, Size>; limits: { timeoutMilliseconds: number; maxOutputBytes: number } };
type Proc = { code: number | null; stdout: string; stderr: string; durationNs: number; timedOut: boolean };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const config = JSON.parse(await readFile(path.join(root, "arena.config.json"), "utf8")) as {
  benchmarkDirectory: string; languageDirectory: string; resultDirectory: string; checkerExecutable: string;
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

function runProcess(command: string, args: string[], cwd = root, timeout = 30_000, env: Record<string, string> = {}): Promise<Proc> {
  return new Promise(resolve => {
    const started = process.hrtime.bigint();
    let stdout = "", stderr = "", timedOut = false;
    const platformCommand = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
    const child = spawn(platformCommand, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: false });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeout);
    child.stdout.on("data", b => stdout += String(b));
    child.stderr.on("data", b => stderr += String(b));
    child.on("error", e => stderr += e.message);
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, durationNs: Number(process.hrtime.bigint() - started) });
    });
  });
}

function parseFlags(args: string[]) {
  const values = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!key.startsWith("-")) continue;
    if (["--no-save", "--quiet", "--preserve-temp"].includes(key)) bools.add(key);
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
  const minima: Record<string, number[]> = { rust: [1, 97], go: [1, 26], typescript: [26, 4] };
  return Promise.all((await discoverLanguages()).map(async language => {
    const p = await runProcess(language.detect.command, language.detect.arguments);
    const version = (p.stdout || p.stderr).trim();
    return { language, available: p.code === 0 && atLeast(version, minima[language.id] ?? [0]), version };
  }));
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
  const artifact = path.resolve(implementationDir, process.platform === "win32" && language.id !== "typescript" ? `${rawArtifact}.exe` : rawArtifact);
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
  const languages = ds.filter(d => d.available && (!requestedLanguages.length || requestedLanguages.includes(d.language.id)));
  const benchmarks = (await discoverBenchmarks()).filter(b => !requestedBenchmarks.length || requestedBenchmarks.includes(b.id));
  if (!languages.length || !benchmarks.length) throw new Error("No available language/benchmark combinations selected");
  const createdAt = new Date().toISOString();
  const runId = createdAt.replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const tempRoot = path.join(root, ".arena", "runs", runId);
  await mkdir(tempRoot, { recursive: true });
  const results: any[] = [];
  for (const benchmark of benchmarks) {
    const sizeName = flags.get("--size") ?? "small";
    const size = benchmark.sizes[sizeName];
    if (!size) throw new Error(`Unknown size '${sizeName}' for ${benchmark.id}`);
    const input = path.join(root, "benchmarks", benchmark.id, "datasets", size.dataset);
    if (!await exists(input)) throw new Error(`Missing dataset: ${input}`);
    const datasetHash = createHash("sha256").update(await readFile(input)).digest("hex");
    for (const { language, version } of languages) {
      const build = await buildOne(language, benchmark);
      if (build.status === "missing") continue;
      const warmups = Number(flags.get("--warmup") ?? size.warmupIterations);
      const iterations = Number(flags.get("--iterations") ?? size.measuredIterations);
      const samples: Array<Record<string, unknown> & { valid: boolean; wallTimeNanoseconds: number }> = [];
      let lastChecker = { status: "checker-error", checkerVersion: "unknown", diagnostics: [] as string[] };
      for (let iteration = -warmups; iteration < iterations; iteration++) {
        const output = path.join(tempRoot, `${benchmark.id}-${language.id}-${iteration}.json`);
        const vars = { projectRoot: root, benchmarkId: benchmark.id, benchmarkDir: path.join(root, "benchmarks", benchmark.id), implementationDir: build.implementationDir, inputFile: input, outputFile: output, artifact: build.artifact, runId, size: sizeName };
        const p = await runProcess(expand(language.run.command, vars), language.run.arguments.map(x => expand(x, vars)), build.implementationDir, benchmark.limits.timeoutMilliseconds, language.environment);
        const outputSize = await exists(output) ? (await stat(output)).size : 0;
        lastChecker = p.code === 0 && outputSize <= benchmark.limits.maxOutputBytes
          ? await checkOutput(benchmark, input, output)
          : { status: "checker-error", checkerVersion: "unknown", diagnostics: [p.timedOut ? "implementation timed out" : p.stderr || "implementation failed"] };
        if (iteration >= 0) samples.push({ iteration: iteration + 1, valid: p.code === 0 && lastChecker.status === "accepted", wallTimeNanoseconds: p.durationNs, exitCode: p.code ?? -1, outputSizeBytes: outputSize, timedOut: p.timedOut });
      }
      results.push({
        benchmark: { id: benchmark.id, version: benchmark.version, size: sizeName },
        dataset: { id: `${benchmark.id}-${sizeName}-${benchmark.version}`, sha256: datasetHash },
        language: { id: language.id, name: language.name, version },
        build: { status: build.status, durationNanoseconds: build.durationNs, artifactSizeBytes: build.artifactSizeBytes, command: build.command },
        execution: {
          mode: "cold-process", warmupIterations: warmups, measuredIterations: iterations, samples, summary: summary(samples),
          metrics: {
            wallTime: { status: "available", unit: "nanoseconds" },
            cpuTime: { status: "unavailable", reason: "Node child_process does not expose portable per-child CPU usage" },
            peakMemory: { status: "unavailable", reason: "Node child_process does not expose portable per-child peak RSS" }
          }
        },
        checker: { language: "go", version: lastChecker.checkerVersion, status: lastChecker.status, diagnostics: lastChecker.diagnostics }
      });
      if (!flags.has("--quiet") && flags.get("--format") !== "json") console.log(`${benchmark.id}/${sizeName} ${language.name}: ${lastChecker.status} (${(summary(samples).medianWallTimeNanoseconds / 1e6).toFixed(2)} ms median)`);
    }
  }
  const git = await runProcess("git", ["rev-parse", "HEAD"]).then(p => p.code === 0 ? p.stdout.trim() : "unknown");
  const record = { schemaVersion: "1.0.0", runId, createdAt, arenaVersion: "0.1.0", gitCommit: git, command: ["arena", "run", ...args], environment: { operatingSystem: { platform: process.platform, release: os.release() }, cpu: { model: os.cpus()[0]?.model ?? "unknown", architecture: process.arch, logicalCores: os.cpus().length }, memoryBytes: os.totalmem() }, results };
  await validateResult(record);
  if (!flags.has("--quiet") && flags.get("--format") !== "json") printSummary(results);
  if (!flags.has("--no-save")) await saveResult(record, flags.get("--output"), flags.get("--format") === "json" || flags.has("--quiet"));
  if (flags.get("--format") === "json") console.log(JSON.stringify(record, null, flags.has("--quiet") ? 0 : 2));
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
  const Ajv2020 = require("ajv/dist/2020").default as new (options: Record<string, unknown>) => {
    validate(schema: unknown, data: unknown): boolean;
    errors: unknown;
    errorsText(errors: unknown): string;
  };
  const addFormats = require("ajv-formats").default as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  if (!ajv.validate(schema, record)) {
    throw new Error(`Generated result failed schema validation: ${ajv.errorsText(ajv.errors)}`);
  }
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, file);
}
async function saveResult(record: { runId: string; createdAt: string; results: any[] }, explicit?: string, silent = false) {
  const resultDir = path.join(root, config.resultDirectory);
  const runPath = explicit ? path.resolve(root, explicit) : path.join(resultDir, "runs", `${record.runId}.json`);
  if (await exists(runPath)) throw new Error(`Refusing to overwrite immutable result ${runPath}`);
  await atomicJson(runPath, record);
  await atomicJson(path.join(resultDir, "latest.json"), { schemaVersion: "1.0.0", runId: record.runId, path: path.relative(resultDir, runPath).replaceAll("\\", "/") });
  const indexPath = path.join(resultDir, "index.json");
  const index = await exists(indexPath) ? await json<{ schemaVersion: string; runs: any[] }>(indexPath) : { schemaVersion: "1.0.0", runs: [] };
  index.runs.unshift({ runId: record.runId, createdAt: record.createdAt, path: path.relative(resultDir, runPath).replaceAll("\\", "/"), benchmarks: [...new Set(record.results.map(x => x.benchmark.id))], languages: [...new Set(record.results.map(x => x.language.id))] });
  await atomicJson(indexPath, index);
  if (!silent) console.log(`Saved: ${path.relative(root, runPath)}`);
}

async function resultsCommand(args: string[]) {
  const resultDir = path.join(root, config.resultDirectory);
  if (args[0] === "list") return console.log(await readFile(path.join(resultDir, "index.json"), "utf8"));
  const pointer = args[0] === "latest" ? await json<{ path: string }>(path.join(resultDir, "latest.json")) : { path: `runs/${args[1] ?? args[0]}.json` };
  console.log(await readFile(path.join(resultDir, pointer.path), "utf8"));
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

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  if (command === "doctor") return doctor();
  if (command === "list") { await listCommand(sub ?? ""); return 0; }
  if (command === "run") return runCommand([sub, ...rest].filter(Boolean) as string[]);
  if (command === "build") { await buildCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "results") { await resultsCommand([sub, ...rest].filter(Boolean) as string[]); return 0; }
  if (command === "check") {
    const f = parseFlags([sub, ...rest].filter(Boolean) as string[]);
    const benchmark = (await discoverBenchmarks()).find(x => x.id === f.get("--benchmark"));
    if (!benchmark || !f.get("--input") || !f.get("--output")) throw new Error("Usage: arena check --benchmark <id> --input <file> --output <file>");
    const result = await checkOutput(benchmark, path.resolve(f.get("--input")!), path.resolve(f.get("--output")!));
    console.log(JSON.stringify(result, null, 2)); return result.status === "accepted" ? 0 : 1;
  }
  console.log("Runtime Arena\n\nUsage: arena <doctor|list|build|run|check|results>");
  return command ? 1 : 0;
}

try { process.exitCode = await main(); }
catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
