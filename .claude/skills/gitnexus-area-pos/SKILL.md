---
name: gitnexus-area-pos
description: "Skill for the Pos area of RAFIQ. 34 symbols across 8 files."
---

# Pos

34 symbols | 8 files | Cohesion: 60%

## When to Use

- Working with code in `frontend/`
- Understanding how fetchAllDeliveryData, handleAddRider, handleAddZone work
- Modifying pos-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/views/pos/DeliveryCommandModal.tsx` | fetchAllDeliveryData, handleAddRider, handleAddZone, handleAssignRiderToOrder, handleChangeOrderStatus (+3) |
| `frontend/src/views/pos/heldSalePricing.ts` | isLegacyHeldCart, resolveHeldInvoiceDiscount, stripHeldCartMarker, currentCatalogUnitPrice, findHeldPriceChanges (+3) |
| `frontend/src/views/pos/FloorTablesModal.tsx` | fetchTables, handleCloseFreeTable, handleDeleteFloorTable, handleMergeTables, handlePrintPreBill (+2) |
| `frontend/src/views/pos/DrugAlternativesDrawer.tsx` | DrugAlternativesDrawer, checkExistingShortage, formatUnitLabel, handleAction, loadAlternatives |
| `frontend/src/views/PosView.tsx` | handleRecallHeldSale, lookupProductsByIds |
| `frontend/src/views/pos/popularItems.ts` | byName, pickPopularItems |
| `frontend/src/views/pos/catalogLoad.ts` | collectProductIds |
| `frontend/src/views/pos/usePosCatalog.ts` | popularSelection |

## Entry Points

Start here when exploring this area:

- **`fetchAllDeliveryData`** (Function) — `frontend/src/views/pos/DeliveryCommandModal.tsx:92`
- **`handleAddRider`** (Function) — `frontend/src/views/pos/DeliveryCommandModal.tsx:284`
- **`handleAddZone`** (Function) — `frontend/src/views/pos/DeliveryCommandModal.tsx:253`
- **`handleAssignRiderToOrder`** (Function) — `frontend/src/views/pos/DeliveryCommandModal.tsx:209`
- **`handleChangeOrderStatus`** (Function) — `frontend/src/views/pos/DeliveryCommandModal.tsx:222`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `fetchAllDeliveryData` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 92 |
| `handleAddRider` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 284 |
| `handleAddZone` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 253 |
| `handleAssignRiderToOrder` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 209 |
| `handleChangeOrderStatus` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 222 |
| `handleDeleteRider` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 309 |
| `handleDeleteZone` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 275 |
| `handleExecuteRiderSettlement` | Function | `frontend/src/views/pos/DeliveryCommandModal.tsx` | 235 |
| `fetchTables` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 75 |
| `handleCloseFreeTable` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 284 |
| `handleDeleteFloorTable` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 329 |
| `handleMergeTables` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 214 |
| `handlePrintPreBill` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 175 |
| `handleSaveFloorTable` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 300 |
| `handleTransferTable` | Function | `frontend/src/views/pos/FloorTablesModal.tsx` | 190 |
| `handleRecallHeldSale` | Function | `frontend/src/views/PosView.tsx` | 1197 |
| `lookupProductsByIds` | Function | `frontend/src/views/PosView.tsx` | 1174 |
| `collectProductIds` | Function | `frontend/src/views/pos/catalogLoad.ts` | 92 |
| `isLegacyHeldCart` | Function | `frontend/src/views/pos/heldSalePricing.ts` | 117 |
| `resolveHeldInvoiceDiscount` | Function | `frontend/src/views/pos/heldSalePricing.ts` | 134 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleConfirmWeight → ToLocalDateString` | cross_community | 8 |
| `HandleRecallHeldSale → ToLocalDateString` | cross_community | 8 |
| `HandleConfirmWeight → NormalizeDateRange` | cross_community | 7 |
| `HandleRecallHeldSale → NormalizeDateRange` | cross_community | 7 |
| `HandleConfirmWeight → EmitDataChanged` | cross_community | 6 |
| `HandleConfirmWeight → GetMockProtectedActions` | cross_community | 6 |
| `HandleConfirmWeight → GetAutoTopicsForAction` | cross_community | 6 |
| `HandleRecallHeldSale → GetMockProtectedActions` | cross_community | 6 |
| `HandleRecallHeldSale → EmitDataChanged` | cross_community | 6 |
| `HandleRecallHeldSale → GetAutoTopicsForAction` | cross_community | 6 |

## How to Explore

1. `context({name: "fetchAllDeliveryData"})` — see callers and callees
2. `query({search_query: "pos"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
