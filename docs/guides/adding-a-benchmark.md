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
4. Add deterministic `small`, `medium`, and `large` datasets.
5. Create `benchmark.json` using an existing benchmark as a template. It must
   match `schemas/benchmark.schema.json`.
6. Add independent validation logic to the Go checker.
 7. Add implementations under `implementations/<language-id>/` that produce
    output accepted by the checker. Use each language's best idioms — prefer
    native types, optimized data structures, and language-appropriate
    algorithmic choices. The checker validates the output; the internal
    implementation can differ freely across languages.
 8. Confirm discovery and run a small test:

    ```bash
    npm run build:checker
    npm run arena -- list benchmarks
    npm run arena -- run --benchmark <benchmark-id> --size small
    npm test
    ```

Each implementation must use the most idiomatic approach for its language while
producing output accepted by the checker. Do not include setup, compilation, or
validation work in the timed workload.
