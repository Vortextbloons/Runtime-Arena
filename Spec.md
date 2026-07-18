# Runtime Arena — Project Specification

## 1. Purpose

Runtime Arena is an extensible cross-language benchmarking system for comparing programming language implementations under identical workloads.

The system must:

* Run equivalent benchmark tasks in multiple languages.
* Measure execution performance and resource usage.
* Validate every result using a shared external checker.
* Print results through a command-line interface.
* Save machine-readable JSON results.
* Optionally display saved results through a web interface.
* Make adding languages, benchmarks, datasets, and metrics straightforward.

The initial supported languages are:

* Rust
* Go
* TypeScript running on Node.js

The command-line interface is the primary product. The web interface is optional and must not be required to run benchmarks.

---

## 2. Core Principles

### 2.1 Equivalent workloads

Every language implementation must:

* Receive the same input.
* Perform the same defined computation.
* Produce the same output format.
* Be validated by the same checker.
* Run under clearly documented constraints.

### 2.2 Validation outside timing

The checker must run after the benchmark process completes.

Checker execution time must not be included in benchmark execution time.

### 2.3 Reproducibility

Every result must record:

* Benchmark version
* Source revision
* Language and runtime version
* Compiler version
* Compiler flags
* Operating system
* CPU information
* Memory information
* Dataset identifier
* Dataset hash
* Checker version
* Raw timing samples

### 2.4 Extensibility

The system must avoid hard-coded logic for individual languages or benchmarks where possible.

Adding a language should normally require:

1. A language manifest.
2. Build and run commands.
3. One implementation directory per benchmark.

Adding a benchmark should normally require:

1. A benchmark manifest.
2. An input generator.
3. A checker implementation.
4. Implementations for supported languages.

---

# 3. System Architecture

```text
CLI
 ├── discovers language manifests
 ├── discovers benchmark manifests
 ├── builds selected implementations
 ├── generates or loads datasets
 ├── executes benchmark processes
 ├── collects metrics
 ├── invokes external checker
 ├── prints terminal results
 └── writes versioned JSON results

Optional Web UI
 └── reads generated JSON result files
```

The benchmark implementations, checker, runner, and web interface must remain separate components.

---

# 4. Recommended Repository Structure

```text
runtime-arena/
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── Spec.md
├── arena.config.json
│
├── cli/
│   ├── src/
│   │   ├── commands/
│   │   ├── discovery/
│   │   ├── execution/
│   │   ├── metrics/
│   │   ├── reporting/
│   │   ├── results/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── checker/
│   ├── cmd/
│   │   └── arena-checker/
│   ├── internal/
│   │   ├── benchmarks/
│   │   ├── output/
│   │   └── validation/
│   └── go.mod
│
├── bin/
│   └── arena-checker          # built Go checker binary
│
├── benchmarks/
│   ├── nbody/
│   │   ├── benchmark.json
│   │   ├── README.md
│   │   ├── datasets/
│   │   ├── generator/
│   │   └── implementations/
│   │       ├── rust/
│   │       ├── go/
│   │       └── typescript/
│   │
│   ├── shortest-path/
│   │   └── ...
│   │
│   └── aggregation/
│       └── ...
│
├── languages/
│   ├── rust.json
│   ├── go.json
│   └── typescript.json
│
├── schemas/
│   ├── benchmark.schema.json
│   ├── language.schema.json
│   ├── implementation-output.schema.json
│   └── result.schema.json
│
├── results/
│   ├── latest.json
│   ├── index.json
│   └── runs/
│       └── <run-id>.json
│
├── web/
│   ├── src/
│   ├── static/
│   │   └── results/
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
│
└── scripts/
    ├── prepare-results.ts
    └── verify-environment.ts
```

The root `package.json` uses npm workspaces for `cli` and `web`.

---

# 5. Technology Choices

## 5.1 CLI and benchmark runner

Use TypeScript 7 with Node.js.

Reasons:

* TypeScript is already one of the benchmarked languages.
* It is suitable for process orchestration.
* It provides strong typing for manifests and result schemas.
* It integrates naturally with the optional SvelteKit interface.
* Node.js provides mature process and filesystem APIs.

The CLI package lives under `cli/` in an npm workspaces monorepo. Compile target is ES2024 with NodeNext module resolution.

The CLI must not use its own execution performance as a benchmark result.

## 5.2 Checker

