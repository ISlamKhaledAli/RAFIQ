import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  ShoppingCart, 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  Wallet, 
  CheckCircle2, 
  Users,
  ChevronLeft,
  Flame,
  Lock,
  Scale,
  Boxes,
  Receipt
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import type { DashboardSummary, UnclosedDayAlert, BatchSummary, HourlyIntensityReport } from '../types/models';
import { useFeatures } from '../context/useFeatures';
import { DailyClosingModal } from '../components/DailyClosingModal';
import { LowStockReportModal } from '../components/LowStockReportModal';
import { DebtorsReportModal } from '../components/DebtorsReportModal';
import { ExpenseModal } from '../components/ExpenseModal';
import { formatArabicCurrency } from '../utils/money';
import { RafiqLoadingState } from '../components/RafiqLoadingState';
import { useSmoothLoading } from '../utils/useSmoothLoading';



export interface DashboardViewProps {
  isActive?: boolean;
  onNavigateToPos?: () => void;
  onNavigateToProducts: (subView?: 'catalog' | 'movements' | 'batches', filter?: 'all' | 'lowStock' | 'outOfStock') => void;
  onNavigateToSales?: () => void;
  onNavigateToSettings?: (target?: string) => void;
  onNavigateToCustomers?: () => void;
  onNavigateToAudit?: () => void;
  onNavigateSubTab?: (subTab: 'today' | 'revenue' | 'inventory' | 'customers') => void;
}

