# Runtime Arena Scorecard

> **Snapshot**: `2026-07-19T23-40-55-715-830250aaZ`  
> **Date**: 2026-07-19T23:40:55.715Z  
> **Arena version**: 0.2.0  
> **Commit**: `8e5811ef` (dirty)  
> **All benchmarks validated**: 261/261 results  
> **Machine**: AMD Ryzen 5 9600X 6-Core Processor (12 logical cores)  
> **OS**: win32 10.0.26200  
> **RAM**: 33.4 GB  
> **Benchmarks**: `aggregation`, `barrier-wave`, `matrix-multiplication`, `nbody`, `record-sorting`, `shortest-path`, `word-frequency`  
> **Languages**: C++, Go, Java, JavaScript, LuaJIT, Python, Rust, TypeScript  

## Overall Leaderboard

Scoring: **OVR** = 75% geometric-mean **SPD** + 25% **FLEX** + badge bonus. *Base OVR* shown in parentheses.

| # | | Lang | Monogram | Base OVR | +Bonus | Final OVR | SPD | FLEX | STABLE | Tier | Gem | Wins |
|---|----|------|----------|----------|--------|-----------|-----|------|--------|------|------|------|
| **1** | **S+** | Rust | RS | 94.2 | +7.5 | **100.0** | 95.6 | 90.0 | 70.9 | Dark Matter `DM` | 23 |
| **2** | **A+** | C++ | C++ | 81.0 | +4.5 | **85.5** | 85.0 | 69.3 | 81.2 | Diamond `DIA` | 3 |
| **3** | **A** | Go | GO | 79.6 | +1.0 | **80.6** | 82.0 | 72.5 | 68.7 | Diamond `DIA` | 2 |
| **4** | **C** | Java | JV | 66.4 | +0.0 | **66.4** | 69.4 | 57.7 | 33.2 | Ruby `RUB` | 5 |
| **5** | **D** | JavaScript | JS | 57.3 | +0.5 | **57.8** | 60.8 | 46.7 | 47.0 | Sapphire `SAP` | 0 |
| **6** | **D** | TypeScript | TS | 57.4 | +0.0 | **57.4** | 60.7 | 47.6 | 49.6 | Sapphire `SAP` | 0 |
| **7** | **D** | LuaJIT | LJ | 46.4 | +0.0 | **46.4** | 50.4 | 34.4 | 51.7 | Sapphire `SAP` | 0 |
| **8** | **D** | Python | PY | 11.9 | +0.0 | **11.9** | 12.6 | 9.8 | 59.7 | Emerald `EME` | 0 |

### Scoring Methodology

- **Base OVR** = 75% geometric-mean **SPD** + 25% **FLEX** (weighted composite, 0–100).
- **SPD** (Performance): geometric mean of all benchmark performance scores.
- **FLEX** (Versatility): 60% minimum-benchmark + 40% average — across all benchmarks.
- **STABLE** (Consistency): average stability; diagnostic only, not used in OVR.
- **+Bonus**: sum of up to 3 featured badge bonuses (Bronze +0.5, Silver +1.0, Gold +1.5, HoF +2.0, Legend +2.5).
- **Final OVR** = Base OVR + Badge Bonus (capped at 100).
- Performance formula: `perf = 100 × (fastest / median)^0.65` (floor 0.1).
- **Wins**: number of ranked benchmark×size×mutation cells where this language posted the lowest median time.

### Badge Methodology

Badges use *hybrid qualification*: `Q = 55% absolute rating + 45% percentile rank` (when ≥3 languages have data).
Each badge tier has minimum thresholds for absolute score, Q-score, and percentile.

| Tier | Abs Min | Q Min | P Min | OVR Bonus |
|------|---------|-------|-------|-----------|
| Legend | 97 | 97 | P85 | +2.5 |
| Hall of Fame | 94 | 94 | P70 | +2.0 |
| Gold | 90 | 90 | P55 | +1.5 |
| Silver | 85 | 85 | P40 | +1.0 |
| Bronze | 78 | 78 | P25 | +0.5 |

## Tier & Rarity Reference

| Score | Band | Gem (Rarity) | Tag | Tier Level |
|-------|------|--------------|-----|------------|
| 100 | FLAWLESS | Dark Matter | DM | 9 |
| ≥ 99 | TRANSCENDENT | Prismatic Opal | PO | 8 |
| ≥ 95 | UNTOUCHABLE | Galaxy Opal | GO | 7 |
| ≥ 90 | INVINCIBLE | Pink Diamond | PD | 6 |
| ≥ 80 | DOMINANT | Diamond | DIA | 5 |
| ≥ 70 | ELITE | Amethyst | AME | 4 |
| ≥ 60 | STANDARD | Ruby | RUB | 3 |
| ≥ 45 | ROOKIE | Sapphire | SAP | 2 |
| &lt; 45 | COMMON | Emerald | EME | 1 |

## Badge Summary Matrix

