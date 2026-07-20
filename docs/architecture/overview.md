# Architecture Overview

Runtime Arena is a cross-language benchmarking system that runs equivalent workloads in Rust, Go, TypeScript, Java, Python, LuaJIT, Lua 5.4 (Interpreted), C++, C, C#, and JavaScript (Node.js), validates their output, records metrics, and stores immutable JSON results.

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

**Persistent-worker mode**: Each (benchmark, size, mutation, language) cell runs in one process. The CLI passes `--input`, `--output`, `--timing-output`, `--warmup`, `--min-iterations`, `--max-iterations`, and `--target-relative-ci`; the implementation discards warmup work and records only measured kernel samples via `--timing-output`. Full contract: [execution-model.md](execution-model.md).

**Fingerprinting**: A SHA-256 hash of all source files, manifests, datasets, checker code, toolchain version, and compiler version determines if a cell is "current" or "stale". `arena run` only re-executes cells whose fingerprint has changed.

**Build caching**: A separate `buildFingerprint()` hashes language manifest + implementation source tree + benchmark ID + build config. Compiled artifacts are stored in `.arena/build-cache/<fingerprint>/` and reused if the hash matches, skipping the language build step entirely.

**Atomic writes**: Results are written to a temp file then renamed. All cell results — including build failures and checker rejections — replace the previous entry in the canonical snapshot, so a cell that was previously accepted but now fails will be recorded as failed. A cell remains `current` as long as its fingerprint matches; use `--force` to re-run a failing cell.

## Data Flow

1. CLI discovers language manifests from `languages/*.json`
2. CLI discovers benchmark manifests from `benchmarks/*/benchmark.json`
3. For each (benchmark, size, mutation, language) cell:
   - Build the implementation using language-specific commands (cached via `.arena/build-cache/<buildFingerprint>/`)
   - Copy the dataset input to an isolated directory under `.arena/runs/` and make it read-only (`chmod 0o444`)
   - Spawn one persistent worker with `--input`, `--output`, `--timing-output`, `--warmup`, `--min-iterations`, `--max-iterations`, and `--target-relative-ci`
   - Check output size against `maxOutputBytes` limit before invoking the checker
   - Validate output with the Go checker via `checkOutput()`
   - Parse and validate timing samples via `readTimingSamples()` (checks 1-indexed sequential iteration, safe integers, count within measurement policy bounds)
   - Record metric availability via `metricAvailability()`
   - Record result with provenance (fingerprint, machine info)
   - Validate the full snapshot against `result.schema.json` before writing
4. Write canonical snapshot to `results/current.json`
5. Web UI loads snapshot and computes scores