export function DashboardView({ 
  isActive = true,
  onNavigateToProducts,
  onNavigateToCustomers,
  onNavigateSubTab
}: DashboardViewProps) {
  const { isEnabled } = useFeatures();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [unclosedAlert, setUnclosedAlert] = useState<UnclosedDayAlert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const showLoading = useSmoothLoading(isLoading, 300);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyIntensityReport | null>(null);

  // Milestone 9 Modals State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingTargetDate, setClosingTargetDate] = useState<string | undefined>(undefined);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [isDebtorsModalOpen, setIsDebtorsModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

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
    if (isActive) {
      void loadData();
    }
  }, [isActive, loadData]);

  useDataSubscription(['sales', 'dashboard', 'purchases'], () => {
    void loadData();
  });

  const todaySalesTotalPiasters = useMemo(() => {
    if (!summary) return 0;
    const componentsSum = (summary.todayCashPiasters || 0) + 
                          (summary.todayInstapayPiasters || 0) + 
                          (summary.todayVodafoneCashPiasters || 0) + 
                          (summary.todayCardPiasters || 0) + 
                          (summary.todayCreditPiasters || 0);
    return Math.max(summary.todaySalesPiasters || 0, componentsSum);
  }, [summary]);

  const todayCashAmount = (summary?.todayCashPiasters || 0) / 100;
  const todayCreditAmount = (summary?.todayCreditPiasters || 0) / 100;
  const todayCardAmount = (summary?.todayCardPiasters || 0) / 100;
  const todayInstapayAmount = (summary?.todayInstapayPiasters || 0) / 100;
  const todayVodafoneCashAmount = (summary?.todayVodafoneCashPiasters || 0) / 100;

  const paymentPills = useMemo(() => {
    const list: { key: string; label: string; amount: number; textCls: string; bg: string; border: string; title: string }[] = [];

    // 1. كاش
    list.push({
      key: 'cash',
      label: 'كاش',
      amount: todayCashAmount,
      textCls: 'text-[#006D41] dark:text-paid-bright',
      bg: 'bg-emerald-50/70 dark:bg-emerald-950/40',
      border: 'border-emerald-200/60 dark:border-emerald-800/40',
      title: 'مبيعات كاش محصلة في درج النقدية',
    });

    // 2. شكك (يظهر إذا كان هناك بيع آجل على الحساب لتطابق الحسابات)
    if (todayCreditAmount > 0) {
      list.push({
        key: 'credit',
        label: 'شكك',
        amount: todayCreditAmount,
        textCls: 'text-[#B3720E] dark:text-warn-bright',
        bg: 'bg-warn-soft/80 dark:bg-warn-dark-soft',
        border: 'border-warn/20 dark:border-warn-bright/30',
        title: 'مبيعات آجلة على الحساب (شكك ذمم عملاء)',
      });
    }

    // 3. فيزا / بطاقة (إذا وُجد دفع ببطاقة بنكية)
    if (todayCardAmount > 0) {
      list.push({
        key: 'card',
        label: 'فيزا',
        amount: todayCardAmount,
        textCls: 'text-[#0284c7] dark:text-sky-400',
        bg: 'bg-sky-50/80 dark:bg-sky-950/40',
        border: 'border-sky-200/80 dark:border-sky-800/40',
        title: 'مدفوعات بطاقة بنكية / فيزا',
      });
    }

    // 4. انستاباي
    list.push({
      key: 'instapay',
      label: list.length >= 2 ? 'انستا' : 'انستاباي',
      amount: todayInstapayAmount,
      textCls: 'text-[#582C83] dark:text-purple-300',
      bg: 'bg-purple-50/80 dark:bg-purple-950/40',
      border: 'border-purple-200/80 dark:border-purple-800/40',
      title: 'تحويلات انستاباي',
    });

    // 5. محافظ إلكترونية
    list.push({
      key: 'wallets',
      label: 'محافظ',
      amount: todayVodafoneCashAmount,
      textCls: 'text-[#e60000] dark:text-danger-bright',
      bg: 'bg-danger-soft/80 dark:bg-danger-dark-soft',
      border: 'border-danger/20 dark:border-danger-bright/30',
      title: 'محافظ إلكترونية (فودافون كاش وغيرها)',
    });

    return list;
  }, [todayCashAmount, todayCreditAmount, todayCardAmount, todayInstapayAmount, todayVodafoneCashAmount]);

  if (showLoading && !summary) {
    return (
      <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark items-center justify-center select-none p-5" dir="rtl">
        <RafiqLoadingState
          label="جاري تحميل لوحة اليوم والتشغيل..."
          sublabel="استرجاع مؤشرات المبيعات، الأرباح، الوردية، والتنبيهات الحية من قاعدة البيانات"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark select-none overflow-y-auto p-5 gap-4 font-sans text-ink dark:text-ink-dark" dir="rtl">
      
      {/* 1. TOP HEADER & COMMAND CENTER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-surface dark:bg-surface-dark p-3 sm:p-3.5 rounded-xl border border-line dark:border-line-dark shadow-2xs">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-ink dark:text-ink-dark">لوحة تحكم اليوم والوردية</h2>
          <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
            ملخص حركة الوردية النهاردة، كاش الدرج، وكل اللي بيحصل في المحل
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 px-2.5 py-1.5 rounded-lg border border-line dark:border-line-dark">
            <Clock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
            <span className="text-[11px]">آخر تحديث:</span>
            <span className="font-mono text-ink dark:text-ink-dark font-bold text-xs tabular-nums">{lastRefreshed || '---'}</span>
          </div>


          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold bg-surface dark:bg-surface-dark hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright border border-line dark:border-line-dark hover:border-danger/40 dark:hover:border-danger-bright/40 transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="تسجيل مصاريف ونثريات طلعت من درج الكاشير"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>تسجيل مصروف</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setClosingTargetDate(undefined);
              setIsClosingModalOpen(true);
            }}
            className={`flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:translate-y-0.5 ${
              summary?.isDayClosed
                ? 'bg-paid dark:bg-emerald-800 text-white dark:text-emerald-50 border border-paid/30 dark:border-emerald-600/50 hover:bg-paid/90 dark:hover:bg-emerald-700'
                : 'bg-brand dark:bg-emerald-700 text-white dark:text-white hover:bg-brand-dark dark:hover:bg-emerald-600 border border-brand/20 dark:border-emerald-500/40'
            }`}
            title={summary?.isDayClosed ? 'اليومية مقفولة ومعتمدة - اضغط لعرض التقرير والطباعة' : 'تقفيل اليومية ومطابقة كاش الدرج'}
          >
            {summary?.isDayClosed ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                <span>اليومية مقفولة (#{summary.closingNumber})</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-white dark:text-emerald-100" />
                <span>تقفيل اليومية</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Hourly Peak Ticker Banner */}
      {hourlyData && hourlyData.peakHourSalesPiasters > 0 && (
        <div 
          onClick={() => onNavigateSubTab && onNavigateSubTab('revenue')}
          className="bg-warn-soft dark:bg-warn-dark-soft hover:bg-warn-soft/80 dark:hover:bg-warn-dark-soft/80 border border-warn/20 dark:border-warn-bright/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-ink dark:text-ink-dark cursor-pointer transition-all shadow-2xs group shrink-0"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-warn dark:bg-warn-bright text-white dark:text-surface-dark flex items-center justify-center font-bold">
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-ink dark:text-ink-dark">أكتر وقت كان فيه بيع وزحمة النهاردة: </span>
              <span className="font-mono font-bold text-warn dark:text-warn-bright">{hourlyData.peakHourLabel}</span>
              <span className="text-ink-muted dark:text-ink-dark-muted mr-2">
                ({hourlyData.peakHourInvoicesCount} فاتورة — {formatArabicCurrency(hourlyData.peakHourSalesPiasters)})
              </span>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-warn dark:text-warn-bright group-hover:-translate-x-1 transition-transform shrink-0" />
        </div>
      )}

      {/* Unclosed Previous Business Day Warning Alert Banner (Story 87 / Task 49-5) */}
      {unclosedAlert && unclosedAlert.hasUnclosedDay && (
        <div className="bg-warn-soft dark:bg-warn-dark-soft border-2 border-warn/30 dark:border-warn-bright/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink dark:text-ink-dark shadow-xs shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warn dark:bg-warn-bright text-white dark:text-surface-dark flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-ink dark:text-ink-dark">
                  تنبيه تقفيل اليومية: اليوم اللي فات ({unclosedAlert.unclosedDate}) لسه ما اتقفلش!
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn dark:bg-warn-bright text-white dark:text-surface-dark">
                  محتاج تقفيل
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                فيه <strong>{unclosedAlert.unclosedSalesCount}</strong> فاتورة بمبلغ <strong>{formatArabicCurrency(unclosedAlert.unclosedSalesTotalPiasters)}</strong> لسه ما اتقفلتش في تقفيل رسمي. قفل الوردية اللي فاتت عشان حسابات ودفاتر المحل تبقى مظبوطة بالمليم.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setClosingTargetDate(unclosedAlert.unclosedDate);
              setIsClosingModalOpen(true);
            }}
            className="px-4 py-2 bg-warn hover:bg-warn-hover dark:bg-warn-bright dark:text-surface-dark text-white rounded-lg text-xs font-bold transition shadow-xs shrink-0 cursor-pointer active:translate-y-0.5 flex items-center gap-1.5 justify-center"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>تقفيل يومية {unclosedAlert.unclosedDate} دلوقتي</span>
          </button>
        </div>
      )}

      {/* Expiry Dates & Expiring Batches Alert Banner (Story 93 / Feature #60) */}
      {isEnabled('feature_expiry_dates') && batchSummary && (batchSummary.expiredCount > 0 || batchSummary.expiringSoonCount > 0) && (
        <div className={`border-2 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink dark:text-ink-dark shadow-xs shrink-0 animate-in fade-in duration-200 ${
          batchSummary.expiredCount > 0
            ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30'
            : 'bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-bright/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs text-white ${
              batchSummary.expiredCount > 0 ? 'bg-danger' : 'bg-warn'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-ink dark:text-ink-dark">
                  {batchSummary.expiredCount > 0
                    ? `تنبيه الصلاحية: فيه ${batchSummary.expiredCount} دفعة بضاعة صلاحيتها انتهت خلاص!`
                    : `تنبيه الصلاحية: فيه ${batchSummary.expiringSoonCount} دفعة بضاعة قربت تخلص صلاحيتها`}
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${
                  batchSummary.expiredCount > 0 ? 'bg-danger' : 'bg-warn'
                }`}>
                  {batchSummary.expiredCount > 0 ? 'بضاعة هلكت' : 'محتاجة تتلحق'}
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                {batchSummary.expiredCount > 0
                  ? `فيه دفعات صلاحيتها انتهت قيمتها حوالي ${formatArabicCurrency(batchSummary.expiredValuePiasters)}. يرجى استبعادها أو عمل إتلاف ليها عشان ما تتباعش.`
                  : `فيه ${batchSummary.expiringSoonCount} دفعة مقربة من تاريخ الانتهاء بقيمة ${formatArabicCurrency(batchSummary.expiringSoonValuePiasters)}. السيستم بيصرف تلقائي الأقرب انتهاءً الأول.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToProducts('batches')}
            className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition shadow-xs shrink-0 cursor-pointer active:translate-y-0.5 flex items-center gap-1.5 justify-center ${
              batchSummary.expiredCount > 0
                ? 'bg-danger hover:bg-danger/90'
                : 'bg-warn hover:bg-warn/90'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>شوف البضاعة وتواريخ الصلاحية</span>
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
          className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-paid dark:hover:border-paid-bright hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[128px] cursor-pointer group"
          title="عرض كشف تحليلات المبيعات التفصيلي"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">مبيعات النهاردة</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <ShoppingCart className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl lg:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums leading-none">
                {(todaySalesTotalPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>

            {/* Branded Payment Method Breakdown Pills (كاش / شكك / انستاباي / محافظ / فيزا) */}
            <div className={`grid ${
              paymentPills.length === 4 ? 'grid-cols-4' : paymentPills.length >= 5 ? 'grid-cols-5 gap-0.5' : 'grid-cols-3'
            } gap-1 pt-2 my-1.5 border-t border-line/60 dark:border-line-dark/60`}>
              {paymentPills.map((pill) => (
                <div 
                  key={pill.key}
                  className={`${pill.bg} border ${pill.border} rounded-md py-1 px-1 flex flex-col items-center justify-center text-center`}
                  title={pill.title}
                >
                  <span className={`text-[9px] font-extrabold leading-none truncate max-w-full ${pill.textCls}`}>
                    {pill.label}
                  </span>
                  <span 
                    className={`font-mono text-[10px] sm:text-[11px] font-black tabular-nums leading-tight mt-1 truncate max-w-full ${pill.textCls}`}
                  >
                    {pill.amount.toLocaleString('en-US', { 
                      minimumFractionDigits: pill.amount % 1 !== 0 ? 2 : 0, 
                      maximumFractionDigits: 2 
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-[10px] text-ink-muted dark:text-ink-dark-muted">
            <span className="text-ink-muted dark:text-ink-dark-muted font-medium truncate">
              {summary && (summary.todayTaxPiasters || 0) > 0 ? (
                <span title="ضريبة القيمة المضافة المحصلة اليوم كأمانات لمصلحة الضرائب">
                  ضريبة: <strong className="font-mono text-paid dark:text-paid-bright font-bold">{((summary.todayTaxPiasters || 0) / 100).toFixed(0)}</strong> ج.م
                </span>
              ) : (
                'تفاصيل المبيعات'
              )}
            </span>
            <span className="text-paid dark:text-paid-bright font-bold text-[11px] flex items-center gap-0.5 group-hover:underline">
              كشف الحساب
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
              className={`bg-surface dark:bg-surface-dark rounded-xl border ${
                isLoss ? 'border-danger-border dark:border-danger-bright/40 hover:border-danger dark:hover:border-danger-bright' : 'border-line dark:border-line-dark hover:border-paid dark:hover:border-paid-bright'
              } p-3 sm:p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group`}
              title="عرض تقرير أرباح ومبيعات الفترة"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
                  <span className={`font-bold text-xs ${isLoss ? 'text-danger dark:text-danger-bright' : 'text-ink dark:text-ink-dark'}`}>
                    {isLoss ? 'خسائر النهاردة' : 'أرباح النهاردة الصافية'}
                  </span>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-2xs border ${
                    isLoss ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/40'
                  }`}>
                    {isLoss ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl lg:text-2xl font-black font-mono tabular-nums leading-none ${
                    isLoss ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'
                  }`}>
                    {isLoss ? '-' : ''}{(absNetProfit / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[11px] font-bold ${isLoss ? 'text-danger dark:text-danger-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>ج.م</span>
                </div>
              </div>
              <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted">
                <span className="truncate">
                  {summary && (summary.todayInventoryLossPiasters || 0) > 0
                    ? `مبيعات: ${((summary.todayProfitsPiasters || 0) / 100).toFixed(0)} | عجز: -${((summary.todayInventoryLossPiasters || 0) / 100).toFixed(0)}`
                    : 'صافي بعد التكاليف'}
                </span>
                <span className={`font-bold font-mono text-[10px] px-1.5 py-0.2 rounded-md border ${
                  isLoss ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/40'
                }`}>
                  {isLoss ? 'بعد التوالف' : 'ربح صافي'}
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
          className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-amber-400 dark:hover:border-amber-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">توالف وعجز الجرد</span>
              <div className="w-7 h-7 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
                <Scale className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl lg:text-2xl font-black font-mono tabular-nums leading-none ${
                (summary?.todayInventoryLossPiasters || 0) > 0 ? 'text-warn dark:text-warn-bright' : 'text-ink dark:text-ink-dark'
              }`}>
                {summary && summary.todayInventoryLossPiasters != null 
                  ? (summary.todayInventoryLossPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted">
            <span>حركات الجرد: <strong className="text-ink dark:text-ink-dark font-mono tabular-nums">{summary?.todayAdjustmentsCount || 0}</strong></span>
            <span className="text-paid dark:text-paid-bright font-bold text-[11px] flex items-center gap-0.5 group-hover:underline">
              كشف التوالف
              <ChevronLeft className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Invoices Count */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-brand dark:hover:border-brand-bright hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">فواتير البيع النهاردة</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center shadow-2xs">
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl lg:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums leading-none">
                {summary ? summary.todayInvoicesCount : '0'}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">فاتورة</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted">
            <span>متوسط الفاتورة: <strong className="text-ink dark:text-ink-dark font-bold font-mono tabular-nums">{summary && summary.todayInvoicesCount > 0 ? ((todaySalesTotalPiasters / summary.todayInvoicesCount) / 100).toFixed(0) : '0'}</strong> ج.م</span>
            <div className="flex items-center gap-1.5 font-bold text-[10px]">
              {summary && (summary.todayCancelledCount || 0) > 0 && (
                <span className="text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.2 rounded-md border border-danger-border dark:border-danger-bright/30" title="فواتير اتلغت النهاردة">
                  {summary.todayCancelledCount} اتلغت
                </span>
              )}
              {summary && (summary.todayReturnsCount || 0) > 0 && (
                <span className="text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft px-1.5 py-0.2 rounded-md border border-warn-border dark:border-warn-bright/30" title="عمليات مرتجع النهاردة">
                  {summary.todayReturnsCount} رجعت
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 5: Drawer Balance */}
        {(() => {
          const todayOutPiasters = summary ? ((summary.todayExpensesPiasters || 0) + (summary.todayReturnsPiasters || 0)) : 0;
          const epayTillPiasters = summary ? (summary.todayEpayTillCashPiasters || 0) : 0;

          return (
            <div 
              onClick={() => setIsClosingModalOpen(true)}
              className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-brand dark:hover:border-brand-bright hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group"
              title="عرض كشف درج الكاشير وتقفيل الوردية"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
                  <span className="font-bold text-ink dark:text-ink-dark text-xs">كاش الدرج دلوقتي</span>
                  <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                    <Wallet className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl lg:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums leading-none">
                    {summary ? (summary.cashDrawerPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                  </span>
                  <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
                </div>

                {/* Branded Cash Breakdown Pills (مبيعات كاش / سداد شكك / مصاريف) - Identical to KPI 1 */}
                <div className="grid grid-cols-3 gap-1 pt-2 my-1.5 border-t border-line/60 dark:border-line-dark/60">
                  {/* مبيعات كاش */}
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 rounded-md py-1 px-1 flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-extrabold text-[#006D41] dark:text-paid-bright leading-none">مبيعات كاش</span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-black text-[#006D41] dark:text-paid-bright tabular-nums leading-tight mt-1">
                      {summary ? ((summary.todayCashPiasters || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: ((summary.todayCashPiasters || 0) / 100) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 }) : '0'}
                    </span>
                  </div>

                  {/* سداد شكك */}
                  <div className="bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/40 rounded-md py-1 px-1 flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-extrabold text-[#006D41] dark:text-paid-bright leading-none">سداد شكك</span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-black text-[#006D41] dark:text-paid-bright tabular-nums leading-tight mt-1">
                      {summary && (summary.todayDebtPaymentsPiasters || 0) > 0 ? '+' : ''}{summary ? (((summary.todayDebtPaymentsPiasters || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: ((summary.todayDebtPaymentsPiasters || 0) / 100) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 }) : '0'}
                    </span>
                  </div>

                  {/* مصاريف ومرتجع */}
                  <div className="bg-danger-soft/70 dark:bg-danger-dark-soft/40 border border-danger-border/60 dark:border-danger-bright/30 rounded-md py-1 px-1 flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-extrabold text-danger dark:text-danger-bright leading-none">مصاريف/مرتجع</span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-black text-danger dark:text-danger-bright tabular-nums leading-tight mt-1">
                      {todayOutPiasters > 0 ? '-' : ''}{(todayOutPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: (todayOutPiasters / 100) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[10px] text-ink-muted dark:text-ink-dark-muted">
                <span className="text-ink-muted dark:text-ink-dark-muted font-medium truncate">
                  {epayTillPiasters > 0 ? (
                    <span className="text-slate-600 dark:text-ink-dark-muted" title="نقدية محفظة ماكينات الدفع والخدمات الإلكترونية مستقلة تماماً عن درج المحل">
                      كاش محفظة المكن: <strong className="font-mono font-bold text-slate-800 dark:text-ink-dark">{(epayTillPiasters / 100).toFixed(0)}</strong> ج.م
                    </span>
                  ) : (
                    'نقدية الدرج الفعلية'
                  )}
                </span>
                <span className="text-paid dark:text-paid-bright font-bold text-[11px] flex items-center gap-0.5 group-hover:underline shrink-0">
                  تقفيل الوردية
                  <ChevronLeft className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })()}

        {/* KPI 6: Today's Credit Sales & Cumulative Debts */}
        <div 
          onClick={() => {
            if (onNavigateSubTab) onNavigateSubTab('customers');
            else if (onNavigateToCustomers) onNavigateToCustomers();
          }}
          className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-amber-400 dark:hover:border-amber-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px] cursor-pointer group"
          title="مبيعات الشكك والآجل المسجلة النهاردة، مع بيان إجمالي مديونية الزبائن في دفتر الشكك"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">شكك النهاردة</span>
              <div className="w-7 h-7 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl lg:text-2xl font-black font-mono tabular-nums leading-none ${
                (summary?.todayCreditPiasters || 0) > 0 ? 'text-warn dark:text-warn-bright' : 'text-ink dark:text-ink-dark'
              }`}>
                {((summary?.todayCreditPiasters || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted">
            <span title={`إجمالي كل الشكك لعدد ${summary?.debtorsCount || 0} عميل`}>
              إجمالي برة: <strong className="text-danger dark:text-danger-bright font-mono font-bold tabular-nums">{summary ? ((summary.totalCustomerDebtsPiasters || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'}</strong> ج.م
            </span>
            <span className="text-paid dark:text-paid-bright font-bold text-[11px] flex items-center gap-0.5 group-hover:underline">
              دفتر الشكك
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
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                <Flame className="w-4 h-4 text-paid dark:text-paid-bright" />
                <span>أكتر بضاعة اتباعت النهاردة</span>
              </div>
              <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-medium font-mono">مترتبة من الأكتر للأقل</span>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-b border-line dark:border-line-dark text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium w-12 text-center">الترتيب</th>
                      <th className="py-2 px-3 font-medium">اسم الصنف</th>
                      <th className="py-2 px-3 font-medium text-center">الكمية المباعة</th>
                      <th className="py-2 px-3 font-medium text-left pl-5">إجمالي المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {summary.topSellingProducts.map((p, idx) => (
                      <tr key={p.productId} className="hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors">
                        <td className="py-2 px-3 text-center">
                          {idx === 0 ? (
                            <span className="w-5 h-5 rounded-full bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold text-[10px] inline-flex items-center justify-center border border-warn/20 dark:border-warn-bright/30">1</span>
                          ) : idx === 1 ? (
                            <span className="w-5 h-5 rounded-full bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold text-[10px] inline-flex items-center justify-center border border-line dark:border-line-dark">2</span>
                          ) : idx === 2 ? (
                            <span className="w-5 h-5 rounded-full bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold text-[10px] inline-flex items-center justify-center border border-warn/20 dark:border-warn-bright/30">3</span>
                          ) : (
                            <span className="font-mono text-ink-muted dark:text-ink-dark-muted text-[11px] tabular-nums">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-ink dark:text-ink-dark">{p.productName}</td>
                        <td className="py-2 px-3 font-mono font-bold text-center text-ink dark:text-ink-dark tabular-nums">
                          {p.totalQuantity}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-paid dark:text-paid-bright text-left pl-5 text-sm tabular-nums">
                          {(p.totalSalesPiasters / 100).toFixed(2)} <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-normal">ج.م</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-10 text-center text-ink-muted dark:text-ink-dark-muted text-xs flex flex-col items-center justify-center gap-1.5">
                  <ShoppingCart className="w-7 h-7 text-line dark:text-line-dark stroke-1" />
                  <span>لسه ما فيش مبيعات اتسجلت النهاردة</span>
                </div>
              )}
            </div>
          </div>

          {/* 4B. Today's Inventory Adjustments & Shrinkage Section */}
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                <Scale className="w-4 h-4 text-warn dark:text-warn-bright" />
                <span>توالف وعجز بضاعة المخزن النهاردة</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 font-mono tabular-nums">
                  {summary?.recentAdjustments?.length || 0} حركة
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToProducts('movements')}
                className="px-2.5 py-0.5 rounded bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-brand-dark dark:text-brand-bright text-[11px] font-bold flex items-center gap-1 border border-line dark:border-line-dark shadow-2xs transition-colors cursor-pointer"
              >
                <Boxes className="w-3 h-3 text-brand dark:text-brand-bright" />
                <span>دفتر حركة البضاعة</span>
                <ChevronLeft className="w-3 h-3" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.recentAdjustments && summary.recentAdjustments.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-b border-line dark:border-line-dark text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium">اسم الصنف</th>
                      <th className="py-2 px-3 font-medium text-center">فرق الرصيد</th>
                      <th className="py-2 px-3 font-medium text-center">تكلفة القطعة</th>
                      <th className="py-2 px-3 font-medium text-left pl-5">الأثر المالي</th>
                      <th className="py-2 px-3 font-medium">السبب المكتوب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {summary.recentAdjustments.map((adj, idx) => {
                      const isNegative = adj.quantityDeltaMilli < 0;
                      const isPositive = adj.quantityDeltaMilli > 0;

                      return (
                        <tr key={`${adj.productId}_${idx}`} className="hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors">
                          <td className="py-2 px-3 font-bold text-ink dark:text-ink-dark">{adj.productName}</td>
                          <td className="py-2 px-3 text-center font-mono font-bold tabular-nums">
                            <span className={`px-2 py-0.2 rounded text-[11px] border ${
                              isNegative 
                                ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' 
                                : isPositive 
                                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/40' 
                                : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark'
                            }`}>
                              {adj.quantityDeltaFormatted}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-ink-muted dark:text-ink-dark-muted tabular-nums">
                            {(adj.unitCostPiasters / 100).toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-left pl-5 font-mono font-bold text-sm tabular-nums">
                            <span className={isNegative ? 'text-danger dark:text-danger-bright' : isPositive ? 'text-paid dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark-muted'}>
                              {isNegative ? '-' : isPositive ? '+' : ''}{(Math.abs(adj.financialImpactPiasters) / 100).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-normal mr-1">ج.م</span>
                          </td>
                          <td className="py-2 px-3 text-ink dark:text-ink-dark text-[11px]">
                            <span className="px-1.5 py-0.2 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted">
                              {adj.reason || 'تسوية جرد'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-ink-muted dark:text-ink-dark-muted text-xs flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-6 h-6 text-paid dark:text-paid-bright" />
                  <span className="font-bold text-ink dark:text-ink-dark">الحمد لله، مفيش أي عجز أو توالف اتسجلت النهاردة</span>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">كل بضاعة المخزن مظبوطة بالمليم</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* LEFT COLUMN (1/3 width): System Alerts & Stock Thresholds */}
        <div className="flex flex-col gap-4">
          
          {/* Low Stock Alerts (Story 79 / Task 36-2) */}
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-danger dark:text-danger-bright font-bold text-xs">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                <span>نواقص المخزن</span>
                {summary && (summary.lowStockCount ?? summary.lowStockProducts?.length) > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright text-[10px] font-mono font-bold border border-danger-border dark:border-danger-bright/30">
                    {summary.lowStockCount ?? summary.lowStockProducts.length} صنف
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => onNavigateSubTab ? onNavigateSubTab('inventory') : setIsLowStockModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-brand dark:bg-brand-bright dark:text-surface-dark hover:bg-brand-dark dark:hover:bg-emerald-400 text-white text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                  title="تحليل النواقص وعمل طلب شراء"
                >
                  طلب بضاعة
                </button>
                <button 
                  onClick={() => onNavigateToProducts('catalog', 'lowStock')}
                  className="px-2 py-0.5 rounded bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark text-[11px] font-bold transition-all shadow-2xs border border-line dark:border-line-dark cursor-pointer"
                >
                  كل النواقص
                </button>
              </div>
            </div>

            <div className="p-3 divide-y divide-line dark:divide-line-dark max-h-[220px] overflow-y-auto">
              {summary && summary.lowStockProducts && summary.lowStockProducts.length > 0 ? (
                summary.lowStockProducts.map((p) => (
                  <div 
                    key={p.productId} 
                    onClick={() => onNavigateToProducts('catalog', 'lowStock')}
                    className="py-2 flex items-center justify-between gap-3 text-xs hover:bg-surface-2 dark:hover:bg-surface-dark-2 -mx-1 px-1 rounded transition-colors cursor-pointer"
                    title="اضغط عشان تفتح الصنف في إدارة المخزن"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink dark:text-ink-dark truncate whitespace-nowrap" title={p.productName}>{p.productName}</div>
                      <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted whitespace-nowrap flex items-center gap-1.5 mt-0.5">
                        <span>وحدة: {p.unit === 'kg' ? 'كيلو' : 'قطعة'}</span>
                        <span className="text-line dark:text-line-dark">•</span>
                        <span>حد الأمان: {p.minStock ?? 5}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-bold tabular-nums whitespace-nowrap border ${
                      p.currentStock <= 0 
                        ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' 
                        : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30'
                    }`}>
                      {p.currentStock <= 0 ? 'خلصت خالص (0)' : `متبقي: ${p.currentStock}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-ink-muted dark:text-ink-dark-muted text-xs">
                  <CheckCircle2 className="w-5 h-5 text-paid dark:text-paid-bright mx-auto mb-1" />
                  كل البضاعة في المخزن متوفرة ومظبوطة
                </div>
              )}
            </div>
          </div>

          {/* Top Debtors List */}
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-ink dark:text-ink-dark font-bold text-xs">
                <Users className="w-4 h-4 text-paid dark:text-paid-bright" />
                <span>أكتر زباين عليهم حساب (شكك)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => onNavigateSubTab ? onNavigateSubTab('customers') : setIsDebtorsModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-brand dark:bg-brand-bright dark:text-surface-dark hover:bg-brand-dark dark:hover:bg-emerald-400 text-white text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                  title="كشف حسابات وديون الزباين بالتفصيل"
                >
                  كشف الحسابات
                </button>
              </div>
            </div>

            <div className="p-3 divide-y divide-line dark:divide-line-dark max-h-[190px] overflow-y-auto">
              {summary && summary.topDebtors && summary.topDebtors.length > 0 ? (
                summary.topDebtors.map((d) => (
                  <div key={d.customerId} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-ink dark:text-ink-dark">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-mono">{d.customerPhone}</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-danger dark:text-danger-bright text-xs tabular-nums">
                      {(d.balancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-ink-muted dark:text-ink-dark-muted text-xs">
                  <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright mx-auto mb-1" />
                  مفيش أي زباين عليهم حسابات شكك حالياً
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
          void loadData();
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

      {/* Cash Drawer Expense Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onExpenseAdded={() => {
          void loadData();
        }}
      />

    </div>
  );
}
