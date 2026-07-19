# CLI Component

The CLI (`cli/`) is the primary entry point — a TypeScript command-line tool that orchestrates discovery, building, execution, validation, and result storage.

## Structure

```
cli/
  package.json          # @runtime-arena/cli, type: module, bin: arena
  tsconfig.json         # ES2024, NodeNext, strict
  src/
    index.ts            # Main CLI logic (commands, discovery, run, fingerprints)
    metrics.ts          # Metric registry (kernelTime)
    timing.ts           # Timing sample reader
    commands/           # Placeholder (.gitkeep) — not yet extracted
    discovery/          # Placeholder (.gitkeep)
    execution/          # Placeholder (.gitkeep)
    metrics/            # Placeholder (.gitkeep)
    reporting/          # Placeholder (.gitkeep)
    results/            # Placeholder (.gitkeep)
  test/
    cli.test.ts         # Integration tests
    timing.test.ts      # Timing sample tests (also under src/)
  dist/                 # Compiled output
```

`timing.test.ts` lives at `cli/src/timing.test.ts` (next to `timing.ts`).

## Dependencies

- `ajv` / `ajv-formats` — JSON Schema validation (2020-12 draft)
- `tsx` — TypeScript execution
- `typescript` 7.x — Type checking

## Key Design Decisions

**Mostly monolithic today**: Runtime behavior lives in `index.ts` with helpers in `metrics.ts` and `timing.ts`. Subdirectories under `src/` are empty placeholders reserved for a future split; do not treat them as active modules.

**Discovery-based**: Languages and benchmarks are discovered by scanning directories for manifest files. No hardcoded lists.

**Incremental execution**: The fingerprint system ensures only changed cells are re-executed, making iterative development fast.

**Platform awareness**: Handles Windows-specific concerns (`.exe` suffixes, `.cmd` wrappers for npm/npx, `windowsHide: true`).

**Results summary**: `arena results summary` reads `results/current.json`, filters by `--language`, `--benchmark`, and `--size`, then prints an ANSI-colored box-drawing table with benchmark, language, correctness, median kernel time, and relative-speed columns. Fastest entries are marked with a green ★. Color is auto-detected from TTY and suppressed with `NO_COLOR`.

**Version string**: Result snapshots write `arenaVersion: "0.2.0"` (hardcoded in the CLI). Root/`cli` npm `package.json` may still say `0.1.0` — treat the snapshot field as the arena protocol version for results.

## Metric Registry

`cli/src/metrics.ts` defines metric availability:

| Metric | Status | Notes |
|--------|--------|-------|
| `kernelTime` | Available | Measured inside the persistent benchmark process |

## Local Caches

Go builds set `GOCACHE` to `.arena/go-build-cache`. Run scratch directories live under `.arena/runs/<snapshotId>` and are deleted after a run unless `--preserve-temp` is set.
