import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildReportPeriodPayload, defaultCustomReportRange, REPORT_OPEN_START_DATE } from '../src/utils/reportPeriod.ts';
import { getDateFilterPayload } from '../src/utils/dateFilter.ts';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
const SRC = (rel) => read('src', rel);
const DESKTOP = (rel) => read('..', 'desktop', rel);

describe('report period payload (pure)', () => {
  it('non-custom periods send only the period token (the backend resolves the window)', () => {
    for (const p of ['today', 'yesterday', 'week', 'month', '3months', 'year']) {
      assert.deepEqual(buildReportPeriodPayload(p, '2026-01-01', '2026-01-31'), { period: p });
    }
  });

  it('custom keeps an ordered range as is and reorders a swapped one', () => {
    assert.deepEqual(buildReportPeriodPayload('custom', '2026-10-01', '2026-10-31'), { period: 'custom', fromDate: '2026-10-01', toDate: '2026-10-31' });
    assert.deepEqual(buildReportPeriodPayload('custom', '2026-10-31', '2026-10-01'), { period: 'custom', fromDate: '2026-10-01', toDate: '2026-10-31' });
  });

  it('custom with one open end fills it (the backend needs both ends, otherwise it silently reports today)', () => {
    const now = new Date(2026, 10, 7, 13, 0);
    assert.deepEqual(buildReportPeriodPayload('custom', '2026-10-05', '', now), { period: 'custom', fromDate: '2026-10-05', toDate: '2026-11-07' });
    assert.deepEqual(buildReportPeriodPayload('custom', '', '2026-10-05', now), { period: 'custom', fromDate: REPORT_OPEN_START_DATE, toDate: '2026-10-05' });
    assert.deepEqual(buildReportPeriodPayload('custom', '', '', now), { period: 'custom', fromDate: REPORT_OPEN_START_DATE, toDate: '2026-11-07' });
  });

  it('a start date in the future is never swapped with the open end', () => {
    const p = buildReportPeriodPayload('custom', '2026-12-01', '', new Date(2026, 10, 7));
    assert.deepEqual(p, { period: 'custom', fromDate: '2026-12-01', toDate: '2026-12-01' });
  });

  it('invalid dates are dropped instead of being sent', () => {
    const p = buildReportPeriodPayload('custom', 'abc', '2026-10-05', new Date(2026, 10, 7));
    assert.deepEqual(p, { period: 'custom', fromDate: REPORT_OPEN_START_DATE, toDate: '2026-10-05' });
  });

  it('default custom range is the last 30 LOCAL days (not the UTC date of toISOString)', () => {
    // 00:30 local on the 8th is still the 7th in UTC for UTC+ zones: the local date must win
    const now = new Date(2026, 10, 8, 0, 30);
    assert.deepEqual(defaultCustomReportRange(now), { from: '2026-10-09', to: '2026-11-08' });
  });
});

describe('shared preset payload used by wallets and e-pay lists', () => {
  it('week is the last 7 days including today and month starts on the 1st', () => {
    const weekRange = getDateFilterPayload({ preset: 'week', startDate: '', endDate: '' });
    const days = (new Date(weekRange.dateTo) - new Date(weekRange.dateFrom)) / 86400000;
    assert.equal(Math.round(days), 6);
    const monthRange = getDateFilterPayload({ preset: 'month', startDate: '', endDate: '' });
    assert.ok(monthRange.dateFrom.endsWith('-01'));
  });

  it('all and an empty custom range send no dates (the backend then applies no range)', () => {
    assert.deepEqual(getDateFilterPayload({ preset: 'all', startDate: '', endDate: '' }), {});
    assert.deepEqual(getDateFilterPayload({ preset: 'custom', startDate: '', endDate: '' }), {});
  });
});

