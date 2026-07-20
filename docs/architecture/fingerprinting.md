# Fingerprinting System

The fingerprinting system determines whether a benchmark cell needs re-execution or is already current.

## What is a Fingerprint?

A fingerprint is a SHA-256 hash that captures the complete state of a (benchmark, size, language) cell. If any input to the cell changes, the fingerprint changes, and the cell is marked stale.

There are two separate fingerprint systems: one for **execution staleness** (`fingerprintCell`) and one for **build caching** (`buildFingerprint`).

## What is Hashed (Execution Fingerprint)

The execution fingerprint (`fingerprintCell`) includes:

1. **Language manifest** — `languages/<language>.json`
2. **Benchmark manifest** — `benchmarks/<benchmark>/benchmark.json`
3. **Dataset** — path from `sizes.<size>.dataset` under `benchmarks/<benchmark>/datasets/` (may be `.json`, `.csv`, or another extension)
4. **Metrics registry** — `cli/src/metrics.ts`
5. **Timing validation module** — `cli/src/timing.ts`
6. **All implementation source files** — `benchmarks/<benchmark>/implementations/<language>/` (recursive, excluding `node_modules`, `target`, `dist`, `build`, `__pycache__`, `.arena`)
7. **All checker source files** — `checker/` (recursive)
8. **Configuration metadata** — JSON object including:
   - `benchmarkVersion`
   - `measurementContractVersion` (`"1.1.0"`)
   - `size`
   - `mutation`
   - `warmups` / `measurement` (the full measurement policy object)
   - `metrics`
   - `toolchainVersion` / `compilerVersion`

## How it Works

```
fingerprintCell(language, benchmark, size, mutation, datasetFile, toolchainVersion, compilerVersion, warmups, measurement)
  → SHA-256(languageManifest + benchmarkManifest + dataset + metricsRegistry + timingModule
            + implementationSourceTree + checkerSourceTree
            + JSON({benchmarkVersion, measurementContractVersion: "1.1.0", size, mutation, warmups, measurement, metrics, toolchainVersion, compilerVersion}))
```

## Build Cache Fingerprint

Build caching uses a separate `buildFingerprint()` function that hashes fewer inputs than the execution fingerprint:

```
buildFingerprint(language, benchmark)
  → SHA-256(languageManifest + implementationSourceTree + JSON({benchmarkId, build}))
```

This fingerprint is used only to decide whether a compiled artifact can be reused. The hashed inputs are:

1. **Language manifest** — `languages/<language>.json`
2. **All implementation source files** — `benchmarks/<benchmark>/implementations/<language>/` (recursive, excluding the same patterns as the execution fingerprint)
3. **Benchmark ID and build config** — `{benchmarkId, build}` where `build` includes the language's build command, arguments, artifact template, and working directory

### Cache Storage

Compiled artifacts are stored in `.arena/build-cache/<buildFingerprint>/`:
- On a **cache miss**, `buildOne()` compiles the implementation, then copies the resulting artifact into the cache directory
- On a **cache hit**, the cached artifact is restored via `copyFile()` to the expected output location, skipping the compilation step entirely

### Build Cache Invalidation

The build fingerprint changes when:
- Any source file in the implementation is modified
- The language manifest is modified
- The benchmark ID changes (a different workload produces a different artifact)
- The build command, arguments, artifact path, or working directory changes

Changes that **do not** invalidate the build cache (but do invalidate the execution fingerprint): dataset, checker source, metrics registry, toolchain/compiler version, warmup or iteration counts, or benchmark version metadata.

## Cell Status

| Status | Meaning |
|--------|---------|
| `current` | Saved fingerprint matches computed fingerprint |
| `stale` | Fingerprint has changed since last run |
| `missing` | No saved result exists |
| `unavailable` | Implementation or toolchain is missing |

## Incremental Execution

`arena run` only re-executes stale or missing cells. This makes iterative development fast — changing one implementation only re-runs that cell.

Accepted **and** failed/invalid results are retained with their fingerprint. A wrong-answer or build-failed cell stays current until its fingerprint changes or you pass `--force`. One failed build does not cancel other cells in the same run.

```bash
# Run only stale/missing cells
npm run arena -- run

# Force re-run even if current
npm run arena -- run --force

# Force re-run everything
npm run arena -- run --force --all
```

Java toolchains are discovered via `JAVA_HOME`, `PATH`, or common install locations (Adoptium, Oracle/OpenJDK, Microsoft JDK) so JDK installs that are not on `PATH` still run.

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
