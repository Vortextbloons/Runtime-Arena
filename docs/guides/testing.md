# Testing Guide

## Running All Tests

```bash
npm test
```

This command:
1. Builds the checker binary (`npm run build:checker`)
2. Runs CLI and web workspace tests (`npm run test --workspaces --if-present`)
3. Runs implementation line-count tests (`node scripts/count-implementation-loc.test.mjs`)
4. Runs checker unit tests (`node scripts/test-checker.mjs`)

## Test Locations

| Component | Test File | Framework |
|-----------|-----------|-----------|
| CLI integration | `cli/test/cli.test.ts` | Node test runner |
| CLI protocol | `cli/test/protocol.test.ts` | Node test runner |
| CLI timing helpers | `cli/src/timing.test.ts` | Node test runner |
| CLI provenance / cache | `cli/src/provenance.test.ts` | Node test runner |
| CLI provenance defaults | `cli/src/provenance-defaults.test.ts` | Node test runner |
| CLI protocol conformance | `cli/src/protocol-conformance.test.ts` | Node test runner |
| CLI benchmark mutations | `cli/src/mutations.test.ts` | Node test runner |
| CLI RunnerCache | `cli/src/runner-cache.test.ts` | Node test runner |
| CLI pool | `cli/src/pool.test.ts` | Node test runner |
| Web scoring | `web/src/lib/scoring.test.ts` | Node test runner |
| Web tiers | `web/src/lib/tiers.test.ts` | Node test runner |
| Web card data | `web/src/lib/cards.test.ts` | Node test runner |
| Implementation LOC | `scripts/count-implementation-loc.test.mjs` | Node test runner |
| Checker | `checker/cmd/arena-checker/main_test.go` | Go testing |

## CLI Tests

Integration tests in `cli/test/cli.test.ts` verify:
- `doctor` command runs successfully
- `list` commands return expected output
- `build` command compiles implementations
- `run` command executes benchmarks and produces valid results (contract 2.0.0)
- `check` command validates output files
- `dataset generate` creates deterministic datasets
- `results` command reads snapshots

Protocol tests in `cli/test/protocol.test.ts` cover the harness stdin/stdout contract: `ready` / `run` / `result` / `finish` sequencing, digest validation, and timeouts.

Timing unit tests in `cli/src/timing.test.ts` cover adaptive median bootstrap confidence intervals and fixed-count policy bounds.

Provenance tests in `cli/src/provenance.test.ts` cover source-as-artifact cache behavior (interpreted languages must not be overwritten on cache restore).

Provenance defaults tests in `cli/src/provenance-defaults.test.ts` cover merging of language manifest provenance with `provenance.defaults.json` and automatic runtime probe injection.

Protocol conformance tests in `cli/src/protocol-conformance.test.ts` cover the `arena protocol test` command: manifest validation (required run arguments) and diagnostic/hint generation for common harness failures.

Mutation tests in `cli/src/mutations.test.ts` cover mutation benchmark cell expansion and the `expandSizeCells` helper.

RunnerCache tests in `cli/src/runner-cache.test.ts` cover the file-level cache used for dataset hashing and fingerprint inputs.

## Checker Tests

Unit tests in `checker/cmd/arena-checker/main_test.go` verify:
- Deterministic nbody simulation produces consistent results
- Alternate optimal shortest-paths are accepted
- Aggregation correctness with known datasets
- Word-frequency counting and checksums
- Record-sorting tie-breaking order
- Matrix-multiplication element count, sums, and checksums
- Barrier-wave reference output and rejection of malformed/uppercase hex
- Strict JSON rejection of unknown fields and duplicate keys

Run checker tests manually:

```bash
npm run build:checker
node scripts/test-checker.mjs
```

## Web Tests

Unit tests for scoring and scorecard tiers:

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
2. Verify the CLI can discover, build, and run the benchmark under contract 2.0.0
3. Verify the checker accepts correct output and rejects incorrect output
4. If you add `arena dataset generate` support, cover deterministic regeneration
