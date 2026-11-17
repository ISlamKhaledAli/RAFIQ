---
name: gitnexus-area-purchases
description: "Skill for the Purchases area of RAFIQ. 60 symbols across 13 files."
---

# Purchases

60 symbols | 13 files | Cohesion: 73%

## When to Use

- Working with code in `frontend/`
- Understanding how formatUnitWithBi, NewPurchaseTab, calculateProjectedCost work
- Modifying purchases-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/views/purchases/NewPurchaseTab.tsx` | NewPurchaseTab, calculateProjectedCost, fetchLiveDrawerCash, getItemUnitsMeta, getWeightedSuggestedSellingPrice (+14) |
| `frontend/src/views/purchases/ShortagesTab.tsx` | handleConvertToPurchase, handleConvertToPurchaseSingle, handleDelete, handleGenerateAutoShortages, handleOrderFromReport (+10) |
| `frontend/src/views/purchases/purchaseLineMath.ts` | computePurchaseLine, packageLineGross, purchaseLinesTotal, resolvePackSize, resolvePurchaseUnitMode |
| `frontend/src/views/purchases/PurchasesInvoicesTab.tsx` | handleToggleMenu, close, handleClickOutside, handleKeyDown, handleScroll |
| `frontend/src/views/purchases/SupplierPaymentStatusCard.tsx` | Figure, Sentence, Shell, SupplierPaymentStatusCard |
| `frontend/src/views/purchases/shortageDates.ts` | formatShortageDate, matchesShortageDay, shortageInstant |
| `frontend/src/views/purchases/supplierPaymentState.ts` | getSupplierPaymentState, describeSupplierBalance |
| `frontend/src/views/purchases/purchasesQuery.ts` | PurchasesRequest, SupplierTransactionsRequest |
| `frontend/src/utils/units.ts` | formatUnitWithBi |
| `frontend/src/views/PurchasesView.tsx` | totalCostPiasters |

## Entry Points

Start here when exploring this area:

- **`formatUnitWithBi`** (Function) — `frontend/src/utils/units.ts:51`
- **`NewPurchaseTab`** (Function) — `frontend/src/views/purchases/NewPurchaseTab.tsx:88`
- **`calculateProjectedCost`** (Function) — `frontend/src/views/purchases/NewPurchaseTab.tsx:628`
- **`fetchLiveDrawerCash`** (Function) — `frontend/src/views/purchases/NewPurchaseTab.tsx:122`
- **`getItemUnitsMeta`** (Function) — `frontend/src/views/purchases/NewPurchaseTab.tsx:191`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `formatUnitWithBi` | Function | `frontend/src/utils/units.ts` | 51 |
| `NewPurchaseTab` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 88 |
| `calculateProjectedCost` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 628 |
| `fetchLiveDrawerCash` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 122 |
| `getItemUnitsMeta` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 191 |
| `getWeightedSuggestedSellingPrice` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 643 |
| `handleApplySuggestedPrice` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 653 |
| `handleCartonsChange` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 477 |
| `handleDirectStockChange` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 569 |
| `handleLoosePiecesChange` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 540 |
| `handlePackSizeChange` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 507 |
| `handleQuantityStep` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 444 |
| `handleRemoveLine` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 739 |
| `handleSelectUnit` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 298 |
| `handleTogglePurchaseUnitMode` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 400 |
| `isItemExpanded` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 145 |
| `toggleItemExpand` | Function | `frontend/src/views/purchases/NewPurchaseTab.tsx` | 141 |
| `getSupplierPaymentState` | Function | `frontend/src/views/purchases/supplierPaymentState.ts` | 3 |
| `handleConvertToPurchase` | Function | `frontend/src/views/purchases/ShortagesTab.tsx` | 388 |
| `handleConvertToPurchaseSingle` | Function | `frontend/src/views/purchases/ShortagesTab.tsx` | 305 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `NewPurchaseTab → ToLocalDateString` | cross_community | 8 |
| `NewPurchaseTab → NormalizeDateRange` | cross_community | 7 |
| `NewPurchaseTab → GetMockProtectedActions` | cross_community | 6 |
| `NewPurchaseTab → EmitDataChanged` | cross_community | 6 |
| `NewPurchaseTab → GetAutoTopicsForAction` | cross_community | 6 |
| `NewPurchaseTab → SanitizeBridgeError` | cross_community | 5 |
| `HandleSavePurchase → ResolvePackSize` | cross_community | 4 |
| `NewPurchaseTab → GetDefaultTimeout` | cross_community | 4 |
| `HandleSavePurchase → CalculateLineTotal` | cross_community | 3 |
| `HandleSavePurchase → PackageLineGross` | cross_community | 3 |

## How to Explore

1. `context({name: "formatUnitWithBi"})` — see callers and callees
2. `query({search_query: "purchases"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
