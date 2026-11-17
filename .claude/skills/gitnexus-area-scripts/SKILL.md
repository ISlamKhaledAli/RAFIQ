---
name: gitnexus-area-scripts
description: "Skill for the Scripts area of RAFIQ. 21 symbols across 3 files."
---

# Scripts

21 symbols | 3 files | Cohesion: 100%

## When to Use

- Working with code in `frontend/`
- Understanding how allowedTokens, convertProject, convertSource work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/scripts/generate_egyptian_drugs_catalog.js` | cleanPrice, detectDosageForm, detectIsAntibiotic, detectRefrigerated, detectRoute (+6) |
| `frontend/scripts/px-to-rem.mjs` | allowedTokens, convertProject, convertSource, swap, text (+2) |
| `frontend/scripts/sync-signatures.mjs` | pngNames, syncSignatures, validateSignaturePng |

## Entry Points

Start here when exploring this area:

- **`allowedTokens`** (Function) — `frontend/scripts/px-to-rem.mjs:94`
- **`convertProject`** (Function) — `frontend/scripts/px-to-rem.mjs:98`
- **`convertSource`** (Function) — `frontend/scripts/px-to-rem.mjs:64`
- **`swap`** (Function) — `frontend/scripts/px-to-rem.mjs:67`
- **`text`** (Function) — `frontend/scripts/px-to-rem.mjs:76`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `allowedTokens` | Function | `frontend/scripts/px-to-rem.mjs` | 94 |
| `convertProject` | Function | `frontend/scripts/px-to-rem.mjs` | 98 |
| `convertSource` | Function | `frontend/scripts/px-to-rem.mjs` | 64 |
| `swap` | Function | `frontend/scripts/px-to-rem.mjs` | 67 |
| `text` | Function | `frontend/scripts/px-to-rem.mjs` | 76 |
| `listSourceFiles` | Function | `frontend/scripts/px-to-rem.mjs` | 84 |
| `pxToRem` | Function | `frontend/scripts/px-to-rem.mjs` | 59 |
| `syncSignatures` | Function | `frontend/scripts/sync-signatures.mjs` | 62 |
| `validateSignaturePng` | Function | `frontend/scripts/sync-signatures.mjs` | 36 |
| `cleanPrice` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 168 |
| `detectDosageForm` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 47 |
| `detectIsAntibiotic` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 152 |
| `detectRefrigerated` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 144 |
| `detectRoute` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 68 |
| `detectShelf` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 131 |
| `detectTherapeutic` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 96 |
| `extractStrength` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 88 |
| `generateStandardBarcode` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 157 |
| `parseCSV` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 9 |
| `run` | Function | `frontend/scripts/generate_egyptian_drugs_catalog.js` | 175 |

## How to Explore

1. `context({name: "allowedTokens"})` — see callers and callees
2. `query({search_query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
