import { formatLocalDateTime } from './dateFilter.ts';

/** Rows requested per page of the backup list; the host caps one request at BACKUP_LIST_MAX. */
export const BACKUP_PAGE_SIZE = 15;
export const BACKUP_LIST_MAX = 200;

export type BackupFolderState = 'ok' | 'unavailable' | 'unreadable';

export function formatBackupSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 بايت';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${mb.toFixed(2)} م.ب`;
}

/** File times arrive already in the device's local time ("YYYY-MM-DD HH:mm"); an unparsable value is shown as received. */
export function formatBackupDate(createdAt: string | null | undefined): string {
  if (!createdAt) return 'غير محدد';
  return formatLocalDateTime(createdAt) || createdAt;
}

export function backupCountLabel(shown: number, total: number, periodLabel: string | null): string {
  if (periodLabel) {
    return shown < total ? `عرض ${shown} من ${total} نسخة خلال ${periodLabel}` : `${total} نسخة خلال ${periodLabel}`;
  }
  return shown < total ? `عرض أحدث ${shown} من إجمالي ${total} نسخة` : `إجمالي النسخ: ${total}`;
}

/** The next request size for "show more": one more page, never above what exists or the host maximum. */
export function nextBackupLimit(current: number, total: number): number {
  return Math.min(Math.max(current, BACKUP_PAGE_SIZE) + BACKUP_PAGE_SIZE, Math.max(total, BACKUP_PAGE_SIZE), BACKUP_LIST_MAX);
}

export function remainingBackups(shown: number, total: number): number {
  return Math.max(0, Math.min(total, BACKUP_LIST_MAX) - shown);
}

/** Only "ok" means the empty list really is an empty folder; the other states must not claim there are no backups. */
export function normalizeFolderState(value: string | null | undefined): BackupFolderState {
  return value === 'unavailable' || value === 'unreadable' ? value : 'ok';
}
