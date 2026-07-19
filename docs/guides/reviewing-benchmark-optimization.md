# Reviewing Benchmark Optimization

Use this checklist to determine whether an implementation is efficient without
making the comparison unfair.
Use Conext7 To Help

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
