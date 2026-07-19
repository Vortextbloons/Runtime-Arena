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
