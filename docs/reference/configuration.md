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
      "--timing-output", "{timingOutputFile}",
      "--warmup", "{warmupIterations}",
      "--min-iterations", "{minMeasuredIterations}",
      "--max-iterations", "{maxMeasuredIterations}",
      "--target-relative-ci", "{targetRelativeConfidenceInterval}"
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
- `{timingOutputFile}` — Timing output file path (used by persistent-worker contract)
- `{warmupIterations}` — Number of warmup iterations (integer)
- `{minMeasuredIterations}` — Minimum measured iterations (integer; see `measurement` config)
- `{maxMeasuredIterations}` — Maximum measured iterations (integer; see `measurement` config)
- `{targetRelativeConfidenceInterval}` — Target confidence interval width (number; e.g. `0.05`)
- `{runId}` — Run snapshot ID
- `{size}` — Dataset size name

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

The CLI detects toolchains by running the commands defined in each language manifest's `detect` block (e.g., `rustc --version`, `go version`). It does not read toolchain-specific environment variables like `RUSTC` or `GOPATH`. No custom Runtime Arena environment variables are defined for users.

Internally, Go language builds set `GOCACHE` to `.arena/go-build-cache`, checker compilation (via `build-checker.mjs`) uses `.arena/go-checker-cache`, and checker test runs (via `test-checker.mjs`) use `.arena/go-test-cache`.
