# Operations Runbook

## Health Check

```bash
npm run arena -- doctor
```

Verifies language toolchains, checker binary, result directory writability, and manifest validity.

## Running Benchmarks

```bash
# Run all benchmarks, all languages, all sizes
npm run arena -- run

# Run specific combinations
npm run arena -- run --language rust --benchmark nbody --size small

# Force re-run even if current
npm run arena -- run --force

# Force re-run everything
npm run arena -- run --force --all
```

## Checking Results Status

```bash
npm run arena -- results status
```

Shows each cell as `current`, `stale`, `missing`, or `unavailable`.

## Viewing Results

```bash
# Print current snapshot
npm run arena -- results current

# Output as JSON
npm run arena -- run --format json --quiet
```

## Building the Web UI

```bash
npm run build:web
```

This copies `results/current.json` into `web/static/results/` and builds the SvelteKit static site.

## Regenerating Datasets

```bash
npm run arena -- dataset generate --benchmark nbody --size small --seed 729418
```

Datasets are deterministic — the same seed produces the same data.

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
