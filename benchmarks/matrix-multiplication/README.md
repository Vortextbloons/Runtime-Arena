# Matrix multiplication

Multiply two dense square, row-major integer matrices with a fixed basic
triple-loop algorithm.

## Input and output

Input is JSON `{ "dimension": 64, "left": [...], "right": [...] }`, where
both arrays contain `dimension²` signed integers in row-major order. Output
contains dimensions, aggregate product summaries, and a checksum of the full
product matrix.
