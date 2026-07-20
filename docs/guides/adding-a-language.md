# Adding a Language

1. Add `languages/<language-id>.json` using an existing manifest as a template.
2. Configure toolchain detection, release build commands, the artifact path,
   run arguments, environment variables, and source extensions. A `provenance`
   block is optional — the CLI merges defaults from
   [`languages/protocol/provenance.defaults.json`](../../languages/protocol/provenance.defaults.json)
   and always adds a `runtime` probe from `detect` when none is declared.
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

6. Each implementation must honor the **harness-timed persistent worker**
   contract (measurement 2.0.0):

   ```text
   --input <input-file>
   --output <output-file>
   --protocol-version 2.0.0
   ```

   Language manifests pass these through `run.arguments` (see `languages/rust.json`).
   After parsing input, the worker emits `ready` on stdout, then responds to
   harness `run` / `finish` messages over stdin. The harness owns iteration
   timing; implementations do not write timing sidecars. See
   [execution model](../architecture/execution-model.md) for the full protocol.

   **Protocol helpers:** Start from [`languages/protocol/README.md`](../../languages/protocol/README.md).
   Each language family has a small helper (`worker.mjs`, `worker.py`, `go/worker.go`,
   `rust/lib.rs`, `c/include/protocol.h`, `Worker.cs`, `Protocol.java`, `worker.lua`).
   Copy or import the helper, implement only the benchmark kernel, and wire
   `run_worker` / `RunWorker` around it.

   **Minimal worker:** Before tackling a full benchmark, copy an example from
   [`examples/minimal-workers/`](../../examples/minimal-workers/) and run:

   ```bash
   npm run arena -- protocol test --language <language-id> --minimal
   ```

   **Conformance test:** Diagnoses protocol mistakes (missing `ready`, digest
   mismatches, manifest gaps):

   ```bash
   npm run arena -- protocol test --language <language-id> --benchmark nbody
   ```

7. Use optimized release builds. Produce output that passes the checker —
   the internal approach can differ from other language implementations.
   Use the language's best idioms, data structures, and patterns.

   **Artifact paths:** Compiled outputs should live under `.arena/`, `target/`,
   `dist/`, or similar — not beside source with the default `ArenaBenchmark`
   assembly name. For interpreted languages (JavaScript, Python, Lua), the
   artifact may be the source file itself; the build cache verifies hashes
   without copying over live source.

8. For barrier-wave, use true pre-emptive parallelism — OS threads,
   goroutines, worker_threads, or multiprocessing. The number of concurrent
   workers must equal `workerCount`. Event-loop tasks, coroutines scheduled
   on a single OS thread, green threads, or a serial loop do not satisfy the
   benchmark.

9. Verify the integration:

   ```bash
   npm run build:checker
   npm run arena -- doctor
   npm run arena -- list languages
   npm run arena -- protocol test --language <language-id> --minimal
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
