# Implementing Matrix Multiplication in a New Language

Accept `--input`, `--output`, `--timing-output`, `--warmup`, and `--iterations`.
Parse the input before timing. For every iteration, allocate/reset a fresh
product matrix and time the complete multiplication. Write the final result and
timing samples; send diagnostics only to stderr.

## Contract

Input is `{ "dimension": N, "left": int[], "right": int[] }`; each matrix
has exactly `N*N` signed integer values in row-major order. Compute `C=A×B`
with the fixed loop nesting `i`, then `j`, then `k`:

```text
for i in 0..N:
  for j in 0..N:
    C[i,j] = 0
    for k in 0..N:
      C[i,j] += A[i,k] * B[k,j]
```

Output is:

```json
{"benchmark":"matrix-multiplication","version":1,"dimension":512,"elementCount":262144,"valueSum":0,"diagonalSum":0,"checksum":"..."}
```

`valueSum` is the sum of every product element and `diagonalSum` is the sum of
`C[i,i]`. For the checksum, UTF-8 encode `dimension=<N>\n`, then every product
element in row-major order as `<value>,`, then one final newline. SHA-256 these
exact bytes and emit lowercase hexadecimal.

Do not use BLAS, third-party numeric libraries, GPUs, parallel execution,
tiling, vectorized replacement kernels, precomputed products, or cached
iterations. The checker independently recomputes the specified loop algorithm.

Verify with `arena check --benchmark matrix-multiplication --input datasets/small.json --output /tmp/out.json`.
