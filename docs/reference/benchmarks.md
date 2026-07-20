# Benchmarks Reference

Runtime Arena currently defines seven benchmark workloads, each with implementations in all nine supported languages (Rust, C++, Go, Java, TypeScript, JavaScript, LuaJIT, Lua 5.4 (Interpreted), and Python). The sole exception is barrier-wave, where neither Lua runtime is included — both LuaJIT and lua-interpreted lack native threading. All workloads have contracts, fixtures, dataset generation, checker support, and complete benchmark results.

| Benchmark | Status | Stresses |
|-----------|--------|----------|
| `nbody` | Complete (9 languages) | Numeric computation, tight loops |
| `shortest-path` | Complete (9 languages) | Priority queues, graph traversal |
| `aggregation` | Complete (9 languages) | In-memory hash map aggregation, sorting, checksum |
| `barrier-wave` | Complete (7 languages; LuaJIT and lua-interpreted excluded) | Structured parallel concurrency, barriers |
| `word-frequency` | Complete (9 languages) | String hashing, hash maps, ranking |
| `record-sorting` | Complete (9 languages) | Multi-field sorting, comparator and struct access |
| `matrix-multiplication` | Complete (9 languages) | Numeric loops, memory layout, cache locality |

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

**Dataset mutations:** Each size has `sparse` (~2× vertex count edges) and `dense` (~8× vertex count edges) variants.

## aggregation

**Workload:** In-memory CSV transaction record aggregation (CSV is parsed before the timed kernel).

**Input:** CSV with columns `timestamp`, `account_id`, `category`, `quantity`, `unit_price` (dataset file is typically `*.csv`, not JSON).

**Output:** JSON with `recordCount`, `totalQuantity`, `totalValueMinorUnits`, `categories[]`, `topAccounts[]`, `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`, `checksum`.

**Stresses:** Hash map aggregation, sorting, and checksum computation over pre-parsed rows.

**Algorithm:** Parse CSV before timing, then aggregate by category and account inside the timed kernel, sort categories alphabetically, sort accounts by value descending (top 10), compute SHA-256 checksum.

## barrier-wave

**Workload:** Persistent worker pool with deterministic fan-out/fan-in and a barrier between every phase. Each worker owns a fixed shard, applies a 32-bit mixing kernel, and returns local XOR/sum; the coordinator reduces in worker-ID order.

**Input:** JSON (`schemaVersion` `1.0.0`) with `workerCount`, `phaseCount`, `itemsPerWorker`, `roundsPerItem`, `initialSeed` (8 lowercase hex chars).

**Output:** JSON with digest/seed fields defined in `benchmarks/barrier-wave/IMPLEMENTING.md`.

**Stresses:** Real parallel workers, synchronization, reduction order, communication inside the kernel timing boundary.

**Status notes:**
- Checker task `barrier-wave` is implemented and tested.
- Datasets are committed fixtures. `arena dataset generate --benchmark barrier-wave` works with the same `--size` and `--seed` flags as other benchmarks.
- Seven of nine languages are implemented: Rust, Go, TypeScript, Python, JavaScript, C++, and Java. LuaJIT and lua-interpreted are excluded (no native threading). See the tree under `benchmarks/barrier-wave/implementations/`.
- `schemas/implementation-output.schema.json` does not yet include a barrier-wave branch; correctness is enforced by the Go checker.

## word-frequency

**Workload:** Count prepared normalized words, rank the complete frequency table, and report the top ten plus a checksum.

**Input:** JSON `{words: string[]}`.

**Output:** `totalWords`, `uniqueWords`, `topWords[]`, and `checksum`.

**Stresses:** String hashing, hash maps, allocation, ranking, and dynamic-language object overhead.

**Dataset mutations:** Each size has `repeated-vocabulary` (skewed distribution) and `mostly-unique` (~92% unique) variants.

## record-sorting

**Workload:** Sort numeric records by score descending, timestamp ascending, and ID ascending.

**Input:** JSON `{records: [{id, score, timestamp}]}`.

