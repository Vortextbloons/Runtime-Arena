# Adding a Language

1. Add `languages/<language-id>.json` using an existing manifest as a template.
2. Configure toolchain detection, release build commands, the artifact path,
   run arguments, environment variables, and source extensions.
3. Ensure the manifest matches `schemas/language.schema.json`.
4. Add `benchmarks/<benchmark-id>/implementations/<language-id>/` for every
   supported benchmark you intend to ship (nbody, shortest-path, aggregation,
   barrier-wave). Additional benchmarks are available but optional:
   word-frequency, record-sorting, and matrix-multiplication
   (implementations for these are pending across most languages).
   Note that JavaScript (Node.js) implementations use the `javascript`
   language ID and `.mjs` source extension.
5. Read each benchmark's `IMPLEMENTING.md` for the exact implementation
   contract — input/output formats, algorithm requirements, checksum rules,
   and checker gotchas:

   - `benchmarks/nbody/IMPLEMENTING.md`
   - `benchmarks/shortest-path/IMPLEMENTING.md`
   - `benchmarks/aggregation/IMPLEMENTING.md`
   - `benchmarks/barrier-wave/IMPLEMENTING.md`

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
8. For barrier-wave, use real parallel workers with stable IDs and a
   dedicated inbox per worker (shared work queues allow steal races). Rust
   uses native threads, Go uses goroutines with `GOMAXPROCS >= workerCount`,
   TypeScript uses `worker_threads`, Python uses multiprocessing, JavaScript
   uses `worker_threads`, and C++ uses std::thread. Mark
   LuaJIT unavailable unless real native threads or processes are used.
9. Verify the integration:

   ```bash
   npm run arena -- doctor
   npm run arena -- list languages
   npm run arena -- run --language <language-id> --size small
   npm test
   ```

The CLI discovers valid language manifests automatically; avoid adding
language-specific branches to the runner.

**Note:** `detect` / `build` / `run` commands may be absolute paths on a given
machine (for example a local LuaJIT install). That is supported; prefer
commands on `PATH` when documenting or sharing manifests.
