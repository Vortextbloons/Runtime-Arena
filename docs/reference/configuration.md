# Configuration Reference

## arena.config.json

Root runner configuration at the repository root.

```json
{
  "schemaVersion": "1.0.0",
  "benchmarkDirectory": "benchmarks",
  "languageDirectory": "languages",
  "resultDirectory": "results",
  "checkerExecutable": "bin/arena-checker",
  "defaults": {
    "sizes": ["small", "medium", "large"],
    "warmupIterations": 3,
    "measuredIterations": 10,
    "metrics": ["kernelTime"]
  },
  "measurement": {
    "minMeasuredIterations": 10,
    "maxMeasuredIterations": 30,
    "targetRelativeConfidenceInterval": 0.05
  },
  "warmupOverrides": {
    "java": 10,
    "javascript": 8,
    "typescript": 8
  },
  "execution": {
    "parallelism": 2,
    "preserveTemporaryFiles": false
  }
}
```

| Field | Description |
|-------|-------------|
| `benchmarkDirectory` | Directory containing benchmark workloads |
| `languageDirectory` | Directory containing language manifests |
| `resultDirectory` | Directory for result snapshots |
| `checkerExecutable` | Path to the compiled checker binary |
| `defaults.sizes` | Default sizes to run |
| `defaults.warmupIterations` | Default warmup iterations (discarded) |
| `defaults.measuredIterations` | Default measured iterations |
| `defaults.metrics` | Default metrics to record |
| `measurement.minMeasuredIterations` | Minimum iterations per cell (effective floor when a size in `benchmark.json` omits `measuredIterations`; also the fixed count when `--iterations` is used) |
| `measurement.maxMeasuredIterations` | Maximum iterations for adaptive measurement (default 30) |
| `measurement.targetRelativeConfidenceInterval` | Target CI width (default 0.05). Set to 0 for fixed-iteration mode |
| `warmupOverrides` | Optional per-language minimum warmup iteration floors (applied with `max(benchmark warmup, override)` unless `--warmup` is set explicitly) |
| `execution.parallelism` | Number of cells to run concurrently (default: `2`, from `arena.config.json`). Override with `--parallel` flag |
| `execution.preserveTemporaryFiles` | **Present in config but unused** — use CLI flag `--preserve-temp` instead |

Temp run directories live under `.arena/runs/` and are deleted after each run unless `--preserve-temp` is set. Build artifacts are cached in `.arena/build-cache/<fingerprint>/` (keyed on language manifest and implementation source). Go builds also use `.arena/go-build-cache` via `GOCACHE`.


## Language Manifests (`languages/*.json`)

Each language has a manifest defining detection, build, and run commands. The project ships eleven manifests: `c-sharp.json`, `c.json`, `cpp.json`, `go.json`, `java.json`, `javascript.json`, `lua-interpreted.json`, `lua.json`, `python.json`, `rust.json`, and `typescript.json`.

```json
{
  "id": "rust",
  "name": "Rust",
  "enabled": true,
  "detect": { "command": "rustc", "arguments": ["--version"] },
  "build": {
    "workingDirectory": "{implementationDir}",
    "command": "cargo",
    "arguments": ["build", "--release"],
    "artifact": "target/release/{benchmarkId}"
  },
  "run": {
    "command": "{artifact}",
    "arguments": [
      "--input", "{inputFile}",
      "--output", "{outputFile}",
      "--protocol-version", "{protocolVersion}"
    ]
  },
  "environment": {},
  "sourceExtensions": [".rs"]
}
```

Note: Go's build manifest uses `".arena/{benchmarkId}"` as its artifact path to avoid polluting the implementation directory.

**Template Variables:**

Available in both `build` and `run`:
- `{projectRoot}` — Repository root
- `{benchmarkId}` — Benchmark identifier (e.g., `nbody`)
- `{benchmarkDir}` — Benchmark directory path
- `{implementationDir}` — Implementation directory path
- `{artifact}` — Built binary path

Available only in `run`:
- `{inputFile}` — Input dataset file
- `{outputFile}` — Output file path
- `{protocolVersion}` — Harness protocol version (e.g. `"2.0.0"`)
- `{runId}` — Run snapshot ID
- `{size}` — Dataset size name

> Template variables `{timingOutputFile}`, `{warmupIterations}`, `{minMeasuredIterations}`, `{maxMeasuredIterations}`, and `{targetRelativeConfidenceInterval}` were used by the legacy persistent-worker contract (pre-2.0.0). Current harness-timed runs pass these via the protocol handshake instead.

**`resourceBundle`** (optional, present on all manifests as of schema 4.0.0):

```json
{
  "resourceBundle": {
    "sourceInclude": ["**/*.rs"],
    "sourceExclude": ["**/.arena/**", "**/target/**"],
    "artifactInclude": ["**/*"],
    "artifactExclude": []
  }
}
```

Defines glob patterns for resource profiling (`arena resources collect`):
- `sourceInclude` / `sourceExclude` — Which files count toward workload-owned lines of code and source hash
- `artifactInclude` / `artifactExclude` — Which files form the runnable workload bundle (counted by `artifact.fileCount` and `artifact.paths`)

**Provenance block** (optional, present on most manifests):

