# Components

Runtime Arena consists of six main components.

## CLI (`cli/`)

TypeScript command-line tool (`arena`) — the primary entry point. Handles discovery, building, execution, validation, and result storage. Commands: `doctor`, `list`, `build`, `run`, `check`, `dataset`, `results`, `web`.

Source: `cli/src/index.ts` with modules for `metrics.ts` and `timing.ts`. Details: [cli.md](cli.md).

## Checker (`checker/`)

Independent Go program that validates benchmark output correctness. Re-implements the same algorithms as implementations to ensure no shared code masks bugs. Exit codes: 0=accepted, 1=wrong-answer, 2=malformed-output, 3=unsupported-version, 4=other.

Source: `checker/cmd/arena-checker/main.go`. Details: [checker.md](checker.md).

## Benchmarks (`benchmarks/`)

Four workloads under `benchmarks/<id>/`. Three are fully implemented in all five languages; barrier-wave is checker-ready with implementations in progress.

| Benchmark | Workload | Key Metrics | Status |
|---|---|---|---|
| **nbody** | Gravitational N-body simulation | Numeric computation, tight loops | Complete |
| **shortest-path** | Weighted directed graph shortest-path | Priority queues, memory access | Complete |
| **aggregation** | CSV transaction record aggregation | Parsing, hash maps, sorting | Complete |
| **barrier-wave** | Parallel phases with barriers | Fan-out/fan-in, synchronization | WIP implementations |

Each has `small`, `medium`, and `large` datasets with per-size warmup/iteration counts in `benchmark.json`. Full reference: [benchmarks.md](../reference/benchmarks.md).

## Languages (`languages/`)

JSON manifests defining how to detect, build, and run each language: `rust.json`, `go.json`, `typescript.json`, `python.json`, `lua.json`. Run argument templates must include `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations` (persistent-worker contract).

Detect/build/run commands may use machine-local absolute paths (the LuaJIT manifest often does on Windows). Prefer portable commands when possible; absolute paths are valid when the toolchain is not on `PATH`.

## Schemas (`schemas/`)

JSON Schema definitions for validation:

| Schema | Validates |
|---|---|
| `benchmark.schema.json` | Benchmark manifests |
| `language.schema.json` | Language manifests |
| `result.schema.json` | Result snapshots |
| `implementation-output.schema.json` | Implementation output shapes (nbody, shortest-path, aggregation; barrier-wave not yet branched) |

## Web (`web/`)

SvelteKit static dashboard for viewing results. Loads `results/current.json`, computes scores, and displays charts and 2K-style scorecards. Built with adapter-static for deployment anywhere. Scorecard design system: [scorecards.md](scorecards.md). Overview: [web.md](web.md).
