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

See [commands.md](commands.md) for the full CLI usage guide.

`--language` / `-l` and `--benchmark` / `-b` are repeatable (not comma-separated):

```bash
npm run arena -- run --language go --language python --benchmark barrier-wave
```

Omitting `--size` runs every default size the benchmark defines.

## Measurement defaults

Adaptive measurement is configured in `arena.config.json`:

```json
"measurement": {
  "minMeasuredIterations": 10,
  "maxMeasuredIterations": 30,
  "targetRelativeConfidenceInterval": 0.05
}
```

Under measurement contract **2.0.0**, the harness owns the clock. It launches one persistent worker per cell, drives warmup and measured iterations over stdin/stdout, and records **median iteration time** (nanoseconds). Adaptive stopping uses a deterministic bootstrap 95% confidence interval for the median; pass `--iterations <n>` for fixed-count mode (used in tests).

Language manifests pass `--input`, `--output`, and `--protocol-version` to implementations — not timing flags. See [execution model](../architecture/execution-model.md) for the protocol.

After `arena run`, refresh the web UI with `npm run prepare-results` (or `npm run build:web`, which runs it automatically). Only rows with measurement contract **2.0.0** are ranked in the web UI and scorecards.

## First full run

A full `arena run --force` can sit quiet for a while before per-cell lines appear:

1. **Planning** — fingerprints and build provenance for every selected cell (no progress output until the `Plan:` line).
2. **Building** — compiles each benchmark/language pair (only failures are logged).
3. **Running** — one line per cell as it completes (default parallelism is `2` in `arena.config.json`; use `--parallel` for more).

This is expected on a cold run with hundreds of cells.

## Project Structure

```
cli/                    # TypeScript CLI (arena command)
  src/index.ts          # Main CLI logic
  src/protocol.ts       # Harness protocol runner (contract 2.0.0)
  src/provenance.ts     # Build provenance and artifact cache
  src/timing.ts         # Adaptive median CI helpers
  src/process.ts        # Child process spawning
  src/env.ts            # Windows-safe spawn env/command resolution
  src/metrics.ts        # Metric registry
  test/protocol.test.ts # Protocol contract tests
  test/cli.test.ts      # Integration tests
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
