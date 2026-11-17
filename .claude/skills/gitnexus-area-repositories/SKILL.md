---
name: gitnexus-area-repositories
description: "Skill for the Repositories area of RAFIQ. 458 symbols across 112 files."
---

# Repositories

458 symbols | 112 files | Cohesion: 65%

## When to Use

- Working with code in `desktop/`
- Understanding how execute, AuditLog, BulkPriceApplyResult work
- Modifying repositories-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Repositories/EpayRepository.cs` | AdjustBalance, CalculatePricing, CancelTransaction, ComputeFeeOrCommission, CreateTransaction (+17) |
| `desktop/Repositories/InsuranceRepository.cs` | CreateClaimBatch, SettleBatch, CalculateSplit, GetContractById, GetContracts (+15) |
| `desktop/Repositories/ProductRepository.cs` | GetAllSearchIds, GetSearchCount, GetTotalActiveCount, Upsert, Upsert (+15) |
| `desktop/Services/InsuranceService.cs` | CreateBatch, SettleBatch, CalculateSplit, DeleteContract, GetAllContracts (+11) |
| `desktop/Repositories/DigitalAccountRepository.cs` | AdjustBalance, CancelTransaction, DeleteAccount, FundWalletTillCash, GetTransactionById (+10) |
| `desktop/Repositories/PurchaseRepository.cs` | CreatePurchaseReturn, DeductReturnFromBatches, ProportionalValue, PurchaseFingerprint, PurchaseReturnFingerprint (+9) |
| `desktop/Repositories/TableRepository.cs` | TransferTable, CloseTable, CloseTableAtomic, DeleteTable, GetAll (+8) |
| `desktop/Repositories/RecipeRepository.cs` | ReverseRecipeConsumptionOnCancelAtomic, GetAllRecipes, GetByProductId, GetByProductIdInternal, MapIngredient (+7) |
| `desktop/Repositories/UserRepository.cs` | GetAll, GetByIdCore, GetByIdIncludingDeleted, GetByParentId, GetByUsername (+7) |
| `desktop/Repositories/ProductRepository.Import.cs` | ImportUnitMatch, ApplyImportedStock, ApplyPackageUnitRow, BindImportUpdate, CleanVariantValue (+7) |

## Entry Points

Start here when exploring this area:

- **`execute`** (Function) — `desktop/Repositories/SupplierRepository.cs:419`
- **`AuditLog`** (Class) — `desktop/Models/AuditLog.cs:5`
- **`BulkPriceApplyResult`** (Class) — `desktop/Models/BulkPriceAdjustmentModels.cs:162`
- **`AutoCloseShiftsResult`** (Class) — `desktop/Models/DailyClosing.cs:547`
- **`LiveDrawerBalanceResult`** (Class) — `desktop/Models/DailyClosing.cs:475`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AuditLog` | Class | `desktop/Models/AuditLog.cs` | 5 |
| `BulkPriceApplyResult` | Class | `desktop/Models/BulkPriceAdjustmentModels.cs` | 162 |
| `AutoCloseShiftsResult` | Class | `desktop/Models/DailyClosing.cs` | 547 |
| `LiveDrawerBalanceResult` | Class | `desktop/Models/DailyClosing.cs` | 475 |
| `EpayPricingResult` | Class | `desktop/Models/EpayModels.cs` | 366 |
| `EpayServiceFeeRule` | Class | `desktop/Models/EpayModels.cs` | 333 |
| `EpayTerminalFunding` | Class | `desktop/Models/EpayModels.cs` | 201 |
| `EpayTransaction` | Class | `desktop/Models/EpayModels.cs` | 85 |
| `CashDrawerTransaction` | Class | `desktop/Models/ShiftModels.cs` | 111 |
| `CashMovementRequest` | Class | `desktop/Models/ShiftModels.cs` | 180 |
| `CloseShiftRequest` | Class | `desktop/Models/ShiftModels.cs` | 162 |
| `ApplyTemplateResult` | Class | `desktop/Models/StoreTemplate.cs` | 73 |
| `RebaseResult` | Class | `desktop/Repositories/ProductRepository.Rebase.cs` | 9 |
| `User` | Class | `desktop/Models/User.cs` | 6 |
| `InsuranceExclusion` | Class | `desktop/Models/Insurance.cs` | 113 |
| `InsuranceItemCoverage` | Class | `desktop/Models/Insurance.cs` | 383 |
| `Category` | Class | `desktop/Models/Category.cs` | 5 |
| `ControlledInspectionReportRow` | Class | `desktop/Models/PharmaModels.cs` | 477 |
| `CustomerLedgerEntry` | Class | `desktop/Models/Customer.cs` | 51 |
| `DeliveryOrder` | Class | `desktop/Models/CafeModels.cs` | 455 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunTest26_GenericWalletAndCardClosingParity → Shift` | cross_community | 8 |
| `RunBaseline → Sale` | cross_community | 7 |
| `RunBaseline → ReadOptionalLong` | cross_community | 7 |
| `RunAllTests → InsertInternal` | cross_community | 7 |
| `RunAllTests → SaleItemModifier` | cross_community | 7 |
| `RunAllTests → SaleItem` | cross_community | 7 |
| `RunAllTests → SalePayment` | cross_community | 7 |
| `ProcessReturnCore → User` | cross_community | 7 |
| `RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity → NetOutCancelledSettlements` | cross_community | 7 |
| `RunTest27_ClosedDayCashDrawerProtections → CashDrawerTransaction` | cross_community | 7 |

## How to Explore

1. `context({name: "execute"})` — see callers and callees
2. `query({search_query: "repositories"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
