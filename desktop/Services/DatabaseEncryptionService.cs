using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using RafiqPOS.Common;
using RafiqPOS.Data;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public enum EncryptionStartupOutcome
    {
        // Encryption is switched off for this process (test mode): nothing to do
        NotApplicable = 0,
        // No database file yet: the first one is created encrypted by the migration runner
        NewDatabase = 1,
        AlreadyEncrypted = 2,
        // A legacy plain database was converted during this start (or an interrupted conversion was completed)
        Converted = 3,
        // The legacy plain database stays in use (conversion failed, is backing off, or keeps failing)
        RunningPlain = 4,
        // The live file is missing but conversion leftovers exist: a new empty database must NEVER be created
        FatalMissingDatabase = 5,
        // A plain database appeared although this store is known to have been encrypted: not adopted, no automatic action
        UnexpectedPlain = 6,
        // The live file is missing or empty and only the sealed pre-encryption copy exists: no new database is created;
        // the root action database:restoreFromPreEncryptionCopy (or support copying the sealed file back) is the way out
        FatalSealedOnly = 7
    }

    public sealed class EncryptionStartupResult
    {
        public EncryptionStartupOutcome Outcome { get; set; }
        public string Message { get; set; }
        public int Failures { get; set; }
        // Three or more failures in a row: critical alert (automatic retries continue once a day)
        public bool Stopped { get; set; }
        public bool RecoveredInterruptedSwap { get; set; }
        public bool PlainLeftoverRemains { get; set; }
        public DateTime? NextAttemptUtc { get; set; }
        public string LastError { get; set; }
        public string PreConversionBackupFile { get; set; }

        public EncryptionStartupResult()
        {
            Message = string.Empty;
            LastError = string.Empty;
        }
    }

    public sealed class EncryptionStatus
    {
        public bool DatabaseEncrypted { get; set; }
        public string Cipher { get; set; }
        public bool PreEncryptionCopyPresent { get; set; }
        public DateTime? PreEncryptionCopyCreatedUtc { get; set; }
        public int PreEncryptionLaunches { get; set; }
        public int RetentionDays { get; set; }
        public int RetentionLaunches { get; set; }
        public string ConversionState { get; set; }
        public int ConversionFailures { get; set; }
        public string ConversionLastError { get; set; }
        public bool ConversionStopped { get; set; }
        public bool PlainLeftoverPresent { get; set; }
        public int UnprotectedLeftovers { get; set; }
    }

    // Outcome of the sweep for readable plain SQLite files left in the store folders
    public sealed class PlainSweepResult
    {
        public List<string> Reencrypted = new List<string>();
        public List<string> Wiped = new List<string>();
        public List<string> Unprotected = new List<string>();
    }

    // Raised for a failed conversion step; the message is the Arabic reason shown to the owner.
    public sealed class DatabaseConversionException : Exception
    {
        public DatabaseConversionException(string message) : base(message) { }
        public DatabaseConversionException(string message, Exception inner) : base(message, inner) { }
    }

    // The swap could not be completed AND could not be undone: the live database file may be missing. Never swallowed;
    // startup stops with this message and every file (.plain-old, .converting, .pre-encryption) is kept exactly as it is.
    public sealed class EncryptionSwapFatalException : Exception
    {
        public const string ArabicMessage = "تعذر إكمال تشفير قاعدة البيانات وتعذر إرجاعها تلقائياً بسبب منع الوصول إلى الملفات (غالباً برنامج الحماية). بيانات المحل محفوظة ولم يتم تغييرها أو حذفها. لا تحذف أي ملف من مجلد البيانات وتواصل مع الدعم الفني.";

        public EncryptionSwapFatalException(Exception cause, Exception rollbackFailure)
            : base(ArabicMessage + "\n\n" + (cause != null ? cause.Message : string.Empty) + (rollbackFailure != null ? "\n" + rollbackFailure.Message : string.Empty), rollbackFailure ?? cause)
        {
        }
    }

    // Test seam: behaves like a power cut. Never caught by the conversion code, so the files stay exactly as they were at that point.
    internal sealed class SimulatedCrashException : Exception
    {
        public SimulatedCrashException(string point) : base("simulated crash at " + point) { }
    }

    // Converts a legacy plain database into an encrypted one at startup, crash-safe and re-entrant.
    //
    //   rafiq_pos.db                   live database (plain until the swap, encrypted after)
    //   rafiq_pos.db.converting        the encrypted candidate, written DIRECTLY from the plain source (VACUUM INTO an encrypted file):
    //                                  no plain working copy, no plain journal. The live file is never rekeyed
    //   rafiq_pos.db.plain-old         the original plain file between the two renames of the swap (wiped and deleted afterwards)
    //   rafiq_pos.db.pre-encryption    SEALED rollback snapshot: a byte copy of the verified encrypted candidate (same key)
    //   rafiq_pos.db.bad_*             an encrypted file that failed its post-swap check (kept 14 days)
    //   encryption_conversion.marker   state, failure count, back-off (HMAC protected)
    //   encryption.ok                  evidence that this store was encrypted (HMAC protected)
    //
    // Steps: preconditions -> verified standard backup -> encrypted candidate -> verify (row-exact fingerprint) -> seal ->
    // swap (two renames, retried) -> post-swap check -> wipe the plain original. Every step before the swap only touches files this
    // class created, so a failure or crash there just means "stay on the plain database and start over".
    public static class DatabaseEncryptionService
    {
        public const int MaxAttempts = 3;
        public const int RetentionDays = 14;
        public const int RetentionLaunches = 5;
        public const int BadFileRetentionDays = 14;
        public const string WorkSuffix = ".converting";
        public const string OldPlainSuffix = ".plain-old";
        public const string PreEncryptionSuffix = ".pre-encryption";
        public const string BadSuffixPrefix = ".bad_";
        public const string MarkerFileName = "encryption_conversion.marker";
        public const string EvidenceFileName = "encryption.ok";
        public const string LaunchCounterFileName = "pre_encryption_launches.txt";
        private const int RenameAttempts = 8;

        // Fault points (test seam)
        public const string FaultAfterSnapshot = "after-snapshot";
        public const string FaultAfterEncrypt = "after-encrypt";
        public const string FaultAfterVerify = "after-verify";
        public const string FaultAfterSeal = "after-seal";
        public const string FaultBeforeSwap = "before-swap";
        public const string FaultRenameLiveToOld = "rename-live-to-old";
        public const string FaultAfterRenameLiveToOld = "after-rename-live-to-old";
        public const string FaultRenameWorkToLive = "rename-work-to-live";
        public const string FaultAfterRenameWorkToLive = "after-rename-work-to-live";
        public const string FaultRenameRollback = "rename-rollback";
        public const string FaultRenameLiveToBad = "rename-live-to-bad";
        public const string FaultAfterPostSwapCheck = "after-post-swap-check";
        public const string FaultDuringWipe = "during-wipe";
        public const string FaultExportBeforeMove = "export-before-move";
        public const string FaultAfterSealCopy = "after-seal-copy";
        public const string FaultSwappedMarkerWrite = "swapped-marker-write";
        public const string FaultRecoveryVerify = "recovery-verify";
        public const string FaultSweepAfterEncrypt = "sweep-after-encrypt";
        public const string FaultSweepBetweenRenames = "sweep-between-renames";
        public const string StaleSuffix = ".stale";
        public const string SweepPlainSuffix = ".sweep-plain";
        public const string PreConversionListFileName = "pre_conversion_backups.txt";
        public const int MaxPreConversionBackups = 2;

        internal static Action<string> FaultInjector;
        // Free bytes on the volume holding the path; < 0 = unknown (the check is then skipped with a warning)
        internal static Func<string, long> FreeSpaceProvider = DefaultFreeSpace;
        internal static Func<DateTime> UtcNow = delegate { return DateTime.UtcNow; };
        // Creates and verifies the standard app backup (container + recovery code) taken right before a conversion; throws on failure.
        // Arguments: live plain database path, backup folder. Returns the backup file path.
        internal static Func<string, string, string> PreConversionBackupProvider = DefaultPreConversionBackup;
        internal static int RetryBaseDelayMilliseconds = 150;

        private static volatile bool _converting;

        public static EncryptionStartupResult LastStartupResult { get; private set; }
        public static PlainSweepResult LastSweepResult { get; private set; }

        // True while the conversion runs: the host ignores window-close requests meanwhile
        public static bool IsConversionRunning
        {
            get { return _converting; }
        }

        internal static void ResetTestSeams()
        {
            FaultInjector = null;
            FreeSpaceProvider = DefaultFreeSpace;
            UtcNow = delegate { return DateTime.UtcNow; };
            PreConversionBackupProvider = DefaultPreConversionBackup;
            RetryBaseDelayMilliseconds = 150;
            _converting = false;
        }

        private static void Fault(string point)
        {
            Action<string> injector = FaultInjector;
            if (injector != null) injector(point);
        }

        private static long DefaultFreeSpace(string path)
        {
            try
            {
                string root = Path.GetPathRoot(Path.GetFullPath(path));
                if (string.IsNullOrEmpty(root)) return -1;
                DriveInfo drive = new DriveInfo(root);
                return drive.IsReady ? drive.AvailableFreeSpace : -1;
            }
            catch (Exception)
            {
                return -1;
            }
        }

        public static string MarkerPath(string dataFolder) { return Path.Combine(dataFolder, MarkerFileName); }
        public static string EvidencePath(string dataFolder) { return Path.Combine(dataFolder, EvidenceFileName); }
        public static string PreEncryptionPath(string dbPath) { return dbPath + PreEncryptionSuffix; }

        public const string SealedOnlyMessage = "ملف قاعدة البيانات الرئيسي غير موجود وتوجد نسخة ما قبل التشفير المحفوظة فقط. بيانات المحل محفوظة ولم يتم تغييرها، ولم يُنشأ أي قاعدة بيانات جديدة. تواصل مع الدعم الفني لاسترجاع النسخة المحفوظة (إجراء المستخدم الجذر: database:restoreFromPreEncryptionCopy) ولا تحذف أي ملف.";

        internal static bool LiveUsable(string dbPath)
        {
            try { return File.Exists(dbPath) && new FileInfo(dbPath).Length > 0; }
            catch (IOException) { return File.Exists(dbPath); }
        }

        // A 0-byte stub is not a database; it is removed only when a recovery is about to put a real file under that name
        private static void DeleteEmptyStub(string dbPath)
        {
            if (File.Exists(dbPath) && new FileInfo(dbPath).Length == 0)
            {
                File.SetAttributes(dbPath, FileAttributes.Normal);
                File.Delete(dbPath);
            }
        }

        private static bool MarkerSaysSwapping(string dataFolder)
        {
            ConversionMarker m = ConversionMarker.Read(MarkerPath(dataFolder));
            return string.Equals(m.State, "Swapping", StringComparison.Ordinal);
        }

        // Test helper: a validly tagged marker
        internal static void WriteMarkerForTests(string dataFolder, string state, int attempts, DateTime? nextAttemptUtc)
        {
            ConversionMarker m = new ConversionMarker();
            m.State = state;
            m.Attempts = attempts;
            m.LastError = "test";
            m.NextAttemptUtc = nextAttemptUtc;
            m.Write(MarkerPath(dataFolder));
        }

        // ---------------------------------------------------------------- startup entry point

        public static EncryptionStartupResult EnsureEncryptedAtStartup(string dataFolder, string dbPath, Action<string> progress)
        {
            EncryptionStartupResult result = new EncryptionStartupResult();
            LastStartupResult = result;

            if (!DatabaseKeyProvider.IsDefaultEncryptionEnabled)
            {
                result.Outcome = EncryptionStartupOutcome.NotApplicable;
                return result;
            }

            string work = dbPath + WorkSuffix;
            string old = dbPath + OldPlainSuffix;
            string sealedPath = PreEncryptionPath(dbPath);

            // "Usable" = exists AND is not a 0-byte stub: an empty file left by a crash or a tool is not a database and must not
            // hide the leftovers of an interrupted swap (File.Exists alone would let the NewDatabase path run over them)
            bool liveUsable = LiveUsable(dbPath);

            // A kill between the two swap renames leaves no live file; the layout alone says how to finish or undo it
            if (!liveUsable && File.Exists(old))
            {
                Report(progress, "جاري إكمال تأمين قاعدة البيانات بعد توقف سابق...");
                try
                {
                    if (File.Exists(work) && VerifyCandidateAgainst(old, work))
                    {
                        DeleteEmptyStub(dbPath);
                        MoveWithRetry(work, dbPath, FaultRenameWorkToLive);
                        result.RecoveredInterruptedSwap = true;
                        Logger.Warn("تم إكمال استبدال قاعدة البيانات المشفرة بعد توقف سابق أثناء التبديل.");
                    }
                    else
                    {
                        DeleteEmptyStub(dbPath);
                        MoveWithRetry(old, dbPath, FaultRenameRollback);
                        DeleteWorkFiles(work);
                        Logger.Warn("تم إرجاع قاعدة البيانات الأصلية بعد توقف سابق أثناء التبديل؛ ستتم إعادة المحاولة لاحقاً.");
                    }
                }
                catch (SimulatedCrashException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    // nothing is deleted: .plain-old and .converting stay where they are for support
                    throw new EncryptionSwapFatalException(ex, null);
                }
                liveUsable = LiveUsable(dbPath);
            }

            // The live file is missing (or an empty stub) and conversion leftovers exist: never start a new empty database next to them
            if (!liveUsable)
            {
                if (File.Exists(old) || File.Exists(work) || MarkerSaysSwapping(dataFolder))
                {
                    result.Outcome = EncryptionStartupOutcome.FatalMissingDatabase;
                    result.Message = "ملف قاعدة البيانات الرئيسي غير موجود لكن توجد ملفات من عملية التشفير. بيانات المحل محفوظة ولم يتم تغييرها، ولم يُنشأ أي قاعدة بيانات جديدة. لا تحذف أي ملف من مجلد البيانات وتواصل مع الدعم الفني.";
                    Logger.Error("FatalMissingDatabase: " + dbPath + " مفقود مع بقاء ملفات التشفير", null);
                    return result;
                }
                if (File.Exists(sealedPath))
                {
                    result.Outcome = EncryptionStartupOutcome.FatalSealedOnly;
                    result.Message = SealedOnlyMessage;
                    Logger.Error("FatalSealedOnly: " + dbPath + " مفقود وتوجد نسخة ما قبل التشفير فقط", null);
                    return result;
                }
                // a marker that does not say "swapping" (an old failure record) is harmless: a missing live file simply means a new database
                if (File.Exists(MarkerPath(dataFolder)))
                {
                    Logger.Warn("حذف علامة تحويل قديمة لا ترتبط بقاعدة بيانات موجودة.");
                    DeleteQuietly(MarkerPath(dataFolder));
                }
            }

            DatabaseFileKind kind = DatabaseKeyProvider.DetectFileKind(dbPath);
            switch (kind)
            {
                case DatabaseFileKind.Missing:
                case DatabaseFileKind.Empty:
                    DeleteWorkFiles(work);
                    result.Outcome = EncryptionStartupOutcome.NewDatabase;
                    return result;

                case DatabaseFileKind.NotPlain:
                    FinishEncryptedStart(dataFolder, dbPath, work, old, result);
                    return result;

                default:
                    if (HasValidEvidence(dataFolder))
                    {
                        // This store ran encrypted before: a plain file now is not the store's own data. Not adopted, not converted, not touched.
                        result.Outcome = EncryptionStartupOutcome.UnexpectedPlain;
                        result.Message = "قاعدة البيانات الموجودة غير مشفرة بينما هذا المحل كان يعمل بقاعدة مشفرة. لم يتم تغيير أو استخدام الملف تلقائياً. إن كنت قد أرجعت نسخة قديمة عمداً فتواصل مع الدعم الفني، وإلا استرجع آخر نسخة احتياطية من نافذة الاسترجاع.";
                        Logger.Error("UNEXPECTED_PLAIN_DATABASE: " + dbPath, null);
                        return result;
                    }
                    return StartPlainConversion(dataFolder, dbPath, progress, result);
            }
        }

        // The live file is already encrypted: remove leftovers of a finished (or recovered) conversion
        private static void FinishEncryptedStart(string dataFolder, string dbPath, string work, string old, EncryptionStartupResult result)
        {
            result.Outcome = result.RecoveredInterruptedSwap ? EncryptionStartupOutcome.Converted : EncryptionStartupOutcome.AlreadyEncrypted;
            if (File.Exists(old))
            {
                if (LiveEncryptedDatabaseOpens(dbPath))
                {
                    try
                    {
                        WipeAndDelete(old);
                        result.Outcome = EncryptionStartupOutcome.Converted;
                        Logger.Info("تم حذف النسخة الأصلية غير المشفرة بعد اكتمال التشفير.");
                    }
                    catch (SimulatedCrashException) { throw; }
                    catch (Exception ex)
                    {
                        result.PlainLeftoverRemains = true;
                        result.Message = "تعذر حذف النسخة الأصلية غير المشفرة، ستتم إعادة المحاولة عند التشغيل التالي.";
                        Logger.Warn("تعذر حذف النسخة الأصلية غير المشفرة: " + ex.Message);
                    }
                }
                else
                {
                    // Never destroy the only readable copy when the encrypted file does not open
                    result.PlainLeftoverRemains = true;
                    result.Message = "تعذر التحقق من قاعدة البيانات المشفرة، تم الإبقاء على النسخة الأصلية للحماية.";
                    Logger.Error("القاعدة المشفرة لا تفتح؛ تم الإبقاء على النسخة الأصلية: " + old, null);
                }
            }
            DeleteWorkFiles(work);
            PurgeOldBadFiles(dbPath);
            if (StaleFiles(dbPath).Length > 0 && LiveEncryptedDatabaseOpens(dbPath)) WipeStaleCopies(dbPath);
            if (!result.PlainLeftoverRemains)
            {
                try { if (File.Exists(MarkerPath(dataFolder))) File.Delete(MarkerPath(dataFolder)); } catch (IOException) { }
                if (LiveEncryptedDatabaseOpensQuick(dbPath)) RecordEncryptionEvidence(dataFolder);
            }
            SweepPlainFiles(Path.GetDirectoryName(dataFolder), dataFolder, dbPath);
        }

        private static EncryptionStartupResult StartPlainConversion(string dataFolder, string dbPath, Action<string> progress, EncryptionStartupResult result)
        {
            result.Outcome = EncryptionStartupOutcome.RunningPlain;
            ConversionMarker marker = ConversionMarker.Read(MarkerPath(dataFolder));
            result.Failures = marker.Attempts;
            result.LastError = marker.LastError ?? string.Empty;
            result.Stopped = marker.Attempts >= MaxAttempts;

            if (marker.NextAttemptUtc.HasValue && marker.NextAttemptUtc.Value > UtcNow())
            {
                result.NextAttemptUtc = marker.NextAttemptUtc;
                result.Message = result.Stopped
                    ? "تعذر تشفير قاعدة البيانات بعد عدة محاولات. يعمل البرنامج على القاعدة الحالية دون فقدان أي بيانات وستتم إعادة المحاولة تلقائياً مرة كل 24 ساعة. تواصل مع الدعم الفني."
                    : "تم تأجيل تشفير قاعدة البيانات إلى وقت لاحق بعد محاولة غير ناجحة. يعمل البرنامج على القاعدة الحالية.";
                return result;
            }

            _converting = true;
            try
            {
                ConvertLivePlainDatabase(dataFolder, dbPath, marker, progress, result);
                result.Outcome = EncryptionStartupOutcome.Converted;
                result.Failures = 0;
                result.Stopped = false;
                result.LastError = string.Empty;
                Logger.Info("تم تشفير قاعدة البيانات بنجاح والتحقق منها.");
            }
            catch (SimulatedCrashException)
            {
                throw;
            }
            catch (EncryptionSwapFatalException)
            {
                // never swallowed: the live file may be missing, every leftover stays where it is
                throw;
            }
            catch (DatabaseEngineMissingException)
            {
                // not a conversion failure and not counted: the engine itself is missing
                throw;
            }
            catch (Exception ex)
            {
                if (DatabaseKeyProvider.DetectFileKind(dbPath) == DatabaseFileKind.NotPlain)
                {
                    // The swap itself succeeded: the live file is already the encrypted one. A failure in a later step (marker, cleanup)
                    // is NOT a failed conversion: never fall back to "running plain" on an encrypted file.
                    Logger.Error("خطأ بعد اكتمال تبديل القاعدة المشفرة؛ القاعدة الحية مشفرة وسيتم إنهاء التنظيف عند التشغيل", ex);
                    try
                    {
                        FinishEncryptedStart(dataFolder, dbPath, dbPath + WorkSuffix, dbPath + OldPlainSuffix, result);
                    }
                    catch (SimulatedCrashException) { throw; }
                    catch (Exception finishEx) { Logger.Warn("تعذر إنهاء تنظيف ما بعد التشفير: " + finishEx.Message); }
                    result.Outcome = EncryptionStartupOutcome.Converted;
                    result.Failures = 0;
                    result.Stopped = false;
                    result.LastError = string.Empty;
                    return result;
                }
                marker.Attempts++;
                marker.LastError = ex.Message;
                marker.State = "Failed";
                // 15 minutes, then 2 hours, then once a day (the alert stays critical, retries continue, one attempt per start)
                marker.NextAttemptUtc = UtcNow().AddMinutes(marker.Attempts == 1 ? 15 : (marker.Attempts == 2 ? 120 : 24 * 60));
                try { marker.Write(MarkerPath(dataFolder)); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                // the candidate is ours, but it is only removed while a live file exists (never next to a missing live file)
                if (File.Exists(dbPath)) DeleteWorkFiles(dbPath + WorkSuffix);
                result.Failures = marker.Attempts;
                result.LastError = ex.Message;
                result.Stopped = marker.Attempts >= MaxAttempts;
                result.NextAttemptUtc = marker.NextAttemptUtc;
                result.Message = "تعذر تشفير قاعدة البيانات الآن ويستمر البرنامج بالعمل على القاعدة الحالية دون فقدان أي بيانات. السبب: " + ex.Message;
                Logger.Error("فشل تشفير قاعدة البيانات (المحاولة " + marker.Attempts + ")", ex);
            }
            finally
            {
                _converting = false;
            }
            return result;
        }

        // ---------------------------------------------------------------- the conversion

        private static void ConvertLivePlainDatabase(string dataFolder, string dbPath, ConversionMarker marker, Action<string> progress, EncryptionStartupResult result)
        {
            string markerPath = MarkerPath(dataFolder);
            string work = dbPath + WorkSuffix;
            string old = dbPath + OldPlainSuffix;
            string sealedPath = PreEncryptionPath(dbPath);
            string sealedTmp = sealedPath + ".tmp";
            string baseFolder = Path.GetDirectoryName(dataFolder);

            marker.State = "Started";
            marker.StartedUtc = UtcNow();
            marker.Write(markerPath);

            // Anything a previous attempt left behind is ours and is rebuilt from scratch
            DeleteWorkFiles(work);
            DeleteQuietly(sealedTmp);
            if (File.Exists(old))
            {
                // A plain .plain-old beside a plain live file is a stale leftover (the live file is authoritative). It is NOT wiped yet:
                // it is set aside and zero-filled only after this conversion has verified, so a failing conversion never destroys data
                string aside = old + StaleSuffix;
                if (File.Exists(aside)) aside = aside + "_" + Guid.NewGuid().ToString("N");
                Logger.Warn("وُجدت نسخة قديمة غير مشفرة بجانب قاعدة البيانات الحالية؛ نُقلت جانباً وستُحذف بعد نجاح التشفير: " + aside);
                MoveWithRetry(old, aside, FaultRenameRollback);
            }

            Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... يرجى عدم إغلاق البرنامج (فحص السلامة)");
            SQLiteConnection.ClearAllPools();
            long dbSize = new FileInfo(dbPath).Length;
            long walSize = File.Exists(dbPath + "-wal") ? new FileInfo(dbPath + "-wal").Length : 0;
            long free = FreeSpaceProvider(dataFolder);
            if (free >= 0 && free < 3 * (dbSize + walSize))
            {
                throw new DatabaseConversionException(string.Format(CultureInfo.InvariantCulture,
                    "مساحة القرص غير كافية للتشفير: المتاح {0:0.0} ميجابايت والمطلوب {1:0.0} ميجابايت على الأقل.",
                    free / 1048576.0, 3 * (dbSize + walSize) / 1048576.0));
            }

            using (SQLiteConnection plain = DatabaseFileAccess.Open(dbPath, false, true))
            {
                DatabaseFileAccess.Execute(plain, "PRAGMA temp_store=MEMORY;");
                if (!DatabaseFileAccess.IntegrityCheckPasses(plain))
                {
                    throw new DatabaseConversionException("فحص سلامة قاعدة البيانات الحالية لم ينجح، لذلك لن يتم تشفيرها قبل إصلاحها.");
                }
                // Fold the WAL into the main file: the swap moves only rafiq_pos.db
                object busy = null;
                using (SQLiteCommand cmd = new SQLiteCommand("PRAGMA wal_checkpoint(TRUNCATE);", plain))
                using (SQLiteDataReader reader = cmd.ExecuteReader())
                {
                    if (reader.Read()) busy = reader.GetValue(0);
                }
                if (busy != null && Convert.ToInt32(busy, CultureInfo.InvariantCulture) != 0)
                {
                    throw new DatabaseConversionException("قاعدة البيانات مشغولة بعملية أخرى حالياً.");
                }
            }
            SQLiteConnection.ClearAllPools();

            // Hard precondition: a verified standard backup (container + owner recovery code) in the default local backup folder
            Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... (نسخة احتياطية موثقة قبل التشفير)");
            string backupFile;
            try
            {
                backupFile = PreConversionBackupProvider(dbPath, Path.Combine(baseFolder, "backups"));
            }
            catch (SimulatedCrashException) { throw; }
            catch (DatabaseEngineMissingException) { throw; }
            catch (Exception ex)
            {
                throw new DatabaseConversionException("تعذر إنشاء نسخة احتياطية موثقة قبل التشفير، لذلك لن يتم تشفير القاعدة الآن. " + ex.Message, ex);
            }
            result.PreConversionBackupFile = backupFile;
            marker.State = "BackedUp";
            marker.Write(markerPath);
            SQLiteConnection.ClearAllPools();

            Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... (الخطوة 1 من 5: إنشاء النسخة المشفرة)");
            CreateEncryptedCopy(dbPath, work);
            marker.State = "Snapshotted";
            marker.Write(markerPath);
            Fault(FaultAfterSnapshot);

            Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... (الخطوة 2 من 5: فتح النسخة المشفرة)");
            using (SQLiteConnection candidate = DatabaseFileAccess.Open(work, false, false))
            {
                DatabaseFileAccess.Execute(candidate, "PRAGMA journal_mode=DELETE;");
            }
            SQLiteConnection.ClearAllPools();
            marker.State = "Encrypted";
            marker.Write(markerPath);
            Fault(FaultAfterEncrypt);

            VerifyEquivalent(dbPath, work, delegate(string line) { Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... (الخطوة 3 من 5: " + line + ")"); });
            marker.State = "Verified";
            marker.Write(markerPath);
            Fault(FaultAfterVerify);

            Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... (الخطوة 4 من 5: حفظ نسخة ما قبل التشفير)");
            File.Copy(work, sealedTmp, true);
            Fault(FaultAfterSealCopy);
            if (!FilesIdentical(work, sealedTmp))
            {
                DeleteQuietly(sealedTmp);
                throw new DatabaseConversionException("نسخة ما قبل التشفير المحفوظة لا تطابق النسخة المشفرة المتحقق منها، تم إلغاء التشفير.");
            }
            ReplaceFile(sealedTmp, sealedPath);
            marker.State = "Sealed";
            marker.Write(markerPath);
            Fault(FaultAfterSeal);

            Report(progress, "جاري تأمين قاعدة البيانات بالتشفير لأول مرة... (الخطوة 5 من 5: التبديل)");
            Fault(FaultBeforeSwap);
            if (File.Exists(dbPath + "-wal") && new FileInfo(dbPath + "-wal").Length > 0)
            {
                throw new DatabaseConversionException("ملف السجل (WAL) غير فارغ قبل التبديل، تم إلغاء التشفير لحماية البيانات.");
            }
            DeleteQuietly(dbPath + "-wal");
            DeleteQuietly(dbPath + "-shm");

            marker.State = "Swapping";
            marker.Write(markerPath);
            // first rename: if it fails nothing has moved and the failure is an ordinary one
            MoveWithRetry(dbPath, old, FaultRenameLiveToOld);
            Fault(FaultAfterRenameLiveToOld);
            try
            {
                MoveWithRetry(work, dbPath, FaultRenameWorkToLive);
            }
            catch (SimulatedCrashException) { throw; }
            catch (Exception ex)
            {
                try
                {
                    MoveWithRetry(old, dbPath, FaultRenameRollback);
                }
                catch (SimulatedCrashException) { throw; }
                catch (Exception rollbackFailure)
                {
                    throw new EncryptionSwapFatalException(ex, rollbackFailure);
                }
                throw;
            }
            Fault(FaultAfterRenameWorkToLive);

            // The encrypted file now carries the name the application opens: prove it before the plain original goes away
            if (!LiveEncryptedDatabaseOpens(dbPath))
            {
                SQLiteConnection.ClearAllPools();
                string bad = dbPath + BadSuffixPrefix + Guid.NewGuid().ToString("N");
                try
                {
                    MoveWithRetry(dbPath, bad, FaultRenameLiveToBad);
                    MoveWithRetry(old, dbPath, FaultRenameRollback);
                }
                catch (SimulatedCrashException) { throw; }
                catch (Exception rollbackFailure)
                {
                    throw new EncryptionSwapFatalException(new DatabaseConversionException("القاعدة المشفرة لم تفتح بعد التبديل."), rollbackFailure);
                }
                throw new DatabaseConversionException("القاعدة المشفرة لم تفتح بعد التبديل، تم إرجاع القاعدة الأصلية.");
            }
            Fault(FaultAfterPostSwapCheck);

            // From here the encrypted file IS the database: every remaining step is cleanup and is isolated, a failure only leaves
            // work for the next start (never a "failed conversion")
            try
            {
                marker.State = "Swapped";
                Fault(FaultSwappedMarkerWrite);
                marker.Write(markerPath);
            }
            catch (SimulatedCrashException) { throw; }
            catch (Exception ex)
            {
                Logger.Warn("تعذر حفظ علامة اكتمال التبديل: " + ex.Message);
            }
            try
            {
                WipeAndDelete(old);
            }
            catch (SimulatedCrashException) { throw; }
            catch (Exception ex)
            {
                // The encrypted database is live and verified; the plain leftover is removed at the next start
                result.PlainLeftoverRemains = true;
                Logger.Warn("تعذر حذف النسخة الأصلية غير المشفرة الآن: " + ex.Message);
            }
            if (!File.Exists(old))
            {
                WipeStaleCopies(dbPath);
                try { File.Delete(markerPath); }
                catch (SimulatedCrashException) { throw; }
                catch (Exception ex) { Logger.Warn("تعذر حذف علامة التحويل: " + ex.Message); }
            }
            RecordEncryptionEvidence(dataFolder);
            try { PurgeOldBadFiles(dbPath); }
            catch (SimulatedCrashException) { throw; }
            catch (Exception ex) { Logger.Warn("تعذر تنظيف الملفات القديمة: " + ex.Message); }
            SweepPlainFiles(baseFolder, dataFolder, dbPath);
        }

        // ---------------------------------------------------------------- the standard backup taken before a conversion

        private static string DefaultPreConversionBackup(string dbPath, string backupFolder)
        {
            string plainConn = "Data Source=" + dbPath + ";Version=3;BusyTimeout=5000;Encryption=None;";
            SettingsRepository settings = new SettingsRepository(plainConn);
            BackupService backup = new BackupService(plainConn, dbPath, settings, null, new EncryptionService());
            BackupResult created = backup.CreateBackup(backupFolder);
            if (created == null || !created.Success || !created.IsVerified || string.IsNullOrEmpty(created.BackupFilePath))
            {
                throw new InvalidOperationException(created != null && !string.IsNullOrEmpty(created.Message) ? created.Message : "فشل إنشاء النسخة الاحتياطية.");
            }
            if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(created.BackupFilePath)), Path.GetFullPath(backupFolder).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("النسخة الاحتياطية لم تُحفظ في المجلد المحلي الافتراضي.");
            }
            long products;
            long sales;
            string message;
            if (!backup.VerifyBackupDetailed(created.BackupFilePath, false, out products, out sales, out message))
            {
                throw new InvalidOperationException("فشل التحقق من النسخة الاحتياطية: " + message);
            }
            // the plaintext staging snapshot must be gone
            if (File.Exists(created.BackupFilePath + ".raw"))
            {
                SecureDelete.WipeAndDeleteQuietly(created.BackupFilePath + ".raw");
                if (File.Exists(created.BackupFilePath + ".raw")) throw new InvalidOperationException("تعذر حذف الملف المؤقت غير المشفر للنسخة الاحتياطية.");
            }
            RecordAndPrunePreConversionBackups(Path.GetDirectoryName(dbPath), created.BackupFilePath);
            return created.BackupFilePath;
        }

        // The 24-hour retries would otherwise add one container backup per attempt: the ones this class made are listed in a small file
        // and only the newest MaxPreConversionBackups are kept. Backups the user made are never in the list and never touched.
        internal static void RecordAndPrunePreConversionBackups(string dataFolder, string newBackupFile)
        {
            try
            {
                string listPath = Path.Combine(dataFolder, PreConversionListFileName);
                List<string> entries = new List<string>();
                if (File.Exists(listPath))
                {
                    string[] lines = File.ReadAllLines(listPath);
                    for (int i = 0; i < lines.Length; i++)
                    {
                        string line = lines[i].Trim();
                        if (line.Length > 0 && !entries.Contains(line)) entries.Add(line);
                    }
                }
                string full = Path.GetFullPath(newBackupFile);
                entries.Remove(full);
                entries.Add(full);
                string folder = Path.GetDirectoryName(full);
                while (entries.Count > MaxPreConversionBackups)
                {
                    string oldest = entries[0];
                    entries.RemoveAt(0);
                    try
                    {
                        string name = Path.GetFileName(oldest);
                        bool sameFolder = string.Equals(Path.GetDirectoryName(Path.GetFullPath(oldest)), folder, StringComparison.OrdinalIgnoreCase);
                        if (sameFolder && name.StartsWith("rafiq_backup_", StringComparison.Ordinal))
                        {
                            DeleteQuietly(oldest);
                            DeleteQuietly(Path.Combine(folder, name.Replace("rafiq_backup_", "rafiq_rx_")));
                        }
                    }
                    catch (ArgumentException) { }
                }
                File.WriteAllLines(listPath, entries.ToArray());
            }
            catch (IOException ex) { Logger.Warn("تعذر تحديث قائمة نسخ ما قبل التشفير: " + ex.Message); }
            catch (UnauthorizedAccessException ex) { Logger.Warn("تعذر تحديث قائمة نسخ ما قبل التشفير: " + ex.Message); }
        }

        // ---------------------------------------------------------------- restore of the sealed copy (root action)

        /// <summary>
        /// Copies the sealed pre-encryption copy back as the live database. Only when the live file is missing or a 0-byte stub; the sealed
        /// copy must open with the product key and pass quick_check first; the copy is size/byte checked before it takes the live name.
        /// The sealed copy itself is kept. Returns null on success, otherwise the Arabic reason.
        /// </summary>
        public static string RestoreFromPreEncryptionCopy(string dbPath)
        {
            string sealedPath = PreEncryptionPath(dbPath);
            string restoring = dbPath + ".restoring";
            if (LiveUsable(dbPath)) return "ملف قاعدة البيانات الرئيسي موجود؛ لا يمكن الاسترجاع من نسخة ما قبل التشفير فوقه.";
            if (!File.Exists(sealedPath)) return "لا توجد نسخة ما قبل التشفير.";
            if (File.Exists(dbPath + OldPlainSuffix) || File.Exists(dbPath + WorkSuffix))
            {
                return "توجد ملفات من عملية تبديل متوقفة (.plain-old أو .converting)؛ سيحاول البرنامج إكمالها عند التشغيل، ولا يجوز الاسترجاع قبل ذلك.";
            }
            try
            {
                SQLiteConnection.ClearAllPools();
                if (DatabaseKeyProvider.DetectFileKind(sealedPath) != DatabaseFileKind.NotPlain || !LiveEncryptedDatabaseOpens(sealedPath))
                {
                    return "نسخة ما قبل التشفير لا تُفتح بمفتاح البرنامج؛ لم يتم تغيير أي ملف.";
                }
                DeleteQuietly(restoring);
                File.Copy(sealedPath, restoring, true);
                if (!FilesIdentical(sealedPath, restoring))
                {
                    DeleteQuietly(restoring);
                    return "فشل التحقق من الملف المنسوخ؛ لم يتم تغيير أي ملف.";
                }
                DeleteEmptyStub(dbPath);
                MoveWithRetry(restoring, dbPath, FaultRenameWorkToLive);
                Logger.Warn("تم استرجاع قاعدة البيانات من نسخة ما قبل التشفير: " + dbPath);
                return null;
            }
            catch (SimulatedCrashException)
            {
                throw;
            }
            catch (Exception ex)
            {
                DeleteQuietly(restoring);
                Logger.Warn("فشل الاسترجاع من نسخة ما قبل التشفير: " + ex.Message);
                return "فشل الاسترجاع من نسخة ما قبل التشفير: " + ex.Message;
            }
        }

        // ---------------------------------------------------------------- building blocks (also used by restore/import)

        // file: URI for SQLite (opened with the URI flag by the shim because the connection string starts with "file:")
        internal static string ToSqliteUri(string path)
        {
            string full = Path.GetFullPath(path).Replace('\\', '/');
            if (!full.StartsWith("/", StringComparison.Ordinal)) full = "/" + full;
            StringBuilder sb = new StringBuilder("file://");
            for (int i = 0; i < full.Length; i++)
            {
                char c = full[i];
                if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '/' || c == '-' || c == '_' || c == '.' || c == '~' || c == ':')
                {
                    sb.Append(c);
                }
                else if (char.IsHighSurrogate(c) && i + 1 < full.Length)
                {
                    sb.Append(Uri.EscapeDataString(full.Substring(i, 2)));
                    i++;
                }
                else
                {
                    sb.Append(Uri.EscapeDataString(c.ToString()));
                }
            }
            return sb.ToString();
        }

        // Writes an ENCRYPTED copy of a plain database directly (VACUUM INTO an encrypted URI target) from a read-only connection to
        // the plain source: no plain working copy, no plain rollback journal and no plain temp file (temp_store=MEMORY) ever exists.
        internal static void CreateEncryptedCopy(string plainSource, string encryptedDestination)
        {
            DeleteWorkFiles(encryptedDestination);
            byte[] key = DatabaseKeyProvider.GetKey();
            StringBuilder target = null;
            try
            {
                string sourceUri = ToSqliteUri(plainSource) + "?mode=ro";
                using (SQLiteConnection src = new SQLiteConnection("Data Source=" + sourceUri + ";ToFullPath=False;Version=3;Pooling=False;BusyTimeout=5000;Encryption=None;"))
                {
                    src.Open();
                    DatabaseFileAccess.Execute(src, "PRAGMA temp_store=MEMORY;");
                    target = new StringBuilder("VACUUM INTO '");
                    target.Append(ToSqliteUri(encryptedDestination).Replace("'", "%27"));
                    target.Append("?cipher=").Append(DatabaseKeyProvider.CipherName).Append("&key=x%27");
                    for (int i = 0; i < key.Length; i++) target.Append(key[i].ToString("x2", CultureInfo.InvariantCulture));
                    target.Append("%27'");
                    DatabaseFileAccess.Execute(src, target.ToString());
                }
            }
            catch (Exception)
            {
                DeleteWorkFiles(encryptedDestination);
                throw;
            }
            finally
            {
                Array.Clear(key, 0, key.Length);
                if (target != null) { target.Length = 0; target.Capacity = 16; }
                SQLiteConnection.ClearAllPools();
            }
        }

        // Strict equivalence: encrypted header, keyed open, integrity_check, same schema and the same rows (fingerprint).
        public static void VerifyEquivalent(string plainSource, string encryptedCandidate)
        {
            VerifyEquivalent(plainSource, encryptedCandidate, null);
        }

        internal static void VerifyEquivalent(string plainSource, string encryptedCandidate, Action<string> progress)
        {
            if (DatabaseKeyProvider.DetectFileKind(encryptedCandidate) != DatabaseFileKind.NotPlain)
            {
                throw new DatabaseConversionException("الملف المشفر ما زال يحمل ترويسة قاعدة بيانات غير مشفرة.");
            }

            IDictionary<string, string> expected;
            using (SQLiteConnection src = DatabaseFileAccess.Open(plainSource, true, true))
            {
                expected = DatabaseFileAccess.ComputeFingerprint(src, ProgressWithPrefix(progress, "مطابقة الأصل"));
            }

            IDictionary<string, string> actual;
            using (SQLiteConnection enc = DatabaseFileAccess.Open(encryptedCandidate, true, false))
            {
                if (!DatabaseFileAccess.IntegrityCheckPasses(enc))
                {
                    throw new DatabaseConversionException("فحص سلامة قاعدة البيانات المشفرة لم ينجح.");
                }
                string cipher = Convert.ToString(DatabaseFileAccess.Scalar(enc, "PRAGMA cipher;"), CultureInfo.InvariantCulture);
                if (!string.Equals(cipher, DatabaseKeyProvider.CipherName, StringComparison.OrdinalIgnoreCase))
                {
                    throw new DatabaseConversionException("خوارزمية التشفير غير المتوقعة في القاعدة المشفرة: " + cipher);
                }
                actual = DatabaseFileAccess.ComputeFingerprint(enc, ProgressWithPrefix(progress, "مطابقة النسخة المشفرة"));
            }
            SQLiteConnection.ClearAllPools();

            string diff = DatabaseFileAccess.CompareFingerprints(expected, actual);
            if (diff != null)
            {
                throw new DatabaseConversionException("اختلاف بين القاعدة الأصلية والمشفرة عند التحقق (" + diff + ").");
            }
        }

        private static Action<string> ProgressWithPrefix(Action<string> progress, string prefix)
        {
            if (progress == null) return null;
            return delegate(string line) { progress(prefix + ": " + line); };
        }

        // Converts a plain database file into a new ENCRYPTED file at destinationPath (verified row for row).
        // The source is only read. Used when a legacy plain backup or store package is restored or imported.
        public static void EncryptPlainCopy(string plainSource, string destinationPath)
        {
            string work = destinationPath + WorkSuffix;
            try
            {
                CreateEncryptedCopy(plainSource, work);
                VerifyEquivalent(plainSource, work);
                ReplaceFile(work, destinationPath);
            }
            finally
            {
                DeleteWorkFiles(work);
            }
        }

        // Root-only escape hatch: a PLAIN, verified copy of the live database at a path chosen by the caller.
        public static void ExportDecrypted(string sourceConnectionString, string destinationPath)
        {
            if (File.Exists(destinationPath)) throw new DatabaseConversionException("الملف الوجهة موجود بالفعل، اختر اسماً جديداً.");

            // The live database is plain only while the process runs in the plain fallback (or in plain test mode)
            bool sourcePlain = !DatabaseKeyProvider.IsDefaultEncryptionEnabled || DatabaseKeyProvider.IsPlainFallbackActive;
            string work = destinationPath + WorkSuffix;
            DeleteWorkFiles(work);
            try
            {
                if (sourcePlain)
                {
                    using (SQLiteConnection src = new SQLiteConnection(sourceConnectionString))
                    using (SQLiteConnection dst = DatabaseFileAccess.CreatePlain(work))
                    {
                        src.Open();
                        src.BackupDatabase(dst, "main", "main", -1, null, 0);
                    }
                    SQLiteConnection.ClearAllPools();
                    using (SQLiteConnection conn = DatabaseFileAccess.Open(work, false, true))
                    {
                        DatabaseFileAccess.Execute(conn, "PRAGMA journal_mode=DELETE;");
                    }
                    SQLiteConnection.ClearAllPools();
                }
                else
                {
                    // keyed snapshot first (the online backup API cannot cross from encrypted to plain pages)
                    using (SQLiteConnection src = new SQLiteConnection(sourceConnectionString))
                    using (SQLiteConnection dst = DatabaseFileAccess.CreateEncrypted(work))
                    {
                        src.Open();
                        src.BackupDatabase(dst, "main", "main", -1, null, 0);
                    }
                    SQLiteConnection.ClearAllPools();

                    IDictionary<string, string> expected;
                    using (SQLiteConnection enc = DatabaseFileAccess.Open(work, true, false))
                    {
                        expected = DatabaseFileAccess.ComputeFingerprint(enc);
                    }
                    using (SQLiteConnection conn = DatabaseFileAccess.Open(work, false, false))
                    {
                        DatabaseFileAccess.Execute(conn, "PRAGMA journal_mode=DELETE;");
                        DatabaseFileAccess.Execute(conn, "PRAGMA rekey = '';");
                    }
                    SQLiteConnection.ClearAllPools();

                    if (DatabaseKeyProvider.DetectFileKind(work) != DatabaseFileKind.Plain)
                    {
                        throw new DatabaseConversionException("تعذر إنتاج نسخة غير مشفرة.");
                    }
                    using (SQLiteConnection plain = DatabaseFileAccess.Open(work, true, true))
                    {
                        string diff = DatabaseFileAccess.CompareFingerprints(expected, DatabaseFileAccess.ComputeFingerprint(plain));
                        if (diff != null) throw new DatabaseConversionException("اختلاف عند التحقق من النسخة غير المشفرة (" + diff + ").");
                    }
                    SQLiteConnection.ClearAllPools();
                }

                if (DatabaseKeyProvider.DetectFileKind(work) != DatabaseFileKind.Plain)
                {
                    throw new DatabaseConversionException("تعذر إنتاج نسخة غير مشفرة.");
                }
                Fault(FaultExportBeforeMove);
                File.Move(work, destinationPath);
            }
            finally
            {
                // the export is plain by design, but a half-written work file next to the target is not: wipe it on every failure path
                SQLiteConnection.ClearAllPools();
                SecureDelete.WipeAndDeleteQuietly(work);
            }
        }

        // ---------------------------------------------------------------- sweep of readable plain files (H2)

        // Looks for readable plain SQLite files (header "SQLite format 3") in the store folders and removes the exposure:
        // staging snapshots are zero-filled and deleted, copies of data (migration backups, safety snapshots, quarantine) are re-encrypted.
        // A file that can be neither re-encrypted nor safely deleted is reported in Unprotected (owner-visible alert), never deleted.
        internal static PlainSweepResult SweepPlainFiles(string baseFolder, string dataFolder, string dbPath)
        {
            PlainSweepResult sweep = new PlainSweepResult();
            LastSweepResult = sweep;
            try
            {
                if (!DatabaseKeyProvider.IsDefaultEncryptionEnabled || DatabaseKeyProvider.IsPlainFallbackActive) return sweep;

                List<string> scanned = new List<string>();
                SweepFolder(dataFolder, dbPath, "data", sweep, scanned);
                SweepFolder(Path.Combine(dataFolder, "migration_backups"), dbPath, "reencrypt", sweep, scanned);
                SweepFolder(Path.Combine(dataFolder, "pre_restore"), dbPath, "reencrypt", sweep, scanned);
                SweepFolder(Path.Combine(dataFolder, "quarantine"), dbPath, "reencrypt", sweep, scanned);
                if (!string.IsNullOrEmpty(baseFolder)) SweepFolder(Path.Combine(baseFolder, "backups"), dbPath, "staging", sweep, scanned);

                // decrypted staging copies of legacy backups in the temp folder
                string temp = Path.GetTempPath();
                string[] patterns = new string[] { "rafiq_staging_*", "rafiq_bk_verify_*" };
                DateTime cutoff = DateTime.UtcNow.AddHours(-2);
                for (int p = 0; p < patterns.Length; p++)
                {
                    string[] files;
                    try { files = Directory.GetFiles(temp, patterns[p]); } catch (IOException) { continue; }
                    for (int i = 0; i < files.Length; i++)
                    {
                        try
                        {
                            if (File.GetLastWriteTimeUtc(files[i]) < cutoff && DatabaseKeyProvider.IsPlainSqliteFile(files[i]) && SecureDelete.WipeAndDeleteQuietly(files[i]))
                            {
                                sweep.Wiped.Add(files[i]);
                            }
                        }
                        catch (IOException) { }
                        catch (UnauthorizedAccessException) { }
                    }
                }
            }
            catch (SimulatedCrashException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر إكمال فحص الملفات غير المشفرة: " + ex.Message);
            }
            if (sweep.Reencrypted.Count + sweep.Wiped.Count + sweep.Unprotected.Count > 0)
            {
                Logger.Warn(string.Format(CultureInfo.InvariantCulture, "فحص الملفات غير المشفرة: تم تشفير {0} وحذف {1} وبقي {2} دون حماية", sweep.Reencrypted.Count, sweep.Wiped.Count, sweep.Unprotected.Count));
            }
            return sweep;
        }

        private static void SweepFolder(string folder, string dbPath, string mode, PlainSweepResult sweep, List<string> scanned)
        {
            if (!Directory.Exists(folder)) return;
            RecoverInterruptedReencryption(folder);
            string[] files;
            try { files = Directory.GetFiles(folder); } catch (IOException) { return; } catch (UnauthorizedAccessException) { return; }
            string live = Path.GetFullPath(dbPath);
            for (int i = 0; i < files.Length; i++)
            {
                string file = files[i];
                string full = Path.GetFullPath(file);
                if (scanned.Contains(full)) continue;
                scanned.Add(full);
                // .plain-old can be the ONLY readable copy of the store (it is wiped only by the swap/recovery logic after the encrypted file opens)
                if (full.EndsWith(OldPlainSuffix, StringComparison.OrdinalIgnoreCase)) continue;
                // .plain-old.stale is a plain leftover that is zero-filled only after a verified conversion; .sweep-plain is handled by the recovery pass
                if (full.IndexOf(OldPlainSuffix + StaleSuffix, StringComparison.OrdinalIgnoreCase) >= 0) continue;
                if (full.EndsWith(SweepPlainSuffix, StringComparison.OrdinalIgnoreCase)) continue;
                if (string.Equals(full, live, StringComparison.OrdinalIgnoreCase)) continue;
                if (!DatabaseKeyProvider.IsPlainSqliteFile(file)) continue;

                string ext = Path.GetExtension(file).ToLowerInvariant();
                bool transient = ext == ".raw" || (mode == "staging" && ext == ".tmp");
                try
                {
                    if (transient)
                    {
                        // a staging snapshot or a conversion leftover: only a transient copy of data that lives on in the store
                        if (SecureDelete.WipeAndDeleteQuietly(file)) sweep.Wiped.Add(file); else sweep.Unprotected.Add(file);
                    }
                    else if (mode == "staging")
                    {
                        // the backup folder only ever holds containers; any other readable SQLite file there is unexpected and is reported, not touched
                        sweep.Unprotected.Add(file);
                    }
                    else
                    {
                        ReencryptInPlace(file);
                        sweep.Reencrypted.Add(file);
                    }
                }
                catch (SimulatedCrashException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    Logger.Warn("تعذر تشفير ملف قاعدة بيانات قديم: " + file + " - " + ex.Message);
                    sweep.Unprotected.Add(file);
                }
            }
        }

        // Replaces a plain SQLite file by its encrypted, verified equivalent under the same name. Order: X.sweep (encrypted and verified)
        // is written first; then X -> X.sweep-plain and X.sweep -> X; only then is the plain copy zero-filled and deleted. A crash between
        // the two renames leaves X missing but both files present: RecoverInterruptedReencryption finishes it by name.
        private static void ReencryptInPlace(string file)
        {
            string encrypted = file + ".sweep";
            string plainAside = file + SweepPlainSuffix;
            DeleteWorkFiles(encrypted);
            try
            {
                EncryptPlainCopy(file, encrypted);
                Fault(FaultSweepAfterEncrypt);
                SQLiteConnection.ClearAllPools();
                DeleteQuietly(file + "-wal");
                DeleteQuietly(file + "-shm");
                DeleteQuietly(file + "-journal");
                MoveWithRetry(file, plainAside, FaultRenameLiveToOld);
                Fault(FaultSweepBetweenRenames);
                try
                {
                    MoveWithRetry(encrypted, file, FaultRenameWorkToLive);
                }
                catch (SimulatedCrashException) { throw; }
                catch (Exception)
                {
                    // put the original back; if even that fails both files stay, the recovery pass finishes it by name
                    try { MoveWithRetry(plainAside, file, FaultRenameRollback); } catch (SimulatedCrashException) { throw; } catch (Exception) { }
                    throw;
                }
                WipeAndDelete(plainAside, false);
            }
            catch (SimulatedCrashException)
            {
                throw;
            }
            catch (Exception)
            {
                // the encrypted attempt is not needed when the original could not be replaced; the original stays
                if (File.Exists(file)) DeleteWorkFiles(encrypted);
                throw;
            }
        }

        // Finishes (or undoes) a re-encryption that stopped between its renames
        private static void RecoverInterruptedReencryption(string folder)
        {
            string[] asides;
            try { asides = Directory.GetFiles(folder, "*" + SweepPlainSuffix); }
            catch (IOException) { return; }
            catch (UnauthorizedAccessException) { return; }
            for (int i = 0; i < asides.Length; i++)
            {
                string aside = asides[i];
                string original = aside.Substring(0, aside.Length - SweepPlainSuffix.Length);
                string encrypted = original + ".sweep";
                try
                {
                    if (!File.Exists(original))
                    {
                        if (File.Exists(encrypted) && DatabaseKeyProvider.DetectFileKind(encrypted) == DatabaseFileKind.NotPlain && LiveEncryptedDatabaseOpens(encrypted))
                        {
                            MoveWithRetry(encrypted, original, FaultRenameWorkToLive);
                            WipeAndDelete(aside, false);
                            Logger.Warn("أُكمل تشفير ملف قاعدة بيانات قديم بعد توقف سابق: " + original);
                        }
                        else
                        {
                            MoveWithRetry(aside, original, FaultRenameRollback);
                            DeleteWorkFiles(encrypted);
                        }
                    }
                    else if (DatabaseKeyProvider.DetectFileKind(original) == DatabaseFileKind.NotPlain && LiveEncryptedDatabaseOpens(original))
                    {
                        WipeAndDelete(aside, false);
                    }
                    else
                    {
                        // both files exist and the one under the original name is not a verified encrypted copy: nothing is deleted
                        Logger.Warn("ملفان لنفس قاعدة البيانات القديمة؛ لم يُحذف أي منهما: " + original);
                    }
                }
                catch (SimulatedCrashException) { throw; }
                catch (Exception ex)
                {
                    Logger.Warn("تعذر إكمال تشفير ملف قديم متوقف: " + aside + " - " + ex.Message);
                }
            }
        }

        // ---------------------------------------------------------------- evidence of an encrypted store (H2c)

        internal static void RecordEncryptionEvidence(string dataFolder)
        {
            try
            {
                if (HasValidEvidence(dataFolder)) return;
                string body = "EncryptedSinceUtc=" + UtcNow().ToString("o", CultureInfo.InvariantCulture);
                File.WriteAllText(EvidencePath(dataFolder), body + "\nMac=" + Tag("evidence", body));
            }
            catch (IOException ex) { Logger.Warn("تعذر حفظ دليل تشفير المتجر: " + ex.Message); }
            catch (UnauthorizedAccessException ex) { Logger.Warn("تعذر حفظ دليل تشفير المتجر: " + ex.Message); }
        }

        internal static bool HasValidEvidence(string dataFolder)
        {
            try
            {
                string path = EvidencePath(dataFolder);
                if (!File.Exists(path)) return false;
                string[] lines = File.ReadAllLines(path);
                if (lines.Length < 2 || !lines[1].StartsWith("Mac=", StringComparison.Ordinal)) return false;
                return string.Equals(lines[1].Substring(4), Tag("evidence", lines[0]), StringComparison.Ordinal);
            }
            catch (IOException) { return false; }
        }

        // HMAC-SHA256 tag (hex) under a sub-key derived from the product key: local state files cannot be forged by editing text
        internal static string Tag(string purpose, string text)
        {
            byte[] subKey = DatabaseKeyProvider.DeriveSubKey(purpose);
            try
            {
                using (HMACSHA256 hmac = new HMACSHA256(subKey))
                {
                    return DatabaseKeyProvider.ToHex(hmac.ComputeHash(Encoding.UTF8.GetBytes(text)));
                }
            }
            finally
            {
                Array.Clear(subKey, 0, subKey.Length);
            }
        }

        // ---------------------------------------------------------------- status and retention

        public static EncryptionStatus GetStatus(string dbPath)
        {
            EncryptionStatus status = new EncryptionStatus();
            status.Cipher = DatabaseKeyProvider.CipherName;
            status.RetentionDays = RetentionDays;
            status.RetentionLaunches = RetentionLaunches;
            status.DatabaseEncrypted = DatabaseKeyProvider.DetectFileKind(dbPath) == DatabaseFileKind.NotPlain;
            string sealedPath = PreEncryptionPath(dbPath);
            status.PreEncryptionCopyPresent = File.Exists(sealedPath);
            if (status.PreEncryptionCopyPresent)
            {
                status.PreEncryptionCopyCreatedUtc = File.GetLastWriteTimeUtc(sealedPath);
                status.PreEncryptionLaunches = ReadLaunches(dbPath);
            }
            status.PlainLeftoverPresent = File.Exists(dbPath + OldPlainSuffix);
            PlainSweepResult sweep = LastSweepResult;
            status.UnprotectedLeftovers = sweep != null ? sweep.Unprotected.Count : 0;

            string folder = Path.GetDirectoryName(dbPath);
            ConversionMarker marker = ConversionMarker.Read(MarkerPath(folder));
            status.ConversionState = marker.State ?? "None";
            status.ConversionFailures = marker.Attempts;
            status.ConversionLastError = marker.LastError ?? string.Empty;
            status.ConversionStopped = marker.Attempts >= MaxAttempts;
            if (status.DatabaseEncrypted && !File.Exists(MarkerPath(folder))) status.ConversionState = "Done";
            return status;
        }

        // Called once per successful start: counts the launch and removes the sealed pre-encryption copy once it is both
        // at least RetentionDays old and RetentionLaunches successful launches have passed.
        public static bool ApplyPreEncryptionRetention(string dbPath)
        {
            string sealedPath = PreEncryptionPath(dbPath);
            if (!File.Exists(sealedPath)) return false;
            int launches = ReadLaunches(dbPath) + 1;
            try { File.WriteAllText(LaunchCounterPath(dbPath), launches.ToString(CultureInfo.InvariantCulture)); } catch (IOException) { } catch (UnauthorizedAccessException) { }

            double ageDays = (UtcNow() - File.GetLastWriteTimeUtc(sealedPath)).TotalDays;
            if (ageDays >= RetentionDays && launches >= RetentionLaunches)
            {
                return DeletePreEncryptionCopy(dbPath);
            }
            return false;
        }

        public static bool DeletePreEncryptionCopy(string dbPath)
        {
            string sealedPath = PreEncryptionPath(dbPath);
            try
            {
                if (File.Exists(sealedPath)) File.Delete(sealedPath);
                DeleteQuietly(LaunchCounterPath(dbPath));
                Logger.Info("تم حذف نسخة ما قبل التشفير.");
                return !File.Exists(sealedPath);
            }
            catch (Exception ex)
            {
                Logger.Warn("تعذر حذف نسخة ما قبل التشفير: " + ex.Message);
                return false;
            }
        }

        // Root action: forget the failure counter (and the "was encrypted" evidence, so a plain file can be converted again)
        public static void ResetConversionFailures(string dataFolder)
        {
            DeleteQuietly(MarkerPath(dataFolder));
            DeleteQuietly(EvidencePath(dataFolder));
        }

        // Factory reset: removes every encryption artefact of the old store (sealed pre-encryption copy, conversion marker and
        // counters, leftover working/plain/bad files), zero-filled first (best effort). Returns the paths that could not be removed.
        public static string[] PurgeEncryptionArtifacts(string dbPath)
        {
            List<string> failed = new List<string>();
            if (string.IsNullOrEmpty(dbPath)) return failed.ToArray();
            string folder = Path.GetDirectoryName(dbPath);
            string sealedPath = PreEncryptionPath(dbPath);
            string work = dbPath + WorkSuffix;
            List<string> targets = new List<string>(new string[]
            {
                sealedPath, sealedPath + ".tmp",
                MarkerPath(folder), MarkerPath(folder) + ".tmp",
                LaunchCounterPath(dbPath),
                work, work + "-journal", work + "-wal", work + "-shm",
                dbPath + OldPlainSuffix, dbPath + OldPlainSuffix + "-wal", dbPath + OldPlainSuffix + "-shm", dbPath + OldPlainSuffix + "-journal",
                Path.Combine(folder, PreConversionListFileName)
            });
            targets.AddRange(StaleFiles(dbPath));
            try
            {
                string[] bad = Directory.GetFiles(folder, Path.GetFileName(dbPath) + BadSuffixPrefix + "*");
                targets.AddRange(bad);
            }
            catch (IOException) { }
            SQLiteConnection.ClearAllPools();
            for (int i = 0; i < targets.Count; i++)
            {
                try
                {
                    WipeAndDelete(targets[i], false);
                }
                catch (Exception ex)
                {
                    failed.Add(targets[i]);
                    Logger.Warn("تعذر حذف ملف التشفير القديم عند تصفير النظام: " + targets[i] + " - " + ex.Message);
                }
            }
            return failed.ToArray();
        }

        // .bad_* files (encrypted candidates that failed their post-swap check) are kept for support, then removed
        private static void PurgeOldBadFiles(string dbPath)
        {
            try
            {
                string folder = Path.GetDirectoryName(dbPath);
                string[] bad = Directory.GetFiles(folder, Path.GetFileName(dbPath) + BadSuffixPrefix + "*");
                DateTime cutoff = UtcNow().AddDays(-BadFileRetentionDays);
                for (int i = 0; i < bad.Length; i++)
                {
                    try
                    {
                        if (File.GetLastWriteTimeUtc(bad[i]) < cutoff) WipeAndDelete(bad[i], false);
                    }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
            }
            catch (IOException) { }
        }

        private static string LaunchCounterPath(string dbPath)
        {
            return Path.Combine(Path.GetDirectoryName(dbPath), LaunchCounterFileName);
        }

        private static int ReadLaunches(string dbPath)
        {
            try
            {
                string path = LaunchCounterPath(dbPath);
                int n;
                if (File.Exists(path) && int.TryParse(File.ReadAllText(path).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out n)) return n;
            }
            catch (IOException) { }
            return 0;
        }

        // ---------------------------------------------------------------- helpers

        private static void Report(Action<string> progress, string message)
        {
            Logger.Info(message);
            if (progress != null)
            {
                try { progress(message); } catch (Exception) { }
            }
        }

        // Renames with retries: antivirus scanners and search indexers hold files briefly on Windows
        private static void MoveWithRetry(string source, string destination, string faultPoint)
        {
            Exception last = null;
            for (int attempt = 0; attempt < RenameAttempts; attempt++)
            {
                try
                {
                    Fault(faultPoint);
                    try { File.SetAttributes(source, FileAttributes.Normal); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                    File.Move(source, destination);
                    return;
                }
                catch (IOException ex) { last = ex; }
                catch (UnauthorizedAccessException ex) { last = ex; }
                SQLiteConnection.ClearAllPools();
                int delay = Math.Min(500, RetryBaseDelayMilliseconds * (attempt + 1));
                if (delay > 0) Thread.Sleep(delay);
            }
            throw new IOException("تعذر نقل الملف " + Path.GetFileName(source) + " إلى " + Path.GetFileName(destination) + " بعد عدة محاولات: " + (last != null ? last.Message : string.Empty), last);
        }

        // A real mismatch (the candidate is damaged or differs) returns false. A transient I/O problem (antivirus holding the file, a busy
        // lock) is retried and, if it persists, thrown: a good candidate must never be deleted because of a hiccup.
        private static bool VerifyCandidateAgainst(string plainOld, string work)
        {
            const int attempts = 4;
            for (int attempt = 1; ; attempt++)
            {
                try
                {
                    Fault(FaultRecoveryVerify);
                    VerifyEquivalent(plainOld, work);
                    return true;
                }
                catch (SimulatedCrashException) { throw; }
                catch (Exception ex)
                {
                    if (!IsTransientIo(ex))
                    {
                        Logger.Warn("المرشح المشفر لم يطابق الأصل أثناء الاسترداد: " + ex.Message);
                        return false;
                    }
                    if (attempt >= attempts) throw;
                    Logger.Warn("خطأ مؤقت في الوصول للملفات أثناء التحقق من المرشح المشفر، ستتم إعادة المحاولة: " + ex.Message);
                    SQLiteConnection.ClearAllPools();
                    int delay = Math.Min(500, RetryBaseDelayMilliseconds * attempt);
                    if (delay > 0) Thread.Sleep(delay);
                }
            }
        }

        private static bool IsTransientIo(Exception ex)
        {
            if (ex is IOException || ex is UnauthorizedAccessException) return true;
            SQLiteException sqlite = ex as SQLiteException;
            if (sqlite != null)
            {
                int code = (int)sqlite.ResultCode & 0xFF;
                return code == (int)SQLiteErrorCode.Busy || code == (int)SQLiteErrorCode.Locked || code == (int)SQLiteErrorCode.IoErr || code == (int)SQLiteErrorCode.CantOpen;
            }
            return false;
        }

        private static bool LiveEncryptedDatabaseOpens(string dbPath)
        {
            try
            {
                using (SQLiteConnection conn = DatabaseFileAccess.Open(dbPath, false, false))
                {
                    object ok = DatabaseFileAccess.Scalar(conn, "PRAGMA quick_check;");
                    object tables = DatabaseFileAccess.Scalar(conn, "SELECT count(*) FROM sqlite_master;");
                    return ok != null && string.Equals(ok.ToString(), "ok", StringComparison.OrdinalIgnoreCase) && tables != null;
                }
            }
            catch (SimulatedCrashException) { throw; }
            catch (Exception ex)
            {
                Logger.Warn("فتح القاعدة المشفرة فشل: " + ex.Message);
                return false;
            }
            finally
            {
                SQLiteConnection.ClearAllPools();
            }
        }

        // Header-page read only: enough to know the file is ours, cheap enough for every start
        private static bool LiveEncryptedDatabaseOpensQuick(string dbPath)
        {
            try
            {
                using (SQLiteConnection conn = DatabaseFileAccess.Open(dbPath, true, false))
                {
                    return DatabaseFileAccess.Scalar(conn, "PRAGMA schema_version;") != null;
                }
            }
            catch (Exception)
            {
                return false;
            }
            finally
            {
                SQLiteConnection.ClearAllPools();
            }
        }

        private static void WipeAndDelete(string path)
        {
            WipeAndDelete(path, true);
        }

        // Overwrites the file with zeros before deleting it (best effort: SSD wear levelling can keep old blocks)
        private static void WipeAndDelete(string path, bool injectFault)
        {
            if (!File.Exists(path)) return;
            long length = new FileInfo(path).Length;
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.None))
            {
                byte[] zeros = new byte[64 * 1024];
                long written = 0;
                while (written < length)
                {
                    int n = (int)Math.Min(zeros.Length, length - written);
                    fs.Write(zeros, 0, n);
                    written += n;
                }
                fs.Flush(true);
            }
            if (injectFault) Fault(FaultDuringWipe);
            File.Delete(path);
            DeleteQuietly(path + "-wal");
            DeleteQuietly(path + "-shm");
            DeleteQuietly(path + "-journal");
        }

        private static void ReplaceFile(string source, string destination)
        {
            if (File.Exists(destination)) File.Replace(source, destination, null);
            else File.Move(source, destination);
        }

        private static string[] StaleFiles(string dbPath)
        {
            try
            {
                return Directory.GetFiles(Path.GetDirectoryName(dbPath), Path.GetFileName(dbPath) + OldPlainSuffix + StaleSuffix + "*");
            }
            catch (IOException) { return new string[0]; }
        }

        private static void WipeStaleCopies(string dbPath)
        {
            string[] stale = StaleFiles(dbPath);
            for (int i = 0; i < stale.Length; i++)
            {
                try { WipeAndDelete(stale[i], false); }
                catch (SimulatedCrashException) { throw; }
                catch (Exception ex) { Logger.Warn("تعذر حذف النسخة القديمة الجانبية: " + stale[i] + " - " + ex.Message); }
            }
        }

        // Byte-for-byte comparison (size first)
        private static bool FilesIdentical(string a, string b)
        {
            FileInfo fa = new FileInfo(a);
            FileInfo fb = new FileInfo(b);
            if (!fa.Exists || !fb.Exists || fa.Length != fb.Length) return false;
            byte[] x = new byte[64 * 1024];
            byte[] y = new byte[64 * 1024];
            using (FileStream sa = new FileStream(a, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (FileStream sb = new FileStream(b, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                while (true)
                {
                    int ra = ReadFull(sa, x);
                    int rb = ReadFull(sb, y);
                    if (ra != rb) return false;
                    if (ra == 0) return true;
                    for (int i = 0; i < ra; i++) if (x[i] != y[i]) return false;
                }
            }
        }

        private static int ReadFull(Stream stream, byte[] buffer)
        {
            int total = 0;
            while (total < buffer.Length)
            {
                int n = stream.Read(buffer, total, buffer.Length - total);
                if (n <= 0) break;
                total += n;
            }
            return total;
        }

        private static void DeleteWorkFiles(string work)
        {
            SQLiteConnection.ClearAllPools();
            DeleteQuietly(work);
            DeleteQuietly(work + "-journal");
            DeleteQuietly(work + "-wal");
            DeleteQuietly(work + "-shm");
        }

        private static void DeleteQuietly(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        // Small key=value file protected by an HMAC tag: a marker that fails validation (edited, truncated, copied from elsewhere)
        // is treated as a fresh state (no failures, no back-off), never as "stop".
        private sealed class ConversionMarker
        {
            public string State;
            public int Attempts;
            public string LastError;
            public DateTime? NextAttemptUtc;
            public DateTime? StartedUtc;

            public static ConversionMarker Read(string path)
            {
                ConversionMarker m = new ConversionMarker();
                try
                {
                    if (!File.Exists(path)) return m;
                    string[] all = File.ReadAllLines(path);
                    List<string> body = new List<string>();
                    string mac = null;
                    for (int i = 0; i < all.Length; i++)
                    {
                        if (all[i].StartsWith("Mac=", StringComparison.Ordinal)) mac = all[i].Substring(4);
                        else body.Add(all[i]);
                    }
                    if (mac == null || !string.Equals(mac, Tag("marker", string.Join("\n", body.ToArray())), StringComparison.Ordinal))
                    {
                        Logger.Warn("علامة التحويل غير صالحة أو معدلة؛ سيتم اعتبارها حالة جديدة.");
                        return m;
                    }
                    foreach (string line in body)
                    {
                        int eq = line.IndexOf('=');
                        if (eq <= 0) continue;
                        string key = line.Substring(0, eq).Trim();
                        string value = line.Substring(eq + 1).Trim();
                        DateTime dt;
                        int n;
                        switch (key)
                        {
                            case "State": m.State = value; break;
                            case "Attempts": if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out n)) m.Attempts = n; break;
                            case "LastError": m.LastError = value; break;
                            case "NextAttemptUtc":
                                if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out dt)) m.NextAttemptUtc = dt.ToUniversalTime();
                                break;
                            case "StartedUtc":
                                if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out dt)) m.StartedUtc = dt.ToUniversalTime();
                                break;
                        }
                    }
                }
                catch (IOException) { }
                // No back-off is ever longer than a day. A "next attempt" more than 24 h ahead can only come from a clock that was wrong when the
                // marker was written: it is treated as already due (capping it at now+24h would postpone the retry again at every start)
                if (m.NextAttemptUtc.HasValue && m.NextAttemptUtc.Value > UtcNow().AddHours(24)) m.NextAttemptUtc = UtcNow();
                return m;
            }

            public void Write(string path)
            {
                List<string> lines = new List<string>();
                lines.Add("State=" + (State ?? "None"));
                lines.Add("Attempts=" + Attempts.ToString(CultureInfo.InvariantCulture));
                lines.Add("LastError=" + (LastError ?? string.Empty).Replace('\r', ' ').Replace('\n', ' '));
                if (NextAttemptUtc.HasValue) lines.Add("NextAttemptUtc=" + NextAttemptUtc.Value.ToString("o", CultureInfo.InvariantCulture));
                if (StartedUtc.HasValue) lines.Add("StartedUtc=" + StartedUtc.Value.ToString("o", CultureInfo.InvariantCulture));
                string text = string.Join("\n", lines.ToArray());
                lines.Add("Mac=" + Tag("marker", text));
                string tmp = path + ".tmp";
                File.WriteAllLines(tmp, lines.ToArray());
                if (File.Exists(path)) File.Replace(tmp, path, null);
                else File.Move(tmp, path);
            }
        }
    }
}
