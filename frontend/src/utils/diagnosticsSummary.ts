// Pure builder for the root console "system status" tiles and the copyable diagnostics summary (no runtime imports).
// Both are produced from the same rows, so what the screen shows is exactly what gets copied.

export interface StatusSnapshot {
  appVersion?: string;
  osVersion?: string;
  isWebView2?: boolean;
  databaseStatus?: string;
  productsCount?: number;
  licenseStatus?: string;
  lastBackup?: string;
  isBackupOverdue?: boolean;
  printerName?: string;
  isPrinterReady?: boolean;
  featuresActive: number;
  featuresTotal: number;
  diskFree?: string;
  auditStatus?: string;
  deviceFingerprint?: string;
}

export type StatusTone = 'ok' | 'warn' | 'muted';

export interface StatusRow {
  id: 'version' | 'os' | 'engine' | 'database' | 'license' | 'backup' | 'printer' | 'features' | 'disk' | 'audit' | 'device';
  label: string;
  value: string;
  tone: StatusTone;
}

const UNKNOWN = 'غير معروف';

function text(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? UNKNOWN : trimmed;
}

export function buildStatusRows(s: StatusSnapshot): StatusRow[] {
  const database = text(s.databaseStatus);
  const products = typeof s.productsCount === 'number' ? ` (${s.productsCount} صنف)` : '';
  return [
    { id: 'version', label: 'إصدار البرنامج', value: text(s.appVersion), tone: 'muted' },
    { id: 'os', label: 'نظام التشغيل', value: text(s.osVersion), tone: 'muted' },
    { id: 'engine', label: 'محرك العرض', value: s.isWebView2 ? 'WebView2' : 'متصفح (وضع التطوير)', tone: 'muted' },
    { id: 'database', label: 'قاعدة البيانات', value: `${database}${products}`, tone: s.databaseStatus ? 'ok' : 'muted' },
    { id: 'license', label: 'الترخيص', value: text(s.licenseStatus), tone: s.licenseStatus ? 'ok' : 'muted' },
    {
      id: 'backup',
      label: 'آخر نسخة احتياطية',
      value: s.isBackupOverdue ? `${text(s.lastBackup)} (متأخرة)` : text(s.lastBackup),
      tone: s.isBackupOverdue ? 'warn' : s.lastBackup ? 'ok' : 'muted',
    },
    {
      id: 'printer',
      label: 'طابعة الإيصالات',
      value: s.printerName ? `${s.printerName}${s.isPrinterReady === false ? ' (غير جاهزة)' : ''}` : 'لم تُحدد طابعة',
      tone: s.printerName ? (s.isPrinterReady === false ? 'warn' : 'ok') : 'muted',
    },
    { id: 'features', label: 'الميزات المفعّلة', value: `${s.featuresActive} من ${s.featuresTotal}`, tone: 'muted' },
    { id: 'disk', label: 'المساحة الحرة بالقرص', value: text(s.diskFree), tone: 'muted' },
    { id: 'audit', label: 'سجل المراقبة', value: text(s.auditStatus), tone: s.auditStatus ? 'ok' : 'muted' },
    { id: 'device', label: 'بصمة الجهاز', value: text(s.deviceFingerprint), tone: 'muted' },
  ];
}

/** Plain text for the clipboard: a title line, the generation time, then one "label: value" line per row. */
export function buildDiagnosticsSummary(rows: readonly StatusRow[], generatedAt: string): string {
  const lines = rows.map((row) => `${row.label}: ${row.value}`);
  return ['ملخص تشخيص نظام رفيق', `وقت الإنشاء: ${generatedAt}`, ...lines].join('\n');
}
