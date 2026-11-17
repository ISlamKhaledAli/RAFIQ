---
name: gitnexus-area-e2e
description: "Skill for the E2e area of RAFIQ. 70 symbols across 1 files."
---

# E2e

70 symbols | 1 files | Cohesion: 88%

## When to Use

- Working with code in `tests/`
- Understanding how get_seeder_supermarket_items, get_audit_report_records, get_live_barcodes work
- Modifying e2e-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/e2e/test_catalog_audit_e2e.py` | get_seeder_supermarket_items, test_f1_01_catalog_total_item_count, test_f1_02_all_seven_categories_represented, test_f1_03_all_barcodes_unique, test_f1_04_all_items_have_verified_prices (+65) |

## Entry Points

Start here when exploring this area:

- **`get_seeder_supermarket_items`** (Function) — `tests/e2e/test_catalog_audit_e2e.py:58`
- **`get_audit_report_records`** (Function) — `tests/e2e/test_catalog_audit_e2e.py:128`
- **`get_live_barcodes`** (Function) — `tests/e2e/test_catalog_audit_e2e.py:121`
- **`get_excel_supermarket_items`** (Function) — `tests/e2e/test_catalog_audit_e2e.py:88`
- **`test_f1_01_catalog_total_item_count`** (Method) — `tests/e2e/test_catalog_audit_e2e.py:154`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `get_seeder_supermarket_items` | Function | `tests/e2e/test_catalog_audit_e2e.py` | 58 |
| `get_audit_report_records` | Function | `tests/e2e/test_catalog_audit_e2e.py` | 128 |
| `get_live_barcodes` | Function | `tests/e2e/test_catalog_audit_e2e.py` | 121 |
| `get_excel_supermarket_items` | Function | `tests/e2e/test_catalog_audit_e2e.py` | 88 |
| `test_f1_01_catalog_total_item_count` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 154 |
| `test_f1_02_all_seven_categories_represented` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 158 |
| `test_f1_03_all_barcodes_unique` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 164 |
| `test_f1_04_all_items_have_verified_prices` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 170 |
| `test_f1_05_all_items_have_verified_costs` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 175 |
| `test_f3_05_retail_price_realism_benchmark` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 256 |
| `test_f6_02_seeder_has_1649_supermarket_items` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 348 |
| `test_f6_04_seeder_integer_piaster_literals` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 360 |
| `test_f6_05_seeder_zero_duplicate_barcodes` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 366 |
| `test_f7_04_db_seeder_barcodes_present` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 399 |
| `test_f9_03_positive_gross_margin_invariant` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 458 |
| `test_f9_04_piaster_conversion_exactness` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 463 |
| `test_f9_05_zero_piasters_rejection` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 469 |
| `test_f1_b01_highest_priced_catalog_items` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 550 |
| `test_f1_b02_lowest_priced_catalog_items` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 558 |
| `test_f1_b05_nonexistent_barcode_handling` | Method | `tests/e2e/test_catalog_audit_e2e.py` | 588 |

## How to Explore

1. `context({name: "get_seeder_supermarket_items"})` — see callers and callees
2. `query({search_query: "e2e"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
