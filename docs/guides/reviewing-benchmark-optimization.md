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

Compare multiple measured iterations, not a single run. Test before and after
under the same machine conditions, confirm checker acceptance, and keep an
optimization only when the improvement is repeatable.
