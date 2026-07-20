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

`arena run` and `arena check` fail immediately if the checker binary is missing.
`npm run arena -- doctor` reports checker status.

Invoke the CLI with:

```bash
npm run arena -- <command> [flags...]
```

The `--` after `arena` is required so npm forwards flags to the CLI.

## Filters (shared)

These flags are accepted on `run`, `build`, `results summary`, and `results status`:

| Flag | Short | Meaning |
|------|-------|---------|
| `--language <id>` | `-l` | e.g. `rust`, `go`, `typescript`, `python`, `lua`, `cpp` |
| `--benchmark <id>` | `-b` | e.g. `nbody`, `shortest-path`, `aggregation`, `barrier-wave` |
| `--size <name>` | | `small`, `medium`, or `large` |
| `--mutation <name>` | | Filter by mutation variant (e.g. `sparse`, `dense`, `random`, `mostly-sorted`, `repeated-vocabulary`, `mostly-unique`, `row-major`, `column-major`) |

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

Confirm **Checker** shows `ok` before a large run.

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
npm run arena -- run --force
```

`run` prints a plan summary (`current` skipped, `stale/missing` to execute, unavailable toolchains/implementations). When implementations are missing, the plan names the benchmark/language pair and how many cells were skipped (for example `missing: barrier-wave/lua (3 cells)`). Failed builds and invalid checker results are saved and skipped on later runs until the fingerprint changes or you pass `--force`. A single build failure does not abort the rest of the run.

**Startup delay:** After `Plan:` appears, there can be another quiet period while builds complete and the first cells finish. Per-cell lines appear only as each run completes. Use `--parallel` to increase throughput after builds.

### Adaptive measurement

By default, each cell runs between `measurement.minMeasuredIterations` and `measurement.maxMeasuredIterations` measured iterations (configured in `arena.config.json`, currently 10–30). The harness stops early once the bootstrap 95% relative confidence interval for the **median** iteration time is at or below `measurement.targetRelativeConfidenceInterval` (currently 5%).

Pass `--iterations <n>` to force a fixed sample count (disables early stopping). The CLI uses this mode in tests.

Results are tagged with measurement contract **`2.0.0`** (`harness-timed-persistent-worker`). Older `1.0.0` / `1.1.0` rows may remain in `results/current.json` for history; they are not ranked in the web UI or scorecards until the same cell is re-measured under 2.0.0.

Java is detected from `JAVA_HOME`, `PATH`, or common JDK install paths when `javac` is not already on `PATH`.

Useful extras:

| Flag | Effect |
|------|--------|
| `--quiet` | Less console output |
| `--no-save` | Do not write `results/current.json` |
| `--format json` | Print the snapshot JSON |
| `--output <file>` | Write results to a specific path |
| `--warmup <n>` | Override warmup iterations (default from `benchmark.json` or `arena.config.json`) |
| `--iterations <n>` | Fixed measurement count (disables adaptive stopping; used in tests) |
| `--min-iterations <n>` / `--max-iterations <n>` / `--target-ci <ratio>` | Override adaptive measurement bounds (defaults from `arena.config.json` `measurement` block) |
| `--preserve-temp` | Keep the temp run directory |
| `--parallel` | Use all CPU cores (overrides `execution.parallelism` in config) |
| `--mutation <name>` | Run only a specific mutation variant (for mutation benchmarks) |

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

During development, copy canonical results into the static path the dev server reads:

```bash
npm run prepare-results   # copies results/current.json → web/static/results/
npm run dev
```

For a production-style preview:

```bash
npm run build:web
npm run arena -- web
```

See [web-deployment.md](web-deployment.md) for deployment details.

## Other commands

### Validate one output file

```bash
npm run arena -- check --benchmark nbody --input path/to/input.json --output path/to/output.json
```

### Regenerate a dataset

Generators exist for all seven benchmarks. For non-mutation benchmarks (nbody,
aggregation, barrier-wave), provide `--benchmark`, `--size`, and optionally `--seed`:

```bash
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418
```

For mutation benchmarks (shortest-path, word-frequency, record-sorting,
matrix-multiplication), `--mutation` is **required**:

```bash
npm run arena -- dataset generate --benchmark shortest-path --size small --mutation sparse --seed 729418
npm run arena -- dataset generate --benchmark shortest-path --size small --mutation dense --seed 729418
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
| Protocol conformance | `npm run arena -- protocol test --language rust --minimal` |
| Refresh web dev data | `npm run prepare-results` |
| Web preview | `npm run build:web` then `npm run arena -- web` |

## Related docs

- [CLI reference](../reference/api.md) — flags and snapshot schema
- [CLI component](../components/cli.md) — architecture
- [Execution model](../architecture/execution-model.md) — timing boundary and worker contract
- [Fingerprinting](../architecture/fingerprinting.md) — why `run` skips some cells
- [Ops runbook](../ops/runbook.md) — troubleshooting
