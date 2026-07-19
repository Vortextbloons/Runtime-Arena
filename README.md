# Runtime Arena

Extensible cross-language benchmarking system for comparing programming language implementations under identical workloads.

**Version:** 0.2.0 (result snapshot `arenaVersion`; npm package.json may still report 0.1.0)

## Status

The command-line benchmark workflow is implemented for Rust, Go, TypeScript, Python, LuaJIT, and C++ across **nbody**, **shortest-path**, **aggregation**, and **barrier-wave**. It includes deterministic datasets, independent Go validation, result-schema validation, terminal rankings, and one incrementally maintained canonical result snapshot.

**Barrier Wave** is an additional workload with committed datasets and checker support; C++ is implemented, and language implementations for the remaining languages are in progress and not yet part of the full six-language matrix.

The SvelteKit web interface remains optional scaffolding and is not required for benchmark execution.

## Structure

```text
runtime-arena/
├── arena.config.json          Root runner configuration
├── package.json               npm workspaces root
├── cli/                       TypeScript CLI (`arena`)
├── checker/                   Go independent result checker
├── benchmarks/                Benchmark manifests + implementations
│   ├── nbody/
│   ├── shortest-path/
│   ├── aggregation/
│   └── barrier-wave/          # Committed workload; C++ implemented, others WIP
├── languages/                 Language manifests (rust, go, typescript, python, lua, cpp)
├── schemas/                   JSON Schema for manifests and results
├── results/                   Canonical benchmark result snapshot
├── web/                       Optional SvelteKit results UI
└── scripts/                   Build / results utilities
```

## Prerequisites

Aligned to the local toolchain used for development:

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 26.4 | CLI runner and TypeScript benchmarks |
| npm | ≥ 11.17 | Workspace installs |
| Go | ≥ 1.26 | Checker binary |
| Rust (rustc + cargo) | ≥ 1.97 | Rust benchmarks |
| TypeScript | 7.x | CLI and web typing |
| Python | ≥ 3.8 | Python benchmarks |
| LuaJIT | — | Lua benchmarks |
| g++ (C++23) | — | C++ implementations |

## Setup

```bash
npm install
```

Build the CLI and checker:

```bash
npm run build:cli
npm run build:checker
```

## CLI

```bash
arena doctor
arena list languages
arena list benchmarks
arena run
arena results current
arena results status
```

The CLI is the primary product. The web UI only reads generated JSON and is optional.

Use npm scripts without a globally linked executable:

```bash
npm run doctor
npm run arena -- run --language rust --benchmark nbody --size medium
npm run arena -- results status
npm run arena -- results current
```

`arena run` executes only missing or stale benchmark/language/size cells. Use
selectors to narrow the work, `--force` to refresh selected current cells, or
`--force --all` to intentionally refresh every runnable cell. Accepted results
are merged atomically into `results/current.json`; failed attempts do not replace
an existing accepted result.

With no `--size` flag, the runner considers every configured default size.
Generate a deterministic replacement dataset and its hash metadata with:

```bash
npm run arena -- dataset generate --benchmark shortest-path --size large --seed 729418
```

Build the optional static results interface:

```bash
npm run build:web
```

This copies the canonical result snapshot into `web/static/results/` and
prerenders the dashboard to `web/build/`. During development, run
`npm run prepare-results` followed by `npm run dev --workspace=@runtime-arena/web`.
After building, `npm run arena -- web` serves the static interface locally.

Run automated checks:

```bash
npm test
cd checker && go test ./...
```

## Extending

**Language:** add `languages/<id>.json` and an implementation under each benchmark.

**Benchmark:** add `benchmarks/<id>/benchmark.json`, datasets/generator, checker task, and language implementations.

**Metric:** register a collector; do not change benchmark programs.