```json
{
  "provenance": {
    "environmentAllowlist": ["GOCACHE", "GOOS", "GOARCH"],
    "externalInputs": [
      { "path": "{implementationDir}/go.mod" },
      { "path": "{implementationDir}/go.sum" }
    ],
    "probes": [
      { "id": "compiler", "command": "go", "arguments": ["version"] }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `environmentAllowlist` | Environment variable names that may affect the build or run result (used in fingerprinting) |
| `externalInputs` | Paths to files outside the implementation directory that contribute to the fingerprint (e.g. build scripts, lockfiles). `recursive: true` includes a directory tree |
| `probes` | Commands run during fingerprint collection (e.g. compiler version probes). Each has an `id`, `command`, and optional `arguments` |

Default provenance values per language are defined in `languages/protocol/provenance.defaults.json`. The CLI merges these defaults with per-manifest overrides at `discoverLanguages()` time.

C++ implementations use shared headers (JSON parser, SHA-256) bundled at `languages/cpp/include/` and referenced by the build command's include path.

## Benchmark Manifests (`benchmarks/*/benchmark.json`)

Each benchmark has a manifest defining sizes, metrics, and limits.

**Simple form** (single dataset per size):
```json
{
  "id": "nbody",
  "name": "N-Body Simulation",
  "version": 1,
  "description": "Deterministic gravitational simulation exercising numeric computation, tight loops, and floating-point arithmetic.",
  "inputFormat": "json",
  "outputFormat": "json",
  "checker": {
    "task": "nbody",
    "timeoutMilliseconds": 30000
  },
  "sizes": {
    "small": { "dataset": "small.json", "warmupIterations": 2, "measuredIterations": 5 },
    "medium": { "dataset": "medium.json", "warmupIterations": 2 },
    "large": { "dataset": "large.json", "warmupIterations": 2 }
  },
  "metrics": ["kernelTime"],
  "limits": {
    "timeoutMilliseconds": 120000,
    "maxOutputBytes": 10485760
  }
}
```

**Mutations form** (multiple dataset variants per size, used by shortest-path, word-frequency, record-sorting, and matrix-multiplication):
```json
{
  "id": "shortest-path",
  "name": "Shortest Path",
  "version": 1,
  "sizes": {
    "small": {
      "warmupIterations": 2,
      "measuredIterations": 5,
      "mutations": {
        "sparse": { "dataset": "small-sparse.json", "seed": 165410 },
        "dense": { "dataset": "small-dense.json", "seed": 223847 }
      }
    }
  }
}
```

Each mutation entry specifies a `dataset` file path and the `seed` used to generate it. The CLI expands mutations into separate cells, each with its own cell key (`benchmark/size/mutation/language`) and fingerprint.

## Environment Variables

The CLI discovers toolchains by running the commands defined in each language manifest's `detect` block (e.g., `rustc --version`, `go version`). It does **not** read toolchain-specific environment variables like `RUSTC`, `GOPATH`, or `DOTNET_ROOT` for discovery. Some environment variables are read directly by the CLI or its scripts; others are consumed at build/run time by the toolchain itself and are allowlisted in provenance for fingerprint integrity.

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NO_COLOR` | CLI (`index.ts`) | Suppresses ANSI color in results summary output when set |
| `JAVA_HOME` | CLI (`jdk.ts`) | Primary JDK detection path (checked before `PATH`). Also allowlisted in Java's provenance for fingerprinting |
| `PATH` / `Path` | CLI (`env.ts`, `jdk.ts`) | General toolchain discovery and spawn environment. On Windows the CLI copies `Path` into `PATH` for consistency |
| `ProgramFiles` | CLI (`jdk.ts`) | Windows JDK root detection fallback (e.g., `C:\Program Files\Eclipse Adoptium\...`) |
| `ProgramFiles(x86)` | CLI (`jdk.ts`) | Windows JDK detection fallback for 32-bit program files |
| `GOCACHE` | CLI (`index.ts`), scripts | **Set by the CLI**, not read. Go build cache directory at `.arena/go-build-cache`. Script `scripts/build-checker.mjs` sets it to `.arena/go-checker-cache` |
| `GOOS`, `GOARCH` | Language manifest `go.json` | Cross-compilation target; allowlisted in provenance (`environmentAllowlist`) |
| `NODE_ENV` | Language manifests (`javascript.json`, `typescript.json`) | Allowlisted in provenance (`environmentAllowlist`) for Node.js builds |
| `PYTHONHASHSEED` | Language manifest (`python.json`) | Allowlisted in provenance (`environmentAllowlist`) for deterministic hash randomization |

**Notes:**

- **Platform PATH differences:** Windows uses `Path` (capitalized) while Unix uses `PATH`. The `resolveSpawnEnv()` helper in `cli/src/env.ts` copies `Path` to `PATH` on Windows to ensure spawned processes always see a `PATH` variable.
- **No `RUNTIME_ARENA_*` variables:** The project defines no custom Runtime Arena-specific environment variables.
- **Script-level usage:**
  - `scripts/build-java.mjs` reads `JAVA_HOME` via the `jdkPathEnvironment()` utility for JDK discovery and compiles with `javac`/`jar` from the discovered JDK.
  - `scripts/build-checker.mjs` sets `GOCACHE` to `.arena/go-checker-cache` in the build environment for the Go checker binary.
- **Provenance allowlisting:** Environment variables listed in a language manifest's `provenance.environmentAllowlist` are captured into the result's `provenance.toolchain.environment` at fingerprinting time. Variables outside this list do not affect the fingerprint, so changing them does not invalidate cached results.
