# Adding a Benchmark

1. Create `benchmarks/<benchmark-id>/` with:

   ```text
   benchmark.json
   README.md
   IMPLEMENTING.md
   datasets/
   implementations/
   ```

2. Define the workload, input, output, and fairness rules in the README.
3. Write an `IMPLEMENTING.md` that consolidates everything an implementer
   needs: CLI contract, input/output formats (with examples), algorithm
   pseudocode, checksum/hash rules, checker validation rules, fairness
   constraints, and a verification command. Use existing `IMPLEMENTING.md`
   files as a template.
4. Add deterministic `small`, `medium`, and `large` datasets (commit fixtures
   with metadata). If you want `arena dataset generate` support, register a
   generator branch in `cli/src/index.ts` (`datasetCommand`) — without that,
   generate fails with "No generator registered". Generators already exist
   for nbody, shortest-path, aggregation, barrier-wave, word-frequency,
   record-sorting, and matrix-multiplication.
5. Create `benchmark.json` using an existing benchmark as a template. It must
   match `schemas/benchmark.schema.json`. For workloads with multiple dataset
   variants (e.g. sparse/dense graphs, random/sorted records), use the
   `mutations` form of size configuration instead of a single `dataset` field.
   See the `sizes` `oneOf` in `benchmark.schema.json` for the exact shape.
6. Add independent validation logic to the Go checker (and unit tests).
7. Optionally extend `schemas/implementation-output.schema.json` with a
   benchmark-specific branch; the checker remains the correctness authority.
8. Add implementations under `implementations/<language-id>/` that produce
   output accepted by the checker. Use each language's best idioms — prefer
   native types, optimized data structures, and language-appropriate
   algorithmic choices. The checker validates the output; the internal
   implementation can differ freely across languages. Implementations must
   honor the persistent-worker flags (`--input`, `--output`, `--timing-output`,
   `--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`).
   After each measured iteration, stop when the sample count reaches
   `--max-iterations` or when the count is at least `--min-iterations` and the
   95% relative confidence interval of the mean kernel time is at or below
   `--target-relative-ci`. See an existing implementation and
   [execution model](../architecture/execution-model.md) for the loop pattern.
9. Confirm discovery and run a small test:

   ```bash
   npm run build:checker
   npm run arena -- list benchmarks
   npm run arena -- run --benchmark <benchmark-id> --size small
   npm test
   ```

Each implementation must use the most idiomatic approach for its language while
producing output accepted by the checker. Do not include setup, compilation, or
validation work in the timed workload.

If a workload is intentionally defined before implementations are added, keep
an `implementations/.gitkeep` placeholder and document its pending status in
the benchmark reference. Its manifest, fixtures, generator, schema, checker,
and checker tests can still be completed and verified independently.
