---
name: gitnexus-area-views
description: "Skill for the Views area of RAFIQ. 186 symbols across 28 files."
---

# Views

186 symbols | 28 files | Cohesion: 70%

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
| `frontend/src/views/OnlineStoreView.tsx` | intervalId, handleCustomCatalogUpload, handleManualSync, handlePurgeOrders, handleUpdateOrderStatus (+6) |
| `frontend/src/views/CustomersView.tsx` | handleExportCustomersToExcel, applyCustomerSearch, handleArchiveCustomer, handleExecuteImport, handleRecordPayment (+3) |
| `frontend/src/utils/excelImport.ts` | downloadErrorReport, exportCustomersToExcel, exportCustomersViaSheetJs, exportProductsViaSheetJs, buildSheetJsProductSheet (+2) |
| `frontend/src/bridge/onlineStoreIpc.ts` | getOnlineStoreOrders, getOnlineStoreState, processOnlineStoreOrder, purgeOnlineStoreOrders, triggerOnlineStoreSync (+1) |
| `frontend/src/views/LoginScreen.tsx` | interval, focusPasswordInput, handleKeypadBackspace, handleKeypadClear, handleKeypadPress (+1) |
| `frontend/src/utils/barcodeReader.ts` | convertArabicLayoutToBarcode, isBarcodeMatch, physicalCodeToChar, sanitizeScannedBarcode |

## Entry Points

Start here when exploring this area:

- **`calculateLineTotal`** (Function) — `frontend/src/utils/money.ts:287`
- **`calculateTaxPiasters`** (Function) — `frontend/src/utils/money.ts:310`
- **`addProductToCart`** (Function) — `frontend/src/views/PosView.tsx:451`
- **`applyRecalledInvoiceDiscount`** (Function) — `frontend/src/views/PosView.tsx:1155`
- **`changeCartItemUnit`** (Function) — `frontend/src/views/PosView.tsx:671`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `calculateLineTotal` | Function | `frontend/src/utils/money.ts` | 287 |
| `calculateTaxPiasters` | Function | `frontend/src/utils/money.ts` | 310 |
| `addProductToCart` | Function | `frontend/src/views/PosView.tsx` | 451 |
| `applyRecalledInvoiceDiscount` | Function | `frontend/src/views/PosView.tsx` | 1155 |
| `changeCartItemUnit` | Function | `frontend/src/views/PosView.tsx` | 671 |
| `cycleCartItemUnit` | Function | `frontend/src/views/PosView.tsx` | 739 |
| `handleApplyInvoiceDiscount` | Function | `frontend/src/views/PosView.tsx` | 831 |
| `handleApplyItemDiscount` | Function | `frontend/src/views/PosView.tsx` | 764 |
| `handleApplyItemPriceOverride` | Function | `frontend/src/views/PosView.tsx` | 789 |
| `handleCartBackspace` | Function | `frontend/src/views/PosView.tsx` | 2548 |
| `handleConfirmItemModifiers` | Function | `frontend/src/views/PosView.tsx` | 965 |
| `handleConfirmWeight` | Function | `frontend/src/views/PosView.tsx` | 2300 |
| `handleKeepHeldPrices` | Function | `frontend/src/views/PosView.tsx` | 1246 |
| `keepHeld` | Function | `frontend/src/views/PosView.tsx` | 1250 |
| `onCancelled` | Function | `frontend/src/views/PosView.tsx` | 1265 |
| `handleLoadChronicMedsToCart` | Function | `frontend/src/views/PosView.tsx` | 2649 |
| `handleOpenAlternatives` | Function | `frontend/src/views/PosView.tsx` | 2869 |
| `handleOpenDdiAlternatives` | Function | `frontend/src/views/PosView.tsx` | 2886 |
| `handlePrintKitchenKOT` | Function | `frontend/src/views/PosView.tsx` | 1055 |
| `handlePrintTablePreBill` | Function | `frontend/src/views/PosView.tsx` | 1044 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `OnlineStoreView → ToLocalDateString` | cross_community | 9 |
| `OnlineStoreView → NormalizeDateRange` | cross_community | 8 |
| `HandleBarcodeSubmit → ToLocalDateString` | cross_community | 8 |
| `HandleConfirmWeight → ToLocalDateString` | cross_community | 8 |
| `HandleFastBarcodeScan → ToLocalDateString` | cross_community | 8 |
| `HandleQuickProductCreated → ToLocalDateString` | cross_community | 8 |
| `OnlineStoreView → GetAutoTopicsForAction` | cross_community | 7 |
| `OnlineStoreView → EmitDataChanged` | cross_community | 7 |
| `OnlineStoreView → GetMockProtectedActions` | cross_community | 7 |
| `HandleBarcodeSubmit → NormalizeDateRange` | cross_community | 7 |

## How to Explore

1. `context({name: "calculateLineTotal"})` — see callers and callees
2. `query({search_query: "views"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
