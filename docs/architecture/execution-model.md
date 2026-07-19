# Execution Model

Runtime Arena measures **steady-state workload kernel execution**. One process is launched for each benchmark, size, and language cell. That process loads and parses its dataset once, performs warmups, and then records every measured kernel run with a monotonic high-resolution clock.

## Persistent Worker Contract

The CLI supplies `--input`, `--output`, `--timing-output`, `--warmup`, `--min-iterations`, `--max-iterations`, and `--target-relative-ci`. Implementations:

1. Read and parse input before timing.
2. Prepare fresh mutable state before each iteration.
3. Run warmups and measurements in the same process.
4. Time the complete workload kernel.
5. Write the final deterministic result and a separate timing sidecar.

```json
{"samples":[{"iteration":1,"kernelTimeNanoseconds":12345}]}
```

The CLI validates timing sidecars via `readTimingSamples()`:
- Iterations must be **1-indexed and sequential** (sample N must have `iteration: N`)
- All `kernelTimeNanoseconds` values must be **non-negative safe integers**
- Between `minMeasuredIterations` and `maxMeasuredIterations` samples are required
- After each measured iteration, implementations stop early when the 95% relative confidence interval of the mean kernel time is at or below `--target-relative-ci`
- Extra or missing fields on the top-level object or on individual samples are **rejected**
- Timing sidecars exceeding `maxOutputBytes` are also rejected

Runtime startup, input parsing, state cloning, output encoding, file I/O, process shutdown, build time, and checker time are excluded from ranking. Total process duration is retained only as a diagnostic.

## Isolation and Correctness

Each cell runs in an isolated directory under `.arena/runs/<snapshotId>/<benchmark>/<language>/`. Its copied input is read-only (`chmod 0o444`). Before the checker is invoked, output size is checked against the benchmark's `maxOutputBytes` limit; oversized output is rejected without invoking the checker. The independent checker validates the final output once; a rejected output invalidates every timing sample. Missing, malformed, oversized, or incorrectly numbered timing samples also reject the cell.

## Limits and Summary

The per-iteration benchmark timeout is multiplied by the requested warmup and maximum measured iteration count to bound the persistent process. Output and captured-stream limits remain enforced.

**Build caching**: A separate `buildFingerprint()` (distinct from the execution `fingerprintCell`) hashes the language manifest, implementation source tree, benchmark ID, and build config. Compiled artifacts are stored in `.arena/build-cache/<buildFingerprint>/` and restored via `copyFile` on cache hits, skipping recompilation.

The CLI preserves raw kernel samples and calculates minimum, maximum, median, mean, standard deviation, p95, and interquartile range in nanoseconds. Median kernel time is the primary ranking metric.
