---
name: gitnexus-area-services
description: "Skill for the Services area of RAFIQ. 1294 symbols across 216 files."
---

# Services

1294 symbols | 216 files | Cohesion: 62%

## When to Use

- Working with code in `desktop/`
- Understanding how assert, Customer, CustomerBalanceVerification work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Services/PrinterService.cs` | PrintResult, PrinterInfo, PrinterStatusInfo, ReceiptLine, ReceiptRenderJob (+112) |
| `desktop/Services/SeniorRuthlessAuditRunner.cs` | AssertCondition, RunAllTests, RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity, RunTest11_SupplierDirectPaymentDrawerDeductionAndLedgerParity, RunTest12_SaleCancellationBlockedOnExistingReturns (+28) |
| `desktop/Services/MigrationService.cs` | Dispose, TryDetectRecoveryCodeFromFolder, MigrationPackageExportResult, CheckRestoreDiskSpace, CopyDirectoryRecursive (+28) |
| `desktop/Services/ReportsService.cs` | BindCustomDates, GetCashierPerformanceReport, GetCategoryPerformance, GetClosingHistory, GetCreditOverview (+28) |
| `desktop/Services/DatabaseService.cs` | ApplyIntegrityFailure, CheckAndQuarantine, MoveAsideWalAndShm, PruneDirectoryFiles, ReplaceDatabaseFile (+27) |
| `desktop/Services/DemoDataService.cs` | DemoCustomerSeed, DemoStatusResult, CountWhere, GetDemoCustomers, GetDemoProductsForStoreType (+25) |
| `desktop/Services/SupportService.cs` | SupportBundleResult, BuildReadme, BuildSuccessMessage, BuildTargets, CreateSupportBundle (+25) |
| `desktop/Services/BackupService.cs` | ReadLiveCounts, VerifyBackupCore, VerifyBackupDetailed, DriveItem, GetAvailableDrives (+20) |
| `desktop/Services/SettingsService.cs` | Get, GetDetectedDefaultMotionLevel, GetUiMotionLevel, GetUiMotionStyle, IsUiMotionChange (+18) |
| `desktop/Services/ProductService.cs` | BulkUpdateMinStock, BulkUpdateTaxRate, GetAll, GetAllSearchIds, GetByExactBarcode (+18) |

## Entry Points

Start here when exploring this area:

- **`assert`** (Function) — `desktop/Services/PurchasesTestRunner.cs:22`
- **`Customer`** (Class) — `desktop/Models/Customer.cs:6`
- **`CustomerBalanceVerification`** (Class) — `desktop/Models/Customer.cs:105`
- **`DailyClosingPreview`** (Class) — `desktop/Models/DailyClosing.cs:177`
- **`UnclosedDayAlert`** (Class) — `desktop/Models/DailyClosing.cs:562`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Customer` | Class | `desktop/Models/Customer.cs` | 6 |
| `CustomerBalanceVerification` | Class | `desktop/Models/Customer.cs` | 105 |
| `DailyClosingPreview` | Class | `desktop/Models/DailyClosing.cs` | 177 |
| `UnclosedDayAlert` | Class | `desktop/Models/DailyClosing.cs` | 562 |
| `DigitalAccount` | Class | `desktop/Models/DigitalAccountModels.cs` | 7 |
| `DigitalTransaction` | Class | `desktop/Models/DigitalAccountModels.cs` | 106 |
| `EpayTerminal` | Class | `desktop/Models/EpayModels.cs` | 7 |
| `CreateExpenseRequest` | Class | `desktop/Models/Expense.cs` | 69 |
| `Expense` | Class | `desktop/Models/Expense.cs` | 6 |
| `HeldSale` | Class | `desktop/Models/HeldSale.cs` | 5 |
| `BatchDeductionResult` | Class | `desktop/Models/ProductBatch.cs` | 143 |
| `BatchSummaryResult` | Class | `desktop/Models/ProductBatch.cs` | 119 |
| `ProductBatch` | Class | `desktop/Models/ProductBatch.cs` | 5 |
| `PurchaseItem` | Class | `desktop/Models/PurchaseItem.cs` | 5 |
| `QuickItem` | Class | `desktop/Models/QuickItem.cs` | 5 |
| `ReturnItem` | Class | `desktop/Models/Return.cs` | 6 |
| `ReturnRefundPart` | Class | `desktop/Models/Return.cs` | 55 |
| `SalePayment` | Class | `desktop/Models/Sale.cs` | 246 |
| `SaleItemBatchAllocation` | Class | `desktop/Models/SaleItemBatchAllocation.cs` | 5 |
| `OpenShiftRequest` | Class | `desktop/Models/ShiftModels.cs` | 144 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunTest26_GenericWalletAndCardClosingParity → Shift` | cross_community | 8 |
| `TryDispatchSales → CheckAndRotate` | cross_community | 7 |
| `RunBaseline → Sale` | cross_community | 7 |
| `RunBaseline → ReadOptionalLong` | cross_community | 7 |
| `RunAllTests → InsertInternal` | cross_community | 7 |
| `RunAllTests → SaleItemModifier` | cross_community | 7 |
| `RunAllTests → SaleItem` | cross_community | 7 |
| `RunAllTests → SalePayment` | cross_community | 7 |
| `ProcessReturnCore → User` | cross_community | 7 |
| `RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity → NetOutCancelledSettlements` | cross_community | 7 |

## How to Explore

1. `context({name: "assert"})` — see callers and callees
2. `query({search_query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
