---
name: gitnexus-area-views
description: "Skill for the Views area of RAFIQ. 163 symbols across 24 files."
---

# Views

163 symbols | 24 files | Cohesion: 71%

## When to Use

- Working with code in `frontend/`
- Understanding how calculateLineTotal, calculateTaxPiasters, addProductToCart work
- Modifying views-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/views/PosView.tsx` | addProductToCart, applyRecalledInvoiceDiscount, changeCartItemUnit, cycleCartItemUnit, handleApplyInvoiceDiscount (+56) |
| `frontend/src/views/SettingsView.tsx` | autoSaveSetting, handleBlurTaxNumber, handleChangeDefaultTaxRate, handleChangeDrawerPin, handleChangeDrawerPulse (+14) |
| `frontend/src/views/PurchasesView.tsx` | fetchInitialData, onConfirm, handleConfirmPayment, handlePrintInvoiceLabels, handleRestoreSupplier (+12) |
| `frontend/src/views/ProductsView.tsx` | applySearch, clearAllFilters, clearCategoryFilter, clearSearchFilter, clearStockStatusFilter (+11) |
| `frontend/src/views/CustomersView.tsx` | handleExportCustomersToExcel, applyCustomerSearch, handleArchiveCustomer, handleExecuteImport, handleRecordPayment (+3) |
| `frontend/src/utils/excelImport.ts` | downloadErrorReport, exportCustomersToExcel, exportCustomersViaSheetJs, exportProductsViaSheetJs, buildSheetJsProductSheet (+2) |
| `frontend/src/views/LoginScreen.tsx` | interval, focusPasswordInput, handleKeypadBackspace, handleKeypadClear, handleKeypadPress (+1) |
| `frontend/src/utils/barcodeReader.ts` | convertArabicLayoutToBarcode, isBarcodeMatch, physicalCodeToChar, sanitizeScannedBarcode |
| `frontend/src/views/pos/heldSalePricing.ts` | applyCurrentPrices, keepHeldPricesRequiresApproval, serializeHeldCart |
| `frontend/src/utils/receiptPrintPreference.ts` | getReceiptPrintPreference, readStorage, shouldPrintReceipt |

## Entry Points

Start here when exploring this area:

- **`calculateLineTotal`** (Function) — `frontend/src/utils/money.ts:287`
- **`calculateTaxPiasters`** (Function) — `frontend/src/utils/money.ts:310`
- **`addProductToCart`** (Function) — `frontend/src/views/PosView.tsx:431`
- **`applyRecalledInvoiceDiscount`** (Function) — `frontend/src/views/PosView.tsx:1087`
- **`changeCartItemUnit`** (Function) — `frontend/src/views/PosView.tsx:651`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `calculateLineTotal` | Function | `frontend/src/utils/money.ts` | 287 |
| `calculateTaxPiasters` | Function | `frontend/src/utils/money.ts` | 310 |
| `addProductToCart` | Function | `frontend/src/views/PosView.tsx` | 431 |
| `applyRecalledInvoiceDiscount` | Function | `frontend/src/views/PosView.tsx` | 1087 |
| `changeCartItemUnit` | Function | `frontend/src/views/PosView.tsx` | 651 |
| `cycleCartItemUnit` | Function | `frontend/src/views/PosView.tsx` | 719 |
| `handleApplyInvoiceDiscount` | Function | `frontend/src/views/PosView.tsx` | 811 |
| `handleApplyItemDiscount` | Function | `frontend/src/views/PosView.tsx` | 744 |
| `handleApplyItemPriceOverride` | Function | `frontend/src/views/PosView.tsx` | 769 |
| `handleCartBackspace` | Function | `frontend/src/views/PosView.tsx` | 2429 |
| `handleConfirmItemModifiers` | Function | `frontend/src/views/PosView.tsx` | 897 |
| `handleConfirmWeight` | Function | `frontend/src/views/PosView.tsx` | 2181 |
| `handleKeepHeldPrices` | Function | `frontend/src/views/PosView.tsx` | 1178 |
| `keepHeld` | Function | `frontend/src/views/PosView.tsx` | 1182 |
| `onCancelled` | Function | `frontend/src/views/PosView.tsx` | 1197 |
| `handleLoadChronicMedsToCart` | Function | `frontend/src/views/PosView.tsx` | 2530 |
| `handleOpenAlternatives` | Function | `frontend/src/views/PosView.tsx` | 2749 |
| `handleOpenDdiAlternatives` | Function | `frontend/src/views/PosView.tsx` | 2766 |
| `handlePrintKitchenKOT` | Function | `frontend/src/views/PosView.tsx` | 987 |
| `handlePrintTablePreBill` | Function | `frontend/src/views/PosView.tsx` | 976 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleBarcodeSubmit → ToLocalDateString` | cross_community | 8 |
| `HandleConfirmWeight → ToLocalDateString` | cross_community | 8 |
| `HandleFastBarcodeScan → ToLocalDateString` | cross_community | 8 |
| `HandleQuickProductCreated → ToLocalDateString` | cross_community | 8 |
| `HandleBarcodeSubmit → NormalizeDateRange` | cross_community | 7 |
| `HandleConfirmWeight → NormalizeDateRange` | cross_community | 7 |
| `HandleFastBarcodeScan → NormalizeDateRange` | cross_community | 7 |
| `HandleQuickProductCreated → NormalizeDateRange` | cross_community | 7 |
| `HandleConfirmPayment → ToLocalDateString` | cross_community | 7 |
| `HandleHoldCurrentSale → ToLocalDateString` | cross_community | 7 |

## How to Explore

1. `context({name: "calculateLineTotal"})` — see callers and callees
2. `query({search_query: "views"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
