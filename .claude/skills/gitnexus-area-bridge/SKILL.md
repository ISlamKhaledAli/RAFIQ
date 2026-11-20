---
name: gitnexus-area-bridge
description: "Skill for the Bridge area of RAFIQ. 81 symbols across 22 files."
---

# Bridge

81 symbols | 22 files | Cohesion: 66%

## When to Use

- Working with code in `desktop/`
- Understanding how convertOnlineOrderToSale, printPosSaleReceipt, handleConvertOrderToSale work
- Modifying bridge-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/bridge/ipc.ts` | buildMockShiftSummary, createMockShift, getMockAppSettings, getMockFeatureFlags, getMockPermissionsForRole (+17) |
| `desktop/Bridge/IpcDispatcher.System.cs` | EffectiveRootOnlyValue, IsCurrentUserRoot, IsProtectedSettingKey, IsRootOnlySettingKey, RemoveProtectedSettingKeys (+2) |
| `desktop/Bridge/IpcDispatcher.Printing.cs` | HandlePrintReceipt, HandlePrintRecoveryVoucher, ReadPayloadBool, ReadPayloadString, ToPrintResponse (+1) |
| `desktop/Bridge/IpcDispatcher.ReportFiles.cs` | HandleOpenReportsFolder, HandleSaveReceiptImage, HandleSaveReportFile, HandleSaveReportPdf, ToSaveResponse (+1) |
| `desktop/Bridge/IpcDispatcher.cs` | HandleCorruptDatabaseSession, IsLicenseBlockedAction, NormalizeActionName, SplitCamelWords, StartsWithReadVerb |
| `desktop/Repositories/SyncRepository.cs` | EnqueueOutbox, GetInboxOrderByOrderId, GetInboxOrders, TryEnqueueOutboxIfEnabled, UpdateInboxOrderStatus |
| `desktop/Bridge/BridgeModels.cs` | BridgeError, BridgeResponse, Fail, Ok |
| `desktop/Services/StoreTemplateService.cs` | ResetFirstRun, SeedProductsForTemplate, IsFirstRunNeeded |
| `desktop/Bridge/IpcDispatcher.Backup.cs` | GetFilePickerLocations, ScanFolderForPackages, ScanKnownLocationsForPackages |
| `desktop/Models/SyncModels.cs` | OnlineOrderItemDto, SyncInboxItem |

## Entry Points

Start here when exploring this area:

- **`convertOnlineOrderToSale`** (Function) — `frontend/src/bridge/onlineStoreIpc.ts:144`
- **`printPosSaleReceipt`** (Function) — `frontend/src/bridge/onlineStoreIpc.ts:151`
- **`handleConvertOrderToSale`** (Function) — `frontend/src/views/OnlineStoreView.tsx:280`
- **`handlePrintOrderSaleReceipt`** (Function) — `frontend/src/views/OnlineStoreView.tsx:317`
- **`BridgeError`** (Class) — `desktop/Bridge/BridgeModels.cs:52`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BridgeError` | Class | `desktop/Bridge/BridgeModels.cs` | 52 |
| `BridgeResponse` | Class | `desktop/Bridge/BridgeModels.cs` | 17 |
| `OnlineOrderItemDto` | Class | `desktop/Models/SyncModels.cs` | 78 |
| `SyncInboxItem` | Class | `desktop/Models/SyncModels.cs` | 39 |
| `RecoveryVoucherRequest` | Class | `desktop/Services/PrinterService.cs` | 42 |
| `convertOnlineOrderToSale` | Function | `frontend/src/bridge/onlineStoreIpc.ts` | 144 |
| `printPosSaleReceipt` | Function | `frontend/src/bridge/onlineStoreIpc.ts` | 151 |
| `handleConvertOrderToSale` | Function | `frontend/src/views/OnlineStoreView.tsx` | 280 |
| `handlePrintOrderSaleReceipt` | Function | `frontend/src/views/OnlineStoreView.tsx` | 317 |
| `Fail` | Method | `desktop/Bridge/BridgeModels.cs` | 41 |
| `Ok` | Method | `desktop/Bridge/BridgeModels.cs` | 31 |
| `SyncRepository_InboxOrders_IdempotentInsertAndAtomicStatusUpdateEnqueuesOutbox` | Method | `desktop/RafiqPOS.Tests/Scenarios/S103_OnlineStoreSyncEngineTest.cs` | 72 |
| `EnqueueOutbox` | Method | `desktop/Repositories/SyncRepository.cs` | 36 |
| `GetInboxOrderByOrderId` | Method | `desktop/Repositories/SyncRepository.cs` | 462 |
| `GetInboxOrders` | Method | `desktop/Repositories/SyncRepository.cs` | 385 |
| `TryEnqueueOutboxIfEnabled` | Method | `desktop/Repositories/SyncRepository.cs` | 89 |
| `UpdateInboxOrderStatus` | Method | `desktop/Repositories/SyncRepository.cs` | 531 |
| `GetSaleById` | Method | `desktop/Services/SaleService.cs` | 1591 |
| `ResetFirstRun` | Method | `desktop/Services/StoreTemplateService.cs` | 38 |
| `SeedProductsForTemplate` | Method | `desktop/Services/StoreTemplateService.cs` | 345 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `OnlineStoreView → ToLocalDateString` | cross_community | 9 |
| `RootStatusPage → ToLocalDateString` | cross_community | 9 |
| `OnlineStoreView → NormalizeDateRange` | cross_community | 8 |
| `RootStatusPage → NormalizeDateRange` | cross_community | 8 |
| `AppUpdateModal → ToLocalDateString` | cross_community | 8 |
| `DataQualityAuditModal → ToLocalDateString` | cross_community | 8 |
| `DrugReferenceImportModal → ToLocalDateString` | cross_community | 8 |
| `ExpiryReturnsModal → ToLocalDateString` | cross_community | 8 |
| `MigrationWizardModal → ToLocalDateString` | cross_community | 8 |
| `PharmacyStocktakingModal → ToLocalDateString` | cross_community | 8 |

## How to Explore

1. `context({name: "convertOnlineOrderToSale"})` — see callers and callees
2. `query({search_query: "bridge"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
