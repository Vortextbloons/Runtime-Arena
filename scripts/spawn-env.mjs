import process from "node:process";

export function resolveSpawnEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  if (process.platform === "win32" && env.Path && !env.PATH) {
    env.PATH = env.Path;
  }
  for (const [key, value] of Object.entries(overrides)) {
    env[key] = String(value).replaceAll("{PATH}", env.PATH ?? env.Path ?? "");
  }
  return env;
}

export function resolveSpawnCommand(command) {
  if (command === "node") return process.execPath;
  if (process.platform === "win32" && ["npm", "npx"].includes(command)) return `${command}.cmd`;
  return command;
}
