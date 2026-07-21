import { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

const tracked = new Set<ChildProcess>();

export function register(child: ChildProcess): void {
  tracked.add(child);
  child.on("close", () => tracked.delete(child));
}

export function killAll(): void {
  for (const child of tracked) {
    if (child.pid !== undefined) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" });
        } else {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        // already dead
      }
    }
    child.kill("SIGKILL");
  }
  tracked.clear();
}
