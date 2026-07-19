# Runtime Arena — Complete Documentation
> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs
> Generated: 2026-07-19T07:24:19.941Z
> Total files: 20

## Table of Contents

- [architecture > overview](#architecture-overview)
- [architecture > execution-model](#architecture-execution-model)
- [architecture > fingerprinting](#architecture-fingerprinting)
- [components > README](#components-readme)
- [components > cli](#components-cli)
- [components > checker](#components-checker)
- [components > web](#components-web)
- [components > scorecards](#components-scorecards)
- [reference > api](#reference-api)
- [reference > configuration](#reference-configuration)
- [reference > schemas](#reference-schemas)
- [reference > benchmarks](#reference-benchmarks)
- [guides > development](#guides-development)
- [guides > commands](#guides-commands)
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

Runtime Arena is a cross-language benchmarking system that runs equivalent workloads in Rust, Go, TypeScript, Python, Lua (LuaJIT), and C++, validates their output, records metrics, and stores immutable JSON results.

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

**Persistent-worker mode**: Each (benchmark, size, language) cell runs in one process. The CLI passes `--warmup` and `--iterations`; the implementation discards warmup work and records only measured kernel samples via `--timing-output`. Full contract: [execution-model.md](execution-model.md).

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
3. **Dataset** — path from `sizes.<size>.dataset` under `benchmarks/<benchmark>/datasets/` (may be `.json`, `.csv`, or another extension)
4. **Metrics registry** — `cli/src/metrics.ts`
5. **All implementation source files** — `benchmarks/<benchmark>/implementations/<language>/` (recursive, excluding `node_modules`, `target`, `dist`, `build`, `__pycache__`, `.arena`)
6. **All checker source files** — `checker/` (recursive)
7. **Configuration metadata** — JSON object including:
   - `benchmarkVersion`
   - `measurementContractVersion` (`"1.0.0"`)
   - `size`
   - `warmups` / `iterations`
   - `metrics`
   - `toolchainVersion` / `compilerVersion`

## How it Works

```
fingerprintCell(language, benchmark, size, toolchainVersion, compilerVersion, warmups, iterations)
  → SHA-256(languageManifest + benchmarkManifest + dataset + metricsRegistry
            + implementationSourceTree + checkerSourceTree
            + JSON({benchmarkVersion, measurementContractVersion: "1.0.0", size, warmups, iterations, metrics, toolchainVersion, compilerVersion}))
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
- The measurement contract version embedded in the fingerprint metadata changes

## Machine Provenance

Results also record machine information (CPU model, OS, architecture, memory). The `results status` command warns when a saved result was measured on a different machine.

---

# components > README

> Source: `docs/components/README.md`

# Components

Runtime Arena consists of six main components.

## CLI (`cli/`)

TypeScript command-line tool (`arena`) — the primary entry point. Handles discovery, building, execution, validation, and result storage. Commands: `doctor`, `list`, `build`, `run`, `check`, `dataset`, `results`, `web`.

Source: `cli/src/index.ts` with modules for `metrics.ts` and `timing.ts`. Details: [cli.md](cli.md).

## Checker (`checker/`)

Independent Go program that validates benchmark output correctness. Re-implements the same algorithms as implementations to ensure no shared code masks bugs. Exit codes: 0=accepted, 1=wrong-answer, 2=malformed-output, 3=unsupported-version, 4=other.

Source: `checker/cmd/arena-checker/main.go`. Details: [checker.md](checker.md).

## Benchmarks (`benchmarks/`)

Four workloads under `benchmarks/<id>/`. nbody, shortest-path, and aggregation are fully implemented in all six languages. barrier-wave has Rust, Go, TypeScript, Python, and C++ implementations (LuaJIT excluded).

| Benchmark | Workload | Key Metrics | Status |
|---|---|---|---|
| **nbody** | Gravitational N-body simulation | Numeric computation, tight loops | Complete |
| **shortest-path** | Weighted directed graph shortest-path | Priority queues, memory access | Complete |
| **aggregation** | CSV transaction record aggregation | Parsing, hash maps, sorting | Complete |
| **barrier-wave** | Parallel phases with barriers | Fan-out/fan-in, synchronization | C++ complete; LuaJIT excluded |

Each has `small`, `medium`, and `large` datasets with per-size warmup/iteration counts in `benchmark.json`. Full reference: [benchmarks.md](../reference/benchmarks.md).

## Languages (`languages/`)

JSON manifests defining how to detect, build, and run each language: `rust.json`, `go.json`, `typescript.json`, `python.json`, `lua.json`, `cpp.json`. Run argument templates must include `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations` (persistent-worker contract).

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

SvelteKit static dashboard for viewing results. Loads `results/current.json`, computes scores (80% geometric-mean speed / 10% consistency / 10% scalability), and displays charts and 2K-style scorecards. Built with adapter-static for deployment anywhere. Scorecard design system: [scorecards.md](scorecards.md). Overview: [web.md](web.md).

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
    index.ts            # Main CLI logic (commands, discovery, run, fingerprints)
    metrics.ts          # Metric registry (kernelTime)
    timing.ts           # Timing sample reader
    commands/           # Placeholder (.gitkeep) — not yet extracted
    discovery/          # Placeholder (.gitkeep)
    execution/          # Placeholder (.gitkeep)
    metrics/            # Placeholder (.gitkeep)
    reporting/          # Placeholder (.gitkeep)
    results/            # Placeholder (.gitkeep)
  test/
    cli.test.ts         # Integration tests
    timing.test.ts      # Timing sample tests (also under src/)
  dist/                 # Compiled output
```

`timing.test.ts` lives at `cli/src/timing.test.ts` (next to `timing.ts`).

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Mostly monolithic today**: Runtime behavior lives in `index.ts` with helpers in `metrics.ts` and `timing.ts`. Subdirectories under `src/` are empty placeholders reserved for a future split; do not treat them as active modules.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

**Results summary**: `arena results summary` reads `results/current.json`, filters by `--language`, `--benchmark`, and `--size`, then prints an ANSI-colored box-drawing table with benchmark, language, correctness, median kernel time, and relative-speed columns. Fastest entries are marked with a green ★. Color is auto-detected from TTY and suppressed with `NO_COLOR`.

**Version string**: Result snapshots write `arenaVersion: "0.2.0"` (hardcoded in the CLI). Root/`cli` npm `package.json` may still say `0.1.0` — treat the snapshot field as the arena protocol version for results.

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `kernelTime` | Available | Measured inside the persistent benchmark process |

## Local Caches

Go builds set `GOCACHE` to `.arena/go-build-cache`. Run scratch directories live under `.arena/runs/<snapshotId>` and are deleted after a run unless `--preserve-temp` is set.

---

# components > checker

> Source: `docs/components/checker.md`

# Checker Component

The checker (`checker/`) is an independent Go program that validates benchmark output correctness. It is intentionally written in Go and independent from the TypeScript CLI.

## Structure

```
checker/
  go.mod                # module github.com/runtime-arena/checker
  cmd/
    arena-checker/
      main.go           # All checker logic (single package today)
      main_test.go      # Unit tests
  internal/
    benchmarks/         # Placeholder (.gitkeep) — not yet extracted
    output/             # Placeholder (.gitkeep)
    validation/         # Placeholder (.gitkeep)
```

All validation currently lives in `main.go`. The `internal/` tree is reserved for a future split.

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

### barrier-wave

Independently re-runs the reference barrier-wave kernel and compares the full output object (schema version, digests, seeds). Rejects malformed hex seeds and schema mismatches. Covered by `TestBarrierWaveReference` and `TestBarrierWaveRejectsMalformedHex` in `main_test.go`.

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

The scoring system (`src/lib/scoring.ts`) computes a 0-100 weighted overall score from three components:

**Speed (80% weight)**
- Each eligible benchmark/size contributes `fastestMedian / thisMedian` as a 0-100 performance score.
- Ratios are combined with a geometric mean across sizes and benchmarks.
- A size tier is excluded for every language when its fastest valid median is below 1 ms.

**Consistency (10% weight)**
- Per size: `consistency = clampScore(100 − CV × 400)`, where CV is the coefficient of variation of kernel times.
- Averaged across all eligible sizes within a benchmark.

**Scalability (10% weight)**
- Per benchmark: `scalability = (minimumPerformance / maximumPerformance) × 100`, measuring how well performance holds up across small/medium/large sizes.

**Overall**
- `overall = 0.8 × geometric-mean speed + 0.1 × average consistency + 0.1 × average scalability`
- Correctness and complete sample counts remain strict eligibility gates **within** a benchmark.
- Overall scores use the weighted formula across whatever benchmarks that language completed successfully. Skipping a workload (no cells in the snapshot) does not zero the overall card; coverage gaps are noted as diagnostics.

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
| `OverallCard` | 2K-style collectible card for a language overall score |
| `OverallChart` | Bar chart comparing all languages |
| `BenchmarkChart` | Per-benchmark performance chart |
| `BenchmarkScorecard` | Tier-tinted detail row for a benchmark/language |
| `FilteredResults` | Filterable results table |
| `ResultsExplorer` | Interactive results browser (chart / scorecard views) |

## Scorecards

The Scorecard view uses a trading-card design system (tiers, gem rarity, attribute meters, tilt/shimmer). Full specification: [scorecards.md](scorecards.md).

---

# components > scorecards

> Source: `docs/components/scorecards.md`

# Scorecard Design System

The web dashboard presents language results as NBA 2K–style collectible cards (`OverallCard.svelte`) and as tier-tinted list rows (`BenchmarkScorecard.svelte`). There is no separate card JSON schema or asset pipeline — both components render a computed `BenchmarkScore` from `web/src/lib/scoring.ts` / `web/src/lib/types.ts`.

Shared visual helpers live in `web/src/lib/tiers.ts` (`getScoreTier`, `languageMonogram`, `formatBenchmarkLabel`). Unit tests: `tiers.test.ts`.

## Presentation Modes

| Mode | Component | Layout |
|------|-----------|--------|
| Collectible card | `OverallCard` | Vertical trading-card silhouette (`card-2k`), used in the Scorecard view and the expanded-card overlay |
| Detail row | `BenchmarkScorecard` | Horizontal ranked list with shared tier glow; expandable calculation/diagnostics |

Both modes call `getScoreTier(score.overall)`. Only `OverallCard` implements the full 2K frame, art stage, attribute meters, tilt, and shimmer.

## Score → Card Mapping

| Card surface | Score field | Notes |
|--------------|-------------|-------|
| Large SPEED number (OVR) | `overall` | Weighted composite: 80% geometric-mean speed + 10% consistency + 10% scalability (0–100). Displayed as a rounded integer; `null` → `—` |
| SPEED / STABLE / SCALE meters | `performance`, `consistency`, `scalability` | Segmented 10-bar meters **plus** tabular numeric values beside each label |
| Language name + monogram | `language.id` / `language.name` | Stable abbreviations (`RS`, `TS`, `PY`, `LJ`, `GO`, `C++`) via `languageMonogram` |
| Footer runtime line | `language.id`, `language.version` | Version shows the first whitespace-delimited token |
| Archetype / team label | `benchmarkId` | `formatBenchmarkLabel` → `ARENA` or id with `[-_]+` → spaces, uppercased |
| Benchmark breakdown | `benchmarks[]` | Overall cards only; toggle reveals per-benchmark scores |
| Diagnostics (compact) | `diagnostics[]` | Ineligible: `UNVERIFIED · N issues` + first line. Eligible but incomplete coverage: `PARTIAL · N notes` (e.g. skipped barrier-wave) |
| Diagnostics (expanded) | full `diagnostics[]` | Shown in overlay / expanded card mode |

Leaderboard placement (RANK 01, 02, …) is separate from visual `tierLevel`. Tier tags (GO, PD, DIA, …) are rarity labels from score thresholds.

## Tiers and Rarity

Resolved by `getScoreTier(score: number | null)`:

| `overall` | Band name | Gem (rarity) | Tag | `tierLevel` | CSS class |
|-----------|-----------|--------------|-----|-------------|-----------|
| ≥ 95 | UNTOUCHABLE | Galaxy Opal | GO | 7 | `galaxy-opal` |
| ≥ 90 | INVINCIBLE | Pink Diamond | PD | 6 | `pink-diamond` |
| ≥ 80 | DOMINANT | Diamond | DIA | 5 | `diamond` |
| ≥ 70 | ELITE | Amethyst | AME | 4 | `amethyst` |
| ≥ 60 | STANDARD | Ruby | RUB | 3 | `ruby` |
| ≥ 45 | ROOKIE | Sapphire | SAP | 2 | `sapphire` |
| &lt; 45 | COMMON | Emerald | EME | 1 | `emerald` |
| `null` | UNVERIFIED | No Rank | — | 0 | `unranked` |

`tierLevel` (`0 | 1 | … | 7`) drives shimmer intensity and `high-tier` styling (`tierLevel >= 5`). Each tier sets `--tier-glow` and `--tier-gradient`.

## Language Visual Identity

Languages do **not** have fixed brand colorways. Appearance is:

1. Tier palette from `overall`.
2. Stable monogram from language id (`RS` / `TS` / …).
3. Name typography split into first token vs remainder.
4. Runtime footer from `language.id` and version.

## Card Chrome and Effects (`OverallCard`)

- **Silhouette**: Angular `clip-path` with corner shards.
- **Layers**: Edge gradient, scanlines, holographic shimmer, vignette.
- **Art stage**: Grid, floating code particles, monogram with halo.
- **Motion**: Pointer tilt (±6°) and particle float — disabled under `prefers-reduced-motion: reduce`.
- **High tier**: Stronger top wash when `tierLevel >= 5`.

## Dimensions

| Breakpoint | Max width | Aspect ratio |
|------------|-----------|--------------|
| Default | 320px | 5 / 8.2 |
| ≤ 600px | 280px | same |

## Snapshot Qualification

Near rankings in `ResultsExplorer`, a small line clarifies scope:

> Snapshot rankings · 80% geometric-mean speed · 10% consistency · 10% scalability · skipped workloads noted

## Data Model

Persisted runs remain `ArenaRun` / `ArenaResult`. Scores and tiers are derived client-side. See `BenchmarkScore` in `web/src/lib/types.ts`.

---

# reference > api

> Source: `docs/reference/api.md`

# CLI Reference

The `arena` CLI is the primary entry point. Build with `npm run build:cli`, then run via `npm run arena -- <command>`.

For a task-oriented walkthrough (filters, everyday workflow, results browsing), see [guides/commands.md](../guides/commands.md).

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

View current results, a filtered summary table, or cell status.

```bash
npm run arena -- results current    # Print current.json
npm run arena -- results summary    # Compact table (median + relative)
npm run arena -- results summary --benchmark barrier-wave --language go
npm run arena -- results status     # Show cell status (current/stale/missing)
npm run arena -- results status --language rust
```

`summary` and `status` accept the same repeatable filters as `run`: `--language`/`-l`, `--benchmark`/`-b`, and `--size`.

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
        "measurementContractVersion": "1.0.0",
        "warmupIterations": 1,
        "measuredIterations": 5,
        "samples": [...],
        "summary": { "medianKernelTimeNanoseconds": 0, "meanKernelTimeNanoseconds": 0, "standardDeviationKernelTimeNanoseconds": 0, ... },
        "metrics": { "kernelTime": { "status": "available", "unit": "nanoseconds" } }
      },
      "checker": { "language": "go", "version": "1.0.0", "status": "accepted", "diagnostics": [] },
      "provenance": { "fingerprint": "...", "measurementContractVersion": "1.0.0", "measuredAt": "...", "machine": { "operatingSystem": {...}, "cpu": {...}, "memoryBytes": 0 } }
    }
  ]
}
```

`arenaVersion` is hardcoded in the CLI as `"0.2.0"` when writing snapshots. npm package versions may lag that string.

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
| `execution.parallelism` | **Present in config but unused** — the CLI does not read `config.execution`; cells run sequentially |
| `execution.preserveTemporaryFiles` | **Present in config but unused** — use CLI flag `--preserve-temp` instead |

Temp run directories live under `.arena/runs/` and are deleted after each run unless `--preserve-temp` is set. Go builds also use `.arena/go-build-cache` via `GOCACHE`.


## Language Manifests (`languages/*.json`)

Each language has a manifest defining detection, build, and run commands. The project ships six manifests: `cpp.json`, `go.json`, `lua.json`, `python.json`, `rust.json`, and `typescript.json`.

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

C++ implementations use shared headers (JSON parser, SHA-256) bundled at `languages/cpp/include/` and referenced by the build command's include path.

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

The CLI detects toolchains by running the commands defined in each language manifest's `detect` block (e.g., `rustc --version`, `go version`). It does not read toolchain-specific environment variables like `RUSTC` or `GOPATH`. No custom Runtime Arena environment variables are defined for users.

Internally, Go builds set `GOCACHE` to `.arena/go-build-cache` under the repository root.

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
- `arenaVersion` — Protocol version written into snapshots (CLI currently hardcodes `"0.2.0"`; may differ from npm `package.json` version)
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

Base output shape for implementations. Uses conditional validation based on the `benchmark` field to apply benchmark-specific output schemas for **nbody**, **shortest-path**, and **aggregation**. **barrier-wave** is not yet branched in this schema; the Go checker is the authority for that workload's output shape.

---

# reference > benchmarks

> Source: `docs/reference/benchmarks.md`

# Benchmarks Reference

Runtime Arena currently defines four benchmark workloads. Three are fully implemented across all six supported languages (Rust, Go, TypeScript, Python, LuaJIT, C++). **Barrier Wave** is implemented in five languages (all except LuaJIT); datasets and checker support are ready.

| Benchmark | Status | Stresses |
|-----------|--------|----------|
| `nbody` | Complete (6 languages) | Numeric computation, tight loops |
| `shortest-path` | Complete (6 languages) | Priority queues, graph traversal |
| `aggregation` | Complete (6 languages) | Hash map aggregation, sorting, checksum |
| `barrier-wave` | 5 languages implemented (LuaJIT pending) | Structured parallel concurrency, barriers |

Per-benchmark contracts live in `benchmarks/<id>/README.md` and `IMPLEMENTING.md`.

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

**Input:** CSV with columns `timestamp`, `account_id`, `category`, `quantity`, `unit_price` (dataset file is typically `*.csv`, not JSON).

**Output:** JSON with `recordCount`, `totalQuantity`, `totalValueMinorUnits`, `categories[]`, `topAccounts[]`, `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`, `checksum`.

**Stresses:** Hash map aggregation, sorting, and checksum computation over pre-parsed rows.

**Algorithm:** Parse CSV, aggregate by category and account, sort categories alphabetically, sort accounts by value descending (top 10), compute SHA-256 checksum.

## barrier-wave

**Workload:** Persistent worker pool with deterministic fan-out/fan-in and a barrier between every phase. Each worker owns a fixed shard, applies a 32-bit mixing kernel, and returns local XOR/sum; the coordinator reduces in worker-ID order.

**Input:** JSON (`schemaVersion` `1.0.0`) with `workerCount`, `phaseCount`, `itemsPerWorker`, `roundsPerItem`, `initialSeed` (8 lowercase hex chars).

**Output:** JSON with digest/seed fields defined in `benchmarks/barrier-wave/IMPLEMENTING.md`.

**Stresses:** Real parallel workers, synchronization, reduction order, communication inside the kernel timing boundary.

**Status notes:**
- Checker task `barrier-wave` is implemented and tested.
- Datasets are committed fixtures. `arena dataset generate --benchmark barrier-wave` works with the same `--size` and `--seed` flags as other benchmarks.
- Five of six languages are implemented: Rust, Go, TypeScript, Python, and C++. LuaJIT is excluded (no native threading). See the tree under `benchmarks/barrier-wave/implementations/`.
- `schemas/implementation-output.schema.json` does not yet include a barrier-wave branch; correctness is enforced by the Go checker.

## Dataset Sizes

| Size | Warmup / Measured (typical) | N-body | Shortest path | Aggregation | Barrier Wave |
|------|----------------------------|--------|---------------|-------------|--------------|
| small | see manifest | 4 bodies × 5,000 steps (1 / 5) | 100 vertices × 30 queries (1 / 5) | 10,000 records (1 / 5) | 2 workers × 500 phases × 64 items (3 / 10) |
| medium | see manifest | 6 bodies × 20,000 steps (3 / 10) | 300 vertices × 90 queries (3 / 10) | 50,000 records (3 / 10) | 4 workers × 250 phases × 1024 items (3 / 10) |
| large | see manifest | 8 bodies × 50,000 steps (3 / 10) | 600 vertices × 180 queries (3 / 10) | 200,000 records (3 / 10) | 8 workers × 100 phases × 8192 items (2 / 8) |

Warmup and measured iteration counts come from each benchmark's `benchmark.json` size entries (not only `arena.config.json` defaults). Dataset paths are whatever `sizes.<name>.dataset` names — JSON or CSV.

All datasets are deterministic from a seed. Regenerating via `arena dataset generate` writes metadata with `generatorVersion` `"2.0.0"`.

## Adding a New Benchmark

See [guides/adding-a-benchmark.md](../guides/adding-a-benchmark.md). Register a dataset generator in the CLI if you want `arena dataset generate` support.

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
- g++ (with C++23 support, for C++ implementations)

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
  barrier-wave/         # Rust/Go/TS/Python/C++; LuaJIT marked unavailable
languages/              # Language manifests (rust, go, typescript, python, lua, cpp)
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

---

# guides > commands

> Source: `docs/guides/commands.md`

# CLI Command Guide

Practical guide to the `arena` CLI. For flag details and the results JSON
shape, see [reference/api.md](../reference/api.md).

## Setup

From the repo root:

```bash
npm install
npm run build:cli
npm run build:checker
```

Invoke the CLI with:

```bash
npm run arena -- <command> [flags...]
```

The `--` after `arena` is required so npm forwards flags to the CLI.

## Filters (shared)

These flags are **repeatable** (not comma-separated) on `run`, `build`,
`results summary`, and `results status`:

| Flag | Short | Meaning |
|------|-------|---------|
| `--language <id>` | `-l` | e.g. `rust`, `go`, `typescript`, `python`, `lua`, `cpp` |
| `--benchmark <id>` | `-b` | e.g. `nbody`, `shortest-path`, `aggregation`, `barrier-wave` |
| `--size <name>` | | `small`, `medium`, or `large` |

```bash
# Correct
npm run arena -- run --language go --language python --benchmark barrier-wave

# Wrong — treated as one unknown language id
npm run arena -- run --language go,python --benchmark barrier-wave
```

Omitting `--size` on `run` uses every default size the benchmark defines.

## Everyday workflow

### 1. Check the environment

```bash
npm run arena -- doctor
npm run arena -- list languages
npm run arena -- list benchmarks
```

### 2. Build (optional)

`run` builds as needed. Use `build` when you only want compile checks:

```bash
npm run arena -- build --language rust --benchmark nbody
```

### 3. Run benchmarks

```bash
# Everything that is stale or missing
npm run arena -- run

# One cell
npm run arena -- run --language rust --benchmark nbody --size small

# Force re-measure even if fingerprints match
npm run arena -- run --force --language go --benchmark barrier-wave --size small

# Force every selected cell
npm run arena -- run --force --all
```

Useful extras:

| Flag | Effect |
|------|--------|
| `--quiet` | Less console output |
| `--no-save` | Do not write `results/current.json` |
| `--format json` | Print the snapshot JSON |
| `--output <file>` | Write results to a specific path |
| `--warmup <n>` / `--iterations <n>` | Override dataset defaults |
| `--preserve-temp` | Keep the temp run directory |

### 4. Browse results

Prefer the summary table over dumping the full JSON. In a TTY it renders as a
boxed table with color (green/yellow/red relative times, ★ on the fastest row
per benchmark/size). Set `NO_COLOR=1` for plain output.

```bash
# All cells in current.json
npm run arena -- results summary

# Filtered
npm run arena -- results summary --benchmark barrier-wave --size small
npm run arena -- results summary --language cpp --language rust

# Fingerprint freshness (current / stale / missing / unavailable)
npm run arena -- results status
npm run arena -- results status --benchmark aggregation --language typescript

# Raw snapshot (large)
npm run arena -- results current
```

### 5. Preview the web UI

```bash
npm run build:web
npm run arena -- web
```

## Other commands

### Validate one output file

```bash
npm run arena -- check --benchmark nbody --input path/to/input.json --output path/to/output.json
```

### Regenerate a dataset

Generators exist for nbody, shortest-path, aggregation, and barrier-wave:

```bash
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418
```

Committed fixtures are the source of truth for arena runs; only regenerate when
intentionally refreshing datasets (and update metadata / hashes accordingly).

## Quick reference

| Goal | Command |
|------|---------|
| Health check | `npm run arena -- doctor` |
| List languages | `npm run arena -- list languages` |
| List benchmarks | `npm run arena -- list benchmarks` |
| Run all stale/missing | `npm run arena -- run` |
| Run one language × benchmark | `npm run arena -- run -l rust -b nbody --size small` |
| Force re-run | `npm run arena -- run --force ...` |
| Results table | `npm run arena -- results summary` |
| Cell freshness | `npm run arena -- results status` |
| Raw JSON | `npm run arena -- results current` |
| Checker on a file | `npm run arena -- check --benchmark <id> --input ... --output ...` |
| Web preview | `npm run build:web` then `npm run arena -- web` |

## Related docs

- [CLI reference](../reference/api.md) — flags and snapshot schema
- [CLI component](../components/cli.md) — architecture
- [Execution model](../architecture/execution-model.md) — timing boundary and worker contract
- [Fingerprinting](../architecture/fingerprinting.md) — why `run` skips some cells
- [Ops runbook](../ops/runbook.md) — troubleshooting

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
2. Runs CLI and web workspace tests (`npm run test --workspaces --if-present`)
3. Runs checker unit tests (`node scripts/test-checker.mjs`)

## Test Locations

| Component | Test File | Framework |
|-----------|-----------|-----------|
| CLI integration | `cli/test/cli.test.ts` | Node test runner |
| CLI timing helpers | `cli/src/timing.test.ts` | Node test runner |
| Web scoring | `web/src/lib/scoring.test.ts` | Node test runner |
| Web tiers | `web/src/lib/tiers.test.ts` | Node test runner |
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

Timing unit tests in `cli/src/timing.test.ts` cover reading/parsing timing sample files.

## Checker Tests

Unit tests in `checker/cmd/arena-checker/main_test.go` verify:
- Deterministic nbody simulation produces consistent results
- Alternate optimal shortest-paths are accepted
- Aggregation correctness with known datasets
- Barrier-wave reference output and rejection of malformed hex
- Strict JSON rejection of unknown/duplicate fields

Run checker tests manually:

```bash
node scripts/test-checker.mjs
```

## Web Tests

Unit tests for scoring and scorecard tiers:

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
4. If you add `arena dataset generate` support, cover deterministic regeneration

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
   needs: CLI contract, input/output formats (with examples), algorithm
   pseudocode, checksum/hash rules, checker validation rules, fairness
   constraints, and a verification command. Use existing `IMPLEMENTING.md`
   files as a template.
4. Add deterministic `small`, `medium`, and `large` datasets (commit fixtures
   with metadata). If you want `arena dataset generate` support, register a
   generator branch in `cli/src/index.ts` (`datasetCommand`) — without that,
   generate fails with "No generator registered". Generators already exist
   for nbody, shortest-path, aggregation, and barrier-wave.
5. Create `benchmark.json` using an existing benchmark as a template. It must
   match `schemas/benchmark.schema.json`.
6. Add independent validation logic to the Go checker (and unit tests).
7. Optionally extend `schemas/implementation-output.schema.json` with a
   benchmark-specific branch; the checker remains the correctness authority.
8. Add implementations under `implementations/<language-id>/` that produce
   output accepted by the checker. Use each language's best idioms — prefer
   native types, optimized data structures, and language-appropriate
   algorithmic choices. The checker validates the output; the internal
   implementation can differ freely across languages. Implementations must
   honor the persistent-worker flags (`--input`, `--output`, `--timing-output`,
   `--warmup`, `--iterations`).
9. Confirm discovery and run a small test:

   ```bash
   npm run build:checker
   npm run arena -- list benchmarks
   npm run arena -- run --benchmark <benchmark-id> --size small
   npm test
   ```

Each implementation must use the most idiomatic approach for its language while
producing output accepted by the checker. Do not include setup, compilation, or
validation work in the timed workload.

---

# guides > adding-a-language

> Source: `docs/guides/adding-a-language.md`

# Adding a Language

1. Add `languages/<language-id>.json` using an existing manifest as a template.
2. Configure toolchain detection, release build commands, the artifact path,
   run arguments, environment variables, and source extensions.
3. Ensure the manifest matches `schemas/language.schema.json`.
4. Add `benchmarks/<benchmark-id>/implementations/<language-id>/` for every
   supported benchmark you intend to ship (nbody, shortest-path, aggregation,
   and barrier-wave).
5. Read each benchmark's `IMPLEMENTING.md` for the exact implementation
   contract — input/output formats, algorithm requirements, checksum rules,
   and checker gotchas:

   - `benchmarks/nbody/IMPLEMENTING.md`
   - `benchmarks/shortest-path/IMPLEMENTING.md`
   - `benchmarks/aggregation/IMPLEMENTING.md`
   - `benchmarks/barrier-wave/IMPLEMENTING.md`

6. Each implementation must accept the persistent-worker CLI contract:

   ```text
   --input <input-file>
   --output <output-file>
   --timing-output <timing-file>
   --warmup <n>
   --iterations <n>
   ```

   Language manifests must pass these through the `run.arguments` template
   (see `docs/architecture/execution-model.md`).

7. Use optimized release builds. Produce output that passes the checker —
   the internal approach can differ from other language implementations.
   Use the language's best idioms, data structures, and patterns.
8. For barrier-wave, use real parallel workers with stable IDs and a
   dedicated inbox per worker (shared work queues allow steal races). Rust
   uses native threads, Go uses goroutines with `GOMAXPROCS >= workerCount`,
   TypeScript uses `worker_threads`, Python uses multiprocessing, and C++ uses std::thread. Mark
   LuaJIT unavailable unless real native threads or processes are used.
9. Verify the integration:

   ```bash
   npm run arena -- doctor
   npm run arena -- list languages
   npm run arena -- run --language <language-id> --size small
   npm test
   ```

The CLI discovers valid language manifests automatically; avoid adding
language-specific branches to the runner.

**Note:** `detect` / `build` / `run` commands may be absolute paths on a given
machine (for example a local LuaJIT install). That is supported; prefer
commands on `PATH` when documenting or sharing manifests.

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
- Verify the algorithm, precision, and produced output against the
  `IMPLEMENTING.md` contract. Implementations may differ internally
  across languages — what matters is the checker accepts the output.
- Do not skip required work, hard-code dataset answers, cache results between
  runs, or move timed computation into setup.
- Keep implementation-specific tuning idiomatic and document unusual choices.

## Parallel Workloads

For barrier-wave (and similar fan-out/fan-in benchmarks), output checking
cannot prove workers ran in parallel. Also review:

- Real parallel workers (threads/processes/`worker_threads`), not a serial loop
  or event-loop tasks pretending to be concurrency.
- Stable worker IDs `0..workerCount-1` owning fixed shards.
- Dedicated per-worker inboxes — a shared work queue allows one worker to steal
  another worker's phase and still sometimes pass the checker.
- Barriers between phases: the next phase must not start until every worker
  result for the current phase has been reduced.
- Worker creation and shutdown stay outside the timed kernel; communication,
  computation, synchronization, waiting, and reduction stay inside it.

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

`--language` is repeatable when comparing multiple implementations:

```bash
npm run arena -- run --language rust --language go --benchmark barrier-wave --size small
```

Compare multiple measured iterations, not a single run. Test before and after
under the same machine conditions, confirm checker acceptance, and keep an
optimization only when the improvement is repeatable.

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

Generators are registered for all four benchmarks: `nbody`, `shortest-path`, `aggregation`, and `barrier-wave`.

Successful generation writes metadata with `generatorVersion` `"2.0.0"`. Datasets are deterministic — the same seed produces the same data.

## Local Caches

- `.arena/runs/<snapshotId>/` — per-run scratch (deleted unless `--preserve-temp`)
- `.arena/go-build-cache/` — Go `GOCACHE` for language builds

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

