import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import {
  DollarSign,
  TrendingUp,
  RefreshCw,
  Printer,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  Award,
  Wallet,
  CheckCircle2,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { CustomSelect } from '../../components/CustomSelect';
import type { SelectOption } from '../../components/CustomSelect';
import { CustomDateRangePicker } from '../../components/CustomDatePicker';
import { formatArabicCurrency } from '../../utils/money';
import { FinancialGaugeMeter } from '../../components/analytics/FinancialGaugeMeter';
import { FinancialWaterfallChart } from '../../components/analytics/FinancialWaterfallChart';
import { HourlyHeatmapBar } from '../../components/analytics/HourlyHeatmapBar';
import { CashierPerformanceCard } from '../../components/analytics/CashierPerformanceCard';
import type {
  PeriodSalesReport,
  InventoryLossReport,
  ClosingHistoryRecord,
  CategoryPerformanceItem,
  ItemProfitabilityItem,
  PeriodComparisonReport,
  HourlyIntensityReport,
} from '../../types/models';

const PERIOD_OPTIONS: SelectOption[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر (30 يوم)' },
  { value: '3months', label: 'آخر 3 أشهر' },
  { value: 'year', label: 'هذا العام' },
  { value: 'custom', label: 'فترة مخصصة...' },
];

export const RevenueAnalyticsView: FC = () => {
  const [period, setPeriod] = useState<string>('month');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [salesReport, setSalesReport] = useState<PeriodSalesReport | null>(null);
  const [lossReport, setLossReport] = useState<InventoryLossReport | null>(null);
  const [closings, setClosings] = useState<ClosingHistoryRecord[]>([]);
  const [categories, setCategories] = useState<CategoryPerformanceItem[]>([]);
  const [profitableItems, setProfitableItems] = useState<ItemProfitabilityItem[]>([]);
  const [itemsDirection, setItemsDirection] = useState<'desc' | 'asc'>('desc');
  const [comparison, setComparison] = useState<PeriodComparisonReport | null>(null);
  const [hourlyReport, setHourlyReport] = useState<HourlyIntensityReport | null>(null);

  const [activeSection, setActiveSection] = useState<'overview' | 'traffic' | 'categories' | 'items' | 'closings'>('overview');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = {
        period,
        fromDate: period === 'custom' ? customFrom : undefined,
        toDate: period === 'custom' ? customTo : undefined,
      };

      const [salesRes, lossRes, closingsRes, catRes, itemsRes, compRes, hourlyRes] = await Promise.all([
        invoke<PeriodSalesReport>('reports:getPeriodSales', payload).catch(() => null),
        invoke<InventoryLossReport>('reports:getInventoryLoss', payload).catch(() => null),
        invoke<ClosingHistoryRecord[]>('reports:getClosingHistory', payload).catch(() => []),
        invoke<CategoryPerformanceItem[]>('reports:getCategoryPerformance', payload).catch(() => []),
        invoke<ItemProfitabilityItem[]>('reports:getItemProfitability', {
          period,
          direction: itemsDirection,
          limit: 20
        }).catch(() => []),
        invoke<PeriodComparisonReport>('reports:getPeriodComparison', { period }).catch(() => null),
        invoke<HourlyIntensityReport>('reports:getHourlyIntensity', payload).catch(() => null),
      ]);

      setSalesReport(salesRes);
      setLossReport(lossRes);
      setClosings(closingsRes || []);
      setCategories(catRes || []);
      setProfitableItems(itemsRes || []);
      setComparison(compRes);
      setHourlyReport(hourlyRes);
    } catch (err) {
      console.error('Failed to load revenue analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period, customFrom, customTo, itemsDirection]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Derived financial metrics
  const totalSales = salesReport?.totalSalesPiasters || 0;
  const returnsTotal = salesReport?.returnsTotalPiasters || 0;
  const netSales = Math.max(0, totalSales - returnsTotal);
  const grossProfit = salesReport?.grossProfitPiasters || 0;
  const cogs = Math.max(0, netSales - grossProfit);
  const inventoryLosses = lossReport?.totalLossPiasters || 0;
  const netOperationalProfit = grossProfit - inventoryLosses;
  const netMarginPercent = netSales > 0 ? (netOperationalProfit * 100) / netSales : 0;

  // Payment breakdown percentages
  const cashSales = salesReport?.cashSalesPiasters || 0;
  const creditSales = salesReport?.creditSalesPiasters || 0;
  const cardSales = salesReport?.cardSalesPiasters || 0;
  const cashPct = totalSales > 0 ? Math.round((cashSales * 100) / totalSales) : 0;
  const creditPct = totalSales > 0 ? Math.round((creditSales * 100) / totalSales) : 0;
  const cardPct = totalSales > 0 ? Math.max(0, 100 - cashPct - creditPct) : 0;

  // Composite Financial Health Score (0 - 100)
  const financialScore = Math.max(
    15,
    Math.min(
      98,
      Math.round(
        50 +
        (cashPct * 0.25) +
        Math.min(25, netMarginPercent * 1.2) -
        (totalSales > 0 ? (inventoryLosses * 100 / totalSales) * 2 : 0) -
        (creditPct > 35 ? (creditPct - 35) * 0.5 : 0)
      )
    )
  );

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas text-ink overflow-y-auto select-none p-3 sm:p-5" dir="rtl">
      {/* 1. Header & Period Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-line shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-paid-soft text-paid flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink">تحليلات الإيرادات ومصادر الأموال والأرباح</h1>
              <p className="text-xs text-ink-muted">
                تتبع تدفق كل قرش بالكامل: مبيعات، تكلفة بضاعة، عجز جرد، وسجلات الإقفال اليومي
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <CustomSelect
              options={PERIOD_OPTIONS}
              value={period}
              onChange={(val) => setPeriod(val)}
            />
          </div>

          {period === 'custom' && (
            <CustomDateRangePicker
              startDate={customFrom}
              endDate={customTo}
              onChange={(start, end) => {
                setCustomFrom(start);
                setCustomTo(end);
              }}
            />
          )}

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading}
            className="h-9 px-3 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink-muted hover:text-ink text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-paid' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="h-9 px-3 rounded-lg bg-brand-dark hover:bg-brand text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="طباعة التقرير"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* 2. Top Financial KPI Cards (Waterfall of Supermarket Money) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 my-4 shrink-0">
        {/* KPI 1: Gross Sales */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">إجمالي المبيعات</span>
            <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-ink-muted font-mono">
              {salesReport?.invoicesCount || 0} فاتورة
            </span>
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink">
            {formatArabicCurrency(totalSales)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1 flex items-center gap-1">
            <span>المرتجع:</span>
            <span className="font-mono text-danger">{formatArabicCurrency(returnsTotal)}</span>
          </div>
        </div>

        {/* KPI 2: Net Sales */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">صافي المبيعات</span>
            <DollarSign className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-brand-dark">
            {formatArabicCurrency(netSales)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            بعد خصم المرتجعات
          </div>
        </div>

        {/* KPI 3: COGS */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">تكلفة البضاعة (COGS)</span>
            <Layers className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink">
            {formatArabicCurrency(cogs)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            تكلفة شراء الأصناف المباعة
          </div>
        </div>

        {/* KPI 4: Gross Profit */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">مجمل ربح المبيعات</span>
            <TrendingUp className="w-3.5 h-3.5 text-paid" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-paid">
            {formatArabicCurrency(grossProfit)}
          </div>
          <div className="text-[10px] text-paid-border text-paid mt-1">
            قبل خصم مصاريف وعجز الجرد
          </div>
        </div>

        {/* KPI 5: Inventory Losses & Shrinkage */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">خسائر وعجز المخزون</span>
            <AlertTriangle className="w-3.5 h-3.5 text-danger" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-danger">
            {inventoryLosses > 0 ? `-${formatArabicCurrency(inventoryLosses)}` : formatArabicCurrency(0)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            تالف، منتهي، عجز جرد
          </div>
        </div>

        {/* KPI 6: Real Net Profit */}
        <div className={`border rounded-xl p-3 shadow-2xs flex flex-col justify-between ${
          netOperationalProfit >= 0
            ? 'bg-paid-soft/40 border-paid/30 text-paid'
            : 'bg-danger-soft/40 border-danger/30 text-danger'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold">صافي الربح الفعلي</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/70 shadow-2xs">
              {netMarginPercent.toFixed(1)}%
            </span>
          </div>
          <div className="text-base font-bold font-mono tabular-nums">
            {formatArabicCurrency(netOperationalProfit)}
          </div>
          <div className="text-[10px] font-medium mt-1">
            الربح الصافي النهائي للمحل
          </div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-3 mb-4 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveSection('overview')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'overview'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <PieIcon className="w-4 h-4 shrink-0" />
          <span>ملخص التدفق والشلال المالي</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('traffic')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'traffic'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <Flame className="w-4 h-4 shrink-0 text-amber-500" />
          <span>ساعات الذروة ونشاط الكاشير</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('categories')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'categories'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>أداء الأقسام والتصنيفات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('items')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'items'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <Award className="w-4 h-4 shrink-0" />
          <span>ربحية الأصناف والهوامش</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('closings')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'closings'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>سجل إقفالات الوردية (Z-Reports)</span>
        </button>
      </div>

      {/* 4. Dynamic Tab Content */}
      <div className="flex-1 pb-6">
        {/* SECTION A: Overview & Breakdown */}
        {activeSection === 'overview' && (
          <div className="space-y-4">
            {/* Visual Micro-Visualizations Row: 3D Gauge Meter & Waterfall Flow */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <FinancialGaugeMeter
                  score={financialScore}
                  cashRatioPercent={cashPct}
                  netMarginPercent={netMarginPercent}
                  uncollectedCreditPercent={creditPct}
                />
              </div>
              <div className="lg:col-span-2">
                <FinancialWaterfallChart
                  grossSalesPiasters={totalSales}
                  returnsPiasters={returnsTotal}
                  netSalesPiasters={netSales}
                  cogsPiasters={cogs}
                  grossProfitPiasters={grossProfit}
                  inventoryLossPiasters={inventoryLosses}
                  netProfitPiasters={netOperationalProfit}
                />
              </div>
            </div>

            {/* Income Sources Donut & Period Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Visual Breakdown of Income Sources */}
              <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-paid" />
                    <span>توزيع المبيعات حسب طريقة الدفع</span>
                  </h2>
                  <p className="text-xs text-ink-muted mb-3">
                    توزيع نقدي مباشر مقابل آجل وبطاقات بنكية
                  </p>
                </div>

                {/* Pure SVG Donut Chart (Zero external libraries - Chromium 109 compatible) */}
                <div className="flex items-center justify-center my-1">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      {/* Background circle */}
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#E2E8F0" strokeWidth="4" />
                      {/* Cash slice (Green) */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="none"
                        stroke="#006D41"
                        strokeWidth="4"
                        strokeDasharray={`${cashPct} ${100 - cashPct}`}
                        strokeDashoffset="0"
                      />
                      {/* Credit slice (Amber/Warn) */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="none"
                        stroke="#B3720E"
                        strokeWidth="4"
                        strokeDasharray={`${creditPct} ${100 - creditPct}`}
                        strokeDashoffset={`${-cashPct}`}
                      />
                      {/* Card slice (Brand) */}
                      {cardPct > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke="#004D3F"
                          strokeWidth="4"
                          strokeDasharray={`${cardPct} ${100 - cardPct}`}
                          strokeDashoffset={`${-(cashPct + creditPct)}`}
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-[10px] text-ink-muted">نقدي مباشر</span>
                      <span className="text-base font-bold font-mono text-paid">{cashPct}%</span>
                    </div>
                  </div>
                </div>

                {/* Legend & Details */}
                <div className="space-y-2 mt-3 pt-3 border-t border-line text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-paid shrink-0" />
                      <span>مبيعات نقدية (درج الكاشير):</span>
                    </div>
                    <div className="font-mono font-bold text-ink">
                      {formatArabicCurrency(cashSales)} ({cashPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-warn shrink-0" />
                      <span>مبيعات آجلة (ذمم عملاء):</span>
                    </div>
                    <div className="font-mono font-bold text-ink">
                      {formatArabicCurrency(creditSales)} ({creditPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-brand shrink-0" />
                      <span>بطاقات بنكية / إلكتروني:</span>
                    </div>
                    <div className="font-mono font-bold text-ink">
                      {formatArabicCurrency(cardSales)} ({cardPct}%)
                    </div>
                  </div>
                </div>
              </div>

              {/* Period-over-Period Comparison Widget */}
              <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-brand" />
                    <span>مقارنة الأداء ({comparison?.currentPeriodName || 'الحالية'} vs {comparison?.previousPeriodName || 'السابقة'})</span>
                  </h2>
                  <p className="text-xs text-ink-muted mb-3">
                    تطور ونمو المبيعات والأرباح مقارنة بالفترة السابقة المماثلة
                  </p>
                </div>

                {isLoading ? (
                  <div className="text-center text-xs text-ink-muted py-8 flex flex-col items-center justify-center gap-2 my-auto">
                    <RefreshCw className="w-5 h-5 animate-spin text-paid" />
                    <span>جاري حساب ومقارنة الفترات...</span>
                  </div>
                ) : comparison ? (
                  <div className="space-y-2.5 flex-1 flex flex-col justify-around my-2">
                    {/* Metric: Sales */}
                    <div className="p-2.5 rounded-lg bg-surface-2 border border-line/60">
                      <div className="flex items-center justify-between text-xs text-ink-muted">
                        <span>إجمالي المبيعات</span>
                        <span className={`flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                          comparison.sales.deltaPiasters >= 0 ? 'text-paid' : 'text-danger'
                        }`}>
                          {comparison.sales.deltaPiasters >= 0 ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {Math.abs(comparison.sales.percentChange)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-mono font-bold text-sm text-ink">
                          {formatArabicCurrency(comparison.sales.current)}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">
                          السابق: {formatArabicCurrency(comparison.sales.previous)}
                        </span>
                      </div>
                    </div>

                    {/* Metric: Profit */}
                    <div className="p-2.5 rounded-lg bg-surface-2 border border-line/60">
                      <div className="flex items-center justify-between text-xs text-ink-muted">
                        <span>مجمل الأرباح</span>
                        <span className={`flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                          comparison.profit.deltaPiasters >= 0 ? 'text-paid' : 'text-danger'
                        }`}>
                          {comparison.profit.deltaPiasters >= 0 ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {Math.abs(comparison.profit.percentChange)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-mono font-bold text-sm text-paid">
                          {formatArabicCurrency(comparison.profit.current)}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">
                          السابق: {formatArabicCurrency(comparison.profit.previous)}
                        </span>
                      </div>
                    </div>

                    {/* Metric: Average Basket */}
                    <div className="p-2.5 rounded-lg bg-surface-2 border border-line/60">
                      <div className="flex items-center justify-between text-xs text-ink-muted">
                        <span>متوسط الفاتورة الواحدة</span>
                        <span className={`flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                          comparison.avgInvoicePiasters.deltaPiasters >= 0 ? 'text-paid' : 'text-danger'
                        }`}>
                          {comparison.avgInvoicePiasters.deltaPiasters >= 0 ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {Math.abs(comparison.avgInvoicePiasters.percentChange)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-mono font-bold text-sm text-ink">
                          {formatArabicCurrency(comparison.avgInvoicePiasters.current)}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">
                          {comparison.invoiceCount.current} فاتورة
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-xs text-ink-muted py-6 flex flex-col items-center justify-center gap-2 my-auto">
                    <BarChart3 className="w-7 h-7 text-line" />
                    <span className="font-bold text-ink">لا توجد مبيعات سابقة كافية للمقارنة</span>
                    <span className="text-[11px] text-ink-muted">ستظهر نسب النمو ومقارنة الإيرادات تلقائياً عند وجود فترات سابقة</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION TRAFFIC: Peak Hours & Cashier Performance */}
        {activeSection === 'traffic' && (
          <div className="space-y-4">
            <HourlyHeatmapBar report={hourlyReport} isLoading={isLoading} />
            <CashierPerformanceCard
              period={period}
              customFrom={customFrom}
              customTo={customTo}
            />
          </div>
        )}


        {/* SECTION B: Category Performance Table */}
        {activeSection === 'categories' && (
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink">أداء ومبيعات الأقسام والتصنيفات</h2>
                <p className="text-xs text-ink-muted">
                  تحليل مبيعات كل قسم ومساهمته في الأرباح الإجمالية لتحديد الأقسام الأكثر ربحية
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-1 bg-surface-2 rounded border border-line text-ink-muted">
                {categories.length} أقسام
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                    <th className="py-2.5 px-3">القسم / التصنيف</th>
                    <th className="py-2.5 px-3">إجمالي المبيعات</th>
                    <th className="py-2.5 px-3">حصة المبيعات (%)</th>
                    <th className="py-2.5 px-3">التكلفة (COGS)</th>
                    <th className="py-2.5 px-3">مجمل الربح</th>
                    <th className="py-2.5 px-3">هامش الربح (%)</th>
                    <th className="py-2.5 px-3">القطع المباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted">
                        لا توجد بيانات مبيعات مسجلة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    categories.map((cat) => (
                      <tr key={cat.categoryId} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-ink flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
                          <span>{cat.categoryName}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink">
                          {formatArabicCurrency(cat.totalSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-surface-2 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand rounded-full"
                                style={{ width: `${Math.min(100, cat.salesSharePercent)}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-ink-muted">
                              {cat.salesSharePercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted">
                          {formatArabicCurrency(cat.totalCostPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-paid">
                          {formatArabicCurrency(cat.grossProfitPiasters)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            cat.profitMarginPercent >= 20
                              ? 'bg-paid-soft text-paid'
                              : cat.profitMarginPercent >= 10
                              ? 'bg-warn-soft text-warn'
                              : 'bg-danger-soft text-danger'
                          }`}>
                            {cat.profitMarginPercent}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink">
                          {cat.itemsSoldQty} قطعة
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION C: Item Profitability Roster */}
        {activeSection === 'items' && (
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink">ربحية الأصناف ومراقبة الهوامش</h2>
                <p className="text-xs text-ink-muted">
                  كشف الأصناف الأعلى مساهمة في الأرباح مقابل الأصناف الخاسرة أو التي تباع بأقل من التكلفة
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemsDirection('desc')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    itemsDirection === 'desc'
                      ? 'bg-paid text-white shadow-2xs'
                      : 'bg-surface-2 text-ink-muted hover:text-ink'
                  }`}
                >
                  الأعلى ربحاً
                </button>
                <button
                  type="button"
                  onClick={() => setItemsDirection('asc')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    itemsDirection === 'asc'
                      ? 'bg-danger text-white shadow-2xs'
                      : 'bg-surface-2 text-ink-muted hover:text-ink'
                  }`}
                >
                  الأقل ربحاً أو خاسرة
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                    <th className="py-2.5 px-3">اسم الصنف والباركود</th>
                    <th className="py-2.5 px-3">القسم</th>
                    <th className="py-2.5 px-3">سعر البيع</th>
                    <th className="py-2.5 px-3">التكلفة</th>
                    <th className="py-2.5 px-3">الكمية المباعة</th>
                    <th className="py-2.5 px-3">إجمالي المبيعات</th>
                    <th className="py-2.5 px-3">صافي الربح</th>
                    <th className="py-2.5 px-3">نسبة الهامش</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {profitableItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-ink-muted">
                        لا توجد بيانات أصناف مباعة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    profitableItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-ink">{item.productName}</div>
                          <div className="font-mono text-[10px] text-ink-muted">{item.barcode || 'بدون باركود'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted">{item.categoryName}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-ink">
                          {formatArabicCurrency(item.unitPricePiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted">
                          {item.isZeroCost ? (
                            <span className="text-warn font-semibold">غير محددة</span>
                          ) : (
                            formatArabicCurrency(item.unitCostPiasters)
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink">
                          {(item.quantitySoldMilli / 1000).toLocaleString('en-US')}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink">
                          {formatArabicCurrency(item.totalSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          <span className={item.grossProfitPiasters >= 0 ? 'text-paid' : 'text-danger'}>
                            {formatArabicCurrency(item.grossProfitPiasters)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            item.isNegativeMargin
                              ? 'bg-danger-soft text-danger'
                              : item.marginPercent >= 25
                              ? 'bg-paid-soft text-paid'
                              : 'bg-surface-2 text-ink-muted'
                          }`}>
                            {item.marginPercent}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION D: Z-Reports & Closing History */}
        {activeSection === 'closings' && (
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink">سجل إقفالات الوردية اليومية (Z-Reports)</h2>
                <p className="text-xs text-ink-muted">
                  مراجعة فوارق الدرج النقدية بين الحساب الدفتري والمعدود الفعلي عند كل إقفال
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-1 bg-surface-2 rounded border border-line text-ink-muted">
                {closings.length} إقفالات
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                    <th className="py-2.5 px-3">تاريخ اليومية</th>
                    <th className="py-2.5 px-3">الكاشير / المستخدم</th>
                    <th className="py-2.5 px-3">إجمالي المبيعات</th>
                    <th className="py-2.5 px-3">المرتجعات</th>
                    <th className="py-2.5 px-3">صافي المبيعات</th>
                    <th className="py-2.5 px-3">المتوقع بالدرج</th>
                    <th className="py-2.5 px-3">الفعلي المعدود</th>
                    <th className="py-2.5 px-3">الفارق (عجز/زيادة)</th>
                    <th className="py-2.5 px-3">الحالة والملاحظة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {closings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-ink-muted">
                        لا توجد إقفالات ورديات مسجلة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    closings.map((cl) => (
                      <tr key={cl.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-ink font-mono">{cl.closingDate}</div>
                          <div className="text-[10px] text-ink-muted font-mono">{cl.createdAt}</div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-ink">{cl.cashierName}</td>
                        <td className="py-2.5 px-3 font-mono text-ink">
                          {formatArabicCurrency(cl.totalSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-danger">
                          {formatArabicCurrency(cl.returnsPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand-dark">
                          {formatArabicCurrency(cl.netSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted">
                          {formatArabicCurrency(cl.expectedCashPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink">
                          {formatArabicCurrency(cl.actualCashPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          {cl.differencePiasters === 0 ? (
                            <span className="text-paid flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>مطابق (0)</span>
                            </span>
                          ) : cl.differencePiasters < 0 ? (
                            <span className="text-danger">
                              عجز {formatArabicCurrency(Math.abs(cl.differencePiasters))}
                            </span>
                          ) : (
                            <span className="text-warn">
                              زيادة +{formatArabicCurrency(cl.differencePiasters)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted max-w-[180px] truncate" title={cl.notes}>
                          {cl.notes || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
