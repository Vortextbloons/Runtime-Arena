# Scorecard Design System

The web dashboard presents language results as NBA 2K–style collectible cards (`OverallCard.svelte`) and as tier-tinted list rows (`BenchmarkScorecard.svelte`). There is no separate card JSON schema or asset pipeline — both components render a computed `BenchmarkScore` from `web/src/lib/scoring.ts` / `web/src/lib/types.ts`.

Shared visual helpers live in `web/src/lib/tiers.ts` (`getScoreTier`, `languageMonogram`, `formatBenchmarkLabel`). The card data pipeline in `web/src/lib/cards/` adds `cardTierFromOverall()` (from `cards/util.ts`) for the S+/A/B/C/D letter grade shown on the card face, along with badge, attribute, takeover, division, and build-name logic. Unit tests: `tiers.test.ts`, `cards.test.ts`.

## Presentation Modes

| Mode | Component | Layout |
|------|-----------|--------|
| Collectible card | `OverallCard` | Vertical trading-card silhouette (`card-2k`), used in the Scorecard view and the expanded-card overlay |
| Detail row | `BenchmarkScorecard` | Horizontal ranked list with shared tier glow; expandable calculation/diagnostics |

`BenchmarkScorecard` calls `getScoreTier(score.overall)` for tier tinting. `OverallCard` also uses `getScoreTier(score.overall)` for the tier badge, gem, and glow colors. When card data (`LanguageCardData`) from `cards/buildCardData.ts` is available, `OverallCard` additionally shows a letter-grade tier (`cardTierFromOverall()`) from `cards/util.ts`, attribute meters, classifications, featured badges, takeovers, and division ranks. Only `OverallCard` implements the full 2K frame, art stage, attribute meters, tilt, and shimmer.

## Score → Card Mapping

| Card surface | Source | Notes |
|--------------|--------|-------|
| Large OVR number | `score.overall` | Weighted composite: 75% geometric-mean speed + 25% flexibility, plus badge bonuses (capped at 100 overall). Displayed as a rounded integer; `null` → `—` |
| SPEED / STABLE / FLEX meters | `score.performance`, `consistency`, `versatility` | Segmented 10-bar meters **plus** tabular numeric values beside each label. STABLE is diagnostic only. |
| Language name + monogram | `score.language` | Stable abbreviations via `languageMonogram`: `RS` (Rust), `GO` (Go), `JV` (Java), `JS` (JavaScript), `TS` (TypeScript), `PY` (Python), `LJ` (LuaJIT), `L5` (lua-interpreted), `C++` (C++) |
| Footer runtime | `score.language.id` / `score.language.version` | Version shows the first whitespace-delimited token |
| Archetype / team label | `card.buildName` (or `formatBenchmarkLabel`) | When card data present: `generateBuildName` → unique archetype name. Fallback: `ARENA` or id with `[-_]+` → spaces, uppercased |
| Letter-grade tier | `card.cardTier` | S+, S, A+, A, B, C, D via `cardTierFromOverall()` from `cards/util.ts` |
| Classifications | `card.displayClassifications` | Execution model + role chips (e.g. Native, Systems) from `cards/classifications.ts` |
| Attribute meters | `card.attributes[]` | Up to 5 benchmark-driven attributes (COMPUTE, ALGORITHMS, DATA-PROCESSING, IO, PARALLELISM) + extended attributes in expanded view |
| Takeovers | `card.takeover` | Primary / secondary specialisation labels from `cards/takeovers/calculateTakeover.ts` |
| Division ranks | `card.featuredDivisionRank` | Best division placement (rank + division name + field size) |
| Featured badges | `card.featuredBadgeIds` → `card.badges[]` | Up to 3 chips (name + tier label) with hover tooltip showing next-tier requirements |
| Benchmark breakdown | `score.benchmarks[]` | Overall cards only; toggle reveals per-benchmark scores |
| Diagnostics (compact) | `score.diagnostics[]` | Ineligible: `UNVERIFIED · N issues` + first line. Eligible but incomplete coverage: `PARTIAL · N notes` |
| Diagnostics (expanded) | full `score.diagnostics[]` | Shown in overlay / expanded card mode |

