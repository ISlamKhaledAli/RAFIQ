import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Dead stock is anchored to today ("no sale in the last N days"), so the control is a days threshold, not a from/to range.
const read = (...parts) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');
const radar = read('src', 'components', 'analytics', 'DeadStockRadar.tsx');
const service = read('..', 'desktop', 'Services', 'ReportsService.cs');
const deadStockSql = service.slice(service.indexOf('public DeadStockReport GetDeadStockReport'), service.indexOf('public List<CashierPerformanceMetric>'));

describe('DeadStockRadar wording and filter', () => {
  it('states the rule accurately and drops the misleading "selected period"', () => {
    assert.ok(radar.includes('أصناف في المخزن لم تُبع خلال آخر {daysThreshold} يوم'));
    assert.ok(radar.includes('تُحسب من تاريخ آخر بيع لكل صنف حتى اليوم'));
    assert.ok(!radar.includes('الفترة المحددة'));
    assert.ok(!radar.includes('متواجدة بالمخزن'));
  });

  it('keeps a days threshold (no from/to range) built on the shared segmented tabs', () => {
    assert.ok(radar.includes("import { SegmentedTabs, type SegmentedTabOption } from '../SegmentedTabs';"));
    assert.ok(radar.includes('size="compact"'));
    assert.ok(radar.includes('const DAY_PRESETS = [15, 30, 45, 60, 90, 180];'));
    assert.ok(!/DateFilterControl|useDateFilter|fromDate|toDate/.test(radar));
    assert.ok(radar.includes("invoke<DeadStockReport>('reports:getDeadStock', { daysThreshold })"));
  });

  it('custom days: integer-only, Arabic digits normalised, 1..3650, applied on Enter and blur', () => {
    assert.ok(radar.includes('const MIN_DAYS = 1;') && radar.includes('const MAX_DAYS = 3650;'));
    assert.ok(radar.includes("import { normalizeArabicDigits } from '../../utils/numberEnforcer';"));
    assert.ok(radar.includes("normalizeArabicDigits(e.target.value).replace(/\\D/g, '')"));
    assert.ok(radar.includes('inputMode="numeric"') && radar.includes('type="text"'));
    assert.ok(radar.includes("e.key === 'Enter'") && radar.includes('onBlur={handleApplyCustomDays}'));
    assert.ok(radar.includes('parsed >= MIN_DAYS && parsed <= MAX_DAYS'));
    assert.ok(radar.includes('h-10') && radar.includes('يوم'));
    assert.ok(!radar.includes('9999'));
  });

  it('uses theme tokens only, with dark pairs, no native select', () => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(radar));
    assert.ok(!/-(slate|gray|emerald|amber|red|green)-\d{2,3}/.test(radar));
    assert.ok(!/<select/.test(radar));
    assert.ok(!radar.includes('gapx-'), 'dead class');
  });

  it('shows a hint when the list is capped while the totals cover every dead item', () => {
    assert.ok(radar.includes('count > items.length'));
    assert.ok(deadStockSql.includes('LIMIT 50'));
    assert.ok(deadStockSql.includes('SELECT COUNT(*), COALESCE(SUM((stock_milli * cost_piasters) / 1000), 0) FROM ('));
    assert.ok(!deadStockSql.includes('TotalDeadItemsCount = report.Items.Count'));
  });
});

describe('dead stock query matches the wording', () => {
  it('in stock, last non-cancelled sale on or before today minus N local days (or never sold)', () => {
    assert.ok(deadStockSql.includes('p.stock_quantity_milli > 0'));
    assert.ok(deadStockSql.includes("s.status != 'cancelled'"));
    assert.ok(deadStockSql.includes("HAVING last_sold IS NULL OR date(last_sold, 'localtime') <= date('now', 'localtime', '-' || @days || ' days')"));
  });
});
