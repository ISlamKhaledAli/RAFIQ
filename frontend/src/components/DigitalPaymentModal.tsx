import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppButton } from './AppButton';
import { 
  Smartphone, 
  Wallet, 
  X, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowRight,
  Receipt,
} from 'lucide-react';
import type { Customer, SalePayment, DigitalAccount } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { pickReceivingAccount } from '../utils/digitalAccounts';
import { invoke } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { CustomerPicker } from './payment/CustomerPicker';
import { QuickAddCustomerForm } from './payment/QuickAddCustomerForm';
import { ReceivingAccountCard } from './payment/ReceivingAccountCard';
import { useQuickAddCustomer } from './payment/useQuickAddCustomer';

import { useModalDismiss } from '../hooks/useModalDismiss';

export interface DigitalPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  method: 'instapay' | 'vodafone_cash';
  onChangeMethod?: (method: 'instapay' | 'vodafone_cash') => void;
  invoiceNumber?: number | null;
  itemCount?: number;
  totalItemCount?: number;
  subtotalPiasters: number;
  discountPiasters: number;
  netTotalPiasters: number;
  selectedCustomerId?: string | null;
  onCustomerChange?: (id: string) => void;
  customers: Customer[];
  onConfirmPayment: (paymentData: {
    paymentMethod: 'instapay' | 'vodafone_cash';
    paidPiasters: number;
    payments: SalePayment[];
    changeDuePiasters: number;
    customerId?: string | null;
    totalPiastersOverride?: number;
    serviceFeeNote?: string;
  }) => void;
  loading?: boolean;
  onNavigateToWallets?: (subTab?: 'accounts' | 'transact') => void;
}

