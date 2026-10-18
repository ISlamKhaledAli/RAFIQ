import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Smartphone, 
  Zap, 
  Wallet, 
  FileText, 
  Landmark, 
  PlusCircle, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Printer, 
  Search, 
  Layers, 
  CreditCard, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Receipt, 
  Clock, 
  Edit3, 
  X,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import { formatArabicCurrency } from '../../utils/money';
import { rafiqConfirm, rafiqAlert } from '../../utils/dialogService';
import { useAuth } from '../../context/useAuth';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import type { 
  EpayTerminal, 
  EpayTransaction, 
  EpayTerminalFunding, 
  EpayAnalyticsSummary, 
  EpayServiceType, 
  EpayPaymentDestination
} from '../../types/models';

export type EpaySubTab = 'pos' | 'terminals' | 'history' | 'analytics';

const PROVIDER_NAMES: Record<string, string> = {
  fawry: 'فوري',
  aman: 'أمان',
  bee: 'بي',
  momkn: 'ممكن',
  sadad: 'سداد',
  masary: 'مصاري',
  super_pay: 'سوبر باي',
  other: 'ماكينة دفع',
};

export interface EpayViewProps {
  activeSubTab?: EpaySubTab;
  onSubTabChange?: (tab: EpaySubTab) => void;
}

interface ServiceQuickOption {
  type: EpayServiceType;
  name: string;
  icon: typeof Smartphone;
}

const SERVICE_PRESETS: ServiceQuickOption[] = [
  { type: 'mobile_recharge', name: 'شحن رصيد / كروت فكة', icon: Smartphone },
  { type: 'utility_bill', name: 'فواتير كهرباء ومياه وغاز', icon: Zap },
  { type: 'wallet_transfer', name: 'تحويل محافظ إلكترونية (فودافون كاش / إنستاباي)', icon: Wallet },
  { type: 'cash_in', name: 'إيداع نقدي للمحافظ والحسابات', icon: ArrowDownLeft },
  { type: 'cash_out', name: 'سحب نقدي من محفظة أو كارت', icon: ArrowUpRight },
  { type: 'other', name: 'خدمات حكومية وجامعات ومصاريف أخرى', icon: FileText },
];


