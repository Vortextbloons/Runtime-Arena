import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolveSpawnCommand, resolveSpawnEnv } from "./env.js";
import { shouldStopMeasuring, type MeasurementPolicy } from "./timing.js";

export const MEASUREMENT_PROTOCOL_VERSION = "2.0.0";

export type RunPhase = "warmup" | "measured";

export type ProtocolRequest =
  | { type: "run"; requestId: number; iteration: number; phase: RunPhase }
  | { type: "finish" };

export type ProtocolResponse =
  | { type: "ready"; protocolVersion: string }
  | { type: "result"; requestId: number; digest: string }
  | { type: "finish"; digest: string };

export type HarnessSample = {
  iteration: number;
  phase: RunPhase;
  requestId: number;
  iterationTimeNanoseconds: number;
  digest: string;
  valid: boolean;
};

export type HarnessRunResult = {
  success: boolean;
  samples: HarnessSample[];
  measuredSamples: HarnessSample[];
  outputDigest: string;
  outputSizeBytes: number;
  totalProcessDurationNanoseconds: number;
  error?: string;
  exitCode: number | null;
  timedOut: boolean;
  limitExceeded: boolean;
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

function strictKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const found = Object.keys(value);
  if (found.length !== keys.length || !keys.every(key => found.includes(key))) {
    throw new Error(`${label} has unexpected fields`);
  }
}

export function parseProtocolLine(line: string, expected: "ready" | "result" | "finish", requestId?: number): ProtocolResponse {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("malformed protocol JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("protocol message must be an object");
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (type === "ready") {
    if (expected !== "ready") throw new Error("unexpected ready message");
    strictKeys(record, ["type", "protocolVersion"], "ready message");
    if (record.protocolVersion !== MEASUREMENT_PROTOCOL_VERSION) {
      throw new Error(`unsupported protocol version ${String(record.protocolVersion)}`);
    }
    return { type: "ready", protocolVersion: MEASUREMENT_PROTOCOL_VERSION };
  }
  if (type === "result") {
    if (expected !== "result") throw new Error("unexpected result message");
    strictKeys(record, ["type", "requestId", "digest"], "result message");
    if (!Number.isSafeInteger(record.requestId) || (requestId !== undefined && record.requestId !== requestId)) {
      throw new Error("result requestId mismatch");
    }
    if (typeof record.digest !== "string" || !SHA256_HEX.test(record.digest)) throw new Error("invalid result digest");
    return { type: "result", requestId: record.requestId as number, digest: record.digest };
  }
  if (type === "finish") {
    if (expected !== "finish") throw new Error("unexpected finish message");
    strictKeys(record, ["type", "digest"], "finish message");
    if (typeof record.digest !== "string" || !SHA256_HEX.test(record.digest)) throw new Error("invalid finish digest");
    return { type: "finish", digest: record.digest };
  }
  throw new Error(`unknown protocol message type ${String(type)}`);
}

async function sha256File(file: string) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

type LineReader = {
  nextLine(timeoutMs: number): Promise<string>;
  dispose(force?: boolean): void;
};

function createLineReader(child: ChildProcessWithoutNullStreams, maxCapturedBytes: number): LineReader {
  let capturedBytes = 0;
  let pending = "";
  const waiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = [];
  let closed = false;
  let limitExceeded = false;

  const flushWaiter = (error?: Error, line?: string) => {
    const waiter = waiters.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    if (error) waiter.reject(error);
    else waiter.resolve(line!);
  };

  const pushChunk = (chunk: string) => {
    capturedBytes += Buffer.byteLength(chunk, "utf8");
    if (capturedBytes > maxCapturedBytes) {
      limitExceeded = true;
      child.kill("SIGKILL");
      while (waiters.length) flushWaiter(new Error("process output exceeded configured limit"));
      return;
    }
    pending += chunk;
    while (true) {
      const index = pending.indexOf("\n");
      if (index < 0) break;
      const line = pending.slice(0, index);
      pending = pending.slice(index + 1);
      if (waiters.length) flushWaiter(undefined, line);
      else throw new Error("unexpected extra protocol output");
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", pushChunk);
  child.stderr.on("data", (chunk: Buffer | string) => {
    capturedBytes += Buffer.byteLength(chunk);
    if (capturedBytes > maxCapturedBytes) {
      limitExceeded = true;
      child.kill("SIGKILL");
      while (waiters.length) flushWaiter(new Error("process output exceeded configured limit"));
    }
  });
  child.on("close", () => {
    closed = true;
    while (waiters.length) flushWaiter(new Error("worker exited before protocol completed"));
  });

  return {
  nextLine(timeoutMs: number) {
      if (limitExceeded) return Promise.reject(new Error("process output exceeded configured limit"));
      const newline = pending.indexOf("\n");
      if (newline >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        return Promise.resolve(line);
      }
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex(w => w.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          child.kill("SIGKILL");
          reject(new Error("protocol step timed out"));
        }, timeoutMs);
        waiters.push({ resolve, reject, timer });
      });
    },
    dispose(force = false) {
      if (force && !closed) child.kill("SIGKILL");
    }
  };
}

