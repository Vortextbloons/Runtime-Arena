import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "./process.js";
import { MEASUREMENT_PROTOCOL_VERSION } from "./protocol.js";

export type MinimalWorkerRun = {
  command: string;
  args: string[];
  cwd: string;
};

export async function prepareMinimalWorkerRun(
  root: string,
  languageId: string,
  inputFile: string,
  outputFile: string,
  workDir: string
): Promise<MinimalWorkerRun> {
  await mkdir(workDir, { recursive: true });
  const protocolArgs = ["--input", inputFile, "--output", outputFile, "--protocol-version", MEASUREMENT_PROTOCOL_VERSION];

  switch (languageId) {
    case "javascript":
      return {
        command: "node",
        args: [path.join(root, "examples/minimal-workers/javascript/main.mjs"), ...protocolArgs],
        cwd: workDir
      };
    case "typescript":
      return {
        command: "node",
        args: [path.join(root, "examples/minimal-workers/javascript/main.mjs"), ...protocolArgs],
        cwd: workDir
      };
    case "python":
      return {
        command: "python",
        args: [path.join(root, "examples/minimal-workers/python/main.py"), ...protocolArgs],
        cwd: workDir
      };
    case "go": {
      const sourceDir = path.join(root, "examples/minimal-workers/go");
      const artifact = path.join(workDir, process.platform === "win32" ? "minimal.exe" : "minimal");
      const build = await runProcess("go", ["build", "-o", artifact, "."], sourceDir, 120_000);
      if (build.code !== 0) throw new Error(build.stderr || build.stdout || "go build failed for minimal worker");
      return { command: artifact, args: protocolArgs, cwd: workDir };
    }
    case "rust": {
      const sourceDir = path.join(root, "examples/minimal-workers/rust");
      const build = await runProcess("cargo", ["build", "--release"], sourceDir, 180_000);
      if (build.code !== 0) throw new Error(build.stderr || build.stdout || "cargo build failed for minimal worker");
      const artifact = path.join(sourceDir, "target", "release", process.platform === "win32" ? "minimal-worker.exe" : "minimal-worker");
      return { command: artifact, args: protocolArgs, cwd: workDir };
    }
    case "c":
    case "cpp": {
      const sourceDir = path.join(root, "examples/minimal-workers", languageId === "cpp" ? "cpp" : "c");
      const source = path.join(sourceDir, languageId === "cpp" ? "main.cpp" : "main.c");
      const artifact = path.join(workDir, process.platform === "win32" ? "minimal.exe" : "minimal");
      const compiler = languageId === "cpp" ? "g++" : "gcc";
      const build = await runProcess(compiler, [
        "-O2",
        "-I", path.join(root, "languages/c/include"),
        "-o", artifact,
        source,
        "-lm"
      ], workDir, 120_000);
      if (build.code !== 0) throw new Error(build.stderr || build.stdout || `${compiler} build failed for minimal worker`);
      return { command: artifact, args: protocolArgs, cwd: workDir };
    }
    default:
      throw new Error(`no minimal worker registered for ${languageId}; add one under examples/minimal-workers/`);
  }
}
