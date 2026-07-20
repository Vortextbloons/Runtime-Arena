# Harness-Timed Protocol (Contract 2.0.0)

The harness-timed persistent-worker protocol (measurement contract **2.0.0**) is
the standard execution model for all Runtime Arena benchmarks. The harness owns
the clock, drives iterations over stdin/stdout NDJSON, and validates per-iteration
deterministic digests before invoking the checker.

## Protocol Overview

```
┌─────────┐                      ┌──────────────┐
│ Harness │                      │ Implementation │
│  (CLI)  │                      │   (Worker)    │
└────┬────┘                      └──────┬────────┘
     │                                  │
     │  spawns with --input, --output,  │
     │  --protocol-version 2.0.0        │
     │──────────────────────────────────→
     │                                  │
     │  {"type":"ready",                │
     │   "protocolVersion":"2.0.0"}     │
     │←─────────────────────────────────│
     │                                  │
     │  {"type":"run",                  │
     │   "requestId":1,                 │
     │   "iteration":1,                 │
     │   "phase":"warmup"}              │
     │──────────────────────────────────→
     │  {"type":"result",               │
     │   "requestId":1,                 │
     │   "digest":"abc..."}             │
     │←─────────────────────────────────│
     │  ... (repeat for N iterations)   │
     │                                  │
     │  {"type":"finish"}               │
     │──────────────────────────────────→
     │  {"type":"finish",               │
     │   "digest":"abc..."}             │
     │←─────────────────────────────────│
     │                                  │
     │  writes last result bytes to     │
     │  --output (done by worker)       │
```

## CLI Arguments (What the Implementation Receives)

The implementation is spawned with exactly three CLI arguments:

| Argument | Purpose |
|----------|---------|
| `--input <path>` | Path to the input dataset file |
| `--output <path>` | Path where the final output must be written on `finish` |
| `--protocol-version 2.0.0` | Protocol version to assert |

Legacy arguments (`--timing-output`, `--warmup`, `--min-iterations`,
`--max-iterations`, `--target-relative-ci`) are **not** passed under contract
2.0.0. The harness handles iteration control and timing internally.

## Message Formats

### Worker → Harness: `ready`

Sent exactly once, after parsing arguments and reading the input file but before
reading stdin. Must be the first line on stdout.

```json
{"type":"ready","protocolVersion":"2.0.0"}
```

- `protocolVersion` must be `"2.0.0"`
- Strict: no extra fields allowed

### Harness → Worker: `run`

Sent for each iteration. The harness measures wall-clock time from immediately
before writing this request through receipt of the complete response line.

```json
{"type":"run","requestId":1,"iteration":1,"phase":"warmup"}
```

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | integer | Monotonically increasing, starts at 1 |
| `iteration` | integer | Global iteration counter (warmup + measured) |
| `phase` | string | `"warmup"` or `"measured"` — diagnostic only |

### Worker → Harness: `result`

Sent for each `run` request. The worker must execute the full workload kernel,
produce a deterministic result object, compute its SHA-256 digest, and reply
before reading the next stdin line.

```json
{"type":"result","requestId":1,"digest":"abc123..."}
```

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | integer | Must match the `run` request's `requestId` |
| `digest` | string | Lowercase SHA-256 hex of the compact JSON result bytes |

### Harness → Worker: `finish`

Sent after the last measured iteration. Signals the worker to write the last
result bytes to `--output` and acknowledge.

```json
{"type":"finish"}
```

### Worker → Harness: `finish`

Sent after writing the output file. The digest must match the last `result`
digest exactly.

```json
{"type":"finish","digest":"abc123..."}
```

## Digest Computation Rules

The digest is SHA-256 of the **compact JSON bytes** of that iteration's result
object. Compact JSON means:

- No whitespace between tokens
- `,` and `:` separators only
- Sorted keys are **not** required, but the output must be byte-identical for
  the same result across all iterations

Example in JavaScript:
```js
const bytes = Buffer.from(JSON.stringify(resultObject));
const digest = createHash("sha256").update(bytes).digest("hex");
```

Example in Go:
```go
bytes, _ := json.Marshal(resultObject)
sum := sha256.Sum256(bytes)
digest := hex.EncodeToString(sum[:])
```

## The Output File

On `finish`, the worker writes the **compact JSON bytes** of the last
iteration's result to `--output`. The file is then checked by:

1. The harness — compares the file's SHA-256 against the last result digest
2. The Go checker — validates semantic correctness of the output
3. An `outputSizeBytes` check — rejects files over `maxOutputBytes`

## Sequencing Rules

| Rule | Enforcement |
|------|-------------|
| Worker must emit `ready` before reading stdin | Harness times out if missing |
| Worker must respond to every `run` before reading next | Harness validates requestId |
| `result` requestId must match the `run` requestId | Harness rejects mismatch |
| The digest must be consistent across all iterations | Harness rejects first mismatch |
| The file written on `finish` must match the last result digest | Harness rejects mismatch |
| All protocol output on **stdout** only; diagnostics go to **stderr** | Extra stdout lines are rejected |
| Worker must not exit before processing `finish` | Harness detects early exit |

## Measurement and Adaptive Stopping

The harness measures **iteration time** as the wall-clock duration from writing
a `run` request to receiving the complete `result` response line. Warmup
iteration times are discarded.