export const EpayView: React.FC<EpayViewProps> = ({
  activeSubTab = 'pos',
  onSubTabChange: _onSubTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<EpaySubTab>(activeSubTab);

  useEffect(() => {
    if (activeSubTab) {
      setInternalTab(activeSubTab);
    }
  }, [activeSubTab]);

  const activeTabRaw = activeSubTab || internalTab;
  const { hasPermission, isRoot, isAdmin } = useAuth();
  const canFund = isRoot || isAdmin || hasPermission('epay.fund');
  const canManageTerminals = isRoot || isAdmin || hasPermission('epay.terminals_manage');
  const canViewAnalytics = isRoot || isAdmin || hasPermission('epay.analytics');
  const canViewHistory = isRoot || isAdmin || hasPermission('epay.history');
  const canCancel = isRoot || isAdmin || hasPermission('epay.cancel') || canManageTerminals;
  const canAccessTerminals = isRoot || isAdmin || canManageTerminals || canFund;

  const activeTab: EpaySubTab = useMemo(() => {
    if (activeTabRaw === 'terminals' && !canAccessTerminals) return 'pos';
    if (activeTabRaw === 'history' && !canViewHistory) return 'pos';
    if (activeTabRaw === 'analytics' && !canViewAnalytics) return 'pos';
    return activeTabRaw;
  }, [activeTabRaw, canAccessTerminals, canViewHistory, canViewAnalytics]);

  const [terminals, setTerminals] = useState<EpayTerminal[]>([]);
  const [transactions, setTransactions] = useState<EpayTransaction[]>([]);
  const [fundings, setFundings] = useState<EpayTerminalFunding[]>([]);
  const [analytics, setAnalytics] = useState<EpayAnalyticsSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
  }, [activeTab]);

  // Form State: New Transaction
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');
  const [serviceType, setServiceType] = useState<EpayServiceType>('mobile_recharge');
  const [serviceName, setServiceName] = useState<string>('شحن رصيد / كروت فكة');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [billAmountPiasters, setBillAmountPiasters] = useState<number>(0);
  const [machineCommissionPiasters, setMachineCommissionPiasters] = useState<number>(0);
  const [shopProfitPiasters, setShopProfitPiasters] = useState<number>(0);
  const [paymentDestination, setPaymentDestination] = useState<EpayPaymentDestination>('terminal_till');
  const [notes, setNotes] = useState<string>('');
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(true);

  // Receipt Modal State
  const [receiptTx, setReceiptTx] = useState<EpayTransaction | null>(null);

  // Cancellation Modal State
  const [cancellingTx, setCancellingTx] = useState<EpayTransaction | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  // Funding Modal State
  const [isFundingModalOpen, setIsFundingModalOpen] = useState<boolean>(false);
  const [fundingTerminalId, setFundingTerminalId] = useState<string>('');
  const [fundingAmountPiasters, setFundingAmountPiasters] = useState<number>(100000);
  const [fundingSource, setFundingSource] = useState<'cash_drawer' | 'bank_transfer' | 'external_cash'>('cash_drawer');
  const [fundingNotes, setFundingNotes] = useState<string>('');
  const [isSubmittingFunding, setIsSubmittingFunding] = useState<boolean>(false);
  const [fundingModalError, setFundingModalError] = useState<string | null>(null);
  const [liveDrawerCashPiasters, setLiveDrawerCashPiasters] = useState<number | null>(null);

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

  // Terminal Edit/Create Modal State
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState<boolean>(false);
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null);
  const [termName, setTermName] = useState<string>('');
  const [termProvider, setTermProvider] = useState<string>('super_pay');
  const [termCode, setTermCode] = useState<string>('');
  const [termBalancePiasters, setTermBalancePiasters] = useState<number>(0);
  const [termAlertPiasters, setTermAlertPiasters] = useState<number>(30000);
  const [isSavingTerminal, setIsSavingTerminal] = useState<boolean>(false);
  const [terminalModalError, setTerminalModalError] = useState<string | null>(null);

  // Modal Dismiss & Unsaved Changes Protection (ESC key and Outside click)
  const isFundingDirty = useCallback(() => {
    return fundingAmountPiasters > 0 || fundingNotes.trim().length > 0;
  }, [fundingAmountPiasters, fundingNotes]);

  const { requestClose: requestCloseFunding, handleBackdropClick: handleFundingBackdropClick } = useModalDismiss({
    isOpen: isFundingModalOpen,
    onClose: () => setIsFundingModalOpen(false),
    isDirty: isFundingDirty,
    confirmTitle: 'تعديلات شحن الرصيد غير محفوظة',
    confirmMessage: 'لقد قمت بإدخال بيانات لشحن رصيد الماكينة. هل أنت متأكد من الخروج وتجاهل العملية؟',
  });

  const editingTerminal = useMemo(() => {
    return terminals.find((t) => t.id === editingTerminalId) || null;
  }, [terminals, editingTerminalId]);

  const isTerminalDirty = useCallback(() => {
    if (editingTerminal) {
      return (
        termName !== editingTerminal.name ||
        termProvider !== editingTerminal.provider ||
        termCode !== (editingTerminal.terminalCode || '') ||
        termBalancePiasters !== editingTerminal.balancePiasters ||
        termAlertPiasters !== editingTerminal.lowBalanceAlertPiasters
      );
    }
    return Boolean(
      termName.trim() ||
      termCode.trim() ||
      termBalancePiasters > 0 ||
      termProvider !== 'super_pay'
    );
  }, [editingTerminal, termName, termProvider, termCode, termBalancePiasters, termAlertPiasters]);

  const { requestClose: requestCloseTerminal, handleBackdropClick: handleTerminalBackdropClick } = useModalDismiss({
    isOpen: isTerminalModalOpen,
    onClose: () => setIsTerminalModalOpen(false),
    isDirty: isTerminalDirty,
    confirmTitle: 'بيانات الماكينة غير محفوظة',
    confirmMessage: 'هناك تعديلات على بيانات ماكينة الدفع لم تُحفظ بعد، هل أنت متأكد من الخروج وتجاهلها؟',
  });

  const { requestClose: requestCloseReceipt, handleBackdropClick: handleReceiptBackdropClick } = useModalDismiss({
    isOpen: Boolean(receiptTx),
    onClose: () => setReceiptTx(null),
    isDirty: false,
  });

  const isCancelDirty = useCallback(() => {
    return cancelReason.trim().length > 0;
  }, [cancelReason]);

  const { requestClose: requestCloseCancel, handleBackdropClick: handleCancelBackdropClick } = useModalDismiss({
    isOpen: Boolean(cancellingTx),
    onClose: () => setCancellingTx(null),
    isDirty: isCancelDirty,
    confirmTitle: 'إلغاء العملية',
    confirmMessage: 'لقد كتبت سبباً لإلغاء العملية. هل تريد التراجع وتجاهل التعديلات؟',
  });

  // Filters for History Tab
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyTerminalFilter, setHistoryTerminalFilter] = useState<string>('all');
  const [historyServiceFilter, setHistoryServiceFilter] = useState<string>('all');
  const [historyDestinationFilter, setHistoryDestinationFilter] = useState<string>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('all');

  // Filters for Funding Tab (Terminals Tab)
  const [fundingSearch, setFundingSearch] = useState<string>('');
  const [fundingTerminalFilter, setFundingTerminalFilter] = useState<string>('all');
  const [fundingSourceFilter, setFundingSourceFilter] = useState<string>('all');

  // Load all data
  const loadData = useCallback(async () => {
    setErrorMsg(null);
    try {
      const [termsRes, txsRes, fundRes, anRes] = await Promise.all([
        invoke<EpayTerminal[]>('epay:getTerminals'),
        invoke<EpayTransaction[]>('epay:getTransactions', { limit: 500 }),
        invoke<EpayTerminalFunding[]>('epay:getFundings', { limit: 200 }),
        invoke<EpayAnalyticsSummary>('epay:getAnalytics', {}),
      ]);

      const termsList = Array.isArray(termsRes) ? termsRes : [];
      setTerminals(termsList);
      setTransactions(Array.isArray(txsRes) ? txsRes : []);
      setFundings(Array.isArray(fundRes) ? fundRes : []);
      setAnalytics(anRes || null);

      if (termsList.length > 0 && !selectedTerminalId) {
        setSelectedTerminalId(termsList[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تحميل بيانات ماكينات وخدمات الدفع');
    }
  }, [selectedTerminalId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to epay data changes
  useDataSubscription('epay', loadData);

  // Selected Terminal Object
  const currentTerminal = useMemo(() => {
    return terminals.find((t) => t.id === selectedTerminalId) || terminals[0] || null;
  }, [terminals, selectedTerminalId]);

  // Financial calculation based on 3 direct inputs:
  // 1. Bill amount (deducted from terminal)
  // 2. Machine commission (deducted from terminal)
  // 3. Shop profit (kept by shop, NOT deducted from terminal)
  const totalReceivedPiasters = useMemo(() => {
    return billAmountPiasters + machineCommissionPiasters + shopProfitPiasters;
  }, [billAmountPiasters, machineCommissionPiasters, shopProfitPiasters]);

  const deductedBalancePiasters = useMemo(() => {
    return serviceType === 'cash_out' ? 0 : (billAmountPiasters + machineCommissionPiasters);
  }, [serviceType, billAmountPiasters, machineCommissionPiasters]);

  const netProfitPiasters = useMemo(() => {
    return shopProfitPiasters + machineCommissionPiasters;
  }, [shopProfitPiasters, machineCommissionPiasters]);

  const isBalanceInsufficient = useMemo(() => {
    if (!currentTerminal) return false;
    if (serviceType === 'cash_out') return false;
    return currentTerminal.balancePiasters < deductedBalancePiasters;
  }, [currentTerminal, serviceType, deductedBalancePiasters]);

  // Handle Select Service Preset (keeps amounts empty for cashier entry)
  const handleSelectServicePreset = (opt: ServiceQuickOption) => {
    setServiceType(opt.type);
    setServiceName(opt.name);
  };

  // Submit Transaction
  const handleCreateTransaction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentTerminal) {
      setErrorMsg('يرجى اختيار ماكينة دفع صالحة');
      return;
    }
    if (billAmountPiasters <= 0) {
      setErrorMsg('يرجى تحديد مبلغ العملية أو الشحن');
      return;
    }
    if (isBalanceInsufficient) {
      setErrorMsg(`رصيد الماكينة (${formatArabicCurrency(currentTerminal.balancePiasters)}) غير كافٍ لتنفيذ هذه العملية (${formatArabicCurrency(deductedBalancePiasters)}). يرجى تغذية رصيد الماكينة أولاً.`);
      return;
    }

    setIsSubmittingTx(true);
    setErrorMsg(null);
    try {
      const payload = {
        terminalId: currentTerminal.id,
        serviceType,
        serviceName,
        referenceNumber: referenceNumber.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
        billAmountPiasters,
        customerFeePiasters: shopProfitPiasters,
        providerCommissionPiasters: machineCommissionPiasters,
        paymentDestination,
        paymentChannel: paymentDestination,
        machineDeductedPiasters: deductedBalancePiasters,
        notes: notes.trim() || undefined,
      };

      const result = await invoke<EpayTransaction>('epay:createTransaction', payload);
      setSuccessMsg(`تم تنفيذ عملية "${serviceName}" بنجاح! صافي ربح المحل: ${formatArabicCurrency(netProfitPiasters)}`);

      if (autoPrintReceipt && result) {
        setReceiptTx(result);
      }

      // Reset form to empty for next operation
      setBillAmountPiasters(0);
      setMachineCommissionPiasters(0);
      setShopProfitPiasters(0);
      setCustomerPhone('');
      setCustomerName('');
      setReferenceNumber('');
      setNotes('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل تنفيذ عملية الدفع الإلكتروني');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  // Submit Cancellation of Transaction
  const handleCancelTransaction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cancellingTx) return;

    setIsSubmittingCancel(true);
    setErrorMsg(null);
    try {
      await invoke('epay:cancelTransaction', {
        transactionId: cancellingTx.id,
        reason: cancelReason.trim() || 'إلغاء يدوي من سجل العمليات',
      });
      setSuccessMsg(`تم إلغاء عملية "${cancellingTx.serviceName}" واسترجاع رصيد الماكينة بنجاح.`);
      setCancellingTx(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل إلغاء العملية');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Submit Funding
  const handleFundTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundingTerminalId) {
      setFundingModalError('يرجى اختيار ماكينة دفع صالحة');
      return;
    }
    if (fundingAmountPiasters <= 0) {
      setFundingModalError('يرجى تحديد مبلغ تغذية صالح');
      return;
    }

    if (fundingSource === 'cash_drawer') {
      if (liveDrawerCashPiasters !== null && liveDrawerCashPiasters <= 0) {
        setFundingModalError('رصيد كاش الدرج الحالي 0.00 ج.م! لا يمكن شحن الماكينة من الدرج بدون وجود نقدية كافية.');
        return;
      }
      if (liveDrawerCashPiasters !== null && fundingAmountPiasters > liveDrawerCashPiasters) {
        setFundingModalError(`المبلغ المطلوب (${formatArabicCurrency(fundingAmountPiasters)}) أكبر من النقدية المتوفرة في الدرج (${formatArabicCurrency(liveDrawerCashPiasters)}).`);
        return;
      }
    }

    setIsSubmittingFunding(true);
    setFundingModalError(null);
    try {
      await invoke('epay:fundTerminal', {
        terminalId: fundingTerminalId,
        amountPiasters: fundingAmountPiasters,
        fundingSource,
        notes: fundingNotes.trim() || undefined,
      });

      setSuccessMsg(`تمت تغذية رصيد الماكينة بمبلغ ${formatArabicCurrency(fundingAmountPiasters)} بنجاح`);
      setIsFundingModalOpen(false);
      setFundingNotes('');
      setFundingModalError(null);
      await loadData();
    } catch (err: any) {
      setFundingModalError(err?.message || 'فشل تغذية رصيد الماكينة');
    } finally {
      setIsSubmittingFunding(false);
    }
  };

  // Open Terminal Modal (Simplified)
  const openNewTerminalModal = () => {
    setEditingTerminalId(null);
    setTermName('');
    setTermProvider('super_pay');
    setTermCode('');
    setTermBalancePiasters(0);
    setTermAlertPiasters(30000);
    setTerminalModalError(null);
    setIsTerminalModalOpen(true);
  };

  const openEditTerminalModal = (term: EpayTerminal) => {
    setEditingTerminalId(term.id);
    setTermName(term.name);
    setTermProvider(term.provider);
    setTermCode(term.terminalCode || '');
    setTermBalancePiasters(term.balancePiasters);
    setTermAlertPiasters(term.lowBalanceAlertPiasters);
    setTerminalModalError(null);
    setIsTerminalModalOpen(true);
  };

  const handleSaveTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termName.trim()) {
      setTerminalModalError('اسم الماكينة مطلوب');
      return;
    }

    setIsSavingTerminal(true);
    setTerminalModalError(null);
    try {
      const saved = await invoke<EpayTerminal>('epay:saveTerminal', {
        id: editingTerminalId || undefined,
        name: termName.trim(),
        provider: termProvider,
        terminalCode: termCode.trim() || undefined,
        balancePiasters: termBalancePiasters,
        lowBalanceAlertPiasters: termAlertPiasters,
        customerFeeType: 'fixed',
        customerFeeValue: 0,
        providerCommissionType: 'fixed',
        providerCommissionValue: 0,
        isActive: true,
      });

      setSuccessMsg(editingTerminalId ? 'تم تحديث بيانات الماكينة بنجاح' : 'تمت إضافة ماكينة الدفع بنجاح');
      setIsTerminalModalOpen(false);
      setTerminalModalError(null);
      await loadData();
      if (saved && saved.id) {
        setSelectedTerminalId(saved.id);
      }
    } catch (err: any) {
      setTerminalModalError(err?.message || 'فشل حفظ ماكينة الدفع');
    } finally {
      setIsSavingTerminal(false);
    }
  };

  const handleDeleteTerminal = async (termId: string, customTermName?: string) => {
    const targetName = customTermName || terminals.find((t) => t.id === termId)?.name || 'ماكينة الدفع';
    const confirmed = await rafiqConfirm({
      title: 'حذف ماكينة الدفع',
      message: `هل أنت متأكد من رغبتك في حذف ماكينة "${targetName}"؟\nفي حال وجود معاملات مالية سابقة للماكينة، سيتم أرشفتها وإخفاؤها لحماية سجل الحسابات.`,
      confirmText: 'نعم، حذف الماكينة',
      cancelText: 'إلغاء',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await invoke('epay:deleteTerminal', { terminalId: termId });
      setSuccessMsg(`تم حذف / أرشفة ماكينة "${targetName}" بنجاح`);
      if (isTerminalModalOpen && editingTerminalId === termId) {
        setIsTerminalModalOpen(false);
      }
      await loadData();
    } catch (err: any) {
      await rafiqAlert({
        title: 'تعذر حذف الماكينة',
        message: err?.message || 'حدث خطأ أثناء محاولة حذف الماكينة',
        variant: 'error',
      });
    }
  };

  // Filtered Fundings
  const filteredFundings = useMemo(() => {
    return fundings.filter((f) => {
      const q = fundingSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        (f.terminalName && f.terminalName.toLowerCase().includes(q)) ||
        (f.notes && f.notes.toLowerCase().includes(q)) ||
        String(f.amountPiasters / 100).includes(q);

      const matchTerminal = fundingTerminalFilter === 'all' || f.terminalId === fundingTerminalFilter;
      const matchSource = fundingSourceFilter === 'all' || f.fundingSource === fundingSourceFilter;

      return matchSearch && matchTerminal && matchSource;
    });
  }, [fundings, fundingSearch, fundingTerminalFilter, fundingSourceFilter]);

  const {
    currentPage: fundingCurrentPage,
    setCurrentPage: setFundingCurrentPage,
    pageSize: fundingPageSize,
    setPageSize: setFundingPageSize,
    paginatedItems: pagedFundings,
  } = useClientPagination(
    filteredFundings,
    15,
    `${fundingSearch}_${fundingTerminalFilter}_${fundingSourceFilter}`
  );

  // Filtered History
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const q = historySearch.trim().toLowerCase();
      const matchSearch = 
        !q || 
        (t.referenceNumber && t.referenceNumber.toLowerCase().includes(q)) ||
        (t.customerPhone && t.customerPhone.includes(q)) ||
        (t.customerName && t.customerName.toLowerCase().includes(q)) ||
        (t.serviceName && t.serviceName.toLowerCase().includes(q));

      const matchTerminal = historyTerminalFilter === 'all' || t.terminalId === historyTerminalFilter;
      const matchService = historyServiceFilter === 'all' || t.serviceType === historyServiceFilter;
      const matchDestination = historyDestinationFilter === 'all' || t.paymentDestination === historyDestinationFilter;

      let matchDate = true;
      if (historyDateFilter !== 'all' && t.createdAt) {
        const txDate = new Date(t.createdAt);
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const txDateStr = txDate.toISOString().split('T')[0];

        if (historyDateFilter === 'today') {
          matchDate = txDateStr === todayStr;
        } else if (historyDateFilter === 'yesterday') {
          const yest = new Date(now);
          yest.setDate(yest.getDate() - 1);
          matchDate = txDateStr === yest.toISOString().split('T')[0];
        } else if (historyDateFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchDate = txDate >= weekAgo;
        } else if (historyDateFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchDate = txDate >= monthAgo;
        }
      }

      return matchSearch && matchTerminal && matchService && matchDestination && matchDate;
    });
  }, [transactions, historySearch, historyTerminalFilter, historyServiceFilter, historyDestinationFilter, historyDateFilter]);

  const {
    currentPage: historyCurrentPage,
    setCurrentPage: setHistoryCurrentPage,
    pageSize: historyPageSize,
    setPageSize: setHistoryPageSize,
    paginatedItems: pagedTransactions,
  } = useClientPagination(
    filteredTransactions,
    15,
    `${historySearch}_${historyTerminalFilter}_${historyServiceFilter}_${historyDestinationFilter}_${historyDateFilter}`
  );

  // Terminal options for select
  const terminalOptions = useMemo(() => {
    return terminals.map((t) => ({
      value: t.id,
      label: `${t.name} (الرصيد: ${formatArabicCurrency(t.balancePiasters)})`,
    }));
  }, [terminals]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark select-none overflow-y-auto" dir="rtl">
      {/* 1. Top Header Bar */}
      <header className="bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-emerald-950/50 text-paid dark:text-emerald-400 border border-paid-border dark:border-emerald-500/30 flex items-center justify-center shrink-0 shadow-2xs">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted-dark">خدمات وماكينات الدفع</span>
              <span className="text-ink-muted/40 dark:text-ink-muted-dark/40 font-bold">/</span>
              <h1 className="text-base sm:text-lg font-black text-ink dark:text-ink-dark m-0">
                {activeTab === 'pos' && 'تنفيذ عملية جديدة'}
                {activeTab === 'terminals' && 'أرصدة وماكينات الدفع'}
                {activeTab === 'history' && 'سجل العمليات والإيصالات'}
                {activeTab === 'analytics' && 'التحليلات والأرباح المستقلة'}
              </h1>
            </div>
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5 font-medium">
              {activeTab === 'pos' && 'شحن رصيد، فواتير، وتحويل وسحب محافظ إلكترونية بنظام مالي مستقل'}
              {activeTab === 'terminals' && 'متابعة أرصدة ماكينات الدفع وتغذية الخزينة'}
              {activeTab === 'history' && 'أرشيف العمليات المنفذة وسجلات الإيصالات'}
              {activeTab === 'analytics' && 'تقارير أرباح وعمولات الخدمات الإلكترونية مفصولة عن بضاعة المحل'}
            </p>
          </div>
        </div>

      </header>

      {/* 2. Top Summary 4-KPI Cards (Displayed only on Terminals tab for authorized users) */}
      {activeTab === 'terminals' && canAccessTerminals && (
        <section className="px-4 sm:px-6 pt-3.5 shrink-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: إجمالي رصيد الماكينات */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-paid/40 dark:hover:border-paid-bright/40 transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">إجمالي رصيد الماكينات المتوفر</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-paid dark:text-paid-bright tabular-nums tracking-tight">
                    {formatArabicCurrency(analytics?.totalTerminalsBalancePiasters || 0)}
                  </span>
                </div>
                <span className="text-[10px] text-paid dark:text-paid-bright font-medium block mt-0.5">جاهز للشحن والتحويل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-bright/30 flex items-center justify-center text-paid dark:text-paid-bright shadow-2xs shrink-0">
                <Wallet className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 2: صافي الربح */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-brand/40 dark:hover:border-brand-bright/40 transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">صافي أرباح الخدمات</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-brand dark:text-brand-bright tabular-nums tracking-tight">
                    {formatArabicCurrency(analytics?.totalNetProfitPiasters || 0)}
                  </span>
                </div>
                <span className="text-[10px] text-brand dark:text-brand-bright font-medium block mt-0.5">عمولات ورسوم المحل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-bright/15 border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs shrink-0">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 3: حجم المعاملات */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-line-hover dark:hover:border-line-dark-hover transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">حجم المعاملات الإجمالي</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums tracking-tight">
                    {formatArabicCurrency(analytics?.totalVolumePiasters || 0)}
                  </span>
                </div>
                <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark block mt-0.5">إجمالي المبالغ المنفذة</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark shadow-2xs shrink-0">
                <Layers className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 4: عدد العمليات */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-line-hover dark:hover:border-line-dark-hover transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold block mb-0.5 truncate">العمليات الناجحة</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums tracking-tight">
                    {analytics?.totalTransactionsCount || 0}
                  </span>
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">عملية</span>
                </div>
                <span className="text-[10px] text-paid dark:text-paid-bright font-medium block mt-0.5">معاملات مكتملة بالكامل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark shadow-2xs shrink-0">
                <Receipt className="w-4.5 h-4.5" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Notifications Alert Banner */}
      {errorMsg && (
        <div className="bg-danger-soft dark:bg-danger-dark-soft border-b border-danger/20 dark:border-danger-bright/30 px-6 py-2.5 text-danger dark:text-danger-bright text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button 
            type="button"
            onClick={() => setErrorMsg(null)} 
            className="p-1 text-danger/70 dark:text-danger-bright/70 hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft rounded-lg transition-colors cursor-pointer"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-paid-soft dark:bg-paid-dark-soft border-b border-paid-border dark:border-paid-bright/30 px-6 py-2.5 text-paid dark:text-paid-bright text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSuccessMsg(null)} 
            className="p-1 text-paid/70 dark:text-paid-bright/70 hover:text-paid dark:hover:text-paid-bright hover:bg-paid/10 dark:hover:bg-paid-dark-soft/60 rounded-lg transition-colors cursor-pointer"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="flex-1 p-4 sm:p-6">
        {/* TAB 1: POS QUICK TRANSACTION */}
        {activeTab === 'pos' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 Columns: Form Input */}
            <div className="lg:col-span-7 bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-5 sm:p-6 flex flex-col gap-5 shadow-2xs">
              {/* Step 1: Terminal Selection */}
              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-2">
                  1. اختيار ماكينة الدفع (Terminal)
                </label>
                {terminals.length === 0 ? (
                  <div className="p-4 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl text-warn dark:text-warn-bright text-xs font-bold flex items-center justify-between">
                    <span>لا توجد ماكينات مسجلة حالياً.</span>
                    <button
                      onClick={openNewTerminalModal}
                      className="px-3 py-1.5 bg-warn hover:bg-warn/90 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs"
                    >
                      إضافة ماكينة الآن
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {terminals.map((term) => {
                      const isSelected = term.id === selectedTerminalId;
                      return (
                        <div
                          key={term.id}
                          onClick={() => setSelectedTerminalId(term.id)}
                          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-bright/15 ring-2 ring-brand/20 dark:ring-brand-bright/20 shadow-2xs'
                              : 'border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-hover bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-ink dark:text-ink-dark">{term.name}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-ink-muted dark:text-ink-muted-dark">الرصيد المتاح:</span>
                            <span className={`text-sm font-black font-mono tabular-nums ${term.isLowBalance ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'}`}>
                              {formatArabicCurrency(term.balancePiasters)}
                            </span>
                          </div>
                          {term.isLowBalance && (
                            <div className="mt-1 text-[11px] text-danger dark:text-danger-bright font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-danger dark:text-danger-bright shrink-0" />
                              تنبيه: الرصيد منخفض!
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Service Type Selector */}
              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-2">
                  2. نوع الخدمة المطلوب تنفيذها
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SERVICE_PRESETS.map((preset) => {
                    const isSelected = serviceType === preset.type;
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.type}
                        type="button"
                        onClick={() => handleSelectServicePreset(preset)}
                        className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1.5 cursor-pointer active:scale-98 ${
                          isSelected
                            ? 'border-brand dark:border-brand-bright bg-brand dark:bg-brand-bright text-white dark:text-slate-900 shadow-xs'
                            : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-white dark:text-slate-900' : 'text-brand dark:text-brand-bright'}`} />
                        <span className="text-xs font-bold leading-tight">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Transaction Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">
                    اسم الخدمة المحددة
                  </label>
                  <input
                    type="text"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                    placeholder="مثال: شحن فودافون كاش 50 جنيه"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">
                    رقم الهاتف / كود المشترك / رقم الحساب
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                    placeholder="01012345678 أو كود العداد"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">
                    اسم العميل (اختياري)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                    placeholder="اسم العميل للرجوع إليه"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">
                    رقم الإيصال / المرجع في الماكينة (Ref No)
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                    placeholder="مثال: 984021"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Step 4: 3 Direct Inputs (Bill Amount, Machine Commission, Shop Profit) */}
              <div className="border-t border-line dark:border-line-dark pt-4 flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright font-black text-xs flex items-center justify-center">
                      3
                    </span>
                    <h3 className="text-xs sm:text-sm font-black text-ink dark:text-ink-dark">
                      حسابات العملية
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-ink-muted dark:text-ink-muted-dark">
                    المبلغ والعمولة يخصمان من رصيد الماكينة &bull; الربح لا يُخصم
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Card 1: Bill Amount */}
                  <div className="p-3.5 rounded-xl bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark flex flex-col justify-between gap-2.5 transition-all focus-within:border-brand/50 dark:focus-within:border-brand-bright/50 focus-within:bg-surface dark:focus-within:bg-surface-dark">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark" />
                      <label className="text-xs font-bold text-ink dark:text-ink-dark">
                        1. مبلغ الفاتورة / الرصيد
                      </label>
                    </div>
                    <MoneyInput
                      valuePiasters={billAmountPiasters}
                      onChangePiasters={setBillAmountPiasters}
                      placeholder="0.00"
                      className="text-lg font-black"
                    />
                  </div>

                  {/* Card 2: Machine Commission */}
                  <div className="p-3.5 rounded-xl bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark flex flex-col justify-between gap-2.5 transition-all focus-within:border-brand/50 dark:focus-within:border-brand-bright/50 focus-within:bg-surface dark:focus-within:bg-surface-dark">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark" />
                      <label className="text-xs font-bold text-ink dark:text-ink-dark">
                        2. عمولة الماكينة
                      </label>
                    </div>
                    <MoneyInput
                      valuePiasters={machineCommissionPiasters}
                      onChangePiasters={setMachineCommissionPiasters}
                      placeholder="0.00"
                      className="text-lg font-black"
                    />
                  </div>

                  {/* Card 3: Shop Profit */}
                  <div className="p-3.5 rounded-xl bg-paid-soft/40 dark:bg-emerald-950/25 border border-paid/25 dark:border-emerald-700/35 flex flex-col justify-between gap-2.5 transition-all focus-within:border-paid dark:focus-within:border-paid-bright">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-paid dark:text-paid-bright" />
                      <label className="text-xs font-bold text-paid dark:text-paid-bright">
                        3. ربح المحل
                      </label>
                    </div>
                    <MoneyInput
                      valuePiasters={shopProfitPiasters}
                      onChangePiasters={setShopProfitPiasters}
                      placeholder="0.00"
                      className="text-lg font-black text-paid dark:text-paid-bright"
                    />
                  </div>
                </div>
              </div>

              {/* Step 5: Cash Destination & Notes */}
              <div className="border-t border-line dark:border-line-dark pt-4">
                <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-2">
                  أين يتم توريد المبلغ المستلم من الزبون؟
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setPaymentDestination('terminal_till')}
                    className={`cursor-pointer p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                      paymentDestination === 'terminal_till'
                        ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-bright/15 ring-1 ring-brand dark:ring-brand-bright text-brand-dark dark:text-brand-bright'
                        : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                    }`}
                  >
                    <Wallet className="w-5 h-5 text-brand dark:text-brand-bright shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold block">درج/محفظة الماكينة المنفصلة</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-bright/30">
                          الافتراضي
                        </span>
                      </div>
                      <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark">مفصول كلياً ومخصص لماكينات الدفع والشحن</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setPaymentDestination('cash_drawer')}
                    className={`cursor-pointer p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                      paymentDestination === 'cash_drawer'
                        ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-bright/15 ring-1 ring-brand dark:ring-brand-bright text-brand-dark dark:text-brand-bright'
                        : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                    }`}
                  >
                    <Landmark className="w-5 h-5 text-ink-muted dark:text-ink-muted-dark shrink-0" />
                    <div>
                      <span className="text-xs font-bold block">درج كاشير المحل</span>
                      <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark">يدخل ضمن نقدية وعهدة الكاشير الرئيسية</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                    placeholder="ملاحظات اختيارية عن العملية..."
                  />
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Financial Summary & Confirmation */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-5 sm:p-6 flex flex-col gap-4 shadow-2xs sticky top-4">
                <h2 className="text-sm sm:text-base font-black text-ink dark:text-ink-dark border-b border-line dark:border-line-dark pb-3 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-brand dark:text-brand-bright" />
                  ملخص حساب العملية للزبون والمحل
                </h2>

                {/* Calculation List */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-ink-muted dark:text-ink-muted-dark">1. مبلغ الفاتورة / الرصيد:</span>
                    <span className="font-bold font-mono text-ink dark:text-ink-dark tabular-nums">{formatArabicCurrency(billAmountPiasters)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-ink-muted dark:text-ink-muted-dark">2. عمولة الماكينة:</span>
                    <span className="font-bold font-mono text-ink dark:text-ink-dark tabular-nums">{formatArabicCurrency(machineCommissionPiasters)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-ink-muted dark:text-ink-muted-dark">3. ربح المحل من العملية:</span>
                    <span className="font-bold font-mono text-paid dark:text-paid-bright tabular-nums">{formatArabicCurrency(shopProfitPiasters)}</span>
                  </div>

                  <div className="h-px bg-line dark:bg-line-dark my-1" />

                  {/* Total To Receive From Customer */}
                  <div className="p-4 rounded-xl bg-paid-soft dark:bg-emerald-950/40 border border-paid-border dark:border-emerald-500/30">
                    <span className="text-xs text-paid dark:text-emerald-400 font-black block mb-1">
                      إجمالي المبلغ المطلوب تحصيله من الزبون:
                    </span>
                    <div className="text-2xl font-black font-mono text-paid dark:text-emerald-300 tracking-tight tabular-nums">
                      {formatArabicCurrency(totalReceivedPiasters)}
                    </div>
                    <span className="text-[11px] text-paid/80 dark:text-emerald-400/80 mt-1 block font-medium">
                      (الفاتورة {formatArabicCurrency(billAmountPiasters)} + العمولة {formatArabicCurrency(machineCommissionPiasters)} + الربح {formatArabicCurrency(shopProfitPiasters)})
                    </span>
                  </div>

                  {/* Machine Balance Impact */}
                  <div className={`p-3.5 rounded-xl border ${
                    isBalanceInsufficient ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30' : 'bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark'
                  }`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-ink-muted dark:text-ink-muted-dark font-medium">المخصوم من رصيد الماكينة (المبلغ + العمولة):</span>
                      <span className="font-bold font-mono text-danger dark:text-danger-bright tabular-nums">{formatArabicCurrency(deductedBalancePiasters)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted dark:text-ink-muted-dark font-medium">الرصيد المتبقي بعد العملية:</span>
                      <span className={`font-black font-mono tabular-nums ${
                        isBalanceInsufficient ? 'text-danger dark:text-danger-bright' : 'text-ink dark:text-ink-dark'
                      }`}>
                        {currentTerminal 
                          ? formatArabicCurrency(currentTerminal.balancePiasters - deductedBalancePiasters)
                          : '0.00 ج.م'}
                      </span>
                    </div>
                    {isBalanceInsufficient && (
                      <div className="mt-2 text-xs text-danger dark:text-danger-bright font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                        رصيد الماكينة غير كافٍ لإتمام العملية!
                      </div>
                    )}
                  </div>

                  {/* Net Store Profit */}
                  <div className="p-3.5 rounded-xl bg-brand-soft dark:bg-brand-bright/15 border border-brand/20 dark:border-brand-bright/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-brand-dark dark:text-brand-bright block">صافي ربح المحل من هذه العملية:</span>
                        <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">لا يُخصم من رصيد الماكينة نهائياً</span>
                      </div>
                      <span className="text-lg font-black font-mono text-brand dark:text-brand-bright tabular-nums">
                        {formatArabicCurrency(netProfitPiasters)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Auto print toggle card */}
                <div
                  onClick={() => setAutoPrintReceipt(!autoPrintReceipt)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer select-none transition-all ${
                    autoPrintReceipt
                      ? 'bg-paid-soft/40 dark:bg-paid-dark-soft/40 border-paid/30 dark:border-paid-bright/30 hover:border-paid/50'
                      : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-hover'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                        autoPrintReceipt
                          ? 'bg-paid dark:bg-paid-bright text-white dark:text-slate-900 shadow-xs'
                          : 'bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark'
                      }`}
                    >
                      <Printer className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-ink dark:text-ink-dark block">
                        عرض إيصال العملية للطباعة فور التأكيد
                      </span>
                      <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">
                        معاينة وطباعة بون حراري للعميل فور نجاح المعاملة
                      </span>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={autoPrintReceipt}
                    onChange={(val) => setAutoPrintReceipt(val)}
                    size="sm"
                  />
                </div>

                {/* Confirm Action Button */}
                <button
                  type="button"
                  onClick={() => handleCreateTransaction()}
                  disabled={isSubmittingTx || isBalanceInsufficient || billAmountPiasters <= 0}
                  className={`w-full py-3 px-4 rounded-xl font-black text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isSubmittingTx || isBalanceInsufficient || billAmountPiasters <= 0
                      ? 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark cursor-not-allowed shadow-none'
                      : 'bg-paid dark:bg-paid-bright hover:bg-paid-dark dark:hover:bg-paid text-white dark:text-slate-900 active:scale-98'
                  }`}
                >
                  <CheckCircle2 className="w-4.5 h-4.5" />
                  <span>{isSubmittingTx ? 'جاري تنفيذ العملية...' : 'تأكيد العملية وتسجيل الحساب'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TERMINALS & FUNDING */}
        {activeTab === 'terminals' && canAccessTerminals && (
          <div className="max-w-6xl mx-auto flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black text-ink dark:text-ink-dark">أرصدة ماكينات الدفع والخدمات</h2>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5">متابعة دقيقة للأرصدة المتوفرة وسجل التغذية والشحن لكل ماكينة</p>
              </div>
              {canManageTerminals && (
                <button
                  type="button"
                  onClick={openNewTerminalModal}
                  className="px-3.5 py-2 bg-paid hover:bg-paid-dark text-white dark:bg-paid-bright dark:hover:bg-paid dark:text-slate-900 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>إضافة ماكينة جديدة</span>
                </button>
              )}
            </div>

            {/* Terminals Cards Grid */}
            {terminals.length === 0 ? (
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-dashed border-line dark:border-line-dark p-8 flex flex-col items-center justify-center text-center gap-3 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-ink dark:text-ink-dark">لا توجد ماكينات دفع مسجلة حتى الآن</h3>
                  <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1 max-w-sm">
                    قم بإضافة ماكينات الدفع والخدمات الإلكترونية (فوري، أمان، بي، سداد...) لبدء تسجيل العمليات وشحن الأرصدة
                  </p>
                </div>
                {canManageTerminals && (
                  <button
                    type="button"
                    onClick={openNewTerminalModal}
                    className="px-4 py-2 bg-paid hover:bg-paid-dark text-white dark:bg-paid-bright dark:hover:bg-paid dark:text-slate-900 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 mt-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>إضافة ماكينة جديدة</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {terminals.map((term) => (
                  <div key={term.id} className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 flex flex-col justify-between gap-4 hover:border-brand/40 dark:hover:border-brand-bright/40 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30">
                          {PROVIDER_NAMES[term.provider] || term.provider}
                        </span>
                        {canManageTerminals && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditTerminalModal(term)}
                              className="text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark p-1 rounded-lg hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
                              title="تعديل الماكينة"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTerminal(term.id, term.name)}
                              className="text-ink-muted dark:text-ink-muted-dark hover:text-danger dark:hover:text-danger-bright p-1 rounded-lg hover:bg-danger-soft dark:hover:bg-danger-dark-soft transition-colors cursor-pointer"
                              title="حذف الماكينة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      <h3 className="font-black text-base text-ink dark:text-ink-dark">{term.name}</h3>
                      <p className="text-xs text-ink-muted dark:text-ink-muted-dark font-mono mt-0.5">كود الماكينة: {term.terminalCode || '---'}</p>

                      <div className="mt-4 p-3.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                        <span className="text-xs text-ink-muted dark:text-ink-muted-dark block mb-1">الرصيد المتاح الحالي:</span>
                        <span className={`text-2xl font-black font-mono block tabular-nums ${term.isLowBalance ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'}`}>
                          {formatArabicCurrency(term.balancePiasters)}
                        </span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-ink-muted dark:text-ink-muted-dark">نظام الحساب:</span>
                        <span className="px-2 py-0.5 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-bold border border-paid-border dark:border-paid-bright/20">
                          3 مدخلات مباشرة (المبلغ + العمولة + الربح)
                        </span>
                      </div>

                      {term.isLowBalance && (
                        <div className="mt-2.5 p-2 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                          رصيد الماكينة تحت حد التنبيه ({formatArabicCurrency(term.lowBalanceAlertPiasters)})
                        </div>
                      )}
                    </div>

                    {canFund && (
                      <button
                        type="button"
                        onClick={() => {
                          setFundingTerminalId(term.id);
                          setFundingAmountPiasters(100000);
                          setFundingModalError(null);
                          void fetchLiveDrawerCash();
                          setIsFundingModalOpen(true);
                        }}
                        className="w-full py-2.5 px-4 bg-paid hover:bg-paid-dark text-white dark:bg-paid-bright dark:hover:bg-paid dark:text-slate-900 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-98 group"
                      >
                        <Zap className="w-4 h-4 text-emerald-200 dark:text-slate-900 fill-emerald-200/30 dark:fill-slate-900/30 group-hover:fill-white dark:group-hover:fill-slate-900 group-hover:text-white dark:group-hover:text-slate-900 transition-all group-hover:scale-110" />
                        <span>شحن وتغذية الرصيد</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Fundings History Table */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 mt-1 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-line/60 dark:border-line-dark/60">
                <div className="flex items-center gap-2">
                  <Clock className="w-4.5 h-4.5 text-brand dark:text-brand-bright" />
                  <h3 className="font-black text-sm sm:text-base text-ink dark:text-ink-dark">
                    سجل شحن وتغذية أرصدة الماكينات
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright">
                    {filteredFundings.length} حركة
                  </span>
                </div>
              </div>

              {/* Fundings Filter Bar */}
              <div className="bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark rounded-xl p-3 flex flex-wrap items-center gap-2.5">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fundingSearch}
                    onChange={(e) => setFundingSearch(e.target.value)}
                    placeholder="بحث باسم الماكينة، مصدر التغذية، أو الملاحظات..."
                    className="w-full pr-9 pl-3 py-1.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                  />
                </div>

                <CustomSelect
                  value={fundingTerminalFilter}
                  onChange={setFundingTerminalFilter}
                  options={[
                    { value: 'all', label: 'كل الماكينات' },
                    ...terminals.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  className="w-40"
                />

                <CustomSelect
                  value={fundingSourceFilter}
                  onChange={setFundingSourceFilter}
                  options={[
                    { value: 'all', label: 'كل مصادر الشحن' },
                    { value: 'cash_drawer', label: 'درج كاشير المحل' },
                    { value: 'bank_transfer', label: 'تحويل بنكي' },
                    { value: 'other', label: 'كاش خارجي / مصدر آخر' },
                  ]}
                  className="w-44"
                />

                {(fundingSearch || fundingTerminalFilter !== 'all' || fundingSourceFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setFundingSearch('');
                      setFundingTerminalFilter('all');
                      setFundingSourceFilter('all');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft flex items-center gap-1 transition-colors cursor-pointer"
                    title="إعادة تعيين الفلاتر"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إلغاء الفلترة</span>
                  </button>
                )}
              </div>

              {filteredFundings.length === 0 ? (
                <div className="text-center py-10 text-ink-muted dark:text-ink-muted-dark text-xs bg-surface-2/30 dark:bg-surface-dark-2/30 rounded-xl border border-dashed border-line dark:border-line-dark">
                  {fundings.length === 0
                    ? 'لا توجد حركات تغذية رصيد مسجلة حتى الآن.'
                    : 'لا توجد حركات شحن مطابقة لخيارات الفلترة المحددة.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line/70 dark:border-line-dark/70">
                  <table className="w-full text-xs text-right min-w-[850px] border-collapse">
                    <thead className="bg-surface-2/80 dark:bg-surface-dark-2/80 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark text-[11px] font-bold select-none">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap">التاريخ والوقت</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الماكينة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">مصدر التغذية</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">المبلغ المشحون</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الرصيد السابق</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الرصيد بعد الشحن</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 bg-surface dark:bg-surface-dark">
                      {pagedFundings.map((fnd) => (
                        <tr key={fnd.id} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs text-ink-muted dark:text-ink-muted-dark font-mono align-middle">
                            {new Date(fnd.createdAt).toLocaleString('ar-EG')}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-bold text-ink dark:text-ink-dark text-xs align-middle">
                            {fnd.terminalName || fnd.terminalId}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs align-middle">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark">
                              {fnd.fundingSource === 'cash_drawer' ? 'درج كاشير المحل' :
                               fnd.fundingSource === 'bank_transfer' ? 'تحويل بنكي' : 'كاش خارجي'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-black font-mono text-paid dark:text-paid-bright tabular-nums align-middle">
                            +{formatArabicCurrency(fnd.amountPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-ink-muted dark:text-ink-muted-dark font-mono tabular-nums align-middle">
                            {formatArabicCurrency(fnd.previousBalancePiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-black text-ink dark:text-ink-dark font-mono tabular-nums align-middle">
                            {formatArabicCurrency(fnd.newBalancePiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 text-xs text-ink-muted dark:text-ink-muted-dark align-middle">
                            {fnd.notes || <span className="text-ink-muted/30 dark:text-ink-muted-dark/30">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Fundings Pagination Bar */}
              <PaginationBar
                currentPage={fundingCurrentPage}
                pageSize={fundingPageSize}
                totalCount={filteredFundings.length}
                onPageChange={setFundingCurrentPage}
                onPageSizeChange={setFundingPageSize}
                pageSizeOptions={[10, 15, 25, 50]}
                itemLabel="حركة شحن"
              />
            </div>
          </div>
        )}

        {/* TAB 3: TRANSACTION HISTORY */}
        {activeTab === 'history' && canViewHistory && (
          <div className="max-w-6xl mx-auto flex flex-col gap-5">
            {/* Filter Bar */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[240px] relative">
                  <Search className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="بحث برقم الإيصال، رقم الهاتف، اسم الخدمة، أو اسم العميل..."
                    className="w-full pr-9 pl-4 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <CustomSelect
                    value={historyTerminalFilter}
                    onChange={setHistoryTerminalFilter}
                    options={[
                      { value: 'all', label: 'كل الماكينات' },
                      ...terminals.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                    className="w-44"
                  />

                  <CustomSelect
                    value={historyServiceFilter}
                    onChange={setHistoryServiceFilter}
                    options={[
                      { value: 'all', label: 'كل أنواع الخدمات' },
                      { value: 'mobile_recharge', label: 'شحن رصيد وكروت' },
                      { value: 'utility_bill', label: 'فواتير ومرافق عامة' },
                      { value: 'wallet_transfer', label: 'تحويل محافظ' },
                      { value: 'cash_in', label: 'إيداع نقدي' },
                      { value: 'cash_out', label: 'سحب نقدي' },
                    ]}
                    className="w-44"
                  />

                  <CustomSelect
                    value={historyDestinationFilter}
                    onChange={setHistoryDestinationFilter}
                    options={[
                      { value: 'all', label: 'كل وجهات النقدية' },
                      { value: 'cash_drawer', label: 'درج كاشير المحل' },
                      { value: 'terminal_drawer', label: 'درج المحفظة/الماكينة' },
                    ]}
                    className="w-44"
                  />

                  <CustomSelect
                    value={historyDateFilter}
                    onChange={setHistoryDateFilter}
                    options={[
                      { value: 'all', label: 'كل التواريخ' },
                      { value: 'today', label: 'اليوم فقط' },
                      { value: 'yesterday', label: 'أمس' },
                      { value: 'week', label: 'آخر 7 أيام' },
                      { value: 'month', label: 'آخر 30 يوماً' },
                    ]}
                    className="w-36"
                  />

                  {(historySearch || historyTerminalFilter !== 'all' || historyServiceFilter !== 'all' || historyDestinationFilter !== 'all' || historyDateFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setHistorySearch('');
                        setHistoryTerminalFilter('all');
                        setHistoryServiceFilter('all');
                        setHistoryDestinationFilter('all');
                        setHistoryDateFilter('all');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="إعادة تعيين الفلاتر"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إلغاء الفلترة</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4.5 h-4.5 text-brand dark:text-brand-bright" />
                  <h3 className="font-black text-sm sm:text-base text-ink dark:text-ink-dark">
                    سجل العمليات المنفذة
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright">
                    {filteredTransactions.length} عملية
                  </span>
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-ink-muted dark:text-ink-muted-dark text-xs bg-surface-2/30 dark:bg-surface-dark-2/30 rounded-xl border border-dashed border-line dark:border-line-dark">
                  {transactions.length === 0
                    ? 'لا توجد عمليات دفع إلكتروني مسجلة حتى الآن.'
                    : 'لا توجد عمليات دفع إلكتروني مطابقة لخيارات الفلترة والبحث.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line/70 dark:border-line-dark/70">
                  <table className="w-full text-xs text-right min-w-[1020px] border-collapse">
                    <thead className="bg-surface-2/80 dark:bg-surface-dark-2/80 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark text-[11px] font-bold select-none">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap">الوقت</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الماكينة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الخدمة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">رقم الهاتف / المرجع</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">1. الفاتورة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">2. عمولة الماكينة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">3. ربح المحل</th>
                        <th className="py-3 px-3.5 whitespace-nowrap font-bold text-paid dark:text-paid-bright">المستلم من الزبون</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-danger dark:text-danger-bright">مخصوم الماكينة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">صافي الربح</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">وجهة النقدية</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">الحالة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 bg-surface dark:bg-surface-dark">
                      {pagedTransactions.map((tx) => (
                        <tr key={tx.id} className={`hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors ${tx.status === 'cancelled' ? 'opacity-65 bg-danger-soft/40 dark:bg-danger-dark-soft/40' : ''}`}>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs text-ink-muted dark:text-ink-muted-dark font-mono align-middle">
                            {new Date(tx.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-bold text-ink dark:text-ink-dark text-xs align-middle">
                            {tx.terminalName}
                          </td>
                          <td className="py-3.5 px-3.5 align-middle max-w-[210px]">
                            <span className={`font-bold text-ink dark:text-ink-dark text-xs block leading-snug truncate ${tx.status === 'cancelled' ? 'line-through text-ink-muted dark:text-ink-muted-dark' : ''}`} title={tx.serviceName}>
                              {tx.serviceName}
                            </span>
                            {tx.serviceTypeArabic && (
                              <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark block mt-0.5 truncate">
                                {tx.serviceTypeArabic}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs font-mono align-middle">
                            {tx.customerPhone ? (
                              <div className="text-ink dark:text-ink-dark font-semibold tracking-wide font-mono">{tx.customerPhone}</div>
                            ) : null}
                            {tx.referenceNumber ? (
                              <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark font-mono">مرجع: {tx.referenceNumber}</div>
                            ) : null}
                            {!tx.customerPhone && !tx.referenceNumber && (
                              <span className="text-ink-muted/30 dark:text-ink-muted-dark/30 font-mono text-xs">—</span>
                            )}
                          </td>
                          <td className={`py-3.5 px-3.5 whitespace-nowrap font-bold text-ink dark:text-ink-dark font-mono tabular-nums align-middle ${tx.status === 'cancelled' ? 'line-through' : ''}`}>
                            {formatArabicCurrency(tx.billAmountPiasters)}
                          </td>
                          <td className={`py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums font-semibold text-ink-muted dark:text-ink-muted-dark align-middle ${tx.status === 'cancelled' ? 'line-through' : ''}`}>
                            {formatArabicCurrency(tx.providerCommissionPiasters || 0)}
                          </td>
                          <td className={`py-3.5 px-3.5 whitespace-nowrap text-paid dark:text-paid-bright font-mono tabular-nums font-bold align-middle ${tx.status === 'cancelled' ? 'line-through text-ink-muted dark:text-ink-muted-dark' : ''}`}>
                            {formatArabicCurrency(tx.customerFeePiasters)}
                          </td>
                          <td className={`py-3.5 px-3.5 whitespace-nowrap font-black text-paid dark:text-paid-bright font-mono tabular-nums align-middle ${tx.status === 'cancelled' ? 'line-through' : ''}`}>
                            {formatArabicCurrency(tx.totalReceivedPiasters)}
                          </td>
                          <td className={`py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums text-danger dark:text-danger-bright align-middle ${tx.status === 'cancelled' ? 'line-through' : ''}`}>
                            {formatArabicCurrency(tx.machineDeductedPiasters || (tx.serviceType === 'cash_out' ? 0 : (tx.billAmountPiasters + (tx.providerCommissionPiasters || 0))))}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-black font-mono text-xs tabular-nums border shadow-2xs ${
                              tx.status === 'cancelled'
                                ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30 line-through'
                                : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid-bright/20'
                            }`}>
                              {formatArabicCurrency(tx.netProfitPiasters)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                              tx.paymentDestination === 'cash_drawer'
                                ? 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border-line dark:border-line-dark'
                                : 'bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30'
                            }`}>
                              {tx.paymentDestination === 'cash_drawer' ? 'درج المحل' : 'درج الماكينة'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            {tx.status === 'cancelled' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30 line-through">
                                ملغاة
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/20">
                                ناجحة
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setReceiptTx(tx)}
                                className="p-1.5 text-ink-muted dark:text-ink-muted-dark hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft dark:hover:bg-brand-bright/15 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="طباعة إيصال"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              {tx.status !== 'cancelled' && canCancel && (
                                <button
                                  onClick={() => {
                                    setCancellingTx(tx);
                                    setCancelReason('');
                                  }}
                                  className="p-1.5 text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center text-xs font-bold"
                                  title="إلغاء العملية واسترجاع الرصيد"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Transactions Pagination Bar */}
              <PaginationBar
                currentPage={historyCurrentPage}
                pageSize={historyPageSize}
                totalCount={filteredTransactions.length}
                onPageChange={setHistoryCurrentPage}
                onPageSizeChange={setHistoryPageSize}
                pageSizeOptions={[15, 25, 50, 100]}
                itemLabel="عملية"
              />
            </div>
          </div>
        )}

        {/* TAB 4: INDEPENDENT ANALYTICS */}
        {activeTab === 'analytics' && (
          !canViewAnalytics ? (
            <div className="max-w-md mx-auto my-16 p-8 bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark text-center flex flex-col items-center gap-3.5 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-warn/10 text-warn flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warn" />
              </div>
              <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">غير مصرح لك بعرض أرباح وتحليلات الماكينات</h3>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                تحتاج لصلاحية الاطلاع على تحليلات وأرباح ماكينات الدفع والخدمات الإلكترونية من إدارة المحل.
              </p>
            </div>
          ) : (
          <div className="max-w-6xl mx-auto flex flex-col gap-5">
            <div>
              <h2 className="text-base sm:text-lg font-black text-ink dark:text-ink-dark">تحليلات وأرباح ماكينات الدفع والخدمات الإلكترونية</h2>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5">
                تقرير تحليلي مالي مستقل بالكامل؛ لا يختلط إطلاقاً بأرباح أو مخزون بضاعة المحل
              </p>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 hover:border-paid/40 dark:hover:border-paid-bright/40 transition-colors">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">صافي أرباح الخدمات</span>
                <span className="text-2xl font-black font-mono text-paid dark:text-paid-bright block tabular-nums">
                  {formatArabicCurrency(analytics?.totalNetProfitPiasters || 0)}
                </span>
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark mt-1 block">
                  إجمالي مكسب المحل الصافي من العمليات
                </span>
              </div>

              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 hover:border-line-hover dark:hover:border-line-dark transition-colors">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">حجم النقدية المتداولة</span>
                <span className="text-2xl font-black font-mono text-ink dark:text-ink-dark block tabular-nums">
                  {formatArabicCurrency(analytics?.totalVolumePiasters ?? analytics?.totalBillVolumePiasters ?? 0)}
                </span>
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark mt-1 block">
                  إجمالي قيمة الفواتير والشحن المنفذة
                </span>
              </div>

              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 hover:border-line-hover dark:hover:border-line-dark transition-colors">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">إجمالي عمولات الماكينات</span>
                <span className="text-2xl font-black font-mono text-ink dark:text-ink-dark block tabular-nums">
                  {formatArabicCurrency(analytics?.totalCommissionsPiasters ?? analytics?.totalProviderCommissionsPiasters ?? 0)}
                </span>
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark mt-1 block">
                  المخصومة لصالح شركات وماكينات الدفع
                </span>
              </div>

              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 hover:border-line-hover dark:hover:border-line-dark transition-colors">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">إجمالي أرصدة الماكينات</span>
                <span className="text-2xl font-black font-mono text-ink dark:text-ink-dark block tabular-nums">
                  {formatArabicCurrency(analytics?.totalTerminalsBalancePiasters || 0)}
                </span>
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark mt-1 block">
                  الرصيد الفعلي المتاح حالياً بالماكينات
                </span>
              </div>
            </div>

            {/* Cash Flow Distribution Card */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 sm:p-6">
              <h3 className="font-black text-sm sm:text-base text-ink dark:text-ink-dark mb-4 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-brand dark:text-brand-bright" />
                توزيع النقدية المحصلة من خدمات الدفع
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">دخلت في درج كاشير المحل</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-bright/20 font-bold">عهدة الكاشير</span>
                  </div>
                  <span className="text-2xl font-black font-mono text-ink dark:text-ink-dark block tabular-nums">
                    {formatArabicCurrency(analytics?.totalInCashDrawerPiasters || 0)}
                  </span>
                  <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                    هذه المبالغ مسجلة في درج المحل لتغطية التغذية أو التسليم عند الإغلاق اليومي.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs sm:text-sm text-ink dark:text-ink-dark">بقيت في محفظة/درج الماكينة المنفصلة</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-bright/15 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 font-bold">مفصولة تماماً</span>
                  </div>
                  <span className="text-2xl font-black font-mono text-ink dark:text-ink-dark block tabular-nums">
                    {formatArabicCurrency(analytics?.totalInTerminalTillPiasters || 0)}
                  </span>
                  <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-1">
                    هذه المبالغ معزولة ولا تؤثر على حساب درج المحل الرئيسي.
                  </p>
                </div>
              </div>
            </div>

            {/* Service Breakdown Summary */}
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-5 sm:p-6">
              <h3 className="font-black text-sm sm:text-base text-ink dark:text-ink-dark mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand dark:text-brand-bright" />
                تحليل العمليات حسب نوع الخدمة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {SERVICE_PRESETS.map((preset) => {
                  const txsForService = transactions.filter((t) => t.serviceType === preset.type && t.status === 'completed');
                  const vol = txsForService.reduce((s, t) => s + (t.billAmountPiasters || 0), 0);
                  const prof = txsForService.reduce((s, t) => s + (t.netProfitPiasters || 0), 0);
                  const Icon = preset.icon;

                  return (
                    <div key={preset.type} className="p-4 rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4.5 h-4.5 text-brand dark:text-brand-bright" />
                        <span className="font-black text-xs sm:text-sm text-ink dark:text-ink-dark">{preset.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark mb-1">
                        <span>عدد العمليات:</span>
                        <span className="font-bold text-ink dark:text-ink-dark">{txsForService.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark mb-1">
                        <span>إجمالي المعاملات:</span>
                        <span className="font-bold font-mono text-ink dark:text-ink-dark tabular-nums">{formatArabicCurrency(vol)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold text-brand dark:text-brand-bright mt-2 pt-2 border-t border-line dark:border-line-dark">
                        <span>صافي الربح:</span>
                        <span className="font-mono tabular-nums">{formatArabicCurrency(prof)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )
        )}
      </div>

      {/* MODAL: FUNDING TERMINAL */}
      {isFundingModalOpen && (
        <div onClick={handleFundingBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-md w-full p-6 shadow-xl border border-line dark:border-line-dark" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line dark:border-line-dark pb-3">
              <h3 className="text-base font-black text-ink dark:text-ink-dark flex items-center gap-2">
                <Zap className="w-5 h-5 text-paid dark:text-paid-bright" />
                تغذية وشحن رصيد الماكينة
              </h3>
              <button onClick={() => void requestCloseFunding()} className="text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark cursor-pointer p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFundTerminal} className="flex flex-col gap-4">
              {fundingModalError && (
                <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-xl p-3 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                  <span>{fundingModalError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">الماكينة المراد تغذيتها</label>
                <CustomSelect
                  value={fundingTerminalId}
                  onChange={setFundingTerminalId}
                  options={terminalOptions}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">مبلغ التغذية (الشحن)</label>
                <MoneyInput
                  valuePiasters={fundingAmountPiasters}
                  onChangePiasters={setFundingAmountPiasters}
                  className="text-lg font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">مصدر التغذية</label>
                <CustomSelect
                  value={fundingSource}
                  onChange={(val) => setFundingSource(val as any)}
                  options={[
                    { value: 'cash_drawer', label: 'درج كاشير المحل (يخصم من نقدية الدرج)' },
                    { value: 'bank_transfer', label: 'تحويل بنكي / إنستاباي' },
                    { value: 'external_cash', label: 'كاش خارجي من صاحب المحل' },
                  ]}
                />

                {fundingSource === 'cash_drawer' && (
                  <div className="space-y-1.5 mt-2">
                    <div className="p-2.5 rounded-xl border text-xs bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark flex items-center justify-between">
                      <span className="text-ink-muted dark:text-ink-muted-dark font-bold text-[11px]">كاش الدرج المتوفر حالياً:</span>
                      <span className={`font-mono font-black text-xs ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                        {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                      </span>
                    </div>

                    {liveDrawerCashPiasters !== null && (liveDrawerCashPiasters <= 0 || (fundingAmountPiasters > 0 && fundingAmountPiasters > liveDrawerCashPiasters)) && (
                      <div className="p-2.5 rounded-xl border text-[11px] bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {liveDrawerCashPiasters <= 0
                              ? 'درج الكاشير فارغ (0.00 ج.م)!'
                              : 'رصيد نقدية الدرج غير كافٍ!'}
                          </span>
                        </div>
                        <p className="text-[10.5px] leading-relaxed">
                          {liveDrawerCashPiasters <= 0
                            ? 'لا يمكن سحب نقدية من درج فارغ. إذا كان الشحن تم من مالك المحل أو نقدية خارجية، يرجى تغيير مصدر التغذية إلى: «كاش خارجي من صاحب المحل».'
                            : `المبلغ المطلوب (${formatArabicCurrency(fundingAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى اختيار «كاش خارجي من صاحب المحل» إذا كان المبلغ مدفوعاً من مالك المحل.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={fundingNotes}
                  onChange={(e) => setFundingNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line dark:border-line-dark">
                <button
                  type="button"
                  onClick={() => void requestCloseFunding()}
                  className="px-4 py-2 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingFunding ||
                    fundingAmountPiasters <= 0 ||
                    (fundingSource === 'cash_drawer' &&
                      liveDrawerCashPiasters !== null &&
                      (liveDrawerCashPiasters <= 0 || fundingAmountPiasters > liveDrawerCashPiasters))
                  }
                  className="px-4 py-2 bg-paid hover:bg-paid-dark text-white dark:bg-paid-bright dark:hover:bg-paid dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingFunding ? 'جاري الشحن...' : 'تأكيد شحن الرصيد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT TERMINAL */}
      {isTerminalModalOpen && (
        <div onClick={handleTerminalBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-xl w-full p-6 shadow-xl border border-line dark:border-line-dark max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line dark:border-line-dark pb-3">
              <h3 className="text-base font-black text-ink dark:text-ink-dark flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-paid dark:text-paid-bright" />
                {editingTerminalId ? 'تعديل بيانات ماكينة الدفع' : 'إضافة ماكينة دفع جديدة'}
              </h3>
              <button onClick={() => void requestCloseTerminal()} className="text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark cursor-pointer p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTerminal} className="flex flex-col gap-4">
              {terminalModalError && (
                <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-xl p-3 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                  <span>{terminalModalError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">اسم الماكينة</label>
                <input
                  type="text"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  placeholder="مثال: ماكينة سوبر باي (SuperPay)"
                  className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">الشركة المزودة (Provider)</label>
                <CustomSelect
                  value={termProvider}
                  onChange={setTermProvider}
                  options={[
                    { value: 'super_pay', label: 'سوبر باي (SuperPay)' },
                    { value: 'fawry', label: 'فوري (Fawry)' },
                    { value: 'aman', label: 'أمان (Aman)' },
                    { value: 'masary', label: 'مصاري (Masary)' },
                    { value: 'momkn', label: 'ممكن (Momkn)' },
                    { value: 'other', label: 'أخرى' },
                  ]}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">كود الماكينة أو رقم السيريال</label>
                <input
                  type="text"
                  value={termCode}
                  onChange={(e) => setTermCode(e.target.value)}
                  placeholder="مثال: SP-01 أو رقم الجهاز"
                  className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-left text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">
                    {editingTerminalId ? 'الرصيد الحالي للماكينة (تسوية رصيد)' : 'الرصيد الافتتاحي'}
                  </label>
                  {editingTerminalId && (
                    <span className="text-[10px] text-brand dark:text-brand-bright font-bold bg-brand-soft dark:bg-brand-bright/15 px-2 py-0.5 rounded-full border border-brand/20 dark:border-brand-bright/30">
                      تعديل الرصيد يسجل تسوية مالية فورية
                    </span>
                  )}
                </div>
                <MoneyInput
                  valuePiasters={termBalancePiasters}
                  onChangePiasters={setTermBalancePiasters}
                />
                {editingTerminalId && (
                  <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark mt-1 block">
                    يمكنك تعديل الرصيد هنا لتصحيح المبلغ أو تسويته، وسيتم تحديث رصيد الماكينة مباشرة وحفظ حركة تسوية في السجل.
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">حد تنبيه انخفاض الرصيد</label>
                <MoneyInput
                  valuePiasters={termAlertPiasters}
                  onChangePiasters={setTermAlertPiasters}
                />
              </div>

                            {/* Simple & Clear Pricing Notice */}
              <div className="p-3.5 rounded-xl bg-paid-soft/40 dark:bg-emerald-950/30 border border-paid/20 dark:border-emerald-600/30 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-paid dark:bg-paid-bright text-white dark:text-slate-900 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black text-ink dark:text-ink-dark block">
                    نظام الحساب المباشر (3 مدخلات سريعة)
                  </span>
                  <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                    يتم تحديد (مبلغ الفاتورة + عمولة الماكينة + ربح المحل) بحرية ومرونة أثناء كل عملية بيع مباشرة دون تعقيد.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line dark:border-line-dark">
                <div>
                  {editingTerminalId && canManageTerminals && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTerminal(editingTerminalId, termName)}
                      className="px-3 py-2 bg-danger-soft dark:bg-danger-dark-soft hover:bg-danger/20 dark:hover:bg-danger-dark-soft/80 text-danger dark:text-danger-bright border border-danger/30 dark:border-danger-bright/30 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الماكينة</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void requestCloseTerminal()}
                    className="px-4 py-2 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTerminal}
                    className="px-4 py-2 bg-paid hover:bg-paid-dark text-white dark:bg-paid-bright dark:hover:bg-paid dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                  >
                    {isSavingTerminal ? 'جاري الحفظ...' : 'حفظ الماكينة'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINT RECEIPT */}
      {receiptTx && (
        <div onClick={handleReceiptBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-line dark:border-line-dark font-mono text-ink dark:text-ink-dark" dir="rtl">
            <div className="text-center border-b border-dashed border-line dark:border-line-dark pb-3 mb-3">
              <div className="font-black text-base text-ink dark:text-ink-dark">إيصال خدمة دفع إلكتروني</div>
              <div className="text-xs text-ink-muted dark:text-ink-muted-dark font-sans mt-0.5">رفيق لنقاط البيع وإدارة المتاجر</div>
              <div className="text-[11px] text-ink-muted dark:text-ink-muted-dark mt-1">
                {new Date(receiptTx.createdAt).toLocaleString('ar-EG')}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-xs border-b border-dashed border-line dark:border-line-dark pb-3 mb-3">
              <div className="flex justify-between">
                <span className="text-ink-muted dark:text-ink-muted-dark font-sans">الماكينة:</span>
                <span className="font-bold text-ink dark:text-ink-dark">{receiptTx.terminalName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted dark:text-ink-muted-dark font-sans">نوع الخدمة:</span>
                <span className="font-bold text-ink dark:text-ink-dark">{receiptTx.serviceName}</span>
              </div>
              {receiptTx.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-ink-muted dark:text-ink-muted-dark font-sans">رقم الهاتف:</span>
                  <span className="font-bold text-ink dark:text-ink-dark">{receiptTx.customerPhone}</span>
                </div>
              )}
              {receiptTx.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-ink-muted dark:text-ink-muted-dark font-sans">رقم المرجع:</span>
                  <span className="font-bold text-ink dark:text-ink-dark">{receiptTx.referenceNumber}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 text-xs border-b border-dashed border-line dark:border-line-dark pb-3 mb-3">
              <div className="flex justify-between">
                <span className="text-ink-muted dark:text-ink-muted-dark font-sans">1. قيمة الفاتورة / الرصيد:</span>
                <span className="font-mono tabular-nums">{formatArabicCurrency(receiptTx.billAmountPiasters)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted dark:text-ink-muted-dark font-sans">2. عمولة الماكينة:</span>
                <span className="font-mono tabular-nums">{formatArabicCurrency(receiptTx.providerCommissionPiasters || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted dark:text-ink-muted-dark font-sans">3. ربح المحل من العملية:</span>
                <span className="font-mono text-paid dark:text-paid-bright font-bold tabular-nums">{formatArabicCurrency(receiptTx.customerFeePiasters)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-line dark:border-line-dark">
                <span className="font-sans">إجمالي المطلوب من الزبون:</span>
                <span className="text-paid dark:text-paid-bright font-black font-mono tabular-nums">{formatArabicCurrency(receiptTx.totalReceivedPiasters)}</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-ink-muted dark:text-ink-muted-dark font-sans mb-4">
              شكراً لتعاملكم معنا! احتفظ بهذا الإيصال للرجوع إليه عند الحاجة.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 bg-paid hover:bg-paid-dark text-white dark:bg-paid-bright dark:hover:bg-paid dark:text-slate-900 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer active:scale-98"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الإيصال</span>
              </button>
              <button
                type="button"
                onClick={() => void requestCloseReceipt()}
                className="px-4 py-2 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold font-sans transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCEL / VOID TRANSACTION */}
      {cancellingTx && (
        <div onClick={handleCancelBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line dark:border-line-dark" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line dark:border-line-dark pb-3">
              <h3 className="text-base font-black text-danger dark:text-danger-bright flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger dark:text-danger-bright shrink-0" />
                <span>إلغاء واسترجاع عملية دفع إلكتروني</span>
              </h3>
              <button
                type="button"
                onClick={() => void requestCloseCancel()}
                className="text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-xs flex flex-col gap-1.5">
                <div className="flex justify-between font-bold">
                  <span className="text-ink-muted dark:text-ink-muted-dark">الخدمة:</span>
                  <span className="text-ink dark:text-ink-dark">{cancellingTx.serviceName}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-ink-muted dark:text-ink-muted-dark">الماكينة:</span>
                  <span className="text-ink dark:text-ink-dark">{cancellingTx.terminalName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted dark:text-ink-muted-dark">مبلغ العملية:</span>
                  <span className="font-mono font-bold text-ink dark:text-ink-dark">{formatArabicCurrency(cancellingTx.billAmountPiasters)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted dark:text-ink-muted-dark">رسوم العميل المستلمة:</span>
                  <span className="font-mono font-bold text-paid dark:text-paid-bright">+{formatArabicCurrency(cancellingTx.customerFeePiasters)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-line dark:border-line-dark font-bold">
                  <span className="text-ink-muted dark:text-ink-muted-dark">الأثر على رصيد الماكينة:</span>
                  <span className="font-mono text-paid dark:text-paid-bright">
                    {cancellingTx.serviceType === 'cash_out'
                      ? `سيتم خصم ${formatArabicCurrency(cancellingTx.billAmountPiasters)} من رصيد الماكينة`
                      : `سيتم رد ${formatArabicCurrency(cancellingTx.machineDeductedPiasters || cancellingTx.billAmountPiasters)} إلى رصيد الماكينة`}
                  </span>
                </div>
              </div>

              <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-xl p-3 text-danger dark:text-danger-bright text-[11px] leading-relaxed">
                تنبيه: سيتم عكس أثر العملية في رصيد الماكينة لحظياً، واستبعاد نقدية وأرباح العملية من تقفيل اليومية وكشف الحساب.
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark block mb-1">سبب الإلغاء (اختياري)</label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: رقم هاتف خاطئ / طلب العميل"
                  className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-muted-dark/50 focus:bg-surface dark:focus:bg-surface-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line dark:border-line-dark mt-1">
                <button
                  type="button"
                  onClick={() => void requestCloseCancel()}
                  className="px-4 py-2 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={isSubmittingCancel}
                  onClick={handleCancelTransaction}
                  className="px-4 py-2 bg-danger hover:bg-danger/90 dark:bg-danger dark:hover:bg-danger/90 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isSubmittingCancel ? 'جاري الإلغاء...' : 'تأكيد الإلغاء والاسترجاع'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
