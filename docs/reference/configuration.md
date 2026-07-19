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
| `execution.parallelism` | Concurrent execution (currently 1) |
| `execution.preserveTemporaryFiles` | Keep temp run directories |

## Language Manifests (`languages/*.json`)

Each language has a manifest defining detection, build, and run commands.

```json
{
  "id": "rust",
  "name": "Rust",
  "enabled": true,
  "detect": { "command": "rustc", "arguments": ["--version"] },
  "build": {
    "command": "cargo",
    "arguments": ["build", "--release"],
    "artifact": "target/release/{benchmarkId}"
  },
  "run": {
    "command": "{artifact}",
    "arguments": ["--input", "{inputFile}", "--output", "{outputFile}"]
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
- `{runId}` — Run snapshot ID
- `{size}` — Dataset size name

## Benchmark Manifests (`benchmarks/*/benchmark.json`)

Each benchmark has a manifest defining sizes, metrics, and limits.

```json
{
  "id": "nbody",
  "name": "N-Body Simulation",
  "version": 1,
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

The CLI respects standard environment variables for each language toolchain (e.g., `RUSTC`, `GOPATH`, `NODE`). No custom environment variables are required.
