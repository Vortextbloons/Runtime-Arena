# Adding a Language

1. Add `languages/<language-id>.json` using an existing manifest as a template.
2. Configure toolchain detection, release build commands, the artifact path,
   run arguments, environment variables, and source extensions.
3. Ensure the manifest matches `schemas/language.schema.json`.
4. Add `benchmarks/<benchmark-id>/implementations/<language-id>/` for every
   benchmark: nbody, shortest-path, aggregation, barrier-wave, word-frequency,
   record-sorting, and matrix-multiplication. All seven are scored in the
   leaderboard and card profiles.
   Note that JavaScript (Node.js) implementations use the `javascript`
   language ID and `.mjs` source extension.
5. Read each benchmark's `IMPLEMENTING.md` for the exact implementation
   contract — input/output formats, what the checker verifies, checksum rules,
   and gotchas:

   - `benchmarks/nbody/IMPLEMENTING.md`
   - `benchmarks/shortest-path/IMPLEMENTING.md`
   - `benchmarks/aggregation/IMPLEMENTING.md`
   - `benchmarks/barrier-wave/IMPLEMENTING.md`
   - `benchmarks/word-frequency/IMPLEMENTING.md`
   - `benchmarks/record-sorting/IMPLEMENTING.md`
   - `benchmarks/matrix-multiplication/IMPLEMENTING.md`

6. Each implementation must accept the persistent-worker CLI contract:

   ```text
   --input <input-file>
   --output <output-file>
   --timing-output <timing-file>
   --warmup <n>
   --min-iterations <n>
   --max-iterations <n>
   --target-relative-ci <ratio>
   ```

   Language manifests must pass these through the `run.arguments` template
   (see `languages/rust.json` and `docs/architecture/execution-model.md`).
   Implementations collect kernel timing samples adaptively: run at least
   `--min-iterations` measured iterations, stop early when the 95% relative
   confidence interval is narrow enough, and never exceed `--max-iterations`.

7. Use optimized release builds. Produce output that passes the checker —
   the internal approach can differ from other language implementations.
   Use the language's best idioms, data structures, and patterns.
8. For barrier-wave, use true pre-emptive parallelism — OS threads,
   goroutines, worker_threads, or multiprocessing. The number of concurrent
   workers must equal `workerCount`. Event-loop tasks, coroutines scheduled
   on a single OS thread, green threads, or a serial loop do not satisfy the
   benchmark.
9. Verify the integration:

   ```bash
   npm run arena -- doctor
   npm run arena -- list languages
   npm run arena -- run --language <language-id> --size small
   npm test
   ```

10. Register the language in the web UI. Four files have hardcoded language
    lists that need a new entry:

    - `web/src/lib/cards/classifications.ts` — Add to `CATALOG` with
      `executionModels`, `roles`, and `memoryModels`. Required: without it
      the language gets no classification chips, no division membership, and
      a generic takeover label.
    - `web/src/lib/tiers.ts` — Add to `LANGUAGE_MONOGRAMS` with a 2-3
      character abbreviation. Without it, falls back to a single initial.
    - `web/src/lib/BenchmarkChart.svelte` — Add to `languageColors` with a
      hex color. Without it, renders as gray.
    - `web/src/lib/OverallChart.svelte` — Add to `colors` with the same hex
      color. Without it, renders as gray.

    Everything else in the card pipeline (attributes, badges, divisions,
    takeovers, archetypes) is data-driven and adapts automatically from
    benchmark results.

The CLI discovers valid language manifests automatically; avoid adding
language-specific branches to the runner.

**Note:** `detect` / `build` / `run` commands may be absolute paths on a given
machine (for example a local LuaJIT install). That is supported; prefer
commands on `PATH` when documenting or sharing manifests.
