---
name: gitnexus-area-database
description: "Skill for the Database area of RAFIQ. 83 symbols across 4 files."
---

# Database

83 symbols | 4 files | Cohesion: 100%

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

## Entry Points

Start here when exploring this area:

- **`ApplyMigrations`** (Method) — `desktop/Database/MigrationRunner.cs:27`
- **`ComputeAuditHash`** (Method) — `desktop/Database/MigrationRunner.cs:8529`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ApplyMigrations` | Method | `desktop/Database/MigrationRunner.cs` | 27 |
| `ComputeAuditHash` | Method | `desktop/Database/MigrationRunner.cs` | 8529 |
| `RebaseRepairItem` | Class | `desktop/Database/MigrationRunner.cs` | 2625 |
| `ApplyMigration1` | Method | `desktop/Database/MigrationRunner.cs` | 2732 |
| `ApplyMigration10` | Method | `desktop/Database/MigrationRunner.cs` | 3392 |
| `ApplyMigration11` | Method | `desktop/Database/MigrationRunner.cs` | 3465 |
| `ApplyMigration12` | Method | `desktop/Database/MigrationRunner.cs` | 3503 |
| `ApplyMigration13` | Method | `desktop/Database/MigrationRunner.cs` | 3544 |
| `ApplyMigration14` | Method | `desktop/Database/MigrationRunner.cs` | 3630 |
| `ApplyMigration15` | Method | `desktop/Database/MigrationRunner.cs` | 3742 |
| `ApplyMigration16` | Method | `desktop/Database/MigrationRunner.cs` | 3933 |
| `ApplyMigration17` | Method | `desktop/Database/MigrationRunner.cs` | 4041 |
| `ApplyMigration18` | Method | `desktop/Database/MigrationRunner.cs` | 4077 |
| `ApplyMigration19` | Method | `desktop/Database/MigrationRunner.cs` | 4144 |
| `ApplyMigration2` | Method | `desktop/Database/MigrationRunner.cs` | 2892 |
| `ApplyMigration20` | Method | `desktop/Database/MigrationRunner.cs` | 4194 |
| `ApplyMigration21` | Method | `desktop/Database/MigrationRunner.cs` | 4298 |
| `ApplyMigration22` | Method | `desktop/Database/MigrationRunner.cs` | 4433 |
| `ApplyMigration23` | Method | `desktop/Database/MigrationRunner.cs` | 4519 |
| `ApplyMigration24` | Method | `desktop/Database/MigrationRunner.cs` | 4576 |

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
