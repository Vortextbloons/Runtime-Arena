# Implementing N-body in a New Language

Deterministic gravitational n-body simulation. Computes pairwise gravitational
interactions over a fixed number of timesteps and reports final energy and
position/velocity checksums.

## Design philosophy

Implementations must produce output accepted by the checker. Use the
language's best idioms, types, and data structures — do not copy code
structure from the reference implementations. The checker is the source of
truth for correctness.

## CLI contract

Accept the persistent-worker flags: `--input`, `--output`, `--timing-output`,
`--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`.

Read the input JSON file before timing. For every iteration, run the full
simulation and write the result. Send diagnostics only to stderr.

**Timing boundary**: Time only the simulation loop and energy/checksum
computation. Input parsing, JSON serialization, and file I/O are outside
the kernel.

## Input format

JSON object:

```json
{
  "steps": 1000,
  "deltaTime": 0.01,
  "bodies": [
    {
      "mass": 1.0,
      "position": [0.0, 0.0, 0.0],
      "velocity": [0.0, 0.0, 0.0]
    }
  ]
}
```

| Field       | Type       | Description                        |
|-------------|------------|------------------------------------|
| `steps`     | integer    | Number of simulation timesteps     |
| `deltaTime` | float      | Time step size                     |
| `bodies`    | array      | Array of body objects              |
| `mass`      | float      | Mass of the body                   |
| `position`  | float[3]   | `[x, y, z]` position coordinates  |
| `velocity`  | float[3]   | `[x, y, z]` velocity components   |

## Output format

```json
{
  "benchmark": "nbody",
  "version": 1,
  "bodyCount": 5,
  "finalEnergy": -0.169075164,
  "positionChecksum": "a1b2c3...",
  "velocityChecksum": "d4e5f6..."
}
```

| Field              | Type    | Description                                     |
|--------------------|---------|-------------------------------------------------|
| `benchmark`        | string  | Must be `"nbody"`                               |
| `version`          | integer | Must be `1`                                     |
| `bodyCount`        | integer | Number of bodies (same as input length)          |
| `finalEnergy`      | float   | Total system energy after all steps              |
| `positionChecksum` | string  | SHA-256 hex digest of final positions            |
| `velocityChecksum` | string  | SHA-256 hex digest of final velocities           |

## Algorithm

The simulation uses a leapfrog integration scheme. For each timestep:

1. **Velocity update** (must happen before position update): For every pair
   `(i, j)` where `i < j`, compute the gravitational interaction and update
   both velocities.
2. **Position update**: For every body, update position using the new velocity.

The velocity-before-position ordering and the `(i, j)` pair iteration order
(`j > i`) are part of the physics definition and affect the numerical result.
The checker re-runs the same simulation and compares output.

After all steps, compute total energy:

```
energy = 0
for i in 0..bodyCount:
    v2 = velocity[i][0]^2 + velocity[i][1]^2 + velocity[i][2]^2
    energy += 0.5 * mass[i] * v2
    for j in i+1..bodyCount:
        r2 = sum((position[i][k] - position[j][k])^2 for k in 0..3)
        energy -= mass[i] * mass[j] / sqrt(r2)
```

### Checksum calculation

SHA-256 hash of all coordinates formatted as strings:

```
position_data = ""
velocity_data = ""
for each body:
    for k in 0..3:
        position_data += format("{:.9f},", body.position[k])
        velocity_data += format("{:.9f},", body.velocity[k])

positionChecksum = hex(sha256(position_data))
velocityChecksum = hex(sha256(velocity_data))
```

**Critical**: Each coordinate must be formatted with exactly 9 decimal places
(`%.9f`), followed by a comma. No trailing newline. The order must match the
input body order.

## Checker rules

- Energy tolerance: `|your_energy - expected_energy| <= 1e-8`
- Checksums must match exactly (deterministic).
- Body count must match input length.
- The checker independently re-simulates using the same algorithm and compares.

## Fairness constraints

**Allowed**: Any correct gravitational n-body implementation, including
 blocked or pipelined loop structures, SIMD intrinsics, compiler
auto-vectorization, and idiomatic language abstractions. The integration
scheme (leapfrog with velocity-before-position) and pair iteration order
(`i < j`) must be preserved.

**Prohibited**: External physics libraries, GPU offloading, multi-process
parallelism, precomputation across iterations, and caching results between
iterations.

## Verification

```bash
arena check --benchmark nbody --input datasets/small.json --output /tmp/nbody-out.json
```

The checker will output `{"status":"accepted",...}` on success.
