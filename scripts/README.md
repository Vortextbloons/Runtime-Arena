# Scripts

Utility scripts for the arena monorepo.

| Script | Purpose |
|--------|---------|
| `build-checker.mjs` | Compile the Go checker binary to `bin/arena-checker[.exe]` |
| `build-java.mjs` | Compile Java benchmark implementations into standalone JARs using `javac` + `jar` |
| `combine-docs.mjs` | Combine all docs into a single markdown file (`docs/ALL.md`) |
| `count-implementation-loc.mjs` | Count logical source lines per benchmark implementation and write `web/src/lib/data/implementation-lines.json` |
| `prepare-results.ts` | Copy the canonical result snapshot for the optional web UI |
| `resolve-jdk.mjs` | JDK resolution utility — locate a JDK bin directory and tool paths (used by `build-java.mjs` and the CLI) |
| `scorecard.mjs` | Generate `scorecard.md` with full scoring, tiered rankings, badges, and per-language card profiles |
| `sync-badge-defs.mjs` | Read `shared/badge-definitions.json` and generate `web/src/lib/cards/shared.ts` for the web UI |
| `test-checker.mjs` | Run Go checker tests with a local cache directory |
| `update-readme-results.mjs` | Update the README.md results table from `results/current.json` |

Run via the root package:

```bash
npm run build:checker        # scripts/build-checker.mjs
npm run count-loc            # scripts/count-implementation-loc.mjs
npm run prepare-results      # scripts/prepare-results.ts (also runs count-loc)
npm run sync-defs            # scripts/sync-badge-defs.mjs
npm run combine-docs         # scripts/combine-docs.mjs
npm run scorecard            # scripts/scorecard.mjs
npm test                     # also runs count-implementation-loc.test.mjs and test-checker.mjs
```

Scripts not directly exposed as npm scripts:

| Script | How to run |
|--------|------------|
| `build-java.mjs` | Called internally by Java language build configs (not a direct npm script) |
| `resolve-jdk.mjs` | Imported by `build-java.mjs` and the CLI's JDK detection (no standalone npm script) |
| `update-readme-results.mjs` | `node scripts/update-readme-results.mjs` (no npm script alias) |

There is no `verify-environment` script; use `npm run doctor` / `npm run arena -- doctor` for toolchain checks.
