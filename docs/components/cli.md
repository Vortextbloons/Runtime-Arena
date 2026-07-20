# CLI Component

The CLI (`cli/`) is the primary entry point — a TypeScript command-line tool that orchestrates discovery, building, execution, validation, and result storage.

## Structure

```
cli/
  package.json          # @runtime-arena/cli, type: module, bin: arena
  tsconfig.json         # ES2024, NodeNext, strict
  src/
    index.ts                        # Main CLI logic (commands, discovery, run, fingerprints)
    metrics.ts                      # Metric registry (kernelTime)
    timing.ts                       # Timing sample reader
    timing.test.ts                  # Timing sample tests
    mutations.ts                    # Dataset mutation expansion and cell-key logic
    mutations.test.ts               # Mutation tests
    jdk.ts                          # JDK discovery (Java home, PATH resolution)
    runner-cache.ts                 # RunnerCache class (file/dataset caching for fingerprinting)
    runner-cache.test.ts            # RunnerCache tests

  test/
    cli.test.ts                     # Integration tests
  dist/                             # Compiled output
```

`timing.test.ts` lives at `cli/src/timing.test.ts` (next to `timing.ts`).

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Mostly monolithic today**: Runtime behavior lives in `index.ts` with helpers in `metrics.ts`, `timing.ts`, and `mutations.ts`. Subdirectories under `src/` are empty placeholders reserved for a future split; do not treat them as active modules.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

**Parallel execution**: A `--parallel` flag overrides the config's default parallelism (`config.execution.parallelism`). When `--parallel` is set, concurrency is set to `os.cpus().length` (all logical cores). Under the hood, `pool()` (line ~390 of `index.ts`) provides a bounded-concurrency semaphore — it runs a user-supplied async function over an array of items while keeping at most `concurrency` in-flight promises.

**Dataset mutations**: Four benchmarks (shortest-path, word-frequency, record-sorting, matrix-multiplication) define multiple dataset variants per size called **mutations**. The `mutations.ts` module handles expanding size configs into cells via `expandSizeCells()`, generating mutation-aware cell keys (`benchmark/size/mutation/language`), and generating dataset content for each variant. Non-mutation benchmarks (nbody, aggregation, barrier-wave) keep a single dataset per size.

**Results summary**: `arena results summary` reads `results/current.json`, filters by `--language`, `--benchmark`, `--size`, and `--mutation`, then prints an ANSI-colored box-drawing table with benchmark, language, correctness, median kernel time, and relative-speed columns. Fastest entries are marked with a green ★. Color is auto-detected from TTY and suppressed with `NO_COLOR`.

**Version string**: Result snapshots write `arenaVersion: "0.2.0"` (hardcoded in the CLI). Root/`cli` npm `package.json` may still say `0.1.0` — treat the snapshot field as the arena protocol version for results.

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `kernelTime` | Available | Measured inside the persistent benchmark process |

## Local Caches

| Cache | Purpose |
|-------|---------|
| `.arena/go-build-cache/` | Go `GOCACHE` for language builds |
| `.arena/go-checker-cache/` | Go `GOCACHE` for checker compilation (`build-checker.mjs`) |
| `.arena/go-test-cache/` | Go `GOCACHE` for checker test runs (`test-checker.mjs`) |
| `.arena/build-cache/<fingerprint>/` | Generic build-artifact cache — stores compiled binaries keyed by a SHA-256 fingerprint of the language manifest, implementation directory, and build config (`buildFingerprint()` at line ~409) |
| `.arena/runs/<snapshotId>/` | Per-run scratch directories; deleted after a run unless `--preserve-temp` is set |

The `RunnerCache` class (`src/runner-cache.ts`) provides in-memory caching for file reads, SHA-256 hashes, and directory-tree hashing during fingerprint computation, avoiding redundant disk I/O when multiple benchmarks share the same language or checker files. It is instantiated per `arena run` invocation and passed to `fingerprintCell()` and `buildFingerprint()`. Datasets are staged as read-only copies via `stageIsolatedDatasets()` to prevent accidental mutation during execution.
