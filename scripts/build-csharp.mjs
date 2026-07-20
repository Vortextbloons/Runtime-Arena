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

const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Optimize>true</Optimize>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
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
  const dllName = source.replace(/\.cs$/i, ".dll");
  await cp(resolve(publishDir, dllName), output, { force: true });
} finally {
  await rm(csprojPath, { force: true });
  await rm(publishDir, { recursive: true, force: true });
  await rm(resolve(cwd, "bin"), { recursive: true, force: true });
  await rm(resolve(cwd, "obj"), { recursive: true, force: true });
}
