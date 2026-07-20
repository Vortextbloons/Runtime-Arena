import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (n: string) => process.argv[process.argv.indexOf(n) + 1]!;
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

type Edge = { from: number; to: number; weight: number };
type Query = { id: number; source: number; destination: number };
type Input = { vertexCount: number; edges: Edge[]; queries: Query[] };

const g: Input = JSON.parse(await readFile(arg("--input"), "utf8"));
const vertexCount: number = g.vertexCount;

const adj: Edge[][] = Array.from({ length: vertexCount }, () => []);
for (const e of g.edges) adj[e.from]!.push(e);

const dist: Float64Array = new Float64Array(vertexCount);
const prev: Int32Array = new Int32Array(vertexCount);
let heapCost: Float64Array = new Float64Array(Math.max(vertexCount, g.edges.length + 1));
let heapNode: Int32Array = new Int32Array(heapCost.length);
let heapLen: number = 0;

function ensureHeapCapacity(needed: number): void {
  if (needed <= heapCost.length) return;
  let cap = heapCost.length;
  while (cap < needed) cap *= 2;
  const nextCost = new Float64Array(cap);
  const nextNode = new Int32Array(cap);
  nextCost.set(heapCost);
  nextNode.set(heapNode);
  heapCost = nextCost;
  heapNode = nextNode;
}

function kernel(): { benchmark: "shortest-path"; version: 1; results: { queryId: number; distance: number | null; path: number[] }[] } {
  const results: { queryId: number; distance: number | null; path: number[] }[] = [];
  for (const q of g.queries) {
    dist.fill(Infinity);
    prev.fill(-1);
    dist[q.source] = 0;
    heapLen = 1;
    heapCost[0] = 0;
    heapNode[0] = q.source;
    while (heapLen > 0) {
      const cost: number = heapCost[0]!;
      const u: number = heapNode[0]!;
      heapLen--;
      if (heapLen > 0) {
        heapCost[0] = heapCost[heapLen]!;
        heapNode[0] = heapNode[heapLen]!;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = 2 * i + 2;
          let s = i;
          if (l < heapLen && heapCost[l]! < heapCost[s]!) s = l;
          if (r < heapLen && heapCost[r]! < heapCost[s]!) s = r;
          if (s === i) break;
          let tmp = heapCost[i]!; heapCost[i] = heapCost[s]!; heapCost[s] = tmp;
          tmp = heapNode[i]!; heapNode[i] = heapNode[s]!; heapNode[s] = tmp;
          i = s;
        }
      }
      if (cost !== dist[u]) continue;
      for (const e of adj[u]!) {
        const next: number = cost + e.weight;
        if (next < dist[e.to]) {
          dist[e.to] = next;
          prev[e.to] = u;
          let i = heapLen;
          ensureHeapCapacity(i + 1);
          heapLen++;
          heapCost[i] = next;
          heapNode[i] = e.to;
          while (i > 0) {
            const p = (i - 1) >>> 1;
            if (heapCost[p]! <= heapCost[i]!) break;
            let tmp = heapCost[p]!; heapCost[p] = heapCost[i]!; heapCost[i] = tmp;
            tmp = heapNode[p]!; heapNode[p] = heapNode[i]!; heapNode[i] = tmp;
            i = p;
          }
        }
      }
    }
    if (dist[q.destination] === Infinity) {
      results.push({ queryId: q.id, distance: null, path: [] });
    } else {
      const path: number[] = [];
      for (let x: number = q.destination; x !== -1; x = prev[x]!) path.push(x);
      path.reverse();
      results.push({ queryId: q.id, distance: dist[q.destination], path });
    }
  }
  return { benchmark: "shortest-path", version: 1, results };
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
