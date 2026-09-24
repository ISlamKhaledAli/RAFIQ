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
  Receipt,
  Phone,
  Clock
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { MoneyInput } from '../components/MoneyInput';
import { normalizeArabicNumerals } from '../utils/money';
import type { Customer, CustomerLedgerEntry } from '../types/models';

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

  // Open Add/Edit Modal
  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setCreditLimitPiasters(100000);
    setInitialBalancePiasters(0);
    setIsAddEditOpen(true);
  };

  const openEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setName(cust.name);
    setPhone(cust.phone || '');
    setCreditLimitPiasters(cust.creditLimitPiasters || 0);
    setInitialBalancePiasters(cust.balancePiasters || 0);
    setIsAddEditOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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
    try {
      const data = await invoke<CustomerLedgerEntry[]>('customers:getStatement', { customerId: cust.id });
      setStatementEntries(data || []);
    } catch {
      setStatementEntries([]);
    } finally {
      setIsStatementLoading(false);
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

                      {/* Credit Limit */}
                      <td className="px-3 text-ink font-mono">
                        {(cust.creditLimitPiasters / 100).toFixed(2)} ج.م
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
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between">
              <span className="text-sm font-bold text-ink">
                {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد بالدفتر'}
              </span>
              <button onClick={() => setIsAddEditOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-4 space-y-3.5 text-xs">
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
                <label className="block text-ink font-semibold mb-1">رقم الهاتف</label>
                <input 
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(normalizeArabicNumerals(e.target.value))}
                  placeholder="مثال: 01012345678"
                  className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink font-mono"
                />
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
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between">
              <span className="text-sm font-bold text-ink flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-paid" />
                <span>تسجيل دفعة سداد دين</span>
              </span>
              <button onClick={() => setIsPaymentOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-3.5 text-xs">
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
                <label className="block text-ink font-semibold mb-1">المبلغ المسدد نقداً *</label>
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
      {/* MODAL 3: CUSTOMER STATEMENT (كشف حساب العميل والآجل)                       */}
      {/* ========================================================================= */}
      {isStatementOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
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
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Statement Table */}
            <div className="flex-1 overflow-auto p-4 bg-canvas">
              {isStatementLoading ? (
                <div className="py-12 text-center text-ink-muted text-xs">
                  جاري جلب كشف الحساب من قاعدة البيانات...
                </div>
              ) : statementEntries.length === 0 ? (
                <div className="py-12 text-center text-ink-muted text-xs">
                  <AlertCircle className="w-6 h-6 text-ink-muted/40 mx-auto mb-2" />
                  لا توجد حركات مسجلة في كشف حساب هذا العميل حتى الآن.
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {statementEntries.map((entry) => {
                        const isPayment = entry.type === 'payment';
                        const isSale = entry.type === 'sale';
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
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-paid-soft text-paid text-[10px] font-bold border border-paid-border">
                                  سداد نقدي
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

                            <td className={`px-3 font-mono font-bold ${isPayment ? 'text-paid' : 'text-danger'}`}>
                              {isPayment ? '-' : '+'}{(entry.amountPiasters / 100).toFixed(2)} ج.م
                            </td>

                            <td className="px-3 font-mono font-semibold text-ink">
                              {(entry.balanceAfterPiasters / 100).toFixed(2)} ج.م
                            </td>

                            <td className="px-3 text-ink-muted text-[11px]">
                              {entry.notes || '---'}
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
                عدد الحركات: {statementEntries.length}
              </span>
              <button
                onClick={() => setIsStatementOpen(false)}
                className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
