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

_291/291 cells validated ✓ · Updated 2026-07-20_  

| # | Language | Overall | Perf | Versatility | Fastest |
|---|----------|---------|------|-------------|---------|
| 1 | Rust | 92.5 | 94.7 | 86.2 | 23 |
| 2 | C++ | 79.8 | 83.5 | 68.6 | 2 |
| 3 | Go | 78.0 | 80.6 | 70.1 | 3 |
| 4 | java | 63.6 | 66.5 | 55.1 | 5 |
| 5 | JS | 54.1 | 57.3 | 44.5 | 0 |
| 6 | TS | 53.9 | 57.1 | 44.2 | 0 |
| 7 | LuaJIT | 45.5 | 49.2 | 34.4 | 0 |
| 8 | lua-interpreted | 13.8 | 14.9 | 10.7 | 0 |
| 9 | Python | 11.7 | 12.3 | 9.6 | 0 |

_Overall = 75% performance × 25% versatility (0–100). "Fastest" = benchmark×mutation cells where language had lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor (12 cores) · win32 · 33.4 GB RAM._
<!-- RESULTS END -->
