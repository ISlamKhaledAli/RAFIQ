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
  Receipt,
  HeartPulse,
  Banknote,
  CreditCard,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import type { DashboardSummary, UnclosedDayAlert, BatchSummary, HourlyIntensityReport } from '../types/models';
import type { PatientDueAlert } from '../types/patient';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';
import { DailyClosingModal } from '../components/DailyClosingModal';
import { LowStockReportModal } from '../components/LowStockReportModal';
import { DebtorsReportModal } from '../components/DebtorsReportModal';
import { ExpenseModal } from '../components/ExpenseModal';
import { DuePatientsModal } from '../components/DuePatientsModal';
import { PatientProfileModal } from './customers/PatientProfileModal';
import { formatArabicCurrency } from '../utils/money';
import { formatPhoneDisplay } from '../utils/phoneFormat';
import { RafiqLoadingState } from '../components/RafiqLoadingState';
import { useSmoothLoading } from '../utils/useSmoothLoading';



import { AppButton } from '../components/AppButton';
import { ClickableCard, ClickableChevron, ClickableHint } from '../components/ClickableCard';
import { useNavAccess } from '../hooks/useNavAccess';
const MONEY_2DP: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

type PaymentTone = 'paid' | 'warn' | 'brand';

const PAYMENT_CHIP_CLASSES: Record<PaymentTone, string> = {
  paid: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/40',
  warn: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30',
  brand: 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30',
};

