---
name: gitnexus-area-root
description: "Skill for the Root area of RAFIQ. 37 symbols across 7 files."
---

# Root

37 symbols | 7 files | Cohesion: 80%

## When to Use

- Working with code in `frontend/`
- Understanding how applyMotion, applyMotionLevel, applyMotionStyle work
- Modifying root-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/utils/motion.ts` | applyMotion, applyMotionLevel, applyMotionStyle, detectDeviceHardwareTier, loadCachedMotion (+11) |
| `frontend/src/views/root/SignatureImageField.tsx` | commit, handleFiles, removeAt, reset, SignatureImageField (+3) |
| `frontend/src/views/root/RootMotionCard.tsx` | handleEnabled, handleLevel, handleStyle, persist, replay |
| `frontend/src/views/root/RootStatusPage.tsx` | runCheck, runPingTest, runPrinterTest, runSqliteTest |
| `frontend/src/utils/diagnosticsSummary.ts` | buildStatusRows, text |
| `frontend/src/utils/signatureImage.ts` | serializeSignatureImages |
| `frontend/src/views/root/useSystemSummary.ts` | rows |

## Entry Points

Start here when exploring this area:

- **`applyMotion`** (Function) — `frontend/src/utils/motion.ts:127`
- **`applyMotionLevel`** (Function) — `frontend/src/utils/motion.ts:164`
- **`applyMotionStyle`** (Function) — `frontend/src/utils/motion.ts:169`
- **`detectDeviceHardwareTier`** (Function) — `frontend/src/utils/motion.ts:31`
- **`loadCachedMotion`** (Function) — `frontend/src/utils/motion.ts:102`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `applyMotion` | Function | `frontend/src/utils/motion.ts` | 127 |
| `applyMotionLevel` | Function | `frontend/src/utils/motion.ts` | 164 |
| `applyMotionStyle` | Function | `frontend/src/utils/motion.ts` | 169 |
| `detectDeviceHardwareTier` | Function | `frontend/src/utils/motion.ts` | 31 |
| `loadCachedMotion` | Function | `frontend/src/utils/motion.ts` | 102 |
| `loadCachedMotionLevel` | Function | `frontend/src/utils/motion.ts` | 144 |
| `loadCachedMotionStyle` | Function | `frontend/src/utils/motion.ts` | 154 |
| `parseMotionLevel` | Function | `frontend/src/utils/motion.ts` | 80 |
| `parseMotionSetting` | Function | `frontend/src/utils/motion.ts` | 92 |
| `parseMotionStyle` | Function | `frontend/src/utils/motion.ts` | 86 |
| `setMotionEnabled` | Function | `frontend/src/utils/motion.ts` | 134 |
| `setMotionLevel` | Function | `frontend/src/utils/motion.ts` | 175 |
| `setMotionStyle` | Function | `frontend/src/utils/motion.ts` | 186 |
| `startMotion` | Function | `frontend/src/utils/motion.ts` | 226 |
| `syncMotionFromHost` | Function | `frontend/src/utils/motion.ts` | 203 |
| `handleEnabled` | Function | `frontend/src/views/root/RootMotionCard.tsx` | 169 |
| `handleLevel` | Function | `frontend/src/views/root/RootMotionCard.tsx` | 178 |
| `handleStyle` | Function | `frontend/src/views/root/RootMotionCard.tsx` | 190 |
| `persist` | Function | `frontend/src/views/root/RootMotionCard.tsx` | 156 |
| `replay` | Function | `frontend/src/views/root/RootMotionCard.tsx` | 120 |

## How to Explore

1. `context({name: "applyMotion"})` — see callers and callees
2. `query({search_query: "root"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
