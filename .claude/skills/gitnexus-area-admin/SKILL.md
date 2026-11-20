---
name: gitnexus-area-admin
description: "Skill for the Admin area of RAFIQ. 75 symbols across 18 files."
---

# Admin

75 symbols | 18 files | Cohesion: 76%

## When to Use

- Working with code in `online-store/`
- Understanding how AdminLoginScreen, AdminTopHeader, OrderPrintReceipt work
- Modifying admin-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | ProductsManagerPanel, executeBulkProductAction, requestAllCategoriesToggle, requestCategoryToggle, setLayout (+8) |
| `online-store/web/src/components/admin/CustomDatePicker.tsx` | CustomDatePicker, handleScroll, initialDate, updateCoords, CustomDateRangePicker (+6) |
| `online-store/web/src/components/admin/AnalyticsOverviewPanel.tsx` | AnalyticsOverviewPanel, formatCompactEgp, formatHourLabel, formatLastSync, formatMoneyEgp (+6) |
| `online-store/web/src/pages/AdminDashboardPage.tsx` | AdminDashboardPage, connectRealtime, setActiveTab, setSidebarCollapsed, buildInitialDemoOrders (+1) |
| `online-store/web/src/utils/smartDescriptionGenerator.ts` | detectEnvironmentStoreType, extractProductSpecs, generateSmartDescriptionOptions, matchKeyword, resolveEffectiveActivityType (+1) |
| `online-store/web/src/components/admin/SingleDescriptionModal.tsx` | SingleDescriptionModal, handleRegenerate, handleSave, handleToneChange |
| `online-store/web/src/components/admin/BulkDescriptionModal.tsx` | BulkDescriptionModal, handleRegenerateAll, handleSaveAll, handleTextChange |
| `online-store/web/src/components/admin/OrderDetailsPanel.tsx` | OrderDetailsPanel, getStepIndex, getWhatsAppUrl, toggleItemChecked |
| `online-store/web/src/components/admin/ThemeStudioPanel.tsx` | ThemeStudioPanel, handleCornerChange, handleLayoutChange |
| `online-store/web/src/components/admin/StoreSettingsPanel.tsx` | StoreSettingsPanel, handleAddZoneSubmit, handlePinSubmit |

## Entry Points

Start here when exploring this area:

- **`AdminLoginScreen`** (Function) — `online-store/web/src/components/admin/AdminLoginScreen.tsx:31`
- **`AdminTopHeader`** (Function) — `online-store/web/src/components/admin/AdminTopHeader.tsx:71`
- **`OrderPrintReceipt`** (Function) — `online-store/web/src/components/admin/OrderPrintReceipt.tsx:39`
- **`ThemeStudioPanel`** (Function) — `online-store/web/src/components/admin/ThemeStudioPanel.tsx:44`
- **`handleCornerChange`** (Function) — `online-store/web/src/components/admin/ThemeStudioPanel.tsx:76`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AdminLoginScreen` | Function | `online-store/web/src/components/admin/AdminLoginScreen.tsx` | 31 |
| `AdminTopHeader` | Function | `online-store/web/src/components/admin/AdminTopHeader.tsx` | 71 |
| `OrderPrintReceipt` | Function | `online-store/web/src/components/admin/OrderPrintReceipt.tsx` | 39 |
| `ThemeStudioPanel` | Function | `online-store/web/src/components/admin/ThemeStudioPanel.tsx` | 44 |
| `handleCornerChange` | Function | `online-store/web/src/components/admin/ThemeStudioPanel.tsx` | 76 |
| `handleLayoutChange` | Function | `online-store/web/src/components/admin/ThemeStudioPanel.tsx` | 68 |
| `AdminDashboardPage` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 294 |
| `connectRealtime` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 653 |
| `setActiveTab` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 358 |
| `setSidebarCollapsed` | Function | `online-store/web/src/pages/AdminDashboardPage.tsx` | 348 |
| `ProductPhotosModal` | Function | `online-store/web/src/components/admin/ProductPhotosModal.tsx` | 27 |
| `ProductsManagerPanel` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 93 |
| `executeBulkProductAction` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 460 |
| `requestAllCategoriesToggle` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 441 |
| `requestCategoryToggle` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 422 |
| `setLayout` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 131 |
| `toggleCategoryRail` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 158 |
| `toggleSelectItem` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 395 |
| `SmartPublishModal` | Function | `online-store/web/src/components/admin/SmartPublishModal.tsx` | 37 |
| `handleConfirm` | Function | `online-store/web/src/components/admin/SmartPublishModal.tsx` | 51 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProductsManagerPanel → DetectEnvironmentStoreType` | cross_community | 6 |
| `ProductsManagerPanel → MatchKeyword` | cross_community | 6 |
| `ProductsManagerPanel → ExtractProductSpecs` | cross_community | 5 |
| `AdminDashboardPage → OwnerAuthError` | cross_community | 5 |
| `AdminDashboardPage → FetchPage` | cross_community | 4 |
| `AdminDashboardPage → GetDashboardCategories` | cross_community | 3 |
| `AdminDashboardPage → GetDashboardOrders` | cross_community | 3 |
| `AdminDashboardPage → GetDashboardOverview` | cross_community | 3 |
| `ProductsManagerPanel → HandleSaveAll` | cross_community | 3 |
| `ProductsManagerPanel → HandleTextChange` | cross_community | 3 |

## How to Explore

1. `context({name: "AdminLoginScreen"})` — see callers and callees
2. `query({search_query: "admin"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
