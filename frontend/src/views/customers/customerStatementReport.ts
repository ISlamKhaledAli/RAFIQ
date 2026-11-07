import type { CustomerLedgerEntry } from '../../types/models';
import { type DateFilterValue, matchesDateFilter } from '../../utils/dateFilter.ts';

/** Response of customers:getDetailedStatement (the backend applies the period; dates are business days) */
export interface CustomerStatementReport {
  customerId: string;
  startDate: string;
  endDate: string;
  openingBalancePiasters: number;
  periodDebitsPiasters: number;
  periodCreditsPiasters: number;
  periodRefundsPiasters?: number;
  closingBalancePiasters: number;
  entries: CustomerLedgerEntry[];
}

export interface StatementPeriodSummary {
  openingBalancePiasters: number;
  periodDebitsPiasters: number;
  periodCreditsPiasters: number;
  periodRefundsPiasters: number;
  closingBalancePiasters: number;
}

export interface StatementView {
  entries: CustomerLedgerEntry[];
  summary: StatementPeriodSummary;
}

const EMPTY_SUMMARY: StatementPeriodSummary = {
  openingBalancePiasters: 0,
  periodDebitsPiasters: 0,
  periodCreditsPiasters: 0,
  periodRefundsPiasters: 0,
  closingBalancePiasters: 0,
};

/**
 * Rows (newest first) and totals shown for a period. The backend always returns opening-balance
 * entries and already folds them into the opening balance, so one dated outside the period is not listed.
 */
export function buildStatementView(report: CustomerStatementReport | null, filter: DateFilterValue): StatementView {
  if (!report) return { entries: [], summary: EMPTY_SUMMARY };
  const entries = (report.entries || [])
    .filter((entry) => entry.type !== 'opening_balance' || matchesDateFilter(entry.createdAt, filter))
    .reverse();
  return {
    entries,
    summary: {
      openingBalancePiasters: report.openingBalancePiasters || 0,
      periodDebitsPiasters: report.periodDebitsPiasters || 0,
      periodCreditsPiasters: report.periodCreditsPiasters || 0,
      periodRefundsPiasters: report.periodRefundsPiasters || 0,
      closingBalancePiasters: report.closingBalancePiasters || 0,
    },
  };
}

/** A payment is cancelled when a payment_cancel entry (in the loaded period) points at it */
export function isStatementEntryCancelled(entries: CustomerLedgerEntry[], entryId: string): boolean {
  return entries.some((e) => e.type === 'payment_cancel' && e.saleId === entryId);
}
