import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";

const PROTOCOL_VERSION = "2.0.0";
const arg = (n: string) => process.argv[process.argv.indexOf(n) + 1]!;
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const inp = JSON.parse(await readFile(arg("--input"), "utf8"));
const { workerCount: wc, phaseCount: pc, itemsPerWorker: ipw, roundsPerItem: rpi, initialSeed: is } = inp as { workerCount: number; phaseCount: number; itemsPerWorker: number; roundsPerItem: number; initialSeed: string };
const ps = Number.parseInt(is, 16) >>> 0;

function m32(x: number): number { x = (x ^ (x >>> 16)) >>> 0; x = Math.imul(x, 0x21f0aaad) >>> 0; x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 0x735a2d97) >>> 0; x = (x ^ (x >>> 15)) >>> 0; return x; }
function rl64(lo: number, hi: number, n: number): [number, number] { const s = 32 - n; return [((lo << n) | (hi >>> s)) | 0, ((hi << n) | (lo >>> s)) | 0]; }
function add64(aLo: number, aHi: number, bLo: number, bHi: number): [number, number] { const lo = (aLo + bLo) | 0; return [lo, (aHi + bHi + ((lo >>> 0) < (bLo >>> 0) ? 1 : 0)) | 0]; }
function toHex8(n: number): string { return (n >>> 0).toString(16).padStart(8, "0"); }
function toHex16(lo: number, hi: number): string { return toHex8(hi) + toHex8(lo); }

type WorkerResult = { workerId: number; localXor: number; localSumLo: number; localSumHi: number };
const pending = new Map<number, (msg: WorkerResult) => void>();
const ws: Worker[] = Array.from({ length: wc }, (_, i) => {
  const w = new Worker(new URL("./worker.js", import.meta.url));
  w.on("message", (msg: WorkerResult) => {
    const resolve = pending.get(i);
    if (resolve) { pending.delete(i); resolve(msg); }
  });
  w.postMessage({ cmd: "init", workerId: i, itemsPerWorker: ipw, roundsPerItem: rpi });
  return w;
});

function dispatchPhase(phaseSeed: number) {
  return Promise.all(ws.map((w, i) => new Promise<WorkerResult>((resolve) => {
    pending.set(i, resolve);
    w.postMessage({ cmd: "work", phaseSeed });
  })));
}

async function kernel(ps0: number) {
  let dgLo = 0xf3bcc909, dgHi = 0x6a09e667;
  let p = ps0;
  for (let ph = 0; ph < pc; ph++) {
    const rs = await dispatchPhase(p);
    rs.sort((a, b) => a.workerId - b.workerId);
    let ns = (p ^ ph) >>> 0;
    let sumLo = 0, sumHi = 0;
    for (const r of rs) {
      ns = m32((ns ^ r.localXor ^ r.localSumLo ^ r.localSumHi ^ r.workerId) >>> 0);
      [sumLo, sumHi] = add64(sumLo, sumHi, r.localSumLo, r.localSumHi);
    }
    p = ns;
    [dgLo, dgHi] = rl64(dgLo, dgHi, 7);
    dgLo ^= ns;
    [dgLo, dgHi] = add64(dgLo, dgHi, sumLo, sumHi);
  }
  return { schemaVersion: "1.0.0", benchmark: "barrier-wave", workerCount: wc, phaseCount: pc, itemsProcessed: wc * pc * ipw, finalSeed: toHex8(p), digest: toHex16(dgLo, dgHi) };
}

const digestOutput = (output: unknown) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output!: Awaited<ReturnType<typeof kernel>>;
for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.type === "run") {
    output = await kernel(ps);
    emit({ type: "result", requestId: request.requestId, digest: digestOutput(output) });
  } else if (request.type === "finish") {
    const digest = digestOutput(output);
    await writeFile(arg("--output"), JSON.stringify(output));
    emit({ type: "finish", digest });
    await Promise.all(ws.map((w) => w.terminate()));
    break;
  }
}
