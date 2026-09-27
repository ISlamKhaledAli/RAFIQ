import { useState, useEffect, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import { 
  Banknote, 
  CreditCard, 
  UserCheck, 
  Split, 
  X, 
  Printer, 
  ArrowRight
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Customer, SalePayment } from '../types/models';
import { formatArabicCurrency, normalizeArabicNumerals, poundsToPiasters, piastersToPounds } from '../utils/money';
import { rafiqConfirm, rafiqAlert } from '../utils/dialogService';

import { CashPaymentSection } from './payment/CashPaymentSection';
import { CardPaymentSection } from './payment/CardPaymentSection';
import { CreditPaymentSection } from './payment/CreditPaymentSection';
import { MultiPaymentSection } from './payment/MultiPaymentSection';

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

  const handleQuickAddCustomer = async (e: FormEvent) => {
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
        if (!currentCustomerId) {
          await rafiqAlert({
            title: 'لا يمكن إتمام دفع جزئي لعميل مجهول',
            message: `المبلغ المدفوع (${formatArabicCurrency(receivedPiasters)}) أقل من قيمة الفاتورة (${formatArabicCurrency(netTotalPiasters)}) بفارق ${formatArabicCurrency(shortAmountPiasters)}.\n\nلتسجيل باقي الحساب كدين آجل، يرجى اختيار عميل من القائمة أعلاه أو الضغط على «إضافة عميل سريع» أولاً.`,
            variant: 'warning',
          });
          return;
        }

        if (selectedCustomer) {
          const isExceeded = selectedCustomer.creditLimitPiasters > 0 && 
            (selectedCustomer.balancePiasters + shortAmountPiasters > selectedCustomer.creditLimitPiasters);
          if (isExceeded) {
            const confirmExceeded = await rafiqConfirm({
              title: 'تحذير تجاوز الحد الائتماني للعميل',
              message: `دين العميل الحالي: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nالمبلغ المتبقي كآجل: ${formatArabicCurrency(shortAmountPiasters)}\nإجمالي الدين بعد الفاتورة: ${formatArabicCurrency(selectedCustomer.balancePiasters + shortAmountPiasters)}\nالحد الائتماني المسموح: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nهل تريد تأكيد العملية وتجاوز الحد الائتماني؟`,
              confirmText: 'متابعة وتجاوز الحد',
              cancelText: 'إلغاء وتعديل المبلغ',
              variant: 'danger',
            });
            if (!confirmExceeded) return;
          }
        }

        const proceed = await rafiqConfirm({
          title: 'تأكيد الدفع الجزئي وتسجيل الباقي كآجل',
          message: `تفاصيل العملية:\n• المدفوع كاش الآن: ${formatArabicCurrency(receivedPiasters)} (يُضاف لدرج الخزينة)\n• الباقي كدين آجل: ${formatArabicCurrency(shortAmountPiasters)} (يُقيد في دفتر العميل: ${selectedCustomer?.name || ''})\n\nهل تريد المتابعة وإتمام الفاتورة؟`,
          confirmText: 'نعم، إتمام الفاتورة',
          cancelText: 'تراجع وتعديل المبلغ',
          variant: 'info',
        });
        if (!proceed) {
          return;
        }

        const payments: SalePayment[] = [
          {
            amountPiasters: receivedPiasters,
            method: 'cash',
          },
          {
            amountPiasters: shortAmountPiasters,
            method: 'credit',
          }
        ];

        onConfirmPayment({
          paymentMethod: 'multi',
          paidPiasters: receivedPiasters,
          payments,
          changeDuePiasters: 0,
          customerId: currentCustomerId,
        });
        return;
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

  if (!isOpen) return null;

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
            className="w-8 h-8 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
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
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
          {activeTab === 'cash' && (
            <CashPaymentSection
              receivedInput={receivedInput}
              onReceivedChange={handleReceivedChange}
              receivedInputRef={receivedInputRef}
              netTotalPiasters={netTotalPiasters}
              netPounds={netPounds}
              quickPresets={quickPresets}
              onSetPreset={setPresetReceived}
              isShortPayment={isShortPayment}
              selectedCustomer={selectedCustomer}
              shortAmountPiasters={shortAmountPiasters}
              receivedPiasters={receivedPiasters}
              changeDuePiasters={changeDuePiasters}
              onOpenQuickAddCustomer={() => setShowQuickAdd(true)}
            />
          )}

          {activeTab === 'card' && (
            <CardPaymentSection netTotalPiasters={netTotalPiasters} />
          )}

          {activeTab === 'credit' && (
            <CreditPaymentSection
              currentCustomerId={currentCustomerId}
              setCurrentCustomerId={setCurrentCustomerId}
              localCustomers={localCustomers}
              selectedCustomer={selectedCustomer}
              netTotalPiasters={netTotalPiasters}
              showQuickAdd={showQuickAdd}
              setShowQuickAdd={setShowQuickAdd}
              quickName={quickName}
              setQuickName={setQuickName}
              quickPhone={quickPhone}
              setQuickPhone={setQuickPhone}
              quickSaving={quickSaving}
              duplicateQuickCustomer={duplicateQuickCustomer}
              onSelectDuplicateCustomer={(c) => {
                setCurrentCustomerId(c.id);
                setShowQuickAdd(false);
                setQuickName('');
                setQuickPhone('');
              }}
              onQuickAddCustomer={handleQuickAddCustomer}
            />
          )}

          {activeTab === 'multi' && (
            <MultiPaymentSection
              splitRows={splitRows}
              setSplitRows={setSplitRows}
              splitRemainingPiasters={splitRemainingPiasters}
              netTotalPiasters={netTotalPiasters}
              currentCustomerId={currentCustomerId}
              setCurrentCustomerId={setCurrentCustomerId}
              localCustomers={localCustomers}
              selectedCustomer={selectedCustomer}
              showQuickAdd={showQuickAdd}
              setShowQuickAdd={setShowQuickAdd}
              quickName={quickName}
              setQuickName={setQuickName}
              quickPhone={quickPhone}
              setQuickPhone={setQuickPhone}
              quickSaving={quickSaving}
              duplicateQuickCustomer={duplicateQuickCustomer}
              onSelectDuplicateCustomer={(c) => {
                setCurrentCustomerId(c.id);
                setShowQuickAdd(false);
                setQuickName('');
                setQuickPhone('');
              }}
              onQuickAddCustomer={handleQuickAddCustomer}
            />
          )}
        </div>

        {/* Footer */}
        <div className="h-[64px] px-5 bg-surface-2 hairline-t flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs font-semibold text-ink-muted hover:text-ink hover:bg-surface border border-line transition-colors cursor-pointer"
          >
            رجوع للسلة [Esc]
          </button>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading || (activeTab === 'multi' && splitRemainingPiasters !== 0)}
            className="px-6 py-2.5 rounded-lg text-sm font-bold bg-brand hover:bg-brand-hover text-white flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
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
