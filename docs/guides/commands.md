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
