import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import process from "node:process";
import { resolveSpawnCommand, resolveSpawnEnv } from "./env.js";

export type Proc = {
  code: number | null;
  stdout: string;
  stderr: string;
  durationNs: number;
  timedOut: boolean;
  limitExceeded: boolean;
};

export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeout = 30_000,
  env: Record<string, string> = {},
  maxCapturedBytes = 10 * 1024 * 1024,
  watchedOutputFile?: string
): Promise<Proc> {
  return new Promise(resolve => {
    const started = process.hrtime.bigint();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let limitExceeded = false;
    const platformCommand = resolveSpawnCommand(command);
    const resolvedEnv = resolveSpawnEnv(env);
    const child = spawn(platformCommand, args, { cwd, env: resolvedEnv, windowsHide: true, shell: false });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);
    let capturedBytes = 0;
    const capture = (target: "stdout" | "stderr", data: Buffer) => {
      capturedBytes += data.byteLength;
      if (capturedBytes > maxCapturedBytes) {
        limitExceeded = true;
        child.kill("SIGKILL");
        stderr += "process output exceeded configured limit";
        return;
      }
      if (target === "stdout") stdout += String(data);
      else stderr += String(data);
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
    child.on("error", error => {
      stderr += error.message;
    });
    const outputWatcher = watchedOutputFile
      ? setInterval(() => {
          try {
            if (statSync(watchedOutputFile).size > maxCapturedBytes) {
              limitExceeded = true;
              stderr += "output file exceeded configured limit";
              child.kill("SIGKILL");
            }
          } catch {
            /* The implementation has not created the file yet. */
          }
        }, 10)
      : undefined;
    child.on("close", code => {
      clearTimeout(timer);
      if (outputWatcher) clearInterval(outputWatcher);
      resolve({
        code,
        stdout,
        stderr,
        timedOut,
        limitExceeded,
        durationNs: Number(process.hrtime.bigint() - started)
      });
    });
  });
}
