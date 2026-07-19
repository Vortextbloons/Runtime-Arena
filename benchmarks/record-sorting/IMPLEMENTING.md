# Implementing Record Sorting in a New Language

Accept `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations`.
Parse the JSON input before timing. For each iteration, create fresh sortable
state and sort every record; output the final deterministic result and timing
samples, with diagnostics only on stderr.

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

Use SHA-256 and lowercase hexadecimal. Do not pre-sort, cache a result, skip
records, alter the comparison order, or move copying/sorting outside the timed
kernel. The checker recomputes and compares every output field exactly.

Verify with `arena check --benchmark record-sorting --input datasets/small.json --output /tmp/out.json`.
