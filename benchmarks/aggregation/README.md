# Structured-data aggregation

Aggregate CSV transaction records using integer minor currency units.

## Purpose

- Parsing
- Allocation
- Hash maps
- Sorting
- Garbage collection
- General data processing

## Input

CSV records:

```text
timestamp,account_id,category,quantity,unit_price
```

## Required calculations

- Record count
- Total quantity
- Total monetary value (minor units)
- Totals by category
- Minimum / maximum transaction
- Top accounts by aggregate value
- Hash of sorted aggregate output

## Output

```json
{
  "benchmark": "aggregation",
  "version": 1,
  "recordCount": 10000000,
  "totalQuantity": 48199291,
  "totalValueMinorUnits": 9581294421,
  "categories": [],
  "topAccounts": [],
  "checksum": "..."
}
```

## Implementations

Place language implementations under `implementations/<language-id>/`.
Each must accept `--input` and `--output` and write a single JSON result file.
