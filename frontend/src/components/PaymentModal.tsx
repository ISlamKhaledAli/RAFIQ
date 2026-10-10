import { useState, useEffect, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import { 
  Banknote, 
  UserCheck, 
  Split, 
  X, 
  Printer, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Customer, SalePayment } from '../types/models';
import { formatArabicCurrency, normalizeArabicNumerals, poundsToPiasters, piastersToPounds } from '../utils/money';
import { rafiqConfirm, rafiqAlert } from '../utils/dialogService';
import { MoneyInput } from './MoneyInput';
import { CustomSelect } from './CustomSelect';

import { CashPaymentSection } from './payment/CashPaymentSection';
import { CreditPaymentSection } from './payment/CreditPaymentSection';
import { MultiPaymentSection } from './payment/MultiPaymentSection';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber?: number | null;
  itemCount?: number;
  totalItemCount?: number;
  subtotalPiasters: number;
  discountPiasters: number;
  onDiscountChange?: (val: number) => void;
  netTotalPiasters: number;
  selectedCustomerId?: string | null;
  onCustomerChange?: (id: string) => void;
  showCredit?: boolean;
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
  invoiceNumber,
  itemCount = 0,
  totalItemCount = 0,
  subtotalPiasters,
  discountPiasters,
  onDiscountChange,
  netTotalPiasters,
  selectedCustomerId,
  onCustomerChange,
  showCredit: _showCredit = true,
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
  const [isFullCreditMode, setIsFullCreditMode] = useState(false);
  const [saveChangeToCustomerAccount, setSaveChangeToCustomerAccount] = useState(false);

  const localCustomers = useMemo(() => {
    return [...customers, ...newlyAddedCustomers];
  }, [customers, newlyAddedCustomers]);

  // Multi-Payment rows state
  const [splitRows, setSplitRows] = useState<Array<{ id: string; method: 'cash' | 'card' | 'credit'; amountPiasters: number }>>(() => [
    { id: '1', method: 'cash', amountPiasters: Math.round(netTotalPiasters / 2) },
    { id: '2', method: 'card', amountPiasters: netTotalPiasters - Math.round(netTotalPiasters / 2) },
  ]);

  const receivedInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);

  // Reset and synchronize all payment fields cleanly whenever modal opens (Feature #27 / Anti-leak)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setActiveTab('cash');
      setReceivedInput('0');
      setReceivedPiasters(0);
      setIsFullCreditMode(false);
      setSaveChangeToCustomerAccount(false);
      setCurrentCustomerId(selectedCustomerId || null);
      setShowQuickAdd(false);
      setQuickName('');
      setQuickPhone('');
      setSplitRows([
        { id: '1', method: 'cash', amountPiasters: Math.round(netTotalPiasters / 2) },
        { id: '2', method: 'card', amountPiasters: netTotalPiasters - Math.round(netTotalPiasters / 2) },
      ]);
      const timer = setTimeout(() => {
        receivedInputRef.current?.focus();
        receivedInputRef.current?.select();
      }, 60);
      prevIsOpenRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, netTotalPiasters, selectedCustomerId]);

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
  const isShortPayment = receivedPiasters > 0 && receivedPiasters < netTotalPiasters;
  const shortAmountPiasters = Math.max(0, netTotalPiasters - receivedPiasters);

  // Calculations for Multi/Split payment
  const splitTotalPaid = splitRows.reduce((sum, r) => sum + r.amountPiasters, 0);
  const splitRemainingPiasters = netTotalPiasters - splitTotalPaid;

  const handleReceivedChange = (raw: string) => {
    const normalized = normalizeArabicNumerals(raw);
    setReceivedInput(normalized);
    const piasters = poundsToPiasters(normalized);
    setReceivedPiasters(piasters);
    if (piasters > 0) {
      setIsFullCreditMode(false);
    }
  };

  const setPresetReceived = (amountPounds: number) => {
    const piasters = amountPounds * 100;
    setReceivedPiasters(piasters);
    setReceivedInput(amountPounds.toString());
    setIsFullCreditMode(false);
    receivedInputRef.current?.focus();
  };

  const handleQuickFullCredit = async () => {
    if (!currentCustomerId || currentCustomerId === 'cust_general_cash') {
      await rafiqAlert({
        title: 'اختار العميل الأول',
        message: 'عشان تسجل الفاتورة على الحساب، اختار اسم العميل من القائمة فوق أو اضغط «+ إضافة عميل سريع» الأول.',
        variant: 'warning',
      });
      return;
    }

    const targetCust = localCustomers.find(c => c.id === currentCustomerId);
    if (targetCust) {
      if (targetCust.balancePiasters < 0) {
        const creditAvail = Math.abs(targetCust.balancePiasters);
        if (creditAvail >= netTotalPiasters) {
          await rafiqAlert({
            title: 'خصم الفاتورة من الفلوس اللي سايبها العميل',
            message: `العميل «${targetCust.name}» سايب فلوس في المحل: ${formatArabicCurrency(creditAvail)}.\n\nالفاتورة (${formatArabicCurrency(netTotalPiasters)}) هتتخصم كلها من الفلوس اللي سايبها، وهيفضل له في حسابه بالمحل: ${formatArabicCurrency(creditAvail - netTotalPiasters)}.`,
            variant: 'info',
          });
        } else {
          await rafiqAlert({
            title: 'خصم الفلوس اللي سايبها والباقي على الحساب',
            message: `العميل «${targetCust.name}» سايب فلوس في المحل: ${formatArabicCurrency(creditAvail)}.\n\nالفلوس اللي كان سايبها هتتخصم كلها (${formatArabicCurrency(creditAvail)})، والباقي (${formatArabicCurrency(netTotalPiasters - creditAvail)}) هيتسجل عليه في حسابه بالنوتة.`,
            variant: 'info',
          });
        }
      } else {
        await rafiqAlert({
          title: 'تأكيد تسجيل الفاتورة على الحساب',
          message: `مستلمتش كاش: 0.00 ج.م (مفيش فلوس اتدفعت كاش).\n\nالفاتورة كلها (${formatArabicCurrency(netTotalPiasters)}) هتتسجل على حساب العميل «${targetCust.name}» في النوتة.\nإجمالي اللي عليه بعد الفاتورة دي: ${formatArabicCurrency(targetCust.balancePiasters + netTotalPiasters)}.`,
          variant: 'info',
        });
      }
    }

    setReceivedInput('0');
    setReceivedPiasters(0);
    setIsFullCreditMode(true);
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
      const hasRegisteredCustomer = !!(selectedCustomer && selectedCustomer.id !== 'cust_general_cash');
      const isCreditSubmission = isFullCreditMode || (receivedPiasters === 0 && hasRegisteredCustomer);

      if (isCreditSubmission) {
        if (!hasRegisteredCustomer || !selectedCustomer) {
          await rafiqAlert({
            title: 'يجب اختيار عميل أولاً',
            message: 'لتسجيل الفاتورة كآجل بالكامل على الحساب، يرجى اختيار عميل من القائمة أعلاه أو الضغط على «+ إضافة عميل سريع» أولاً.',
            variant: 'warning',
          });
          return;
        }

        if (selectedCustomer.creditLimitPiasters > 0) {
          const newProjectedBalance = selectedCustomer.balancePiasters + netTotalPiasters;
          if (newProjectedBalance > selectedCustomer.creditLimitPiasters) {
            const confirmExceeded = await rafiqConfirm({
              title: 'تنبيه: العميل عدى الحد المسموح بيه للشكك',
              message: `اللي على العميل دلوقتي: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nقيمة الفاتورة دي: ${formatArabicCurrency(netTotalPiasters)}\nإجمالي اللي هيبقى عليه بعد الفاتورة: ${formatArabicCurrency(newProjectedBalance)}\nأعلى حد مسموح بيه: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nعاوز تكمل العملية وتسجل الفاتورة في حسابه؟`,
              confirmText: 'متابعة وتجاوز الحد',
              cancelText: 'إلغاء وتعديل',
              variant: 'danger',
            });
            if (!confirmExceeded) return;
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
        return;
      }

      if (receivedPiasters === 0) {
        const confirmExact = await rafiqConfirm({
          title: 'تأكيد الدفع نقداً بالكامل',
          message: `المبلغ المستلم غير مدخل (0 ج.م).\nهل تم استلام كامل قيمة الفاتورة بالظبط (${formatArabicCurrency(netTotalPiasters)}) نقداً؟`,
          confirmText: 'نعم، تم استلام المبلغ بالكامل',
          cancelText: 'تراجع لكتابة المبلغ',
          variant: 'info',
        });
        if (!confirmExact) return;

        const payments: SalePayment[] = [
          {
            amountPiasters: netTotalPiasters,
            method: 'cash',
          },
        ];

        onConfirmPayment({
          paymentMethod: 'cash',
          paidPiasters: netTotalPiasters,
          payments,
          changeDuePiasters: 0,
          customerId: currentCustomerId,
        });
        return;
      }

      if (isShortPayment) {
        if (!currentCustomerId || currentCustomerId === 'cust_general_cash') {
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

      if (saveChangeToCustomerAccount && changeDuePiasters > 0 && hasRegisteredCustomer) {
        const payments: SalePayment[] = [
          {
            amountPiasters: receivedPiasters,
            method: 'cash',
          },
        ];

        onConfirmPayment({
          paymentMethod: 'cash',
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
      return;
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
          title: 'تنبيه حساب الشكك',
          message: 'لازم تختار الزبون من الدفتر عشان تسجل الفاتورة عليه شكك!',
          variant: 'warning',
        });
        return;
      }

      if (selectedCustomer) {
        const isExceeded = selectedCustomer.creditLimitPiasters > 0 && 
          (selectedCustomer.balancePiasters + netTotalPiasters > selectedCustomer.creditLimitPiasters);
        if (isExceeded) {
          const confirmProceed = await rafiqConfirm({
            title: 'تحذير: الزبون عدى سقف الشكك المسموح!',
            message: `حساب الزبون القديم: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nإجمالي حسابه بعد الفاتورة دي: ${formatArabicCurrency(selectedCustomer.balancePiasters + netTotalPiasters)}\nأعلى حد شكك مسموح له بيه: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nعاوز تكمل البيع على الحساب وتعدي السقف ده؟`,
            confirmText: 'كمل عادي وسجلها شكك',
            cancelText: 'إلغاء وما تسجلش',
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
          title: 'الفلوس مش متطابقة مع إجمالي الفاتورة',
          message: `مجموع الدفعات المتفرقة (${formatArabicCurrency(splitTotalPaid)}) لازم يساوي بالضبط حساب الفاتورة (${formatArabicCurrency(netTotalPiasters)})!\nالفارق المتبقي: ${formatArabicCurrency(Math.abs(splitRemainingPiasters))}`,
          variant: 'warning',
        });
        return;
      }

      const hasCreditRow = splitRows.some((r) => r.method === 'credit');
      if (hasCreditRow && !currentCustomerId) {
        await rafiqAlert({
          title: 'تنبيه حساب الشكك',
          message: 'فيه جزء شكك على الحساب! لازم تختار الزبون عشان الباقي يتسجل عليه في الدفتر.',
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
            title: 'تحذير: الزبون عدى سقف الشكك المسموح!',
            message: `حساب الزبون القديم: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nالجزء الشكك في الفاتورة دي: ${formatArabicCurrency(creditPart)}\nإجمالي حسابه بعد العملية دي: ${formatArabicCurrency(selectedCustomer.balancePiasters + creditPart)}\nأعلى حد شكك مسموح له بيه: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nعاوز تكمل الدفع المشكل وتعدي السقف ده؟`,
            confirmText: 'كمل عادي وسجلها شكك',
            cancelText: 'إلغاء وما تسجلش',
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
                حساب الفاتورة واستلام الفلوس والباقي
              </h2>
              <p className="text-[11px] text-ink-muted m-0">
                استلمت كام من الزبون، احسب الباقي، وسجل الفاتورة بضغطة زر واحدة
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
          {/* 1. Complete Invoice Meta, Financial Summary & Customer Selector Card */}
          <div className="bg-[#f8faf9] border border-[#dce1dc] rounded-2xl p-3 sm:p-4 flex flex-col gap-3 shadow-2xs">
            {/* Top Row: Invoice # + Item Counts + Subtotal + Discount Input + Grand Total Card */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#dce1dc]/80">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* Invoice Number Badge */}
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-xs text-[#0f172a]">فاتورة:</span>
                  <span className="text-xs font-mono font-bold text-[#006d41] bg-[#eaf5ee] border border-[#c4e3d0] px-2.5 py-0.5 rounded-md shadow-2xs">
                    #{invoiceNumber || '1'}
                  </span>
                </div>

                {/* Items and Pieces Count */}
                <div className="text-[11px] text-[#52605d] font-medium bg-white px-2.5 py-0.5 rounded-md border border-[#dce1dc]">
                  {itemCount} صنف ({totalItemCount} حتة)
                </div>

                {/* Subtotal */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-[#52605d]">إجمالي السلة:</span>
                  <span className="font-bold text-[#0f172a] font-mono tabular-nums">
                    {formatArabicCurrency(subtotalPiasters)}
                  </span>
                </div>

                {/* Interactive Discount Field */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-[#b23a2e] font-bold shrink-0">خصم:</span>
                  <div className="w-24">
                    <MoneyInput
                      valuePiasters={discountPiasters}
                      onChangePiasters={(val) => {
                        if (onDiscountChange) onDiscountChange(val);
                      }}
                      className="h-7 text-xs text-[#b23a2e] font-bold border-[#b23a2e]/30 focus:border-[#b23a2e] bg-[#fdf3f2] text-right pr-1.5 pl-6 rounded-md shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Grand Total Hero Box */}
              <div className="flex items-center gap-2.5 bg-gradient-to-br from-[#00372d] to-[#004d3f] text-white px-3.5 py-1.5 rounded-xl shadow-xs">
                <span className="text-xs text-[#83bfaf] font-semibold">المطلوب دفعه:</span>
                <span className="text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tight">
                  {formatArabicCurrency(netTotalPiasters)}
                </span>
              </div>
            </div>

            {/* Bottom Row: Customer Selector & Quick Add Trigger */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <div className="flex items-center gap-1.5 text-xs text-[#006d41] font-bold shrink-0">
                  <UserCheck className="w-4 h-4" />
                  <span>الزبون:</span>
                </div>

                <div className="flex-1 min-w-0">
                  <CustomSelect
                    value={currentCustomerId || ''}
                    onChange={(val) => {
                      setCurrentCustomerId(val || null);
                      if (onCustomerChange) onCustomerChange(val);
                    }}
                    options={[
                      { value: '', label: 'زبون عادي كاش (بدون حساب)' },
                      ...localCustomers.filter(c => c.id !== 'cust_general_cash').map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.phone ? `(${c.phone})` : ''} ${
                          c.balancePiasters > 0
                            ? `[عليه: ${(c.balancePiasters / 100).toFixed(0)} ج.م]`
                            : c.balancePiasters < 0
                            ? `[له: ${(Math.abs(c.balancePiasters) / 100).toFixed(0)} ج.م]`
                            : ''
                        }`,
                      })),
                    ]}
                    className="w-full"
                    size="sm"
                    searchable
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowQuickAdd(true)}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#006d41] bg-[#eaf5ee] hover:bg-[#d8edd0] border border-[#c4e3d0] rounded-lg transition-colors shrink-0 shadow-2xs cursor-pointer active:scale-95"
                  title="تسجيل زبون جديد في النوتة فوراً"
                >
                  + تسجيل زبون جديد
                </button>
              </div>

              {selectedCustomer && (
                selectedCustomer.balancePiasters > 0 ? (
                  <span className="text-xs text-[#b23a2e] font-mono font-bold bg-[#fdf3f2] px-2.5 py-1 rounded-lg border border-[#f6cbc6] shrink-0">
                    عليه فلوس قديمة: {formatArabicCurrency(selectedCustomer.balancePiasters)}
                  </span>
                ) : selectedCustomer.balancePiasters < 0 ? (
                  <span className="text-xs text-paid font-mono font-bold bg-paid-soft px-2.5 py-1 rounded-lg border border-paid-border shrink-0 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-paid shrink-0" />
                    <span>سايب فلوس في المحل: {formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))} (له رصيد)</span>
                  </span>
                ) : null
              )}
            </div>

            {/* Quick Add Customer Inline Form (Toggled) */}
            {showQuickAdd && (
              <form onSubmit={handleQuickAddCustomer} className="p-3 bg-white rounded-xl border border-[#c4e3d0] flex flex-wrap items-center gap-2 shadow-2xs mt-1">
                <input
                  type="text"
                  placeholder="اسم الزبون *"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="flex-1 min-w-[140px] h-8 text-xs px-2.5 rounded-lg border border-[#dce1dc] focus:border-[#006d41] outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="رقم الموبايل"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  className="flex-1 min-w-[120px] h-8 text-xs px-2.5 rounded-lg border border-[#dce1dc] focus:border-[#006d41] outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={quickSaving || !quickName.trim()}
                  className="px-3 h-8 bg-[#006d41] hover:bg-[#005230] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {quickSaving ? 'ثواني بنحفظ...' : 'حفظ واختيار الزبون'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="px-2.5 h-8 bg-surface-2 hover:bg-surface text-ink-muted text-xs rounded-lg border border-line cursor-pointer"
                >
                  إلغاء
                </button>
                {duplicateQuickCustomer && (
                  <span className="text-[11px] text-[#b23a2e] w-full font-semibold">
                    تنبيه: الرقم ده متسجل قبل كده باسم الزبون «{duplicateQuickCustomer.name}»
                  </span>
                )}
              </form>
            )}
          </div>

          {/* 2. Payment Method Tabs (Credit is accessed directly via quick button) */}
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
              onClick={() => setActiveTab('multi')}
              className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'multi'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              <Split className="w-4 h-4" />
              <span>دفع مشكل (كاش + فيزا + شكك)</span>
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
              onQuickFullCredit={handleQuickFullCredit}
              isFullCreditMode={isFullCreditMode}
              saveChangeToCustomerAccount={saveChangeToCustomerAccount}
              onToggleSaveChangeToCustomerAccount={setSaveChangeToCustomerAccount}
            />
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
            رجوع لفاتورة البيع [Esc]
          </button>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading || (activeTab === 'multi' && splitRemainingPiasters !== 0)}
            className="px-6 py-2.5 rounded-lg text-sm font-bold bg-brand hover:bg-brand-hover text-white flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{loading ? 'ثواني، بنسجل الفاتورة وبنطبع...' : 'حفظ الفاتورة وطباعة الوصل [Enter]'}</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
