# Implementing Word Frequency in a New Language

Accept the persistent-worker flags `--input`, `--output`, `--timing-output`,
`--warmup`, and `--iterations`. Parse input before timing; for every warmup and
measurement, create a fresh frequency map, count every word, rank every map
entry, and emit the final result plus timing samples. Logs go to stderr only.

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

Hash these exact bytes with SHA-256 and emit lowercase hexadecimal. Do not
precompute counts, cache iterations, omit the full ranking, or move counting or
ranking outside the timed kernel. The checker requires an exact result and
rejects unknown fields, duplicate JSON fields, wrong ordering, or checksum
mismatches.

Verify with `arena check --benchmark word-frequency --input datasets/small.json --output /tmp/out.json`.
