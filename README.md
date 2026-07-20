<picture>
  <source media="(prefers-color-scheme: dark)" srcset="app-logo.png">
  <img alt="Runtime Arena" src="app-logo.png" width="96" height="96">
</picture>

# Runtime Arena

Cross-language benchmark system — runs identical workloads across Rust, Go, TypeScript, Java, Python, LuaJIT, Lua Interpreted, C++, and JavaScript, validates output, and records metrics.

```bash
npm install
npm run build:cli
npm run build:checker
npm run arena -- run
npm run arena -- results current
```

<!-- RESULTS START -->
## Latest Results

_357/357 cells validated ✓ · Updated 2026-07-20_  

| # | Language | Overall | Perf | Versatility | Fastest |
|---|----------|---------|------|-------------|---------|
| 1 | C++ | 81.4 | 84.7 | 71.6 | 8 |
| 2 | Go | 73.4 | 77.2 | 62.1 | 6 |
| 3 | c | 72.8 | 76.7 | 61.1 | 9 |
| 4 | Rust | 71.7 | 76.0 | 58.8 | 9 |
| 5 | c-sharp | 56.4 | 58.4 | 50.4 | 1 |
| 6 | java | 53.1 | 54.7 | 48.2 | 0 |
| 7 | TS | 48.8 | 51.2 | 41.4 | 0 |
| 8 | JS | 48.0 | 50.8 | 39.9 | 0 |
| 9 | LuaJIT | 38.0 | 40.7 | 30.1 | 0 |
| 10 | lua-interpreted | 11.1 | 11.8 | 9.2 | 0 |
| 11 | Python | 9.5 | 9.9 | 8.2 | 0 |

_Overall = 75% performance × 25% versatility (0–100). "Fastest" = benchmark×mutation cells where language had lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor (12 cores) · win32 · 33.4 GB RAM._
<!-- RESULTS END -->
