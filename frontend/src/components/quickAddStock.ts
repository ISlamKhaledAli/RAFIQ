import { normalizeArabicNumerals } from '../utils/money.ts';

/**
 * الرصيد الافتتاحي لصنف يُضاف سريعاً من نقطة البيع هو ما عدّه الكاشير فعلياً على الرف،
 * ولا يُخترع رصيد مؤقت. يرجع null إذا كانت القيمة فارغة أو غير صالحة.
 */
export function parseCountedStockMilli(input: string, unit: 'piece' | 'kg'): number | null {
  const clean = normalizeArabicNumerals(input).trim();
  if (clean === '') return null;
  if (!/^\d+(\.\d{1,3})?$/.test(clean)) return null;
  const qty = Number(clean);
  if (!Number.isFinite(qty) || qty < 0) return null;
  if (unit === 'piece' && !Number.isInteger(qty)) return null;
  return Math.round(qty * 1000);
}
