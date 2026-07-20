# Implementing Shortest-Path in a New Language

Weighted shortest-path queries on a directed graph with nonnegative integer
edge weights. For each query, find the shortest distance and path from source
to destination.

## Design philosophy

Implementations must produce output accepted by the checker. Use the
language's best idioms, types, and data structures — do not copy code
structure from the reference implementations. The checker is the source of
truth for correctness.

## CLI contract

Accept the persistent-worker flags: `--input`, `--output`, `--timing-output`,
`--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`.

Read the input JSON file before timing. For every iteration, compute shortest
paths for all queries and write the result. Send diagnostics only to stderr.

**Timing boundary**: Time only the shortest-path computation (graph
construction from pre-parsed input, all queries, path reconstruction).
Input parsing, JSON serialization, and file I/O are outside the kernel.

## Input format

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

## Output format

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

## Checker rules

The checker independently runs Dijkstra's algorithm and verifies:

- Results array has the same length as the input queries array.
- Each `queryId` matches the corresponding input query `id` (order matters).
- **Unreachable**: `distance` must be `null` and `path` must be `[]` (empty).
- **Reachable**: `distance` must equal the globally optimal cost. The checker
  verifies:
  1. Path starts at `source` and ends at `destination`.
  2. Every edge in the path exists in the input graph.
  3. The sum of edge weights along the path equals `distance`.
  4. The distance is globally optimal (not just a valid path).
- Equal-cost alternate optimal paths are accepted.

Any correct shortest-path algorithm for nonnegative weights is acceptable.
The checker does not enforce a specific algorithm — only that the reported
distance is optimal and the path is valid.

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

## Fairness constraints

**Allowed**: Any correct shortest-path algorithm (Dijkstra, A*, Bellman-Ford,
etc.), language-native data structures, compiler optimizations, cache-friendly
algorithms, and idiomatic abstractions.

**Prohibited**: External compute libraries, GPU offloading, multi-process
parallelism, precomputation across iterations, and caching results between
iterations.

## Verification

```bash
arena check --benchmark shortest-path --input datasets/small.json --output /tmp/shortest-path-out.json
```

The checker will output `{"status":"accepted",...}` on success.
