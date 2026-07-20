import { MEASUREMENT_PROTOCOL_VERSION, runHarnessProtocol, type HarnessRunResult } from "./protocol.js";

export type ConformanceLanguage = {
  id: string;
  run: { command: string; arguments: string[] };
};

export type ConformanceReport = {
  passed: boolean;
  diagnostics: string[];
  hints: string[];
};

const REQUIRED_RUN_ARGS = ["--input", "--output", "--protocol-version"];

export function validateLanguageManifest(language: ConformanceLanguage): string[] {
  const diagnostics: string[] = [];
  const args = language.run.arguments;
  for (const flag of REQUIRED_RUN_ARGS) {
    if (!args.includes(flag) && !args.some(value => value.includes(flag))) {
      diagnostics.push(`language manifest run.arguments is missing ${flag}`);
    }
  }
  if (!args.some(value => value.includes("protocolVersion") || value.includes("2.0.0"))) {
    diagnostics.push("language manifest should pass {protocolVersion} to implementations");
  }
  return diagnostics;
}

export function diagnoseHarnessFailure(result: HarnessRunResult, stderr: string): string[] {
  const hints: string[] = [];
  const error = result.error ?? "";

  if (error.includes("unexpected ready")) {
    hints.push("Emit exactly one {\"type\":\"ready\",\"protocolVersion\":\"2.0.0\"} line before reading stdin.");
  }
  if (error.includes("unsupported protocol version")) {
    hints.push(`Reject unsupported versions and accept only ${MEASUREMENT_PROTOCOL_VERSION}.`);
  }
  if (error.includes("digest mismatch") || error.includes("iteration digest mismatch") || error.includes("finish digest mismatch")) {
    hints.push("Digest must be lowercase SHA-256 hex of the compact JSON result bytes for that iteration.");
    hints.push("Use JSON.stringify without extra whitespace, or your language's compact JSON encoder.");
  }
  if (error.includes("output file digest mismatch")) {
    hints.push("The file written on finish must byte-match the digest from the last result message.");
  }
  if (error.includes("worker exited before protocol completed")) {
    hints.push("Keep the process alive until finish is handled; flush stdout after every line.");
    if (stderr.includes("missing required arguments") || stderr.includes("missing --")) {
      hints.push("Parse --input, --output, and --protocol-version from argv before entering the protocol loop.");
    }
  }
  if (error.includes("protocol step timed out")) {
    hints.push("Read stdin line-by-line; do not block waiting for EOF before responding to run requests.");
  }
  if (error.includes("malformed protocol JSON")) {
    hints.push("Each protocol line must be a single JSON object with no extra text or logs on stdout.");
  }
  if (result.exitCode !== null && result.exitCode !== 0 && !error) {
    hints.push(`Process exited with code ${result.exitCode}; unhandled exceptions should go to stderr.`);
  }
  if (stderr.includes("ArenaBenchmark") || stderr.includes("missing required arguments")) {
    hints.push("On .NET, remove stale ArenaBenchmark.dll files from the implementation .arena directory.");
  }
  return hints;
}

export function buildConformanceReport(
  manifestDiagnostics: string[],
  result: HarnessRunResult,
  stderr: string
): ConformanceReport {
  const diagnostics = [...manifestDiagnostics];
  if (!result.success) {
    if (result.error) diagnostics.push(result.error);
    if (result.timedOut) diagnostics.push("protocol step timed out");
    if (result.limitExceeded) diagnostics.push("process output exceeded configured limit");
    if (result.exitCode !== null && result.exitCode !== 0) diagnostics.push(`implementation exited with ${result.exitCode}`);
  }
  const hints = diagnoseHarnessFailure(result, stderr);
  return {
    passed: manifestDiagnostics.length === 0 && result.success,
    diagnostics,
    hints
  };
}

export async function runProtocolConformance(options: {
  command: string;
  args: string[];
  cwd: string;
  outputFile: string;
  env?: Record<string, string>;
  timeoutMilliseconds?: number;
  language?: ConformanceLanguage;
}): Promise<ConformanceReport & { result: HarnessRunResult; stderr: string }> {
  const manifestDiagnostics = options.language ? validateLanguageManifest(options.language) : [];
  const stderr = "";
  const result = await runHarnessProtocol({
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    env: options.env,
    outputFile: options.outputFile,
    warmups: 0,
    measurement: { minMeasuredIterations: 1, maxMeasuredIterations: 1, targetRelativeConfidenceInterval: 0, mode: "fixed" },
    timeoutMilliseconds: options.timeoutMilliseconds ?? 30_000,
    maxCapturedBytes: 1_000_000
  }).catch((error: Error) => ({
    success: false,
    samples: [],
    measuredSamples: [],
    outputDigest: "",
    outputSizeBytes: 0,
    totalProcessDurationNanoseconds: 0,
    error: error.message,
    exitCode: -1,
    timedOut: false,
    limitExceeded: false
  }));

  const report = buildConformanceReport(manifestDiagnostics, result, stderr);
  return { ...report, result, stderr };
}
