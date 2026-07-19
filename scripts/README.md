# Scripts

Utility scripts for the arena monorepo.

| Script | Purpose |
|--------|---------|
| `build-checker.mjs` | Compile the Go checker binary to `bin/arena-checker[.exe]` |
| `combine-docs.mjs` | Combine all docs into a single markdown file (`docs/ALL.md`) |
| `count-implementation-loc.mjs` | Count logical source lines per benchmark implementation and write `web/src/lib/data/implementation-lines.json` |
| `prepare-results.ts` | Copy the canonical result snapshot for the optional web UI |
| `test-checker.mjs` | Run Go checker tests with a local cache directory |

Run via the root package:

```bash
npm run build:checker
npm run count-loc
npm run prepare-results
npm run combine-docs
```

There is no `verify-environment` script; use `npm run doctor` / `npm run arena -- doctor` for toolchain checks.
