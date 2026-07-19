# JSON Schemas

All schemas use JSON Schema 2020-12 draft and are located in `schemas/`.

## benchmark.schema.json

Validates benchmark manifests (`benchmarks/*/benchmark.json`).

**Required fields:**
- `id` — Unique benchmark identifier (string, lowercase kebab-case)
- `name` — Display name (string)
- `version` — Version number (integer, minimum 1)
- `description` — Description of the workload (string)
- `inputFormat` — Input format (`"json"`, `"csv"`, or `"binary"`)
- `outputFormat` — Output format (`"json"`)
- `checker` — Checker configuration with `task` (string) and `timeoutMilliseconds` (integer)
- `sizes` — Map of size names to size configurations
- `metrics` — Array of metric names to record
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
- `id` — Unique language identifier (string, lowercase kebab-case)
- `name` — Display name (string)
- `enabled` — Whether the language is active (boolean)
- `detect` — Command to detect toolchain availability
- `build` — Command to build implementations
- `run` — Command to run implementations
- `sourceExtensions` — Array of file extensions (e.g., `[".rs"]`)

**Command structure:**
- `command` — Executable name
- `arguments` — Array of argument strings (supports template variables)
- `workingDirectory` — Working directory override (required on `build`, optional on `run`)
- `artifact` — Path to built binary (build command only, required)

**Build command** additionally requires `workingDirectory`.

**Template variables:** `{projectRoot}`, `{benchmarkId}`, `{benchmarkDir}`, `{implementationDir}`, `{artifact}`, `{inputFile}`, `{outputFile}`, `{timingOutputFile}`, `{warmupIterations}`, `{measuredIterations}`, `{runId}`, `{size}`

## result.schema.json

Validates result snapshots (`results/current.json`).

**Structure:**
- `schemaVersion` — Semver string; the schema validates against `^\d+\.\d+\.\d+$` (the CLI currently writes `"3.0.0"`)
- `snapshotId` — Unique run identifier
- `updatedAt` — ISO 8601 timestamp
- `arenaVersion` — Protocol version written into snapshots (CLI currently hardcodes `"0.2.0"`; may differ from npm `package.json` version)
- `gitCommit` / `gitDirty` — Git state (both nullable)
- `results[]` — Array of benchmark results

Each result is required to contain:
- `benchmark` — id, version, size
- `dataset` — id and sha256 are required; seed and generatorVersion are optional but present in practice
- `language` — id, name, version; compilerVersion and compilerFlags are optional
- `build` — status, durationNanoseconds, command; artifactSizeBytes is optional
- `execution` — mode (always `"persistent-worker"`), measurementContractVersion (`"1.0.0"`), totalProcessDurationNanoseconds, warmupIterations, measuredIterations, samples, summary (includes `validSamples`, `rejectedSamples`, `medianKernelTimeNanoseconds`, `meanKernelTimeNanoseconds`, `minimumKernelTimeNanoseconds`, `maximumKernelTimeNanoseconds`, `standardDeviationKernelTimeNanoseconds`, `p95KernelTimeNanoseconds`, `interquartileRangeKernelTimeNanoseconds`), metrics
- `checker` — language, version, status (enum: accepted / wrong-answer / malformed-output / unsupported-version / checker-error), diagnostics (optional)
- `provenance` — fingerprint (sha256 hex), measurementContractVersion (`"1.0.0"`), measuredAt, machine (os, cpu, memoryBytes)

## implementation-output.schema.json

Base output shape for implementations. Uses conditional validation based on the `benchmark` field to apply benchmark-specific output schemas for **nbody**, **shortest-path**, **aggregation**, **word-frequency**, **record-sorting**, and **matrix-multiplication**. **barrier-wave** is not yet branched in this schema; the Go checker is the authority for that workload's output shape.
