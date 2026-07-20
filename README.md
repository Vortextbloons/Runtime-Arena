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

_324/324 cells validated ✓ · Updated 2026-07-20_  

| # | Language | Overall | Perf | Versatility | Fastest |
|---|----------|---------|------|-------------|---------|
| 1 | C++ | 82.4 | 85.8 | 72.1 | 11 |
| 2 | c | 73.7 | 77.8 | 61.4 | 11 |
| 3 | Rust | 72.6 | 77.1 | 59.2 | 10 |
| 4 | Go | 59.6 | 61.5 | 53.9 | 1 |
| 5 | java | 54.1 | 55.5 | 49.9 | 0 |
| 6 | TS | 46.9 | 48.7 | 41.6 | 0 |
| 7 | JS | 44.7 | 46.6 | 39.0 | 0 |
| 8 | LuaJIT | 38.3 | 40.9 | 30.3 | 0 |
| 9 | lua-interpreted | 11.6 | 12.3 | 9.4 | 0 |
| 10 | Python | 9.6 | 10.0 | 8.5 | 0 |

_Overall = 75% performance × 25% versatility (0–100). "Fastest" = benchmark×mutation cells where language had lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor (12 cores) · win32 · 33.4 GB RAM._
<!-- RESULTS END -->
