# Runtime Arena Scorecard

> **Snapshot**: `2026-07-20T00-48-42-145-decea015Z`  
> **Date**: 2026-07-20T00:48:42.145Z  
> **Arena version**: 0.2.0  
> **Commit**: `552e2f68` (dirty)  
> **All benchmarks validated**: 291/291 results  
> **Machine**: AMD Ryzen 5 9600X 6-Core Processor (12 logical cores)  
> **OS**: win32 10.0.26200  
> **RAM**: 33.4 GB  
> **Benchmarks**: `aggregation`, `barrier-wave`, `matrix-multiplication`, `nbody`, `record-sorting`, `shortest-path`, `word-frequency`  
> **Languages**: C++, Go, Java, JavaScript, LuaJIT, lua-interpreted, Python, Rust, TypeScript  

## Overall Leaderboard

Scoring: **OVR** = 75% geometric-mean **SPD** + 25% **FLEX** + badge bonus. *Base OVR* shown in parentheses.

| # | | Lang | Monogram | Base OVR | +Bonus | Final OVR | SPD | FLEX | STABLE | Tier | Gem | Wins |
|---|----|------|----------|----------|--------|-----------|-----|------|--------|------|------|------|
| **1** | **S+** | Rust | RS | 92.5 | +7.5 | **100.0** | 94.7 | 86.2 | 63.2 | Dark Matter `DM` | 23 |
| **2** | **A** | C++ | C++ | 79.8 | +3.0 | **82.8** | 83.5 | 68.6 | 75.7 | Diamond `DIA` | 2 |
| **3** | **B** | Go | GO | 78.0 | +1.5 | **79.5** | 80.6 | 70.1 | 67.4 | Amethyst `AME` | 3 |
| **4** | **C** | Java | JV | 63.6 | +0.0 | **63.6** | 66.5 | 55.1 | 36.3 | Ruby `RUB` | 5 |
| **5** | **D** | JavaScript | JS | 54.1 | +0.5 | **54.6** | 57.3 | 44.5 | 36.5 | Sapphire `SAP` | 0 |
| **6** | **D** | TypeScript | TS | 53.9 | +0.0 | **53.9** | 57.1 | 44.2 | 36.7 | Sapphire `SAP` | 0 |
| **7** | **D** | LuaJIT | LJ | 44.9 | +0.0 | **44.9** | 48.7 | 33.5 | 51.0 | Emerald `EME` | 0 |
| **8** | **D** | lua-interpreted | LU | 13.8 | +0.0 | **13.8** | 14.9 | 10.7 | 65.1 | Emerald `EME` | 0 |
| **9** | **D** | Python | PY | 11.7 | +0.0 | **11.7** | 12.3 | 9.6 | 55.8 | Emerald `EME` | 0 |

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
| Rust | 🌟 Hall of Fame | 🏆 Legend | 🏆 Legend | 🏆 Legend | — | 🥇 Gold |
| C++ | 🥉 Bronze | 🥇 Gold | 🥉 Bronze | — | — | 🥈 Silver |
| Go | 🥉 Bronze | — | — | 🥉 Bronze | — | 🥉 Bronze |
| Java | — | — | — | — | — | — |
| JavaScript | — | 🥉 Bronze | — | — | — | — |
| TypeScript | — | — | — | — | — | — |
| LuaJIT | — | — | — | — | — | — |
| lua-interpreted | — | — | — | — | — | — |
| Python | — | — | — | — | — | — |

## Language Card Profiles

### RS — Rust

<table><tr><td>

**OVR**  
# **100.0**

