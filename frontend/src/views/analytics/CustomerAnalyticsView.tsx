import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import {
  Users,
  AlertTriangle,
  Printer,
  Clock,
  TrendingUp,
  TrendingDown,
  Phone,
  Search,
  CheckCircle2,
  AlertCircle,
  Award,
  Wallet,
  Calendar,
  Scale,
  ArrowLeftRight
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import { CustomSelect } from '../../components/CustomSelect';
import type { SelectOption } from '../../components/CustomSelect';
import { CustomDateRangePicker } from '../../components/CustomDatePicker';
import { formatArabicCurrency } from '../../utils/money';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import type {
  CreditOverviewReport,
  DebtAgingReport,
  DebtorReportItem,
  CustomerBehaviorReport,
  PaymentHistoryRecord
} from '../../types/models';

const PERIOD_OPTIONS: SelectOption[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر (30 يوم)' },
  { value: '3months', label: 'آخر 3 أشهر' },
  { value: 'year', label: 'هذا العام' },
  { value: 'custom', label: 'فترة مخصصة...' },
];

interface CustomerAnalyticsViewProps {
  isActive?: boolean;
  onNavigateToCustomers?: () => void;
}

export const CustomerAnalyticsView: FC<CustomerAnalyticsViewProps> = ({
  isActive = true,
  onNavigateToCustomers
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
  const [creditOverview, setCreditOverview] = useState<CreditOverviewReport | null>(null);
  const [debtAging, setDebtAging] = useState<DebtAgingReport | null>(null);
  const [debtors, setDebtors] = useState<DebtorReportItem[]>([]);
  const [behavior, setBehavior] = useState<CustomerBehaviorReport | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRecord[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSection, setActiveSection] = useState<'aging' | 'debtors' | 'behavior' | 'payments'>('aging');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = {
        period,
        fromDate: period === 'custom' ? customFrom : undefined,
        toDate: period === 'custom' ? customTo : undefined,
      };

      const [creditRes, agingRes, debtorsRes, behaviorRes, payRes] = await Promise.all([
        invoke<CreditOverviewReport>('reports:getCreditOverview', payload),
        invoke<DebtAgingReport>('reports:getDebtAging'),
        invoke<DebtorReportItem[]>('reports:getDebtors'),
        invoke<CustomerBehaviorReport>('reports:getCustomerBehavior', payload),
        invoke<PaymentHistoryRecord[]>('reports:getPaymentHistory', payload),
      ]);

      setCreditOverview(creditRes);
      setDebtAging(agingRes);
      setDebtors(debtorsRes || []);
      setBehavior(behaviorRes);
      setPaymentHistory(payRes || []);
    } catch (err) {
      console.error('Failed to load customer analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (isActive) {
      void loadData();
    }
  }, [isActive, loadData]);

  useDataSubscription(['customers', 'sales', 'dashboard', 'all'], () => {
    void loadData();
  });

  // Filtered debtors list
  const filteredDebtors = debtors.filter((d) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.phone && d.phone.includes(q));
  });

  const handlePrint = () => {
    window.print();
  };

  if (showLoading && !creditOverview) {
    return (
      <div className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark items-center justify-center select-none p-5" dir="rtl">
        <RafiqLoadingState
          label="جاري تجميع تحليلات العملاء والديون والآجل..."
          sublabel="فحص أرصدة الذمم، دورات السداد، وأعمار الديون من قاعدة البيانات"
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
            <div className="w-8 h-8 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink dark:text-ink-dark">تحليلات العملاء والآجل والديون المستحقة</h1>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
                متابعة حركة الذمم والديون، أعمار الديون المتعثرة، معدل تحصيل السدادات، وأفضل الزبائن
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
            className="h-9 px-3 rounded-lg bg-brand-dark dark:bg-brand hover:bg-brand dark:hover:bg-brand-bright text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="طباعة التقرير"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة التقرير</span>
          </button>

          {onNavigateToCustomers && (
            <button
              type="button"
              onClick={onNavigateToCustomers}
              className="h-9 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="الانتقال إلى سجل وإدارة العملاء"
            >
              <Users className="w-3.5 h-3.5" />
              <span>إدارة العملاء</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top All-Time Credit KPIs (كروت الرصيد التراكمي الشامل لكافة العملاء) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-4 shrink-0">
        {/* KPI 1: Total Debts */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-warn dark:hover:border-warn-bright hover:shadow-xs transition-all duration-200 flex flex-col justify-between min-h-[118px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">إجمالي ديون العملاء</span>
              <div className="w-7 h-7 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 flex items-center justify-center shadow-2xs">
                <Users className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-warn dark:text-warn-bright tabular-nums leading-none">
                {((creditOverview?.totalOutstandingDebtsPiasters || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted-dark">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-muted-dark">
            <span>أموال المحل في السوق</span>
            <span className="bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold font-mono px-1.5 py-0.5 rounded-md border border-warn/20 dark:border-warn-bright/30 text-[10px]">
              {creditOverview?.debtorsCount || 0} عملاء
            </span>
          </div>
        </div>

        {/* KPI 2: Customer Advance Credits */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-paid dark:hover:border-paid-bright hover:shadow-xs transition-all duration-200 flex flex-col justify-between min-h-[118px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">أرصدة عملاء (تحت الحساب)</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/20 flex items-center justify-center shadow-2xs">
                <Wallet className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-paid dark:text-paid-bright tabular-nums leading-none">
                {((creditOverview?.totalCustomerCreditsPiasters || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted-dark">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-muted-dark">
            <span>أمانات زبائن سايبينها بالمحل</span>
            <span className="bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-bold font-mono px-1.5 py-0.5 rounded-md border border-paid/20 dark:border-paid-bright/20 text-[10px]">
              {creditOverview?.creditorsCount || 0} عملاء
            </span>
          </div>
        </div>

        {/* KPI 3: Net Market Exposure */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-brand dark:hover:border-brand-bright hover:shadow-xs transition-all duration-200 flex flex-col justify-between min-h-[118px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">صافي ذمة السوق للمحل</span>
              <div className="w-7 h-7 rounded-lg bg-surface-2 dark:bg-surface-dark-2 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center shadow-2xs">
                <Scale className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums leading-none">
                {(((creditOverview?.netMarketExposurePiasters ?? (creditOverview?.totalOutstandingDebtsPiasters || 0))) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted-dark">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-muted-dark">
            <span>الديون ناقص الأمانات</span>
            <span className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark font-bold px-1.5 py-0.5 rounded-md border border-line dark:border-line-dark text-[10px]">
              صافي السوق
            </span>
          </div>
        </div>

        {/* KPI 4: Critical Debts */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 shadow-2xs hover:border-danger dark:hover:border-danger-bright hover:shadow-xs transition-all duration-200 flex flex-col justify-between min-h-[118px]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">ديون حرجة (+90 يوم)</span>
              <div className="w-7 h-7 rounded-lg bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30 flex items-center justify-center shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tabular-nums leading-none ${
                (debtAging?.criticalDebtorsCount || 0) > 0 ? 'text-danger dark:text-danger-bright' : 'text-ink dark:text-ink-dark'
              }`}>
                {debtAging?.criticalDebtorsCount || 0}
              </span>
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted-dark">عملاء</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-muted-dark">
            <span>تتطلب اتصالاً ومطالبة فورية</span>
            <span className={`font-bold font-mono px-1.5 py-0.5 rounded-md border text-[10px] ${
              (debtAging?.criticalDebtorsCount || 0) > 0
                ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30'
                : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid-bright/20'
            }`}>
              {(debtAging?.criticalDebtorsCount || 0) > 0 ? 'انتباه عاجل' : 'حالة ممتازة'}
            </span>
          </div>
        </div>
      </div>

        {/* TIER 2: Period Flow & Reconciliation (حركة الشكك والتحصيل خلال الفترة) */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-paid dark:text-paid-bright" />
              <span className="text-xs font-bold text-ink dark:text-ink-dark">
                حركة الشكك والتحصيل ({PERIOD_OPTIONS.find(p => p.value === period)?.label || 'الفترة المحددة'})
              </span>
            </div>
            <span className="text-[10px] bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-medium px-2 py-0.5 rounded-full border border-paid/20 dark:border-paid-bright/20">
              ملخص حركة الفترة
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Flow 1: Opening Debt */}
            <div className="bg-surface dark:bg-surface-dark border border-line/80 dark:border-line-dark/80 rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-line dark:hover:border-line-dark transition-all flex flex-col justify-between">
              <div className="text-[11px] font-semibold text-ink-muted dark:text-ink-muted-dark mb-1">رصيد أول الفترة</div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-ink dark:text-ink-dark">
                {formatArabicCurrency(creditOverview?.periodOpeningDebtsPiasters ?? (creditOverview?.totalOutstandingDebtsPiasters || 0))}
              </div>
              <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark mt-1.5 pt-1.5 border-t border-line/50 dark:border-line-dark/50">ديون العملاء في البداية</div>
            </div>

            {/* Flow 2: New Credit Sales */}
            <div className="bg-surface dark:bg-surface-dark border border-line/80 dark:border-line-dark/80 rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-warn/30 dark:hover:border-warn-bright/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted dark:text-ink-muted-dark mb-1">
                <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">شكك جديد</span>
                <TrendingDown className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
              </div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-warn dark:text-warn-bright">
                {formatArabicCurrency(creditOverview?.periodNewCreditPiasters || 0)}
              </div>
              <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark mt-1.5 pt-1.5 border-t border-line/50 dark:border-line-dark/50">بضاعة طلعت على الحساب</div>
            </div>

            {/* Flow 3: Period Repayments */}
            <div className="bg-surface dark:bg-surface-dark border border-line/80 dark:border-line-dark/80 rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-paid/30 dark:hover:border-paid-bright/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted dark:text-ink-muted-dark mb-1">
                <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">سدادات اتحصلت</span>
                <TrendingUp className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
              </div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-paid dark:text-paid-bright">
                {formatArabicCurrency(creditOverview?.periodRepaymentsPiasters || 0)}
              </div>
              <div className="text-[10px] text-paid dark:text-paid-bright mt-1.5 pt-1.5 border-t border-line/50 dark:border-line-dark/50">فلوس شكك دخلت الدرج</div>
            </div>

            {/* Flow 4: Net Flow Delta */}
            <div className="bg-surface dark:bg-surface-dark border border-line/80 dark:border-line-dark/80 rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-brand/30 dark:hover:border-brand-bright/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted dark:text-ink-muted-dark mb-1">
                <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">حركة الديون</span>
                <ArrowLeftRight className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
              </div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums">
                {(creditOverview?.netCreditFlowPiasters || 0) <= 0 ? (
                  <span className="text-paid dark:text-paid-bright">
                    نزلت {formatArabicCurrency(Math.abs(creditOverview?.netCreditFlowPiasters || 0))}
                  </span>
                ) : (
                  <span className="text-danger dark:text-danger-bright">
                    زادت {formatArabicCurrency(creditOverview?.netCreditFlowPiasters || 0)}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark mt-1.5 pt-1.5 border-t border-line/50 dark:border-line-dark/50">
                {(creditOverview?.netCreditFlowPiasters || 0) <= 0 ? 'حصّلت أكتر ما طلعت شكك (ممتاز)' : 'طلعت شكك أكتر ما حصّلت'}
              </div>
            </div>

            {/* Flow 5: Closing Debt */}
            <div className="bg-surface dark:bg-surface-dark border border-line/80 dark:border-line-dark/80 rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-brand/30 dark:hover:border-brand-bright/30 transition-all flex flex-col justify-between">
              <div className="text-[11px] font-semibold text-ink-muted dark:text-ink-muted-dark mb-1">شكك آخر الفترة</div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-brand-dark dark:text-brand-bright">
                {formatArabicCurrency(creditOverview?.periodClosingDebtsPiasters ?? (creditOverview?.totalOutstandingDebtsPiasters || 0))}
              </div>
              <div className="text-[10px] text-brand-dark dark:text-brand-bright mt-1.5 pt-1.5 border-t border-line/50 dark:border-line-dark/50">إجمالي الشكك اللي برة دلوقتي</div>
            </div>

            {/* Flow 6: Actual Payback Duration */}
            <div className="bg-surface dark:bg-surface-dark border border-line/80 dark:border-line-dark/80 rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-line dark:hover:border-line-dark transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted dark:text-ink-muted-dark mb-1">
                <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">متوسط وقت السداد</span>
                <Clock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark" />
              </div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-ink dark:text-ink-dark">
                {(creditOverview?.averagePaybackDays && creditOverview.averagePaybackDays > 0)
                  ? `${creditOverview.averagePaybackDays} يوم`
                  : 'مفيش سدادات كافية'}
              </div>
              <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark mt-1.5 pt-1.5 border-t border-line/50 dark:border-line-dark/50">الزبون بياخد أد إيه على ما يسدد</div>
            </div>
          </div>
        </div>

      {/* 3. Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line dark:border-line-dark pb-3 mb-4 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveSection('aging')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'aging'
              ? 'bg-brand-dark dark:bg-brand text-white border border-brand-dark dark:border-brand shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>كشف أعمار الديون</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('debtors')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'debtors'
              ? 'bg-brand-dark dark:bg-brand text-white border border-brand-dark dark:border-brand shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>كشف حسابات المدينين</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('behavior')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'behavior'
              ? 'bg-brand-dark dark:bg-brand text-white border border-brand-dark dark:border-brand shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
          }`}
        >
          <Award className="w-4 h-4 shrink-0" />
          <span>سلوك العملاء وأفضل الزبائن</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('payments')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'payments'
              ? 'bg-brand-dark dark:bg-brand text-white border border-brand-dark dark:border-brand shadow-xs'
              : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark'
          }`}
        >
          <Wallet className="w-4 h-4 shrink-0" />
          <span>سجل حركة السدادات اليومية</span>
        </button>
      </div>

      {/* 4. Dynamic Tab Content */}
      <div className="flex-1 pb-6">
        {/* SECTION A: Debt Aging Analysis */}
        {activeSection === 'aging' && (
          <div className="space-y-4">
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
              <h2 className="text-sm font-bold text-ink dark:text-ink-dark mb-1">توزيع أعمار الديون (مخاطر التحصيل)</h2>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark mb-4">
                تصنيف الديون حسب الفترة الزمنية منذ آخر عملية لاكتشاف المبالغ المعرضة للتعثر
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {debtAging?.tiers.map((tier) => {
                  const isCritical = tier.severity === 'critical';
                  const isWarning = tier.severity === 'warning';
                  const isAttention = tier.severity === 'attention';

                  return (
                    <div
                      key={tier.label}
                      className={`p-3 rounded-xl border flex flex-col justify-between ${
                        isCritical
                          ? 'bg-danger-soft/40 dark:bg-danger-dark-soft/40 border-danger/30 dark:border-danger-bright/30'
                          : isWarning
                          ? 'bg-warn-soft/40 dark:bg-warn-dark-soft/40 border-warn/30 dark:border-warn-bright/30'
                          : isAttention
                          ? 'bg-warn-soft/30 dark:bg-warn-dark-soft/30 border-warn/20 dark:border-warn-bright/20'
                          : 'bg-paid-soft/40 dark:bg-paid-dark-soft/40 border-paid/30 dark:border-paid-bright/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-ink dark:text-ink-dark">{tier.daysRange}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/70 dark:bg-surface-dark/80 text-ink dark:text-ink-dark">
                            {tier.customerCount} عملاء
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark mb-2">{tier.label}</div>
                        <div className="text-base font-bold font-mono text-ink dark:text-ink-dark">
                          {formatArabicCurrency(tier.totalDebtPiasters)}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] font-mono text-ink-muted dark:text-ink-muted-dark">
                        <span>نسبة من إجمالي الدين:</span>
                        <span className="font-bold text-ink dark:text-ink-dark">{tier.percentOfTotal}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aging Visual Bar */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
              <h3 className="text-xs font-bold text-ink dark:text-ink-dark mb-2">الشريط البياني لتوزيع المخاطر</h3>
              <div className="w-full h-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-full overflow-hidden flex">
                {debtAging?.tiers.map((tier) => {
                  const colors: Record<string, string> = {
                    normal: 'bg-paid dark:bg-paid-bright',
                    attention: 'bg-warn-bright dark:bg-warn-bright',
                    warning: 'bg-warn dark:bg-warn-bright',
                    critical: 'bg-danger dark:bg-danger-bright',
                  };
                  return (
                    <div
                      key={tier.label}
                      title={`${tier.label}: ${tier.percentOfTotal}%`}
                      className={`h-full ${colors[tier.severity] || 'bg-brand dark:bg-brand-bright'}`}
                      style={{ width: `${tier.percentOfTotal}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] text-ink-muted dark:text-ink-muted-dark">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-paid dark:bg-paid-bright" />
                  <span>طبيعي (&lt; 7 أيام)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warn-bright dark:bg-warn-bright" />
                  <span>متابعة (8 - 30 يوم)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warn dark:bg-warn-bright" />
                  <span>متأخر (31 - 90 يوم)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger dark:bg-danger-bright" />
                  <span>حرجة (&gt; 90 يوم)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION B: Debtors Roster Table */}
        {activeSection === 'debtors' && (
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark">كشف تفصيلي لحسابات العملاء المدينين</h2>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
                  قائمة مرتبة بأعلى الذمم المستحقة مع رقم الهاتف وحد الائتمان وتاريخ آخر حركة
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-56">
                  <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="بحث باسم العميل أو الهاتف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-8 pr-8 pl-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-muted-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark font-bold">
                    <th className="py-2.5 px-3">اسم العميل</th>
                    <th className="py-2.5 px-3">رقم الهاتف</th>
                    <th className="py-2.5 px-3">رصيد الدين المستحق</th>
                    <th className="py-2.5 px-3">الحد الائتماني</th>
                    <th className="py-2.5 px-3">نسبة استهلاك السقف</th>
                    <th className="py-2.5 px-3">تاريخ آخر معاملة</th>
                    <th className="py-2.5 px-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {filteredDebtors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted dark:text-ink-muted-dark">
                        لا يوجد عملاء مدينون مطابقون للبحث
                      </td>
                    </tr>
                  ) : (
                    filteredDebtors.map((d) => {
                      const limit = d.creditLimitPiasters || 0;
                      const usagePct = limit > 0 ? Math.round((d.balancePiasters * 100) / limit) : 0;
                      const isOverLimit = limit > 0 && d.balancePiasters >= limit;

                      return (
                        <tr key={d.customerId} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-ink dark:text-ink-dark">{d.name}</td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-muted-dark flex items-center gap-1">
                            {d.phone ? (
                              <>
                                <Phone className="w-3 h-3 text-ink-muted dark:text-ink-muted-dark" />
                                <span>{d.phone}</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-warn dark:text-warn-bright text-sm">
                            {formatArabicCurrency(d.balancePiasters)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-muted-dark">
                            {limit > 0 ? formatArabicCurrency(limit) : 'غير محدد'}
                          </td>
                          <td className="py-2.5 px-3">
                            {limit > 0 ? (
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                                isOverLimit
                                  ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'
                                  : usagePct >= 75
                                  ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright'
                                  : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark'
                              }`}>
                                {usagePct}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-ink-muted dark:text-ink-muted-dark">
                            {d.lastTransactionDate || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted dark:text-ink-muted-dark max-w-[150px] truncate" title={d.notes}>
                            {d.notes || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION C: Customer Behavior & Loyalty */}
        {activeSection === 'behavior' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Buyers */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark mb-1 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-paid dark:text-paid-bright" />
                  <span>أكثر العملاء شراءً (Top Buyers)</span>
                </h2>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark mb-3">
                  العملاء الأعلى في إجمالي قيمة المشتريات خلال الفترة
                </p>

                <div className="space-y-2">
                  {(!behavior?.topBuyingCustomers || behavior.topBuyingCustomers.length === 0) ? (
                    <div className="py-6 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
                      لا توجد بيانات مشتريات عملاء مسجلة
                    </div>
                  ) : (
                    behavior.topBuyingCustomers.map((c, idx) => (
                      <div key={c.customerId} className="p-2.5 rounded-lg bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line/60 dark:border-line-dark/60 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright font-mono text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-ink dark:text-ink-dark">{c.customerName}</div>
                            <div className="font-mono text-[10px] text-ink-muted dark:text-ink-muted-dark">{c.invoicesCount} فواتير</div>
                          </div>
                        </div>
                        <div className="font-mono font-bold text-xs text-paid dark:text-paid-bright">
                          {formatArabicCurrency(c.totalAmountPiasters)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top Payers */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>أكثر العملاء التزاماً بالسداد (Top Payers)</span>
                </h2>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark mb-3">
                  العملاء الأكثر وفاءً والتزاماً بتسديد ديونهم ومستحقاتهم
                </p>

                <div className="space-y-2">
                  {(!behavior?.topPayingCustomers || behavior.topPayingCustomers.length === 0) ? (
                    <div className="py-6 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
                      لا توجد بيانات سدادات عملاء مسجلة
                    </div>
                  ) : (
                    behavior.topPayingCustomers.map((c, idx) => (
                      <div key={c.customerId} className="p-2.5 rounded-lg bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line/60 dark:border-line-dark/60 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-mono text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-ink dark:text-ink-dark">{c.customerName}</div>
                            <div className="font-mono text-[10px] text-ink-muted dark:text-ink-muted-dark">{c.invoicesCount} عمليات سداد</div>
                          </div>
                        </div>
                        <div className="font-mono font-bold text-xs text-brand-dark dark:text-brand-bright">
                          {formatArabicCurrency(c.totalAmountPiasters)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Inactive Debtors Warning */}
            {behavior?.inactiveDebtors && behavior.inactiveDebtors.length > 0 && (
              <div className="bg-surface dark:bg-surface-dark border border-danger/30 dark:border-danger-bright/30 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center gap-2 text-danger dark:text-danger-bright mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <h3 className="text-xs font-bold">عملاء مدينون لم يترددوا على المحل منذ أكثر من 60 يوماً</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {behavior.inactiveDebtors.map((c) => (
                    <div key={c.customerId} className="p-2.5 bg-danger-soft/30 dark:bg-danger-dark-soft/30 rounded-lg border border-danger/20 dark:border-danger-bright/20 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-ink dark:text-ink-dark">{c.customerName}</div>
                        <div className="font-mono text-[10px] text-ink-muted dark:text-ink-muted-dark">{c.phone || 'بدون هاتف'}</div>
                      </div>
                      <div className="font-mono font-bold text-danger dark:text-danger-bright">
                        {formatArabicCurrency(c.balancePiasters)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION D: Payment History Journal */}
        {activeSection === 'payments' && (
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark">سجل حركات السداد النقدية</h2>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
                  قيد يومي زمني لجميع دفعات السداد المستلمة من العملاء مع الرصيد قبل وبعد كل دفعة
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-1 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark">
                {paymentHistory.length} حركات
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-y border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark font-bold">
                    <th className="py-2.5 px-3">تاريخ ووقت الحركة</th>
                    <th className="py-2.5 px-3">اسم العميل</th>
                    <th className="py-2.5 px-3">نوع الحركة</th>
                    <th className="py-2.5 px-3">المبلغ</th>
                    <th className="py-2.5 px-3">الرصيد السابق</th>
                    <th className="py-2.5 px-3">الرصيد بعد الحركة</th>
                    <th className="py-2.5 px-3">المستلم</th>
                    <th className="py-2.5 px-3">ملاحظات السند</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-ink-muted dark:text-ink-muted-dark">
                        لا توجد حركات سداد مسجلة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    paymentHistory.map((p) => {
                      const isCancel = p.type === 'payment_cancel';
                      const isDeposit = p.type === 'deposit';

                      return (
                        <tr key={p.id} className={`transition-colors ${isCancel ? 'bg-danger-soft/40 dark:bg-danger-dark-soft/40 hover:bg-danger-soft/60 dark:hover:bg-danger-dark-soft/60' : 'hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60'}`}>
                          <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-muted-dark text-[11px]">
                            {new Date(p.paymentDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-ink dark:text-ink-dark">{p.customerName}</td>
                          <td className="py-2.5 px-3">
                            {isCancel ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/30 dark:border-danger-bright/30">
                                إلغاء سداد (قيد معاكس)
                              </span>
                            ) : isDeposit ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20">
                                تحت الحساب (فاتورة)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/20">
                                سداد نقدي مباشر
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-sm">
                            {isCancel ? (
                              <span className="text-danger dark:text-danger-bright line-through">
                                -{formatArabicCurrency(p.amountPiasters)}
                              </span>
                            ) : isDeposit ? (
                              <span className="text-brand dark:text-brand-bright">
                                +{formatArabicCurrency(p.amountPiasters)}
                              </span>
                            ) : (
                              <span className="text-paid dark:text-paid-bright">
                                +{formatArabicCurrency(p.amountPiasters)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-muted-dark tabular-nums">
                            {formatArabicCurrency(p.previousBalancePiasters)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-ink dark:text-ink-dark tabular-nums">
                            {formatArabicCurrency(p.newBalancePiasters)}
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted dark:text-ink-muted-dark">{p.cashierName || 'المدير'}</td>
                          <td className="py-2.5 px-3 text-ink-muted dark:text-ink-muted-dark max-w-[200px] truncate" title={p.notes}>
                            {p.notes || '—'}
                          </td>
                        </tr>
                      );
                    })
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
