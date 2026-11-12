import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Wallet,
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  Plus,
  TrendingUp,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
  Lock,
  ShieldCheck,
  Coins,
  Phone,
  AtSign,
  User,
  Landmark,
  Star,
  Printer,
  CreditCard,
  Banknote,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription, emitDataChanged } from '../../utils/eventBus';
import { formatArabicCurrency } from '../../utils/money';
import { isNumericAccountValue, receivingNumbers } from '../../utils/digitalAccounts';
import { formatPhoneDisplay } from '../../utils/phoneFormat';
import { rafiqConfirm } from '../../utils/dialogService';
import { isFormDirty } from '../../utils/dirtyForm';
import { useAuth } from '../../context/useAuth';
import { useFeatures } from '../../context/useFeatures';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { DateFilterControl } from '../../components/DateFilterControl';
import { AppButton } from '../../components/AppButton';
import MotionHeight from '../../components/MotionHeight';
import { SearchInput } from '../../components/SearchInput';
import { ClearFiltersButton } from '../../components/ClearFiltersButton';
import { PaginationBar } from '../../components/PaginationBar';
import { RequiredMark } from '../../components/RequiredMark';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { useClientPagination } from '../../utils/usePagination';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useUnsavedChangesGuard } from '../../context/useUnsavedChanges';
import { UnsavedChangesChip } from '../../components/UnsavedChangesChip';
import {
  useDateFilter,
  useToday,
  getDatePresetLabel,
  getDateFilterPayload,
  getDateFilterKey,
  isDateFilterActive,
  describeDateFilter,
  formatLocalDateTime,
} from '../../utils/dateFilter';
import type {
  DigitalAccount,
  DigitalTransaction,
  DigitalAnalyticsSummary,
  DigitalAccountType,
} from '../../types/models';
import { useMotionPanel } from '../../hooks/useMotionPanel';

export type WalletsSubTab = 'transact' | 'accounts' | 'history' | 'analytics';

// أقصى عدد صفوف يُحمَّل لسجل العمليات بعد تطبيق الفلاتر في قاعدة البيانات
const HISTORY_LOAD_LIMIT = 2000;

// مجاميع الفترة تُحسب في SQL على كل العمليات المكتملة (وليس على الصفوف المحمّلة فقط)
type WalletsAnalytics = DigitalAnalyticsSummary & {
  periodTransactionsCount?: number;
  periodProfitPiasters?: number;
  periodVolumePiasters?: number;
  periodDrawerCashPiasters?: number;
  periodTerminalTillCashPiasters?: number;
  periodTotalCashPiasters?: number;
};

export interface WalletsViewProps {
  isActive?: boolean;
  activeSubTab?: WalletsSubTab;
  onSubTabChange?: (tab: WalletsSubTab) => void;
}

const FIELD_LABEL_CLS = 'text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1.5';
const FIELD_INPUT_CLS = 'w-full h-11 px-3.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all';

const StepHeading: React.FC<{ step: number; title: string; hint?: string }> = ({ step, title, hint }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright font-black text-xs flex items-center justify-center shrink-0">
        {step}
      </span>
      <h3 className="t-card-title text-ink dark:text-ink-dark m-0">{title}</h3>
    </div>
    {hint && <span className="text-micro font-medium text-ink-muted dark:text-ink-muted-dark">{hint}</span>}
  </div>
);

// =========================================================================
// 1. Egyptian Banks Supported by InstaPay (شبكة المدفوعات اللحظية IPN)
// =========================================================================
export interface EgyptianBankOption {
  code: string;
  name: string;
  shortName: string;
  badge: string;
}

const INSTAPAY_BANKS: EgyptianBankOption[] = [
  { code: 'nbe', name: 'البنك الأهلي المصري (NBE)', shortName: 'الأهلي المصري', badge: 'الأهلي' },
  { code: 'bm', name: 'بنك مصر (Banque Misr)', shortName: 'بنك مصر', badge: 'مصر' },
  { code: 'cib', name: 'البنك التجاري الدولي (CIB)', shortName: 'CIB', badge: 'CIB' },
  { code: 'bdc', name: 'بنك القاهرة (BDC)', shortName: 'بنك القاهرة', badge: 'القاهرة' },
  { code: 'alex', name: 'بنك الإسكندرية (AlexBank)', shortName: 'بنك الإسكندرية', badge: 'إسكندرية' },
  { code: 'qnb', name: 'بنك QNB الأهلي (قطر الوطني)', shortName: 'QNB الأهلي', badge: 'QNB' },
  { code: 'aaib', name: 'البنك العربي الأفريقي الدولي (AAIB)', shortName: 'العربي الأفريقي', badge: 'AAIB' },
  { code: 'faisal', name: 'بنك فيصل الإسلامي المصري', shortName: 'فيصل الإسلامي', badge: 'فيصل' },
  { code: 'adib', name: 'مصرف أبوظبي الإسلامي مصر (ADIB)', shortName: 'أبوظبي الإسلامي', badge: 'ADIB' },
  { code: 'hdb', name: 'بنك التعمير والإسكان (HDB)', shortName: 'التعمير والإسكان', badge: 'الإسكان' },
  { code: 'united', name: 'المصرف المتحد (The United Bank)', shortName: 'المصرف المتحد', badge: 'المتحد' },
  { code: 'adcb', name: 'مصرف أبوظبي التجاري مصر (ADCB)', shortName: 'أبوظبي التجاري', badge: 'ADCB' },
  { code: 'baraka', name: 'بنك البركة مصر (Al Baraka)', shortName: 'بنك البركة', badge: 'البركة' },
  { code: 'saib', name: 'بنك الشركة المصرفية العربية الدولية (saib)', shortName: 'بنك saib', badge: 'saib' },
  { code: 'ebank', name: 'البنك المصري لتنمية الصادرات (EBank)', shortName: 'تنمية الصادرات', badge: 'EBank' },
  { code: 'scb', name: 'بنك قناة السويس (Suez Canal Bank)', shortName: 'قناة السويس', badge: 'قناة السويس' },
  { code: 'nbk', name: 'بنك الكويت الوطني مصر (NBK)', shortName: 'الكويت الوطني', badge: 'NBK' },
  { code: 'enbd', name: 'بنك الإمارات دبي الوطني (Emirates NBD)', shortName: 'الإمارات دبي', badge: 'ENBD' },
  { code: 'fab', name: 'بنك أبوظبي الأول مصر (FABMISR)', shortName: 'أبوظبي الأول', badge: 'FAB' },
  { code: 'ca', name: 'بنك كريدي أجريكول مصر (Crédit Agricole)', shortName: 'كريدي أجريكول', badge: 'كريدي' },
  { code: 'hsbc', name: 'بنك HSBC مصر', shortName: 'HSBC مصر', badge: 'HSBC' },
  { code: 'abk', name: 'البنك الأهلي الكويتي مصر (ABK)', shortName: 'الأهلي الكويتي', badge: 'ABK' },
  { code: 'aib', name: 'بنك الاستثمار العربي (aiBANK)', shortName: 'الاستثمار العربي', badge: 'aiBANK' },
  { code: 'arabbank', name: 'البنك العربي (Arab Bank)', shortName: 'البنك العربي', badge: 'العربي' },
  { code: 'post', name: 'الهيئة القومية للبريد المصري (Egypt Post)', shortName: 'البريد المصري', badge: 'البريد' },
  { code: 'meeza_card', name: 'بطاقة ميزة الوطنية مسبقة الدفع (Meeza)', shortName: 'كارت ميزة', badge: 'ميزة' },
  { code: 'other_bank', name: 'حساب بنكي آخر غير مدرج', shortName: 'حساب بنكي', badge: 'بنك' },
];

// =========================================================================
// 2. Egyptian Mobile Wallets (أشهر محافظ الكاش في السوق المصري)
// =========================================================================
export interface EgyptianWalletOption {
  code: string;
  name: string;
  shortName: string;
  badge: string;
  border: string;
  bgSoft: string;
  text: string;
}

const EGYPTIAN_WALLETS: EgyptianWalletOption[] = [
  {
    code: 'vodafone_cash',
    name: 'فودافون كاش (Vodafone Cash)',
    shortName: 'فودافون كاش',
    badge: 'فودافون',
    border: 'border-danger/30 dark:border-danger-bright/30',
    bgSoft: 'bg-danger-soft dark:bg-danger-dark-soft',
    text: 'text-danger dark:text-danger-bright',
  },
  {
    code: 'orange_cash',
    name: 'أورانج كاش (Orange Cash)',
    shortName: 'أورانج كاش',
    badge: 'أورانج',
    border: 'border-warn/30 dark:border-warn-bright/30',
    bgSoft: 'bg-warn-soft dark:bg-warn-dark-soft',
    text: 'text-warn dark:text-warn-bright',
  },
  {
    code: 'etisalat_cash',
    name: 'اتصالات كاش (Etisalat Cash / e&)',
    shortName: 'اتصالات كاش',
    badge: 'اتصالات',
    border: 'border-paid-border dark:border-paid-bright/30',
    bgSoft: 'bg-paid-soft dark:bg-paid-dark-soft',
    text: 'text-paid dark:text-paid-bright',
  },
  {
    code: 'we_pay',
    name: 'وي باي (WE Pay - المصرية للاتصالات)',
    shortName: 'وي باي',
    badge: 'وي باي',
    border: 'border-brand/30 dark:border-brand-bright/30',
    bgSoft: 'bg-brand-soft dark:bg-brand-bright/15',
    text: 'text-brand dark:text-brand-bright',
  },
  {
    code: 'meeza_wallet',
    name: 'محفظة ميزة الرقمية الذكية (Meeza Wallet)',
    shortName: 'ميزة كاش',
    badge: 'ميزة',
    border: 'border-brand/30 dark:border-brand-bright/30',
    bgSoft: 'bg-brand-soft dark:bg-brand-bright/15',
    text: 'text-brand dark:text-brand-bright',
  },
  {
    code: 'nbe_phone_cash',
    name: 'محفظة فون كاش (البنك الأهلي المصري)',
    shortName: 'الأهلي فون كاش',
    badge: 'فون كاش',
    border: 'border-paid-border dark:border-paid-bright/30',
    bgSoft: 'bg-paid-soft dark:bg-paid-dark-soft',
    text: 'text-paid dark:text-paid-bright',
  },
  {
    code: 'bm_wallet',
    name: 'محفظة BM Wallet (بنك مصر)',
    shortName: 'محفظة بنك مصر',
    badge: 'بنك مصر',
    border: 'border-danger/30 dark:border-danger-bright/30',
    bgSoft: 'bg-danger-soft dark:bg-danger-dark-soft',
    text: 'text-danger dark:text-danger-bright',
  },
  {
    code: 'cib_smart_wallet',
    name: 'المحفظة الذكية Smart Wallet (CIB)',
    shortName: 'سمارت واليت CIB',
    badge: 'CIB Wallet',
    border: 'border-brand/30 dark:border-brand-bright/30',
    bgSoft: 'bg-brand-soft dark:bg-brand-bright/15',
    text: 'text-brand dark:text-brand-bright',
  },
  {
    code: 'bdc_qahera_cash',
    name: 'محفظة قاهرة كاش (بنك القاهرة)',
    shortName: 'قاهرة كاش',
    badge: 'قاهرة كاش',
    border: 'border-warn/30 dark:border-warn-bright/30',
    bgSoft: 'bg-warn-soft dark:bg-warn-dark-soft',
    text: 'text-warn dark:text-warn-bright',
  },
  {
    code: 'alex_wallet',
    name: 'محفظة بنك الإسكندرية الذكية (Alex Wallet)',
    shortName: 'محفظة إسكندرية',
    badge: 'إسكندرية',
    border: 'border-paid-border dark:border-paid-bright/30',
    bgSoft: 'bg-paid-soft dark:bg-paid-dark-soft',
    text: 'text-paid dark:text-paid-bright',
  },
  {
    code: 'qnb_wallet',
    name: 'محفظة QNB الأهلي الإلكترونية',
    shortName: 'محفظة QNB',
    badge: 'QNB Wallet',
    border: 'border-danger/30 dark:border-danger-bright/30',
    bgSoft: 'bg-danger-soft dark:bg-danger-dark-soft',
    text: 'text-danger dark:text-danger-bright',
  },
  {
    code: 'other',
    name: 'محفظة إلكترونية أخرى',
    shortName: 'محفظة أخرى',
    badge: 'أخرى',
    border: 'border-line dark:border-line-dark',
    bgSoft: 'bg-surface-2 dark:bg-surface-dark-2',
    text: 'text-ink-muted dark:text-ink-muted-dark',
  },
];

// Helper to determine styling, badges, and bank identification
const getAccountDisplayInfo = (acc?: DigitalAccount | null) => {
  if (!acc) {
    return {
      name: 'محفظة',
      badge: 'محفظة',
      border: 'border-line dark:border-line-dark',
      bgSoft: 'bg-surface-2 dark:bg-surface-dark-2',
      text: 'text-ink-muted dark:text-ink-muted-dark',
      isBank: false,
    };
  }

  if (acc.accountType === 'instapay') {
    const bank = INSTAPAY_BANKS.find(
      (b) => b.code === acc.provider || `instapay_${b.code}` === acc.provider
    );
    return {
      name: bank ? bank.name : 'حساب إنستاباي',
      badge: bank ? `إنستاباي • ${bank.badge}` : 'إنستاباي',
      border: 'border-brand/30 dark:border-brand-bright/30',
      bgSoft: 'bg-brand-soft dark:bg-brand-bright/15',
      text: 'text-brand dark:text-brand-bright',
      isBank: true,
    };
  }

  const wallet = EGYPTIAN_WALLETS.find((w) => w.code === acc.provider);
  if (wallet) {
    return {
      name: wallet.name,
      badge: wallet.badge,
      border: wallet.border,
      bgSoft: wallet.bgSoft,
      text: wallet.text,
      isBank: false,
    };
  }

  return {
    name: 'محفظة كاش',
    badge: 'محفظة',
    border: 'border-line dark:border-line-dark',
    bgSoft: 'bg-surface-2 dark:bg-surface-dark-2',
    text: 'text-ink-muted dark:text-ink-muted-dark',
    isBank: false,
  };
};

interface AccountIdentityRow {
  key: string;
  label: string;
  display: string;
  kind: 'phone' | 'address';
}

// Phone and InstaPay address are told to the customer, so each one that exists gets its own labelled row (phone first).
// The host aliases phone and identifier to one value when only one was typed; receivingNumbers collapses that.
const getAccountIdentityRows = (acc: DigitalAccount): AccountIdentityRow[] => {
  const { primary, secondary } = receivingNumbers(acc);
  const isInstapay = acc.accountType === 'instapay';
  const values = [primary, secondary].filter((v) => v !== '');
  values.sort((a, b) => Number(isNumericAccountValue(b)) - Number(isNumericAccountValue(a)));
  let hasPhoneRow = false;
  return values.map((raw) => {
    if (isNumericAccountValue(raw)) {
      const label = hasPhoneRow ? 'رقم الحساب' : isInstapay ? 'رقم الهاتف' : 'رقم المحفظة';
      hasPhoneRow = true;
      return { key: `phone-${raw}`, label, display: formatPhoneDisplay(raw), kind: 'phone' as const };
    }
    return {
      key: `address-${raw}`,
      label: isInstapay ? 'عنوان إنستاباي' : 'معرف إضافي',
      display: raw,
      kind: 'address' as const,
    };
  });
};

interface AccountFormValues {
  name: string;
  holder: string;
  isDefault: boolean;
  type: DigitalAccountType;
  provider: string;
  phone: string;
  identifier: string;
  balance: number;
  dailyLimit: number;
  monthlyLimit: number;
  notes: string;
}

