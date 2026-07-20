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

**Size configuration (oneOf):**
- **Simple form:** `dataset`, `warmupIterations`, `measuredIterations`
- **Mutations form:** `mutations` (map of mutation names to `{dataset, seed}`), `warmupIterations`, `measuredIterations`

Benchmarks with multiple dataset variants (shortest-path, word-frequency, record-sorting, matrix-multiplication) use the mutations form. Others use the simple form.

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

**Template variables:** `{projectRoot}`, `{benchmarkId}`, `{benchmarkDir}`, `{implementationDir}`, `{artifact}`, `{inputFile}`, `{outputFile}`, `{protocolVersion}`, `{runId}`, `{size}`

> Template variables `{timingOutputFile}`, `{warmupIterations}`, `{minMeasuredIterations}`, `{maxMeasuredIterations}`, and `{targetRelativeConfidenceInterval}` were used by the legacy protocol (pre-2.0.0). Current harness-timed runs pass these values via the protocol handshake.

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
- `benchmark` — id, version, size; `mutation` is optional (present for mutation benchmarks)
- `dataset` — id and sha256 are required; seed, generatorVersion, and mutation are optional but present in practice
- `language` — id, name, version; compilerVersion and compilerFlags are optional
- `build` — status, durationNanoseconds, command; artifactSizeBytes is optional
- `execution` — uses a `oneOf` with two shapes:
  - **Harness (current):** mode `"harness-timed-persistent-worker"`, measurementContractVersion `"2.0.0"`, measurement object with `mode` (`"adaptive-median-confidence-interval"` or `"fixed"`), `minMeasuredIterations`, `maxMeasuredIterations`, `targetRelativeConfidenceInterval`; summary uses `medianIterationTimeNanoseconds`, `meanIterationTimeNanoseconds`, etc.
  - **Legacy:** mode `"persistent-worker"`, measurementContractVersion `"1.0.0"` or `"1.1.0"`, measurement is a generic object; summary uses `medianKernelTimeNanoseconds`, `minimumKernelTimeNanoseconds`, `p95KernelTimeNanoseconds`, etc.
  Both include `totalProcessDurationNanoseconds`, `warmupIterations`, `measuredIterations`, `samples` (with differing per-sample fields), `metrics`, and optional `startup`, `memory`, `parallel` blocks
- `checker` — language, version, status (enum: accepted / wrong-answer / malformed-output / unsupported-version / checker-error), diagnostics (optional)
- `provenance` — uses a `oneOf` with two shapes:
  - **Harness (current):** fingerprint (sha256 hex), measurementContractVersion `"2.0.0"`, measuredAt, buildFingerprint, artifactSha256, toolchain, machine
  - **Legacy:** fingerprint (sha256 hex), measurementContractVersion `"1.0.0"` or `"1.1.0"`, measuredAt, machine

### Result Data Model Evolution

The `schemaVersion` field at the root of each result snapshot tracks the data model version. The JSON schema validator uses semver range matching, so `schemaVersion: "3.0.0"` passes `^3.0.0`. The CLI currently hardcodes `"3.0.0"`.

| Version | Key Changes |
|---------|-------------|
| `1.0.0` | **Initial schema.** Used `measurementContractVersion: "1.0.0"` or `"1.1.0"`. Execution mode was `persistent-worker` (the implementation measured its own timing). Metrics used `kernelTimeNanoseconds` per sample with `medianKernelTimeNanoseconds` as the primary ranking metric. Provenance was simple: just a fingerprint hash, `measurementContractVersion`, `measuredAt` timestamp, and `machine` info. |
| `2.0.0` | **Mutations & generator versioning.** Added `mutation` support in `benchmark` objects and `seed`, `mutation`, and `generatorVersion` fields in `dataset` objects. Added `targetRelativeConfidenceInterval` to the measurement policy. The `GENERATOR_VERSION` constant (`"2.2.0"`) is written for mutation datasets; non-mutation datasets use `"committed-fixture-1.0.0"`. |
| `3.0.0` (current) | **Harness-timed execution & enhanced provenance.** Added `measurementContractVersion: "2.0.0"` with `harness-timed-persistent-worker` mode (the CLI drives timing externally). Primary metric changed from `medianKernelTimeNanoseconds` to `medianIterationTimeNanoseconds`. Provenance expanded with `buildFingerprint`, `artifactSha256`, and `toolchain` (containing compiler versions, environment snapshot, and target info). |

## implementation-output.schema.json

Base output shape for implementations. Uses conditional validation based on the `benchmark` field to apply benchmark-specific output schemas for **nbody**, **shortest-path**, **aggregation**, **word-frequency**, **record-sorting**, and **matrix-multiplication**. **barrier-wave** is not yet branched in this schema; the Go checker is the authority for that workload's output shape.
