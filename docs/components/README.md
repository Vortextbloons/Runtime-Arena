# Components

Runtime Arena consists of six main components.

## CLI (`cli/`)

TypeScript command-line tool (`arena`) — the primary entry point. Handles discovery, building, execution, validation, and result storage. Commands: `doctor`, `list`, `build`, `run`, `check`, `dataset`, `results`, `web`.

Source: `cli/src/index.ts` with modules for `metrics.ts`, `timing.ts`, `mutations.ts`, `jdk.ts`, and `runner-cache.ts`. Details: [cli.md](cli.md).

## Checker (`checker/`)

Independent Go program that validates benchmark output correctness. Re-implements the same algorithms as implementations to ensure no shared code masks bugs. Exit codes: 0=accepted, 1=wrong-answer, 2=malformed-output, 3=unsupported-version, 4=checker-error.

Source: `checker/cmd/arena-checker/main.go`. Details: [checker.md](checker.md).

## Benchmarks (`benchmarks/`)

Seven workloads under `benchmarks/<id>/`. nbody, shortest-path, and aggregation are the original trio, fully implemented in all 11 languages. barrier-wave has implementations in Rust, Go, TypeScript, Python, JavaScript, C++, Java, C, and C# (LuaJIT and lua-interpreted excluded). word-frequency, record-sorting, and matrix-multiplication are newer additions.

| Benchmark | Workload | Key Metrics | Status |
|-----------|---|---|---|
| **nbody** | Gravitational N-body simulation | Numeric computation, tight loops | Complete |
| **shortest-path** | Weighted directed graph shortest-path | Priority queues, memory access | Complete |
| **aggregation** | In-memory CSV transaction aggregation | Hash maps, sorting | Complete |
| **barrier-wave** | Parallel phases with barriers | Fan-out/fan-in, synchronization | 9/11 languages complete; LuaJIT and lua-interpreted excluded |
| **word-frequency** | Word count and frequency sort | Hash maps, sorting, checksum | Complete |
| **record-sorting** | Multi-key record sorting | Tie-breaking sort, checksum | Complete |
| **matrix-multiplication** | Matrix multiply (i→j→k) | Triple-loop arithmetic, checksum | Complete |

Each has `small`, `medium`, and `large` datasets with per-size warmup/iteration counts in `benchmark.json`. Full reference: [benchmarks.md](../reference/benchmarks.md).

## Languages (`languages/`)

JSON manifests defining how to detect, build, and run each language: `rust.json`, `go.json`, `java.json`, `typescript.json`, `python.json`, `lua.json`, `lua-interpreted.json`, `cpp.json`, `c.json`, `c-sharp.json`, and `javascript.json`. Run argument templates must include `--input`, `--output`, `--timing-output`, `--warmup`, `--min-iterations`, `--max-iterations`, and `--target-relative-ci` (persistent-worker contract).

Detect/build/run commands may use machine-local absolute paths (the LuaJIT manifest often does on Windows). Prefer portable commands when possible; absolute paths are valid when the toolchain is not on `PATH`.

## Schemas (`schemas/`)

JSON Schema definitions for validation:

| Schema | Validates |
|---|---|
| `benchmark.schema.json` | Benchmark manifests |
| `language.schema.json` | Language manifests |
| `result.schema.json` | Result snapshots |
| `implementation-output.schema.json` | Implementation output shapes (nbody, shortest-path, aggregation, word-frequency, record-sorting, matrix-multiplication; barrier-wave not yet branched) |

## Web (`web/`)

SvelteKit static dashboard for viewing results. Loads `results/current.json`, computes scores (75% geometric-mean speed / 25% flexibility), and displays charts and 2K-style scorecards with attribute meters, badges, division ranks, and takeovers. Built with adapter-static for deployment anywhere. Scorecard design system: [scorecards.md](scorecards.md). Overview: [web.md](web.md).
