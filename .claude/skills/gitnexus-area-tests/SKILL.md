---
name: gitnexus-area-tests
description: "Skill for the Tests area of RAFIQ. 27 symbols across 4 files."
---

# Tests

27 symbols | 4 files | Cohesion: 93%

## When to Use

- Working with code in `tests/`
- Understanding how distribute_invoice_discount, log, multiply_by_milli_units work
- Modifying tests-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/test_financial_challenger_m1.py` | run_all_tests, test_benchmark_sku_calibrations, test_egp_string_to_piasters_consistency, test_file_existence_and_sizes, test_parsed_json_and_csv_invariants (+7) |
| `tests/test_deep_adversarial_challenger_2.py` | distribute_invoice_discount, log, multiply_by_milli_units, run_all, test_1_strict_types_and_no_floats (+5) |
| `tests/test_challenger_m1_it2.py` | check, main, parse_margin |
| `tests/stress_test_calibration_m1.py` | log_section, run_stress_tests |

## Entry Points

Start here when exploring this area:

- **`distribute_invoice_discount`** (Function) — `tests/test_deep_adversarial_challenger_2.py:229`
- **`log`** (Function) — `tests/test_deep_adversarial_challenger_2.py:37`
- **`multiply_by_milli_units`** (Function) — `tests/test_deep_adversarial_challenger_2.py:257`
- **`run_all`** (Function) — `tests/test_deep_adversarial_challenger_2.py:317`
- **`test_1_strict_types_and_no_floats`** (Function) — `tests/test_deep_adversarial_challenger_2.py:40`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `distribute_invoice_discount` | Function | `tests/test_deep_adversarial_challenger_2.py` | 229 |
| `log` | Function | `tests/test_deep_adversarial_challenger_2.py` | 37 |
| `multiply_by_milli_units` | Function | `tests/test_deep_adversarial_challenger_2.py` | 257 |
| `run_all` | Function | `tests/test_deep_adversarial_challenger_2.py` | 317 |
| `test_1_strict_types_and_no_floats` | Function | `tests/test_deep_adversarial_challenger_2.py` | 40 |
| `test_2_barcode_cardinality_and_disjointness` | Function | `tests/test_deep_adversarial_challenger_2.py` | 78 |
| `test_3_unicode_cleanliness_and_replacement_chars` | Function | `tests/test_deep_adversarial_challenger_2.py` | 138 |
| `test_4_price_clustering_and_diversity` | Function | `tests/test_deep_adversarial_challenger_2.py` | 173 |
| `test_5_staples_and_regulated_margins` | Function | `tests/test_deep_adversarial_challenger_2.py` | 193 |
| `test_6_chaotic_1000_shopping_carts_stress_test` | Function | `tests/test_deep_adversarial_challenger_2.py` | 262 |
| `run_all_tests` | Function | `tests/test_financial_challenger_m1.py` | 441 |
| `test_benchmark_sku_calibrations` | Function | `tests/test_financial_challenger_m1.py` | 339 |
| `test_egp_string_to_piasters_consistency` | Function | `tests/test_financial_challenger_m1.py` | 372 |
| `test_file_existence_and_sizes` | Function | `tests/test_financial_challenger_m1.py` | 29 |
| `test_parsed_json_and_csv_invariants` | Function | `tests/test_financial_challenger_m1.py` | 112 |
| `test_raw_json_text_no_decimals_in_integers` | Function | `tests/test_financial_challenger_m1.py` | 91 |
| `test_utf8_integrity_and_zero_emojis` | Function | `tests/test_financial_challenger_m1.py` | 42 |
| `calculate_tax_piasters` | Function | `tests/test_financial_challenger_m1.py` | 210 |
| `distribute_invoice_discount` | Function | `tests/test_financial_challenger_m1.py` | 173 |
| `multiply_by_milli_units` | Function | `tests/test_financial_challenger_m1.py` | 203 |

## How to Explore

1. `context({name: "distribute_invoice_discount"})` — see callers and callees
2. `query({search_query: "tests"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
