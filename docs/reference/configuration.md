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
  "execution": {
    "parallelism": 1,
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
| `execution.parallelism` | **Present in config but unused** — the CLI does not read `config.execution`; cells run sequentially |
| `execution.preserveTemporaryFiles` | **Present in config but unused** — use CLI flag `--preserve-temp` instead |

Temp run directories live under `.arena/runs/` and are deleted after each run unless `--preserve-temp` is set. Go builds also use `.arena/go-build-cache` via `GOCACHE`.


## Language Manifests (`languages/*.json`)

Each language has a manifest defining detection, build, and run commands.

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
      "--iterations", "{measuredIterations}"
    ]
  },
  "environment": {},
  "sourceExtensions": [".rs"]
}
```

**Template Variables:**
- `{projectRoot}` — Repository root
- `{benchmarkId}` — Benchmark identifier (e.g., `nbody`)
- `{benchmarkDir}` — Benchmark directory path
- `{implementationDir}` — Implementation directory path
- `{artifact}` — Built binary path
- `{inputFile}` — Input dataset file
- `{outputFile}` — Output file path
- `{timingOutputFile}` — Timing output file path (used by persistent-worker contract)
- `{warmupIterations}` — Number of warmup iterations (integer)
- `{measuredIterations}` — Number of measured iterations (integer)
- `{runId}` — Run snapshot ID
- `{size}` — Dataset size name

## Benchmark Manifests (`benchmarks/*/benchmark.json`)

Each benchmark has a manifest defining sizes, metrics, and limits.

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
    "small": { "dataset": "small.json", "warmupIterations": 1, "measuredIterations": 5 },
    "medium": { "dataset": "medium.json", "warmupIterations": 3, "measuredIterations": 10 },
    "large": { "dataset": "large.json", "warmupIterations": 3, "measuredIterations": 10 }
  },
  "metrics": ["kernelTime"],
  "limits": {
    "timeoutMilliseconds": 120000,
    "maxOutputBytes": 10485760
  }
}
```

## Environment Variables

The CLI detects toolchains by running the commands defined in each language manifest's `detect` block (e.g., `rustc --version`, `go version`). It does not read toolchain-specific environment variables like `RUSTC` or `GOPATH`. No custom Runtime Arena environment variables are defined for users.

Internally, Go builds set `GOCACHE` to `.arena/go-build-cache` under the repository root.
