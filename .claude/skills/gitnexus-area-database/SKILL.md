---
name: gitnexus-area-database
description: "Skill for the Database area of RAFIQ. 87 symbols across 5 files."
---

# Database

87 symbols | 5 files | Cohesion: 100%

## When to Use

- Working with code in `desktop/`
- Understanding how ApplyMigrations, ComputeAuditHash work
- Modifying database-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/Database/MigrationRunner.cs` | RebaseRepairItem, ApplyMigration1, ApplyMigration10, ApplyMigration11, ApplyMigration12 (+56) |
| `desktop/Database/MigrationRunner.Idempotency.cs` | ApplyIdempotencyMigrations, ApplyMigration60, ApplyMigration61, ApplyMigration62, EnsureColumn (+4) |
| `desktop/Database/MigrationRunner.UserHierarchy.cs` | ApplyMigration63, ApplyMigration64, ApplyMigration65, ApplyMigration66, ApplyUserHierarchyMigrations (+3) |
| `desktop/Database/MigrationRunner.Cafe.cs` | ApplyCafeHospitalityMigrations, ApplyMigration56, ApplyMigration57, ApplyMigration58, ApplyMigration59 |
| `desktop/Database/MigrationRunner.OnlineStore.cs` | ApplyMigration67, ApplyMigration68, ApplyMigration69, ApplyOnlineStoreMigrations |

## Entry Points

Start here when exploring this area:

- **`ApplyMigrations`** (Method) — `desktop/Database/MigrationRunner.cs:27`
- **`ComputeAuditHash`** (Method) — `desktop/Database/MigrationRunner.cs:8530`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ApplyMigrations` | Method | `desktop/Database/MigrationRunner.cs` | 27 |
| `ComputeAuditHash` | Method | `desktop/Database/MigrationRunner.cs` | 8530 |
| `RebaseRepairItem` | Class | `desktop/Database/MigrationRunner.cs` | 2626 |
| `ApplyMigration1` | Method | `desktop/Database/MigrationRunner.cs` | 2733 |
| `ApplyMigration10` | Method | `desktop/Database/MigrationRunner.cs` | 3393 |
| `ApplyMigration11` | Method | `desktop/Database/MigrationRunner.cs` | 3466 |
| `ApplyMigration12` | Method | `desktop/Database/MigrationRunner.cs` | 3504 |
| `ApplyMigration13` | Method | `desktop/Database/MigrationRunner.cs` | 3545 |
| `ApplyMigration14` | Method | `desktop/Database/MigrationRunner.cs` | 3631 |
| `ApplyMigration15` | Method | `desktop/Database/MigrationRunner.cs` | 3743 |
| `ApplyMigration16` | Method | `desktop/Database/MigrationRunner.cs` | 3934 |
| `ApplyMigration17` | Method | `desktop/Database/MigrationRunner.cs` | 4042 |
| `ApplyMigration18` | Method | `desktop/Database/MigrationRunner.cs` | 4078 |
| `ApplyMigration19` | Method | `desktop/Database/MigrationRunner.cs` | 4145 |
| `ApplyMigration2` | Method | `desktop/Database/MigrationRunner.cs` | 2893 |
| `ApplyMigration20` | Method | `desktop/Database/MigrationRunner.cs` | 4195 |
| `ApplyMigration21` | Method | `desktop/Database/MigrationRunner.cs` | 4299 |
| `ApplyMigration22` | Method | `desktop/Database/MigrationRunner.cs` | 4434 |
| `ApplyMigration23` | Method | `desktop/Database/MigrationRunner.cs` | 4520 |
| `ApplyMigration24` | Method | `desktop/Database/MigrationRunner.cs` | 4577 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ApplyMigrations → CheckAndRotate` | cross_community | 7 |
| `ApplyMigrations → DatabaseStorageException` | cross_community | 6 |
| `ApplyMigrations → DescribeArabic` | cross_community | 6 |
| `ApplyMigrations → DatabaseSchemaTooNewException` | intra_community | 3 |

## How to Explore

1. `context({name: "ApplyMigrations"})` — see callers and callees
2. `query({search_query: "database"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
