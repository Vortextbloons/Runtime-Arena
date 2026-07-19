# Runtime Arena — Complete Documentation
> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs
> Generated: 2026-07-19T05:00:03.863Z
> Total files: 18

## Table of Contents

- [architecture > overview](#architecture-overview)
- [architecture > execution-model](#architecture-execution-model)
- [architecture > fingerprinting](#architecture-fingerprinting)
- [components > README](#components-readme)
- [components > cli](#components-cli)
- [components > checker](#components-checker)
- [components > web](#components-web)
- [reference > api](#reference-api)
- [reference > configuration](#reference-configuration)
- [reference > schemas](#reference-schemas)
- [reference > benchmarks](#reference-benchmarks)
- [guides > development](#guides-development)
- [guides > testing](#guides-testing)
- [guides > web-deployment](#guides-web-deployment)
- [guides > adding-a-benchmark](#guides-adding-a-benchmark)
- [guides > adding-a-language](#guides-adding-a-language)
- [guides > reviewing-benchmark-optimization](#guides-reviewing-benchmark-optimization)
- [ops > runbook](#ops-runbook)

---

# architecture > overview

> Source: `docs/architecture/overview.md`

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

- **Performance** (60%): Ratio of fastest median to this language's median, averaged across sizes
- **Consistency** (25%): 100 - (coefficient_of_variation * 400), clamped 0-100
- **Scalability** (15%): Ratio of worst-size performance to best-size performance

---

# architecture > execution-model

> Source: `docs/architecture/execution-model.md`

# Execution Model

Runtime Arena measures **steady-state workload kernel execution**. One process is launched for each benchmark, size, and language cell. That process loads and parses its dataset once, performs warmups, and then records every measured kernel run with a monotonic high-resolution clock.

## Persistent Worker Contract

The CLI supplies `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations`. Implementations:

1. Read and parse input before timing.
2. Prepare fresh mutable state before each iteration.
3. Run warmups and measurements in the same process.
4. Time the complete workload kernel.
5. Write the final deterministic result and a separate timing sidecar.

```json
{"samples":[{"iteration":1,"kernelTimeNanoseconds":12345}]}
```

Runtime startup, input parsing, state cloning, output encoding, file I/O, process shutdown, build time, and checker time are excluded from ranking. Total process duration is retained only as a diagnostic.

## Isolation and Correctness

Each cell runs in an isolated directory under `.arena/runs/<snapshotId>/<benchmark>/<language>/`. Its copied input is read-only. The independent checker validates the final output once; a rejected output invalidates every timing sample. Missing, malformed, oversized, or incorrectly numbered timing samples also reject the cell.

## Limits and Summary

The per-iteration benchmark timeout is multiplied by the requested warmup and measured iteration count to bound the persistent process. Output and captured-stream limits remain enforced.

The CLI preserves raw kernel samples and calculates minimum, maximum, median, mean, standard deviation, p95, and interquartile range in nanoseconds. Median kernel time is the primary ranking metric.

---

# architecture > fingerprinting

> Source: `docs/architecture/fingerprinting.md`

# Fingerprinting System

The fingerprinting system determines whether a benchmark cell needs re-execution or is already current.

## What is a Fingerprint?

A fingerprint is a SHA-256 hash that captures the complete state of a (benchmark, size, language) cell. If any input to the cell changes, the fingerprint changes, and the cell is marked stale.

## What is Hashed

The fingerprint includes:

1. **Language manifest** — `languages/<language>.json`
2. **Benchmark manifest** — `benchmarks/<benchmark>/benchmark.json`
3. **Dataset** — `benchmarks/<benchmark>/datasets/<size>.json`
4. **Metrics registry** — `cli/src/metrics.ts`
5. **All implementation source files** — `benchmarks/<benchmark>/implementations/<language>/` (recursive, excluding `node_modules`, `target`, `dist`, `build`, `__pycache__`, `.arena`)
6. **All checker source files** — `checker/` (recursive)
7. **Configuration metadata** — benchmark version, size name, warmup/iteration counts, metrics, toolchain version, compiler version

## How it Works

```
fingerprintCell(language, benchmark, size, toolchainVersion, compilerVersion, warmups, iterations)
  → SHA-256(languageManifest + benchmarkManifest + dataset + metricsRegistry
            + implementationSourceTree + checkerSourceTree
            + JSON({benchmarkVersion, size, warmups, iterations, metrics, toolchainVersion, compilerVersion}))
```

## Cell Status

| Status | Meaning |
|--------|---------|
| `current` | Saved fingerprint matches computed fingerprint |
| `stale` | Fingerprint has changed since last run |
| `missing` | No saved result exists |
| `unavailable` | Implementation or toolchain is missing |

## Incremental Execution

`arena run` only re-executes stale or missing cells. This makes iterative development fast — changing one implementation only re-runs that cell.

```bash
# Run only stale/missing cells
npm run arena -- run

# Force re-run even if current
npm run arena -- run --force

# Force re-run everything
npm run arena -- run --force --all
```

## Fingerprint Invalidation

A cell's fingerprint changes when:
- Any source file in the implementation is modified
- The language manifest is modified
- The benchmark manifest is modified
- The dataset file is modified
- The checker code is modified
- The metrics registry is modified
- The toolchain or compiler version changes
- Warmup or iteration counts change

## Machine Provenance

Results also record machine information (CPU model, OS, architecture, memory). The `results status` command warns when a saved result was measured on a different machine.

---

# components > README

> Source: `docs/components/README.md`

# Components

Runtime Arena consists of six main components.

## CLI (`cli/`)

TypeScript command-line tool (`arena`) — the primary entry point. Handles discovery, building, execution, validation, and result storage. Commands: `doctor`, `list`, `build`, `run`, `check`, `dataset`, `results`, `web`.

Source: `cli/src/index.ts` (597 lines) with modules for `metrics.ts` and `timing.ts`

## Checker (`checker/`)

Independent Go program that validates benchmark output correctness. Re-implements the same algorithms as implementations to ensure no shared code masks bugs. Exit codes: 0=accepted, 1=wrong-answer, 2=malformed-output, 3=unsupported-version, 4=other.

Source: `checker/cmd/arena-checker/main.go`

## Benchmarks (`benchmarks/`)

Three benchmark workloads, each with datasets and implementations in all five languages:

| Benchmark | Workload | Key Metrics |
|---|---|---|
| **nbody** | Gravitational N-body simulation | Numeric computation, tight loops |
| **shortest-path** | Weighted directed graph shortest-path | Priority queues, memory access |
| **aggregation** | CSV transaction record aggregation | Parsing, hash maps, sorting |

Each has `small`, `medium`, and `large` datasets with different warmup/iteration counts.

## Languages (`languages/`)

JSON manifests defining how to detect, build, and run each language: `rust.json`, `go.json`, `typescript.json`, `python.json`, `lua.json`. All accept `--input <file> --output <file>`.

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

---

# components > cli

> Source: `docs/components/cli.md`

# CLI Component

The CLI (`cli/`) is the primary entry point — a TypeScript command-line tool that orchestrates discovery, building, execution, validation, and result storage.

## Structure

```
cli/
  package.json          # @runtime-arena/cli, type: module, bin: arena
  tsconfig.json         # ES2024, NodeNext, strict
  src/
    index.ts            # Main CLI logic (597 lines)
    metrics.ts          # Metric registry (kernelTime)
    timing.ts           # Timing sample reader
    commands/           # Sub-command dispatch (in progress)
    discovery/          # Language and benchmark discovery
    execution/          # Build and run orchestration
    metrics/            # Metric collection
    reporting/          # Output formatting
    results/            # Result storage
  test/
    cli.test.ts         # Integration tests (8 test cases)
    timing.test.ts      # Timing sample tests
  dist/                 # Compiled output
```

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Modular structure**: Core logic lives in `index.ts` (597 lines) with supporting modules (`metrics.ts`, `timing.ts`). Subdirectories under `src/` provide structure for commands, discovery, execution, metrics, reporting, and results — ready for extraction as the codebase grows.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `kernelTime` | Available | Measured inside the persistent benchmark process |

---

# components > checker

> Source: `docs/components/checker.md`

# Checker Component

The checker (`checker/`) is an independent Go program that validates benchmark output correctness. It is intentionally written in Go and independent from the TypeScript CLI.

## Structure

```
checker/
  go.mod                # module github.com/runtime-arena/checker, go 1.26
  cmd/
    arena-checker/
      main.go           # All checker logic (464 lines)
      main_test.go      # Unit tests (5 test cases)
  internal/
    benchmarks/         # Benchmark-specific validation (in progress)
    output/             # Output parsing and formatting (in progress)
    validation/         # Common validation utilities (in progress)
```

## Design Principles

**Independence**: The checker re-implements the same algorithms as implementations. No shared code between the CLI and checker ensures bugs can't be masked.

**Strict parsing**: JSON is parsed with strict rules:
- Rejects duplicate keys
- Rejects unknown fields
- Rejects trailing content
- Rejects files over 10 MiB

**Exit codes**: Standardized across all benchmarks.

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `accepted` | Output is correct |
| 1 | `wrong-answer` | Output is incorrect |
| 2 | `malformed-output` | Output doesn't match expected JSON structure |
| 3 | `unsupported-version` | Output version not supported |
| 4 | other | Checker error or unknown benchmark |

## Benchmark Validation

### nbody

Independently re-simulates the gravitational system and compares:
- Final energy (tolerance 1e-8)
- Position checksum (SHA-256)
- Velocity checksum (SHA-256)
- Body count

### shortest-path

Verifies each query result:
- Path endpoints match source/destination
- All edges in path exist in the input graph
- Path cost equals reported distance
- Distance is globally optimal (uses Dijkstra's algorithm)

### aggregation

Independently re-aggregates CSV data and compares:
- Record count
- Total quantity and value
- Category breakdowns (sorted alphabetically)
- Top 10 accounts (sorted by value descending)
- SHA-256 checksum of sorted output

## Usage

```bash
arena-checker check --benchmark <id> --input <file> --output <file>
```

The checker reads the input dataset and implementation output, validates correctness, and prints a JSON response to stdout:

```json
{
  "status": "accepted",
  "benchmark": "nbody",
  "checkerVersion": "1.0.0",
  "diagnostics": []
}
```

---

# components > web

> Source: `docs/components/web.md`

# Web Component

The web UI (`web/`) is an optional SvelteKit static dashboard for viewing benchmark results.

## Structure

```
web/
  package.json          # @runtime-arena/web, SvelteKit + Vite + adapter-static
  svelte.config.js      # Static adapter, outputs to build/
  vite.config.ts
  src/
    app.html            # HTML shell with dark theme (#0d1115)
    lib/
      types.ts          # TypeScript types (ArenaResult, ArenaRun, BenchmarkScore, SizeScore)
      scoring.ts        # Scoring algorithm
      scoring.test.ts   # Scoring tests
      BenchmarkChart.svelte
      BenchmarkScorecard.svelte
      FilteredResults.svelte
      OverallCard.svelte
      OverallChart.svelte
      ResultsExplorer.svelte
    routes/
      +page.svelte      # Main page
      +page.ts           # Data loader
      +layout.svelte
      +layout.ts
      benchmarks/[id]/  # Per-benchmark detail pages
      languages/[id]/   # Per-language detail pages
      methodology/      # Methodology explanation page
  static/
    results/            # Populated by prepare-results.ts
  build/                # Static build output
```

## Scoring Algorithm

The scoring system (`src/lib/scoring.ts`) computes a 0-100 score for each language:

**Performance** (60% weight):
- For each benchmark/size, compute `fastestMedian / thisMedian`
- Average across all sizes

**Consistency** (25% weight):
- `100 - (coefficientOfVariation * 400)`, clamped 0-100
- CV = stddev / mean across all measured samples

**Scalability** (15% weight):
- Ratio of worst-size performance to best-size performance

**Overall** = weighted sum, sorted descending.

## Build & Deploy

```bash
npm run build:web
```

This runs `prepare-results.ts` (copies `results/current.json` into `web/static/results/`) then builds the SvelteKit static site to `web/build/`.

## Local Preview

```bash
npm run arena -- web
```

Launches a Vite preview server for the built static site.

## Data Loading

The web UI loads results from `/results/current.json` (statically served). The `+page.ts` loader fetches this file and passes it to the page component.

## Components

| Component | Purpose |
|-----------|---------|
| `OverallCard` | Summary scorecard for a language |
| `OverallChart` | Bar chart comparing all languages |
| `BenchmarkChart` | Per-benchmark performance chart |
| `BenchmarkScorecard` | Detailed scorecard for a benchmark/language |
| `FilteredResults` | Filterable results table |
| `ResultsExplorer` | Interactive results browser |

---

# reference > api

> Source: `docs/reference/api.md`

# CLI Reference

The `arena` CLI is the primary entry point. Build with `npm run build:cli`, then run via `npm run arena -- <command>`.

## Commands

### `arena doctor`

Check environment health — verifies language toolchains, checker binary, result directory writability, and manifest validity.

```bash
npm run arena -- doctor
```

### `arena list <kind>`

List available languages, benchmarks, or metrics.

```bash
npm run arena -- list languages
npm run arena -- list benchmarks
npm run arena -- list metrics
```

### `arena build`

Build implementations for all or selected language/benchmark combinations.

```bash
npm run arena -- build
npm run arena -- build --language rust --benchmark nbody
```

### `arena run`

Run benchmarks and record results. Only re-executes cells whose fingerprint has changed.

```bash
npm run arena -- run
npm run arena -- run --language rust --benchmark nbody --size small
npm run arena -- run --force          # Force re-run even if current
npm run arena -- run --force --all    # Force re-run everything
npm run arena -- run --quiet          # Suppress output
npm run arena -- run --no-save        # Don't write results
npm run arena -- run --format json    # Output JSON snapshot
npm run arena -- run --output out.json
```

**Flags:**
- `--language`, `-l` — Filter by language (repeatable)
- `--benchmark`, `-b` — Filter by benchmark (repeatable)
- `--size` — Filter by size (small/medium/large)
- `--warmup` — Override warmup iterations
- `--iterations` — Override measured iterations
- `--force` — Force re-run even if fingerprint matches
- `--all` — With `--force`, re-run all cells
- `--quiet` — Suppress console output
- `--no-save` — Don't write to results file
- `--format json` — Output JSON snapshot to stdout
- `--output` — Write results to specific file
- `--preserve-temp` — Keep temporary run directory

### `arena check`

Validate an implementation output file against the checker.

```bash
npm run arena -- check --benchmark nbody --input input.json --output output.json
```

### `arena dataset generate`

Generate a deterministic dataset from a seed.

```bash
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418
```

### `arena results`

View current results or status.

```bash
npm run arena -- results current    # Print current.json
npm run arena -- results status     # Show cell status (current/stale/missing)
npm run arena -- results status --language rust
```

### `arena web`

Launch a local preview server for the web UI.

```bash
npm run arena -- web
```

## Output Format

The `results/current.json` snapshot contains:

```json
{
  "schemaVersion": "3.0.0",
  "snapshotId": "...",
  "updatedAt": "...",
  "arenaVersion": "0.2.0",
  "gitCommit": "...",
  "gitDirty": false,
  "results": [
    {
      "benchmark": { "id": "nbody", "version": 1, "size": "small" },
      "dataset": { "id": "...", "sha256": "...", "seed": 0, "generatorVersion": "..." },
      "language": { "id": "rust", "name": "Rust", "version": "...", "compilerVersion": "...", "compilerFlags": [...] },
      "build": { "status": "success", "durationNanoseconds": 0, "artifactSizeBytes": 0, "command": [...] },
      "execution": {
        "mode": "persistent-worker",
        "warmupIterations": 1,
        "measuredIterations": 5,
        "samples": [...],
        "summary": { "medianKernelTimeNanoseconds": 0, "meanKernelTimeNanoseconds": 0, "standardDeviationKernelTimeNanoseconds": 0, ... },
        "metrics": { "kernelTime": { "status": "available", "unit": "nanoseconds" } }
      },
      "checker": { "language": "go", "version": "1.0.0", "status": "accepted", "diagnostics": [] },
      "provenance": { "fingerprint": "...", "measuredAt": "...", "machine": { "operatingSystem": {...}, "cpu": {...}, "memoryBytes": 0 } }
    }
  ]
}
```

## Checker Exit Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `accepted` | Output is correct |
| 1 | `wrong-answer` | Output is incorrect |
| 2 | `malformed-output` | Output doesn't match expected JSON structure |
| 3 | `unsupported-version` | Output version not supported |
| 4 | other | Checker error or unknown benchmark |

---

# reference > configuration

> Source: `docs/reference/configuration.md`

# Configuration Reference

## arena.config.json

Root runner configuration at the repository root.

```json
{
  "schemaVersion": "1.0.0",
  "benchmarkDirectory": "benchmarks",
  "languageDirectory": "languages",
  "resultDirectory": "results",
  "checkerExecutable": "bin/arena-checker",
  "defaults": {
    "sizes": ["small", "medium", "large"],
    "warmupIterations": 3,
    "measuredIterations": 10,
    "metrics": ["kernelTime"]
  },
  "execution": {
    "parallelism": 1,
    "preserveTemporaryFiles": false
  }
}
```

| Field | Description |
|-------|-------------|
| `benchmarkDirectory` | Directory containing benchmark workloads |
| `languageDirectory` | Directory containing language manifests |
| `resultDirectory` | Directory for result snapshots |
| `checkerExecutable` | Path to the compiled checker binary |
| `defaults.sizes` | Default sizes to run |
| `defaults.warmupIterations` | Default warmup iterations (discarded) |
| `defaults.measuredIterations` | Default measured iterations |
| `defaults.metrics` | Default metrics to record |
| `execution.parallelism` | Concurrent execution (currently 1) |
| `execution.preserveTemporaryFiles` | Keep temp run directories |

## Language Manifests (`languages/*.json`)

Each language has a manifest defining detection, build, and run commands.

```json
{
  "id": "rust",
  "name": "Rust",
  "enabled": true,
  "detect": { "command": "rustc", "arguments": ["--version"] },
  "build": {
    "workingDirectory": "{implementationDir}",
    "command": "cargo",
    "arguments": ["build", "--release"],
    "artifact": "target/release/{benchmarkId}"
  },
  "run": {
    "command": "{artifact}",
    "arguments": [
      "--input", "{inputFile}",
      "--output", "{outputFile}",
      "--timing-output", "{timingOutputFile}",
      "--warmup", "{warmupIterations}",
      "--iterations", "{measuredIterations}"
    ]
  },
  "environment": {},
  "sourceExtensions": [".rs"]
}
```

**Template Variables:**
- `{projectRoot}` — Repository root
- `{benchmarkId}` — Benchmark identifier (e.g., `nbody`)
- `{benchmarkDir}` — Benchmark directory path
- `{implementationDir}` — Implementation directory path
- `{artifact}` — Built binary path
- `{inputFile}` — Input dataset file
- `{outputFile}` — Output file path
- `{timingOutputFile}` — Timing output file path (used by persistent-worker contract)
- `{warmupIterations}` — Number of warmup iterations (integer)
- `{measuredIterations}` — Number of measured iterations (integer)
- `{runId}` — Run snapshot ID
- `{size}` — Dataset size name

## Benchmark Manifests (`benchmarks/*/benchmark.json`)

Each benchmark has a manifest defining sizes, metrics, and limits.

```json
{
  "id": "nbody",
  "name": "N-Body Simulation",
  "version": 1,
  "description": "Deterministic gravitational simulation exercising numeric computation, tight loops, and floating-point arithmetic.",
  "inputFormat": "json",
  "outputFormat": "json",
  "checker": {
    "task": "nbody",
    "timeoutMilliseconds": 30000
  },
  "sizes": {
    "small": { "dataset": "small.json", "warmupIterations": 1, "measuredIterations": 5 },
    "medium": { "dataset": "medium.json", "warmupIterations": 3, "measuredIterations": 10 },
    "large": { "dataset": "large.json", "warmupIterations": 3, "measuredIterations": 10 }
  },
  "metrics": ["kernelTime"],
  "limits": {
    "timeoutMilliseconds": 120000,
    "maxOutputBytes": 10485760
  }
}
```

## Environment Variables

The CLI detects toolchains by running the commands defined in each language manifest's `detect` block (e.g., `rustc --version`, `go version`). It does not read toolchain-specific environment variables like `RUSTC` or `GOPATH`. No custom Runtime Arena environment variables are defined.

---

# reference > schemas

> Source: `docs/reference/schemas.md`

# JSON Schemas

All schemas use JSON Schema 2020-12 draft and are located in `schemas/`.

## benchmark.schema.json

Validates benchmark manifests (`benchmarks/*/benchmark.json`).

**Required fields:**
- `id` — Unique benchmark identifier (string, lowercase kebab-case)
- `name` — Display name (string)
- `version` — Version number (integer, minimum 1)
- `description` — Description of the workload (string)
- `inputFormat` — Input format (`"json"`, `"csv"`, or `"binary"`)
- `outputFormat` — Output format (`"json"`)
- `checker` — Checker configuration with `task` (string) and `timeoutMilliseconds` (integer)
- `sizes` — Map of size names to size configurations
- `metrics` — Array of metric names to record
- `limits` — Execution limits

**Size configuration:**
- `dataset` — Filename in `datasets/` directory
- `warmupIterations` — Number of warmup iterations (discarded)
- `measuredIterations` — Number of measured iterations

**Limits:**
- `timeoutMilliseconds` — Per-iteration timeout (default 120000)
- `maxOutputBytes` — Maximum output file size (default 10 MiB)

## language.schema.json

Validates language manifests (`languages/*.json`).

**Required fields:**
- `id` — Unique language identifier (string, lowercase kebab-case)
- `name` — Display name (string)
- `enabled` — Whether the language is active (boolean)
- `detect` — Command to detect toolchain availability
- `build` — Command to build implementations
- `run` — Command to run implementations
- `sourceExtensions` — Array of file extensions (e.g., `[".rs"]`)

**Command structure:**
- `command` — Executable name
- `arguments` — Array of argument strings (supports template variables)
- `workingDirectory` — Working directory override (required on `build`, optional on `run`)
- `artifact` — Path to built binary (build command only, required)

**Build command** additionally requires `workingDirectory`.

**Template variables:** `{projectRoot}`, `{benchmarkId}`, `{benchmarkDir}`, `{implementationDir}`, `{artifact}`, `{inputFile}`, `{outputFile}`, `{timingOutputFile}`, `{warmupIterations}`, `{measuredIterations}`, `{runId}`, `{size}`

## result.schema.json

Validates result snapshots (`results/current.json`).

**Structure:**
- `schemaVersion` — Semver string; the schema validates against `^\d+\.\d+\.\d+$` (the CLI currently writes `"3.0.0"`)
- `snapshotId` — Unique run identifier
- `updatedAt` — ISO 8601 timestamp
- `arenaVersion` — CLI version
- `gitCommit` / `gitDirty` — Git state (both nullable)
- `results[]` — Array of benchmark results

Each result is required to contain:
- `benchmark` — id, version, size
- `dataset` — id and sha256 are required; seed and generatorVersion are optional but present in practice
- `language` — id, name, version; compilerVersion and compilerFlags are optional
- `build` — status, durationNanoseconds, command; artifactSizeBytes is optional
- `execution` — mode (always `"persistent-worker"`), measurementContractVersion (`"1.0.0"`), totalProcessDurationNanoseconds, warmupIterations, measuredIterations, samples, summary, metrics
- `checker` — language, version, status (enum: accepted / wrong-answer / malformed-output / unsupported-version / checker-error), diagnostics (optional)
- `provenance` — fingerprint (sha256 hex), measurementContractVersion (`"1.0.0"`), measuredAt, machine (os, cpu, memoryBytes)

## implementation-output.schema.json

Base output shape for implementations. Uses conditional validation based on the `benchmark` field to apply benchmark-specific output schemas.

---

# reference > benchmarks

> Source: `docs/reference/benchmarks.md`

# Benchmarks Reference

Runtime Arena includes three benchmark workloads, each designed to stress different aspects of language runtimes.

## nbody

**Workload:** Gravitational N-body simulation using direct pairwise force computation.

**Input:** JSON with `steps`, `deltaTime`, and `bodies` (each with `mass`, `position[3]`, `velocity[3]`).

**Output:** JSON with `bodyCount`, `finalEnergy`, `positionChecksum`, `velocityChecksum`.

**Stresses:** Numeric computation, tight loops, floating-point arithmetic, memory access patterns.

**Algorithm:** For each step, compute pairwise gravitational forces between all bodies, update velocities, then update positions. Compute total kinetic + potential energy at the end.

## shortest-path

**Workload:** Weighted directed graph shortest-path queries using Dijkstra's algorithm.

**Input:** JSON with `vertexCount`, `edges` (from, to, weight), and `queries` (id, source, destination).

**Output:** JSON with `results[]` — each with `queryId`, `distance`, `path[]`.

**Stresses:** Priority queues, memory allocation, branch-heavy code, graph traversal.

**Algorithm:** For each query, run Dijkstra's algorithm from source to destination. Verify path endpoints, edge existence, and path cost.

## aggregation

**Workload:** CSV transaction record aggregation.

**Input:** CSV with columns `timestamp`, `account_id`, `category`, `quantity`, `unit_price`.

**Output:** JSON with `recordCount`, `totalQuantity`, `totalValueMinorUnits`, `categories[]`, `topAccounts[]`, `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`, `checksum`.

**Stresses:** Parsing, string allocation, hash maps, sorting, garbage collection.

**Algorithm:** Parse CSV, aggregate by category and account, sort categories alphabetically, sort accounts by value descending (top 10), compute SHA-256 checksum.

## Dataset Sizes

| Size | Warmup | Measured | N-body | Shortest path | Aggregation |
|------|--------|----------|--------|---------------|-------------|
| small | 1 | 5 | 4 bodies × 5,000 steps | 100 vertices × 30 queries | 10,000 records |
| medium | 3 | 10 | 6 bodies × 20,000 steps | 300 vertices × 90 queries | 50,000 records |
| large | 3 | 10 | 8 bodies × 50,000 steps | 600 vertices × 180 queries | 200,000 records |

Datasets are deterministic — generated from a seed and committed as fixtures with SHA-256 hashes.

## Adding a New Benchmark

See [guides/adding-a-benchmark.md](../guides/adding-a-benchmark.md).

---

# guides > development

> Source: `docs/guides/development.md`

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
| `npm run combine-docs` | Regenerate docs/ALL.md |

## Project Structure

```
cli/                    # TypeScript CLI (arena command)
  src/index.ts          # Main CLI logic (monolithic)
  src/metrics.ts        # Metric registry
  test/cli.test.ts      # Integration tests
checker/                # Independent Go checker
  cmd/arena-checker/main.go
benchmarks/             # Workloads, datasets, implementations
  nbody/
  shortest-path/
  aggregation/
languages/              # Language manifests (rust, go, typescript, python, lua)
schemas/                # JSON Schema definitions
results/                # Canonical result snapshots
web/                    # SvelteKit dashboard
scripts/                # Build and utility scripts
docs/                   # Project documentation
```

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
2. Web unit tests (`web/src/lib/scoring.test.ts`)
3. Checker unit tests (`checker/cmd/arena-checker/main_test.go` via `scripts/test-checker.mjs`)

## Conventions

- Keep benchmark workloads equivalent across languages
- Keep datasets deterministic (committed fixtures with SHA-256 hashes)
- Do not manually edit generated result files (`results/current.json`)
- The checker must be independent from the CLI (no shared code)
- All implementations must accept `--input <file> --output <file>`

---

# guides > testing

> Source: `docs/guides/testing.md`

# Testing Guide

## Running All Tests

```bash
npm test
```

This command:
1. Builds the checker binary (`npm run build:checker`)
2. Runs CLI integration tests (`npm run test --workspaces --if-present`)
3. Runs checker unit tests (`node scripts/test-checker.mjs`)

## Test Locations

| Component | Test File | Framework |
|-----------|-----------|-----------|
| CLI | `cli/test/cli.test.ts` | Node test runner |
| Web scoring | `web/src/lib/scoring.test.ts` | Node test runner |
| Checker | `checker/cmd/arena-checker/main_test.go` | Go testing |

## CLI Tests

Integration tests in `cli/test/cli.test.ts` verify:
- `doctor` command runs successfully
- `list` commands return expected output
- `build` command compiles implementations
- `run` command executes benchmarks and produces valid results
- `check` command validates output files
- `dataset generate` creates deterministic datasets
- `results` command reads snapshots

## Checker Tests

Unit tests in `checker/cmd/arena-checker/main_test.go` verify:
- Deterministic simulation produces consistent results
- Alternate optimal paths are accepted
- Aggregation correctness with known datasets
- Strict JSON rejection of unknown/duplicate fields

Run checker tests manually:

```bash
node scripts/test-checker.mjs
```

## Web Tests

Unit tests for the scoring algorithm:

```bash
npm run test --workspace=@runtime-arena/web
```

## Type Checking

```bash
npm run check --workspace=@runtime-arena/web
```

Runs TypeScript type checking on the web workspace.

## Writing New Tests

When adding a new benchmark:
1. Add checker unit tests in `checker/cmd/arena-checker/main_test.go`
2. Verify the CLI can discover, build, and run the benchmark
3. Verify the checker accepts correct output and rejects incorrect output

---

# guides > web-deployment

> Source: `docs/guides/web-deployment.md`

# Web Deployment

The web UI is a SvelteKit static site that can be deployed anywhere.

## Build

```bash
npm run build:web
```

This:
1. Copies `results/current.json` into `web/static/results/`
2. Builds the SvelteKit static site to `web/build/`

## Local Preview

```bash
npm run arena -- web
```

Launches a Vite preview server.

## Deployment Options

Since the site uses `@sveltejs/adapter-static`, the output is plain HTML/CSS/JS with no server requirements.

### Static Hosting

Deploy the `web/build/` directory to any static host:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- S3 + CloudFront

### Docker

```dockerfile
FROM nginx:alpine
COPY web/build/ /usr/share/nginx/html/
```

## Updating Results

When new benchmark results are available:

```bash
npm run arena -- run          # Run benchmarks
npm run build:web             # Rebuild web UI with new results
```

The `prepare-results.ts` script handles copying the latest results into the static build.

---

# guides > adding-a-benchmark

> Source: `docs/guides/adding-a-benchmark.md`

# Adding a Benchmark

1. Create `benchmarks/<benchmark-id>/` with:

   ```text
   benchmark.json
   README.md
   IMPLEMENTING.md
   datasets/
   implementations/
   ```

2. Define the workload, input, output, and fairness rules in the README.
3. Write an `IMPLEMENTING.md` that consolidates everything an implementer
   needs: CLI contract, input/output formats (with field tables), algorithm
   pseudocode, checksum/hash rules, checker validation rules, gotchas,
   scaffolding templates per language, and a verification command. Use
   existing `IMPLEMENTING.md` files as a template.
4. Add deterministic `small`, `medium`, and `large` datasets.
5. Create `benchmark.json` using an existing benchmark as a template. It must
   match `schemas/benchmark.schema.json`.
6. Add independent validation logic to the Go checker.
7. Add equivalent implementations under
   `implementations/<language-id>/`.
8. Confirm discovery and run a small test:

   ```bash
   npm run build:checker
   npm run arena -- list benchmarks
   npm run arena -- run --benchmark <benchmark-id> --size small
   npm test
   ```

All implementations must perform the same work and produce output accepted by
the same checker. Do not include setup, compilation, or validation work in the
timed workload.

---

# guides > adding-a-language

> Source: `docs/guides/adding-a-language.md`

# Adding a Language

1. Add `languages/<language-id>.json` using an existing manifest as a template.
2. Configure toolchain detection, release build commands, the artifact path,
   run arguments, environment variables, and source extensions.
3. Ensure the manifest matches `schemas/language.schema.json`.
4. Add `benchmarks/<benchmark-id>/implementations/<language-id>/` for every
   supported benchmark.
5. Read each benchmark's `IMPLEMENTING.md` for the exact implementation
   contract — input/output formats, algorithm requirements, checksum rules,
   and checker gotchas:

   - `benchmarks/nbody/IMPLEMENTING.md`
   - `benchmarks/shortest-path/IMPLEMENTING.md`
   - `benchmarks/aggregation/IMPLEMENTING.md`

6. Each implementation must accept:

   ```text
   --input <input-file> --output <output-file>
   ```

7. Use optimized release builds, but preserve the exact workload and output
   requirements used by the other languages.
8. Verify the integration:

   ```bash
   npm run arena -- doctor
   npm run arena -- list languages
   npm run arena -- run --language <language-id> --size small
   npm test
   ```

The CLI discovers valid language manifests automatically; avoid adding
language-specific branches to the runner.

---

# guides > reviewing-benchmark-optimization

> Source: `docs/guides/reviewing-benchmark-optimization.md`

# Reviewing Benchmark Optimization

Use this checklist to determine whether an implementation is efficient without
making the comparison unfair.

## Correctness and Fairness

- Run the checker first; an incorrect result is not an optimization.
- Read the benchmark's `IMPLEMENTING.md` for exact output format, checksum
  rules, sort orders, and tolerance values.
- Compare the algorithm, precision, input parsing, and produced output with the
  other language implementations.
- Do not skip required work, hard-code dataset answers, cache results between
  runs, or move timed computation into setup.
- Keep implementation-specific tuning idiomatic and document unusual choices.

## Optimization Review

- Confirm the optimized or release build is used.
- Look for unnecessary allocations, copies, conversions, bounds checks, and
  repeated parsing inside hot loops.
- Prefer suitable data structures, contiguous memory, buffered I/O, and
  preallocated collections where appropriate.
- Check whether compiler settings and runtime configuration are appropriate.
- Profile before changing code; focus on measured CPU, allocation, or I/O hot
  spots instead of guessing.

## Measure the Result

```bash
npm run arena -- run --language <language-id> --benchmark <benchmark-id> --size small
npm run arena -- run --language <language-id> --benchmark <benchmark-id> --size large
```

Compare multiple measured iterations, not a single run. Test before and after
under the same machine conditions, confirm checker acceptance, and keep an
optimization only when the improvement is repeatable and the workload remains
equivalent.

---

# ops > runbook

> Source: `docs/ops/runbook.md`

# Operations Runbook

## Health Check

```bash
npm run arena -- doctor
```

Verifies language toolchains, checker binary, result directory writability, and manifest validity.

## Running Benchmarks

```bash
# Run all benchmarks, all languages, all sizes
npm run arena -- run

# Run specific combinations
npm run arena -- run --language rust --benchmark nbody --size small

# Force re-run even if current
npm run arena -- run --force

# Force re-run everything
npm run arena -- run --force --all
```

## Checking Results Status

```bash
npm run arena -- results status
```

Shows each cell as `current`, `stale`, `missing`, or `unavailable`.

## Viewing Results

```bash
# Print current snapshot
npm run arena -- results current

# Output as JSON
npm run arena -- run --format json --quiet
```

## Building the Web UI

```bash
npm run build:web
```

This copies `results/current.json` into `web/static/results/` and builds the SvelteKit static site.

## Regenerating Datasets

```bash
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418
```

Datasets are deterministic — the same seed produces the same data.

## Rebuilding the Checker

```bash
npm run build:checker
```

Compiles `checker/cmd/arena-checker/main.go` to `bin/arena-checker[.exe]`.

## Troubleshooting

### "No available language/benchmark combinations selected"

Run `npm run arena -- doctor` to check which toolchains are available.

### "Build failed for ..."

Check that the language toolchain is installed and the implementation compiles. Run the build command manually in the implementation directory.

### "Checker returned invalid JSON"

The checker binary may be missing or corrupted. Run `npm run build:checker`.

### All cells show "stale"

Source files, manifests, datasets, or checker code have changed since the last run. Run `npm run arena -- run` to re-execute.

### Results not updating

Check that `--no-save` is not set. Verify `results/` directory is writable.

