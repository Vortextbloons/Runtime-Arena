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
const V: number = vertexCount;

// Flat CSR adjacency
const degree = new Int32Array(V);
for (const e of g.edges) degree[e.from]++;
const offsets = new Int32Array(V + 1);
for (let v = 0; v < V; v++) offsets[v + 1] = offsets[v]! + degree[v]!;
const E: number = g.edges.length;
const dst = new Int32Array(E);
const wgt = new Float64Array(E);
{
  const fill: Int32Array = offsets.slice(0, V);
  for (const e of g.edges) {
    const s: number = fill[e.from]!++;
    dst[s] = e.to;
    wgt[s] = e.weight;
  }
}

const Q: number = g.queries.length;
const qSrc = new Int32Array(Q);
const qDst = new Int32Array(Q);
const qId = new Int32Array(Q);
for (let i = 0; i < Q; i++) {
  qSrc[i] = g.queries[i]!.source;
  qDst[i] = g.queries[i]!.destination;
  qId[i] = g.queries[i]!.id;
}

// Group query indices by source
const groupMap = new Map<number, number[]>();
for (let i = 0; i < Q; i++) {
  const s: number = qSrc[i]!;
  let a = groupMap.get(s);
  if (!a) groupMap.set(s, (a = []));
  a.push(i);
}
const groupSrc: number[] = [...groupMap.keys()];
const groupIdx: number[][] = [...groupMap.values()];

const dist: Float64Array = new Float64Array(V);
const prev: Int32Array = new Int32Array(V);
const seen: Int32Array = new Int32Array(V); // epoch stamp
const tmark: Int32Array = new Int32Array(V); // target stamp per group
let epoch: number = 0;
let tEpoch: number = 0;
let heapCost: Float64Array = new Float64Array(Math.max(256, E + V));
let heapNode: Int32Array = new Int32Array(heapCost.length);

function kernel(): { benchmark: "shortest-path"; version: 1; results: { queryId: number; distance: number | null; path: number[] }[] } {
  const outDist: (number | null)[] = new Array(Q);
  const outPath: number[][] = new Array(Q);
  for (let gi = 0; gi < groupSrc.length; gi++) {
    const src: number = groupSrc[gi]!;
    const idxs: number[] = groupIdx[gi]!;
    epoch++;
    const cur: number = epoch;
    tEpoch++;
    const tc: number = tEpoch;
    let rem = 0;
    for (let k = 0; k < idxs.length; k++) {
      const d: number = qDst[idxs[k]!]!;
      if (d !== src && tmark[d] !== tc) {
        tmark[d] = tc;
        rem++;
      }
    }
    dist[src] = 0;
    seen[src] = cur;
    prev[src] = -1;
    let heapLen = 0;
    heapCost[0] = 0;
    heapNode[0] = src;
    heapLen = 1;
    while (heapLen > 0) {
      if (rem === 0) break;
      const cost: number = heapCost[0]!;
      const u: number = heapNode[0]!;
      heapLen--;
      if (heapLen > 0) {
        const lc: number = heapCost[heapLen]!;
        const ln: number = heapNode[heapLen]!;
        heapCost[0] = lc;
        heapNode[0] = ln;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          if (l >= heapLen) break;
          const r = l + 1;
          let s = l;
          if (r < heapLen && heapCost[r]! < heapCost[l]!) s = r;
          if (heapCost[s]! >= lc) break;
          heapCost[i] = heapCost[s]!;
          heapNode[i] = heapNode[s]!;
          i = s;
        }
        heapCost[i] = lc;
        heapNode[i] = ln;
      }
      if (seen[u] !== cur || cost !== dist[u]) continue;
      if (tmark[u] === tc) {
        tmark[u] = -tc; // consume
        if (--rem === 0) break;
      }
      const base: number = offsets[u]!;
      const end: number = offsets[u + 1]!;
      for (let ei = base; ei < end; ei++) {
        const to: number = dst[ei]!;
        const next: number = cost + wgt[ei]!;
        if (seen[to] !== cur || next < dist[to]!) {
          seen[to] = cur;
          dist[to] = next;
          prev[to] = u;
          if (heapLen === heapCost.length) {
            const nc = new Float64Array(heapCost.length * 2);
            nc.set(heapCost);
            heapCost = nc;
            const nn = new Int32Array(heapNode.length * 2);
            nn.set(heapNode);
            heapNode = nn;
          }
          let i = heapLen++;
          while (i > 0) {
            const p = (i - 1) >>> 1;
            if (heapCost[p]! <= next) break;
            heapCost[i] = heapCost[p]!;
            heapNode[i] = heapNode[p]!;
            i = p;
          }
          heapCost[i] = next;
          heapNode[i] = to;
        }
      }
    }
    for (let k = 0; k < idxs.length; k++) {
      const i: number = idxs[k]!;
      const d: number = qDst[i]!;
      if (d === src) {
        outDist[i] = 0;
        outPath[i] = [src];
      } else if (seen[d] !== cur) {
        outDist[i] = null;
        outPath[i] = [];
      } else {
        outDist[i] = dist[d]!;
        const rev: number[] = [];
        for (let x: number = d; ; x = prev[x]!) {
          rev.push(x);
          if (x === src) break;
        }
        rev.reverse();
        outPath[i] = rev;
      }
    }
  }
  const results: { queryId: number; distance: number | null; path: number[] }[] = new Array(Q);
  for (let i = 0; i < Q; i++) results[i] = { queryId: qId[i]!, distance: outDist[i]!, path: outPath[i]! };
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
