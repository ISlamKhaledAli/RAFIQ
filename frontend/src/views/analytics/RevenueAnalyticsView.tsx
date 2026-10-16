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
  Minus,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import { CustomSelect } from '../../components/CustomSelect';
import type { SelectOption } from '../../components/CustomSelect';
import { CustomDateRangePicker } from '../../components/CustomDatePicker';
import { formatArabicCurrency } from '../../utils/money';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
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

export interface RevenueAnalyticsViewProps {
  isActive?: boolean;
}

export const RevenueAnalyticsView: FC<RevenueAnalyticsViewProps> = ({ isActive = true }) => {
  const [period, setPeriod] = useState<string>('month');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const showLoading = useSmoothLoading(isLoading, 300);
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
    if (isActive) {
      void loadData();
    }
  }, [isActive, loadData]);

  useDataSubscription(['sales', 'dashboard', 'all'], () => {
    void loadData();
  });

  // Derived financial metrics
  const totalSales = salesReport?.totalSalesPiasters || 0;
  const returnsTotal = salesReport?.returnsTotalPiasters || 0;
  const netSales = Math.max(0, totalSales - returnsTotal);
  const grossProfit = salesReport?.grossProfitPiasters || 0;
  const cogs = Math.max(0, netSales - grossProfit);
  const inventoryLosses = lossReport?.totalLossPiasters || 0;
  const operationalExpenses = salesReport?.totalExpensesPiasters || 0;
  const netOperationalProfit = grossProfit - inventoryLosses - operationalExpenses;
  const netMarginPercent = netSales > 0 ? (netOperationalProfit * 100) / netSales : 0;

  // Payment breakdown percentages
  const cashSales = salesReport?.cashSalesPiasters || 0;
  const creditSales = salesReport?.creditSalesPiasters || 0;
  const cardSales = salesReport?.cardSalesPiasters || 0;
  const instapaySales = salesReport?.instapaySalesPiasters || 0;
  const vodafoneCashSales = salesReport?.vodafoneCashSalesPiasters || 0;
  const cashPct = totalSales > 0 ? Math.round((cashSales * 100) / totalSales) : 0;
  const creditPct = totalSales > 0 ? Math.round((creditSales * 100) / totalSales) : 0;
  const cardPct = totalSales > 0 ? Math.round((cardSales * 100) / totalSales) : 0;
  const instapayPct = totalSales > 0 ? Math.round((instapaySales * 100) / totalSales) : 0;
  const vodafoneCashPct = totalSales > 0 ? Math.max(0, 100 - cashPct - creditPct - cardPct - instapayPct) : 0;

  // Composite Financial Health Score (0 - 100)
  const financialScore = Math.max(
    15,
    Math.min(
      98,
      Math.round(
        50 +
        (cashPct * 0.25) +
        Math.min(25, netMarginPercent * 1.2) -
        (totalSales > 0 ? ((inventoryLosses + operationalExpenses) * 100 / totalSales) * 1.5 : 0) -
        (creditPct > 35 ? (creditPct - 35) * 0.5 : 0)
      )
    )
  );

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  if (showLoading && !salesReport) {
    return (
      <div className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark items-center justify-center select-none p-5" dir="rtl">
        <RafiqLoadingState
          label="جاري تحليل الإيرادات وحساب الأرباح..."
          sublabel="فحص المبيعات، تكاليف البضاعة، عجز الجرد، وسجلات الإقفال اليومي"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark overflow-y-auto select-none p-3 sm:p-5" dir="rtl">
      {/* 1. Header & Period Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-line dark:border-line-dark shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink dark:text-ink-dark">تحليلات الإيرادات ومصادر الأموال والأرباح</h1>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
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
            onClick={handlePrint}
            className="h-9 px-3 rounded-lg bg-brand-dark dark:bg-brand-bright dark:text-surface-dark hover:bg-brand dark:hover:bg-emerald-400 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="طباعة التقرير"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* 2. Top Financial KPI Cards (Waterfall of Supermarket Money) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 my-4 shrink-0">
        {/* KPI 1: Gross Sales */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted mb-1">
            <span className="text-[11px] font-semibold">إجمالي المبيعات</span>
            <span className="text-[10px] bg-surface-2 dark:bg-surface-dark-2 px-1.5 py-0.5 rounded text-ink-muted dark:text-ink-dark-muted font-mono">
              {salesReport?.invoicesCount || 0} فاتورة
            </span>
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink dark:text-ink-dark">
            {formatArabicCurrency(totalSales)}
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1 flex items-center gap-1">
            <span>المرتجع:</span>
            <span className="font-mono text-danger dark:text-danger-bright">{formatArabicCurrency(returnsTotal)}</span>
          </div>
        </div>

        {/* KPI 2: Net Sales */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted mb-1">
            <span className="text-[11px] font-semibold">صافي المبيعات</span>
            <DollarSign className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-brand-dark dark:text-brand-bright">
            {formatArabicCurrency(netSales)}
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1">
            بعد خصم المرتجعات
          </div>
        </div>

        {/* KPI 3: COGS */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted mb-1">
            <span className="text-[11px] font-semibold">تكلفة البضاعة المباعة</span>
            <Layers className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink dark:text-ink-dark">
            {formatArabicCurrency(cogs)}
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1">
            تكلفة شراء الأصناف المباعة
          </div>
        </div>

        {/* KPI 4: Gross Profit */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted mb-1">
            <span className="text-[11px] font-semibold">مجمل ربح المبيعات</span>
            <TrendingUp className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-paid dark:text-paid-bright">
            {formatArabicCurrency(grossProfit)}
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1">
            فارق البيع عن سعر الشراء
          </div>
        </div>

        {/* KPI 5: Operational Expenses */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted mb-1">
            <span className="text-[11px] font-semibold">المصروفات التشغيلية</span>
            <Minus className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-warn dark:text-warn-bright">
            {operationalExpenses > 0 ? `-${formatArabicCurrency(operationalExpenses)}` : formatArabicCurrency(0)}
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1">
            إيجار، فواتير، مرتبات ونثريات
          </div>
        </div>

        {/* KPI 5: Inventory Losses & Shrinkage */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted mb-1">
            <span className="text-[11px] font-semibold">خسائر وعجز المخزون</span>
            <AlertTriangle className="w-3.5 h-3.5 text-danger dark:text-danger-bright" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-danger dark:text-danger-bright">
            {inventoryLosses > 0 ? `-${formatArabicCurrency(inventoryLosses)}` : formatArabicCurrency(0)}
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1">
            تالف، منتهي، عجز جرد
          </div>
        </div>

        {/* KPI 6: Real Net Profit */}
        <div className={`border rounded-xl p-3 shadow-2xs flex flex-col justify-between ${
          netOperationalProfit >= 0
            ? 'bg-paid-soft/40 dark:bg-paid-dark-soft/40 border-paid/30 dark:border-paid/40 text-paid dark:text-paid-bright'
            : 'bg-danger-soft/40 dark:bg-danger-dark-soft/40 border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold">صافي الربح الفعلي</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/70 dark:bg-surface-dark/70 text-ink dark:text-ink-dark shadow-2xs">
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
      <div className="flex items-center gap-2 border-b border-line dark:border-line-dark pb-3 mb-4 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveSection('overview')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'overview'
              ? 'bg-brand-dark dark:bg-brand-bright text-white dark:text-surface-dark border border-brand-dark dark:border-brand-bright shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
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
              ? 'bg-brand-dark dark:bg-brand-bright text-white dark:text-surface-dark border border-brand-dark dark:border-brand-bright shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
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
              ? 'bg-brand-dark dark:bg-brand-bright text-white dark:text-surface-dark border border-brand-dark dark:border-brand-bright shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
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
              ? 'bg-brand-dark dark:bg-brand-bright text-white dark:text-surface-dark border border-brand-dark dark:border-brand-bright shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
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
              ? 'bg-brand-dark dark:bg-brand-bright text-white dark:text-surface-dark border border-brand-dark dark:border-brand-bright shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>سجل إقفالات الوردية</span>
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
                  operationalExpensesPiasters={operationalExpenses}
                  netProfitPiasters={netOperationalProfit}
                />
              </div>
            </div>

            {/* Income Sources Donut & Period Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Visual Breakdown of Income Sources */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink dark:text-ink-dark mb-1 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-paid dark:text-paid-bright" />
                    <span>توزيع المبيعات حسب طريقة الدفع</span>
                  </h2>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted mb-3">
                    توزيع نقدي مباشر مقابل آجل وبطاقات بنكية
                  </p>
                </div>

                {/* Pure SVG Donut Chart (Zero external libraries - Chromium 109 compatible) */}
                <div className="flex items-center justify-center my-1">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      {/* Background circle */}
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#E2E8F0" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
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
                      {/* Card / Visa slice (Sky Blue) */}
                      {cardPct > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth="4"
                          strokeDasharray={`${cardPct} ${100 - cardPct}`}
                          strokeDashoffset={`${-(cashPct + creditPct)}`}
                        />
                      )}
                      {/* InstaPay slice (Purple) */}
                      {instapayPct > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke="#582C83"
                          strokeWidth="4"
                          strokeDasharray={`${instapayPct} ${100 - instapayPct}`}
                          strokeDashoffset={`${-(cashPct + creditPct + cardPct)}`}
                        />
                      )}
                      {/* Vodafone Cash slice (Red) */}
                      {vodafoneCashPct > 0 && (
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke="#e60000"
                          strokeWidth="4"
                          strokeDasharray={`${vodafoneCashPct} ${100 - vodafoneCashPct}`}
                          strokeDashoffset={`${-(cashPct + creditPct + cardPct + instapayPct)}`}
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">نقدي مباشر</span>
                      <span className="text-base font-bold font-mono text-paid dark:text-paid-bright">{cashPct}%</span>
                    </div>
                  </div>
                </div>

                {/* Legend & Details */}
                <div className="space-y-2 mt-3 pt-3 border-t border-line dark:border-line-dark text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-paid dark:bg-paid-bright shrink-0" />
                      <span>مبيعات نقدية (درج الكاشير):</span>
                    </div>
                    <div className="font-mono font-bold text-ink dark:text-ink-dark">
                      {formatArabicCurrency(cashSales)} ({cashPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-warn dark:bg-warn-bright shrink-0" />
                      <span>مبيعات آجلة (ذمم عملاء):</span>
                    </div>
                    <div className="font-mono font-bold text-ink dark:text-ink-dark">
                      {formatArabicCurrency(creditSales)} ({creditPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#0284c7] shrink-0" />
                      <span>مدفوعات بطاقة / فيزا (حساب بنكي):</span>
                    </div>
                    <div className="font-mono font-bold text-[#0284c7]">
                      {formatArabicCurrency(cardSales)} ({cardPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#582C83] shrink-0" />
                      <span>انستاباي (InstaPay - خارج الدرج):</span>
                    </div>
                    <div className="font-mono font-bold text-[#582C83]">
                      {formatArabicCurrency(instapaySales)} ({instapayPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#e60000] shrink-0" />
                      <span>فودافون كاش ومحافظ (خارج الدرج):</span>
                    </div>
                    <div className="font-mono font-bold text-[#e60000]">
                      {formatArabicCurrency(vodafoneCashSales)} ({vodafoneCashPct}%)
                    </div>
                  </div>
                </div>
              </div>

              {/* Period-over-Period Comparison Widget */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink dark:text-ink-dark mb-1 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>مقارنة الأداء ({comparison?.currentPeriodName || 'الحالية'} vs {comparison?.previousPeriodName || 'السابقة'})</span>
                  </h2>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted mb-3">
                    تطور ونمو المبيعات والأرباح مقارنة بالفترة السابقة المماثلة
                  </p>
                </div>

                {isLoading ? (
                  <div className="text-center text-xs text-ink-muted dark:text-ink-dark-muted py-8 flex flex-col items-center justify-center gap-2 my-auto">
                    <RefreshCw className="w-5 h-5 animate-spin text-paid dark:text-paid-bright" />
                    <span>جاري حساب ومقارنة الفترات...</span>
                  </div>
                ) : comparison ? (
                  <div className="space-y-2.5 flex-1 flex flex-col justify-around my-2">
                    {/* Metric: Sales */}
                    <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line/60 dark:border-line-dark/60">
                      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted">
                        <span>إجمالي المبيعات</span>
                        <span className={`flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                          comparison.sales.deltaPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'
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
                        <span className="font-mono font-bold text-sm text-ink dark:text-ink-dark">
                          {formatArabicCurrency(comparison.sales.current)}
                        </span>
                        <span className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted">
                          السابق: {formatArabicCurrency(comparison.sales.previous)}
                        </span>
                      </div>
                    </div>

                    {/* Metric: Profit */}
                    <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line/60 dark:border-line-dark/60">
                      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted">
                        <span>مجمل الأرباح</span>
                        <span className={`flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                          comparison.profit.deltaPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'
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
                        <span className="font-mono font-bold text-sm text-paid dark:text-paid-bright">
                          {formatArabicCurrency(comparison.profit.current)}
                        </span>
                        <span className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted">
                          السابق: {formatArabicCurrency(comparison.profit.previous)}
                        </span>
                      </div>
                    </div>

                    {/* Metric: Average Basket */}
                    <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line/60 dark:border-line-dark/60">
                      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted">
                        <span>متوسط الفاتورة الواحدة</span>
                        <span className={`flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                          comparison.avgInvoicePiasters.deltaPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'
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
                        <span className="font-mono font-bold text-sm text-ink dark:text-ink-dark">
                          {formatArabicCurrency(comparison.avgInvoicePiasters.current)}
                        </span>
                        <span className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted">
                          {comparison.invoiceCount.current} فاتورة
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-xs text-ink-muted dark:text-ink-dark-muted py-6 flex flex-col items-center justify-center gap-2 my-auto">
                    <BarChart3 className="w-7 h-7 text-line dark:text-line-dark" />
                    <span className="font-bold text-ink dark:text-ink-dark">لا توجد مبيعات سابقة كافية للمقارنة</span>
                    <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">ستظهر نسب النمو ومقارنة الإيرادات تلقائياً عند وجود فترات سابقة</span>
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
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark">أداء ومبيعات الأقسام والتصنيفات</h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  تحليل مبيعات كل قسم ومساهمته في الأرباح الإجمالية لتحديد الأقسام الأكثر ربحية
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-1 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted">
                {categories.length} أقسام
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                    <th className="py-2.5 px-3">القسم / التصنيف</th>
                    <th className="py-2.5 px-3">إجمالي المبيعات</th>
                    <th className="py-2.5 px-3">حصة المبيعات (%)</th>
                    <th className="py-2.5 px-3">تكلفة الشراء</th>
                    <th className="py-2.5 px-3">مجمل الربح</th>
                    <th className="py-2.5 px-3">هامش الربح (%)</th>
                    <th className="py-2.5 px-3">القطع المباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted dark:text-ink-dark-muted">
                        لا توجد بيانات مبيعات مسجلة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    categories.map((cat) => (
                      <tr key={cat.categoryId} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-brand dark:bg-brand-bright shrink-0" />
                          <span>{cat.categoryName}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink dark:text-ink-dark">
                          {formatArabicCurrency(cat.totalSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-surface-2 dark:bg-surface-dark-2 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand dark:bg-brand-bright rounded-full"
                                style={{ width: `${Math.min(100, cat.salesSharePercent)}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-ink-muted dark:text-ink-dark-muted">
                              {cat.salesSharePercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-dark-muted">
                          {formatArabicCurrency(cat.totalCostPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-paid dark:text-paid-bright">
                          {formatArabicCurrency(cat.grossProfitPiasters)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            cat.profitMarginPercent >= 20
                              ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                              : cat.profitMarginPercent >= 10
                              ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright'
                              : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'
                          }`}>
                            {cat.profitMarginPercent}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink dark:text-ink-dark">
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
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark">ربحية الأصناف ومراقبة الهوامش</h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  كشف الأصناف الأعلى مساهمة في الأرباح مقابل الأصناف الخاسرة أو التي تباع بأقل من التكلفة
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemsDirection('desc')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    itemsDirection === 'desc'
                      ? 'bg-paid dark:bg-emerald-600 text-white shadow-2xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                  }`}
                >
                  الأعلى ربحاً
                </button>
                <button
                  type="button"
                  onClick={() => setItemsDirection('asc')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    itemsDirection === 'asc'
                      ? 'bg-danger dark:bg-danger text-white shadow-2xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                  }`}
                >
                  الأقل ربحاً أو خاسرة
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
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
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {profitableItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-ink-muted dark:text-ink-dark-muted">
                        لا توجد بيانات أصناف مباعة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    profitableItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-ink dark:text-ink-dark">{item.productName}</div>
                          <div className="font-mono text-[10px] text-ink-muted dark:text-ink-dark-muted">{item.barcode || 'بدون باركود'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted">{item.categoryName}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-ink dark:text-ink-dark">
                          {formatArabicCurrency(item.unitPricePiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-dark-muted">
                          {item.isZeroCost ? (
                            <span className="text-warn dark:text-warn-bright font-semibold">غير محددة</span>
                          ) : (
                            formatArabicCurrency(item.unitCostPiasters)
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink dark:text-ink-dark">
                          {(item.quantitySoldMilli / 1000).toLocaleString('en-US')}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink dark:text-ink-dark">
                          {formatArabicCurrency(item.totalSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          <span className={item.grossProfitPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}>
                            {formatArabicCurrency(item.grossProfitPiasters)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            item.isNegativeMargin
                              ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'
                              : item.marginPercent >= 25
                              ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted'
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
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark">سجل إقفالات الوردية اليومية</h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  مراجعة فوارق الدرج النقدية بين الحساب الدفتري والمعدود الفعلي عند كل إقفال
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-1 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted">
                {closings.length} إقفالات
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
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
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {closings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-ink-muted dark:text-ink-dark-muted">
                        لا توجد إقفالات ورديات مسجلة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    closings.map((cl) => (
                      <tr key={cl.id} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-ink dark:text-ink-dark font-mono">{cl.closingDate}</div>
                          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-mono">{cl.createdAt}</div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-ink dark:text-ink-dark">{cl.cashierName}</td>
                        <td className="py-2.5 px-3 font-mono text-ink dark:text-ink-dark">
                          {formatArabicCurrency(cl.totalSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-danger dark:text-danger-bright">
                          {formatArabicCurrency(cl.returnsPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand-dark dark:text-brand-bright">
                          {formatArabicCurrency(cl.netSalesPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-dark-muted">
                          {formatArabicCurrency(cl.expectedCashPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink dark:text-ink-dark">
                          {formatArabicCurrency(cl.actualCashPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          {cl.differencePiasters === 0 ? (
                            <span className="text-paid dark:text-paid-bright flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>مطابق (0)</span>
                            </span>
                          ) : cl.differencePiasters < 0 ? (
                            <span className="text-danger dark:text-danger-bright">
                              عجز {formatArabicCurrency(Math.abs(cl.differencePiasters))}
                            </span>
                          ) : (
                            <span className="text-warn dark:text-warn-bright">
                              زيادة +{formatArabicCurrency(cl.differencePiasters)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted max-w-[180px] truncate" title={cl.notes}>
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
