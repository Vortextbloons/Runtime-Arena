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