_(base 92.5 + 7.5 badge bonus)_

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
| SPD | **94.7** | ███████████████████░ |
| STABLE | **63.2** | █████████████░░░░░░░ |
| FLEX | **86.2** | █████████████████░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Compute Finisher | **Legend** | 100 | P100 | 100 | — |
| ★ Data Wrangler | **Legend** | 100 | P100 | 100 | — |
| ★ Pathfinder | **Legend** | 100 | P100 | 100 | — |
| Speedster | **Hall of Fame** | 95 | P100 | 97 | Legend (Abs ≥97; Q ≥97; P85) |
| Scale Master | **Gold** | 92 | P100 | 95 | Hall of Fame (Abs ≥94; Q ≥94; P70) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +7.5** from Compute Finisher (Legend +2.5), Data Wrangler (Legend +2.5), Pathfinder (Legend +2.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **100.0** | #1 of 9 | 1.00× |
| `barrier-wave` | **86.8** | #3 of 7 | 1.24× |
| `matrix-multiplication` | **80.3** | #6 of 9 | 1.40× |
| `nbody` | **100.0** | #1 of 9 | 1.00× |
| `record-sorting` | **100.0** | #1 of 9 | 1.00× |
| `shortest-path` | **100.0** | #1 of 9 | 1.00× |
| `word-frequency` | **97.6** | #1 of 9 | 1.04× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **94.7** | Speedster |
| Compute | CMP | **100.0** | Compute Finisher |
| Data Processing | DAT | **100.0** | Data Wrangler |
| Algorithms | ALG | **100.0** | Pathfinder |
| Consistency | CON | **63.2** | Steady Hands |
| Scalability | SCL | **91.7** | Scale Master |

#### Fastest Cells (23)

| Benchmark | Size | Median |
|-----------|------|--------|
| `aggregation` | L | 2.81 ms |
| `aggregation` | M | 1.69 ms |
| `aggregation` | S | 1.39 ms |
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
# **82.8**

_(base 79.8 + 3.0 badge bonus)_

**Tier**  
Diamond · `DIA`  
**DOMINANT**

**Letter Grade**  
A  

**Runtime**  
g++.exe  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **83.5** | █████████████████░░░ |
| STABLE | **75.7** | ███████████████░░░░░ |
| FLEX | **68.6** | ██████████████░░░░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Compute Finisher | **Gold** | 94 | P88 | 91 | Hall of Fame (Abs ≥94; Q ≥94; P70) |
| ★ Scale Master | **Silver** | 91 | P88 | 89 | Gold (Abs ≥90; Q ≥90; P55) |
| Speedster | **Bronze** | 83 | P88 | 85 | Silver (Abs ≥85; Q ≥85; P40) |
| ★ Data Wrangler | **Bronze** | 84 | P88 | 86 | Silver (Abs ≥85; Q ≥85; P40) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +3.0** from Compute Finisher (Gold +1.5), Scale Master (Silver +1), Data Wrangler (Bronze +0.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **84.4** | #2 of 9 | 1.30× |
| `barrier-wave` | **100.0** | #1 of 7 | 1.00× |
| `matrix-multiplication` | **88.1** | #2 of 9 | 1.22× |
| `nbody` | **93.8** | #2 of 9 | 1.10× |
| `record-sorting` | **58.0** | #3 of 9 | 2.32× |
| `shortest-path` | **75.8** | #3 of 9 | 1.54× |
| `word-frequency` | **92.0** | #3 of 9 | 1.14× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **83.5** | Speedster |
| Compute | CMP | **93.8** | Compute Finisher |
| Data Processing | DAT | **84.4** | Data Wrangler |
| Algorithms | ALG | **75.8** | Pathfinder |
| Consistency | CON | **75.7** | Steady Hands |
| Scalability | SCL | **90.8** | Scale Master |

#### Fastest Cells (2)

| Benchmark | Size | Median |
|-----------|------|--------|
| `barrier-wave` | M | 9.79 ms |
| `barrier-wave` | S | 1.74 ms |

---

### GO — Go

<table><tr><td>

**OVR**  
# **79.5**

_(base 78.0 + 1.5 badge bonus)_

**Tier**  
Amethyst · `AME`  
**ELITE**

**Letter Grade**  
B  

**Runtime**  
go  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **80.6** | ████████████████░░░░ |
| STABLE | **67.4** | █████████████░░░░░░░ |
| FLEX | **70.1** | ██████████████░░░░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Speedster | **Bronze** | 81 | P75 | 78 | Silver (Abs ≥85; Q ≥85; P40) |
| ★ Pathfinder | **Bronze** | 80 | P88 | 83 | Silver (Abs ≥85; Q ≥85; P40) |
| ★ Scale Master | **Bronze** | 90 | P75 | 83 | Silver (Abs ≥85; Q ≥85; P40) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +1.5** from Pathfinder (Bronze +0.5), Scale Master (Bronze +0.5), Speedster (Bronze +0.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **62.6** | #5 of 9 | 2.06× |
| `barrier-wave` | **88.0** | #2 of 7 | 1.22× |
| `matrix-multiplication` | **87.6** | #3 of 9 | 1.23× |
| `nbody` | **72.7** | #6 of 9 | 1.63× |
| `record-sorting` | **81.4** | #2 of 9 | 1.41× |
| `shortest-path` | **80.2** | #2 of 9 | 1.43× |
| `word-frequency` | **96.5** | #2 of 9 | 1.06× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **80.6** | Speedster |
| Compute | CMP | **72.7** | Compute Finisher |
| Data Processing | DAT | **62.6** | Data Wrangler |
| Algorithms | ALG | **80.2** | Pathfinder |
| Consistency | CON | **67.4** | Steady Hands |
| Scalability | SCL | **90.0** | Scale Master |

#### Fastest Cells (3)

| Benchmark | Size | Median |
|-----------|------|--------|
| `matrix-multiplication` | L (row-major) | 178.67 ms |
| `word-frequency` | L (mostly-unique) | 4.45 ms |
| `word-frequency` | L (repeated-vocabulary) | 3.90 ms |

---

### JV — Java

<table><tr><td>

**OVR**  
# **63.6**

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
| SPD | **66.5** | █████████████░░░░░░░ |
| STABLE | **36.3** | ███████░░░░░░░░░░░░░ |
| FLEX | **55.1** | ███████████░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **77.3** | #3 of 9 | 1.49× |
| `barrier-wave` | **46.2** | #4 of 7 | 3.28× |
| `matrix-multiplication` | **99.0** | #1 of 9 | 1.02× |
| `nbody` | **76.3** | #5 of 9 | 1.52× |
| `record-sorting` | **56.1** | #4 of 9 | 2.49× |
| `shortest-path` | **68.1** | #4 of 9 | 1.80× |
| `word-frequency` | **55.6** | #8 of 9 | 2.47× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **66.5** | Speedster |
| Compute | CMP | **76.3** | Compute Finisher |
| Data Processing | DAT | **77.3** | Data Wrangler |
| Algorithms | ALG | **68.1** | Pathfinder |
| Consistency | CON | **36.3** | Steady Hands |
| Scalability | SCL | **75.9** | Scale Master |

#### Fastest Cells (5)

| Benchmark | Size | Median |
|-----------|------|--------|
| `barrier-wave` | L | 35.41 ms |
| `matrix-multiplication` | M (column-major) | 14.98 ms |
| `matrix-multiplication` | M (row-major) | 14.69 ms |
| `matrix-multiplication` | S (column-major) | 1.68 ms |
| `matrix-multiplication` | S (row-major) | 1.42 ms |

---

### JS — JavaScript

<table><tr><td>

**OVR**  
# **54.6**

_(base 54.1 + 0.5 badge bonus)_

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
| SPD | **57.3** | ███████████░░░░░░░░░ |
| STABLE | **36.5** | ███████░░░░░░░░░░░░░ |
| FLEX | **44.5** | █████████░░░░░░░░░░░ |

</td></tr></table>

#### Badges

| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |
|-------|------|--------|------------|---------|-----------|
| ★ Compute Finisher | **Bronze** | 82 | P75 | 79 | Silver (Abs ≥85; Q ≥85; P40) |

> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.

> **OVR Bonus: +0.5** from Compute Finisher (Bronze +0.5)

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **59.3** | #6 of 9 | 2.23× |
| `barrier-wave` | **39.9** | #6 of 7 | 4.11× |
| `matrix-multiplication` | **83.0** | #5 of 9 | 1.33× |
| `nbody` | **82.3** | #3 of 9 | 1.35× |
| `record-sorting` | **34.1** | #5 of 9 | 5.48× |
| `shortest-path` | **59.4** | #5 of 9 | 2.28× |
| `word-frequency` | **62.0** | #6 of 9 | 2.14× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **57.3** | Speedster |
| Compute | CMP | **82.3** | Compute Finisher |
| Data Processing | DAT | **59.3** | Data Wrangler |
| Algorithms | ALG | **59.4** | Pathfinder |
| Consistency | CON | **36.5** | Steady Hands |
| Scalability | SCL | **74.9** | Scale Master |

---

### TS — TypeScript

<table><tr><td>

**OVR**  
# **53.9**

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
| SPD | **57.1** | ███████████░░░░░░░░░ |
| STABLE | **36.7** | ███████░░░░░░░░░░░░░ |
| FLEX | **44.2** | █████████░░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **56.9** | #7 of 9 | 2.38× |
| `barrier-wave` | **42.2** | #5 of 7 | 3.78× |
| `matrix-multiplication` | **83.8** | #4 of 9 | 1.31× |
| `nbody` | **77.7** | #4 of 9 | 1.47× |
| `record-sorting` | **33.9** | #6 of 9 | 5.46× |
| `shortest-path` | **59.0** | #6 of 9 | 2.32× |
| `word-frequency` | **63.2** | #5 of 9 | 2.04× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **57.1** | Speedster |
| Compute | CMP | **77.7** | Compute Finisher |
| Data Processing | DAT | **56.9** | Data Wrangler |
| Algorithms | ALG | **59.0** | Pathfinder |
| Consistency | CON | **36.7** | Steady Hands |
| Scalability | SCL | **73.6** | Scale Master |

---

### LJ — LuaJIT

<table><tr><td>

**OVR**  
# **44.9**

**Tier**  
Emerald · `EME`  
**COMMON**

**Letter Grade**  
D  

**Runtime**  
LuaJIT  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **48.7** | ██████████░░░░░░░░░░ |
| STABLE | **51.0** | ██████████░░░░░░░░░░ |
| FLEX | **33.5** | ███████░░░░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **66.7** | #4 of 9 | 1.87× |
| `barrier-wave` | — | — | Not eligible |
| `matrix-multiplication` | **58.0** | #7 of 9 | 2.33× |
| `nbody` | **56.7** | #7 of 9 | 2.40× |
| `record-sorting` | **20.7** | #8 of 9 | 11.55× |
| `shortest-path` | **39.7** | #7 of 9 | 4.21× |
| `word-frequency` | **74.3** | #4 of 9 | 1.58× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **48.7** | Speedster |
| Compute | CMP | **56.7** | Compute Finisher |
| Data Processing | DAT | **66.7** | Data Wrangler |
| Algorithms | ALG | **39.7** | Pathfinder |
| Consistency | CON | **51.0** | Steady Hands |
| Scalability | SCL | **75.6** | Scale Master |

---

### LU — lua-interpreted

<table><tr><td>

**OVR**  
# **13.8**

**Tier**  
Emerald · `EME`  
**COMMON**

**Letter Grade**  
D  

**Runtime**  
Lua  


</td><td>

| Meter | Score | Bar |
|-------|-------|-----|
| SPD | **14.9** | ███░░░░░░░░░░░░░░░░░ |
| STABLE | **65.1** | █████████████░░░░░░░ |
| FLEX | **10.7** | ██░░░░░░░░░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **25.9** | #8 of 9 | 8.01× |
| `barrier-wave` | — | — | Not eligible |
| `matrix-multiplication` | **16.3** | #8 of 9 | 16.22× |
| `nbody` | **9.0** | #8 of 9 | 40.70× |
| `record-sorting` | **6.6** | #9 of 9 | 65.20× |
| `shortest-path` | **15.5** | #9 of 9 | 17.97× |
| `word-frequency` | **28.1** | #9 of 9 | 7.06× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **14.9** | Speedster |
| Compute | CMP | **9.0** | Compute Finisher |
| Data Processing | DAT | **25.9** | Data Wrangler |
| Algorithms | ALG | **15.5** | Pathfinder |
| Consistency | CON | **65.1** | Steady Hands |
| Scalability | SCL | **74.1** | Scale Master |

---

### PY — Python

<table><tr><td>

**OVR**  
# **11.7**

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
| SPD | **12.3** | ██░░░░░░░░░░░░░░░░░░ |
| STABLE | **55.8** | ███████████░░░░░░░░░ |
| FLEX | **9.6** | ██░░░░░░░░░░░░░░░░░░ |

</td></tr></table>

#### Badges

_No badges earned._

#### Benchmark Breakdown

| Benchmark | Perf | Ranking | vs. Fastest |
|-----------|------|---------|-------------|
| `aggregation` | **18.1** | #9 of 9 | 13.81× |
| `barrier-wave` | **3.4** | #7 of 7 | 181.27× |
| `matrix-multiplication` | **5.9** | #9 of 9 | 77.30× |
| `nbody` | **4.5** | #9 of 9 | 117.55× |
| `record-sorting` | **21.6** | #7 of 9 | 11.38× |
| `shortest-path` | **20.6** | #8 of 9 | 11.28× |
| `word-frequency` | **58.7** | #7 of 9 | 2.27× |

#### Attribute Ratings

| Attribute | Abbrev | Rating | Used By |
|-----------|--------|--------|---------|
| Runtime Speed | SPD | **12.3** | Speedster |
| Compute | CMP | **4.5** | Compute Finisher |
| Data Processing | DAT | **18.1** | Data Wrangler |
| Algorithms | ALG | **20.6** | Pathfinder |
| Consistency | CON | **55.8** | Steady Hands |
| Scalability | SCL | **84.2** | Scale Master |

---

## Per-Benchmark Leaderboards

### `aggregation`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 7.5 | 1.00× |
| 2 | C++ | **84.4** | 37.0 | 1.30× |
| 3 | Java | **77.3** | 17.9 | 1.49× |
| 4 | LuaJIT | **66.7** | 32.6 | 1.87× |
| 5 | Go | **62.6** | 41.2 | 2.06× |
| 6 | JavaScript | **59.3** | 56.8 | 2.23× |
| 7 | TypeScript | **56.9** | 51.8 | 2.38× |
| 8 | lua-interpreted | **25.9** | 43.0 | 8.01× |
| 9 | Python | **18.1** | 22.9 | 13.81× |

#### small

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.39 ms | 1.00× |
| 2 | C++ | 1.53 ms | 1.10× |
| 3 | LuaJIT | 1.85 ms | 1.33× |
| 4 | Java | 2.16 ms | 1.56× |
| 5 | Go | 2.59 ms | 1.87× |
| 6 | JavaScript | 3.07 ms | 2.21× |
| 7 | TypeScript | 3.81 ms | 2.75× |
| 8 | lua-interpreted | 10.00 ms | 7.20× |
| 9 | Python | 20.73 ms | 14.94× |

#### medium

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.69 ms | 1.00× |
| 2 | Java | 2.31 ms | 1.37× |
| 3 | C++ | 3.03 ms | 1.80× |
| 4 | TypeScript | 3.37 ms | 1.99× |
| 5 | JavaScript | 3.42 ms | 2.03× |
| 6 | LuaJIT | 3.44 ms | 2.04× |
| 7 | Go | 3.80 ms | 2.25× |
| 8 | lua-interpreted | 13.00 ms | 7.70× |
| 9 | Python | 22.01 ms | 13.04× |

#### large

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 2.81 ms | 1.00× |
| 2 | C++ | 3.10 ms | 1.10× |
| 3 | Java | 4.32 ms | 1.54× |
| 4 | Go | 5.82 ms | 2.07× |
| 5 | LuaJIT | 6.71 ms | 2.39× |
| 6 | TypeScript | 6.94 ms | 2.47× |
| 7 | JavaScript | 6.99 ms | 2.49× |
| 8 | lua-interpreted | 26.00 ms | 9.25× |
| 9 | Python | 38.01 ms | 13.53× |

---

### `barrier-wave`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | C++ | **100.0** | 84.2 | 1.00× |
| 2 | Go | **88.0** | 69.0 | 1.22× |
| 3 | Rust | **86.8** | 61.2 | 1.24× |
| 4 | Java | **46.2** | 60.9 | 3.28× |
| 5 | TypeScript | **42.2** | 10.6 | 3.78× |
| 6 | JavaScript | **39.9** | 9.5 | 4.11× |
| 7 | Python | **3.4** | 64.4 | 181.27× |

#### small

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | C++ | 1.74 ms | 1.00× |
| 2 | Rust | 2.21 ms | 1.27× |
| 3 | Go | 2.69 ms | 1.55× |
| 4 | Java | 34.47 ms | 19.85× |
| 5 | TypeScript | 37.26 ms | 21.46× |
| 6 | JavaScript | 38.00 ms | 21.88× |
| 7 | Python | 298.92 ms | 172.15× |

#### medium

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | C++ | 9.79 ms | 1.00× |
| 2 | Go | 10.36 ms | 1.06× |
| 3 | Rust | 10.45 ms | 1.07× |
| 4 | Java | 17.38 ms | 1.78× |
| 5 | JavaScript | 22.94 ms | 2.34× |
| 6 | TypeScript | 24.04 ms | 2.46× |
| 7 | Python | 2.049 s | 209.32× |

#### large

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 35.41 ms | 1.00× |
| 2 | C++ | 35.47 ms | 1.00× |
| 3 | TypeScript | 36.18 ms | 1.02× |
| 4 | Go | 39.01 ms | 1.10× |
| 5 | JavaScript | 47.88 ms | 1.35× |
| 6 | Rust | 50.15 ms | 1.42× |
| 7 | Python | 5.854 s | 165.31× |

---

### `matrix-multiplication`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Java | **99.0** | 79.0 | 1.02× |
| 2 | C++ | **88.1** | 82.2 | 1.22× |
| 3 | Go | **87.6** | 75.9 | 1.23× |
| 4 | TypeScript | **83.8** | 47.2 | 1.31× |
| 5 | JavaScript | **83.0** | 45.5 | 1.33× |
| 6 | Rust | **80.3** | 89.0 | 1.40× |
| 7 | LuaJIT | **58.0** | 49.0 | 2.33× |
| 8 | lua-interpreted | **16.3** | 54.6 | 16.22× |
| 9 | Python | **5.9** | 74.5 | 77.30× |

#### small/column-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 1.68 ms | 1.00× |
| 2 | C++ | 2.06 ms | 1.23× |
| 3 | TypeScript | 2.16 ms | 1.29× |
| 4 | Go | 2.35 ms | 1.40× |
| 5 | JavaScript | 2.97 ms | 1.77× |
| 6 | Rust | 2.99 ms | 1.78× |
| 7 | LuaJIT | 5.01 ms | 2.99× |
| 8 | lua-interpreted | 40.00 ms | 23.84× |
| 9 | Python | 162.74 ms | 96.98× |

#### small/row-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 1.42 ms | 1.00× |
| 2 | Go | 1.94 ms | 1.37× |
| 3 | C++ | 2.07 ms | 1.46× |
| 4 | JavaScript | 2.28 ms | 1.61× |
| 5 | TypeScript | 2.41 ms | 1.70× |
| 6 | Rust | 2.97 ms | 2.10× |
| 7 | LuaJIT | 6.44 ms | 4.55× |
| 8 | lua-interpreted | 37.00 ms | 26.13× |
| 9 | Python | 161.17 ms | 113.82× |

#### medium/column-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 14.98 ms | 1.00× |
| 2 | JavaScript | 15.87 ms | 1.06× |
| 3 | TypeScript | 15.90 ms | 1.06× |
| 4 | Go | 18.03 ms | 1.20× |
| 5 | C++ | 18.66 ms | 1.25× |
| 6 | Rust | 20.62 ms | 1.38× |
| 7 | LuaJIT | 35.35 ms | 2.36× |
| 8 | lua-interpreted | 252.00 ms | 16.83× |
| 9 | Python | 1.246 s | 83.21× |

#### medium/row-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Java | 14.69 ms | 1.00× |
| 2 | JavaScript | 15.42 ms | 1.05× |
| 3 | TypeScript | 16.23 ms | 1.10× |
| 4 | Go | 18.36 ms | 1.25× |
| 5 | C++ | 18.43 ms | 1.25× |
| 6 | Rust | 21.12 ms | 1.44× |
| 7 | LuaJIT | 34.89 ms | 2.37× |
| 8 | lua-interpreted | 251.00 ms | 17.09× |
| 9 | Python | 1.291 s | 87.86× |

#### large/column-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 180.44 ms | 1.00× |
| 2 | Java | 182.32 ms | 1.01× |
| 3 | C++ | 207.22 ms | 1.15× |
| 4 | Go | 210.70 ms | 1.17× |
| 5 | JavaScript | 227.48 ms | 1.26× |
| 6 | TypeScript | 262.54 ms | 1.46× |
| 7 | LuaJIT | 306.28 ms | 1.70× |
| 8 | lua-interpreted | 1.820 s | 10.09× |
| 9 | Python | 9.253 s | 51.28× |

#### large/row-major

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Go | 178.67 ms | 1.00× |
| 2 | C++ | 179.04 ms | 1.00× |
| 3 | Rust | 183.56 ms | 1.03× |
| 4 | Java | 193.66 ms | 1.08× |
| 5 | LuaJIT | 211.21 ms | 1.18× |
| 6 | TypeScript | 243.57 ms | 1.36× |
| 7 | JavaScript | 248.16 ms | 1.39× |
| 8 | lua-interpreted | 1.815 s | 10.16× |
| 9 | Python | 9.276 s | 51.92× |

---

### `nbody`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 71.4 | 1.00× |
| 2 | C++ | **93.8** | 94.6 | 1.10× |
| 3 | JavaScript | **82.3** | 31.1 | 1.35× |
| 4 | TypeScript | **77.7** | 40.6 | 1.47× |
| 5 | Java | **76.3** | 17.3 | 1.52× |
| 6 | Go | **72.7** | 89.8 | 1.63× |
| 7 | LuaJIT | **56.7** | 68.3 | 2.40× |
| 8 | lua-interpreted | **9.0** | 82.9 | 40.70× |
| 9 | Python | **4.5** | 77.6 | 117.55× |

#### small

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.73 ms | 1.00× |
| 2 | C++ | 2.06 ms | 1.20× |
| 3 | TypeScript | 2.31 ms | 1.34× |
| 4 | JavaScript | 2.37 ms | 1.38× |
| 5 | Java | 2.81 ms | 1.63× |
| 6 | Go | 3.02 ms | 1.75× |
| 7 | LuaJIT | 3.88 ms | 2.25× |
| 8 | lua-interpreted | 54.00 ms | 31.28× |
| 9 | Python | 200.59 ms | 116.19× |

#### medium

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.51 ms | 1.00× |
| 2 | C++ | 1.66 ms | 1.10× |
| 3 | JavaScript | 2.03 ms | 1.34× |
| 4 | TypeScript | 2.05 ms | 1.36× |
| 5 | Java | 2.32 ms | 1.54× |
| 6 | Go | 2.44 ms | 1.62× |
| 7 | LuaJIT | 3.92 ms | 2.60× |
| 8 | lua-interpreted | 66.00 ms | 43.80× |
| 9 | Python | 185.57 ms | 123.15× |

#### large

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 4.25 ms | 1.00× |
| 2 | C++ | 4.33 ms | 1.02× |
| 3 | JavaScript | 5.66 ms | 1.33× |
| 4 | Java | 5.90 ms | 1.39× |
| 5 | Go | 6.54 ms | 1.54× |
| 6 | TypeScript | 7.50 ms | 1.77× |
| 7 | LuaJIT | 9.98 ms | 2.35× |
| 8 | lua-interpreted | 209.00 ms | 49.21× |
| 9 | Python | 482.09 ms | 113.52× |

---

### `record-sorting`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 87.2 | 1.00× |
| 2 | Go | **81.4** | 73.6 | 1.41× |
| 3 | C++ | **58.0** | 73.1 | 2.32× |
| 4 | Java | **56.1** | 42.7 | 2.49× |
| 5 | JavaScript | **34.1** | 30.2 | 5.48× |
| 6 | TypeScript | **33.9** | 31.8 | 5.46× |
| 7 | Python | **21.6** | 59.2 | 11.38× |
| 8 | LuaJIT | **20.7** | 39.9 | 11.55× |
| 9 | lua-interpreted | **6.6** | 60.3 | 65.20× |

#### small/mostly-sorted

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.04 ms | 1.00× |
| 2 | Go | 1.30 ms | 1.24× |
| 3 | C++ | 2.60 ms | 2.49× |
| 4 | Java | 3.26 ms | 3.13× |
| 5 | JavaScript | 3.66 ms | 3.51× |
| 6 | TypeScript | 3.79 ms | 3.63× |
| 7 | Python | 7.27 ms | 6.97× |
| 8 | LuaJIT | 8.42 ms | 8.07× |
| 9 | lua-interpreted | 68.00 ms | 65.19× |

#### small/random

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.33 ms | 1.00× |
| 2 | Go | 2.11 ms | 1.59× |
| 3 | C++ | 3.23 ms | 2.43× |
| 4 | Java | 4.62 ms | 3.48× |
| 5 | TypeScript | 7.05 ms | 5.31× |
| 6 | JavaScript | 7.19 ms | 5.42× |
| 7 | LuaJIT | 11.00 ms | 8.28× |
| 8 | Python | 11.10 ms | 8.36× |
| 9 | lua-interpreted | 74.00 ms | 55.74× |

#### medium/mostly-sorted

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 5.80 ms | 1.00× |
| 2 | Go | 6.90 ms | 1.19× |
| 3 | C++ | 12.70 ms | 2.19× |
| 4 | Java | 12.71 ms | 2.19× |
| 5 | JavaScript | 23.03 ms | 3.97× |
| 6 | TypeScript | 24.10 ms | 4.16× |
| 7 | Python | 43.21 ms | 7.46× |
| 8 | LuaJIT | 51.74 ms | 8.93× |
| 9 | lua-interpreted | 387.00 ms | 66.77× |

#### medium/random

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 7.52 ms | 1.00× |
| 2 | Go | 11.64 ms | 1.55× |
| 3 | C++ | 16.83 ms | 2.24× |
| 4 | Java | 17.66 ms | 2.35× |
| 5 | TypeScript | 39.38 ms | 5.24× |
| 6 | JavaScript | 40.33 ms | 5.37× |
| 7 | LuaJIT | 92.76 ms | 12.34× |
| 8 | Python | 119.97 ms | 15.96× |
| 9 | lua-interpreted | 428.00 ms | 56.94× |

#### large/mostly-sorted

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 35.03 ms | 1.00× |
| 2 | Go | 39.35 ms | 1.12× |
| 3 | Java | 50.17 ms | 1.43× |
| 4 | C++ | 75.47 ms | 2.15× |
| 5 | JavaScript | 182.62 ms | 5.21× |
| 6 | TypeScript | 194.44 ms | 5.55× |
| 7 | Python | 337.93 ms | 9.65× |
| 8 | LuaJIT | 484.39 ms | 13.83× |
| 9 | lua-interpreted | 2.653 s | 75.73× |

#### large/random

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 38.52 ms | 1.00× |
| 2 | Go | 63.18 ms | 1.64× |
| 3 | C++ | 92.02 ms | 2.39× |
| 4 | Java | 100.19 ms | 2.60× |
| 5 | TypeScript | 354.42 ms | 9.20× |
| 6 | JavaScript | 373.15 ms | 9.69× |
| 7 | LuaJIT | 789.94 ms | 20.51× |
| 8 | Python | 802.26 ms | 20.83× |
| 9 | lua-interpreted | 2.907 s | 75.46× |

---

### `shortest-path`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **100.0** | 83.7 | 1.00× |
| 2 | Go | **80.2** | 76.0 | 1.43× |
| 3 | C++ | **75.8** | 89.8 | 1.54× |
| 4 | Java | **68.1** | 35.1 | 1.80× |
| 5 | JavaScript | **59.4** | 53.8 | 2.28× |
| 6 | TypeScript | **59.0** | 44.2 | 2.32× |
| 7 | LuaJIT | **39.7** | 76.1 | 4.21× |
| 8 | Python | **20.6** | 67.7 | 11.28× |
| 9 | lua-interpreted | **15.5** | 86.1 | 17.97× |

#### small/dense

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 3.55 ms | 1.00× |
| 2 | Go | 5.21 ms | 1.47× |
| 3 | C++ | 5.51 ms | 1.55× |
| 4 | Java | 5.65 ms | 1.59× |
| 5 | JavaScript | 7.10 ms | 2.00× |
| 6 | TypeScript | 8.86 ms | 2.50× |
| 7 | LuaJIT | 15.66 ms | 4.42× |
| 8 | Python | 38.92 ms | 10.97× |
| 9 | lua-interpreted | 52.00 ms | 14.66× |

#### small/sparse

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.88 ms | 1.00× |
| 2 | Go | 2.32 ms | 1.23× |
| 3 | C++ | 2.99 ms | 1.59× |
| 4 | TypeScript | 3.51 ms | 1.87× |
| 5 | Java | 3.52 ms | 1.87× |
| 6 | JavaScript | 3.95 ms | 2.10× |
| 7 | LuaJIT | 7.02 ms | 3.74× |
| 8 | Python | 20.61 ms | 10.97× |
| 9 | lua-interpreted | 23.00 ms | 12.24× |

#### medium/dense

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.97 ms | 1.00× |
| 2 | Go | 2.80 ms | 1.42× |
| 3 | C++ | 3.06 ms | 1.55× |
| 4 | Java | 3.66 ms | 1.86× |
| 5 | TypeScript | 4.32 ms | 2.19× |
| 6 | JavaScript | 5.03 ms | 2.55× |
| 7 | LuaJIT | 8.10 ms | 4.10× |
| 8 | Python | 21.21 ms | 10.75× |
| 9 | lua-interpreted | 59.00 ms | 29.90× |

#### medium/sparse

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 952.1 µs | 1.00× |
| 2 | Go | 1.33 ms | 1.39× |
| 3 | C++ | 1.36 ms | 1.42× |
| 4 | Java | 1.63 ms | 1.71× |
| 5 | JavaScript | 1.87 ms | 1.97× |
| 6 | TypeScript | 1.93 ms | 2.03× |
| 7 | LuaJIT | 3.90 ms | 4.09× |
| 8 | Python | 10.92 ms | 11.47× |
| 9 | lua-interpreted | 27.00 ms | 28.36× |

#### large/dense

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 8.31 ms | 1.00× |
| 2 | Go | 12.55 ms | 1.51× |
| 3 | C++ | 12.80 ms | 1.54× |
| 4 | Java | 16.17 ms | 1.95× |
| 5 | JavaScript | 21.38 ms | 2.57× |
| 6 | TypeScript | 21.95 ms | 2.64× |
| 7 | LuaJIT | 37.74 ms | 4.54× |
| 8 | Python | 96.41 ms | 11.60× |
| 9 | lua-interpreted | 120.00 ms | 14.44× |

#### large/sparse

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 4.09 ms | 1.00× |
| 2 | Go | 5.78 ms | 1.41× |
| 3 | C++ | 6.27 ms | 1.54× |
| 4 | Java | 7.67 ms | 1.88× |
| 5 | JavaScript | 9.17 ms | 2.25× |
| 6 | TypeScript | 9.68 ms | 2.37× |
| 7 | LuaJIT | 16.34 ms | 4.00× |
| 8 | Python | 51.38 ms | 12.58× |
| 9 | lua-interpreted | 57.00 ms | 13.95× |

---

### `word-frequency`

**Sizes**: small, medium, large  
**Ranked sizes**: small, medium, large  

| # | Lang | Perf | Stable | vs. Fastest |
|---|------|------|--------|-------------|
| 1 | Rust | **97.6** | 42.6 | 1.04× |
| 2 | Go | **96.5** | 46.1 | 1.06× |
| 3 | C++ | **92.0** | 69.4 | 1.14× |
| 4 | LuaJIT | **74.3** | 40.2 | 1.58× |
| 5 | TypeScript | **63.2** | 30.8 | 2.04× |
| 6 | JavaScript | **62.0** | 28.8 | 2.14× |
| 7 | Python | **58.7** | 24.5 | 2.27× |
| 8 | Java | **55.6** | 1.2 | 2.47× |
| 9 | lua-interpreted | **28.1** | 64.0 | 7.06× |

#### small/mostly-unique

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.18 ms | 1.00× |
| 2 | Go | 1.25 ms | 1.06× |
| 3 | C++ | 1.49 ms | 1.26× |
| 4 | LuaJIT | 1.85 ms | 1.57× |
| 5 | JavaScript | 2.14 ms | 1.81× |
| 6 | TypeScript | 2.49 ms | 2.10× |
| 7 | Python | 2.58 ms | 2.18× |
| 8 | Java | 3.33 ms | 2.81× |
| 9 | lua-interpreted | 9.00 ms | 7.61× |

#### small/repeated-vocabulary

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.18 ms | 1.00× |
| 2 | Go | 1.27 ms | 1.08× |
| 3 | C++ | 1.28 ms | 1.08× |
| 4 | LuaJIT | 1.90 ms | 1.61× |
| 5 | Python | 2.48 ms | 2.11× |
| 6 | TypeScript | 2.54 ms | 2.16× |
| 7 | JavaScript | 2.66 ms | 2.26× |
| 8 | Java | 3.16 ms | 2.68× |
| 9 | lua-interpreted | 9.00 ms | 7.64× |

#### medium/mostly-unique

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.16 ms | 1.00× |
| 2 | C++ | 1.25 ms | 1.08× |
| 3 | Go | 1.30 ms | 1.12× |
| 4 | TypeScript | 1.82 ms | 1.58× |
| 5 | JavaScript | 1.90 ms | 1.64× |
| 6 | LuaJIT | 2.02 ms | 1.75× |
| 7 | Python | 2.82 ms | 2.44× |
| 8 | Java | 3.07 ms | 2.65× |
| 9 | lua-interpreted | 9.00 ms | 7.78× |

#### medium/repeated-vocabulary

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Rust | 1.13 ms | 1.00× |
| 2 | Go | 1.23 ms | 1.08× |
| 3 | C++ | 1.28 ms | 1.13× |
| 4 | LuaJIT | 2.23 ms | 1.96× |
| 5 | TypeScript | 2.56 ms | 2.26× |
| 6 | Python | 2.64 ms | 2.32× |
| 7 | Java | 3.76 ms | 3.32× |
| 8 | JavaScript | 3.93 ms | 3.46× |
| 9 | lua-interpreted | 9.00 ms | 7.94× |

#### large/mostly-unique

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Go | 4.45 ms | 1.00× |
| 2 | C++ | 4.81 ms | 1.08× |
| 3 | Rust | 4.98 ms | 1.12× |
| 4 | LuaJIT | 5.51 ms | 1.24× |
| 5 | TypeScript | 7.80 ms | 1.75× |
| 6 | Java | 8.21 ms | 1.85× |
| 7 | JavaScript | 8.50 ms | 1.91× |
| 8 | Python | 9.96 ms | 2.24× |
| 9 | lua-interpreted | 25.00 ms | 5.62× |

#### large/repeated-vocabulary

| # | Lang | Median | vs. Fastest |
|---|---|--------|-------------|
| 1 | Go | 3.90 ms | 1.00× |
| 2 | Rust | 4.34 ms | 1.11× |
| 3 | C++ | 4.67 ms | 1.20× |
| 4 | LuaJIT | 5.64 ms | 1.45× |
| 5 | Java | 7.18 ms | 1.84× |
| 6 | JavaScript | 7.24 ms | 1.86× |
| 7 | Python | 9.08 ms | 2.33× |
| 8 | TypeScript | 9.49 ms | 2.43× |
| 9 | lua-interpreted | 24.00 ms | 6.15× |

---

## Win Distribution

| Lang | Wins | Share |
|------|------|-------|
| C++ | 2 | █░░░░░░░░░░░░░░░░░░░ 6.1% |
| Go | 3 | ██░░░░░░░░░░░░░░░░░░ 9.1% |
| Java | 5 | ███░░░░░░░░░░░░░░░░░ 15.2% |
| JavaScript | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |
| LuaJIT | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |
| lua-interpreted | 0 | ░░░░░░░░░░░░░░░░░░░░ 0.0% |
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
| Snapshot ID | `2026-07-20T00-48-42-145-decea015Z` |
| Updated | 2026-07-20T00:48:42.145Z |

## Benchmark Metadata

| Benchmark | Languages | Sizes | Total Results |
|-----------|-----------|-------|---------------|
| `aggregation` | 9 | L, M, S | 27 |
| `barrier-wave` | 7 | L, M, S | 21 |
| `matrix-multiplication` | 9 | L, M, S | 54 |
| `nbody` | 9 | L, M, S | 27 |
| `record-sorting` | 9 | L, M, S | 54 |
| `shortest-path` | 9 | L, M, S | 54 |
| `word-frequency` | 9 | L, M, S | 54 |
