# Checker Component

The checker (`checker/`) is an independent Go program that validates benchmark output correctness. It is intentionally written in Go and independent from the TypeScript CLI.

## Structure

```
checker/
  go.mod                # module github.com/runtime-arena/checker, go 1.26
  cmd/
    arena-checker/
      main.go           # All checker logic (464 lines)
      main_test.go      # Unit tests (5 test cases)
  internal/
    benchmarks/         # Benchmark-specific validation (in progress)
    output/             # Output parsing and formatting (in progress)
    validation/         # Common validation utilities (in progress)
```

## Design Principles

**Independence**: The checker re-implements the same algorithms as implementations. No shared code between the CLI and checker ensures bugs can't be masked.

**Strict parsing**: JSON is parsed with strict rules:
- Rejects duplicate keys
- Rejects unknown fields
- Rejects trailing content
- Rejects files over 10 MiB

**Exit codes**: Standardized across all benchmarks.

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `accepted` | Output is correct |
| 1 | `wrong-answer` | Output is incorrect |
| 2 | `malformed-output` | Output doesn't match expected JSON structure |
| 3 | `unsupported-version` | Output version not supported |
| 4 | other | Checker error or unknown benchmark |

## Benchmark Validation

### nbody

Independently re-simulates the gravitational system and compares:
- Final energy (tolerance 1e-8)
- Position checksum (SHA-256)
- Velocity checksum (SHA-256)
- Body count

### shortest-path

Verifies each query result:
- Path endpoints match source/destination
- All edges in path exist in the input graph
- Path cost equals reported distance
- Distance is globally optimal (uses Dijkstra's algorithm)

### aggregation

Independently re-aggregates CSV data and compares:
- Record count
- Total quantity and value
- Category breakdowns (sorted alphabetically)
- Top 10 accounts (sorted by value descending)
- SHA-256 checksum of sorted output

## Usage

```bash
arena-checker check --benchmark <id> --input <file> --output <file>
```

The checker reads the input dataset and implementation output, validates correctness, and prints a JSON response to stdout:

```json
{
  "status": "accepted",
  "benchmark": "nbody",
  "checkerVersion": "1.0.0",
  "diagnostics": []
}
```
