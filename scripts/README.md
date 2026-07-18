# Scripts

Utility scripts for the arena monorepo (to be implemented with the CLI).

| Script | Purpose |
|--------|---------|
| `verify-environment.ts` | Report missing toolchains, invalid manifests, checker availability |
| `prepare-results.ts` | Sync or publish result JSON for the optional web UI |

Run via the root package:

```bash
npm run verify-environment
npm run prepare-results
```
