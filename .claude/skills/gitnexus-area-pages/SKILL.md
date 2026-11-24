---
name: gitnexus-area-pages
description: "Skill for the Pages area of RAFIQ. 48 symbols across 6 files."
---

# Pages

48 symbols | 6 files | Cohesion: 52%

## When to Use

- Working with code in `online-store/`
- Understanding how commitProductsUpdate, handleAddProductImageUrl, handleBatchSaveProductDescriptions work
- Modifying pages-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `online-store/web/src/pages/AdminDashboardPage.tsx` | commitProductsUpdate, handleAddProductImageUrl, handleBatchSaveProductDescriptions, onUndo, handleBulkUpdateProducts (+26) |
| `online-store/web/src/api/client.ts` | addProductImageUrl, batchUpdateDashboardProducts, bulkUpdateDashboardProductsVisibility, getRealtimeWebSocketUrl, bulkUpdateDashboardCategoriesVisibility (+7) |
| `online-store/web/src/utils/imageCompressor.ts` | compressProductImage, toBlob |
| `online-store/web/src/components/admin/AdminLoginScreen.tsx` | AdminLoginScreen |
| `online-store/web/src/components/admin/OrderPrintReceipt.tsx` | OrderPrintReceipt |
| `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | triggerUndo |

## Entry Points

Start here when exploring this area:

- **`commitProductsUpdate`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:544`
- **`handleAddProductImageUrl`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:927`
- **`handleBatchSaveProductDescriptions`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:1276`
- **`onUndo`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:1310`
- **`handleBulkUpdateProducts`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:1148`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `commitProductsUpdate` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 544 |
| `handleAddProductImageUrl` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 927 |
| `handleBatchSaveProductDescriptions` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1276 |
| `onUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1310 |
| `handleBulkUpdateProducts` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1148 |
| `onUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1395 |
| `AdminLoginScreen` | Function | `online-store/web/src/components/admin/AdminLoginScreen.tsx` | 31 |
| `OrderPrintReceipt` | Function | `online-store/web/src/components/admin/OrderPrintReceipt.tsx` | 39 |
| `AdminDashboardPage` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 304 |
| `connectRealtime` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 693 |
| `setActiveTab` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 370 |
| `setSidebarCollapsed` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 360 |
| `triggerUndo` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 485 |
| `handleBulkToggleCategoriesVisibility` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1107 |
| `applyUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1121 |
| `applyUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1182 |
| `applyUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1020 |
| `registerUndoAction` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 509 |
| `clearOwnerSession` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 340 |
| `handleDeleteProductImage` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 975 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AdminDashboardPage → ToIsoDateLocal` | cross_community | 3 |
| `AdminDashboardPage → FormatUnitArabic` | cross_community | 3 |
| `HandleUploadProductImage → ToBlob` | intra_community | 3 |
| `HandleAddProductImageUrl → OwnerAuthError` | cross_community | 3 |
| `HandleBatchSaveProductDescriptions → OwnerAuthError` | cross_community | 3 |
| `OnUndo → OwnerAuthError` | cross_community | 3 |
| `HandleBulkToggleCategoriesVisibility → OwnerAuthError` | cross_community | 3 |
| `HandleBulkUpdateProducts → OwnerAuthError` | cross_community | 3 |
| `ApplyUndo → OwnerAuthError` | cross_community | 3 |
| `HandleDeleteProductImage → OwnerAuthError` | cross_community | 3 |

## How to Explore

1. `context({name: "commitProductsUpdate"})` — see callers and callees
2. `query({search_query: "pages"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