describe('wallets and e-pay lists use the shared control and the backend range', () => {
  const wallets = SRC('views/wallets/WalletsView.tsx');
  const epay = SRC('views/epay/EpayView.tsx');

  it('both screens render DateFilterControl for history, analytics and (e-pay) fundings', () => {
    assert.equal((wallets.match(/<DateFilterControl/g) || []).length, 2);
    assert.equal((epay.match(/<DateFilterControl/g) || []).length, 3);
  });

  it('wallets sends the range, account and type to the backend instead of filtering a capped load', () => {
    assert.match(wallets, /invoke<DigitalTransaction\[\]>\('wallets:getTransactions', \{\n\s+limit: HISTORY_LOAD_LIMIT,/);
    assert.match(wallets, /\.\.\.getDateFilterPayload\(historyDateFilter\)/);
    assert.match(wallets, /'wallets:getAnalytics', getDateFilterPayload\(analyticsDateFilter\)/);
    assert.ok(!/filterHistoryDate|filterAnalyticsDate/.test(wallets), 'no client-side date filtering over the loaded rows');
    assert.ok(!/wallets:getFundings/.test(wallets), 'the unused fundings load was removed');
  });

  it('wallets analytics cards use SQL period totals, not sums over the loaded rows', () => {
    assert.match(wallets, /analytics\?\.periodProfitPiasters/);
    assert.match(wallets, /analytics\?\.periodVolumePiasters/);
    assert.match(wallets, /analytics\?\.totalProfitPiasters/);
    assert.ok(!/filteredAnalyticsTxs/.test(wallets));
  });

  it('e-pay sends fromDate/toDate for history, fundings and analytics', () => {
    assert.match(epay, /'epay:getTransactions', \{[\s\S]*?\.\.\.toEpayRange\(historyDateFilter\)/);
    assert.match(epay, /'epay:getFundings', \{[\s\S]*?\.\.\.toEpayRange\(fundingDateFilter\)/);
    assert.match(epay, /'epay:getAnalytics', toEpayRange\(analyticsDateFilter\)/);
    assert.ok(!/filterHistoryDate|filterAnalyticsDate|filteredAnalyticsTxs/.test(epay));
  });

  it('e-pay destination filter value matches the stored channel (terminal_till)', () => {
    assert.ok(!/terminal_drawer/.test(epay));
    assert.match(epay, /value: 'terminal_till', label: 'درج المحفظة\/الماكينة'/);
  });

  it('both screens reload when the day rolls over and warn when the row cap is reached', () => {
    for (const src of [wallets, epay]) {
      assert.match(src, /useToday\(\)/);
      assert.match(src, /getDateFilterKey\(/);
      assert.match(src, /تم عرض أحدث/);
    }
  });

  it('pagination resets with the range key and the empty state offers a reset', () => {
    assert.match(wallets, /getDateFilterKey\(historyDateFilter\)/);
    assert.match(epay, /getDateFilterKey\(historyDateFilter\)/);
    assert.match(epay, /getDateFilterKey\(fundingDateFilter\)/);
    assert.match(wallets, /عرض كل العمليات/);
    assert.match(epay, /عرض كل الحركات/);
  });
});

describe('insurance lists', () => {
  const ins = SRC('views/insurance/InsuranceContractsView.tsx');

  it('issued batches and the pending-claims picker use the shared control', () => {
    assert.equal((ins.match(/<DateFilterControl/g) || []).length, 2);
    assert.match(ins, /filteredBatches = batches\.filter\(\(b\) => matchesDateFilter\(b\.createdAt, batchesDateFilter\)\)/);
    assert.match(ins, /filteredPendingClaims = pendingClaims\.filter/);
  });

  it('changing the claims period clears the selection and select-all only picks visible claims', () => {
    assert.match(ins, /claimsFilterKey[\s\S]{0,160}setSelectedPendingClaimIds\(\[\]\)/);
    assert.match(ins, /setSelectedPendingClaimIds\(filteredPendingClaims\.map/);
  });

  it('page resets with the batches filter', () => {
    assert.match(ins, /setBatchesPage\(1\);\n\s+\}, \[batchesFilterKey\]\)/);
  });
});

describe('analytics screens: period selectors are consistent across the report queries', () => {
  for (const f of ['Revenue', 'Customer', 'Inventory']) {
    it(`${f}AnalyticsView builds the payload with the shared helper and local default dates`, () => {
      const src = SRC(`views/analytics/${f}AnalyticsView.tsx`);
      assert.match(src, /buildReportPeriodPayload\(period, customFrom, customTo\)/);
      assert.match(src, /defaultCustomReportRange\(\)/);
      assert.ok(!/toISOString\(\)\.split\('T'\)/.test(src), 'no UTC date for the default custom range');
      assert.match(src, /useToday\(\)/);
      assert.ok(!/هذا الشهر \(30 يوم\)|'هذا العام'/.test(src), 'labels describe rolling windows honestly');
    });
  }

  it('Revenue sends the same custom range to the comparison widget', () => {
    const src = SRC('views/analytics/RevenueAnalyticsView.tsx');
    assert.match(src, /'reports:getPeriodComparison', payload/);
  });

  it('CashierPerformanceCard uses the shared payload helper', () => {
    assert.match(SRC('components/analytics/CashierPerformanceCard.tsx'), /buildReportPeriodPayload\(period/);
  });
});

describe('backend: ranges are applied in SQL with local-day boundaries', () => {
  const dispatcherWallets = DESKTOP('Bridge/IpcDispatcher.Wallets.cs');
  const dispatcherEpay = DESKTOP('Bridge/IpcDispatcher.Epay.cs');
  const walletsRepo = DESKTOP('Repositories/DigitalAccountRepository.cs');
  const epayRepo = DESKTOP('Repositories/EpayRepository.cs');
  const reports = DESKTOP('Services/ReportsService.cs');

  it('wallets actions accept optional dateFrom/dateTo and pass them to the repository', () => {
    assert.match(dispatcherWallets, /repo\.GetTransactions\(limit, accountId, txType, dateFrom, dateTo\)/);
    assert.match(dispatcherWallets, /repo\.GetFundings\(limit, accountId, dateFrom, dateTo\)/);
    assert.match(dispatcherWallets, /repo\.GetPeriodTotals\(aFrom, aTo, out periodCount/);
  });

  it('e-pay getFundings accepts fromDate/toDate and analytics adds the per-service volume', () => {
    assert.match(dispatcherEpay, /repo\.GetFundings\(terminalId, limit, fundFrom, fundTo\)/);
    assert.match(dispatcherEpay, /GetBillVolumeByServiceType\(fromDate, toDate\)/);
  });

  it('repositories compare datetime(col, localtime) with parameterised day bounds', () => {
    assert.match(walletsRepo, /LocalDayRange\.Where\("t\.created_at", startTs, endTs\)/);
    assert.match(walletsRepo, /datetime\(" \+ column \+ ", 'localtime'\) >= @rangeStart/);
    assert.match(epayRepo, /datetime\(t\.created_at, 'localtime'\) >= @rangeStart/);
    assert.ok(!/toDate \+ "T23:59:59"/.test(epayRepo), 'the old UTC string comparison was removed');
  });

  it('report windows are exactly N days including today and 3months/year are supported everywhere', () => {
    assert.match(reports, /case "week": return 7;/);
    assert.match(reports, /case "3months": return 90;/);
    // only the unrelated inventory-velocity (last 30 days of sales) and dormant-customer queries keep fixed literals
    assert.equal((reports.match(/'-7 days'/g) || []).length, 1);
    assert.equal((reports.match(/'-30 days'/g) || []).length, 1);
    // the four inline period resolvers share RollingWindowDays
    assert.ok((reports.match(/RollingWindowDays\(period\) > 0/g) || []).length >= 6);
    assert.match(reports, /NormalizeCustomRange\(ref customFrom, ref customTo\)/);
  });
});