Adaptive stopping uses a deterministic 10,000-resample percentile bootstrap
95% confidence interval for the **median** iteration time, seeded from the
ordered sample sequence:

```typescript
shouldStopMeasuring(iterationTimes, policy):
  if count >= maxMeasuredIterations → stop
  if count < minMeasuredIterations → continue
  if CI width / median <= targetRelativeCI → stop
```

The measurement policy is configured in `arena.config.json`:

| Field | Default | Description |
|-------|---------|-------------|
| `minMeasuredIterations` | 10 | Minimum iterations before stopping |
| `maxMeasuredIterations` | 30 | Hard stop after this many |
| `targetRelativeConfidenceInterval` | 0.05 | Target CI/median ratio |

Pass `--iterations <n>` to override with fixed-count mode.

## Result Summary Fields (per Cell)

The harness computes these summary statistics from measured iteration times:

| Field | Description |
|-------|-------------|
| `validSamples` | Number of accepted measured iterations |
| `rejectedSamples` | Always 0 (harness validates inline) |
| `minimumIterationTimeNanoseconds` | Fastest measured iteration |
| `maximumIterationTimeNanoseconds` | Slowest measured iteration |
| `medianIterationTimeNanoseconds` | **Primary ranking metric** |
| `meanIterationTimeNanoseconds` | Arithmetic mean |
| `standardDeviationIterationTimeNanoseconds` | Population standard deviation |
| `p95IterationTimeNanoseconds` | 95th percentile |
| `interquartileRangeIterationTimeNanoseconds` | Q3 − Q1 |

## Protocol Helpers by Language

Each language family has a reusable protocol helper at
`languages/protocol/`. See
[`languages/protocol/README.md`](../../languages/protocol/README.md) for the
full reference.

| Family | Helper | Usage |
|--------|--------|-------|
| JavaScript / TypeScript | [`worker.mjs`](../../languages/protocol/worker.mjs) | `import { runWorker } from "...worker.mjs"` |
| Python | [`worker.py`](../../languages/protocol/worker.py) | `from worker import run_worker` |
| Go | [`go/worker.go`](../../languages/protocol/go/worker.go) | Module `runtime-arena/protocol` |
| Rust | [`rust/lib.rs`](../../languages/protocol/rust/lib.rs) | Path dependency |
| C / C++ | [`protocol.h`](../../languages/c/include/protocol.h) | `#include "protocol.h"` |
| C# | [`Worker.cs`](../../languages/protocol/Worker.cs) | `ArenaProtocol.RunWorker(args, input, output, kernel)` |
| Java | [`Protocol.java`](../../languages/protocol/Protocol.java) | `ArenaProtocol.runWorker(args, input, output, kernel)` |
| Lua / LuaJIT | [`worker.lua`](../../languages/protocol/worker.lua) | `ArenaProtocol.run_worker(input, output, kernel)` |

All helpers expose the same pattern:
1. Parse `--input`, `--output`, `--protocol-version` from argv
2. Read the input file (to prove it exists)
3. Emit `ready`
4. For each stdin line: parse JSON, if `run` → execute kernel → emit `result`,
   if `finish` → write output file → emit `finish`

## Minimal Workers

Each language has a minimal worker in
[`examples/minimal-workers/`](../../examples/minimal-workers/) that returns
fixed JSON instead of running a real benchmark kernel. Useful for learning the
protocol or testing toolchain setup.

```bash
npm run arena -- protocol test --language javascript --minimal
```

## Conformance Testing

The `arena protocol test` command validates an implementation's protocol
compliance without a full benchmark run:

```bash
# Test minimal worker (no benchmark needed)
npm run arena -- protocol test --language javascript --minimal

# Test against a real benchmark
npm run arena -- protocol test --language rust --benchmark nbody
```

Diagnoses:
- Missing `ready` or unexpected message types
- Protocol version mismatch (rejects non-2.0.0)
- Digest mismatches across iterations or on `finish`
- Malformed protocol JSON on stdout
- Missing required CLI args in the language manifest
- Early exit or timeout during protocol steps
- Output file missing or digest mismatch after `finish`

## Legacy Contracts (1.0.0 and 1.1.0)

Previous measurement contracts used a **kernel-timed** model where the worker
owned the clock and wrote timing data to a separate `--timing-output` sidecar
file. Cells recorded under those contracts remain readable in result snapshots
but:

- Are always treated as **stale** in the fingerprint system
- Are **excluded from rankings** in the web UI and scorecards
- Must be re-run under contract 2.0.0 to appear in rankings

The CLI retains `readTimingSamples()` in `cli/src/timing.ts` for reading legacy
1.x timing sidecar files. This function is not used for contract 2.0.0 results,
where timing is computed from harness samples.

## Diagnostics

All diagnostics and logs must go to **stderr**. Any output on stdout that is not
a valid protocol message (ready/result/finish) causes the harness to reject the
cell with "unexpected extra protocol output".

## Timeouts

| Phase | Timeout Source |
|-------|---------------|
| `ready` | Benchmark `limits.timeoutMilliseconds` |
| Each `run` → `result` | Benchmark `limits.timeoutMilliseconds` |
| `finish` → final `finish` | Benchmark `limits.timeoutMilliseconds` |
| Process exit | 5 seconds after protocol completes, 1 second on error |

A timeout during any phase kills the process with SIGKILL and marks the cell as
failed with `timedOut: true`.
