# Testing Guide

## Running All Tests

```bash
npm test
```

This command:
1. Builds the checker binary (`npm run build:checker`)
2. Runs CLI integration tests (`npm run test --workspaces --if-present`)
3. Runs checker unit tests (`node scripts/test-checker.mjs`)

## Test Locations

| Component | Test File | Framework |
|-----------|-----------|-----------|
| CLI | `cli/test/cli.test.ts` | Node test runner |
| Web scoring | `web/src/lib/scoring.test.ts` | Node test runner |
| Checker | `checker/cmd/arena-checker/main_test.go` | Go testing |

## CLI Tests

Integration tests in `cli/test/cli.test.ts` verify:
- `doctor` command runs successfully
- `list` commands return expected output
- `build` command compiles implementations
- `run` command executes benchmarks and produces valid results
- `check` command validates output files
- `dataset generate` creates deterministic datasets
- `results` command reads snapshots

## Checker Tests

Unit tests in `checker/cmd/arena-checker/main_test.go` verify:
- Deterministic simulation produces consistent results
- Alternate optimal paths are accepted
- Aggregation correctness with known datasets
- Strict JSON rejection of unknown/duplicate fields

Run checker tests manually:

```bash
node scripts/test-checker.mjs
```

## Web Tests

Unit tests for the scoring algorithm:

```bash
npm run test --workspace=@runtime-arena/web
```

## Type Checking

```bash
npm run check --workspace=@runtime-arena/web
```

Runs TypeScript type checking on the web workspace.

## Writing New Tests

When adding a new benchmark:
1. Add checker unit tests in `checker/cmd/arena-checker/main_test.go`
2. Verify the CLI can discover, build, and run the benchmark
3. Verify the checker accepts correct output and rejects incorrect output
