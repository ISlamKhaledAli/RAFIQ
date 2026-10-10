import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import {
  Boxes,
  Package,
  AlertTriangle,
  RefreshCw,
  Printer,
  Layers,
  Truck,
  TrendingDown,
  Clock,
  ArrowRight,
  ShieldAlert,
  ChevronLeft,
  DollarSign,
  Info,
  CheckCircle2,
  PackageX
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { CustomSelect } from '../../components/CustomSelect';
import type { SelectOption } from '../../components/CustomSelect';
import { CustomDateRangePicker } from '../../components/CustomDatePicker';
import { formatArabicCurrency } from '../../utils/money';
import { DeadStockRadar } from '../../components/analytics/DeadStockRadar';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import type {
  InventoryOverviewReport,
  ShrinkageAnalysisReport,
  PurchaseAnalysisReport,
  LowStockReportItem,
  BatchSummary
} from '../../types/models';

const PERIOD_OPTIONS: SelectOption[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر (30 يوم)' },
  { value: '3months', label: 'آخر 3 أشهر' },
  { value: 'year', label: 'هذا العام' },
  { value: 'custom', label: 'فترة مخصصة...' },
];

interface InventoryAnalyticsViewProps {
  onNavigateToProducts?: (subView?: 'catalog' | 'movements' | 'batches', filter?: 'all' | 'lowStock' | 'outOfStock') => void;
  onNavigateToPurchases?: () => void;
}

export const InventoryAnalyticsView: FC<InventoryAnalyticsViewProps> = ({
  onNavigateToProducts,
  onNavigateToPurchases
}) => {
  const [period, setPeriod] = useState<string>('month');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const showLoading = useSmoothLoading(isLoading, 300);
  const [overview, setOverview] = useState<InventoryOverviewReport | null>(null);
  const [shrinkage, setShrinkage] = useState<ShrinkageAnalysisReport | null>(null);
  const [purchases, setPurchases] = useState<PurchaseAnalysisReport | null>(null);
  const [lowStockItems, setLowStockItems] = useState<LowStockReportItem[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);

  const [activeSection, setActiveSection] = useState<'shrinkage' | 'lowstock' | 'purchases' | 'expiry' | 'deadstock'>('shrinkage');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = {
        period,
        fromDate: period === 'custom' ? customFrom : undefined,
        toDate: period === 'custom' ? customTo : undefined,
      };

      const [invRes, shrinkRes, purRes, lowRes, batchRes] = await Promise.all([
        invoke<InventoryOverviewReport>('reports:getInventoryOverview'),
        invoke<ShrinkageAnalysisReport>('reports:getShrinkageAnalysis', payload),
        invoke<PurchaseAnalysisReport>('reports:getPurchaseAnalysis', payload),
        invoke<LowStockReportItem[]>('reports:getLowStock'),
        invoke<BatchSummary>('batch:summary').catch(() => null),
      ]);

      setOverview(invRes);
      setShrinkage(shrinkRes);
      setPurchases(purRes);
      setLowStockItems(lowRes || []);
      setBatchSummary(batchRes);
    } catch (err) {
      console.error('Failed to load inventory analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Low stock budget estimate
  const totalSuggestedOrderBudget = lowStockItems.reduce(
    (sum, it) => sum + (it.estimatedCostPiasters || 0),
    0
  );

  const handlePrint = () => {
    window.print();
  };

  if (showLoading && !overview) {
    return (
      <div className="flex-1 flex flex-col h-full bg-canvas items-center justify-center select-none p-5" dir="rtl">
        <RafiqLoadingState
          label="جاري تجميع تحليلات حركة المخزون والفاقد..."
          sublabel="فحص أرصدة المستودع، التوالف، فروق الجرد، ومشتريات الموردين"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas text-ink overflow-y-auto select-none p-3 sm:p-5" dir="rtl">
      {/* 1. Header & Period Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-line shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand-dark flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink">تحليلات حركة المخزون والفاقد والمشتريات</h1>
              <p className="text-xs text-ink-muted">
                تقييم رأس مال البضاعة، كشف أسباب الهوالك والعجز، ومراقبة النواقص ومشتريات الموردين
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
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand' : ''}`} />
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

      {/* 2. Top Inventory Valuation KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 my-4 shrink-0">
        {/* KPI 1: Inventory Cost Valuation */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">قيمة المخزون (بالتكلفة)</span>
            <Package className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-brand-dark">
            {formatArabicCurrency(overview?.totalInventoryCostPiasters || 0)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            رأس المال المجمد في الرفوف
          </div>
        </div>

        {/* KPI 2: Inventory Retail Valuation */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">قيمة المخزون (بالبيع)</span>
            <DollarSign className="w-3.5 h-3.5 text-paid" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink">
            {formatArabicCurrency(overview?.totalInventoryRetailPiasters || 0)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            المحصلة المتوقعة عند البيع
          </div>
        </div>

        {/* KPI 3: Potential Gross Profit */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">الربح المحتمل بالمخزن</span>
            <Layers className="w-3.5 h-3.5 text-paid" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-paid">
            {formatArabicCurrency(overview?.potentialGrossProfitPiasters || 0)}
          </div>
          <div className="text-[10px] text-paid-border text-paid mt-1">
            فارق البيع عن التكلفة
          </div>
        </div>

        {/* KPI 4: Out of Stock */}
        <div 
          onClick={() => onNavigateToProducts && onNavigateToProducts('catalog', 'outOfStock')}
          className="bg-surface border border-line hover:border-danger/40 rounded-xl p-3 shadow-2xs flex flex-col justify-between cursor-pointer transition-colors group"
        >
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold group-hover:text-danger transition-colors">أصناف رصيدها صفر</span>
            <AlertTriangle className="w-3.5 h-3.5 text-danger" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-danger">
            {overview?.outOfStockCount || 0} صنف
          </div>
          <div className="text-[10px] text-ink-muted mt-1 flex items-center justify-between">
            <span>نافدة بالكامل</span>
            <ArrowRight className="w-3 h-3 text-ink-muted group-hover:text-danger" />
          </div>
        </div>

        {/* KPI 5: Low Stock */}
        <div 
          onClick={() => onNavigateToProducts && onNavigateToProducts('catalog', 'lowStock')}
          className="bg-surface border border-line hover:border-warn/40 rounded-xl p-3 shadow-2xs flex flex-col justify-between cursor-pointer transition-colors group"
        >
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold group-hover:text-warn transition-colors">أصناف تحت حد الطلب</span>
            <AlertTriangle className="w-3.5 h-3.5 text-warn" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-warn">
            {overview?.lowStockCount || 0} صنف
          </div>
          <div className="text-[10px] text-ink-muted mt-1 flex items-center justify-between">
            <span>تحتاج إعادة طلب</span>
            <ArrowRight className="w-3 h-3 text-ink-muted group-hover:text-warn" />
          </div>
        </div>

        {/* KPI 6: Turnover Rate */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">معدل دوران المخزون</span>
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-brand-dark">
            {overview?.turnoverRate ? `${overview.turnoverRate}x / سنة` : '—'}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            سرعة تصريف وتبديل البضاعة
          </div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-3 mb-4 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveSection('shrinkage')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'shrinkage'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <TrendingDown className="w-4 h-4 shrink-0" />
          <span>تحليل العجز والتوالف والفاقد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('lowstock')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'lowstock'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span>النواقص وأمر الشراء المقترح ({lowStockItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('purchases')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'purchases'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <Truck className="w-4 h-4 shrink-0" />
          <span>تحليل المشتريات والموردين</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('expiry')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'expiry'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>تواريخ الصلاحية والدفعات</span>
          {(batchSummary?.expiredCount || 0) > 0 && (
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('deadstock')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'deadstock'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <PackageX className="w-4 h-4 shrink-0 text-red-500" />
          <span>رادار الرواكد والسيولة المجمدة</span>
        </button>
      </div>

      {/* 4. Dynamic Tab Content */}
      <div className="flex-1 pb-6">
        {/* SECTION A: Shrinkage & Loss Analysis */}
        {activeSection === 'shrinkage' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Summary Card */}
              <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-danger" />
                    <span>معدل فاقد المخزون للمبيعات</span>
                  </h2>
                  <p className="text-xs text-ink-muted mb-4">
                    إجمالي الخسائر المالية الناجمة عن التلف وانتهاء الصلاحية والعجز
                  </p>
                  <div className="text-2xl font-bold font-mono text-danger">
                    {formatArabicCurrency(shrinkage?.totalShrinkagePiasters || 0)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-ink-muted">نسبة الفاقد للمبيعات:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      (shrinkage?.shrinkageToSalesPercent || 0) > 1.5
                        ? 'bg-danger-soft text-danger'
                        : 'bg-paid-soft text-paid'
                    }`}>
                      {shrinkage?.shrinkageToSalesPercent || 0}%
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-ink-muted border-t border-line pt-3 mt-4 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span>المعدل الآمن المقبول في قطاع التجزئة والمتاجر هو أقل من 1.2% من إجمالي المبيعات.</span>
                </div>
              </div>

              {/* Breakdown by Reason Bars */}
              <div className="lg:col-span-2 bg-surface border border-line rounded-xl p-4 shadow-2xs">
                <h2 className="text-sm font-bold text-ink mb-1">تصنيف أسباب العجز والتلف</h2>
                <p className="text-xs text-ink-muted mb-3">
                  تحديد مصدر الخسارة الرئيسي لاتخاذ إجراءات وقائية مع الموظفين أو الموردين
                </p>

                <div className="space-y-3">
                  {shrinkage?.reasons.map((r) => (
                    <div key={r.reason} className="p-2.5 rounded-lg bg-surface-2/60 border border-line/60">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-ink">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ink-muted">{r.count} عمليات</span>
                          <span className="font-mono font-bold text-danger">
                            {formatArabicCurrency(r.totalCostPiasters)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-danger rounded-full"
                          style={{ width: `${Math.min(100, r.percentOfTotal)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-ink-muted mt-1 font-mono">
                        {r.percentOfTotal}% من إجمالي خسائر المخزون
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Shrinkage Products Table */}
            <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
              <h2 className="text-sm font-bold text-ink mb-1">أعلى الأصناف تسجيلاً للعجز والهالك</h2>
              <p className="text-xs text-ink-muted mb-3">
                الأصناف التي سببت أعلى أثر مالي سلبي خلال الفترة المحددة
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                      <th className="py-2.5 px-3">اسم الصنف</th>
                      <th className="py-2.5 px-3">الكمية المفقودة</th>
                      <th className="py-2.5 px-3">سعر التكلفة</th>
                      <th className="py-2.5 px-3">الخسارة المالية</th>
                      <th className="py-2.5 px-3">السبب المسجل</th>
                      <th className="py-2.5 px-3">التاريخ والوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(!shrinkage?.topShrinkageProducts || shrinkage.topShrinkageProducts.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-ink-muted">
                          لا توجد حركات عجز أو هالك مسجلة لهذه الفترة
                        </td>
                      </tr>
                    ) : (
                      shrinkage.topShrinkageProducts.map((it, idx) => (
                        <tr key={`${it.productId}-${idx}`} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-ink">{it.productName}</td>
                          <td className="py-2.5 px-3 font-mono text-danger">
                            {(Math.abs(it.quantityDeltaMilli) / 1000).toLocaleString('en-US')} {it.unit}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted">
                            {formatArabicCurrency(it.unitCostPiasters)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-danger">
                            {formatArabicCurrency(it.financialImpactPiasters)}
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted">{it.reason}</td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted">{it.createdAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION B: Low Stock & Reorder Roster */}
        {activeSection === 'lowstock' && (
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink">تقرير الأصناف الناقصة وأمر الشراء المقترح</h2>
                <p className="text-xs text-ink-muted">
                  حساب تلقائي لكمية الطلب المقترحة بناءً على الحد الأدنى ومخزون الأمان
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-surface-2 rounded-lg border border-line text-xs font-mono">
                  <span className="text-ink-muted ml-1">ميزانية الطلب المقدرة:</span>
                  <span className="font-bold text-brand-dark">{formatArabicCurrency(totalSuggestedOrderBudget)}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                    <th className="py-2.5 px-3">اسم الصنف والباركود</th>
                    <th className="py-2.5 px-3">القسم</th>
                    <th className="py-2.5 px-3">الرصيد الحالي</th>
                    <th className="py-2.5 px-3">حد الطلب الأدنى</th>
                    <th className="py-2.5 px-3">الكمية المقترحة</th>
                    <th className="py-2.5 px-3">سعر التكلفة</th>
                    <th className="py-2.5 px-3">التكلفة الإجمالية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lowStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-paid font-medium">
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-paid" />
                          <span>جميع الأصناف في المخزن أعلى من الحد الأدنى للطلب!</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    lowStockItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-ink">{item.name}</div>
                          <div className="font-mono text-[10px] text-ink-muted">{item.barcode || '—'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted">{item.categoryName}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-danger">
                          {(item.stockMilli / 1000).toLocaleString('en-US')} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted">
                          {(item.minStockMilli / 1000).toLocaleString('en-US')} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-paid">
                          +{(item.suggestedOrderMilli / 1000).toLocaleString('en-US')} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted">
                          {formatArabicCurrency(item.unitCostPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink">
                          {formatArabicCurrency(item.estimatedCostPiasters)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION C: Purchases & Suppliers Analysis */}
        {activeSection === 'purchases' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs">
                <div className="text-xs text-ink-muted mb-1">إجمالي مشتريات الفترة</div>
                <div className="text-base font-bold font-mono text-ink">
                  {formatArabicCurrency(purchases?.totalPurchasesPiasters || 0)}
                </div>
                <div className="text-[10px] text-ink-muted mt-1 font-mono">
                  {purchases?.totalInvoicesCount || 0} فاتورة شراء
                </div>
              </div>

              <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs">
                <div className="text-xs text-ink-muted mb-1">المسدد نقداً للموردين</div>
                <div className="text-base font-bold font-mono text-paid">
                  {formatArabicCurrency(purchases?.totalPaidPiasters || 0)}
                </div>
                <div className="text-[10px] text-paid mt-1">مدفوع بالكامل</div>
              </div>

              <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs">
                <div className="text-xs text-ink-muted mb-1">آجل ومتبقي على المحل</div>
                <div className="text-base font-bold font-mono text-warn">
                  {formatArabicCurrency(purchases?.totalUnpaidPiasters || 0)}
                </div>
                <div className="text-[10px] text-warn mt-1">ديون مستحقة للموردين</div>
              </div>

              <div 
                onClick={() => onNavigateToPurchases && onNavigateToPurchases()}
                className="bg-brand-soft/50 border border-brand/30 hover:bg-brand-soft rounded-xl p-3 shadow-2xs flex flex-col justify-between cursor-pointer transition-colors"
              >
                <div className="text-xs font-bold text-brand-dark">إدارة فواتير المشتريات</div>
                <div className="text-xs text-brand mt-1 flex items-center justify-between">
                  <span>فتح شاشة المشتريات</span>
                  <ChevronLeft className="w-4 h-4 text-brand-dark" />
                </div>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
              <h2 className="text-sm font-bold text-ink mb-1">أكبر الموردين حسب حجم المشتريات</h2>
              <p className="text-xs text-ink-muted mb-3">
                تفصيل المبالغ المشتراة من كل شركة موردة مع رصيد الديون المتبقي لهم
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                      <th className="py-2.5 px-3">اسم المورد / الشركة</th>
                      <th className="py-2.5 px-3">عدد الفواتير</th>
                      <th className="py-2.5 px-3">إجمالي المشتريات</th>
                      <th className="py-2.5 px-3">المسدد</th>
                      <th className="py-2.5 px-3">المتبقي (دين على المحل)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(!purchases?.topSuppliers || purchases.topSuppliers.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-ink-muted">
                          لا توجد فواتير شراء مسجلة لهذه الفترة
                        </td>
                      </tr>
                    ) : (
                      purchases.topSuppliers.map((sup) => (
                        <tr key={sup.supplierId} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-ink">{sup.supplierName}</td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted">{sup.invoicesCount}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-ink">
                            {formatArabicCurrency(sup.totalPurchasePiasters)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-paid">
                            {formatArabicCurrency(sup.paidPiasters)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            {sup.unpaidPiasters > 0 ? (
                              <span className="text-warn">{formatArabicCurrency(sup.unpaidPiasters)}</span>
                            ) : (
                              <span className="text-paid">خالص (0)</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION D: Batches & Expiry Monitoring */}
        {activeSection === 'expiry' && (
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <h2 className="text-sm font-bold text-ink mb-1">مراقبة تواريخ الصلاحية والدفعات المخزنية</h2>
            <p className="text-xs text-ink-muted mb-4">
              نظام الإنذار المبكر للأصناف سريعة التلف لتصريفها قبل انتهاء صلاحيتها
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-danger-soft/40 border border-danger/30">
                <div className="text-xs font-bold text-danger mb-1">دفعات منتهية الصلاحية</div>
                <div className="text-xl font-bold font-mono text-danger">
                  {batchSummary?.expiredCount || overview?.expiredBatchesCount || 0} دفعة
                </div>
                <div className="text-[10px] text-danger mt-1">يجب إتلافها فوراً وسحبها من الرف</div>
              </div>

              <div className="p-3 rounded-lg bg-warn-soft/40 border border-warn/30">
                <div className="text-xs font-bold text-warn mb-1">تنتهي خلال 7 إلى 30 يوماً</div>
                <div className="text-xl font-bold font-mono text-warn">
                  {batchSummary?.expiringSoonCount || overview?.expiringSoonBatchesCount || 0} دفعة
                </div>
                <div className="text-[10px] text-warn mt-1">تحتاج عروض تخفيض وتصريف سريع</div>
              </div>

              <div className="p-3 rounded-lg bg-paid-soft/40 border border-paid/30">
                <div className="text-xs font-bold text-paid mb-1">دفعات سليمة ونشطة</div>
                <div className="text-xl font-bold font-mono text-paid">
                  {batchSummary?.totalActiveBatches || 0} دفعة
                </div>
                <div className="text-[10px] text-paid mt-1">صلاحية آمنة ومستقرة</div>
              </div>
            </div>

            <div className="text-xs text-ink-muted bg-surface-2 p-3 rounded-lg border border-line flex items-center gap-1.5 flex-wrap">
              <Info className="w-4 h-4 text-brand shrink-0" />
              <span>يمكنك إدارة وطباعة الباركود الخاص بكل دفعة عبر قسم{' '}</span>
              <button
                type="button"
                onClick={() => onNavigateToProducts && onNavigateToProducts('batches')}
                className="font-bold text-brand hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <span>السلع والمخزن</span>
                <ChevronLeft className="w-3 h-3" />
                <span>الدفعات وتواريخ الصلاحية</span>
              </button>
            </div>
          </div>
        )}

        {/* SECTION E: Dead Stock Radar */}
        {activeSection === 'deadstock' && (
          <DeadStockRadar 
            onNavigateToProduct={() => {
              if (onNavigateToProducts) onNavigateToProducts('catalog');
            }} 
          />
        )}
      </div>
    </div>
  );
};
