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
const ids = new Int32Array(rc);
const scores = new Int32Array(rc);
const timestamps = new Float64Array(rc);
for (let i = 0; i < rc; i++) {
  ids[i] = inputRecords[i].id;
  scores[i] = inputRecords[i].score;
  timestamps[i] = inputRecords[i].timestamp;
}
const idx = new Array<number>(rc);

function kernel() {
  for (let i = 0; i < rc; i++) idx[i] = i;
  idx.sort((a, b) => {
    const d = scores[b] - scores[a];
    if (d !== 0) return d;
    const t = timestamps[a] - timestamps[b];
    if (t !== 0) return t;
    return ids[a] - ids[b];
  });
  const take = Math.min(rc, 10);
  const firstRecords: { id: number; score: number; timestamp: number }[] = [];
  const lastRecords: { id: number; score: number; timestamp: number }[] = [];
  for (let i = 0; i < take; i++) {
    const k = idx[i]!;
    firstRecords.push({ id: ids[k], score: scores[k], timestamp: timestamps[k] });
  }
  for (let i = rc - take; i < rc; i++) {
    const k = idx[i]!;
    lastRecords.push({ id: ids[k], score: scores[k], timestamp: timestamps[k] });
  }
  let data = "";
  for (let i = 0; i < rc; i++) {
    const k = idx[i]!;
    data += ids[k] + "," + scores[k] + "," + timestamps[k] + "\n";
  }
  const checksum = createHash("sha256").update(data).digest("hex");
  return { benchmark: "record-sorting" as const, version: 1 as const, recordCount: rc, firstRecords, lastRecords, checksum };
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
