import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  CreditCard, 
  FileText, 
  Edit2, 
  AlertTriangle,
  Phone,
  FileSpreadsheet,
  Download,
  Trash2,
  Loader2,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { normalizeArabicNumerals } from '../utils/money';
import { rafiqConfirm, rafiqAlert } from '../utils/dialogService';
import { exportCustomersToExcel } from '../utils/excelImport';
import type { Customer, CustomerLedgerEntry, CustomerImportPreviewResult, CustomerImportResult, CustomerBalanceVerification } from '../types/models';
import { CustomerFormModal } from './customers/CustomerFormModal';
import { CustomerPaymentModal } from './customers/CustomerPaymentModal';
import { CustomerStatementModal } from './customers/CustomerStatementModal';
import { CustomerPrintStatementModal } from './customers/CustomerPrintStatementModal';
import { CustomerImportExcelModal } from './customers/CustomerImportExcelModal';
import { PaginationBar } from '../components/PaginationBar';
import { useClientPagination } from '../utils/usePagination';
import { RafiqTableLoading } from '../components/RafiqLoadingState';
import { useSmoothLoading } from '../utils/useSmoothLoading';

export interface CustomersViewProps {
  isActive?: boolean;
}

export function CustomersView({ isActive = true }: CustomersViewProps = {}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debtors' | 'settled'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const showLoading = useSmoothLoading(isLoading, 300);
  const [archivingCustomerId, setArchivingCustomerId] = useState<string | null>(null);

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [creditLimitPiasters, setCreditLimitPiasters] = useState(100000); // 1,000 EGP default
  const [initialBalancePiasters, setInitialBalancePiasters] = useState(0);

  // Payment modal state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentAmountPiasters, setPaymentAmountPiasters] = useState(0);
  const [paymentNotes, setPaymentNotes] = useState('');

  // Statement modal state
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [statementEntries, setStatementEntries] = useState<CustomerLedgerEntry[]>([]);
  const [isStatementLoading, setIsStatementLoading] = useState(false);

  // Payment cancellation modal state (Story 68 / Feature #136)
  const [cancellingEntry, setCancellingEntry] = useState<CustomerLedgerEntry | null>(null);
  const [cancelReasonPreset, setCancelReasonPreset] = useState('سجلت بالخطأ');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);

  // Statement filtering and print state (Story 69 / Feature #43)
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [isPrintStatementOpen, setIsPrintStatementOpen] = useState(false);
  const [statementPrintMode, setStatementPrintMode] = useState<'thermal' | 'a4'>('thermal');

  // Excel Import state (Story 71 / Feature #109)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<CustomerImportPreviewResult | null>(null);
  const [importResult, setImportResult] = useState<CustomerImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Balance Verification & Audit state
  const [balanceVerification, setBalanceVerification] = useState<CustomerBalanceVerification | null>(null);
  const [isVerifyingBalance, setIsVerifyingBalance] = useState(false);
  const [isFixingBalance, setIsFixingBalance] = useState(false);
  const [auditFeedback, setAuditFeedback] = useState<string | null>(null);

  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExportCustomersToExcel = async () => {
    setIsExportingExcel(true);
    try {
      const res = await exportCustomersToExcel();
      if (res.success) {
        void rafiqAlert({
          title: 'تم تصدير سجل العملاء بنجاح',
          message: `تم تصدير ${res.count || customers.length} عميل مع حساباتهم وديونهم إلى ملف إكسل بنجاح!`,
          variant: 'success',
        });
      } else {
        void rafiqAlert({
          title: 'فشل تصدير ملف الإكسل',
          message: `تعذر تصدير ملف الإكسل: ${res.message || 'خطأ غير معروف'}`,
          variant: 'error',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'خطأ أثناء التصدير',
        message: `خطأ أثناء التصدير: ${msg}`,
        variant: 'error',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setImportError(null);
    try {
      const res = await invoke<{ success: boolean; fileName: string; base64: string }>('excel:getCustomerTemplate');
      if (res && res.base64) {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
        link.download = res.fileName || 'قالب_استيراد_العملاء_رفيق_POS.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تنزيل قالب الإكسل';
      setImportError(msg);
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setIsParsingFile(true);
    setImportError(null);
    setImportPreview(null);
    setImportResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const result = evt.target?.result as string;
          const base64 = result.split(',')[1] || result;
          const preview = await invoke<CustomerImportPreviewResult>('excel:previewCustomerImport', { base64 }, 120000);
          setImportPreview(preview);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'فشل تحليل ملف الإكسل';
          setImportError(msg);
        } finally {
          setIsParsingFile(false);
        }
      };
      reader.onerror = () => {
        setImportError('تعذر قراءة الملف من القرص');
        setIsParsingFile(false);
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر معالجة الملف';
      setImportError(msg);
      setIsParsingFile(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importPreview || importPreview.validRowsCount === 0) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const res = await invoke<CustomerImportResult>('excel:importCustomers', { rows: importPreview.rows }, 120000);
      setImportResult(res);
      await loadCustomers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل استيراد العملاء';
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };


  const resetImportModal = () => {
    setIsImportModalOpen(false);
    setImportPreview(null);
    setImportResult(null);
    setImportFileName('');
    setImportError(null);
  };

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await invoke<Customer[]>('customers:getAll', { limit: 200 });
      setCustomers(data || []);
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      void loadCustomers();
    }
  }, [isActive, loadCustomers]);

  useDataSubscription(['customers', 'sales'], () => {
    void loadCustomers();
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      void loadCustomers();
      return;
    }
    setIsLoading(true);
    try {
      const results = await invoke<Customer[]>('customers:search', { query: searchQuery });
      setCustomers(results || []);
    } catch {
      // Search fallback
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (c.id === 'cust_general_cash') return false;
      if (filterType === 'debtors') return c.balancePiasters > 0;
      if (filterType === 'settled') return c.balancePiasters <= 0;
      return true;
    });
  }, [customers, filterType]);

  // KPIs
  const totalDebtsPiasters = useMemo(() => {
    return customers.filter(c => c.id !== 'cust_general_cash').reduce((sum, c) => sum + (c.balancePiasters > 0 ? c.balancePiasters : 0), 0);
  }, [customers]);

  const debtorsCount = useMemo(() => {
    return customers.filter(c => c.id !== 'cust_general_cash' && c.balancePiasters > 0).length;
  }, [customers]);

  const totalCreditLimitPiasters = useMemo(() => {
    return customers.filter(c => c.id !== 'cust_general_cash').reduce((sum, c) => sum + c.creditLimitPiasters, 0);
  }, [customers]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedCustomers,
  } = useClientPagination(filteredCustomers, 25, `${searchQuery}_${filterType}`);

  const checkPhoneDuplicate = useCallback(async (phoneVal: string, excludeId?: string) => {
    const clean = phoneVal.trim().replace(/[\s-]/g, '');
    if (clean.length < 7) {
      setDuplicateCustomer(null);
      return;
    }
    setIsCheckingPhone(true);
    try {
      const res = await invoke<{ isDuplicate: boolean; existingCustomer: Customer | null }>('customers:checkPhone', {
        phone: clean,
        excludeId: excludeId || undefined,
      });
      if (res && res.isDuplicate && res.existingCustomer) {
        setDuplicateCustomer(res.existingCustomer);
      } else {
        setDuplicateCustomer(null);
      }
    } catch {
      setDuplicateCustomer(null);
    } finally {
      setIsCheckingPhone(false);
    }
  }, []);

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setDuplicateCustomer(null);
    setCreditLimitPiasters(100000);
    setInitialBalancePiasters(0);
    setIsAddEditOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone || '');
    setDuplicateCustomer(null);
    setCreditLimitPiasters(customer.creditLimitPiasters);
    setInitialBalancePiasters(0);
    setIsAddEditOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (duplicateCustomer && !editingCustomer) {
      const confirmed = await rafiqConfirm({
        title: 'رقم الهاتف مسجل بالفعل',
        message: `رقم الهاتف (${phone}) مسجل بالفعل للعميل "${duplicateCustomer.name}". هل تريد المتابعة وحفظ عميل جديد بنفس الرقم على أي حال؟`,
        confirmText: 'نعم، حفظ على مسؤوليتي',
        cancelText: 'تراجع وتغيير الرقم',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    try {
      const customerData: Partial<Customer> & { initialBalancePiasters?: number } = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        creditLimitPiasters,
        balancePiasters: editingCustomer ? undefined : initialBalancePiasters,
        initialBalancePiasters: editingCustomer ? undefined : initialBalancePiasters,
      };

      if (editingCustomer) {
        customerData.id = editingCustomer.id;
      }

      await invoke<Customer>('customers:save', customerData);
      setIsAddEditOpen(false);
      void loadCustomers();
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل حفظ بيانات العميل',
        message: err instanceof Error ? err.message : 'تعذر حفظ بيانات العميل',
        variant: 'error',
      });
    }
  };

  const openPaymentModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPaymentAmountPiasters(0);
    setPaymentNotes('');
    setIsPaymentOpen(true);
  };

  const handleRecordPayment = async (
    e: React.FormEvent,
    effectiveAmount?: number,
    customNotes?: string,
    paymentMethod = 'cash',
    digitalAccountId?: string
  ) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const finalAmount = effectiveAmount !== undefined ? effectiveAmount : paymentAmountPiasters;
    if (finalAmount <= 0) return;

    try {
      await invoke<Customer>('customers:recordPayment', {
        customerId: selectedCustomer.id,
        amountPiasters: finalAmount,
        notes: customNotes || paymentNotes.trim() || (paymentMethod === 'cash' ? 'سداد نقدي للدين' : `سداد دين عبر ${paymentMethod}`),
        paymentMethod,
        digitalAccountId,
      });

      setIsPaymentOpen(false);
      void loadCustomers();
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل تسجيل الدفعة',
        message: err instanceof Error ? err.message : 'تعذر تسجيل الدفعة',
        variant: 'error',
      });
    }
  };

  const openStatementModal = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setBalanceVerification(null);
    setAuditFeedback(null);
    setIsStatementOpen(true);
    setIsStatementLoading(true);

    try {
      const entries = await invoke<CustomerLedgerEntry[]>('customers:getStatement', { customerId: customer.id });
      setStatementEntries(entries || []);
    } catch {
      setStatementEntries([]);
    } finally {
      setIsStatementLoading(false);
    }
  };

  const handleVerifyBalance = async (customerId: string) => {
    setIsVerifyingBalance(true);
    setAuditFeedback(null);
    try {
      const res = await invoke<CustomerBalanceVerification>('customers:verifyBalance', { customerId });
      setBalanceVerification(res);
      if (res && res.isBalanced) {
        setAuditFeedback('تم تدقيق ومطابقة رصيد العميل بنجاح. الرصيد سليم 100% ولا يوجد أي تفاوت.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تدقيق الرصيد';
      setAuditFeedback(`خطأ أثناء التدقيق: ${msg}`);
    } finally {
      setIsVerifyingBalance(false);
    }
  };

  const handleFixBalance = async (customerId: string) => {
    const confirmed = await rafiqConfirm({
      title: 'تأكيد تصحيح وإعادة حساب الرصيد',
      message: 'سيتم إعادة حساب رصيد العميل بناءً على صافي حركات الآجل والمدفوعات المسجلة بالدفتر لتصحيح التفاوت. هل تريد المتابعة؟',
      confirmText: 'نعم، تصحيح الرصيد',
      cancelText: 'إلغاء',
      variant: 'warning',
    });
    if (!confirmed) return;

    setIsFixingBalance(true);
    setAuditFeedback(null);
    try {
      const fixedCustomer = await invoke<Customer>('customers:recalculateBalance', { customerId });
      if (fixedCustomer) {
        setSelectedCustomer(fixedCustomer);
        setCustomers((prev) => prev.map((c) => (c.id === fixedCustomer.id ? fixedCustomer : c)));
        const verifyRes = await invoke<CustomerBalanceVerification>('customers:verifyBalance', { customerId });
        setBalanceVerification(verifyRes);
        setAuditFeedback(`تمت إعادة حساب الرصيد وتصحيحه بنجاح (${(fixedCustomer.balancePiasters / 100).toFixed(2)} ج.م).`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تصحيح الرصيد';
      setAuditFeedback(`خطأ: ${msg}`);
    } finally {
      setIsFixingBalance(false);
    }
  };

  const isEntryCancelled = useCallback((entryId: string) => {
    return statementEntries.some(e => e.type === 'payment_cancel' && e.saleId === entryId);
  }, [statementEntries]);

  const filteredStatementEntries = useMemo(() => {
    return statementEntries.filter(entry => {
      const d = entry.createdAt.slice(0, 10);
      if (statementStartDate && d < statementStartDate) return false;
      if (statementEndDate && d > statementEndDate) return false;
      return true;
    });
  }, [statementEntries, statementStartDate, statementEndDate]);

  const statementPeriodSummary = useMemo(() => {
    let openingBal = 0;
    let salesDebits = 0;
    let activeCashPayments = 0;
    let refundsCredits = 0;

    if (statementStartDate) {
      // Calculate running balance strictly prior to startDate
      statementEntries.forEach(entry => {
        const d = entry.createdAt.slice(0, 10);
        if (d < statementStartDate) {
          const t = entry.type.toLowerCase();
          const amt = Math.abs(entry.amountPiasters);
          if (t === 'sale' || (t === 'opening_balance' && entry.amountPiasters >= 0) || t === 'debt_increase' || t === 'payment_cancel') {
            openingBal += amt;
          } else if (t === 'payment' || t === 'refund' || t === 'cancellation' || t === 'debt_decrease' || t === 'deposit' || (t === 'opening_balance' && entry.amountPiasters < 0)) {
            openingBal -= amt;
          }
        }
      });
    }

    filteredStatementEntries.forEach(entry => {
      const t = entry.type.toLowerCase();
      const amt = Math.abs(entry.amountPiasters);

      if (t === 'opening_balance') {
        if (!statementStartDate) {
          if (entry.amountPiasters >= 0) {
            openingBal += amt;
          } else {
            openingBal -= amt;
          }
        }
      } else if (t === 'sale' || t === 'debt_increase') {
        salesDebits += amt;
      } else if (t === 'payment') {
        if (!isEntryCancelled(entry.id)) {
          activeCashPayments += amt;
        }
      } else if (t === 'payment_cancel') {
        // Handled via !isEntryCancelled above
      } else if (t === 'refund' || t === 'debt_decrease') {
        refundsCredits += amt;
      } else if (t === 'deposit') {
        activeCashPayments += amt;
      }
    });

    const closingBal = openingBal + salesDebits - activeCashPayments - refundsCredits;

    return {
      openingBalancePiasters: openingBal,
      periodDebitsPiasters: salesDebits,
      periodCreditsPiasters: activeCashPayments,
      periodRefundsPiasters: refundsCredits,
      closingBalancePiasters: closingBal
    };
  }, [filteredStatementEntries, statementEntries, statementStartDate, isEntryCancelled]);

  const handleConfirmCancelPayment = async () => {
    if (!selectedCustomer || !cancellingEntry) return;
    setIsCancellingPayment(true);
    try {
      const reasonText = cancelReasonPreset === 'أخرى'
        ? (customCancelReason.trim() || 'سبب غير محدد')
        : cancelReasonPreset;

      const updatedCust = await invoke<Customer>('customers:cancelPayment', {
        customerId: selectedCustomer.id,
        ledgerEntryId: cancellingEntry.id,
        reason: reasonText,
        userName: 'الكاشير'
      });

      if (updatedCust) {
        setSelectedCustomer(updatedCust);
      }

      const refreshedEntries = await invoke<CustomerLedgerEntry[]>('customers:getStatement', { customerId: selectedCustomer.id });
      setStatementEntries(refreshedEntries || []);

      setCancellingEntry(null);
      setCustomCancelReason('');
      setCancelReasonPreset('سجلت بالخطأ');
      void loadCustomers();
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل إلغاء دفعة السداد',
        message: err instanceof Error ? err.message : 'تعذر إلغاء دفعة السداد',
        variant: 'error',
      });
    } finally {
      setIsCancellingPayment(false);
    }
  };

  const handleArchiveCustomer = async (cust: Customer) => {
    // 1. Block if customer has active debt
    if (cust.balancePiasters > 0) {
      void rafiqAlert({
        title: 'لا يمكن حذف العميل',
        message: `العميل "${cust.name}" عليه رصيد دين مستحق (${(cust.balancePiasters / 100).toFixed(2)} ج.م). يجب تسوية حسابه أولاً قبل الحذف.`,
        variant: 'warning',
      });
      return;
    }

    if (archivingCustomerId) return;

    // 2. Confirm
    const confirmed = await rafiqConfirm({
      title: 'تأكيد حذف العميل',
      message: `هل أنت متأكد من حذف العميل "${cust.name}"؟ سيختفي من القائمة لكن سجلاته المالية والفواتير المرتبطة ستبقى محفوظة في النظام.`,
      confirmText: 'نعم، حذف العميل',
      cancelText: 'تراجع',
      variant: 'danger',
    });
    if (!confirmed) return;

    // 3. Execute archive with optimistic update & loading state
    setArchivingCustomerId(cust.id);
    try {
      await invoke<{ success: boolean }>('customers:archive', { customerId: cust.id });
      setCustomers((prev) => prev.filter((c) => c.id !== cust.id));
      if (selectedCustomer?.id === cust.id) {
        setSelectedCustomer(null);
      }
      void loadCustomers();
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل حذف العميل',
        message: err instanceof Error ? err.message : 'تعذر حذف العميل',
        variant: 'error',
      });
    } finally {
      setArchivingCustomerId(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark p-3 sm:p-3.5 gap-2.5 sm:gap-3 select-none overflow-hidden">
      
      {/* 1. TOP SUMMARY 4-KPI CARDS (Responsive 2x2 to 4x1 Floating Grid) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
        {/* Card 1: Total Debts */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-danger/40 transition-colors">
          <div className="min-w-0">
            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5 truncate">إجمالي الفلوس اللي برة (عند الزباين)</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-danger dark:text-danger-bright tabular-nums tracking-tight">
                {(totalDebtsPiasters / 100).toFixed(2)}
              </span>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
            <span className="text-[10px] text-danger dark:text-danger-bright font-medium block mt-0.5">فلوس لسه ما اتسددتش</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 flex items-center justify-center text-danger dark:text-danger-bright shadow-2xs shrink-0">
            <CreditCard className="w-4.5 h-4.5" />
          </div>
        </div>

        {/* Card 2: Debtor count */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-warn/40 transition-colors">
          <div className="min-w-0">
            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5 truncate">الزبائن اللي عليهم فلوس</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums tracking-tight">
                {debtorsCount}
              </span>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">عميل</span>
            </div>
            <span className="text-[10px] text-warn dark:text-warn-bright font-bold block mt-0.5">عليهم حساب في النوتة</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 flex items-center justify-center text-warn dark:text-warn-bright shadow-2xs shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
        </div>

        {/* Card 3: Total Credit Limit */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-line-hover dark:hover:border-line-dark transition-colors">
          <div className="min-w-0">
            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5 truncate">أعلى حد للشكك مسموح بيه</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums tracking-tight">
                {(totalCreditLimitPiasters / 100).toFixed(2)}
              </span>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">ج.م</span>
            </div>
            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">سقف الديون المسموح</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-dark-muted shadow-2xs shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
        </div>

        {/* Card 4: Total customers count */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 flex items-center justify-between shadow-2xs hover:border-paid/40 transition-colors">
          <div className="min-w-0">
            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold block mb-0.5 truncate">إجمالي الزبائن المسجلين</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-paid dark:text-paid-bright tabular-nums tracking-tight">
                {customers.length}
              </span>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">عميل</span>
            </div>
            <span className="text-[10px] text-paid dark:text-paid-bright font-bold block mt-0.5">مسجلين في الدفتر</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-emerald-900/40 flex items-center justify-center text-paid dark:text-paid-bright shadow-2xs shrink-0">
            <Users className="w-4.5 h-4.5" />
          </div>
        </div>
      </section>

      {/* 2. TOOLBAR (Search, filter tabs, new customer button) */}
      <div className="min-h-[50px] py-1.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl px-3 sm:px-4 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap shrink-0 shadow-2xs">
        <form onSubmit={handleSearch} className="flex items-center gap-1.5 flex-1 max-w-sm">
          <div className="relative flex-1">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
              placeholder="ابحث بالاسم أو الهاتف..."
              className="w-full h-8.5 pl-8 pr-3 text-xs bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-brand/30 dark:focus:ring-brand-bright/30 focus:border-brand dark:focus:border-brand-bright text-ink dark:text-ink-dark transition-all placeholder:text-ink-muted/70 dark:placeholder:text-ink-dark-muted/70"
            />
            <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute left-2.5 top-2 pointer-events-none" />
          </div>
          <button 
            type="submit" 
            className="h-8.5 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-lg text-xs font-bold text-ink dark:text-ink-dark cursor-pointer transition-colors shadow-2xs"
          >
            بحث
          </button>
        </form>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Filters */}
          <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-lg border border-line dark:border-line-dark text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all' 
                  ? 'bg-brand-dark text-white shadow-xs' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-surface dark:hover:bg-surface-dark'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setFilterType('debtors')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filterType === 'debtors' 
                  ? 'bg-danger text-white shadow-xs' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-surface dark:hover:bg-surface-dark'
              }`}
            >
              عليهم فلوس
            </button>
            <button
              onClick={() => setFilterType('settled')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filterType === 'settled' 
                  ? 'bg-paid text-white shadow-xs' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-paid-bright hover:bg-surface dark:hover:bg-surface-dark'
              }`}
            >
              حسابهم خالص
            </button>
          </div>

          {/* Import from Excel Button */}
          <button
            type="button"
            onClick={() => { setIsImportModalOpen(true); setImportError(null); setImportResult(null); }}
            className="flex items-center gap-1.5 h-8.5 px-2.5 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            title="استيراد عملاء وديونهم الافتتاحية من ملف إكسل"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
            <span className="hidden md:inline">استيراد إكسل</span>
          </button>

          {/* Export to Excel Button */}
          <button
            type="button"
            onClick={() => void handleExportCustomersToExcel()}
            disabled={isExportingExcel || customers.length === 0}
            className="flex items-center gap-1.5 h-8.5 px-2.5 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="تصدير كشف حسابات وأرصدة العملاء والديون إلى ملف إكسل"
          >
            <Download className={`w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0 ${isExportingExcel ? 'animate-bounce' : ''}`} />
            <span className="hidden md:inline">{isExportingExcel ? 'تصدير...' : 'تصدير إكسل'}</span>
          </button>

          {/* Add Customer Button */}
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 h-8.5 px-3 bg-brand dark:bg-brand-bright dark:text-surface-dark hover:bg-brand-dark dark:hover:bg-emerald-400 active:scale-[0.98] text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>عميل جديد</span>
          </button>
        </div>
      </div>

      {/* 3. CUSTOMERS TABLE */}
      <div className="flex-1 overflow-hidden bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-2xs flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold text-[11px] sticky top-0 z-10">
                <th className="px-4">اسم العميل</th>
                <th className="px-3">رقم الهاتف</th>
                <th className="px-3">الرصيد الحالي</th>
                <th className="px-3">الحد الائتماني</th>
                <th className="px-3">تاريخ الإضافة</th>
                <th className="px-4 text-center">إجراءات الحساب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line-dark">
              {showLoading ? (
                <RafiqTableLoading
                  colSpan={6}
                  label="جاري تحميل سجل العملاء والذمم المالية..."
                  sublabel="استرجاع الحسابات ومطابقة أرصدة الديون والحدود الائتمانية"
                />
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-ink-muted dark:text-ink-dark-muted">
                    <Users className="w-10 h-10 text-ink-muted/40 dark:text-ink-dark-muted/40 mx-auto mb-2" />
                    لا يوجد عملاء مطابقين للبحث
                  </td>
                </tr>
              ) : (
                pagedCustomers.map((cust) => {
                  const hasDebt = cust.balancePiasters > 0;
                  return (
                    <tr key={cust.id} className="h-12 hover:bg-[#F1F5F4]/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                      {/* Name */}
                      <td className="px-4 font-bold text-ink dark:text-ink-dark">
                        {cust.name}
                      </td>

                      {/* Phone */}
                      <td className="px-3 text-ink-muted dark:text-ink-dark-muted font-mono tabular-nums text-xs">
                        {cust.phone ? (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                            <span>{cust.phone}</span>
                          </div>
                        ) : (
                          <span className="text-ink-muted/40 dark:text-ink-dark-muted/40">غير مسجل</span>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-mono font-bold text-xs tabular-nums ${
                          cust.balancePiasters > 0 
                            ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30' 
                            : cust.balancePiasters < 0
                            ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border'
                            : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark'
                        }`}>
                          {(Math.abs(cust.balancePiasters) / 100).toFixed(2)} ج.م
                          {cust.balancePiasters > 0 ? (
                            <span className="mr-1 text-[10px] font-sans font-bold text-danger dark:text-danger-bright">(عليه فلوس)</span>
                          ) : cust.balancePiasters < 0 ? (
                            <span className="mr-1 text-[10px] font-sans font-bold text-paid dark:text-paid-bright">(سايب فلوس)</span>
                          ) : (
                            <span className="mr-1 text-[10px] font-sans font-normal">(حسابه خالص)</span>
                          )}
                        </span>
                      </td>

                      {/* Credit Limit */}
                      <td className="px-3">
                        <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
                          <span className="text-ink dark:text-ink-dark font-bold">{(cust.creditLimitPiasters / 100).toFixed(2)} ج.م</span>
                          {cust.creditLimitPiasters > 0 && cust.balancePiasters > cust.creditLimitPiasters && (
                            <span 
                              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30"
                              title={`عدى الحد المسموح بيه بـ ${((cust.balancePiasters - cust.creditLimitPiasters) / 100).toFixed(2)} ج.م`}
                            >
                              <AlertTriangle className="w-3 h-3 text-warn dark:text-warn-bright" />
                              <span>عدى الحد</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-3 text-ink-muted dark:text-ink-dark-muted text-[11px] tabular-nums">
                        {cust.createdAt ? new Date(cust.createdAt).toLocaleDateString('ar-EG-u-nu-latn') : '---'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Settle Debt or Deposit Advance Button */}
                          <button
                            onClick={() => openPaymentModal(cust)}
                            title={hasDebt ? "تسجيل دفعة سداد دين" : "إيداع دفعة نقدية تحت الحساب (أمانات)"}
                            className="flex items-center gap-1 h-7.5 px-3 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright hover:bg-paid hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white border border-paid/20 dark:border-emerald-800/40 active:scale-95"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>{hasDebt ? 'سداد' : 'إيداع'}</span>
                          </button>

                          {/* Statement Button */}
                          <button
                            onClick={() => void openStatementModal(cust)}
                            title="كشف حساب العميل"
                            className="flex items-center gap-1 h-7.5 px-3 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-brand dark:text-brand-bright hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                            <span>كشف حساب</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => openEditModal(cust)}
                            title="تعديل بيانات العميل"
                            className="w-7.5 h-7.5 flex items-center justify-center rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors shadow-2xs cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                            <button
                              onClick={() => void handleArchiveCustomer(cust)}
                              title={hasDebt ? 'لا يمكن الحذف — يوجد دين مستحق' : archivingCustomerId === cust.id ? 'جاري الحذف...' : 'حذف العميل'}
                              disabled={hasDebt || archivingCustomerId === cust.id}
                              className={`w-7.5 h-7.5 flex items-center justify-center rounded-xl border transition-colors shadow-2xs cursor-pointer ${
                                hasDebt
                                  ? 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink-muted/40 dark:text-ink-dark-muted/40 cursor-not-allowed opacity-40'
                                  : archivingCustomerId === cust.id
                                  ? 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-danger opacity-75 cursor-wait'
                                  : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark text-danger/80 dark:text-danger-bright hover:text-white hover:bg-danger dark:hover:bg-danger hover:border-danger'
                              }`}
                            >
                              {archivingCustomerId === cust.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-danger" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Bar */}
      <PaginationBar
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={filteredCustomers.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="عميل"
      />

      {/* 4. MODALS DELEGATION */}

      {/* Modal 1: Add / Edit Customer */}
      <CustomerFormModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        editingCustomer={editingCustomer}
        name={name}
        setName={setName}
        phone={phone}
        setPhone={setPhone}
        isCheckingPhone={isCheckingPhone}
        duplicateCustomer={duplicateCustomer}
        checkPhoneDuplicate={checkPhoneDuplicate}
        creditLimitPiasters={creditLimitPiasters}
        setCreditLimitPiasters={setCreditLimitPiasters}
        initialBalancePiasters={initialBalancePiasters}
        setInitialBalancePiasters={setInitialBalancePiasters}
        onSave={(e) => void handleSaveCustomer(e)}
        onOpenStatementForDuplicate={(dupCust) => void openStatementModal(dupCust)}
      />

      {/* Modal 2: Record Payment */}
      <CustomerPaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        selectedCustomer={selectedCustomer}
        paymentAmountPiasters={paymentAmountPiasters}
        setPaymentAmountPiasters={setPaymentAmountPiasters}
        paymentNotes={paymentNotes}
        setPaymentNotes={setPaymentNotes}
        onRecordPayment={handleRecordPayment}
      />

      {/* Modal 3: Statement & Contra-Entry Cancellation */}
      <CustomerStatementModal
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        selectedCustomer={selectedCustomer}
        balanceVerification={balanceVerification}
        isVerifyingBalance={isVerifyingBalance}
        isFixingBalance={isFixingBalance}
        auditFeedback={auditFeedback}
        onVerifyBalance={handleVerifyBalance}
        onFixBalance={handleFixBalance}
        statementStartDate={statementStartDate}
        setStatementStartDate={setStatementStartDate}
        statementEndDate={statementEndDate}
        setStatementEndDate={setStatementEndDate}
        statementPeriodSummary={statementPeriodSummary}
        isStatementLoading={isStatementLoading}
        filteredStatementEntries={filteredStatementEntries}
        isEntryCancelled={isEntryCancelled}
        cancellingEntry={cancellingEntry}
        setCancellingEntry={setCancellingEntry}
        cancelReasonPreset={cancelReasonPreset}
        setCancelReasonPreset={setCancelReasonPreset}
        customCancelReason={customCancelReason}
        setCustomCancelReason={setCustomCancelReason}
        isCancellingPayment={isCancellingPayment}
        onConfirmCancelPayment={() => void handleConfirmCancelPayment()}
        onOpenPrintStatement={() => setIsPrintStatementOpen(true)}
      />

      {/* Modal 4: Print Statement Preview */}
      <CustomerPrintStatementModal
        isOpen={isPrintStatementOpen}
        onClose={() => setIsPrintStatementOpen(false)}
        selectedCustomer={selectedCustomer}
        statementStartDate={statementStartDate}
        statementEndDate={statementEndDate}
        statementPeriodSummary={statementPeriodSummary}
        filteredStatementEntries={filteredStatementEntries}
        statementPrintMode={statementPrintMode}
        setStatementPrintMode={setStatementPrintMode}
        isEntryCancelled={isEntryCancelled}
        onExecutePrint={() => window.print()}
      />

      {/* Modal 5: Excel Import Modal */}
      <CustomerImportExcelModal
        isOpen={isImportModalOpen}
        onClose={resetImportModal}
        importError={importError}
        importResult={importResult}
        isDownloadingTemplate={isDownloadingTemplate}
        onDownloadTemplate={() => void handleDownloadTemplate()}
        isParsingFile={isParsingFile}
        isImporting={isImporting}
        importFileName={importFileName}
        onFileChange={(e) => void handleFileChange(e)}
        importPreview={importPreview}
        onExecuteImport={() => void handleExecuteImport()}
      />
    </div>
  );
}
