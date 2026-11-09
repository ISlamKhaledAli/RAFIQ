// Arabic wording for the Help Center "مواصفات النظام" section, built only from facts the host measured
// (system:getInfo / license:getInfo). Missing facts render as nothing so the caller shows a dash.

export interface SystemSpecFacts {
  dbOk?: boolean;
  dbJournalMode?: string;
  dbSchemaVersion?: number;
  dbSizeBytes?: number;
  dbError?: string;
  lastBackupAt?: string;
}

export type SpecTone = 'normal' | 'danger';

export interface SpecCell {
  label: string;
  value: string;
  tone: SpecTone;
  mono: boolean;
}

const LICENSE_TYPE_LABELS: Record<string, string> = {
  unlicensed: 'غير مفعّل',
  trial: 'تجريبي',
  monthly: 'اشتراك شهري',
  annual: 'اشتراك سنوي',
  lifetime: 'دائم (مدى الحياة)',
};

/** Licence type as the host stores it ("unlicensed" is the default); an unknown value is shown as received. */
export function licenseTypeLabel(type: string | null | undefined): string {
  const raw = (type ?? '').trim();
  if (raw === '') return '';
  return LICENSE_TYPE_LABELS[raw.toLowerCase()] ?? raw;
}

/** The host reports whether it could really open and read the database; no answer yet shows nothing. */
export function databaseStateLabel(facts: SystemSpecFacts | null | undefined): string {
  if (!facts || typeof facts.dbOk !== 'boolean') return '';
  return facts.dbOk ? 'متصلة وسليمة' : 'تعذر فتح قاعدة البيانات';
}

export function journalModeLabel(mode: string | null | undefined): string {
  const raw = (mode ?? '').trim().toLowerCase();
  if (raw === '') return '';
  if (raw === 'wal') return 'WAL (آمن ضد انقطاع الكهرباء)';
  return raw.toUpperCase();
}

export function schemaVersionLabel(version: number | null | undefined): string {
  return typeof version === 'number' && version > 0 ? String(Math.trunc(version)) : '';
}

export function databaseSizeLabel(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !(bytes > 0)) return '';
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

/** An empty string from the host means no backup succeeded yet; undefined means the host did not say. */
export function lastBackupLabel(iso: string | null | undefined): string {
  if (iso === undefined || iso === null) return '';
  const raw = iso.trim();
  if (raw === '') return 'لم تؤخذ بعد';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The database cells; a failed check turns the state cell red and shows the host's reason. */
export function buildDatabaseCells(facts: SystemSpecFacts | null | undefined): SpecCell[] {
  const failed = facts?.dbOk === false;
  const state = databaseStateLabel(facts);
  const stateValue = failed && facts?.dbError ? `${state}: ${facts.dbError}` : state;
  return [
    { label: 'قاعدة البيانات', value: stateValue, tone: failed ? 'danger' : 'normal', mono: false },
    { label: 'وضع الحفظ', value: journalModeLabel(facts?.dbJournalMode), tone: 'normal', mono: false },
    { label: 'إصدار هيكل البيانات', value: schemaVersionLabel(facts?.dbSchemaVersion), tone: 'normal', mono: true },
    { label: 'حجم القاعدة', value: databaseSizeLabel(facts?.dbSizeBytes), tone: 'normal', mono: false },
  ];
}
