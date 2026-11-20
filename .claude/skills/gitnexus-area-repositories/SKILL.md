---
name: gitnexus-area-repositories
description: "Skill for the Repositories area of RAFIQ. 437 symbols across 103 files."
---

# Repositories

437 symbols | 103 files | Cohesion: 66%

## When to Use

- Working with code in `desktop/`
- Understanding how execute, AuditLog, BulkPriceApplyResult work
- Modifying repositories-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Repositories/EpayRepository.cs` | AdjustBalance, CalculatePricing, CancelTransaction, ComputeFeeOrCommission, CreateTransaction (+17) |
| `desktop/Repositories/ProductRepository.cs` | GetAllSearchIds, GetSearchCount, GetTotalActiveCount, Upsert, Upsert (+15) |
| `desktop/Repositories/InsuranceRepository.cs` | GetClaimLineBySaleId, ReadClaimLine, GetCompanies, GetCompanyById, ReadCompany (+14) |
| `desktop/Repositories/DigitalAccountRepository.cs` | AdjustBalance, CancelTransaction, DeleteAccount, FundWalletTillCash, GetTransactionById (+10) |
| `desktop/Repositories/PurchaseRepository.cs` | CreatePurchaseReturn, DeductReturnFromBatches, ProportionalValue, PurchaseFingerprint, PurchaseReturnFingerprint (+9) |
| `desktop/Repositories/TableRepository.cs` | TransferTable, CloseTable, CloseTableAtomic, DeleteTable, GetAll (+8) |
| `desktop/Repositories/RecipeRepository.cs` | ReverseRecipeConsumptionOnCancelAtomic, GetAllRecipes, GetByProductId, GetByProductIdInternal, MapIngredient (+7) |
| `desktop/Repositories/ProductRepository.Import.cs` | ImportUnitMatch, ApplyImportedStock, ApplyPackageUnitRow, BindImportUpdate, CleanVariantValue (+7) |
| `desktop/Repositories/SaleRepository.cs` | GetSaleById, GetSaleByIdempotencyKey, GetSaleByInvoiceNumber, GetSaleItems, GetSalePayments (+7) |
| `desktop/Repositories/SyncRepository.cs` | GetDailySalesSummaryForDate, GetPendingOutboxCount, GetRecentDailySalesSummaries, GetTodaySalesSummary, SetState (+7) |

## Entry Points

Start here when exploring this area:

- **`execute`** (Function) — `desktop/Repositories/SupplierRepository.cs:419`
- **`AuditLog`** (Class) — `desktop/Models/AuditLog.cs:5`
- **`BulkPriceApplyResult`** (Class) — `desktop/Models/BulkPriceAdjustmentModels.cs:162`
- **`LiveDrawerBalanceResult`** (Class) — `desktop/Models/DailyClosing.cs:475`
- **`EpayPricingResult`** (Class) — `desktop/Models/EpayModels.cs:366`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AuditLog` | Class | `desktop/Models/AuditLog.cs` | 5 |
| `BulkPriceApplyResult` | Class | `desktop/Models/BulkPriceAdjustmentModels.cs` | 162 |
| `LiveDrawerBalanceResult` | Class | `desktop/Models/DailyClosing.cs` | 475 |
| `EpayPricingResult` | Class | `desktop/Models/EpayModels.cs` | 366 |
| `EpayServiceFeeRule` | Class | `desktop/Models/EpayModels.cs` | 333 |
| `EpayTerminalFunding` | Class | `desktop/Models/EpayModels.cs` | 201 |
| `EpayTransaction` | Class | `desktop/Models/EpayModels.cs` | 85 |
| `CashDrawerTransaction` | Class | `desktop/Models/ShiftModels.cs` | 111 |
| `CashMovementRequest` | Class | `desktop/Models/ShiftModels.cs` | 192 |
| `RebaseResult` | Class | `desktop/Repositories/ProductRepository.Rebase.cs` | 9 |
| `ControlledInspectionReportRow` | Class | `desktop/Models/PharmaModels.cs` | 477 |
| `DailyExtendedMetricsDto` | Class | `desktop/Models/SyncModels.cs` | 327 |
| `DailySalesSummaryDto` | Class | `desktop/Models/SyncModels.cs` | 288 |
| `DailyTopProductDto` | Class | `desktop/Models/SyncModels.cs` | 369 |
| `CustomerLedgerEntry` | Class | `desktop/Models/Customer.cs` | 51 |
| `DeliveryOrder` | Class | `desktop/Models/CafeModels.cs` | 455 |
| `DailyClosing` | Class | `desktop/Models/DailyClosing.cs` | 6 |
| `OnlineOrdersSyncedEvent` | Class | `desktop/Models/SyncModels.cs` | 424 |
| `SyncStateDto` | Class | `desktop/Models/SyncModels.cs` | 173 |
| `InsuranceExclusion` | Class | `desktop/Models/Insurance.cs` | 113 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunBaseline → InsuranceClaimLine` | cross_community | 8 |
| `RunAllTests → InsuranceClaimLine` | cross_community | 8 |
| `RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity → InsuranceClaimLine` | cross_community | 8 |
| `RunTest20_DigitalWalletRefundAndCancelOverdraftGuards → InsuranceClaimLine` | cross_community | 8 |
| `RunTest26_GenericWalletAndCardClosingParity → InsuranceClaimLine` | cross_community | 8 |
| `RunTest29_CustomerAdvanceCreditReturnSymmetry → InsuranceClaimLine` | cross_community | 8 |
| `RunTest30_MultiTenderInstapayWalletCashSplitParity → InsuranceClaimLine` | cross_community | 8 |
| `RunTest8_FinancialRoundingAndCreditReversals → InsuranceClaimLine` | cross_community | 8 |
| `RunAllTests → InsuranceClaimLine` | cross_community | 8 |
| `RunBaseline → Sale` | cross_community | 7 |

## How to Explore

1. `context({name: "execute"})` — see callers and callees
2. `query({search_query: "repositories"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
