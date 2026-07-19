# Word frequency

Count occurrences in a prepared array of normalized words, then rank the
complete frequency table by count descending and word ascending.

## Purpose

- String hashing and hash maps
- Allocation and dynamic-language object overhead
- Sorting frequency records

## Input

JSON: `{ "words": ["word-00000", "word-00001"] }`.

## Output

JSON with `totalWords`, `uniqueWords`, the top ten `{word,count}` entries, and
a SHA-256 checksum of the complete ordered frequency table.