Use Go for the independent checker.

Reasons:

* Produces a self-contained executable.
* Fast startup.
* Strong standard-library support for JSON, hashing, files, and numeric validation.
* Easy cross-platform compilation.
* Checker deployment does not require Node package installation.
* Avoids using the TypeScript runner as both orchestrator and validator.

The checker module is `github.com/runtime-arena/checker` under `checker/`, with language version `go 1.26`. The built binary is written to `bin/arena-checker`.

The checker must be treated as trusted infrastructure and must never share implementation code with benchmark submissions.

## 5.3 Optional web interface

Use SvelteKit with TypeScript, Vite, and `@sveltejs/adapter-static`.

The web application must be statically buildable and must only read generated result JSON.

It must not be required for:

* Running benchmarks
* Checking correctness
* Generating reports
* Viewing terminal summaries

## 5.4 Required development toolchains

Minimum versions for building and running the arena itself (not soft recommendations):

| Tool | Minimum | Role |
|------|---------|------|
| Node.js | 26.4 | CLI runner, TypeScript benchmark runtime, npm scripts |
| npm | 11.17 | Workspaces and package installs |
| TypeScript | 7.0 | CLI and web typing / compilation |
| Go | 1.26 | Checker |
| Rust (rustc + cargo) | 1.97 | Rust benchmark implementations |

`arena doctor` must treat versions below these minima as unsupported for the affected component, while still allowing unrelated languages to run.

---

# 6. Command-Line Interface

The executable should be named:

```bash
arena
```

## 6.1 Primary command

```bash
arena run
```

This command must:

1. Discover available languages and benchmarks.
2. Validate configuration.
3. Build selected implementations.
4. Generate or load benchmark inputs.
5. Run warm-up iterations when configured.
6. Run measured iterations.
7. Collect configured metrics.
8. Validate each output using the checker.
9. Print a terminal summary.
10. Save a versioned JSON result file.
11. Update `results/latest.json`.
12. Update `results/index.json`.

Example:

```bash
arena run
```

## 6.2 Filtering

```bash
arena run --language rust
arena run --language rust --language go
arena run --benchmark nbody
arena run --benchmark shortest-path --size large
```

Aliases may also be supported:

```bash
arena run -l rust -b nbody
```

## 6.3 Iterations

```bash
arena run --iterations 10
arena run --warmup 3 --iterations 10
```

Benchmark manifests may define defaults, which command-line flags override.

## 6.4 Output modes

Default human-readable output:

```bash
arena run
```

JSON written to standard output:

```bash
arena run --format json
```

Compact machine-readable output:

```bash
arena run --format json --quiet
```

Explicit output file:

```bash
arena run --output results/custom-run.json
```

Disable saved result files:

```bash
arena run --no-save
```

## 6.5 Discovery commands

```bash
arena list languages
arena list benchmarks
arena list metrics
```

Example (versions reflect the detected local toolchain):

```text
Languages
  rust         available   rustc 1.97.0
  go           available   go 1.26.5
  typescript   available   node 26.4.0
```

## 6.6 Environment validation

```bash
arena doctor
```

This command must report:

* Missing runtimes
* Missing compilers
* Unsupported versions (below the minima in §5.4)
* Invalid manifests
* Missing benchmark implementations
* Checker availability
* Write permission problems
* Dataset problems

A missing or unsupported language toolchain must not prevent unrelated languages from running.

## 6.7 Build-only command

```bash
arena build
arena build --language rust
arena build --benchmark nbody
```

## 6.8 Validate existing output

```bash
arena check \
  --benchmark shortest-path \
  --input path/to/input.json \
  --output path/to/output.json
```

## 6.9 View saved results

Terminal view:

```bash
arena results latest
arena results show <run-id>
arena results list
```

Optional web view:

```bash
arena web
```

This may start a localhost server, but it must remain separate from benchmark execution.

---

# 7. Terminal Output

The default CLI output should be readable without the web interface.

Example:

```text
Runtime Arena
Run: 2026-07-18T14:30:00Z
Machine: AMD Ryzen 9 9950X, 32 threads, 64 GB RAM

Benchmark: nbody / medium
Iterations: 10 measured, 3 warm-up

Language      Correct   Median      Min         P95         Memory
Rust          Yes       412.8 ms    408.4 ms    421.3 ms    42.1 MB
Go            Yes       538.2 ms    531.9 ms    549.8 ms    47.8 MB
TypeScript    Yes       2.481 s     2.446 s     2.529 s     91.4 MB

Relative speed
Rust          1.00×
Go            1.30×
TypeScript    6.01×

Saved: results/runs/2026-07-18T14-30-00Z.json
```

