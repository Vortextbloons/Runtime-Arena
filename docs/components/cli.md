# CLI Component

The CLI (`cli/`) is the primary entry point — a TypeScript command-line tool that orchestrates discovery, building, execution, validation, and result storage.

## Structure

```
cli/
  package.json          # @runtime-arena/cli, type: module, bin: arena
  tsconfig.json         # ES2024, NodeNext, strict
  src/
    index.ts            # Main CLI logic (monolithic, 565 lines)
    metrics.ts          # Metric registry (wallTime, cpuTime, peakMemory)
    commands/           # Placeholder for future modularization
    discovery/          # Placeholder
    execution/          # Placeholder
    metrics/            # Placeholder
    reporting/          # Placeholder
    results/            # Placeholder
  test/
    cli.test.ts         # Integration tests (7 test cases)
  dist/                 # Compiled output
```

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Monolithic structure**: The entire CLI is a single 565-line file. The empty subdirectories under `src/` are placeholders for future modularization if the code grows.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `wallTime` | Available | Measured via `process.hrtime.bigint()` |
| `cpuTime` | Unavailable | Node's child-process API doesn't expose per-child CPU time |
| `peakMemory` | Unavailable | Node's child-process API doesn't expose per-child peak RSS |
