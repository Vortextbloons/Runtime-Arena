# CLI Component

The CLI (`cli/`) is the primary entry point — a TypeScript command-line tool that orchestrates discovery, building, execution, validation, and result storage.

## Structure

```
cli/
  package.json          # @runtime-arena/cli, type: module, bin: arena
  tsconfig.json         # ES2024, NodeNext, strict
  src/
    index.ts            # Main CLI logic (597 lines)
    metrics.ts          # Metric registry (kernelTime)
    timing.ts           # Timing sample reader
    commands/           # Sub-command dispatch (in progress)
    discovery/          # Language and benchmark discovery
    execution/          # Build and run orchestration
    metrics/            # Metric collection
    reporting/          # Output formatting
    results/            # Result storage
  test/
    cli.test.ts         # Integration tests (8 test cases)
    timing.test.ts      # Timing sample tests
  dist/                 # Compiled output
```

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Modular structure**: Core logic lives in `index.ts` (597 lines) with supporting modules (`metrics.ts`, `timing.ts`). Subdirectories under `src/` provide structure for commands, discovery, execution, metrics, reporting, and results — ready for extraction as the codebase grows.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `kernelTime` | Available | Measured inside the persistent benchmark process |