Incorrect results must not receive a performance ranking.

Example:

```text
TypeScript    No        INVALID OUTPUT
```

---

# 8. Initial Benchmarks

The initial suite should contain three benchmarks that exercise different runtime characteristics.

## 8.1 N-body simulation

Purpose:

* Numeric computation
* Tight loops
* Floating-point arithmetic
* Function call overhead
* Runtime optimization

Input:

```json
{
  "steps": 1000000,
  "deltaTime": 0.01,
  "bodies": [...]
}
```

Required output:

```json
{
  "benchmark": "nbody",
  "version": 1,
  "bodyCount": 5,
  "finalEnergy": -0.169075164,
  "positionChecksum": "...",
  "velocityChecksum": "..."
}
```

Checker behavior:

* Validate schema.
* Recompute or independently verify expected state.
* Compare floating-point values using documented tolerances.
* Verify deterministic checksums.

## 8.2 Weighted shortest-path queries

Purpose:

* Graph algorithms
* Priority queues
* Memory access
* Dynamic data structures
* Branch-heavy workloads

Input:

* Directed weighted graph
* Nonnegative integer edge weights
* Source and destination query pairs

Required output:

```json
{
  "benchmark": "shortest-path",
  "version": 1,
  "results": [
    {
      "queryId": 1,
      "distance": 924,
      "path": [12, 44, 81, 93]
    }
  ]
}
```

Checker behavior:

* Verify path starts and ends at the required vertices.
* Verify every submitted edge exists.
* Calculate submitted path cost.
* Verify reported cost.
* Verify global optimality.
* Permit different paths with equal optimal cost.

## 8.3 Structured-data aggregation

Purpose:

* Parsing
* Allocation
* Hash maps
* Sorting
* Garbage collection
* General data processing

Input records:

```text
timestamp,account_id,category,quantity,unit_price
```

Required calculations:

* Record count
* Total quantity
* Total monetary value
* Totals by category
* Minimum transaction
* Maximum transaction
* Top accounts by aggregate value
* Hash of sorted aggregate output

Required output:

```json
{
  "benchmark": "aggregation",
  "version": 1,
  "recordCount": 10000000,
  "totalQuantity": 48199291,
  "totalValueMinorUnits": 9581294421,
  "categories": [...],
  "topAccounts": [...],
  "checksum": "..."
}
```

Use integer minor currency units instead of floating-point currency values.

---

# 9. Benchmark Manifest

Every benchmark must contain a `benchmark.json` manifest.

Example:

```json
{
  "id": "nbody",
  "name": "N-body simulation",
  "version": 1,
  "description": "Deterministic gravitational simulation.",
  "inputFormat": "json",
  "outputFormat": "json",
  "checker": {
    "task": "nbody",
    "timeoutMilliseconds": 30000
  },
  "sizes": {
    "small": {
      "dataset": "small.json",
      "warmupIterations": 1,
      "measuredIterations": 5
    },
    "medium": {
      "dataset": "medium.json",
      "warmupIterations": 3,
      "measuredIterations": 10
    },
    "large": {
      "dataset": "large.json",
      "warmupIterations": 3,
      "measuredIterations": 10
    }
  },
  "metrics": [
    "wallTime",
    "cpuTime",
    "peakMemory"
  ],
  "limits": {
    "timeoutMilliseconds": 120000,
    "maxOutputBytes": 10485760
  }
}
```

The runner must discover benchmarks by scanning the benchmark directory for valid manifests.

---

# 10. Language Manifest

Each language must have a manifest under `languages/`.

Example Rust manifest:

```json
{
  "id": "rust",
  "name": "Rust",
  "enabled": true,
  "detect": {
    "command": "rustc",
    "arguments": ["--version"]
  },
  "build": {
    "workingDirectory": "{implementationDir}",
    "command": "cargo",
    "arguments": ["build", "--release"],
    "artifact": "target/release/{benchmarkId}"
  },
  "run": {
    "command": "{artifact}",
    "arguments": [
      "--input",
      "{inputFile}",
      "--output",
      "{outputFile}"
    ]
  },
  "environment": {},
  "sourceExtensions": [".rs"]
}
```