| Lang | Speedster | Compute Finisher | Data Wrangler | Pathfinder | Steady Hands | Scale Master |
|------|-----------|------------------|---------------|------------|--------------|--------------|
| Rust | 🌟 Hall of Fame | 🏆 Legend | 🏆 Legend | 🏆 Legend | — | 🥈 Silver |
| C++ | 🥉 Bronze | 🥇 Gold | 🥈 Silver | — | 🥉 Bronze | 🌟 Hall of Fame |
| Go | — | — | — | 🥉 Bronze | — | 🥉 Bronze |
| Java | — | — | — | — | — | — |
| JavaScript | — | 🥉 Bronze | — | — | — | — |
| TypeScript | — | — | — | — | — | — |
| LuaJIT | — | — | — | — | — | — |
| Python | — | — | — | — | — | — |

## Language Card Profiles

### RS — Rust

<table><tr><td>

**OVR**  
# **100.0**

_(base 94.2 + 7.5 badge bonus)_

**Tier**  
Dark Matter · `DM`  
**FLAWLESS**

**Letter Grade**  
S+  

**Runtime**  
rustc  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **95.6** | ███████████████████░ |
| STABLE | **70.9** | ██████████████░░░░░░ |
| FLEX | **90.0** | ██████████████████░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Compute Finisher | **Legend** | 100 | P100 | 100 | — |
| ★ Data Wrangler | **Legend** | 100 | P100 | 100 | — |
| ★ Pathfinder | **Legend** | 100 | P100 | 100 | — |
| Speedster | **Hall of Fame** | 96 | P100 | 98 | Legend (Abs ≥97; Q ≥97; P85) |
| Scale Master | **Silver** | 93 | P86 | 90 | Gold (Abs ≥90; Q ≥90; P55) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +7.5** from Compute Finisher (Legend +2.5), Data Wrangler (Legend +2.5), Pathfinder (Legend +2.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **100.0** | #1 of 8 | 1.00× |
| `barrier-wave` | **86.8** | #3 of 7 | 1.24× |
| `matrix-multiplication` | **86.1** | #4 of 8 | 1.26× |
| `nbody` | **100.0** | #1 of 8 | 1.00× |
| `record-sorting` | **100.0** | #1 of 8 | 1.00× |
| `shortest-path` | **100.0** | #1 of 8 | 1.00× |
| `word-frequency` | **97.6** | #1 of 8 | 1.04× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **95.6** | Speedster |
| Compute | CMP | **100.0** | Compute Finisher |
| Data Processing | DAT | **100.0** | Data Wrangler |
| Algorithms | ALG | **100.0** | Pathfinder |
| Consistency | CON | **70.9** | Steady Hands |
| Scalability | SCL | **92.8** | Scale Master |

#### Fastest Cells (23)

| Benchmark | Size | Median |
|-----------|------|--------|
| `aggregation` | L | 2.49 ms |
| `aggregation` | M | 1.69 ms |
| `aggregation` | S | 1.18 ms |
| `matrix-multiplication` | L (column-major) | 180.44 ms |
| `nbody` | L | 4.25 ms |
| `nbody` | M | 1.51 ms |
| `nbody` | S | 1.73 ms |
| `record-sorting` | L (mostly-sorted) | 35.03 ms |
| `record-sorting` | L (random) | 38.52 ms |
| `record-sorting` | M (mostly-sorted) | 5.80 ms |
| `record-sorting` | M (random) | 7.52 ms |
| `record-sorting` | S (mostly-sorted) | 1.04 ms |
| `record-sorting` | S (random) | 1.33 ms |
| `shortest-path` | L (dense) | 8.31 ms |
| `shortest-path` | L (sparse) | 4.09 ms |
| `shortest-path` | M (dense) | 1.97 ms |
| `shortest-path` | M (sparse) | 952.1 µs |
| `shortest-path` | S (dense) | 3.55 ms |
| `shortest-path` | S (sparse) | 1.88 ms |
| `word-frequency` | M (mostly-unique) | 1.16 ms |
| `word-frequency` | M (repeated-vocabulary) | 1.13 ms |
| `word-frequency` | S (mostly-unique) | 1.18 ms |
| `word-frequency` | S (repeated-vocabulary) | 1.18 ms |

---

### C++ — C++

<table><tr><td>

**OVR**  
# **85.5**

_(base 81.0 + 4.5 badge bonus)_

**Tier**  
Diamond · `DIA`  
**DOMINANT**

**Letter Grade**  
A+  

**Runtime**  
g++.exe  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **85.0** | █████████████████░░░ |
| STABLE | **81.2** | ████████████████░░░░ |
| FLEX | **69.3** | ██████████████░░░░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Scale Master | **Hall of Fame** | 95 | P100 | 97 | Legend (Abs ≥97; Q ≥97; P85) |
| ★ Compute Finisher | **Gold** | 94 | P86 | 90 | Hall of Fame (Abs ≥94; Q ≥94; P70) |
| ★ Data Wrangler | **Silver** | 89 | P86 | 88 | Gold (Abs ≥90; Q ≥90; P55) |
| Speedster | **Bronze** | 85 | P86 | 85 | Silver (Abs ≥85; Q ≥85; P40) |
| Steady Hands | **Bronze** | 81 | P100 | 90 | Silver (Abs ≥85; Q ≥85; P40) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +4.5** from Scale Master (Hall of Fame +2), Compute Finisher (Gold +1.5), Data Wrangler (Silver +1)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **89.2** | #2 of 8 | 1.19× |
| `barrier-wave` | **100.0** | #1 of 7 | 1.00× |
| `matrix-multiplication` | **94.4** | #2 of 8 | 1.09× |
| `nbody` | **93.8** | #2 of 8 | 1.10× |
| `record-sorting` | **58.0** | #3 of 8 | 2.32× |
| `shortest-path` | **75.8** | #4 of 8 | 1.54× |
| `word-frequency` | **92.0** | #3 of 8 | 1.14× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **85.0** | Speedster |
| Compute | CMP | **93.8** | Compute Finisher |
| Data Processing | DAT | **89.2** | Data Wrangler |
| Algorithms | ALG | **75.8** | Pathfinder |
| Consistency | CON | **81.2** | Steady Hands |
| Scalability | SCL | **95.4** | Scale Master |

#### Fastest Cells (3)

| Benchmark | Size | Median |
|-----------|------|--------|
| `barrier-wave` | L | 35.47 ms |
| `barrier-wave` | M | 9.79 ms |
| `barrier-wave` | S | 1.74 ms |

---

### GO — Go

<table><tr><td>

**OVR**  
# **80.6**

_(base 79.6 + 1.0 badge bonus)_

**Tier**  
Diamond · `DIA`  
**DOMINANT**

**Letter Grade**  
A  

**Runtime**  
go  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **82.0** | ████████████████░░░░ |
| STABLE | **68.7** | ██████████████░░░░░░ |
| FLEX | **72.5** | ██████████████░░░░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Pathfinder | **Bronze** | 80 | P86 | 83 | Silver (Abs ≥85; Q ≥85; P40) |
| ★ Scale Master | **Bronze** | 91 | P71 | 82 | Silver (Abs ≥85; Q ≥85; P40) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +1.0** from Pathfinder (Bronze +0.5), Scale Master (Bronze +0.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **65.7** | #5 of 8 | 1.91× |
| `barrier-wave` | **88.0** | #2 of 7 | 1.22× |
| `matrix-multiplication` | **93.9** | #3 of 8 | 1.10× |
| `nbody` | **72.7** | #6 of 8 | 1.63× |
| `record-sorting` | **81.4** | #2 of 8 | 1.41× |
| `shortest-path` | **80.2** | #2 of 8 | 1.43× |
| `word-frequency` | **96.5** | #2 of 8 | 1.06× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **82.0** | Speedster |
| Compute | CMP | **72.7** | Compute Finisher |
| Data Processing | DAT | **65.7** | Data Wrangler |
| Algorithms | ALG | **80.2** | Pathfinder |
| Consistency | CON | **68.7** | Steady Hands |
| Scalability | SCL | **90.8** | Scale Master |

#### Fastest Cells (2)

| Benchmark | Size | Median |
|-----------|------|--------|
| `word-frequency` | L (mostly-unique) | 4.45 ms |
| `word-frequency` | L (repeated-vocabulary) | 3.90 ms |

---

### JV — Java

<table><tr><td>

**OVR**  
# **66.4**

**Tier**  
Ruby · `RUB`  
**STANDARD**

**Letter Grade**  
C  

**Runtime**  
javac  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **69.4** | ██████████████░░░░░░ |
| STABLE | **33.2** | ███████░░░░░░░░░░░░░ |
| FLEX | **57.7** | ████████████░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **75.7** | #4 of 8 | 1.54× |
| `barrier-wave` | **48.8** | #4 of 7 | 3.01× |
| `matrix-multiplication` | **98.8** | #1 of 8 | 1.02× |
| `nbody` | **73.5** | #5 of 8 | 1.61× |
| `record-sorting` | **57.7** | #4 of 8 | 2.36× |
| `shortest-path` | **75.9** | #3 of 8 | 1.52× |
| `word-frequency` | **65.9** | #7 of 8 | 1.91× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **69.4** | Speedster |
| Compute | CMP | **73.5** | Compute Finisher |
| Data Processing | DAT | **75.7** | Data Wrangler |
| Algorithms | ALG | **75.9** | Pathfinder |
| Consistency | CON | **33.2** | Steady Hands |
| Scalability | SCL | **74.8** | Scale Master |

#### Fastest Cells (5)

| Benchmark | Size | Median |
|-----------|------|--------|
| `matrix-multiplication` | L (row-major) | 178.00 ms |
| `matrix-multiplication` | M (column-major) | 17.34 ms |
| `matrix-multiplication` | M (row-major) | 17.22 ms |
| `matrix-multiplication` | S (column-major) | 1.78 ms |
| `matrix-multiplication` | S (row-major) | 1.87 ms |

---

### JS — JavaScript

<table><tr><td>

**OVR**  
# **57.8**

_(base 57.3 + 0.5 badge bonus)_

**Tier**  
Sapphire · `SAP`  
**ROOKIE**

**Letter Grade**  
D  

**Runtime**  
v26.4.0  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **60.8** | ████████████░░░░░░░░ |
| STABLE | **47.0** | █████████░░░░░░░░░░░ |
| FLEX | **46.7** | █████████░░░░░░░░░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Compute Finisher | **Bronze** | 85 | P71 | 79 | Silver (Abs ≥85; Q ≥85; P40) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +0.5** from Compute Finisher (Bronze +0.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **59.1** | #7 of 8 | 2.25× |
| `barrier-wave` | **46.7** | #5 of 7 | 3.23× |
| `matrix-multiplication` | **79.3** | #6 of 8 | 1.43× |
| `nbody` | **84.6** | #3 of 8 | 1.29× |
| `record-sorting` | **35.8** | #6 of 8 | 5.05× |
| `shortest-path` | **66.6** | #6 of 8 | 1.92× |
| `word-frequency` | **69.6** | #6 of 8 | 1.76× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **60.8** | Speedster |
| Compute | CMP | **84.6** | Compute Finisher |
| Data Processing | DAT | **59.1** | Data Wrangler |
| Algorithms | ALG | **66.6** | Pathfinder |
| Consistency | CON | **47.0** | Steady Hands |
| Scalability | SCL | **77.6** | Scale Master |

---

### TS — TypeScript

<table><tr><td>

**OVR**  
# **57.4**

**Tier**  
Sapphire · `SAP`  
**ROOKIE**

**Letter Grade**  
D  

**Runtime**  
v26.4.0  
Version

</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **60.7** | ████████████░░░░░░░░ |
| STABLE | **49.6** | ██████████░░░░░░░░░░ |
| FLEX | **47.6** | ██████████░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **60.3** | #6 of 8 | 2.18× |
| `barrier-wave` | **40.4** | #6 of 7 | 4.03× |
| `matrix-multiplication` | **80.4** | #5 of 8 | 1.40× |
| `nbody` | **83.5** | #4 of 8 | 1.32× |
| `record-sorting` | **37.0** | #5 of 8 | 4.79× |
| `shortest-path` | **67.5** | #5 of 8 | 1.87× |
| `word-frequency` | **74.3** | #4 of 8 | 1.58× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **60.7** | Speedster |
| Compute | CMP | **83.5** | Compute Finisher |
| Data Processing | DAT | **60.3** | Data Wrangler |
| Algorithms | ALG | **67.5** | Pathfinder |
| Consistency | CON | **49.6** | Steady Hands |
| Scalability | SCL | **75.7** | Scale Master |

---

### LJ — LuaJIT

<table><tr><td>

**OVR**  
# **46.4**

**Tier**  
Sapphire · `SAP`  
**ROOKIE**

**Letter Grade**  
D  

**Runtime**  
LuaJIT  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **50.4** | ██████████░░░░░░░░░░ |
| STABLE | **51.7** | ██████████░░░░░░░░░░ |
| FLEX | **34.4** | ███████░░░░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **76.5** | #3 of 8 | 1.51× |
| `barrier-wave` | — | — | Not eligible |
| `matrix-multiplication` | **62.2** | #7 of 8 | 2.09× |
| `nbody` | **56.7** | #7 of 8 | 2.40× |
| `record-sorting` | **20.7** | #8 of 8 | 11.55× |
| `shortest-path` | **39.7** | #7 of 8 | 4.21× |
| `word-frequency` | **74.3** | #5 of 8 | 1.58× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **50.4** | Speedster |
| Compute | CMP | **56.7** | Compute Finisher |
| Data Processing | DAT | **76.5** | Data Wrangler |
| Algorithms | ALG | **39.7** | Pathfinder |
| Consistency | CON | **51.7** | Steady Hands |
| Scalability | SCL | **79.2** | Scale Master |

---

### PY — Python

<table><tr><td>

**OVR**  
# **11.9**

**Tier**  
Emerald · `EME`  
**COMMON**

**Letter Grade**  
D  

**Runtime**  
Python  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **12.6** | ███░░░░░░░░░░░░░░░░░ |
| STABLE | **59.7** | ████████████░░░░░░░░ |
| FLEX | **9.8** | ██░░░░░░░░░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **20.2** | #8 of 8 | 11.72× |
| `barrier-wave` | **3.4** | #7 of 7 | 181.18× |
| `matrix-multiplication` | **6.3** | #8 of 8 | 69.55× |
| `nbody` | **4.5** | #8 of 8 | 117.55× |
| `record-sorting` | **21.6** | #7 of 8 | 11.38× |
| `shortest-path` | **20.6** | #8 of 8 | 11.28× |
| `word-frequency` | **58.7** | #8 of 8 | 2.27× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **12.6** | Speedster |
| Compute | CMP | **4.5** | Compute Finisher |
| Data Processing | DAT | **20.2** | Data Wrangler |
| Algorithms | ALG | **20.6** | Pathfinder |
| Consistency | CON | **59.7** | Steady Hands |
| Scalability | SCL | **84.0** | Scale Master |

---

## Per-Benchmark Leaderboards

### `aggregation`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 61.1 | 1.00× |
| 2 | C++ | **89.2** | 74.9 | 1.19× |
| 3 | LuaJIT | **76.5** | 36.8 | 1.51× |
| 4 | Java | **75.7** | 0.0 | 1.54× |
| 5 | Go | **65.7** | 50.5 | 1.91× |
| 6 | TypeScript | **60.3** | 52.6 | 2.18× |
| 7 | JavaScript | **59.1** | 54.8 | 2.25× |
| 8 | Python | **20.2** | 50.2 | 11.72× |

#### small

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.18 ms | 1.00× |
| 2 | C++ | 1.48 ms | 1.25× |
| 3 | LuaJIT | 1.74 ms | 1.47× |
| 4 | Go | 2.49 ms | 2.10× |
| 5 | Java | 2.50 ms | 2.11× |
| 6 | JavaScript | 2.95 ms | 2.49× |
| 7 | TypeScript | 3.35 ms | 2.83× |
| 8 | Python | 16.13 ms | 13.64× |

#### medium

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.69 ms | 1.00× |
| 2 | C++ | 1.95 ms | 1.16× |
| 3 | Java | 2.16 ms | 1.28× |
| 4 | LuaJIT | 2.25 ms | 1.33× |
| 5 | Go | 2.79 ms | 1.66× |
| 6 | TypeScript | 2.90 ms | 1.72× |
| 7 | JavaScript | 3.64 ms | 2.16× |
| 8 | Python | 17.27 ms | 10.25× |

#### large

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 2.49 ms | 1.00× |
| 2 | C++ | 2.92 ms | 1.18× |
| 3 | Java | 3.32 ms | 1.34× |
| 4 | LuaJIT | 4.36 ms | 1.75× |
| 5 | Go | 4.97 ms | 2.00× |
| 6 | JavaScript | 5.23 ms | 2.10× |
| 7 | TypeScript | 5.28 ms | 2.13× |
| 8 | Python | 28.60 ms | 11.51× |

---

### `barrier-wave`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | C++ | **100.0** | 84.2 | 1.00× |
| 2 | Go | **88.0** | 69.0 | 1.22× |
| 3 | Rust | **86.8** | 61.2 | 1.24× |
| 4 | Java | **48.8** | 73.6 | 3.01× |
| 5 | JavaScript | **46.7** | 73.1 | 3.23× |
| 6 | TypeScript | **40.4** | 77.9 | 4.03× |
| 7 | Python | **3.4** | 64.4 | 181.18× |

#### small

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | C++ | 1.74 ms | 1.00× |
| 2 | Rust | 2.21 ms | 1.27× |
| 3 | Go | 2.69 ms | 1.55× |
| 4 | Java | 24.58 ms | 14.16× |
| 5 | TypeScript | 27.05 ms | 15.58× |
| 6 | JavaScript | 27.11 ms | 15.62× |
| 7 | Python | 298.92 ms | 172.15× |

#### medium

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | C++ | 9.79 ms | 1.00× |
| 2 | Go | 10.36 ms | 1.06× |
| 3 | Rust | 10.45 ms | 1.07× |
| 4 | JavaScript | 14.30 ms | 1.46× |
| 5 | TypeScript | 14.90 ms | 1.52× |
| 6 | Java | 16.47 ms | 1.68× |
| 7 | Python | 2.049 s | 209.32× |

#### large

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | C++ | 35.47 ms | 1.00× |
| 2 | Go | 39.01 ms | 1.10× |
| 3 | Java | 40.72 ms | 1.15× |
| 4 | Rust | 50.15 ms | 1.41× |
| 5 | JavaScript | 52.18 ms | 1.47× |
| 6 | TypeScript | 98.18 ms | 2.77× |
| 7 | Python | 5.854 s | 165.07× |

---

### `matrix-multiplication`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Java | **98.8** | 29.9 | 1.02× |
| 2 | C++ | **94.4** | 82.2 | 1.09× |
| 3 | Go | **93.9** | 75.9 | 1.10× |
| 4 | Rust | **86.1** | 89.0 | 1.26× |
| 5 | TypeScript | **80.4** | 39.9 | 1.40× |
| 6 | JavaScript | **79.3** | 42.5 | 1.43× |
| 7 | LuaJIT | **62.2** | 49.0 | 2.09× |
| 8 | Python | **6.3** | 74.5 | 69.55× |

#### small/column-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 1.78 ms | 1.00× |
| 2 | C++ | 2.06 ms | 1.16× |
| 3 | Go | 2.35 ms | 1.32× |
| 4 | Rust | 2.99 ms | 1.68× |
| 5 | JavaScript | 3.55 ms | 2.00× |
| 6 | TypeScript | 3.58 ms | 2.01× |
| 7 | LuaJIT | 5.01 ms | 2.81× |
| 8 | Python | 162.74 ms | 91.41× |

#### small/row-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 1.87 ms | 1.00× |
| 2 | Go | 1.94 ms | 1.04× |
| 3 | C++ | 2.07 ms | 1.11× |
| 4 | TypeScript | 2.85 ms | 1.52× |
| 5 | Rust | 2.97 ms | 1.58× |
| 6 | JavaScript | 3.03 ms | 1.62× |
| 7 | LuaJIT | 6.44 ms | 3.44× |
| 8 | Python | 161.17 ms | 86.01× |

#### medium/column-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 17.34 ms | 1.00× |
| 2 | Go | 18.03 ms | 1.04× |
| 3 | C++ | 18.66 ms | 1.08× |
| 4 | Rust | 20.62 ms | 1.19× |
| 5 | TypeScript | 21.34 ms | 1.23× |
| 6 | JavaScript | 21.96 ms | 1.27× |
| 7 | LuaJIT | 35.35 ms | 2.04× |
| 8 | Python | 1.246 s | 71.87× |

#### medium/row-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 17.22 ms | 1.00× |
| 2 | Go | 18.36 ms | 1.07× |
| 3 | C++ | 18.43 ms | 1.07× |
| 4 | Rust | 21.12 ms | 1.23× |
| 5 | TypeScript | 21.87 ms | 1.27× |
| 6 | JavaScript | 22.23 ms | 1.29× |
| 7 | LuaJIT | 34.89 ms | 2.03× |
| 8 | Python | 1.291 s | 74.96× |

#### large/column-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 180.44 ms | 1.00× |
| 2 | Java | 202.04 ms | 1.12× |
| 3 | C++ | 207.22 ms | 1.15× |
| 4 | Go | 210.70 ms | 1.17× |
| 5 | TypeScript | 212.50 ms | 1.18× |
| 6 | JavaScript | 260.69 ms | 1.44× |
| 7 | LuaJIT | 306.28 ms | 1.70× |
| 8 | Python | 9.253 s | 51.28× |

#### large/row-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 178.00 ms | 1.00× |
| 2 | Go | 178.67 ms | 1.00× |
| 3 | C++ | 179.04 ms | 1.01× |
| 4 | Rust | 183.56 ms | 1.03× |
| 5 | JavaScript | 197.89 ms | 1.11× |
| 6 | LuaJIT | 211.21 ms | 1.19× |
| 7 | TypeScript | 235.44 ms | 1.32× |
| 8 | Python | 9.276 s | 52.11× |

---

### `nbody`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 71.4 | 1.00× |
| 2 | C++ | **93.8** | 94.6 | 1.10× |
| 3 | JavaScript | **84.6** | 49.2 | 1.29× |
| 4 | TypeScript | **83.5** | 40.1 | 1.32× |
| 5 | Java | **73.5** | 22.9 | 1.61× |
| 6 | Go | **72.7** | 89.8 | 1.63× |
| 7 | LuaJIT | **56.7** | 68.3 | 2.40× |
| 8 | Python | **4.5** | 77.6 | 117.55× |

#### small

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.73 ms | 1.00× |
| 2 | C++ | 2.06 ms | 1.20× |
| 3 | TypeScript | 2.27 ms | 1.32× |
| 4 | JavaScript | 2.32 ms | 1.34× |
| 5 | Go | 3.02 ms | 1.75× |
| 6 | Java | 3.09 ms | 1.79× |
| 7 | LuaJIT | 3.88 ms | 2.25× |
| 8 | Python | 200.59 ms | 116.19× |

#### medium

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.51 ms | 1.00× |
| 2 | C++ | 1.66 ms | 1.10× |
| 3 | JavaScript | 1.96 ms | 1.30× |
| 4 | TypeScript | 2.00 ms | 1.33× |
| 5 | Java | 2.43 ms | 1.61× |
| 6 | Go | 2.44 ms | 1.62× |
| 7 | LuaJIT | 3.92 ms | 2.60× |
| 8 | Python | 185.57 ms | 123.15× |

#### large

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 4.25 ms | 1.00× |
| 2 | C++ | 4.33 ms | 1.02× |
| 3 | JavaScript | 5.25 ms | 1.24× |
| 4 | TypeScript | 5.58 ms | 1.31× |
| 5 | Java | 6.09 ms | 1.43× |
| 6 | Go | 6.54 ms | 1.54× |
| 7 | LuaJIT | 9.98 ms | 2.35× |
| 8 | Python | 482.09 ms | 113.52× |

---

### `record-sorting`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 87.2 | 1.00× |
| 2 | Go | **81.4** | 73.6 | 1.41× |
| 3 | C++ | **58.0** | 73.1 | 2.32× |
| 4 | Java | **57.7** | 37.2 | 2.36× |
| 5 | TypeScript | **37.0** | 31.2 | 4.79× |
| 6 | JavaScript | **35.8** | 36.6 | 5.05× |
| 7 | Python | **21.6** | 59.2 | 11.38× |
| 8 | LuaJIT | **20.7** | 39.9 | 11.55× |

#### small/mostly-sorted

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.04 ms | 1.00× |
| 2 | Go | 1.30 ms | 1.24× |
| 3 | C++ | 2.60 ms | 2.49× |
| 4 | TypeScript | 3.27 ms | 3.14× |
| 5 | Java | 3.70 ms | 3.54× |
| 6 | JavaScript | 4.42 ms | 4.24× |
| 7 | Python | 7.27 ms | 6.97× |
| 8 | LuaJIT | 8.42 ms | 8.07× |

#### small/random

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.33 ms | 1.00× |
| 2 | Go | 2.11 ms | 1.59× |
| 3 | C++ | 3.23 ms | 2.43× |
| 4 | Java | 3.59 ms | 2.71× |
| 5 | TypeScript | 5.53 ms | 4.17× |
| 6 | JavaScript | 6.73 ms | 5.07× |
| 7 | LuaJIT | 11.00 ms | 8.28× |
| 8 | Python | 11.10 ms | 8.36× |

#### medium/mostly-sorted

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 5.80 ms | 1.00× |
| 2 | Go | 6.90 ms | 1.19× |
| 3 | Java | 12.04 ms | 2.08× |
| 4 | C++ | 12.70 ms | 2.19× |
| 5 | TypeScript | 19.07 ms | 3.29× |
| 6 | JavaScript | 19.21 ms | 3.31× |
| 7 | Python | 43.21 ms | 7.46× |
| 8 | LuaJIT | 51.74 ms | 8.93× |

#### medium/random

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 7.52 ms | 1.00× |
| 2 | Go | 11.64 ms | 1.55× |
| 3 | C++ | 16.83 ms | 2.24× |
| 4 | Java | 16.89 ms | 2.25× |
| 5 | JavaScript | 33.51 ms | 4.46× |
| 6 | TypeScript | 34.71 ms | 4.62× |
| 7 | LuaJIT | 92.76 ms | 12.34× |
| 8 | Python | 119.97 ms | 15.96× |

#### large/mostly-sorted

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 35.03 ms | 1.00× |
| 2 | Go | 39.35 ms | 1.12× |
| 3 | Java | 51.92 ms | 1.48× |
| 4 | C++ | 75.47 ms | 2.15× |
| 5 | JavaScript | 161.25 ms | 4.60× |
| 6 | TypeScript | 184.51 ms | 5.27× |
| 7 | Python | 337.93 ms | 9.65× |
| 8 | LuaJIT | 484.39 ms | 13.83× |

#### large/random

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 38.52 ms | 1.00× |
| 2 | Go | 63.18 ms | 1.64× |
| 3 | C++ | 92.02 ms | 2.39× |
| 4 | Java | 93.66 ms | 2.43× |
| 5 | JavaScript | 346.28 ms | 8.99× |
| 6 | TypeScript | 353.18 ms | 9.17× |
| 7 | LuaJIT | 789.94 ms | 20.51× |
| 8 | Python | 802.26 ms | 20.83× |

---

### `shortest-path`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 83.7 | 1.00× |
| 2 | Go | **80.2** | 76.0 | 1.43× |
| 3 | Java | **75.9** | 59.1 | 1.52× |
| 4 | C++ | **75.8** | 89.8 | 1.54× |
| 5 | TypeScript | **67.5** | 54.5 | 1.87× |
| 6 | JavaScript | **66.6** | 45.7 | 1.92× |
| 7 | LuaJIT | **39.7** | 76.1 | 4.21× |
| 8 | Python | **20.6** | 67.7 | 11.28× |

#### small/dense

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 3.55 ms | 1.00× |
| 2 | Go | 5.21 ms | 1.47× |
| 3 | Java | 5.32 ms | 1.50× |
| 4 | C++ | 5.51 ms | 1.55× |
| 5 | JavaScript | 6.81 ms | 1.92× |
| 6 | TypeScript | 6.91 ms | 1.95× |
| 7 | LuaJIT | 15.66 ms | 4.42× |
| 8 | Python | 38.92 ms | 10.97× |

#### small/sparse

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.88 ms | 1.00× |
| 2 | Go | 2.32 ms | 1.23× |
| 3 | C++ | 2.99 ms | 1.59× |
| 4 | Java | 3.00 ms | 1.60× |
| 5 | TypeScript | 3.05 ms | 1.63× |
| 6 | JavaScript | 3.14 ms | 1.67× |
| 7 | LuaJIT | 7.02 ms | 3.74× |
| 8 | Python | 20.61 ms | 10.97× |

#### medium/dense

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.97 ms | 1.00× |
| 2 | Go | 2.80 ms | 1.42× |
| 3 | C++ | 3.06 ms | 1.55× |
| 4 | Java | 3.20 ms | 1.62× |
| 5 | TypeScript | 3.72 ms | 1.88× |
| 6 | JavaScript | 4.23 ms | 2.14× |
| 7 | LuaJIT | 8.10 ms | 4.10× |
| 8 | Python | 21.21 ms | 10.75× |

#### medium/sparse

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 952.1 µs | 1.00× |
| 2 | Go | 1.33 ms | 1.39× |
| 3 | C++ | 1.36 ms | 1.42× |
| 4 | Java | 1.52 ms | 1.59× |
| 5 | TypeScript | 1.66 ms | 1.74× |
| 6 | JavaScript | 1.70 ms | 1.79× |
| 7 | LuaJIT | 3.90 ms | 4.09× |
| 8 | Python | 10.92 ms | 11.47× |

#### large/dense

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 8.31 ms | 1.00× |
| 2 | Java | 11.89 ms | 1.43× |
| 3 | Go | 12.55 ms | 1.51× |
| 4 | C++ | 12.80 ms | 1.54× |
| 5 | JavaScript | 16.10 ms | 1.94× |
| 6 | TypeScript | 16.64 ms | 2.00× |
| 7 | LuaJIT | 37.74 ms | 4.54× |
| 8 | Python | 96.41 ms | 11.60× |

#### large/sparse

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 4.09 ms | 1.00× |
| 2 | Go | 5.78 ms | 1.41× |
| 3 | Java | 5.89 ms | 1.44× |
| 4 | C++ | 6.27 ms | 1.54× |
| 5 | JavaScript | 7.35 ms | 1.80× |
| 6 | TypeScript | 7.36 ms | 1.80× |
| 7 | LuaJIT | 16.34 ms | 4.00× |
| 8 | Python | 51.38 ms | 12.58× |

---

### `word-frequency`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **97.6** | 42.6 | 1.04× |
| 2 | Go | **96.5** | 46.1 | 1.06× |
| 3 | C++ | **92.0** | 69.4 | 1.14× |
| 4 | TypeScript | **74.3** | 50.7 | 1.58× |
| 5 | LuaJIT | **74.3** | 40.2 | 1.58× |
| 6 | JavaScript | **69.6** | 27.0 | 1.76× |
| 7 | Java | **65.9** | 9.9 | 1.91× |
| 8 | Python | **58.7** | 24.5 | 2.27× |

#### small/mostly-unique

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.18 ms | 1.00× |
| 2 | Go | 1.25 ms | 1.06× |
| 3 | C++ | 1.49 ms | 1.26× |
| 4 | JavaScript | 1.72 ms | 1.45× |
| 5 | TypeScript | 1.78 ms | 1.51× |
| 6 | LuaJIT | 1.85 ms | 1.57× |
| 7 | Java | 2.30 ms | 1.94× |
| 8 | Python | 2.58 ms | 2.18× |

#### small/repeated-vocabulary

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.18 ms | 1.00× |
| 2 | Go | 1.27 ms | 1.08× |
| 3 | C++ | 1.28 ms | 1.08× |
| 4 | TypeScript | 1.78 ms | 1.51× |
| 5 | LuaJIT | 1.90 ms | 1.61× |
| 6 | Java | 1.94 ms | 1.65× |
| 7 | JavaScript | 2.17 ms | 1.84× |
| 8 | Python | 2.48 ms | 2.11× |

#### medium/mostly-unique

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.16 ms | 1.00× |
| 2 | C++ | 1.25 ms | 1.08× |
| 3 | Go | 1.30 ms | 1.12× |
| 4 | TypeScript | 1.98 ms | 1.71× |
| 5 | LuaJIT | 2.02 ms | 1.75× |
| 6 | JavaScript | 2.56 ms | 2.21× |
| 7 | Python | 2.82 ms | 2.44× |
| 8 | Java | 2.97 ms | 2.57× |

#### medium/repeated-vocabulary

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.13 ms | 1.00× |
| 2 | Go | 1.23 ms | 1.08× |
| 3 | C++ | 1.28 ms | 1.13× |
| 4 | TypeScript | 1.78 ms | 1.57× |
| 5 | JavaScript | 1.80 ms | 1.59× |
| 6 | LuaJIT | 2.23 ms | 1.96× |
| 7 | Java | 2.23 ms | 1.96× |
| 8 | Python | 2.64 ms | 2.32× |

#### large/mostly-unique

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Go | 4.45 ms | 1.00× |
| 2 | C++ | 4.81 ms | 1.08× |
| 3 | Rust | 4.98 ms | 1.12× |
| 4 | LuaJIT | 5.51 ms | 1.24× |
| 5 | TypeScript | 6.60 ms | 1.48× |
| 6 | JavaScript | 7.17 ms | 1.61× |
| 7 | Java | 7.73 ms | 1.74× |
| 8 | Python | 9.96 ms | 2.24× |

#### large/repeated-vocabulary

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Go | 3.90 ms | 1.00× |
| 2 | Rust | 4.34 ms | 1.11× |
| 3 | C++ | 4.67 ms | 1.20× |
| 4 | LuaJIT | 5.64 ms | 1.45× |
| 5 | Java | 6.50 ms | 1.67× |
| 6 | TypeScript | 6.68 ms | 1.71× |
| 7 | JavaScript | 7.28 ms | 1.86× |
| 8 | Python | 9.08 ms | 2.33× |

---

## Win Distribution

| Lang | Wins | Share |
|------|------|-------|
| C++ | 3 | ██░░░░░░░░░░░░░░░░░░ 9.1% |
| Go | 2 | █░░░░░░░░░░░░░░░░░░░ 6.1% |
| Java | 5 | ███░░░░░░░░░░░░░░░░░ 15.2% |
| JavaScript | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |
| LuaJIT | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |
| Python | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |
| Rust | 23 | ██████████████░░░░░░ 69.7% |
| TypeScript | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |

## Machine Detail

| Property | Value |
|----------|-------|
| CPU | AMD Ryzen 5 9600X 6-Core Processor |
| Architecture | x64 |
| Logical Cores | 12 |
| Memory | 33.4 GB |
| OS Platform | win32 |
| OS Release | 10.0.26200 |
| Snapshot ID | `2026-07-19T23-40-55-715-830250aaZ` |
| Updated | 2026-07-19T23:40:55.715Z |

## Benchmark Metadata

| Benchmark | Languages | Sizes | Total Results |
|-----------|-----------|-------|---------------|
| `aggregation` | 8 | L, M, S | 24 |
| `barrier-wave` | 7 | L, M, S | 21 |
| `matrix-multiplication` | 8 | L, M, S | 48 |
| `nbody` | 8 | L, M, S | 24 |
| `record-sorting` | 8 | L, M, S | 48 |
| `shortest-path` | 8 | L, M, S | 48 |
| `word-frequency` | 8 | L, M, S | 48 |
