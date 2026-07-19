import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "results", "current.json");
const destination = path.join(root, "web", "static", "results");

type ArenaResult = {
  benchmark: { id: string; size: string; mutation?: string };
  execution?: { mode?: string };
  provenance?: { measurementContractVersion?: string };
};

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
  snapshot.results = pruneObsoleteMutationLessResults(
    snapshot.results.filter((result: ArenaResult) =>
      result.execution?.mode === "persistent-worker" &&
      result.provenance?.measurementContractVersion === "1.0.0"
    )
  );
  await writeFile(path.join(destination, "current.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  // Keep the canonical results file aligned so the next arena run does not resurrect obsolete rows.
  await writeFile(source, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Prepared ${path.relative(root, destination)} (${snapshot.results.length} results)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
