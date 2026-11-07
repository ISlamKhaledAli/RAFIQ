import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_DATE_FILTER,
  normalizeDateRange,
  matchesDateFilter,
  getDateFilterRange,
  getDateFilterPayload,
  getDateFilterKey,
  isDateFilterActive,
  describeDateFilter,
  formatLocalDateTime,
  toLocalDateString,
} from '../src/utils/dateFilter.ts';
import { buildSalesHistoryQuery, summarizeSales, SALES_HISTORY_LIMIT } from '../src/utils/salesHistoryFilter.ts';
import { buildStatementView, isStatementEntryCancelled } from '../src/views/customers/customerStatementReport.ts';

const read = (...parts) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

// Local wall-clock instants stored the way the backend stores them (UTC ISO), independent of the machine time zone
const localIso = (y, m, d, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).toISOString();
const daysAgo = (n, h = 12) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, h, 0, 0).toISOString();
};
const custom = (startDate, endDate) => ({ preset: 'custom', startDate, endDate });

describe('shared date filter: range semantics', () => {
  it('custom range includes 00:00:00 of the start day and 23:59:59 of the end day, excludes the neighbours', () => {
    const f = custom('2026-03-10', '2026-03-12');
    assert.equal(matchesDateFilter(localIso(2026, 3, 10, 0, 0, 0), f), true);
    assert.equal(matchesDateFilter(localIso(2026, 3, 12, 23, 59, 59), f), true);
    assert.equal(matchesDateFilter(localIso(2026, 3, 9, 23, 59, 59), f), false);
    assert.equal(matchesDateFilter(localIso(2026, 3, 13, 0, 0, 0), f), false);
  });

  it('a record stored as UTC late at night belongs to the LOCAL day, not the UTC day', () => {
    const lateNight = localIso(2026, 3, 10, 23, 30, 0);
    assert.equal(matchesDateFilter(lateNight, custom('2026-03-10', '2026-03-10')), true);
    const justAfterMidnight = localIso(2026, 3, 11, 0, 20, 0);
    assert.equal(matchesDateFilter(justAfterMidnight, custom('2026-03-11', '2026-03-11')), true);
    assert.equal(matchesDateFilter(justAfterMidnight, custom('2026-03-10', '2026-03-10')), false);
  });

  it('only a start or only an end works', () => {
    assert.equal(matchesDateFilter(localIso(2026, 5, 1, 9), custom('2026-04-01', '')), true);
    assert.equal(matchesDateFilter(localIso(2026, 3, 1, 9), custom('2026-04-01', '')), false);
    assert.equal(matchesDateFilter(localIso(2026, 3, 1, 9), custom('', '2026-04-01')), true);
    assert.equal(matchesDateFilter(localIso(2026, 5, 1, 9), custom('', '2026-04-01')), false);
  });

  it('a swapped range (start after end) is reordered instead of matching nothing', () => {
    assert.deepEqual(normalizeDateRange('2026-03-12', '2026-03-10'), { startDate: '2026-03-10', endDate: '2026-03-12' });
    assert.equal(matchesDateFilter(localIso(2026, 3, 11, 10), custom('2026-03-12', '2026-03-10')), true);
    assert.deepEqual(getDateFilterRange(custom('2026-03-12', '2026-03-10')), { startDate: '2026-03-10', endDate: '2026-03-12' });
  });

  it('invalid custom values are ignored', () => {
    assert.deepEqual(normalizeDateRange('abc', '2026-03-10'), { startDate: '', endDate: '2026-03-10' });
    assert.deepEqual(normalizeDateRange('', ''), { startDate: '', endDate: '' });
  });

  it('week means the last 7 days including today (not 8)', () => {
    const f = { preset: 'week', startDate: '', endDate: '' };
    assert.equal(matchesDateFilter(daysAgo(0), f), true);
    assert.equal(matchesDateFilter(daysAgo(6), f), true);
    assert.equal(matchesDateFilter(daysAgo(7), f), false);
    const range = getDateFilterRange(f);
    assert.equal(range.endDate, toLocalDateString(new Date()));
    const start = new Date();
    start.setDate(start.getDate() - 6);
    assert.equal(range.startDate, toLocalDateString(start));
  });

  it('today / yesterday / month presets', () => {
    assert.equal(matchesDateFilter(daysAgo(0), { preset: 'today', startDate: '', endDate: '' }), true);
    assert.equal(matchesDateFilter(daysAgo(1), { preset: 'today', startDate: '', endDate: '' }), false);
    assert.equal(matchesDateFilter(daysAgo(1), { preset: 'yesterday', startDate: '', endDate: '' }), true);
    assert.equal(matchesDateFilter(daysAgo(2), { preset: 'yesterday', startDate: '', endDate: '' }), false);
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 1).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
    assert.equal(matchesDateFilter(first, { preset: 'month', startDate: '', endDate: '' }), true);
    assert.equal(matchesDateFilter(lastMonth, { preset: 'month', startDate: '', endDate: '' }), false);
    assert.equal(getDateFilterRange({ preset: 'month', startDate: '', endDate: '' }).startDate.endsWith('-01'), true);
  });

  it('a pinned reference day makes relative presets recompute after midnight', () => {
    assert.deepEqual(getDateFilterRange({ preset: 'today', startDate: '', endDate: '' }, '2026-03-10'), { startDate: '2026-03-10', endDate: '2026-03-10' });
    assert.deepEqual(getDateFilterRange({ preset: 'yesterday', startDate: '', endDate: '' }, '2026-03-01'), { startDate: '2026-02-28', endDate: '2026-02-28' });
    assert.deepEqual(getDateFilterRange({ preset: 'week', startDate: '', endDate: '' }, '2026-03-10'), { startDate: '2026-03-04', endDate: '2026-03-10' });
    assert.deepEqual(getDateFilterRange({ preset: 'month', startDate: '', endDate: '' }, '2026-03-10'), { startDate: '2026-03-01', endDate: '2026-03-10' });
    assert.deepEqual(getDateFilterPayload({ preset: 'today', startDate: '', endDate: '' }, '2026-03-11'), { dateFrom: '2026-03-11', dateTo: '2026-03-11' });
    assert.deepEqual(buildSalesHistoryQuery({ preset: 'today', startDate: '', endDate: '' }, 'all', '2026-03-11'), { limit: SALES_HISTORY_LIMIT, dateFrom: '2026-03-11', dateTo: '2026-03-11' });
  });

  it('records without a date never match an active filter but always match "all"', () => {
    assert.equal(matchesDateFilter(null, DEFAULT_DATE_FILTER), true);
    assert.equal(matchesDateFilter(null, { preset: 'today', startDate: '', endDate: '' }), false);
  });
});

