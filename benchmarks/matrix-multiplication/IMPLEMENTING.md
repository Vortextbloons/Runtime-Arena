# Implementing Matrix Multiplication in a New Language

Multiply two dense square, row-major integer matrices and produce a checksum
of the full product matrix.

## Design philosophy

Implementations must produce output accepted by the checker. Use the
language's best idioms, types, and data structures — do not copy code
structure from other implementations. The checker is the source of truth
for correctness.

## CLI contract

Accept the persistent-worker flags: `--input`, `--output`, `--timing-output`,
`--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`.

Parse the input before timing. For every iteration, allocate a fresh product
matrix and time the complete multiplication. Write the final result and timing
samples; send diagnostics only to stderr.

**Timing boundary**: Time only the matrix multiplication (computing the product
matrix, sums, and checksum). Input parsing, JSON serialization, and file I/O
are outside the kernel.

## Contract

Input is `{ "dimension": N, "left": int[], "right": int[] }`; each matrix
has exactly `N*N` signed integer values in row-major order. Compute `C=A×B`
using integer arithmetic.

Output is:

```json
{"benchmark":"matrix-multiplication","version":1,"dimension":512,"elementCount":262144,"valueSum":0,"diagonalSum":0,"checksum":"..."}
```

`valueSum` is the sum of every product element and `diagonalSum` is the sum of
`C[i,i]`. For the checksum, UTF-8 encode `dimension=<N>\n`, then every product
element in row-major order as `<value>,`, then one final newline. SHA-256 these
exact bytes and emit lowercase hexadecimal.

## Checker rules

The checker independently re-computes the matrix product using integer
arithmetic and compares every output field byte-for-byte. Since all values are
integers, there is exactly one correct product matrix regardless of the
multiplication algorithm used. The checker rejects:

- Incorrect `valueSum` or `diagonalSum`
- Checksum mismatches (the checksum covers every element of the product)
- Unknown or duplicate JSON fields

## Fairness constraints

**Allowed**: Any single-threaded integer matrix multiplication algorithm,
including loop reordering for cache locality, register blocking, SIMD
intrinsics, compiler auto-vectorization, and idiomatic language abstractions.

**Prohibited**: External compute libraries (BLAS, cuBLAS, MKL, etc.), GPU
offloading, multi-process or multi-threaded parallelism, precomputed products,
and caching results between iterations.

## Verification

```bash
arena check --benchmark matrix-multiplication --input datasets/small.json --output /tmp/out.json
```
