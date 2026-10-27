import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  TrendingUp,
  Receipt,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  Pencil,
  Trash2,
  Lock,
  ShieldCheck,
  Coins,
  DollarSign,
  Phone,
  User,
  Hash,
  Landmark,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription, emitDataChanged } from '../../utils/eventBus';
import { formatArabicCurrency } from '../../utils/money';
import { rafiqConfirm } from '../../utils/dialogService';
import { useAuth } from '../../context/useAuth';
import { useFeatures } from '../../context/useFeatures';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import type {
  DigitalAccount,
  DigitalTransaction,
  DigitalAccountFunding,
  DigitalAnalyticsSummary,
  DigitalAccountType,
} from '../../types/models';

export type WalletsSubTab = 'transact' | 'accounts' | 'history' | 'analytics';

export interface WalletsViewProps {
  isActive?: boolean;
  activeSubTab?: WalletsSubTab;
  onSubTabChange?: (tab: WalletsSubTab) => void;
}

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
    border: 'border-red-500/30',
    bgSoft: 'bg-red-50 dark:bg-red-950/25',
    text: 'text-red-600 dark:text-red-400',
  },
  {
    code: 'orange_cash',
    name: 'أورانج كاش (Orange Cash)',
    shortName: 'أورانج كاش',
    badge: 'أورانج',
    border: 'border-amber-500/30',
    bgSoft: 'bg-amber-50 dark:bg-amber-950/25',
    text: 'text-amber-600 dark:text-amber-400',
  },
  {
    code: 'etisalat_cash',
    name: 'اتصالات كاش (Etisalat Cash / e&)',
    shortName: 'اتصالات كاش',
    badge: 'اتصالات',
    border: 'border-emerald-500/30',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-950/25',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    code: 'we_pay',
    name: 'وي باي (WE Pay - المصرية للاتصالات)',
    shortName: 'وي باي',
    badge: 'وي باي',
    border: 'border-purple-500/30',
    bgSoft: 'bg-purple-50 dark:bg-purple-950/25',
    text: 'text-purple-600 dark:text-purple-400',
  },
  {
    code: 'meeza_wallet',
    name: 'محفظة ميزة الرقمية الذكية (Meeza Wallet)',
    shortName: 'ميزة كاش',
    badge: 'ميزة',
    border: 'border-blue-500/30',
    bgSoft: 'bg-blue-50 dark:bg-blue-950/25',
    text: 'text-blue-600 dark:text-blue-400',
  },
  {
    code: 'nbe_phone_cash',
    name: 'محفظة فون كاش (البنك الأهلي المصري)',
    shortName: 'الأهلي فون كاش',
    badge: 'فون كاش',
    border: 'border-emerald-600/30',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-950/25',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    code: 'bm_wallet',
    name: 'محفظة BM Wallet (بنك مصر)',
    shortName: 'محفظة بنك مصر',
    badge: 'بنك مصر',
    border: 'border-red-600/30',
    bgSoft: 'bg-red-50 dark:bg-red-950/25',
    text: 'text-red-700 dark:text-red-300',
  },
  {
    code: 'cib_smart_wallet',
    name: 'المحفظة الذكية Smart Wallet (CIB)',
    shortName: 'سمارت واليت CIB',
    badge: 'CIB Wallet',
    border: 'border-blue-600/30',
    bgSoft: 'bg-blue-50 dark:bg-blue-950/25',
    text: 'text-blue-700 dark:text-blue-300',
  },
  {
    code: 'bdc_qahera_cash',
    name: 'محفظة قاهرة كاش (بنك القاهرة)',
    shortName: 'قاهرة كاش',
    badge: 'قاهرة كاش',
    border: 'border-orange-600/30',
    bgSoft: 'bg-orange-50 dark:bg-orange-950/25',
    text: 'text-orange-700 dark:text-orange-300',
  },
  {
    code: 'alex_wallet',
    name: 'محفظة بنك الإسكندرية الذكية (Alex Wallet)',
    shortName: 'محفظة إسكندرية',
    badge: 'إسكندرية',
    border: 'border-teal-500/30',
    bgSoft: 'bg-teal-50 dark:bg-teal-950/25',
    text: 'text-teal-700 dark:text-teal-300',
  },
  {
    code: 'qnb_wallet',
    name: 'محفظة QNB الأهلي الإلكترونية',
    shortName: 'محفظة QNB',
    badge: 'QNB Wallet',
    border: 'border-rose-500/30',
    bgSoft: 'bg-rose-50 dark:bg-rose-950/25',
    text: 'text-rose-700 dark:text-rose-300',
  },
  {
    code: 'other',
    name: 'محفظة إلكترونية أخرى',
    shortName: 'محفظة أخرى',
    badge: 'أخرى',
    border: 'border-line dark:border-line-dark',
    bgSoft: 'bg-surface-2 dark:bg-surface-dark-2',
    text: 'text-ink-muted dark:text-ink-dark-muted',
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
      text: 'text-ink-muted dark:text-ink-dark-muted',
      isBank: false,
    };
  }

  if (acc.accountType === 'instapay') {
    const bank = INSTAPAY_BANKS.find(
      (b) => b.code === acc.provider || `instapay_${b.code}` === acc.provider
    );
    return {
      name: bank ? bank.name : 'حساب إنستاباي (InstaPay)',
      badge: bank ? `إنستاباي • ${bank.badge}` : 'إنستاباي',
      border: 'border-violet-500/30',
      bgSoft: 'bg-violet-50 dark:bg-violet-950/25',
      text: 'text-violet-700 dark:text-violet-300',
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
    text: 'text-ink-muted dark:text-ink-dark-muted',
    isBank: false,
  };
};