describe('shared date filter: backend payload helpers', () => {
  it('unfiltered and empty custom send nothing (backward compatible payloads)', () => {
    assert.deepEqual(getDateFilterPayload(DEFAULT_DATE_FILTER), {});
    assert.deepEqual(getDateFilterPayload(custom('', '')), {});
    assert.equal(isDateFilterActive(custom('', '')), false);
    assert.equal(isDateFilterActive(DEFAULT_DATE_FILTER), false);
  });

  it('presets and custom ranges become dateFrom/dateTo local days', () => {
    const today = toLocalDateString(new Date());
    assert.deepEqual(getDateFilterPayload({ preset: 'today', startDate: '', endDate: '' }), { dateFrom: today, dateTo: today });
    assert.deepEqual(getDateFilterPayload(custom('2026-03-10', '')), { dateFrom: '2026-03-10' });
    assert.deepEqual(getDateFilterPayload(custom('', '2026-03-10')), { dateTo: '2026-03-10' });
    assert.deepEqual(getDateFilterPayload(custom('2026-03-12', '2026-03-10')), { dateFrom: '2026-03-10', dateTo: '2026-03-12' });
  });

  it('describes the active period in Arabic and gives a key that changes with the range', () => {
    assert.equal(describeDateFilter(DEFAULT_DATE_FILTER), '');
    assert.equal(describeDateFilter({ preset: 'today', startDate: '', endDate: '' }), 'اليوم');
    assert.equal(describeDateFilter(custom('2026-03-10', '2026-03-12')), 'من 2026-03-10 إلى 2026-03-12');
    assert.equal(describeDateFilter(custom('2026-03-10', '2026-03-10')), '2026-03-10');
    assert.equal(describeDateFilter(custom('', '2026-03-12')), 'حتى 2026-03-12');
    assert.notEqual(getDateFilterKey(custom('2026-03-10', '')), getDateFilterKey(custom('2026-03-11', '')));
  });

  it('formats stored UTC timestamps as local date and time', () => {
    assert.equal(formatLocalDateTime(localIso(2026, 3, 10, 23, 5, 59)), '2026-03-10 23:05');
    assert.equal(formatLocalDateTime(''), '');
    assert.equal(formatLocalDateTime('not a date'), '');
  });
});

