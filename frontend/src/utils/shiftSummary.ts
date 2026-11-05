// Pure normalisers for shift data coming from the C# bridge (unit-testable under node strip-types).
// Every money field leaves here as a safe integer so no NaN/undefined can reach the shift modal state.

import { toSafePiasters } from './money.ts';
import type { CashDrawerTransaction, Shift, ShiftSummary } from '../types/models.ts';

const SHIFT_MONEY_KEYS = [
  'openingFloatPiasters',
  'cashSalesPiasters',
  'cardSalesPiasters',
  'instapaySalesPiasters',
  'vodafoneCashSalesPiasters',
  'creditSalesPiasters',
  'returnsCashPiasters',
  'debtPaymentsCashPiasters',
  'expensesCashPiasters',
  'cashInPiasters',
  'cashOutPiasters',
  'epayCashPiasters',
  'walletsCashPiasters',
  'purchasesCashPiasters',
  'supplierPaymentsCashPiasters',
  'expectedCashPiasters',
  'actualCashPiasters',
  'differencePiasters',
] as const;

const SUMMARY_MONEY_KEYS = [
  'openingFloatPiasters',
  'cashSalesPiasters',
  'cardSalesPiasters',
  'instapaySalesPiasters',
  'vodafoneCashSalesPiasters',
  'creditSalesPiasters',
  'returnsCashPiasters',
  'debtPaymentsCashPiasters',
  'expensesCashPiasters',
  'cashInPiasters',
  'cashOutPiasters',
  'epayCashPiasters',
  'walletsCashPiasters',
  'purchasesCashPiasters',
  'supplierPaymentsCashPiasters',
  'expectedCashPiasters',
  'availableCashInDrawerPiasters',
] as const;

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toSafeCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function moneyFields<K extends string>(record: Record<string, unknown>, keys: readonly K[], source: string): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = toSafePiasters(record[key], `${source}.${key}`);
  return out;
}

/** Returns null when the payload is not a shift (null, echoed mock object, missing id). */
export function normalizeShift(raw: unknown, source = 'shift'): Shift | null {
  const r = asRecord(raw);
  if (!r || typeof r.id !== 'string' || r.id === '') return null;
  return {
    ...moneyFields(r, SHIFT_MONEY_KEYS, source),
    id: r.id,
    shiftNumber: toSafeCount(r.shiftNumber),
    cashierId: text(r.cashierId),
    cashierName: text(r.cashierName),
    posRegisterId: text(r.posRegisterId),
    businessDate: text(r.businessDate),
    openedAt: text(r.openedAt),
    closedAt: typeof r.closedAt === 'string' ? r.closedAt : null,
    status: r.status === 'closed' ? 'closed' : 'open',
    invoicesCount: toSafeCount(r.invoicesCount),
    notes: typeof r.notes === 'string' ? r.notes : null,
    createdAt: text(r.createdAt),
    updatedAt: text(r.updatedAt),
    isDanglingFromPreviousDay: r.isDanglingFromPreviousDay === true,
  };
}

export function normalizeShiftList(raw: unknown, source = 'shifts'): Shift[] {
  if (!Array.isArray(raw)) return [];
  const out: Shift[] = [];
  for (const item of raw) {
    const shift = normalizeShift(item, source);
    if (shift) out.push(shift);
  }
  return out;
}

export function normalizeDrawerTransactions(raw: unknown): CashDrawerTransaction[] {
  if (!Array.isArray(raw)) return [];
  const out: CashDrawerTransaction[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r || typeof r.id !== 'string' || r.id === '') continue;
    out.push({
      id: r.id,
      shiftId: text(r.shiftId),
      type: text(r.type),
      amountPiasters: toSafePiasters(r.amountPiasters, 'drawer.amountPiasters'),
      reason: text(r.reason),
      performedById: text(r.performedById),
      performedByName: text(r.performedByName),
      createdAt: text(r.createdAt),
    });
  }
  return out;
}

/**
 * Returns null when the summary has no usable expected cash: the modal must show an error
 * instead of reconciling the drawer against a made-up 0.
 */
export function normalizeShiftSummary(raw: unknown): ShiftSummary | null {
  const r = asRecord(raw);
  if (!r || typeof r.expectedCashPiasters !== 'number' || !Number.isFinite(r.expectedCashPiasters)) return null;
  return {
    ...moneyFields(r, SUMMARY_MONEY_KEYS, 'shiftSummary'),
    shift: normalizeShift(r.shift, 'shiftSummary.shift'),
    invoicesCount: toSafeCount(r.invoicesCount),
    recentMovements: normalizeDrawerTransactions(r.recentMovements),
  };
}

const MOVEMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  cash_in: 'إيداع',
  cash_out: 'سحب',
  opening_float: 'عهدة افتتاحية',
  cash_sale: 'مبيعات نقدية',
  expense: 'مصروف',
  refund: 'مرتجع',
  return: 'مرتجع',
  debt_payment: 'تحصيل آجل',
  purchase: 'مشتريات',
  supplier_payment: 'سداد مورد',
};

/** Arabic label for a drawer movement code; unknown codes are shown as received. */
export function getMovementTypeLabel(code: string): string {
  const key = code.trim().toLowerCase();
  return Object.hasOwn(MOVEMENT_TYPE_LABELS, key) ? MOVEMENT_TYPE_LABELS[key] : code;
}
