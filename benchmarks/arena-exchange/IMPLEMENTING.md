# Implementing Arena Exchange

This document is the v1 contract. The Go checker is the correctness authority.
Use idiomatic data structures and algorithms; implementations need not mirror
the reference engine. No language implementations are included yet.

## Worker and timing contract

Accept `--input <file>`, `--output <file>`, and `--protocol-version 2.0.0`.
Follow the [harness-timed worker protocol](../../docs/reference/protocol.md).
Parse and validate immutable input before emitting `ready`. On every `run`,
construct fresh mutable account and book state, replay every event, compute
all analytics and digests, serialize the result, and respond with the SHA-256
of the exact compact JSON result bytes. On `finish`, write that last result
to `--output` and acknowledge its digest. Diagnostics go only to stderr.

Fresh state, replay, rankings, and checksum computation belong in the timed
kernel. Input parsing and input/output file I/O do not. The harness includes
response serialization and protocol transport in its wall-clock measurement;
workers cannot move kernel work before a `run` request.

The exchange engine is single-threaded. Runtime/GC helper threads are allowed.
Native containers, custom ordered structures, arenas, pooled allocations,
and compiler optimizations are allowed. Parallel workload processing, external
compute libraries, GPU offloading, answer precomputation, skipping events,
and caching mutable state or results across iterations are prohibited.

## Input

```json
{"schemaVersion":"1.0.0","instruments":[[1,1,1000]],"accounts":[[1,10000,[[1,100]]],[2,10000,[[1,100]]]],"events":[[0,1,10,2,1,1,100,5],[1,2,11,1,1,0,3],[10,3]]}
```

- `instruments`: `[instrumentId,minPrice,maxPrice]`. Initially unhalted.
- `accounts`: `[accountId,cash,[[instrumentId,quantity],...]]`. Omitted
  positions have zero inventory. All reservations initially zero.
- `events`: tuples in replay order. Books initially empty.
- All IDs are integers in `1..2147483647`. Event IDs are consecutive from 1.
- Submitted order IDs are globally unique, including rejected submissions;
  replacements retain the original ID. Input arrays need not be ID-sorted.
- Numeric tokens are decimal integers, never floats, strings, or null.
  Cash and inventory may be zero. Prices, quantities, and funding amounts
  are positive. `1 <= minPrice <= maxPrice`.
- Every value and intermediate sum/product must fit `0..9007199254740991`.
  In particular initial cash plus all accepted deposits, initial inventory
  per instrument, all submitted/replacement quantities summed, and total
  traded notional fit this bound. There is no wrapping or rounding.
- Duplicate entities/positions, unknown initial-position instruments,
  malformed tuples, unknown fields, duplicate JSON keys, invalid sides,
  invalid depths, or missing/nonterminal settlement make the input invalid.
  Unknown IDs in otherwise well-formed events are operational rejections.

| Type | Tuple |
|------|-------|
| Limit | `[0,eventId,orderId,accountId,instrumentId,side,price,quantity]` |
| Market | `[1,eventId,orderId,accountId,instrumentId,side,quantity]` |
| Cancel | `[2,eventId,accountId,orderId]` |
| Replace | `[3,eventId,accountId,orderId,newPrice,newQuantity]` |
| Deposit | `[4,eventId,accountId,amount]` |
| Withdraw | `[5,eventId,accountId,amount]` |
| Halt | `[6,eventId,instrumentId]` |
| Resume | `[7,eventId,instrumentId]` |
| Price band | `[8,eventId,instrumentId,minPrice,maxPrice]` |
| Snapshot | `[9,eventId,instrumentId,depth]`, depth in `1..10` |
| Settlement | `[10,eventId]`, exactly once, last |

`side=0` means buy; `side=1` means sell. There is one cash currency, no
credit, shorting, fees, interest, tick table, expiration, or auction.

## Matching and risk

Match best price first: bids descending, asks ascending. At each price, match
FIFO by priority event ID. A buy limit crosses prices <= its limit; a sell
limit crosses prices >= its limit. Execute at the resting maker's price,
with quantity `min(makerRemaining,takerRemaining)`. Remove completed makers
and empty levels immediately. Trade IDs start at 1 in execution order.

Available cash is total cash minus reserved cash. Available inventory is
total inventory minus reserved inventory. A resting buy reserves its limit
price times remaining quantity; a resting sell reserves remaining quantity.
Fills transfer cash from buyer to seller and inventory from seller to buyer.
Release the maker's reservation for the filled quantity at its original price.
Reserve only the taker's final unmatched limit remainder. Price improvement
is immediately available. No account may have negative available resources.

Before any fill, preflight the full executable path in current priority order:

- Buy limit: require execution cost plus `limitPrice * unfilledQuantity`.
- Sell limit: require inventory for the entire submitted quantity.
- Buy market: require exact cost of the portion currently fillable.
- Sell market: require inventory for the portion currently fillable.
- Market with no fillable quantity: reject.
- Any maker on that path belongs to the taker's account: reject the entire
  incoming order before any fills, even if earlier makers were other accounts.

Unknown accounts/instruments, halted instruments, out-of-band limit prices,
and insufficient resources reject the incoming order atomically. Rejection
leaves all observable state unchanged. Unmatched limit quantity rests with
the submission event as priority; unmatched market quantity expires silently.

## Other events

- Cancel: require a live order owned by the supplied account. Remove its
  remainder and release reservations. Cancels work during a halt.
