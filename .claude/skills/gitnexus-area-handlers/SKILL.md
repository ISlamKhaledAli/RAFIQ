---
name: gitnexus-area-handlers
description: "Skill for the Handlers area of RAFIQ. 87 symbols across 19 files."
---

# Handlers

87 symbols | 19 files | Cohesion: 88%

## When to Use

- Working with code in `online-store/`
- Understanding how authenticateOwnerRequest, authenticateSyncRequest, checkCloudStoreEntitlement work
- Modifying handlers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `online-store/api/src/handlers/dashboard.ts` | handleDashboardBatchUpdateProducts, handleDashboardBulkUpdateCategoriesVisibility, handleDashboardBulkUpdateProductsVisibility, handleDashboardGetCategories, handleDashboardGetOrders (+12) |
| `online-store/api/src/handlers/sync.ts` | decodeBase64Bytes, ensureStoreColumns, handleGetCatalogUpdates, handleGetPendingOrders, handleGetSettings (+11) |
| `online-store/api/src/handlers/store.ts` | decodeBase64ToArrayBuffer, handleCreateOrder, restoreReservedStock, handleGetStore, handleGetStoreCategories (+4) |
| `license-server/src/crypto.ts` | base64UrlEncode, computeFingerprintTag, generateClockResetToken, generateOfflineSupportCode, generatePinRecoveryToken (+2) |
| `license-server/src/handlers/admin.ts` | generateLicenseKey, part, handleAdmin, hmacSha256Hex, isAllowedReleaseDownloadUrl (+2) |
| `online-store/api/src/crypto.ts` | createSessionToken, generateUUID, hmacSha256Hex, sha256Hex, timingSafeEqual (+1) |
| `online-store/api/src/handlers/images.ts` | handleDashboardDeleteProductImage, handleDashboardUploadProductImage, handleServePublicImage, parseImageUrls |
| `online-store/api/src/auth.ts` | authenticateOwnerRequest, authenticateSyncRequest, checkCloudStoreEntitlement |
| `online-store/api/src/realtime.ts` | handleIssuePosRealtimeToken, handleRealtimeWebSocketConnect, notifyStoreRealtime |
| `license-server/src/auth.ts` | safeStringCompare, validateAdminSecret, validateClientApiKey |

## Entry Points

Start here when exploring this area:

- **`authenticateOwnerRequest`** (Function) — `online-store/api/src/auth.ts:92`
- **`authenticateSyncRequest`** (Function) — `online-store/api/src/auth.ts:3`
- **`checkCloudStoreEntitlement`** (Function) — `online-store/api/src/auth.ts:67`
- **`createSessionToken`** (Function) — `online-store/api/src/crypto.ts:43`
- **`generateUUID`** (Function) — `online-store/api/src/crypto.ts:32`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `authenticateOwnerRequest` | Function | `online-store/api/src/auth.ts` | 92 |
| `authenticateSyncRequest` | Function | `online-store/api/src/auth.ts` | 3 |
| `checkCloudStoreEntitlement` | Function | `online-store/api/src/auth.ts` | 67 |
| `createSessionToken` | Function | `online-store/api/src/crypto.ts` | 43 |
| `generateUUID` | Function | `online-store/api/src/crypto.ts` | 32 |
| `hmacSha256Hex` | Function | `online-store/api/src/crypto.ts` | 9 |
| `sha256Hex` | Function | `online-store/api/src/crypto.ts` | 2 |
| `timingSafeEqual` | Function | `online-store/api/src/crypto.ts` | 23 |
| `verifySessionToken` | Function | `online-store/api/src/crypto.ts` | 63 |
| `handleDashboardBatchUpdateProducts` | Function | `online-store/api/src/handlers/dashboard.ts` | 1040 |
| `handleDashboardBulkUpdateCategoriesVisibility` | Function | `online-store/api/src/handlers/dashboard.ts` | 869 |
| `handleDashboardBulkUpdateProductsVisibility` | Function | `online-store/api/src/handlers/dashboard.ts` | 931 |
| `handleDashboardGetCategories` | Function | `online-store/api/src/handlers/dashboard.ts` | 747 |
| `handleDashboardGetOrders` | Function | `online-store/api/src/handlers/dashboard.ts` | 532 |
| `handleDashboardSmartPublishCatalog` | Function | `online-store/api/src/handlers/dashboard.ts` | 1106 |
| `handleDashboardUpdateCategoryVisibility` | Function | `online-store/api/src/handlers/dashboard.ts` | 795 |
| `handleDashboardUpdateOrderStatus` | Function | `online-store/api/src/handlers/dashboard.ts` | 576 |
| `handleDashboardUpdateProductOnlineSettings` | Function | `online-store/api/src/handlers/dashboard.ts` | 994 |
| `handleDashboardUpdateStoreSettings` | Function | `online-store/api/src/handlers/dashboard.ts` | 1247 |
| `handleDashboardUpdateStoreTheme` | Function | `online-store/api/src/handlers/dashboard.ts` | 1330 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleAdmin → SafeStringCompare` | cross_community | 3 |
| `HandleAdmin → Part` | intra_community | 3 |
| `HandleCreateOrder → GenerateUUID` | intra_community | 3 |
| `HandleCreateOrder → DecodeBase64ToArrayBuffer` | intra_community | 3 |
| `Fetch → HmacSha256Hex` | intra_community | 3 |
| `Fetch → TimingSafeEqual` | intra_community | 3 |
| `Fetch → CheckCloudStoreEntitlement` | intra_community | 3 |
| `Fetch → VerifySessionToken` | intra_community | 3 |

## How to Explore

1. `context({name: "authenticateOwnerRequest"})` — see callers and callees
2. `query({search_query: "handlers"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
