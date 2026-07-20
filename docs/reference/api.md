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
npm run arena -- run --force          # Force re-run even if fingerprint matches
npm run arena -- run --quiet          # Suppress output
npm run arena -- run --no-save        # Don't write results
npm run arena -- run --format json    # Output JSON snapshot
npm run arena -- run --output out.json
```

**Flags:**
- `--language`, `-l` — Filter by language (repeatable)
- `--benchmark`, `-b` — Filter by benchmark (repeatable)
- `--size` — Filter by size (small/medium/large)
- `--mutation` — Filter by mutation variant (e.g. `sparse`, `dense`, `random`, `mostly-sorted`, `repeated-vocabulary`, `mostly-unique`, `row-major`, `column-major`)
- `--warmup` — Override warmup iterations
- `--iterations` — Set a fixed number of measured iterations (disables adaptive measurement)
- `--min-iterations` — Minimum measured iterations for adaptive measurement (default from `measurement.minMeasuredIterations`)
- `--max-iterations` — Maximum measured iterations for adaptive measurement (default from `measurement.maxMeasuredIterations`)
- `--target-ci` — Target relative confidence interval width (default from `measurement.targetRelativeConfidenceInterval`; set to `0` for fixed-iteration mode)
- `--force` — Force re-run even if fingerprint matches
- `--all` — Parsed as a boolean flag but currently has no effect on `run` (only `--force` gates re-execution)
- `--parallel` — Use all CPU cores (overrides `execution.parallelism` in config)
- `--quiet` — Suppress console output
- `--no-save` — Don't write to results file
- `--format json` — Output JSON snapshot to stdout
- `--output` — Write results to specific file
- `--preserve-temp` — Keep temporary run directory

### `arena protocol test`

Validate a language implementation's compliance with the harness stdin/stdout protocol.

```bash
npm run arena -- protocol test --language rust
npm run arena -- protocol test --language go --minimal
npm run arena -- protocol test --language python --benchmark aggregation
```

**Flags:**
- `--language <id>` — Language to test (required)
- `--minimal` — Use a pre-built example program from `examples/minimal-workers/` (quick validation of protocol helpers; skips building a full benchmark)
- `--benchmark <id>` — Use a specific benchmark implementation (defaults to `nbody` when omitted)
- `--preserve-temp` — Keep the temporary test directory

Without `--minimal`, the command builds the language's implementation for the given benchmark and runs conformance checks. Always uses a single measured iteration with no warmup. See [`languages/protocol/README.md`](../languages/protocol/README.md) for the protocol helper reference.

### `arena check`

Validate an implementation output file against the checker.

```bash
npm run arena -- check --benchmark nbody --input input.json --output output.json
```

### `arena dataset generate`

Generate a deterministic dataset from a seed. For mutation benchmarks, `--mutation` is required.

```bash
# Non-mutation benchmark
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418

# Mutation benchmark (--mutation required)
npm run arena -- dataset generate --benchmark shortest-path --size small --mutation sparse --seed 729418
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

`summary` and `status` accept the same filters as `run`: `--language`/`-l`, `--benchmark`/`-b`, `--size`, and `--mutation`.

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
      // For mutation benchmarks, benchmark.mutation and dataset.mutation are also present
      "dataset": { "id": "...", "sha256": "...", "seed": 0, "generatorVersion": "..." },
      "language": { "id": "rust", "name": "Rust", "version": "...", "compilerVersion": "...", "compilerFlags": [...] },
      "build": { "status": "success", "durationNanoseconds": 0, "artifactSizeBytes": 0, "command": [...] },
      "execution": {
        "mode": "persistent-worker",
        "measurementContractVersion": "1.1.0",
        "totalProcessDurationNanoseconds": 148929300,
        "warmupIterations": 2,
        "measuredIterations": 30,
        "measurement": {
          "mode": "adaptive-confidence-interval",
          "minMeasuredIterations": 10,
          "maxMeasuredIterations": 30,
          "targetRelativeConfidenceInterval": 0.05
        },
        "samples": [...],
        "summary": { "validSamples": 30, "rejectedSamples": 0, "minimumKernelTimeNanoseconds": 2965400, "maximumKernelTimeNanoseconds": 4509300, "medianKernelTimeNanoseconds": 3097900, "meanKernelTimeNanoseconds": 3285420, "standardDeviationKernelTimeNanoseconds": 377079, "p95KernelTimeNanoseconds": 4138200, "interquartileRangeKernelTimeNanoseconds": 378700 },
        "metrics": { "kernelTime": { "status": "available", "unit": "nanoseconds" } }
      },
      "checker": { "language": "go", "version": "1.0.0", "status": "accepted", "diagnostics": [] },
      "provenance": { "fingerprint": "...", "measurementContractVersion": "1.1.0", "measuredAt": "...", "machine": { "operatingSystem": {...}, "cpu": {...}, "memoryBytes": 0 } }
    }
  ]
}
```

> **Note:** The example above shows a **legacy** result record (`"measurementContractVersion": "1.1.0"`, `mode: "persistent-worker"`). Current runs produce records with `"measurementContractVersion": "2.0.0"` and `mode: "harness-timed-persistent-worker"`. The summary field names also differ — legacy results use `medianKernelTimeNanoseconds` while current results use `medianIterationTimeNanoseconds`. See [`result.schema.json`](../schemas/result.schema.json) for the full current shape.

`arenaVersion` is hardcoded in the CLI as `"0.2.0"` when writing snapshots. npm package versions may lag that string.

## Checker Exit Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `accepted` | Output is correct |
| 1 | `wrong-answer` | Output is incorrect |
| 2 | `malformed-output` | Output doesn't match expected JSON structure |
| 3 | `unsupported-version` | Output version not supported |
| 4 | `checker-error` | Checker error or unknown benchmark |
