# Implementing Aggregation in a New Language

## Overview

Aggregate CSV transaction records. **Read and parse the CSV once before timing**;
the timed kernel aggregates already-parsed rows. Compute totals, group by
category, rank accounts, and produce a deterministic checksum.

**Design philosophy:** Implementations must produce output accepted by the
checker. Use the language's best idioms, types, and data structures — do not
copy code structure from the reference implementations. The checker is the
source of truth for correctness.

## CLI Contract

Your program must:

1. Accept `--input <file>` and `--output <file>` arguments.
2. Read and parse the input CSV file **before** warmup and measurement.
3. Compute all aggregations inside the timed kernel over parsed rows.
4. Write exactly one JSON result file to the output path.
5. Exit with code `0` on success. Exit nonzero on failure.
6. Write logs only to stderr. Never print result data to stdout.

## Input Format

CSV with a header row:

```
timestamp,account_id,category,quantity,unit_price
2026-01-15T10:30:00Z,ACC-001,electronics,5,1999
2026-01-15T10:31:00Z,ACC-002,books,12,1499
```

| Column       | Type   | Description                          |
|--------------|--------|--------------------------------------|
| `timestamp`  | string | ISO 8601 timestamp (ignored in output) |
| `account_id` | string | Account identifier                   |
| `category`   | string | Product category                     |
| `quantity`   | string | Integer quantity (parse as int64)    |
| `unit_price` | string | Price in minor currency units (int64)|

**Transaction value** = `quantity * unit_price` (integer arithmetic, no floats).

## Output Format

```json
{
  "benchmark": "aggregation",
  "version": 1,
  "recordCount": 10000000,
  "totalQuantity": 48199291,
  "totalValueMinorUnits": 9581294421,
  "categories": [
    {
      "category": "books",
      "quantity": 500,
      "valueMinorUnits": 749500
    }
  ],
  "topAccounts": [
    {
      "accountId": "ACC-001",
      "valueMinorUnits": 9995000
    }
  ],
  "checksum": "a1b2c3..."
}
```

| Field                    | Type    | Description                              |
|--------------------------|---------|------------------------------------------|
| `benchmark`              | string  | Must be `"aggregation"`                  |
| `version`                | integer | Must be `1`                              |
| `recordCount`            | integer | Total number of data rows (excluding header) |
| `totalQuantity`          | integer | Sum of all quantities                    |
| `totalValueMinorUnits`   | integer | Sum of all transaction values            |
| `categories`             | array   | Per-category aggregates                  |
| `category`               | string  | Category name                            |
| `quantity`               | integer | Total quantity for this category         |
| `valueMinorUnits`        | integer | Total value for this category            |
| `topAccounts`            | array   | Top 10 accounts by total value           |
| `accountId`              | string  | Account identifier                       |
| `valueMinorUnits`        | integer | Total value for this account             |
| `checksum`               | string  | SHA-256 hex digest (see below)           |

## Algorithm

```
recordCount = 0
totalQuantity = 0
totalValueMinorUnits = 0
minimumTransaction = +infinity
maximumTransaction = 0
categories = map<string, {quantity, value}>
accounts = map<string, value>

for each row (skip header):
    qty = parseInt(row.quantity)
    price = parseInt(row.unit_price)
    value = qty * price

    recordCount++
    totalQuantity += qty
    totalValueMinorUnits += value
    minimumTransaction = min(minimumTransaction, value)
    maximumTransaction = max(maximumTransaction, value)

    categories[row.category].quantity += qty
    categories[row.category].value += value
    accounts[row.account_id] += value
```

### Sorting Rules

**Categories**: Sort alphabetically by category name (ascending).

**Top accounts**: Sort by value descending. If values are equal, sort by
account ID ascending (lexicographic). Take only the first 10.

## Checksum Calculation

This is the most error-prone part. Follow exactly:

1. Build the sorted categories array and sorted top-10 accounts array.
2. Serialize this structure to JSON:
   ```json
   {"Categories": [...], "TopAccounts": [...]}
   ```
   **Critical**: The keys must be **capitalized** (`Categories`, `TopAccounts`),
   NOT camelCase. This differs from the output JSON which uses camelCase.
3. Append a **newline** (`\n`) to the JSON string.
4. Compute SHA-256 of the resulting bytes.
5. Output as lowercase hex string.

In pseudocode:

```
checksum_input = json_encode({
    "Categories": sorted_categories,
    "TopAccounts": sorted_top_accounts
}) + "\n"

checksum = hex(sha256(checksum_input))
```

### Why the keys differ

The output JSON uses camelCase (`categories`, `topAccounts`) because that's
what the result schema expects. But the checksum uses PascalCase (`Categories`,
`TopAccounts`) because that's what the checker computes. This is intentional —
the checksum validates the exact byte sequence.

## Checker Rules

The checker re-computes the entire aggregation from the input CSV and compares
the output byte-for-byte (JSON serialization). Every field must match exactly:

- `recordCount`, `totalQuantity`, `totalValueMinorUnits`
- `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`
- `categories` array (order and contents)
- `topAccounts` array (order and contents)
- `checksum`

There is no floating-point tolerance — all values are integers.

## Gotchas

- **Integer arithmetic only**: `quantity * unit_price` must use integer math.
  Do not use floats for currency.
- **minimumTransactionMinorUnits**: Initialize to a very large value (e.g.,
  `i64::MAX` or `Number.MAX_SAFE_INTEGER`), not `0`. If all transactions are
  positive, the minimum will be set from the data.
- **Sort stability for accounts**: When two accounts have the same value,
  sort by account ID ascending. This must be deterministic.
- **Checksum keys are PascalCase**: `Categories` and `TopAccounts`, not
  `categories` and `topAccounts`.
- **Trailing newline**: The checksum input JSON must end with `\n`.
- **No rounding**: All values are exact integers. Do not round anything.
- **Header row**: Skip the first line of the CSV. `recordCount` should not
  include it.

## Scaffolding

Each language needs build configuration in `implementations/<language-id>/`:

**Rust** — `Cargo.toml`:
```toml
[package]
name = "aggregation"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
csv = "1"
```
Source: `src/main.rs`

**Go** — `go.mod`:
```
module runtime-arena/aggregation
go 1.26
```
Source: `main.go` (no external dependencies needed — uses `encoding/csv`)

**TypeScript** — `package.json`:
```json
{"name":"arena-aggregation-typescript","private":true,"type":"module","scripts":{"build":"tsc"},"devDependencies":{"@types/node":"^26.1.1","typescript":"^7.0.2"}}
```
`tsconfig.json`:
```json
{"compilerOptions":{"target":"ES2024","module":"NodeNext","moduleResolution":"NodeNext","outDir":"dist","strict":true,"types":["node"]},"include":["index.ts"]}
```
Source: `index.ts`

**Python** — No build configuration needed (uses standard library only).
Source: `main.py`

## Reference Implementations

- Go: `implementations/go/main.go`
- Python: `implementations/python/main.py`
- Rust: `implementations/rust/src/main.rs`
- TypeScript: `implementations/typescript/index.ts`

## Verification

```bash
arena check --benchmark aggregation --input datasets/small.csv --output /tmp/aggregation-out.json
```

The checker will output `{"status":"accepted",...}` on success.
