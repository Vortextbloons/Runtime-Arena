import { readFile, writeFile } from "node:fs/promises";
const _t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
const _ciW=(a)=>{const n=a.length;if(n<2)return Infinity;const m=a.reduce((x,y)=>x+y,0)/n;if(m<=0)return Infinity;const v=a.reduce((s,x)=>s+(x-m)**2,0)/(n-1);return 2*(n<_t.length?_t[n]:2)*Math.sqrt(v/n)/m};

const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
const warmups = Number(arg("--warmup"));
const minIt = Number(arg("--min-iterations"));
const maxIt = Number(arg("--max-iterations"));
const targetCi = Number(arg("--target-relative-ci"));
const g = JSON.parse(await readFile(arg("--input"), "utf8"));

const vertexCount = g.vertexCount;

// Build adjacency list once
const adj = Array.from({ length: vertexCount }, () => []);
for (const e of g.edges) adj[e.from].push(e);

// Pre-allocate reusable arrays. Heap grows beyond vertexCount under lazy Dijkstra.
const dist = new Float64Array(vertexCount);
const prev = new Int32Array(vertexCount);
let heapCost = new Float64Array(Math.max(vertexCount, g.edges.length + 1));
let heapNode = new Int32Array(heapCost.length);
let heapLen = 0;

function ensureHeapCapacity(needed) {
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

function kernel() {
  const results = [];
  for (const q of g.queries) {
    dist.fill(Infinity);
    prev.fill(-1);
    dist[q.source] = 0;

    // Heap push source
    heapLen = 1;
    heapCost[0] = 0;
    heapNode[0] = q.source;

    while (heapLen > 0) {
      // Pop min element
      const cost = heapCost[0];
      const u = heapNode[0];
      heapLen--;
      if (heapLen > 0) {
        heapCost[0] = heapCost[heapLen];
        heapNode[0] = heapNode[heapLen];
        // Sift down
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = 2 * i + 2;
          let s = i;
          if (l < heapLen && heapCost[l] < heapCost[s]) s = l;
          if (r < heapLen && heapCost[r] < heapCost[s]) s = r;
          if (s === i) break;
          let tmp = heapCost[i]; heapCost[i] = heapCost[s]; heapCost[s] = tmp;
          tmp = heapNode[i]; heapNode[i] = heapNode[s]; heapNode[s] = tmp;
          i = s;
        }
      }

      if (cost !== dist[u]) continue;

      for (const e of adj[u]) {
        const next = cost + e.weight;
        if (next < dist[e.to]) {
          dist[e.to] = next;
          prev[e.to] = u;
          // Heap push
          let i = heapLen;
          ensureHeapCapacity(i + 1);
          heapLen++;
          heapCost[i] = next;
          heapNode[i] = e.to;
          // Sift up
          while (i > 0) {
            const p = (i - 1) >>> 1;
            if (heapCost[p] <= heapCost[i]) break;
            let tmp = heapCost[p]; heapCost[p] = heapCost[i]; heapCost[i] = tmp;
            tmp = heapNode[p]; heapNode[p] = heapNode[i]; heapNode[i] = tmp;
            i = p;
          }
        }
      }
    }

    if (dist[q.destination] === Infinity) {
      results.push({ queryId: q.id, distance: null, path: [] });
    } else {
      const path = [];
      for (let x = q.destination; x !== -1; x = prev[x]) path.push(x);
      path.reverse();
      results.push({ queryId: q.id, distance: dist[q.destination], path });
    }
  }
  return results;
}

let results;
const samples = [];
const _ts = [];
for (let i = -warmups; ; i++) {
  const start = process.hrtime.bigint();
  results = kernel();
  const elapsed = process.hrtime.bigint() - start;
  if (i >= 0) {
    const ns = Number(elapsed);
    samples.push({ iteration: samples.length + 1, kernelTimeNanoseconds: ns });
    _ts.push(ns);
    if (_ts.length >= maxIt || (_ts.length >= minIt && _ciW(_ts) <= targetCi)) break;
  }
}

await writeFile(arg("--output"), JSON.stringify({ benchmark: "shortest-path", version: 1, results }));
await writeFile(arg("--timing-output"), JSON.stringify({ samples }));
