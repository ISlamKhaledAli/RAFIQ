---
name: gitnexus-area-scenarios
description: "Skill for the Scenarios area of RAFIQ. 1101 symbols across 118 files."
---

# Scenarios

1101 symbols | 118 files | Cohesion: 80%

## When to Use

- Working with code in `desktop/`
- Understanding how LoginResult, PinVerificationResult, SetPinResult work
- Modifying scenarios-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Services/SecurityService.cs` | PinVerificationResult, SetPinResult, BuildBoundedPermissionMap, BuildExplicitPermissionMap, CallerOutranks (+88) |
| `desktop/RafiqPOS.Tests/Scenarios/S51_ReceiptTextSettingsTest.cs` | ArrayOf, IpcRoundTrip_OwnerSavesWithCrlf_StoresLf_AndGetAllReturnsLf, Ipc_ManagerRoundTripOfTheWholeSettingsScreen_KeepsTheSignature, Ipc_Manager_SavesAndIsValidatedLikeTheOwner_ForHeaderAndFooter, Ipc_OneInvalidReceiptText_RejectsTheWholeBatch_NothingElseIsWritten (+50) |
| `desktop/RafiqPOS.Tests/Scenarios/S47_ReceiptMathAndRasterTest.cs` | PreBill, AssertIdentity, Cart, Compute, ComputeInconsistent (+41) |
| `desktop/RafiqPOS.Tests/Scenarios/S50_OwnerGradeDelegationTest.cs` | ActionsFor, AllDelegableActions, AllThreeGrants_OpenEveryDelegableAction_ButNeverTheOwnerOnlyOnes, AssertGateAllows, AssertGateForbids (+33) |
| `desktop/RafiqPOS.Tests/Scenarios/S44_UserHierarchyAuthorityTest.cs` | Cashier_CannotUpdateOrResetOtherAccounts, DemotedManager_WithAStaleSession_LosesEveryManagerPower, Dto_ExposesHasPinHasPasswordAndIsOwner, EffectivePermissions_ManagerLacksOnlyTheOwnerOnlyKeys_ComparedToOwner, HasPermission_OwnerOnlyKeys_AreDeniedToManagersAndCashiers_ByIdAndBySession (+30) |
| `desktop/RafiqPOS.Tests/Scenarios/S12_SecurityHardeningTest.cs` | CountAudit, CreateDelegateUnderAdmin, Describe, Dispatch, ErrorCode (+26) |
| `desktop/RafiqPOS.Tests/Scenarios/S63_WalletsEpayReportsDateRangeTest.cs` | EpayAnalytics_IncludesTheWholeEndDay_AndBreaksDownByService, InvalidDate_IsRejectedInsteadOfSilentlyIgnored, S63_WalletsEpayReportsDateRangeTest, AddWalletTx, DayText (+22) |
| `desktop/RafiqPOS.Tests/Scenarios/S48_ReceiptPrintingBridgeTest.cs` | ForgedLines, KickDrawerAndCutPaper_SendTheirExactCommands, PrintById, PrintReceipt_ClientSaysCopy_OnANeverPrintedSale_IsACopy, PrintReceipt_EmptyOrUnidentifiablePayload_IsInvalidSale (+19) |
| `desktop/RafiqPOS.Tests/Scenarios/S52_DigitalAccountHolderAndDefaultTest.cs` | EnableWalletsFeature, SetDefaultAccount_SwitchesTheMain_ForAnAccountsManager_AndIsForbiddenForACashier, S52_DigitalAccountHolderMigrationTest, S52_DigitalAccountHolderAndDefaultTest, DefaultCount (+18) |
| `desktop/RafiqPOS.Tests/Scenarios/S39_ServerAuthoritativeTaxAndFeesTest.cs` | S39_ServerAuthoritativeTaxAndFeesTest, AssertFeeIsRejected, BuildSale, ClientServiceFee_OnCashSale_IsDiscarded_StoredFeeIsZero, ClientTaxRate_OnZeroTaxProduct_IsIgnored_StoredTaxIsZero (+17) |

## Entry Points

Start here when exploring this area:

- **`LoginResult`** (Class) — `desktop/Models/User.cs:134`
- **`PinVerificationResult`** (Class) — `desktop/Services/SecurityService.cs:23`
- **`SetPinResult`** (Class) — `desktop/Services/SecurityService.cs:33`
- **`RecipeIngredient`** (Class) — `desktop/Models/CafeModels.cs:567`
- **`S100_ExactBarcodeLookupTest`** (Class) — `desktop/RafiqPOS.Tests/Scenarios/S100_ExactBarcodeLookupTest.cs:9`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LoginResult` | Class | `desktop/Models/User.cs` | 134 |
| `PinVerificationResult` | Class | `desktop/Services/SecurityService.cs` | 23 |
| `SetPinResult` | Class | `desktop/Services/SecurityService.cs` | 33 |
| `RecipeIngredient` | Class | `desktop/Models/CafeModels.cs` | 567 |
| `S100_ExactBarcodeLookupTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S100_ExactBarcodeLookupTest.cs` | 9 |
| `S101_BoundedSmartCatalogTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S101_BoundedSmartCatalogTest.cs` | 6 |
| `S10_AuditFixesVerificationTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S10_AuditFixesVerificationTest.cs` | 10 |
| `S11_CafeRestaurantSuiteTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S11_CafeRestaurantSuiteTest.cs` | 11 |
| `S12_SecurityHardeningTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S12_SecurityHardeningTest.cs` | 11 |
| `S13_ReturnProfitSymmetryTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S13_ReturnProfitSymmetryTest.cs` | 8 |
| `S15_ProductUnitEditAtomicityTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S15_ProductUnitEditAtomicityTest.cs` | 8 |
| `S16_CancelSaleClosedShiftTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S16_CancelSaleClosedShiftTest.cs` | 7 |
| `S17_SupervisorPriceOverrideTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S17_SupervisorPriceOverrideTest.cs` | 9 |
| `S18_PurchaseReturnProportionalTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S18_PurchaseReturnProportionalTest.cs` | 7 |
| `S19_StocktakingAndAdjustmentPathsTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S19_StocktakingAndAdjustmentPathsTest.cs` | 15 |
| `S1_DiscountDoubleCountTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S1_DiscountDoubleCountTest.cs` | 7 |
| `S20_ExcelImportStockTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S20_ExcelImportStockTest.cs` | 13 |
| `S21_PurchasePackagingTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S21_PurchasePackagingTest.cs` | 15 |
| `S22_PurchaseReturnAggregationTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S22_PurchaseReturnAggregationTest.cs` | 14 |
| `S23_ImportUnitRowsAndPharmaPricingTest` | Class | `desktop/RafiqPOS.Tests/Scenarios/S23_ImportUnitRowsAndPharmaPricingTest.cs` | 16 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunTest26_GenericWalletAndCardClosingParity → Shift` | cross_community | 8 |
| `RunBaseline → Sale` | cross_community | 7 |
| `RunBaseline → ReadOptionalLong` | cross_community | 7 |
| `RunAllTests → SaleItemModifier` | cross_community | 7 |
| `RunAllTests → SaleItem` | cross_community | 7 |
| `RunAllTests → SalePayment` | cross_community | 7 |
| `ProcessReturnCore → User` | cross_community | 7 |
| `RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity → NetOutCancelledSettlements` | cross_community | 7 |
| `RunTest10_LiveDrawerBalanceAndPurchasesDeductionParity → Get` | cross_community | 7 |
| `RunAllTests → Sale` | cross_community | 7 |

## How to Explore

1. `context({name: "LoginResult"})` — see callers and callees
2. `query({search_query: "scenarios"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
