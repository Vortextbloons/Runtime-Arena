# CLI Component

The CLI (`cli/`) is the primary entry point — a TypeScript command-line tool that orchestrates discovery, building, execution, validation, and result storage.

## Structure

```
cli/
  package.json              # @runtime-arena/cli, type: module, bin: arena
  tsconfig.json             # ES2024, NodeNext, strict
  src/
    index.ts                            # Main CLI logic (commands, discovery, run, fingerprints)
    protocol.ts                         # Harness protocol (NDJSON stdin/stdout, digest verification)
    protocol-conformance.ts             # Conformance testing: validates language manifests and protocol
    protocol-conformance.test.ts        # Protocol conformance tests
    provenance.ts                       # Build provenance, caching, fingerprint computation
    provenance-defaults.ts              # Merges language-manifest provenance with shared defaults
    provenance-defaults.test.ts         # Provenance defaults tests
    provenance.test.ts                  # Provenance tests
    env.ts                              # Spawn environment resolution (PATH, Node binary)
    process.ts                          # Subprocess runner with timeout, output limits, watchdog
    process-registry.ts                 # Process registry — tracks spawned children for cleanup (killAll)
    pool.ts                             # Bounded-concurrency async semaphore (runPool)
    pool.test.ts                        # Pool unit tests
    runner-cache.ts                     # RunnerCache class (file/dataset caching for fingerprinting)
    runner-cache.test.ts                # RunnerCache tests
    timing.ts                           # Timing sample reader, bootstrap median CI
    timing.test.ts                      # Timing sample tests
    metrics.ts                          # Metric registry (kernelTime, iterationTime)
    mutations.ts                        # Dataset mutation expansion and cell-key logic
    mutations.test.ts                   # Mutation tests
    jdk.ts                              # JDK discovery (Java home, PATH resolution)
    minimal-workers.ts                  # Minimal worker builds (for protocol conformance testing)
    commands/                           # Placeholder — reserved for command dispatch
    discovery/                          # Placeholder — reserved for language/benchmark discovery
    execution/                          # Placeholder — reserved for execution orchestration
    metrics/                            # Placeholder — reserved for metric collectors
    reporting/                          # Placeholder — reserved for report generators
    results/                            # Placeholder — reserved for result storage

  test/
    cli.test.ts                         # Integration tests
    protocol.test.ts                    # Protocol unit tests (bootstrap, timing, fake worker)
    fixtures/
      input.json                        # Test fixture input
      fake-worker.mjs                   # Test fixture protocol worker

  dist/                                 # Compiled output
```

Test files with a `.test.ts` suffix live next to their source module in `src/` (e.g. `timing.test.ts` beside `timing.ts`). The `test/` directory hosts integration-level and fixture-based tests (`protocol.test.ts`, `cli.test.ts`).

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Factored into focused modules**: Core runtime behavior is split across 15 modules under `src/`. `index.ts` handles command dispatch and high-level orchestration; domain concerns live in dedicated modules:
- **`protocol.ts`** — Harness protocol (NDJSON request/response loop, digest verification)
- **`provenance.ts`** — Build provenance, artifact caching, cell fingerprinting
- **`provenance-defaults.ts`** — Shared provenance defaults merging
- **`process.ts`** — Subprocess runner with timeouts and output limits
- **`process-registry.ts`** — Tracks spawned child processes; `killAll()` ensures cleanup on exit/interrupt
- **`pool.ts`** — Bounded-concurrency semaphore (`runPool`) used for parallel build and execution
- **`env.ts`** — Spawn environment (PATH normalization, Node binary resolution)
- **`runner-cache.ts`** — In-memory file/dataset read and hash cache
- **`timing.ts`** — Bootstrap median confidence intervals, adaptive stopping
- **`mutations.ts`** — Dataset mutation expansion and content generation
- **`metrics.ts`** — Registry for available metrics (kernelTime, iterationTime)
- **`jdk.ts`** — JDK discovery (JAVA_HOME, PATH resolution)
- **`minimal-workers.ts`** — Minimal worker builds for protocol conformance testing
- **`protocol-conformance.ts`** — Language manifest validation and harness diagnostics

Subdirectories under `src/` (`commands/`, `discovery/`, `execution/`, `metrics/`, `reporting/`, `results/`) are empty placeholders reserved for a future split; do not treat them as active modules.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

**Parallel execution**: A `--parallel` flag overrides the config's default parallelism (`config.execution.parallelism`). When `--parallel` is set, concurrency is set to `os.cpus().length` (all logical cores). Under the hood, `runPool()` from `pool.ts` provides a bounded-concurrency semaphore that runs a user-supplied async function over an array of items while keeping at most `concurrency` in-flight promises.

**Dataset mutations**: Four benchmarks (shortest-path, word-frequency, record-sorting, matrix-multiplication) define multiple dataset variants per size called **mutations**. The `mutations.ts` module handles expanding size configs into cells via `expandSizeCells()`, generating mutation-aware cell keys (`benchmark/size/mutation/language`), and generating dataset content for each variant. Non-mutation benchmarks (nbody, aggregation, barrier-wave) keep a single dataset per size.

**Results summary**: `arena results summary` reads `results/current.json`, filters by `--language`, `--benchmark`, `--size`, and `--mutation`, then prints an ANSI-colored box-drawing table with benchmark, language, correctness, median kernel time, and relative-speed columns. Fastest entries are marked with a green ★. Color is auto-detected from TTY and suppressed with `NO_COLOR`.

**Snapshot fields**: Result snapshots include:
- `arenaVersion: "0.2.0"` — hardcoded in the CLI. Root/`cli` npm `package.json` may still say `0.1.0`; treat the snapshot field as the arena protocol version for results.
- `schemaVersion: "4.0.0"` — snapshot data model version. The schema accepts any `^\d+\.\d+\.\d+$` value; see [schemas.md](../reference/schemas.md) for the data model evolution table.
- `scoringModel` — one of `"legacy-versatility-v1"` (default, 85% speed / 15% versatility) or `"efficiency-v1"` (85% speed / 15% efficiency, used when all resource profiles have four comparable measurements). The web UI's `scoring.ts` reads this field to select the overall score formula.

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `kernelTime` | Available | Measured inside the persistent benchmark process |
| `iterationTime` | Available | Wall-clock iteration time measured by the harness |

## Local Caches

| Cache | Purpose |
|-------|---------|
| `.arena/go-build-cache/` | Go `GOCACHE` for language builds |
| `.arena/go-checker-cache/` | Go `GOCACHE` for checker compilation (`build-checker.mjs`) |
| `.arena/go-test-cache/` | Go `GOCACHE` for checker test runs (`test-checker.mjs`) |
| `.arena/build-cache/<fingerprint>/` | Generic build-artifact cache — stores compiled binaries keyed by a SHA-256 fingerprint of the language manifest, implementation directory, and build config (`buildFingerprint()` at line ~409) |
| `.arena/runs/<snapshotId>/` | Per-run scratch directories; deleted after a run unless `--preserve-temp` is set |

The `RunnerCache` class (`src/runner-cache.ts`) provides in-memory caching for file reads, SHA-256 hashes, and directory-tree hashing during fingerprint computation, avoiding redundant disk I/O when multiple benchmarks share the same language or checker files. It is instantiated per `arena run` invocation and passed to `fingerprintCell()` and `buildFingerprint()`. Datasets are staged as read-only copies via `stageIsolatedDatasets()` to prevent accidental mutation during execution.