Leaderboard placement (RANK 01, 02, …) is separate from visual `tierLevel`. Tier tags (GO, PD, DIA, …) are rarity labels from score thresholds.

## Tiers and Rarity

Resolved by `getScoreTier(score: number | null)`:

| `overall` | Band name | Gem (rarity) | Tag | `tierLevel` | CSS class | `--tier-glow` | `--tier-gradient` |
|-----------|-----------|--------------|-----|-------------|-----------|---------------|--------------------|
| 100 | FLAWLESS | Dark Matter | DM | 9 | `dark-matter` | `#00e5ff` | `linear-gradient(135deg, #0a0612 0%, #1a0f3d 35%, #00d4ff 70%, #7b2fff 100%)` |
| ≥ 99 | TRANSCENDENT | Prismatic Opal | PO | 8 | `prismatic-opal` | `#e8c4ff` | `linear-gradient(135deg, #ff6ec7 0%, #7afcff 35%, #ffe66d 65%, #b388ff 100%)` |
| ≥ 95 | UNTOUCHABLE | Galaxy Opal | GO | 7 | `galaxy-opal` | `#ff2bd6` | `linear-gradient(135deg, #ff2bd6 0%, #b13bd6 45%, #6a1bd6 100%)` |
| ≥ 90 | INVINCIBLE | Pink Diamond | PD | 6 | `pink-diamond` | `#ff5fa8` | `linear-gradient(135deg, #ff6db5 0%, #d6388a 50%, #6a1d4f 100%)` |
| ≥ 80 | DOMINANT | Diamond | DIA | 5 | `diamond` | `#5ce6ff` | `linear-gradient(135deg, #5ce6ff 0%, #2d9fd6 50%, #103a5e 100%)` |
| ≥ 70 | ELITE | Amethyst | AME | 4 | `amethyst` | `#b794ff` | `linear-gradient(135deg, #b794ff 0%, #7a4ed6 50%, #2a1850 100%)` |
| ≥ 60 | STANDARD | Ruby | RUB | 3 | `ruby` | `#ff5a5a` | `linear-gradient(135deg, #ff5a5a 0%, #b32d2d 50%, #4a0e0e 100%)` |
| ≥ 45 | ROOKIE | Sapphire | SAP | 2 | `sapphire` | `#6a8cff` | `linear-gradient(135deg, #6a8cff 0%, #2d4fb8 50%, #0e1a4a 100%)` |
| &lt; 45 | COMMON | Emerald | EME | 1 | `emerald` | `#6affb8` | `linear-gradient(135deg, #6affb8 0%, #2db87a 50%, #0e4a2a 100%)` |
| `null` | UNVERIFIED | No Rank | — | 0 | `unranked` | `#4a5560` | `linear-gradient(135deg, #4a5560 0%, #2a323a 50%, #0e141a 100%)` |

`tierLevel` (`0 | 1 | … | 9`) drives shimmer intensity and `high-tier` styling (`tierLevel >= 5`). Apex cards (`tierLevel >= 8`) get stronger foil shimmer. Each tier sets `--tier-glow` and `--tier-gradient`.

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
- **Badges**: Badges are defined in four groups (`cards/badges/definitions.ts`): **V1** (6 core badges: Speedster, Compute Finisher, Data Wrangler, Pathfinder, Steady Hands, Scale Master), **V1.5** (Quick Build, Minimal Build), **V2** (Memory Minder), **V2.5** (Tight Code, High Yield). Tiers are computed via `awardHybridBadge()` which combines absolute attribute rating and percentile rank (when 3+ languages have data). Face shows up to three featured chips (name + tier) with hover tooltips showing the reason and next-tier requirements. Expanded cards show the full earned set as a compact chip grid.

## Dimensions

| Breakpoint | Max width | Aspect ratio |
|------------|-----------|--------------|
| Default | 320px | 5 / 8.2 |
| ≤ 600px | 280px | same |

## Snapshot Qualification

Near rankings in `ResultsExplorer`, a small line clarifies scope:

> Snapshot rankings · 75% geometric-mean speed · 25% flexibility · badge bonuses · skipped workloads noted

## Data Model

Persisted runs remain `ArenaRun` / `ArenaResult`. Scores and tiers are derived client-side. See `BenchmarkScore` in `web/src/lib/types.ts`.
