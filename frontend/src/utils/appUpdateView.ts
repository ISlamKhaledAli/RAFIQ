// Pure helpers for the update modal (no runtime imports) so they can be unit-tested under node strip-types.
// Secure in-app flow: download official Setup (.exe) to %TEMP%, verify SHA-256 automatically, and launch Setup on user click.

export interface UpdateInfoLike {
  hasUpdate?: boolean;
  isEligible?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  errorMessage?: string;
  isMandatory?: boolean;
}

export type UpdateStatusKind = 'success' | 'error' | 'info' | 'warn';

export interface UpdateStatus {
  kind: UpdateStatusKind;
  text: string;
}

const OFFLINE_HINT =
  ' يمكنك أيضاً التحديث بدون إنترنت عبر ملف التثبيت الرسمي على فلاشة USB، وبياناتك تبقى محفوظة.';

/** One honest status line for the modal from the host answer (or from a bridge failure). */
export function deriveUpdateStatus(info: UpdateInfoLike | null, failure?: string): UpdateStatus {
  if (!info) {
    return { kind: 'error', text: (failure || 'تعذر فحص التحديثات.') + OFFLINE_HINT };
  }
  if (info.isEligible === false) {
    const latest = info.latestVersion ? ` (${info.latestVersion})` : '';
    return {
      kind: 'warn',
      text: (info.errorMessage || `ترخيص هذا الجهاز غير مصرح له باستلام التحديثات حالياً${latest}.`),
    };
  }
  if (info.errorMessage && !info.hasUpdate) {
    return { kind: 'error', text: info.errorMessage + OFFLINE_HINT };
  }
  if (info.hasUpdate) {
    return {
      kind: 'info',
      text: `يوجد إصدار جديد متاح (${info.latestVersion || ''}). يمكنك تنزيله وتثبيته بأمان متى شئت.`,
    };
  }
  return { kind: 'success', text: 'أنت تعمل بأحدث إصدار رسمي من نظام رفيق، ولا توجد تحديثات جديدة.' };
}

/** Only https links are accepted for update downloads; anything else from a manifest is ignored. */
export function isSafeDownloadUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/[^\s/]+\S*$/i.test(trimmed);
}

/** Verifies the manifest URL points to an official Windows Setup (.exe) over HTTPS. */
export function isSupportedInstallerUrl(url: string | null | undefined): boolean {
  if (!isSafeDownloadUrl(url)) return false;
  try {
    const parsed = new URL((url || '').trim());
    return parsed.pathname.toLowerCase().endsWith('.exe');
  } catch {
    return false;
  }
}

export function isValidSha256(hash: string | null | undefined): boolean {
  return !!hash && /^[0-9a-f]{64}$/i.test(hash.trim());
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
