# Fingerprinting System

The fingerprinting system determines whether a benchmark cell needs re-execution or is already current.

## What is a Fingerprint?

A fingerprint is a SHA-256 hash that captures the complete state of a (benchmark, size, language) cell. If any input to the cell changes, the fingerprint changes, and the cell is marked stale.

## What is Hashed

The fingerprint includes:

1. **Language manifest** — `languages/<language>.json`
2. **Benchmark manifest** — `benchmarks/<benchmark>/benchmark.json`
3. **Dataset** — path from `sizes.<size>.dataset` under `benchmarks/<benchmark>/datasets/` (may be `.json`, `.csv`, or another extension)
4. **Metrics registry** — `cli/src/metrics.ts`
5. **All implementation source files** — `benchmarks/<benchmark>/implementations/<language>/` (recursive, excluding `node_modules`, `target`, `dist`, `build`, `__pycache__`, `.arena`)
6. **All checker source files** — `checker/` (recursive)
7. **Configuration metadata** — JSON object including:
   - `benchmarkVersion`
   - `measurementContractVersion` (`"1.0.0"`)
   - `size`
   - `warmups` / `iterations`
   - `metrics`
   - `toolchainVersion` / `compilerVersion`

## How it Works

```
fingerprintCell(language, benchmark, size, toolchainVersion, compilerVersion, warmups, iterations)
  → SHA-256(languageManifest + benchmarkManifest + dataset + metricsRegistry
            + implementationSourceTree + checkerSourceTree
            + JSON({benchmarkVersion, measurementContractVersion: "1.0.0", size, warmups, iterations, metrics, toolchainVersion, compilerVersion}))
```

## Cell Status

| Status | Meaning |
|--------|---------|
| `current` | Saved fingerprint matches computed fingerprint |
| `stale` | Fingerprint has changed since last run |
| `missing` | No saved result exists |
| `unavailable` | Implementation or toolchain is missing |

## Incremental Execution

`arena run` only re-executes stale or missing cells. This makes iterative development fast — changing one implementation only re-runs that cell.

```bash
# Run only stale/missing cells
npm run arena -- run

# Force re-run even if current
npm run arena -- run --force

# Force re-run everything
npm run arena -- run --force --all
```

## Fingerprint Invalidation

A cell's fingerprint changes when:
- Any source file in the implementation is modified
- The language manifest is modified
- The benchmark manifest is modified
- The dataset file is modified
- The checker code is modified
- The metrics registry is modified
- The toolchain or compiler version changes
- Warmup or iteration counts change
- The measurement contract version embedded in the fingerprint metadata changes

## Machine Provenance

Results also record machine information (CPU model, OS, architecture, memory). The `results status` command warns when a saved result was measured on a different machine.
