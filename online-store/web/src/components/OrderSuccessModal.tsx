import React from 'react';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { CheckCircle2, MessageSquare, Clock, ArrowRight, ShoppingBag, X, ShieldCheck, Check } from 'lucide-react';

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
  storePhone,
  storeName,
  paymentMethod,
  receiptImage,
  onClose,
  onTrackOrder,
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 300);

  if (!mounted) return null;

  const totalPounds = (totalPiasters / 100).toFixed(2);
  const isOnlinePayment = paymentMethod === 'instapay' || paymentMethod === 'vodafone_cash';
  const paymentTitle =
    paymentMethod === 'instapay'
      ? 'إنستاباي (InstaPay)'
      : paymentMethod === 'vodafone_cash'
      ? 'فودافون كاش ومحافظ المحمول'
      : 'كاش عند الاستلام (الدفع نقداً)';

  const whatsappMsg = encodeURIComponent(
    isOnlinePayment
      ? `مرحباً ${storeName}، قمت بطلب أوردر جديد رقم (#${orderNumber}) بقيمة ${totalPounds} ج.م وتم سداده عبر (${paymentTitle}). ومرفق إشعار/إيصال التحويل للتأكيد الفوري.`
      : `مرحباً ${storeName}، قمت بطلب أوردر جديد رقم (#${orderNumber}) بقيمة ${totalPounds} ج.م من المتجر الإلكتروني.`
  );

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 transition-all duration-300 ease-in-out ${
        visible ? 'opacity-100 backdrop-blur-md' : 'opacity-0 backdrop-blur-none pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 p-5 sm:p-6 text-center space-y-4 bottom-safe transition-all duration-300 ease-in-out ${
          visible ? 'translate-y-0 sm:scale-100 opacity-100' : 'translate-y-full sm:translate-y-6 sm:scale-95 opacity-0'
        }`}
      >
        {/* Mobile Swipe Handle */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-1 flex-shrink-0"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors btn-spring"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-store-primary-light text-store-primary mx-auto flex items-center justify-center shadow-inner">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900">تم استلام طلبك بنجاح!</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            سيقوم فريق العمل بمراجعة وتجهيز طلبك على الفور
          </p>
        </div>

        {/* Order Receipt Badge */}
        <div className="p-4 rounded-2xl bg-store-primary-light/50 border border-store-primary/20 space-y-1">
          <div className="text-[11px] font-bold text-slate-600">رقم الطلب الخاص بك</div>
          <div className="text-3xl font-black text-store-primary tracking-wider">
            #{orderNumber}
          </div>
          <div className="text-xs font-bold text-slate-800 pt-1 border-t border-store-primary/10 flex items-center justify-between">
            <span>إجمالي الطلب:</span>
            <span className="text-store-primary font-black">{totalPounds} ج.م</span>
          </div>
        </div>

        {/* Payment Method Badge */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex items-center justify-between">
          <span className="text-slate-500 font-medium">طريقة السداد:</span>
          <span className="font-black text-slate-900">{paymentTitle}</span>
        </div>

        {/* Online Payment Proof Notice */}
        {isOnlinePayment && (
          <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/90 text-xs text-amber-950 space-y-1 text-right">
            <div className="font-black flex items-center gap-1.5 text-amber-950">
              <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>تأكيد وتوثيق السداد الإلكتروني:</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
              {receiptImage
                ? 'تم إرفاق إيصال التحويل مع طلبك بنجاح، وسيقوم الكاشير بمطابقته فورياً.'
                : 'لضمان خروج الأوردر فوراً، يُرجى إرسال لقطة شاشة التحويل عبر واتساب المتجر.'}
            </p>
          </div>
        )}

        {/* WhatsApp Sharing Button */}
        {storePhone && (
          <a
            href={`https://wa.me/2${storePhone.replace(/^0+/, '')}?text=${whatsappMsg}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-4 rounded-2xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all btn-spring"
          >
            <MessageSquare className="w-4 h-4" />
            <span>
              {isOnlinePayment ? 'إرسال إيصال وتأكيد التحويل عبر واتساب' : 'إرسال تفاصيل الطلب عبر واتساب المحل'}
            </span>
          </a>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={onTrackOrder}
            className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-2xl text-xs font-bold transition-colors btn-spring"
          >
            <Clock className="w-4 h-4 text-slate-600" />
            <span>متابعة حالة الطلب</span>
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-2xl text-xs font-bold transition-colors btn-spring"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>متابعة التسوق</span>
          </button>
        </div>
      </div>
    </div>
  );
};
