---
name: gitnexus-area-context
description: "Skill for the Context area of RAFIQ. 24 symbols across 7 files."
---

# Context

24 symbols | 7 files | Cohesion: 73%

## When to Use

- Working with code in `frontend/`
- Understanding how hasPermission, when, when work
- Modifying context-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/utils/tourSteps.ts` | canDashboard, canOpenShift, when, when, when (+10) |
| `frontend/src/utils/unsavedChangesGuard.ts` | attendAll, saveAll, save |
| `frontend/src/context/useUnsavedChanges.ts` | drawAttention, onAttention |
| `frontend/src/context/AuthContext.tsx` | hasPermission |
| `frontend/src/context/FeaturesProvider.tsx` | isEnabled |
| `frontend/src/context/featureRequires.ts` | isFeatureEffectivelyEnabled |
| `frontend/src/views/settings/usePrinterExtras.ts` | save |

## Entry Points

Start here when exploring this area:

- **`hasPermission`** (Function) — `frontend/src/context/AuthContext.tsx:119`
- **`when`** (Function) — `frontend/src/utils/tourSteps.ts:119`
- **`when`** (Function) — `frontend/src/utils/tourSteps.ts:164`
- **`when`** (Function) — `frontend/src/utils/tourSteps.ts:165`
- **`when`** (Function) — `frontend/src/utils/tourSteps.ts:166`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `hasPermission` | Function | `frontend/src/context/AuthContext.tsx` | 119 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 119 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 164 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 165 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 166 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 186 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 189 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 190 |
| `isEnabled` | Function | `frontend/src/context/FeaturesProvider.tsx` | 87 |
| `isFeatureEffectivelyEnabled` | Function | `frontend/src/context/featureRequires.ts` | 6 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 104 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 105 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 154 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 256 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 259 |
| `when` | Function | `frontend/src/utils/tourSteps.ts` | 260 |
| `onAttention` | Function | `frontend/src/context/useUnsavedChanges.ts` | 88 |
| `attendAll` | Function | `frontend/src/utils/unsavedChangesGuard.ts` | 75 |
| `saveAll` | Function | `frontend/src/utils/unsavedChangesGuard.ts` | 51 |
| `save` | Function | `frontend/src/views/settings/usePrinterExtras.ts` | 90 |

## How to Explore

1. `context({name: "hasPermission"})` — see callers and callees
2. `query({search_query: "context"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
