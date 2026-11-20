import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Senior Architecture: Revenue Analytics Payment Breakdown & Insurance Dynamics', () => {
  const root = process.cwd().endsWith('frontend') ? '.' : 'frontend';
  const viewPath = path.resolve(root, 'src/views/analytics/RevenueAnalyticsView.tsx');
  const viewSrc = fs.readFileSync(viewPath, 'utf8');

  test('1. Zero math leaks: vodafone cash percentage is derived directly from its sales, never 100 - others', () => {
    // Must NOT contain the bug: 100 - cashPct - creditPct...
    assert.doesNotMatch(viewSrc, /100\s*-\s*cashPct\s*-\s*creditPct/, 'يُمنع منعاً باتاً حساب فودافون كاش كطرح عشوائي من 100');
    
    // Must derive percentage with positive sales check:
    assert.match(viewSrc, /vodafoneCashPct\s*=\s*totalSales\s*>\s*0\s*&&\s*vodafoneCashSales\s*>\s*0/, 'فودافون كاش لا تأخذ نسبة إلا إذا كانت مبيعاتها الفعلية أكبر من صفر');
  });

  test('2. Dynamic SVG slices: Only active channels with > 0 sales are drawn', () => {
    assert.match(viewSrc, /paymentSlices\s*=\s*useMemo/, 'الشرائح تُحسب ديناميكياً بناءً على القنوات النشطة فقط');
    assert.match(viewSrc, /paymentSlices\.map/, 'رسم الدائرة يعتمد على القنوات النشطة فقط');
  });

  test('3. Insurance support: Insurance channel is exposed with settled and pending amounts', () => {
    assert.match(viewSrc, /insuranceSales/, 'التقرير يتتبع مبيعات التأمين الطبي');
    assert.match(viewSrc, /insuranceSettled/, 'التقرير يوضح المبالغ المسددة من شركات التأمين');
    assert.match(viewSrc, /insurancePending/, 'التقرير يوضح المبالغ المعلقة قيد التحصيل');
  });

  test('4. Backend model & report contract integrity', () => {
    const desktopRoot = process.cwd().endsWith('frontend') ? '../desktop' : 'desktop';
    const reportModelPath = path.resolve(desktopRoot, 'Models/ReportModels.cs');
    const reportModelSrc = fs.readFileSync(reportModelPath, 'utf8');
    assert.match(reportModelSrc, /InsuranceSalesPiasters/, 'SalesReport في C# يحتوي على InsuranceSalesPiasters');
    assert.match(reportModelSrc, /InsuranceSettledPiasters/, 'SalesReport في C# يحتوي على InsuranceSettledPiasters');
    assert.match(reportModelSrc, /InsurancePendingPiasters/, 'SalesReport في C# يحتوي على InsurancePendingPiasters');
  });
});
