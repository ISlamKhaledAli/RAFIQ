import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import {
  Users,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Printer,
  Clock,
  TrendingUp,
  TrendingDown,
  Phone,
  Search,
  CheckCircle2,
  AlertCircle,
  Award,
  Wallet
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
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
  onNavigateToCustomers?: () => void;
}

export const CustomerAnalyticsView: FC<CustomerAnalyticsViewProps> = ({
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
    void loadData();
  }, [loadData]);

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
      <div className="flex-1 flex flex-col h-full bg-canvas items-center justify-center select-none p-5" dir="rtl">
        <RafiqLoadingState
          label="جاري تجميع تحليلات العملاء والديون والآجل..."
          sublabel="فحص أرصدة الذمم، دورات السداد، وأعمار الديون من قاعدة البيانات"
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
            <div className="w-8 h-8 rounded-lg bg-warn-soft text-warn flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink">تحليلات العملاء والآجل والديون المستحقة</h1>
              <p className="text-xs text-ink-muted">
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
            onClick={() => void loadData()}
            disabled={isLoading}
            className="h-9 px-3 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink-muted hover:text-ink text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-warn' : ''}`} />
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

          {onNavigateToCustomers && (
            <button
              type="button"
              onClick={onNavigateToCustomers}
              className="h-9 px-3 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink-muted hover:text-ink text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="الانتقال إلى سجل وإدارة العملاء"
            >
              <Users className="w-3.5 h-3.5" />
              <span>إدارة العملاء</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Credit KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2.5 my-4 shrink-0">
        {/* KPI 1: Total Outstanding Debts */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">إجمالي ديون العملاء</span>
            <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded font-mono text-ink-muted">
              {creditOverview?.debtorsCount || 0} عملاء
            </span>
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-warn">
            {formatArabicCurrency(creditOverview?.totalOutstandingDebtsPiasters || 0)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            أموال المحل في السوق
          </div>
        </div>

        {/* KPI 2: Customer Advance Credits (تحت الحساب) */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">أرصدة عملاء (تحت الحساب)</span>
            <span className="text-[10px] bg-paid-soft text-paid-dark px-1.5 py-0.5 rounded font-mono font-bold">
              {creditOverview?.creditorsCount || 0} عملاء
            </span>
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-paid">
            {formatArabicCurrency(creditOverview?.totalCustomerCreditsPiasters || 0)}
          </div>
          <div className="text-[10px] text-paid-dark mt-1">
            أمانات زبائن سايبينها بالمحل
          </div>
        </div>

        {/* KPI 3: Net Market Exposure */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">صافي ذمة السوق للمحل</span>
            <Wallet className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-brand-dark">
            {formatArabicCurrency(creditOverview?.netMarketExposurePiasters ?? (creditOverview?.totalOutstandingDebtsPiasters || 0))}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            (ديون العملاء - أمانات الزبائن)
          </div>
        </div>

        {/* KPI 4: Repayments in Period */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">سدادات تم تحصيلها</span>
            <TrendingUp className="w-3.5 h-3.5 text-paid" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-paid">
            {formatArabicCurrency(creditOverview?.periodRepaymentsPiasters || 0)}
          </div>
          <div className="text-[10px] text-paid mt-1">
            سيولة دخلت الدرج خلال الفترة
          </div>
        </div>

        {/* KPI 5: New Credit Sales in Period */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">مبيعات آجلة جديدة</span>
            <TrendingDown className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink">
            {formatArabicCurrency(creditOverview?.periodNewCreditPiasters || 0)}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            فواتير خرجت بدون دفع فوري
          </div>
        </div>

        {/* KPI 6: Net Credit Flow */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">صافي حركة الآجل</span>
            <CreditCard className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums">
            {(creditOverview?.netCreditFlowPiasters || 0) <= 0 ? (
              <span className="text-paid">
                تقلصت {formatArabicCurrency(Math.abs(creditOverview?.netCreditFlowPiasters || 0))}
              </span>
            ) : (
              <span className="text-danger">
                زادت +{formatArabicCurrency(creditOverview?.netCreditFlowPiasters || 0)}
              </span>
            )}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            {(creditOverview?.netCreditFlowPiasters || 0) <= 0 ? 'مؤشر ممتاز (التحصيل أعلى)' : 'تنبيه: الديون تتراكم'}
          </div>
        </div>

        {/* KPI 7: Average Payback Time */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">متوسط دورة السداد</span>
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-ink">
            {creditOverview?.averagePaybackDays ? `${creditOverview.averagePaybackDays} يوم` : '—'}
          </div>
          <div className="text-[10px] text-ink-muted mt-1">
            سرعة وفاء العملاء بديونهم
          </div>
        </div>

        {/* KPI 8: Critical Debtors (>90 days) */}
        <div className="bg-surface border border-line rounded-xl p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-muted mb-1">
            <span className="text-[11px] font-semibold">ديون حرجة (&gt; 90 يوم)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-danger" />
          </div>
          <div className="text-base font-bold font-mono tabular-nums text-danger">
            {debtAging?.criticalDebtorsCount || 0} عملاء
          </div>
          <div className="text-[10px] text-danger mt-1">
            تتطلب اتصالاً ومطالبة فورية
          </div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-3 mb-4 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveSection('aging')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'aging'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>كشف أعمار الديون (Aging Report)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('debtors')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'debtors'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>كشف حسابات المدينين ({debtors.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('behavior')}
          className={`h-9 pr-2.5 pl-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs active:translate-y-0.5 ${
            activeSection === 'behavior'
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
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
              ? 'bg-brand-dark text-white border border-brand-dark shadow-xs'
              : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 border border-line hover:border-line-hover'
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
            <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
              <h2 className="text-sm font-bold text-ink mb-1">توزيع أعمار الديون (مخاطر التحصيل)</h2>
              <p className="text-xs text-ink-muted mb-4">
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
                          ? 'bg-danger-soft/40 border-danger/30'
                          : isWarning
                          ? 'bg-warn-soft/40 border-warn/30'
                          : isAttention
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-paid-soft/40 border-paid/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-ink">{tier.daysRange}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/70">
                            {tier.customerCount} عملاء
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-ink-muted mb-2">{tier.label}</div>
                        <div className="text-base font-bold font-mono">
                          {formatArabicCurrency(tier.totalDebtPiasters)}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[10px] font-mono text-ink-muted">
                        <span>نسبة من إجمالي الدين:</span>
                        <span className="font-bold">{tier.percentOfTotal}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aging Visual Bar */}
            <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
              <h3 className="text-xs font-bold text-ink mb-2">الشريط البياني لتوزيع المخاطر</h3>
              <div className="w-full h-3.5 bg-surface-2 rounded-full overflow-hidden flex">
                {debtAging?.tiers.map((tier) => {
                  const colors: Record<string, string> = {
                    normal: 'bg-paid',
                    attention: 'bg-amber-400',
                    warning: 'bg-warn',
                    critical: 'bg-danger',
                  };
                  return (
                    <div
                      key={tier.label}
                      title={`${tier.label}: ${tier.percentOfTotal}%`}
                      className={`h-full ${colors[tier.severity] || 'bg-brand'}`}
                      style={{ width: `${tier.percentOfTotal}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] text-ink-muted">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-paid" />
                  <span>طبيعي (&lt; 7 أيام)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>متابعة (8 - 30 يوم)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warn" />
                  <span>متأخر (31 - 90 يوم)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger" />
                  <span>حرجة (&gt; 90 يوم)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION B: Debtors Roster Table */}
        {activeSection === 'debtors' && (
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink">كشف تفصيلي لحسابات العملاء المدينين</h2>
                <p className="text-xs text-ink-muted">
                  قائمة مرتبة بأعلى الذمم المستحقة مع رقم الهاتف وحد الائتمان وتاريخ آخر حركة
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-56">
                  <Search className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="بحث باسم العميل أو الهاتف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-8 pr-8 pl-3 bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                    <th className="py-2.5 px-3">اسم العميل</th>
                    <th className="py-2.5 px-3">رقم الهاتف</th>
                    <th className="py-2.5 px-3">رصيد الدين المستحق</th>
                    <th className="py-2.5 px-3">الحد الائتماني</th>
                    <th className="py-2.5 px-3">نسبة استهلاك السقف</th>
                    <th className="py-2.5 px-3">تاريخ آخر معاملة</th>
                    <th className="py-2.5 px-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredDebtors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted">
                        لا يوجد عملاء مدينون مطابقون للبحث
                      </td>
                    </tr>
                  ) : (
                    filteredDebtors.map((d) => {
                      const limit = d.creditLimitPiasters || 0;
                      const usagePct = limit > 0 ? Math.round((d.balancePiasters * 100) / limit) : 0;
                      const isOverLimit = limit > 0 && d.balancePiasters >= limit;

                      return (
                        <tr key={d.customerId} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-ink">{d.name}</td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted flex items-center gap-1">
                            {d.phone ? (
                              <>
                                <Phone className="w-3 h-3 text-ink-muted" />
                                <span>{d.phone}</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-warn text-sm">
                            {formatArabicCurrency(d.balancePiasters)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-ink-muted">
                            {limit > 0 ? formatArabicCurrency(limit) : 'غير محدد'}
                          </td>
                          <td className="py-2.5 px-3">
                            {limit > 0 ? (
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                                isOverLimit
                                  ? 'bg-danger-soft text-danger'
                                  : usagePct >= 75
                                  ? 'bg-warn-soft text-warn'
                                  : 'bg-surface-2 text-ink-muted'
                              }`}>
                                {usagePct}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-ink-muted">
                            {d.lastTransactionDate || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted max-w-[150px] truncate" title={d.notes}>
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
              <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
                <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-paid" />
                  <span>أكثر العملاء شراءً (Top Buyers)</span>
                </h2>
                <p className="text-xs text-ink-muted mb-3">
                  العملاء الأعلى في إجمالي قيمة المشتريات خلال الفترة
                </p>

                <div className="space-y-2">
                  {(!behavior?.topBuyingCustomers || behavior.topBuyingCustomers.length === 0) ? (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      لا توجد بيانات مشتريات عملاء مسجلة
                    </div>
                  ) : (
                    behavior.topBuyingCustomers.map((c, idx) => (
                      <div key={c.customerId} className="p-2.5 rounded-lg bg-surface-2/60 border border-line/60 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-brand-soft text-brand-dark font-mono text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-ink">{c.customerName}</div>
                            <div className="font-mono text-[10px] text-ink-muted">{c.invoicesCount} فواتير</div>
                          </div>
                        </div>
                        <div className="font-mono font-bold text-xs text-paid">
                          {formatArabicCurrency(c.totalAmountPiasters)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top Payers */}
              <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
                <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-brand" />
                  <span>أكثر العملاء التزاماً بالسداد (Top Payers)</span>
                </h2>
                <p className="text-xs text-ink-muted mb-3">
                  العملاء الأكثر وفاءً والتزاماً بتسديد ديونهم ومستحقاتهم
                </p>

                <div className="space-y-2">
                  {(!behavior?.topPayingCustomers || behavior.topPayingCustomers.length === 0) ? (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      لا توجد بيانات سدادات عملاء مسجلة
                    </div>
                  ) : (
                    behavior.topPayingCustomers.map((c, idx) => (
                      <div key={c.customerId} className="p-2.5 rounded-lg bg-surface-2/60 border border-line/60 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-paid-soft text-paid font-mono text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-ink">{c.customerName}</div>
                            <div className="font-mono text-[10px] text-ink-muted">{c.invoicesCount} عمليات سداد</div>
                          </div>
                        </div>
                        <div className="font-mono font-bold text-xs text-brand-dark">
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
              <div className="bg-surface border border-danger/30 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center gap-2 text-danger mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <h3 className="text-xs font-bold">عملاء مدينون لم يترددوا على المحل منذ أكثر من 60 يوماً</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {behavior.inactiveDebtors.map((c) => (
                    <div key={c.customerId} className="p-2.5 bg-danger-soft/30 rounded-lg border border-danger/20 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-ink">{c.customerName}</div>
                        <div className="font-mono text-[10px] text-ink-muted">{c.phone || 'بدون هاتف'}</div>
                      </div>
                      <div className="font-mono font-bold text-danger">
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
          <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-ink">سجل حركات السداد النقدية</h2>
                <p className="text-xs text-ink-muted">
                  قيد يومي زمني لجميع دفعات السداد المستلمة من العملاء مع الرصيد قبل وبعد كل دفعة
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-1 bg-surface-2 rounded border border-line text-ink-muted">
                {paymentHistory.length} حركات
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-surface-2 border-y border-line text-ink-muted font-bold">
                    <th className="py-2.5 px-3">تاريخ ووقت السداد</th>
                    <th className="py-2.5 px-3">اسم العميل</th>
                    <th className="py-2.5 px-3">المبلغ المسدد</th>
                    <th className="py-2.5 px-3">الرصيد السابق</th>
                    <th className="py-2.5 px-3">الرصيد بعد السداد</th>
                    <th className="py-2.5 px-3">المستلم</th>
                    <th className="py-2.5 px-3">ملاحظات السند</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted">
                        لا توجد حركات سداد مسجلة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    paymentHistory.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-ink-muted">{p.paymentDate}</td>
                        <td className="py-2.5 px-3 font-bold text-ink">{p.customerName}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-paid text-sm">
                          {formatArabicCurrency(p.amountPiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted">
                          {formatArabicCurrency(p.previousBalancePiasters)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink">
                          {formatArabicCurrency(p.newBalancePiasters)}
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted">{p.cashierName || 'المدير'}</td>
                        <td className="py-2.5 px-3 text-ink-muted max-w-[180px] truncate" title={p.notes}>
                          {p.notes || '—'}
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
