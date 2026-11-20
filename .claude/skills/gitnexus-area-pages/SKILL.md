---
name: gitnexus-area-pages
description: "Skill for the Pages area of RAFIQ. 42 symbols across 4 files."
---

# Pages

42 symbols | 4 files | Cohesion: 57%

## When to Use

- Working with code in `online-store/`
- Understanding how commitProductsUpdate, handleAddProductImageUrl, handleBatchSaveProductDescriptions work
- Modifying pages-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `online-store/web/src/pages/AdminDashboardPage.tsx` | commitProductsUpdate, handleAddProductImageUrl, handleBatchSaveProductDescriptions, onUndo, handleBulkUpdateProducts (+23) |
| `online-store/web/src/api/client.ts` | addProductImageUrl, batchUpdateDashboardProducts, bulkUpdateDashboardProductsVisibility, bulkUpdateDashboardCategoriesVisibility, deleteProductImage (+6) |
| `online-store/web/src/utils/imageCompressor.ts` | compressProductImage, toBlob |
| `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | triggerUndo |

## Entry Points

Start here when exploring this area:

- **`commitProductsUpdate`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:526`
- **`handleAddProductImageUrl`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:887`
- **`handleBatchSaveProductDescriptions`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:1236`
- **`onUndo`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:1270`
- **`handleBulkUpdateProducts`** (Function) — `online-store/web/src/pages/AdminDashboardPage.tsx:1108`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `commitProductsUpdate` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 526 |
| `handleAddProductImageUrl` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 887 |
| `handleBatchSaveProductDescriptions` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1236 |
| `onUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1270 |
| `handleBulkUpdateProducts` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1108 |
| `onUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1355 |
| `triggerUndo` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 484 |
| `handleBulkToggleCategoriesVisibility` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1067 |
| `applyUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1081 |
| `applyUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1142 |
| `applyUndo` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 980 |
| `registerUndoAction` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 491 |
| `clearOwnerSession` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 328 |
| `handleDeleteProductImage` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 935 |
| `handleSaveProductDescription` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1212 |
| `handleToggleProductFeatured` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1184 |
| `handleToggleProductVisibility` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 965 |
| `commitCategoriesUpdate` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 518 |
| `handleSmartPublishCatalog` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1294 |
| `handleToggleCategoryVisibility` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 1011 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleUploadProductImage → ToBlob` | intra_community | 3 |
| `HandleAddProductImageUrl → OwnerAuthError` | cross_community | 3 |
| `HandleBatchSaveProductDescriptions → OwnerAuthError` | cross_community | 3 |
| `OnUndo → OwnerAuthError` | cross_community | 3 |
| `HandleBulkToggleCategoriesVisibility → OwnerAuthError` | cross_community | 3 |
| `HandleBulkUpdateProducts → OwnerAuthError` | cross_community | 3 |
| `ApplyUndo → OwnerAuthError` | cross_community | 3 |
| `HandleDeleteProductImage → OwnerAuthError` | cross_community | 3 |
| `HandleSaveProductDescription → OwnerAuthError` | cross_community | 3 |
| `HandleSmartPublishCatalog → OwnerAuthError` | cross_community | 3 |

## How to Explore

1. `context({name: "commitProductsUpdate"})` — see callers and callees
2. `query({search_query: "pages"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
