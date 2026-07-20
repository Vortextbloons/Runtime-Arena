import process from "node:process";

export function resolveSpawnEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const env = { ...process.env, ...overrides } as Record<string, string>;
  if (process.platform === "win32" && env.Path && !env.PATH) {
    env.PATH = env.Path;
  }
  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value.replaceAll("{PATH}", env.PATH ?? env.Path ?? "");
  }
  return env;
}

/** Use the current Node binary when manifests invoke `node` (Windows spawn + custom env). */
export function resolveSpawnCommand(command: string): string {
  if (command === "node") return process.execPath;
  if (process.platform === "win32" && ["npm", "npx"].includes(command)) return `${command}.cmd`;
  return command;
}
