# Execution Model

Runtime Arena uses a **cold-process execution model** to ensure fair, reproducible benchmarks.

## Cold-Process Mode

Each benchmark iteration spawns a fresh process. This prevents JIT warmup persistence, process-level caching, or memory state from skewing results.

```
Warmup iteration 1  →  process spawned  →  result discarded
Warmup iteration 2  →  process spawned  →  result discarded
Warmup iteration 3  →  process spawned  →  result discarded
Measured iteration 1 →  process spawned  →  result recorded
Measured iteration 2 →  process spawned  →  result recorded
...
```

## Isolation

Each iteration runs in its own temporary directory under `.arena/runs/<snapshotId>/`:

```
.arena/runs/<snapshotId>/
  nbody/
    rust/
      -1/          # Warmup iteration
        input.json
        output.json
      0/           # First measured iteration
        input.json
        output.json
      1/
        ...
```

Input files are copied per iteration and set to read-only (`chmod 0o444`) to prevent implementations from modifying shared state.

## Timing

Wall time is measured using `process.hrtime.bigint()` around the child process execution. This captures:
- Process startup
- Actual computation
- I/O (reading input, writing output)
- Process teardown

Build time is measured separately and stored in the result's `build.durationNanoseconds`.

## Limits

| Limit | Default | Configurable |
|-------|---------|--------------|
| Timeout | 120,000 ms | Per benchmark (`benchmark.json`) |
| Max output | 10 MiB | Per benchmark (`benchmark.json`) |
| Max captured stdout/stderr | 10 MiB | Hardcoded |

When a limit is exceeded, the process is killed (`SIGKILL`) and the sample is marked invalid.

## Statistical Summary

After all measured iterations, the CLI computes:

| Statistic | Description |
|-----------|-------------|
| `minimumWallTimeNanoseconds` | Fastest iteration |
| `maximumWallTimeNanoseconds` | Slowest iteration |
| `medianWallTimeNanoseconds` | Median (p50) |
| `meanWallTimeNanoseconds` | Arithmetic mean |
| `standardDeviationWallTimeNanoseconds` | Standard deviation |
| `p95WallTimeNanoseconds` | 95th percentile |
| `interquartileRangeWallTimeNanoseconds` | IQR (p75 - p25) |
| `validSamples` | Count of accepted samples |
| `rejectedSamples` | Count of rejected samples |

The **median** is the primary metric for comparisons, as it's robust against outliers.
