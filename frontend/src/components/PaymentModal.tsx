import { useState, useEffect, useRef, useMemo } from 'react';
import { Banknote, X, CheckCircle2 } from 'lucide-react';
import type { Customer, SalePayment } from '../types/models';
import { formatArabicCurrency, normalizeArabicNumerals, poundsToPiasters } from '../utils/money';
import { rafiqConfirm, rafiqAlert } from '../utils/dialogService';
import { useModalDismiss } from '../hooks/useModalDismiss';

import { useAuth } from '../context/useAuth';
import { SupervisorPromptModal } from './SupervisorPromptModal';
import { ToggleSwitch } from './ToggleSwitch';
import { setReceiptPrintPreference, shouldPrintReceipt } from '../utils/receiptPrintPreference';

import { CashPaymentSection } from './payment/CashPaymentSection';
import { CustomerPicker } from './payment/CustomerPicker';
import { PaymentSummary } from './payment/PaymentSummary';
import { QuickAddCustomerForm } from './payment/QuickAddCustomerForm';
import { useQuickAddCustomer } from './payment/useQuickAddCustomer';
import { buildCashQuickPresetsPiasters, piastersToInputText } from './payment/cashPresets';

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
  customers: Customer[];
  onConfirmPayment: (paymentData: {
    paymentMethod: 'cash' | 'credit' | 'card' | 'multi' | 'instapay' | 'vodafone_cash';
    paidPiasters: number;
    payments: SalePayment[];
    changeDuePiasters: number;
    customerId?: string | null;
    totalPiastersOverride?: number;
    serviceFeeNote?: string;
    supervisorPin?: string;
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
  customers,
  onConfirmPayment,
  loading = false,
}: PaymentModalProps) => {
  // '' means nothing received yet and is read exactly like 0 piasters everywhere.
  const [receivedInput, setReceivedInput] = useState<string>('');
  const [receivedPiasters, setReceivedPiasters] = useState<number>(0);
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(selectedCustomerId || null);
  const [isFullCreditMode, setIsFullCreditMode] = useState(false);
  const [saveChangeToCustomerAccount, setSaveChangeToCustomerAccount] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<boolean>(() => shouldPrintReceipt());

  const { isRoot, isAdmin, hasPermission } = useAuth();
  const [supervisorPrompt, setSupervisorPrompt] = useState<{
    isOpen: boolean;
    actionTitle: string;
    actionDescription: string;
    onApproved: (supervisorName?: string, verifiedPin?: string) => void;
  }>({
    isOpen: false,
    actionTitle: '',
    actionDescription: '',
    onApproved: () => {},
  });

  const {
    localCustomers,
    showQuickAdd,
    openQuickAdd,
    closeQuickAdd,
    resetQuickAdd,
    quickName,
    setQuickName,
    quickPhone,
    setQuickPhone,
    quickSaving,
    hasQuickAddInput,
    duplicateQuickCustomer,
    handleQuickAddCustomer,
    selectDuplicateCustomer,
  } = useQuickAddCustomer(customers, (id) => {
    setCurrentCustomerId(id);
    if (onCustomerChange) onCustomerChange(id);
  });

  const receivedInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);

  // Reset and synchronize all payment fields cleanly whenever modal opens (Feature #27 / Anti-leak)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setReceivedInput('');
      setReceivedPiasters(0);
      setIsFullCreditMode(false);
      setSaveChangeToCustomerAccount(false);
      setPrintReceipt(shouldPrintReceipt());
      setCurrentCustomerId(selectedCustomerId || null);
      resetQuickAdd();
      const timer = setTimeout(() => {
        receivedInputRef.current?.focus();
      }, 60);
      prevIsOpenRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, netTotalPiasters, selectedCustomerId, resetQuickAdd]);

  const handleCustomerChange = (id: string) => {
    setCurrentCustomerId(id || null);
    if (onCustomerChange) onCustomerChange(id);
  };

  const selectedCustomer = localCustomers.find((c) => c.id === currentCustomerId);
  const hasRegisteredCustomer = !!(selectedCustomer && selectedCustomer.id !== 'cust_general_cash');
  const isCreditActive = isFullCreditMode || (receivedPiasters === 0 && hasRegisteredCustomer);

  // Calculations for Single Cash payment
  const changeDuePiasters = Math.max(0, receivedPiasters - netTotalPiasters);
  const isShortPayment = receivedPiasters > 0 && receivedPiasters < netTotalPiasters;
  const shortAmountPiasters = Math.max(0, netTotalPiasters - receivedPiasters);

  const handleReceivedChange = (raw: string) => {
    const normalized = normalizeArabicNumerals(raw);
    if (/^[0-9]*\.?[0-9]{0,2}$/.test(normalized)) {
      setReceivedInput(normalized);
      const piasters = poundsToPiasters(normalized);
      setReceivedPiasters(piasters);
      if (piasters > 0) {
        setIsFullCreditMode(false);
      }
    }
  };

  const setPresetReceived = (piasters: number) => {
    setReceivedPiasters(piasters);
    setReceivedInput(piastersToInputText(piasters));
    setIsFullCreditMode(false);
    receivedInputRef.current?.focus();
  };

  const handleQuickFullCredit = async () => {
    if (!currentCustomerId || currentCustomerId === 'cust_general_cash') {
      await rafiqAlert({
        title: 'اختار الزبون الأول',
        message: 'عشان تسجل الفاتورة على الحساب، اختار اسم الزبون من خانة الزبون أو اضغط «تسجيل زبون جديد» الأول.',
        variant: 'warning',
      });
      return;
    }

    // The status card shows the consequence; the money confirmation happens when the cashier saves.
    setReceivedInput('');
    setReceivedPiasters(0);
    setIsFullCreditMode(true);
  };

  const isDirty = useMemo(() => {
    const receivedModified = receivedPiasters > 0;
    const customerModified = Boolean(currentCustomerId && currentCustomerId !== (selectedCustomerId || null));
    const quickAddModified = hasQuickAddInput;
    return receivedModified || customerModified || quickAddModified || isFullCreditMode || saveChangeToCustomerAccount;
  }, [receivedPiasters, currentCustomerId, selectedCustomerId, hasQuickAddInput, isFullCreditMode, saveChangeToCustomerAccount]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل البيانات المدخلة؟',
    confirmMessage: 'هناك مبالغ أو بيانات مدخلة في نافذة الدفع، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة الدفع',
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || loading) return;
    // Enter belongs to the control that has focus when it is the quick-add form (saves the customer), a dropdown menu
    // (picks an option), a plain button (clicks it) or a textarea. Only the amount fields and the print switch confirm the sale.
    const target = e.target as HTMLElement;
    const isPlainButton = target.tagName === 'BUTTON' && target.getAttribute('role') !== 'switch';
    if (isPlainButton || target.closest('form, textarea, [data-select-menu]')) return;
    e.preventDefault();
    // Stop here: the global confirm-dialog listener must not receive this same Enter and auto-accept the confirmation it opens.
    e.stopPropagation();
    void handleConfirm();
  };

  const handleConfirm = async () => {
    if (isCreditActive) {
      if (!hasRegisteredCustomer || !selectedCustomer) {
        await rafiqAlert({
          title: 'يجب اختيار زبون أولاً',
          message: 'لتسجيل الفاتورة كآجل بالكامل على الحساب، اختر زبوناً من خانة الزبون أو اضغط «تسجيل زبون جديد» أولاً.',
          variant: 'warning',
        });
        return;
      }

      const newProjectedBalance = selectedCustomer.balancePiasters + netTotalPiasters;
      const isExceeded = selectedCustomer.creditLimitPiasters > 0 && newProjectedBalance > selectedCustomer.creditLimitPiasters;

      const proceedWithCreditSale = (verifiedSupervisorPin?: string) => {
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
          supervisorPin: verifiedSupervisorPin,
        });
      };

      if (isExceeded) {
        const canOverride = isRoot || isAdmin || hasPermission('customers.credit_limit_override');
        if (canOverride) {
          const confirmExceeded = await rafiqConfirm({
            title: 'تأكيد تجاوز الحد الائتماني للعميل (بصلاحية مدير)',
            message: `اللي على العميل دلوقتي: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nقيمة الفاتورة دي: ${formatArabicCurrency(netTotalPiasters)}\nإجمالي اللي هيبقى عليه بعد الفاتورة: ${formatArabicCurrency(newProjectedBalance)}\nأعلى حد مسموح بيه: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nهل تؤكد كمدير نظام تجاوز الحد الائتماني وإتمام الفاتورة؟`,
            confirmText: 'تأكيد وتجاوز الحد',
            cancelText: 'إلغاء وتعديل',
            variant: 'danger',
          });
          if (!confirmExceeded) return;
          proceedWithCreditSale();
        } else {
          setSupervisorPrompt({
            isOpen: true,
            actionTitle: 'تجاوز الحد الائتماني للعميل',
            actionDescription: `رصيد العميل (${selectedCustomer.name}) سيتجاوز الحد الائتماني المحدد (${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}) بمقدار ${formatArabicCurrency(newProjectedBalance - selectedCustomer.creditLimitPiasters)}. يتطلب إتمام العملية موافقة مدير بصلاحية موثقة برقم سري.`,
            onApproved: (_supervisorName, verifiedPin) => {
              setSupervisorPrompt(prev => ({ ...prev, isOpen: false }));
              proceedWithCreditSale(verifiedPin);
            },
          });
        }
        return;
      }

      // Credit through Enter or the button must never create debt silently: short confirm of the two key figures.
      const debtPiasters = Math.max(0, netTotalPiasters - Math.max(0, -selectedCustomer.balancePiasters));
      if (debtPiasters > 0) {
        const confirmOnAccount = await rafiqConfirm({
          title: 'تسجيل الفاتورة على الحساب',
          message: `مفيش كاش هيدخل الدرج.\nالزبون: «${selectedCustomer.name}»\nهيتسجل عليه: ${formatArabicCurrency(debtPiasters)}`,
          confirmText: 'تسجيل على الحساب',
          cancelText: 'تراجع',
          variant: 'warning',
        });
        if (!confirmOnAccount) return;
      }
      proceedWithCreditSale();
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
          message: `المبلغ المدفوع (${formatArabicCurrency(receivedPiasters)}) أقل من قيمة الفاتورة (${formatArabicCurrency(netTotalPiasters)}) بفارق ${formatArabicCurrency(shortAmountPiasters)}.\n\nلتسجيل باقي الحساب كدين آجل، اختر زبوناً من خانة الزبون أو اضغط «تسجيل زبون جديد» أولاً.`,
          variant: 'warning',
        });
        return;
      }

      const newProjectedBalance = (selectedCustomer?.balancePiasters || 0) + shortAmountPiasters;
      const isExceeded = (selectedCustomer?.creditLimitPiasters || 0) > 0 && 
        newProjectedBalance > (selectedCustomer?.creditLimitPiasters || 0);

      const proceedWithShortPayment = (verifiedSupervisorPin?: string) => {
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
          supervisorPin: verifiedSupervisorPin,
        });
      };

      if (isExceeded && selectedCustomer) {
        const canOverride = isRoot || isAdmin || hasPermission('customers.credit_limit_override');
        if (canOverride) {
          const confirmExceeded = await rafiqConfirm({
            title: 'تحذير تجاوز الحد الائتماني للعميل (بصلاحية مدير)',
            message: `دين العميل الحالي: ${formatArabicCurrency(selectedCustomer.balancePiasters)}\nالمبلغ المتبقي كآجل: ${formatArabicCurrency(shortAmountPiasters)}\nإجمالي الدين بعد الفاتورة: ${formatArabicCurrency(newProjectedBalance)}\nالحد الائتماني المسموح: ${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}\n\nهل تؤكد كمدير نظام تجاوز الحد الائتماني وإتمام الفاتورة؟`,
            confirmText: 'متابعة وتجاوز الحد',
            cancelText: 'إلغاء وتعديل المبلغ',
            variant: 'danger',
          });
          if (!confirmExceeded) return;
          proceedWithShortPayment();
        } else {
          setSupervisorPrompt({
            isOpen: true,
            actionTitle: 'تجاوز الحد الائتماني للعميل',
            actionDescription: `دين العميل (${selectedCustomer.name}) سيتجاوز الحد الائتماني المسموح (${formatArabicCurrency(selectedCustomer.creditLimitPiasters)}) بمقدار ${formatArabicCurrency(newProjectedBalance - selectedCustomer.creditLimitPiasters)}. يتطلب إتمام العملية موافقة مدير بصلاحية موثقة برقم سري.`,
            onApproved: (_supervisorName, verifiedPin) => {
              setSupervisorPrompt(prev => ({ ...prev, isOpen: false }));
              proceedWithShortPayment(verifiedPin);
            },
          });
        }
        return;
      }

      const confirmShort = await rafiqConfirm({
        title: 'تسجيل الباقي على الحساب',
        message: `الباقي هيتسجل دين على الزبون «${selectedCustomer?.name || ''}».\nالمبلغ اللي هيتسجل عليه: ${formatArabicCurrency(shortAmountPiasters)}`,
        confirmText: 'حفظ والباقي على الحساب',
        cancelText: 'تراجع',
        variant: 'warning',
      });
      if (!confirmShort) return;
      proceedWithShortPayment();
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
  };

  // Quick cash buttons generator (Exact, next 50, next 100, 200)
  const quickPresetsPiasters = buildCashQuickPresetsPiasters(netTotalPiasters);

  const handlePrintReceiptChange = (value: boolean) => {
    setPrintReceipt(value);
    setReceiptPrintPreference(value);
  };

  // The button names the process (completing the sale), not the technical steps; the print switch beside it says whether a receipt prints.
  let confirmLabel = 'إتمام البيع';
  if (isCreditActive) confirmLabel = 'إتمام البيع على الحساب';
  else if (isShortPayment && hasRegisteredCustomer) confirmLabel = 'إتمام البيع والباقي على الحساب';
  const ConfirmIcon = CheckCircle2;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-4xl h-[min(46rem,100%)] flex flex-col overflow-hidden text-ink dark:text-ink-dark"
      >
        {/* Header (fixed) */}
        <div className="h-16 px-5 bg-surface-2 dark:bg-surface-dark-2 hairline-b flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-brand-soft dark:bg-surface-dark-3 text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="payment-modal-title" className="t-modal-title text-ink dark:text-ink-dark leading-tight m-0">
                حساب الفاتورة واستلام الفلوس والباقي (نقداً)
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 truncate">
                استلمت كام نقداً من الزبون في الدرج، احسب الباقي، وسجل الفاتورة بضغطة زر واحدة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="إغلاق"
            className="w-10 h-10 rounded-lg hover:bg-surface dark:hover:bg-surface-dark-3 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: both columns fill the fixed height; scrolling is only a last resort on very short screens */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2 min-h-0 flex flex-col gap-4">
            <PaymentSummary
              invoiceNumber={invoiceNumber}
              itemCount={itemCount}
              totalItemCount={totalItemCount}
              subtotalPiasters={subtotalPiasters}
              discountPiasters={discountPiasters}
              onDiscountChange={onDiscountChange}
              netTotalPiasters={netTotalPiasters}
            />

            <CustomerPicker
              customerId={currentCustomerId}
              customers={localCustomers}
              onChange={handleCustomerChange}
              customerRequired={isFullCreditMode || isShortPayment}
              quickAddOpen={showQuickAdd}
              onOpenQuickAdd={openQuickAdd}
            >
              <QuickAddCustomerForm
                quickName={quickName}
                setQuickName={setQuickName}
                quickPhone={quickPhone}
                setQuickPhone={setQuickPhone}
                quickSaving={quickSaving}
                duplicateQuickCustomer={duplicateQuickCustomer}
                onSelectDuplicateCustomer={selectDuplicateCustomer}
                onCancel={closeQuickAdd}
                onSubmit={handleQuickAddCustomer}
              />
            </CustomerPicker>
          </div>

          <div className="md:col-span-3 min-h-0 flex flex-col">
            <CashPaymentSection
              receivedInput={receivedInput}
              onReceivedChange={handleReceivedChange}
              receivedInputRef={receivedInputRef}
              netTotalPiasters={netTotalPiasters}
              quickPresetsPiasters={quickPresetsPiasters}
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
          </div>
        </div>

        {/* Footer (fixed height): back, print switch, confirm */}
        <div className="h-[4.5rem] px-5 bg-surface-2 dark:bg-surface-dark-2 hairline-t flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="h-12 px-5 rounded-lg text-sm font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark transition-colors cursor-pointer"
          >
            رجوع لفاتورة البيع
          </button>

          <div className="flex items-center gap-4">
            {/* Capture: Enter on the focused switch confirms the sale like everywhere else; Space toggles it. */}
            <div
              className="flex items-center gap-2.5"
              onKeyDownCapture={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  handleKeyDown(e);
                }
              }}
            >
              <label htmlFor="payment-print-receipt-switch" className="text-sm font-bold text-ink dark:text-ink-dark cursor-pointer whitespace-nowrap">
                طباعة الوصل
              </label>
              <ToggleSwitch
                id="payment-print-receipt-switch"
                size="sm"
                checked={printReceipt}
                onChange={handlePrintReceiptChange}
              />
            </div>

            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={loading}
              className="h-12 min-w-72 px-6 rounded-lg text-sm font-bold bg-brand hover:bg-brand-hover dark:bg-brand-container dark:hover:bg-brand text-white flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <ConfirmIcon className="w-5 h-5 shrink-0" />
              <span>{loading ? 'ثواني، بنكمل البيع...' : confirmLabel}</span>
            </button>
          </div>
        </div>
      </div>

      <SupervisorPromptModal
        isOpen={supervisorPrompt.isOpen}
        actionTitle={supervisorPrompt.actionTitle}
        actionDescription={supervisorPrompt.actionDescription}
        onApproved={supervisorPrompt.onApproved}
        onCancel={() => setSupervisorPrompt(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
