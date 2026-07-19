# Runtime Arena Documentation

Master index for all project documentation. Organized by topic for quick navigation.

## Architecture

High-level system design, component responsibilities, and data flow.

| File | Description |
|------|-------------|
| [architecture/overview.md](architecture/overview.md) | System architecture, trust boundaries, execution model |
| [architecture/execution-model.md](architecture/execution-model.md) | Cold-process execution, isolation, timing, limits |
| [architecture/fingerprinting.md](architecture/fingerprinting.md) | SHA-256 fingerprinting system for incremental execution |

## Components

| File | Description |
|------|-------------|
| [components/README.md](components/README.md) | Component overview — CLI, checker, benchmarks, languages, schemas, web |
| [components/cli.md](components/cli.md) | CLI architecture, dependencies, metric registry |
| [components/checker.md](components/checker.md) | Independent Go checker, validation logic, exit codes |
| [components/web.md](components/web.md) | SvelteKit dashboard, scoring algorithm, components |
| [components/scorecards.md](components/scorecards.md) | 2K-style scorecard design: tiers, rarity, fields, effects |

## Reference

API documentation, configuration, and protocol specification.

| File | Description |
|------|-------------|
| [reference/api.md](reference/api.md) | CLI commands, flags, and output formats |
| [reference/configuration.md](reference/configuration.md) | arena.config.json, language manifests, benchmark manifests |
| [reference/schemas.md](reference/schemas.md) | JSON Schema definitions for validation |
| [reference/benchmarks.md](reference/benchmarks.md) | Benchmark workloads — nbody, shortest-path, aggregation |

## Guides

Step-by-step instructions for development, testing, and deployment.

| File | Description |
|------|-------------|
| [guides/development.md](guides/development.md) | Developer setup, build commands, and conventions |
| [guides/testing.md](guides/testing.md) | Running and writing tests |
| [guides/web-deployment.md](guides/web-deployment.md) | Building and deploying the web UI |
| [guides/adding-a-benchmark.md](guides/adding-a-benchmark.md) | How to add a new benchmark workload |
| [guides/adding-a-language.md](guides/adding-a-language.md) | How to add a new language implementation |
| [guides/reviewing-benchmark-optimization.md](guides/reviewing-benchmark-optimization.md) | Checklist for reviewing benchmark optimizations |

## Operations

Runbook and troubleshooting.

| File | Description |
|------|-------------|
| [ops/runbook.md](ops/runbook.md) | Operations runbook — common tasks and troubleshooting |

## File Count

**19 documentation files** (19 included in combined output).
