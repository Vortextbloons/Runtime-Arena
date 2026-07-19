import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "results", "current.json");
const destination = path.join(root, "web", "static", "results");

async function main() {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const snapshot = JSON.parse(await readFile(source, "utf8"));
  snapshot.results = snapshot.results.filter((result: any) =>
    result.execution?.mode === "persistent-worker" &&
    result.provenance?.measurementContractVersion === "1.0.0"
  );
  await writeFile(path.join(destination, "current.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Prepared ${path.relative(root, destination)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
