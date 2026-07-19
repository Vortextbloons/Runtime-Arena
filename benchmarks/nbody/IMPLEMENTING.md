# Implementing N-body in a New Language

## Overview

Deterministic gravitational n-body simulation. Computes pairwise gravitational
interactions over a fixed number of timesteps and reports final energy and
position/velocity checksums.

## CLI Contract

Your program must:

1. Accept `--input <file>` and `--output <file>` arguments.
2. Read the input JSON file.
3. Compute the simulation.
4. Write exactly one JSON result file to the output path.
5. Exit with code `0` on success. Exit nonzero on failure.
6. Write logs only to stderr. Never print result data to stdout.

## Input Format

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

## Output Format

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

### Simulation Loop

For each step:

1. **Velocity update** (must happen first): For every pair `(i, j)` where
   `i < j`, compute the gravitational interaction and update both velocities.
2. **Position update**: For every body, update position using the new velocity.

Pseudocode:

```
for step in 0..steps:
    for i in 0..bodyCount:
        for j in i+1..bodyCount:
            d = bodies[j].position - bodies[i].position    # component-wise
            r2 = d[0]^2 + d[1]^2 + d[2]^2
            magnitude = deltaTime / (r2 * sqrt(r2))
            for k in 0..3:
                bodies[i].velocity[k] += d[k] * bodies[j].mass * magnitude
                bodies[j].velocity[k] -= d[k] * bodies[i].mass * magnitude
    for each body:
        for k in 0..3:
            body.position[k] += deltaTime * body.velocity[k]
```

### Energy Calculation

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

### Checksum Calculation

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

## Checker Rules

- Energy tolerance: `|your_energy - expected_energy| <= 1e-8`
- Checksums must match exactly (deterministic).
- Body count must match input length.
- The checker independently re-simulates using the same algorithm and compares.

## Scaffolding

Each language needs build configuration in `implementations/<language-id>/`:

**Rust** — `Cargo.toml`:
```toml
[package]
name = "nbody"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
```
Source: `src/main.rs`

**Go** — `go.mod`:
```
module runtime-arena/nbody
go 1.26
```
Source: `main.go` (no external dependencies needed)

**TypeScript** — `package.json`:
```json
{"name":"arena-nbody-typescript","private":true,"type":"module","scripts":{"build":"tsc"},"devDependencies":{"@types/node":"^26.1.1","typescript":"^7.0.2"}}
```
`tsconfig.json`:
```json
{"compilerOptions":{"target":"ES2024","module":"NodeNext","moduleResolution":"NodeNext","outDir":"dist","strict":true,"types":["node"]},"include":["index.ts"]}
```
Source: `index.ts`

## Reference Implementations

- Go: `implementations/go/main.go`
- Rust: `implementations/rust/src/main.rs`
- TypeScript: `implementations/typescript/index.ts`

## Verification

```bash
arena check --benchmark nbody --input datasets/small.json --output /tmp/nbody-out.json
```

The checker will output `{"status":"accepted",...}` on success.
