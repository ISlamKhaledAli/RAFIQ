---
name: gitnexus-area-models
description: "Skill for the Models area of RAFIQ. 34 symbols across 18 files."
---

# Models

34 symbols | 18 files | Cohesion: 61%

## When to Use

- Working with code in `desktop/`
- Understanding how CustomerImportPreviewResult, CustomerImportResult, CustomerImportRow work
- Modifying models-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Models/DailyClosing.cs` | DailyClosingEpayTerminalSummary, DailyClosingEpayTransactionItem, DailyClosingWalletSummary, DailyClosingWalletTransactionItem |
| `desktop/Models/Customer.cs` | CustomerImportPreviewResult, CustomerImportResult, CustomerImportRow |
| `desktop/Models/DashboardSummary.cs` | DashboardSummary, StockAdjustmentSummaryItem, TopDebtorItem |
| `desktop/Models/SyncModels.cs` | DailyExtendedMetricsDto, DailySalesSummaryDto, DailyTopProductDto |
| `desktop/Repositories/SyncRepository.cs` | GetDailySalesSummaryForDate, GetRecentDailySalesSummaries, GetTodaySalesSummary |
| `desktop/Common/CompoundStockHelper.cs` | FormatCompoundStock, IsOpenPackage, LocalizeUnit |
| `desktop/Models/DigitalAccountModels.cs` | DigitalAccountFunding, DigitalAnalyticsSummary |
| `desktop/Repositories/DigitalAccountRepository.cs` | GetAnalytics, MapFunding |
| `desktop/Services/DailyClosingService.cs` | PopulateEpayAndWalletsDetails, TableExists |
| `desktop/Models/EpayModels.cs` | EpayAnalyticsSummary |

## Entry Points

Start here when exploring this area:

- **`CustomerImportPreviewResult`** (Class) — `desktop/Models/Customer.cs:214`
- **`CustomerImportResult`** (Class) — `desktop/Models/Customer.cs:246`
- **`CustomerImportRow`** (Class) — `desktop/Models/Customer.cs:167`
- **`DashboardSummary`** (Class) — `desktop/Models/DashboardSummary.cs:6`
- **`StockAdjustmentSummaryItem`** (Class) — `desktop/Models/DashboardSummary.cs:266`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CustomerImportPreviewResult` | Class | `desktop/Models/Customer.cs` | 214 |
| `CustomerImportResult` | Class | `desktop/Models/Customer.cs` | 246 |
| `CustomerImportRow` | Class | `desktop/Models/Customer.cs` | 167 |
| `DashboardSummary` | Class | `desktop/Models/DashboardSummary.cs` | 6 |
| `StockAdjustmentSummaryItem` | Class | `desktop/Models/DashboardSummary.cs` | 266 |
| `TopDebtorItem` | Class | `desktop/Models/DashboardSummary.cs` | 350 |
| `DigitalAccountFunding` | Class | `desktop/Models/DigitalAccountModels.cs` | 227 |
| `DigitalAnalyticsSummary` | Class | `desktop/Models/DigitalAccountModels.cs` | 266 |
| `EpayAnalyticsSummary` | Class | `desktop/Models/EpayModels.cs` | 247 |
| `DailyExtendedMetricsDto` | Class | `desktop/Models/SyncModels.cs` | 327 |
| `DailySalesSummaryDto` | Class | `desktop/Models/SyncModels.cs` | 288 |
| `DailyTopProductDto` | Class | `desktop/Models/SyncModels.cs` | 369 |
| `DailyClosingEpayTerminalSummary` | Class | `desktop/Models/DailyClosing.cs` | 328 |
| `DailyClosingEpayTransactionItem` | Class | `desktop/Models/DailyClosing.cs` | 355 |
| `DailyClosingWalletSummary` | Class | `desktop/Models/DailyClosing.cs` | 397 |
| `DailyClosingWalletTransactionItem` | Class | `desktop/Models/DailyClosing.cs` | 430 |
| `BulkPriceRevertResult` | Class | `desktop/Models/BulkPriceAdjustmentModels.cs` | 186 |
| `ProductPriceHistory` | Class | `desktop/Models/ProductPriceHistory.cs` | 5 |
| `Product` | Class | `desktop/Models/Product.cs` | 5 |
| `FormatPiasters` | Method | `desktop/Common/Money.cs` | 33 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `TryDispatchEpay → FormatPiasters` | cross_community | 6 |
| `RunTest22_AdvancedSubsystemAssetAndCatalogIntegrityGuards → FormatPiasters` | cross_community | 6 |
| `TryDispatchWallets → FormatPiasters` | cross_community | 5 |
| `RunAllTests → FormatPiasters` | cross_community | 5 |
| `ExportFullStoreData → FormatPiasters` | cross_community | 5 |
| `RunAllTests → FormatPiasters` | cross_community | 5 |
| `RunTest21_EntityArchivalAndActiveValidationGuards → FormatPiasters` | cross_community | 5 |
| `RunTest23_SeniorCustomerLedgerAndQuickCatalogGuards → FormatPiasters` | cross_community | 5 |
| `RunTest24_ReturnCartBatchAndUnitResilienceGuards → FormatPiasters` | cross_community | 5 |
| `RunAllTests → FormatPiasters` | cross_community | 5 |

## How to Explore

1. `context({name: "CustomerImportPreviewResult"})` — see callers and callees
2. `query({search_query: "models"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
