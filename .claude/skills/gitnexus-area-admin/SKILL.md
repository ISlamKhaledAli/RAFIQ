---
name: gitnexus-area-admin
description: "Skill for the Admin area of RAFIQ. 96 symbols across 19 files."
---

# Admin

96 symbols | 19 files | Cohesion: 79%

## When to Use

- Working with code in `online-store/`
- Understanding how isRollPaper, printReport, resolvePrintMode work
- Modifying admin-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/utils/printReport.ts` | collectStyleText, getPrinterStatus, print, enterPrintLayout, cleanup (+10) |
| `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | ProductsManagerPanel, executeBulkProductAction, requestAllCategoriesToggle, requestCategoryToggle, setLayout (+8) |
| `online-store/web/src/components/admin/CustomDatePicker.tsx` | CustomDatePicker, handleScroll, initialDate, updateCoords, CustomDateRangePicker (+6) |
| `online-store/web/src/components/admin/AnalyticsOverviewPanel.tsx` | AnalyticsOverviewPanel, formatCompactEgp, formatHourLabel, formatLastSync, formatMoneyEgp (+6) |
| `online-store/web/src/components/admin/audioChime.ts` | releaseScreenWakeLock, getAudioContext, unlockHandler, playOrderChime, playStatusPing (+5) |
| `online-store/web/src/utils/smartDescriptionGenerator.ts` | detectEnvironmentStoreType, extractProductSpecs, generateSmartDescriptionOptions, matchKeyword, resolveEffectiveActivityType (+1) |
| `online-store/web/src/components/admin/SingleDescriptionModal.tsx` | SingleDescriptionModal, handleRegenerate, handleSave, handleToneChange |
| `online-store/web/src/components/admin/BulkDescriptionModal.tsx` | BulkDescriptionModal, handleRegenerateAll, handleSaveAll, handleTextChange |
| `online-store/web/src/components/admin/OrderDetailsPanel.tsx` | OrderDetailsPanel, getStepIndex, getWhatsAppUrl, toggleItemChecked |
| `online-store/web/src/components/admin/ThemeStudioPanel.tsx` | ThemeStudioPanel, handleCornerChange, handleLayoutChange, handleToggleFeature |

## Entry Points

Start here when exploring this area:

- **`isRollPaper`** (Function) — `frontend/src/utils/printReport.ts:43`
- **`printReport`** (Function) — `frontend/src/utils/printReport.ts:261`
- **`resolvePrintMode`** (Function) — `frontend/src/utils/printReport.ts:53`
- **`releaseScreenWakeLock`** (Function) — `online-store/web/src/components/admin/audioChime.ts:278`
- **`ProductPhotosModal`** (Function) — `online-store/web/src/components/admin/ProductPhotosModal.tsx:27`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isRollPaper` | Function | `frontend/src/utils/printReport.ts` | 43 |
| `printReport` | Function | `frontend/src/utils/printReport.ts` | 261 |
| `resolvePrintMode` | Function | `frontend/src/utils/printReport.ts` | 53 |
| `releaseScreenWakeLock` | Function | `online-store/web/src/components/admin/audioChime.ts` | 278 |
| `ProductPhotosModal` | Function | `online-store/web/src/components/admin/ProductPhotosModal.tsx` | 27 |
| `ProductsManagerPanel` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 94 |
| `executeBulkProductAction` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 461 |
| `requestAllCategoriesToggle` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 442 |
| `requestCategoryToggle` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 423 |
| `setLayout` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 132 |
| `toggleCategoryRail` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 159 |
| `toggleSelectItem` | Function | `online-store/web/src/components/admin/ProductsManagerPanel.tsx` | 396 |
| `SmartPublishModal` | Function | `online-store/web/src/components/admin/SmartPublishModal.tsx` | 37 |
| `handleConfirm` | Function | `online-store/web/src/components/admin/SmartPublishModal.tsx` | 51 |
| `SingleDescriptionModal` | Function | `online-store/web/src/components/admin/SingleDescriptionModal.tsx` | 28 |
| `handleRegenerate` | Function | `online-store/web/src/components/admin/SingleDescriptionModal.tsx` | 62 |
| `handleSave` | Function | `online-store/web/src/components/admin/SingleDescriptionModal.tsx` | 69 |
| `handleToneChange` | Function | `online-store/web/src/components/admin/SingleDescriptionModal.tsx` | 55 |
| `detectEnvironmentStoreType` | Function | `online-store/web/src/utils/smartDescriptionGenerator.ts` | 137 |
| `generateSmartDescriptionOptions` | Function | `online-store/web/src/utils/smartDescriptionGenerator.ts` | 253 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProductsManagerPanel → DetectEnvironmentStoreType` | cross_community | 5 |
| `ProductsManagerPanel → MatchKeyword` | cross_community | 5 |
| `ProductsManagerPanel → ExtractProductSpecs` | cross_community | 4 |
| `HandleEnableMobileNotifications → GetAudioContext` | cross_community | 4 |
| `ProductsManagerPanel → HandleToneChange` | cross_community | 3 |
| `ProductsManagerPanel → HandleConfirm` | intra_community | 3 |
| `AdminDashboardPage → ToIsoDateLocal` | cross_community | 3 |
| `HandleEnableMobileNotifications → DispatchOrderSystemNotification` | intra_community | 3 |
| `HandleEnableMobileNotifications → TriggerOrderVibration` | cross_community | 3 |
| `HandleUpdateOrderStatus → GetAudioContext` | intra_community | 3 |

## How to Explore

1. `context({name: "isRollPaper"})` — see callers and callees
2. `query({search_query: "admin"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
