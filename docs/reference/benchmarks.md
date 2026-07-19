# Benchmarks Reference

Runtime Arena currently defines four benchmark workloads. Three are fully implemented across all six supported languages (Rust, Go, TypeScript, Python, LuaJIT, C++). **Barrier Wave** is implemented in five languages (all except LuaJIT); datasets and checker support are ready.

| Benchmark | Status | Stresses |
|-----------|--------|----------|
| `nbody` | Complete (6 languages) | Numeric computation, tight loops |
| `shortest-path` | Complete (6 languages) | Priority queues, graph traversal |
| `aggregation` | Complete (6 languages) | Parsing, hash maps, sorting, GC |
| `barrier-wave` | 5 languages implemented (LuaJIT pending) | Structured parallel concurrency, barriers |

Per-benchmark contracts live in `benchmarks/<id>/README.md` and `IMPLEMENTING.md`.

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

**Input:** CSV with columns `timestamp`, `account_id`, `category`, `quantity`, `unit_price` (dataset file is typically `*.csv`, not JSON).

**Output:** JSON with `recordCount`, `totalQuantity`, `totalValueMinorUnits`, `categories[]`, `topAccounts[]`, `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`, `checksum`.

**Stresses:** Parsing, string allocation, hash maps, sorting, garbage collection.

**Algorithm:** Parse CSV, aggregate by category and account, sort categories alphabetically, sort accounts by value descending (top 10), compute SHA-256 checksum.

## barrier-wave

**Workload:** Persistent worker pool with deterministic fan-out/fan-in and a barrier between every phase. Each worker owns a fixed shard, applies a 32-bit mixing kernel, and returns local XOR/sum; the coordinator reduces in worker-ID order.

**Input:** JSON (`schemaVersion` `1.0.0`) with `workerCount`, `phaseCount`, `itemsPerWorker`, `roundsPerItem`, `initialSeed` (8 lowercase hex chars).

**Output:** JSON with digest/seed fields defined in `benchmarks/barrier-wave/IMPLEMENTING.md`.

**Stresses:** Real parallel workers, synchronization, reduction order, communication inside the kernel timing boundary.

**Status notes:**
- Checker task `barrier-wave` is implemented and tested.
- Datasets are committed fixtures. `arena dataset generate --benchmark barrier-wave` works with the same `--size` and `--seed` flags as other benchmarks.
- Five of six languages are implemented: Rust, Go, TypeScript, Python, and C++. LuaJIT is excluded (no native threading). See the tree under `benchmarks/barrier-wave/implementations/`.
- `schemas/implementation-output.schema.json` does not yet include a barrier-wave branch; correctness is enforced by the Go checker.

## Dataset Sizes

| Size | Warmup / Measured (typical) | N-body | Shortest path | Aggregation | Barrier Wave |
|------|----------------------------|--------|---------------|-------------|--------------|
| small | see manifest | 4 bodies × 5,000 steps (1 / 5) | 100 vertices × 30 queries (1 / 5) | 10,000 records (1 / 5) | 2 workers × 500 phases × 64 items (3 / 10) |
| medium | see manifest | 6 bodies × 20,000 steps (3 / 10) | 300 vertices × 90 queries (3 / 10) | 50,000 records (3 / 10) | 4 workers × 250 phases × 1024 items (3 / 10) |
| large | see manifest | 8 bodies × 50,000 steps (3 / 10) | 600 vertices × 180 queries (3 / 10) | 200,000 records (3 / 10) | 8 workers × 100 phases × 8192 items (2 / 8) |

Warmup and measured iteration counts come from each benchmark's `benchmark.json` size entries (not only `arena.config.json` defaults). Dataset paths are whatever `sizes.<name>.dataset` names — JSON or CSV.

All datasets are deterministic from a seed. Regenerating via `arena dataset generate` writes metadata with `generatorVersion` `"2.0.0"`.

## Adding a New Benchmark

See [guides/adding-a-benchmark.md](../guides/adding-a-benchmark.md). Register a dataset generator in the CLI if you want `arena dataset generate` support.
