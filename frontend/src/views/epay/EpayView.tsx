import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Smartphone, 
  Zap, 
  Wallet, 
  FileText, 
  Landmark, 
  PlusCircle, 
  RefreshCw, 
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
  ChevronDown,
  Sliders,
  RotateCcw
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import { formatArabicCurrency } from '../../utils/money';
import { useAuth } from '../../context/useAuth';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import type { 
  EpayTerminal, 
  EpayTransaction, 
  EpayTerminalFunding, 
  EpayAnalyticsSummary, 
  EpayServiceType, 
  EpayPaymentDestination 
} from '../../types/models';

export type EpaySubTab = 'pos' | 'terminals' | 'history' | 'analytics';

export interface EpayViewProps {
  activeSubTab?: EpaySubTab;
  onSubTabChange?: (tab: EpaySubTab) => void;
}

interface ServiceQuickOption {
  type: EpayServiceType;
  name: string;
  icon: typeof Smartphone;
  defaultFeePiasters: number;
  defaultCommissionPiasters: number;
}

const SERVICE_PRESETS: ServiceQuickOption[] = [
  { type: 'mobile_recharge', name: 'شحن رصيد / كروت فكة', icon: Smartphone, defaultFeePiasters: 200, defaultCommissionPiasters: 100 },
  { type: 'utility_bill', name: 'فواتير كهرباء ومياه وغاز', icon: Zap, defaultFeePiasters: 500, defaultCommissionPiasters: 250 },
  { type: 'wallet_transfer', name: 'تحويل محافظ إلكترونية (فودافون كاش / إنستاباي)', icon: Wallet, defaultFeePiasters: 300, defaultCommissionPiasters: 150 },
  { type: 'cash_in', name: 'إيداع نقدي للمحافظ والحسابات', icon: ArrowDownLeft, defaultFeePiasters: 500, defaultCommissionPiasters: 200 },
  { type: 'cash_out', name: 'سحب نقدي من محفظة أو كارت', icon: ArrowUpRight, defaultFeePiasters: 500, defaultCommissionPiasters: 200 },
  { type: 'other', name: 'خدمات حكومية وجامعات ومصاريف أخرى', icon: FileText, defaultFeePiasters: 500, defaultCommissionPiasters: 300 },
];

