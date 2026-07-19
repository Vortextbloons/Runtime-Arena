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
   needs: CLI contract, input/output formats (with field tables), algorithm
   pseudocode, checksum/hash rules, checker validation rules, gotchas,
   scaffolding templates per language, and a verification command. Use
   existing `IMPLEMENTING.md` files as a template.
4. Add deterministic `small`, `medium`, and `large` datasets (commit fixtures
   with metadata). If you want `arena dataset generate` support, register a
   generator branch in `cli/src/index.ts` (`datasetCommand`) — without that,
   generate fails with "No generator registered".
5. Create `benchmark.json` using an existing benchmark as a template. It must
   match `schemas/benchmark.schema.json`.
6. Add independent validation logic to the Go checker (and unit tests).
7. Optionally extend `schemas/implementation-output.schema.json` with a
   benchmark-specific branch; the checker remains the correctness authority.
8. Add implementations under `implementations/<language-id>/` that produce
   output accepted by the checker. Use each language's best idioms — prefer
   native types, optimized data structures, and language-appropriate
   algorithmic choices. The checker validates the output; the internal
   implementation can differ freely across languages. Implementations must
   honor the persistent-worker flags (`--input`, `--output`, `--timing-output`,
   `--warmup`, `--iterations`).
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
