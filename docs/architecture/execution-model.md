# Execution Model

Runtime Arena measures **steady-state workload kernel execution** under measurement contract **2.0.0**. One persistent worker process is launched for each benchmark, size, mutation, and language cell. The harness owns the clock, drives iterations over stdin/stdout, and verifies deterministic digests before invoking the checker.

## Harness-Timed Persistent Worker Contract

The CLI supplies `--input`, `--output`, and `--protocol-version 2.0.0`. Implementations:

1. Read and parse permitted input state before emitting `ready`.
2. Emit `{"type":"ready","protocolVersion":"2.0.0"}` on stdout.
3. For each harness `run` request, prepare fresh mutable state and execute the complete workload kernel.
4. Return `{"type":"result","requestId":n,"digest":"<sha256>"}` where the digest is SHA-256 of the compact JSON result bytes for that iteration.
5. On `finish`, write the last deterministic result to `--output` and acknowledge the same digest.

The CLI measures wall time from immediately before writing each request through receipt and strict validation of its complete response line. Warmup durations are discarded. Adaptive stopping uses a deterministic 10,000-resample percentile bootstrap 95% confidence interval for the median, seeded from the ordered sample sequence. `--iterations` selects fixed-count mode.

Malformed or extra stdout, skipped request IDs, digest mismatch, timeout, early exit, or oversized output rejects the cell. The benchmark timeout applies independently to readiness, each iteration, and finalization. Total process duration is retained only as a diagnostic.

## Legacy Contracts (Read-Only)

Contracts `1.0.0` and `1.1.0` remain readable for historical snapshots. Legacy cells are excluded from rankings and marked stale in `arena results status` until rerun under 2.0.0.

## Isolation and Correctness

Each cell runs in an isolated working directory under `.arena/runs/<snapshotId>/<benchmark>/<language>/<size>/<mutation>/`. Its input dataset is copied to a separate read-only location under `.arena/runs/<snapshotId>/datasets/` (`chmod 0o444`). Before the checker is invoked, output size is checked against the benchmark's `maxOutputBytes` limit. The independent checker validates the final output once.

## Trust Boundary

The harness owns the clock and verifies per-request deterministic digests, preventing implementation-selected samples and common timing leakage. Workload-boundary compliance and the absence of deliberately precomputed digest responses still require trusted or reviewed implementations.

## Build Caching

Build provenance captures resolved executables, compiler/runtime versions, target triple, flags, allowlisted environment values, shared language trees, and declared external inputs. Cache entries store an atomic manifest beside each artifact. Execution fingerprints include the build fingerprint so artifact-affecting changes invalidate saved measurements.

The CLI preserves measured iteration samples and calculates minimum, maximum, median, mean, standard deviation, p95, and interquartile range in nanoseconds. Median iteration time is the primary ranking metric.
