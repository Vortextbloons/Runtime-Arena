import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "results");
const destination = path.join(root, "web", "static", "results");

async function main() {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (entry) => !entry.includes(`${path.sep}.`)
  });
  console.log(`Prepared ${path.relative(root, destination)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
