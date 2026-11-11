import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import {
  Boxes,
  Package,
  AlertTriangle,
  Layers,
  Truck,
  TrendingDown,
  Clock,
  ShieldAlert,
  ChevronLeft,
  DollarSign,
  Info,
  CheckCircle2,
  PackageX
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import { CustomSelect } from '../../components/CustomSelect';
import type { SelectOption } from '../../components/CustomSelect';
import { CustomDateRangePicker } from '../../components/CustomDatePicker';
import { useToday, formatLocalDateTime } from '../../utils/dateFilter';
import { buildReportPeriodPayload, defaultCustomReportRange } from '../../utils/reportPeriod';
import { formatArabicCurrency } from '../../utils/money';
import { formatUnitArabic } from '../../utils/units';
import { DeadStockRadar } from '../../components/analytics/DeadStockRadar';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import { SegmentedTabs, type SegmentedTabOption } from '../../components/SegmentedTabs';
import type {
  InventoryOverviewReport,
  ShrinkageAnalysisReport,
  PurchaseAnalysisReport,
  LowStockReportItem,
  BatchSummary
} from '../../types/models';

import { AppButton } from '../../components/AppButton';
import { ClickableCard, ClickableChevron, ClickableHint } from '../../components/ClickableCard';
import { useNavAccess } from '../../hooks/useNavAccess';
import { useMotionPanel } from '../../hooks/useMotionPanel';
const PERIOD_OPTIONS: SelectOption[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'آخر 30 يوماً' },
  { value: '3months', label: 'آخر 3 أشهر (90 يوماً)' },
  { value: 'year', label: 'آخر 365 يوماً' },
  { value: 'custom', label: 'فترة مخصصة...' },
];

type InventorySection = 'shrinkage' | 'lowstock' | 'purchases' | 'expiry' | 'deadstock';

interface InventoryAnalyticsViewProps {
  isActive?: boolean;
  onNavigateToProducts?: (subView?: 'catalog' | 'movements' | 'batches', filter?: 'all' | 'lowStock' | 'outOfStock') => void;
  onNavigateToProductEdit?: (productId: string) => void;
  onNavigateToPurchases?: () => void;
}

