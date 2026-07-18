# Runtime Arena

Extensible cross-language benchmarking system for comparing programming language implementations under identical workloads.

**Version:** 0.1.0 (scaffolding)

## Status

Project layout, manifests, schemas, and package configuration are in place. Application source (CLI, checker, implementations, datasets, web UI) is not implemented yet.

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
│   └── aggregation/
├── languages/                 Language manifests (rust, go, typescript)
├── schemas/                   JSON Schema for manifests and results
├── results/                   Versioned JSON run history
├── web/                       Optional SvelteKit results UI
└── scripts/                   Environment / results utilities
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

## Setup

```bash
npm install
```

Build the checker once source exists:

```bash
npm run build:checker
```

## Planned CLI

```bash
arena doctor
arena list languages
arena list benchmarks
arena run
arena results latest
arena web
```

The CLI is the primary product. The web UI only reads generated JSON and is optional.

## Extending

**Language:** add `languages/<id>.json` and an implementation under each benchmark.

**Benchmark:** add `benchmarks/<id>/benchmark.json`, datasets/generator, checker task, and language implementations.

**Metric:** register a collector; do not change benchmark programs.

See [Spec.md](./Spec.md) for the full specification.
