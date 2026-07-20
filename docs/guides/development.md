# Development Guide

## Prerequisites

- Node.js >= 26.4.0
- npm >= 11.17.0
- Go >= 1.26 (for checker)
- Rust >= 1.97 (for Rust implementations)
- Python >= 3.8 (for Python implementations)
- LuaJIT and Lua 5.4 (for Lua implementations: `lua` and `lua-interpreted` manifests)
- g++ (with C++23 support, for C++ implementations)
- JDK 17+ with `javac`/`jar`/`java` (for Java implementations; discovered via `JAVA_HOME`, `PATH`, or common install paths)
- .NET SDK 10+ (for C# implementations)
- Node.js (for JavaScript implementations, see workspace Node requirement)

## Setup

```bash
npm install
npm run build:cli
npm run build:checker
```

`arena run` and `arena check` require the checker binary at `bin/arena-checker[.exe]`. `npm test` builds it automatically; for manual runs, use `npm run build:checker` or confirm with `npm run arena -- doctor`.

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run build:cli` | Build the TypeScript CLI |
| `npm run build:checker` | Build the Go checker binary |
| `npm run build:web` | Build the web UI (includes result prep) |
| `npm test` | Run all tests (CLI, web, checker) |
| `npm run check --workspace=@runtime-arena/web` | Run TypeScript type checking on web |
| `npm run dev` | Start web dev server |
| `npm run prepare-results` | Copy `results/current.json` into `web/static/results/` for the dev UI |
| `npm run arena -- doctor` (or `npm run doctor`) | Check environment health |
| `npm run arena -- run` | Run benchmarks |
| `npm run arena -- results summary` | Table view of `results/current.json` |
| `npm run combine-docs` | Regenerate docs/ALL.md |
| `npm run scorecard` | Generate the scorecard markdown snapshot at `docs/scorecard.md` |
| `npm run update-readme-results` | Update the README results table from `results/current.json` |

See [commands.md](commands.md) for the full CLI usage guide.

`--language` / `-l` and `--benchmark` / `-b` are repeatable (not comma-separated):

```bash
npm run arena -- run --language go --language python --benchmark barrier-wave
```

Omitting `--size` runs every default size the benchmark defines.

## Measurement defaults

Adaptive measurement is configured in [`arena.config.json`](../reference/configuration.md) via `minMeasuredIterations` (10), `maxMeasuredIterations` (30), and `targetRelativeConfidenceInterval` (0.05). Under measurement contract **2.0.0** the harness owns the clock — pass `--iterations <n>` to override with fixed-count mode. See [execution model](../architecture/execution-model.md) for the full protocol, contract, and timing details.

## First full run

A full `arena run --force` can sit quiet for a while before per-cell lines appear:

1. **Planning** — fingerprints and build provenance for every selected cell (no progress output until the `Plan:` line).
2. **Building** — compiles each benchmark/language pair (only failures are logged).
3. **Running** — one line per cell as it completes (default parallelism is `2` in `arena.config.json`; use `--parallel` for more).

This is expected on a cold run with hundreds of cells.

## Fingerprinting in Development

The fingerprinting system determines which benchmark cells need re-execution. During iterative development, only cells whose fingerprint has changed are re-run — unchanged cells are marked `current` and skipped. This makes repeated `arena run` fast after the first full run.

To see which cells would be re-run (or are stale):

```bash
npm run arena -- results status
```

This prints each cell's status (`current`, `stale`, `missing`, or `unavailable`) so you can verify you're not accidentally skipping cells you expected to run.

**When to use `--force`:** The `--force` flag re-runs every selected cell regardless of its fingerprint. Use it when:
- You changed something that the fingerprint doesn't capture (e.g., an environment variable, a dynamic dependency, system-wide config)
- You want to verify no regression after a toolchain update
- The checker output differs between runs despite identical source (rare — hints at a non-deterministic implementation or unhashed input)

**What goes into a fingerprint:** The execution fingerprint is a SHA-256 hash of (see [fingerprinting](../architecture/fingerprinting.md) for the complete list):

- Language manifest — `languages/<language>.json`
- Benchmark manifest — `benchmarks/<benchmark>/benchmark.json`
- Dataset — the size-specific input file
- All implementation source files
- All checker source files
- Configuration metadata (contract version, measurement policy, metrics, toolchain versions)
- Build provenance hash (compiler version, flags, resolved executables, etc.)

**Build cache:** Compiled artifacts live under `.arena/build-cache/<buildFingerprint>/`. Each entry includes an atomic `manifest.json` with provenance details and artifact SHA-256. Clearing `.arena/build-cache/` forces every cell to rebuild from scratch.

**RunnerCache:** During a single `arena run`, an in-memory `RunnerCache` memoizes file reads and SHA-256 hashes across all cells. This avoids redundant disk I/O and hashing when the same files (benchmark manifests, datasets, implementation trees) appear in multiple fingerprints. Tree hashing skips common generated-directory patterns (`node_modules`, `target`, `dist`, `build`, `__pycache__`, `.arena`) and binary artifacts (`.exe`, `.pyc`).

**Practical tips for fast iteration:**
- Filter by `--language` and `--benchmark` to narrow the run to the cells you're actively changing
- Omit `--size` to run all sizes a benchmark defines — this gives you a complete picture without extra flags
- Run `arena results status` first to confirm which cells are stale before committing to a full run

## Project Structure

```
cli/                    # TypeScript CLI (arena command)
  src/
    index.ts            # Main CLI logic & entry point
    protocol.ts         # Harness protocol runner (contract 2.0.0)
    provenance.ts       # Build provenance and artifact cache
    provenance-defaults.ts  # Merges language defaults from provenance.defaults.json
    protocol-conformance.ts # Protocol conformance test runner (arena protocol test)
    minimal-workers.ts  # Minimal worker setup for protocol testing
    timing.ts           # Adaptive median CI helpers
    process.ts          # Child process spawning
    env.ts              # Windows-safe spawn env/command resolution
    metrics.ts          # Metric registry
    mutations.ts        # Mutation benchmark cell expansion & generators
    runner-cache.ts     # File-level cache for fingerprints & datasets
    jdk.ts              # JDK tool resolution (JAVA_HOME, PATH, etc.)
    commands/           # Future command modules (`.gitkeep`)
    discovery/          # Future discovery modules (`.gitkeep`)
    execution/          # Future execution modules (`.gitkeep`)
    metrics/            # Future metric collectors (`.gitkeep`)
    reporting/          # Future reporting modules (`.gitkeep`)
    results/            # Future results modules (`.gitkeep`)
    timing.test.ts      # Adaptive median CI tests
    provenance.test.ts  # Provenance cache tests
    provenance-defaults.test.ts  # Provenance defaults resolution tests
    protocol-conformance.test.ts # Protocol conformance test
    mutations.test.ts   # Mutation cell expansion tests
    runner-cache.test.ts # RunnerCache tests
  test/
    cli.test.ts         # Integration tests
    protocol.test.ts    # Protocol contract tests
    fixtures/           # Test fixture files
checker/                # Independent Go checker
  cmd/arena-checker/main.go
benchmarks/             # Workloads, datasets, implementations
  nbody/
  shortest-path/
  aggregation/
  barrier-wave/         # Rust/Go/TS/Python/JS/C++/Java/C/C# (LuaJIT and lua-interpreted unavailable — no native threading)
  word-frequency/
  record-sorting/
  matrix-multiplication/
languages/              # Language manifests (c, c-sharp, cpp, go, java, javascript, lua, lua-interpreted, python, rust, typescript)
schemas/                # JSON Schema definitions
results/                # Canonical result snapshots
web/                    # SvelteKit dashboard
scripts/                # Build and utility scripts (build-csharp.mjs, build-java.mjs, build-checker.mjs, …)
docs/                   # Canonical project documentation
```

Canonical docs live under `docs/`. Start at [`docs/INDEX.md`](../INDEX.md).

## Adding a Benchmark

See [guides/adding-a-benchmark.md](adding-a-benchmark.md).

## Adding a Language

See [guides/adding-a-language.md](adding-a-language.md).

## Conventions

- Each implementation must produce the same output for the same input
  (validated by the checker). Use each language's best idioms and data
  structures internally — no need to mirror structure from other implementations.
- Keep datasets deterministic (committed fixtures with SHA-256 hashes)
- Do not manually edit generated result files (`results/current.json`)
- The checker must be independent from the CLI (no shared code)
- Implementations must honor the harness-timed persistent worker contract:
  `--input`, `--output`, `--protocol-version 2.0.0`, and the stdin/stdout
  protocol described in [execution model](../architecture/execution-model.md)
- Compiled artifacts belong under `.arena/`, `target/`, `dist/`, or similar —
  not over source files. Interpreted languages (JavaScript, Python, Lua) use
  source paths as artifacts; the build cache verifies hashes without copying
  over live source.
