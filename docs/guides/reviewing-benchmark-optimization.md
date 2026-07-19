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

Arena uses **adaptive measurement** by default (contract `1.1.0`): each cell collects
between 10 and 30 kernel samples and stops when the 95% relative CI of the mean
kernel time is ≤ 5%, unless timing noise prevents early stopping. Slow
implementations on large workloads may run all 30 iterations — that is expected,
not a hang. Confirm the process is advancing by checking sample counts in
`.arena/runs/<snapshotId>/.../timing.json` or watching CPU stay bounded while
iteration counts increase.

Compare multiple measured iterations under the same machine conditions and
measurement contract, confirm checker acceptance, and keep an optimization only
when the improvement is repeatable. Use `--iterations <n>` for a fixed sample
count when debugging timing logic.
