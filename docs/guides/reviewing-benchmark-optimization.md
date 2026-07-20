# Reviewing Benchmark Optimizations

## Process

1. **Establish a baseline** — Run the benchmarks for the language or
   implementation you intend to optimize:

   ```bash
   npm run arena -- run --language rust --benchmark nbody
   ```

   Save the baseline for later comparison:

   ```bash
   cp results/current.json results/baseline.json
   ```

2. **Inspect the implementation** — Read the benchmark's `IMPLEMENTING.md` for
   the algorithm contract, checker expectations, and fairness rules. Review the
   source under `benchmarks/<id>/implementations/<language-id>/`.

3. **Optimize** — Apply safe changes. Optimizations must not alter the
   checker-verified output for the same input. Use each language's best idioms,
   data structures, and patterns. See the scorecard for the benchmark/language
   pairs that matter most (`npm run scorecard` generates `docs/scorecard.md`).

4. **Validate correctness** — Run the checker on the modified implementation's
   output before committing to a full benchmark run:

   ```bash
   npm run arena -- check --benchmark nbody --input benchmarks/nbody/datasets/small.json --output output.json
   ```

5. **Re-run and measure** — The fingerprinting system skips cells whose source
   files, manifests, datasets, or checker code have not changed. Use `--force`
   when you need to re-run cells that are still current but should be
   re-measured (e.g., to confirm a change had no effect):

   ```bash
   npm run arena -- run --force --language rust --benchmark nbody
   ```

   For a single-size comparison pass `--size small` to reduce runtime.

6. **Compare results** — Save the new snapshot and compare:

   ```bash
   cp results/current.json results/optimized.json
   npm run arena -- results summary --benchmark nbody --language rust
   ```

   Or diff the two JSON snapshots. Key metrics:
   - **Median kernel time** — primary ranking metric (nanoseconds)
   - **Standard deviation / IQR** — variability (high variance may mask
     regressions)
   - **Build time** and **artifact size** — secondary, but worth noting

7. **Report tradeoffs** — Document any tradeoffs introduced by the
   optimization:

   - Faster hot path at the cost of slower cold path
   - Increased memory allocation or peak RSS
   - Worse worst-case performance on certain sizes or mutations
   - Reduced code clarity or maintainability
   - Platform-specific assumptions that may not hold on other OS/CPU
     combinations

## Constraints

- Optimizations must preserve checker-verified output for the same input.
- Keep datasets deterministic; do not modify committed fixtures.
- Do not manually edit generated result files (`results/current.json`).
- Use each language's best idioms — no need to mirror code structure from
  other implementations.
- Avoid including setup, compilation, or validation work in the timed
  workload (warmup iterations are separate from measured iterations).

## Noise Considerations

Single runs can be noisy. For precise comparisons:

- Run several times and observe the median across runs.
- Ensure no other CPU-intensive processes are running.
- The adaptive measurement system (configured in `arena.config.json`) collects
  enough samples for a tight confidence interval; keep the default 10-30
  range and 5% target CI unless you have a reason to change it.
- Consider pinning CPU frequency or using performance governors if
  benchmarking on bare metal.

## Related

- [Execution model](../architecture/execution-model.md) — timing boundary and worker contract
- [Fingerprinting](../architecture/fingerprinting.md) — why `run` skips some cells
- [Development guide](development.md) — setup and common commands
- [CLI command guide](commands.md) — full CLI usage including `--output` and `--format` flags
- [Adding a benchmark](adding-a-benchmark.md) — benchmark structure and conventions
