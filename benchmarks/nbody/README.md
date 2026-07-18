# N-body simulation

Deterministic gravitational n-body simulation.

## Purpose

- Numeric computation
- Tight loops
- Floating-point arithmetic
- Function call overhead
- Runtime optimization

## Input

JSON with `steps`, `deltaTime`, and `bodies`.

## Output

```json
{
  "benchmark": "nbody",
  "version": 1,
  "bodyCount": 5,
  "finalEnergy": -0.169075164,
  "positionChecksum": "...",
  "velocityChecksum": "..."
}
```

## Checker

- Validate schema
- Independently verify expected state
- Compare floating-point values with documented tolerances
- Verify deterministic checksums

## Implementations

Place language implementations under `implementations/<language-id>/`.
Each must accept `--input` and `--output` and write a single JSON result file.
