# Architecture Overview

Runtime Arena is a cross-language benchmarking system that runs equivalent workloads in Rust, Go, TypeScript, Python, Lua (LuaJIT), C++, and JavaScript (Node.js), validates their output, records metrics, and stores immutable JSON results.

## System Components

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  CLI (TS)   │────▶│  Languages  │────▶│ Implementations │
│  arena      │     │  manifests  │     │ (per language)  │
└──────┬──────┘     └─────────────┘     └─────────────────┘
       │
       │ runs
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Checker    │◀────│  Results    │────▶│   Web UI    │
│  (Go)       │     │  (JSON)     │     │  (SvelteKit)│
└─────────────┘     └─────────────┘     └─────────────┘
```

## Trust Boundaries

The **checker** is intentionally written in Go and independent from the TypeScript CLI. It re-implements the same algorithms to verify correctness, ensuring no shared code could mask bugs. The checker performs strict JSON parsing (rejecting duplicate keys, unknown fields, and trailing content) and validates results against expected outputs.

## Execution Model

**Persistent-worker mode**: Each (benchmark, size, language) cell runs in one process. The CLI passes `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations`; the implementation discards warmup work and records only measured kernel samples via `--timing-output`. Full contract: [execution-model.md](execution-model.md).

**Fingerprinting**: A SHA-256 hash of all source files, manifests, datasets, checker code, toolchain version, and compiler version determines if a cell is "current" or "stale". `arena run` only re-executes cells whose fingerprint has changed.

**Atomic writes**: Results are written to a temp file then renamed. Failed checker results do not replace existing accepted results in the canonical snapshot.

## Data Flow

1. CLI discovers language manifests from `languages/*.json`
2. CLI discovers benchmark manifests from `benchmarks/*/benchmark.json`
3. For each (benchmark, size, language) cell:
   - Build the implementation using language-specific commands
   - Spawn one persistent worker with `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations`
   - Read kernel timing samples from the timing file (warmups already discarded by the worker)
   - Validate output with the Go checker
   - Record result with provenance (fingerprint, machine info)
4. Write canonical snapshot to `results/current.json`
5. Web UI loads snapshot and computes scores

## Scoring Algorithm

- **Performance (speed)**: Per size tier: `fastest median / language median × 100`, clamped 0–100. Per benchmark: geometric mean across eligible sizes. Overall: geometric mean across completed benchmarks.
- **Consistency**: `100 − 4 × CV%` (CV = standard deviation / mean of kernel samples). Clamped 0–100, averaged across sizes then benchmarks. Contributes 10% to the overall score.
- **Scalability**: `(minPerformance / maxPerformance) × 100` across size tiers per benchmark. Clamped 0–100, averaged across benchmarks. Contributes 10% to the overall score.
- **Weighted overall**: `0.8 × performance + 0.1 × consistency + 0.1 × scalability`, clamped 0–100. This is the leaderboard ranking score.
- **Timing floor**: A size tier is excluded for all languages when its fastest valid median is below 1 ms.
- **Skip handling**: Omitting a benchmark (no result, or rejected by the checker) does not zero the overall — only completed benchmarks contribute.
