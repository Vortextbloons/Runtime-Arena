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


