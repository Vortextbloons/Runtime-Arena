<picture>
  <source media="(prefers-color-scheme: dark)" srcset="app-logo.png">
  <img alt="Runtime Arena" src="app-logo.png" width="96" height="96">
</picture>

# Runtime Arena

Cross-language benchmark system — runs identical workloads across Rust, Go, TypeScript, Python, LuaJIT, C++, and JavaScript, validates output, and records metrics.

```bash
npm install
npm run build:cli
npm run build:checker
arena run
arena results current
```

<!-- RESULTS START -->
## Latest Results

_312/312 cells validated ✓ · Updated 2026-07-19_  

| # | Language | Overall | Perf | Versatility | Fastest |
|---|----------|---------|------|-------------|---------|
| 1 | Rust | 93.2 | 94.8 | 88.5 | 26 |
| 2 | Go | 78.3 | 80.8 | 70.6 | 14 |
| 3 | C++ | 77.7 | 80.8 | 68.4 | 5 |
| 4 | TS | 53.4 | 56.5 | 44.3 | 0 |
| 5 | JS | 52.5 | 55.0 | 44.7 | 0 |
| 6 | LuaJIT | 46.6 | 50.6 | 34.7 | 0 |
| 7 | Python | 12.8 | 13.5 | 10.6 | 0 |

_Overall = 75% performance × 25% versatility (0–100). "Fastest" = benchmark×mutation cells where language had lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor (12 cores) · win32 · 33.4 GB RAM._
<!-- RESULTS END -->