export async function runHarnessProtocol(options: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  outputFile: string;
  warmups: number;
  measurement: MeasurementPolicy;
  timeoutMilliseconds: number;
  maxCapturedBytes: number;
}): Promise<HarnessRunResult> {
  const started = process.hrtime.bigint();
  const platformCommand = resolveSpawnCommand(options.command);
  const resolvedEnv = resolveSpawnEnv(options.env ?? {});

  const child = spawn(platformCommand, options.args, {
    cwd: options.cwd,
    env: resolvedEnv,
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"]
  }) as ChildProcessWithoutNullStreams;

  const reader = createLineReader(child, options.maxCapturedBytes);
  const samples: HarnessSample[] = [];
  let timedOut = false;
  let limitExceeded = false;
  let exitCode: number | null = null;
  let error: string | undefined;
  let outputDigest = "";
  let outputSizeBytes = 0;
  let expectedDigest = "";
  let protocolCompleted = false;

  const waitForExit = new Promise<number | null>(resolve => {
    child.on("close", code => resolve(code));
  });

  const writeRequest = async (request: ProtocolRequest) => {
    const startedRequest = process.hrtime.bigint();
    child.stdin.write(`${JSON.stringify(request)}\n`);
    const expected = request.type === "finish" ? "finish" : "result";
    const line = await reader.nextLine(options.timeoutMilliseconds).catch((cause: Error) => {
      if (cause.message.includes("timed out")) timedOut = true;
      if (cause.message.includes("configured limit")) limitExceeded = true;
      throw cause;
    });
    const response = parseProtocolLine(line, expected, request.type === "run" ? request.requestId : undefined);
    const elapsed = Number(process.hrtime.bigint() - startedRequest);
    return { response, elapsed };
  };

  try {
    const readyLine = await reader.nextLine(options.timeoutMilliseconds).catch((cause: Error) => {
      if (cause.message.includes("timed out")) timedOut = true;
      throw cause;
    });
    parseProtocolLine(readyLine, "ready");

    let requestId = 0;
    let measuredCount = 0;
    let iteration = 0;
    while (true) {
      iteration += 1;
      requestId += 1;
      const phase: RunPhase = iteration <= options.warmups ? "warmup" : "measured";
      const { response, elapsed } = await writeRequest({ type: "run", requestId, iteration, phase });
      if (response.type !== "result") throw new Error("expected result response");
      if (expectedDigest && response.digest !== expectedDigest) {
        throw new Error("iteration digest mismatch");
      }
      expectedDigest = response.digest;
      const sample: HarnessSample = {
        iteration: phase === "measured" ? measuredCount + 1 : iteration,
        phase,
        requestId,
        iterationTimeNanoseconds: elapsed,
        digest: response.digest,
        valid: true
      };
      samples.push(sample);
      if (phase === "measured") {
        measuredCount += 1;
        const measuredTimes = samples.filter(s => s.phase === "measured").map(s => s.iterationTimeNanoseconds);
        if (shouldStopMeasuring(measuredTimes, options.measurement)) break;
      }
    }

    const finish = await writeRequest({ type: "finish" });
    if (finish.response.type !== "finish") throw new Error("expected finish response");
    if (finish.response.digest !== expectedDigest) throw new Error("finish digest mismatch");

    if (!(await stat(options.outputFile).catch(() => null))) throw new Error("output file missing after finish");
    outputSizeBytes = (await stat(options.outputFile)).size;
    outputDigest = await sha256File(options.outputFile);
    if (outputDigest !== expectedDigest) throw new Error("output file digest mismatch");
    protocolCompleted = true;
  } catch (cause) {
    error = (cause as Error).message;
    for (const sample of samples) sample.valid = false;
  } finally {
    child.stdin.end();
    if (!protocolCompleted) reader.dispose(true);
    exitCode = await Promise.race([
      waitForExit,
      new Promise<number | null>(resolve => setTimeout(() => resolve(null), protocolCompleted ? 5_000 : 1_000))
    ]);
    if (!protocolCompleted && exitCode === null) reader.dispose(true);
  }

  const measuredSamples = samples.filter(sample => sample.phase === "measured");
  const success = protocolCompleted && !timedOut && !limitExceeded
    && measuredSamples.length >= (options.measurement.mode === "fixed"
      ? options.measurement.minMeasuredIterations
      : Math.min(options.measurement.minMeasuredIterations, options.measurement.maxMeasuredIterations));

  return {
    success,
    samples,
    measuredSamples,
    outputDigest,
    outputSizeBytes,
    totalProcessDurationNanoseconds: Number(process.hrtime.bigint() - started),
    error,
    exitCode,
    timedOut,
    limitExceeded
  };
}
