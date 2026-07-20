import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1]!;
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

interface Input { dimension: number; left: number[]; right: number[] }
const input = JSON.parse(await readFile(arg("--input"), "utf8")) as Input;
const n = input.dimension;
const nn = n * n;
const a = input.left;
const b = input.right;
const c = new Array<number>(nn);

function kernel() {
  for (let i = 0; i < nn; i++) c[i] = 0;
  for (let i = 0; i < n; i++) {
    const ci = i * n;
    for (let k = 0; k < n; k++) {
      const aik = a[i * n + k];
      const bk = k * n;
      for (let j = 0; j < n; j++) c[ci + j] += aik * b[bk + j];
    }
  }
  let valueSum = 0;
  for (let i = 0; i < nn; i++) valueSum += c[i]!;
  let diagonalSum = 0;
  for (let i = 0; i < n; i++) diagonalSum += c[i * n + i]!;
  let s = `dimension=${n}\n`;
  for (let i = 0; i < nn; i++) s += c[i]!.toString() + ",";
  s += "\n";
  const checksum = createHash("sha256").update(s).digest("hex");
  return { benchmark: "matrix-multiplication" as const, version: 1 as const, dimension: n, elementCount: nn, valueSum, diagonalSum, checksum };
}

const digestOutput = (output: unknown) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output!: ReturnType<typeof kernel>;
for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.type === "run") {
    output = kernel();
    emit({ type: "result", requestId: request.requestId, digest: digestOutput(output) });
  } else if (request.type === "finish") {
    const digest = digestOutput(output);
    await writeFile(arg("--output"), JSON.stringify(output));
    emit({ type: "finish", digest });
    break;
  }
}
