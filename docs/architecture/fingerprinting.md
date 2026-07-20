# Fingerprinting System

The fingerprinting system determines whether a benchmark cell needs re-execution or is already current.

## What is a Fingerprint?

A fingerprint is a SHA-256 hash that captures the complete state of a (benchmark, size, mutation, language) cell. If any input to the cell changes, the fingerprint changes, and the cell is marked stale.

There are two separate fingerprint systems: one for **execution staleness** (`fingerprintCell`) and one for **build caching** (`buildFingerprint` via `collectBuildProvenance`).

## Execution Fingerprint

The execution fingerprint includes:

1. **Language manifest** — `languages/<language>.json`
2. **Benchmark manifest** — `benchmarks/<benchmark>/benchmark.json`
3. **Dataset** — path from `sizes.<size>.dataset`
4. **Metrics registry** — `cli/src/metrics.ts`
5. **Protocol module** — `cli/src/protocol.ts`
6. **Timing module** — `cli/src/timing.ts`
7. **All implementation source files** — `benchmarks/<benchmark>/implementations/<language>/`
8. **All checker source files** — `checker/`
9. **Configuration metadata** — benchmark version, measurement contract `2.0.0`, size, mutation, warmups, measurement policy, metrics, toolchain versions
10. **Build fingerprint** — complete build provenance hash

Legacy results with contract `1.0.0` / `1.1.0` remain readable but are always treated as stale until rerun.

## Build Provenance and Cache

`collectBuildProvenance()` hashes:

- Language manifest and implementation tree
- Declared external inputs (shared headers, build scripts, lockfiles)
- Resolved executable paths and hashes
- Normalized compiler/runtime versions, target triple, compiler flags
- Manifest-declared environment allowlist values

Compiled artifacts are stored in `.arena/build-cache/<buildFingerprint>/` with an atomic `manifest.json` containing schema version, cache fingerprint, expanded command, working directory, environment, toolchain summary, input aggregate hash, artifact path, and artifact SHA-256.

A cache hit requires a present manifest, matching provenance, and verified artifact hash; otherwise the entry is rebuilt atomically.

## Cell Status

| Status | Meaning |
|--------|---------|
| `current` | Saved fingerprint matches computed fingerprint under contract 2.0.0 |
| `stale` | Fingerprint changed or legacy measurement contract |
| `missing` | No saved result exists |
| `unavailable` | Implementation or toolchain is missing |

## Incremental Execution

`arena run` only re-executes stale or missing cells. Legacy rows remain in snapshots until their cells are rerun; v2 results replace matching cells normally.

```bash
npm run arena -- run
npm run arena -- run --force
```
