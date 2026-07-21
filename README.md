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

_357/357 cells validated ✓ · Updated 2026-07-21_  

| # | Language | Overall | Perf | Efficiency | Fastest |
|---|----------|---------|------|-------------|---------|
| 1 | C++ | 95.4 | 90.6 | 74.2 | 15 |
| 2 | Rust | 83.0 | 80.9 | 61.4 | 12 |
| 3 | C | 76.1 | 69.7 | 81.0 | 2 |
| 4 | C# | 75.8 | 72.8 | 83.0 | 1 |
| 5 | JavaScript | 73.6 | 67.1 | 93.1 | 1 |
| 6 | TypeScript | 73.5 | 67.8 | 88.4 | 0 |
| 7 | Java | 63.7 | 60.0 | 80.0 | 2 |
| 8 | Go | 61.0 | 57.1 | 70.3 | 0 |
| 9 | LuaJIT | 42.6 | 44.0 | — | 0 |
| 10 | Python | 26.5 | 13.0 | 80.2 | 0 |
| 11 | Lua 5.4 | 15.8 | 15.7 | — | 0 |

_Performance = 85% geometric-mean benchmark speed + 15% efficiency (0–100). Efficiency combines Memory, Artifact, Implementation Size, and Build Time. "Fastest" = benchmark×mutation cells with lowest median time. Tested on AMD Ryzen 5 9600X 6-Core Processor · win32 10.0.26200 · 33.4 GB RAM._
<!-- RESULTS END -->
