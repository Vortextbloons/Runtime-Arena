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

**Harness-timed persistent-worker mode**: Each (benchmark, size, mutation, language) cell runs in one process that communicates with the CLI over stdin/stdout NDJSON. The worker receives `--input`, `--output`, and `--protocol-version` as CLI args (defined per language manifest), emits a `ready` message, then responds to `run` and `finish` requests with digests. The CLI harness owns the clock, drives iterations, and adaptively stops when the 95% bootstrap confidence interval for median iteration time is within the target relative width. Full contract: [execution-model.md](execution-model.md).

**Fingerprinting**: A SHA-256 hash of all source files, manifests, datasets, checker code, toolchain version, and compiler version determines if a cell is "current" or "stale". A `RunnerCache` instance memoizes file reads and SHA-256 hashes across all cells to avoid redundant I/O. `arena run` only re-executes cells whose fingerprint has changed.

**Build caching**: A separate `collectBuildProvenance()` hashes language manifest + implementation source tree + benchmark ID + build config to produce a build fingerprint. Compiled artifacts are stored in `.arena/build-cache/<buildFingerprint>/` and reused if the hash matches, skipping the language build step entirely.

**Atomic writes**: Results are written to a temp file then renamed via `atomicJson()`. All cell results — including build failures and checker rejections — replace the previous entry in the canonical snapshot, so a cell that was previously accepted but now fails will be recorded as failed. A cell remains `current` as long as its fingerprint and measurement contract version both match; use `--force` to re-run a cell.

**Legacy timing**: Measurement contract 1.x used a separate `--timing-output` sidecar file and `readTimingSamples()`. Contract 2.0.0 replaces both with harness-timed measurement via the stdin/stdout protocol, making the sidecar file obsolete. Legacy result rows remain readable in snapshots but are marked stale until rerun under 2.0.0.

## Data Flow

1. CLI discovers language manifests from `languages/*.json`
2. CLI discovers benchmark manifests from `benchmarks/*/benchmark.json`
3. For each (benchmark, size, mutation, language) cell:
   - Compute the **build fingerprint** via `collectBuildProvenance()`, which hashes the language manifest, implementation tree, declared external inputs, resolved executables, compiler/runtime versions, target triple, and environment allowlist
   - Compute the **execution fingerprint** via `fingerprintCell()`, which hashes the language manifest, benchmark manifest, dataset, implementation tree, checker tree, and CLI source modules (`metrics.ts`, `protocol.ts`, `timing.ts`), along with metadata and the build fingerprint; a `RunnerCache` memoizes file reads and SHA-256 hashes across all cells to avoid redundant I/O
   - Build the implementation using language-specific commands (cached via `.arena/build-cache/<buildFingerprint>/`)
   - Copy the dataset input to an isolated directory under `.arena/runs/<snapshotId>/datasets/<benchmark.id>/` and make it read-only (`chmod 0o444`, applied unconditionally on all platforms via Node.js `fs.promises.chmod`)
   - Spawn one persistent worker with `--input`, `--output`, and `--protocol-version` (args defined per language manifest)
   - Drive the **ready/run/finish protocol** over stdin/stdout NDJSON via `runHarnessProtocol()`:
     - Await `{"type":"ready","protocolVersion":"2.0.0"}` from the worker
     - Send `{"type":"run","requestId":n,"iteration":i,"phase":"warmup"|"measured"}` for each iteration; measure wall time from immediately before writing each request through receipt and strict validation of its response line
     - Verify each response digest is a valid SHA-256 hex string and matches the previous iteration digest (deterministic output)
     - Stop adaptively when the relative 95% bootstrap confidence interval width for median iteration time is within `targetRelativeConfidenceInterval`, or when `maxMeasuredIterations` is reached
     - Send `{"type":"finish"}` and verify the final output file SHA-256 matches the last response digest
   - Check output file size against `maxOutputBytes` limit before invoking the checker
   - Validate output with the Go checker via `checkOutput()` (strict JSON parsing, duplicate key rejection, trailing content rejection)
   - Derive summary statistics (min, max, median, mean, standard deviation, p95, interquartile range) from measured samples via `iterationSummary()`
   - Record metric availability via `metricAvailability()`
   - Record result with provenance (fingerprint, build provenance, machine info)
   - Validate the full snapshot against `result.schema.json` (draft 2020-12 schema with Ajv) before writing
4. Write canonical snapshot to `results/current.json`
5. Web UI loads snapshot and computes scores

