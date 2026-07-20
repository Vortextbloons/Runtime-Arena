# Implementing Word Frequency in a New Language

Count occurrences in a prepared array of normalized words, then rank the
complete frequency table by count descending and word ascending.

## Design philosophy

Implementations must produce output accepted by the checker. Use the
language's best idioms, types, and data structures — do not copy code
structure from other implementations. The checker is the source of truth
for correctness.

## CLI contract

Accept the persistent-worker flags: `--input`, `--output`, `--timing-output`,
`--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`.

Parse input before timing; for every warmup and measurement iteration, create
a fresh frequency map, count every word, rank every map entry, and emit the
final result plus timing samples. Logs go to stderr only.

**Timing boundary**: Time only the frequency counting, full sort, and checksum
computation. Input parsing, JSON serialization, and file I/O are outside the
kernel.

## Contract

Input is `{ "words": string[] }`; words are non-empty normalized tokens.
Output must be:

```json
{"benchmark":"word-frequency","version":1,"totalWords":200000,"uniqueWords":8421,"topWords":[{"word":"word-00000","count":123}],"checksum":"..."}
```

Sort all frequency entries by count descending, then word ascending. `topWords`
is the first ten entries (or all entries when fewer than ten exist).

Build the checksum by UTF-8 encoding one line per complete sorted entry:

```text
<word>,<count>\n
```

Hash these exact bytes with SHA-256 and emit lowercase hexadecimal.

## Checker rules

The checker independently re-runs the frequency count and sort, then compares
the output byte-for-byte. It rejects:

- Unknown or duplicate JSON fields
- Wrong sort order (must be count descending, then word ascending)
- Checksum mismatches
- Incorrect `totalWords` or `uniqueWords`

## Fairness constraints

**Allowed**: Language-native data structures, compiler optimizations,
cache-friendly algorithms, SIMD intrinsics (single-threaded), idiomatic
abstractions.

**Prohibited**: External compute libraries, GPU offloading, multi-process
parallelism, precomputation across iterations, caching results between
iterations.

## Verification

```bash
arena check --benchmark word-frequency --input datasets/small.json --output /tmp/out.json
```
