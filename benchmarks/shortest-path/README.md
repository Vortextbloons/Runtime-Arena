# Weighted shortest-path queries

Directed weighted graph shortest-path queries with nonnegative integer edge weights.

## Purpose

- Graph algorithms
- Priority queues
- Memory access
- Dynamic data structures
- Branch-heavy workloads

## Input

JSON graph plus source/destination query pairs.

## Output

```json
{
  "benchmark": "shortest-path",
  "version": 1,
  "results": [
    {
      "queryId": 1,
      "distance": 924,
      "path": [12, 44, 81, 93]
    }
  ]
}
```

## Checker

- Verify path endpoints
- Verify every submitted edge exists
- Recalculate path cost
- Verify global optimality
- Allow equal-cost alternate optimal paths

## Implementations

Place language implementations under `implementations/<language-id>/`.
Each must accept `--input` and `--output` and write a single JSON result file.
