# Implementing Shortest-Path in a New Language

## Overview

Weighted shortest-path queries on a directed graph with nonnegative integer
edge weights. For each query, find the shortest distance and path from source
to destination.

## CLI Contract

Your program must:

1. Accept `--input <file>` and `--output <file>` arguments.
2. Read the input JSON file.
3. Compute shortest paths for all queries.
4. Write exactly one JSON result file to the output path.
5. Exit with code `0` on success. Exit nonzero on failure.
6. Write logs only to stderr. Never print result data to stdout.

## Input Format

JSON object:

```json
{
  "vertexCount": 100,
  "edges": [
    { "from": 0, "to": 1, "weight": 5 },
    { "from": 1, "to": 2, "weight": 3 }
  ],
  "queries": [
    { "id": 1, "source": 0, "destination": 2 }
  ]
}
```

| Field         | Type    | Description                          |
|---------------|---------|--------------------------------------|
| `vertexCount` | integer | Number of vertices (0-indexed)       |
| `edges`       | array   | Directed edges                       |
| `from`        | integer | Source vertex of the edge            |
| `to`          | integer | Destination vertex of the edge       |
| `weight`      | integer | Nonnegative edge weight (int64)      |
| `queries`     | array   | Shortest-path queries                |
| `id`          | integer | Unique query identifier             |
| `source`      | integer | Start vertex                        |
| `destination` | integer | End vertex                          |

## Output Format

```json
{
  "benchmark": "shortest-path",
  "version": 1,
  "results": [
    {
      "queryId": 1,
      "distance": 8,
      "path": [0, 1, 2]
    }
  ]
}
```

| Field      | Type         | Description                                    |
|------------|--------------|------------------------------------------------|
| `benchmark`| string       | Must be `"shortest-path"`                      |
| `version`  | integer      | Must be `1`                                    |
| `results`  | array        | One result per query, **in the same order as input queries** |
| `queryId`  | integer      | Must match the corresponding input query `id`  |
| `distance` | integer/null | Shortest distance, or `null` if unreachable    |
| `path`     | integer[]    | Vertex sequence from source to destination, or `[]` if unreachable |

## Algorithm

Use Dijkstra's algorithm with a priority queue (min-heap). Edge weights are
nonnegative so Dijkstra is correct.

Pseudocode:

```
for each query:
    dist[] = infinity for all vertices
    prev[] = -1 for all vertices
    dist[source] = 0
    heap = [(0, source)]

    while heap not empty:
        (cost, node) = pop_min(heap)
        if cost != dist[node]: continue    # stale entry
        for each edge from node:
            next_cost = cost + edge.weight
            if next_cost < dist[edge.to]:
                dist[edge.to] = next_cost
                prev[edge.to] = node
                heap.push((next_cost, edge.to))

    if dist[destination] == infinity:
        result = { distance: null, path: [] }
    else:
        path = trace back from destination using prev[]
        result = { distance: dist[destination], path: path }
```

## Checker Rules

- Results array must have the same length as the input queries array.
- Each `queryId` must match the corresponding input query `id` (order matters).
- **Unreachable**: `distance` must be `null` and `path` must be `[]` (empty).
- **Reachable**: `distance` must equal the optimal cost. The checker verifies:
  1. Path starts at `source` and ends at `destination`.
  2. Every edge in the path exists in the input graph.
  3. The sum of edge weights along the path equals `distance`.
  4. The distance is globally optimal (not just a valid path).
- Equal-cost alternate optimal paths are accepted.

## Gotchas

- **Result order**: Results must be in the same order as input queries, not
  sorted by queryId.
- **Unreachable handling**: Use `null` for distance, not `-1` or `0`. Use
  an empty array `[]` for path, not `[source]`.
- **Path includes both endpoints**: The path must include the source vertex
  as the first element and the destination as the last.
- **Integer types**: Distance and weights are integers (int64), not floats.
- **Self-loops and parallel edges**: The graph may contain them. Use the
  edge list as-is.

## Scaffolding

Each language needs build configuration in `implementations/<language-id>/`:

**Rust** — `Cargo.toml`:
```toml
[package]
name = "shortest-path"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```
Source: `src/main.rs`

**Go** — `go.mod`:
```
module runtime-arena/shortest-path
go 1.26
```
Source: `main.go` (no external dependencies needed — uses `container/heap`)

**TypeScript** — `package.json`:
```json
{"name":"arena-shortest-path-typescript","private":true,"type":"module","scripts":{"build":"tsc"},"devDependencies":{"@types/node":"^26.1.1","typescript":"^7.0.2"}}
```
`tsconfig.json`:
```json
{"compilerOptions":{"target":"ES2024","module":"NodeNext","moduleResolution":"NodeNext","outDir":"dist","strict":true,"types":["node"]},"include":["index.ts"]}
```
Source: `index.ts`

## Reference Implementations

- Go: `implementations/go/main.go`
- Rust: `implementations/rust/src/main.rs`
- TypeScript: `implementations/typescript/index.ts`

## Verification

```bash
arena check --benchmark shortest-path --input datasets/small.json --output /tmp/shortest-path-out.json
```

The checker will output `{"status":"accepted",...}` on success.
