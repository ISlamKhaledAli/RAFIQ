import { formatArabicCurrency } from './money.ts';

// One Arabic label per refund method, shared by the return screen, the sales history and (mirrored) the receipt
export type RefundMethodKey = 'cash' | 'card' | 'instapay' | 'wallet' | 'credit';

export const REFUND_METHOD_LABELS: Record<RefundMethodKey, string> = {
  cash: 'كاش من الدرج',
  card: 'على البطاقة',
  instapay: 'إنستاباي',
  wallet: 'محفظة إلكترونية',
  credit: 'خصم من حسابه الشكك'
};

export const REFUND_METHOD_DONE_LABELS: Record<RefundMethodKey, string> = {
  cash: 'كاش طلع من الدرج',
  card: 'اترجعت على البطاقة',
  instapay: 'اتحولت على إنستاباي',
  wallet: 'اتحولت على المحفظة',
  credit: 'اتخصمت من حسابه الشكك'
};

export function toRefundMethodKey(method: string | undefined | null): RefundMethodKey | null {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'card') return 'card';
  if (m === 'instapay') return 'instapay';
  if (m === 'wallet' || m === 'vodafone_cash') return 'wallet';
  if (m === 'credit' || m === 'customer_balance') return 'credit';
  return null;
}

interface RefundLike {
  refundMethod: string;
  totalPiasters: number;
  refunds?: { method: string; amountPiasters: number }[] | null;
}

// One text per refund: the single method label, or "label: amount" for every part of a split refund
export function describeRefund(ret: RefundLike, labels: Record<RefundMethodKey, string> = REFUND_METHOD_LABELS): string {
  if (ret.refunds && ret.refunds.length > 1) {
    return ret.refunds
      .map((part) => {
        const key = toRefundMethodKey(part.method);
        return `${key ? labels[key] : part.method}: ${formatArabicCurrency(part.amountPiasters)}`;
      })
      .join(' + ');
  }
  const key = toRefundMethodKey(ret.refundMethod);
  return key ? labels[key] : ret.refundMethod;
}
