import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  CreditCard, 
  FileText, 
  Edit2, 
  X, 
  AlertCircle,
  AlertTriangle,
  Receipt,
  Phone,
  Clock,
  RotateCcw,
  Printer,
  Calendar,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { MoneyInput } from '../components/MoneyInput';
import { normalizeArabicNumerals } from '../utils/money';
import type { Customer, CustomerLedgerEntry, CustomerImportPreviewResult, CustomerImportResult, CustomerBalanceVerification } from '../types/models';

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

  // Open Add/Edit Modal
  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setDuplicateCustomer(null);
    setCreditLimitPiasters(100000);
    setInitialBalancePiasters(0);
    setIsAddEditOpen(true);
  };

  const openEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setName(cust.name);
    setPhone(cust.phone || '');
    setDuplicateCustomer(null);
    setCreditLimitPiasters(cust.creditLimitPiasters || 0);
    setInitialBalancePiasters(cust.balancePiasters || 0);
    setIsAddEditOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (duplicateCustomer) {
      const confirmProceed = window.confirm(
        `تنبيه تكرار رقم الهاتف:\nرقم الهاتف (${phone}) مسجل بالفعل للعميل «${duplicateCustomer.name}» برصيد (${(duplicateCustomer.balancePiasters / 100).toFixed(2)} ج.م).\n\nهل تريد تأكيد حفظ عميل جديد بنفس رقم الهاتف؟`
      );
      if (!confirmProceed) return;
    }

    try {
      const payload: Partial<Customer> = {
        id: editingCustomer ? editingCustomer.id : undefined,
        name: name.trim(),
        phone: phone.trim(),
        balancePiasters: editingCustomer ? editingCustomer.balancePiasters : initialBalancePiasters,
        creditLimitPiasters: creditLimitPiasters
      };

      await invoke<Customer>('customers:save', payload);
      setIsAddEditOpen(false);
      setDuplicateCustomer(null);
      void loadCustomers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'تعذر حفظ العميل');
    }
  };

  // Open Payment Modal
  const openPaymentModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setPaymentAmountPiasters(cust.balancePiasters > 0 ? cust.balancePiasters : 0);
    setPaymentNotes('سداد نقدي من العميل');
    setIsPaymentOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || paymentAmountPiasters <= 0) return;

    try {
      await invoke<Customer>('customers:recordPayment', {
        customerId: selectedCustomer.id,
        amountPiasters: paymentAmountPiasters,
        notes: paymentNotes
      });
      setIsPaymentOpen(false);
      void loadCustomers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'تعذر تسجيل السداد');
    }
  };

  // Open Statement Modal
  const openStatementModal = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setIsStatementOpen(true);
    setIsStatementLoading(true);
    setBalanceVerification(null);
    setAuditFeedback(null);
    try {
      const data = await invoke<CustomerLedgerEntry[]>('customers:getStatement', { customerId: cust.id });
      setStatementEntries(data || []);
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
        setAuditFeedback(`الرصيد مطابق تماماً لسجل القيود (${res.totalEntriesCount} حركة مالية).`);
      } else if (res && !res.isBalanced) {
        setAuditFeedback(`تنبيه: يوجد عدم تطابق قدره ${(Math.abs(res.discrepancyPiasters) / 100).toFixed(2)} ج.م بين الرصيد المسجل ومجموع القيود.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تدقيق الرصيد';
      setAuditFeedback(`خطأ: ${msg}`);
    } finally {
      setIsVerifyingBalance(false);
    }
  };

  const handleFixBalance = async (customerId: string) => {
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

  // Check if a payment entry was cancelled by contra entry
  const isEntryCancelled = useCallback((entryId: string) => {
    return statementEntries.some(e => e.type === 'payment_cancel' && e.saleId === entryId);
  }, [statementEntries]);

  // Filter statement entries by selected date range
  const filteredStatementEntries = useMemo(() => {
    return statementEntries.filter(entry => {
      const d = entry.createdAt.slice(0, 10);
      if (statementStartDate && d < statementStartDate) return false;
      if (statementEndDate && d > statementEndDate) return false;
      return true;
    });
  }, [statementEntries, statementStartDate, statementEndDate]);

  // Calculate period opening, debits, credits, and closing balance
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

  // Confirm cancel payment via contra entry
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

      // Reload statement entries
      const refreshedEntries = await invoke<CustomerLedgerEntry[]>('customers:getStatement', { customerId: selectedCustomer.id });
      setStatementEntries(refreshedEntries || []);

      setCancellingEntry(null);
      setCustomCancelReason('');
      setCancelReasonPreset('سجلت بالخطأ');
      void loadCustomers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'تعذر إلغاء دفعة السداد');
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
          <div className="flex items-center bg-surface-2 p-0.5 rounded border border-line text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded font-medium ${filterType === 'all' ? 'bg-surface shadow-xs text-ink font-bold' : 'text-ink-muted hover:text-ink'}`}
            >
              الكل ({customers.length})
            </button>
            <button
              onClick={() => setFilterType('debtors')}
              className={`px-3 py-1 rounded font-medium ${filterType === 'debtors' ? 'bg-danger-soft text-danger font-bold' : 'text-ink-muted hover:text-ink'}`}
            >
              عليهم دين ({debtorsCount})
            </button>
            <button
              onClick={() => setFilterType('settled')}
              className={`px-3 py-1 rounded font-medium ${filterType === 'settled' ? 'bg-surface shadow-xs text-ink font-bold' : 'text-ink-muted hover:text-ink'}`}
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
                        {cust.createdAt ? new Date(cust.createdAt).toLocaleDateString('ar-EG') : '---'}
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
                            onClick={() => openStatementModal(cust)}
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

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT CUSTOMER                                              */}
      {/* ========================================================================= */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
              <span className="text-sm font-bold text-ink">
                {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد بالدفتر'}
              </span>
              <button onClick={() => setIsAddEditOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-4 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
              <div>
                <label className="block text-ink font-semibold mb-1">اسم العميل *</label>
                <input 
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: أحمد محمود"
                  className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-ink font-semibold">رقم الهاتف</label>
                  {isCheckingPhone && <span className="text-[10px] text-ink-muted">جاري فحص الرقم...</span>}
                </div>
                <input 
                  type="text"
                  value={phone}
                  onChange={(e) => {
                    const val = normalizeArabicNumerals(e.target.value);
                    setPhone(val);
                    void checkPhoneDuplicate(val, editingCustomer?.id);
                  }}
                  placeholder="مثال: 01012345678"
                  className={`w-full h-8 px-3 bg-canvas border rounded focus:outline-none text-ink font-mono ${
                    duplicateCustomer ? 'border-amber-500 bg-amber-50/20' : 'border-line focus:border-brand'
                  }`}
                />

                {duplicateCustomer && (
                  <div className="mt-1.5 p-2.5 rounded bg-amber-500/10 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-[11px] flex flex-col gap-1.5">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">تنبيه تكرار رقم الهاتف:</span> هذا الرقم مسجل بالفعل باسم{' '}
                        <strong className="underline font-bold">{duplicateCustomer.name}</strong> (الرصيد الحقيقي:{' '}
                        <span className="font-mono font-bold">{(duplicateCustomer.balancePiasters / 100).toFixed(2)} ج.م</span>).
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mr-5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddEditOpen(false);
                          openStatementModal(duplicateCustomer);
                        }}
                        className="text-[11px] text-brand font-bold hover:underline"
                      >
                        عرض كشف حساب العميل المسجل ←
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">الحد الائتماني (أقصى مديونية مسموحة)</label>
                <MoneyInput 
                  valuePiasters={creditLimitPiasters}
                  onChangePiasters={setCreditLimitPiasters}
                />
              </div>

              {!editingCustomer && (
                <div>
                  <label className="block text-ink font-semibold mb-1">الرصيد الافتتاحي (مديونية سابقة إن وجدت)</label>
                  <MoneyInput 
                    valuePiasters={initialBalancePiasters}
                    onChangePiasters={setInitialBalancePiasters}
                  />
                  <p className="text-[10px] text-ink-muted mt-1">اتركه صفر إذا كان العميل جديداً بدون ديون قديمة.</p>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 hairline-t">
                <button
                  type="button"
                  onClick={() => setIsAddEditOpen(false)}
                  className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded bg-brand text-white hover:bg-brand-container font-bold"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECORD PAYMENT                                                   */}
      {/* ========================================================================= */}
      {isPaymentOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
              <span className="text-sm font-bold text-ink flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-paid" />
                <span>تسجيل دفعة سداد دين</span>
              </span>
              <button onClick={() => setIsPaymentOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
              <div className="p-3 bg-surface-2 rounded border border-line space-y-1">
                <div className="flex justify-between text-ink">
                  <span className="font-semibold">العميل:</span>
                  <span className="font-bold">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-danger">
                  <span className="font-semibold">إجمالي الدين الحالي:</span>
                  <span className="font-bold font-mono text-[13px]">
                    {(selectedCustomer.balancePiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-ink font-semibold">المبلغ المسدد نقداً *</label>
                  {selectedCustomer.balancePiasters > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmountPiasters(selectedCustomer.balancePiasters)}
                      className="text-[11px] font-bold text-brand hover:underline"
                    >
                      سدد الكل ({(selectedCustomer.balancePiasters / 100).toFixed(2)} ج.م)
                    </button>
                  )}
                </div>
                <MoneyInput 
                  valuePiasters={paymentAmountPiasters}
                  onChangePiasters={setPaymentAmountPiasters}
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">ملاحظات السداد</label>
                <input 
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="مثال: سداد نقدي جزئي"
                  className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink"
                />
              </div>

              {paymentAmountPiasters > 0 && (
                <div className="p-2 bg-paid-soft border border-paid-border rounded text-[11px] flex justify-between text-paid font-medium">
                  <span>الرصيد بعد السداد:</span>
                  <span className="font-mono font-bold">
                    {(Math.max(0, selectedCustomer.balancePiasters - paymentAmountPiasters) / 100).toFixed(2)} ج.م
                  </span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 hairline-t">
                <button
                  type="button"
                  onClick={() => setIsPaymentOpen(false)}
                  className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={paymentAmountPiasters <= 0}
                  className="px-5 py-1.5 rounded bg-paid text-white hover:bg-emerald-700 font-bold disabled:opacity-50"
                >
                  تأكيد السداد والخصم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CUSTOMER STATEMENT (كشف حساب العميل والآجل - Stories 64, 68, 69)   */}
      {/* ========================================================================= */}
      {isStatementOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand" />
                <span className="text-sm font-bold text-ink">
                  كشف حساب العميل: {selectedCustomer.name}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-danger-soft text-danger border border-danger-border font-mono font-bold">
                  الرصيد الحالي: {(selectedCustomer.balancePiasters / 100).toFixed(2)} ج.م
                </span>
                <button
                  type="button"
                  onClick={() => void handleVerifyBalance(selectedCustomer.id)}
                  disabled={isVerifyingBalance || isFixingBalance}
                  className="h-6 px-2 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-[10.5px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                  title="مراجعة وتدقيق مطابقة الرصيد الحالي مع مجموع حركات الديون والمدفوعات"
                >
                  <ShieldCheck className={`w-3.5 h-3.5 text-brand ${isVerifyingBalance ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingBalance ? 'جاري التدقيق...' : 'تدقيق ومطابقة الرصيد'}</span>
                </button>
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Balance Verification Banner */}
            {balanceVerification && (
              <div className={`px-4 py-2 border-b flex items-center justify-between text-xs shrink-0 ${
                balanceVerification.isBalanced
                  ? 'bg-brand-soft border-brand/20 text-brand'
                  : 'bg-danger-soft border-danger/30 text-danger'
              }`}>
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {balanceVerification.isBalanced
                      ? `الرصيد سليم ومطابق 100% لسجل القيود (${balanceVerification.totalEntriesCount} حركة مالية مسجلة).`
                      : `تنبيه عدم تطابق: الرصيد المسجل (${(balanceVerification.storedBalancePiasters / 100).toFixed(2)} ج.م) يختلف عن مجموع الحركات (${(balanceVerification.calculatedBalancePiasters / 100).toFixed(2)} ج.م). الفارق: ${(Math.abs(balanceVerification.discrepancyPiasters) / 100).toFixed(2)} ج.م.`
                    }
                  </span>
                </div>
                {!balanceVerification.isBalanced && (
                  <button
                    type="button"
                    onClick={() => void handleFixBalance(selectedCustomer.id)}
                    disabled={isFixingBalance}
                    className="px-2.5 py-1 bg-danger hover:bg-danger/90 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
                  >
                    <span>{isFixingBalance ? 'جاري التصحيح...' : 'إعادة حساب وتصحيح الرصيد'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Audit Feedback Toast */}
            {auditFeedback && !balanceVerification && (
              <div className="bg-brand-soft border-b border-brand/20 px-4 py-1.5 text-xs text-brand font-semibold flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{auditFeedback}</span>
              </div>
            )}

            {/* Filter Bar & Quick Dates (Story 69 / Feature #43) */}
            <div className="bg-surface-2 hairline-b px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-ink-muted" />
                <span className="text-ink-muted text-[11px] font-semibold">تصفية التاريخ:</span>
                <input
                  type="date"
                  value={statementStartDate}
                  onChange={(e) => setStatementStartDate(e.target.value)}
                  className="h-7 px-2 bg-canvas border border-line rounded text-[11px] font-mono text-ink focus:outline-none focus:border-brand"
                />
                <span className="text-ink-muted text-[11px]">إلى</span>
                <input
                  type="date"
                  value={statementEndDate}
                  onChange={(e) => setStatementEndDate(e.target.value)}
                  className="h-7 px-2 bg-canvas border border-line rounded text-[11px] font-mono text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setStatementStartDate(''); setStatementEndDate(''); }}
                  className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    setStatementStartDate(todayStr);
                    setStatementEndDate(todayStr);
                  }}
                  className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
                >
                  اليوم
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 7);
                    setStatementStartDate(d.toISOString().slice(0, 10));
                    setStatementEndDate(new Date().toISOString().slice(0, 10));
                  }}
                  className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
                >
                  آخر 7 أيام
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(1); // 1st of current month
                    setStatementStartDate(d.toISOString().slice(0, 10));
                    setStatementEndDate(new Date().toISOString().slice(0, 10));
                  }}
                  className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
                >
                  هذا الشهر
                </button>
              </div>
            </div>

            {/* Statement Summary Strip (Story 69 / Feature #43) */}
            <div className="grid grid-cols-4 divide-x divide-x-reverse divide-line bg-surface hairline-b text-center py-2 shrink-0">
              <div className="px-2">
                <span className="block text-[10px] text-ink-muted">رصيد أول المدة</span>
                <span className="font-mono text-xs font-bold text-ink">
                  {(statementPeriodSummary.openingBalancePiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
              <div className="px-2">
                <span className="block text-[10px] text-ink-muted">مبيعات الآجل (+)</span>
                <span className="font-mono text-xs font-bold text-danger">
                  +{(statementPeriodSummary.periodDebitsPiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
              <div className="px-2">
                <span className="block text-[10px] text-ink-muted">دفعات السداد (-)</span>
                <span className="font-mono text-xs font-bold text-paid">
                  -{(statementPeriodSummary.periodCreditsPiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
              <div className="px-2">
                <span className="block text-[10px] text-ink-muted">رصيد آخر المدة</span>
                <span className="font-mono text-xs font-bold text-ink">
                  {(statementPeriodSummary.closingBalancePiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
            </div>

            {/* Statement Table */}
            <div className="flex-1 overflow-auto p-4 bg-canvas">
              {isStatementLoading ? (
                <div className="py-12 text-center text-ink-muted text-xs">
                  جاري جلب كشف الحساب من قاعدة البيانات...
                </div>
              ) : filteredStatementEntries.length === 0 ? (
                <div className="py-12 text-center text-ink-muted text-xs">
                  <AlertCircle className="w-6 h-6 text-ink-muted/40 mx-auto mb-2" />
                  لا توجد حركات مسجلة خلال الفترة المحددة.
                </div>
              ) : (
                <div className="bg-surface rounded border border-line overflow-hidden shadow-xs">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="h-8 bg-surface-2 hairline-b text-ink-muted font-bold text-[11px]">
                        <th className="px-3">التاريخ والوقت</th>
                        <th className="px-3">نوع الحركة</th>
                        <th className="px-3">المبلغ</th>
                        <th className="px-3">الرصيد بعدها</th>
                        <th className="px-3">البيان / الملاحظات</th>
                        <th className="px-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredStatementEntries.map((entry) => {
                        const isPayment = entry.type === 'payment';
                        const isSale = entry.type === 'sale';
                        const isCancel = entry.type === 'payment_cancel';
                        const alreadyCancelled = isPayment && isEntryCancelled(entry.id);

                        return (
                          <tr key={entry.id} className="h-9 hover:bg-surface-2">
                            <td className="px-3 text-ink-muted text-[11px] font-mono">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-ink-muted" />
                                <span>{new Date(entry.createdAt).toLocaleDateString('ar-EG')}</span>
                                <span className="text-[10px] text-ink-muted/70">
                                  {new Date(entry.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </td>

                            <td className="px-3">
                              {isPayment ? (
                                alreadyCancelled ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted line-through text-[10px] font-bold border border-line">
                                    سداد ملغى بقيد معاكس
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-paid-soft text-paid text-[10px] font-bold border border-paid-border">
                                    سداد نقدي
                                  </span>
                                )
                              ) : isCancel ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-soft text-warn text-[10px] font-bold border border-warn-border">
                                  <RotateCcw className="w-3 h-3" />
                                  قيد معاكس (إلغاء سداد)
                                </span>
                              ) : isSale ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger-soft text-danger text-[10px] font-bold border border-danger-border">
                                  <Receipt className="w-3 h-3" />
                                  فاتورة آجل
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted text-[10px] font-bold border border-line">
                                  رصيد افتتاحي
                                </span>
                              )}
                            </td>

                            <td className={`px-3 font-mono font-bold ${
                              alreadyCancelled ? 'text-ink-muted line-through' :
                              isPayment ? 'text-paid' :
                              isCancel ? 'text-warn' : 'text-danger'
                            }`}>
                              {isPayment ? '-' : '+'}{(entry.amountPiasters / 100).toFixed(2)} ج.م
                            </td>

                            <td className="px-3 font-mono font-semibold text-ink">
                              {(entry.balanceAfterPiasters / 100).toFixed(2)} ج.م
                            </td>

                            <td className="px-3 text-ink-muted text-[11px]">
                              {entry.notes || '---'}
                            </td>

                            <td className="px-3 text-center">
                              {isPayment && !alreadyCancelled && (
                                <button
                                  type="button"
                                  onClick={() => setCancellingEntry(entry)}
                                  className="inline-flex items-center gap-1 text-[11px] text-danger hover:text-red-700 hover:underline font-semibold"
                                  title="إلغاء دفعة السداد بقيد معاكس دون حذف"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>إلغاء الدفعة</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="h-12 bg-surface-2 hairline-t px-4 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-ink-muted">
                عدد الحركات المعروضة: {filteredStatementEntries.length}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrintStatementOpen(true)}
                  className="px-3.5 py-1.5 rounded bg-brand text-white text-xs font-bold hover:bg-brand-container flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة كشف الحساب</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsStatementOpen(false)}
                  className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CANCEL PAYMENT CONFIRMATION (Story 68 / Feature #136)            */}
      {/* ========================================================================= */}
      {cancellingEntry && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-2xl border border-line w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-danger-soft hairline-b px-4 flex items-center justify-between shrink-0 text-danger font-bold text-sm">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                <span>إلغاء دفعة سداد (قيد معاكس)</span>
              </div>
              <button onClick={() => setCancellingEntry(null)} className="text-danger hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="p-3 bg-surface-2 rounded border border-line space-y-1.5">
                <div className="flex justify-between text-ink">
                  <span className="text-ink-muted font-medium">العميل:</span>
                  <span className="font-bold">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-ink">
                  <span className="text-ink-muted font-medium">مبلغ الدفعة المراد إلغاؤها:</span>
                  <span className="font-bold font-mono text-danger text-[13px]">
                    {(cancellingEntry.amountPiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
                <div className="flex justify-between text-ink">
                  <span className="text-ink-muted font-medium">تاريخ الدفعة:</span>
                  <span className="font-mono text-[11px]">
                    {new Date(cancellingEntry.createdAt).toLocaleString('ar-EG')}
                  </span>
                </div>
              </div>

              {/* Accounting explanation alert */}
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded flex items-start gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div className="text-[11px] leading-relaxed">
                  <strong>قيد محاسبي معاكس:</strong> لن يتم حذف أي سجل من قاعدة البيانات، بل سيتم تسجيل قيد معاكس يُعيد رصيد دين العميل كما كان فوراً (
                  <span className="font-bold font-mono">
                    {((selectedCustomer.balancePiasters + cancellingEntry.amountPiasters) / 100).toFixed(2)} ج.م
                  </span>
                  ).
                </div>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">سبب إلغاء الدفعة *</label>
                <select
                  value={cancelReasonPreset}
                  onChange={(e) => setCancelReasonPreset(e.target.value)}
                  className="w-full h-8 px-2 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink text-xs mb-2"
                >
                  <option value="سجلت بالخطأ">سجلت بالخطأ</option>
                  <option value="سجلت بمبلغ خاطئ">سجلت بمبلغ خاطئ</option>
                  <option value="سجلت لحساب عميل آخر بالخطأ">سجلت لحساب عميل آخر بالخطأ</option>
                  <option value="شيك أو تحويل مرتجع بدون رصيد">شيك أو تحويل مرتجع بدون رصيد</option>
                  <option value="أخرى">سبب آخر...</option>
                </select>

                {cancelReasonPreset === 'أخرى' && (
                  <input
                    type="text"
                    value={customCancelReason}
                    onChange={(e) => setCustomCancelReason(e.target.value)}
                    placeholder="اكتب سبب الإلغاء بالتفصيل..."
                    className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink text-xs"
                    autoFocus
                  />
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 hairline-t">
                <button
                  type="button"
                  onClick={() => setCancellingEntry(null)}
                  disabled={isCancellingPayment}
                  className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancelPayment}
                  disabled={isCancellingPayment}
                  className="px-5 py-1.5 rounded bg-danger text-white hover:bg-red-700 font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isCancellingPayment ? 'جاري الإلغاء...' : 'تأكيد إلغاء السداد'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PRINTABLE CUSTOMER STATEMENT (Story 69 / Feature #43)            */}
      {/* ========================================================================= */}
      {isPrintStatementOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-2xl border border-line w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header with Mode Toggle & Actions */}
            <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-brand" />
                <span className="text-sm font-bold text-ink">معاينة طباعة كشف الحساب</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded border border-line bg-canvas p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setStatementPrintMode('thermal')}
                    className={`px-2.5 py-1 rounded font-semibold text-[11px] ${
                      statementPrintMode === 'thermal' ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted'
                    }`}
                  >
                    حراري (80 مم)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatementPrintMode('a4')}
                    className={`px-2.5 py-1 rounded font-semibold text-[11px] ${
                      statementPrintMode === 'a4' ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted'
                    }`}
                  >
                    ورق كبير (A4)
                  </button>
                </div>

                <button onClick={() => setIsPrintStatementOpen(false)} className="text-ink-muted hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Preview Sheet */}
            <div className="flex-1 overflow-y-auto p-4 bg-canvas flex justify-center">
              <div
                className={`bg-white text-black p-5 shadow-md border border-neutral-300 font-sans ${
                  statementPrintMode === 'thermal' ? 'w-[320px] text-xs' : 'w-full text-sm'
                }`}
              >
                {/* Store Header */}
                <div className="text-center pb-3 border-b border-black mb-3">
                  <h2 className="text-base font-extrabold tracking-wide mb-0.5">رفيق لنقاط البيع والسوبرماركت</h2>
                  <p className="text-[11px] text-neutral-600 font-semibold">كشف حساب عميل تفصيلي</p>
                  <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                    تاريخ الاستخراج: {new Date().toLocaleString('ar-EG')}
                  </p>
                </div>

                {/* Customer Details Box */}
                <div className="bg-neutral-50 p-2.5 rounded border border-neutral-200 text-xs mb-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-neutral-600">اسم العميل:</span>
                    <span className="font-bold">{selectedCustomer.name}</span>
                  </div>
                  {selectedCustomer.phone && (
                    <div className="flex justify-between">
                      <span className="font-semibold text-neutral-600">رقم الهاتف:</span>
                      <span className="font-mono">{selectedCustomer.phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-semibold text-neutral-600">الفترة:</span>
                    <span className="font-semibold">
                      {statementStartDate ? `من ${statementStartDate} ` : 'من بداية التعامل '}
                      {statementEndDate ? `إلى ${statementEndDate}` : 'حتى تاريخه'}
                    </span>
                  </div>
                </div>

                {/* Financial Period Summary Strip */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-3 pb-2 border-b border-neutral-300">
                  <div className="p-1.5 bg-neutral-100 rounded">
                    <span className="block text-[10px] text-neutral-600">رصيد أول المدة:</span>
                    <span className="font-bold font-mono">
                      {(statementPeriodSummary.openingBalancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                  <div className="p-1.5 bg-neutral-100 rounded">
                    <span className="block text-[10px] text-neutral-600">الرصيد الختامي:</span>
                    <span className="font-bold font-mono text-neutral-900">
                      {(statementPeriodSummary.closingBalancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                </div>

                {/* Operations Table */}
                <table className="w-full text-right text-[11px] mb-4">
                  <thead>
                    <tr className="border-b-2 border-neutral-800 text-[10px] font-bold">
                      <th className="pb-1">التاريخ</th>
                      <th className="pb-1">البيان</th>
                      <th className="pb-1 text-center">المبلغ</th>
                      <th className="pb-1 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {filteredStatementEntries.map((entry) => {
                      const isPayment = entry.type === 'payment';
                      const isCancel = entry.type === 'payment_cancel';
                      const alreadyCancelled = isPayment && isEntryCancelled(entry.id);

                      return (
                        <tr key={entry.id} className="py-1">
                          <td className="py-1 text-[10px] font-mono text-neutral-600">
                            {new Date(entry.createdAt).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="py-1 font-medium">
                            {alreadyCancelled ? 'سداد (ملغى بقيد معاكس)' :
                             isPayment ? 'سداد نقدي' :
                             isCancel ? 'قيد معاكس (إلغاء دفعة)' :
                             entry.type === 'sale' ? 'فاتورة آجل' : 'رصيد افتتاحي'}
                          </td>
                          <td className={`py-1 text-center font-mono font-bold ${
                            alreadyCancelled ? 'line-through text-neutral-400' :
                            isPayment ? 'text-neutral-800' : 'text-neutral-900'
                          }`}>
                            {isPayment ? '-' : '+'}{(entry.amountPiasters / 100).toFixed(2)}
                          </td>
                          <td className="py-1 text-left font-mono font-semibold">
                            {(entry.balanceAfterPiasters / 100).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Signatures */}
                <div className="pt-4 border-t border-dashed border-neutral-400 grid grid-cols-2 text-center text-[10px] text-neutral-600">
                  <div>
                    <p className="mb-6 font-semibold">توقيع المستلم (العميل):</p>
                    <p>..................................</p>
                  </div>
                  <div>
                    <p className="mb-6 font-semibold">توقيع وختم المحل:</p>
                    <p>..................................</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Print Modal Footer */}
            <div className="h-12 bg-surface-2 hairline-t px-4 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-ink-muted">
                {statementPrintMode === 'thermal' ? 'مهيأ لطابعات البون 80 مم' : 'مهيأ لورق الطباعة العادي A4'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrintStatementOpen(false)}
                  className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-1.5 rounded bg-brand text-white text-xs font-bold hover:bg-brand-container flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الآن (F9)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* 9. EXCEL IMPORT MODAL (Story 71 / Feature #109 / Task 109-3) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-lg shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="h-14 px-5 bg-surface-2 hairline-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-emerald-100 flex items-center justify-center text-emerald-800">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-ink">استيراد العملاء وديونهم الافتتاحية من إكسل</h3>
                  <p className="text-[11px] text-ink-muted">نقل بيانات العملاء وأرصدة الدفتر القديم دفعة واحدة إلى النظام في ثوانٍ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetImportModal}
                className="w-7 h-7 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Error Alert */}
              {importError && (
                <div className="p-3 bg-danger-soft border border-danger/30 rounded text-xs text-danger flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Success Alert */}
              {importResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{importResult.message}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] border-t border-emerald-200/60">
                    <div>العملاء المضافون: <strong className="font-mono">{importResult.importedCount}</strong></div>
                    <div>السطور المتخطاة: <strong className="font-mono">{importResult.skippedCount}</strong></div>
                    <div>إجمالي الديون الافتتاحية: <strong className="font-mono text-emerald-800">{importResult.totalOpeningDebtsFormatted}</strong></div>
                  </div>
                </div>
              )}

              {/* Step 1: Download Template & Upload Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Download Template Box */}
                <div className="p-3.5 bg-canvas border border-line rounded-lg flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-ink flex items-center gap-1.5 mb-1">
                      <Download className="w-3.5 h-3.5 text-brand" />
                      <span>1. تحميل النموذج المعتمد</span>
                    </h4>
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                      قم بتحميل قالب الإكسل المنسق خصيصاً بنظام رفيق، والذي يحتوي على الأعمدة: اسم العميل، الهاتف، الرصيد الافتتاحي، وحد الائتمان.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    disabled={isDownloadingTemplate}
                    className="mt-3 w-full h-8 px-3 rounded bg-surface hover:bg-surface-2 border border-line text-xs font-bold text-ink flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isDownloadingTemplate ? 'جاري التحميل...' : 'تحميل نموذج العملاء (.xlsx)'}</span>
                  </button>
                </div>

                {/* Upload File Box */}
                <div className="p-3.5 bg-canvas border border-line rounded-lg flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-ink flex items-center gap-1.5 mb-1">
                      <Upload className="w-3.5 h-3.5 text-emerald-700" />
                      <span>2. رفع وتدقيق ملف الإكسل</span>
                    </h4>
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                      اختر ملف الإكسل بعد ملء بيانات العملاء. سيقوم النظام بفحص الأسماء وتفادي تكرار الهواتف وحساب مجموع الديون.
                    </p>
                  </div>
                  <label className="mt-3 cursor-pointer w-full h-8 px-3 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isParsingFile ? 'جاري فحص وتدقيق الملف...' : importFileName ? `تغيير الملف: ${importFileName}` : 'اختيار ملف الإكسل (.xlsx)'}</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      disabled={isParsingFile || isImporting}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Step 2: Preview Results (when preview is loaded) */}
              {importPreview && (
                <div className="space-y-3 pt-2">
                  {/* Stats Strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    <div className="p-2.5 bg-canvas border border-line rounded">
                      <span className="text-[10px] text-ink-muted block">إجمالي السطور بالملف</span>
                      <span className="text-base font-bold font-mono text-ink">{importPreview.totalRowsCount}</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded">
                      <span className="text-[10px] text-emerald-800 block">سطور صالحة للاستيراد</span>
                      <span className="text-base font-bold font-mono text-emerald-700">{importPreview.validRowsCount}</span>
                    </div>
                    <div className="p-2.5 bg-danger-soft/50 border border-danger/20 rounded">
                      <span className="text-[10px] text-danger block">سطور غير صالحة / أخطاء</span>
                      <span className="text-base font-bold font-mono text-danger">{importPreview.invalidRowsCount}</span>
                    </div>
                    <div className="p-2.5 bg-brand-soft border border-brand/20 rounded">
                      <span className="text-[10px] text-brand block">إجمالي الديون الافتتاحية</span>
                      <span className="text-base font-bold font-mono text-brand">{importPreview.totalOpeningDebtsFormatted}</span>
                    </div>
                  </div>

                  {/* Warning on duplicates */}
                  {importPreview.duplicatePhonesCount > 0 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>يوجد {importPreview.duplicatePhonesCount} رقم هاتف مكرر بالملف أو مسجل مسبقاً بالنظام. سيتم استبعاد الأسطر غير الصالحة تلقائياً.</span>
                    </div>
                  )}

                  {/* Preview Table */}
                  <div className="border border-line rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-surface-2 hairline-b text-ink-muted text-[11px] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-12">السطر</th>
                          <th className="px-3 py-2">اسم العميل</th>
                          <th className="px-3 py-2">رقم الهاتف</th>
                          <th className="px-3 py-2 text-center">الرصيد الافتتاحي</th>
                          <th className="px-3 py-2 text-center">حد الائتمان</th>
                          <th className="px-3 py-2">الملاحظات</th>
                          <th className="px-3 py-2 text-center">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {importPreview.rows.map((row) => (
                          <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-canvas' : 'bg-danger-soft/30'}>
                            <td className="px-3 py-1.5 font-mono text-ink-muted text-[11px]">{row.rowIndex}</td>
                            <td className="px-3 py-1.5 font-bold text-ink">{row.name || '—'}</td>
                            <td className="px-3 py-1.5 font-mono text-ink-muted">{row.phone || '—'}</td>
                            <td className="px-3 py-1.5 font-mono font-bold text-center text-ink">
                              {row.initialBalanceFormatted || '0.00 ج.م'}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-center text-ink-muted">
                              {row.creditLimitFormatted || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-ink-muted text-[11px] truncate max-w-[140px]" title={row.notes}>
                              {row.notes || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>جاهز</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft text-danger"
                                  title={row.errors.join(' | ')}
                                >
                                  <AlertCircle className="w-3 h-3" />
                                  <span>{row.errors[0] || 'خطأ'}</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="h-14 px-5 bg-surface-2 hairline-t flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={resetImportModal}
                className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2"
              >
                إغلاق
              </button>

              <div className="flex items-center gap-2">
                {importPreview && importPreview.validRowsCount > 0 && !importResult && (
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={isImporting}
                    className="px-5 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isImporting ? 'جاري الاستيراد والحفظ...' : `تأكيد واستيراد (${importPreview.validRowsCount}) عميل إلى النظام`}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
