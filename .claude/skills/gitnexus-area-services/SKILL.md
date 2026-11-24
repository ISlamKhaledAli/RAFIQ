---
name: gitnexus-area-services
description: "Skill for the Services area of RAFIQ. 1362 symbols across 220 files."
---

# Services

1362 symbols | 220 files | Cohesion: 60%

## When to Use

- Working with code in `desktop/`
- Understanding how assert, Customer, CustomerBalanceVerification work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Services/PrinterService.cs` | PrintResult, PrinterInfo, PrinterStatusInfo, ReceiptLine, ReceiptRenderJob (+114) |
| `desktop/Services/DatabaseService.cs` | ApplyIntegrityFailure, CheckAndQuarantine, MoveAsideWalAndShm, PruneDirectoryFiles, ReplaceDatabaseFile (+30) |
| `desktop/Services/ReportsService.cs` | BindCustomDates, GetCashierPerformanceReport, GetCategoryPerformance, GetClosingHistory, GetCreditOverview (+29) |
| `desktop/Services/SeniorRuthlessAuditRunner.cs` | AssertCondition, RunAllTests, RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity, RunTest11_SupplierDirectPaymentDrawerDeductionAndLedgerParity, RunTest12_SaleCancellationBlockedOnExistingReturns (+28) |
| `desktop/Services/MigrationService.cs` | Dispose, TryDetectRecoveryCodeFromFolder, MigrationPackageExportResult, CheckRestoreDiskSpace, CopyDirectoryRecursive (+28) |
| `desktop/Services/SyncEngine.cs` | CachedRealtimeSessionInfo, ComputeSha256Hex, HandleExplicitDeactivation, IsBuiltInDefaultLogoPath, IsOnlineStoreFeatureEnabled (+25) |
| `desktop/Services/SupportService.cs` | CollectFeatureFlags, SupportBundleResult, BuildReadme, BuildSuccessMessage, BuildTargets (+25) |
| `desktop/Services/DemoDataService.cs` | DemoCustomerSeed, DemoStatusResult, CountWhere, GetDemoCustomers, GetDemoProductsForStoreType (+25) |
| `desktop/Services/BackupService.cs` | ReadLiveCounts, VerifyBackupCore, VerifyBackupDetailed, DriveItem, GetAvailableDrives (+20) |
| `desktop/Services/SettingsService.cs` | Get, TryDecodeSignatureImage, GetBool, GetFeatureFlags, IsFeatureEnabled (+19) |

## Entry Points

Start here when exploring this area:

- **`assert`** (Function) — `desktop/Services/PurchasesTestRunner.cs:22`
- **`Customer`** (Class) — `desktop/Models/Customer.cs:6`
- **`CustomerBalanceVerification`** (Class) — `desktop/Models/Customer.cs:105`
- **`DigitalAccount`** (Class) — `desktop/Models/DigitalAccountModels.cs:7`
- **`DigitalTransaction`** (Class) — `desktop/Models/DigitalAccountModels.cs:106`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Customer` | Class | `desktop/Models/Customer.cs` | 6 |
| `CustomerBalanceVerification` | Class | `desktop/Models/Customer.cs` | 105 |
| `DigitalAccount` | Class | `desktop/Models/DigitalAccountModels.cs` | 7 |
| `DigitalTransaction` | Class | `desktop/Models/DigitalAccountModels.cs` | 106 |
| `EpayPricingResult` | Class | `desktop/Models/EpayModels.cs` | 366 |
| `EpayServiceFeeRule` | Class | `desktop/Models/EpayModels.cs` | 333 |
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
| `SaleItemBatchAllocation` | Class | `desktop/Models/SaleItemBatchAllocation.cs` | 5 |
| `OpenShiftRequest` | Class | `desktop/Models/ShiftModels.cs` | 156 |
| `Supplier` | Class | `desktop/Models/Supplier.cs` | 5 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunBaseline → InsuranceClaimLine` | cross_community | 8 |
| `RunAllTests → InsuranceClaimLine` | cross_community | 8 |
| `RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity → InsuranceClaimLine` | cross_community | 8 |
| `RunTest20_DigitalWalletRefundAndCancelOverdraftGuards → InsuranceClaimLine` | cross_community | 8 |
| `RunTest26_GenericWalletAndCardClosingParity → InsuranceClaimLine` | cross_community | 8 |
| `RunTest30_MultiTenderInstapayWalletCashSplitParity → InsuranceClaimLine` | cross_community | 8 |
| `RunTest8_FinancialRoundingAndCreditReversals → InsuranceClaimLine` | cross_community | 8 |
| `RunAllTests → InsuranceClaimLine` | cross_community | 8 |
| `TryDispatchSales → CheckAndRotate` | cross_community | 7 |
| `RunBaseline → Sale` | cross_community | 7 |

## How to Explore

1. `context({name: "assert"})` — see callers and callees
2. `query({search_query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
