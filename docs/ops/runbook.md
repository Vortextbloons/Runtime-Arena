# Operations Runbook

## Prerequisites

- Installed toolchains for the languages you intend to run (`npm run arena -- doctor` to verify).
- Built checker binary (`npm run build:checker`).

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

Run `npm run arena -- doctor` to check which toolchains are available.

### "Build failed for ..."

Check that the language toolchain is installed and the implementation compiles. Run the build command manually in the implementation directory.

### "Checker returned invalid JSON"

The checker binary may be missing or corrupted. Run `npm run build:checker`.

### All cells show "stale"

Source files, manifests, datasets, or checker code have changed since the last run. Run `npm run arena -- run` to re-execute.

### Results not updating

Check that `--no-save` is not set. Verify `results/` directory is writable.
