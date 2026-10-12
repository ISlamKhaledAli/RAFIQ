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
  AlertTriangle,
  Sparkles,
  CheckCircle
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

  const selectedCustomer = useMemo(() => {
    if (!currentCustomerId || currentCustomerId === 'cust_general_cash') return null;
    return customers.find(c => c && c.id === currentCustomerId) || null;
  }, [customers, currentCustomerId]);

  // Format customer options exactly matching PaymentModal (Image 2)
  const customerOptions = useMemo(() => {
    return [
      { value: '', label: 'زبون عادي كاش (بدون حساب)' },
      ...customers
        .filter(c => c && c.id && c.id !== 'cust_general_cash')
        .map((c) => ({
          value: c.id,
          label: `${c.name} ${c.phone ? `(${c.phone})` : ''} ${
            c.balancePiasters > 0
              ? `[عليه: ${(c.balancePiasters / 100).toFixed(0)} ج.م]`
              : c.balancePiasters < 0
              ? `[له: ${(Math.abs(c.balancePiasters) / 100).toFixed(0)} ج.م]`
              : ''
          }`.trim(),
        }))
    ];
  }, [customers]);

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
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden text-ink animate-in fade-in zoom-in-95 duration-150">
        
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
          <div className="bg-[#f8faf9] border border-[#dce1dc] rounded-2xl p-3 sm:p-4 flex flex-col gap-3 shadow-2xs">
            {/* Meta Strip: Invoice # + Items + Subtotal + Discount */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[#dce1dc]/80 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-ink-muted">فاتورة:</span>
                  <span className="font-mono font-bold text-paid bg-paid-soft border border-paid-border px-2.5 py-0.5 rounded-md shadow-2xs">
                    #{invoiceNumber || '1'}
                  </span>
                </div>

                <div className="text-[11px] text-ink-muted font-medium bg-surface px-2.5 py-0.5 rounded-md border border-line flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-ink-muted" />
                  <span>{itemCount} صنف ({totalItemCount} قطعة)</span>
                </div>
              </div>

              {discountPiasters > 0 && (
                <span className="text-danger font-bold bg-danger-soft px-2.5 py-0.5 rounded-md border border-danger-border text-[11px]">
                  خصم: −{formatArabicCurrency(discountPiasters)}
                </span>
              )}
            </div>

            {/* Customer Row - Exactly matching PaymentModal (Image 2) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <div className="flex items-center gap-1.5 text-xs text-[#006d41] font-bold shrink-0">
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

              {selectedCustomer && (
                selectedCustomer.balancePiasters > 0 ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-danger-soft/40 border-2 border-danger/60 text-danger font-bold text-xs shadow-xs shrink-0 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-danger shrink-0 animate-pulse" />
                    <span>تنبيه: عليه حساب قديم:</span>
                    <span className="font-mono font-black text-sm tabular-nums text-danger">
                      {formatArabicCurrency(selectedCustomer.balancePiasters)}
                    </span>
                  </div>
                ) : selectedCustomer.balancePiasters < 0 ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-paid-soft border-2 border-paid/50 text-paid font-bold text-xs shadow-xs shrink-0 animate-in fade-in">
                    <Sparkles className="w-4 h-4 text-paid shrink-0" />
                    <span>له رصيد سابق في حسابه بالمحل:</span>
                    <span className="font-mono font-black text-sm tabular-nums text-paid">
                      {formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-surface-2 border border-line text-ink-muted text-xs font-semibold shrink-0">
                    <CheckCircle className="w-3.5 h-3.5 text-paid" />
                    <span>حسابه خالص (0.00 ج.م)</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* 2. HERO: Required Transfer Amount Display */}
          <div className={`rounded-2xl border-2 p-5 text-center flex flex-col items-center justify-center gap-2.5 shadow-xs transition-colors duration-200 ${
            isInstapay 
              ? 'bg-purple-50/50 border-purple-200 text-purple-950' 
              : 'bg-red-50/50 border-red-200 text-red-950'
          }`}>
            <span className="text-xs font-bold text-ink-muted">
              المبلغ المطلوب استلامه بالتحويل الإلكتروني
            </span>

            <div className={`text-4xl sm:text-5xl font-black font-mono tracking-tight tabular-nums my-0.5 ${
              isInstapay ? 'text-[#582C83]' : 'text-[#e60000]'
            }`}>
              {formatArabicCurrency(finalTotalPiasters)}
            </div>

            {/* Fee Breakdown pill */}
            <div className="inline-flex items-center gap-2 bg-surface px-3.5 py-1.5 rounded-full border border-line text-xs font-bold text-ink shadow-2xs flex-wrap justify-center">
              <span className="text-ink-muted font-normal">إجمالي المشتريات:</span>
              <span className="font-mono">{formatArabicCurrency(netTotalPiasters)}</span>
              {feePercent > 0 && (
                <>
                  <span className="text-line-hover font-light">•</span>
                  <span className="flex items-center gap-1 text-amber-700">
                    <Percent className="w-3.5 h-3.5" />
                    <span>رسوم خدمة ({feePercent}%): +{formatArabicCurrency(feePiasters)}</span>
                  </span>
                </>
              )}
            </div>

            <p className="text-[11.5px] text-ink-muted font-medium mt-1 mb-0 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-paid shrink-0" />
              <span>تأكد من وصول إشعار التحويل المالي على الحساب قبل تأكيد الفاتورة</span>
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="h-[68px] px-5 bg-surface-2 border-t border-line flex items-center justify-between shrink-0 gap-3">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="h-10 px-4 rounded-xl text-xs font-bold text-ink-muted hover:text-ink hover:bg-surface border border-line transition-all cursor-pointer flex items-center gap-1.5 active:scale-98"
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
