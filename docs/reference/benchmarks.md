# Benchmarks Reference

Runtime Arena includes three benchmark workloads, each designed to stress different aspects of language runtimes.

## nbody

**Workload:** Gravitational N-body simulation using direct pairwise force computation.

**Input:** JSON with `steps`, `deltaTime`, and `bodies` (each with `mass`, `position[3]`, `velocity[3]`).

**Output:** JSON with `bodyCount`, `finalEnergy`, `positionChecksum`, `velocityChecksum`.

**Stresses:** Numeric computation, tight loops, floating-point arithmetic, memory access patterns.

**Algorithm:** For each step, compute pairwise gravitational forces between all bodies, update velocities, then update positions. Compute total kinetic + potential energy at the end.

## shortest-path

**Workload:** Weighted directed graph shortest-path queries using Dijkstra's algorithm.

**Input:** JSON with `vertexCount`, `edges` (from, to, weight), and `queries` (id, source, destination).

**Output:** JSON with `results[]` — each with `queryId`, `distance`, `path[]`.

**Stresses:** Priority queues, memory allocation, branch-heavy code, graph traversal.

**Algorithm:** For each query, run Dijkstra's algorithm from source to destination. Verify path endpoints, edge existence, and path cost.

## aggregation

**Workload:** CSV transaction record aggregation.

**Input:** CSV with columns `timestamp`, `account_id`, `category`, `quantity`, `unit_price`.

**Output:** JSON with `recordCount`, `totalQuantity`, `totalValueMinorUnits`, `categories[]`, `topAccounts[]`, `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`, `checksum`.

**Stresses:** Parsing, string allocation, hash maps, sorting, garbage collection.

**Algorithm:** Parse CSV, aggregate by category and account, sort categories alphabetically, sort accounts by value descending (top 10), compute SHA-256 checksum.

## Dataset Sizes

| Size | Warmup | Measured | N-body | Shortest path | Aggregation |
|------|--------|----------|--------|---------------|-------------|
| small | 1 | 5 | 4 bodies × 5,000 steps | 100 vertices × 30 queries | 10,000 records |
| medium | 3 | 10 | 6 bodies × 20,000 steps | 300 vertices × 90 queries | 50,000 records |
| large | 3 | 10 | 8 bodies × 50,000 steps | 600 vertices × 180 queries | 200,000 records |

Datasets are deterministic — generated from a seed and committed as fixtures with SHA-256 hashes.

## Adding a New Benchmark

See [guides/adding-a-benchmark.md](../guides/adding-a-benchmark.md).
