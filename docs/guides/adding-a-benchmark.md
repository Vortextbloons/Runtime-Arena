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
7. Add equivalent implementations under
   `implementations/<language-id>/`.
8. Confirm discovery and run a small test:

   ```bash
   npm run build:checker
   npm run arena -- list benchmarks
   npm run arena -- run --benchmark <benchmark-id> --size small
   npm test
   ```

All implementations must perform the same work and produce output accepted by
the same checker. Do not include setup, compilation, or validation work in the
timed workload.