describe('sales history: server-side period, status and KPIs', () => {
  it('sends the period and status to the backend with the load limit', () => {
    assert.deepEqual(buildSalesHistoryQuery(DEFAULT_DATE_FILTER, 'all'), { limit: SALES_HISTORY_LIMIT });
    assert.deepEqual(buildSalesHistoryQuery(custom('2026-03-10', '2026-03-12'), 'cancelled'), {
      limit: SALES_HISTORY_LIMIT,
      dateFrom: '2026-03-10',
      dateTo: '2026-03-12',
      status: 'cancelled',
    });
    assert.ok(SALES_HISTORY_LIMIT > 100, 'the old 100-row cap must not decide which period matches');
  });

  it('KPIs count only non-cancelled revenue and average over the same invoices, in integer piasters', () => {
    const totals = summarizeSales([
      { status: 'completed', totalPiasters: 10001 },
      { status: 'partially_refunded', totalPiasters: 5000 },
      { status: 'cancelled', totalPiasters: 99999 },
    ]);
    assert.equal(totals.invoiceCount, 3);
    assert.equal(totals.validCount, 2);
    assert.equal(totals.totalPiasters, 15001);
    assert.equal(totals.averagePiasters, 7501);
    assert.deepEqual(summarizeSales([]), { invoiceCount: 0, validCount: 0, totalPiasters: 0, averagePiasters: 0 });
  });
});

describe('customer statement: period comes from the backend report', () => {
  const entry = (id, type, createdAt, extra = {}) => ({ id, customerId: 'c1', type, amountPiasters: 1000, balanceAfterPiasters: 0, notes: '', createdAt, ...extra });
  const report = {
    customerId: 'c1',
    startDate: '2026-03-10',
    endDate: '2026-03-12',
    openingBalancePiasters: 5000,
    periodDebitsPiasters: 3000,
    periodCreditsPiasters: 1000,
    closingBalancePiasters: 7000,
    entries: [
      entry('o', 'opening_balance', localIso(2026, 1, 1, 9)),
      entry('s1', 'sale', localIso(2026, 3, 10, 9)),
      entry('p1', 'payment', localIso(2026, 3, 11, 9)),
      entry('c1', 'payment_cancel', localIso(2026, 3, 12, 9), { saleId: 'p1' }),
    ],
  };

  it('lists newest first, takes totals from the report and hides an opening entry outside the period', () => {
    const view = buildStatementView(report, custom('2026-03-10', '2026-03-12'));
    assert.deepEqual(view.entries.map((e) => e.id), ['c1', 'p1', 's1']);
    assert.equal(view.summary.openingBalancePiasters, 5000);
    assert.equal(view.summary.closingBalancePiasters, 7000);
    assert.equal(view.summary.periodRefundsPiasters, 0);
  });

  it('keeps the opening entry when no period is selected and does not mutate the report', () => {
    const view = buildStatementView(report, DEFAULT_DATE_FILTER);
    assert.equal(view.entries.length, 4);
    assert.equal(view.entries[3].id, 'o');
    assert.equal(report.entries[0].id, 'o');
  });

  it('handles a missing report and detects cancelled payments', () => {
    assert.deepEqual(buildStatementView(null, DEFAULT_DATE_FILTER).entries, []);
    assert.equal(isStatementEntryCancelled(report.entries, 'p1'), true);
    assert.equal(isStatementEntryCancelled(report.entries, 's1'), false);
  });
});

