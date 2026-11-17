---
name: gitnexus-area-test
description: "Skill for the Test area of RAFIQ. 100 symbols across 31 files."
---

# Test

100 symbols | 31 files | Cohesion: 100%

## When to Use

- Working with code in `frontend/`
- Understanding how addExpense, cancelCustomerPayment, fundDigitalAccount work
- Modifying test-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/test/app_button.test.js` | assertDarkPairs, assertHoverGated, colourTokens, parseToken, channel (+4) |
| `frontend/test/cash_drawer_overdraft_and_returns_stress.test.js` | addExpense, cancelCustomerPayment, fundDigitalAccount, getAvailableCashPiasters, processReturn (+1) |
| `frontend/test/dark_mode_readability_guard.test.js` | hits, hits, hits, has, classLiterals (+1) |
| `frontend/test/cart_management.test.js` | PosCart, deserializeDraft, getNetTotalPiasters, getSubtotalPiasters, removeItem (+1) |
| `frontend/test/excel_etl_hardened.test.js` | cleanExcelBarcode, normalizeArabicNumerals, parseCellNumber, poundsToPiasters, validateImportRows |
| `frontend/test/inventory_lifecycle_reconciliation.test.js` | checkDiscrepancies, getTotalCalculatedStock, recalculateStockFromMovements, addMovement, createProduct |
| `frontend/test/arabic_names.test.js` | areNamesSimilar, levenshteinDistance, normalizeArabicText, validateBatchImportRows |
| `frontend/test/weighted_products.test.js` | calculateLineTotal, processSaleAtomic, normalizeArabicNumerals, parseWeightInput |
| `frontend/test/dateFilter_pharma_dashboard.test.js` | DESKTOP, SRC, read |
| `frontend/test/dateFilter_wallets_epay_reports.test.js` | DESKTOP, SRC, read |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PosCart` | Class | `frontend/test/cart_management.test.js` | 10 |
| `cleanExcelBarcode` | Function | `frontend/test/excel_etl_hardened.test.js` | 17 |
| `normalizeArabicNumerals` | Function | `frontend/test/excel_etl_hardened.test.js` | 4 |
| `parseCellNumber` | Function | `frontend/test/excel_etl_hardened.test.js` | 40 |
| `poundsToPiasters` | Function | `frontend/test/excel_etl_hardened.test.js` | 12 |
| `validateImportRows` | Function | `frontend/test/excel_etl_hardened.test.js` | 109 |
| `assertDarkPairs` | Function | `frontend/test/app_button.test.js` | 52 |
| `assertHoverGated` | Function | `frontend/test/app_button.test.js` | 68 |
| `colourTokens` | Function | `frontend/test/app_button.test.js` | 44 |
| `parseToken` | Function | `frontend/test/app_button.test.js` | 37 |
| `areNamesSimilar` | Function | `frontend/test/arabic_names.test.js` | 51 |
| `levenshteinDistance` | Function | `frontend/test/arabic_names.test.js` | 28 |
| `normalizeArabicText` | Function | `frontend/test/arabic_names.test.js` | 4 |
| `validateBatchImportRows` | Function | `frontend/test/arabic_names.test.js` | 72 |
| `hits` | Function | `frontend/test/dark_mode_readability_guard.test.js` | 51 |
| `hits` | Function | `frontend/test/dark_mode_readability_guard.test.js` | 59 |
| `hits` | Function | `frontend/test/dark_mode_readability_guard.test.js` | 67 |
| `has` | Function | `frontend/test/dark_mode_readability_guard.test.js` | 46 |
| `channel` | Function | `frontend/test/app_button.test.js` | 228 |
| `luminance` | Function | `frontend/test/app_button.test.js` | 229 |

## How to Explore

1. `context({name: "addExpense"})` — see callers and callees
2. `query({search_query: "test"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