Example Go manifest:

```json
{
  "id": "go",
  "name": "Go",
  "enabled": true,
  "detect": {
    "command": "go",
    "arguments": ["version"]
  },
  "build": {
    "workingDirectory": "{implementationDir}",
    "command": "go",
    "arguments": [
      "build",
      "-o",
      "{artifact}",
      "."
    ],
    "artifact": ".arena/{benchmarkId}"
  },
  "run": {
    "command": "{artifact}",
    "arguments": [
      "--input",
      "{inputFile}",
      "--output",
      "{outputFile}"
    ]
  },
  "environment": {},
  "sourceExtensions": [".go"]
}
```

Example TypeScript manifest:

```json
{
  "id": "typescript",
  "name": "TypeScript",
  "enabled": true,
  "detect": {
    "command": "node",
    "arguments": ["--version"]
  },
  "build": {
    "workingDirectory": "{implementationDir}",
    "command": "npm",
    "arguments": ["run", "build"],
    "artifact": "dist/index.js"
  },
  "run": {
    "command": "node",
    "arguments": [
      "{artifact}",
      "--input",
      "{inputFile}",
      "--output",
      "{outputFile}"
    ]
  },
  "environment": {
    "NODE_ENV": "production"
  },
  "sourceExtensions": [".ts"]
}
```

Supported placeholders should include:

```text
{projectRoot}
{benchmarkId}
{benchmarkDir}
{implementationDir}
{inputFile}
{outputFile}
{artifact}
{runId}
{size}
```

---

# 11. Implementation Contract

Every benchmark implementation must behave as an independent executable.

Required arguments:

```bash
implementation \
  --input <input-file> \
  --output <output-file>
```

Required behavior:

* Read only the provided input.
* Perform the required computation.
* Write exactly one result file.
* Exit with code `0` on successful computation.
* Exit nonzero on implementation failure.
* Write logs only to standard error.
* Never print result data to standard output unless explicitly configured.
* Never invoke the checker.
* Never modify the input.
* Never access result data from previous runs.

The benchmark timer starts immediately before process launch and ends after process exit.

Input generation, compilation, checker execution, and report generation must not be included in execution timing.

---

# 12. Checker Contract

The checker executable should support:

```bash
arena-checker check \
  --benchmark <benchmark-id> \
  --input <input-file> \
  --output <implementation-output-file>
```

Checker result:

```json
{
  "status": "accepted",
  "benchmark": "nbody",
  "checkerVersion": "1.0.0",
  "diagnostics": []
}
```

Supported statuses:

```text
accepted
wrong-answer
malformed-output
unsupported-version
checker-error
```

Exit codes:

```text
0 = accepted
1 = wrong answer
2 = malformed output
3 = unsupported format or version
4 = checker internal failure
```

The checker must:

* Enforce output size limits.
* Reject missing fields.
* Reject duplicate or unexpected fields when strict mode is enabled.
* Reject invalid numeric values.
* Reject NaN or infinity unless a benchmark explicitly permits them.
* Validate benchmark and schema versions.
* Produce useful diagnostics.
* Avoid executing code from benchmark outputs.

---

# 13. Metrics System

Metrics must be independently registered so new measurements can be added without changing benchmark implementations.

Initial metrics:

* Wall-clock execution time
* CPU time
* Peak resident memory
* Exit code
* Output size
* Build time
* Build artifact size
* Correctness result

Possible future metrics:

* Startup time
* Steady-state time
* User CPU time
* System CPU time
* Allocations
* Garbage-collection pauses
* Energy usage
* Context switches
* Cache misses
* Branch misses
* Binary startup memory
* Throughput
* Latency percentiles

Metric interface concept:

```ts
interface MetricCollector {
  id: string;

  isSupported(context: ExecutionContext): Promise<boolean>;

  beforeRun(
    context: ExecutionContext
  ): Promise<MetricSession>;

  afterRun(
    session: MetricSession,
    processResult: ProcessResult
  ): Promise<MetricResult>;
}
```

Unsupported metrics must be reported as unavailable rather than failing the entire benchmark.

---

# 14. Execution Model

For each selected benchmark, language, dataset, and iteration:

