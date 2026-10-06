# Arena Exchange

A deterministic, event-driven exchange benchmark. Each session maintains
multiple price-time order books, account cash and inventory reservations,
market controls, and analytics while replaying an ordered event stream.

**Status:** benchmark foundation complete; language implementations pending.
The manifest, deterministic fixtures and generator, JSON schemas, independent
Go checker, and correctness tests are available. `implementations/.gitkeep`
intentionally marks the workload as pending. No performance results exist yet.

## What it measures

Ordered lookup and insertion, FIFO matching, random cancellation, continual
mutation, allocation churn, skewed state access, and streaming checksums.
The exchange kernel is single-threaded; language runtime and GC helper threads
are allowed. Internal representations remain entirely language-specific.

## Sessions

| Size | Instruments | Accounts | Events | Profiles |
|------|-------------|----------|--------|----------|
| small | 16 | 2,000 | 50,000 | All five |
| medium | 128 | 20,000 | 500,000 | All five |
| large | 1,024 | 100,000 | 3,000,000 | balanced-session |

- `deep-book`: mostly non-crossing limits across many price levels.
- `crossing-burst`: large resting makers feeding frequent small crossing orders.
- `cancel-storm`: frequent random cancellations and priority-losing replacements.
- `hot-symbols`: most trading submissions target the hottest 1% of instruments
  (rounded up), with the rest lightly traded.
- `balanced-session`: a mix of trading, funding, controls, and queries.

Every 32nd nonterminal event deliberately targets an unknown account; other
events are planned against live liquidity. The resulting rejection rate is
verified to be 2–5%. The generator may substitute a resting limit for a market
order with no liquidity, or resume a halted instrument before trading.

The event counts are starting points, not measured runtime promises. Calibrate
the fastest and slowest future language implementations before claiming a
full-matrix runtime. The only scored metric in v1 is `kernelTime`.

## Contract

See [IMPLEMENTING.md](IMPLEMENTING.md) for the complete event, reservation,
matching, output, checksum, and persistent-worker contract. All arithmetic is
exact integer arithmetic within the JavaScript/Lua safe-integer range.

The checker independently replays the stream and compares all summary fields
and five SHA-256 digests. Trades are hashed incrementally rather than emitted
as a huge journal. Settlement preserves the final books and reservations.

## Generate and validate

```bash
npm run arena -- dataset generate --benchmark arena-exchange --size small --mutation balanced-session --seed 729418
npm run build:checker
npm run arena -- check --benchmark arena-exchange --input benchmarks/arena-exchange/fixtures/example.json --output benchmarks/arena-exchange/fixtures/example-output.json
node scripts/test-checker.mjs
```

Fixtures and metadata are generated; do not edit datasets by hand. A tiny
worked example lives in `fixtures/` separately from the scored datasets.
