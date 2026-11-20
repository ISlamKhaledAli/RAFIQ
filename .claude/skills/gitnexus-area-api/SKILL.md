---
name: gitnexus-area-api
description: "Skill for the Api area of RAFIQ. 45 symbols across 10 files."
---

# Api

45 symbols | 10 files | Cohesion: 78%

## When to Use

- Working with code in `online-store/`
- Understanding how App, loadData, fetchFilteredFirstPage work
- Modifying api-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `online-store/web/src/api/client.ts` | StoreUnavailableError, createOrder, getCategories, getProducts, getProductsPage (+11) |
| `online-store/web/src/App.tsx` | App, loadData, fetchFilteredFirstPage, handleLoadMoreProducts, navigateToView (+5) |
| `online-store/web/src/pages/AdminDashboardPage.tsx` | refreshOrdersQuick, safetyTimer, handleAnalyticsRangeChange, handleChangePin, handleSaveStoreSettings (+3) |
| `online-store/web/src/utils/documentMeta.ts` | applyDocumentBranding, upsertLinkTag, upsertMetaTag |
| `online-store/web/src/components/CategoryPills.tsx` | CategoryPills, getCategoryIcon |
| `online-store/web/src/components/ProductCard.tsx` | ProductCard, renderCategoryPlaceholderIcon |
| `online-store/web/src/components/FloatingCartBar.tsx` | FloatingCartBar |
| `online-store/web/src/components/Header.tsx` | Header |
| `online-store/web/src/components/Toast.tsx` | Toast |
| `online-store/web/src/components/admin/audioChime.ts` | playOrderChime |

## Entry Points

Start here when exploring this area:

- **`App`** (Function) — `online-store/web/src/App.tsx:90`
- **`loadData`** (Function) — `online-store/web/src/App.tsx:359`
- **`fetchFilteredFirstPage`** (Function) — `online-store/web/src/App.tsx:450`
- **`handleLoadMoreProducts`** (Function) — `online-store/web/src/App.tsx:481`
- **`navigateToView`** (Function) — `online-store/web/src/App.tsx:242`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `StoreUnavailableError` | Class | `online-store/web/src/api/client.ts` | 207 |
| `OwnerAuthError` | Class | `online-store/web/src/api/client.ts` | 312 |
| `App` | Function | `online-store/web/src/App.tsx` | 90 |
| `loadData` | Function | `online-store/web/src/App.tsx` | 359 |
| `fetchFilteredFirstPage` | Function | `online-store/web/src/App.tsx` | 450 |
| `handleLoadMoreProducts` | Function | `online-store/web/src/App.tsx` | 481 |
| `navigateToView` | Function | `online-store/web/src/App.tsx` | 242 |
| `CategoryPills` | Function | `online-store/web/src/components/CategoryPills.tsx` | 10 |
| `getCategoryIcon` | Function | `online-store/web/src/components/CategoryPills.tsx` | 16 |
| `FloatingCartBar` | Function | `online-store/web/src/components/FloatingCartBar.tsx` | 9 |
| `Header` | Function | `online-store/web/src/components/Header.tsx` | 17 |
| `ProductCard` | Function | `online-store/web/src/components/ProductCard.tsx` | 48 |
| `Toast` | Function | `online-store/web/src/components/Toast.tsx` | 10 |
| `applyDocumentBranding` | Function | `online-store/web/src/utils/documentMeta.ts` | 94 |
| `fetchPage` | Function | `online-store/web/src/api/client.ts` | 908 |
| `playOrderChime` | Function | `online-store/web/src/components/admin/audioChime.ts` | 4 |
| `refreshOrdersQuick` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 634 |
| `safetyTimer` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 741 |
| `handleAnalyticsRangeChange` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 598 |
| `handleChangePin` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 823 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AdminDashboardPage → OwnerAuthError` | cross_community | 5 |
| `AdminDashboardPage → FetchPage` | cross_community | 4 |
| `AdminDashboardPage → GetDashboardCategories` | cross_community | 3 |
| `AdminDashboardPage → GetDashboardOrders` | cross_community | 3 |
| `AdminDashboardPage → GetDashboardOverview` | cross_community | 3 |
| `LoadLiveCloudDashboard → FetchPage` | intra_community | 3 |
| `HandleAddProductImageUrl → OwnerAuthError` | cross_community | 3 |
| `HandleBatchSaveProductDescriptions → OwnerAuthError` | cross_community | 3 |
| `OnUndo → OwnerAuthError` | cross_community | 3 |
| `HandleBulkToggleCategoriesVisibility → OwnerAuthError` | cross_community | 3 |

## How to Explore

1. `context({name: "App"})` — see callers and callees
2. `query({search_query: "api"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
