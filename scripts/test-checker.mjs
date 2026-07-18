import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".arena", "go-test-cache");
mkdirSync(cache, { recursive: true });
const result = spawnSync("go", ["test", "./..."], {
  cwd: path.join(root, "checker"),
  env: { ...process.env, GOCACHE: cache },
  stdio: "inherit",
  windowsHide: true,
  shell: false
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
