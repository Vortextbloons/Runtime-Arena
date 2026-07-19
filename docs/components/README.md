# Components

Runtime Arena consists of six main components.

## CLI (`cli/`)

TypeScript command-line tool (`arena`) — the primary entry point. Handles discovery, building, execution, validation, and result storage. Commands: `doctor`, `list`, `build`, `run`, `check`, `dataset`, `results`, `web`.

Source: `cli/src/index.ts` (565 lines, monolithic)

## Checker (`checker/`)

Independent Go program that validates benchmark output correctness. Re-implements the same algorithms as implementations to ensure no shared code masks bugs. Exit codes: 0=accepted, 1=wrong-answer, 2=malformed-output, 3=unsupported-version, 4=other.

Source: `checker/cmd/arena-checker/main.go`

## Benchmarks (`benchmarks/`)

Three benchmark workloads, each with datasets and implementations in all four languages:

| Benchmark | Workload | Key Metrics |
|---|---|---|
| **nbody** | Gravitational N-body simulation | Numeric computation, tight loops |
| **shortest-path** | Weighted directed graph shortest-path | Priority queues, memory access |
| **aggregation** | CSV transaction record aggregation | Parsing, hash maps, sorting |

Each has `small`, `medium`, and `large` datasets with different warmup/iteration counts.

## Languages (`languages/`)

JSON manifests defining how to detect, build, and run each language: `rust.json`, `go.json`, `typescript.json`, `python.json`. All accept `--input <file> --output <file>`.

## Schemas (`schemas/`)

JSON Schema definitions for validation:

| Schema | Validates |
|---|---|
| `benchmark.schema.json` | Benchmark manifests |
| `language.schema.json` | Language manifests |
| `result.schema.json` | Result snapshots |
| `implementation-output.schema.json` | Implementation output shapes |

## Web (`web/`)

SvelteKit static dashboard for viewing results. Loads `results/current.json`, computes scores, and displays charts and scorecards. Built with adapter-static for deployment anywhere.
