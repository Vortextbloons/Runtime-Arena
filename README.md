<picture>
  <source media="(prefers-color-scheme: dark)" srcset="app-logo.png">
  <img alt="Runtime Arena" src="app-logo.png" width="96" height="96">
</picture>

# Runtime Arena

Cross-language benchmark system — runs identical workloads across Rust, Go, TypeScript, Java, Python, LuaJIT, Lua 5.4 (Interpreted), C++, and JavaScript, validates output, and records metrics.

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
| 1 | Rust | 82.3 | 86.4 | 69.9 | 14 |
| 2 | C++ | 80.3 | 85.3 | 65.5 | 18 |
| 3 | Go | 66.6 | 69.0 | 59.6 | 1 |
| 4 | java | 60.5 | 62.2 | 55.6 | 0 |
| 5 | TS | 51.9 | 54.5 | 43.9 | 0 |
| 6 | JS | 49.5 | 52.2 | 41.3 | 0 |
| 7 | c | 43.5 | 47.0 | 33.3 | 0 |
| 8 | LuaJIT | 42.7 | 46.0 | 32.8 | 0 |
| 9 | lua-interpreted | 12.9 | 13.8 | 10.1 | 0 |
| 10 | Python | 10.7 | 11.2 | 9.2 | 0 |

_Overall = 75% performance × 25% versatility (0–100). "Fastest" = benchmark×mutation cells where language had lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor (12 cores) · win32 · 33.4 GB RAM._
<!-- RESULTS END -->
