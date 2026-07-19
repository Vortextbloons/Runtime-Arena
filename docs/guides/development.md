# Development Guide

## Prerequisites

- Node.js >= 26.4.0
- npm >= 11.17.0
- Go >= 1.26 (for checker)
- Rust >= 1.97 (for Rust implementations)
- Python >= 3.8 (for Python implementations)
- LuaJIT (for Lua implementations)

## Setup

```bash
npm install
npm run build:cli
npm run build:checker
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run build:cli` | Build the TypeScript CLI |
| `npm run build:checker` | Build the Go checker binary |
| `npm run build:web` | Build the web UI (includes result prep) |
| `npm test` | Run all tests (CLI, web, checker) |
| `npm run check --workspace=@runtime-arena/web` | Run TypeScript type checking on web |
| `npm run dev` | Start web dev server |
| `npm run arena -- doctor` | Check environment health |
| `npm run arena -- run` | Run benchmarks |
| `npm run arena -- results summary` | Table view of `results/current.json` |
| `npm run combine-docs` | Regenerate docs/ALL.md |

See [commands.md](commands.md) for the full CLI usage guide.

`--language` / `-l` and `--benchmark` / `-b` are repeatable (not comma-separated):

```bash
npm run arena -- run --language go --language python --benchmark barrier-wave
```

Omitting `--size` runs every default size the benchmark defines.

## Project Structure

```
cli/                    # TypeScript CLI (arena command)
  src/index.ts          # Main CLI logic (monolithic today)
  src/metrics.ts        # Metric registry
  src/timing.ts         # Timing sample reader
  src/timing.test.ts    # Timing unit tests
  test/cli.test.ts      # Integration tests
checker/                # Independent Go checker
  cmd/arena-checker/main.go
benchmarks/             # Workloads, datasets, implementations
  nbody/
  shortest-path/
  aggregation/
  barrier-wave/         # Rust/Go/TS/Python; LuaJIT marked unavailable
languages/              # Language manifests (rust, go, typescript, python, lua)
schemas/                # JSON Schema definitions
results/                # Canonical result snapshots
web/                    # SvelteKit dashboard
scripts/                # Build and utility scripts
docs/                   # Canonical project documentation
```

Canonical docs live under `docs/`. Start at [`docs/INDEX.md`](../INDEX.md).

## Adding a Benchmark

See [guides/adding-a-benchmark.md](adding-a-benchmark.md).

## Adding a Language

See [guides/adding-a-language.md](adding-a-language.md).

## Testing

```bash
npm test
```

This runs:
1. CLI integration tests (`cli/test/cli.test.ts`)
2. Web unit tests (`web/src/lib/scoring.test.ts`, `web/src/lib/tiers.test.ts`)
3. Checker unit tests (`checker/cmd/arena-checker/main_test.go` via `scripts/test-checker.mjs`)

## Conventions

- Each implementation must produce the same output for the same input
  (validated by the checker). Use each language's best idioms and data
  structures internally — no need to mirror structure from other implementations.
- Keep datasets deterministic (committed fixtures with SHA-256 hashes)
- Do not manually edit generated result files (`results/current.json`)
- The checker must be independent from the CLI (no shared code)
- All implementations must accept `--input <file> --output <file> --timing-output <file> --warmup <n> --iterations <n>`
