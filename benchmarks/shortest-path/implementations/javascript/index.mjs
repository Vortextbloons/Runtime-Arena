import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const g = JSON.parse(await readFile(arg("--input"), "utf8"));
const vertexCount = g.vertexCount;
const V = vertexCount;
const INF = Infinity;

// Flat CSR adjacency
const degree = new Int32Array(V);
for (const e of g.edges) degree[e.from]++;
const offsets = new Int32Array(V + 1);
for (let v = 0; v < V; v++) offsets[v + 1] = offsets[v] + degree[v];
const E = g.edges.length;
const dst = new Int32Array(E);
const wgt = new Float64Array(E);
{
  const fill = offsets.slice(0, V);
  for (const e of g.edges) {
    const s = fill[e.from]++;
    dst[s] = e.to;
    wgt[s] = e.weight;
  }
}

const queries = g.queries;
const Q = queries.length;
const qSrc = new Int32Array(Q);
const qDst = new Int32Array(Q);
const qId = new Int32Array(Q);
for (let i = 0; i < Q; i++) {
  qSrc[i] = queries[i].source;
  qDst[i] = queries[i].destination;
  qId[i] = queries[i].id;
}

// Group query indices by source
const groupMap = new Map();
for (let i = 0; i < Q; i++) {
  const s = qSrc[i];
  let a = groupMap.get(s);
  if (!a) groupMap.set(s, (a = []));
  a.push(i);
}
const groupSrc = [...groupMap.keys()];
const groupIdx = [...groupMap.values()];

const dist = new Float64Array(V);
const prev = new Int32Array(V);
const seen = new Int32Array(V); // epoch stamp
const tmark = new Int32Array(V); // target stamp per group
let epoch = 0;
let tEpoch = 0;
let heapCost = new Float64Array(Math.max(256, E + V));
let heapNode = new Int32Array(heapCost.length);

function kernel() {
  const outDist = new Array(Q);
  const outPath = new Array(Q);
  for (let gi = 0; gi < groupSrc.length; gi++) {
    const src = groupSrc[gi];
    const idxs = groupIdx[gi];
    epoch++;
    const cur = epoch;
    tEpoch++;
    const tc = tEpoch;
    let rem = 0;
    for (let k = 0; k < idxs.length; k++) {
      const d = qDst[idxs[k]];
      if (d !== src && tmark[d] !== tc) {
        tmark[d] = tc;
        rem++;
      }
    }
    dist[src] = 0;
    seen[src] = cur;
    prev[src] = -1;
    let heapLen = 0;
    // push source
    heapCost[0] = 0;
    heapNode[0] = src;
    heapLen = 1;
    const o = offsets;
    const dd = dst;
    const ww = wgt;
    while (heapLen > 0) {
      if (rem === 0) break;
      // pop min
      const cost = heapCost[0];
      const u = heapNode[0];
      heapLen--;
      if (heapLen > 0) {
        const lc = heapCost[heapLen];
        const ln = heapNode[heapLen];
        heapCost[0] = lc;
        heapNode[0] = ln;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          if (l >= heapLen) break;
          const r = l + 1;
          let s = l;
          if (r < heapLen && heapCost[r] < heapCost[l]) s = r;
          if (heapCost[s] >= lc) break;
          heapCost[i] = heapCost[s];
          heapNode[i] = heapNode[s];
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
      const base = o[u];
      const end = o[u + 1];
      for (let ei = base; ei < end; ei++) {
        const to = dd[ei];
        const next = cost + ww[ei];
        if (seen[to] !== cur || next < dist[to]) {
          seen[to] = cur;
          dist[to] = next;
          prev[to] = u;
          // push (grow heap if pathological duplicate pushes overflow)
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
            if (heapCost[p] <= next) break;
            heapCost[i] = heapCost[p];
            heapNode[i] = heapNode[p];
            i = p;
          }
          heapCost[i] = next;
          heapNode[i] = to;
        }
      }
    }
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k];
      const d = qDst[i];
      if (d === src) {
        outDist[i] = 0;
        outPath[i] = [src];
      } else if (seen[d] !== cur) {
        outDist[i] = null;
        outPath[i] = [];
      } else {
        outDist[i] = dist[d];
        const rev = [];
        for (let x = d; ; x = prev[x]) {
          rev.push(x);
          if (x === src) break;
        }
        rev.reverse();
        outPath[i] = rev;
      }
    }
  }
  const results = new Array(Q);
  for (let i = 0; i < Q; i++) results[i] = { queryId: qId[i], distance: outDist[i], path: outPath[i] };
  return { benchmark: "shortest-path", version: 1, results };
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
