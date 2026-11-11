# Encrypted database (Rafiq POS)

Since this change the store database `rafiq_pos.db` is **encrypted at rest** with SQLite3 Multiple Ciphers (ChaCha20, raw 256-bit key).
An ordinary user who copies the file and opens it with DB Browser for SQLite, `sqlite3`, a hex editor or a text search sees only random bytes.

## What it protects against, and what it does not

| Threat | Result |
|---|---|
| Employee / technician / competitor copies `rafiq_pos.db` (or a backup, a quarantine copy, the WAL file) and opens it with a free SQLite viewer | Stopped: "file is not a database"; no table names or product names are readable in the live file, the `-wal` file or the rollback journal, in steady state (see "Residual plaintext" below for the exceptions) |
| Someone searches the data folder for customer or product names | Stopped in steady state (verified by tests S105/S109/S115/S116 on db, wal, journal, backups, staging copies and a private temp folder) |
| A lost or stolen **PC or disk** | **The control is BitLocker / full-disk encryption, not this feature.** Anyone who has the whole PC also has `RafiqPOS.exe` and can use the key inside it (see limits). Backups on a lost USB drive stay inside their AES container protected by the owner recovery code; the database inside is now encrypted as well |
| Someone who **decompiles `RafiqPOS.exe`** or reads the running process | **NOT stopped.** The key is assembled at run time from masked fragments, so it is not a readable literal and not present as bytes/hex/base64 in the executable, but .NET code decompiles easily and a skilled person can recover the key (or simply call the program's own key code through reflection from another .NET process). No obfuscation tool is used. **One key is shared by every shop** (see limits) |
| Someone who logs in as the Windows user that runs the program and uses the program itself | Not a database-level concern: normal RBAC (PIN, roles) applies |
| Forensic recovery of the **old plain file** after the one-time conversion (undelete tools, Windows shadow copies / System Restore, SSD wear levelling, journaling or compressed volumes) | **NOT stopped.** The plain original is zero-filled and deleted, but the operating system may keep old blocks or shadow copies; a shop that needs this closed must clean free space / shadow copies itself. Backups made before this version also stay plain inside their AES container |
| Ransomware / disk failure / power cut | Unchanged: backups, WAL with `synchronous=FULL`, integrity checks, the sealed pre-encryption copy |

This is deliberate: the goal is "an ordinary user cannot open the file", not protection from a determined attacker. Do not describe it to a customer as military-grade security.

## How it works

* `desktop/Data/DatabaseKeyProvider.cs` (`internal`: no public type or member of `RafiqPOS.exe` returns the key; test S111 checks this by reflection): derives the key (HMAC-SHA256 over masked fragments) and installs it into `SQLiteConnection.ConnectionKeyHook`, so **every** connection in the process applies `PRAGMA cipher='chacha20'` and `PRAGMA key="x'..'"` right after open. The key bytes and the PRAGMA text are built per connection and the buffers are zeroed afterwards (best effort in managed memory). The cipher is named explicitly so a library default change can never change how our files are read (S104/S106 prove that a file made with another cipher, aes256cbc or sqlcipher, is not readable and lands in the key-mismatch state).
* **One global key for all installations, by owner decision**: backups and store packages must move between PCs, so there is no per-install key. See the limits section for what this means.
* The key must **never** change: every installed encrypted database would become unreadable. Test S104 pins the key's SHA-256 fingerprint and scans the built assembly and the source tree for the key (bytes, hex, base64).
* Per-connection modes (used only by conversion, legacy-file handling and tests): connection string keyword `Encryption=None` (open/create a plain file), `SQLiteConnection.SetEncryptionKey(byte[])` (another key). `DatabaseFileAccess.OpenExisting(path, readOnly)` opens an existing file in whichever format its header says.
* New databases (fresh install, tests, benchmark/demo temp DBs, migration import target) are created encrypted from the first byte; WAL and journal are encrypted too.
* Keyed connections use `temp_store = MEMORY` (the library default). `FILE` would write sort/index intermediates (including readable column values) to temp files; test S114 runs ORDER BY / GROUP BY / CREATE INDEX / VACUUM over 150,000 rows with a tiny cache and scans the temp folder while it runs. Very large reports on the 32-bit build use more RAM because of this; no soft heap limit is set (it could make big queries fail). Watch memory on very large stores.
* Busy handling: the command timeout of every shim command is `ceil(BusyTimeout / 1000)` seconds (minimum 1), so `BusyTimeout=5000` fails after about 5 s and `500` after about 1 s (the engine default of 30 s would otherwise apply). `BackupDatabase` gives up with `SQLiteException(Busy)` after 60 s. Tests S114.
* The native engine is loaded fail-closed (`SQLiteNative.EnsureInitialized`): `SetDefaultDllDirectories(APPLICATION_DIR | SYSTEM32)` is called first when the OS has it (Windows 7 needs KB2533623; absence is tolerated), the DLL is loaded by full path from the application folder, and a missing/blocked/wrong-bitness `sqlite3mc.dll` raises `DatabaseEngineMissingException` with an Arabic message ("sqlite3mc.dll missing or blocked by antivirus ... your data is intact ... reinstall"). It is not a corruption case: no restore is suggested and it does not count as a conversion failure (S111).
* File kind is decided by the header: `SQLite format 3\0` = legacy plain file; anything else = encrypted (or damaged/foreign).
* sqlite3mc stays on **2.4.0**. Moving to 2.6.x is a later item and needs a Windows 7 x86 pilot first.

## Existing shops: the one-time conversion at startup

`DatabaseEncryptionService.EnsureEncryptedAtStartup` runs before `DatabaseService.Initialize` opens the database, **on a worker thread** (`MainForm`: `PrepareEncryptionAtStartup`), so the window stays responsive. The splash shows Arabic step names and, during verification, the table being checked with a percentage and row counts. The close button is ignored (with an Arabic message) while the conversion runs (Windows shutdown is still honoured), and the splash safety timers are paused meanwhile and re-armed afterwards.

Files in `ProgramData\RafiqPOS\data\`:

| File | Meaning |
|---|---|
| `rafiq_pos.db` | live database (plain until the swap, encrypted after) |
| `rafiq_pos.db.converting` | the **encrypted candidate**, written directly from the read-only plain source with `VACUUM INTO 'file:...?cipher=chacha20&key=...'`. There is no plain working copy and no plain journal. The live file is never rekeyed or modified |
| `rafiq_pos.db.plain-old` | the original plain file, only between the two renames of the swap, then zero-filled and deleted |
| `rafiq_pos.db.pre-encryption` | **sealed rollback snapshot**: a byte copy of the verified encrypted candidate (same key; not readable by a viewer). Kept 14 days AND until 5 successful launches, then deleted automatically; or deleted by the root action `database:deletePreEncryptionCopy` |
| `rafiq_pos.db.plain-old.stale` | a stale plain `.plain-old` found beside a plain live file: set aside (not wiped) when a conversion starts and zero-filled only after that conversion has verified |
| `pre_conversion_backups.txt` | the pre-conversion container backups made by this class; only the newest 2 are kept (the 24-hour retries would otherwise add one per attempt); backups the owner made are never listed or touched |
| `rafiq_pos.db.bad_<guid>` | an encrypted file that failed its post-swap check; kept 14 days, then purged (and by factory reset) |
| `encryption_conversion.marker` | state, failure count, back-off, protected by an HMAC under a key derived from the product key. A marker that fails validation (edited, truncated, copied) is treated as a **fresh state** (0 failures), never as "stop" |
| `encryption.ok` | HMAC-protected evidence that this store was encrypted (see `UNEXPECTED_PLAIN_DATABASE`) |
| `pre_encryption_launches.txt` | launch counter for the retention rule |

Steps (every step before the swap only touches files the conversion created):

1. Preconditions: free space >= 3x (db + wal), `PRAGMA integrity_check` = ok on the plain DB, WAL checkpointed. Failure here = stay plain.
2. **Verified standard backup (hard precondition).** A normal application backup (the `rafiq_backup_*` RFBK container with the owner recovery code, plain inner database, protected by the container) is created in the default local backup folder (`<ProgramData>\RafiqPOS\backups`, never a possibly-missing USB drive) and **verified** immediately before the conversion. Its plaintext staging snapshot (`.raw`) is zero-filled and deleted. If the backup cannot be created or verified, **nothing is converted**: state `Failed`, alert, retry later. This backup is also the downgrade path (below).
3. Encrypted candidate (`VACUUM INTO` an encrypted file), journal mode DELETE.
4. **Strict verification**: encrypted header, keyed open, `integrity_check`, cipher = chacha20, identical `PRAGMA user_version`, identical schema text, and for **every table** an identical row count and SHA-256 over every row of every column (typed, blobs and full REAL precision). Stricter than "counts and SUM of money columns".
5. Seal: copy the verified candidate to `.pre-encryption`.
6. The swap aborts if the plain source has a non-empty WAL at that point. Then: rename live -> `.plain-old`, rename `.converting` -> live (every rename retried about 8 times with 150-500 ms back-off on `IOException` / `UnauthorizedAccessException`, read-only attributes cleared: antivirus often holds a file for a moment), open the new live file with the key and `quick_check`; if that fails the encrypted file is renamed to `.bad_*` and the original renamed back.
7. Done: `.plain-old` zero-filled and deleted, marker deleted, `encryption.ok` written, plain-file sweep (below).

Crash safety (tests S107, S113, S116, S118): a crash or power cut at **every** step leaves either the untouched plain original (byte-identical), or an encrypted verified file, or - between the two renames - no live file but `.plain-old` + the verified candidate. The next start finishes or undoes the swap from the file layout alone:

* live file missing, `.plain-old` present: if `.converting` verifies row for row against `.plain-old`, it is moved to live; otherwise `.plain-old` is moved back and the conversion starts over;
* live encrypted and `.plain-old` still present: after a keyed `quick_check` of the live file, `.plain-old` is wiped and deleted (it is never deleted while the encrypted file does not open);
* a stale `.plain-old` beside a **plain** live file is wiped before the first rename (the live file is authoritative).

**A 0-byte `rafiq_pos.db` is not a database** (`liveUsable` = exists and length > 0): it never hides swap leftovers, and a recovery deletes the stub before moving the real file into place.

**The live file is never missing silently.** If the rollback of a failed swap also fails, `EncryptionSwapFatalException` is thrown and is *not* swallowed: nothing is deleted (`.converting`, `.plain-old`, `.pre-encryption` and the marker stay exactly as they are) and the program stops with an Arabic message ("your store data is saved and unchanged ... contact support"). The same guard runs at every start: if `rafiq_pos.db` is missing while any of `.plain-old`, `.converting`, `.pre-encryption` or the marker exists, the program tries the recovery above, and otherwise stops fatally (`ENCRYPTION_SWAP_INTERRUPTED`). It **never creates a new empty database** next to those leftovers. Leftover rules: `.plain-old` or `.converting` (or a valid marker whose state is `Swapping`) = recover or `ENCRYPTION_SWAP_INTERRUPTED`; **only** the sealed `.pre-encryption` copy = its own state `ENCRYPTION_SEALED_ONLY` (Arabic message, no new database) and the root action `database:restoreFromPreEncryptionCopy`; a marker that does not say "swapping" (an old failure record) is harmless and is deleted, then the new database is created. Transient I/O errors while verifying the candidate during a recovery are retried and, if they persist, fatal; they are never read as "mismatch" (a good candidate is not deleted because of a hiccup).

Failures: the store keeps running on the original plain file (every default connection is unkeyed, `DatabaseKeyProvider.IsPlainFallbackActive`), the failure is logged, and `SystemHealthService` shows `database_encryption_pending` (warning; critical after three failures) plus `PlainLeftoverRemains` if the plain original could not be deleted. Back-off: failure 1 -> retry after 15 minutes, failure 2 -> after 2 hours, **from failure 3 on: critical alert and one attempt per start at most once every 24 hours, forever** (it does not stop for good). A back-off read from the marker is never longer than a day (a "next attempt" more than 24 h ahead can only come from a wrong clock and is treated as due). A failure in a step **after** the swap (marker write, cleanup) is not a failed conversion: the live file is encrypted, the outcome is `Converted`, and the leftover plain original is wiped at the next start. `DatabaseService.Initialize` refuses "running plain" unless the live file really has the plain header. A missing engine DLL (`DatabaseEngineMissingException`) is not counted as a conversion failure. Root action `database:retryEncryptionConversion` resets the counter (and forgets the "was encrypted" evidence).

Timing: conversion of a 337 MB WAL-mode store (db + non-empty WAL) took about 12.6 s on a macOS arm64 laptop with about 145 MB resident memory including the test host (test S118; run it with `RAFIQ_TEST_LARGE_MB=300`; the default fixture is 40 MB). **Windows timing is unverified**: expect it to be several times slower on a spinning disk or with antivirus scanning.

### Downgrade rule (important for support)

**The previous build (1.1.0) cannot open a converted store.** Rollback to the old build means restoring the pre-conversion backup:

1. Do **not** delete anything in `ProgramData\RafiqPOS\`.
2. Find the container backup made right before the conversion: the newest `rafiq_backup_*` in `ProgramData\RafiqPOS\backups` that predates the conversion (the conversion time is in `logs/` and in `rafiq_pos.db.pre-encryption`'s timestamp). Its inner database is a plain, old-format SQLite file.
3. Install the old build over the new one, start it, and restore that backup with the owner recovery code (backup screen or the recovery modal). Everything entered **after** that backup is lost; if that matters, first export the current data with the new build (`database:exportDecrypted`, root) and re-enter or import it.
4. Before upgrading again, delete `ProgramData\RafiqPOS\data\encryption.ok` (a plain database next to that evidence is otherwise treated as `UNEXPECTED_PLAIN_DATABASE`), and delete a stale `rafiq_pos.db.pre-encryption` and `encryption_conversion.marker`.

### Root action `database:restoreFromPreEncryptionCopy`

Root only (`REQUIRE_ROOT`), allowed also while the licence is expired (it recovers data). Copies the sealed `rafiq_pos.db.pre-encryption` back as `rafiq_pos.db` **only when the live file is missing or 0 bytes** and no `.plain-old` / `.converting` exists; the sealed copy must open with the product key and pass `quick_check`, the copy is compared byte for byte and moved with the retrying rename; the sealed copy is kept. The audit entry (`استرجاع_من_نسخة_ما_قبل_التشفير`) is written after the restore, into the restored store, and always in the application log. **Practical note:** in the `ENCRYPTION_SEALED_ONLY` state the program stops at startup, so the IPC action is reachable only in a running program whose live file disappeared; support normally does the same by hand (copy the sealed file to `rafiq_pos.db`: it is already a complete encrypted database).

### Readable plain files elsewhere: the sweep (H2a)

At conversion time and at **every encrypted start** `SweepPlainFiles` looks for readable plain SQLite files (header `SQLite format 3`) in `data\`, `migration_backups\`, `pre_restore\`, `quarantine\`, `<ProgramData>\RafiqPOS\backups\` and in the temp folder (`rafiq_staging_*`, `rafiq_bk_verify_*` older than 2 h). Staging snapshots (`.raw`, `.tmp` in `backups\`, stale temp staging) are zero-filled and deleted. Copies of data (migration backups, safety snapshots, quarantine) are **re-encrypted in place** (verified) so they stay usable. `.plain-old` is skipped: it can be the only readable copy of the store and is handled only by the swap logic. Re-encryption order (crash safe): `X.sweep` (encrypted, verified) is written first, then `X` -> `X.sweep-plain` and `X.sweep` -> `X`, and only then is the plain copy zero-filled; a crash between the renames is finished by name at the next start. In `backups\` only `.raw` / `.tmp` staging files are handled; any other readable file there is reported, not touched. A file that can neither be re-encrypted nor safely deleted is **never deleted**: it is listed, logged, and shown as the `database_unprotected_copies` alert (tests S115).

### `UNEXPECTED_PLAIN_DATABASE` (H2c)

After the first successful encrypted start the store has an HMAC-protected `encryption.ok` file. If later `rafiq_pos.db` is a **plain** database while valid evidence exists, the program does **not** adopt, convert or touch it: it enters the same user-initiated recovery state as corruption with failure code `UNEXPECTED_PLAIN_DATABASE` and an Arabic message (a plain file in a store that ran encrypted is not the store's own data; restore the latest backup, or contact support). No automatic action. Support can decide with the root action `database:retryEncryptionConversion` (forgets the evidence so a legitimately restored plain database can be converted). **Residual:** the evidence is only a local file; a user who deletes `encryption.ok` (and the marker) can put a plain database back and it will be converted as a legacy store. This is a guard against accidents and casual swapping, not against a determined user.

### Recovery steps (support)

| Situation | What you see | What to do |
|---|---|---|
| Conversion failed once or twice | Warning alert, store works | Nothing; it retries at the next start after the back-off. Read `logs/error.log` for the reason (disk space and a failed pre-conversion backup are the usual ones) |
| Three or more failures | Critical alert, store works on the plain file, retried once every 24 h | Fix the cause (free disk space, antivirus locking the folder), then as root run `database:retryEncryptionConversion` and restart the program |
| `rafiq_pos.db.plain-old` exists after a start | Warning "a plain copy remains" | Restart once (it is removed at the next start). If it persists check file permissions/antivirus; never delete `rafiq_pos.db` itself |
| `rafiq_pos.db.converting` exists | Left by a crash | Ignore; it is rebuilt or removed by the next start |
| Fatal message "store data is saved and unchanged" (`ENCRYPTION_SWAP_INTERRUPTED`) | The program does not start | Do not delete anything. Copy the whole data folder, stop antivirus real-time scanning of `ProgramData\RafiqPOS`, start again (the recovery runs by itself); otherwise contact support with the copy |
| `database_unprotected_copies` alert | A readable old copy could not be protected | Contact support; do not delete the file blindly, it may hold the only good copy of something |
| Need the data in plain SQLite (support, DB Browser) | - | Log in as developer root and run `database:exportDecrypted` with `{ "path": "D:\\export\\store.db" }` (fully-qualified local path, new file, `.db`, outside the data folder; no UNC, `..`, drive-relative or stream names; the audit entry is written **before** the copy and the export is refused if it cannot be written); the file is a verified plain copy; delete it when done |
| Need to roll back to the state before encryption | - | See the downgrade rule above (restore the pre-conversion container backup with the old build). For the first 14 days the sealed `rafiq_pos.db.pre-encryption` also exists: it is encrypted with the product key; copy it to a scratch folder as `rafiq_pos.db` and use a build that has the key to export it decrypted. An old build cannot open it |

## Wrong key / unreadable file (`ENCRYPTION_KEY_MISMATCH`)

If the file header is **not** plain SQLite and the header page (page 1) does not decrypt with this program's key, the file is either **damaged** (page 1 is rewritten on every commit, so a torn write at a power cut is plausible) or **written by a different build** (another key or cipher; a file made with the product key but another cipher such as aes256cbc is exactly this case and is tested). The two cannot be told apart.

Behaviour (tests S106):

* The state uses the **same user-initiated recovery flow as corruption**: `DatabaseService.IsCorrupted` is true, `database:checkIntegrity` returns `isCorrupt` + `isKeyMismatch` + `failureCode = "ENCRYPTION_KEY_MISMATCH"` + `latestValidBackupFile/Date/Size`, `DatabaseRecoveryModal` appears, and `database:restore` with the owner recovery code works exactly as for corruption.
* **Zero automatic action:** no quarantine copy, no restore, no file created, modified or deleted until the user chooses (tests hash the file and list the folder before and after, and again after the status/login/wrong-code calls). Only `session_open.marker`, the pre-existing run flag, is written.
* The Arabic message says plainly that the file is either damaged or written by a different build, that nothing was changed, and that the user can restore a backup (owner recovery code) or contact support; nothing happens unless they choose.
* If the user restores, `ReplaceDatabaseFile` keeps a byte-identical copy of the unreadable file in `pre_restore/` before replacing it.
* A damaged **data** page (header page fine) takes the normal corruption flow, including the quarantine copy (which stays encrypted).

Playbook for support:

1. Do not delete or replace `rafiq_pos.db`; copy the whole data folder somewhere safe first.
2. Check the installed build is the official one (same key and cipher). Install the official build over it and restart; if the file opens, nothing else is needed.
3. Otherwise use the recovery modal: restore the latest backup with the owner recovery code. The unreadable file stays in `pre_restore/`.

## Every path that copies or reads a database file

| Path | Plaintext risk (before) | Handling now |
|---|---|---|
| `BackupService.CreateBackup` staging `.raw` | plain snapshot next to the backup until encrypted | `.raw` has the live file's format (encrypted; plain only for the one backup taken before the conversion of a legacy store); wrapped in the AES container; the `.raw` is then **zero-filled and deleted** (`SecureDelete`); the startup sweep removes leftovers of a crash |
| Backup verification / `VerifyBackupDetailed` | decrypted plain temp file | header-based open; inner snapshot of a new backup is encrypted; legacy plain inner file only exists in temp briefly and is zero-filled and deleted in `finally` (restore staging db, `-wal`, `-shm` included); stale ones are removed by the startup sweep (`rafiq_staging_*`, `rafiq_bk_verify_*` older than 2 h) |
| `DatabaseService.RestoreFromBackup` | plain staging in `%TEMP%` | header-based verify; a legacy plain backup is converted (verified row for row, encrypted candidate written directly from the plain source) before it can become live; new backups are copied as they are |
| `ReplaceDatabaseFile` safety snapshot (`pre_restore/`) | plain copy | same format as the live file (encrypted) |
| `MigrationRunner.BackupDatabaseBeforeMigration` (`migration_backups/`) | plain copy | same format as the source (encrypted for an encrypted store) |
| Quarantine of a corrupt DB (`quarantine/`) | plain copy | byte copy of the encrypted file (+WAL, also encrypted); never made for a key failure |
| `MigrationService` export / inspect / import (store packages) | plain DB inside the package + staging dirs | package DB has the live format; import accepts both legacy (plain) and new packages and converts a plain one before the swap; staging dirs are temp; plain SQLite files in them are zero-filled before the directory is deleted |
| `BenchmarkService`, `SearchBenchmarkRunner`, `DemoDataService`, self-test runners | temp DBs | created through default connections = encrypted |
| `SupportService` bundle | - | does not embed the database (only size and health) |
| `DatabaseService.FactoryReset` / `Reset_Rafiq_POS.bat` | old store data surviving a reset | after a successful reset the sealed `.pre-encryption` copy, the conversion marker, the launch counter and any `.converting` / `.plain-old` leftovers are zero-filled (best effort) and deleted (`PurgeEncryptionArtifacts`, test S109); anything that could not be removed is named in the result message. The bat deletes the whole `ProgramData\RafiqPOS` folder (no zero-fill). Not touched by a reset, by design: the mandatory pre-reset safety backup, and `backups/`, `pre_restore/`, `migration_backups/`, `quarantine/` |
| `MainForm` early theme read (before `DatabaseService.Initialize`) | opens `rafiq_pos.db` | header-based open, so it works for a legacy plain file and for an encrypted one |
| `database:exportDecrypted` | intentionally plain | root only, audit entry written first (refused if it fails), fully-qualified local new `.db` path outside the data folder (real-path check, so links/junctions into the data folder are refused), verified row for row, work file zero-filled and deleted on failure (S109, S117) |
| `health:getStatus` (public IPC action) | would disclose encryption state and failure text | an unauthenticated caller only receives `{ overallStatus }`; detail is returned to an authenticated session and by the admin action `database:getEncryptionStatus` (S117) |

## Limits (honest list)

What this feature is: an ordinary user, an employee or a technician cannot open the file with a SQLite viewer. It is **not** protection from a determined attacker. Do not promise more to a customer. In particular:

1. **The key is inside the application.** Anyone with a copy of `RafiqPOS.exe` (a stolen or cloned PC, a downloaded installer) can recover it by decompiling, by debugging, or by calling the program's own code. No obfuscation is used (owner decision).
2. **One key for all shops** (owner decision: backups and store packages must move between PCs). A key recovered from one installation opens every shop's database and backups of the same format. Rotating the key would require a new build and a re-encryption of every store.
3. **Replay / rollback.** An attacker who can write to the data folder can put an *older* valid encrypted database (or backup restored by hand) in place of the current one; the program cannot tell the difference. The audit-log hash chain lives inside the database and rolls back with it.
4. **Delete-to-reset.** Deleting `rafiq_pos.db` (and the evidence files) makes the program create a new empty database: sales history can be removed, and for licensing this means a store can "reset" its local state. Licence checks must not rely on data stored only inside this database; the licence server remains the authority. `encryption.ok` is a guard against accidents, not against a user who deletes it.
5. **Page splicing / copy-paste between files.** The cipher authenticates pages (HMAC per page in sqlite3mc), but pages from two valid databases made with the same key (any shop, any date) can be mixed by someone who has the key; this is a consequence of limit 1 and 2.
6. **Cross-shop use.** A database or backup from shop A opens on shop B's PC. Nothing in the file binds it to a machine or a licence.
7. **Unsigned native engine.** `sqlite3mc.dll` is not Authenticode-signed here; its SHA-256 is pinned at build time (`installer/prerequisites/NUGET_DLL_SHA256.txt`, `installer/verify_nuget_dlls.ps1`, run by `Build_Installer.bat` and CI) but **not checked at startup** (owner decision). Replacing the DLL in the install folder needs write access to it: the installer locks `{app}` (below) and refuses a folder outside Program Files.
8. **Install-folder permissions.** The installer sets `icacls {app} /inheritance:r` with SYSTEM and Administrators full control and Users read-execute, and `NextButtonClick` / `PrepareToInstall` refuse a folder not under Program Files. A portable copy of the program, or an installation by hand into a user-writable folder, does not get this protection.
9. **Residual plaintext.** Old plain blocks from before the conversion (see the threat table), plain backups made by older versions (inside the AES container), a `.plain-old` that could not be deleted (alert), unreadable copies listed in `database_unprotected_copies`, and a root `database:exportDecrypted` output the support person forgot to delete.
10. **Memory.** The key and the decrypted pages are in process memory while the program runs; buffers holding the key are zeroed after use but managed memory cannot be guaranteed clean.
11. **Downgrade.** The previous build cannot open converted stores (see the downgrade rule).
12. **Review finding F10** was reviewed and deliberately skipped by the owner; nothing is implemented for it.

Windows 7 x86 hardware and the Inno Setup script (`icacls`, Pascal `NextButtonClick`), `GetFinalPathNameByHandle` and `SetDefaultDllDirectories` behaviour were **not** run on real Windows in this work (macOS only plus CI); the pilot below covers them.

## Operational notes

* DB Browser for SQLite cannot open the file. Use `database:exportDecrypted` (root) to get a plain copy for support.
* Backups made by this version contain an encrypted database; **older program versions cannot restore them**. Store packages (`.rafiqpkg`) made by this version likewise cannot be imported by an older version. Packages and backups made by older versions are accepted.
* Installer: `{app}` is read-only for ordinary users; a FRESH install must be strictly inside Program Files (or Program Files (x86)) in a new or empty folder (never `C:\Program Files` itself or another program's folder); an UPGRADE or silent install over an existing Rafiq folder (leaf `RafiqPOS`, with `unins000.dat` or the exe) is allowed anywhere, logged, shown once as a suppressible advice box (none when silent) and still locked; the lock (`icacls /inheritance:r`) is applied only to a folder created by this Setup or already holding a Rafiq install (`ShouldLockAppDir`), never to a shared parent; and the NuGet DLLs shipped (managed + `sqlite3mc.dll` win-x86) are checked against pinned SHA-256 values at build time.
* Performance: see "Performance measurements" below (updated with each measurement run).
* The owner pilot on Windows 7 32-bit is mandatory before rollout: the sqlite3mc x86 DLL is verified on macOS arm64 (managed shim, engine behaviour) and by the Windows CI job, not on real Win7 hardware. Moving to sqlite3mc 2.6.x also needs that pilot first.

## Pilot checklist: process-wide DLL search restriction (Windows)

`SQLiteNative` calls `SetDefaultDllDirectories(APPLICATION_DIR | SYSTEM32)` once, early. It is **process-wide**: from then on every later `LoadLibrary` in the process (WebView2 loader and runtime, printing/driver components, antivirus hooks) searches only the application folder and System32 unless it uses a full path. The pilot must therefore confirm on real machines: Windows 7 SP1 x86 with WebView2 Fixed Runtime 109 (needs KB2533623 for the API; its absence is tolerated and means no restriction), Windows 10/11 with the Evergreen runtime, receipt/label printing, barcode scanner and cash-drawer drivers, and the first-run splash. If any component fails to load, remove only that call (the load of `sqlite3mc.dll` stays by full path and fail-closed).

## Test modes

* Default: the NUnit suite and the in-app self-tests run against **encrypted** databases.
* `RAFIQ_TEST_PLAIN=1`: the same suite against plain databases (compare engines, debug with a viewer). Encryption scenarios that need an encrypted store are ignored in that mode; S110 (shim sanity) and S114's timing tests always run.
* Scenarios: S104 key provider / new DB encrypted; S105 keyed open everywhere; S106 conversion and key-mismatch recovery; S107 crash points and retries; S108 backup/restore/packages (private temp folder); S109 retention, export, concurrency, full cycle; S110 plain-mode shim sanity; S111 key hygiene and engine load failure; S112 pre-conversion backup; S113 swap safety; S114 busy timeouts, backup deadline, temp files; S115 sweep and state trust; S116 no plaintext intermediates; S117 export path and health hardening; S118 large WAL-mode store (`RAFIQ_TEST_LARGE_MB`, default 40); S119 final review fixes (0-byte stub, sealed-only, post-swap isolation, sweep crash safety, stale copies, back-off cap, sealed-copy check, backup pruning).
* `cd desktop/RafiqPOS.Tests.Portable && dotnet test` (see its README).

## Performance measurements

macOS arm64, SQLite 3.53.4 / sqlite3mc 2.4.0, same process and same data, plain vs encrypted (ChaCha20). **macOS numbers only**: `fsync` is cheap there, so the benchmarks are CPU-bound and exaggerate ratios compared with a Windows disk. Command: `dotnet test --filter "TestCategory=Performance" --logger "console;verbosity=detailed"` (add `RAFIQ_TEST_PLAIN=1` for the plain column).

| Measurement | Plain | Encrypted | Delta | Budget |
|---|---|---|---|---|
| Connection open + first schema read (production keywords, median of 400) | 1.89-1.99 ms | 2.15-2.23 ms | **+0.23 to +0.26 ms** | <= 3 ms: met |
| Open + read 1000 rows (median of 200) | 2.56-2.60 ms | 2.81-2.93 ms | +0.25 to +0.33 ms | - |
| Full scan SUM over 50,000 rows, fresh connection | 5.2-5.4 ms | 8.9-9.1 ms | x1.7 (decrypt ~1 GB/s) | - |
| Exact barcode SQL on an open connection, 50k products | 0.086 ms | 0.098 ms | +14% | target < 0.1 ms: met (borderline) |
| `GetByExactBarcode` whole call (fresh connection per call) | 2.28 ms | 2.74 ms | +20% | - |
| `Search` (LIKE %q% over 50k products) | 17-30 ms | 33-45 ms | x1.5-1.9 | - |
| `GetSmartCatalog(200)` | 29 ms | 44 ms | +52% | - |
| **1000 sales via `SaleService` (3 items each)** | **20.3 ms/sale** | **29.1 ms/sale** | **+43%** (earlier run +53%) | **<= +25%: NOT met; accepted by the owner** |
| Full NUnit suite (portable harness, 878 tests; plain skips 85 encryption-only tests) | 3 m 54 s | 5 m 45 s | +47% (the 33 new encryption tests add ~1 m: 150k-row temp-file test, 5 s busy-timeout test, large WAL stores) | - |
| Conversion of a 337 MB WAL-mode legacy store (db + WAL) | - | 12.6 s, ~145 MB resident (incl. test host) | - | - |
| File size of the same data | 3.86 MB | 3.87 MB | +0.3% | - |

Why the sale benchmark misses the budget: the application opens a **fresh connection for almost every repository call** (no pooling, by design for parity with the old library), about 7 connections per sale. Every fresh connection starts with an empty page cache, so the schema and data pages it touches are decrypted again, and every write encrypts its pages twice (journal and database). Measured split per 1000 sales: open +2.8 s, close +1.8 s, statements +0.5 s, row reads the rest. The cipher itself is not the problem: ChaCha20 was the cheapest portable cipher tested (aes256cbc was 2x slower per operation; aegis was as cheap as plain on arm64 but depends on CPU AES instructions that a Win7 x86 machine may lack); `PRAGMA hmac_check=0` gave nothing; the key PRAGMA costs 0.015 ms.

What would fix it, not done here (needs an owner decision, see the report): connection pooling. Experiment only, not shipped: with `Pooling=True` the plain benchmark drops from 19.4 to 2.5 ms/sale and the encrypted one from 29.7 to 5.9 ms/sale (3.1 ms/sale when a pooled handle is not re-keyed on every open), so pooling would make the encrypted store faster than today's plain store. Pooling changes lock/close timing across the whole application (the code calls `ClearAllPools` before file operations) and needs a safe way to know a pooled handle is already keyed, so it is a separate, tested change.
