import { mkdir, rm, cp, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { resolveSpawnCommand, resolveSpawnEnv } from "./spawn-env.mjs";

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(resolveSpawnCommand(command), args, {
      cwd,
      env: resolveSpawnEnv(),
      stdio: "inherit",
      shell: false
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`))
    );
  });
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`missing ${name}`);
  return args[index + 1];
}

const args = process.argv.slice(2);
const output = resolve(option(args, "--output"));
const source = args.filter((_, i) => args[i - 1] !== "--output").at(-1);
if (!source) throw new Error("missing source file");

const cwd = process.cwd();
const arenaDir = resolve(cwd, ".arena");
const projectDir = join(arenaDir, "csharp-build");
const csprojPath = join(projectDir, "ArenaBenchmark.csproj");
const publishDir = join(projectDir, "publish");

const sourceFile = resolve(cwd, source).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\/g, "/");
const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Optimize>true</Optimize>
    <Nullable>enable</Nullable>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
  <ItemGroup>
    <Compile Remove="**/*.cs" />
    <Compile Include="${sourceFile}" />
  </ItemGroup>
</Project>
`;

await mkdir(projectDir, { recursive: true });
await writeFile(csprojPath, csproj, "utf-8");

try {
  await run("dotnet", [
    "publish",
    csprojPath,
    "-c", "Release",
    "--self-contained", "false",
    "-o", publishDir,
  ], cwd);

  await mkdir(dirname(output), { recursive: true });
  const outputDir = dirname(output);
  for (const stale of ["ArenaBenchmark.dll", "ArenaBenchmark.runtimeconfig.json", "ArenaBenchmark.pdb"]) {
    await rm(resolve(outputDir, stale), { force: true });
  }
  await cp(resolve(publishDir, "ArenaBenchmark.dll"), output, { force: true });
  const runtimeConfig = resolve(publishDir, "ArenaBenchmark.runtimeconfig.json");
  const outputBase = output.replace(/\.dll$/i, "");
  await cp(runtimeConfig, outputBase + ".runtimeconfig.json", { force: true });
} finally {
  await rm(projectDir, { recursive: true, force: true });
}
