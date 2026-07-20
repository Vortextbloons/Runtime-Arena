import { mkdir, rm, cp, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
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
const csprojPath = resolve(cwd, "ArenaBenchmark.csproj");
const publishDir = resolve(arenaDir, "publish");

const sourceFile = source.replace(/\\/g, "/");
const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Optimize>true</Optimize>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
  <ItemGroup>
    <Compile Remove="**/*.cs" />
    <Compile Include="${sourceFile}" />
  </ItemGroup>
</Project>
`;

await mkdir(arenaDir, { recursive: true });
await writeFile(csprojPath, csproj, "utf-8");

try {
  await run("dotnet", [
    "publish",
    "-c", "Release",
    "--self-contained", "false",
    "-o", publishDir,
  ], cwd);

  await mkdir(dirname(output), { recursive: true });
  await cp(resolve(publishDir, "ArenaBenchmark.dll"), output, { force: true });
  const runtimeConfig = resolve(publishDir, "ArenaBenchmark.runtimeconfig.json");
  const outputDir = dirname(output);
  const outputBase = output.replace(/\.dll$/i, "");
  try {
    await cp(runtimeConfig, outputBase + ".runtimeconfig.json", { force: true });
  } catch {}
} finally {
  await rm(csprojPath, { force: true });
  await rm(publishDir, { recursive: true, force: true });
  await rm(resolve(cwd, "bin"), { recursive: true, force: true });
  await rm(resolve(cwd, "obj"), { recursive: true, force: true });
}