```text
1. Validate language availability
2. Build implementation if necessary
3. Prepare isolated working directory
4. Copy or reference immutable input
5. Start metric collectors
6. Launch implementation process
7. Enforce timeout and output limits
8. Stop metric collectors
9. Invoke Go checker
10. Record validity and measurements
11. Remove temporary files unless preservation is requested
```

A measured result is eligible for ranking only when:

* The process exits successfully.
* The output passes the checker.
* Required metrics were collected successfully.

---

# 15. Warm-Up and Runtime Categories

The system must support both cold and warm execution modes.

## 15.1 Cold execution

Each iteration starts a new process.

This measures:

* Runtime startup
* Program initialization
* Workload execution

## 15.2 Warm execution

A future persistent-process protocol may allow multiple workloads to execute in one process.

This is useful for JIT runtimes such as Node.js.

Initial implementation may use repeated fresh processes with unmeasured warm-up iterations.

Results must clearly identify the mode:

```json
{
  "executionMode": "cold-process"
}
```

Possible future values:

```text
cold-process
warmed-process
persistent-worker
```

Cold and warm results must not be merged into one ranking.

---

# 16. Dataset Generation

Datasets must be deterministic.

Each generated dataset must record:

* Benchmark identifier
* Benchmark version
* Size
* Seed
* Generator version
* SHA-256 hash

Example:

```json
{
  "benchmark": "shortest-path",
  "version": 1,
  "size": "large",
  "seed": 729418,
  "generatorVersion": "1.0.0",
  "sha256": "..."
}
```

The CLI should eventually support:

```bash
arena dataset generate --benchmark shortest-path --size large --seed 729418
```

Pre-generated datasets may be committed or distributed separately.

---

# 17. Result JSON

Every run must generate an immutable result file.

Suggested location:

```text
results/runs/<run-id>.json
```

Example structure:

```json
{
  "schemaVersion": "1.0.0",
  "runId": "2026-07-18T14-30-00Z",
  "createdAt": "2026-07-18T14:30:00Z",
  "arenaVersion": "0.1.0",
  "gitCommit": "a12bc34",
  "command": [
    "arena",
    "run"
  ],
  "environment": {
    "operatingSystem": {
      "platform": "linux",
      "release": "..."
    },
    "cpu": {
      "model": "...",
      "architecture": "x64",
      "logicalCores": 16
    },
    "memoryBytes": 34359738368
  },
  "results": [
    {
      "benchmark": {
        "id": "nbody",
        "version": 1,
        "size": "medium"
      },
      "dataset": {
        "id": "nbody-medium-1",
        "sha256": "...",
        "seed": 4812
      },
      "language": {
        "id": "rust",
        "name": "Rust",
        "version": "rustc ..."
      },
      "build": {
        "status": "success",
        "durationNanoseconds": 4280000000,
        "artifactSizeBytes": 934912,
        "command": [
          "cargo",
          "build",
          "--release"
        ]
      },
      "execution": {
        "mode": "cold-process",
        "warmupIterations": 3,
        "measuredIterations": 10,
        "samples": [
          {
            "iteration": 1,
            "valid": true,
            "wallTimeNanoseconds": 942400000,
            "cpuTimeNanoseconds": 931500000,
            "peakMemoryBytes": 183500800,
            "exitCode": 0,
            "outputSizeBytes": 318
          }
        ],
        "summary": {
          "validSamples": 10,
          "medianWallTimeNanoseconds": 941200000,
          "minimumWallTimeNanoseconds": 938100000,
          "maximumWallTimeNanoseconds": 948300000,
          "p95WallTimeNanoseconds": 947900000
        }
      },
      "checker": {
        "language": "go",
        "version": "1.0.0",
        "status": "accepted",
        "diagnostics": []
      }
    }
  ]
}
```

Use explicit units in field names.

Do not use ambiguous properties such as:

```json
{
  "time": 531
}
```

---

# 18. Result Files

```text
results/
├── latest.json
├── index.json
└── runs/
    ├── 2026-07-18T14-30-00Z.json
    └── 2026-07-19T09-10-00Z.json
```

`latest.json` should contain either:

* A copy of the newest complete result, or
* A small pointer object containing its run ID and path.

`index.json` should contain lightweight run metadata:

```json
{
  "schemaVersion": "1.0.0",
  "runs": [
    {
      "runId": "2026-07-18T14-30-00Z",
      "createdAt": "2026-07-18T14:30:00Z",
      "path": "runs/2026-07-18T14-30-00Z.json",
      "benchmarks": [
        "nbody",
        "shortest-path",
        "aggregation"
      ],
      "languages": [
        "rust",
        "go",
        "typescript"
      ]
    }
  ]
}
```

