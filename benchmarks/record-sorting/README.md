# Record sorting

Sort numeric records by score descending, timestamp ascending, and ID
ascending. The generated fixture deliberately creates ties in the first two
keys so every comparator field matters.

## Input and output

Input is JSON `{ "records": [{"id":1,"score":42,"timestamp":1700000000000}] }`.
Output contains the record count, first and last ten sorted records, and a
checksum of the complete sorted sequence.
