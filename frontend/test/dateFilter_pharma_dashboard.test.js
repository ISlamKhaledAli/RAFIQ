import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  PROFITABILITY_FLOOR_DATE,
  lastMonthFilter,
  lastDaysFilter,
  buildInspectionRegisterPayload,
  buildProfitabilityPayload,
} from '../src/components/pharmaDateRange.ts';
import { toLocalDateString } from '../src/utils/dateFilter.ts';

const read = (...p) => fs.readFileSync(path.resolve(...p), 'utf8').replace(/\r\n/g, '\n');
const SRC = (rel) => read('src', rel);
const DESKTOP = (rel) => read('..', 'desktop', rel);

describe('pharma date range helpers (pure)', () => {
  it('lastMonthFilter goes back one calendar month and clamps short months', () => {
    assert.deepEqual(lastMonthFilter(new Date(2026, 10, 7)), { preset: 'custom', startDate: '2026-10-07', endDate: '2026-11-07' });
    assert.equal(lastMonthFilter(new Date(2026, 2, 31)).startDate, '2026-02-28');
    assert.equal(lastMonthFilter(new Date(2026, 0, 31)).startDate, '2025-12-31');
    assert.equal(lastMonthFilter(new Date(2028, 2, 31)).startDate, '2028-02-29');
  });

  it('lastDaysFilter ends today and starts N days earlier (local calendar days)', () => {
    assert.deepEqual(lastDaysFilter(30, new Date(2026, 10, 7, 23, 59)), { preset: 'custom', startDate: '2026-10-08', endDate: '2026-11-07' });
    assert.equal(lastDaysFilter(30, new Date(2026, 0, 5)).startDate, '2025-12-06');
  });

  it('inspection register payload uses dateFrom/dateTo (the names the backend reads), never startDate/endDate', () => {
    const p = buildInspectionRegisterPayload('p1', { preset: 'custom', startDate: '2026-10-01', endDate: '2026-10-31' });
    assert.deepEqual(p, { productId: 'p1', dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    assert.ok(!('startDate' in p) && !('endDate' in p));
  });

  it('inspection register payload: all = no range, open ends and swapped ranges are handled', () => {
    assert.deepEqual(buildInspectionRegisterPayload('p1', { preset: 'all', startDate: '', endDate: '' }), { productId: 'p1' });
    assert.deepEqual(buildInspectionRegisterPayload('p1', { preset: 'custom', startDate: '2026-10-05', endDate: '' }), { productId: 'p1', dateFrom: '2026-10-05' });
    assert.deepEqual(buildInspectionRegisterPayload('p1', { preset: 'custom', startDate: '', endDate: '2026-10-05' }), { productId: 'p1', dateTo: '2026-10-05' });
    assert.deepEqual(
      buildInspectionRegisterPayload('p1', { preset: 'custom', startDate: '2026-10-31', endDate: '2026-10-01' }),
      { productId: 'p1', dateFrom: '2026-10-01', dateTo: '2026-10-31' }
    );
    assert.deepEqual(buildInspectionRegisterPayload('p1', { preset: 'custom', startDate: '', endDate: '' }), { productId: 'p1' });
  });

  it('inspection register relative presets are evaluated when the payload is built, not frozen', () => {
    const today = toLocalDateString(new Date());
    assert.deepEqual(buildInspectionRegisterPayload('p1', { preset: 'today', startDate: '', endDate: '' }), { productId: 'p1', dateFrom: today, dateTo: today });
  });

  it('profitability payload always sends a complete custom range', () => {
    const now = new Date(2026, 10, 7);
    assert.deepEqual(buildProfitabilityPayload({ preset: 'custom', startDate: '2026-10-01', endDate: '2026-10-31' }, now), { period: 'custom', fromDate: '2026-10-01', toDate: '2026-10-31' });
    assert.deepEqual(buildProfitabilityPayload({ preset: 'all', startDate: '', endDate: '' }, now), { period: 'custom', fromDate: PROFITABILITY_FLOOR_DATE, toDate: '2026-11-07' });
    assert.deepEqual(buildProfitabilityPayload({ preset: 'custom', startDate: '2026-10-05', endDate: '' }, now), { period: 'custom', fromDate: '2026-10-05', toDate: '2026-11-07' });
    assert.deepEqual(buildProfitabilityPayload({ preset: 'custom', startDate: '', endDate: '2026-10-05' }, now), { period: 'custom', fromDate: PROFITABILITY_FLOOR_DATE, toDate: '2026-10-05' });
  });

  it('profitability payload: swapped range is reordered, future-only start never yields an inverted range', () => {
    const now = new Date(2026, 10, 7);
    assert.deepEqual(buildProfitabilityPayload({ preset: 'custom', startDate: '2026-10-31', endDate: '2026-10-01' }, now), { period: 'custom', fromDate: '2026-10-01', toDate: '2026-10-31' });
    assert.deepEqual(buildProfitabilityPayload({ preset: 'custom', startDate: '2026-12-01', endDate: '' }, now), { period: 'custom', fromDate: '2026-12-01', toDate: '2026-12-01' });
  });

  it('profitability payload: presets are re-evaluated per call', () => {
    const today = toLocalDateString(new Date());
    const p = buildProfitabilityPayload({ preset: 'today', startDate: '', endDate: '' });
    assert.deepEqual(p, { period: 'custom', fromDate: today, toDate: today });
  });
});

describe('controlled register SQL semantics (local calendar day over UTC ISO timestamps)', () => {
  let DatabaseSync = null;
  try {
    DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync;
  } catch {
    DatabaseSync = null;
  }

  it('inclusive local-day window with datetime(col, localtime) matches the repository clause', { skip: !DatabaseSync }, () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE d (id TEXT, created_at TEXT)');
      const ins = db.prepare('INSERT INTO d VALUES (?, ?)');
      const beforeUtc = db.prepare("SELECT datetime('2026-11-07 00:00:00', '-1 second', 'utc') AS v").get().v;
      const firstUtc = db.prepare("SELECT datetime('2026-11-07 00:00:00', 'utc') AS v").get().v;
      const lastUtc = db.prepare("SELECT datetime('2026-11-07 23:59:59', 'utc') AS v").get().v;
      const afterUtc = db.prepare("SELECT datetime('2026-11-07 23:59:59', '+1 second', 'utc') AS v").get().v;

      ins.run('before', beforeUtc.replace(' ', 'T') + '.999Z');
      ins.run('first', firstUtc.replace(' ', 'T') + '.000Z');
      ins.run('last', lastUtc.replace(' ', 'T') + '.000Z');
      ins.run('after', afterUtc.replace(' ', 'T') + '.000Z');
      ins.run('plain-utc', '2026-11-07 10:00:00'); // stored as plain local/utc
      const sql = "SELECT id FROM d WHERE datetime(created_at, 'localtime') >= ? AND datetime(created_at, 'localtime') <= ? ORDER BY id";
      const ids = db.prepare(sql).all('2026-11-07 00:00:00', '2026-11-07 23:59:59').map((r) => r.id);
      assert.deepEqual(ids, ['first', 'last', 'plain-utc']);
      const openBefore = db.prepare("SELECT id FROM d WHERE datetime(created_at, 'localtime') < ? ORDER BY id").all('2026-11-07 00:00:00').map((r) => r.id);
      assert.deepEqual(openBefore, ['before']);
    } finally {
      db.close();
    }
  });
});