export const InventoryAnalyticsView: FC<InventoryAnalyticsViewProps> = ({
  isActive = true,
  onNavigateToProducts,
  onNavigateToProductEdit,
  onNavigateToPurchases
}) => {
  const navAccess = useNavAccess();
  const openProducts = onNavigateToProducts && navAccess.products ? onNavigateToProducts : undefined;
  const openPurchases = onNavigateToPurchases && navAccess.purchases ? onNavigateToPurchases : undefined;

  const [period, setPeriod] = useState<string>('month');
  const [customFrom, setCustomFrom] = useState<string>(() => defaultCustomReportRange().from);
  const [customTo, setCustomTo] = useState<string>(() => defaultCustomReportRange().to);
  // يتغير عند منتصف الليل فتُعاد قراءة التقارير النسبية (اليوم/أمس/آخر 7 أيام)
  const today = useToday();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const showLoading = useSmoothLoading(isLoading, 300);
  const [overview, setOverview] = useState<InventoryOverviewReport | null>(null);
  const [shrinkage, setShrinkage] = useState<ShrinkageAnalysisReport | null>(null);
  const [purchases, setPurchases] = useState<PurchaseAnalysisReport | null>(null);
  const [lowStockItems, setLowStockItems] = useState<LowStockReportItem[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);

  const [activeSection, setActiveSection] = useState<InventorySection>('shrinkage');
  const motionPanel = useMotionPanel(activeSection);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = buildReportPeriodPayload(period, customFrom, customTo);

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
    if (isActive) {
      void loadData();
    }
  }, [isActive, loadData, today]);

  useDataSubscription(['products', 'purchases', 'sales', 'dashboard', 'all'], () => {
    void loadData();
  });

  // Low stock budget estimate
  const totalSuggestedOrderBudget = lowStockItems.reduce(
    (sum, it) => sum + (it.estimatedCostPiasters || 0),
    0
  );

  if (showLoading && !overview) {
    return (
      <div className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark items-center justify-center select-none p-5" dir="rtl">
        <RafiqLoadingState
          label="جاري تجميع تحليلات حركة المخزون والفاقد..."
          sublabel="فحص أرصدة المستودع، التوالف، فروق الجرد، ومشتريات الموردين"
        />
      </div>
    );
  }

  const sectionTabs: SegmentedTabOption<InventorySection>[] = [
    { value: 'shrinkage', label: 'تحليل العجز والتوالف والفاقد', icon: TrendingDown },
    { value: 'lowstock', label: 'النواقص وأمر الشراء المقترح', icon: Package },
    { value: 'purchases', label: 'تحليل المشتريات والموردين', icon: Truck },
    { value: 'expiry', label: 'تواريخ الصلاحية والدفعات', icon: ShieldAlert, showDot: (batchSummary?.expiredCount || 0) > 0 },
    { value: 'deadstock', label: 'رادار الرواكد والسيولة المجمدة', icon: PackageX },
  ];

  return (
    <div data-print-root className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark overflow-y-auto select-none p-4 sm:p-6 gap-5" dir="rtl">
      {/* 1. Header & Period Filter Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0 bg-surface dark:bg-surface-dark p-4 sm:p-5 rounded-xl border border-line dark:border-line-dark shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand-dark dark:text-brand-bright flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="t-page-title text-ink dark:text-ink-dark">تحليلات حركة المخزون والفاقد والمشتريات</h1>
              <p className="text-sm mt-1 text-ink-muted dark:text-ink-dark-muted">
                تقييم رأس مال البضاعة، كشف أسباب الهوالك والعجز، ومراقبة النواقص ومشتريات الموردين
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="w-48">
            <CustomSelect
              size="lg"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={(val) => setPeriod(val)}
            />
          </div>

          {period === 'custom' && (
            <CustomDateRangePicker
              size="md"
              startDate={customFrom}
              endDate={customTo}
              onChange={(start, end) => {
                setCustomFrom(start);
                setCustomTo(end);
              }}
            />
          )}
        </div>
      </div>

      {/* 2. Top Inventory Valuation KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 shrink-0">
        {/* KPI 1: Inventory Cost Valuation */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]">
          <div className="flex items-center justify-between gap-2 text-ink-muted dark:text-ink-dark-muted">
            <span className="text-sm font-bold">قيمة المخزون (بالتكلفة)</span>
            <Package className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
          </div>
          <div className="t-kpi text-brand-dark dark:text-brand-bright">
            {formatArabicCurrency(overview?.totalInventoryCostPiasters || 0)}
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
            رأس المال المجمد في الرفوف
          </div>
        </div>

        {/* KPI 2: Inventory Retail Valuation */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]">
          <div className="flex items-center justify-between gap-2 text-ink-muted dark:text-ink-dark-muted">
            <span className="text-sm font-bold">قيمة المخزون (بالبيع)</span>
            <DollarSign className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
          </div>
          <div className="t-kpi text-ink dark:text-ink-dark">
            {formatArabicCurrency(overview?.totalInventoryRetailPiasters || 0)}
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
            المحصلة المتوقعة عند البيع
          </div>
        </div>

        {/* KPI 3: Potential Gross Profit */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]">
          <div className="flex items-center justify-between gap-2 text-ink-muted dark:text-ink-dark-muted">
            <span className="text-sm font-bold">الربح المحتمل بالمخزن</span>
            <Layers className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
          </div>
          <div className="t-kpi text-paid dark:text-paid-bright">
            {formatArabicCurrency(overview?.potentialGrossProfitPiasters || 0)}
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
            فارق البيع عن التكلفة
          </div>
        </div>

        {/* KPI 4: Out of Stock */}
        <ClickableCard
          tone="danger"
          onClick={openProducts ? () => openProducts('catalog', 'outOfStock') : undefined}
          title="عرض الأصناف اللي رصيدها صفر في إدارة المخزن"
          className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]"
        >
          <div className="flex items-center justify-between gap-2 text-ink-muted dark:text-ink-dark-muted">
            <span className="text-sm font-bold group-hover:text-danger dark:group-hover:text-danger-bright transition-colors">أصناف رصيدها صفر</span>
            <AlertTriangle className="w-3.5 h-3.5 text-danger dark:text-danger-bright" />
          </div>
          <div className="t-kpi text-danger dark:text-danger-bright">
            {overview?.outOfStockCount || 0} صنف
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center justify-between">
            <span>نافدة بالكامل</span>
            {openProducts && <ClickableHint label="عرض الأصناف" />}
          </div>
        </ClickableCard>

        {/* KPI 5: Low Stock */}
        <ClickableCard
          tone="warn"
          onClick={openProducts ? () => openProducts('catalog', 'lowStock') : undefined}
          title="عرض الأصناف اللي تحت حد الطلب في إدارة المخزن"
          className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]"
        >
          <div className="flex items-center justify-between gap-2 text-ink-muted dark:text-ink-dark-muted">
            <span className="text-sm font-bold group-hover:text-warn dark:group-hover:text-warn-bright transition-colors">أصناف تحت حد الطلب</span>
            <AlertTriangle className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
          </div>
          <div className="t-kpi text-warn dark:text-warn-bright">
            {overview?.lowStockCount || 0} صنف
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center justify-between">
            <span>تحتاج إعادة طلب</span>
            {openProducts && <ClickableHint label="عرض الأصناف" />}
          </div>
        </ClickableCard>

        {/* KPI 6: Turnover Rate */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]">
          <div className="flex items-center justify-between gap-2 text-ink-muted dark:text-ink-dark-muted">
            <span className="text-sm font-bold">معدل دوران المخزون</span>
            <Clock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
          </div>
          <div className="t-kpi text-brand-dark dark:text-brand-bright">
            {overview?.turnoverRate ? `${overview.turnoverRate} مرة / سنة` : '—'}
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
            سرعة تصريف وتبديل البضاعة
          </div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="shrink-0">
        <SegmentedTabs
          ariaLabel="أقسام تحليلات المخزون والمشتريات"
          value={activeSection}
          onChange={setActiveSection}
          options={sectionTabs}
        />
      </div>

      {/* 4. Dynamic Tab Content */}
      <div {...motionPanel} className="flex-1 pb-4">
        {/* SECTION A: Shrinkage & Loss Analysis */}
        {activeSection === 'shrinkage' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Summary Card */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="t-section-title text-ink dark:text-ink-dark mb-1 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-danger dark:text-danger-bright" />
                    <span>معدل فاقد المخزون للمبيعات</span>
                  </h2>
                  <p className="text-sm mt-1 text-ink-muted dark:text-ink-dark-muted mb-5">
                    إجمالي الخسائر المالية الناجمة عن التلف وانتهاء الصلاحية والعجز
                  </p>
                  <div className="text-2xl font-bold font-mono text-danger dark:text-danger-bright">
                    {formatArabicCurrency(shrinkage?.totalShrinkagePiasters || 0)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted">نسبة الفاقد للمبيعات:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      (shrinkage?.shrinkageToSalesPercent || 0) > 1.5
                        ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'
                        : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                    }`}>
                      {shrinkage?.shrinkageToSalesPercent || 0}%
                    </span>
                  </div>
                </div>

                <div className="text-xs text-ink-muted dark:text-ink-dark-muted border-t border-line dark:border-line-dark pt-3 mt-4 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                  <span>المعدل الآمن المقبول في قطاع التجزئة والمتاجر هو أقل من 1.2% من إجمالي المبيعات.</span>
                </div>
              </div>

              {/* Breakdown by Reason Bars */}
              <div className="lg:col-span-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs">
                <h2 className="t-section-title text-ink dark:text-ink-dark">تصنيف أسباب العجز والتلف</h2>
                <p className="text-sm mt-1 text-ink-muted dark:text-ink-dark-muted mb-5">
                  تحديد مصدر الخسارة الرئيسي لاتخاذ إجراءات وقائية مع الموظفين أو الموردين
                </p>

                <div className="space-y-3">
                  {shrinkage?.reasons.map((r) => (
                    <div key={r.reason} className="p-4 rounded-xl bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line/60 dark:border-line-dark/60">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-bold text-ink dark:text-ink-dark">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ink-muted dark:text-ink-dark-muted">{r.count} عمليات</span>
                          <span className="font-mono font-bold text-danger dark:text-danger-bright">
                            {formatArabicCurrency(r.totalCostPiasters)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2.5 bg-surface dark:bg-surface-dark rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-danger dark:bg-danger-bright rounded-full"
                          style={{ width: `${Math.min(100, r.percentOfTotal)}%` }}
                        />
                      </div>
                      <div className="text-xs text-ink-muted dark:text-ink-dark-muted font-mono">
                        {r.percentOfTotal}% من إجمالي خسائر المخزون
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Shrinkage Products Table */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs">
              <h2 className="t-section-title text-ink dark:text-ink-dark">أعلى الأصناف تسجيلاً للعجز والهالك</h2>
              <p className="text-sm mt-1 text-ink-muted dark:text-ink-dark-muted mb-5">
                الأصناف التي سببت أعلى أثر مالي سلبي خلال الفترة المحددة
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                      <th className="py-3.5 px-3.5">اسم الصنف</th>
                      <th className="py-3.5 px-3.5">الكمية المفقودة</th>
                      <th className="py-3.5 px-3.5">سعر التكلفة</th>
                      <th className="py-3.5 px-3.5">الخسارة المالية</th>
                      <th className="py-3.5 px-3.5">السبب المسجل</th>
                      <th className="py-3.5 px-3.5">التاريخ والوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {(!shrinkage?.topShrinkageProducts || shrinkage.topShrinkageProducts.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-ink-muted dark:text-ink-dark-muted">
                          لا توجد حركات عجز أو هالك مسجلة لهذه الفترة
                        </td>
                      </tr>
                    ) : (
                      shrinkage.topShrinkageProducts.map((it, idx) => (
                        <tr key={`${it.productId}-${idx}`} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                          <td className="py-3.5 px-3.5 font-bold text-ink dark:text-ink-dark">{it.productName}</td>
                          <td className="py-3.5 px-3.5 font-mono font-bold text-danger dark:text-danger-bright">
                            {(Math.abs(it.quantityDeltaMilli) / 1000).toLocaleString('ar-EG-u-nu-latn')} {formatUnitArabic(it.unit)}
                          </td>
                          <td className="py-3.5 px-3.5 font-mono text-ink-muted dark:text-ink-dark-muted">
                            {formatArabicCurrency(it.unitCostPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 font-mono font-bold text-danger dark:text-danger-bright">
                            {formatArabicCurrency(it.financialImpactPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 text-ink-muted dark:text-ink-dark-muted">{it.reason}</td>
                          <td className="py-3.5 px-3.5 font-mono text-ink-muted dark:text-ink-dark-muted">{formatLocalDateTime(it.createdAt)}</td>
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
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <p className="text-sm font-bold text-ink dark:text-ink-dark">
                حساب تلقائي لكمية الطلب المقترحة بناءً على الحد الأدنى ومخزون الأمان
              </p>

              <div className="flex items-center gap-2">
                <div className="px-4 h-10 inline-flex items-center bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark text-sm font-mono">
                  <span className="text-ink-muted dark:text-ink-dark-muted ml-1">ميزانية الطلب المقدرة:</span>
                  <span className="font-bold text-brand-dark dark:text-brand-bright">{formatArabicCurrency(totalSuggestedOrderBudget)}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                    <th className="py-3.5 px-3.5">اسم الصنف والباركود</th>
                    <th className="py-3.5 px-3.5">القسم</th>
                    <th className="py-3.5 px-3.5">الرصيد الحالي</th>
                    <th className="py-3.5 px-3.5">حد الطلب الأدنى</th>
                    <th className="py-3.5 px-3.5">الكمية المقترحة</th>
                    <th className="py-3.5 px-3.5">سعر التكلفة</th>
                    <th className="py-3.5 px-3.5">التكلفة الإجمالية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {lowStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-paid dark:text-paid-bright font-medium">
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright" />
                          <span>جميع الأصناف في المخزن أعلى من الحد الأدنى للطلب!</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    lowStockItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                        <td className="py-3.5 px-3.5">
                          <div className="font-bold text-ink dark:text-ink-dark">{item.name}</div>
                          <div className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted">{item.barcode || '—'}</div>
                        </td>
                        <td className="py-3.5 px-3.5 text-ink-muted dark:text-ink-dark-muted">{item.categoryName}</td>
                        <td className="py-3.5 px-3.5 font-mono font-bold text-danger dark:text-danger-bright">
                          {(item.stockMilli / 1000).toLocaleString('ar-EG-u-nu-latn')} {formatUnitArabic(item.unit)}
                        </td>
                        <td className="py-3.5 px-3.5 font-mono text-ink-muted dark:text-ink-dark-muted">
                          {(item.minStockMilli / 1000).toLocaleString('ar-EG-u-nu-latn')} {formatUnitArabic(item.unit)}
                        </td>
                        <td className="py-3.5 px-3.5 font-mono font-bold text-paid dark:text-paid-bright">
                          <span dir="ltr">+{((item.suggestedOrderMilli / 1000)).toLocaleString('ar-EG-u-nu-latn')}</span> {formatUnitArabic(item.unit)}
                        </td>
                        <td className="py-3.5 px-3.5 font-mono text-ink-muted dark:text-ink-dark-muted">
                          {formatArabicCurrency(item.unitCostPiasters)}
                        </td>
                        <td className="py-3.5 px-3.5 font-mono font-bold text-ink dark:text-ink-dark">
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
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs flex flex-col gap-3">
                <div className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted">إجمالي مشتريات الفترة</div>
                <div className="t-kpi text-ink dark:text-ink-dark">
                  {formatArabicCurrency(purchases?.totalPurchasesPiasters || 0)}
                </div>
                <div className="text-xs text-ink-muted dark:text-ink-dark-muted font-mono">
                  {purchases?.totalInvoicesCount || 0} فاتورة شراء
                </div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs flex flex-col gap-3">
                <div className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted">المسدد نقداً للموردين</div>
                <div className="t-kpi text-paid dark:text-paid-bright">
                  {formatArabicCurrency(purchases?.totalPaidPiasters || 0)}
                </div>
                <div className="text-xs text-paid dark:text-paid-bright">مدفوع نقدياً بالفترة</div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs flex flex-col gap-3">
                <div className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted flex items-center justify-between">
                  <span>مديونيات قائمة للموردين</span>
                  <span className="text-xs bg-surface-2 dark:bg-surface-dark-2 px-2 py-1 rounded-lg font-mono text-ink-muted dark:text-ink-dark-muted">
                    {purchases?.debtorSuppliersCount || 0} موردين
                  </span>
                </div>
                <div className="t-kpi text-warn dark:text-warn-bright">
                  {formatArabicCurrency(purchases?.totalSupplierDebtsPiasters ?? (purchases?.totalUnpaidPiasters || 0))}
                </div>
                <div className="text-xs text-warn dark:text-warn-bright">ديون مستحقة على المحل</div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs flex flex-col gap-3">
                <div className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted flex items-center justify-between">
                  <span>رصيد متاح لنا (تحت الحساب)</span>
                  <span className="text-xs bg-paid-soft dark:bg-paid-dark-soft text-paid-dark dark:text-paid-bright px-2 py-1 rounded-lg font-mono font-bold">
                    {purchases?.creditorSuppliersCount || 0} شركات
                  </span>
                </div>
                <div className="t-kpi text-paid dark:text-paid-bright">
                  {formatArabicCurrency(purchases?.totalSupplierCreditsPiasters || 0)}
                </div>
                <div className="text-xs text-paid-dark dark:text-paid-bright">دفعات مقدمة لنا عند الموردين</div>
              </div>

              {openPurchases && (
                <ClickableCard
                  tone="brand"
                  onClick={openPurchases}
                  title="فتح شاشة فواتير المشتريات"
                  className="bg-brand-soft/50 dark:bg-brand-soft/10 border border-brand/30 dark:border-brand-bright/30 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 min-h-[7.75rem]"
                >
                  <div className="text-xs font-bold text-brand-dark dark:text-brand-bright">إدارة فواتير المشتريات</div>
                  <div className="text-xs text-brand dark:text-brand-bright mt-1 flex items-center justify-between">
                    <span>فتح شاشة المشتريات</span>
                    <ClickableChevron className="w-4 h-4" />
                  </div>
                </ClickableCard>
              )}
            </div>

            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs">
              <h2 className="t-section-title text-ink dark:text-ink-dark">أكبر الموردين حسب حجم المشتريات</h2>
              <p className="text-sm mt-1 text-ink-muted dark:text-ink-dark-muted mb-5">
                تفصيل المبالغ المشتراة من كل شركة موردة مع رصيد الديون المتبقي لهم
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                      <th className="py-3.5 px-3.5">اسم المورد / الشركة</th>
                      <th className="py-3.5 px-3.5">عدد الفواتير</th>
                      <th className="py-3.5 px-3.5">إجمالي المشتريات</th>
                      <th className="py-3.5 px-3.5">المسدد</th>
                      <th className="py-3.5 px-3.5">المتبقي (دين على المحل)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {(!purchases?.topSuppliers || purchases.topSuppliers.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-ink-muted dark:text-ink-dark-muted">
                          لا توجد فواتير شراء مسجلة لهذه الفترة
                        </td>
                      </tr>
                    ) : (
                      purchases.topSuppliers.map((sup) => (
                        <tr key={sup.supplierId} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                          <td className="py-3.5 px-3.5 font-bold text-ink dark:text-ink-dark">{sup.supplierName}</td>
                          <td className="py-3.5 px-3.5 font-mono text-ink-muted dark:text-ink-dark-muted">{sup.invoicesCount}</td>
                          <td className="py-3.5 px-3.5 font-mono font-bold text-ink dark:text-ink-dark">
                            {formatArabicCurrency(sup.totalPurchasePiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 font-mono text-paid dark:text-paid-bright">
                            {formatArabicCurrency(sup.paidPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 font-mono font-bold">
                            {sup.unpaidPiasters > 0 ? (
                              <span className="text-warn dark:text-warn-bright">{formatArabicCurrency(sup.unpaidPiasters)}</span>
                            ) : (
                              <span className="text-paid dark:text-paid-bright">خالص</span>
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
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs">
            <p className="text-sm font-bold text-ink dark:text-ink-dark mb-5">
              نظام الإنذار المبكر للأصناف سريعة التلف لتصريفها قبل انتهاء صلاحيتها
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
              <div className="p-5 rounded-xl flex flex-col gap-3 bg-danger-soft/40 dark:bg-danger-dark-soft/40 border border-danger/30 dark:border-danger-bright/30">
                <div className="text-sm font-bold text-danger dark:text-danger-bright">دفعات منتهية الصلاحية</div>
                <div className="t-kpi-lg text-danger dark:text-danger-bright">
                  {batchSummary?.expiredCount || overview?.expiredBatchesCount || 0} دفعة
                </div>
                <div className="text-xs text-danger dark:text-danger-bright">يجب إتلافها فوراً وسحبها من الرف</div>
              </div>

              <div className="p-5 rounded-xl flex flex-col gap-3 bg-warn-soft/40 dark:bg-warn-dark-soft/40 border border-warn/30 dark:border-warn-bright/30">
                <div className="text-sm font-bold text-warn dark:text-warn-bright">تنتهي خلال 7 إلى 30 يوماً</div>
                <div className="t-kpi-lg text-warn dark:text-warn-bright">
                  {batchSummary?.expiringSoonCount || overview?.expiringSoonBatchesCount || 0} دفعة
                </div>
                <div className="text-xs text-warn dark:text-warn-bright">تحتاج عروض تخفيض وتصريف سريع</div>
              </div>

              <div className="p-5 rounded-xl flex flex-col gap-3 bg-paid-soft/40 dark:bg-paid-dark-soft/40 border border-paid/30 dark:border-paid/40">
                <div className="text-sm font-bold text-paid dark:text-paid-bright">دفعات سليمة ونشطة</div>
                <div className="t-kpi-lg text-paid dark:text-paid-bright">
                  {batchSummary?.totalActiveBatches || 0} دفعة
                </div>
                <div className="text-xs text-paid dark:text-paid-bright">صلاحية آمنة ومستقرة</div>
              </div>
            </div>

            <div className="text-sm text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-xl border border-line dark:border-line-dark flex items-center gap-1.5 flex-wrap">
              <Info className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
              <span>يمكنك إدارة وطباعة الباركود الخاص بكل دفعة عبر قسم{' '}</span>
              <AppButton variant="soft" size="xs" disabled={!openProducts} onClick={() => openProducts?.('batches')}>
                <span>السلع والمخزن</span>
                <ChevronLeft className="w-3 h-3" />
                <span>الدفعات وتواريخ الصلاحية</span>
              </AppButton>
            </div>
          </div>
        )}

        {/* SECTION E: Dead Stock Radar */}
        {activeSection === 'deadstock' && (
          <DeadStockRadar 
            onNavigateToProduct={navAccess.products ? (productId) => {
              if (onNavigateToProductEdit) {
                onNavigateToProductEdit(productId);
              } else if (onNavigateToProducts) {
                onNavigateToProducts('catalog');
              }
            } : undefined}
          />
        )}
      </div>
    </div>
  );
};
