import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Smartphone, 
  Wallet, 
  X, 
  CheckCircle2, 
  UserCheck, 
  ShieldCheck, 
  ArrowRight,
  Receipt,
  Percent,
} from 'lucide-react';
import type { Customer, SalePayment } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { CustomSelect } from './CustomSelect';

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
  instapayFeePercent?: number;
  vodafoneCashFeePercent?: number;
  loading?: boolean;
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
  instapayFeePercent = 1,
  vodafoneCashFeePercent = 1,
  loading = false,
}) => {
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(selectedCustomerId || null);
  const prevIsOpenRef = useRef(false);

  // Sync customer state on modal open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setCurrentCustomerId(selectedCustomerId || null);
      prevIsOpenRef.current = true;
    }
    if (!isOpen) {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, selectedCustomerId]);

  const isDirty = Boolean(currentCustomerId && currentCustomerId !== (selectedCustomerId || null));

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل اختيار الزبون؟',
    confirmMessage: 'قمت باختيار زبون للفاتورة، هل تريد الخروج وتجاهل الاختيار؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة الدفع',
  });

  const isInstapay = method === 'instapay';
  const feePercent = isInstapay ? instapayFeePercent : vodafoneCashFeePercent;
  const feePiasters = Math.round(netTotalPiasters * (feePercent / 100));
  const finalTotalPiasters = netTotalPiasters + feePiasters;

  // Format customer options exactly matching PaymentModal (Image 2)
  const customerOptions = useMemo(() => {
    return [
      { value: '', label: 'زبون عادي كاش (بدون حساب)' },
      ...customers
        .filter(c => c && c.id && c.id !== 'cust_general_cash')
        .map((c) => ({
          value: c.id,
          label: c.name,
        }))
    ];
  }, [customers]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c && c.id === currentCustomerId);
  }, [customers, currentCustomerId]);

  const handleCustomerSelect = (id: string) => {
    setCurrentCustomerId(id || null);
    if (onCustomerChange) {
      onCustomerChange(id);
    }
  };

  const handleConfirm = () => {
    if (loading) return;

    onConfirmPayment({
      paymentMethod: method,
      paidPiasters: finalTotalPiasters,
      totalPiastersOverride: finalTotalPiasters,
      payments: [
        {
          method,
          amountPiasters: finalTotalPiasters,
        }
      ],
      changeDuePiasters: 0,
      customerId: currentCustomerId || undefined,
      serviceFeeNote: feePiasters > 0
        ? `رسوم خدمة إلكترونية (${isInstapay ? 'انستاباي' : 'محفظة إلكترونية'} ${feePercent}%): +${(feePiasters / 100).toFixed(2)} ج.م`
        : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      dir="rtl"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden text-ink dark:text-ink-dark animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header - Specialized for the active method */}
        <div className={`h-[68px] px-5 flex items-center justify-between shrink-0 text-white transition-colors duration-200 ${
          isInstapay ? 'bg-[#582C83]' : 'bg-[#e60000]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs text-white flex items-center justify-center shadow-inner">
              {isInstapay ? (
                <Smartphone className="w-5 h-5 text-purple-100" />
              ) : (
                <Wallet className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-base font-black leading-tight m-0 text-white">
                {isInstapay 
                  ? 'سداد الفاتورة عبر انستاباي (InstaPay)' 
                  : 'سداد الفاتورة عبر المحفظة الإلكترونية'}
              </h2>
              <p className="text-xs text-white/80 m-0 mt-0.5">
                {isInstapay
                  ? 'معاملة دفع لحظي بنكي مباشر • خارج درج الكاش الورقي'
                  : 'فودافون كاش، أورانج كاش، اتصالات كاش، وي باي • خارج درج الكاش'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void requestClose()}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
          
          {/* 1. Complete Invoice Meta & Customer Row (Top Section) */}
          <div className="bg-[#f8faf9] dark:bg-surface-dark-2 border border-[#dce1dc] dark:border-line-dark rounded-2xl p-3 sm:p-4 flex flex-col gap-3 shadow-2xs">
            {/* Meta Strip: Invoice # + Items + Subtotal + Discount */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[#dce1dc]/80 dark:border-line-dark text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-ink-muted dark:text-ink-dark-muted">فاتورة:</span>
                  <span className="font-mono font-bold text-paid dark:text-brand-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-2.5 py-0.5 rounded-md shadow-2xs">
                    #{invoiceNumber || '1'}
                  </span>
                </div>

                <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-medium bg-surface dark:bg-surface-dark-3 px-2.5 py-0.5 rounded-md border border-line dark:border-line-dark flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                  <span>{itemCount} صنف ({totalItemCount} قطعة)</span>
                </div>
              </div>

              {discountPiasters > 0 && (
                <span className="text-danger dark:text-danger-bright font-bold bg-danger-soft dark:bg-danger-dark-soft px-2.5 py-0.5 rounded-md border border-danger-border dark:border-danger-bright/30 text-[11px]">
                  خصم: −{formatArabicCurrency(discountPiasters)}
                </span>
              )}
            </div>

            {/* Customer Row - Exactly matching PaymentModal (Image 2) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <div className="flex items-center gap-1.5 text-xs text-[#006d41] dark:text-brand-bright font-bold shrink-0">
                  <UserCheck className="w-4 h-4" />
                  <span>الزبون:</span>
                </div>

                <div className="flex-1 min-w-0">
                  <CustomSelect
                    value={currentCustomerId || ''}
                    onChange={handleCustomerSelect}
                    options={customerOptions}
                    placeholder="اختر عميل للربط..."
                    className="w-full"
                    size="sm"
                    searchable
                  />
                </div>
              </div>
            </div>

            {/* Customer Account Status & Debt Breakdown (موقف حساب الزبون مع انستاباي/المحفظة) */}
            {selectedCustomer && (
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-white/95 dark:bg-surface-dark-3 border text-center font-mono shadow-2xs mt-1 ${
                isInstapay ? 'border-purple-200 dark:border-purple-800/40' : 'border-red-200 dark:border-red-800/40'
              }`}>
                {/* 1. كان عليه قديم */}
                <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                  <span className="text-[11px] font-sans text-ink-muted dark:text-ink-dark-muted mb-0.5">
                    {selectedCustomer.balancePiasters > 0
                      ? 'كان عليه قديم:'
                      : selectedCustomer.balancePiasters < 0
                        ? 'له أمانات سابقة:'
                        : 'حسابه القديم:'}
                  </span>
                  <span className={`text-base font-black ${
                    selectedCustomer.balancePiasters > 0
                      ? 'text-danger'
                      : selectedCustomer.balancePiasters < 0
                        ? 'text-paid dark:text-brand-bright'
                        : 'text-ink dark:text-ink-dark'
                  }`}>
                    {selectedCustomer.balancePiasters === 0 
                      ? '0.00 ج.م (خالص)' 
                      : formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))}
                  </span>
                </div>

                {/* 2. الفاتورة الحالية (مسددة بالتحويل) */}
                <div className={`flex flex-col items-center justify-center p-2 rounded-lg border ${
                  isInstapay ? 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/30' : 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30'
                }`}>
                  <span className="text-[11px] font-sans text-ink-muted dark:text-ink-dark-muted mb-0.5">
                    الفاتورة الحالية ({isInstapay ? 'انستاباي' : 'محفظة'}):
                  </span>
                  <span className={`text-base font-black ${isInstapay ? 'text-[#582C83] dark:text-purple-300' : 'text-danger dark:text-danger-bright'}`}>
                    {formatArabicCurrency(finalTotalPiasters)}
                  </span>
                  <span className="text-[10px] font-sans font-bold text-paid dark:text-brand-bright mt-0.5">
                    مسددة بالكامل • لا تضاف للشكك
                  </span>
                </div>

                {/* 3. إجمالي حسابه بعد الفاتورة */}
                <div className={`flex flex-col items-center justify-center p-2 rounded-lg border ${
                  selectedCustomer.balancePiasters > 0
                    ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                    : selectedCustomer.balancePiasters < 0
                      ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid/30 text-paid dark:text-paid-bright'
                      : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark'
                }`}>
                  <span className="text-[11px] font-sans font-bold mb-0.5">
                    {selectedCustomer.balancePiasters > 0
                      ? 'إجمالي اللي عليه بعد الفاتورة:'
                      : selectedCustomer.balancePiasters < 0
                        ? 'يظل في رصيده بالمحل:'
                        : 'حسابه بعد الفاتورة:'}
                  </span>
                  <span className="text-base sm:text-lg font-black">
                    {selectedCustomer.balancePiasters === 0
                      ? '0.00 ج.م (خالص)'
                      : formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))}
                  </span>
                  {selectedCustomer.balancePiasters > 0 && (
                    <span className="text-[10px] font-sans font-medium text-ink-muted dark:text-ink-dark-muted mt-0.5">
                      ديونه القديمة تظل بدون تغيير
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. HERO: Required Transfer Amount Display */}
          <div className={`rounded-2xl border-2 p-5 text-center flex flex-col items-center justify-center gap-2.5 shadow-xs transition-colors duration-200 ${
            isInstapay 
              ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40 text-purple-950 dark:text-purple-200' 
              : 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
          }`}>
            <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
              المبلغ المطلوب استلامه بالتحويل الإلكتروني
            </span>

            <div className={`text-4xl sm:text-5xl font-black font-mono tracking-tight tabular-nums my-0.5 ${
              isInstapay ? 'text-[#582C83] dark:text-purple-300' : 'text-danger dark:text-danger-bright'
            }`}>
              {formatArabicCurrency(finalTotalPiasters)}
            </div>

            {/* Fee Breakdown pill */}
            <div className="inline-flex items-center gap-2 bg-surface dark:bg-surface-dark-3 px-3.5 py-1.5 rounded-full border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark shadow-2xs flex-wrap justify-center">
              <span className="text-ink-muted dark:text-ink-dark-muted font-normal">إجمالي المشتريات:</span>
              <span className="font-mono">{formatArabicCurrency(netTotalPiasters)}</span>
              {feePercent > 0 && (
                <>
                  <span className="text-line-hover dark:text-line-dark-strong font-light">•</span>
                  <span className="flex items-center gap-1 text-amber-700 dark:text-warn-bright">
                    <Percent className="w-3.5 h-3.5" />
                    <span>رسوم خدمة ({feePercent}%): +{formatArabicCurrency(feePiasters)}</span>
                  </span>
                </>
              )}
            </div>

            <p className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted font-medium mt-1 mb-0 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-paid dark:text-brand-bright shrink-0" />
              <span>تأكد من وصول إشعار التحويل المالي على الحساب قبل تأكيد الفاتورة</span>
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="h-[68px] px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between shrink-0 gap-3">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="h-10 px-4 rounded-xl text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark transition-all cursor-pointer flex items-center gap-1.5 active:scale-98"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للسلة</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`h-10 px-6 rounded-xl text-xs sm:text-sm font-black text-white transition-all shadow-md active:scale-98 cursor-pointer flex items-center gap-2 ${
              isInstapay 
                ? 'bg-[#582C83] hover:bg-[#462269] active:bg-[#371954]' 
                : 'bg-[#e60000] hover:bg-[#cc0000] active:bg-[#b30000]'
            } disabled:opacity-50 disabled:pointer-events-none`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-white/90" />
            <span>{loading ? 'جاري حفظ الفاتورة...' : 'تأكيد استلام التحويل وحفظ الفاتورة'}</span>
          </button>
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
