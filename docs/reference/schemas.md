# JSON Schemas

All schemas use JSON Schema 2020-12 draft and are located in `schemas/`.

## benchmark.schema.json

Validates benchmark manifests (`benchmarks/*/benchmark.json`).

**Required fields:**
- `id` — Unique benchmark identifier (string)
- `name` — Display name (string)
- `version` — Schema version (integer)
- `sizes` — Map of size names to size configurations
- `limits` — Execution limits

**Size configuration:**
- `dataset` — Filename in `datasets/` directory
- `warmupIterations` — Number of warmup iterations (discarded)
- `measuredIterations` — Number of measured iterations

**Limits:**
- `timeoutMilliseconds` — Per-iteration timeout (default 120000)
- `maxOutputBytes` — Maximum output file size (default 10 MiB)

## language.schema.json

Validates language manifests (`languages/*.json`).

**Required fields:**
- `id` — Unique language identifier (string)
- `name` — Display name (string)
- `enabled` — Whether the language is active (boolean)
- `detect` — Command to detect toolchain availability
- `build` — Command to build implementations
- `run` — Command to run implementations

**Command structure:**
- `command` — Executable name
- `arguments` — Array of argument strings (supports template variables)
- `workingDirectory` — Optional working directory override
- `artifact` — Path to built binary (build command only)

**Template variables:** `{projectRoot}`, `{benchmarkId}`, `{benchmarkDir}`, `{implementationDir}`, `{artifact}`, `{inputFile}`, `{outputFile}`, `{timingOutputFile}`, `{warmupIterations}`, `{measuredIterations}`, `{runId}`, `{size}`

## result.schema.json

Validates result snapshots (`results/current.json`).

**Structure:**
- `schemaVersion` — Currently "3.0.0"
- `snapshotId` — Unique run identifier
- `updatedAt` — ISO 8601 timestamp
- `arenaVersion` — CLI version
- `gitCommit` / `gitDirty` — Git state
- `results[]` — Array of benchmark results

Each result contains:
- `benchmark` — id, version, size
- `dataset` — id, sha256, seed, generatorVersion
- `language` — id, name, version, compilerVersion, compilerFlags
- `build` — status, durationNanoseconds, artifactSizeBytes, command
- `execution` — persistent-worker mode, measurement contract, diagnostic process duration, warmup/measured counts, kernel-time samples, summary, metrics
- `checker` — language, version, status, diagnostics
- `provenance` — fingerprint, measurement contract version, measuredAt, machine

## implementation-output.schema.json

Base output shape for implementations. Uses conditional validation based on the `benchmark` field to apply benchmark-specific output schemas.
