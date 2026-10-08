import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  ShoppingCart, 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Wallet, 
  CheckCircle2, 
  Users,
  ChevronLeft,
  Flame,
  Lock,
  Scale,
  Boxes
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import type { DashboardSummary, UnclosedDayAlert, BatchSummary, HourlyIntensityReport } from '../types/models';
import { useFeatures } from '../context/useFeatures';
import { DailyClosingModal } from '../components/DailyClosingModal';
import { LowStockReportModal } from '../components/LowStockReportModal';
import { DebtorsReportModal } from '../components/DebtorsReportModal';
import { formatArabicCurrency } from '../utils/money';



export interface DashboardViewProps {
  onNavigateToPos?: () => void;
  onNavigateToProducts: (subView?: 'catalog' | 'movements' | 'batches', filter?: 'all' | 'lowStock' | 'outOfStock') => void;
  onNavigateToSales?: () => void;
  onNavigateToSettings?: (target?: string) => void;
  onNavigateToCustomers?: () => void;
  onNavigateToAudit?: () => void;
  onNavigateSubTab?: (subTab: 'today' | 'revenue' | 'inventory' | 'customers') => void;
}

export function DashboardView({ 
  onNavigateToProducts,
  onNavigateToCustomers,
  onNavigateSubTab
}: DashboardViewProps) {
  const { isEnabled } = useFeatures();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [unclosedAlert, setUnclosedAlert] = useState<UnclosedDayAlert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyIntensityReport | null>(null);

  // Milestone 9 Modals State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingTargetDate, setClosingTargetDate] = useState<string | undefined>(undefined);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [isDebtorsModalOpen, setIsDebtorsModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sumData, unclosedData, batchData, hrData] = await Promise.all([
        invoke<DashboardSummary>('reports:getTodaySummary'),
        invoke<UnclosedDayAlert>('closing:checkPreviousDay'),
        isEnabled('feature_expiry_dates')
          ? invoke<BatchSummary>('batch:summary').catch(() => null)
          : Promise.resolve(null),
        invoke<HourlyIntensityReport>('reports:getHourlyIntensity', { period: 'today' }).catch(() => null)
      ]);
      if (sumData) setSummary(sumData);
      if (unclosedData) setUnclosedAlert(unclosedData);
      if (batchData) setBatchSummary(batchData);
      if (hrData) setHourlyData(hrData);
      const now = new Date();
      setLastRefreshed(now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  }, [isEnabled]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useDataSubscription(['sales', 'dashboard', 'purchases', 'all'], () => {
    void loadData();
  });

  return (
    <div className="flex flex-col h-full w-full bg-canvas select-none overflow-y-auto p-5 gap-4 font-sans text-ink" dir="rtl">
      
      {/* 1. TOP HEADER & COMMAND CENTER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-surface p-3 sm:p-3.5 rounded-xl border border-line shadow-2xs">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-ink">لوحة اليوم والتشغيل</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            موجز وردية اليوم، حركة الدرج، والتنبيهات التشغيلية الحية
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-ink-muted bg-surface-2 px-2.5 py-1.5 rounded-lg border border-line">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span className="text-[11px]">آخر تحديث:</span>
            <span className="font-mono text-ink font-bold text-xs tabular-nums">{lastRefreshed || '---'}</span>
          </div>

          <button
            onClick={() => void loadData()}
            disabled={isLoading}
            className="flex items-center justify-center h-9 w-9 bg-surface border border-line hover:bg-surface-2 rounded-lg text-xs font-bold text-ink transition-colors shadow-2xs disabled:opacity-50 cursor-pointer active:translate-y-0.5"
            title="تحديث البيانات اللحظية"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-paid' : 'text-ink-muted'}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setClosingTargetDate(undefined);
              setIsClosingModalOpen(true);
            }}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-brand hover:bg-brand-dark active:bg-brand-dark text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:translate-y-0.5"
            title="إقفال اليومية ومطابقة النقدية"
          >
            <Lock className="w-4 h-4 text-emerald-300" />
            <span>قفل اليومية</span>
          </button>
        </div>
      </div>

      {/* Live Hourly Peak Ticker Banner */}
      {hourlyData && hourlyData.peakHourSalesPiasters > 0 && (
        <div 
          onClick={() => onNavigateSubTab && onNavigateSubTab('revenue')}
          className="bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-ink cursor-pointer transition-all shadow-2xs group shrink-0"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500 text-white flex items-center justify-center font-bold">
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-ink">ساعة الذروة الكبرى اليوم: </span>
              <span className="font-mono font-bold text-amber-800">{hourlyData.peakHourLabel}</span>
              <span className="text-ink-muted mr-2">
                ({hourlyData.peakHourInvoicesCount} فاتورة — {formatArabicCurrency(hourlyData.peakHourSalesPiasters)})
              </span>
            </div>
          </div>
          <span className="text-amber-800 font-bold flex items-center gap-0.5 group-hover:underline">
            <span>تحليل ساعات الذروة والشلال المالي</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </span>
        </div>
      )}

      {/* Unclosed Previous Business Day Warning Alert Banner (Story 87 / Task 49-5) */}
      {unclosedAlert && unclosedAlert.hasUnclosedDay && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink shadow-xs shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-[#14181A]">
                  تنبيه إقفال اليومية: يوم العمل السابق ({unclosedAlert.unclosedDate}) لم يُقفل بعد!
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                  مطلوب الإقفال
                </span>
              </div>
              <p className="text-xs text-[#5B6664] mt-0.5">
                يوجد <strong>{unclosedAlert.unclosedSalesCount}</strong> فاتورة بإجمالي <strong>{formatArabicCurrency(unclosedAlert.unclosedSalesTotalPiasters)}</strong> لم يتم ترحيلها في تقرير إقفال رسمي. يرجى تصفية الوردية السابقة لضمان صحة دفاتر المحل.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setClosingTargetDate(unclosedAlert.unclosedDate);
              setIsClosingModalOpen(true);
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs shrink-0 cursor-pointer active:translate-y-0.5 flex items-center gap-1.5 justify-center"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>إقفال يومية {unclosedAlert.unclosedDate} الآن</span>
          </button>
        </div>
      )}

      {/* Expiry Dates & Expiring Batches Alert Banner (Story 93 / Feature #60) */}
      {isEnabled('feature_expiry_dates') && batchSummary && (batchSummary.expiredCount > 0 || batchSummary.expiringSoonCount > 0) && (
        <div className={`border-2 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink shadow-xs shrink-0 animate-in fade-in duration-200 ${
          batchSummary.expiredCount > 0
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs text-white ${
              batchSummary.expiredCount > 0 ? 'bg-rose-600' : 'bg-amber-500'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-[#14181A]">
                  {batchSummary.expiredCount > 0
                    ? `تنبيه تواريخ الصلاحية: يوجد ${batchSummary.expiredCount} دفعة منتهية الصلاحية!`
                    : `تنبيه الصلاحية: يوجد ${batchSummary.expiringSoonCount} دفعة أوشكت على الانتهاء`}
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${
                  batchSummary.expiredCount > 0 ? 'bg-rose-600' : 'bg-amber-600'
                }`}>
                  {batchSummary.expiredCount > 0 ? 'هالك محتمل' : 'متابعة مطلوبة'}
                </span>
              </div>
              <p className="text-xs text-[#5B6664] mt-0.5">
                {batchSummary.expiredCount > 0
                  ? `يوجد دفعات منتهية الصلاحية بقيمة تقديرية ${formatArabicCurrency(batchSummary.expiredValuePiasters)}. يرجى إتلافها أو تسويتها لمنع بيعها.`
                  : `يوجد ${batchSummary.expiringSoonCount} دفعة تقترب من تاريخ الانتهاء بقيمة ${formatArabicCurrency(batchSummary.expiringSoonValuePiasters)}. تُصرف تلقائياً حسب الأقرب انتهاءً.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToProducts('batches')}
            className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition shadow-xs shrink-0 cursor-pointer active:translate-y-0.5 flex items-center gap-1.5 justify-center ${
              batchSummary.expiredCount > 0
                ? 'bg-rose-700 hover:bg-rose-800'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>عرض الدفعات وتواريخ الصلاحية</span>
          </button>
        </div>
      )}

      {/* 2. FINANCIAL & OPERATIONAL KPI METRICS (6 clean cards with no clipping) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3 shrink-0">
        {/* KPI 1: Today Sales */}
        <div 
          onClick={() => {
            if (onNavigateSubTab) onNavigateSubTab('revenue');
          }}
          className="bg-surface rounded-xl border border-line p-3 sm:p-3.5 shadow-2xs hover:border-paid hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group"
          title="عرض تحليلات الإيرادات التفصيلية"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
              <span className="font-bold text-ink text-xs">مبيعات اليوم</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft text-paid border border-paid/20 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <ShoppingCart className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl lg:text-2xl font-black font-mono text-ink tabular-nums leading-none">
                {summary ? (summary.todaySalesPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
            <span>نقدي: <strong className="text-ink font-mono tabular-nums">{summary ? (summary.todayCashPiasters / 100).toFixed(0) : '0'}</strong></span>
            <span className="text-paid font-bold text-[11px] flex items-center gap-0.5 group-hover:underline">
              التحليلات
              <ChevronLeft className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 2: Today Net Profit / Loss */}
        {(() => {
          const netProfit = summary?.todayNetProfitsPiasters ?? summary?.todayProfitsPiasters ?? 0;
          const isLoss = netProfit < 0;
          const absNetProfit = Math.abs(netProfit);

          return (
            <div 
              onClick={() => {
                if (onNavigateSubTab) onNavigateSubTab('revenue');
              }}
              className={`bg-surface rounded-xl border ${
                isLoss ? 'border-rose-300 hover:border-danger' : 'border-line hover:border-paid'
              } p-3 sm:p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group`}
              title="عرض تقرير أرباح ومبيعات الفترة"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
                  <span className={`font-bold text-xs ${isLoss ? 'text-danger' : 'text-ink'}`}>
                    {isLoss ? 'صافي خسائر اليوم' : 'صافي أرباح اليوم'}
                  </span>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-2xs border ${
                    isLoss ? 'bg-rose-50 text-danger border-rose-200' : 'bg-paid-soft text-paid border-paid/20'
                  }`}>
                    {isLoss ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl lg:text-2xl font-black font-mono tabular-nums leading-none ${
                    isLoss ? 'text-danger' : 'text-paid'
                  }`}>
                    {isLoss ? '-' : ''}{(absNetProfit / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[11px] font-bold ${isLoss ? 'text-danger' : 'text-ink-muted'}`}>ج.م</span>
                </div>
              </div>
              <div className="pt-2 mt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="truncate">
                  {summary && (summary.todayInventoryLossPiasters || 0) > 0
                    ? `مبيعات: ${((summary.todayProfitsPiasters || 0) / 100).toFixed(0)} | عجز: -${((summary.todayInventoryLossPiasters || 0) / 100).toFixed(0)}`
                    : 'صافي بعد التكاليف'}
                </span>
                <span className={`font-bold font-mono text-[10px] px-1.5 py-0.2 rounded-md border ${
                  isLoss ? 'bg-rose-50 text-danger border-rose-200' : 'bg-paid-soft text-paid border-paid/20'
                }`}>
                  {isLoss ? 'عجز وتالف' : 'فعلي'}
                </span>
              </div>
            </div>
          );
        })()}

        {/* KPI 3: Inventory Loss / Shrinkage */}
        <div 
          onClick={() => {
            if (onNavigateSubTab) onNavigateSubTab('inventory');
            else onNavigateToProducts('movements');
          }}
          className="bg-surface rounded-xl border border-line p-3 sm:p-3.5 shadow-2xs hover:border-amber-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
              <span className="font-bold text-ink text-xs">عجز وتالف الجرد</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
                <Scale className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl lg:text-2xl font-black font-mono tabular-nums leading-none ${
                (summary?.todayInventoryLossPiasters || 0) > 0 ? 'text-warn' : 'text-ink'
              }`}>
                {summary && summary.todayInventoryLossPiasters != null 
                  ? (summary.todayInventoryLossPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
            <span>التسويات: <strong className="text-ink font-mono tabular-nums">{summary?.todayAdjustmentsCount || 0}</strong></span>
            <span className="text-paid font-bold text-[11px] flex items-center gap-0.5 group-hover:underline">
              تحليل الفاقد
              <ChevronLeft className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Invoices Count */}
        <div className="bg-surface rounded-xl border border-line p-3 sm:p-3.5 shadow-2xs hover:border-brand hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
              <span className="font-bold text-ink text-xs">فواتير الكاشير اليوم</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft text-paid border border-paid/20 flex items-center justify-center shadow-2xs">
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl lg:text-2xl font-black font-mono text-ink tabular-nums leading-none">
                {summary ? summary.todayInvoicesCount : '0'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted">فاتورة</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
            <span>متوسط: <strong className="text-ink font-bold font-mono tabular-nums">{summary && summary.todayInvoicesCount > 0 ? ((summary.todaySalesPiasters / summary.todayInvoicesCount) / 100).toFixed(0) : '0'}</strong> ج.م</span>
            <div className="flex items-center gap-1.5 font-bold text-[10px]">
              {summary && (summary.todayCancelledCount || 0) > 0 && (
                <span className="text-danger bg-rose-50 px-1.5 py-0.2 rounded-md border border-rose-200" title="فواتير ملغاة اليوم">
                  {summary.todayCancelledCount} ملغاة
                </span>
              )}
              {summary && (summary.todayReturnsCount || 0) > 0 && (
                <span className="text-warn bg-amber-50 px-1.5 py-0.2 rounded-md border border-amber-200" title="عمليات مرتجع اليوم">
                  {summary.todayReturnsCount} مرتجع
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 5: Drawer Balance */}
        <div className="bg-surface rounded-xl border border-line p-3 sm:p-3.5 shadow-2xs hover:border-brand hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
              <span className="font-bold text-ink text-xs">نقدي في الدرج</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft text-paid border border-paid/20 flex items-center justify-center shadow-2xs">
                <Wallet className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl lg:text-2xl font-black font-mono text-ink tabular-nums leading-none">
                {summary ? (summary.cashDrawerPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
            <span>نقدية: <strong className="text-ink font-mono tabular-nums">{summary ? (summary.todayCashPiasters / 100).toFixed(0) : '0'}</strong></span>
            {summary && (summary.todayReturnsPiasters || 0) > 0 && (
              <span className="text-amber-800 font-bold font-mono text-[10px]" title="مخصوم مبالغ مرتجعات نقدية">
                -{((summary.todayReturnsPiasters || 0) / 100).toFixed(0)} مرتجع
              </span>
            )}
            {summary && (summary.todayDebtPaymentsPiasters || 0) > 0 && (
              <span className="text-paid font-bold font-mono text-[10px]">
                +{((summary.todayDebtPaymentsPiasters || 0) / 100).toFixed(0)} سداد
              </span>
            )}
          </div>
        </div>

        {/* KPI 6: Customer Debts */}
        <div 
          onClick={() => {
            if (onNavigateSubTab) onNavigateSubTab('customers');
            else if (onNavigateToCustomers) onNavigateToCustomers();
          }}
          className="bg-surface rounded-xl border border-line p-3 sm:p-3.5 shadow-2xs hover:border-rose-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
              <span className="font-bold text-ink text-xs">ديون العملاء (الآجل)</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-danger border border-rose-200 flex items-center justify-center shadow-2xs">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl lg:text-2xl font-black font-mono text-danger tabular-nums leading-none">
                {summary && summary.totalCustomerDebtsPiasters != null 
                  ? (summary.totalCustomerDebtsPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
            <span>المدينون: <strong className="text-danger font-mono tabular-nums">{summary?.debtorsCount || 0}</strong></span>
            <span className="text-paid font-bold text-[11px] flex items-center gap-0.5 hover:underline">
              تحليل الآجل
              <ChevronLeft className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* 4. SPLIT SECTION: TOP SELLING & INVENTORY ADJUSTMENTS + ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0 pb-6">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items + Today's Inventory Adjustments */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          
          {/* 4A. Top Selling Products */}
          <div className="bg-surface rounded-xl border border-line flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 border-b border-line px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Flame className="w-4 h-4 text-paid" />
                <span>الأصناف الأكثر طلباً ومبيعاً اليوم</span>
              </div>
              <span className="text-[11px] text-ink-muted font-medium font-mono">مرتبة تنازلياً حسب الكمية</span>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 text-ink-muted border-b border-line text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium w-12 text-center">الترتيب</th>
                      <th className="py-2 px-3 font-medium">اسم الصنف</th>
                      <th className="py-2 px-3 font-medium text-center">الكمية المباعة</th>
                      <th className="py-2 px-3 font-medium text-left pl-5">إجمالي الإيراد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {summary.topSellingProducts.map((p, idx) => (
                      <tr key={p.productId} className="hover:bg-surface-2 transition-colors">
                        <td className="py-2 px-3 text-center">
                          {idx === 0 ? (
                            <span className="w-5 h-5 rounded-full bg-amber-50 text-warn font-bold text-[10px] inline-flex items-center justify-center border border-amber-200">1</span>
                          ) : idx === 1 ? (
                            <span className="w-5 h-5 rounded-full bg-surface-2 text-ink font-bold text-[10px] inline-flex items-center justify-center border border-line">2</span>
                          ) : idx === 2 ? (
                            <span className="w-5 h-5 rounded-full bg-amber-50 text-warn font-bold text-[10px] inline-flex items-center justify-center border border-amber-200">3</span>
                          ) : (
                            <span className="font-mono text-ink-muted text-[11px] tabular-nums">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-ink">{p.productName}</td>
                        <td className="py-2 px-3 font-mono font-bold text-center text-ink tabular-nums">
                          {p.totalQuantity}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-paid text-left pl-5 text-sm tabular-nums">
                          {(p.totalSalesPiasters / 100).toFixed(2)} <span className="text-[10px] text-ink-muted font-normal">ج.م</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-10 text-center text-ink-muted text-xs flex flex-col items-center justify-center gap-1.5">
                  <ShoppingCart className="w-7 h-7 text-line stroke-1" />
                  <span>لا توجد مبيعات مسجلة حتى الآن اليوم</span>
                </div>
              )}
            </div>
          </div>

          {/* 4B. Today's Inventory Adjustments & Shrinkage Section */}
          <div className="bg-surface rounded-xl border border-line flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 border-b border-line px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Scale className="w-4 h-4 text-warn" />
                <span>تسويات وعجز وتوالف المخزون اليوم</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-warn border border-amber-200 font-mono tabular-nums">
                  {summary?.recentAdjustments?.length || 0} حركة
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToProducts('movements')}
                className="px-2.5 py-0.5 rounded bg-surface hover:bg-surface-2 text-brand-dark text-[11px] font-bold flex items-center gap-1 border border-line shadow-2xs transition-colors cursor-pointer"
              >
                <Boxes className="w-3 h-3 text-brand" />
                <span>دفتر حركات المخزون</span>
                <ChevronLeft className="w-3 h-3" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.recentAdjustments && summary.recentAdjustments.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 text-ink-muted border-b border-line text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium">اسم الصنف</th>
                      <th className="py-2 px-3 font-medium text-center">فرق الرصيد</th>
                      <th className="py-2 px-3 font-medium text-center">تكلفة الوحدة</th>
                      <th className="py-2 px-3 font-medium text-left pl-5">الأثر المالي</th>
                      <th className="py-2 px-3 font-medium">السبب الموثق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {summary.recentAdjustments.map((adj, idx) => {
                      const isNegative = adj.quantityDeltaMilli < 0;
                      const isPositive = adj.quantityDeltaMilli > 0;

                      return (
                        <tr key={`${adj.productId}_${idx}`} className="hover:bg-surface-2 transition-colors">
                          <td className="py-2 px-3 font-bold text-ink">{adj.productName}</td>
                          <td className="py-2 px-3 text-center font-mono font-bold tabular-nums">
                            <span className={`px-2 py-0.2 rounded text-[11px] border ${
                              isNegative 
                                ? 'bg-rose-50 text-danger border-rose-200' 
                                : isPositive 
                                ? 'bg-paid-soft text-paid border-paid/20' 
                                : 'bg-surface-2 text-ink-muted border-line'
                            }`}>
                              {adj.quantityDeltaFormatted}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-ink-muted tabular-nums">
                            {(adj.unitCostPiasters / 100).toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-left pl-5 font-mono font-bold text-sm tabular-nums">
                            <span className={isNegative ? 'text-danger' : isPositive ? 'text-paid' : 'text-ink-muted'}>
                              {isNegative ? '-' : isPositive ? '+' : ''}{(Math.abs(adj.financialImpactPiasters) / 100).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-ink-muted font-normal mr-1">ج.م</span>
                          </td>
                          <td className="py-2 px-3 text-ink text-[11px]">
                            <span className="px-1.5 py-0.2 rounded bg-surface-2 border border-line text-ink-muted">
                              {adj.reason || 'تسوية جردية'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-ink-muted text-xs flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-6 h-6 text-paid" />
                  <span className="font-bold text-ink">لم يتم تسجيل أي عجز أو تالف بالمخزن اليوم</span>
                  <span className="text-[11px] text-ink-muted">كافة الأرصدة مطابقة بدون فروق جردية</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* LEFT COLUMN (1/3 width): System Alerts & Stock Thresholds */}
        <div className="flex flex-col gap-4">
          


          {/* Low Stock Alerts (Story 79 / Task 36-2) */}
          <div className="bg-surface rounded-xl border border-line flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 border-b border-line px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-danger font-bold text-xs">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                <span>تنبيهات النواقص بالمخزن</span>
                {summary && (summary.lowStockCount ?? summary.lowStockProducts?.length) > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-rose-50 text-danger text-[10px] font-mono font-bold border border-rose-200">
                    {summary.lowStockCount ?? summary.lowStockProducts.length} صنف
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => onNavigateSubTab ? onNavigateSubTab('inventory') : setIsLowStockModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-brand text-white hover:bg-brand-dark text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                  title="تحليل النواقص وأمر الشراء"
                >
                  أمر الشراء
                </button>
                <button 
                  onClick={() => onNavigateToProducts('catalog', 'lowStock')}
                  className="px-2 py-0.5 rounded bg-surface hover:bg-surface-2 text-ink text-[11px] font-bold transition-all shadow-2xs border border-line cursor-pointer"
                >
                  عرض الكل
                </button>
              </div>
            </div>

            <div className="p-3 divide-y divide-line max-h-[220px] overflow-y-auto">
              {summary && summary.lowStockProducts && summary.lowStockProducts.length > 0 ? (
                summary.lowStockProducts.map((p) => (
                  <div 
                    key={p.productId} 
                    onClick={() => onNavigateToProducts('catalog', 'lowStock')}
                    className="py-2 flex items-center justify-between gap-3 text-xs hover:bg-surface-2 -mx-1 px-1 rounded transition-colors cursor-pointer"
                    title="انقر لفتح الصنف في إدارة المخزن"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink truncate whitespace-nowrap" title={p.productName}>{p.productName}</div>
                      <div className="text-[10px] text-ink-muted whitespace-nowrap flex items-center gap-1.5 mt-0.5">
                        <span>وحدة: {p.unit === 'kg' ? 'كيلوجرام' : 'قطعة'}</span>
                        <span className="text-line">•</span>
                        <span>حد الطلب: {p.minStock ?? 5}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-bold tabular-nums whitespace-nowrap border ${
                      p.currentStock <= 0 
                        ? 'bg-rose-50 text-danger border-rose-200' 
                        : 'bg-amber-50 text-warn border-amber-200'
                    }`}>
                      {p.currentStock <= 0 ? 'نافد (0)' : `متبقي: ${p.currentStock}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-ink-muted text-xs">
                  <CheckCircle2 className="w-5 h-5 text-paid mx-auto mb-1" />
                  جميع الأصناف بمستويات مخزون آمنة
                </div>
              )}
            </div>
          </div>

          {/* Top Debtors List */}
          <div className="bg-surface rounded-xl border border-line flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 border-b border-line px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-ink font-bold text-xs">
                <Users className="w-4 h-4 text-paid" />
                <span>أعلى العملاء مديونية (الآجل)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => onNavigateSubTab ? onNavigateSubTab('customers') : setIsDebtorsModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-brand text-white hover:bg-brand-dark text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                  title="تحليل ديون العملاء الكامل"
                >
                  كشف التحليلات
                </button>
              </div>
            </div>

            <div className="p-3 divide-y divide-line max-h-[190px] overflow-y-auto">
              {summary && summary.topDebtors && summary.topDebtors.length > 0 ? (
                summary.topDebtors.map((d) => (
                  <div key={d.customerId} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-ink">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-[10px] text-ink-muted font-mono">{d.customerPhone}</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-danger text-xs tabular-nums">
                      {(d.balancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-ink-muted text-xs">
                  <CheckCircle2 className="w-4 h-4 text-paid mx-auto mb-1" />
                  لا توجد ديون مستحقة على العملاء حالياً
                </div>
              )}
            </div>
          </div>

        </div>

      </div>



      {/* Daily Closing & Z-Report Modal (Story 87 / Feature #49) */}
      <DailyClosingModal
        isOpen={isClosingModalOpen}
        onClose={() => {
          setIsClosingModalOpen(false);
          setClosingTargetDate(undefined);
        }}
        targetDate={closingTargetDate}
        onClosingCompleted={() => {
          void loadData();
        }}
      />

      {/* Low Stock & Purchase Order Modal (Story 86 / Feature #48) */}
      <LowStockReportModal
        isOpen={isLowStockModalOpen}
        onClose={() => setIsLowStockModalOpen(false)}
      />

      {/* Debtors Statement Modal (Story 88 / Feature #50) */}
      <DebtorsReportModal
        isOpen={isDebtorsModalOpen}
        onClose={() => setIsDebtorsModalOpen(false)}
      />


    </div>
  );
}
