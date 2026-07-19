# Implementing Barrier Wave in a New Language

**Design philosophy:** Implementations must produce output accepted by the
checker. Use the language's best idioms, types, and data structures — do not
copy code structure from other implementations. The checker is the source of
truth for correctness.

## CLI contract

The program accepts `--input <file>` and `--output <file>`, writes exactly one
JSON result to the output path, exits zero on success, and writes diagnostics
only to stderr. Input parsing, worker creation and shutdown, JSON serialization,
and file I/O are outside the kernel timing boundary.

Create one persistent pool before warmups begin. Every measured or warmup
iteration must run the full workload without caching. Rust uses native threads,
Go uses goroutines with `GOMAXPROCS >= workerCount`, TypeScript uses
`worker_threads`, and Python uses multiprocessing. LuaJIT must be marked
unavailable unless real native threads or processes are used.

## Input

```json
{"schemaVersion":"1.0.0","workerCount":4,"phaseCount":250,"itemsPerWorker":1024,"roundsPerItem":16,"initialSeed":"729418ab"}
```

All counts are positive integers. `initialSeed` is exactly eight lowercase
hexadecimal characters. Arithmetic wraps modulo 2^32 or 2^64 as specified;
right shifts of 32-bit values are logical.

## Timed algorithm

Start timing immediately before dispatching phase 0. Workers have stable IDs
`0..workerCount-1`. For every phase, dispatch the current seed to every worker.
Worker `w` processes `itemsPerWorker` items, where:

```text
globalItemId = w * itemsPerWorker + localItemIndex
x = phaseSeed XOR globalItemId XOR (w * 0x9e3779b9)
```

For each item, run `roundsPerItem` rounds:

```text
x = x XOR (x << 13)
x = x XOR (x >>> 17)
x = x XOR (x << 5)
x = x * 0x9e3779b1 + 0x85ebca77
```

The worker accumulates `localXor` as unsigned 32-bit XOR and `localSum` as an
unsigned wrapping 64-bit sum. Wait for exactly one result from each worker,
then reduce in ascending worker-ID order:

```text
nextSeed = phaseSeed XOR phaseNumber
phaseSum = 0

for each worker result:
    nextSeed = mix32(nextSeed XOR localXor XOR low32(localSum)
                     XOR high32(localSum) XOR workerId)
    phaseSum = phaseSum + localSum
```

`mix32` is:

```text
x = x XOR (x >>> 16)
x = x * 0x21f0aaad
x = x XOR (x >>> 15)
x = x * 0x735a2d97
x = x XOR (x >>> 15)
```

Initialize `digest = 0x6a09e667f3bcc909`. After every phase:

```text
phaseSeed = nextSeed
digest = rotateLeft64(digest, 7)
digest = digest XOR nextSeed
digest = digest + phaseSum
```

The next phase cannot start before all current workers finish. Stop timing
after reducing the final phase and updating the digest.

## Output

```json
{
  "schemaVersion": "1.0.0",
  "benchmark": "barrier-wave",
  "workerCount": 4,
  "phaseCount": 250,
  "itemsProcessed": 1024000,
  "finalSeed": "4d2a7391",
  "digest": "173ea381245fc921"
}
```

`itemsProcessed = workerCount * phaseCount * itemsPerWorker`. `finalSeed` is
eight and `digest` sixteen lowercase, zero-padded hexadecimal characters.
Do not include timing data or additional fields.

## Fairness and checking

Do not serialize the workload, reduce worker count, skip barriers, change shard
sizes, combine phases, precompute answers, cache iterations, use a GPU, or move
item work outside the timed region. The independent Go checker sequentially
executes the same algorithm and strictly rejects unknown/duplicate fields,
trailing JSON, malformed hex, version/count mismatches, and incorrect results.

Concurrency itself also requires implementation review because output checking
cannot prove that workers ran in parallel.