Never discard raw timing samples when generating summaries.

---

# 19. Statistics

For each valid implementation, calculate:

* Minimum
* Maximum
* Median
* Arithmetic mean
* Standard deviation
* p95
* Interquartile range
* Number of valid samples
* Number of rejected samples

The primary ranking metric should be median wall-clock time.

Relative speed:

```text
implementation median / fastest valid median
```

Example:

```text
Rust        1.00×
Go          1.31×
TypeScript  6.01×
```

Overall scores should not be the default presentation.

When an overall score is provided, its formula and weighting must be visible.

---

# 20. Extending Languages

To add a new language:

1. Add `languages/<language-id>.json`.
2. Define detection, build, and run commands.
3. Add an implementation directory under each supported benchmark.
4. Run `arena doctor`.
5. Run the benchmark conformance tests.

No central language switch statement should be required.

Language-specific customization may be supported through optional adapters, but manifest-only integration should be the default.

---

# 21. Extending Benchmarks

To add a new benchmark:

1. Create `benchmarks/<benchmark-id>/`.
2. Add `benchmark.json`.
3. Define input and output schemas.
4. Add deterministic datasets or a generator.
5. Implement checker logic in Go.
6. Add implementations for selected languages.
7. Add benchmark conformance tests.

The CLI must discover the benchmark automatically.

---

# 22. Extending Metrics

Metrics should be configured in benchmark or global configuration:

```json
{
  "metrics": [
    "wallTime",
    "cpuTime",
    "peakMemory"
  ]
}
```

Adding a metric should require:

1. A metric collector implementation.
2. Registration in the metric registry.
3. Result-schema support.
4. Platform-support detection.

Benchmark implementations must not require modification.

---

# 23. Optional SvelteKit Web Interface

The web interface must read existing JSON files and must never be the source of benchmark truth.

Use SvelteKit with `@sveltejs/adapter-static` so the UI is statically deployable. Package versions should track current stable Svelte 5 / Kit / Vite releases used by the monorepo.

Initial pages:

```text
/                       Latest run
/runs                   Historical runs
/runs/<run-id>          Exact run details
/benchmarks/<id>        Benchmark comparison
/languages/<id>         Language results
/compare                 User-selected comparisons
/methodology             Benchmark rules
```

Initial capabilities:

* Sort by execution time.
* Sort by memory use.
* Filter by benchmark.
* Filter by language.
* Switch between dataset sizes.
* Show correctness status.
* Show absolute values.
* Show relative multipliers.
* Show raw sample distributions.
* Show environment and toolchain details.
* Compare historical runs.

Animations may include:

* Bar transitions when metrics change.
* Animated reordering when rankings change.
* Run-to-run performance transitions.
* Optional compressed race visualization.

Animations must:

* Be optional.
* Respect reduced-motion settings.
* Never replace numeric values.
* Never imply live execution unless based on live data.

The web interface should be statically deployable.

---

# 24. Configuration

Root configuration example:

```json
{
  "schemaVersion": "1.0.0",
  "benchmarkDirectory": "benchmarks",
  "languageDirectory": "languages",
  "resultDirectory": "results",
  "checkerExecutable": "bin/arena-checker",
  "defaults": {
    "sizes": [
      "small",
      "medium",
      "large"
    ],
    "warmupIterations": 3,
    "measuredIterations": 10,
    "metrics": [
      "wallTime",
      "cpuTime",
      "peakMemory"
    ]
  },
  "execution": {
    "parallelism": 1,
    "preserveTemporaryFiles": false
  }
}
```

Benchmarks should run sequentially by default to avoid CPU and memory contention.

Parallel execution may be supported for development convenience but must be clearly marked as unsuitable for authoritative results.

---

# 25. Fairness Rules

Every official benchmark run must:

* Use release or production builds.
* Record all compiler and runtime flags.
* Use the same dataset for each language.
* Use the same checker for every language.
* Run on the same machine.
* Avoid simultaneous benchmark execution.
* Reject incorrect outputs.
* Preserve raw measurements.
* Record warm-up behavior.
* Record runtime versions.
* Document permitted libraries.
* Document thread limits.

Two implementation categories may eventually be supported:

## Standard

