# Scorecard Design System

The web dashboard presents language results as NBA 2K–style collectible cards (`OverallCard.svelte`) and as tier-tinted list rows (`BenchmarkScorecard.svelte`). There is no separate card JSON schema or asset pipeline — both components render a computed `BenchmarkScore` from `web/src/lib/scoring.ts` / `web/src/lib/types.ts`.

Shared visual helpers live in `web/src/lib/tiers.ts` (`getScoreTier`, `languageMonogram`, `formatBenchmarkLabel`). Unit tests: `tiers.test.ts`.

## Presentation Modes

| Mode | Component | Layout |
|------|-----------|--------|
| Collectible card | `OverallCard` | Vertical trading-card silhouette (`card-2k`), used in the Scorecard view and the expanded-card overlay |
| Detail row | `BenchmarkScorecard` | Horizontal ranked list with shared tier glow; expandable calculation/diagnostics |

Both modes call `getScoreTier(score.overall)`. Only `OverallCard` implements the full 2K frame, art stage, attribute meters, tilt, and shimmer.

## Score → Card Mapping

| Card surface | Score field | Notes |
|--------------|-------------|-------|
| Large SPEED number (OVR) | `overall` | Weighted composite: 80% geometric-mean speed + 10% consistency + 10% flexibility (0–100). Displayed as a rounded integer; `null` → `—` |
| SPEED / STABLE / FLEX meters | `performance`, `consistency`, `versatility` | Segmented 10-bar meters **plus** tabular numeric values beside each label |
| Language name + monogram | `language.id` / `language.name` | Stable abbreviations (`RS`, `TS`, `PY`, `LJ`, `GO`, `C++`) via `languageMonogram` |
| Footer runtime line | `language.id`, `language.version` | Version shows the first whitespace-delimited token |
| Archetype / team label | `benchmarkId` | `formatBenchmarkLabel` → `ARENA` or id with `[-_]+` → spaces, uppercased |
| Benchmark breakdown | `benchmarks[]` | Overall cards only; toggle reveals per-benchmark scores |
| Diagnostics (compact) | `diagnostics[]` | Ineligible: `UNVERIFIED · N issues` + first line. Eligible but incomplete coverage: `PARTIAL · N notes` (e.g. skipped barrier-wave) |
| Diagnostics (expanded) | full `diagnostics[]` | Shown in overlay / expanded card mode |

Leaderboard placement (RANK 01, 02, …) is separate from visual `tierLevel`. Tier tags (GO, PD, DIA, …) are rarity labels from score thresholds.

## Tiers and Rarity

Resolved by `getScoreTier(score: number | null)`:

| `overall` | Band name | Gem (rarity) | Tag | `tierLevel` | CSS class |
|-----------|-----------|--------------|-----|-------------|-----------|
| ≥ 95 | UNTOUCHABLE | Galaxy Opal | GO | 7 | `galaxy-opal` |
| ≥ 90 | INVINCIBLE | Pink Diamond | PD | 6 | `pink-diamond` |
| ≥ 80 | DOMINANT | Diamond | DIA | 5 | `diamond` |
| ≥ 70 | ELITE | Amethyst | AME | 4 | `amethyst` |
| ≥ 60 | STANDARD | Ruby | RUB | 3 | `ruby` |
| ≥ 45 | ROOKIE | Sapphire | SAP | 2 | `sapphire` |
| &lt; 45 | COMMON | Emerald | EME | 1 | `emerald` |
| `null` | UNVERIFIED | No Rank | — | 0 | `unranked` |

`tierLevel` (`0 | 1 | … | 7`) drives shimmer intensity and `high-tier` styling (`tierLevel >= 5`). Each tier sets `--tier-glow` and `--tier-gradient`.

## Language Visual Identity

Languages do **not** have fixed brand colorways. Appearance is:

1. Tier palette from `overall`.
2. Stable monogram from language id (`RS` / `TS` / …).
3. Name typography split into first token vs remainder.
4. Runtime footer from `language.id` and version.

## Card Chrome and Effects (`OverallCard`)

- **Silhouette**: Angular `clip-path` with corner shards.
- **Layers**: Edge gradient, scanlines, holographic shimmer, vignette.
- **Art stage**: Grid, floating code particles, monogram with halo.
- **Motion**: Pointer tilt (±6°) and particle float — disabled under `prefers-reduced-motion: reduce`.
- **High tier**: Stronger top wash when `tierLevel >= 5`.

## Dimensions

| Breakpoint | Max width | Aspect ratio |
|------------|-----------|--------------|
| Default | 320px | 5 / 8.2 |
| ≤ 600px | 280px | same |

## Snapshot Qualification

Near rankings in `ResultsExplorer`, a small line clarifies scope:

> Snapshot rankings · 80% geometric-mean speed · 10% consistency · 10% flexibility · skipped workloads noted

## Data Model

Persisted runs remain `ArenaRun` / `ArenaResult`. Scores and tiers are derived client-side. See `BenchmarkScore` in `web/src/lib/types.ts`.
