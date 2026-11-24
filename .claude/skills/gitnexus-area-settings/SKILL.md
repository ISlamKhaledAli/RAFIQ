---
name: gitnexus-area-settings
description: "Skill for the Settings area of RAFIQ. 56 symbols across 14 files."
---

# Settings

56 symbols | 14 files | Cohesion: 64%

## When to Use

- Working with code in `frontend/`
- Understanding how ReceiptPaper, UnsavedChangesChip, buildSampleReceiptSale work
- Modifying settings-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/views/settings/InvoiceTemplatesTab.tsx` | InvoiceTemplatesTab, handleTestPrint, updateCurrentConfig, BarcodeSnippet, mm (+6) |
| `frontend/src/utils/thermalImageOptimizer.ts` | applyFloydSteinbergDither, autoLevelPixels, calculatePerceivedLuma, detectImageComplexity, findLogoContentBounds (+4) |
| `frontend/src/utils/receiptLayout.ts` | buildSampleReceiptSale, layoutReceiptTable, normalizeReceiptText, receiptTextLimitError, resolveReceiptFooter (+3) |
| `frontend/src/views/settings/SalesPoliciesTab.tsx` | SalesPoliciesTab, fetchUntaxedCount, handleBulkApplyTax, handleIdleTimeoutChange, handleToggleMandatoryField |
| `frontend/src/views/SettingsView.tsx` | SettingsView, SettingsViewContent, handleSave, save |
| `frontend/src/views/settings/StoreProfileTab.tsx` | StoreProfileTab, handleLogoUpload, handleModeChange, handleToggleThermalSim |
| `frontend/src/views/root/RootReceiptPage.tsx` | RootReceiptPage, handleSave, save |
| `frontend/src/views/settings/settingsParts.tsx` | ReceiptTextField, ToggleRow, Field |
| `frontend/src/components/ReceiptPaper.tsx` | ReceiptPaper, Rows |
| `frontend/src/views/settings/usePrinterExtras.ts` | usePrinterExtras, reload |

## Entry Points

Start here when exploring this area:

- **`ReceiptPaper`** (Function) — `frontend/src/components/ReceiptPaper.tsx:106`
- **`UnsavedChangesChip`** (Function) — `frontend/src/components/UnsavedChangesChip.tsx:6`
- **`buildSampleReceiptSale`** (Function) — `frontend/src/utils/receiptLayout.ts:1059`
- **`layoutReceiptTable`** (Function) — `frontend/src/utils/receiptLayout.ts:764`
- **`normalizeReceiptText`** (Function) — `frontend/src/utils/receiptLayout.ts:328`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ReceiptPaper` | Function | `frontend/src/components/ReceiptPaper.tsx` | 106 |
| `UnsavedChangesChip` | Function | `frontend/src/components/UnsavedChangesChip.tsx` | 6 |
| `buildSampleReceiptSale` | Function | `frontend/src/utils/receiptLayout.ts` | 1059 |
| `layoutReceiptTable` | Function | `frontend/src/utils/receiptLayout.ts` | 764 |
| `normalizeReceiptText` | Function | `frontend/src/utils/receiptLayout.ts` | 328 |
| `receiptTextLimitError` | Function | `frontend/src/utils/receiptLayout.ts` | 353 |
| `resolveReceiptFooter` | Function | `frontend/src/utils/receiptLayout.ts` | 514 |
| `resolveReceiptSignature` | Function | `frontend/src/utils/receiptLayout.ts` | 521 |
| `splitReceiptText` | Function | `frontend/src/utils/receiptLayout.ts` | 347 |
| `resolveSettingsSubTab` | Function | `frontend/src/utils/settingsAccess.ts` | 25 |
| `SettingsView` | Function | `frontend/src/views/SettingsView.tsx` | 711 |
| `RootReceiptPage` | Function | `frontend/src/views/root/RootReceiptPage.tsx` | 77 |
| `handleSave` | Function | `frontend/src/views/root/RootReceiptPage.tsx` | 142 |
| `save` | Function | `frontend/src/views/root/RootReceiptPage.tsx` | 170 |
| `InvoiceTemplatesTab` | Function | `frontend/src/views/settings/InvoiceTemplatesTab.tsx` | 207 |
| `handleTestPrint` | Function | `frontend/src/views/settings/InvoiceTemplatesTab.tsx` | 328 |
| `updateCurrentConfig` | Function | `frontend/src/views/settings/InvoiceTemplatesTab.tsx` | 273 |
| `StoreProfileTab` | Function | `frontend/src/views/settings/StoreProfileTab.tsx` | 140 |
| `ReceiptTextField` | Function | `frontend/src/views/settings/settingsParts.tsx` | 24 |
| `ToggleRow` | Function | `frontend/src/views/settings/settingsParts.tsx` | 123 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `StoreProfileTab → ToLocalDateString` | cross_community | 8 |
| `StoreProfileTab → NormalizeDateRange` | cross_community | 7 |
| `RootReceiptPage → ToLocalDateString` | cross_community | 7 |
| `SalesPoliciesTab → ToLocalDateString` | cross_community | 7 |
| `StoreProfileTab → GetMockProtectedActions` | cross_community | 6 |
| `StoreProfileTab → EmitDataChanged` | cross_community | 6 |
| `StoreProfileTab → GetAutoTopicsForAction` | cross_community | 6 |
| `RootReceiptPage → NormalizeDateRange` | cross_community | 6 |
| `SalesPoliciesTab → NormalizeDateRange` | cross_community | 6 |
| `StoreProfileTab → SanitizeBridgeError` | cross_community | 5 |

## How to Explore

1. `context({name: "ReceiptPaper"})` — see callers and callees
2. `query({search_query: "settings"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
