import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "bin", process.platform === "win32" ? "arena-checker.exe" : "arena-checker");
const result = spawnSync("go", ["build", "-o", output, "./cmd/arena-checker"], {
  cwd: path.join(root, "checker"),
  stdio: "inherit",
  windowsHide: true,
  shell: false
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