export const WalletsView: React.FC<WalletsViewProps> = ({
  isActive = true,
  activeSubTab = 'transact',
  onSubTabChange: _onSubTabChange,
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

  // Data State
  const [accounts, setAccounts] = useState<DigitalAccount[]>([]);
  const [transactions, setTransactions] = useState<DigitalTransaction[]>([]);
  const [_fundings, setFundings] = useState<DigitalAccountFunding[]>([]);
  const [analytics, setAnalytics] = useState<DigitalAnalyticsSummary | null>(null);
  const [_loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Form State: 2 Direct Inputs (Amount & Profit)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [txType, setTxType] = useState<'cash_out' | 'cash_in'>('cash_out');
  const [amountPiasters, setAmountPiasters] = useState<number>(0);
  const [profitPiasters, setProfitPiasters] = useState<number>(0);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [lastProcessedTx, setLastProcessedTx] = useState<DigitalTransaction | null>(null);

  // Filter State for History
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState<string>('');

  // Modals
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<DigitalAccount | null>(null);
  const [accountFormName, setAccountFormName] = useState('');
  const [accountFormType, setAccountFormType] = useState<DigitalAccountType>('instapay');
  const [accountFormProvider, setAccountFormProvider] = useState<string>('nbe');
  const [accountFormPhone, setAccountFormPhone] = useState('');
  const [accountFormIdentifier, setAccountFormIdentifier] = useState('');
  const [accountFormBalance, setAccountFormBalance] = useState<number>(0);
  const [accountFormDailyLimit, setAccountFormDailyLimit] = useState<number>(7000000);
  const [accountFormMonthlyLimit, setAccountFormMonthlyLimit] = useState<number>(40000000);
  const [accountFormNotes, setAccountFormNotes] = useState('');
  // Funding Modal
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [fundingAmountPiasters, setFundingAmountPiasters] = useState<number>(0);
  const [fundingSource, setFundingSource] = useState<'cash_drawer' | 'bank_transfer' | 'external_cash'>('cash_drawer');
  const [fundingNotes, setFundingNotes] = useState('');
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

  const isAccountDirty = useCallback(() => {
    if (editingAccount) {
      return (
        accountFormName !== editingAccount.name ||
        accountFormType !== editingAccount.accountType ||
        accountFormProvider !== editingAccount.provider ||
        accountFormPhone !== (editingAccount.phoneNumber || '') ||
        accountFormIdentifier !== (editingAccount.identifier || '') ||
        accountFormBalance !== editingAccount.balancePiasters ||
        accountFormDailyLimit !== (editingAccount.dailyLimitPiasters || 7000000) ||
        accountFormMonthlyLimit !== (editingAccount.monthlyLimitPiasters || 40000000) ||
        accountFormNotes !== (editingAccount.notes || '')
      );
    }
    return Boolean(
      accountFormName.trim() ||
      accountFormPhone.trim() ||
      accountFormIdentifier.trim() ||
      accountFormBalance > 0 ||
      accountFormNotes.trim()
    );
  }, [
    editingAccount,
    accountFormName,
    accountFormType,
    accountFormProvider,
    accountFormPhone,
    accountFormIdentifier,
    accountFormBalance,
    accountFormDailyLimit,
    accountFormMonthlyLimit,
    accountFormNotes,
  ]);

  const { requestClose: requestCloseAccount, handleBackdropClick: handleAccountBackdropClick } = useModalDismiss({
    isOpen: isAccountModalOpen,
    onClose: () => setIsAccountModalOpen(false),
    isDirty: isAccountDirty,
    confirmTitle: 'بيانات الحساب غير محفوظة',
    confirmMessage: 'هناك تعديلات على بيانات الحساب لم تُحفظ بعد، هل أنت متأكد من الخروج وتجاهلها؟',
  });

  // Notification Banner
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!feedbackMsg) return;
    const t = setTimeout(() => setFeedbackMsg(null), 5000);
    return () => clearTimeout(t);
  }, [feedbackMsg]);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accsRes, txsRes, fundRes, anRes] = await Promise.all([
        invoke<DigitalAccount[]>('wallets:getAccounts'),
        invoke<DigitalTransaction[]>('wallets:getTransactions'),
        invoke<DigitalAccountFunding[]>('wallets:getFundings'),
        invoke<DigitalAnalyticsSummary>('wallets:getAnalytics'),
      ]);

      setAccounts(accsRes || []);
      setTransactions(txsRes || []);
      setFundings(fundRes || []);
      setAnalytics(anRes || null);

      if ((!selectedAccountId || !accsRes?.some((a) => a.id === selectedAccountId)) && accsRes && accsRes.length > 0) {
        setSelectedAccountId(accsRes[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load wallets data:', err);
      setFeedbackMsg({ type: 'error', text: 'تعذر تحميل بيانات المحافظ الإلكترونية. تأكد من عمل النظام.' });
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (isActive) {
      void loadData();
    }
  }, [isActive, loadData]);

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

  // Event bus subscription for live updates
  useDataSubscription(['wallets', 'all'], () => {
    loadData();
  });

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

  // Submit Transaction
  const handleProcessTransaction = async () => {
    if (!selectedAccount) {
      setFeedbackMsg({ type: 'error', text: 'يرجى اختيار المحفظة أو الحساب المطلوب أولاً.' });
      return;
    }

    if (amountPiasters <= 0) {
      setFeedbackMsg({ type: 'error', text: 'يرجى إدخال مبلغ صحيح للعملية أكبر من صفر.' });
      return;
    }

    if (hasInsufficientBalance) {
      setFeedbackMsg({
        type: 'error',
        text: `رصيد المحفظة الحالي (${formatArabicCurrency(selectedAccount.balancePiasters)}) غير كافٍ لتنفيذ عملية تحويل بمبلغ (${formatArabicCurrency(amountPiasters)}).`,
      });
      return;
    }

    try {
      setActionLoading(true);
      const res = await invoke<DigitalTransaction>('wallets:processTransaction', {
        accountId: selectedAccount.id,
        txType,
        amountPiasters,
        profitPiasters,
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        performedBy: currentUserName,
      });

      setLastProcessedTx(res);
      setFeedbackMsg({
        type: 'success',
        text: `تم حفظ المعاملة بنجاح برقم إيصال (${res.transactionNumber}). تم تحديث رصيد المحفظة وأرباح الوردية.`,
      });

      // Reset form
      setAmountPiasters(0);
      setProfitPiasters(0);
      setCustomerPhone('');
      setCustomerName('');
      setReferenceNumber('');
      setNotes('');

      await loadData();
    } catch (err: any) {
      console.error('Failed to process wallet transaction:', err);
      setFeedbackMsg({ type: 'error', text: err?.message || 'فشلت معالجة المعاملة. يرجى إعادة المحاولة.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Funding Modal
  const handleOpenFundingModal = (accId?: string) => {
    setFundingAccountId(accId || selectedAccountId || (accounts[0] ? accounts[0].id : ''));
    setFundingAmountPiasters(0);
    setFundingSource('cash_drawer');
    setFundingNotes('');
    void fetchLiveDrawerCash();
    setIsFundingModalOpen(true);
  };

  // Save Funding
  const handleSaveFunding = async () => {
    if (!fundingAccountId || fundingAmountPiasters <= 0) {
      setFeedbackMsg({ type: 'error', text: 'يرجى اختيار الحساب وتحديد مبلغ شحن صحيح أكبر من صفر.' });
      return;
    }

    if (fundingSource === 'cash_drawer' && liveDrawerCashPiasters !== null) {
      if (liveDrawerCashPiasters <= 0) {
        setFeedbackMsg({
          type: 'error',
          text: 'درج الكاشير فارغ (0.00 ج.م). لا يمكن سحب نقدية من درج فارغ. يرجى اختيار «كاش خارجي / صاحب المحل» إذا كان المبلغ مدفوعاً من خارج عهدة الدرج.',
        });
        return;
      }
      if (fundingAmountPiasters > liveDrawerCashPiasters) {
        setFeedbackMsg({
          type: 'error',
          text: `المبلغ المطلوب (${formatArabicCurrency(fundingAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى تقليل المبلغ أو اختيار «كاش خارجي / صاحب المحل».`,
        });
        return;
      }
    }

    try {
      setActionLoading(true);
      await invoke('wallets:fundAccount', {
        accountId: fundingAccountId,
        amountPiasters: fundingAmountPiasters,
        source: fundingSource,
        notes: fundingNotes.trim() || undefined,
        performedBy: currentUserName,
      });

      setIsFundingModalOpen(false);
      setFeedbackMsg({
        type: 'success',
        text: `تم شحن رصيد المحفظة بنجاح بمبلغ (${formatArabicCurrency(fundingAmountPiasters)}).`,
      });
      await loadData();
    } catch (err: any) {
      console.error('Failed to fund account:', err);
      setFeedbackMsg({ type: 'error', text: err?.message || 'فشلت عملية شحن المحفظة.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Account Type Switching in Modal
  const handleAccountTypeChange = (newType: DigitalAccountType) => {
    setAccountFormType(newType);
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
    if (acc) {
      setEditingAccount(acc);
      setAccountFormName(acc.name);
      setAccountFormType(acc.accountType);
      setAccountFormProvider(acc.provider);
      setAccountFormPhone(acc.phoneNumber || '');
      setAccountFormIdentifier(acc.identifier || '');
      setAccountFormBalance(acc.balancePiasters);
      setAccountFormDailyLimit(acc.dailyLimitPiasters || (acc.accountType === 'instapay' ? 7000000 : 6000000));
      setAccountFormMonthlyLimit(acc.monthlyLimitPiasters || (acc.accountType === 'instapay' ? 40000000 : 20000000));
      setAccountFormNotes(acc.notes || '');
    } else {
      setEditingAccount(null);
      // Default to InstaPay with NBE (National Bank of Egypt)
      setAccountFormType('instapay');
      setAccountFormProvider('nbe');
      setAccountFormName('إنستاباي - الأهلي المصري');
      setAccountFormPhone('');
      setAccountFormIdentifier('');
      setAccountFormBalance(0);
      setAccountFormDailyLimit(7000000);
      setAccountFormMonthlyLimit(40000000);
      setAccountFormNotes('');
    }
    setIsAccountModalOpen(true);
  };

  // Save Account
  const handleSaveAccount = async () => {
    if (!accountFormName.trim()) {
      setFeedbackMsg({ type: 'error', text: 'يرجى كتابة اسم تعريفي للمحفظة أو الحساب.' });
      return;
    }

    try {
      setActionLoading(true);
      await invoke('wallets:saveAccount', {
        id: editingAccount ? editingAccount.id : undefined,
        name: accountFormName.trim(),
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

      setFeedbackMsg({
        type: 'success',
        text: editingAccount
          ? `تم تحديث بيانات الحساب (${accountFormName}) بنجاح.`
          : `تم حفظ وإضافة (${accountFormName}) بنجاح.`,
      });

      setIsAccountModalOpen(false);
      await loadData();
      emitDataChanged('wallets');
    } catch (err: any) {
      console.error('Failed to save account:', err);
      setFeedbackMsg({ type: 'error', text: err?.message || 'فشل حفظ بيانات الحساب.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Account
  const handleDeleteAccount = async (acc: DigitalAccount) => {
    const confirmed = await rafiqConfirm({
      title: 'حذف المحفظة أو الحساب',
      message: `هل أنت متأكد من حذف (${acc.name})؟ لن يمكن التراجع في حالة وجود حركات مرتبطة بها.`,
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      setActionLoading(true);
      await invoke('wallets:deleteAccount', { id: acc.id });
      setIsAccountModalOpen(false);
      setFeedbackMsg({ type: 'success', text: `تم حذف المحفظة (${acc.name}) بنجاح.` });
      await loadData();
      emitDataChanged('wallets');
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      setFeedbackMsg({ type: 'error', text: err?.message || 'تعذر حذف المحفظة لوجود حركات مسجلة عليها.' });
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
      });
      setCancellingTx(null);
      setCancelReason('');
      setFeedbackMsg({ type: 'success', text: 'تم إلغاء العملية وتصحيح رصيد المحفظة والدرج بنجاح.' });
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
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
      if (filterType !== 'all' && t.txType !== filterType) return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const matchesRef = t.transactionNumber?.toLowerCase().includes(q);
        const matchesPhone = t.customerPhone?.toLowerCase().includes(q);
        const matchesName = t.customerName?.toLowerCase().includes(q);
        const matchesNotes = t.notes?.toLowerCase().includes(q);
        if (!matchesRef && !matchesPhone && !matchesName && !matchesNotes) return false;
      }
      return true;
    });
  }, [transactions, filterAccount, filterType, historySearch]);

  const {
    paginatedItems: paginatedHistory,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalCount,
    totalPages,
  } = useClientPagination(filteredTransactions, 12);

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
    { value: 'cash_out', label: 'سحب كاش / تحويل خارج' },
    { value: 'cash_in', label: 'إيداع / استلام في المحفظة' },
    { value: 'sale_credit', label: 'سداد مبيعات الكاشير' },
    { value: 'funding', label: 'شحن وتغذية رصيد' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark select-none overflow-y-auto" dir="rtl">
      
      {/* 1. Standard Rafiq POS Top Header Bar */}
      <header className="bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid/30 flex items-center justify-center shrink-0 shadow-2xs">
            <Smartphone className="w-5 h-5 text-paid dark:text-paid-bright" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">المحافظ الإلكترونية وإنستاباي</span>
              <span className="text-ink-muted/40 dark:text-ink-dark-muted/40 font-bold">/</span>
              <h1 className="text-base sm:text-lg font-black text-ink dark:text-white m-0">
                {currentTab === 'transact' && 'تنفيذ عملية سريعة (سحب / إيداع)'}
                {currentTab === 'accounts' && 'أرصدة المحافظ والحسابات'}
                {currentTab === 'history' && 'سجل العمليات والإيصالات'}
                {currentTab === 'analytics' && 'أرباح وتحليلات المحافظ'}
              </h1>
            </div>
            <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5 font-medium">
              {currentTab === 'transact' && 'سحب نقدي وتحويل للزبائن مع التحكم المباشر بمبلغ العملية وربح المحل'}
              {currentTab === 'accounts' && 'متابعة أرصدة المحافظ والحدود اليومية والشهرية وتغذية الرصيد'}
              {currentTab === 'history' && 'أرشيف العمليات المنجزة وأرقام الإيصالات وسجل التدقيق المالي'}
              {currentTab === 'analytics' && 'تقارير أرباح المحافظ المستقلة عن بضاعة المحل والسيولة النقدية'}
            </p>
          </div>
        </div>

        {/* Context-Aware Action Buttons - Only Relevant Actions per Tab */}
        {currentTab === 'accounts' && canManageAccounts && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenAccountModal()}
              className="h-9 px-3.5 rounded-xl bg-brand dark:bg-brand-bright text-white dark:text-slate-900 text-xs font-bold hover:bg-brand-dark flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-98"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إضافة محفظة / حساب بنكي</span>
            </button>
          </div>
        )}
      </header>

      {/* Notifications Alert Banner */}
      {feedbackMsg && (
        <div className={`mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200 ${
          feedbackMsg.type === 'error'
            ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright'
            : 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid/30 text-paid dark:text-paid-bright'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-danger dark:text-danger-bright" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="p-1 hover:opacity-80 rounded-lg cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Main Workspace Area */}
      <div className="flex-1 p-4 sm:p-6 min-h-0">

        {/* ================================================================ */}
        {/* SUB-TAB 1: TRANSACT (The 2-Input High-Speed Senior Workstation)   */}
        {/* ================================================================ */}
        {currentTab === 'transact' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Right Column: 7 Cols - Main Entry Form */}
            <div className="lg:col-span-7 bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-5 sm:p-6 flex flex-col gap-5 shadow-2xs">
              
              {/* Step 1: Account Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
                    <span className="w-4.5 h-4.5 rounded-full bg-brand-soft text-brand-dark dark:bg-brand-dark-soft dark:text-brand-bright inline-flex items-center justify-center text-[10px] font-black">
                      1
                    </span>
                    <span>اختيار المحفظة أو الحساب المطلوب</span>
                  </label>
                  {selectedAccount && (
                    <span className="text-[11px] font-mono text-ink-muted dark:text-ink-dark-muted">
                      الرصيد المتاح: <strong className="text-paid dark:text-paid-bright font-black">{formatArabicCurrency(selectedAccount.balancePiasters)}</strong>
                    </span>
                  )}
                </div>

                {accounts.length === 0 ? (
                  <div className="p-4 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl text-warn dark:text-warn-bright text-xs font-bold flex items-center justify-between">
                    <span>لا توجد محافظ أو حسابات إنستاباي مسجلة حالياً.</span>
                    <button
                      type="button"
                      onClick={() => handleOpenAccountModal()}
                      className="px-3 py-1.5 bg-warn hover:bg-warn/90 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs"
                    >
                      إضافة حساب الآن
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {accounts.map((acc) => {
                      const isSelected = acc.id === selectedAccountId;
                      const info = getAccountDisplayInfo(acc);
                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`cursor-pointer p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-dark-soft ring-2 ring-brand/20 dark:ring-brand-bright/20 shadow-2xs'
                              : 'border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-hover bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-xs text-ink dark:text-white truncate">
                              {acc.name}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${info.border} ${info.bgSoft} ${info.text}`}>
                              {info.badge}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[11px] font-mono text-ink-muted dark:text-ink-dark-muted truncate max-w-[130px]">
                              {acc.phoneNumber || acc.identifier || 'رقم الحساب'}
                            </span>
                            <span className="text-xs font-black font-mono text-paid dark:text-paid-bright tabular-nums">
                              {formatArabicCurrency(acc.balancePiasters)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Operation Type Segmented Control */}
              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5 mb-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-soft text-brand-dark dark:bg-brand-dark-soft dark:text-brand-bright inline-flex items-center justify-center text-[10px] font-black">
                    2
                  </span>
                  <span>نوع العملية المطلوب تنفيذها</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5 p-1 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
                  <button
                    type="button"
                    onClick={() => setTxType('cash_out')}
                    className={`h-11 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isCashOut
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-white'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>سحب كاش / تحويل خارج للزبون</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTxType('cash_in')}
                    className={`h-11 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      !isCashOut
                        ? 'bg-paid text-white shadow-xs'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-white'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>إيداع / استلام في المحفظة</span>
                  </button>
                </div>
                <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1.5 font-medium px-1">
                  {isCashOut
                    ? '• سحب كاش: الزبون يطلب تحويل كاش من محفظتك ➜ يُخصم المبلغ فقط من رصيد المحفظة وتستلم من الزبون كاش الدرج + ربح المحل.'
                    : '• إيداع رصيد: الزبون يحول رصيد لمحفظتك ➜ يزداد رصيد المحفظة بالمبلغ وتستلم من الزبون كاش الدرج + عمولتك.'}
                </p>
              </div>

              {/* Step 3: Customer & Transaction Details */}
              <div className="pt-1 border-t border-line dark:border-line-dark">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5 mb-2.5">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-soft text-brand-dark dark:bg-brand-dark-soft dark:text-brand-bright inline-flex items-center justify-center text-[10px] font-black">
                    3
                  </span>
                  <span>بيانات الزبون والعملية (اختياري)</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>هاتف الزبون</span>
                    </label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="01012345678"
                      className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left focus:bg-surface dark:focus:bg-surface-dark focus:border-brand outline-hidden transition-all shadow-2xs"
                      dir="ltr"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>اسم العميل</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="اسم صاحب التحويل"
                      className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs focus:bg-surface dark:focus:bg-surface-dark focus:border-brand outline-hidden transition-all shadow-2xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>رقم العملية / المرجع</span>
                    </label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="مرجع الرسالة"
                      className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left focus:bg-surface dark:focus:bg-surface-dark focus:border-brand outline-hidden transition-all shadow-2xs"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: The Core Financial Amount & Profit Inputs */}
              <div className="space-y-3.5 pt-1 border-t border-line dark:border-line-dark">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
                  <span className="w-4.5 h-4.5 rounded-full bg-brand-soft text-brand-dark dark:bg-brand-dark-soft dark:text-brand-bright inline-flex items-center justify-center text-[10px] font-black">
                    4
                  </span>
                  <span>المبالغ المالية والعمولة</span>
                </label>
                
                {/* Input 1: مبلغ العملية (المحول / المستلم) */}
                <div className="bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black text-ink dark:text-white flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-brand dark:text-brand-bright" />
                      <span>مبلغ العملية (المحول / المستلم)</span>
                    </label>
                    <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">
                      {isCashOut ? 'يُخصم فقط من رصيد المحفظة' : 'يُضاف إلى رصيد المحفظة'}
                    </span>
                  </div>

                  <MoneyInput
                    valuePiasters={amountPiasters}
                    onChangePiasters={(val) => setAmountPiasters(val)}
                    placeholder="0.00"
                    className="h-12 text-2xl font-black font-mono text-center bg-surface dark:bg-surface-dark border-line dark:border-line-dark text-ink dark:text-white rounded-xl shadow-2xs focus:border-brand"
                    autoFocus
                  />
                </div>

                {/* Input 2: ربح المحل / عمولة الوردية */}
                <div className="bg-paid-soft/50 dark:bg-paid-dark-soft/30 rounded-xl border border-paid-border dark:border-paid/30 p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black text-paid dark:text-paid-bright flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-paid dark:text-paid-bright" />
                      <span>ربح المحل / عمولة الوردية المكتسبة</span>
                    </label>
                    <span className="text-[11px] font-bold text-paid dark:text-paid-bright">
                      إيراد صافٍ • لا يدخل في رصيد المحفظة
                    </span>
                  </div>

                  <MoneyInput
                    valuePiasters={profitPiasters}
                    onChangePiasters={(val) => setProfitPiasters(val)}
                    placeholder="0.00"
                    className="h-12 text-2xl font-black font-mono text-center bg-surface dark:bg-surface-dark border-paid-border dark:border-paid/40 text-paid dark:text-paid-bright rounded-xl shadow-2xs focus:border-paid"
                  />
                </div>

              </div>

            </div>

            {/* Left Column: 5 Cols - Live Calculations & One-Click Execution */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              
              {/* Card 1: Transparent Real-Time Financial Impact Card */}
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-5 shadow-2xs flex flex-col gap-4">
                
                <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted">
                      <DollarSign className="w-4 h-4 text-brand dark:text-brand-bright" />
                    </div>
                    <div>
                      <h2 className="text-xs font-black text-ink dark:text-white m-0">
                        الأثر المالي اللحظي للعملية
                      </h2>
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
                        حساب دقيق ومنفصل عن بضاعة المحل
                      </span>
                    </div>
                  </div>

                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isCashOut
                      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/40'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40'
                  }`}>
                    {isCashOut ? 'سحب كاش للزبون' : 'إيداع بالمحفظة'}
                  </span>
                </div>

                {/* Account Status Breakdown */}
                {selectedAccount && (
                  <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted dark:text-ink-dark-muted font-bold">الحساب النشط:</span>
                      <span className="font-bold text-ink dark:text-white truncate max-w-[170px]">{selectedAccount.name}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted dark:text-ink-dark-muted">الرصيد الفعلي الحالي:</span>
                      <span className="font-mono font-bold text-ink dark:text-white">
                        {formatArabicCurrency(selectedAccount.balancePiasters)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs border-t border-line/60 dark:border-line-dark/60 pt-1.5">
                      <span className="text-ink-muted dark:text-ink-dark-muted">الرصيد المتوقع بعد العملية:</span>
                      <span className={`font-mono font-black ${
                        projectedBalance < 0
                          ? 'text-danger dark:text-danger-bright'
                          : 'text-paid dark:text-paid-bright'
                      }`}>
                        {formatArabicCurrency(projectedBalance)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Cash Drawer & Fee Calculation */}
                <div className="space-y-2.5 py-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">
                      مبلغ المعاملة الأساسي:
                    </span>
                    <span className="text-sm font-mono font-bold text-ink dark:text-white">
                      {formatArabicCurrency(amountPiasters)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-paid dark:text-paid-bright font-bold">
                      عمولة / ربح المحل الصافي:
                    </span>
                    <span className="text-sm font-mono font-black text-paid dark:text-paid-bright">
                      +{formatArabicCurrency(profitPiasters)}
                    </span>
                  </div>

                  {/* Summary Box */}
                  <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark mt-2">
                    <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                      {isCashOut ? 'المطلوب قبضه من الزبون كاش (للدرج):' : 'المطلوب تسليمه للزبون كاش:'}
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-black font-mono text-brand-dark dark:text-brand-bright">
                        {formatArabicCurrency(isCashOut ? cashTakenFromCustomer : cashGivenToCustomer)}
                      </span>
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-medium">
                        (شامل الربح والمبلغ)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warning if balance is insufficient */}
                {hasInsufficientBalance && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>
                      رصيد المحفظة الحالي ({formatArabicCurrency(selectedAccount?.balancePiasters || 0)}) غير كافٍ لإتمام العملية.
                    </span>
                  </div>
                )}

                {/* Primary Submit Button */}
                <button
                  type="button"
                  onClick={handleProcessTransaction}
                  disabled={actionLoading || amountPiasters <= 0 || hasInsufficientBalance}
                  className={`h-12 w-full rounded-xl font-black text-sm text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:pointer-events-none ${
                    isCashOut
                      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                      : 'bg-paid hover:bg-paid-dark active:bg-paid-darker'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {actionLoading
                      ? 'جاري حفظ المعاملة...'
                      : isCashOut
                        ? 'تأكيد خصم المبلغ من المحفظة وحفظ الربح'
                        : 'تأكيد إضافة المبلغ للمحفظة وحفظ الربح'}
                  </span>
                </button>

              </div>

              {/* Card 2: Last Processed Transaction Mini-Receipt */}
              {lastProcessedTx && (
                <div className="bg-surface dark:bg-surface-dark border border-paid/30 rounded-2xl p-4 shadow-2xs flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-paid-soft text-paid flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-paid dark:text-paid-bright">
                        تمت المعاملة بنجاح!
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastProcessedTx(null)}
                      className="p-1 text-ink-muted hover:text-ink rounded-lg cursor-pointer"
                      title="إخفاء"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2 dark:bg-surface-dark-2 p-2.5 rounded-xl font-mono">
                    <div>
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block">رقم الإيصال</span>
                      <strong className="text-ink dark:text-white">{lastProcessedTx.transactionNumber}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block">المبلغ المنفذ</span>
                      <strong className="text-ink dark:text-white">{lastProcessedTx.amountFormatted}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block">ربح المحل</span>
                      <strong className="text-paid dark:text-paid-bright">{lastProcessedTx.profitFormatted}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block">الرصيد بعد</span>
                      <strong className="text-ink dark:text-white">{lastProcessedTx.balanceAfterFormatted}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 3: Quick Integration Info Notice */}
              <div className="p-4 bg-surface-2/70 dark:bg-surface-dark-2/70 rounded-2xl border border-line dark:border-line-dark flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-paid dark:text-brand-bright shrink-0 mt-0.5" />
                <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                  <strong className="text-ink dark:text-white block mb-0.5">ربط آلي مع شاشة الكاشير:</strong>
                  أي عملية سداد عبر «إنستاباي» أو «محفظة» في شاشة البيع تُسجل تلقائياً هنا في سجل الحسابات وتزيد من رصيدك.
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 2: ACCOUNTS LIST & MANAGEMENT                           */}
        {/* ================================================================ */}
        {currentTab === 'accounts' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
            
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-black text-ink dark:text-white m-0">
                  أرصدة المحافظ والحسابات البنكية وإنستاباي
                </h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0">
                  متابعة الأرصدة الحالية، الحدود الشهرية، وإمكانية تعديل وتغذية كل حساب
                </p>
              </div>
            </div>

            {/* Quick 3 Balances Overview Row in Accounts Tab */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5">
                    إجمالي رصيد محافظ الكاش
                  </span>
                  <span className="text-lg font-black font-mono text-paid dark:text-paid-bright">
                    {analytics?.walletsBalanceFormatted || formatArabicCurrency(calculatedWalletsBalancePiasters)}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5">
                    إجمالي رصيد إنستاباي (البنوك)
                  </span>
                  <span className="text-lg font-black font-mono text-violet-700 dark:text-violet-300">
                    {analytics?.instapayBalanceFormatted || formatArabicCurrency(calculatedInstapayBalancePiasters)}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center">
                  <Landmark className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5">
                    إجمالي السيولة النقدية المتاحة
                  </span>
                  <span className="text-lg font-black font-mono text-brand dark:text-brand-bright">
                    {analytics?.totalBalanceFormatted || formatArabicCurrency(calculatedTotalBalancePiasters)}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Account Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {accounts.map((acc) => {
                const info = getAccountDisplayInfo(acc);
                const isLow = acc.balancePiasters < 50000;
                const dailyLimit = acc.dailyLimitPiasters || (acc.accountType === 'instapay' ? 7000000 : 6000000);
                const monthlyLimit = acc.monthlyLimitPiasters || (acc.accountType === 'instapay' ? 40000000 : 20000000);

                return (
                  <div
                    key={acc.id}
                    className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 shadow-2xs flex flex-col justify-between gap-3.5 hover:shadow-xs transition-shadow"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${info.border} ${info.bgSoft} ${info.text} flex items-center gap-1`}>
                          {info.isBank ? <Landmark className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                          <span>{info.badge}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {canFund && (
                            <button
                              type="button"
                              onClick={() => handleOpenFundingModal(acc.id)}
                              className="h-7 px-2.5 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright hover:bg-paid hover:text-white text-[11px] font-bold transition-all cursor-pointer"
                            >
                              + شحن
                            </button>
                          )}
                          {canManageAccounts && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenAccountModal(acc)}
                                className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center justify-center transition-all cursor-pointer"
                                title="تعديل بيانات الحساب"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAccount(acc)}
                                className="w-7 h-7 rounded-lg text-ink-muted hover:text-danger hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center transition-all cursor-pointer"
                                title="حذف / أرشفة الحساب"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-black text-ink dark:text-white mb-1">
                        {acc.name}
                      </h3>
                      <p className="text-xs font-mono text-ink-muted dark:text-ink-dark-muted mb-3 truncate">
                        {acc.identifier || acc.phoneNumber || 'بدون رقم مسجل'}
                      </p>

                      <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark font-mono flex items-center justify-between">
                        <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-sans font-bold">
                          الرصيد الفعلي:
                        </span>
                        <span className={`text-lg font-black ${
                          isLow ? 'text-amber-600 dark:text-warn-bright' : 'text-paid dark:text-paid-bright'
                        }`}>
                          {formatArabicCurrency(acc.balancePiasters)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-line dark:border-line-dark flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted font-mono">
                      <span>حد يومي: {formatArabicCurrency(dailyLimit)}</span>
                      <span>حد شهري: {formatArabicCurrency(monthlyLimit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 3: TRANSACTION HISTORY & RECEIPTS                        */}
        {/* ================================================================ */}
        {currentTab === 'history' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
            
            {/* Filter Bar */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3 flex-wrap flex-1">
                <div className="relative min-w-[200px] flex-1 max-w-xs">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="بحث برقم الإيصال أو هاتف العميل..."
                    className="w-full h-9 pr-9 pl-3 text-xs bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl focus:border-brand outline-hidden"
                  />
                </div>

                <div className="w-52">
                  <CustomSelect
                    value={filterAccount}
                    onChange={(val) => setFilterAccount(val)}
                    options={filterAccountOptions}
                    size="sm"
                  />
                </div>

                <div className="w-48">
                  <CustomSelect
                    value={filterType}
                    onChange={(val) => setFilterType(val)}
                    options={filterTypeOptions}
                    size="sm"
                  />
                </div>
              </div>

              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted font-mono">
                إجمالي السجلات: {totalCount}
              </span>
            </div>

            {/* Table */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold h-10">
                      <th className="px-4">رقم العملية</th>
                      <th className="px-4">نوع الحركة</th>
                      <th className="px-4">المحفظة / الحساب</th>
                      <th className="px-4 font-mono">المبلغ</th>
                      <th className="px-4 font-mono">ربح المحل</th>
                      <th className="px-4 font-mono">الرصيد بعد</th>
                      <th className="px-4">بيانات العميل</th>
                      <th className="px-4">التاريخ والوقت</th>
                      <th className="px-4">المستخدم</th>
                      <th className="px-4 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {paginatedHistory.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-ink-muted dark:text-ink-dark-muted font-medium">
                          لا توجد عمليات مسجلة مطابقة للبحث
                        </td>
                      </tr>
                    ) : (
                      paginatedHistory.map((t) => {
                        const isCashOutTx = t.txType === 'cash_out';
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
                            ? 'سحب كاش'
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

                        return (
                          <tr key={t.id} className={`hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition-colors h-11 ${isCancelled ? 'opacity-65 bg-danger/5' : ''}`}>
                            <td className="px-4 font-mono font-bold text-brand-dark dark:text-brand-bright">
                              {t.transactionNumber || (t.id ? t.id.replace(/-/g, '').slice(-8).toUpperCase() : '—')}
                            </td>
                            <td className="px-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                isDeduction
                                  ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                                  : isSaleTx
                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300'
                                    : isCustomerDebtTx
                                      ? 'bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright'
                                      : isFundingTx
                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                              }`}>
                                {isDeduction ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                <span>{badgeLabel}</span>
                              </span>
                            </td>
                            <td className="px-4 font-bold text-ink dark:text-white">
                              {t.accountName || 'محفظة'}
                            </td>
                            <td className="px-4 font-mono font-bold text-ink dark:text-white">
                              {t.amountFormatted}
                            </td>
                            <td className="px-4 font-mono font-bold text-paid dark:text-brand-bright">
                              {t.profitFormatted || '0.00 ج.م'}
                            </td>
                            <td className="px-4 font-mono text-ink-muted dark:text-ink-dark-muted">
                              {t.balanceAfterFormatted}
                            </td>
                            <td className="px-4 text-ink-muted dark:text-ink-dark-muted font-mono">
                              {t.customerPhone ? `${t.customerPhone} ${t.customerName ? `(${t.customerName})` : ''}` : '—'}
                            </td>
                            <td className="px-4 font-mono text-ink-muted dark:text-ink-dark-muted">
                              {t.createdAt?.slice(0, 16).replace('T', ' ')}
                            </td>
                            <td className="px-4 text-ink-muted dark:text-ink-dark-muted">
                              {t.createdByName || t.createdBy || 'كاشير'}
                            </td>
                            <td className="px-4 text-center">
                              {isCancelled ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-danger/10 text-danger dark:bg-danger/20 dark:text-danger-bright">
                                  ملغاة
                                </span>
                              ) : canCancelTx && t.txType !== 'sale_credit' && (t.txType as string) !== 'pos_sale' && (t.txType as string) !== 'pos_return' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancellingTx(t);
                                    setCancelReason('');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                                  title="إلغاء المعاملة وتصحيح الرصيد"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>إلغاء</span>
                                </button>
                              ) : (
                                <span className="text-ink-muted/40">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="p-3 border-t border-line dark:border-line-dark">
                  <PaginationBar
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              )}
            </div>

          </div>
        )}

        {/* ================================================================ */}
        {/* SUB-TAB 4: ANALYTICS & PROFIT METRICS                            */}
        {/* ================================================================ */}
        {currentTab === 'analytics' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-5">
            <div>
              <h2 className="text-base font-black text-ink dark:text-white m-0">
                تقارير وتحليلات أرباح المحافظ وإنستاباي
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0">
                متابعة صافي أرباح المحل المستقلة من عمليات الشحن والسحب ودفع الفواتير
              </p>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                    إجمالي السيولة في المحافظ
                  </span>
                  <span className="text-xl font-black font-mono text-brand-dark dark:text-brand-bright">
                    {analytics?.totalBalanceFormatted || formatArabicCurrency(calculatedTotalBalancePiasters)}
                  </span>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1 block">
                    مجموع الأرصدة المتاحة للتحويل
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
                  <Wallet className="w-4.5 h-4.5" />
                </div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                    أرباح المحل اليوم (الصافية)
                  </span>
                  <span className="text-xl font-black font-mono text-paid dark:text-brand-bright">
                    {analytics?.todayProfitFormatted || (analytics ? formatArabicCurrency(analytics.todayProfitPiasters || 0) : '0.00 ج.م')}
                  </span>
                  <span className="text-[11px] text-paid dark:text-brand-bright mt-1 block font-bold">
                    من {analytics?.todayTransactionsCount || 0} عملية اليوم
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4.5 h-4.5" />
                </div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                    أرباح المحل الإجمالية
                  </span>
                  <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                    {analytics?.monthProfitFormatted || (analytics ? formatArabicCurrency(analytics.monthProfitPiasters ?? analytics.totalProfitPiasters ?? 0) : '0.00 ج.م')}
                  </span>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1 block">
                    أرباح العمليات المسجلة بالنظام
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Coins className="w-4.5 h-4.5" />
                </div>
              </div>

              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                    حجم التحويلات المنفذة اليوم
                  </span>
                  <span className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
                    {analytics?.todayVolumeFormatted || (analytics ? formatArabicCurrency(analytics.todayVolumePiasters || 0) : '0.00 ج.م')}
                  </span>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1 block">
                    إجمالي قيمة المبالغ المحولة
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Receipt className="w-4.5 h-4.5" />
                </div>
              </div>
            </div>

            {/* Informational Integration Card */}
            <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-2xl p-5 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-paid dark:text-brand-bright shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-ink dark:text-white m-0">
                  التكامل المالي مع شاشة الكاشير والدرج:
                </p>
                <p className="text-ink-muted dark:text-ink-dark-muted m-0">
                  • عندما يدفع الزبون في الكاشير عبر أزرار «انستاباي» أو «محفظة»، يزداد رصيد المحفظة / حساب إنستاباي تلقائياً بالمبلغ المدفوع.
                  <br />
                  • عند تنفيذ سحب كاش لزبون من هذه الشاشة، يُخصم المبلغ فقط من رصيد المحفظة، ويُسجل ربح المحل كإيراد صافٍ مستقل.
                </p>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ================================================================ */}
      {/* 4. MODAL: FUND ACCOUNT                                           */}
      {/* ================================================================ */}
      {isFundingModalOpen && (
        <div onClick={handleFundingBackdropClick} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-line dark:border-line-dark flex items-center justify-between">
              <h3 className="text-sm font-black text-ink dark:text-white m-0">
                شحن وتغذية رصيد المحفظة / إنستاباي
              </h3>
              <button
                type="button"
                onClick={() => void requestCloseFunding()}
                className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  المحفظة / الحساب المطلوب شحنه:
                </label>
                <CustomSelect
                  value={fundingAccountId}
                  onChange={(val) => setFundingAccountId(val)}
                  options={accountSelectOptions}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  مبلغ الشحن / الإيداع:
                </label>
                <MoneyInput
                  valuePiasters={fundingAmountPiasters}
                  onChangePiasters={(val) => setFundingAmountPiasters(val)}
                  className="text-xl font-black font-mono text-center h-12 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  مصدر تمويل الرصيد:
                </label>
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
                  <div className="space-y-1.5 mt-1">
                    <div className="p-2 rounded-xl border text-xs bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark flex items-center justify-between">
                      <span className="text-ink-muted dark:text-ink-dark-muted font-bold text-[11px]">كاش الدرج المتوفر حالياً:</span>
                      <span className={`font-mono font-black text-xs ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                        {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                      </span>
                    </div>

                    {liveDrawerCashPiasters !== null && (liveDrawerCashPiasters <= 0 || (fundingAmountPiasters > 0 && fundingAmountPiasters > liveDrawerCashPiasters)) && (
                      <div className="p-2 rounded-xl border text-[11px] bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {liveDrawerCashPiasters <= 0
                              ? 'درج الكاشير فارغ (0.00 ج.م)!'
                              : 'رصيد الدرج غير كافٍ!'}
                          </span>
                        </div>
                        <p className="text-[10.5px] leading-relaxed">
                          {liveDrawerCashPiasters <= 0
                            ? 'لا يمكن سحب نقدية من درج فارغ. إذا كان الشحن تم من مالك المحل أو نقدية خارجية، يرجى تغيير مصدر التمويل إلى: «كاش خارجي / صاحب المحل».'
                            : `المبلغ المطلوب (${formatArabicCurrency(fundingAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى اختيار «كاش خارجي / صاحب المحل» إذا كان المبلغ مدفوعاً من مالك المحل.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  ملاحظات الشحن (اختياري):
                </label>
                <input
                  type="text"
                  value={fundingNotes}
                  onChange={(e) => setFundingNotes(e.target.value)}
                  placeholder="ملاحظات توضيحية..."
                  className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs outline-hidden"
                />
              </div>
            </div>

            <div className="p-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void requestCloseFunding()}
                className="h-9 px-4 rounded-xl text-xs font-bold text-ink-muted hover:text-ink cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveFunding}
                disabled={
                  actionLoading ||
                  fundingAmountPiasters <= 0 ||
                  (fundingSource === 'cash_drawer' &&
                    liveDrawerCashPiasters !== null &&
                    (liveDrawerCashPiasters <= 0 || fundingAmountPiasters > liveDrawerCashPiasters))
                }
                className="h-9 px-5 rounded-xl bg-paid text-white text-xs font-black hover:bg-paid-dark shadow-xs cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'جاري الشحن...' : 'تأكيد شحن الرصيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* 5. MODAL: ADD / EDIT ACCOUNT (With Egyptian Banks & Wallets)    */}
      {/* ================================================================ */}
      {isAccountModalOpen && (
        <div onClick={handleAccountBackdropClick} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-line dark:border-line-dark flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright flex items-center justify-center">
                  {accountFormType === 'instapay' ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-ink dark:text-white m-0">
                    {editingAccount
                      ? (accountFormType === 'instapay' ? 'تعديل حساب إنستاباي البنكي' : 'تعديل محفظة الكاش')
                      : (accountFormType === 'instapay' ? 'إضافة حساب إنستاباي (InstaPay) جديد' : 'إضافة محفظة كاش جديدة')}
                  </h3>
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                    {accountFormType === 'instapay'
                      ? 'ربط حساب بنكي معتمد بشبكة المدفوعات اللحظية IPN'
                      : 'محفظة هاتف محمول نقدية لعمليات الشحن والسحب'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void requestCloseAccount()}
                className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
              
              {/* Type Switcher / Locked Indicator */}
              {editingAccount ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                      نوع الحساب:
                    </label>
                    <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1">
                      <Lock className="w-3 h-3 text-ink-muted" />
                      <span>ثابت لا يمكن تغييره</span>
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                    accountFormType === 'instapay'
                      ? 'bg-violet-50 dark:bg-violet-950/25 border-violet-500/30 text-violet-700 dark:text-violet-300'
                      : 'bg-brand-soft dark:bg-brand-dark-soft border-brand/30 text-brand-dark dark:text-brand-bright'
                  }`}>
                    <div className="flex items-center gap-2">
                      {accountFormType === 'instapay' ? <Landmark className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                      <span className="text-xs font-black">
                        {accountFormType === 'instapay' ? 'حساب إنستاباي بنكي (InstaPay IPN)' : 'محفظة هاتف كاش نقدية (Mobile Wallet)'}
                      </span>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
                      {accountFormType === 'instapay' ? 'حساب بنكي' : 'محفظة كاش'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                    نوع الحساب المطلوب إضافته:
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
                    <button
                      type="button"
                      onClick={() => handleAccountTypeChange('instapay')}
                      className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        accountFormType === 'instapay'
                          ? 'bg-violet-700 text-white shadow-xs'
                          : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-white'
                      }`}
                    >
                      <Landmark className="w-4 h-4" />
                      <span>حساب إنستاباي (InstaPay)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAccountTypeChange('wallet')}
                      className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        accountFormType === 'wallet'
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>محفظة كاش (Wallet)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Provider / Bank Dropdown - Dynamically Adjusted */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
                  {accountFormType === 'instapay' ? (
                    <>
                      <Landmark className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      <span>اختر البنك المرتبط بـ إنستاباي (InstaPay Bank):</span>
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>اختر شركة / شبكة المحفظة (Wallet Network):</span>
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
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  اسم الحساب أو المحفظة في البرنامج:
                </label>
                <input
                  type="text"
                  value={accountFormName}
                  onChange={(e) => setAccountFormName(e.target.value)}
                  placeholder={accountFormType === 'instapay' ? 'مثال: إنستاباي - البنك الأهلي المصري' : 'مثال: فودافون كاش كاشير 1'}
                  className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs focus:bg-surface dark:focus:bg-surface-dark focus:border-brand outline-hidden transition-all"
                  autoFocus
                />
              </div>

              {/* Specific Fields: Phone & IPA / Account Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                    {accountFormType === 'instapay' ? 'رقم الهاتف المسجل بإنستاباي:' : 'رقم هاتف المحفظة (أساسي):'}
                  </label>
                  <input
                    type="text"
                    value={accountFormPhone}
                    onChange={(e) => setAccountFormPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left focus:bg-surface dark:focus:bg-surface-dark focus:border-brand outline-hidden transition-all"
                    dir="ltr"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                    {accountFormType === 'instapay' ? 'عنوان الدفع اللحظي (IPA) / المعرف:' : 'معرف إضافي أو كارت ميزة (اختياري):'}
                  </label>
                  <input
                    type="text"
                    value={accountFormIdentifier}
                    onChange={(e) => setAccountFormIdentifier(e.target.value)}
                    placeholder={accountFormType === 'instapay' ? 'username@instapay' : 'كارت ميزة / معرف'}
                    className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left focus:bg-surface dark:focus:bg-surface-dark focus:border-brand outline-hidden transition-all"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Initial Balance */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  الرصيد الافتتاحي الحالي في الحساب:
                </label>
                <MoneyInput
                  valuePiasters={accountFormBalance}
                  onChangePiasters={(val) => setAccountFormBalance(val)}
                  className="text-lg font-black font-mono text-center h-11 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl"
                />
              </div>

              {/* Daily & Monthly Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                    الحد الأقصى اليومي للتحويل:
                  </label>
                  <MoneyInput
                    valuePiasters={accountFormDailyLimit}
                    onChangePiasters={(val) => setAccountFormDailyLimit(val)}
                    className="text-xs font-mono text-center h-10 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                    الحد الأقصى الشهري للتحويل:
                  </label>
                  <MoneyInput
                    valuePiasters={accountFormMonthlyLimit}
                    onChangePiasters={(val) => setAccountFormMonthlyLimit(val)}
                    className="text-xs font-mono text-center h-10 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                  ملاحظات إضافية:
                </label>
                <input
                  type="text"
                  value={accountFormNotes}
                  onChange={(e) => setAccountFormNotes(e.target.value)}
                  placeholder="ملاحظات داخلية..."
                  className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs outline-hidden"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between">
              {editingAccount ? (
                <button
                  type="button"
                  onClick={() => handleDeleteAccount(editingAccount)}
                  className="text-xs font-bold text-danger hover:underline cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف الحساب</span>
                </button>
              ) : <div></div>}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void requestCloseAccount()}
                  className="h-9 px-4 rounded-xl text-xs font-bold text-ink-muted hover:text-ink cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveAccount}
                  disabled={actionLoading || !accountFormName.trim()}
                  className="h-9 px-5 rounded-xl bg-brand text-white text-xs font-black hover:bg-brand-dark shadow-xs cursor-pointer transition-all"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ بيانات الحساب'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCEL / REVERSE WALLET TRANSACTION */}
      {cancellingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line dark:border-line-dark" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line dark:border-line-dark pb-3">
              <h3 className="text-base font-black text-danger flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <span>إلغاء معاملة محفظة / إنستاباي</span>
              </h3>
              <button
                type="button"
                onClick={() => setCancellingTx(null)}
                className="text-ink-muted hover:text-ink cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-xs flex flex-col gap-1.5">
                <div className="flex justify-between font-bold">
                  <span className="text-ink-muted">رقم العملية:</span>
                  <span className="font-mono text-ink">{cancellingTx.transactionNumber}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-ink-muted">الحساب:</span>
                  <span className="text-ink">{cancellingTx.accountName || 'محفظة'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">نوع العملية:</span>
                  <span className="font-bold text-ink">{cancellingTx.txTypeArabic || (cancellingTx.txType === 'cash_out' ? 'سحب كاش' : 'إيداع')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">المبلغ:</span>
                  <span className="font-mono font-bold text-ink">{cancellingTx.amountFormatted || formatArabicCurrency(cancellingTx.amountPiasters)}</span>
                </div>
                {cancellingTx.profitPiasters > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">الربح المحتسب:</span>
                    <span className="font-mono font-bold text-paid">{cancellingTx.profitFormatted || formatArabicCurrency(cancellingTx.profitPiasters)}</span>
                  </div>
                )}
                <div className="text-[11px] text-danger font-medium mt-1 pt-1 border-t border-line dark:border-line-dark">
                  سيتم التراجع عن حركة الرصيد في المحفظة والدرج، ولا يمكن التراجع بعد الإلغاء.
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">سبب الإلغاء (إلزامي):</label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: خطأ في إدخال الرقم / بناءً على طلب العميل"
                  className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line dark:border-line-dark mt-1">
                <button
                  type="button"
                  onClick={() => setCancellingTx(null)}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={isSubmittingCancel || !cancelReason.trim()}
                  onClick={handleCancelTransaction}
                  className="px-4 py-2 bg-danger hover:bg-danger/90 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isSubmittingCancel ? 'جاري الإلغاء...' : 'تأكيد إلغاء العملية'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
