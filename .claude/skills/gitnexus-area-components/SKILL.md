---
name: gitnexus-area-components
description: "Skill for the Components area of RAFIQ. 1141 symbols across 288 files."
---

# Components

1141 symbols | 288 files | Cohesion: 62%

## When to Use

- Working with code in `frontend/`
- Understanding how AppButton, BarcodeScannerSettingsModal, CertifiedHardwareModal work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/App.tsx` | Lazy, LazyView, checkUpdates, handleMinimizeWindow, onSelect (+51) |
| `frontend/src/components/UserManagerModal.tsx` | UserManagerModal, describeSubordinates, formatLastLogin, handleStartAdd, handleStartCredentials (+28) |
| `frontend/src/components/PackagingWizardModal.tsx` | PackagingWizardModal, buildRowsFromUnits, generateUniqueUnitId, handleAddLargerLevel, handleAddSmallerLevel (+14) |
| `frontend/src/utils/dateFilter.ts` | describeDateFilter, formatLocalDateTime, getDateFilterKey, getDateFilterRange, getDatePresetLabel (+11) |
| `frontend/src/components/ReturnModal.tsx` | handlePrintReceipt, Fact, QtyStepper, ReturnModal, addCatalogProductToDraft (+11) |
| `frontend/src/components/BackupManager.tsx` | BackupManager, buildConfigPayload, discard, fetchBackupStatus, fetchDrives (+11) |
| `frontend/src/views/ProductsView.tsx` | handleSaveProduct, ProductsView, loadEditingProductUnits, openEditModal, openPriceHistory (+10) |
| `frontend/src/views/wallets/WalletsView.tsx` | isAccountDirty, StepHeading, WalletsView, accountSelectOptions, fetchLiveDrawerCash (+9) |
| `frontend/src/components/MigrationWizardModal.tsx` | MigrationWizardModal, formatBytes, formatPiasters, handleCopyExportCode, handleFinish (+8) |
| `frontend/src/utils/money.ts` | formatArabicCurrency, formatDateTime, normalizeArabicNumerals, totalSaleDiscountPiasters, calculateDiscountAmount (+8) |

## Entry Points

Start here when exploring this area:

- **`AppButton`** (Function) — `frontend/src/components/AppButton.tsx:32`
- **`BarcodeScannerSettingsModal`** (Function) — `frontend/src/components/BarcodeScannerSettingsModal.tsx:75`
- **`CertifiedHardwareModal`** (Function) — `frontend/src/components/CertifiedHardwareModal.tsx:68`
- **`ConfirmModal`** (Function) — `frontend/src/components/ConfirmModal.tsx:18`
- **`DatabaseRecoveryModal`** (Function) — `frontend/src/components/DatabaseRecoveryModal.tsx:36`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ErrorBoundary` | Class | `frontend/src/components/ErrorBoundary.tsx` | 14 |
| `AppButton` | Function | `frontend/src/components/AppButton.tsx` | 32 |
| `BarcodeScannerSettingsModal` | Function | `frontend/src/components/BarcodeScannerSettingsModal.tsx` | 75 |
| `CertifiedHardwareModal` | Function | `frontend/src/components/CertifiedHardwareModal.tsx` | 68 |
| `ConfirmModal` | Function | `frontend/src/components/ConfirmModal.tsx` | 18 |
| `DatabaseRecoveryModal` | Function | `frontend/src/components/DatabaseRecoveryModal.tsx` | 36 |
| `formatBytes` | Function | `frontend/src/components/DatabaseRecoveryModal.tsx` | 49 |
| `DigitalPaymentModal` | Function | `frontend/src/components/DigitalPaymentModal.tsx` | 50 |
| `InstapayPaymentModal` | Function | `frontend/src/components/DigitalPaymentModal.tsx` | 360 |
| `WalletPaymentModal` | Function | `frontend/src/components/DigitalPaymentModal.tsx` | 364 |
| `DosageLabelModal` | Function | `frontend/src/components/DosageLabelModal.tsx` | 50 |
| `DrugInteractionManagerModal` | Function | `frontend/src/components/DrugInteractionManagerModal.tsx` | 31 |
| `getSeverityBadge` | Function | `frontend/src/components/DrugInteractionManagerModal.tsx` | 261 |
| `handleOpenEdit` | Function | `frontend/src/components/DrugInteractionManagerModal.tsx` | 118 |
| `DrugReferenceImportModal` | Function | `frontend/src/components/DrugReferenceImportModal.tsx` | 47 |
| `ExcelImportModal` | Function | `frontend/src/components/ExcelImportModal.tsx` | 44 |
| `ExpenseModal` | Function | `frontend/src/components/ExpenseModal.tsx` | 43 |
| `FactoryResetModal` | Function | `frontend/src/components/FactoryResetModal.tsx` | 27 |
| `FeatureGate` | Function | `frontend/src/components/FeatureGate.tsx` | 15 |
| `ForcedPinChangeForm` | Function | `frontend/src/components/ForcedPinChangeForm.tsx` | 18 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RootStatusPage → ToLocalDateString` | cross_community | 9 |
| `RootStatusPage → NormalizeDateRange` | cross_community | 8 |
| `DataQualityAuditModal → ToLocalDateString` | cross_community | 8 |
| `DemoDataModal → ToLocalDateString` | cross_community | 8 |
| `DrugReferenceImportModal → ToLocalDateString` | cross_community | 8 |
| `ExpiryReturnsModal → ToLocalDateString` | cross_community | 8 |
| `HeldSalesModal → ToLocalDateString` | cross_community | 8 |
| `MigrationWizardModal → ToLocalDateString` | cross_community | 8 |
| `PharmacyStocktakingModal → ToLocalDateString` | cross_community | 8 |
| `SpecializedPharmacyReportsModal → ToLocalDateString` | cross_community | 8 |

## How to Explore

1. `context({name: "AppButton"})` — see callers and callees
2. `query({search_query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
