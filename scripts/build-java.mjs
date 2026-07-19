import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`missing ${name}`);
  return args[index + 1];
}

const args = process.argv.slice(2);
const release = option(args, "--release");
const output = resolve(option(args, "--output"));
const sources = args.filter((value, index) => index === 0 || (args[index - 1] !== "--release" && args[index - 1] !== "--output" && value !== release && value !== output));
const source = sources.at(-1);
if (!source) throw new Error("missing Java source");

const cwd = process.cwd();
const classes = join(cwd, ".arena", "classes");
await rm(classes, { recursive: true, force: true });
await mkdir(classes, { recursive: true });
await mkdir(resolve(output, ".."), { recursive: true });
await run("javac", ["--release", release, "-g:none", "-d", classes, source], cwd);
await rm(output, { force: true });
await run("jar", ["--create", "--file", output, "--main-class", "Main", "-C", classes, "."], cwd);
