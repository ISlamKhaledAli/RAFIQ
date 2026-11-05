// Cash-drawer kick pulse. The ESC/POS command stores the pulse as t1 units of 2 ms (RawPrinterHelper.GetDrawerKickPulse: pulseMs / 2),
// so an odd value behaves exactly like the even number below it. Every value the screen offers or stores is therefore even.
export const DRAWER_PULSE_MIN_MS = 2;
export const DRAWER_PULSE_MAX_MS = 250;
export const DRAWER_PULSE_DEFAULT_MS = 30;

/** Parses any stored/typed value into a valid pulse: even, between 2 and 250, 30 when unreadable. */
export function normalizeDrawerPulse(raw: string | number | null | undefined): number {
  const parsed = typeof raw === 'number' ? Math.trunc(raw) : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return DRAWER_PULSE_DEFAULT_MS;
  const clamped = Math.min(DRAWER_PULSE_MAX_MS, Math.max(DRAWER_PULSE_MIN_MS, parsed));
  return clamped - (clamped % 2);
}

export interface DrawerPulsePreset {
  ms: number;
  label: string;
  hint: string;
}

/** Offered presets: all even, from gentle to strong; 30 is the standard default. */
export const DRAWER_PULSE_PRESETS: readonly DrawerPulsePreset[] = [
  { ms: 10, label: 'هادئة', hint: 'للأدراج الخفيفة ولمنع الصوت العالي' },
  { ms: 20, label: 'معتدلة', hint: 'مناسبة لمعظم الأدراج الجديدة' },
  { ms: 30, label: 'الافتراضية', hint: 'الأنسب لأغلب الأدراج وطابعات الفواتير' },
  { ms: 40, label: 'قوية', hint: 'للأدراج التي لا تفتح بالنبضة الافتراضية' },
  { ms: 60, label: 'أقوى', hint: 'للأدراج الثقيلة أو المشدودة' },
  { ms: 100, label: 'أقصى قوة', hint: 'للأدراج الكبيرة جداً، استخدمها عند الحاجة فقط' },
];

export function formatDrawerPulse(ms: number): string {
  return `${ms} مللي ثانية`;
}
