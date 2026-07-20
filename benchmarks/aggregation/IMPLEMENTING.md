# Implementing Aggregation in a New Language

Aggregate CSV transaction records using integer minor currency units.

## Design philosophy

Implementations must produce output accepted by the checker. Use the
language's best idioms, types, and data structures — do not copy code
structure from other implementations. The checker is the source of truth
for correctness.

## CLI contract

Accept the persistent-worker flags: `--input`, `--output`, `--timing-output`,
`--warmup`, `--min-iterations`, `--max-iterations`, `--target-relative-ci`.

Read and parse the input CSV file **before** warmup and measurement. Compute
all aggregations inside the timed kernel over already-parsed rows. Write the
final result and timing samples; send diagnostics only to stderr.

**Timing boundary**: Time only the aggregation (totals, category grouping,
account ranking, checksum computation) over pre-parsed rows. Input parsing,
JSON serialization, and file I/O are outside the kernel.

## Input format

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

## Output format

```json
{
  "benchmark": "aggregation",
  "version": 1,
  "recordCount": 10000000,
  "totalQuantity": 48199291,
  "totalValueMinorUnits": 9581294421,
  "minimumTransactionMinorUnits": 1499,
  "maximumTransactionMinorUnits": 9995000,
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
| `minimumTransactionMinorUnits` | integer | Minimum transaction value across all rows |
| `maximumTransactionMinorUnits` | integer | Maximum transaction value across all rows |
| `categories`             | array   | Per-category aggregates (see below)      |
| `categories[].category`  | string  | Category name                            |
| `categories[].quantity`  | integer | Total quantity for this category         |
| `categories[].valueMinorUnits` | integer | Total value for this category      |
| `topAccounts`            | array   | Top 10 accounts by total value (see below) |
| `topAccounts[].accountId` | string | Account identifier                       |
| `topAccounts[].valueMinorUnits` | integer | Total value for this account      |
| `checksum`               | string  | SHA-256 hex digest (see below)           |

## Checker rules

The checker re-computes the entire aggregation from the input CSV and compares
the output byte-for-byte (JSON serialization). Every field must match exactly:

- `recordCount`, `totalQuantity`, `totalValueMinorUnits`
- `minimumTransactionMinorUnits`, `maximumTransactionMinorUnits`
- `categories` array (order and contents)
- `topAccounts` array (order and contents)
- `checksum`

There is no floating-point tolerance — all values are integers.

## Algorithm

The checker verifies that:

1. `recordCount` equals the number of data rows (excluding the header).
2. `totalQuantity` is the sum of all `quantity` values.
3. `totalValueMinorUnits` is the sum of all `quantity * unit_price` products.
4. `minimumTransactionMinorUnits` is the minimum `quantity * unit_price` across
   all rows. Initialize to a very large value (e.g., `i64::MAX` or
   `Number.MAX_SAFE_INTEGER`), not `0`.
5. `maximumTransactionMinorUnits` is the maximum `quantity * unit_price` across
   all rows.
6. `categories` contains one entry per unique category, each with the sum of
   quantities and sum of values for that category. Sorted alphabetically by
   category name (ascending).
7. `topAccounts` contains the top 10 accounts by total value (descending). If
   values are equal, sort by account ID ascending (lexicographic).

### Checksum calculation

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

### Why the keys differ

The output JSON uses camelCase (`categories`, `topAccounts`) because that's
what the result schema expects. But the checksum uses PascalCase (`Categories`,
`TopAccounts`) because that's what the checker computes. This is intentional —
the checksum validates the exact byte sequence.

## Fairness constraints

**Allowed**: Language-native data structures, compiler optimizations,
cache-friendly algorithms, SIMD intrinsics (single-threaded), idiomatic
abstractions.

**Prohibited**: External compute libraries, GPU offloading, multi-process
parallelism, precomputation across iterations, caching results between
iterations.

## Gotchas

- **Integer arithmetic only**: `quantity * unit_price` must use integer math.
  Do not use floats for currency.
- **minimumTransactionMinorUnits**: Initialize to a very large value, not `0`.
- **Sort stability for accounts**: When two accounts have the same value,
  sort by account ID ascending. This must be deterministic.
- **Checksum keys are PascalCase**: `Categories` and `TopAccounts`, not
  `categories` and `topAccounts`.
- **Trailing newline**: The checksum input JSON must end with `\n`.
- **No rounding**: All values are exact integers. Do not round anything.
- **Header row**: Skip the first line of the CSV. `recordCount` should not
  include it.

## Verification

```bash
arena check --benchmark aggregation --input datasets/small.csv --output /tmp/aggregation-out.json
```

The checker will output `{"status":"accepted",...}` on success.
