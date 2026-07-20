import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export type TimingSample = { iteration: number; kernelTimeNanoseconds: number };

export type IterationSample = { iteration: number; iterationTimeNanoseconds: number };

export type MeasurementPolicy = {
  minMeasuredIterations: number;
  maxMeasuredIterations: number;
  targetRelativeConfidenceInterval: number;
  mode?: "adaptive-median-confidence-interval" | "adaptive-confidence-interval" | "fixed";
};

export function validateMeasurementPolicy(policy: MeasurementPolicy): MeasurementPolicy {
  if (!Number.isSafeInteger(policy.minMeasuredIterations) || policy.minMeasuredIterations < 1) {
    throw new Error("Minimum measured iterations must be a positive integer");
  }
  if (!Number.isSafeInteger(policy.maxMeasuredIterations) || policy.maxMeasuredIterations < 1) {
    throw new Error("Maximum measured iterations must be a positive integer");
  }
  if (policy.minMeasuredIterations > policy.maxMeasuredIterations) {
    throw new Error("Minimum measured iterations cannot exceed the maximum");
  }
  if (!Number.isFinite(policy.targetRelativeConfidenceInterval) || policy.targetRelativeConfidenceInterval < 0) {
    throw new Error("Target relative confidence interval must be a non-negative finite number");
  }
  if (policy.mode === "fixed" && policy.minMeasuredIterations !== policy.maxMeasuredIterations) {
    throw new Error("Fixed measurement mode requires equal minimum and maximum iterations");
  }
  return policy;
}

const T_CRITICAL_95 = [
  0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045
];

const BOOTSTRAP_RESAMPLES = 10_000;

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function seedFromSamples(samples: number[]) {
  const hash = createHash("sha256");
  for (const sample of samples) {
    hash.update(String(sample));
    hash.update("\0");
  }
  return hash.digest().readUInt32LE(0);
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMedianConfidenceInterval(samples: number[], resampleCount = BOOTSTRAP_RESAMPLES) {
  const sorted = [...samples].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const rng = mulberry32(seedFromSamples(samples));
  const medians: number[] = [];
  for (let resample = 0; resample < resampleCount; resample += 1) {
    const draw: number[] = [];
    for (let index = 0; index < sorted.length; index += 1) {
      draw.push(sorted[Math.floor(rng() * sorted.length)]!);
    }
    draw.sort((left, right) => left - right);
    medians.push(percentile(draw, 0.5));
  }
  medians.sort((left, right) => left - right);
  return { lower: percentile(medians, 0.025), upper: percentile(medians, 0.975), median };
}

export function relativeMedianConfidenceIntervalWidth(samples: number[]) {
  if (samples.length < 2) return Number.POSITIVE_INFINITY;
  const { lower, upper, median } = bootstrapMedianConfidenceInterval(samples);
  if (median <= 0) return Number.POSITIVE_INFINITY;
  return (upper - lower) / median;
}

/** Legacy mean CI helper retained for historical tooling. */
export function relativeMeanConfidenceIntervalWidth(samples: number[]): number {
  const n = samples.length;
  if (n < 2) return Number.POSITIVE_INFINITY;
  const mean = samples.reduce((sum, value) => sum + value, 0) / n;
  if (mean <= 0) return Number.POSITIVE_INFINITY;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const t = n < T_CRITICAL_95.length ? T_CRITICAL_95[n]! : 2;
  return (2 * t * Math.sqrt(variance / n)) / mean;
}

export function shouldStopMeasuring(iterationTimes: number[], policy: MeasurementPolicy): boolean {
  const count = iterationTimes.length;
  if (count >= policy.maxMeasuredIterations) return true;
  if (count < policy.minMeasuredIterations) return false;
  const { median } = bootstrapMedianConfidenceInterval(iterationTimes);
  if (median <= 0) return count >= policy.maxMeasuredIterations;
  return relativeMedianConfidenceIntervalWidth(iterationTimes) <= policy.targetRelativeConfidenceInterval;
}

/** Legacy sidecar reader for measurement contract 1.x results. */
export async function readTimingSamples(file: string, policy: MeasurementPolicy): Promise<TimingSample[]> {
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("samples" in value)) {
    throw new Error("timing sidecar must contain only a samples property");
  }
  const samples = (value as { samples: unknown }).samples;
  if (!Array.isArray(samples) || samples.length < policy.minMeasuredIterations || samples.length > policy.maxMeasuredIterations) {
    throw new Error(`timing sidecar must contain between ${policy.minMeasuredIterations} and ${policy.maxMeasuredIterations} samples`);
  }
  return samples.map((sample, index) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) throw new Error(`timing sample ${index + 1} must be an object`);
    const keys = Object.keys(sample);
    if (keys.length !== 2 || !keys.includes("iteration") || !keys.includes("kernelTimeNanoseconds")) throw new Error(`timing sample ${index + 1} has unexpected fields`);
    const { iteration, kernelTimeNanoseconds } = sample as TimingSample;
    if (iteration !== index + 1) throw new Error(`timing sample ${index + 1} has an invalid iteration`);
    if (!Number.isSafeInteger(kernelTimeNanoseconds) || kernelTimeNanoseconds < 0) throw new Error(`timing sample ${index + 1} has an invalid duration`);
    return { iteration, kernelTimeNanoseconds };
  });
}
