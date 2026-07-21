# Operations Runbook

## Prerequisites

- Installed toolchains for the languages you intend to run (`npm run arena -- doctor` to verify).
- Built checker binary (`npm run build:checker`).

### The `doctor` command

`npm run arena -- doctor` checks all of the following and exits with code 0 if
everything is OK, 1 if any check fails:

| Check | What it verifies |
|-------|------------------|
| Language toolchains | Each language's `detect` command runs successfully and meets minimum version requirements (Rust 1.97+, Go 1.26+, TypeScript 26.4+, Python 3.8+). Java is detected via `JAVA_HOME`, `PATH`, or common JDK install paths. |
| Checker binary | `bin/arena-checker[.exe]` exists. Run `npm run build:checker` if missing. |
| Results directory | `results/` is writable. |
| Language manifests | Every `languages/<id>.json` is valid against `schemas/language.schema.json`. |
| Benchmark manifests | Every `benchmarks/<id>/benchmark.json` is valid against `schemas/benchmark.schema.json`. |
| Dataset files | All datasets referenced by benchmark manifests exist. |
| Implementations | Every benchmark has an implementation directory for every language (reports "pending" for definition-only benchmarks with `.gitkeep`). |

Run `doctor` before filing issues or starting a large benchmark run.

## Security & Trust Boundaries

The trust boundary between the harness and each implementation is documented in
[`docs/architecture/overview.md`](../architecture/overview.md) (trust boundaries, atomic writes, checker independence)
and [`docs/architecture/execution-model.md`](../architecture/execution-model.md) (harness-timed protocol, isolation, timeout handling).

## Running Benchmarks

```bash
# All stale/missing cells
npm run arena -- run

# Specific combination
npm run arena -- run --language rust --benchmark nbody --size small

# Force re-run
npm run arena -- run --force
```

## Building the Web UI

```bash
npm run build:web
```

Copies `results/current.json` into `web/static/results/` and builds the SvelteKit static site.

## Viewing Results

```bash
npm run arena -- results current    # Raw JSON
npm run arena -- results summary    # Table view
npm run arena -- results status     # Cell freshness
```

## Regenerating Datasets

```bash
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418
```

Generators registered for all seven benchmarks. Deterministic from seed.

## Local Caches

- `.arena/runs/<snapshotId>/` — per-run scratch (deleted unless `--preserve-temp`)
- `.arena/build-cache/<fingerprint>/` — build artifact cache (compiled binaries reused when source hash matches)
- `.arena/go-build-cache/` — Go `GOCACHE` for language builds
- `.arena/go-checker-cache/` — Go `GOCACHE` for checker compilation
- `.arena/go-test-cache/` — Go `GOCACHE` for checker tests

## Rebuilding the Checker

```bash
npm run build:checker
```

Compiles `checker/cmd/arena-checker/main.go` to `bin/arena-checker[.exe]`.

## Troubleshooting

### "No available language/benchmark combinations selected"

Run `npm run arena -- doctor` to check which toolchains are available. All
selected languages must pass the toolchain check to be eligible.

### Implementation fails protocol conformance

Run the protocol conformance test to isolate implementation issues:

```bash
# Full build + protocol test (defaults to benchmark nbody)
npm run arena -- protocol test --language <id>

# Minimal mode — uses pre-built fixtures, skips compilation
npm run arena -- protocol test --language <id> --minimal

# Test against a specific benchmark
npm run arena -- protocol test --language <id> --benchmark <id>
```

The test reports whether the implementation followed the harness-timed
persistent-worker contract: correctly parsing `--input`, `--output`, and
`--protocol-version`, emitting `ready`/`result`/`finish` responses, and
producing matching digests.

### "Build failed for ..."

Check that the language toolchain is installed and the implementation compiles. Run the build command manually in the implementation directory.

### "Checker returned invalid JSON"

The checker binary may be missing or corrupted. Run `npm run build:checker`. If
the checker exists but still returns invalid JSON, there may be a schema version
mismatch between the CLI and checker — rebuild both:

```bash
npm run build:checker
npm run build:cli
```

### All cells show "stale"

Source files, manifests, datasets, or checker code have changed since the last
run. Run `npm run arena -- run` to re-execute. If fingerprints are correct but
you still want to re-run, pass `--force`:

```bash
npm run arena -- run --force
```

### Results not updating

1. Check that `--no-save` was not passed on the last run.
2. Verify `results/` directory is writable.
3. If results show the new data in `results/current.json` but not in the web UI
   or README scoreboard, run the data preparation step:
   ```bash
   npm run prepare-results        # syncs current.json into web/static/results/
   npm run update-readme-results   # regenerates the README scoreboard table
   ```
   Both `build:web` and `update-readme-results` read from `results/current.json`
   as their source of truth.

### "Build failed" for multiple implementations with the same language

The Go toolchain caches (`go-build-cache`) can become stale. Clear them and
retry:

```bash
# PowerShell
Remove-Item -Recurse -Force .arena/go-build-cache, .arena/go-checker-cache

# Unix / Git Bash
# rm -rf .arena/go-build-cache .arena/go-checker-cache
npm run build:checker
```

### Run is slow or hangs

Pass `--parallel` to use all CPU cores instead of the default parallelism of 2:

```bash
npm run arena -- run --parallel
```

If a single cell hangs, the harness enforces per-benchmark timeouts (configured
in `benchmark.json` `limits.timeoutMilliseconds`). Abort with Ctrl+C and check
the implementation's protocol conformance:

```bash
npm run arena -- protocol test --language <id> --minimal
```

### Snapshot fails schema validation

Results are validated against `schemas/result.schema.json`. If a manually
crafted or legacy snapshot fails, check the `schemaVersion` in the snapshot
matches the version expected by the CLI. Regenerate corrupted snapshots by
re-running:

```bash
npm run arena -- run --force
```
