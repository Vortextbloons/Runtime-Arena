import assert from "node:assert/strict";
import test from "node:test";
import { buildConformanceReport, diagnoseHarnessFailure, validateLanguageManifest } from "./protocol-conformance.js";

test("validateLanguageManifest flags missing protocol args", () => {
  const diagnostics = validateLanguageManifest({
    id: "demo",
    run: { command: "demo", arguments: ["--input", "{inputFile}"] }
  });
  assert.ok(diagnostics.some(line => line.includes("--protocol-version")));
});

test("diagnoseHarnessFailure maps digest mismatch to hints", () => {
  const hints = diagnoseHarnessFailure({
    success: false,
    samples: [],
    measuredSamples: [],
    outputDigest: "",
    outputSizeBytes: 0,
    totalProcessDurationNanoseconds: 0,
    error: "iteration digest mismatch",
    exitCode: null,
    timedOut: false,
    limitExceeded: false
  }, "");
  assert.ok(hints.some(hint => hint.includes("SHA-256")));
});

test("buildConformanceReport passes when harness succeeds", () => {
  const report = buildConformanceReport([], {
    success: true,
    samples: [],
    measuredSamples: [{ iteration: 1, phase: "measured", requestId: 1, iterationTimeNanoseconds: 1, digest: "a".repeat(64), valid: true }],
    outputDigest: "a".repeat(64),
    outputSizeBytes: 10,
    totalProcessDurationNanoseconds: 1,
    exitCode: 0,
    timedOut: false,
    limitExceeded: false
  }, "");
  assert.equal(report.passed, true);
});
