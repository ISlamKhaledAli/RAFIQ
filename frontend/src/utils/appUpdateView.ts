// Pure helpers for the update modal (no runtime imports) so they can be unit-tested under node strip-types.
// The update flow is informational: nothing is downloaded or installed from inside the app.

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
  ' يمكنك التحديث بدون إنترنت: احصل على ملف التثبيت الرسمي الجديد على فلاشة USB وشغّله فوق النسخة الحالية، وبياناتك تبقى محفوظة.';

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
    return { kind: 'info', text: `يوجد إصدار جديد متاح (${info.latestVersion || ''}). لن يتم تثبيته تلقائياً؛ اتبع خطوات التثبيت أدناه.` };
  }
  return { kind: 'success', text: 'أنت تعمل بأحدث إصدار رسمي من نظام رفيق، ولا توجد تحديثات جديدة.' };
}

/** Only https links are offered for copying; anything else from a manifest is ignored. */
export function isSafeDownloadUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/[^\s/]+\S*$/i.test(trimmed);
}

export function isValidSha256(hash: string | null | undefined): boolean {
  return !!hash && /^[0-9a-f]{64}$/i.test(hash.trim());
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
