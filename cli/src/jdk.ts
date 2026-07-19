import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function toolName(name: string) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function hasJavac(binDir: string) {
  return Boolean(binDir && existsSync(join(binDir, toolName("javac"))));
}

function pathHasJavac() {
  const probe = spawnSync(toolName("javac"), ["--version"], { encoding: "utf8", windowsHide: true });
  return !probe.error && probe.status === 0;
}

function newestJdkBin(roots: string[]) {
  const candidates: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const bin = join(root, entry.name, "bin");
      if (hasJavac(bin)) candidates.push(bin);
    }
  }
  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0] ?? null;
}

/** Resolve a JDK bin directory, or null if none is found / already on PATH. */
export function resolveJdkBin(): string | null {
  const home = process.env.JAVA_HOME;
  if (home) {
    const bin = join(home, "bin");
    if (hasJavac(bin)) return bin;
  }
  if (pathHasJavac()) return null;
  const programFiles = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    "/usr/lib/jvm",
    "/Library/Java/JavaVirtualMachines"
  ].filter((value): value is string => Boolean(value));
  const roots: string[] = [];
  for (const base of programFiles) {
    roots.push(
      join(base, "Eclipse Adoptium"),
      join(base, "Java"),
      join(base, "Microsoft"),
      join(base, "Amazon Corretto"),
      join(base, "Zulu"),
      join(base, "Temurin")
    );
  }
  return newestJdkBin(roots);
}

/** Absolute path to a JDK tool (javac/java/jar), or the bare tool name if on PATH. */
export function resolveJdkTool(name: string) {
  const bin = resolveJdkBin();
  if (bin) return join(bin, toolName(name));
  return toolName(name);
}

/** Environment fragment that prepends a discovered JDK bin to PATH. */
export function jdkPathEnvironment(): Record<string, string> {
  const bin = resolveJdkBin();
  if (!bin) return {};
  return {
    JAVA_HOME: dirname(bin),
    PATH: `${bin}${delimiter}{PATH}`
  };
}
