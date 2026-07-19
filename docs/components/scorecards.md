# Scorecard Design System

The web dashboard presents language results as NBA 2K–style collectible cards (`OverallCard.svelte`) and as tier-tinted list rows (`BenchmarkScorecard.svelte`). There is no separate card JSON schema or asset pipeline — both components render a computed `BenchmarkScore` from `web/src/lib/scoring.ts` / `web/src/lib/types.ts`.

Source of truth for visuals: `web/src/lib/OverallCard.svelte` and `web/src/lib/BenchmarkScorecard.svelte`.

## Presentation Modes

| Mode | Component | Layout |
|------|-----------|--------|
| Collectible card | `OverallCard` | Vertical trading-card silhouette (`card-2k`), used in the Scorecard view and the expanded-card overlay |
| Detail row | `BenchmarkScorecard` | Horizontal ranked list with shared tier glow; expandable calculation/diagnostics |

Both modes share the same tier thresholds and glow palette. Only `OverallCard` implements the full 2K frame, art stage, attribute meters, tilt, and shimmer.

## Score → Card Mapping

Cards consume a `BenchmarkScore`. Relevant fields:

| Card surface | Score field | Notes |
|--------------|-------------|-------|
| Large SPEED number (OVR) | `overall` | Same value as `performance` (geometric-mean speed, 0–100). Displayed as a rounded integer; `null` → `—` |
| SPEED / STABLE / SCALE meters | `performance`, `consistency`, `scalability` | Each meter fills `round(value / 10)` of 10 segments (clamped 0–10) |
| Language name + monogram | `language.name` | Monogram is the first character of the name (not a per-language brand color) |
| Footer runtime line | `language.id`, `language.version` | Version shows the first whitespace-delimited token |
| Archetype / team label | `benchmarkId` | `overall` → `ARENA`; otherwise the benchmark id with underscores as spaces |
| Benchmark breakdown | `benchmarks[]` | Overall cards only; toggle reveals per-benchmark overall/performance/consistency/scalability |
| Diagnostics strip | `diagnostics[0]` | Shown when `eligible` is false |

Rank order in list views is sort order from scoring (higher `overall` first), not a letter grade. Tier tags on the card (GO, PD, DIA, …) are rarity labels derived from score thresholds, not placement rank.

## Tiers and Rarity

Visual “rarity” is entirely score-driven. There is no independent rarity enum in results JSON.

| `overall` | Band name | Gem (rarity) | Tag | Rank weight | CSS class |
|-----------|-----------|--------------|-----|-------------|-----------|
| ≥ 95 | UNTOUCHABLE | Galaxy Opal | GO | 7 | `galaxy-opal` |
| ≥ 90 | INVINCIBLE | Pink Diamond | PD | 6 | `pink-diamond` |
| ≥ 80 | DOMINANT | Diamond | DIA | 5 | `diamond` |
| ≥ 70 | ELITE | Amethyst | AME | 4 | `amethyst` |
| ≥ 60 | STANDARD | Ruby | RUB | 3 | `ruby` |
| ≥ 45 | ROOKIE | Sapphire | SAP | 2 | `sapphire` |
| &lt; 45 | COMMON | Emerald | EME | 1 | `emerald` |
| `null` (ineligible) | UNVERIFIED | No Rank | — | 0 | `unranked` |

`rank` (1–7) drives shimmer intensity and the `high-tier` treatment (rank ≥ 5: Diamond and above). Glow colors:

| Class | Glow |
|-------|------|
| `galaxy-opal` | `#ff2bd6` |
| `pink-diamond` | `#ff5fa8` |
| `diamond` | `#5ce6ff` |
| `amethyst` | `#b794ff` |
| `ruby` | `#ff5a5a` |
| `sapphire` | `#6a8cff` |
| `emerald` | `#6affb8` |
| `unranked` | `#4a5560` |

Each tier also sets a matching diagonal gradient on the card edge (`--tier-gradient`).

## Language Visual Identity

Languages do **not** have fixed brand themes, borders, or colorways. Appearance is:

1. Tier palette from `overall` (shared across all languages at that score).
2. Monogram art from the first letter of `language.name`.
3. Name split into first token vs remainder for typography hierarchy.
4. Runtime footer from `language.id` and version.

Changing a language’s display name changes the monogram; changing its score changes the entire tier look.

## Card Chrome and Effects (`OverallCard`)

- **Silhouette**: Angular `clip-path` (cut top-right and bottom-left) with small corner shards.
- **Layers**: Edge gradient, diagonal scanline pattern, holographic shimmer, vignette.
- **Art stage**: Grid backdrop, floating code-token particles (`{`, `<`, `/>`, …), large monogram with halo/floor glow.
- **Tier band**: Full-width band showing the band name (e.g. DOMINANT) with shine and rivet accents.
- **Motion**: Pointer-tracking 3D tilt (`perspective` + `rotateX` / `rotateY`, ±6°); hover deepens drop-shadow and tier glow; particle float animation.
- **High tier**: Stronger top radial wash when rank ≥ 5.

## Dimensions

| Breakpoint | Max width | Aspect ratio |
|------------|-----------|--------------|
| Default | 320px | 5 / 8.2 |
| ≤ 600px | 280px | same |

Width is `100%` up to the max; height follows the aspect ratio. Cards are centered in their grid cell.

## Data Model (No Card Schema)

There is no `card.json` or collectible payload. The UI model is `BenchmarkScore` in `web/src/lib/types.ts`:

```ts
type BenchmarkScore = {
  benchmarkId: string;
  language: { id: string; name: string; version: string };
  eligible: boolean;
  overall: number | null;
  performance: number | null;
  consistency: number | null;
  scalability: number | null;
  sizes: SizeScore[];
  expectedSizes: string[];
  diagnostics: string[];
  benchmarks?: Array<{
    benchmarkId: string;
    overall: number;
    performance: number;
    consistency: number;
    scalability: number;
  }>;
};
```

Persisted run data remains `results/current.json` (`ArenaRun` / `ArenaResult`). Scores and tiers are derived client-side at view time.

## Where Cards Appear

`ResultsExplorer.svelte` toggles Chart vs Scorecard. The Scorecard view renders one `OverallCard` per overall language score; clicking a card expands it in an overlay. Per-benchmark detail uses `BenchmarkScorecard` rows (same tiers, list chrome).