**Output:** `recordCount`, the first and last ten sorted records, and a checksum of the full ordering.

**Stresses:** Sorting implementations, comparator overhead, object/struct access, and memory layout.

**Dataset mutations:** Each size has `random` (fully random) and `mostly-sorted` (~95% pre-sorted, 5% of records swapped) variants.

## matrix-multiplication

**Workload:** Multiply two dense square integer matrices using a fixed `i → j → k` triple loop.

**Input:** JSON `{dimension, left, right}` with flat row-major matrices.

**Output:** Dimension and product summaries plus a checksum of the complete product matrix.

**Stresses:** Numeric execution, nested loops, array representation, cache locality, and bounds checking.

**Dataset mutations:** Each size has `row-major` (naturally ordered fill) and `column-major` (column-wise fill) variants to stress cache layout.

## Dataset Mutations

Four benchmarks use **mutations** — multiple dataset variants per size that stress different aspects. They are defined in the benchmark manifest's `sizes.<name>.mutations` map (each entry has a `dataset` filename and `seed`). Non-mutation benchmarks (nbody, aggregation, barrier-wave) use a single `dataset` per size and no `measuredIterations` on medium/large.

| Benchmark | Mutations | Data per size |
|-----------|-----------|---------------|
| shortest-path | `sparse`, `dense` | 400/500/600 vertices, 120/110/180 queries; edge count varies by mutation |
| word-frequency | `repeated-vocabulary`, `mostly-unique` | 50k/50k/200k total words, 3,421/3,421/8,421 unique |
| record-sorting | `random`, `mostly-sorted` | 20k/100k/500k records, sorting difficulty varies |
| matrix-multiplication | `row-major`, `column-major` | 128×128 / 256×256 / 512×512 dimensions |

Mutation generators use `generatorVersion "2.2.0"` and produce a `mutation` field in the result's `benchmark` and `dataset` objects. Non-mutation benchmarks use `generatorVersion "committed-fixture-1.0.0"` in result records (the datasets are pre-committed fixtures). When regenerating a dataset via `arena dataset generate`, non-mutation benchmarks write `generatorVersion "2.0.0"` in the dataset metadata. The cell key format for mutation cells is `benchmark/size/mutation/language`.

## Dataset Sizes

Every benchmark defines per-size `warmupIterations` and optional `measuredIterations` in its `benchmark.json`. Sizes without an explicit `measuredIterations` inherit the effective minimum from `arena.config.json`'s `measurement.minMeasuredIterations` (default 10) under adaptive measurement.

| Size | N-body | Shortest path (per size) | Aggregation | Barrier Wave | Word Frequency | Record Sorting | Matrix Multiplication |
|------|--------|--------------------------|-------------|--------------|----------------|----------------|-----------------------|
| small | 12 bodies × 10,000 steps (2 / 5) | 400 vertices × 120 queries (2 / 5) | 100,000 records (2 / 5) | 2 workers × 1,500 phases × 64 items (2 / 5) | 50,000 words (2 / 5) | 20,000 records (2 / 5) | 128×128 (2 / 5) |
| medium | 10 bodies × 18,000 steps (2 / —) | 500 vertices × 110 queries (2 / —) | 120,000 records (2 / —) | 4 workers × 250 phases × 1,024 items (2 / —) | 50,000 words (2 / —) | 100,000 records (2 / —) | 256×256 (2 / —) |
| large | 12 bodies × 40,000 steps (2 / —) | 600 vertices × 180 queries (2 / —) | 200,000 records (2 / —) | 8 workers × 100 phases × 8,192 items (2 / —) | 200,000 words (2 / —) | 500,000 records (2 / —) | 512×512 (2 / —) |

`(warmupIterations / measuredIterations)` shown in parentheses. A dash (`—`) means the size omits `measuredIterations`, deferring to the runner's measurement policy. All datasets are deterministic from a seed. Regenerating via `arena dataset generate` writes metadata with the applicable `generatorVersion`.
