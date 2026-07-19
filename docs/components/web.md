# Web Component

The web UI (`web/`) is an optional SvelteKit static dashboard for viewing benchmark results.

## Structure

```
web/
  package.json              # @runtime-arena/web, SvelteKit + Vite + adapter-static
  svelte.config.js          # Static adapter, outputs to build/
  vite.config.ts
  src/
    app.html                # HTML shell with dark theme (#0d1115)
    lib/
      types.ts              # TypeScript types (ArenaResult, ArenaRun, BenchmarkScore, SizeScore)
      scoring.ts            # Scoring algorithm
      scoring.test.ts       # Scoring tests
      tiers.ts              # Score tier definitions (getScoreTier, languageMonogram, formatBenchmarkLabel)
      tiers.test.ts         # Tier unit tests
      implementationLines.ts       # LOC-per-language data loader
      cards.test.ts                # Integration tests for the card-building pipeline
      cards/                      # 2K-style card data pipeline
        index.ts                  # Public exports
        types.ts                  # CardTier, CardAttribute, EarnedBadge, LanguageCardData, etc.
        util.ts                   # cardTierFromOverall, cardTierLabel, percentileRank
        buildCardData.ts          # buildAllCardData, buildCardDataForLanguage, applyBadgeBonusesToScores
        classifications.ts        # Language classification catalog (execution model, role, memory model)
        attributes/
          definitions.ts          # BENCHMARK_ATTRIBUTE_IDS, attribute metadata
          calculateAttributes.ts  # Attribute ratings from benchmark scores + raw values
        badges/
          definitions.ts          # V1 / V1.5 / V2 / V2.5 badge definitions
          calculateBadgeTier.ts   # Hybrid badge tier calculation (awardHybridBadge)
          calculateBadgeBonus.ts  # Badge bonus computation (top 3 featured badges, overall capped at 100)
          awardBadges.ts          # Main badge award + featured selection logic
        divisions/
          calculateDivisionRanks.ts  # Division rank calculation
        takeovers/
          calculateTakeover.ts       # Primary / secondary takeover computation
        archetypes/
          buildNames.ts              # Build name generation
      data/
        implementation-lines.json    # Lines-of-code data per language/benchmark
      BenchmarkChart.svelte
      BenchmarkScorecard.svelte
      FilteredResults.svelte
      OverallCard.svelte
      OverallChart.svelte
      ResultsExplorer.svelte
    routes/
      +page.svelte            # Main page
      +page.ts                # Data loader
      +layout.svelte
      +layout.ts
      benchmarks/[id]/        # Per-benchmark detail pages
      languages/[id]/         # Per-language detail pages
      methodology/            # Methodology explanation page
  static/
    results/                  # Populated by prepare-results.ts
  build/                      # Static build output
```

## Scoring Algorithm

The scoring system (`src/lib/scoring.ts`) computes a 0-100 weighted overall score from two measured components, then applies optional badge bonuses in `buildCardData.ts`:

**Speed (75% weight)**
- Each eligible benchmark/size contributes `fastestMedian / thisMedian` as a 0-100 performance score.
- Ratios are combined with a geometric mean across sizes and benchmarks.
- A size tier is excluded for every language when its fastest valid median is below 1 ms.

**Flexibility (25% weight)**
- `versatility = 0.6 × min(benchmark performances) + 0.4 × average(benchmark performances)`, measuring breadth across completed workloads.

**Stability (diagnostic)**
- Per size: `consistency = clampScore(100 − CV × 400)`, where CV is the coefficient of variation of kernel times.
- Shown on cards but not included in overall.

**Badge bonuses**
- Badges are awarded via `awardBadges()` (in `cards/badges/awardBadges.ts`) from four definition groups: **V1** (6 core badges), **V1.5** (2 build-time badges), **V2** (1 memory badge), **V2.5** (2 code-economy badges).
- Each badge tier is calculated by `awardHybridBadge()` using a hybrid formula: `0.55 × absolute attribute rating + 0.45 × percentile rank` (when 3+ languages have comparable data).
- Tier values: Bronze +0.5, Silver +1.0, Gold +1.5, Hall of Fame +2.0, Legend +2.5.
- Featured selection (`selectFeaturedBadgeIds`) picks up to 3 badges, preferring higher tiers and distinct categories.
- Total bonus is computed by `calculateBadgeBonus()`: sum of top 3 featured tiers, overall capped at 100 via `applyFinalOverall()`.

**Overall**
- `baseOverall = 0.75 × geometric-mean speed + 0.25 × flexibility`
- `overall = min(100, baseOverall + badgeBonus)`
- Per-benchmark card scores use speed only.
- Correctness and complete sample counts remain strict eligibility gates **within** a benchmark.
- Overall scores use the weighted formula across whatever benchmarks that language completed successfully. Skipping a workload (no cells in the snapshot) does not zero the overall card; coverage gaps are noted as diagnostics.

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

| Component / Module | Purpose |
|--------------------|---------|
| `OverallCard` | 2K-style collectible card for a language overall score |
| `OverallChart` | Bar chart comparing all languages |
| `BenchmarkChart` | Per-benchmark performance chart |
| `BenchmarkScorecard` | Tier-tinted detail row for a benchmark/language |
| `FilteredResults` | Filterable results table |
| `ResultsExplorer` | Interactive results browser (chart / scorecard views) |
| `cards/` | Card data pipeline: `buildAllCardData()`, `LanguageCardData`, badge system, attribute calculation, division ranks, takeovers, build names |
| `tiers.ts` | Score tier definitions, language monograms, benchmark label formatting |
| `implementationLines.ts` | Lines-of-code data loader |

## Scorecards

The Scorecard view uses a trading-card design system (tiers, gem rarity, attribute meters, tilt/shimmer). Full specification: [scorecards.md](scorecards.md).
