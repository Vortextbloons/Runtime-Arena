import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "results", "current.json");
const destination = path.join(root, "web", "static", "results");

type ArenaResult = {
  benchmark: { id: string; size: string; mutation?: string };
  language: { id: string };
  execution?: { mode?: string };
  provenance?: { measurementContractVersion?: string };
};

const SUPPORTED_CONTRACT_VERSIONS = new Set(["1.0.0", "1.1.0"]);

function contractRank(version?: string): number {
  if (version === "1.1.0") return 2;
  if (version === "1.0.0") return 1;
  return 0;
}

function resultCellKey(result: ArenaResult): string {
  const mutation = result.benchmark.mutation ? `/${result.benchmark.mutation}` : "";
  return `${result.benchmark.id}/${result.benchmark.size}${mutation}/${result.language.id}`;
}

/** Keep the newest supported measurement contract per benchmark cell. */
export function pickDisplayResults<T extends ArenaResult>(results: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const result of results) {
    if (result.execution?.mode !== "persistent-worker") continue;
    const version = result.provenance?.measurementContractVersion;
    if (!version || !SUPPORTED_CONTRACT_VERSIONS.has(version)) continue;
    const key = resultCellKey(result);
    const existing = byKey.get(key);
    if (!existing || contractRank(version) > contractRank(existing.provenance?.measurementContractVersion)) {
      byKey.set(key, result);
    }
  }
  return [...byKey.values()];
}

/** Drop legacy mutation-less cells when the same benchmark/size has mutation variants. */
export function pruneObsoleteMutationLessResults<T extends ArenaResult>(results: T[]): T[] {
  const mutatedSizes = new Set<string>();
  for (const result of results) {
    if (result.benchmark.mutation) {
      mutatedSizes.add(`${result.benchmark.id}/${result.benchmark.size}`);
    }
  }
  return results.filter((result) => {
    if (result.benchmark.mutation) return true;
    return !mutatedSizes.has(`${result.benchmark.id}/${result.benchmark.size}`);
  });
}

async function main() {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const snapshot = JSON.parse(await readFile(source, "utf8"));
  snapshot.results = pruneObsoleteMutationLessResults(pickDisplayResults(snapshot.results));
  await writeFile(path.join(destination, "current.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  // Keep the canonical results file aligned so the next arena run does not resurrect obsolete rows.
  await writeFile(source, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Prepared ${path.relative(root, destination)} (${snapshot.results.length} results)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