- Replace: require a live owned order. Treat `newQuantity` as a fresh remaining
  quantity, not original quantity or a delta. Preflight with the old order's
  reservation available. A successful replacement removes the old remainder,
  executes as a new limit order, and gives any remainder the replacement event
  as priority. Every replacement loses priority, even an identical one.
  Failure preserves the old order, reservation, and priority. Halted
  instruments reject replacement.
- Deposit: add cash to an existing account. Withdraw: subtract only if
  available cash covers the amount. Both work during halts.
- Halt/resume: toggle an existing instrument. Repeating its current state
  rejects. Existing orders remain; resume does not initiate automatic matches.
- Price band: update an existing instrument, including during a halt.
  Cancel all out-of-band orders, bids descending then asks ascending, FIFO
  within levels. Release reservations. Repeating a valid band is accepted.
- Snapshot: query an existing instrument after all preceding mutations,
  including while halted. Hash its summary and up to `depth` best levels on
  each side. A level contains total remaining quantity and resting-order count.
- Settlement: accept, freeze, and summarize. Preserve books, reservations,
  halted flags, and price bands; do not mark to market or cancel orders.

## Output

Emit exactly these fields (no timing fields):

```text
benchmark="arena-exchange", version=1
eventCount, acceptedEventCount, rejectedEventCount
acceptedOrderCount, rejectedOrderCount
acceptedReplaceCount, rejectedReplaceCount, cancelledOrderCount
tradeCount, tradedQuantity, tradedValue, snapshotCount, openOrderCount
instrumentSummaries[], topAccounts[]
bookChecksum, accountChecksum, tradeChecksum, snapshotChecksum, eventChecksum
```

Every event, including settlement, contributes to accepted/rejected event
counts. Order counts cover only new limit/market submissions. Replacements
have separate counts. `cancelledOrderCount` counts each live order removed
by explicit cancel, successful replacement, or price-band enforcement;
fully filled orders and expired market remainders do not contribute.
`tradedQuantity` counts each trade once; `tradedValue=sum(price*quantity)`.
`snapshotCount` counts accepted snapshot events.

Include every instrument, sorted by ID, with exactly:

```text
instrumentId, minPrice, maxPrice, halted
bestBid, bestAsk, lastTradePrice
tradedQuantity, tradedValue, tradeCount
bidLevelCount, askLevelCount, restingOrderCount
```

Missing book sides and no prior trade use JSON null, not 0 or omitted fields.
Volumes/notionals are cumulative through settlement. `topAccounts` is the first
ten (or all when fewer exist) sorted by gross executed notional descending,
then account ID ascending, each `{accountId,tradedValue}`. Both buyer and
seller receive the full trade notional in this ranking. Zero-activity accounts
remain eligible. Empty arrays must be `[]`, never null.

## Canonical SHA-256 streams

Hash UTF-8 bytes incrementally; do not retain a full trade journal. Every
record ends in one LF (`\n`), never CRLF. Decimal numbers have no leading
zeros or plus sign. Null prices are `-`; sides are lowercase `b` and `s`.
Empty streams use SHA-256 of zero bytes. All digests are 64 lowercase hex chars.

Book: instrument ID ascending, then bids descending, then asks ascending,
FIFO within each price. Include every final live order:

```text
instrumentId|side|price|orderId|accountId|remainingQuantity|priorityEventId\n
```

Accounts: account ID ascending. Emit one `A` line, followed by `P` lines for
positions whose total or reserved quantity is nonzero, instrument ID ascending:

```text
A|accountId|totalCash|reservedCash\n
P|accountId|instrumentId|totalQuantity|reservedQuantity\n
```

Trades: execution order:

```text
tradeId|instrumentId|makerOrderId|takerOrderId|makerAccountId|takerAccountId|price|quantity\n
```

Snapshots: accepted query event order. First a summary line (`halted` is 0/1),
then bid level lines best-first, then ask level lines best-first. Omit absent
levels; the requested depth still appears in the summary:

```text
S|eventId|instrumentId|depth|minPrice|maxPrice|halted|bestBid|bestAsk|lastTradePrice|tradedQuantity|tradedValue|tradeCount|bidLevelCount|askLevelCount|restingOrderCount\n
L|eventId|side|price|remainingQuantity|restingOrderCount\n
```

Events: every event in input order, accepted flag 0/1. Deltas compare state
immediately before and after that event. Open-order deltas may be negative:

```text
eventId|typeCode|acceptedFlag|tradeCountDelta|tradedQuantityDelta|openOrderCountDelta\n
```

The separate worker protocol digest hashes the exact serialized result bytes,
not these streams. JSON object key order need not match other languages.

## Checker and verification

The independent Go checker reconstructs all expected fields and digests,
rejects unknown/duplicate/missing fields and trailing JSON, and verifies:

- Cash conservation: `initialCash + deposits - withdrawals = finalCash`.
- Inventory conservation per instrument; no negative inventory or available cash.
- Reservations equal the final live-order obligations.
- Admitted quantities equal twice trade quantity plus removed/expired quantity
  plus live quantity. Accepted replacements admit a fresh quantity and remove
  the old remainder. Each trade has one buyer and one seller.

```bash
npm run build:checker
npm run arena -- check --benchmark arena-exchange --input benchmarks/arena-exchange/fixtures/example.json --output benchmarks/arena-exchange/fixtures/example-output.json
node scripts/test-checker.mjs
```

`fixtures/example.json` and `example-output.json` are a hand-checkable FIFO,
partial-fill, price-improvement, and snapshot vector. Normal Go tests replay
all five small fixtures. Set `ARENA_EXCHANGE_ALL_FIXTURES=1` when running
`node scripts/test-checker.mjs` to replay every committed size/profile.