export const DigitalPaymentModal: React.FC<DigitalPaymentModalProps> = ({
  isOpen,
  onClose,
  method,
  invoiceNumber,
  itemCount = 0,
  totalItemCount = 0,
  subtotalPiasters: _subtotalPiasters,
  discountPiasters,
  netTotalPiasters,
  selectedCustomerId,
  onCustomerChange,
  customers,
  onConfirmPayment,
  loading = false,
  onNavigateToWallets,
}) => {
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(selectedCustomerId || null);
  const [digitalAccounts, setDigitalAccounts] = useState<DigitalAccount[]>([]);
  const [storePaymentDetails, setStorePaymentDetails] = useState<{ instapayAddress: string; walletNumber: string }>({
    instapayAddress: '',
    walletNumber: '',
  });
  const { isRoot, isAdmin, hasPermission } = useAuth();
  const canManageAccounts = isRoot || isAdmin || hasPermission('wallets.accounts_manage');
  const prevIsOpenRef = useRef(false);

  const handleCustomerSelect = (id: string) => {
    setCurrentCustomerId(id || null);
    if (onCustomerChange) {
      onCustomerChange(id);
    }
  };

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
  } = useQuickAddCustomer(customers, handleCustomerSelect);

  // Load digital accounts & store direct payment settings
  useEffect(() => {
    if (isOpen) {
      invoke<DigitalAccount[]>('wallets:getAccounts')
        .then((accs) => setDigitalAccounts(accs || []))
        .catch(() => {});
      invoke<Record<string, string>>('settings:getAll')
        .then((s) => {
          if (s) {
            setStorePaymentDetails({
              instapayAddress: s.store_instapay_address || s.instapay_address || '',
              walletNumber: s.store_wallet_number || s.wallet_number || '',
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Sync customer state on modal open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setCurrentCustomerId(selectedCustomerId || null);
      resetQuickAdd();
      prevIsOpenRef.current = true;
    }
    if (!isOpen) {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, selectedCustomerId, resetQuickAdd]);

  const targetAccountType = method === 'instapay' ? 'instapay' : 'wallet';
  // Same rule as the host's sale credit (main account first, else the oldest active one), so the screen names the account that is credited
  const matchedAccount = useMemo(() => pickReceivingAccount(digitalAccounts, targetAccountType), [digitalAccounts, targetAccountType]);

  const customerModified = Boolean(currentCustomerId && currentCustomerId !== (selectedCustomerId || null));
  const isDirty = customerModified || hasQuickAddInput;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل بيانات الزبون؟',
    confirmMessage: 'قمت باختيار زبون أو كتابة بيانات زبون جديد، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة الدفع',
  });

  const isInstapay = method === 'instapay';

  const selectedCustomer = useMemo(() => {
    return localCustomers.find((c) => c && c.id === currentCustomerId);
  }, [localCustomers, currentCustomerId]);

  const handleConfirm = () => {
    if (loading) return;

    onConfirmPayment({
      paymentMethod: method,
      paidPiasters: netTotalPiasters,
      payments: [
        {
          method,
          amountPiasters: netTotalPiasters,
        }
      ],
      changeDuePiasters: 0,
      customerId: currentCustomerId || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter in the quick-add form saves the customer, on a button activates it, in a field (customer search) belongs to that field; none may confirm the sale.
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && !loading && !target.closest('form, button, input, textarea')) {
      e.preventDefault();
      // Stop here so the global confirm-dialog listener never receives this same Enter.
      e.stopPropagation();
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  const storeHandle = isInstapay ? storePaymentDetails.instapayAddress : storePaymentDetails.walletNumber;
  const MethodIcon = isInstapay ? Smartphone : Wallet;
  const totalLabel = formatArabicCurrency(netTotalPiasters, false);
  const balance = selectedCustomer?.balancePiasters ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      dir="rtl"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-4xl h-[min(38.8125rem,92vh)] flex flex-col overflow-hidden text-ink dark:text-ink-dark animate-in fade-in zoom-in-95">

        {/* Fixed outer box: every state (customer, quick-add, account) is laid out inside it, so the dialog never changes size. */}
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 shrink-0 border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <MethodIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="t-modal-title leading-tight m-0 text-ink dark:text-ink-dark">
                {isInstapay ? 'سداد الفاتورة عبر إنستاباي' : 'سداد الفاتورة عبر المحفظة الإلكترونية'}
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-1">
                {isInstapay
                  ? 'معاملة دفع لحظي بنكي مباشر • خارج درج الكاش'
                  : 'فودافون كاش، أورانج كاش، اتصالات كاش، وي باي • خارج درج الكاش'}
              </p>
            </div>
          </div>

          <AppButton variant="subtle" size="lg" icon={X} onClick={() => void requestClose()} aria-label="إغلاق" className="shrink-0" />
        </div>

        {/* Body: section 1 = amount + receiving account, section 2 = customer + confirmation */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] gap-5 content-start">

          {/* Section 1: amount and receiving account */}
          <section className="flex flex-col gap-3 min-w-0" aria-label="المبلغ والحساب">
            <h3 className="t-card-title m-0 flex items-center gap-2 text-ink dark:text-ink-dark">
              <span className="w-6 h-6 rounded-full bg-brand text-white dark:bg-brand-dark-soft dark:text-brand-bright dark:border dark:border-brand-bright/50 flex items-center justify-center text-xs font-bold tabular-nums" aria-hidden="true">1</span>
              <span>المبلغ والحساب</span>
            </h3>

            {/* Total card (the only place the amount is shown) */}
            <div className="rounded-2xl border-2 border-brand/40 dark:border-brand-bright/50 bg-brand-soft dark:bg-brand-dark-soft p-4 flex flex-col items-center gap-3 text-center">
              <span className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted">المبلغ المطلوب استلامه بالتحويل</span>
              <div className="flex items-baseline justify-center gap-2 min-w-0 max-w-full">
                <span className={`${totalLabel.length > 10 ? 'text-3xl' : 'text-4xl'} font-black font-mono tracking-tight tabular-nums leading-none whitespace-nowrap text-brand dark:text-brand-bright`}>
                  {totalLabel}
                </span>
                <span className="text-base font-bold text-ink-muted dark:text-ink-dark-muted shrink-0">ج.م</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 min-h-7">
                <span className="font-mono tabular-nums text-xs font-bold text-paid dark:text-paid-bright bg-surface dark:bg-surface-dark border border-paid-border dark:border-paid-dark-border px-2.5 py-1 rounded-md">
                  فاتورة #{invoiceNumber || '1'}
                </span>
                <span className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 shrink-0" />
                  <span>{itemCount} صنف ({totalItemCount} قطعة)</span>
                </span>
                {discountPiasters > 0 && (
                  <span className="text-xs font-bold tabular-nums text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/40 px-2.5 py-1 rounded-md">
                    خصم: −{formatArabicCurrency(discountPiasters)}
                  </span>
                )}
              </div>
            </div>

            {/* Receiving account: one card shape for every variant so late-loading accounts never resize the dialog */}
            <ReceivingAccountCard
              account={matchedAccount}
              storeHandle={storeHandle}
              isInstapay={isInstapay}
              canManageAccounts={canManageAccounts}
              onNavigateToWallets={
                onNavigateToWallets
                  ? () => {
                      onClose();
                      onNavigateToWallets('accounts');
                    }
                  : undefined
              }
            />
          </section>

          {/* Section 2: customer and confirmation */}
          <section className="flex flex-col gap-3 min-w-0 min-h-0" aria-label="الزبون والتأكيد">
            <h3 className="t-card-title m-0 flex items-center gap-2 text-ink dark:text-ink-dark shrink-0">
              <span className="w-6 h-6 rounded-full bg-brand text-white dark:bg-brand-dark-soft dark:text-brand-bright dark:border dark:border-brand-bright/50 flex items-center justify-center text-xs font-bold tabular-nums" aria-hidden="true">2</span>
              <span>الزبون والتأكيد</span>
            </h3>

            {/* The picker card fills the column; the quick-add form replaces the picker inside it, so nothing resizes. */}
            <CustomerPicker
              customerId={currentCustomerId}
              customers={localCustomers}
              onChange={handleCustomerSelect}
              customerRequired={false}
              quickAddOpen={showQuickAdd}
              onOpenQuickAdd={openQuickAdd}
              hint="اختار الزبون لو عايز الفاتورة تتسجل باسمه."
              status={
                <div className="rounded-lg border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 px-3 py-2 min-h-[4.5rem] flex flex-col justify-center gap-1">
                  {selectedCustomer ? (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">
                          {balance > 0 ? 'كان عليه قديم:' : balance < 0 ? 'له أمانات سابقة:' : 'حسابه القديم:'}
                        </span>
                        <span className={`text-base font-black font-mono tabular-nums ${
                          balance > 0
                            ? 'text-danger dark:text-danger-bright'
                            : balance < 0
                              ? 'text-paid dark:text-paid-bright'
                              : 'text-ink dark:text-ink-dark'
                        }`}>
                          {balance === 0 ? '0.00 ج.م (خالص)' : formatArabicCurrency(Math.abs(balance))}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-paid dark:text-paid-bright flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          مسددة بالكامل • لا تضاف للشكك
                          {balance > 0 ? ' • ديونه القديمة كما هي' : ''}
                        </span>
                      </span>
                    </>
                  ) : (
                    <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 text-center leading-relaxed">
                      اختر زبوناً لعرض موقف حسابه، أو اترك «زبون عادي» للبيع بدون حساب.
                    </p>
                  )}
                </div>
              }
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

            <p className="text-xs text-ink dark:text-ink-dark font-medium m-0 px-3 py-2 rounded-xl border border-warn-border dark:border-warn-bright/40 bg-warn-soft dark:bg-warn-dark-soft flex items-center gap-2 leading-relaxed shrink-0">
              <ShieldCheck className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
              <span>تأكد من وصول الإشعار قبل الضغط على «تأكيد استلام التحويل».</span>
            </p>
          </section>
        </div>

        {/* Footer: always visible, outside the scrolling body */}
        <div className="px-5 py-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center gap-3 shrink-0">
          <AppButton variant="secondary" size="lg" icon={ArrowRight} className="h-12" onClick={() => void requestClose()}>
            رجوع للسلة
          </AppButton>

          <AppButton variant="success" size="lg" icon={CheckCircle2} onClick={handleConfirm} disabled={loading} className="h-12 flex-1">
            {loading ? 'جاري حفظ الفاتورة...' : 'تأكيد استلام التحويل'}
          </AppButton>
        </div>

      </div>
    </div>
  );
};

// Dedicated Wrappers for direct explicit usage
export const InstapayPaymentModal: React.FC<Omit<DigitalPaymentModalProps, 'method'>> = (props) => (
  <DigitalPaymentModal {...props} method="instapay" />
);

export const WalletPaymentModal: React.FC<Omit<DigitalPaymentModalProps, 'method'>> = (props) => (
  <DigitalPaymentModal {...props} method="vodafone_cash" />
);
