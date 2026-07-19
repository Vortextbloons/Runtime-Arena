# Web Component

The web UI (`web/`) is an optional SvelteKit static dashboard for viewing benchmark results.

## Structure

```
web/
  package.json          # @runtime-arena/web, SvelteKit + Vite + adapter-static
  svelte.config.js      # Static adapter, outputs to build/
  vite.config.ts
  src/
    app.html            # HTML shell with dark theme (#0d1115)
    lib/
      types.ts          # TypeScript types (ArenaResult, ArenaRun, BenchmarkScore, SizeScore)
      scoring.ts        # Scoring algorithm
      scoring.test.ts   # Scoring tests
      BenchmarkChart.svelte
      BenchmarkScorecard.svelte
      FilteredResults.svelte
      OverallCard.svelte
      OverallChart.svelte
      ResultsExplorer.svelte
    routes/
      +page.svelte      # Main page
      +page.ts           # Data loader
      +layout.svelte
      +layout.ts
      benchmarks/[id]/  # Per-benchmark detail pages
      languages/[id]/   # Per-language detail pages
      methodology/      # Methodology explanation page
  static/
    results/            # Populated by prepare-results.ts
  build/                # Static build output
```

## Scoring Algorithm

The scoring system (`src/lib/scoring.ts`) computes a 0-100 speed score:

- Each eligible benchmark/size contributes `fastestMedian / thisMedian`.
- Ratios are combined with a geometric mean across sizes and benchmarks.
- A size tier is excluded for every language when its fastest valid median is below 1 ms.
- Correctness and complete sample counts remain strict eligibility gates **within** a benchmark.
- Overall scores use the geometric mean of whatever benchmarks that language completed successfully. Skipping a workload (no cells in the snapshot) does not zero the overall card; coverage gaps are noted as diagnostics.
- Consistency and scalability are displayed as diagnostics but do not affect rank.

## Build & Deploy

```bash
npm run build:web
```

This runs `prepare-results.ts` (copies `results/current.json` into `web/static/results/`) then builds the SvelteKit static site to `web/build/`.

## Local Preview

```bash
npm run arena -- web
```

Launches a Vite preview server for the built static site.

## Data Loading

The web UI loads results from `/results/current.json` (statically served). The `+page.ts` loader fetches this file and passes it to the page component.

## Components

| Component | Purpose |
|-----------|---------|
| `OverallCard` | 2K-style collectible card for a language overall score |
| `OverallChart` | Bar chart comparing all languages |
| `BenchmarkChart` | Per-benchmark performance chart |
| `BenchmarkScorecard` | Tier-tinted detail row for a benchmark/language |
| `FilteredResults` | Filterable results table |
| `ResultsExplorer` | Interactive results browser (chart / scorecard views) |

## Scorecards

The Scorecard view uses a trading-card design system (tiers, gem rarity, attribute meters, tilt/shimmer). Full specification: [scorecards.md](scorecards.md).