describe('controlled register backend: parameterised local-day range, backward compatible', () => {
  const repo = DESKTOP('Repositories/ControlledDrugRepository.cs');
  const dispatcher = DESKTOP('Bridge/IpcDispatcher.Pharma.cs');

  it('no UTC-day date(created_at) comparisons remain; localtime windows are used', () => {
    assert.ok(!/date\((cd|p|pr)?\.?created_at\)/.test(repo), 'date(created_at) is a UTC-day comparison');
    assert.ok(!repo.includes('date(@dateFrom)') && !repo.includes('date(@dateTo)'));
    for (const col of ['cd.created_at', 'p.created_at', 'pr.created_at', 'created_at']) {
      assert.ok(repo.includes(`datetime(${col}, 'localtime')`), `missing localtime window for ${col}`);
    }
    assert.ok(repo.includes('" 00:00:00"') && repo.includes('" 23:59:59"'));
  });

  it('range values are bound as parameters, swapped when inverted, invalid input is rejected', () => {
    assert.ok(repo.includes('BuildLocalRange(dateFrom, dateTo, out startTs, out endTs)'));
    assert.ok(repo.includes('rangeStart.Value > rangeEnd.Value'));
    assert.ok(repo.includes('DateTime.TryParseExact'));
    assert.ok(repo.includes('throw new ArgumentException'));
    assert.ok(!/@dateFrom'\s*\+|"\s*\+\s*dateFrom|"\s*\+\s*dateTo/.test(repo), 'dates must never be concatenated into SQL');
  });

  it('the dispatcher keeps reading optional dateFrom/dateTo (no new actions)', () => {
    assert.ok(dispatcher.includes('rObj["dateFrom"]') && dispatcher.includes('rObj["dateTo"]'));
    assert.ok(dispatcher.includes('cdObj["dateFrom"]') && dispatcher.includes('cdObj["dateTo"]'));
  });
});

describe('table inventory: date filter wired through the shared control', () => {
  const register = SRC('components/ControlledDrugsRegisterModal.tsx');
  const reports = SRC('components/SpecializedPharmacyReportsModal.tsx');

  it('controlled drugs register uses DateFilterControl and the backend-name payload helper', () => {
    assert.ok(register.includes("import { DateFilterControl } from './DateFilterControl'"));
    assert.ok(register.includes('<DateFilterControl'));
    assert.ok(register.includes('buildInspectionRegisterPayload(selectedProductId, dateFilter)'));
    assert.ok(!register.includes('type="date"'), 'no second date UI');
    assert.ok(!register.includes('toISOString().slice(0, 10)'), 'UTC day used as local day');
    assert.ok(!/startDate:\s*startDate/.test(register), 'backend ignores startDate/endDate');
  });

  it('controlled drugs register: empty state mentions the period and offers a reset; stale responses are dropped', () => {
    assert.ok(register.includes('resetFilters'));
    assert.ok(register.includes('describeDateFilter(dateFilter)'));
    assert.ok(register.includes('requestSeq'));
    assert.ok(register.includes('lastMonthFilter()'), 'default range recomputed on open');
  });

  it('pharmacy reports profitability tab uses DateFilterControl and a complete custom range', () => {
    assert.ok(reports.includes("import { DateFilterControl } from './DateFilterControl'"));
    assert.ok(reports.includes('<DateFilterControl'));
    assert.ok(reports.includes('buildProfitabilityPayload(profFilter)'));
    assert.ok(!reports.includes('profPeriod'), 'the fixed 4-option period select was replaced');
    assert.ok(reports.includes('profSeq'));
    assert.ok(reports.includes('setProfFilter(DEFAULT_DATE_FILTER)'), 'empty state reset action');
  });

  it('dashboard tables stay today-scoped: no date filter, data comes from the today summary', () => {
    const dash = SRC('views/DashboardView.tsx');
    assert.ok(dash.includes("'reports:getTodaySummary'"));
    assert.ok(!dash.includes('DateFilterControl'));
    assert.ok(dash.includes('أكتر بضاعة اتباعت النهاردة') && dash.includes('توالف وعجز بضاعة المخزن النهاردة'));
  });

  it('pharma modals without dated lists were left unchanged (no filter needed)', () => {
    for (const f of ['components/DataQualityAuditModal.tsx', 'components/DrugInteractionManagerModal.tsx', 'components/DrugReferenceImportModal.tsx']) {
      assert.ok(!SRC(f).includes('DateFilterControl'), f);
    }
  });
});