* Same algorithm.
* Equivalent data structures.
* Restricted external dependencies.
* Intended to compare runtime and compiler behavior.

## Optimized

* Idiomatic implementation.
* Normal ecosystem libraries permitted.
* Intended to compare practical achievable performance.

These categories must never share one ranking without clear labeling.

---

# 26. Security and Reliability

The runner must treat benchmark programs as potentially unreliable.

Required protections:

* Process timeout
* Output-size limit
* Temporary working directories
* Input files treated as read-only
* Captured standard output and error
* No shell-string command construction
* Argument arrays passed directly to process execution APIs
* Checker input-size limits
* Strict JSON parsing
* No dynamic code evaluation

Future support may include container or sandbox execution.

---

# 27. Testing Requirements

## CLI tests

* Manifest discovery
* Filtering
* Missing toolchains
* Build failures
* Execution timeout
* Invalid output
* Checker failure
* JSON output
* Terminal formatting
* Result index updates

## Checker tests

* Correct output
* Incorrect result
* Malformed JSON
* Missing properties
* Additional properties
* Invalid path
* Non-optimal path
* Floating-point tolerance boundaries
* Oversized output
* Unsupported schema version

## Benchmark conformance tests

Each implementation must pass small deterministic fixtures before performance testing.

## Result-schema tests

Every generated result file must validate against `result.schema.json`.

---

# 28. Initial Deliverables

Version `0.1.0` should include:

### Scaffolding (repository layout)

Established in the repository:

* npm workspaces root (`package.json`, `arena.config.json`)
* `cli/` package skeleton and TypeScript config
* `checker/` Go module skeleton (`go 1.26`)
* `web/` SvelteKit package skeleton (static adapter)
* Rust, Go, and TypeScript language manifests under `languages/`
* Benchmark manifests and directories for nbody, shortest-path, and aggregation
* JSON schemas under `schemas/`
* Result index placeholders (`results/index.json`, `results/latest.json`)
* Basic documentation (`README.md`, this specification)

### Implementation (required for `0.1.0` completion)

Implemented:

* TypeScript CLI (`arena` executable behavior)
* Go checker (`arena-checker`)
* Rust, Go, and TypeScript implementations for each initial benchmark
* Small, medium, and large deterministic datasets
* Terminal result tables and relative rankings
* JSON result generation with schema validation
* Immutable run history updates
* `arena doctor`
* `arena list`
* `arena build`
* `arena run`
* `arena check`
* `arena results`
* CLI and checker unit tests plus end-to-end acceptance coverage

Wall-clock timing is portable and available on every platform. CPU-time and peak-memory
metrics are explicitly reported as unavailable where the host process APIs cannot provide
portable per-child measurements; unsupported metrics do not invalidate a run, as required
by section 13.

The SvelteKit interface is included in `0.1.0` as a statically prerendered,
read-only visualization of generated result files. It remains independent from
the CLI benchmark workflow.

---

# 29. Acceptance Criteria

The initial version is complete when:

1. `arena doctor` detects Rust (≥ 1.97), Go (≥ 1.26), Node.js (≥ 26.4), and the Go checker.
2. `arena list languages` shows Rust, Go, and TypeScript with detected runtime/compiler versions.
3. `arena list benchmarks` shows all three initial benchmarks.
4. `arena run` builds and executes all available implementations.
5. Every implementation receives identical benchmark input.
6. The Go checker validates every implementation output.
7. Invalid outputs are excluded from rankings.
8. The CLI prints readable comparison tables.
9. Raw and summarized results are saved as valid JSON.
10. Every run receives a unique immutable result file.
11. `latest.json` and `index.json` are updated.
12. A missing or unsupported compiler skips only the affected language.
13. A new language can be added without changing runner control flow.
14. A new benchmark can be discovered from its manifest.
15. A new metric can be registered independently from benchmark code.
16. The entire benchmark workflow works without starting the web interface.
17. Package engines and `checker/go.mod` match the toolchain minima in §5.4.

---

# 30. Primary User Experience

The normal workflow should be:

```bash
arena doctor
arena run
```

The result should immediately appear in the terminal and also be saved for later use.

Optional workflows:

```bash
arena run --language rust --benchmark nbody
arena results latest
arena run --format json
arena web
```

The CLI is the canonical interface.

The generated JSON is the canonical persisted result.

The web interface is an optional visualization layer.
