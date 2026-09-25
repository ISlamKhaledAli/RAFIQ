import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Banknote, 
  CreditCard, 
  UserCheck, 
  Split, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  X, 
  Printer, 
  Plus, 
  Trash2,
  ArrowRight
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Customer, SalePayment } from '../types/models';
import { formatArabicCurrency, normalizeArabicNumerals, poundsToPiasters, piastersToPounds } from '../utils/money';
import { CustomSelect } from './CustomSelect';
import { rafiqConfirm, rafiqAlert } from '../utils/dialogService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotalPiasters: number;
  discountPiasters: number;
  netTotalPiasters: number;
  selectedCustomerId?: string | null;
  customers: Customer[];
  onConfirmPayment: (paymentData: {
    paymentMethod: 'cash' | 'credit' | 'card' | 'multi';
    paidPiasters: number;
    payments: SalePayment[];
    changeDuePiasters: number;
    customerId?: string | null;
  }) => void;
  loading?: boolean;
}

export const PaymentModal = ({
  isOpen,
  onClose,
  subtotalPiasters,
  discountPiasters,
  netTotalPiasters,
  selectedCustomerId,
  customers,
  onConfirmPayment,
  loading = false,
}: PaymentModalProps) => {
  const [activeTab, setActiveTab] = useState<'cash' | 'credit' | 'card' | 'multi'>('cash');
  const [receivedInput, setReceivedInput] = useState<string>(() => piastersToPounds(netTotalPiasters).toString());
  const [receivedPiasters, setReceivedPiasters] = useState<number>(() => netTotalPiasters);
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(selectedCustomerId || null);
  const [newlyAddedCustomers, setNewlyAddedCustomers] = useState<Customer[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const localCustomers = useMemo(() => {
    return [...customers, ...newlyAddedCustomers];
  }, [customers, newlyAddedCustomers]);

  // Multi-Payment rows state
  const [splitRows, setSplitRows] = useState<Array<{ id: string; method: 'cash' | 'card' | 'credit'; amountPiasters: number }>>(() => [
    { id: '1', method: 'cash', amountPiasters: Math.round(netTotalPiasters / 2) },
    { id: '2', method: 'card', amountPiasters: netTotalPiasters - Math.round(netTotalPiasters / 2) },
  ]);

  const receivedInputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        receivedInputRef.current?.focus();
        receivedInputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const duplicateQuickCustomer = useMemo(() => {
    const clean = quickPhone.trim().replace(/[\s-]/g, '');
    if (clean.length < 7) return null;
    return localCustomers.find(c => (c.phone || '').trim().replace(/[\s-]/g, '') === clean) || null;
  }, [quickPhone, localCustomers]);

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim() || quickSaving) return;
    setQuickSaving(true);
    try {
      const saved = await invoke<Customer>('customers:save', {
        name: quickName.trim(),
        phone: quickPhone.trim(),
        balancePiasters: 0,
        creditLimitPiasters: 100000,
      });
      if (saved) {
        setNewlyAddedCustomers(prev => [...prev, saved]);
        setCurrentCustomerId(saved.id);
        setShowQuickAdd(false);
        setQuickName('');
        setQuickPhone('');
      }
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل حفظ العميل',
        message: err instanceof Error ? err.message : 'تعذر حفظ العميل',
        variant: 'error',
      });
    } finally {
      setQuickSaving(false);
    }
  };

  if (!isOpen) return null;

  const selectedCustomer = localCustomers.find((c) => c.id === currentCustomerId);

  // Calculations for Single Cash payment
  const changeDuePiasters = Math.max(0, receivedPiasters - netTotalPiasters);
  const isShortPayment = receivedPiasters < netTotalPiasters;
  const shortAmountPiasters = Math.max(0, netTotalPiasters - receivedPiasters);

  // Calculations for Multi/Split payment
  const splitTotalPaid = splitRows.reduce((sum, r) => sum + r.amountPiasters, 0);
  const splitRemainingPiasters = netTotalPiasters - splitTotalPaid;

  const handleReceivedChange = (raw: string) => {
    const normalized = normalizeArabicNumerals(raw);
    setReceivedInput(normalized);
    const piasters = poundsToPiasters(normalized);
    setReceivedPiasters(piasters);
  };

  const setPresetReceived = (amountPounds: number) => {
    const piasters = amountPounds * 100;
    setReceivedPiasters(piasters);
    setReceivedInput(amountPounds.toString());
    receivedInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      void handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (activeTab === 'cash') {
      if (isShortPayment) {
        const proceed = await rafiqConfirm({
          title: 'تنبيه نقص المبلغ المدفوع',
          message: `المبلغ المدفوع (${formatArabicCurrency(receivedPiasters)}) أقل من قيمة الفاتورة (${formatArabicCurrency(netTotalPiasters)}).\n\nهل تريد المتابعة وإتمام العملية؟`,
          confirmText: 'نعم، إتمام الدفع',
          cancelText: 'تراجع وتعديل المبلغ',
          variant: 'warning',
        });
        if (!proceed) {
          return;
        }
      }

      const payments: SalePayment[] = [
        {
          amountPiasters: Math.min(receivedPiasters, netTotalPiasters),
          method: 'cash',
        },
      ];

      onConfirmPayment({
        paymentMethod: 'cash',
        paidPiasters: Math.min(receivedPiasters, netTotalPiasters),
        payments,
        changeDuePiasters,
        customerId: currentCustomerId,
      });
    } else if (activeTab === 'card') {
      const payments: SalePayment[] = [
        {
          amountPiasters: netTotalPiasters,
          method: 'card',
        },
      ];

      onConfirmPayment({
        paymentMethod: 'card',
        paidPiasters: netTotalPiasters,
        payments,
        changeDuePiasters: 0,
        customerId: currentCustomerId,
      });
    } else if (activeTab === 'credit') {
      if (!currentCustomerId) {
        await rafiqAlert({
          title: 'تنبيه البيع بالآجل',
          message: 'يجب اختيار عميل من دفتر الآجل لإتمام البيع بالآجل!',
          variant: 'warning',
        });
        return;
      }

      if (selectedCustomer) {
        const isExceeded = selectedCustomer.creditLimitPiasters > 0 && 
          (selectedCustomer.balancePiasters + netTotalPiasters > selectedCustomer.creditLimitPiasters);
        if (isExceeded) {
          const confirmProceed = await rafiqConfirm({
            title: 'تحذير تجاوز الحد الائتماني للعميل',
            message: `دين العميل الحالي: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nإجمالي الدين بعد الفاتورة: ${formatArabicCurrency(selectedCustomer.balancePiasters + netTotalPiasters)}\nالحد الائتماني المسموح به: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nهل تريد تأكيد إتمام البيع بالآجل وتجاوز الحد الائتماني؟`,
            confirmText: 'متابعة وتجاوز الحد',
            cancelText: 'إلغاء العملية',
            variant: 'danger',
          });
          if (!confirmProceed) return;
        }
      }

      const payments: SalePayment[] = [
        {
          amountPiasters: 0,
          method: 'credit',
        },
      ];

      onConfirmPayment({
        paymentMethod: 'credit',
        paidPiasters: 0,
        payments,
        changeDuePiasters: 0,
        customerId: currentCustomerId,
      });
    } else if (activeTab === 'multi') {
      if (splitRemainingPiasters !== 0) {
        await rafiqAlert({
          title: 'عدم تطابق مبالغ الدفع المجزأ',
          message: `مجموع الدفعات المجزأة (${formatArabicCurrency(splitTotalPaid)}) يجب أن يساوي تماماً إجمالي الفاتورة (${formatArabicCurrency(netTotalPiasters)})!\nالفارق المتبقي: ${formatArabicCurrency(Math.abs(splitRemainingPiasters))}`,
          variant: 'warning',
        });
        return;
      }

      // If any split row is 'credit' and no customer selected
      const hasCreditRow = splitRows.some((r) => r.method === 'credit');
      if (hasCreditRow && !currentCustomerId) {
        await rafiqAlert({
          title: 'تنبيه البيع بالآجل',
          message: 'يوجد جزء مدفوع بالآجل! يجب اختيار عميل لتسجيل المتبقي عليه في حسابه.',
          variant: 'warning',
        });
        return;
      }

      if (hasCreditRow && selectedCustomer) {
        const creditPart = splitRows
          .filter((r) => r.method === 'credit')
          .reduce((sum, r) => sum + r.amountPiasters, 0);
        const isExceeded = selectedCustomer.creditLimitPiasters > 0 && 
          (selectedCustomer.balancePiasters + creditPart > selectedCustomer.creditLimitPiasters);
        if (isExceeded) {
          const confirmProceed = await rafiqConfirm({
            title: 'تحذير تجاوز الحد الائتماني للعميل',
            message: `دين العميل الحالي: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nالجزء الآجل في هذه الفاتورة: ${formatArabicCurrency(creditPart)}\nإجمالي الدين بعد هذه العملية: ${formatArabicCurrency(selectedCustomer.balancePiasters + creditPart)}\nالحد الائتماني المسموح به: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nهل تريد تأكيد إتمام الدفع المختلط وتجاوز الحد الائتماني؟`,
            confirmText: 'متابعة وتجاوز الحد',
            cancelText: 'إلغاء العملية',
            variant: 'danger',
          });
          if (!confirmProceed) return;
        }
      }

      const payments: SalePayment[] = splitRows.map((r) => ({
        amountPiasters: r.amountPiasters,
        method: r.method,
      }));

      const totalCashAndCardPaid = splitRows
        .filter((r) => r.method !== 'credit')
        .reduce((sum, r) => sum + r.amountPiasters, 0);

      onConfirmPayment({
        paymentMethod: 'multi',
        paidPiasters: totalCashAndCardPaid,
        payments,
        changeDuePiasters: 0,
        customerId: currentCustomerId,
      });
    }
  };

  // Quick cash buttons generator (Exact, next 50, next 100, 200)
  const netPounds = piastersToPounds(netTotalPiasters);
  const quickPresets = [
    netPounds,
    Math.ceil(netPounds / 50) * 50 || 50,
    Math.ceil(netPounds / 100) * 100 || 100,
    200,
  ].filter((val, idx, arr) => val >= netPounds && arr.indexOf(val) === idx);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden text-ink">
        {/* Header */}
        <div className="h-[60px] px-5 bg-surface-2 hairline-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-brand-soft text-brand flex items-center justify-center shadow-xs">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-ink leading-tight m-0">
                نافذة الدفع وحساب الباقي (Checkout & Change)
              </h2>
              <p className="text-[11px] text-ink-muted m-0">
                ميزة #27: حساب الباقي الفوري، الدفع المتعدد، وتسجيل الفاتورة ذرياً بضغطة زر
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* 1. Grand Total Display Banner */}
          <div className="bg-brand-soft/30 border-2 border-brand/40 rounded-xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink-muted">المبلغ الإجمالي المطلوب سداده:</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-mono font-black text-brand tabular-nums tracking-tight">
                  {formatArabicCurrency(netTotalPiasters)}
                </span>
              </div>
            </div>

            <div className="text-left font-mono text-xs text-ink-muted border-r border-line pr-4 flex flex-col gap-1">
              <div>المجموع الفرعي: {formatArabicCurrency(subtotalPiasters)}</div>
              {discountPiasters > 0 && (
                <div className="text-danger font-bold">الخصم: -{formatArabicCurrency(discountPiasters)}</div>
              )}
            </div>
          </div>

          {/* 2. Payment Method Tabs */}
          <div className="flex items-center gap-2 bg-surface-2 p-1.5 rounded-lg border border-line">
            <button
              type="button"
              onClick={() => setActiveTab('cash')}
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'cash'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              <Banknote className="w-4 h-4" />
              <span>نقدي (كاش)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('card')}
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'card'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>فيزا / كارت</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('credit')}
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'credit'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>آجل (على الحساب)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('multi')}
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'multi'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              <Split className="w-4 h-4" />
              <span>دفع مجزأ / متعدد</span>
            </button>
          </div>

          {/* 3. Tab Contents */}
          {/* TAB: CASH */}
          {activeTab === 'cash' && (
            <div className="flex flex-col gap-4 bg-surface p-4 rounded-lg border border-line">
              {/* Received Input & Quick Presets */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-ink flex items-center justify-between">
                  <span>المبلغ المستلم من العميل (المدفوع نقداً):</span>
                  <span className="text-[11px] text-ink-muted font-normal">يمكنك الضغط على الأزرار السريعة أو الكتابة</span>
                </label>

                <div className="relative">
                  <input
                    ref={receivedInputRef}
                    type="text"
                    value={receivedInput}
                    onChange={(e) => handleReceivedChange(e.target.value)}
                    className="w-full h-[52px] px-4 text-2xl font-mono font-black text-brand bg-surface-2 border-2 border-brand/50 focus:border-brand rounded-lg text-right pl-16 focus:outline-hidden"
                    placeholder="0.00"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm text-ink-muted">
                    ج.م
                  </div>
                </div>

                {/* Quick Presets Buttons (Feature #27 / Task 27-2) */}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setPresetReceived(netPounds)}
                    className="py-1.5 px-3 rounded text-xs font-bold bg-brand-soft text-brand hover:bg-brand hover:text-white border border-brand/30 transition-colors"
                  >
                    المبلغ بالظبط ({formatArabicCurrency(netTotalPiasters)})
                  </button>

                  {quickPresets.filter(p => p !== netPounds).map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPresetReceived(amt)}
                      className="py-1.5 px-3 rounded text-xs font-mono font-bold bg-surface-2 text-ink hover:bg-surface border border-line hover:border-brand/50 transition-colors"
                    >
                      {amt.toFixed(2)} ج.م
                    </button>
                  ))}
                </div>
              </div>

              {/* Huge Change Due Display (Feature #27 / Task 27-3) */}
              <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                isShortPayment
                  ? 'bg-amber-500/10 border-amber-400/40 text-amber-900 dark:text-amber-100'
                  : 'bg-paid-soft/80 border-paid-border text-paid'
              }`}>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isShortPayment ? 'المبلغ المتبقي / عجز في الدفع:' : 'المبلغ المتبقي للعميل (الباقي):'}
                  </span>
                  <span className="text-3xl font-mono font-black mt-1 tabular-nums">
                    {isShortPayment 
                      ? `-${formatArabicCurrency(shortAmountPiasters)}`
                      : formatArabicCurrency(changeDuePiasters)
                    }
                  </span>
                </div>

                <div className="text-left text-xs font-medium max-w-[200px]">
                  {isShortPayment ? (
                    <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>المبلغ المستلم غير كافٍ لتغطية الفاتورة بالكامل.</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-paid font-bold">
                      <CheckCircle className="w-5 h-5 shrink-0" />
                      <span>صافي الحساب سليم وجاهز لتأكيد العملية والطباعة.</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: CARD */}
          {activeTab === 'card' && (
            <div className="bg-surface p-5 rounded-lg border border-line flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-soft text-brand flex items-center justify-center shadow-xs">
                <CreditCard className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-ink m-0">الدفع عبر ماكينة نقاط البيع / الفيزا (POS Card Terminal)</p>
              <p className="text-xs text-ink-muted max-w-md m-0">
                مرر كارت العميل في ماكينة البنك بقيمة <strong className="text-brand font-mono">{formatArabicCurrency(netTotalPiasters)}</strong> ثم اضغط على زر تأكيد الدفع بالأسفل لحفظ المعاملة.
              </p>
            </div>
          )}

          {/* TAB: CREDIT */}
          {activeTab === 'credit' && (
            <div className="bg-surface p-4 rounded-lg border border-line flex flex-col gap-3">
              <div className="flex items-center justify-between hairline-b pb-2">
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-brand" />
                  <span>اختيار عميل الحساب الآجل:</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className="text-xs text-brand font-bold flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showQuickAdd ? 'إغلاق الإضافة السريعة' : 'إضافة عميل جديد سريع'}</span>
                </button>
              </div>

              {/* Quick Add Customer Subform (Tasks 40-3 & 40-4) */}
              {showQuickAdd && (
                <form onSubmit={handleQuickAddCustomer} className="p-3 bg-brand-soft/20 border border-brand/30 rounded-lg flex flex-col gap-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">إضافة عميل سريع (في أقل من 10 ثوانٍ):</span>
                    <span className="text-[10px] text-ink-muted">سيتم تسجيله واختياره مباشرة</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-ink mb-1">اسم العميل *</label>
                      <input
                        type="text"
                        required
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        placeholder="اسم العميل"
                        className="w-full h-8 px-2.5 bg-canvas border border-line rounded text-xs text-ink focus:outline-none focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-ink mb-1">رقم الهاتف</label>
                      <input
                        type="text"
                        value={quickPhone}
                        onChange={(e) => setQuickPhone(normalizeArabicNumerals(e.target.value))}
                        placeholder="010..."
                        className="w-full h-8 px-2.5 bg-canvas border border-line rounded text-xs text-ink font-mono focus:outline-none focus:border-brand"
                      />
                    </div>
                  </div>

                  {/* Duplicate Phone Inline Alert (Task 40-4) */}
                  {duplicateQuickCustomer && (
                    <div className="p-2 rounded bg-amber-500/15 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>هذا الرقم مسجل بالفعل للعميل: <strong>{duplicateQuickCustomer.name}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentCustomerId(duplicateQuickCustomer.id);
                          setShowQuickAdd(false);
                          setQuickName('');
                          setQuickPhone('');
                        }}
                        className="px-2 py-0.5 rounded bg-brand text-white font-bold text-[10px] hover:bg-brand-hover"
                      >
                        اختيار هذا العميل
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(false)}
                      className="px-3 py-1 rounded bg-surface border border-line text-xs font-semibold hover:bg-surface-2 text-ink"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={!quickName.trim() || quickSaving}
                      className="px-4 py-1 rounded bg-brand text-white text-xs font-bold hover:bg-brand-hover disabled:opacity-50"
                    >
                      {quickSaving ? 'جاري الحفظ...' : 'حفظ واختيار العميل'}
                    </button>
                  </div>
                </form>
              )}

              <CustomSelect
                value={currentCustomerId || ''}
                onChange={(val) => setCurrentCustomerId(val || null)}
                options={[
                  { value: '', label: '-- اختر العميل لتسجيل المديونية عليه --' },
                  ...localCustomers.map((c) => ({
                    value: c.id,
                    label: `${c.name} ${c.phone ? `(${c.phone})` : ''} - الرصيد الحالي: ${formatArabicCurrency(c.balancePiasters)}`
                  }))
                ]}
                placeholder="-- اختر العميل لتسجيل المديونية عليه --"
                size="lg"
                searchable
              />

              {selectedCustomer && (() => {
                const totalDebtAfterPiasters = selectedCustomer.balancePiasters + netTotalPiasters;
                const isOverLimit = selectedCustomer.creditLimitPiasters > 0 && totalDebtAfterPiasters > selectedCustomer.creditLimitPiasters;
                const isHighExistingDebt = selectedCustomer.balancePiasters >= 50000; // >= 500 EGP

                return (
                  <div className="flex flex-col gap-2">
                    <div className="p-3 bg-surface-2 border border-line rounded-md grid grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-ink-muted block text-[10px]">الرصيد السابق:</span>
                        <strong className="text-ink">{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>
                      </div>
                      <div>
                        <span className="text-ink-muted block text-[10px]">الحد الائتماني:</span>
                        <strong className="text-ink">
                          {selectedCustomer.creditLimitPiasters > 0 ? formatArabicCurrency(selectedCustomer.creditLimitPiasters) : 'غير محدد'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-ink-muted block text-[10px]">الرصيد بعد الفاتورة:</span>
                        <strong className={isOverLimit ? 'text-danger font-black' : 'text-brand font-bold'}>
                          {formatArabicCurrency(totalDebtAfterPiasters)}
                        </strong>
                      </div>
                    </div>

                    {/* Task 28-3: Prominent Warning Banner for High Debt / Over Limit */}
                    {(isOverLimit || isHighExistingDebt) && (
                      <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 animate-in fade-in ${
                        isOverLimit
                          ? 'bg-danger-soft/25 border-danger/50 text-danger-ink dark:text-red-300'
                          : 'bg-amber-500/15 border-amber-400/40 text-amber-900 dark:text-amber-200'
                      }`}>
                        <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isOverLimit ? 'text-danger' : 'text-amber-600'}`} />
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="font-bold">
                            {isOverLimit 
                              ? 'تحذير حرج: تجاوز الحد الائتماني المسموح به للعميل!' 
                              : 'تنبيه: العميل عليه مديونية سابقة مرتفعة!'}
                          </span>
                          <p className="m-0 text-[11px] leading-relaxed">
                            {isOverLimit ? (
                              <>
                                رصيد الدين سيزيد عن الحد الائتماني المحدد ({formatArabicCurrency(selectedCustomer.creditLimitPiasters)}) بمقدار <strong className="font-mono">{formatArabicCurrency(totalDebtAfterPiasters - selectedCustomer.creditLimitPiasters)}</strong>. يرجى توخي الحذر أو طلب سداد نقدي جزئي.
                              </>
                            ) : (
                              <>
                                العميل مسجل عليه مديونية سابقة بقيمة <strong className="font-mono">{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>.
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB: MULTI / SPLIT (Story 66 / Feature #29) */}
          {activeTab === 'multi' && (() => {
            const hasCredit = splitRows.some((r) => r.method === 'credit');
            const totalCreditPartPiasters = splitRows
              .filter((r) => r.method === 'credit')
              .reduce((sum, r) => sum + r.amountPiasters, 0);

            return (
              <div className="bg-surface p-4 rounded-lg border border-line flex flex-col gap-3">
                <div className="flex items-center justify-between hairline-b pb-2">
                  <div className="flex items-center gap-2">
                    <Split className="w-4 h-4 text-brand" />
                    <span className="text-xs font-bold text-ink">تقسيم الدفع (جزء نقدي والباقي آجل أو فيزا):</span>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    splitRemainingPiasters === 0 
                      ? 'bg-paid-soft text-paid border border-paid-border' 
                      : 'bg-danger-soft text-danger border border-danger/30'
                  }`}>
                    {splitRemainingPiasters === 0
                      ? 'المجموع مطابق تماماً'
                      : `المتبقي للتوزيع: ${formatArabicCurrency(splitRemainingPiasters)}`}
                  </span>
                </div>

                {/* Quick Split Presets (Task 29-1) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-ink-muted">توزيع سريع:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const half = Math.round(netTotalPiasters / 2);
                      setSplitRows([
                        { id: '1', method: 'cash', amountPiasters: half },
                        { id: '2', method: 'credit', amountPiasters: netTotalPiasters - half },
                      ]);
                    }}
                    className="px-2.5 py-1 rounded bg-surface-2 hover:bg-surface border border-line text-[11px] font-semibold text-ink transition-colors"
                  >
                    50% كاش + 50% آجل
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cashRow = splitRows.find(r => r.method === 'cash');
                      const cashAmt = cashRow ? cashRow.amountPiasters : Math.round(netTotalPiasters / 2);
                      const remainingForCredit = Math.max(0, netTotalPiasters - cashAmt);
                      setSplitRows([
                        { id: '1', method: 'cash', amountPiasters: cashAmt },
                        { id: '2', method: 'credit', amountPiasters: remainingForCredit },
                      ]);
                    }}
                    className="px-2.5 py-1 rounded bg-surface-2 hover:bg-surface border border-line text-[11px] font-semibold text-ink transition-colors"
                  >
                    تثبيت الكاش وتحويل الباقي لآجل
                  </button>
                </div>

                {/* Split Rows */}
                <div className="flex flex-col gap-2">
                  {splitRows.map((row, idx) => (
                    <div key={row.id} className="flex items-center gap-2 bg-surface-2 p-2 rounded border border-line">
                      <span className="text-xs font-bold text-ink-muted w-6 text-center">#{idx + 1}</span>
                      <select
                        value={row.method}
                        onChange={(e) => {
                          const newMethod = e.target.value as 'cash' | 'card' | 'credit';
                          setSplitRows((rows) => rows.map((r) => r.id === row.id ? { ...r, method: newMethod } : r));
                        }}
                        className="h-[34px] px-2 bg-surface border border-line rounded text-xs font-bold text-ink focus:border-brand focus:outline-hidden"
                      >
                        <option value="cash">نقدي (كاش)</option>
                        <option value="card">فيزا / كارت</option>
                        <option value="credit">آجل / على الحساب</option>
                      </select>

                      <input
                        type="text"
                        value={piastersToPounds(row.amountPiasters).toString()}
                        onChange={(e) => {
                          const piasters = poundsToPiasters(normalizeArabicNumerals(e.target.value));
                          setSplitRows((rows) => rows.map((r) => r.id === row.id ? { ...r, amountPiasters: piasters } : r));
                        }}
                        className="flex-1 h-[34px] px-3 bg-surface border border-line rounded text-xs font-mono font-bold text-ink text-left"
                        placeholder="0.00"
                      />
                      <span className="text-xs text-ink-muted font-bold">ج.م</span>

                      {splitRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSplitRows((rows) => rows.filter((r) => r.id !== row.id))}
                          className="p-1 text-ink-muted hover:text-danger rounded"
                          title="حذف هذا الجزء"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const remaining = Math.max(0, splitRemainingPiasters);
                      setSplitRows((rows) => [
                        ...rows,
                        { id: Date.now().toString(), method: 'cash', amountPiasters: remaining }
                      ]);
                    }}
                    className="py-1.5 px-3 rounded text-xs font-bold bg-surface-2 hover:bg-surface border border-line text-ink flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة طريقة دفع أخرى</span>
                  </button>

                  {splitRemainingPiasters > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        // Auto-balance last row with remaining
                        if (splitRows.length > 0) {
                          setSplitRows(rows => {
                            const lastIdx = rows.length - 1;
                            return rows.map((r, i) => i === lastIdx ? { ...r, amountPiasters: r.amountPiasters + splitRemainingPiasters } : r);
                          });
                        }
                      }}
                      className="text-xs text-brand font-bold hover:underline"
                    >
                      إضافة الفارق ({formatArabicCurrency(splitRemainingPiasters)}) للدفعة الأخيرة ←
                    </button>
                  )}
                </div>

                {/* If credit is part of the split: Customer selection is required (Task 29-2) */}
                {hasCredit && (
                  <div className="mt-2 p-3 bg-brand-soft/20 border border-brand/30 rounded-lg flex flex-col gap-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-brand" />
                        <span>اختيار العميل لتسجيل الجزء الآجل عليه ({formatArabicCurrency(totalCreditPartPiasters)}):</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickAdd(!showQuickAdd)}
                        className="text-[11px] text-brand font-bold flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{showQuickAdd ? 'إلغاء' : 'إضافة عميل سريع'}</span>
                      </button>
                    </div>

                    {showQuickAdd && (
                      <form onSubmit={handleQuickAddCustomer} className="p-2.5 bg-surface border border-line rounded flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            value={quickName}
                            onChange={(e) => setQuickName(e.target.value)}
                            placeholder="اسم العميل *"
                            className="h-8 px-2 bg-canvas border border-line rounded text-xs text-ink"
                          />
                          <input
                            type="text"
                            value={quickPhone}
                            onChange={(e) => setQuickPhone(normalizeArabicNumerals(e.target.value))}
                            placeholder="رقم الهاتف"
                            className="h-8 px-2 bg-canvas border border-line rounded text-xs text-ink font-mono"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowQuickAdd(false)}
                            className="px-2.5 py-0.5 rounded bg-surface-2 text-xs font-semibold"
                          >
                            إلغاء
                          </button>
                          <button
                            type="submit"
                            disabled={!quickName.trim() || quickSaving}
                            className="px-3 py-0.5 rounded bg-brand text-white text-xs font-bold"
                          >
                            {quickSaving ? 'حفظ...' : 'حفظ واختيار'}
                          </button>
                        </div>
                      </form>
                    )}

                    <CustomSelect
                      value={currentCustomerId || ''}
                      onChange={(val) => setCurrentCustomerId(val || null)}
                      options={[
                        { value: '', label: '-- اختر عميل الحساب الآجل --' },
                        ...localCustomers.map((c) => ({
                          value: c.id,
                          label: `${c.name} ${c.phone ? `(${c.phone})` : ''} - الرصيد الحالي: ${formatArabicCurrency(c.balancePiasters)}`
                        }))
                      ]}
                      placeholder="-- اختر عميل الحساب الآجل --"
                      size="md"
                      searchable
                    />

                    {selectedCustomer && (() => {
                      const totalDebtAfter = selectedCustomer.balancePiasters + totalCreditPartPiasters;
                      const isOver = selectedCustomer.creditLimitPiasters > 0 && totalDebtAfter > selectedCustomer.creditLimitPiasters;

                      return (
                        <div className="p-2.5 bg-surface border border-line rounded text-xs font-mono flex items-center justify-between">
                          <div>
                            <span className="text-ink-muted">الرصيد السابق: </span>
                            <strong>{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>
                          </div>
                          <div>
                            <span className="text-ink-muted">الجزء الآجل الجديد: </span>
                            <strong className="text-brand">+{formatArabicCurrency(totalCreditPartPiasters)}</strong>
                          </div>
                          <div>
                            <span className="text-ink-muted">الرصيد بعد الفاتورة: </span>
                            <strong className={isOver ? 'text-danger font-black' : 'text-ink font-bold'}>
                              {formatArabicCurrency(totalDebtAfter)}
                            </strong>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="h-[64px] px-5 bg-surface-2 hairline-t flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs font-semibold text-ink-muted hover:text-ink hover:bg-surface border border-line transition-colors"
          >
            رجوع للسلة [Esc]
          </button>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading || (activeTab === 'multi' && splitRemainingPiasters !== 0)}
            className="px-6 py-2.5 rounded-lg text-sm font-bold bg-brand hover:bg-brand-hover text-white flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{loading ? 'جاري الحفظ والطباعة...' : 'تأكيد الدفع وطباعة الفاتورة [Enter]'}</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
