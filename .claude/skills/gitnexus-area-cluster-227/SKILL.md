---
name: gitnexus-area-cluster-227
description: "Skill for the Cluster_227 area of RAFIQ. 22 symbols across 1 files."
---

# Cluster_227

22 symbols | 1 files | Cohesion: 95%

## When to Use

- Working with code in `frontend/`
- Understanding how buildPageSizeCss, buildStandaloneReportHtml, isRollPaper work
- Modifying cluster_227-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/utils/printReport.ts` | applyPageStyle, buildPageSizeCss, buildStandaloneReportHtml, clearPageStyle, clearPrintTarget (+17) |

## Entry Points

Start here when exploring this area:

- **`buildPageSizeCss`** (Function) — `frontend/src/utils/printReport.ts:64`
- **`buildStandaloneReportHtml`** (Function) — `frontend/src/utils/printReport.ts:441`
- **`isRollPaper`** (Function) — `frontend/src/utils/printReport.ts:43`
- **`printReport`** (Function) — `frontend/src/utils/printReport.ts:261`
- **`resolvePrintMode`** (Function) — `frontend/src/utils/printReport.ts:53`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `buildPageSizeCss` | Function | `frontend/src/utils/printReport.ts` | 64 |
| `buildStandaloneReportHtml` | Function | `frontend/src/utils/printReport.ts` | 441 |
| `isRollPaper` | Function | `frontend/src/utils/printReport.ts` | 43 |
| `printReport` | Function | `frontend/src/utils/printReport.ts` | 261 |
| `resolvePrintMode` | Function | `frontend/src/utils/printReport.ts` | 53 |
| `applyPageStyle` | Function | `frontend/src/utils/printReport.ts` | 177 |
| `clearPageStyle` | Function | `frontend/src/utils/printReport.ts` | 190 |
| `clearPrintTarget` | Function | `frontend/src/utils/printReport.ts` | 166 |
| `collectStyleText` | Function | `frontend/src/utils/printReport.ts` | 423 |
| `getPrinterStatus` | Function | `frontend/src/utils/printReport.ts` | 457 |
| `print` | Function | `frontend/src/utils/printReport.ts` | 458 |
| `enterPrintLayout` | Function | `frontend/src/utils/printReport.ts` | 205 |
| `cleanup` | Function | `frontend/src/utils/printReport.ts` | 220 |
| `escapeHtml` | Function | `frontend/src/utils/printReport.ts` | 436 |
| `hostInvoke` | Function | `frontend/src/utils/printReport.ts` | 239 |
| `isWebViewHost` | Function | `frontend/src/utils/printReport.ts` | 235 |
| `markPrintTarget` | Function | `frontend/src/utils/printReport.ts` | 144 |
| `openPrintUi` | Function | `frontend/src/utils/printReport.ts` | 245 |
| `showA4OnlyHint` | Function | `frontend/src/utils/printReport.ts` | 132 |
| `toSavedReport` | Function | `frontend/src/utils/printReport.ts` | 415 |

## How to Explore

1. `context({name: "buildPageSizeCss"})` — see callers and callees
2. `query({search_query: "cluster_227"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
