import { readFile } from "node:fs/promises";

export type TimingSample = { iteration: number; kernelTimeNanoseconds: number };

export async function readTimingSamples(file: string, expected: number): Promise<TimingSample[]> {
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("samples" in value)) {
    throw new Error("timing sidecar must contain only a samples property");
  }
  const samples = (value as { samples: unknown }).samples;
  if (!Array.isArray(samples) || samples.length !== expected) throw new Error(`timing sidecar must contain exactly ${expected} samples`);
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
