---
name: gitnexus-area-handlers
description: "Skill for the Handlers area of RAFIQ. 52 symbols across 15 files."
---

# Handlers

52 symbols | 15 files | Cohesion: 84%

## When to Use

- Working with code in `online-store/`
- Understanding how authenticateOwnerRequest, verifySessionToken, handleDashboardGetOrders work
- Modifying handlers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `online-store/api/src/handlers/dashboard.ts` | handleDashboardGetOrders, handleDashboardGetProducts, handleDashboardOverview, handleDashboardUpdateOrderStatus, handleDashboardUpdateProductOnlineSettings (+3) |
| `online-store/api/src/handlers/sync.ts` | handleGetPendingOrders, handleGetSettings, handleHeartbeat, handleSyncStock, handleUpdateOrdersStatus (+2) |
| `license-server/src/crypto.ts` | base64UrlEncode, computeFingerprintTag, generateClockResetToken, generateOfflineSupportCode, generatePinRecoveryToken (+2) |
| `online-store/api/src/handlers/store.ts` | handleGetStore, handleGetStoreCategories, handleGetStoreProductDetail, handleGetStoreProducts, handleTrackOrder (+1) |
| `online-store/api/src/crypto.ts` | verifySessionToken, createSessionToken, sha256Hex, timingSafeEqual, generateUUID |
| `license-server/src/handlers/admin.ts` | generateLicenseKey, part, handleAdmin, isAllowedReleaseDownloadUrl |
| `license-server/src/auth.ts` | safeStringCompare, validateAdminSecret, validateClientApiKey |
| `online-store/api/src/auth.ts` | authenticateOwnerRequest, authenticateSyncRequest |
| `online-store/api/src/index.ts` | corsHeaders, fetch |
| `license-server/src/handlers/activate.ts` | handleActivate, logAudit |

## Entry Points

Start here when exploring this area:

- **`authenticateOwnerRequest`** (Function) — `online-store/api/src/auth.ts:56`
- **`verifySessionToken`** (Function) — `online-store/api/src/crypto.ts:49`
- **`handleDashboardGetOrders`** (Function) — `online-store/api/src/handlers/dashboard.ts:122`
- **`handleDashboardGetProducts`** (Function) — `online-store/api/src/handlers/dashboard.ts:217`
- **`handleDashboardOverview`** (Function) — `online-store/api/src/handlers/dashboard.ts:58`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `authenticateOwnerRequest` | Function | `online-store/api/src/auth.ts` | 56 |
| `verifySessionToken` | Function | `online-store/api/src/crypto.ts` | 49 |
| `handleDashboardGetOrders` | Function | `online-store/api/src/handlers/dashboard.ts` | 122 |
| `handleDashboardGetProducts` | Function | `online-store/api/src/handlers/dashboard.ts` | 217 |
| `handleDashboardOverview` | Function | `online-store/api/src/handlers/dashboard.ts` | 58 |
| `handleDashboardUpdateOrderStatus` | Function | `online-store/api/src/handlers/dashboard.ts` | 166 |
| `handleDashboardUpdateProductOnlineSettings` | Function | `online-store/api/src/handlers/dashboard.ts` | 256 |
| `handleDashboardUpdateStoreSettings` | Function | `online-store/api/src/handlers/dashboard.ts` | 302 |
| `handleDashboardUpdateStoreTheme` | Function | `online-store/api/src/handlers/dashboard.ts` | 357 |
| `handleGetStore` | Function | `online-store/api/src/handlers/store.ts` | 3 |
| `handleGetStoreCategories` | Function | `online-store/api/src/handlers/store.ts` | 43 |
| `handleGetStoreProductDetail` | Function | `online-store/api/src/handlers/store.ts` | 143 |
| `handleGetStoreProducts` | Function | `online-store/api/src/handlers/store.ts` | 69 |
| `handleTrackOrder` | Function | `online-store/api/src/handlers/store.ts` | 398 |
| `handleGetPendingOrders` | Function | `online-store/api/src/handlers/sync.ts` | 228 |
| `handleGetSettings` | Function | `online-store/api/src/handlers/sync.ts` | 311 |
| `handleHeartbeat` | Function | `online-store/api/src/handlers/sync.ts` | 333 |
| `handleSyncStock` | Function | `online-store/api/src/handlers/sync.ts` | 135 |
| `handleUpdateOrdersStatus` | Function | `online-store/api/src/handlers/sync.ts` | 270 |
| `base64UrlEncode` | Function | `license-server/src/crypto.ts` | 5 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleAdmin → SafeStringCompare` | cross_community | 3 |
| `HandleAdmin → Part` | intra_community | 3 |

## How to Explore

1. `context({name: "authenticateOwnerRequest"})` — see callers and callees
2. `query({search_query: "handlers"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
