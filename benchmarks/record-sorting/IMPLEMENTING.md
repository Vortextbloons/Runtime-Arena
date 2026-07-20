# Implementing Record Sorting in a New Language

Sort numeric records by score descending, timestamp ascending, and ID
ascending.

## Design philosophy

Implementations must produce output accepted by the checker. Use the
language's best idioms, types, and data structures — do not copy code
structure from other implementations. The checker is the source of truth
for correctness.

## CLI contract

Accept the persistent-worker flags: `--input`, `--output`, `--timing-output`,
`--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`.

Parse the JSON input before timing. For each iteration, create fresh sortable
state and sort every record; output the final deterministic result and timing
samples, with diagnostics only on stderr.

**Timing boundary**: Time only the fresh copy, full sort, and checksum
computation. Input parsing, JSON serialization, and file I/O are outside the
kernel.

## Contract

Input is `{ "records": [{ "id": integer, "score": integer, "timestamp": integer }] }`.
Order records by: score descending, timestamp ascending, then ID ascending.
This final key makes the ordering total; a stable sort is not otherwise needed.

Output is:

```json
{"benchmark":"record-sorting","version":1,"recordCount":500000,"firstRecords":[],"lastRecords":[],"checksum":"..."}
```

`firstRecords` and `lastRecords` each contain ten records (or every record when
fewer than ten exist), preserving their order in the complete sorted sequence.
Hash the full sequence as UTF-8 lines in this exact format:

```text
<id>,<score>,<timestamp>\n
```

Use SHA-256 and lowercase hexadecimal.

## Checker rules

The checker independently sorts all records and compares the output
byte-for-byte. It rejects:

- Wrong sort order (must be score descending, then timestamp ascending,
  then ID ascending)
- Incorrect `recordCount`
- Checksum mismatches (the checksum covers every record, not just the
  sampled first/last)
- Unknown or duplicate JSON fields

## Fairness constraints

**Allowed**: Any single-threaded sort algorithm, language-native sort
routines, compiler optimizations, and idiomatic data structures.

**Prohibited**: External compute libraries, GPU offloading, multi-process
parallelism, precomputation across iterations, and caching results between
iterations.

## Verification

```bash
arena check --benchmark record-sorting --input datasets/small.json --output /tmp/out.json
```
