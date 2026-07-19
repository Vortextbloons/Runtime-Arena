import { readFile, writeFile } from "node:fs/promises";

const arg = (n: string) => process.argv[process.argv.indexOf(n) + 1]!;
const warmups = Number(arg("--warmup"));
const iterations = Number(arg("--iterations"));

type Edge = { from: number; to: number; weight: number };
type Query = { id: number; source: number; destination: number };
type Input = { vertexCount: number; edges: Edge[]; queries: Query[] };

const g: Input = JSON.parse(await readFile(arg("--input"), "utf8"));

const vertexCount: number = g.vertexCount;

// Build adjacency list once
const adj: Edge[][] = Array.from({ length: vertexCount }, () => []);
for (const e of g.edges) adj[e.from]!.push(e);

// Pre-allocate reusable arrays. Heap grows beyond vertexCount under lazy Dijkstra.
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

function kernel(): { queryId: number; distance: number | null; path: number[] }[] {
  const results: { queryId: number; distance: number | null; path: number[] }[] = [];
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
      const cost: number = heapCost[0]!;
      const u: number = heapNode[0]!;
      heapLen--;
      if (heapLen > 0) {
        heapCost[0] = heapCost[heapLen]!;
        heapNode[0] = heapNode[heapLen]!;
        // Sift down
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
          // Heap push
          let i = heapLen;
          ensureHeapCapacity(i + 1);
          heapLen++;
          heapCost[i] = next;
          heapNode[i] = e.to;
          // Sift up
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
  return results;
}

let results;
const samples: { iteration: number; kernelTimeNanoseconds: number }[] = [];
for (let i = -warmups; i < iterations; i++) {
  const start = process.hrtime.bigint();
  results = kernel();
  const elapsed = process.hrtime.bigint() - start;
  if (i >= 0) samples.push({ iteration: i + 1, kernelTimeNanoseconds: Number(elapsed) });
}

await writeFile(arg("--output"), JSON.stringify({ benchmark: "shortest-path", version: 1, results }));
await writeFile(arg("--timing-output"), JSON.stringify({ samples }));