interface PaymentTile {
  key: string;
  label: string;
  amount: number;
  tone: PaymentTone;
  icon: LucideIcon;
  title: string;
}

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
  const { hasPermission } = useAuth();
  const canSeeSales = hasPermission('reports.sales');
  const canCloseDay = hasPermission('reports.daily_closing');
  const canSeeStock = hasPermission('stock.view');
  const canSeePatients = hasPermission('patients.view');
  const canCreateExpense = hasPermission('expenses.create');
  const navAccess = useNavAccess();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [unclosedAlert, setUnclosedAlert] = useState<UnclosedDayAlert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const showLoading = useSmoothLoading(isLoading, 300);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyIntensityReport | null>(null);

  // Milestone 9 Modals State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingTargetDate, setClosingTargetDate] = useState<string | undefined>(undefined);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [isDebtorsModalOpen, setIsDebtorsModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Story 133 / Feature #190: Chronic Patient Due Alerts State
  const [duePatientAlerts, setDuePatientAlerts] = useState<PatientDueAlert[]>([]);
  const [isDueModalOpen, setIsDueModalOpen] = useState(false);
  const [selectedPatientForModal, setSelectedPatientForModal] = useState<{ id: string; name: string; phone?: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sumData, unclosedData, batchData, hrData, dueData] = await Promise.all([
        canSeeSales ? invoke<DashboardSummary>('reports:getTodaySummary') : Promise.resolve(null),
        canCloseDay ? invoke<UnclosedDayAlert>('closing:checkPreviousDay') : Promise.resolve(null),
        isEnabled('feature_expiry_dates') && canSeeStock
          ? invoke<BatchSummary>('batch:summary').catch(() => null)
          : Promise.resolve(null),
        canSeeSales
          ? invoke<HourlyIntensityReport>('reports:getHourlyIntensity', { period: 'today' }).catch(() => null)
          : Promise.resolve(null),
        isEnabled('feature_patient_profiles') && canSeePatients
          ? invoke<PatientDueAlert[]>('patients:getDueAlerts', { daysAhead: 3 }).catch(() => [])
          : Promise.resolve([])
      ]);
      if (sumData) setSummary(sumData);
      if (unclosedData) setUnclosedAlert(unclosedData);
      if (batchData) setBatchSummary(batchData);
      if (hrData) setHourlyData(hrData);
      if (dueData) setDuePatientAlerts(dueData);
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  }, [isEnabled, canSeeSales, canCloseDay, canSeeStock, canSeePatients]);

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

  const todayOutPiasters = summary ? ((summary.todayExpensesPiasters || 0) + (summary.todayReturnsPiasters || 0)) : 0;
  const todayDebtPaymentsPiasters = summary ? (summary.todayDebtPaymentsPiasters || 0) : 0;
  const openingFloatPiasters = summary?.openingFloatPiasters || 0;
  const netWalletsPiasters = (summary?.walletsDrawerNetPiasters || 0) - (summary?.walletFundingPiasters || 0);
  const netEpayPiasters = (summary?.epayDrawerNetPiasters || 0) - (summary?.terminalFundingPiasters || 0);
  const purchasesSuppliersPiasters = (summary?.purchasesDrawerCashPiasters || 0) + (summary?.supplierPaymentsDrawerCashPiasters || 0);
  const manualNetPiasters = summary?.manualNetCashInOutPiasters || 0;

  const drawerRows = useMemo(() => {
    const rows: { key: string; label: string; hint: string; text: string; cls: string }[] = [];

    // 1. عهدة بداية اليوم الافتتاحية
    if (openingFloatPiasters > 0) {
      rows.push({
        key: 'opening-float',
        label: 'عهدة بداية اليوم',
        hint: 'رصيد الفكة الافتتاحي المستلم بالدرج',
        text: `+${(openingFloatPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
        cls: 'text-brand dark:text-brand-bright',
      });
    }

    // 2. مبيعات كاش محصلة
    rows.push({
      key: 'cash-sales',
      label: 'مبيعات كاش',
      hint: 'مبيعات كاش محصلة في الدرج',
      text: todayCashAmount.toLocaleString('en-US', MONEY_2DP),
      cls: 'text-paid dark:text-paid-bright',
    });

    // 3. سداد شكك
    if (todayDebtPaymentsPiasters > 0 || rows.length <= 2) {
      rows.push({
        key: 'debt-payments',
        label: 'سداد شكك',
        hint: 'تحصيل وسداد فواتير شكك سابقة',
        text: `${todayDebtPaymentsPiasters > 0 ? '+' : ''}${(todayDebtPaymentsPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
        cls: 'text-paid dark:text-paid-bright',
      });
    }

    // 4. مصاريف ومرتجعات
    if (todayOutPiasters > 0 || rows.length <= 3) {
      rows.push({
        key: 'expenses-returns',
        label: 'مصاريف ومرتجعات',
        hint: 'مصاريف ونثريات ومرتجعات خرجت من الدرج',
        text: `${todayOutPiasters > 0 ? '-' : ''}${(todayOutPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
        cls: 'text-danger dark:text-danger-bright',
      });
    }

    // 5. حركات المحافظ وإنستاباي من الدرج
    if (netWalletsPiasters !== 0) {
      if (netWalletsPiasters < 0) {
        rows.push({
          key: 'wallets-drawer-out',
          label: 'سحب كاش لمحافظ وإنستاباي',
          hint: 'نقدية سُلمت لعملاء مقابل تحويل إلكتروني أو تغذية محفظة',
          text: `-${(Math.abs(netWalletsPiasters) / 100).toLocaleString('en-US', MONEY_2DP)}`,
          cls: 'text-danger dark:text-danger-bright',
        });
      } else {
        rows.push({
          key: 'wallets-drawer-in',
          label: 'إيداع كاش من محافظ وإنستاباي',
          hint: 'نقدية استلمت بالدرج مقابل سحب إلكتروني',
          text: `+${(netWalletsPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
          cls: 'text-paid dark:text-paid-bright',
        });
      }
    }

    // 6. ماكينات الدفع والخدمات الإلكترونية بالدرج
    if (netEpayPiasters !== 0) {
      if (netEpayPiasters < 0) {
        rows.push({
          key: 'epay-drawer-out',
          label: 'تغذية ماكينة دفع وخدمات',
          hint: 'نقدية سُحبت من الدرج لتغذية الماكينة أو صرف كاش',
          text: `-${(Math.abs(netEpayPiasters) / 100).toLocaleString('en-US', MONEY_2DP)}`,
          cls: 'text-danger dark:text-danger-bright',
        });
      } else {
        rows.push({
          key: 'epay-drawer-in',
          label: 'نقدية ماكينة دفع وخدمات بالدرج',
          hint: 'تحصيلات خدمات وماكينات دخلت درج المحل',
          text: `+${(netEpayPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
          cls: 'text-paid dark:text-paid-bright',
        });
      }
    }

    // 7. مشتريات وسداد موردين نقداً من الدرج
    if (purchasesSuppliersPiasters > 0) {
      rows.push({
        key: 'purchases-suppliers-out',
        label: 'مشتريات وموردين من الدرج',
        hint: 'فواتير شراء ودفعات موردين دُفعت نقداً من الدرج',
        text: `-${(purchasesSuppliersPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
        cls: 'text-danger dark:text-danger-bright',
      });
    }

    // 8. توريد أو سحب يدوي بالدرج
    if (manualNetPiasters !== 0) {
      if (manualNetPiasters < 0) {
        rows.push({
          key: 'manual-cash-out',
          label: 'مسحوبات نقدية يدوية',
          hint: 'سحب نقدي مسجل من الدرج',
          text: `-${(Math.abs(manualNetPiasters) / 100).toLocaleString('en-US', MONEY_2DP)}`,
          cls: 'text-danger dark:text-danger-bright',
        });
      } else {
        rows.push({
          key: 'manual-cash-in',
          label: 'توريد نقدي إضافي',
          hint: 'إيداع سيولة يدوية بالدرج',
          text: `+${(manualNetPiasters / 100).toLocaleString('en-US', MONEY_2DP)}`,
          cls: 'text-paid dark:text-paid-bright',
        });
      }
    }

    return rows;
  }, [
    openingFloatPiasters,
    todayCashAmount,
    todayDebtPaymentsPiasters,
    todayOutPiasters,
    netWalletsPiasters,
    netEpayPiasters,
    purchasesSuppliersPiasters,
    manualNetPiasters,
  ]);
  const paymentTiles = useMemo(() => {
    const list: PaymentTile[] = [
      {
        key: 'cash',
        label: 'كاش',
        amount: todayCashAmount,
        tone: 'paid',
        icon: Banknote,
        title: 'مبيعات كاش محصلة في درج النقدية',
      },
    ];

    // شكك يظهر إذا كان هناك بيع آجل على الحساب لتطابق الحسابات
    if (todayCreditAmount > 0) {
      list.push({
        key: 'credit',
        label: 'شكك',
        amount: todayCreditAmount,
        tone: 'warn',
        icon: Users,
        title: 'مبيعات آجلة على الحساب (شكك ذمم عملاء)',
      });
    }

    // فيزا / بطاقة (إذا وُجد دفع ببطاقة بنكية)
    if (todayCardAmount > 0) {
      list.push({
        key: 'card',
        label: 'فيزا',
        amount: todayCardAmount,
        tone: 'brand',
        icon: CreditCard,
        title: 'مدفوعات بطاقة بنكية / فيزا',
      });
    }

    list.push(
      {
        key: 'instapay',
        label: 'انستاباي',
        amount: todayInstapayAmount,
        tone: 'brand',
        icon: Smartphone,
        title: 'تحويلات انستاباي',
      },
      {
        key: 'wallets',
        label: 'محافظ',
        amount: todayVodafoneCashAmount,
        tone: 'brand',
        icon: Wallet,
        title: 'محافظ إلكترونية (فودافون كاش وغيرها)',
      },
    );

    return list;
  }, [todayCashAmount, todayCreditAmount, todayCardAmount, todayInstapayAmount, todayVodafoneCashAmount]);

  // undefined = the user cannot reach that page, so the card renders plain instead of looking clickable
  const openLossReport = onNavigateSubTab
    ? () => onNavigateSubTab('inventory')
    : navAccess.products ? () => onNavigateToProducts('movements') : undefined;
  const openDebtsReport = onNavigateSubTab
    ? () => onNavigateSubTab('customers')
    : onNavigateToCustomers && navAccess.customers ? onNavigateToCustomers : undefined;
  const openLowStockProducts = navAccess.products ? () => onNavigateToProducts('catalog', 'lowStock') : undefined;

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
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark select-none overflow-y-auto p-5 sm:p-6 gap-5 font-sans text-ink dark:text-ink-dark" dir="rtl">
      
      {/* 1. TOP HEADER & COMMAND CENTER CONTROLS */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0 bg-surface dark:bg-surface-dark p-4 sm:p-5 rounded-xl border border-line dark:border-line-dark shadow-2xs">
        <div>
          <h2 className="t-page-title text-ink dark:text-ink-dark">لوحة تحكم اليوم والوردية</h2>
          <p className="text-sm text-ink-muted dark:text-ink-dark-muted mt-1">
            ملخص حركة الوردية النهاردة، كاش الدرج، وكل اللي بيحصل في المحل
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canCreateExpense && (
          <AppButton
            variant="dangerSoft"
            icon={Receipt}
            onClick={() => setIsExpenseModalOpen(true)}
            title="تسجيل مصاريف ونثريات طلعت من درج الكاشير"
          >
            تسجيل مصروف
          </AppButton>
          )}

          {canCloseDay && (
          <AppButton
            variant={summary?.isDayClosed ? 'success' : 'primary'}
            icon={summary?.isDayClosed ? CheckCircle2 : Lock}
            onClick={() => {
              setClosingTargetDate(undefined);
              setIsClosingModalOpen(true);
            }}
            title={summary?.isDayClosed ? 'اليومية مقفولة ومعتمدة - اضغط لعرض التقرير والطباعة' : 'تقفيل اليومية ومطابقة كاش الدرج'}
          >
            {/* Keyed so the label cross-fades with the variant swap when the day gets closed (motion on only) */}
            <span key={summary?.isDayClosed ? 'closed' : 'open'} className="motion-swap-in">
              {summary?.isDayClosed ? `اليومية مقفولة (#${summary.closingNumber})` : 'تقفيل اليومية'}
            </span>
          </AppButton>
          )}
        </div>
      </div>

      {/* Live Hourly Peak Ticker Banner */}
      {hourlyData && hourlyData.peakHourSalesPiasters > 0 && (
        <ClickableCard
          variant="banner"
          tone="warn"
          onClick={onNavigateSubTab ? () => onNavigateSubTab('revenue') : undefined}
          title="عرض تحليل الإيرادات وساعات الذروة"
          className="bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-ink dark:text-ink-dark shadow-2xs shrink-0"
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
          <ClickableChevron className="w-4 h-4" />
        </ClickableCard>
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
                <h4 className="t-label text-ink dark:text-ink-dark">
                  تنبيه تقفيل اليومية: اليوم اللي فات ({unclosedAlert.unclosedDate}) لسه ما اتقفلش!
                </h4>
                <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-warn dark:bg-warn-bright text-white dark:text-surface-dark">
                  محتاج تقفيل
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                فيه <strong>{unclosedAlert.unclosedSalesCount}</strong> فاتورة بمبلغ <strong>{formatArabicCurrency(unclosedAlert.unclosedSalesTotalPiasters)}</strong> لسه ما اتقفلتش في تقفيل رسمي. قفل الوردية اللي فاتت عشان حسابات ودفاتر المحل تبقى مظبوطة بالمليم.
              </p>
            </div>
          </div>
          <AppButton
            variant="warning"
            size="sm"
            icon={Lock}
            className="shrink-0"
            onClick={() => {
              setClosingTargetDate(unclosedAlert.unclosedDate);
              setIsClosingModalOpen(true);
            }}
          >
            تقفيل يومية {unclosedAlert.unclosedDate} دلوقتي
          </AppButton>
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
                <h4 className="t-label text-ink dark:text-ink-dark">
                  {batchSummary.expiredCount > 0
                    ? `تنبيه الصلاحية: فيه ${batchSummary.expiredCount} دفعة بضاعة صلاحيتها انتهت خلاص!`
                    : `تنبيه الصلاحية: فيه ${batchSummary.expiringSoonCount} دفعة بضاعة قربت تخلص صلاحيتها`}
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-micro font-bold text-white ${
                  batchSummary.expiredCount > 0 ? 'bg-danger' : 'bg-warn'
                }`}>
                  {batchSummary.expiredCount > 0 ? 'بضاعة هلكت' : 'محتاجة تتلحق'}
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                {batchSummary.expiredCount > 0
                  ? `فيه دفعات صلاحيتها انتهت قيمتها حوالي ${formatArabicCurrency(batchSummary.expiredValuePiasters)}. يرجى استبعادها أو عمل إتلاف ليها عشان ما تتباعش.`
                  : `دفعات مقربة من تاريخ الانتهاء بقيمة ${formatArabicCurrency(batchSummary.expiringSoonValuePiasters)}. السيستم بيصرف تلقائي الأقرب انتهاءً الأول.`}
              </p>
            </div>
          </div>
          <AppButton
            variant={batchSummary.expiredCount > 0 ? 'danger' : 'warning'}
            size="sm"
            icon={Clock}
            className="shrink-0"
            onClick={() => onNavigateToProducts('batches')}
          >
            شوف البضاعة وتواريخ الصلاحية
          </AppButton>
        </div>
      )}

      {/* Chronic Medications Due Refill Alert Banner (Story 133 / Feature #190) */}
      {isEnabled('feature_patient_profiles') && duePatientAlerts.length > 0 && (
        <div className="bg-warn-soft dark:bg-warn-dark-soft border-2 border-warn/30 dark:border-warn-bright/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink dark:text-ink-dark shadow-xs shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warn text-white dark:bg-warn-bright dark:text-surface-dark flex items-center justify-center shrink-0 shadow-xs">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="t-label text-ink dark:text-ink-dark">
                  تنبيه صرف العلاج الشهري: فيه {duePatientAlerts.length} مرضى مزمنين مستحقين لصرف أدويتهم الدورية!
                </h4>
                <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-warn text-white dark:bg-warn-bright dark:text-surface-dark">
                  استحقاق صرف
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                مرضى حان أو اقترب موعد نفاد أدويتهم المزمنة: {duePatientAlerts.slice(0, 3).map((a) => a.customerName).join('، ')}{duePatientAlerts.length > 3 ? ' وغيرهم...' : ''}. تواصل معهم لتجهيز الروشتة الشهرية.
              </p>
            </div>
          </div>
          <AppButton variant="warning" size="sm" icon={HeartPulse} className="shrink-0" onClick={() => setIsDueModalOpen(true)}>
            عرض تفاصيل المرضى المستحقين
          </AppButton>
        </div>
      )}

      {/* 2. FINANCIAL & OPERATIONAL KPI METRICS (6 roomy cards, 3 per row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
        {/* KPI 1: Today Sales */}
        <ClickableCard
          tone="paid"
          onClick={onNavigateSubTab ? () => onNavigateSubTab('revenue') : undefined}
          className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-4 min-h-[8.25rem]"
          title="عرض كشف تحليلات المبيعات التفصيلي"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-2">
              <span className="font-bold text-ink dark:text-ink-dark text-sm">مبيعات النهاردة</span>
              <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center shadow-2xs">
                <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark leading-none">
                {(todaySalesTotalPiasters / 100).toLocaleString('en-US', MONEY_2DP)}
              </span>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted gap-2">
            <span className="text-ink-muted dark:text-ink-dark-muted font-medium truncate min-w-0">
              {summary && (summary.todayTaxPiasters || 0) > 0 ? (
                <span title="ضريبة القيمة المضافة المحصلة اليوم كأمانات لمصلحة الضرائب">
                  ضريبة: <strong className="font-mono text-paid dark:text-paid-bright font-bold">{((summary.todayTaxPiasters || 0) / 100).toFixed(0)}</strong> ج.م
                </span>
              ) : null}
            </span>
            {onNavigateSubTab && <ClickableHint label="كشف الحساب" />}
          </div>
        </ClickableCard>

        {/* KPI 2: Today Net Profit / Loss */}
        {(() => {
          const netProfit = summary?.todayNetProfitsPiasters ?? summary?.todayProfitsPiasters ?? 0;
          const isLoss = netProfit < 0;
          const absNetProfit = Math.abs(netProfit);

          return (
            <ClickableCard
              tone={isLoss ? 'danger' : 'paid'}
              onClick={onNavigateSubTab ? () => onNavigateSubTab('revenue') : undefined}
              className={`bg-surface dark:bg-surface-dark rounded-xl border ${
                isLoss ? 'border-danger-border dark:border-danger-bright/40' : 'border-line dark:border-line-dark'
              } p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-4 min-h-[8.25rem]`}
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
                  <span className={`text-micro font-bold ${isLoss ? 'text-danger dark:text-danger-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>ج.م</span>
                </div>
              </div>
              <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between gap-1 text-micro text-ink-muted dark:text-ink-dark-muted">
                <span className="truncate min-w-0" title="صافي الأرباح بعد خصم المصاريف والتوالف">
                  {summary && ((summary.todayInventoryLossPiasters || 0) > 0 || (summary.todayExpensesPiasters || 0) > 0)
                    ? `مبيعات: ${((summary.todayProfitsPiasters || 0) / 100).toFixed(0)}${(summary.todayExpensesPiasters || 0) > 0 ? ` | م: -${((summary.todayExpensesPiasters || 0) / 100).toFixed(0)}` : ''}${(summary.todayInventoryLossPiasters || 0) > 0 ? ` | ع: -${((summary.todayInventoryLossPiasters || 0) / 100).toFixed(0)}` : ''}`
                    : 'صافي بعد المصاريف'}
                </span>
                {isLoss && (
                  <span className="font-bold font-mono text-micro px-1.5 py-0.5 rounded-md border whitespace-nowrap shrink-0 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30">
                    بعد التوالف
                  </span>
                )}
                {onNavigateSubTab && <ClickableHint label="تقرير الأرباح" />}
              </div>
            </ClickableCard>
          );
        })()}

        {/* KPI 3: Inventory Loss / Shrinkage */}
        <ClickableCard
          tone="warn"
          onClick={openLossReport}
          className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-4 min-h-[8.25rem]"
          title="عرض تحليل التوالف وحركة المخزن"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">توالف وعجز الجرد</span>
              <div className="w-7 h-7 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 flex items-center justify-center shadow-2xs">
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
              <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-end text-micro text-ink-muted dark:text-ink-dark-muted gap-1">
            {openLossReport && <ClickableHint label="كشف التوالف" />}
          </div>
        </ClickableCard>

        {/* KPI 4: Invoices Count (display only: no action, so no hover affordance) */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-4 min-h-[8.25rem]">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">فواتير البيع النهاردة</span>
              <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center shadow-2xs">
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark leading-none">
                {summary ? summary.todayInvoicesCount : '0'}
              </span>
              <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted">فاتورة</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted gap-1">
            <span className="truncate min-w-0">متوسط: <strong className="text-ink dark:text-ink-dark font-bold font-mono tabular-nums">{summary && summary.todayInvoicesCount > 0 ? ((todaySalesTotalPiasters / summary.todayInvoicesCount) / 100).toFixed(0) : '0'}</strong> ج.م</span>
            <div className="flex items-center gap-1.5 font-bold text-micro shrink-0">
              {summary && (summary.todayCancelledCount || 0) > 0 && (
                <span className="text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.2 rounded-md border border-danger-border dark:border-danger-bright/30 whitespace-nowrap" title="فواتير اتلغت النهاردة">
                  {summary.todayCancelledCount} اتلغت
                </span>
              )}
              {summary && (summary.todayReturnsCount || 0) > 0 && (
                <span className="text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft px-1.5 py-0.2 rounded-md border border-warn-border dark:border-warn-bright/30 whitespace-nowrap" title="عمليات مرتجع النهاردة">
                  {summary.todayReturnsCount} رجعت
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 5: Drawer Balance (cash breakdown lives in the drawer section below) */}
        {(() => {
          const epayTillPiasters = summary ? (summary.todayEpayTillCashPiasters || 0) : 0;
          const nonSalesDelta = summary ? (summary.cashDrawerPiasters - (summary.todayCashPiasters || 0)) : 0;

          return (
            <ClickableCard
              tone="brand"
              onClick={canCloseDay ? () => setIsClosingModalOpen(true) : undefined}
              className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-4 min-h-[8.25rem]"
              title="عرض كشف درج الكاشير وتقفيل الوردية"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-2">
                  <span className="font-bold text-ink dark:text-ink-dark text-sm">كاش الدرج دلوقتي</span>
                  <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center shadow-2xs">
                    <Wallet className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark leading-none">
                    {summary ? (summary.cashDrawerPiasters / 100).toLocaleString('en-US', MONEY_2DP) : '0.00'}
                  </span>
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted gap-2">
                <span className="text-ink-muted dark:text-ink-dark-muted font-medium truncate min-w-0">
                  {nonSalesDelta !== 0 ? (
                    <span className="flex items-center gap-1" title="نقدية الدرج تشمل تسويات المحافظ والماكينات والمصاريف">
                      <span>شامل</span>
                      <strong className={`font-mono font-bold ${nonSalesDelta < 0 ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'}`}>
                        {nonSalesDelta > 0 ? '+' : ''}{(nonSalesDelta / 100).toFixed(2)}
                      </strong>
                      <span>ج.م حركات أخرى</span>
                    </span>
                  ) : epayTillPiasters > 0 ? (
                    <span title="نقدية محفظة ماكينات الدفع والخدمات الإلكترونية مستقلة تماماً عن درج المحل">
                      كاش محفظة المكن: <strong className="font-mono font-bold text-ink dark:text-ink-dark">{(epayTillPiasters / 100).toFixed(0)}</strong> ج.م
                    </span>
                  ) : (
                    'نقدية الدرج الفعلية'
                  )}
                </span>
                {canCloseDay && <ClickableHint label="كشف الدرج" />}
              </div>
            </ClickableCard>
          );
        })()}

        {/* KPI 6: Today's Credit Sales & Cumulative Debts */}
        <ClickableCard
          tone="warn"
          onClick={openDebtsReport}
          className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-4 min-h-[8.25rem]"
          title="مبيعات الشكك والآجل المسجلة النهاردة، مع بيان إجمالي مديونية الزبائن في دفتر الشكك"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">شكك النهاردة</span>
              <div className="w-7 h-7 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 flex items-center justify-center shadow-2xs">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl lg:text-2xl font-black font-mono tabular-nums leading-none ${
                (summary?.todayCreditPiasters || 0) > 0 ? 'text-warn dark:text-warn-bright' : 'text-ink dark:text-ink-dark'
              }`}>
                {((summary?.todayCreditPiasters || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted gap-1">
            <span className="truncate min-w-0" title={`إجمالي كل الشكك لعدد ${summary?.debtorsCount || 0} عميل`}>
              إجمالي برة: <strong className="text-danger dark:text-danger-bright font-mono font-bold tabular-nums">{summary ? ((summary.totalCustomerDebtsPiasters || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'}</strong> ج.م
            </span>
            {openDebtsReport && <ClickableHint label="دفتر الشكك" />}
          </div>
        </ClickableCard>
      </div>

      {/* 3. PAYMENT-METHOD BREAKDOWN + DRAWER MOVEMENT (roomy cards, no squeezed rows) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 shrink-0">
        <section className="xl:col-span-2 bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-2xs overflow-hidden">
          <div className="min-h-[3.25rem] bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-ink dark:text-ink-dark">
              <CreditCard className="w-4 h-4 text-paid dark:text-paid-bright" />
              <span>مبيعات النهاردة حسب طريقة الدفع</span>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {paymentTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.key}
                  className="rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-4 flex flex-col gap-3 min-w-0"
                  title={`${tile.title}: ${tile.amount.toLocaleString('en-US', MONEY_2DP)} ج.م`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${PAYMENT_CHIP_CLASSES[tile.tone]}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-bold text-ink dark:text-ink-dark">{tile.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-mono t-kpi text-ink dark:text-ink-dark">
                      {tile.amount.toLocaleString('en-US', MONEY_2DP)}
                    </span>
                    <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="min-h-[3.25rem] bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 py-3 flex items-center justify-between text-sm font-bold text-ink dark:text-ink-dark">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                <span>حركة درج الكاشير النهاردة</span>
              </div>
              <span className="text-2xs font-normal text-ink-muted dark:text-ink-dark-muted">
                حسابات السيولة اللحظية
              </span>
            </div>
            <dl className="px-5 divide-y divide-line dark:divide-line-dark">
              {drawerRows.map((row) => (
                <div key={row.key} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <dt className="text-sm font-bold text-ink dark:text-ink-dark">{row.label}</dt>
                    <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">{row.hint}</p>
                  </div>
                  <dd className={`font-mono text-base sm:text-lg font-black tabular-nums whitespace-nowrap shrink-0 ${row.cls}`}>
                    {row.text} <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Footer Total Reconciled Balance */}
          <div className="bg-surface-2/90 dark:bg-surface-dark-2/90 px-5 py-3.5 border-t border-line dark:border-line-dark flex items-center justify-between">
            <div>
              <span className="text-sm font-black text-ink dark:text-ink-dark">صافي نقدية الدرج الآن</span>
              <p className="text-2xs text-ink-muted dark:text-ink-dark-muted mt-0.5">المفروض يكون في الدرج فعلياً</p>
            </div>
            <div className="font-mono text-lg sm:text-xl font-black text-brand dark:text-brand-bright tabular-nums">
              {summary ? (summary.cashDrawerPiasters / 100).toLocaleString('en-US', MONEY_2DP) : '0.00'} <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
          </div>
        </section>
      </div>

      {/* 4. SPLIT SECTION: TOP SELLING & INVENTORY ADJUSTMENTS + ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 shrink-0 pb-6">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items + Today's Inventory Adjustments */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          
          {/* 4A. Top Selling Products */}
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                <Flame className="w-4 h-4 text-paid dark:text-paid-bright" />
                <span>أكتر بضاعة اتباعت النهاردة</span>
              </div>
              <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-medium font-mono">مترتبة من الأكتر للأقل</span>
            </div>

            <div className="p-0 overflow-y-auto max-h-[16.25rem]">
              {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
                <table className="w-full text-right text-sm">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-b border-line dark:border-line-dark text-micro">
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
                            <span className="w-5 h-5 rounded-full bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold text-micro inline-flex items-center justify-center border border-warn/20 dark:border-warn-bright/30">1</span>
                          ) : idx === 1 ? (
                            <span className="w-5 h-5 rounded-full bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold text-micro inline-flex items-center justify-center border border-line dark:border-line-dark">2</span>
                          ) : idx === 2 ? (
                            <span className="w-5 h-5 rounded-full bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold text-micro inline-flex items-center justify-center border border-warn/20 dark:border-warn-bright/30">3</span>
                          ) : (
                            <span className="font-mono text-ink-muted dark:text-ink-dark-muted text-micro tabular-nums">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-ink dark:text-ink-dark">{p.productName}</td>
                        <td className="py-2 px-3 font-mono font-bold text-center text-ink dark:text-ink-dark tabular-nums">
                          {p.totalQuantity}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-paid dark:text-paid-bright text-left pl-5 text-sm tabular-nums">
                          {formatArabicCurrency(p.totalSalesPiasters, false)} <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-normal">ج.م</span>
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
                {(summary?.recentAdjustments?.length || 0) > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 font-mono tabular-nums">
                    {summary?.recentAdjustments?.length} حركة
                  </span>
                )}
              </div>
              <AppButton variant="secondary" size="xs" icon={Boxes} onClick={() => onNavigateToProducts('movements')}>
                <span>دفتر حركة البضاعة</span>
                <ChevronLeft className="w-3 h-3" />
              </AppButton>
            </div>

            <div className="p-0 overflow-y-auto max-h-[16.25rem]">
              {summary && summary.recentAdjustments && summary.recentAdjustments.length > 0 ? (
                <table className="w-full text-right text-sm">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-b border-line dark:border-line-dark text-micro">
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
                            <span className={`px-2 py-0.2 rounded text-micro border ${
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
                            {formatArabicCurrency(adj.unitCostPiasters, true)}
                          </td>
                          <td className="py-2 px-3 text-left pl-5 font-mono font-bold text-sm tabular-nums">
                            <span className={isNegative ? 'text-danger dark:text-danger-bright' : isPositive ? 'text-paid dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark-muted'}>
                              {isNegative ? '-' : isPositive ? '+' : ''}{formatArabicCurrency(Math.abs(adj.financialImpactPiasters), false)}
                            </span>
                            <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-normal mr-1">ج.م</span>
                          </td>
                          <td className="py-2 px-3 text-ink dark:text-ink-dark text-micro">
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
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted">كل بضاعة المخزن مظبوطة بالمليم</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* LEFT COLUMN (1/3 width): System Alerts & Stock Thresholds */}
        <div className="flex flex-col gap-4">
          
          {/* Low Stock Alerts (Story 79 / Task 36-2) */}
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark flex flex-col overflow-hidden shadow-2xs">
            <div className="min-h-10 py-1 gap-x-2 flex-wrap bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-danger dark:text-danger-bright font-bold text-xs">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                <span>نواقص المخزن</span>
                {summary && (summary.lowStockCount ?? summary.lowStockProducts?.length) > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright text-micro font-mono font-bold border border-danger-border dark:border-danger-bright/30">
                    {summary.lowStockCount ?? summary.lowStockProducts.length} صنف
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <AppButton
                  variant="primary"
                  size="xs"
                  onClick={() => onNavigateSubTab ? onNavigateSubTab('inventory') : setIsLowStockModalOpen(true)}
                  title="تحليل النواقص وعمل طلب شراء"
                >
                  طلب بضاعة
                </AppButton>
                <AppButton variant="soft" size="xs" onClick={() => onNavigateToProducts('catalog', 'lowStock')}>
                  كل النواقص
                </AppButton>
              </div>
            </div>

            <div className="p-3 divide-y divide-line dark:divide-line-dark max-h-[13.75rem] overflow-y-auto">
              {summary && summary.lowStockProducts && summary.lowStockProducts.length > 0 ? (
                summary.lowStockProducts.map((p) => (
                  <ClickableCard
                    key={p.productId}
                    variant="row"
                    onClick={openLowStockProducts}
                    className="py-2 flex items-center justify-between gap-3 text-xs -mx-1 px-1"
                    title="فتح قائمة النواقص في إدارة المخزن"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink dark:text-ink-dark truncate whitespace-nowrap" title={p.productName}>{p.productName}</div>
                      <div className="text-micro text-ink-muted dark:text-ink-dark-muted whitespace-nowrap flex items-center gap-1.5 mt-0.5">
                        <span>وحدة: {p.unit === 'kg' ? 'كيلو' : 'قطعة'}</span>
                        <span className="text-line dark:text-line-dark">•</span>
                        <span>حد الأمان: {p.minStock ?? 5}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-micro font-mono font-bold tabular-nums whitespace-nowrap border ${
                      p.currentStock <= 0 
                        ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' 
                        : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30'
                    }`}>
                      {p.currentStock <= 0 ? 'خلصت خالص' : `متبقي: ${p.currentStock}`}
                    </span>
                    {openLowStockProducts && <ClickableChevron className="w-3.5 h-3.5" />}
                  </ClickableCard>
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
                <Users className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                <span>أكتر زباين عليهم حساب (شكك)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AppButton
                  variant="primary"
                  size="xs"
                  onClick={() => onNavigateSubTab ? onNavigateSubTab('customers') : setIsDebtorsModalOpen(true)}
                  title="كشف حسابات وديون الزباين بالتفصيل"
                >
                  كشف الحسابات
                </AppButton>
              </div>
            </div>

            <div className="p-3 divide-y divide-line dark:divide-line-dark max-h-[11.875rem] overflow-y-auto">
              {summary && summary.topDebtors && summary.topDebtors.length > 0 ? (
                summary.topDebtors.map((d) => (
                  <div key={d.customerId} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-ink dark:text-ink-dark">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono">{formatPhoneDisplay(d.customerPhone)}</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-danger dark:text-danger-bright text-xs tabular-nums">
                      {formatArabicCurrency(d.balancePiasters, true)}
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

      {/* Due Patients Modal (Story 133 / Feature #190) */}
      <DuePatientsModal
        isOpen={isDueModalOpen}
        onClose={() => setIsDueModalOpen(false)}
        alerts={duePatientAlerts}
        onOpenCustomerProfile={(id, name, phone) => {
          setSelectedPatientForModal({ id, name, phone });
        }}
      />

      {/* Patient Profile Modal from Due Alerts */}
      {selectedPatientForModal && (
        <PatientProfileModal
          isOpen={selectedPatientForModal !== null}
          onClose={() => {
            setSelectedPatientForModal(null);
            void loadData();
          }}
          customerId={selectedPatientForModal.id}
          customerName={selectedPatientForModal.name}
          customerPhone={selectedPatientForModal.phone}
          onProfileUpdated={() => void loadData()}
        />
      )}

    </div>
  );
}
