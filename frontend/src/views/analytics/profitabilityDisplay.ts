/**
 * Share of each row in net sales (ex-VAT, after returns). Rows whose net sales are zero or negative
 * (returns exceeded sales) get no share, and the denominator counts positive rows only, so shares
 * stay within 0..100.
 */
export function netSalesSharePercents(rows: ReadonlyArray<{ totalSalesPiasters: number }>): number[] {
  const positiveTotal = rows.reduce((sum, row) => sum + (row.totalSalesPiasters > 0 ? row.totalSalesPiasters : 0), 0);
  return rows.map((row) => {
    if (row.totalSalesPiasters <= 0 || positiveTotal <= 0) return 0;
    return Math.round((row.totalSalesPiasters * 1000) / positiveTotal) / 10;
  });
}

/** Orders by profit; 'asc' puts the biggest losses first. Ties fall back to net sales. */
export function sortByProfit<T extends { grossProfitPiasters: number; totalSalesPiasters: number }>(
  rows: ReadonlyArray<T>,
  direction: 'asc' | 'desc'
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) =>
    sign * (a.grossProfitPiasters - b.grossProfitPiasters) || sign * (a.totalSalesPiasters - b.totalSalesPiasters)
  );
}
