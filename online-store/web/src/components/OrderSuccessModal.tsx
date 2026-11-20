import React from 'react';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { CheckCircle2, Clock, ShoppingBag, X, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  orderNumber: number;
  totalPiasters: number;
  storePhone?: string | null;
  storeName: string;
  paymentMethod?: string | null;
  receiptImage?: string | null;
  onClose: () => void;
  onTrackOrder: () => void;
}

export const OrderSuccessModal: React.FC<Props> = ({
  isOpen,
  orderNumber,
  totalPiasters,
  paymentMethod,
  receiptImage,
  onClose,
  onTrackOrder,
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 280);

  if (!mounted) return null;

  const totalPounds = (totalPiasters / 100).toFixed(2);
  const isOnlinePayment = paymentMethod === 'instapay' || paymentMethod === 'vodafone_cash';
  const paymentTitle =
    paymentMethod === 'instapay'
      ? 'إنستاباي'
      : paymentMethod === 'vodafone_cash'
      ? 'فودافون كاش ومحافظ المحمول'
      : 'كاش عند الاستلام (الدفع نقداً)';

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-md bg-store-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-store-line p-5 sm:p-6 text-center space-y-4 bottom-safe transition-[transform,opacity] duration-[280ms] ease-out ${
          visible ? 'translate-y-0 sm:scale-100 opacity-100' : 'translate-y-full sm:translate-y-6 sm:scale-95 opacity-0'
        }`}
      >
        {/* Mobile Swipe Handle */}
        <div className="sm:hidden w-12 h-1.5 bg-store-line rounded-full mx-auto my-1 flex-shrink-0"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full hover:bg-store-primary-light/40 text-store-muted hover:text-store-text transition-colors btn-spring"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-store-primary-light text-store-primary mx-auto flex items-center justify-center shadow-inner">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-lg sm:text-xl font-black text-store-text">تم استلام أوردرك بنجاح!</h2>
          <p className="text-xs text-store-muted mt-1 font-medium">
            وصل طلبك للمحل مباشرة وجاري مراجعته وتجهيزه لحضرتك فوراً
          </p>
        </div>

        {/* Order Receipt Badge */}
        <div className="p-4 rounded-2xl bg-store-primary-light/50 border border-store-primary/20 space-y-1">
          <div className="text-[11px] font-bold text-store-muted">رقم الأوردر بتاعك</div>
          <div className="text-3xl font-black text-store-primary tracking-wider">
            #{orderNumber}
          </div>
          <div className="text-xs font-bold text-store-text pt-1 border-t border-store-primary/10 flex items-center justify-between">
            <span>إجمالي الأوردر:</span>
            <span className="text-store-primary font-black">{totalPounds} ج.م</span>
          </div>
        </div>

        {/* Payment Method Badge */}
        <div className="p-3 bg-store-card-subtle rounded-2xl border border-store-line text-xs flex items-center justify-between">
          <span className="text-store-muted font-medium">طريقة السداد:</span>
          <span className="font-black text-store-text">{paymentTitle}</span>
        </div>

        {/* Online Payment Proof Confirmation */}
        {isOnlinePayment && (
          <div
            className={`p-3.5 rounded-2xl border text-xs space-y-1 text-right ${
              receiptImage
                ? 'bg-store-primary-light/55 border-store-primary/25 text-store-text'
                : 'bg-amber-50 border-amber-200/90 text-amber-950'
            }`}
          >
            <div className="font-black flex items-center gap-1.5">
              <ShieldCheck
                className={`w-4 h-4 flex-shrink-0 ${
                  receiptImage ? 'text-store-primary' : 'text-amber-700'
                }`}
              />
              <span>
                {receiptImage ? 'تم إرفاق إيصال التحويل بنجاح' : 'مراجعة التحويل الإلكتروني'}
              </span>
            </div>
            <p
              className={`text-[11px] leading-relaxed font-medium ${
                receiptImage ? 'text-store-muted' : 'text-amber-800'
              }`}
            >
              {receiptImage
                ? 'وصلت صورة الإيصال مباشرة للوحة المحل والكاشير لمطابقتها وتجهيز طلبك فوراً.'
                : 'وصل طلبك للمحل وجاري التحقق من التحويل وتجهيز الأوردر، ويمكنك متابعة حالته من هنا.'}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={onTrackOrder}
            className="flex items-center justify-center gap-1.5 bg-store-card-subtle hover:bg-store-line border border-store-line text-store-text py-3.5 rounded-2xl text-xs font-bold transition-colors btn-spring"
          >
            <Clock className="w-4 h-4 text-store-muted" />
            <span>متابعة حالة الطلب</span>
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 bg-store-primary hover:bg-store-primary-hover !text-white py-3.5 rounded-2xl text-xs font-black transition-colors btn-spring shadow-sm"
          >
            <ShoppingBag className="w-4 h-4 !text-white" />
            <span className="!text-white">متابعة التسوق</span>
          </button>
        </div>
      </div>
    </div>
  );
};
