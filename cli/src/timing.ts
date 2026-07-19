import { readFile } from "node:fs/promises";

export type TimingSample = { iteration: number; kernelTimeNanoseconds: number };

export type MeasurementPolicy = {
  minMeasuredIterations: number;
  maxMeasuredIterations: number;
  targetRelativeConfidenceInterval: number;
  mode?: "adaptive-confidence-interval" | "fixed";
};

const T_CRITICAL_95 = [
  0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045
];

export function relativeMeanConfidenceIntervalWidth(samples: number[]): number {
  const n = samples.length;
  if (n < 2) return Number.POSITIVE_INFINITY;
  const mean = samples.reduce((sum, value) => sum + value, 0) / n;
  if (mean <= 0) return Number.POSITIVE_INFINITY;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const t = n < T_CRITICAL_95.length ? T_CRITICAL_95[n]! : 2;
  return (2 * t * Math.sqrt(variance / n)) / mean;
}

export function shouldStopMeasuring(kernelTimes: number[], policy: MeasurementPolicy): boolean {
  const n = kernelTimes.length;
  if (n >= policy.maxMeasuredIterations) return true;
  if (n < policy.minMeasuredIterations) return false;
  return relativeMeanConfidenceIntervalWidth(kernelTimes) <= policy.targetRelativeConfidenceInterval;
}

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
