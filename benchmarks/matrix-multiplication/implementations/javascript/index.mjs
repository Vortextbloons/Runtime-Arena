import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const input = JSON.parse(await readFile(arg("--input"), "utf8"));
const n = input.dimension;
const nn = n * n;
// Typed arrays: dense, bounds-check-free numeric storage V8 optimizes well.
const a = Float64Array.from(input.left);
const b = Float64Array.from(input.right);
const c = new Float64Array(nn);
const bt = new Float64Array(nn);

function kernel() {
  // Blocked transpose of B so the cubic loop streams sequentially.
  for (let ii = 0; ii < n; ii += 32) {
    const iMax = Math.min(ii + 32, n);
    for (let jj = 0; jj < n; jj += 32) {
      const jMax = Math.min(jj + 32, n);
      for (let i = ii; i < iMax; i++) {
        const base = i * n;
        for (let j = jj; j < jMax; j++) bt[j * n + i] = b[base + j];
      }
    }
  }
  // Row/row dot products with 4-way unrolled accumulator parallelism.
  const kLim = n & ~3;
  let valueSum = 0;
  let diagonalSum = 0;
  for (let i = 0; i < n; i++) {
    const aBase = i * n;
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      const bBase = j * n;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      let k = 0;
      for (; k < kLim; k += 4) {
        s0 += a[aBase + k] * bt[bBase + k];
        s1 += a[aBase + k + 1] * bt[bBase + k + 1];
        s2 += a[aBase + k + 2] * bt[bBase + k + 2];
        s3 += a[aBase + k + 3] * bt[bBase + k + 3];
      }
      let s = (s0 + s1) + (s2 + s3);
      for (; k < n; k++) s += a[aBase + k] * bt[bBase + k];
      c[aBase + j] = s;
      rowSum += s;
      if (i === j) diagonalSum += s;
    }
    valueSum += rowSum;
  }
  // Batched string build: one join instead of O(n^2) += appends.
  const parts = new Array(nn + 2);
  parts[0] = `dimension=${n}\n`;
  for (let i = 0; i < nn; i++) parts[i + 1] = c[i].toString() + ",";
  parts[nn + 1] = "\n";
  const checksum = createHash("sha256").update(parts.join("")).digest("hex");
  return { benchmark: "matrix-multiplication", version: 1, dimension: n, elementCount: nn, valueSum, diagonalSum, checksum };
}

const digestOutput = (output) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output;
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