const PRESET_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000]; // 10, 20, 50, 100, 200, 500 ج.م
const PRESET_FEES = [100, 200, 300, 500, 1000]; // 1, 2, 3, 5, 10 ج.م

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
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
  const [billAmountPiasters, setBillAmountPiasters] = useState<number>(0); // Starts empty!
  const [customerFeePiasters, setCustomerFeePiasters] = useState<number>(0);
  const [providerCommissionPiasters, setProviderCommissionPiasters] = useState<number>(0);
  const [isCustomFeeOverride, setIsCustomFeeOverride] = useState<boolean>(false);
  const [paymentDestination, setPaymentDestination] = useState<EpayPaymentDestination>('terminal_till');
  const [notes, setNotes] = useState<string>('');
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(true);

  // Receipt Modal State
  const [receiptTx, setReceiptTx] = useState<EpayTransaction | null>(null);

  // Funding Modal State
  const [isFundingModalOpen, setIsFundingModalOpen] = useState<boolean>(false);
  const [fundingTerminalId, setFundingTerminalId] = useState<string>('');
  const [fundingAmountPiasters, setFundingAmountPiasters] = useState<number>(100000);
  const [fundingSource, setFundingSource] = useState<'cash_drawer' | 'bank_transfer' | 'external_cash'>('cash_drawer');
  const [fundingNotes, setFundingNotes] = useState<string>('');
  const [isSubmittingFunding, setIsSubmittingFunding] = useState<boolean>(false);
  const [fundingModalError, setFundingModalError] = useState<string | null>(null);

  // Terminal Edit/Create Modal State
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState<boolean>(false);
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null);
  const [termName, setTermName] = useState<string>('');
  const [termProvider, setTermProvider] = useState<string>('super_pay');
  const [termCode, setTermCode] = useState<string>('');
  const [termBalancePiasters, setTermBalancePiasters] = useState<number>(0);
  const [termAlertPiasters, setTermAlertPiasters] = useState<number>(30000);
  const [termCustomerFeeType, setTermCustomerFeeType] = useState<'fixed' | 'percent'>('fixed');
  const [termCustomerFeeValue, setTermCustomerFeeValue] = useState<number>(200);
  const [termCustomerFeePercent, setTermCustomerFeePercent] = useState<string>('1.0');
  const [termProviderCommissionType, setTermProviderCommissionType] = useState<'fixed' | 'percent'>('fixed');
  const [termProviderCommissionValue, setTermProviderCommissionValue] = useState<number>(100);
  const [termProviderCommissionPercent, setTermProviderCommissionPercent] = useState<string>('0.5');
  const [isSavingTerminal, setIsSavingTerminal] = useState<boolean>(false);
  const [terminalModalError, setTerminalModalError] = useState<string | null>(null);

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
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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

  // Financial preview calculation
  const totalReceivedPiasters = useMemo(() => {
    return billAmountPiasters + customerFeePiasters;
  }, [billAmountPiasters, customerFeePiasters]);

  const deductedBalancePiasters = useMemo(() => {
    return serviceType === 'cash_out' ? 0 : billAmountPiasters;
  }, [serviceType, billAmountPiasters]);

  const netProfitPiasters = useMemo(() => {
    return customerFeePiasters + providerCommissionPiasters;
  }, [customerFeePiasters, providerCommissionPiasters]);

  const isBalanceInsufficient = useMemo(() => {
    if (!currentTerminal) return false;
    if (serviceType === 'cash_out') return false; // cash_out adds credit to machine, doesn't deduct
    return currentTerminal.balancePiasters < deductedBalancePiasters;
  }, [currentTerminal, serviceType, deductedBalancePiasters]);

  // Helper to compute fee or commission from terminal settings
  const computeFeeOrCommission = useCallback((
    billPiasters: number,
    ruleType?: 'fixed' | 'percent',
    ruleValue?: number,
    defaultFixedPiasters = 0
  ): number => {
    if (billPiasters <= 0) return 0;
    if (ruleType === 'percent') {
      const bps = ruleValue ?? 100;
      return Math.max(0, Math.round((billPiasters * bps) / 10000));
    }
    return Math.max(0, ruleValue ?? defaultFixedPiasters);
  }, []);

  // Recalculate automatic fees whenever terminal or bill amount changes (unless user explicitly customized)
  useEffect(() => {
    if (!isCustomFeeOverride && currentTerminal) {
      const fee = computeFeeOrCommission(
        billAmountPiasters,
        currentTerminal.customerFeeType,
        currentTerminal.customerFeeValue,
        200
      );
      const comm = computeFeeOrCommission(
        billAmountPiasters,
        currentTerminal.providerCommissionType,
        currentTerminal.providerCommissionValue,
        100
      );
      setCustomerFeePiasters(fee);
      setProviderCommissionPiasters(comm);
    }
  }, [currentTerminal, billAmountPiasters, isCustomFeeOverride, computeFeeOrCommission]);

  // Handle Select Service Preset
  const handleSelectServicePreset = (opt: ServiceQuickOption) => {
    setServiceType(opt.type);
    setServiceName(opt.name);
    if (isCustomFeeOverride) {
      setCustomerFeePiasters(opt.defaultFeePiasters);
      setProviderCommissionPiasters(opt.defaultCommissionPiasters);
    }
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
        customerFeePiasters,
        providerCommissionPiasters,
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

      // Reset form partially for next operation
      setBillAmountPiasters(0);
      setIsCustomFeeOverride(false);
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

  // Open Terminal Modal
  const openNewTerminalModal = () => {
    setEditingTerminalId(null);
    setTermName('');
    setTermProvider('super_pay');
    setTermCode('');
    setTermBalancePiasters(0);
    setTermAlertPiasters(30000);
    setTermCustomerFeeType('fixed');
    setTermCustomerFeeValue(200);
    setTermCustomerFeePercent('1.0');
    setTermProviderCommissionType('fixed');
    setTermProviderCommissionValue(100);
    setTermProviderCommissionPercent('0.5');
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
    setTermCustomerFeeType(term.customerFeeType || 'fixed');
    setTermCustomerFeeValue(term.customerFeeType === 'percent' ? 200 : (term.customerFeeValue ?? 200));
    setTermCustomerFeePercent(term.customerFeeType === 'percent' ? String((term.customerFeeValue ?? 100) / 100) : '1.0');
    setTermProviderCommissionType(term.providerCommissionType || 'fixed');
    setTermProviderCommissionValue(term.providerCommissionType === 'percent' ? 100 : (term.providerCommissionValue ?? 100));
    setTermProviderCommissionPercent(term.providerCommissionType === 'percent' ? String((term.providerCommissionValue ?? 50) / 100) : '0.5');
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
      const feeVal = termCustomerFeeType === 'percent'
        ? Math.round(parseFloat(termCustomerFeePercent || '0') * 100)
        : termCustomerFeeValue;
      const commVal = termProviderCommissionType === 'percent'
        ? Math.round(parseFloat(termProviderCommissionPercent || '0') * 100)
        : termProviderCommissionValue;

      const saved = await invoke<EpayTerminal>('epay:saveTerminal', {
        id: editingTerminalId || undefined,
        name: termName.trim(),
        provider: termProvider,
        terminalCode: termCode.trim() || undefined,
        balancePiasters: termBalancePiasters,
        lowBalanceAlertPiasters: termAlertPiasters,
        customerFeeType: termCustomerFeeType,
        customerFeeValue: feeVal,
        providerCommissionType: termProviderCommissionType,
        providerCommissionValue: commVal,
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
    <div className="flex flex-col h-full w-full bg-canvas text-ink select-none overflow-y-auto" dir="rtl">
      {/* 1. Top Header Bar */}
      <header className="bg-surface border-b border-line px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-paid-soft text-paid border border-paid-border flex items-center justify-center shrink-0 shadow-2xs">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-ink-muted">خدمات وماكينات الدفع</span>
              <span className="text-ink-muted/40 font-bold">/</span>
              <h1 className="text-base sm:text-lg font-black text-ink m-0">
                {activeTab === 'pos' && 'تنفيذ عملية جديدة'}
                {activeTab === 'terminals' && 'أرصدة وماكينات الدفع'}
                {activeTab === 'history' && 'سجل العمليات والإيصالات'}
                {activeTab === 'analytics' && 'التحليلات والأرباح المستقلة'}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-ink-muted border border-line">
                SuperPay / فوري / أمان
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5 font-medium">
              {activeTab === 'pos' && 'شحن رصيد، فواتير، وتحويل وسحب محافظ إلكترونية بنظام مالي مستقل'}
              {activeTab === 'terminals' && 'متابعة أرصدة ماكينات الدفع وتغذية الخزينة'}
              {activeTab === 'history' && 'أرشيف العمليات المنفذة وسجلات الإيصالات'}
              {activeTab === 'analytics' && 'تقارير أرباح وعمولات الخدمات الإلكترونية مفصولة عن بضاعة المحل'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 bg-surface hover:bg-surface-2 border border-line rounded-xl text-ink-muted hover:text-ink transition-colors shadow-2xs cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* 2. Top Summary 4-KPI Cards (Displayed only on Terminals tab for authorized users) */}
      {activeTab === 'terminals' && canAccessTerminals && (
        <section className="px-4 sm:px-6 pt-3.5 shrink-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: إجمالي رصيد الماكينات */}
            <div className="bg-surface rounded-xl border border-line p-3 flex items-center justify-between shadow-2xs hover:border-paid/40 transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted font-bold block mb-0.5 truncate">إجمالي رصيد الماكينات المتوفر</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-paid tabular-nums tracking-tight">
                    {formatArabicCurrency(analytics?.totalTerminalsBalancePiasters || 0)}
                  </span>
                </div>
                <span className="text-[10px] text-paid font-medium block mt-0.5">جاهز للشحن والتحويل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-paid-soft border border-paid-border flex items-center justify-center text-paid shadow-2xs shrink-0">
                <Wallet className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 2: صافي الربح */}
            <div className="bg-surface rounded-xl border border-line p-3 flex items-center justify-between shadow-2xs hover:border-brand/40 transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted font-bold block mb-0.5 truncate">صافي أرباح الخدمات</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-brand tabular-nums tracking-tight">
                    {formatArabicCurrency(analytics?.totalNetProfitPiasters || 0)}
                  </span>
                </div>
                <span className="text-[10px] text-brand font-medium block mt-0.5">عمولات ورسوم المحل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center text-brand shadow-2xs shrink-0">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 3: حجم المعاملات */}
            <div className="bg-surface rounded-xl border border-line p-3 flex items-center justify-between shadow-2xs hover:border-line-hover transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted font-bold block mb-0.5 truncate">حجم المعاملات الإجمالي</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-ink tabular-nums tracking-tight">
                    {formatArabicCurrency(analytics?.totalVolumePiasters || 0)}
                  </span>
                </div>
                <span className="text-[10px] text-ink-muted block mt-0.5">إجمالي المبالغ المنفذة</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-ink-muted shadow-2xs shrink-0">
                <Layers className="w-4.5 h-4.5" />
              </div>
            </div>

            {/* Card 4: عدد العمليات */}
            <div className="bg-surface rounded-xl border border-line p-3 flex items-center justify-between shadow-2xs hover:border-line-hover transition-colors">
              <div className="min-w-0">
                <span className="text-[11px] text-ink-muted font-bold block mb-0.5 truncate">العمليات الناجحة</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-ink tabular-nums tracking-tight">
                    {analytics?.totalTransactionsCount || 0}
                  </span>
                  <span className="text-xs font-bold text-ink-muted">عملية</span>
                </div>
                <span className="text-[10px] text-paid font-medium block mt-0.5">معاملات مكتملة بالكامل</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-ink-muted shadow-2xs shrink-0">
                <Receipt className="w-4.5 h-4.5" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Notifications Alert Banner */}
      {/* Notifications */}
      {errorMsg && (
        <div className="bg-danger/10 border-b border-danger/20 px-6 py-2.5 text-danger text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button 
            type="button"
            onClick={() => setErrorMsg(null)} 
            className="p-1 text-danger/70 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-paid-soft border-b border-paid-border px-6 py-2.5 text-paid text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-paid shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSuccessMsg(null)} 
            className="p-1 text-paid/70 hover:text-paid hover:bg-paid/10 rounded-lg transition-colors cursor-pointer"
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
            <div className="lg:col-span-7 bg-surface rounded-2xl border border-line p-5 sm:p-6 flex flex-col gap-5 shadow-2xs">
              {/* Step 1: Terminal Selection */}
              <div>
                <label className="text-xs font-bold text-ink-muted block mb-2">
                  1. اختيار ماكينة الدفع (Terminal)
                </label>
                {terminals.length === 0 ? (
                  <div className="p-4 bg-warn/10 border border-warn/30 rounded-xl text-warn text-xs font-bold flex items-center justify-between">
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
                              ? 'border-brand bg-brand-soft ring-2 ring-brand/20 shadow-2xs'
                              : 'border-line hover:border-line-hover bg-surface hover:bg-surface-2'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-ink">{term.name}</span>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-surface-2 text-ink-muted font-medium border border-line">
                              {term.terminalCode || term.provider}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-ink-muted">الرصيد المتاح:</span>
                            <span className={`text-sm font-black font-mono tabular-nums ${term.isLowBalance ? 'text-danger' : 'text-paid'}`}>
                              {formatArabicCurrency(term.balancePiasters)}
                            </span>
                          </div>
                          {term.isLowBalance && (
                            <div className="mt-1 text-[11px] text-danger font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-danger shrink-0" />
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
                <label className="text-xs font-bold text-ink-muted block mb-2">
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
                            ? 'border-brand bg-brand text-white shadow-xs'
                            : 'border-line bg-surface hover:bg-surface-2 text-ink hover:border-line-hover'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-brand'}`} />
                        <span className="text-xs font-bold leading-tight">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Transaction Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-ink-muted block mb-1">
                    اسم الخدمة المحددة
                  </label>
                  <input
                    type="text"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                    placeholder="مثال: شحن فودافون كاش 50 جنيه"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-muted block mb-1">
                    رقم الهاتف / كود المشترك / رقم الحساب
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs font-mono text-left text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                    placeholder="01012345678 أو كود العداد"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-ink-muted block mb-1">
                    اسم العميل (اختياري)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                    placeholder="اسم العميل للرجوع إليه"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-muted block mb-1">
                    رقم الإيصال / المرجع في الماكينة (Ref No)
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs font-mono text-left text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                    placeholder="مثال: 984021"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Step 4: Amounts & Fees */}
              <div className="border-t border-line pt-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-ink">
                      مبلغ الفاتورة / الرصيد المراد شحنه (يخصم من الماكينة)
                    </label>
                    <span className="text-xs font-bold font-mono text-paid tabular-nums">
                      {formatArabicCurrency(billAmountPiasters)}
                    </span>
                  </div>
                  <MoneyInput
                    valuePiasters={billAmountPiasters}
                    onChangePiasters={setBillAmountPiasters}
                    placeholder="0.00"
                    className="text-lg font-bold"
                  />
                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
                    {PRESET_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setBillAmountPiasters(amt)}
                        className="px-2.5 py-1 bg-surface-2 hover:bg-surface text-ink border border-line hover:border-line-hover rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        {formatArabicCurrency(amt, false)} ج.م
                      </button>
                    ))}
                  </div>
                </div>

                {/* Automatic Fee & Commission Status Bar */}
                <div className="mt-3 bg-surface-2 rounded-xl p-3 border border-line flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="font-bold text-ink-muted flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-paid" />
                      رسوم وعمولة الماكينة التلقائية:
                    </span>
                    <span className="font-bold text-paid bg-paid-soft px-2 py-0.5 rounded-lg border border-paid-border">
                      رسوم الزبون: {formatArabicCurrency(customerFeePiasters)}
                      {currentTerminal?.customerFeeType === 'percent'
                        ? ` (${((currentTerminal.customerFeeValue ?? 100) / 100)}%)`
                        : ' (ثابت)'}
                    </span>
                    <span className="font-bold text-brand bg-brand-soft px-2 py-0.5 rounded-lg border border-brand/20">
                      عمولة الشركة: {formatArabicCurrency(providerCommissionPiasters)}
                      {currentTerminal?.providerCommissionType === 'percent'
                        ? ` (${((currentTerminal.providerCommissionValue ?? 50) / 100)}%)`
                        : ' (ثابت)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCustomFeeOverride(!isCustomFeeOverride)}
                    className="text-xs font-bold text-brand hover:text-brand-dark cursor-pointer flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-brand-soft/60"
                  >
                    <span>{isCustomFeeOverride ? 'إلغاء التعديل اليدوي' : 'تعديل يدوي لهذه العملية'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCustomFeeOverride ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Collapsible Manual Override Section */}
                {isCustomFeeOverride && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3 p-3 bg-surface border border-line rounded-xl">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-ink-muted">
                          رسوم الخدمة من الزبون (ربح إضافي)
                        </label>
                        <span className="text-[11px] font-bold text-paid">تعديل يدوي</span>
                      </div>
                      <MoneyInput
                        valuePiasters={customerFeePiasters}
                        onChangePiasters={setCustomerFeePiasters}
                        placeholder="0.00"
                      />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {PRESET_FEES.map((fee) => (
                          <button
                            key={fee}
                            type="button"
                            onClick={() => setCustomerFeePiasters(fee)}
                            className="px-2 py-0.5 bg-paid-soft hover:bg-paid-soft/80 border border-paid-border text-paid text-[11px] font-bold rounded cursor-pointer transition-colors"
                          >
                            +{formatArabicCurrency(fee, false)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-ink-muted">
                          عمولة الشركة المضافة للمحل (من الماكينة)
                        </label>
                        <span className="text-[11px] font-bold text-brand">تعديل يدوي</span>
                      </div>
                      <MoneyInput
                        valuePiasters={providerCommissionPiasters}
                        onChangePiasters={setProviderCommissionPiasters}
                        placeholder="0.00"
                      />
                      <span className="text-[11px] text-ink-muted/70 mt-1 block font-medium">
                        المبلغ الذي تمنحه لك الشركة كعمولة وكيل لهذه العملية
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 5: Cash Destination & Notes */}
              <div className="border-t border-line pt-4">
                <label className="text-xs font-bold text-ink block mb-2">
                  أين يتم توريد المبلغ المستلم من الزبون؟
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setPaymentDestination('terminal_till')}
                    className={`cursor-pointer p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                      paymentDestination === 'terminal_till'
                        ? 'border-brand bg-brand-soft ring-1 ring-brand text-brand-dark'
                        : 'border-line bg-surface hover:bg-surface-2 text-ink hover:border-line-hover'
                    }`}
                  >
                    <Wallet className="w-5 h-5 text-brand shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold block">درج/محفظة الماكينة المنفصلة</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-paid-soft text-paid border border-paid-border">
                          الافتراضي
                        </span>
                      </div>
                      <span className="text-[10px] text-ink-muted">مفصول كلياً ومخصص لماكينات الدفع والشحن</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setPaymentDestination('cash_drawer')}
                    className={`cursor-pointer p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                      paymentDestination === 'cash_drawer'
                        ? 'border-brand bg-brand-soft ring-1 ring-brand text-brand-dark'
                        : 'border-line bg-surface hover:bg-surface-2 text-ink hover:border-line-hover'
                    }`}
                  >
                    <Landmark className="w-5 h-5 text-ink-muted shrink-0" />
                    <div>
                      <span className="text-xs font-bold block">درج كاشير المحل</span>
                      <span className="text-[10px] text-ink-muted">يدخل ضمن نقدية وعهدة الكاشير الرئيسية</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                    placeholder="ملاحظات اختيارية عن العملية..."
                  />
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Financial Summary & Confirmation */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="bg-surface rounded-2xl border border-line p-5 sm:p-6 flex flex-col gap-4 shadow-2xs sticky top-4">
                <h2 className="text-sm sm:text-base font-black text-ink border-b border-line pb-3 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-brand" />
                  ملخص حساب العملية للزبون والمحل
                </h2>

                {/* Calculation List */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-ink-muted">مبلغ الفاتورة / الرصيد:</span>
                    <span className="font-bold font-mono text-ink tabular-nums">{formatArabicCurrency(billAmountPiasters)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-ink-muted">رسوم الخدمة من العميل:</span>
                    <span className="font-bold font-mono text-paid tabular-nums">+{formatArabicCurrency(customerFeePiasters)}</span>
                  </div>

                  <div className="h-px bg-line my-1" />

                  {/* Total To Receive From Customer */}
                  <div className="p-4 rounded-xl bg-paid-soft border border-paid-border">
                    <span className="text-xs text-paid font-black block mb-1">
                      إجمالي المبلغ المطلوب تحصيله من الزبون:
                    </span>
                    <div className="text-2xl font-black font-mono text-paid tracking-tight tabular-nums">
                      {formatArabicCurrency(totalReceivedPiasters)}
                    </div>
                    <span className="text-[11px] text-paid/80 mt-1 block font-medium">
                      (قيمة الفاتورة {formatArabicCurrency(billAmountPiasters)} + الرسوم {formatArabicCurrency(customerFeePiasters)})
                    </span>
                  </div>

                  {/* Machine Balance Impact */}
                  <div className={`p-3.5 rounded-xl border ${
                    isBalanceInsufficient ? 'bg-danger/10 border-danger/30' : 'bg-surface-2 border border-line'
                  }`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-ink-muted font-medium">المخصوم من رصيد الماكينة:</span>
                      <span className="font-bold font-mono text-ink tabular-nums">{formatArabicCurrency(deductedBalancePiasters)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted font-medium">الرصيد المتبقي بعد العملية:</span>
                      <span className={`font-black font-mono tabular-nums ${
                        isBalanceInsufficient ? 'text-danger' : 'text-ink'
                      }`}>
                        {currentTerminal 
                          ? formatArabicCurrency(currentTerminal.balancePiasters - deductedBalancePiasters)
                          : '0.00 ج.م'}
                      </span>
                    </div>
                    {isBalanceInsufficient && (
                      <div className="mt-2 text-xs text-danger font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                        رصيد الماكينة غير كافٍ لإتمام العملية!
                      </div>
                    )}
                  </div>

                  {/* Net Store Profit */}
                  <div className="p-3.5 rounded-xl bg-brand-soft border border-brand/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-brand-dark block">صافي ربح المحل من هذه العملية:</span>
                        <span className="text-[11px] text-ink-muted">رسوم العميل + عمولة الشركة</span>
                      </div>
                      <span className="text-lg font-black font-mono text-brand tabular-nums">
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
                      ? 'bg-paid-soft/40 border-paid/30 hover:border-paid/50'
                      : 'bg-surface-2 border-line hover:border-line-hover'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                        autoPrintReceipt
                          ? 'bg-paid text-white shadow-xs'
                          : 'bg-surface text-ink-muted border border-line'
                      }`}
                    >
                      <Printer className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-ink block">
                        عرض إيصال العملية للطباعة فور التأكيد
                      </span>
                      <span className="text-[11px] text-ink-muted">
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
                      ? 'bg-surface-2 text-ink-muted border border-line cursor-not-allowed shadow-none'
                      : 'bg-paid hover:bg-paid-dark text-white active:scale-98'
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
                <h2 className="text-base sm:text-lg font-black text-ink">أرصدة ماكينات الدفع والخدمات</h2>
                <p className="text-xs text-ink-muted mt-0.5">متابعة دقيقة للأرصدة المتوفرة وسجل التغذية والشحن لكل ماكينة</p>
              </div>
              {canManageTerminals && (
                <button
                  type="button"
                  onClick={openNewTerminalModal}
                  className="px-3.5 py-2 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>إضافة ماكينة جديدة</span>
                </button>
              )}
            </div>

            {/* Terminals Cards Grid */}
            {terminals.length === 0 ? (
              <div className="bg-surface rounded-2xl border border-dashed border-line p-8 flex flex-col items-center justify-center text-center gap-3 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-line flex items-center justify-center text-ink-muted">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-ink">لا توجد ماكينات دفع مسجلة حتى الآن</h3>
                  <p className="text-xs text-ink-muted mt-1 max-w-sm">
                    قم بإضافة ماكينات الدفع والخدمات الإلكترونية (فوري، أمان، بي، سداد...) لبدء تسجيل العمليات وشحن الأرصدة
                  </p>
                </div>
                {canManageTerminals && (
                  <button
                    type="button"
                    onClick={openNewTerminalModal}
                    className="px-4 py-2 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 mt-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>إضافة ماكينة جديدة</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {terminals.map((term) => (
                  <div key={term.id} className="bg-surface rounded-2xl border border-line shadow-2xs p-5 flex flex-col justify-between gap-4 hover:border-brand/40 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-brand-soft text-brand border border-brand/20">
                          {term.provider.toUpperCase()}
                        </span>
                        {canManageTerminals && (
                          <button
                            type="button"
                            onClick={() => openEditTerminalModal(term)}
                            className="text-ink-muted hover:text-ink p-1 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
                            title="تعديل الماكينة"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <h3 className="font-black text-base text-ink">{term.name}</h3>
                      <p className="text-xs text-ink-muted font-mono mt-0.5">كود الماكينة: {term.terminalCode || '---'}</p>

                      <div className="mt-4 p-3.5 rounded-xl bg-surface-2 border border-line">
                        <span className="text-xs text-ink-muted block mb-1">الرصيد المتاح الحالي:</span>
                        <span className={`text-2xl font-black font-mono block tabular-nums ${term.isLowBalance ? 'text-danger' : 'text-paid'}`}>
                          {formatArabicCurrency(term.balancePiasters)}
                        </span>
                      </div>

                      {term.isLowBalance && (
                        <div className="mt-2.5 p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
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
                          setIsFundingModalOpen(true);
                        }}
                        className="w-full py-2.5 px-4 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-98 group"
                      >
                        <Zap className="w-4 h-4 text-emerald-200 fill-emerald-200/30 group-hover:fill-white group-hover:text-white transition-all group-hover:scale-110" />
                        <span>شحن وتغذية الرصيد</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Fundings History Table */}
            <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 mt-1 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-line/60">
                <div className="flex items-center gap-2">
                  <Clock className="w-4.5 h-4.5 text-brand" />
                  <h3 className="font-black text-sm sm:text-base text-ink">
                    سجل شحن وتغذية أرصدة الماكينات
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-soft text-brand">
                    {filteredFundings.length} حركة
                  </span>
                </div>
                {filteredFundings.length > 0 && (
                  <span className="text-xs text-ink-muted">
                    المعروض: {pagedFundings.length} من إجمالي {filteredFundings.length} حركة
                  </span>
                )}
              </div>

              {/* Fundings Filter Bar */}
              <div className="bg-surface-2/60 border border-line rounded-xl p-3 flex flex-wrap items-center gap-2.5">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fundingSearch}
                    onChange={(e) => setFundingSearch(e.target.value)}
                    placeholder="بحث باسم الماكينة، مصدر التغذية، أو الملاحظات..."
                    className="w-full pr-9 pl-3 py-1.5 bg-surface border border-line rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-brand focus:outline-none transition-all"
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
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-danger hover:bg-danger/10 flex items-center gap-1 transition-colors cursor-pointer"
                    title="إعادة تعيين الفلاتر"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إلغاء الفلترة</span>
                  </button>
                )}
              </div>

              {filteredFundings.length === 0 ? (
                <div className="text-center py-10 text-ink-muted text-xs bg-surface-2/30 rounded-xl border border-dashed border-line">
                  {fundings.length === 0
                    ? 'لا توجد حركات تغذية رصيد مسجلة حتى الآن.'
                    : 'لا توجد حركات شحن مطابقة لخيارات الفلترة المحددة.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line/70">
                  <table className="w-full text-xs text-right min-w-[850px] border-collapse">
                    <thead className="bg-surface-2/80 border-b border-line text-ink-muted text-[11px] font-bold select-none">
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
                    <tbody className="divide-y divide-line/60 bg-surface">
                      {pagedFundings.map((fnd) => (
                        <tr key={fnd.id} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs text-ink-muted font-mono align-middle">
                            {new Date(fnd.createdAt).toLocaleString('ar-EG')}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-bold text-ink text-xs align-middle">
                            {fnd.terminalName || fnd.terminalId}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs align-middle">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-surface-2 text-ink-muted border border-line">
                              {fnd.fundingSource === 'cash_drawer' ? 'درج كاشير المحل' :
                               fnd.fundingSource === 'bank_transfer' ? 'تحويل بنكي' : 'كاش خارجي'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-black font-mono text-paid tabular-nums align-middle">
                            +{formatArabicCurrency(fnd.amountPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-ink-muted font-mono tabular-nums align-middle">
                            {formatArabicCurrency(fnd.previousBalancePiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-black text-ink font-mono tabular-nums align-middle">
                            {formatArabicCurrency(fnd.newBalancePiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 text-xs text-ink-muted align-middle">
                            {fnd.notes || <span className="text-ink-muted/30">—</span>}
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
            <div className="bg-surface rounded-2xl border border-line shadow-2xs p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[240px] relative">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="بحث برقم الإيصال، رقم الهاتف، اسم الخدمة، أو اسم العميل..."
                    className="w-full pr-9 pl-4 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
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
                      className="px-3 py-2 rounded-xl text-xs font-bold text-danger hover:bg-danger/10 flex items-center gap-1.5 transition-colors cursor-pointer"
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
            <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4.5 h-4.5 text-brand" />
                  <h3 className="font-black text-sm sm:text-base text-ink">
                    سجل العمليات المنفذة
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-soft text-brand">
                    {filteredTransactions.length} عملية
                  </span>
                </div>
                {filteredTransactions.length > 0 && (
                  <span className="text-xs text-ink-muted">
                    المعروض: {pagedTransactions.length} من أصل {filteredTransactions.length} عملية (مرتبة من الأحدث للأقدم)
                  </span>
                )}
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-ink-muted text-xs bg-surface-2/30 rounded-xl border border-dashed border-line">
                  {transactions.length === 0
                    ? 'لا توجد عمليات دفع إلكتروني مسجلة حتى الآن.'
                    : 'لا توجد عمليات دفع إلكتروني مطابقة لخيارات الفلترة والبحث.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line/70">
                  <table className="w-full text-xs text-right min-w-[960px] border-collapse">
                    <thead className="bg-surface-2/80 border-b border-line text-ink-muted text-[11px] font-bold select-none">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap">الوقت</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الماكينة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">الخدمة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">رقم الهاتف / المرجع</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">قيمة الفاتورة</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">رسوم العميل</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">المستلم نقداً</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">صافي ربح المحل</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">وجهة النقدية</th>
                        <th className="py-3 px-3.5 whitespace-nowrap text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 bg-surface">
                      {pagedTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs text-ink-muted font-mono align-middle">
                            {new Date(tx.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-bold text-ink text-xs align-middle">
                            {tx.terminalName}
                          </td>
                          <td className="py-3.5 px-3.5 align-middle max-w-[210px]">
                            <span className="font-bold text-ink text-xs block leading-snug truncate" title={tx.serviceName}>
                              {tx.serviceName}
                            </span>
                            {tx.serviceTypeArabic && (
                              <span className="text-[10px] text-ink-muted block mt-0.5 truncate">
                                {tx.serviceTypeArabic}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-xs font-mono align-middle">
                            {tx.customerPhone ? (
                              <div className="text-ink font-semibold tracking-wide font-mono">{tx.customerPhone}</div>
                            ) : null}
                            {tx.referenceNumber ? (
                              <div className="text-[10px] text-ink-muted font-mono">مرجع: {tx.referenceNumber}</div>
                            ) : null}
                            {!tx.customerPhone && !tx.referenceNumber && (
                              <span className="text-ink-muted/30 font-mono text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-bold text-ink font-mono tabular-nums align-middle">
                            {formatArabicCurrency(tx.billAmountPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-paid font-mono tabular-nums font-bold align-middle">
                            +{formatArabicCurrency(tx.customerFeePiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap font-black text-ink font-mono tabular-nums align-middle">
                            {formatArabicCurrency(tx.totalReceivedPiasters)}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-paid-soft text-paid font-black font-mono text-xs tabular-nums border border-paid/20 shadow-2xs">
                              +{formatArabicCurrency(tx.netProfitPiasters)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                              tx.paymentDestination === 'cash_drawer'
                                ? 'bg-surface-2 text-ink-muted border-line'
                                : 'bg-brand-soft text-brand border-brand/20'
                            }`}>
                              {tx.paymentDestination === 'cash_drawer' ? 'درج المحل' : 'درج الماكينة'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap text-center align-middle">
                            <button
                              onClick={() => setReceiptTx(tx)}
                              className="p-1.5 text-ink-muted hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="طباعة إيصال"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
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
            <div className="max-w-md mx-auto my-16 p-8 bg-surface rounded-2xl border border-line text-center flex flex-col items-center gap-3.5 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-warn/10 text-warn flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warn" />
              </div>
              <h3 className="text-sm font-bold text-ink m-0">غير مصرح لك بعرض أرباح وتحليلات الماكينات</h3>
              <p className="text-xs text-ink-muted m-0 leading-relaxed">
                تحتاج لصلاحية الاطلاع على تحليلات وأرباح ماكينات الدفع والخدمات الإلكترونية من إدارة المحل.
              </p>
            </div>
          ) : (
          <div className="max-w-6xl mx-auto flex flex-col gap-5">
            <div>
              <h2 className="text-base sm:text-lg font-black text-ink">تحليلات وأرباح ماكينات الدفع والخدمات الإلكترونية</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                تقرير تحليلي مالي مستقل بالكامل؛ لا يختلط إطلاقاً بأرباح أو مخزون بضاعة المحل
              </p>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 hover:border-paid/40 transition-colors">
                <span className="text-xs font-bold text-ink-muted block mb-1">صافي أرباح الخدمات</span>
                <span className="text-2xl font-black font-mono text-paid block tabular-nums">
                  {formatArabicCurrency(analytics?.totalNetProfitPiasters || 0)}
                </span>
                <span className="text-[11px] text-ink-muted mt-1 block">
                  (رسوم العملاء + عمولات الشركات)
                </span>
              </div>

              <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 hover:border-line-hover transition-colors">
                <span className="text-xs font-bold text-ink-muted block mb-1">إجمالي رسوم الخدمة من الزبائن</span>
                <span className="text-2xl font-black font-mono text-ink block tabular-nums">
                  {formatArabicCurrency(analytics?.totalCustomerFeesPiasters || 0)}
                </span>
                <span className="text-[11px] text-ink-muted mt-1 block">
                  تحصيل مباشر من العميل نقداً
                </span>
              </div>

              <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 hover:border-line-hover transition-colors">
                <span className="text-xs font-bold text-ink-muted block mb-1">إجمالي عمولات الشركات</span>
                <span className="text-2xl font-black font-mono text-ink block tabular-nums">
                  {formatArabicCurrency(analytics?.totalCommissionsPiasters || 0)}
                </span>
                <span className="text-[11px] text-ink-muted mt-1 block">
                  عمولة الوكيل من شركات الدفع
                </span>
              </div>

              <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 hover:border-line-hover transition-colors">
                <span className="text-xs font-bold text-ink-muted block mb-1">حجم النقدية المتداولة</span>
                <span className="text-2xl font-black font-mono text-ink block tabular-nums">
                  {formatArabicCurrency(analytics?.totalVolumePiasters || 0)}
                </span>
                <span className="text-[11px] text-ink-muted mt-1 block">
                  إجمالي قيمة الفواتير والشحن
                </span>
              </div>
            </div>

            {/* Cash Flow Distribution Card */}
            <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 sm:p-6">
              <h3 className="font-black text-sm sm:text-base text-ink mb-4 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-brand" />
                توزيع النقدية المحصلة من خدمات الدفع
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-xl bg-surface-2 border border-line">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs sm:text-sm text-ink">دخلت في درج كاشير المحل</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-paid-soft text-paid border border-paid-border font-bold">عهدة الكاشير</span>
                  </div>
                  <span className="text-2xl font-black font-mono text-ink block tabular-nums">
                    {formatArabicCurrency(analytics?.totalInCashDrawerPiasters || 0)}
                  </span>
                  <p className="text-xs text-ink-muted mt-1">
                    هذه المبالغ مسجلة في درج المحل لتغطية التغذية أو التسليم عند الإغلاق اليومي.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 border border-line">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs sm:text-sm text-ink">بقيت في محفظة/درج الماكينة المنفصلة</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-brand-soft text-brand border border-brand/20 font-bold">مفصولة تماماً</span>
                  </div>
                  <span className="text-2xl font-black font-mono text-ink block tabular-nums">
                    {formatArabicCurrency(analytics?.totalInTerminalTillPiasters || 0)}
                  </span>
                  <p className="text-xs text-ink-muted mt-1">
                    هذه المبالغ معزولة ولا تؤثر على حساب درج المحل الرئيسي.
                  </p>
                </div>
              </div>
            </div>

            {/* Service Breakdown Summary */}
            <div className="bg-surface rounded-2xl border border-line shadow-2xs p-5 sm:p-6">
              <h3 className="font-black text-sm sm:text-base text-ink mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand" />
                تحليل العمليات حسب نوع الخدمة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {SERVICE_PRESETS.map((preset) => {
                  const txsForService = transactions.filter((t) => t.serviceType === preset.type);
                  const vol = txsForService.reduce((s, t) => s + (t.billAmountPiasters || 0), 0);
                  const prof = txsForService.reduce((s, t) => s + (t.netProfitPiasters || 0), 0);
                  const Icon = preset.icon;

                  return (
                    <div key={preset.type} className="p-4 rounded-xl border border-line bg-surface-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4.5 h-4.5 text-brand" />
                        <span className="font-black text-xs sm:text-sm text-ink">{preset.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                        <span>عدد العمليات:</span>
                        <span className="font-bold text-ink">{txsForService.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                        <span>إجمالي المعاملات:</span>
                        <span className="font-bold font-mono text-ink tabular-nums">{formatArabicCurrency(vol)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold text-brand mt-2 pt-2 border-t border-line">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-line" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
              <h3 className="text-base font-black text-ink flex items-center gap-2">
                <Zap className="w-5 h-5 text-paid" />
                تغذية وشحن رصيد الماكينة
              </h3>
              <button onClick={() => setIsFundingModalOpen(false)} className="text-ink-muted hover:text-ink cursor-pointer p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFundTerminal} className="flex flex-col gap-4">
              {fundingModalError && (
                <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-danger text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  <span>{fundingModalError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">الماكينة المراد تغذيتها</label>
                <CustomSelect
                  value={fundingTerminalId}
                  onChange={setFundingTerminalId}
                  options={terminalOptions}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">مبلغ التغذية (الشحن)</label>
                <MoneyInput
                  valuePiasters={fundingAmountPiasters}
                  onChangePiasters={setFundingAmountPiasters}
                  className="text-lg font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">مصدر التغذية</label>
                <CustomSelect
                  value={fundingSource}
                  onChange={(val) => setFundingSource(val as any)}
                  options={[
                    { value: 'cash_drawer', label: 'درج كاشير المحل (يخصم من نقدية الدرج)' },
                    { value: 'bank_transfer', label: 'تحويل بنكي / إنستاباي' },
                    { value: 'external_cash', label: 'كاش خارجي من صاحب المحل' },
                  ]}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={fundingNotes}
                  onChange={(e) => setFundingNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsFundingModalOpen(false)}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface border border-line text-ink rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFunding || fundingAmountPiasters <= 0}
                  className="px-4 py-2 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-line max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
              <h3 className="text-base font-black text-ink flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-paid" />
                {editingTerminalId ? 'تعديل بيانات ماكينة الدفع' : 'إضافة ماكينة دفع جديدة'}
              </h3>
              <button onClick={() => setIsTerminalModalOpen(false)} className="text-ink-muted hover:text-ink cursor-pointer p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTerminal} className="flex flex-col gap-4">
              {terminalModalError && (
                <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-danger text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  <span>{terminalModalError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">اسم الماكينة</label>
                <input
                  type="text"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  placeholder="مثال: ماكينة سوبر باي (SuperPay)"
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">الشركة المزودة (Provider)</label>
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
                <label className="text-xs font-bold text-ink-muted block mb-1">كود الماكينة أو رقم السيريال</label>
                <input
                  type="text"
                  value={termCode}
                  onChange={(e) => setTermCode(e.target.value)}
                  placeholder="مثال: SP-01 أو رقم الجهاز"
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs font-mono text-left text-ink placeholder:text-ink-muted/50 focus:bg-surface focus:border-brand focus:outline-none transition-all"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">الرصيد الافتتاحي</label>
                <MoneyInput
                  valuePiasters={termBalancePiasters}
                  onChangePiasters={setTermBalancePiasters}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">حد تنبيه انخفاض الرصيد</label>
                <MoneyInput
                  valuePiasters={termAlertPiasters}
                  onChangePiasters={setTermAlertPiasters}
                />
              </div>

              {/* Dynamic Fee & Commission Rules */}
              <div className="border-t border-line pt-3 flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-ink font-black text-xs">
                  <Sliders className="w-4 h-4 text-paid" />
                  <span>إعدادات الرسوم والعمولة الافتراضية للماكينة</span>
                </div>

                {/* 1. Customer Fee Rule */}
                <div className="bg-surface-2 p-3 rounded-xl border border-line flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink">
                      رسوم الخدمة من الزبون (ربح إضافي)
                    </label>
                    <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-line">
                      <button
                        type="button"
                        onClick={() => setTermCustomerFeeType('fixed')}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          termCustomerFeeType === 'fixed'
                            ? 'bg-paid text-white shadow-2xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        مبلغ ثابت
                      </button>
                      <button
                        type="button"
                        onClick={() => setTermCustomerFeeType('percent')}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          termCustomerFeeType === 'percent'
                            ? 'bg-paid text-white shadow-2xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        نسبة مئوية (%)
                      </button>
                    </div>
                  </div>

                  {termCustomerFeeType === 'fixed' ? (
                    <MoneyInput
                      valuePiasters={termCustomerFeeValue}
                      onChangePiasters={setTermCustomerFeeValue}
                      placeholder="0.00"
                    />
                  ) : (
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={termCustomerFeePercent}
                        onChange={(e) => setTermCustomerFeePercent(e.target.value)}
                        placeholder="مثال: 1.5"
                        className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs text-ink font-mono focus:bg-surface focus:border-brand focus:outline-none"
                      />
                      <span className="absolute left-3 text-xs font-bold text-ink-muted">%</span>
                    </div>
                  )}
                  <span className="text-[10px] text-ink-muted">
                    {termCustomerFeeType === 'fixed' 
                      ? 'مبلغ ثابت يُضاف على كل عملية بغض النظر عن قيمتها (مثال: 2.00 ج.م)' 
                      : 'نسبة تُحسب تلقائياً من قيمة الفاتورة أو الشحنة (مثال: 1.5%)'}
                  </span>
                </div>

                {/* 2. Provider Commission Rule */}
                <div className="bg-surface-2 p-3 rounded-xl border border-line flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink">
                      عمولة الشركة المضافة للمحل (من الماكينة)
                    </label>
                    <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-line">
                      <button
                        type="button"
                        onClick={() => setTermProviderCommissionType('fixed')}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          termProviderCommissionType === 'fixed'
                            ? 'bg-brand text-white shadow-2xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        مبلغ ثابت
                      </button>
                      <button
                        type="button"
                        onClick={() => setTermProviderCommissionType('percent')}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          termProviderCommissionType === 'percent'
                            ? 'bg-brand text-white shadow-2xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        نسبة مئوية (%)
                      </button>
                    </div>
                  </div>

                  {termProviderCommissionType === 'fixed' ? (
                    <MoneyInput
                      valuePiasters={termProviderCommissionValue}
                      onChangePiasters={setTermProviderCommissionValue}
                      placeholder="0.00"
                    />
                  ) : (
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={termProviderCommissionPercent}
                        onChange={(e) => setTermProviderCommissionPercent(e.target.value)}
                        placeholder="مثال: 0.5"
                        className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs text-ink font-mono focus:bg-surface focus:border-brand focus:outline-none"
                      />
                      <span className="absolute left-3 text-xs font-bold text-ink-muted">%</span>
                    </div>
                  )}
                  <span className="text-[10px] text-ink-muted">
                    {termProviderCommissionType === 'fixed'
                      ? 'مبلغ ثابت تمنحه لك الشركة كعمولة وكيل (مثال: 1.00 ج.م)'
                      : 'نسبة عمولة تمنحها لك الشركة من مبلغ العملية (مثال: 0.5%)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsTerminalModalOpen(false)}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface border border-line text-ink rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingTerminal}
                  className="px-4 py-2 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSavingTerminal ? 'جاري الحفظ...' : 'حفظ الماكينة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINT RECEIPT */}
      {receiptTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-line font-mono text-ink" dir="rtl">
            <div className="text-center border-b border-dashed border-line pb-3 mb-3">
              <div className="font-black text-base text-ink">إيصال خدمة دفع إلكتروني</div>
              <div className="text-xs text-ink-muted font-sans mt-0.5">رفيق لنقاط البيع وإدارة المتاجر</div>
              <div className="text-[11px] text-ink-muted mt-1">
                {new Date(receiptTx.createdAt).toLocaleString('ar-EG')}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-xs border-b border-dashed border-line pb-3 mb-3">
              <div className="flex justify-between">
                <span className="text-ink-muted font-sans">الماكينة:</span>
                <span className="font-bold text-ink">{receiptTx.terminalName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted font-sans">نوع الخدمة:</span>
                <span className="font-bold text-ink">{receiptTx.serviceName}</span>
              </div>
              {receiptTx.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-ink-muted font-sans">رقم الهاتف:</span>
                  <span className="font-bold text-ink">{receiptTx.customerPhone}</span>
                </div>
              )}
              {receiptTx.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-ink-muted font-sans">رقم المرجع:</span>
                  <span className="font-bold text-ink">{receiptTx.referenceNumber}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 text-xs border-b border-dashed border-line pb-3 mb-3">
              <div className="flex justify-between">
                <span className="text-ink-muted font-sans">قيمة الفاتورة / الرصيد:</span>
                <span className="font-mono tabular-nums">{formatArabicCurrency(receiptTx.billAmountPiasters)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted font-sans">رسوم الخدمة:</span>
                <span className="font-mono tabular-nums">{formatArabicCurrency(receiptTx.customerFeePiasters)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-line">
                <span className="font-sans">إجمالي المدفوع:</span>
                <span className="text-paid font-black font-mono tabular-nums">{formatArabicCurrency(receiptTx.totalReceivedPiasters)}</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-ink-muted font-sans mb-4">
              شكراً لتعاملكم معنا! احتفظ بهذا الإيصال للرجوع إليه عند الحاجة.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer active:scale-98"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الإيصال</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptTx(null)}
                className="px-4 py-2 bg-surface-2 hover:bg-surface border border-line text-ink rounded-xl text-xs font-bold font-sans transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
