// How much of a purchase invoice is paid now. All amounts are integer piasters.
export type SupplierPaymentState = 'none' | 'full' | 'partial' | 'credit' | 'excess';

export function getSupplierPaymentState(netCostPiasters: number, paidAmountPiasters: number): SupplierPaymentState {
  if (netCostPiasters <= 0) return 'none';
  if (paidAmountPiasters <= 0) return 'credit';
  if (paidAmountPiasters === netCostPiasters) return 'full';
  return paidAmountPiasters < netCostPiasters ? 'partial' : 'excess';
}

// Paying from the cash drawer needs enough cash in it; unknown balance (null) never blocks, the server still checks
export function isCashDrawerBlocked(
  paymentSource: string,
  paidAmountPiasters: number,
  liveDrawerCashPiasters: number | null,
): boolean {
  return (
    paymentSource === 'cash_drawer' &&
    paidAmountPiasters > 0 &&
    liveDrawerCashPiasters !== null &&
    (liveDrawerCashPiasters <= 0 || paidAmountPiasters > liveDrawerCashPiasters)
  );
}

// Starting point for "pay part now": half the invoice (rounded down to a whole piaster), never the full amount
export function halfOfInvoicePiasters(netCostPiasters: number): number {
  return Math.max(0, Math.floor(netCostPiasters / 2));
}

// Supplier balance wording: positive means the shop owes the supplier, negative means the supplier owes the shop
export function describeSupplierBalance(balancePiasters: number, formatMoney: (piasters: number) => string): string {
  if (balancePiasters > 0) return `علينا ${formatMoney(balancePiasters)}`;
  if (balancePiasters < 0) return `لنا ${formatMoney(Math.abs(balancePiasters))}`;
  return 'خالص';
}
