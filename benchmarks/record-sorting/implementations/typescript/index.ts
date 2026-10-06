import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1]!;
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

interface Record { id: number; score: number; timestamp: number }
interface Input { records: Record[] }
const input = JSON.parse(await readFile(arg("--input"), "utf8")) as Input;
const inputRecords = input.records;
const rc = inputRecords.length;
const ids = new Array<number>(rc);
const scores = new Array<number>(rc);
const timestamps = new Float64Array(rc);
let idMin = Infinity, idMax = -Infinity;
let scoreMin = Infinity, scoreMax = -Infinity;
let tsMin = Infinity, tsMax = -Infinity;
for (let i = 0; i < rc; i++) {
  const r = inputRecords[i]!;
  const id = r.id, sc = r.score, ts = r.timestamp;
  ids[i] = id; scores[i] = sc; timestamps[i] = ts;
  if (id < idMin) idMin = id; if (id > idMax) idMax = id;
  if (sc < scoreMin) scoreMin = sc; if (sc > scoreMax) scoreMax = sc;
  if (ts < tsMin) tsMin = ts; if (ts > tsMax) tsMax = ts;
}

// Packed-key sort: key = ((scoreMax-score)*tsSpan + (ts-tsMin))*idSpan + (id-idMin).
// Ascending key order == score desc, timestamp asc, id asc. Exact in float64
// while the product of the three spans stays below 2^52.
const tsSpan = rc === 0 ? 1 : tsMax - tsMin + 1;
const idSpan = rc === 0 ? 1 : idMax - idMin + 1;
const scoreSpan = rc === 0 ? 1 : scoreMax - scoreMin + 1;
const usePacked = scoreSpan <= 4503599627370496 / Math.max(tsSpan, 1) / Math.max(idSpan, 1) &&
  tsSpan >= 1 && idSpan >= 1 && scoreSpan >= 1;
const keys = new Float64Array(rc);
const idx = new Array<number>(rc);
const lines = new Array<string>(rc);

function kernelPacked() {
  for (let i = 0; i < rc; i++) {
    keys[i] = ((scoreMax - scores[i]!) * tsSpan + (timestamps[i]! - tsMin)) * idSpan + (ids[i]! - idMin);
  }
  keys.sort();
  const take = Math.min(rc, 10);
  const firstRecords: Record[] = [];
  const lastRecords: Record[] = [];
  for (let j = 0; j < rc; j++) {
    const k = keys[j]!;
    const id = (k % idSpan) + idMin;
    const q = (k - (k % idSpan)) / idSpan;
    const ts = (q % tsSpan) + tsMin;
    const sc = scoreMax - ((q - (q % tsSpan)) / tsSpan);
    lines[j] = id + "," + sc + "," + ts + "\n";
    if (j < take) firstRecords.push({ id, score: sc, timestamp: ts });
    if (j >= rc - take) lastRecords.push({ id, score: sc, timestamp: ts });
  }
  const checksum = createHash("sha256").update(lines.join("")).digest("hex");
  return { benchmark: "record-sorting" as const, version: 1 as const, recordCount: rc, firstRecords, lastRecords, checksum };
}

function kernelGeneric() {
  for (let i = 0; i < rc; i++) idx[i] = i;
  idx.sort((a, b) => {
    const d = scores[b]! - scores[a]!;
    if (d !== 0) return d;
    const t = timestamps[a]! - timestamps[b]!;
    if (t !== 0) return t;
    return ids[a]! - ids[b]!;
  });
  const take = Math.min(rc, 10);
  const firstRecords: Record[] = [];
  const lastRecords: Record[] = [];
  for (let i = 0; i < take; i++) {
    const k = idx[i]!;
    firstRecords.push({ id: ids[k]!, score: scores[k]!, timestamp: timestamps[k]! });
  }
  for (let i = rc - take; i < rc; i++) {
    const k = idx[i]!;
    lastRecords.push({ id: ids[k]!, score: scores[k]!, timestamp: timestamps[k]! });
  }
  for (let i = 0; i < rc; i++) {
    const k = idx[i]!;
    lines[i] = ids[k] + "," + scores[k] + "," + timestamps[k] + "\n";
  }
  const checksum = createHash("sha256").update(lines.join("")).digest("hex");
  return { benchmark: "record-sorting" as const, version: 1 as const, recordCount: rc, firstRecords, lastRecords, checksum };
}

const kernel = usePacked ? kernelPacked : kernelGeneric;

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
