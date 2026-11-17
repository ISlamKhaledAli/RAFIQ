---
name: gitnexus-area-bridge
description: "Skill for the Bridge area of RAFIQ. 69 symbols across 15 files."
---

# Bridge

69 symbols | 15 files | Cohesion: 67%

## When to Use

- Working with code in `desktop/`
- Understanding how BridgeError, BridgeResponse, RecoveryVoucherRequest work
- Modifying bridge-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/bridge/ipc.ts` | buildMockShiftSummary, createMockShift, getMockAppSettings, getMockFeatureFlags, getMockPermissionsForRole (+17) |
| `desktop/Bridge/IpcDispatcher.System.cs` | EffectiveRootOnlyValue, IsCurrentUserRoot, IsProtectedSettingKey, IsRootOnlySettingKey, RemoveProtectedSettingKeys (+2) |
| `desktop/Bridge/IpcDispatcher.Printing.cs` | HandlePrintReceipt, HandlePrintRecoveryVoucher, ReadPayloadBool, ReadPayloadString, ToPrintResponse (+1) |
| `desktop/Bridge/IpcDispatcher.ReportFiles.cs` | HandleOpenReportsFolder, HandleSaveReceiptImage, HandleSaveReportFile, HandleSaveReportPdf, ToSaveResponse (+1) |
| `desktop/Bridge/IpcDispatcher.cs` | HandleCorruptDatabaseSession, CheckFeatureGate, IsLicenseBlockedAction, NormalizeActionName, SplitCamelWords (+1) |
| `desktop/Bridge/BridgeModels.cs` | BridgeError, BridgeResponse, Fail, Ok |
| `desktop/Services/SettingsService.cs` | IsSignatureSettingKey, UiMotionRootOnlyMessageFor, IsFeatureEnabled |
| `desktop/Bridge/IpcDispatcher.Backup.cs` | GetFilePickerLocations, ScanFolderForPackages, ScanKnownLocationsForPackages |
| `desktop/Common/FeatureRegistry.cs` | GetDefinition, GetFeatureForCommand, IsHistoricalOrReadCommand |
| `desktop/Services/StoreTemplateService.cs` | ResetFirstRun, IsFirstRunNeeded |

## Entry Points

Start here when exploring this area:

- **`BridgeError`** (Class) — `desktop/Bridge/BridgeModels.cs:52`
- **`BridgeResponse`** (Class) — `desktop/Bridge/BridgeModels.cs:17`
- **`RecoveryVoucherRequest`** (Class) — `desktop/Services/PrinterService.cs:42`
- **`Fail`** (Method) — `desktop/Bridge/BridgeModels.cs:41`
- **`Ok`** (Method) — `desktop/Bridge/BridgeModels.cs:31`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BridgeError` | Class | `desktop/Bridge/BridgeModels.cs` | 52 |
| `BridgeResponse` | Class | `desktop/Bridge/BridgeModels.cs` | 17 |
| `RecoveryVoucherRequest` | Class | `desktop/Services/PrinterService.cs` | 42 |
| `Fail` | Method | `desktop/Bridge/BridgeModels.cs` | 41 |
| `Ok` | Method | `desktop/Bridge/BridgeModels.cs` | 31 |
| `GetSaleById` | Method | `desktop/Services/SaleService.cs` | 1536 |
| `ResetFirstRun` | Method | `desktop/Services/StoreTemplateService.cs` | 38 |
| `IsRetentionSettingKey` | Method | `desktop/Services/BackupService.cs` | 91 |
| `IsSignatureSettingKey` | Method | `desktop/Services/SettingsService.cs` | 210 |
| `UiMotionRootOnlyMessageFor` | Method | `desktop/Services/SettingsService.cs` | 107 |
| `List_BlankConfiguredFolder_ListsTheDefaultFolderLikeCreateBackupDoes` | Method | `desktop/RafiqPOS.Tests/Scenarios/S64_BackupListVerifyRestoreTest.cs` | 144 |
| `List_MissingConfiguredFolder_IsReportedAsUnavailable_AndListsTheLocalFallbackFolder` | Method | `desktop/RafiqPOS.Tests/Scenarios/S64_BackupListVerifyRestoreTest.cs` | 132 |
| `GetDefaultBackupFolder` | Method | `desktop/Services/BackupService.cs` | 326 |
| `GetDefinition` | Method | `desktop/Common/FeatureRegistry.cs` | 666 |
| `GetFeatureForCommand` | Method | `desktop/Common/FeatureRegistry.cs` | 677 |
| `IsHistoricalOrReadCommand` | Method | `desktop/Common/FeatureRegistry.cs` | 692 |
| `IsFeatureEnabled` | Method | `desktop/Services/SettingsService.cs` | 623 |
| `IsFirstRunNeeded` | Method | `desktop/Services/StoreTemplateService.cs` | 32 |
| `buildMockShiftSummary` | Function | `frontend/src/bridge/ipc.ts` | 5346 |
| `createMockShift` | Function | `frontend/src/bridge/ipc.ts` | 5297 |

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

1. `context({name: "BridgeError"})` — see callers and callees
2. `query({search_query: "bridge"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
