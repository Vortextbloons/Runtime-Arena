# Scripts

Utility scripts for the arena monorepo.

| Script | Purpose |
|--------|---------|
| `build-checker.mjs` | Compile the Go checker binary to `bin/arena-checker[.exe]` |
| `combine-docs.mjs` | Combine all docs into a single markdown file (`docs/ALL.md`) |
| `prepare-results.ts` | Copy the canonical result snapshot for the optional web UI |
| `test-checker.mjs` | Run Go checker tests with a local cache directory |

Run via the root package:

```bash
npm run build:checker
npm run prepare-results
npm run combine-docs
```
