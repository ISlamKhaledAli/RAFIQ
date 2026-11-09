// Backup retention policy: only the root account changes it (the server enforces the same rule).
// These defaults apply only while nothing was saved; they mirror BackupService.DEFAULT_* in the host
// (test/backup_retention_root_only.test.js fails if the two drift apart).
export const DEFAULT_RETENTION_DAYS = 14;
export const DEFAULT_RETENTION_WEEKS = 8;
export const DEFAULT_MAX_COPIES = 30;
export const DEFAULT_WARN_AFTER_DAYS = 2;

export const RETENTION_ROOT_ONLY_NOTE = 'سياسة الاحتفاظ يضبطها حساب الروت فقط';