describe('every dated list in the sales / customers / audit / closing / backup area uses the shared control', () => {
  const sources = {
    sales: read('src/views/SalesHistoryView.tsx'),
    statement: read('src/views/customers/CustomerStatementModal.tsx'),
    customers: read('src/views/CustomersView.tsx'),
    debtors: read('src/components/DebtorsReportModal.tsx'),
    closing: read('src/components/DailyClosingModal.tsx'),
    held: read('src/components/HeldSalesModal.tsx'),
    audit: read('src/views/AuditLogView.tsx'),
    backup: read('src/components/BackupManager.tsx'),
  };

  it('each screen renders DateFilterControl', () => {
    for (const name of ['sales', 'statement', 'debtors', 'closing', 'held', 'audit', 'backup']) {
      assert.match(sources[name], /<DateFilterControl\b/, `${name} must render DateFilterControl`);
    }
  });

  it('sales history sends the period to the backend instead of filtering a capped load', () => {
    assert.match(sources.sales, /buildSalesHistoryQuery\(/);
    assert.match(sources.sales, /invoke<Sale\[\]>\('sales:getRecent', loadQuery\)/);
    assert.match(sources.sales, /'sales:search', \{ query: raw, \.\.\.loadQuery \}/);
    assert.doesNotMatch(sources.sales, /limit: 100\b/);
    assert.match(sources.sales, /useToday\(\)/);
    assert.match(sources.sales, /getDateFilterKey\(dateFilter\)/);
    assert.match(sources.sales, /summarizeSales\(filteredSales\)/);
  });

  it('customer statement is loaded per period from the uncapped detailed statement', () => {
    assert.match(sources.customers, /customers:getDetailedStatement/);
    assert.doesNotMatch(sources.customers, /customers:getStatement/);
    assert.doesNotMatch(sources.customers, /createdAt\.slice\(0, 10\)/);
    assert.match(sources.statement, /onChange=\{onDateFilterChange\}/);
  });

  it('audit log bounds follow local days, re-evaluate at midnight and never use the old rolling 7 x 24h window', () => {
    assert.match(sources.audit, /getDateFilterRange\(dateFilter, today\)/);
    assert.match(sources.audit, /useToday\(\)/);
    assert.doesNotMatch(sources.audit, /7 \* 24 \* 60 \* 60 \* 1000/);
  });

  it('closing history and backup list send the period to the backend', () => {
    assert.match(sources.closing, /'closing:getHistory', historyQuery/);
    assert.match(sources.closing, /getDateFilterPayload\(historyFilter, today\)/);
    assert.match(sources.backup, /'backup:getStatus', listQuery/);
  });

  it('local display of stored UTC timestamps (no raw substring of the ISO text)', () => {
    assert.doesNotMatch(sources.closing, /closedAt\.substring\(0, 16\)/);
    assert.doesNotMatch(sources.debtors, /lastTransactionDate\.substring/);
  });
});

describe('backend contract (source level; NUnit S61 covers behaviour)', () => {
  const sales = read('../desktop/Bridge/IpcDispatcher.Sales.cs');
  const repo = read('../desktop/Repositories/SaleRepository.cs');
  const closing = read('../desktop/Repositories/DailyClosingRepository.cs');
  const backup = read('../desktop/Services/BackupService.cs');

  it('sales:getRecent reads limit/dateFrom/dateTo/status and applies them in parameterised SQL on the local day', () => {
    assert.match(sales, /recentObj\["dateFrom"\]/);
    assert.match(sales, /recentObj\["dateTo"\]/);
    assert.doesNotMatch(sales, /GetRecentSales\(20\)/);
    assert.match(repo, /date\(s\.created_at, 'localtime'\) >= @dateFrom/);
    assert.match(repo, /date\(s\.created_at, 'localtime'\) <= @dateTo/);
    assert.doesNotMatch(repo, /date\(s\.created_at\) >= date\(@dateFrom\)/);
  });

  it('closing history and backup status accept an optional period', () => {
    assert.match(closing, /business_date >= @dateFrom/);
    assert.match(closing, /business_date <= @dateTo/);
    assert.match(backup, /GetStatus\(string dateFrom, string dateTo\)/);
  });
});