// A new account opens as an InstaPay account of the National Bank of Egypt with these names and limits
const NEW_ACCOUNT_FORM: AccountFormValues = {
  name: 'إنستاباي - الأهلي المصري',
  holder: '',
  isDefault: false,
  type: 'instapay',
  provider: 'nbe',
  phone: '',
  identifier: '',
  balance: 0,
  dailyLimit: 7000000,
  monthlyLimit: 40000000,
  notes: '',
};

const accountToFormValues = (acc: DigitalAccount): AccountFormValues => ({
  name: acc.name,
  holder: acc.holderName || '',
  isDefault: acc.isDefault === true,
  type: acc.accountType,
  provider: acc.provider,
  phone: acc.phoneNumber || '',
  identifier: acc.identifier || '',
  balance: acc.balancePiasters,
  dailyLimit: acc.dailyLimitPiasters || (acc.accountType === 'instapay' ? 7000000 : 6000000),
  monthlyLimit: acc.monthlyLimitPiasters || (acc.accountType === 'instapay' ? 40000000 : 20000000),
  notes: acc.notes || '',
});

export const WalletsView: React.FC<WalletsViewProps> = ({
  isActive = true,
  activeSubTab = 'transact',
  onSubTabChange,
}) => {
  const { currentUser, isRoot, isAdmin, hasPermission } = useAuth();
  const currentUserName = currentUser?.displayName || currentUser?.username || 'كاشير المحل';

  // Permissions
  const canFund = isRoot || isAdmin || hasPermission('wallets.fund');
  const canManageAccounts = isRoot || isAdmin || hasPermission('wallets.accounts_manage');
  const canViewAnalytics = isRoot || isAdmin || hasPermission('wallets.analytics');
  const canViewHistory = isRoot || isAdmin || hasPermission('wallets.history');
  const canCancelTx = isRoot || isAdmin || hasPermission('wallets.cancel');

  // Synchronize active tab from props
  const [internalTab, setInternalTab] = useState<WalletsSubTab>(activeSubTab);

  useEffect(() => {
    if (activeSubTab) {
      setInternalTab(activeSubTab);
    }
  }, [activeSubTab]);

  const activeTabRaw = activeSubTab || internalTab;

  const { isEnabled } = useFeatures();
  const hasAgencyKiosk = isEnabled('feature_digital_wallets') || isRoot;

  const currentTab: WalletsSubTab = useMemo(() => {
    // If store does not offer agency deposit/withdraw services, only show accounts & history
    if (!hasAgencyKiosk && (activeTabRaw === 'transact' || activeTabRaw === 'analytics')) {
      return 'accounts';
    }
    if (activeTabRaw === 'accounts' && !canManageAccounts && !canFund) {
      return hasAgencyKiosk ? 'transact' : 'history';
    }
    if (activeTabRaw === 'history' && !canViewHistory) {
      return hasAgencyKiosk ? 'transact' : 'accounts';
    }
    if (activeTabRaw === 'analytics' && !canViewAnalytics) {
      return hasAgencyKiosk ? 'transact' : 'accounts';
    }
    return activeTabRaw;
  }, [activeTabRaw, canManageAccounts, canFund, canViewHistory, canViewAnalytics, hasAgencyKiosk]);
  const motionPanel = useMotionPanel(currentTab);

  // Data State
  const [accounts, setAccounts] = useState<DigitalAccount[]>([]);
  const [transactions, setTransactions] = useState<DigitalTransaction[]>([]);
  const [analytics, setAnalytics] = useState<WalletsAnalytics | null>(null);
  const [_loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Notification Banner
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      try {
        containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        containerRef.current.scrollTop = 0;
      }
    }
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // fallback
    }
  }, []);

  // Scroll to top immediately when an error appears so the cashier sees the alert banner
  useEffect(() => {
    if (errorMsg) {
      scrollToTop();
    }
  }, [errorMsg, scrollToTop]);

  // Auto-dismiss success notification after 4 seconds
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => {
      setSuccessMsg(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // Auto-dismiss error notification after 6 seconds
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => {
      setErrorMsg(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  // Clear notifications on sub-tab navigation
  useEffect(() => {
    setSuccessMsg(null);
    setErrorMsg(null);
  }, [currentTab]);

  // Form State: 2 Direct Inputs (Amount & Profit)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [txType, setTxType] = useState<'cash_out' | 'cash_in'>('cash_out');
  const [amountPiasters, setAmountPiasters] = useState<number>(0);
  const [profitPiasters, setProfitPiasters] = useState<number>(0);
  const [isProfitEntered, setIsProfitEntered] = useState<boolean>(false);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [paymentDestination, setPaymentDestination] = useState<'cash_drawer' | 'terminal_till'>('terminal_till');
  const [notes, setNotes] = useState<string>('');
  const [lastProcessedTx, setLastProcessedTx] = useState<DigitalTransaction | null>(null);

  // Filter State for History
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDestination, setFilterDestination] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState<string>('');
  const {
    dateFilter: historyDateFilter,
    setDateFilter: setHistoryDateFilter,
    resetDateFilter: resetHistoryDateFilter,
  } = useDateFilter();

  // Filter State for Analytics
  const {
    dateFilter: analyticsDateFilter,
    setDateFilter: setAnalyticsDateFilter,
  } = useDateFilter('today');

  // يتغير عند منتصف الليل فتُعاد قراءة الفترات النسبية (اليوم/أمس/آخر 7 أيام) من قاعدة البيانات
  const today = useToday();
  const loadSeqRef = useRef(0);

  // Modals
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<DigitalAccount | null>(null);
  const [accountFormName, setAccountFormName] = useState('');
  const [accountFormHolder, setAccountFormHolder] = useState('');
  const [accountFormIsDefault, setAccountFormIsDefault] = useState(false);
  const [accountFormType, setAccountFormType] = useState<DigitalAccountType>('instapay');
  const [accountFormProvider, setAccountFormProvider] = useState<string>('nbe');
  const [accountFormPhone, setAccountFormPhone] = useState('');
  const [accountFormIdentifier, setAccountFormIdentifier] = useState('');
  const [accountFormBalance, setAccountFormBalance] = useState<number>(0);
  const [accountFormDailyLimit, setAccountFormDailyLimit] = useState<number>(7000000);
  const [accountFormMonthlyLimit, setAccountFormMonthlyLimit] = useState<number>(40000000);
  const [accountFormNotes, setAccountFormNotes] = useState('');
  const [accountModalError, setAccountModalError] = useState<string | null>(null);
  // The values the account form was opened with; "dirty" is the difference from it
  const [accountFormBaseline, setAccountFormBaseline] = useState<AccountFormValues>(NEW_ACCOUNT_FORM);

  // Funding Modal
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [fundingAmountPiasters, setFundingAmountPiasters] = useState<number>(0);
  const [fundingSource, setFundingSource] = useState<'cash_drawer' | 'bank_transfer' | 'external_cash'>('cash_drawer');
  const fundingPanel = useMotionPanel(fundingSource);
  const [fundingNotes, setFundingNotes] = useState('');
  const [fundingModalError, setFundingModalError] = useState<string | null>(null);
  const [liveDrawerCashPiasters, setLiveDrawerCashPiasters] = useState<number | null>(null);

  // Cancel Transaction Modal
  const [cancellingTx, setCancellingTx] = useState<DigitalTransaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const fetchLiveDrawerCash = useCallback(async () => {
    try {
      const res = await invoke<{ availableCashPiasters: number }>('drawer:getBalance');
      if (res && typeof res.availableCashPiasters === 'number') {
        setLiveDrawerCashPiasters(res.availableCashPiasters);
      }
    } catch {
      setLiveDrawerCashPiasters(null);
    }
  }, []);

  // Modal Dismiss & Unsaved Changes Protection (ESC key and Outside click)
  const isFundingDirty = useCallback(() => {
    return fundingAmountPiasters > 0 || fundingNotes.trim().length > 0;
  }, [fundingAmountPiasters, fundingNotes]);

  const { requestClose: requestCloseFunding, handleBackdropClick: handleFundingBackdropClick } = useModalDismiss({
    isOpen: isFundingModalOpen,
    onClose: () => setIsFundingModalOpen(false),
    isDirty: isFundingDirty,
    confirmTitle: 'تعديلات شحن الرصيد غير محفوظة',
    confirmMessage: 'لقد قمت بإدخال بيانات لشحن الرصيد. هل أنت متأكد من الخروج وتجاهل العملية؟',
  });

  // Fund Till Cash Modal (تغذية نقدية لدرج المحافظ المنفصل)
  const [isFundTillModalOpen, setIsFundTillModalOpen] = useState(false);
  const [fundTillAmountPiasters, setFundTillAmountPiasters] = useState<number>(0);
  const [fundTillSource, setFundTillSource] = useState<'external_cash' | 'cash_drawer'>('external_cash');
  const fundTillPanel = useMotionPanel(fundTillSource);
  const [fundTillNotes, setFundTillNotes] = useState('');
  const [fundTillModalError, setFundTillModalError] = useState<string | null>(null);
  const [isFundingTillLoading, setIsFundingTillLoading] = useState(false);

  const isFundTillDirty = useCallback(() => {
    return fundTillAmountPiasters > 0 || fundTillNotes.trim().length > 0;
  }, [fundTillAmountPiasters, fundTillNotes]);

  const { requestClose: requestCloseFundTill, handleBackdropClick: handleFundTillBackdropClick } = useModalDismiss({
    isOpen: isFundTillModalOpen,
    onClose: () => {
      setIsFundTillModalOpen(false);
      setFundTillAmountPiasters(0);
      setFundTillNotes('');
      setFundTillModalError(null);
    },
    isDirty: isFundTillDirty,
    confirmTitle: 'تعديلات تغذية النقدية غير محفوظة',
    confirmMessage: 'لقد قمت بإدخال بيانات لتغذية النقدية. هل أنت متأكد من الخروج وتجاهل العملية؟',
  });

  const handleSaveFundTill = async () => {
    if (fundTillAmountPiasters <= 0) {
      setFundTillModalError('يرجى إدخال مبلغ صحيح للتغذية النقدية أكبر من الصفر.');
      return;
    }
    if (fundTillSource === 'cash_drawer' && liveDrawerCashPiasters !== null) {
      if (liveDrawerCashPiasters <= 0) {
        setFundTillModalError('درج كاشير المحل فارغ (0.00 ج.م). يرجى اختيار «كاش خارجي / صاحب المحل».');
        return;
      }
      if (fundTillAmountPiasters > liveDrawerCashPiasters) {
        setFundTillModalError(
          `المبلغ المطلوب (${formatArabicCurrency(fundTillAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى تقليل المبلغ أو اختيار «كاش خارجي / صاحب المحل».`
        );
        return;
      }
    }
    try {
      setIsFundingTillLoading(true);
      setFundTillModalError(null);
      await invoke('wallets:fundTillCash', {
        amountPiasters: fundTillAmountPiasters,
        fundingSource: fundTillSource,
        notes: fundTillNotes.trim() || undefined,
        cashierName: currentUserName,
      });
      setIsFundTillModalOpen(false);
      setFundTillAmountPiasters(0);
      setFundTillNotes('');
      setSuccessMsg(`تمت تغذية نقدية درج المحافظ بمبلغ ${formatArabicCurrency(fundTillAmountPiasters)} بنجاح.`);
      await loadData();
      emitDataChanged(['wallets', 'drawer', 'shifts']);
    } catch (err: any) {
      console.error('Failed to fund till cash:', err);
      setFundTillModalError(err?.message || 'فشلت عملية تغذية النقدية. يرجى إعادة المحاولة.');
    } finally {
      setIsFundingTillLoading(false);
    }
  };

  const isAccountDirty = useCallback(
    () =>
      isFormDirty<AccountFormValues>(accountFormBaseline, {
        name: accountFormName,
        holder: accountFormHolder,
        isDefault: accountFormIsDefault,
        type: accountFormType,
        provider: accountFormProvider,
        phone: accountFormPhone,
        identifier: accountFormIdentifier,
        balance: accountFormBalance,
        dailyLimit: accountFormDailyLimit,
        monthlyLimit: accountFormMonthlyLimit,
        notes: accountFormNotes,
      }),
    [
      accountFormBaseline,
      accountFormName,
      accountFormHolder,
      accountFormIsDefault,
      accountFormType,
      accountFormProvider,
      accountFormPhone,
      accountFormIdentifier,
      accountFormBalance,
      accountFormDailyLimit,
      accountFormMonthlyLimit,
      accountFormNotes,
    ],
  );

  const { requestClose: requestCloseAccount, handleBackdropClick: handleAccountBackdropClick } = useModalDismiss({
    isOpen: isAccountModalOpen,
    onClose: () => setIsAccountModalOpen(false),
    isDirty: isAccountDirty,
    confirmTitle: 'بيانات الحساب غير محفوظة',
    confirmMessage: 'هناك تعديلات على بيانات الحساب لم تُحفظ بعد، هل أنت متأكد من الخروج وتجاهلها؟',
  });

  // Direct Silent Printing for Wallet Receipts
  const [isPrintingWalletReceipt, setIsPrintingWalletReceipt] = useState<boolean>(false);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(true);

  const handlePrintWalletReceipt = async (tx: DigitalTransaction) => {
    if (!tx) return;
    setIsPrintingWalletReceipt(true);
    try {
      const res = await invoke<{ success: boolean; message: string }>('wallets:printReceipt', {
        transactionId: tx.id,
        transaction: tx,
      });
      if (res && res.success) {
        setSuccessMsg('تم إرسال إيصال المحفظة إلى الطابعة بنجاح');
      } else {
        setErrorMsg(res?.message || 'تعذر إرسال أمر الطباعة إلى الطابعة');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر الاتصال بالطابعة أو حدث خطأ أثناء الطباعة';
      setErrorMsg(msg);
    } finally {
      setIsPrintingWalletReceipt(false);
    }
  };

  // Load Data
  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setErrorMsg(null);
    try {
      setLoading(true);
      const [accsRes, txsRes, anRes] = await Promise.all([
        invoke<DigitalAccount[]>('wallets:getAccounts'),
        invoke<DigitalTransaction[]>('wallets:getTransactions', {
          limit: HISTORY_LOAD_LIMIT,
          accountId: filterAccount !== 'all' ? filterAccount : undefined,
          txType: filterType !== 'all' ? filterType : undefined,
          ...getDateFilterPayload(historyDateFilter),
        }),
        invoke<WalletsAnalytics>('wallets:getAnalytics', getDateFilterPayload(analyticsDateFilter)),
      ]);

      // تجاهل ردّ قديم وصل بعد طلب أحدث (تغيير سريع للفلتر)
      if (seq !== loadSeqRef.current) return;

      const accList = Array.isArray(accsRes) ? accsRes : [];
      setAccounts(accList);
      setTransactions(Array.isArray(txsRes) ? txsRes : []);
      setAnalytics(anRes || null);
      void fetchLiveDrawerCash();

      if ((!selectedAccountId || !accList.some((a) => a.id === selectedAccountId)) && accList.length > 0) {
        setSelectedAccountId(accList[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load wallets data:', err);
      setErrorMsg('تعذر تحميل بيانات المحافظ الإلكترونية. تأكد من عمل النظام.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, filterAccount, filterType, historyDateFilter, analyticsDateFilter, fetchLiveDrawerCash]);

  useEffect(() => {
    if (isActive) {
      void loadData();
    }
  }, [isActive, loadData, today]);

  // Event bus subscription for live updates
  useDataSubscription(['wallets', 'all'], () => {
    void loadData();
  });

  // Direct calculation of balances from accounts array for 100% synchronization
  const calculatedWalletsBalancePiasters = useMemo(() => {
    return accounts
      .filter((a) => a.accountType === 'wallet' && a.isActive !== false)
      .reduce((sum, a) => sum + (a.balancePiasters || 0), 0);
  }, [accounts]);

  const calculatedInstapayBalancePiasters = useMemo(() => {
    return accounts
      .filter((a) => a.accountType === 'instapay' && a.isActive !== false)
      .reduce((sum, a) => sum + (a.balancePiasters || 0), 0);
  }, [accounts]);

  const calculatedTotalBalancePiasters = useMemo(() => {
    return accounts
      .filter((a) => a.isActive !== false)
      .reduce((sum, a) => sum + (a.balancePiasters || 0), 0);
  }, [accounts]);

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
  }, [accounts, selectedAccountId]);

  // Financial Calculations for Transaction Workstation
  const isCashOut = txType === 'cash_out';

  // Projected balance in wallet after transaction
  const projectedBalance = useMemo(() => {
    if (!selectedAccount) return 0;
    if (isCashOut) {
      return selectedAccount.balancePiasters - amountPiasters;
    }
    return selectedAccount.balancePiasters + amountPiasters;
  }, [selectedAccount, isCashOut, amountPiasters]);

  const hasInsufficientBalance = isCashOut && selectedAccount && projectedBalance < 0;

  const cashTakenFromCustomer = amountPiasters + profitPiasters;
  const cashGivenToCustomer = Math.max(0, amountPiasters - profitPiasters);

  const availableTillCash = analytics?.totalTerminalTillCashPiasters ?? 0;
  const hasInsufficientCashTill = !isCashOut && cashGivenToCustomer > 0 && cashGivenToCustomer > availableTillCash;
  const hasInsufficientCashDrawer = !isCashOut && cashGivenToCustomer > 0 && liveDrawerCashPiasters !== null && cashGivenToCustomer > liveDrawerCashPiasters;
  const hasInsufficientCash = paymentDestination === 'terminal_till' ? hasInsufficientCashTill : hasInsufficientCashDrawer;

  // Submit Transaction. Resolves true only after the transaction was recorded.
  const resetTransactionForm = () => {
    setAmountPiasters(0);
    setProfitPiasters(0);
    setIsProfitEntered(false);
    setCustomerPhone('');
    setCustomerName('');
    setReferenceNumber('');
    setNotes('');
  };

  const transactionDraftDirty =
    amountPiasters > 0 ||
    profitPiasters > 0 ||
    customerPhone.trim() !== '' ||
    customerName.trim() !== '' ||
    referenceNumber.trim() !== '' ||
    notes.trim() !== '';

  const handleProcessTransaction = async (): Promise<boolean> => {
    if (actionLoading) return false;
    if (!selectedAccount) {
      setErrorMsg('يرجى اختيار المحفظة أو الحساب المطلوب أولاً.');
      scrollToTop();
      return false;
    }

    if (amountPiasters <= 0) {
      setErrorMsg('يرجى إدخال مبلغ صحيح للعملية أكبر من صفر.');
      scrollToTop();
      return false;
    }

    if (!isProfitEntered) {
      setErrorMsg('تنبيه: يجب كتابة أو تحديد ربح المحل / عمولة الوردية (اكتب 0 إذا كانت بدون عمولة لتفادي نسيان تسجيل الأرباح).');
      scrollToTop();
      return false;
    }

    if (hasInsufficientBalance) {
      setErrorMsg(
        `رصيد المحفظة الحالي (${formatArabicCurrency(selectedAccount.balancePiasters)}) غير كافٍ لتنفيذ عملية تحويل بمبلغ (${formatArabicCurrency(amountPiasters)}).`
      );
      scrollToTop();
      return false;
    }

    if (paymentDestination === 'terminal_till' && hasInsufficientCashTill) {
      setErrorMsg(
        `رصيد نقدية درج المحافظ المتاح حالياً (${formatArabicCurrency(availableTillCash)}) غير كافٍ لصرف نقدية السحب للعميل (${formatArabicCurrency(cashGivenToCustomer)}). يرجى تغذية درج المحافظ بالسيولة أولاً.`
      );
      scrollToTop();
      return false;
    }

    if (paymentDestination === 'cash_drawer' && hasInsufficientCashDrawer) {
      setErrorMsg(
        `رصيد النقدية المتاح بدرج الكاشير (${formatArabicCurrency(liveDrawerCashPiasters ?? 0)}) غير كافٍ لصرف نقدية السحب للعميل (${formatArabicCurrency(cashGivenToCustomer)}). يرجى تغذية الدرج بالسيولة أولاً.`
      );
      scrollToTop();
      return false;
    }

    let saved = false;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await invoke<DigitalTransaction>('wallets:processTransaction', {
        accountId: selectedAccount.id,
        txType,
        amountPiasters,
        profitPiasters,
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentDestination,
        cashierName: currentUserName,
        performedBy: currentUserName,
      });
      saved = true;

      setLastProcessedTx(res);
      setSuccessMsg(`تم تنفيذ عملية "${isCashOut ? 'تحويل كاش لرقم الزبون' : 'سحب كاش للزبون'}". صافي ربح المحل: ${formatArabicCurrency(profitPiasters)}`);

      if (autoPrintReceipt && res) {
        void handlePrintWalletReceipt(res);
      }

      resetTransactionForm();
      await loadData();
    } catch (err: any) {
      console.error('Failed to process wallet transaction:', err);
      setErrorMsg(err?.message || 'فشلت معالجة المعاملة. يرجى إعادة المحاولة.');
      scrollToTop();
    } finally {
      setActionLoading(false);
    }
    return saved;
  };

  const { saveBarRef: transactSaveBarRef } = useUnsavedChangesGuard({
    id: 'wallets-transact',
    label: 'عملية المحفظة الجارية',
    isDirty: transactionDraftDirty,
    isActive,
    keepsStateWithinPage: true,
    // Same handler and validation as the confirm button; without an amount there is nothing to record
    save: amountPiasters > 0 ? handleProcessTransaction : undefined,
    discard: resetTransactionForm,
    onAttention: () => {
      if (currentTab !== 'transact') onSubTabChange?.('transact');
    },
  });

  // Open Funding Modal
  const handleOpenFundingModal = (accId?: string) => {
    setFundingAccountId(accId || selectedAccountId || (accounts[0] ? accounts[0].id : ''));
    setFundingAmountPiasters(0);
    setFundingSource('cash_drawer');
    setFundingNotes('');
    setFundingModalError(null);
    void fetchLiveDrawerCash();
    setIsFundingModalOpen(true);
  };

  // Save Funding
  const handleSaveFunding = async () => {
    if (!fundingAccountId || fundingAmountPiasters <= 0) {
      setFundingModalError('يرجى اختيار الحساب وتحديد مبلغ شحن صحيح أكبر من صفر.');
      return;
    }

    if (fundingSource === 'cash_drawer' && liveDrawerCashPiasters !== null) {
      if (liveDrawerCashPiasters <= 0) {
        setFundingModalError(
          'درج الكاشير فارغ (0.00 ج.م). لا يمكن سحب نقدية من درج فارغ. يرجى اختيار «كاش خارجي / صاحب المحل» إذا كان المبلغ مدفوعاً من خارج عهدة الدرج.'
        );
        return;
      }
      if (fundingAmountPiasters > liveDrawerCashPiasters) {
        setFundingModalError(
          `المبلغ المطلوب (${formatArabicCurrency(fundingAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى تقليل المبلغ أو اختيار «كاش خارجي / صاحب المحل».`
        );
        return;
      }
    }

    try {
      setActionLoading(true);
      setFundingModalError(null);
      await invoke('wallets:fundAccount', {
        accountId: fundingAccountId,
        amountPiasters: fundingAmountPiasters,
        fundingSource: fundingSource,
        source: fundingSource,
        notes: fundingNotes.trim() || undefined,
        performedBy: currentUserName,
      });

      setIsFundingModalOpen(false);
      setSuccessMsg(`تم شحن رصيد المحفظة بمبلغ ${formatArabicCurrency(fundingAmountPiasters)}`);
      await loadData();
    } catch (err: any) {
      console.error('Failed to fund account:', err);
      setFundingModalError(err?.message || 'فشلت عملية شحن المحفظة.');
    } finally {
      setActionLoading(false);
    }
  };

  // The first active account of a type, and the current main account, are always the main one (the host enforces it too)
  const accountHasActivePeer = accounts.some(
    (a) => a.accountType === accountFormType && a.isActive !== false && a.id !== editingAccount?.id,
  );
  const accountMainLocked = !accountHasActivePeer || editingAccount?.isDefault === true;

  // Handle Account Type Switching in Modal
  const handleAccountTypeChange = (newType: DigitalAccountType) => {
    setAccountFormType(newType);
    setAccountFormIsDefault(false);
    if (newType === 'instapay') {
      const defaultBank = INSTAPAY_BANKS[0];
      setAccountFormProvider(defaultBank.code);
      setAccountFormName(`إنستاباي - ${defaultBank.shortName}`);
      setAccountFormDailyLimit(7000000); // 70,000 EGP standard InstaPay limit
      setAccountFormMonthlyLimit(40000000); // 400,000 EGP standard InstaPay limit
    } else {
      const defaultWallet = EGYPTIAN_WALLETS[0];
      setAccountFormProvider(defaultWallet.code);
      setAccountFormName(`${defaultWallet.shortName} - المحل`);
      setAccountFormDailyLimit(6000000); // 60,000 EGP standard Wallet limit
      setAccountFormMonthlyLimit(20000000); // 200,000 EGP standard Wallet limit
    }
  };

  // Handle Provider / Bank Selection Change
  const handleProviderChange = (newProviderCode: string) => {
    setAccountFormProvider(newProviderCode);
    if (accountFormType === 'instapay') {
      const bank = INSTAPAY_BANKS.find((b) => b.code === newProviderCode);
      if (bank && (!accountFormName || accountFormName.startsWith('إنستاباي -'))) {
        setAccountFormName(`إنستاباي - ${bank.shortName}`);
      }
    } else {
      const wallet = EGYPTIAN_WALLETS.find((w) => w.code === newProviderCode);
      if (wallet && (!accountFormName || accountFormName.includes('كاش') || accountFormName.includes('باي') || accountFormName.includes('محفظة'))) {
        setAccountFormName(`${wallet.shortName} - المحل`);
      }
    }
  };

  // Open Account Modal
  const handleOpenAccountModal = (acc?: DigitalAccount) => {
    const values = acc ? accountToFormValues(acc) : NEW_ACCOUNT_FORM;
    setEditingAccount(acc ?? null);
    setAccountFormName(values.name);
    setAccountFormHolder(values.holder);
    setAccountFormIsDefault(values.isDefault);
    setAccountFormType(values.type);
    setAccountFormProvider(values.provider);
    setAccountFormPhone(values.phone);
    setAccountFormIdentifier(values.identifier);
    setAccountFormBalance(values.balance);
    setAccountFormDailyLimit(values.dailyLimit);
    setAccountFormMonthlyLimit(values.monthlyLimit);
    setAccountFormNotes(values.notes);
    setAccountFormBaseline(values);
    setAccountModalError(null);
    setIsAccountModalOpen(true);
  };

  // Save Account
  const handleSaveAccount = async () => {
    if (!accountFormName.trim()) {
      setAccountModalError('يرجى كتابة اسم تعريفي للمحفظة أو الحساب.');
      return;
    }

    try {
      setActionLoading(true);
      setAccountModalError(null);
      await invoke('wallets:saveAccount', {
        id: editingAccount ? editingAccount.id : undefined,
        name: accountFormName.trim(),
        holderName: accountFormHolder.trim(),
        isDefault: accountMainLocked ? true : accountFormIsDefault,
        type: accountFormType,
        accountType: accountFormType,
        provider: accountFormProvider,
        accountNumber: (accountFormIdentifier || accountFormPhone || '').trim(),
        phoneNumber: accountFormPhone.trim() || undefined,
        identifier: accountFormIdentifier.trim() || undefined,
        balancePiasters: accountFormBalance,
        lowBalanceAlertPiasters: 50000,
        dailyLimitPiasters: accountFormDailyLimit,
        monthlyLimitPiasters: accountFormMonthlyLimit,
        notes: accountFormNotes.trim() || undefined,
        isActive: true,
      });

      setSuccessMsg(
        editingAccount
          ? `تم تحديث الحساب (${accountFormName})`
          : `تمت إضافة الحساب (${accountFormName})`
      );

      setIsAccountModalOpen(false);
      await loadData();
      emitDataChanged('wallets');
    } catch (err: any) {
      console.error('Failed to save account:', err);
      setAccountModalError(err?.message || 'فشل حفظ بيانات الحساب.');
    } finally {
      setActionLoading(false);
    }
  };

  // Make an account the main one of its type (dedicated host action: touches only the main flag, never balances or limits)
  const handleSetDefaultAccount = async (acc: DigitalAccount) => {
    try {
      setActionLoading(true);
      await invoke('wallets:setDefaultAccount', { id: acc.id });
      setSuccessMsg(
        `تم تعيين (${acc.name}) كحساب رئيسي لـ${acc.accountType === 'instapay' ? 'إنستاباي' : 'المحافظ'}`
      );
      await loadData();
      emitDataChanged('wallets');
    } catch (err: any) {
      console.error('Failed to set main account:', err);
      setErrorMsg(err?.message || 'تعذر تعيين الحساب الرئيسي.');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Account
  const handleDeleteAccount = async (acc: DigitalAccount) => {
    const confirmed = await rafiqConfirm({
      title: 'حذف المحفظة أو الحساب',
      message: `هل أنت متأكد من حذف (${acc.name})؟ لن يمكن التراجع في حالة وجود حركات مرتبطة بها.`,
      confirmText: 'نعم، حذف الحساب',
      cancelText: 'إلغاء',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      setActionLoading(true);
      await invoke('wallets:deleteAccount', { id: acc.id });
      setIsAccountModalOpen(false);
      setSuccessMsg(`تم حذف المحفظة (${acc.name})`);
      await loadData();
      emitDataChanged('wallets');
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      setErrorMsg(err?.message || 'تعذر حذف المحفظة لوجود حركات مسجلة عليها.');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel / Reverse Transaction
  const handleCancelTransaction = async () => {
    if (!cancellingTx) return;
    if (!cancelReason.trim()) return;
    try {
      setIsSubmittingCancel(true);
      await invoke('wallets:cancelTransaction', {
        transactionId: cancellingTx.id,
        reason: cancelReason.trim(),
        cashierName: currentUserName,
        performedBy: currentUserName,
      });
      setCancellingTx(null);
      setCancelReason('');
      setSuccessMsg('تم إلغاء العملية وتصحيح رصيد المحفظة والدرج');
      await loadData();
      emitDataChanged('wallets');
    } catch (err: unknown) {
      console.error('Failed to cancel wallet transaction:', err);
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqConfirm({
        title: 'تعذر إلغاء العملية',
        message: msg || 'فشل إلغاء العملية، يرجى مراجعة الرصيد وحالة اليومية المالية.',
        confirmText: 'حسناً',
        variant: 'danger',
      });
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Filtered History
  // الحساب والنوع والفترة تُطبَّق في قاعدة البيانات (انظر loadData)، والبحث النصي ووجهة النقدية فوق النتيجة المحمّلة
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterDestination !== 'all') {
        const dest = t.paymentDestination || 'cash_drawer';
        if (dest !== filterDestination) return false;
      }
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const matchesRef = t.transactionNumber?.toLowerCase().includes(q) || t.referenceNumber?.toLowerCase().includes(q);
        const matchesPhone = t.customerPhone?.toLowerCase().includes(q);
        const matchesName = t.customerName?.toLowerCase().includes(q);
        const matchesNotes = t.notes?.toLowerCase().includes(q);
        if (!matchesRef && !matchesPhone && !matchesName && !matchesNotes) return false;
      }
      return true;
    });
  }, [transactions, historySearch, filterDestination]);

  const {
    paginatedItems: paginatedHistory,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalCount,
    totalPages,
  } = useClientPagination(
    filteredTransactions,
    15,
    `${historySearch}_${filterAccount}_${filterType}_${filterDestination}_${getDateFilterKey(historyDateFilter)}`
  );

  const isHistoryFiltered =
    historySearch.trim() !== '' ||
    filterAccount !== 'all' ||
    filterType !== 'all' ||
    filterDestination !== 'all' ||
    isDateFilterActive(historyDateFilter);
  const isHistoryCapped = transactions.length >= HISTORY_LOAD_LIMIT;

  const resetHistoryFilters = () => {
    setHistorySearch('');
    setFilterAccount('all');
    setFilterType('all');
    setFilterDestination('all');
    resetHistoryDateFilter();
  };

  // Filtered Analytics Metrics based on analyticsDateFilter
  const periodTransactionsCount = analytics?.periodTransactionsCount || 0;
  const periodProfitPiasters = analytics?.periodProfitPiasters || 0;
  const _periodVolumePiasters = analytics?.periodVolumePiasters || 0;
  void _periodVolumePiasters;
  const periodDrawerCashPiasters = analytics?.periodDrawerCashPiasters || 0;
  const periodTerminalTillCashPiasters = analytics?.periodTerminalTillCashPiasters || 0;
  const periodTotalCashPiasters = analytics?.periodTotalCashPiasters || (periodDrawerCashPiasters + periodTerminalTillCashPiasters);
  const totalDrawerCashPiasters = analytics?.totalDrawerCashPiasters || 0;
  void totalDrawerCashPiasters;

  const totalAllTimeProfitPiasters = analytics?.totalProfitPiasters || 0;
  const totalDigitalBalancesPiasters = calculatedWalletsBalancePiasters + calculatedInstapayBalancePiasters;
  const grandTotalLiquidityPiasters = totalDigitalBalancesPiasters + periodTotalCashPiasters;

  // Options for Selects
  const accountSelectOptions = useMemo(() => {
    return accounts.map((a) => {
      const info = getAccountDisplayInfo(a);
      return {
        value: a.id,
        label: `${a.name} [${info.badge}] (الرصيد: ${formatArabicCurrency(a.balancePiasters)})`,
      };
    });
  }, [accounts]);

  const filterAccountOptions = useMemo(() => {
    return [
      { value: 'all', label: 'جميع الحسابات والمحافظ' },
      ...accounts.map((a) => ({
        value: a.id,
        label: a.name,
      })),
    ];
  }, [accounts]);

  const filterTypeOptions = [
    { value: 'all', label: 'جميع أنواع العمليات' },
    { value: 'cash_out', label: 'تحويل كاش لرقم الزبون (إيداع)' },
    { value: 'cash_in', label: 'سحب كاش للزبون (صرف نقدية)' },
    { value: 'sale_credit', label: 'سداد مبيعات الكاشير' },
    { value: 'funding', label: 'شحن وتغذية رصيد' },
  ];

  const filterDestinationOptions = [
    { value: 'all', label: 'كل وجهات النقدية' },
    { value: 'cash_drawer', label: 'درج كاشير المحل' },
    { value: 'terminal_till', label: 'درج المحافظ المستقل' },
    { value: 'external_cash', label: 'كاش خارجي / صاحب المحل' },
  ];

  return (
    <div ref={containerRef} {...motionPanel} className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark select-none overflow-y-auto" dir="rtl">

      {/* 1. Standard Rafiq POS Top Header Bar (Matching EpayView style) */}
      <header className="motion-static bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center shrink-0 shadow-2xs">
            {currentTab === 'transact' && <Smartphone className="w-5 h-5" />}
            {currentTab === 'accounts' && <CreditCard className="w-5 h-5" />}
            {currentTab === 'history' && <Receipt className="w-5 h-5" />}
            {currentTab === 'analytics' && <TrendingUp className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-micro font-bold text-ink-muted dark:text-ink-muted-dark">المحافظ الإلكترونية وإنستاباي</span>
              <span className="text-ink-muted dark:text-ink-muted-dark font-bold" aria-hidden="true">/</span>
              <h1 className="t-page-title text-ink dark:text-ink-dark m-0">
                {currentTab === 'transact' && 'تنفيذ عملية سريعة (سحب / إيداع)'}
                {currentTab === 'accounts' && 'أرصدة المحافظ والحسابات'}
                {currentTab === 'history' && 'سجل العمليات والإيصالات'}
                {currentTab === 'analytics' && 'أرباح وتحليلات المحافظ'}
              </h1>
            </div>
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5 font-medium">
              {currentTab === 'transact' && 'سحب نقدي وتحويل للزبائن مع التحكم المباشر بمبلغ العملية وربح المحل'}
              {currentTab === 'accounts' && 'متابعة أرصدة المحافظ والحدود اليومية والشهرية وتغذية الرصيد'}
              {currentTab === 'history' && 'أرشيف العمليات المنجزة وأرقام الإيصالات وسجل التدقيق المالي'}
              {currentTab === 'analytics' && 'تقارير أرباح المحافظ المستقلة عن بضاعة المحل والسيولة النقدية'}
            </p>
          </div>
        </div>

        {/* Context-Aware Action Buttons - Only Relevant Actions per Tab */}
        <div className="flex items-center gap-2">
          {canFund && (
            <AppButton
              variant="secondary"
              size="md"
              icon={Banknote}
              onClick={() => {
                setFundTillSource('external_cash');
                setFundTillModalError(null);
                void fetchLiveDrawerCash();
                setIsFundTillModalOpen(true);
              }}
            >
              تغذية نقدية لدرج المحافظ
            </AppButton>
          )}
          {currentTab === 'accounts' && canManageAccounts && accounts.length > 0 && (
            <AppButton variant="primary" size="md" icon={PlusCircle} onClick={() => handleOpenAccountModal()}>
              إضافة محفظة / حساب بنكي
            </AppButton>
          )}
        </div>
      </header>

      {/* 2. Top Summary 4-KPI Cards (Displayed on Accounts tab for authorized users, exactly like EpayView) */}
      {currentTab === 'accounts' && (canManageAccounts || canFund) && (
        <section className="px-4 sm:px-6 pt-3.5 shrink-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: إجمالي رصيد المحافظ والإنستاباي */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-paid/40 dark:hover:border-paid-bright/40 transition-colors">
              <div className="min-w-0">
                <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">إجمالي رصيد المحافظ والإنستاباي</span>
                <div className="flex items-baseline gap-1">
                  <span className="t-kpi-lg font-mono text-paid dark:text-paid-bright tracking-tight">
                    {analytics?.totalBalanceFormatted || formatArabicCurrency(calculatedTotalBalancePiasters)}
                  </span>
                </div>
                <span className="text-micro text-paid dark:text-paid-bright font-medium block mt-0.5">جاهز للسحب والتحويل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-bright/30 flex items-center justify-center text-paid dark:text-paid-bright shadow-2xs shrink-0">
                <Wallet className="w-4.5 h-4.5 shrink-0" />
              </div>
            </div>

            {/* Card 2: صافي الربح */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-brand/40 dark:hover:border-brand-bright/40 transition-colors">
              <div className="min-w-0">
                <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">صافي أرباح المحافظ</span>
                <div className="flex items-baseline gap-1">
                  <span className="t-kpi-lg font-mono text-brand dark:text-brand-bright tracking-tight">
                    {formatArabicCurrency(totalAllTimeProfitPiasters)}
                  </span>
                </div>
                <span className="text-micro text-brand dark:text-brand-bright font-medium block mt-0.5">عمولات ورسوم العمليات</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-bright/15 border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs shrink-0">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 3: رصيد محافظ الكاش */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-line-hover dark:hover:border-line-dark-hover transition-colors">
              <div className="min-w-0">
                <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">رصيد محافظ الكاش</span>
                <div className="flex items-baseline gap-1">
                  <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark tracking-tight">
                    {analytics?.walletsBalanceFormatted || formatArabicCurrency(calculatedWalletsBalancePiasters)}
                  </span>
                </div>
                <span className="text-micro text-ink-muted dark:text-ink-muted-dark block mt-0.5">فودافون، أورانج، اتصالات، وي</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark shadow-2xs shrink-0">
                <Smartphone className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 4: رصيد إنستاباي */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-line-hover dark:hover:border-line-dark-hover transition-colors">
              <div className="min-w-0">
                <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">رصيد حسابات إنستاباي</span>
                <div className="flex items-baseline gap-1">
                  <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark tracking-tight">
                    {analytics?.instapayBalanceFormatted || formatArabicCurrency(calculatedInstapayBalancePiasters)}
                  </span>
                </div>
                <span className="text-micro text-paid dark:text-paid-bright font-medium block mt-0.5">الحسابات والبطاقات البنكية</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark shadow-2xs shrink-0">
                <Landmark className="w-4.5 h-4.5" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Notifications Alert Banner (Full width matching EpayView) */}
      {errorMsg && (
        <div className="bg-danger-soft dark:bg-danger-dark-soft border-b border-danger/20 dark:border-danger-bright/30 px-6 py-2.5 text-danger dark:text-danger-bright text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <AppButton variant="subtle" size="xs" icon={X} aria-label="إغلاق التنبيه" onClick={() => setErrorMsg(null)} />
        </div>
      )}
      {successMsg && (
        <div className="bg-paid-soft dark:bg-paid-dark-soft border-b border-paid-border dark:border-paid-bright/30 px-6 py-2.5 text-paid dark:text-paid-bright text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span>{successMsg}</span>
          </div>
          <AppButton variant="subtle" size="xs" icon={X} aria-label="إغلاق التنبيه" onClick={() => setSuccessMsg(null)} />
        </div>
      )}

      {/* 3. Main Workspace Area */}
      <div className="flex-1 p-4 sm:p-6 min-h-0">

        {/* ================================================================ */}
        {/* SUB-TAB 1: TRANSACT (The High-Speed Senior Workstation)           */}
        {/* ================================================================ */}
        {currentTab === 'transact' && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Left Column: 7 Cols - Main Entry Form */}
            <div className="lg:col-span-7 bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-5 sm:p-6 flex flex-col gap-5 shadow-2xs">
              <p className="text-micro text-ink-muted dark:text-ink-muted-dark -mb-2">الحقول المميزة بعلامة * مطلوبة</p>

              {/* Step 1: Account Selection */}
              <div>
                <StepHeading step={1} title="اختيار المحفظة أو الحساب المطلوب" />
                {accounts.length === 0 ? (
                  <div className="p-4 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl text-warn dark:text-warn-bright text-sm font-bold flex flex-wrap items-center justify-between gap-3">
                    <span>لا توجد محافظ أو حسابات إنستاباي مسجلة حالياً.</span>
                    <AppButton variant="primary" size="md" icon={Plus} onClick={() => handleOpenAccountModal()}>
                      إضافة حساب الآن
                    </AppButton>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {accounts.map((acc) => {
                      const isSelected = acc.id === selectedAccountId;
                      const info = getAccountDisplayInfo(acc);
                      return (
                        <button
                          type="button"
                          key={acc.id}
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`cursor-pointer p-4 rounded-xl border text-right transition-all ${
                            isSelected
                              ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-bright/15 ring-2 ring-brand/20 dark:ring-brand-bright/20 shadow-2xs'
                              : 'border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-hover bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm text-ink dark:text-ink-dark block truncate">{acc.name}</span>
                            <span className={`text-micro font-bold px-2 py-0.5 rounded-full border ${info.border} ${info.bgSoft} ${info.text}`}>
                              {info.badge}
                            </span>
                          </div>
                          <span className="text-micro text-ink-muted dark:text-ink-muted-dark block mt-0.5 font-mono">
                            {formatPhoneDisplay(acc.phoneNumber || acc.identifier) || 'رقم الحساب'}
                          </span>
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-ink-muted dark:text-ink-muted-dark">الرصيد المتاح</span>
                            <span className={`text-base font-black font-mono tabular-nums ${acc.balancePiasters < 50000 ? 'text-warn dark:text-warn-bright' : 'text-paid dark:text-paid-bright'}`}>
                              {formatArabicCurrency(acc.balancePiasters)}
                            </span>
                          </div>
                          {acc.balancePiasters < 50000 && (
                            <div className="mt-1.5 text-micro text-warn dark:text-warn-bright font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-warn dark:text-warn-bright shrink-0" />
                              الرصيد منخفض
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Operation Type Segmented Presets */}
              <div className="border-t border-line dark:border-line-dark pt-5">
                <StepHeading step={2} title="نوع العملية" hint="حدد هل العملية تحويل كاش للزبون أو سحب كاش" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    key="cash_out"
                    type="button"
                    onClick={() => setTxType('cash_out')}
                    className={`p-3.5 min-h-[5.5rem] rounded-xl border text-right transition-all flex flex-col gap-2 cursor-pointer ${
                      isCashOut
                        ? 'border-brand dark:border-brand-bright bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright shadow-xs dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                        : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowDownLeft className={`w-5 h-5 shrink-0 ${isCashOut ? 'text-white dark:text-brand-bright' : 'text-danger dark:text-danger-bright'}`} />
                        <span className="text-xs font-bold leading-snug">تحويل كاش لرقم الزبون (إيداع)</span>
                      </div>
                      <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${isCashOut ? 'bg-white/20 text-white dark:text-brand-bright' : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'}`}>
                        خصم من المحفظة
                      </span>
                    </div>
                    <span className={`text-micro leading-relaxed ${isCashOut ? 'text-white/80 dark:text-brand-bright/80' : 'text-ink-muted dark:text-ink-muted-dark'}`}>
                      الزبون يسلمك نقدية كاش في الدرج (+ ربح المحل)، وأنت تحول له المبلغ من محفظتك
                    </span>
                  </button>

                  <button
                    key="cash_in"
                    type="button"
                    onClick={() => setTxType('cash_in')}
                    className={`p-3.5 min-h-[5.5rem] rounded-xl border text-right transition-all flex flex-col gap-2 cursor-pointer ${
                      !isCashOut
                        ? 'border-brand dark:border-brand-bright bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright shadow-xs dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                        : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className={`w-5 h-5 shrink-0 ${!isCashOut ? 'text-white dark:text-brand-bright' : 'text-paid dark:text-paid-bright'}`} />
                        <span className="text-xs font-bold leading-snug">سحب كاش للزبون (صرف نقدية)</span>
                      </div>
                      <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${!isCashOut ? 'bg-white/20 text-white dark:text-brand-bright' : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'}`}>
                        إضافة للمحفظة
                      </span>
                    </div>
                    <span className={`text-micro leading-relaxed ${!isCashOut ? 'text-white/80 dark:text-brand-bright/80' : 'text-ink-muted dark:text-ink-muted-dark'}`}>
                      الزبون يحول لمحفظتك، وأنت تسلمه نقدية كاش في يده من الدرج (مخصوماً منها ربح المحل)
                    </span>
                  </button>
                </div>
              </div>

              {/* Step 3: Amounts (Operation Amount & Shop Profit) */}
              <div className="border-t border-line dark:border-line-dark pt-5 flex flex-col gap-3.5">
                <StepHeading
                  step={3}
                  title={isCashOut ? 'مبلغ التحويل للزبون وربح المحل' : 'مبلغ السحب والربح'}
                  hint={isCashOut ? 'المبلغ يُخصم من رصيد المحفظة ويُستلم نقداً من العميل مع ربح المحل للدرج' : 'المبلغ يُضاف لرصيد المحفظة ويُصرف نقداً للعميل بعد خصم عمولة المحل'}
                />

                <div className="p-4 sm:p-5 rounded-2xl bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark transition-all focus-within:border-brand/50 dark:focus-within:border-brand-bright/50 focus-within:bg-surface dark:focus-within:bg-surface-dark">
                  <label className="text-sm font-black text-ink dark:text-ink-dark flex items-center gap-2 mb-2.5">
                    <Receipt className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark" />
                    <span>{isCashOut ? 'مبلغ التحويل لرقم الزبون' : 'مبلغ السحب المطلوب من الزبون'} <RequiredMark /></span>
                  </label>
                  <MoneyInput
                    valuePiasters={amountPiasters}
                    onChangePiasters={setAmountPiasters}
                    placeholder="0.00"
                    className="h-14 text-3xl font-black"
                    autoFocus
                  />
                </div>

                <div className={`p-4 sm:p-5 rounded-2xl transition-all ${
                  !isProfitEntered && amountPiasters > 0
                    ? 'bg-warn-soft/20 dark:bg-warn-dark-soft/20 border-2 border-warn/50 dark:border-warn-bright/50'
                    : 'bg-paid-soft/40 dark:bg-paid-dark-soft/40 border border-paid/25 dark:border-paid-bright/30 focus-within:border-paid dark:focus-within:border-paid-bright'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <label className="text-sm font-black text-paid dark:text-paid-bright flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                      <span>ربح المحل / عمولة الوردية</span>
                      <RequiredMark />
                    </label>
                    {!isProfitEntered && amountPiasters > 0 && (
                      <span className="text-micro font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft px-2 py-0.5 rounded border border-warn/30">
                        إلزامي (حدد 0 إذا مجاناً) *
                      </span>
                    )}
                  </div>
                  <MoneyInput
                    valuePiasters={profitPiasters}
                    onChangePiasters={(val) => {
                      setProfitPiasters(val);
                      setIsProfitEntered(true);
                    }}
                    placeholder="0.00"
                    className="h-14 text-2xl sm:text-3xl font-black text-paid dark:text-paid-bright"
                  />
                </div>
              </div>

              {/* Step 4: Customer Details */}
              <div className="border-t border-line dark:border-line-dark pt-5">
                <StepHeading step={4} title="بيانات الزبون والعملية" hint="رقم الهاتف أو المعرف يظهر في الإيصال" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className={FIELD_LABEL_CLS}>رقم هاتف الزبون</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={`${FIELD_INPUT_CLS} font-mono text-left`}
                      placeholder="010xxxxxxxx"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLS}>اسم العميل</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={FIELD_INPUT_CLS}
                      placeholder="اسم صاحب التحويل للرجوع إليه"
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLS}>رقم العملية / المرجع</label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className={`${FIELD_INPUT_CLS} font-mono text-left`}
                      placeholder="رقم مرجع الرسالة أو المعاملة"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLS}>ملاحظات</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={FIELD_INPUT_CLS}
                      placeholder="ملاحظات توضيحية عن العملية"
                    />
                  </div>
                </div>
              </div>

              {/* Step 5: Cash Destination */}
              <div className="border-t border-line dark:border-line-dark pt-5">
                <StepHeading step={5} title={isCashOut ? 'أين يتم توريد واستلام نقدية الزبون؟' : 'من أين يتم صرف نقدية السحب للزبون؟'} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentDestination('terminal_till')}
                    className={`cursor-pointer p-3.5 rounded-xl border flex items-center gap-3 text-right transition-all ${
                      paymentDestination === 'terminal_till'
                        ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-bright/15 ring-1 ring-brand dark:ring-brand-bright text-brand-dark dark:text-brand-bright'
                        : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                    }`}
                  >
                    <Wallet className="w-5 h-5 text-brand dark:text-brand-bright shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold">درج/محفظة الكاش المنفصلة</span>
                        <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-bright/30">
                          الافتراضي
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark">نقدية الدرج المتاحة:</span>
                        <span className={`text-xs font-mono font-bold ${availableTillCash > 0 ? 'text-brand dark:text-brand-bright' : 'text-danger dark:text-danger-bright'}`}>
                          {formatArabicCurrency(availableTillCash)}
                        </span>
                        {hasInsufficientCashTill && (
                          <span className="text-micro font-bold text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/30">
                            عجز نقدية
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentDestination('cash_drawer')}
                    className={`cursor-pointer p-3.5 rounded-xl border flex items-center gap-3 text-right transition-all ${
                      paymentDestination === 'cash_drawer'
                        ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-bright/15 ring-1 ring-brand dark:ring-brand-bright text-brand-dark dark:text-brand-bright'
                        : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                    }`}
                  >
                    <Banknote className="w-5 h-5 text-ink-muted dark:text-ink-muted-dark shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold block">درج كاشير المحل</span>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark">نقدية الدرج المتاحة:</span>
                        <span className={`text-xs font-mono font-bold ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                          {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                        </span>
                        {hasInsufficientCashDrawer && (
                          <span className="text-micro font-bold text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/30">
                            عجز نقدية
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

            </div>

            {/* Right Column: 5 Cols - Financial Summary & Confirmation */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-5 sm:p-6 flex flex-col gap-4 shadow-2xs sticky top-4">
                <h2 className="t-section-title text-ink dark:text-ink-dark border-b border-line dark:border-line-dark pb-3 flex items-center gap-2 m-0">
                  <Receipt className="w-5 h-5 text-brand dark:text-brand-bright" />
                  ملخص العملية
                </h2>

                {/* Total Box */}
                <div className="p-5 rounded-2xl bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-bright/30">
                  <span className="text-xs text-paid dark:text-paid-bright font-black block mb-1.5">
                    {isCashOut ? 'المطلوب تحصيله كاش من الزبون (للدرج)' : 'المطلوب تسليمه كاش للزبون (من الدرج)'}
                  </span>
                  <div className="text-4xl font-black font-mono text-paid dark:text-paid-bright tracking-tight tabular-nums">
                    {formatArabicCurrency(isCashOut ? cashTakenFromCustomer : cashGivenToCustomer)}
                  </div>
                  <span className="text-micro font-medium text-paid dark:text-paid-bright block mt-1 min-h-4">
                    {isCashOut ? '(شامل مبلغ التحويل وربح المحل)' : '(المبلغ المطلوب صرفه نقداً للزبون بعد خصم عمولة المحل)'}
                  </span>
                </div>

                {/* Breakdown */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted dark:text-ink-muted-dark">
                      {isCashOut ? 'مبلغ التحويل الأساسي' : 'مبلغ السحب الأساسي'}
                    </span>
                    <span className="font-bold font-mono text-ink dark:text-ink-dark tabular-nums">{formatArabicCurrency(amountPiasters)}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-ink-muted dark:text-ink-muted-dark block">ربح المحل (صافي)</span>
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark">
                        {isCashOut ? 'عمولة وإيراد المحل من التحويل' : 'عمولة مستحقة مخصومة من السحب'}
                      </span>
                    </div>
                    <span className="font-black font-mono text-paid dark:text-paid-bright tabular-nums">+{formatArabicCurrency(profitPiasters)}</span>
                  </div>

                  {/* Wallet Balance Impact */}
                  <div className={`mt-1 p-3.5 rounded-xl border ${
                    hasInsufficientBalance ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30' : 'bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark'
                  }`}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-ink-muted dark:text-ink-muted-dark font-medium">
                        {isCashOut ? 'المخصوم من رصيد المحفظة' : 'المضاف إلى رصيد المحفظة'}
                      </span>
                      <span className={`font-bold font-mono tabular-nums ${isCashOut ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'}`}>
                        {isCashOut ? `-${formatArabicCurrency(amountPiasters)}` : `+${formatArabicCurrency(amountPiasters)}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted dark:text-ink-muted-dark font-medium">الرصيد المتبقي بعد العملية</span>
                      <span className={`font-black font-mono tabular-nums ${
                        hasInsufficientBalance ? 'text-danger dark:text-danger-bright' : 'text-ink dark:text-ink-dark'
                      }`}>
                        {selectedAccount ? formatArabicCurrency(projectedBalance) : '0.00 ج.م'}
                      </span>
                    </div>

                    <div
                      aria-hidden={!hasInsufficientBalance}
                      className={`mt-2 text-xs font-bold flex items-center gap-1.5 text-danger dark:text-danger-bright h-5 ${hasInsufficientBalance ? '' : 'invisible'}`}
                    >
                      <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                      <span>{selectedAccount ? 'رصيد المحفظة غير كافٍ لإتمام العملية!' : 'يرجى اختيار محفظة أولاً'}</span>
                    </div>
                  </div>

                  {hasInsufficientCash && (
                    <div className="mt-2.5 p-3 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 text-danger dark:text-danger-bright text-xs flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>عجز نقدية في {paymentDestination === 'terminal_till' ? 'درج المحافظ المنفصل' : 'درج كاشير المحل'}!</span>
                      </div>
                      <p className="text-micro leading-relaxed">
                        المبلغ المطلوب تسليمه كاش للعميل ({formatArabicCurrency(cashGivenToCustomer)}) أكبر من رصيد الدرج المتاح ({formatArabicCurrency(paymentDestination === 'terminal_till' ? availableTillCash : (liveDrawerCashPiasters ?? 0))}).
                      </p>
                      {paymentDestination === 'terminal_till' && canFund && (
                        <button
                          type="button"
                          onClick={() => {
                            setFundTillSource('external_cash');
                            setFundTillModalError(null);
                            void fetchLiveDrawerCash();
                            setIsFundTillModalOpen(true);
                          }}
                          className="cursor-pointer text-micro font-bold text-brand dark:text-brand-bright hover:underline flex items-center gap-1 mt-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ تغذية درج المحافظ بالنقدية الآن</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Auto print toggle card */}
                <div
                  onClick={() => setAutoPrintReceipt(!autoPrintReceipt)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer select-none transition-all ${
                    autoPrintReceipt
                      ? 'bg-paid-soft/40 dark:bg-paid-dark-soft/40 border-paid/30 dark:border-paid-bright/30 hover:border-paid/50'
                      : 'bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                        autoPrintReceipt
                          ? 'bg-paid dark:bg-paid-bright text-white dark:text-surface-dark shadow-xs'
                          : 'bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark'
                      }`}
                    >
                      <Printer className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-ink dark:text-ink-dark block">
                        طباعة إيصال للعميل فور إتمام العملية
                      </span>
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark">
                        {autoPrintReceipt
                          ? 'سيتم إرسال الإيصال للطابعة مباشرة دون نوافذ منبثقة'
                          : 'حفظ وتسجيل المعاملة بدون طباعة إيصال ورقي'}
                      </span>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={autoPrintReceipt}
                    onChange={(val) => setAutoPrintReceipt(val)}
                    size="sm"
                  />
                </div>

                {/* Primary Submit Button */}
                <div ref={transactSaveBarRef} className="flex flex-col gap-2 rounded-xl">
                  <UnsavedChangesChip dirty={transactionDraftDirty} />
                  <AppButton
                    variant={isCashOut ? 'danger' : 'success'}
                    size="lg"
                    fullWidth
                    icon={CheckCircle2}
                    onClick={() => void handleProcessTransaction()}
                    disabled={actionLoading || amountPiasters <= 0 || !isProfitEntered || Boolean(hasInsufficientBalance) || Boolean(hasInsufficientCash)}
                  >
                    {actionLoading
                      ? 'جاري حفظ المعاملة...'
                      : hasInsufficientCash
                        ? `عجز نقدية في ${paymentDestination === 'terminal_till' ? 'درج المحافظ' : 'درج المحل'} - يرجى تغذية الدرج أولاً`
                        : !isProfitEntered && amountPiasters > 0
                          ? 'يرجى تحديد أو كتابة عمولة العملية للمتابعة'
                          : autoPrintReceipt
                            ? isCashOut
                              ? 'تأكيد خصم المبلغ وحفظ الربح (مع طباعة الإيصال)'
                              : 'تأكيد إضافة المبلغ وحفظ الربح (مع طباعة الإيصال)'
                            : isCashOut
                              ? 'تأكيد خصم المبلغ من المحفظة وحفظ الربح'
                              : 'تأكيد إضافة المبلغ للمحفظة وحفظ الربح'}
                  </AppButton>
                </div>

                {/* Last Processed Transaction Mini-Receipt */}
                {lastProcessedTx && (
                  <div className="bg-surface dark:bg-surface-dark border border-paid/30 rounded-2xl p-4 shadow-2xs flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-paid-soft text-paid flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-paid dark:text-paid-bright">
                          تم تنفيذ المعاملة بنجاح
                        </span>
                      </div>
                      <AppButton variant="subtle" size="xs" icon={X} aria-label="إخفاء" onClick={() => setLastProcessedTx(null)} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2 dark:bg-surface-dark-2 p-2.5 rounded-xl font-mono">
                      <div>
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-sans block">رقم الإيصال</span>
                        <strong className="text-ink dark:text-ink-dark">{lastProcessedTx.transactionNumber}</strong>
                      </div>
                      <div>
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-sans block">نوع العملية</span>
                        <strong className="text-ink dark:text-ink-dark truncate block">{lastProcessedTx.txTypeArabic || (lastProcessedTx.txType === 'cash_out' ? 'سحب كاش' : 'إيداع')}</strong>
                      </div>
                      <div>
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-sans block">المبلغ الأساسي</span>
                        <strong className="text-ink dark:text-ink-dark">{lastProcessedTx.amountFormatted || formatArabicCurrency(lastProcessedTx.amountPiasters)}</strong>
                      </div>
                      <div>
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-sans block">ربح المحل</span>
                        <strong className="text-paid dark:text-paid-bright">{lastProcessedTx.profitFormatted || formatArabicCurrency(lastProcessedTx.profitPiasters)}</strong>
                      </div>
                      <div className="col-span-2 pt-1.5 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between">
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-sans font-bold">الرصيد بعد العملية:</span>
                        <strong className="text-sm font-black text-ink dark:text-ink-dark">{lastProcessedTx.balanceAfterFormatted || formatArabicCurrency(lastProcessedTx.balanceAfterPiasters)}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <AppButton
                        variant="success"
                        size="md"
                        icon={Printer}
                        className="flex-1"
                        onClick={() => void handlePrintWalletReceipt(lastProcessedTx)}
                        disabled={isPrintingWalletReceipt}
                      >
                        {isPrintingWalletReceipt ? 'جاري إرسال الإيصال للطابعة...' : 'طباعة إيصال إضافي'}
                      </AppButton>
                    </div>
                  </div>
                )}

                {/* Quick Integration Info Notice */}
                <div className="p-4 bg-surface-2/70 dark:bg-surface-dark-2/70 rounded-2xl border border-line dark:border-line-dark flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-paid dark:text-brand-bright shrink-0 mt-0.5" />
                  <div className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                    <strong className="text-ink dark:text-ink-dark block mb-0.5">ربط آلي مع شاشة الكاشير:</strong>
                    أي عملية سداد عبر «إنستاباي» أو «محفظة» في شاشة البيع تُسجل تلقائياً هنا في سجل الحسابات وتزيد من رصيدك.
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 2: ACCOUNTS LIST & MANAGEMENT                           */}
        {/* ================================================================ */}
        {currentTab === 'accounts' && (
          <div className="w-full flex flex-col gap-5">

            {/* Account Cards Grid */}
            {accounts.length === 0 ? (
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-dashed border-line dark:border-line-dark p-8 flex flex-col items-center justify-center text-center gap-3 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="t-card-title text-ink dark:text-ink-dark">لا توجد محافظ أو حسابات إنستاباي مسجلة حتى الآن</h3>
                  <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1 max-w-sm">
                    قم بإضافة محافظ الكاش (فودافون، أورانج، اتصالات، وي) وحسابات إنستاباي البنكية لمتابعة الأرصدة والعمليات
                  </p>
                </div>
                {canManageAccounts && (
                  <AppButton variant="primary" size="md" icon={PlusCircle} className="mt-1" onClick={() => handleOpenAccountModal()}>
                    إضافة محفظة / حساب بنكي
                  </AppButton>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {accounts.map((acc) => {
                  const info = getAccountDisplayInfo(acc);
                  const identityRows = getAccountIdentityRows(acc);
                  const isLow = acc.balancePiasters < 50000;
                  const dailyLimit = acc.dailyLimitPiasters || (acc.accountType === 'instapay' ? 7000000 : 6000000);
                  const monthlyLimit = acc.monthlyLimitPiasters || (acc.accountType === 'instapay' ? 40000000 : 20000000);

                  return (
                    <div
                      key={acc.id}
                      className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-4 flex flex-col gap-4 hover:border-brand/40 dark:hover:border-brand-bright/40 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center mb-2.5">
                          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                            <span className={`text-micro font-bold px-2.5 py-0.5 rounded-full border ${info.border} ${info.bgSoft} ${info.text} flex items-center gap-1`}>
                              {info.isBank ? <Landmark className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                              <span>{info.badge}</span>
                            </span>
                            {acc.isDefault === true && (
                              <span
                                className="text-micro font-bold px-2 py-0.5 rounded-full border border-brand/40 dark:border-brand-bright/50 bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright flex items-center gap-1"
                                title="الحساب الرئيسي: يظهر في شاشة الدفع ويُسجَّل فيه المبلغ المستلم"
                                data-testid="main-account-badge"
                              >
                                <Star className="w-3 h-3 fill-current" />
                                <span>رئيسي</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <h3 className="t-card-title text-ink dark:text-ink-dark mb-2 truncate" title={acc.name}>
                          {acc.name}
                        </h3>

                        <div className="mb-3 rounded-xl border border-line dark:border-line-dark px-3 py-2 flex flex-col gap-1.5 min-w-0" data-testid="account-identity">
                          {acc.holderName && (
                            <div className="flex items-center justify-between gap-3 min-w-0" data-testid="account-holder-row">
                              <span className="shrink-0 flex items-center gap-1.5 text-micro font-bold text-ink-muted dark:text-ink-muted-dark">
                                <User className="w-3.5 h-3.5" />
                                <span>اسم صاحب الحساب</span>
                              </span>
                              <span className="min-w-0 truncate text-sm font-bold text-ink dark:text-ink-dark" title={acc.holderName}>
                                {acc.holderName}
                              </span>
                            </div>
                          )}
                          {identityRows.map((row) => (
                            <div key={row.key} className="flex items-center justify-between gap-3 min-w-0" data-testid={`account-${row.kind}-row`}>
                              <span className="shrink-0 flex items-center gap-1.5 text-micro font-bold text-ink-muted dark:text-ink-muted-dark">
                                {row.kind === 'phone' ? <Phone className="w-3.5 h-3.5" /> : <AtSign className="w-3.5 h-3.5" />}
                                <span>{row.label}</span>
                              </span>
                              <span
                                dir="ltr"
                                className={`min-w-0 text-left text-sm font-bold font-mono tabular-nums text-ink dark:text-ink-dark ${row.kind === 'phone' ? 'whitespace-nowrap' : 'break-all leading-snug'}`}
                                title={row.display}
                              >
                                {row.display}
                              </span>
                            </div>
                          ))}
                          {identityRows.length === 0 && (
                            <div className="flex items-center justify-between gap-2 min-w-0" data-testid="account-identity-empty">
                              <span className="min-w-0 text-xs font-bold text-ink-muted dark:text-ink-muted-dark leading-snug">
                                {acc.accountType === 'instapay'
                                  ? 'لم يُسجل رقم هاتف ولا عنوان إنستاباي بعد'
                                  : 'لم يُسجل رقم المحفظة بعد'}
                              </span>
                              {canManageAccounts && (
                                <AppButton variant="soft" size="xs" icon={Plus} className="shrink-0" onClick={() => handleOpenAccountModal(acc)}>
                                  أضِف
                                </AppButton>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="p-3.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark font-mono">
                          <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-sans block mb-1">
                            الرصيد الفعلي:
                          </span>
                          <span className={`text-2xl font-black font-mono block tabular-nums ${
                            isLow ? 'text-warn dark:text-warn-bright' : 'text-paid dark:text-paid-bright'
                          }`}>
                            {formatArabicCurrency(acc.balancePiasters)}
                          </span>
                        </div>

                        {isLow && (
                          <div className="mt-2.5 p-2 rounded-lg bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-xs font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                            رصيد الحساب منخفض (أقل من 500 ج.م)
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-line dark:border-line-dark flex items-center justify-between text-micro text-ink-muted dark:text-ink-muted-dark font-mono">
                        <span>حد يومي: {formatArabicCurrency(dailyLimit)}</span>
                        <span>حد شهري: {formatArabicCurrency(monthlyLimit)}</span>
                      </div>

                      {(canFund || canManageAccounts) && (
                        <div className="-mx-4 -mb-4 px-4 py-3 border-t border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 rounded-b-2xl flex flex-wrap items-center gap-2">
                          {canFund && (
                            <AppButton variant="successSoft" size="sm" icon={Plus} onClick={() => handleOpenFundingModal(acc.id)}>
                              شحن
                            </AppButton>
                          )}
                          {canManageAccounts && (
                            <AppButton
                              variant="secondary"
                              size="sm"
                              icon={Pencil}
                              onClick={() => handleOpenAccountModal(acc)}
                              title="تعديل بيانات الحساب"
                            >
                              تعديل
                            </AppButton>
                          )}
                          {canManageAccounts && acc.isDefault !== true && (
                            <AppButton
                              variant="soft"
                              size="sm"
                              icon={Star}
                              onClick={() => void handleSetDefaultAccount(acc)}
                              disabled={actionLoading}
                              title="يظهر هذا الحساب للكاشير عند الدفع، ويُسجَّل فيه المبلغ المستلم"
                            >
                              اجعله الرئيسي
                            </AppButton>
                          )}
                          {canManageAccounts && (
                            <AppButton
                              variant="dangerSubtle"
                              size="sm"
                              icon={Trash2}
                              className="ms-auto"
                              onClick={() => handleDeleteAccount(acc)}
                              title="حذف / أرشفة الحساب"
                            >
                              حذف
                            </AppButton>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 3: TRANSACTION HISTORY & RECEIPTS                        */}
        {/* ================================================================ */}
        {currentTab === 'history' && (
          <div className="w-full flex flex-col gap-5">

            {/* Filter Bar */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-x-8 gap-y-3 flex-wrap flex-1">
                <SearchInput
                  size="sm"
                  value={historySearch}
                  onChange={setHistorySearch}
                  placeholder="بحث برقم الإيصال، رقم الهاتف، أو اسم العميل..."
                  ariaLabel="بحث في سجل عمليات المحافظ"
                  className="min-w-[12.5rem] flex-1 max-w-sm"
                />

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-44">
                    <CustomSelect
                      value={filterAccount}
                      onChange={(val) => setFilterAccount(val)}
                      options={filterAccountOptions}
                      size="sm"
                    />
                  </div>

                  <div className="w-40">
                    <CustomSelect
                      value={filterType}
                      onChange={(val) => setFilterType(val)}
                      options={filterTypeOptions}
                      size="sm"
                    />
                  </div>

                  <div className="w-40">
                    <CustomSelect
                      value={filterDestination}
                      onChange={(val) => setFilterDestination(val)}
                      options={filterDestinationOptions}
                      size="sm"
                    />
                  </div>

                  <DateFilterControl
                    value={historyDateFilter}
                    onChange={setHistoryDateFilter}
                    size="md"
                    selectWidthClass="w-40"
                  />

                  <ClearFiltersButton
                    active={isHistoryFiltered}
                    onClick={resetHistoryFilters}
                    label="إلغاء الفلترة"
                    title="إعادة تعيين الفلاتر"
                    size="md"
                  />
                </div>

                <div className="w-40 shrink-0 flex flex-col items-end text-xs leading-4 font-bold">
                  <span className="text-ink-muted dark:text-ink-muted-dark font-mono min-h-4">
                    {totalPages <= 1 ? `إجمالي السجلات: ${totalCount}` : ''}
                  </span>
                  <span
                    className="max-w-full truncate text-brand dark:text-brand-bright"
                    title={isDateFilterActive(historyDateFilter) ? describeDateFilter(historyDateFilter) : undefined}
                  >
                    {`الفترة المعروضة: ${isDateFilterActive(historyDateFilter) ? describeDateFilter(historyDateFilter) : 'كل الفترات'}`}
                  </span>
                </div>
              </div>
            </div>

            {isHistoryCapped && (
              <div className="text-xs font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 rounded-xl px-3 py-2">
                تم عرض أحدث {HISTORY_LOAD_LIMIT} عملية فقط. ضيّق الفترة أو الفلاتر لعرض باقي العمليات.
              </div>
            )}

            {/* Table Container */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 flex flex-col gap-4">
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-ink-muted dark:text-ink-muted-dark text-xs bg-surface-2/30 dark:bg-surface-dark-2/30 rounded-xl border border-dashed border-line dark:border-line-dark">
                  {!isHistoryFiltered ? (
                    'لا توجد عمليات مسجلة حتى الآن.'
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span>
                        {isDateFilterActive(historyDateFilter)
                          ? `لا توجد عمليات مطابقة في الفترة (${describeDateFilter(historyDateFilter)})`
                          : 'لا توجد عمليات مسجلة مطابقة للبحث'}
                      </span>
                      <AppButton variant="secondary" size="sm" onClick={resetHistoryFilters}>
                        عرض كل العمليات
                      </AppButton>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line/70 dark:border-line-dark/70">
                  <table className="w-full text-xs text-right min-w-[53.75rem] border-collapse [&_th]:px-2 [&_td]:px-2">
                    <thead className="bg-surface-2/80 dark:bg-surface-dark-2/80 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark text-micro font-bold select-none">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap">التاريخ والوقت</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">المحفظة / الحساب</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">نوع الحركة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">رقم الهاتف / المرجع</th>
                        <th className="py-3 px-3.5 whitespace-nowrap font-mono">1. المبلغ المطلوب</th>
                        <th className="py-3 px-3.5 whitespace-nowrap font-mono">2. ربح المحل</th>
                        <th className="py-3 px-3.5 whitespace-nowrap font-bold text-paid dark:text-paid-bright font-mono">المستلم من الزبون</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-danger dark:text-danger-bright font-mono">حركة المحفظة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">وجهة النقدية</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">المستخدم</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center sticky left-0 z-10 bg-surface-2 dark:bg-surface-dark-2 w-20">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 bg-surface dark:bg-surface-dark">
                      {paginatedHistory.map((t) => {
                        const isCashOutTx = t.txType === 'cash_out';
                        const isCashInTx = t.txType === 'cash_in';
                        const isSaleTx = t.txType === 'sale_credit' || t.txType === 'pos_sale';
                        const isCustomerDebtTx = t.txType === 'customer_debt_payment';
                        const isReturnTx = t.txType === 'pos_return';
                        const isCancelTx = t.txType === 'payment_cancellation';
                        const isFundingTx = t.txType === 'funding';
                        const isCancelled = t.status === 'cancelled';
                        const isDeduction = isCashOutTx || isReturnTx || isCancelTx;

                        const badgeLabel =
                          t.txTypeArabic ||
                          (isCashOutTx
                            ? 'تحويل للزبون'
                            : isCashInTx
                              ? 'سحب كاش للزبون'
                              : isSaleTx
                                ? 'مبيعات كاشير'
                                : isCustomerDebtTx
                                  ? 'سداد آجل عميل'
                                  : isReturnTx
                                    ? 'مرتجع مبيعات'
                                    : isCancelTx
                                      ? 'إلغاء سداد'
                                      : isFundingTx
                                        ? 'شحن وتغذية'
                                        : 'إيداع');

                        const refCode = t.referenceNumber || t.transactionNumber || (t.id ? t.id.replace(/-/g, '').slice(-8).toUpperCase() : '');

                        return (
                          <tr key={t.id} className={`hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors ${isCancelled ? 'opacity-65 bg-danger-soft/40 dark:bg-danger-dark-soft/40' : ''}`}>
                            {/* 1. التاريخ والوقت */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap text-xs text-ink-muted dark:text-ink-muted-dark font-mono align-middle">
                              {formatLocalDateTime(t.createdAt)}
                            </td>

                            {/* 2. المحفظة / الحساب */}
                            <td className="py-3.5 px-3.5 font-bold text-ink dark:text-ink-dark whitespace-nowrap truncate max-w-[10rem] align-middle" title={t.accountName || 'محفظة'}>
                              {t.accountName || 'محفظة'}
                            </td>

                            {/* 3. نوع الحركة */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap align-middle">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-bold whitespace-nowrap shrink-0 border ${
                                isDeduction
                                  ? 'bg-danger-soft text-danger dark:bg-danger-dark-soft dark:text-danger-bright border-danger/20 dark:border-danger-bright/30'
                                  : isSaleTx
                                    ? 'bg-brand-soft text-brand dark:bg-brand-bright/15 dark:text-brand-bright border-brand/20 dark:border-brand-bright/30'
                                    : isCustomerDebtTx
                                      ? 'bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright border-paid-border dark:border-paid-bright/30'
                                      : isFundingTx
                                        ? 'bg-warn-soft text-warn dark:bg-warn-dark-soft dark:text-warn-bright border-warn/20 dark:border-warn-bright/30'
                                        : 'bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright border-paid-border dark:border-paid-bright/30'
                              }`}>
                                {isDeduction ? <ArrowDownLeft className="w-3 h-3 shrink-0" /> : <ArrowUpRight className="w-3 h-3 shrink-0" />}
                                <span className="whitespace-nowrap">{badgeLabel}</span>
                              </span>
                              {isCancelled && (
                                <span className="inline-flex items-center ms-1.5 px-2 py-0.5 rounded-full text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30">
                                  ملغاة
                                </span>
                              )}
                            </td>

                            {/* 4. رقم الهاتف / المرجع */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap text-xs font-mono align-middle">
                              {t.customerPhone ? (
                                <div className="text-ink dark:text-ink-dark font-semibold tracking-wide font-mono">
                                  {formatPhoneDisplay(t.customerPhone)}
                                  {t.customerName ? <span className="ms-1 font-sans text-micro text-ink-muted dark:text-ink-muted-dark font-normal">({t.customerName})</span> : null}
                                </div>
                              ) : null}
                              {refCode ? (
                                <div className="text-micro text-ink-muted dark:text-ink-muted-dark font-mono">مرجع: {refCode}</div>
                              ) : null}
                              {!t.customerPhone && !refCode && (
                                <span className="text-ink-muted/30 dark:text-ink-muted-dark/30 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* 5. 1. المبلغ المطلوب */}
                            <td className={`py-3.5 px-3.5 whitespace-nowrap font-bold text-ink dark:text-ink-dark font-mono tabular-nums align-middle ${isCancelled ? 'line-through' : ''}`}>
                              {t.amountFormatted || formatArabicCurrency(t.amountPiasters)}
                            </td>

                            {/* 6. 2. ربح المحل */}
                            <td className={`py-3.5 px-3.5 whitespace-nowrap font-mono font-bold text-paid dark:text-paid-bright tabular-nums align-middle ${isCancelled ? 'line-through text-ink-muted dark:text-ink-muted-dark' : ''}`}>
                              {t.profitFormatted || formatArabicCurrency(t.profitPiasters || 0)}
                            </td>

                            {/* 7. المستلم من الزبون / المصروف */}
                            <td className={`py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums align-middle ${isCancelled ? 'line-through' : ''}`}>
                              {isCashInTx ? (
                                <div className="flex flex-col">
                                  <span className="font-bold text-danger dark:text-danger-bright flex items-center gap-1">
                                    <span className="text-micro font-sans px-1.5 py-0.2 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger/30">صرف</span>
                                    <span>{formatArabicCurrency(t.cashGivenPiasters || Math.max(0, t.amountPiasters - (t.profitPiasters || 0)))}</span>
                                  </span>
                                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-mono">
                                    تحويل مستلم: {formatArabicCurrency(t.amountPiasters)}
                                  </span>
                                </div>
                              ) : isFundingTx ? (
                                <span className="text-ink-muted dark:text-ink-muted-dark font-mono text-micro">—</span>
                              ) : isReturnTx ? (
                                <div className="flex flex-col">
                                  <span className="font-bold text-danger dark:text-danger-bright flex items-center gap-1">
                                    <span className="text-micro font-sans px-1.5 py-0.2 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger/30">صرف</span>
                                    <span>{formatArabicCurrency(t.amountPiasters)}</span>
                                  </span>
                                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark">مرتجع</span>
                                </div>
                              ) : (
                                <span className="font-black text-paid dark:text-paid-bright">
                                  {formatArabicCurrency(t.totalCollectedPiasters || t.cashTakenPiasters || (t.amountPiasters + (t.profitPiasters || 0)))}
                                </span>
                              )}
                            </td>

                            {/* 8. حركة المحفظة */}
                            <td className={`py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums align-middle ${isCancelled ? 'line-through' : ''}`}>
                              {isDeduction ? (
                                <div className="flex flex-col">
                                  <span className="text-danger dark:text-danger-bright font-bold flex items-center gap-1">
                                    <span className="text-micro font-sans px-1.5 py-0.2 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger/30">خصم</span>
                                    <span>-{formatArabicCurrency(t.amountPiasters)}</span>
                                  </span>
                                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-sans">
                                    {t.balanceAfterFormatted ? `الرصيد بعد: ${t.balanceAfterFormatted}` : 'خصم من المحفظة'}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="font-bold text-paid dark:text-paid-bright flex items-center gap-1">
                                    <span className="text-micro font-sans px-1.5 py-0.2 rounded bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-bright/30">إيداع</span>
                                    <span>+{formatArabicCurrency(t.amountPiasters)}</span>
                                  </span>
                                  <span className="text-micro text-paid/70 dark:text-paid-bright/70 font-sans">
                                    {t.balanceAfterFormatted ? `الرصيد بعد: ${t.balanceAfterFormatted}` : 'إضافة للمحفظة'}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* 9. وجهة النقدية */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-micro font-bold border ${
                                t.paymentDestination === 'terminal_till'
                                  ? 'bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30'
                                  : t.paymentDestination === 'external_cash'
                                    ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30'
                                    : t.paymentDestination === 'bank_transfer'
                                      ? 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-line dark:border-line-dark'
                                      : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border-line dark:border-line-dark'
                              }`}>
                                {t.paymentDestination === 'terminal_till'
                                  ? 'درج المحافظ'
                                  : t.paymentDestination === 'external_cash'
                                    ? 'كاش خارجي'
                                    : t.paymentDestination === 'bank_transfer'
                                      ? 'تحويل بنكي'
                                      : 'درج المحل'}
                              </span>
                            </td>

                            {/* 10. المستخدم */}
                            <td className="py-3.5 px-3.5 text-xs text-ink-muted dark:text-ink-muted-dark whitespace-nowrap truncate max-w-[6rem] align-middle" title={t.cashierName || t.createdByName || t.createdBy || 'كاشير'}>
                              {t.cashierName || t.createdByName || t.createdBy || 'كاشير'}
                            </td>

                            {/* 11. إجراءات */}
                            <td className="py-3.5 px-3.5 text-center whitespace-nowrap align-middle sticky left-0 z-10 bg-surface dark:bg-surface-dark">
                              <div className="flex items-center justify-center gap-1">
                                <AppButton
                                  variant="subtle"
                                  size="xs"
                                  icon={Printer}
                                  aria-label="طباعة إيصال المعاملة"
                                  title="طباعة إيصال المعاملة على الطابعة الحرارية"
                                  onClick={() => void handlePrintWalletReceipt(t)}
                                  disabled={isPrintingWalletReceipt}
                                />
                                {isCancelled ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30">
                                    ملغاة
                                  </span>
                                ) : canCancelTx && t.txType !== 'sale_credit' && (t.txType as string) !== 'pos_sale' && (t.txType as string) !== 'pos_return' ? (
                                  <AppButton
                                    variant="dangerSubtle"
                                    size="xs"
                                    icon={X}
                                    aria-label="إلغاء المعاملة وتصحيح الرصيد"
                                    title="إلغاء المعاملة وتصحيح الرصيد"
                                    onClick={() => {
                                      setCancellingTx(t);
                                      setCancelReason('');
                                    }}
                                  />
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredTransactions.length > 0 && (
                <PaginationBar
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[15, 25, 50, 100]}
                  itemLabel="معاملة"
                />
              )}
            </div>

          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 4: ANALYTICS & PROFIT METRICS                            */}
        {/* ================================================================ */}
        {currentTab === 'analytics' && (
          !canViewAnalytics ? (
            <div className="max-w-md mx-auto my-16 p-8 bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark text-center flex flex-col items-center gap-3.5 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warn dark:text-warn-bright" />
              </div>
              <h3 className="t-card-title text-ink dark:text-ink-dark m-0">غير مصرح لك بعرض أرباح وتحليلات المحافظ</h3>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                تحتاج لصلاحية الاطلاع على تحليلات وأرباح المحافظ الإلكترونية وإنستاباي من إدارة المحل.
              </p>
            </div>
          ) : (
            <div className="w-full flex flex-col gap-5">
              {/* Filter Toolbar for Analytics */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">تحديد فترة التقارير والأرباح:</span>
                  <DateFilterControl
                    value={analyticsDateFilter}
                    onChange={setAnalyticsDateFilter}
                    variant="pills"
                    size="sm"
                  />
                </div>
                <span className="text-xs font-mono font-bold text-ink-muted dark:text-ink-muted-dark">
                  إجمالي العمليات المشمولة: {periodTransactionsCount} عملية
                </span>
              </div>

              {/* KPI Cards Row (Filtered Period Profit + All-Time Total Profit) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 hover:border-paid/40 dark:hover:border-paid-bright/40 transition-colors">
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">
                    أرباح المحل الصافية ({getDatePresetLabel(analyticsDateFilter.preset)})
                  </span>
                  <span className="t-kpi-lg font-mono text-paid dark:text-paid-bright block">
                    {formatArabicCurrency(periodProfitPiasters)}
                  </span>
                  <span className="text-micro text-paid dark:text-paid-bright mt-1 block font-bold">
                    من {periodTransactionsCount} عملية مكتملة بالفترة
                  </span>
                </div>

                <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 hover:border-brand/40 dark:hover:border-brand-bright/40 transition-colors">
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">
                    أرباح المحل الإجمالية (كافة الأوقات)
                  </span>
                  <span className="t-kpi-lg font-mono text-brand dark:text-brand-bright block">
                    {formatArabicCurrency(totalAllTimeProfitPiasters)}
                  </span>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark mt-1 block">
                    أرباح كافة العمليات المسجلة بالنظام منذ البداية
                  </span>
                </div>
              </div>

              {/* Physical Cash Reconciliation from Wallets (توزيع النقدية والسيولة) */}
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 sm:p-6">
                <h3 className="t-card-title text-ink dark:text-ink-dark mb-4 flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-paid dark:text-paid-bright" />
                  توزيع النقدية والسيولة للمحافظ الإلكترونية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Card 1: نقدية محفظة / درج الكاش المنفصل (الأكثر استخداماً) */}
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">
                          نقدية محفظة / درج الكاش
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 font-bold">
                          مخصصة للمحافظ
                        </span>
                      </div>
                      <span className={`t-kpi-lg font-mono block ${periodTerminalTillCashPiasters >= 0 ? 'text-brand dark:text-brand-bright' : 'text-danger dark:text-danger-bright'}`}>
                        {formatArabicCurrency(periodTerminalTillCashPiasters)}
                      </span>
                      <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                        المبالغ النقدية المحصلة والمحفوظة في المحفظة المنفصلة للمحافظ ({getDatePresetLabel(analyticsDateFilter.preset)}).
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-line dark:border-line-dark flex items-center justify-between text-micro">
                      <span className="text-ink-muted dark:text-ink-muted-dark font-medium">
                        الرصيد الفعلي بالدرج: <span className="font-mono font-bold text-ink dark:text-ink-dark">{formatArabicCurrency(availableTillCash)}</span>
                      </span>
                      {canFund && (
                        <button
                          type="button"
                          onClick={() => {
                            setFundTillSource('external_cash');
                            setFundTillModalError(null);
                            void fetchLiveDrawerCash();
                            setIsFundTillModalOpen(true);
                          }}
                          className="cursor-pointer text-micro font-bold text-brand dark:text-brand-bright hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>تغذية نقدية</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card 2: نقدية محصلة في درج كاشير المحل */}
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">
                        دخلت في درج كاشير المحل
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-bright/20 font-bold">
                        عهدة الكاشير
                      </span>
                    </div>
                    <span className={`t-kpi-lg font-mono block ${periodDrawerCashPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                      {formatArabicCurrency(periodDrawerCashPiasters)}
                    </span>
                    <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                      المبالغ النقدية الموردة لدرج الكاشير العام عند اختيار توريد المعاملة لدرج المحل ({getDatePresetLabel(analyticsDateFilter.preset)}).
                    </p>
                  </div>

                  {/* Card 3: إجمالي السيولة الشاملة للمحافظ */}
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">إجمالي السيولة الشاملة للمحافظ</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 font-bold">
                        رقمي + كاش
                      </span>
                    </div>
                    <span className="t-kpi-lg font-mono text-brand dark:text-brand-bright block">
                      {formatArabicCurrency(grandTotalLiquidityPiasters)}
                    </span>
                    <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                      إجمالي أموال المحافظ: الأرصدة الرقمية ({formatArabicCurrency(totalDigitalBalancesPiasters)}) + الكاش المحصل ({formatArabicCurrency(periodTotalCashPiasters)}).
                    </p>
                  </div>
                </div>
              </div>

              {/* Digital Liquidity Distribution Card */}
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 sm:p-6">
                <h3 className="t-card-title text-ink dark:text-ink-dark mb-4 flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-brand dark:text-brand-bright" />
                  توزيع السيولة وأرصدة المحافظ الرقمية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">أرصدة محافظ الكاش الإلكترونية</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 font-bold">فودافون / أورانج / اتصالات / وي</span>
                    </div>
                    <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark block">
                      {formatArabicCurrency(calculatedWalletsBalancePiasters)}
                    </span>
                    <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                      إجمالي الرصيد الرقمي المتاح للسحب والتحويل عبر خطوط ومحافظ الكاش.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">أرصدة إنستاباي والحسابات البنكية</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-bright/20 font-bold">تحويل لحظي وبنكي</span>
                    </div>
                    <span className="t-kpi-lg font-mono text-ink dark:text-ink-dark block">
                      {formatArabicCurrency(calculatedInstapayBalancePiasters)}
                    </span>
                    <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                      إجمالي السيولة النقدية المتوفرة عبر شبكة إنستاباي والتحويلات البنكية.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informational Integration Card */}
              <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-2xl p-5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-paid dark:text-brand-bright shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-ink dark:text-ink-dark m-0">
                    التكامل المالي مع شاشة الكاشير والدرج:
                  </p>
                  <p className="text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                    • عندما يدفع الزبون في الكاشير عبر أزرار «انستاباي» أو «محفظة»، يزداد رصيد المحفظة / حساب إنستاباي تلقائياً بالمبلغ المدفوع.
                    <br />
                    • عند تنفيذ سحب كاش لزبون من هذه الشاشة، يُخصم المبلغ فقط من رصيد المحفظة، ويُسجل ربح المحل كإيراد صافٍ مستقل.
                  </p>
                </div>
              </div>

            </div>
          )
        )}

      </div>

      {/* ================================================================ */}
      {/* 4. MODAL: FUND ACCOUNT (Styled matching EpayView funding modal)   */}
      {/* ================================================================ */}
      {isFundingModalOpen && (
        <div onClick={handleFundingBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-xl w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden shadow-xl border border-line dark:border-line-dark" dir="rtl">
            <div className="flex items-center justify-between border-b border-line dark:border-line-dark px-6 pt-5 pb-3 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-2 m-0">
                <Coins className="w-5 h-5 text-paid dark:text-paid-bright" />
                شحن وتغذية رصيد المحفظة / إنستاباي
              </h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => void requestCloseFunding()} />
            </div>

            <MotionHeight className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col gap-4">
                {fundingModalError && (
                  <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-xl p-3 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                    <span>{fundingModalError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={FIELD_LABEL_CLS}>المحفظة / الحساب المطلوب شحنه</label>
                    <CustomSelect
                      value={fundingAccountId}
                      onChange={(val) => setFundingAccountId(val)}
                      options={accountSelectOptions}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLS}>مبلغ الشحن / الإيداع <RequiredMark /></label>
                    <MoneyInput
                      valuePiasters={fundingAmountPiasters}
                      onChangePiasters={(val) => setFundingAmountPiasters(val)}
                      className="text-lg font-bold"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className={FIELD_LABEL_CLS}>مصدر تمويل الرصيد</label>
                  <CustomSelect
                    value={fundingSource}
                    onChange={(val) => setFundingSource(val as any)}
                    options={[
                      { value: 'cash_drawer', label: 'من درج نقدية الكاشير' },
                      { value: 'bank_transfer', label: 'تحويل بنكي مباشر' },
                      { value: 'external_cash', label: 'كاش خارجي / صاحب المحل' },
                    ]}
                  />

                  {fundingSource === 'cash_drawer' && (
                    <div {...fundingPanel} className="space-y-1.5 mt-2">
                      <div className="p-2.5 rounded-xl border text-xs bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark flex items-center justify-between">
                        <span className="text-ink-muted dark:text-ink-muted-dark font-bold text-micro">كاش الدرج المتوفر حالياً:</span>
                        <span className={`font-mono font-black text-xs ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                          {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                        </span>
                      </div>

                      {liveDrawerCashPiasters !== null && (liveDrawerCashPiasters <= 0 || (fundingAmountPiasters > 0 && fundingAmountPiasters > liveDrawerCashPiasters)) && (
                        <div className="p-2.5 rounded-xl border text-micro bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {liveDrawerCashPiasters <= 0
                                ? 'درج الكاشير فارغ (0.00 ج.م)!'
                                : 'رصيد الدرج غير كافٍ!'}
                            </span>
                          </div>
                          <p className="text-micro leading-relaxed">
                            {liveDrawerCashPiasters <= 0
                              ? 'لا يمكن سحب نقدية من درج فارغ. إذا كان الشحن تم من مالك المحل أو نقدية خارجية، يرجى تغيير مصدر التمويل إلى: «كاش خارجي / صاحب المحل».'
                              : `المبلغ المطلوب (${formatArabicCurrency(fundingAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى اختيار «كاش خارجي / صاحب المحل» إذا كان المبلغ مدفوعاً من مالك المحل.`}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className={FIELD_LABEL_CLS}>ملاحظات الشحن</label>
                  <input
                    type="text"
                    value={fundingNotes}
                    onChange={(e) => setFundingNotes(e.target.value)}
                    placeholder="ملاحظات توضيحية عن سبب ومصدر التغذية..."
                    className={FIELD_INPUT_CLS}
                  />
                </div>
              </div>
            </MotionHeight>

            <div className="p-4 border-t border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="md" onClick={() => void requestCloseFunding()}>
                إلغاء
              </AppButton>
              <AppButton
                variant="success"
                size="md"
                onClick={handleSaveFunding}
                disabled={
                  actionLoading ||
                  fundingAmountPiasters <= 0 ||
                  (fundingSource === 'cash_drawer' &&
                    liveDrawerCashPiasters !== null &&
                    (liveDrawerCashPiasters <= 0 || fundingAmountPiasters > liveDrawerCashPiasters))
                }
              >
                {actionLoading ? 'جاري الشحن...' : 'تأكيد شحن الرصيد'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* 4.B MODAL: FUND TILL CASH (تغذية نقدية لدرج المحافظ المنفصل)       */}
      {/* ================================================================ */}
      {isFundTillModalOpen && (
        <div onClick={handleFundTillBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden shadow-xl border border-line dark:border-line-dark" dir="rtl">
            <div className="flex items-center justify-between border-b border-line dark:border-line-dark px-6 pt-5 pb-3 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-2 m-0">
                <Banknote className="w-5 h-5 text-brand dark:text-brand-bright" />
                تغذية نقدية لدرج / عهدة المحافظ الإلكترونية
              </h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => void requestCloseFundTill()} />
            </div>

            <MotionHeight className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col gap-4">
                {fundTillModalError && (
                  <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-xl p-3 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                    <span>{fundTillModalError}</span>
                  </div>
                )}

                <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex items-center justify-between text-xs">
                  <span className="text-ink-muted dark:text-ink-muted-dark font-bold">النقدية المتوفرة حالياً بالدرج المنفصل:</span>
                  <span className={`font-mono font-black text-sm ${availableTillCash > 0 ? 'text-brand dark:text-brand-bright' : 'text-danger dark:text-danger-bright'}`}>
                    {formatArabicCurrency(availableTillCash)}
                  </span>
                </div>

                <div>
                  <label className={FIELD_LABEL_CLS}>مبلغ النقدية المطلوب إيداعها في الدرج <RequiredMark /></label>
                  <MoneyInput
                    valuePiasters={fundTillAmountPiasters}
                    onChangePiasters={(val) => setFundTillAmountPiasters(val)}
                    className="text-lg font-bold"
                    autoFocus
                  />
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark block mt-1">
                    هذه النقدية توضع في درج/محفظة الكاش لاستخدامها في صرف عمليات السحب للعملاء.
                  </span>
                </div>

                <div>
                  <label className={FIELD_LABEL_CLS}>مصدر النقدية</label>
                  <CustomSelect
                    value={fundTillSource}
                    onChange={(val) => setFundTillSource(val as any)}
                    options={[
                      { value: 'external_cash', label: 'كاش خارجي / صاحب المحل (لا يخصم من درج الكاشير)' },
                      { value: 'cash_drawer', label: 'من درج كاشير المحل (يخصم من نقدية الكاشير)' },
                    ]}
                  />

                  {fundTillSource === 'cash_drawer' && (
                    <div {...fundTillPanel} className="space-y-1.5 mt-2">
                      <div className="p-2.5 rounded-xl border text-xs bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark flex items-center justify-between">
                        <span className="text-ink-muted dark:text-ink-muted-dark font-bold text-micro">كاش درج المحل المتوفر حالياً:</span>
                        <span className={`font-mono font-black text-xs ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                          {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                        </span>
                      </div>

                      {liveDrawerCashPiasters !== null && (liveDrawerCashPiasters <= 0 || (fundTillAmountPiasters > 0 && fundTillAmountPiasters > liveDrawerCashPiasters)) && (
                        <div className="p-2.5 rounded-xl border text-micro bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {liveDrawerCashPiasters <= 0
                                ? 'درج كاشير المحل فارغ (0.00 ج.م)!'
                                : 'رصيد درج كاشير المحل غير كافٍ!'}
                            </span>
                          </div>
                          <p className="text-micro leading-relaxed">
                            {liveDrawerCashPiasters <= 0
                              ? 'لا يمكن سحب نقدية من درج كاشير فارغ. يرجى اختيار «كاش خارجي / صاحب المحل» لتغذية الدرج من نقدية خارجية.'
                              : `المبلغ المطلوب (${formatArabicCurrency(fundTillAmountPiasters)}) أكبر من نقدية درج المحل (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى تقليل المبلغ أو اختيار «كاش خارجي / صاحب المحل».`}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className={FIELD_LABEL_CLS}>ملاحظات التغذية</label>
                  <input
                    type="text"
                    value={fundTillNotes}
                    onChange={(e) => setFundTillNotes(e.target.value)}
                    placeholder="مثال: عهدة نقدية صباحية للدرج / سيولة سحوبات..."
                    className={FIELD_INPUT_CLS}
                  />
                </div>
              </div>
            </MotionHeight>

            <div className="p-4 border-t border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="md" onClick={() => void requestCloseFundTill()}>
                إلغاء
              </AppButton>
              <AppButton
                variant="primary"
                size="md"
                onClick={handleSaveFundTill}
                disabled={
                  isFundingTillLoading ||
                  fundTillAmountPiasters <= 0 ||
                  (fundTillSource === 'cash_drawer' &&
                    liveDrawerCashPiasters !== null &&
                    (liveDrawerCashPiasters <= 0 || fundTillAmountPiasters > liveDrawerCashPiasters))
                }
              >
                {isFundingTillLoading ? 'جاري الإيداع...' : 'تأكيد تغذية النقدية'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* 5. MODAL: ADD / EDIT ACCOUNT (With Egyptian Banks & Wallets)    */}
      {/* ================================================================ */}
      {isAccountModalOpen && (
        <div onClick={handleAccountBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="rounded-2xl shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden bg-surface dark:bg-surface-dark border border-line dark:border-line-dark" dir="rtl">

            {/* Modal Header */}
            <div className="p-4 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright flex items-center justify-center">
                  {accountFormType === 'instapay' ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="t-card-title text-ink dark:text-ink-dark m-0">
                    {editingAccount
                      ? (accountFormType === 'instapay' ? 'تعديل حساب إنستاباي البنكي' : 'تعديل محفظة الكاش')
                      : (accountFormType === 'instapay' ? 'إضافة حساب إنستاباي جديد' : 'إضافة محفظة كاش جديدة')}
                  </h3>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark">
                    {accountFormType === 'instapay'
                      ? 'ربط حساب بنكي معتمد بشبكة المدفوعات اللحظية'
                      : 'محفظة هاتف محمول نقدية لعمليات الشحن والسحب'}
                  </span>
                </div>
              </div>
              <AppButton variant="subtle" size="xs" icon={X} aria-label="إغلاق" onClick={() => void requestCloseAccount()} />
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
              <p className="text-micro text-ink-muted dark:text-ink-muted-dark -mb-2">الحقول المميزة بعلامة * مطلوبة</p>

              {accountModalError && (
                <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-xl p-3 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                  <span>{accountModalError}</span>
                </div>
              )}

              {/* Type Switcher / Locked Indicator */}
              {editingAccount ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className={FIELD_LABEL_CLS}>
                      نوع الحساب:
                    </label>
                    <span className="text-micro font-bold text-ink-muted dark:text-ink-muted-dark flex items-center gap-1">
                      <Lock className="w-3 h-3 text-ink-muted dark:text-ink-muted-dark" />
                      <span>ثابت لا يمكن تغييره</span>
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                    accountFormType === 'instapay'
                      ? 'bg-brand-soft dark:bg-brand-bright/15 border-brand/30 dark:border-brand-bright/30 text-brand dark:text-brand-bright'
                      : 'bg-brand-soft dark:bg-brand-dark-soft border-brand/30 text-brand-dark dark:text-brand-bright'
                  }`}>
                    <div className="flex items-center gap-2">
                      {accountFormType === 'instapay' ? <Landmark className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                      <span className="text-xs font-black">
                        {accountFormType === 'instapay' ? 'حساب إنستاباي بنكي' : 'محفظة هاتف كاش نقدية'}
                      </span>
                    </div>
                    <span className="text-micro font-black px-2 py-0.5 rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
                      {accountFormType === 'instapay' ? 'حساب بنكي' : 'محفظة كاش'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    نوع الحساب المطلوب إضافته:
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
                    <button
                      type="button"
                      onClick={() => handleAccountTypeChange('instapay')}
                      className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        accountFormType === 'instapay'
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark'
                      }`}
                    >
                      <Landmark className="w-4 h-4" />
                      <span>حساب إنستاباي</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAccountTypeChange('wallet')}
                      className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        accountFormType === 'wallet'
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>محفظة كاش</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4">
                {/* Provider / Bank Dropdown - Dynamically Adjusted */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark flex items-center gap-1.5">
                    {accountFormType === 'instapay' ? (
                      <>
                        <Landmark className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                        <span>اختر البنك المرتبط بـ إنستاباي:</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                        <span>اختر شركة / شبكة المحفظة:</span>
                      </>
                    )}
                  </label>

                  {accountFormType === 'instapay' ? (
                    <CustomSelect
                      value={accountFormProvider}
                      onChange={(val) => handleProviderChange(val)}
                      options={INSTAPAY_BANKS.map((b) => ({
                        value: b.code,
                        label: b.name,
                      }))}
                    />
                  ) : (
                    <CustomSelect
                      value={accountFormProvider}
                      onChange={(val) => handleProviderChange(val)}
                      options={EGYPTIAN_WALLETS.map((w) => ({
                        value: w.code,
                        label: w.name,
                      }))}
                    />
                  )}
                </div>

                {/* Account Display Name */}
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    اسم الحساب أو المحفظة في البرنامج: <RequiredMark />
                  </label>
                  <input
                    type="text"
                    value={accountFormName}
                    onChange={(e) => setAccountFormName(e.target.value)}
                    placeholder={accountFormType === 'instapay' ? 'مثال: إنستاباي - البنك الأهلي المصري' : 'مثال: فودافون كاش كاشير 1'}
                    className={FIELD_INPUT_CLS}
                    autoFocus
                  />
                </div>

                {/* Account holder name: what the customer sees when sending money */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="account-holder-name" className={FIELD_LABEL_CLS}>
                    اسم صاحب الحساب:
                  </label>
                  <input
                    id="account-holder-name"
                    type="text"
                    value={accountFormHolder}
                    onChange={(e) => setAccountFormHolder(e.target.value)}
                    maxLength={60}
                    placeholder="مثال: أحمد محمود السيد"
                    className={FIELD_INPUT_CLS}
                  />
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark">الاسم الذي يظهر للزبون عند التحويل</span>
                </div>

                {/* Specific Fields: Phone & IPA / Account Number */}
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    {accountFormType === 'instapay' ? 'رقم الهاتف المسجل بإنستاباي:' : 'رقم هاتف المحفظة (أساسي):'}
                  </label>
                  <input
                    type="text"
                    value={accountFormPhone}
                    onChange={(e) => setAccountFormPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className={`${FIELD_INPUT_CLS} font-mono text-left`}
                    dir="ltr"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    {accountFormType === 'instapay' ? 'عنوان الدفع اللحظي / المعرف:' : 'معرف إضافي أو كارت ميزة:'}
                  </label>
                  <input
                    type="text"
                    value={accountFormIdentifier}
                    onChange={(e) => setAccountFormIdentifier(e.target.value)}
                    placeholder={accountFormType === 'instapay' ? 'username@instapay' : 'كارت ميزة / معرف'}
                    className={`${FIELD_INPUT_CLS} font-mono text-left`}
                    dir="ltr"
                  />
                </div>

                {/* Initial Balance */}
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    الرصيد الافتتاحي الحالي في الحساب:
                  </label>
                  <MoneyInput
                    valuePiasters={accountFormBalance}
                    onChangePiasters={(val) => setAccountFormBalance(val)}
                    className="text-lg font-black font-mono text-center h-11"
                  />
                </div>
              </div>

              {/* Main account of its type (shown in the checkout dialog) */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
                <ToggleSwitch
                  checked={accountMainLocked ? true : accountFormIsDefault}
                  onChange={(val) => setAccountFormIsDefault(val)}
                  disabled={accountMainLocked}
                  title="الحساب الرئيسي"
                  className="shrink-0 mt-0.5"
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark">الحساب الرئيسي (يظهر في شاشة الدفع)</span>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                    {editingAccount?.isDefault === true
                      ? 'هذا هو الحساب الرئيسي الحالي. لتغييره اجعل حساباً آخر رئيسياً.'
                      : !accountHasActivePeer
                        ? 'أول حساب من هذا النوع يصبح رئيسياً تلقائياً.'
                        : 'يظهر هذا الحساب للكاشير عند الدفع عبر انستاباي أو المحفظة، ويُسجَّل فيه المبلغ المستلم'}
                  </span>
                </div>
              </div>

              {/* Daily & Monthly Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    الحد الأقصى اليومي للتحويل:
                  </label>
                  <MoneyInput
                    valuePiasters={accountFormDailyLimit}
                    onChangePiasters={(val) => setAccountFormDailyLimit(val)}
                    className="text-xs font-mono text-center h-10"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLS}>
                    الحد الأقصى الشهري للتحويل:
                  </label>
                  <MoneyInput
                    valuePiasters={accountFormMonthlyLimit}
                    onChangePiasters={(val) => setAccountFormMonthlyLimit(val)}
                    className="text-xs font-mono text-center h-10"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL_CLS}>
                  ملاحظات إضافية:
                </label>
                <input
                  type="text"
                  value={accountFormNotes}
                  onChange={(e) => setAccountFormNotes(e.target.value)}
                  placeholder="ملاحظات داخلية..."
                  className={FIELD_INPUT_CLS}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 flex items-center justify-between shrink-0">
              {editingAccount ? (
                <AppButton variant="dangerSubtle" size="sm" icon={Trash2} onClick={() => handleDeleteAccount(editingAccount)}>
                  حذف الحساب
                </AppButton>
              ) : <div></div>}

              <div className="flex items-center gap-2">
                <AppButton variant="secondary" size="md" onClick={() => void requestCloseAccount()}>
                  إلغاء
                </AppButton>
                <AppButton variant="primary" size="md" onClick={handleSaveAccount} disabled={actionLoading || !accountFormName.trim()}>
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ بيانات الحساب'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCEL / REVERSE WALLET TRANSACTION */}
      {cancellingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-line dark:border-line-dark" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line dark:border-line-dark pb-3">
              <h3 className="t-card-title text-danger dark:text-danger-bright flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger dark:text-danger-bright" />
                <span>إلغاء معاملة محفظة / إنستاباي</span>
              </h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => setCancellingTx(null)} />
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-xs flex flex-col gap-1.5">
                <div className="flex justify-between font-bold">
                  <span className="text-ink-muted dark:text-ink-muted-dark">رقم العملية:</span>
                  <span className="font-mono text-ink dark:text-ink-dark">{cancellingTx.transactionNumber}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-ink-muted dark:text-ink-muted-dark">الحساب:</span>
                  <span className="text-ink dark:text-ink-dark">{cancellingTx.accountName || 'محفظة'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted dark:text-ink-muted-dark">نوع العملية:</span>
                  <span className="font-bold text-ink dark:text-ink-dark">{cancellingTx.txTypeArabic || (cancellingTx.txType === 'cash_out' ? 'سحب كاش' : 'إيداع')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted dark:text-ink-muted-dark">المبلغ:</span>
                  <span className="font-mono font-bold text-ink dark:text-ink-dark">{cancellingTx.amountFormatted || formatArabicCurrency(cancellingTx.amountPiasters)}</span>
                </div>
                {cancellingTx.profitPiasters > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted dark:text-ink-muted-dark">الربح المحتسب:</span>
                    <span className="font-mono font-bold text-paid dark:text-paid-bright">{cancellingTx.profitFormatted || formatArabicCurrency(cancellingTx.profitPiasters)}</span>
                  </div>
                )}
                <div className="text-micro text-danger dark:text-danger-bright font-medium mt-1 pt-1 border-t border-line dark:border-line-dark">
                  سيتم التراجع عن حركة الرصيد في المحفظة والدرج، ولا يمكن التراجع بعد الإلغاء.
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">سبب الإلغاء: <RequiredMark /></label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: خطأ في إدخال الرقم / بناءً على طلب العميل"
                  className={FIELD_INPUT_CLS}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line dark:border-line-dark mt-1">
                <AppButton variant="secondary" size="md" onClick={() => setCancellingTx(null)}>
                  تراجع
                </AppButton>
                <AppButton
                  variant="danger"
                  size="md"
                  icon={AlertTriangle}
                  disabled={isSubmittingCancel || !cancelReason.trim()}
                  onClick={handleCancelTransaction}
                >
                  {isSubmittingCancel ? 'جاري الإلغاء...' : 'تأكيد إلغاء العملية'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
