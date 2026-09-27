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
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { normalizeArabicNumerals } from '../utils/money';
import { rafiqConfirm, rafiqAlert } from '../utils/dialogService';
import type { Customer, CustomerLedgerEntry, CustomerImportPreviewResult, CustomerImportResult, CustomerBalanceVerification } from '../types/models';
import { CustomerFormModal } from './customers/CustomerFormModal';
import { CustomerPaymentModal } from './customers/CustomerPaymentModal';
import { CustomerStatementModal } from './customers/CustomerStatementModal';
import { CustomerPrintStatementModal } from './customers/CustomerPrintStatementModal';
import { CustomerImportExcelModal } from './customers/CustomerImportExcelModal';

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debtors' | 'settled'>('all');
  const [isLoading, setIsLoading] = useState(false);

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
          const preview = await invoke<CustomerImportPreviewResult>('excel:previewCustomerImport', { base64 });
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
      const res = await invoke<CustomerImportResult>('excel:importCustomers', { rows: importPreview.rows });
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
    let active = true;
    void (async () => {
      try {
        const data = await invoke<Customer[]>('customers:getAll', { limit: 200 });
        if (active) {
          setCustomers(data || []);
        }
      } catch {
        // Offline fallback
      }
    })();
    return () => { active = false; };
  }, []);

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
      if (filterType === 'debtors') return c.balancePiasters > 0;
      if (filterType === 'settled') return c.balancePiasters <= 0;
      return true;
    });
  }, [customers, filterType]);

  // KPIs
  const totalDebtsPiasters = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.balancePiasters > 0 ? c.balancePiasters : 0), 0);
  }, [customers]);

  const debtorsCount = useMemo(() => {
    return customers.filter(c => c.balancePiasters > 0).length;
  }, [customers]);

  const totalCreditLimitPiasters = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.creditLimitPiasters, 0);
  }, [customers]);

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

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || paymentAmountPiasters <= 0) return;

    try {
      await invoke<Customer>('customers:recordPayment', {
        customerId: selectedCustomer.id,
        amountPiasters: paymentAmountPiasters,
        notes: paymentNotes.trim() || 'سداد نقدي للدين',
      });

      setIsPaymentOpen(false);
      void loadCustomers();
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل تسجيل الدفعة',
        message: err instanceof Error ? err.message : 'تعذر تسجيل الدفعة النقدية',
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
    let debits = 0;
    let credits = 0;
    filteredStatementEntries.forEach(entry => {
      const t = entry.type.toLowerCase();
      if (t === 'sale' || t === 'opening_balance' || t === 'debt_increase' || t === 'payment_cancel') {
        debits += entry.amountPiasters;
      } else if (t === 'payment' || t === 'refund' || t === 'cancellation' || t === 'debt_decrease') {
        credits += entry.amountPiasters;
      }
    });

    let priorBal = 0;
    if (statementStartDate) {
      statementEntries.forEach(entry => {
        const d = entry.createdAt.slice(0, 10);
        if (d < statementStartDate) {
          const t = entry.type.toLowerCase();
          if (t === 'sale' || t === 'opening_balance' || t === 'debt_increase' || t === 'payment_cancel') {
            priorBal += entry.amountPiasters;
          } else if (t === 'payment' || t === 'refund' || t === 'cancellation' || t === 'debt_decrease') {
            priorBal -= entry.amountPiasters;
          }
        }
      });
    }

    const currentCustomerBalance = selectedCustomer?.balancePiasters || 0;
    const closingBal = statementStartDate ? (priorBal + debits - credits) : currentCustomerBalance;

    return {
      periodDebitsPiasters: debits,
      periodCreditsPiasters: credits,
      openingBalancePiasters: priorBal,
      closingBalancePiasters: closingBal
    };
  }, [filteredStatementEntries, statementEntries, statementStartDate, selectedCustomer]);

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

  return (
    <div className="flex flex-col h-full w-full bg-canvas select-none overflow-hidden">
      
      {/* 1. TOP SUMMARY STRIP (80px height, 4 KPI cells matching design) */}
      <section className="h-[76px] bg-surface hairline-b grid grid-cols-4 divide-x divide-x-reverse divide-line shrink-0 px-4">
        {/* Cell 1: Total Debts */}
        <div className="flex flex-col justify-center px-4">
          <span className="text-[11px] text-ink-muted mb-0.5">إجمالي الديون المستحقة</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-bold font-mono text-danger">
              {(totalDebtsPiasters / 100).toFixed(2)}
            </span>
            <span className="text-[11px] text-ink-muted">ج.م</span>
          </div>
        </div>

        {/* Cell 2: Debtor count */}
        <div className="flex flex-col justify-center px-4">
          <span className="text-[11px] text-ink-muted mb-0.5">عدد العملاء المدينين</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-bold font-mono text-ink">
              {debtorsCount}
            </span>
            <span className="text-[11px] text-ink-muted">عميل عليه آجل</span>
          </div>
        </div>

        {/* Cell 3: Total Credit Limit */}
        <div className="flex flex-col justify-center px-4">
          <span className="text-[11px] text-ink-muted mb-0.5">إجمالي الحدود الائتمانية</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-bold font-mono text-ink">
              {(totalCreditLimitPiasters / 100).toFixed(2)}
            </span>
            <span className="text-[11px] text-ink-muted">ج.م</span>
          </div>
        </div>

        {/* Cell 4: Total customers count */}
        <div className="flex flex-col justify-center px-4">
          <span className="text-[11px] text-ink-muted mb-0.5">إجمالي المسجلين بالدفتر</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-bold font-mono text-brand">
              {customers.length}
            </span>
            <span className="text-[11px] text-ink-muted">عميل</span>
          </div>
        </div>
      </section>

      {/* 2. TOOLBAR (Search, filter tabs, new customer button) */}
      <div className="h-[52px] bg-surface hairline-b px-4 flex items-center justify-between shrink-0">
        <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-[340px] w-full">
          <div className="relative flex-1">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink"
            />
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-2.5" />
          </div>
          <button 
            type="submit" 
            className="h-8 px-3 bg-surface border border-line hover:bg-surface-2 rounded text-xs font-semibold text-ink"
          >
            بحث
          </button>
        </form>

        <div className="flex items-center gap-3">
          {/* Filters */}
          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-line text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-md text-[11.5px] font-bold transition-all shadow-2xs border ${
                filterType === 'all' 
                  ? 'bg-brand text-white border-brand shadow-xs' 
                  : 'bg-surface text-slate-700 border-slate-300 hover:border-brand/70 hover:text-brand hover:bg-brand-soft/40'
              }`}
            >
              الكل ({customers.length})
            </button>
            <button
              onClick={() => setFilterType('debtors')}
              className={`px-3 py-1 rounded-md text-[11.5px] font-bold transition-all shadow-2xs border ${
                filterType === 'debtors' 
                  ? 'bg-danger text-white border-danger shadow-xs' 
                  : 'bg-surface text-slate-700 border-slate-300 hover:border-danger/70 hover:text-danger hover:bg-danger-soft/40'
              }`}
            >
              عليهم دين ({debtorsCount})
            </button>
            <button
              onClick={() => setFilterType('settled')}
              className={`px-3 py-1 rounded-md text-[11.5px] font-bold transition-all shadow-2xs border ${
                filterType === 'settled' 
                  ? 'bg-paid text-white border-paid shadow-xs' 
                  : 'bg-surface text-slate-700 border-slate-300 hover:border-paid/70 hover:text-paid hover:bg-paid-soft/40'
              }`}
            >
              مسددون ({customers.length - debtorsCount})
            </button>
          </div>

          {/* Import from Excel Button (Story 71 / Feature #109) */}
          <button
            type="button"
            onClick={() => { setIsImportModalOpen(true); setImportError(null); setImportResult(null); }}
            className="flex items-center gap-1.5 h-8 px-3 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-xs font-bold shadow-xs transition-colors"
            title="استيراد عملاء وديونهم الافتتاحية من ملف إكسل"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>استيراد إكسل</span>
          </button>

          {/* Add Customer Button */}
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 h-8 px-3.5 bg-brand text-white hover:bg-brand-container rounded text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>عميل جديد</span>
          </button>
        </div>
      </div>

      {/* 3. CUSTOMERS TABLE */}
      <div className="flex-1 overflow-auto bg-canvas p-3">
        <div className="bg-surface rounded border border-line overflow-hidden shadow-xs">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="h-9 bg-surface-2 hairline-b text-ink-muted font-bold text-[11px]">
                <th className="px-4">اسم العميل</th>
                <th className="px-3">رقم الهاتف</th>
                <th className="px-3">الرصيد الحالي</th>
                <th className="px-3">الحد الائتماني</th>
                <th className="px-3">تاريخ الإضافة</th>
                <th className="px-4 text-center">إجراءات الحساب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-muted">
                    جاري تحميل دفتر العملاء...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-muted">
                    <Users className="w-8 h-8 text-ink-muted/40 mx-auto mb-2" />
                    لا يوجد عملاء مطابقين للبحث
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const hasDebt = cust.balancePiasters > 0;
                  return (
                    <tr key={cust.id} className="h-11 hover:bg-surface-2 transition-colors">
                      {/* Name */}
                      <td className="px-4 font-semibold text-ink">
                        {cust.name}
                      </td>

                      {/* Phone */}
                      <td className="px-3 text-ink-muted font-mono">
                        {cust.phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-ink-muted" />
                            <span>{cust.phone}</span>
                          </div>
                        ) : (
                          <span className="text-ink-muted/50">غير مسجل</span>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[12px] ${
                          hasDebt 
                            ? 'bg-danger-soft text-danger border border-danger-border' 
                            : 'bg-surface-2 text-ink-muted border border-line'
                        }`}>
                          {(cust.balancePiasters / 100).toFixed(2)} ج.م
                          {hasDebt && <span className="mr-1 text-[10px] font-sans font-normal">(آجل)</span>}
                        </span>
                      </td>

                      {/* Credit Limit (Story 72 / Task 110-3) */}
                      <td className="px-3">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-ink">{(cust.creditLimitPiasters / 100).toFixed(2)} ج.م</span>
                          {cust.creditLimitPiasters > 0 && cust.balancePiasters > cust.creditLimitPiasters && (
                            <span 
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-amber-100 text-amber-800 border border-amber-300"
                              title={`تجاوز الحد بمقدار ${((cust.balancePiasters - cust.creditLimitPiasters) / 100).toFixed(2)} ج.م`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>تجاوز الحد</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-3 text-ink-muted text-[11px]">
                        {cust.createdAt ? new Date(cust.createdAt).toLocaleDateString('ar-EG-u-nu-latn') : '---'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Settle Debt Button */}
                          <button
                            onClick={() => openPaymentModal(cust)}
                            disabled={!hasDebt}
                            title={hasDebt ? "تسجيل دفعة سداد نقدية" : "لا يوجد دين مستحق"}
                            className={`flex items-center gap-1 h-7 px-2 rounded text-[11px] font-semibold transition-colors ${
                              hasDebt 
                                ? 'bg-paid-soft text-paid hover:bg-paid hover:text-white border border-paid-border' 
                                : 'opacity-30 cursor-not-allowed bg-surface-2 text-ink-muted border border-line'
                            }`}
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>سداد</span>
                          </button>

                          {/* Statement Button */}
                          <button
                            onClick={() => void openStatementModal(cust)}
                            title="كشف حساب العميل"
                            className="flex items-center gap-1 h-7 px-2 rounded bg-surface border border-line text-ink hover:bg-surface-2 text-[11px] font-semibold transition-colors"
                          >
                            <FileText className="w-3 h-3 text-brand" />
                            <span>كشف حساب</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => openEditModal(cust)}
                            title="تعديل بيانات العميل"
                            className="w-7 h-7 flex items-center justify-center rounded bg-surface border border-line text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
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
        onRecordPayment={(e) => void handleRecordPayment(e)}
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
