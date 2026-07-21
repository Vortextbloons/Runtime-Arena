<picture>
  <source media="(prefers-color-scheme: dark)" srcset="app-logo.png">
  <img alt="Runtime Arena" src="app-logo.png" width="96" height="96">
</picture>

# Runtime Arena

Cross-language benchmark system — runs identical workloads across C, C++, C#, Go, Java, JavaScript, LuaJIT, Lua 5.4 (Interpreted), Python, Rust, and TypeScript, validates output, and records metrics.

```bash
npm install
npm run build:cli
npm run build:checker
npm run arena -- run
npm run arena -- results current
```

<!-- RESULTS START -->
## Latest Results

_354/357 cells validated ✓ · Updated 2026-07-21_  

| # | Language | Overall | Perf | Versatility | Fastest |
|---|----------|---------|------|-------------|---------|
| 1 | Rust | 82.0 | 82.0 | 58.1 | 16 |
| 2 | C++ | 73.5 | 74.4 | 64.7 | 6 |
| 3 | Go | 69.9 | 71.5 | 61.2 | 1 |
| 4 | C | 67.7 | 67.9 | 55.3 | 3 |
| 5 | Java | 67.2 | 70.4 | 57.8 | 6 |
| 6 | C# | 60.9 | 62.7 | 53.2 | 0 |
| 7 | JavaScript | 57.5 | 59.8 | 48.4 | 1 |
| 8 | TypeScript | 56.7 | 59.3 | 48.7 | 0 |
| 9 | LuaJIT | 34.1 | 36.6 | 24.4 | 0 |
| 10 | Lua 5.4 | 15.1 | 13.4 | 10.1 | 0 |
| 11 | Python | 14.7 | 13.0 | 9.8 | 0 |

_Performance = 75% geometric-mean benchmark speed + 25% versatility (0–100). "Fastest" = benchmark×mutation cells with lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor · win32 10.0.26200 · 33.4 GB RAM._
<!-- RESULTS END -->
