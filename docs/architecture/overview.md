# Architecture Overview

Runtime Arena is a cross-language benchmarking system that runs equivalent workloads in Rust, Go, TypeScript, Python, and Lua (LuaJIT), validates their output, records metrics, and stores immutable JSON results.

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

**Cold-process mode**: Each benchmark iteration spawns a fresh process. Warmup iterations are discarded; only measured iterations count. This prevents JIT warmup persistence from skewing results.

**Fingerprinting**: A SHA-256 hash of all source files, manifests, datasets, checker code, toolchain version, and compiler version determines if a cell is "current" or "stale". `arena run` only re-executes cells whose fingerprint has changed.

**Atomic writes**: Results are written to a temp file then renamed. Failed checker results do not replace existing accepted results in the canonical snapshot.

## Data Flow

1. CLI discovers language manifests from `languages/*.json`
2. CLI discovers benchmark manifests from `benchmarks/*/benchmark.json`
3. For each (benchmark, size, language) cell:
   - Build the implementation using language-specific commands
   - Run warmup iterations (discarded)
   - Run measured iterations, capturing wall time
   - Validate output with the Go checker
   - Record result with provenance (fingerprint, machine info)
4. Write canonical snapshot to `results/current.json`
5. Web UI loads snapshot and computes scores

## Scoring Algorithm

- **Overall speed**: Geometric mean of `fastest median / language median` across eligible sizes and benchmarks
- **Timing floor**: A size tier is excluded for all languages when its fastest valid median is below 1 ms
- **Consistency**: Reported separately from coefficient of variation; it does not affect rank
- **Scalability**: Reported separately from relative performance retention; it does not affect rank
