# Adding a Language

1. Add `languages/<language-id>.json` using an existing manifest as a template.
2. Configure toolchain detection, release build commands, the artifact path,
   run arguments, environment variables, and source extensions.
3. Ensure the manifest matches `schemas/language.schema.json`.
4. Add `benchmarks/<benchmark-id>/implementations/<language-id>/` for every
   supported benchmark.
5. Read each benchmark's `IMPLEMENTING.md` for the exact implementation
   contract — input/output formats, algorithm requirements, checksum rules,
   and checker gotchas:

   - `benchmarks/nbody/IMPLEMENTING.md`
   - `benchmarks/shortest-path/IMPLEMENTING.md`
   - `benchmarks/aggregation/IMPLEMENTING.md`

6. Each implementation must accept:

   ```text
   --input <input-file> --output <output-file>
   ```

 7. Use optimized release builds. Produce output that passes the checker —
    the internal approach can differ from other language implementations.
    Use the language's best idioms, data structures, and patterns.
8. Verify the integration:

   ```bash
   npm run arena -- doctor
   npm run arena -- list languages
   npm run arena -- run --language <language-id> --size small
   npm test
   ```

The CLI discovers valid language manifests automatically; avoid adding
language-specific branches to the runner.
