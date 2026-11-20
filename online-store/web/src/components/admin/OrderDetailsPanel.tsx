import React, { useState, useEffect } from 'react';
import type { AdminOrder } from './OrderPrintReceipt';
import type { Store } from '../../types';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import {
  Clock,
  MapPin,
  Phone,
  MessageSquare,
  Navigation,
  ExternalLink,
  Printer,
  CheckCircle2,
  PackageCheck,
  Truck,
  XCircle,
  FileText,
  CreditCard,
  X,
  Check,
  ShoppingBag,
  ArrowRight,
  Image as ImageIcon,
  ZoomIn,
  Download,
} from 'lucide-react';

interface Props {
  order: AdminOrder;
  store: Store;
  onUpdateStatus: (orderId: string, newStatus: string) => void;
  onPrintReceipt: (order: AdminOrder) => void;
  onCloseMobile?: () => void;
}

export const OrderDetailsPanel: React.FC<Props> = ({
  order,
  store,
  onUpdateStatus,
  onPrintReceipt,
  onCloseMobile,
}) => {
  // Store packaging checklist state: resets cleanly whenever merchant switches selected order
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [isReceiptZoomOpen, setIsReceiptZoomOpen] = useState(false);

  useEffect(() => {
    setCheckedItems({});
    setIsReceiptZoomOpen(false);
  }, [order.id]);

  useEffect(() => {
    if (!isReceiptZoomOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsReceiptZoomOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReceiptZoomOpen]);

  const checkedCount = order.items.reduce((acc, _, idx) => acc + (checkedItems[idx] ? 1 : 0), 0);

  const toggleItemChecked = (index: number) => {
    setCheckedItems(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const isNew = order.status === 'new' || order.status === 'viewed';
  const isAccepted = order.status === 'accepted' || order.status === 'preparing';
  const isReady = order.status === 'ready';
  const isDelivered = order.status === 'delivered';
  const isRejected = order.status === 'rejected' || order.status === 'cancelled';

  // Stepper steps configuration
  const steps = [
    { key: 'new', label: 'استلمنا الأوردر', icon: Clock },
    { key: 'accepted', label: 'بيتجهز في المحل', icon: PackageCheck },
    { key: 'ready', label: 'خرج مع الدليفري', icon: Truck },
    { key: 'delivered', label: 'اتسلم للزبون', icon: CheckCircle2 },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'new':
      case 'viewed':
        return 0;
      case 'accepted':
      case 'preparing':
        return 1;
      case 'ready':
        return 2;
      case 'delivered':
        return 3;
      default:
        return 0;
    }
  };

  const currentStepIdx = getStepIndex(order.status);

  // Context-aware WhatsApp link generator
  const getWhatsAppUrl = () => {
    const statusLine = isReady
      ? `أوردرك رقم #ORD-${order.order_number} خرج مع الدليفري وفي الطريق لحضرتك دلوقتي.`
      : isAccepted
      ? `تم قبول أوردرك رقم #ORD-${order.order_number} وجاري تجهيزه في المحل حالياً.`
      : isDelivered
      ? `تم تسليم أوردرك رقم #ORD-${order.order_number} بنجاح، نتمنى أن ينال إعجابك.`
      : `بنكلمك من ${store.name} بخصوص أوردرك رقم #ORD-${order.order_number}.`;
    return buildWhatsAppUrl(
      order.customer_phone,
      `مرحباً أستاذ ${order.customer_name}، ${statusLine}`
    );
  };

  return (
    <div className="bg-store-card rounded-3xl border border-store-line shadow-sm flex flex-col overflow-hidden text-right transition-colors duration-300">
      {/* 1. Header & Stepper Bar */}
      <div className="p-4 sm:p-5 bg-store-card-subtle border-b border-store-line">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="lg:hidden p-2 rounded-xl bg-store-card border border-store-line text-store-text hover:bg-store-card-subtle transition-colors btn-spring"
                title="الرجوع لقائمة الطلبات"
              >
                <ArrowRight className="w-4 h-4 text-store-text" />
              </button>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-store-text font-mono">
                  #ORD-{order.order_number}
                </h2>
                <span className="text-[11px] text-store-muted font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {order.created_at}
                </span>
              </div>
              <div className="text-xs text-store-muted font-medium mt-0.5">
                أوردر أونلاين • دليفري إلى <strong className="text-store-text">{order.address_zone}</strong>
              </div>
            </div>
          </div>

          {/* Quick Print & Close */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrintReceipt(order)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-store-text bg-store-card hover:bg-store-card-subtle border border-store-line transition-colors btn-spring shadow-2xs"
              title="طباعة بون الأوردر الحراري"
            >
              <Printer className="w-4 h-4 text-store-muted" />
              <span className="hidden sm:inline">طباعة بون الأوردر</span>
            </button>

            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="lg:hidden p-2 rounded-xl text-store-muted hover:text-store-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Status Stepper Progression Line with Connected Track */}
        <div className="pt-2 pb-1">
          <div className="grid grid-cols-4 gap-2 relative">
            {/* Connecting Progression Track Line */}
            <div className="absolute top-4 right-[12.5%] left-[12.5%] h-1 bg-slate-200 rounded-full -translate-y-1/2 z-0">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(currentStepIdx / 3) * 100}%` }}
              />
            </div>

            {steps.map((st, idx) => {
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const StepIcon = st.icon;

              return (
                <div key={st.key} className="flex flex-col items-center text-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all mb-1.5 shadow-xs ${
                      isPast
                        ? 'bg-emerald-600 text-white ring-4 ring-emerald-50'
                        : isCurrent
                        ? 'bg-store-primary text-white ring-4 ring-slate-100 shadow-md'
                        : 'bg-white text-slate-400 border-2 border-slate-200'
                    }`}
                  >
                    {isPast ? (
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                    ) : (
                      <StepIcon
                        className={`w-4 h-4 ${isCurrent ? 'text-white stroke-[2.5]' : 'text-slate-400 stroke-2'}`}
                      />
                    )}
                  </div>
                  <span
                    className={`text-[11px] transition-colors ${
                      isCurrent
                        ? 'text-store-primary font-black'
                        : isPast
                        ? 'text-emerald-700 font-bold'
                        : 'text-slate-400 font-medium'
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Order Details Content Grid */}
      <div className="p-4 sm:p-6 overflow-y-auto space-y-5 max-h-[calc(100vh-280px)]">
        {/* Customer & Delivery Card */}
        <div className="bg-store-card-subtle p-4 rounded-2xl border border-store-line space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black text-store-muted uppercase tracking-wider block">
                بيانات الزبون والتواصل
              </span>
              <div className="text-sm font-black text-store-text mt-0.5">{order.customer_name}</div>
              <div className="text-xs text-store-muted font-mono mt-0.5" dir="ltr">
                {order.customer_phone} {order.alt_phone ? `• ${order.alt_phone}` : ''}
              </div>
            </div>

            {/* Direct Call & WhatsApp Action Buttons */}
            <div className="flex items-center gap-2">
              <a
                href={`tel:${order.customer_phone}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-store-card hover:bg-store-line text-store-text text-xs font-bold border border-store-line transition-colors btn-spring shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5 text-store-primary" />
                <span>اتصال هاتفي</span>
              </a>

              <a
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 !text-white text-xs font-bold transition-colors btn-spring shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5 !text-white" />
                <span className="!text-white">مراسلة واتساب</span>
              </a>
            </div>
          </div>

          {/* Structured Delivery Address */}
          <div className="pt-3 border-t border-slate-200/60">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-store-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-slate-900 leading-relaxed">
                  المنطقة: <strong className="text-store-primary">{order.address_zone}</strong> • الشارع:{' '}
                  {order.address_street} {order.address_building ? `• ${order.address_building}` : ''}
                </div>
                {(order.address_floor_apt || order.address_landmark) && (
                  <div className="text-slate-600 font-medium">
                    {order.address_floor_apt ? `${order.address_floor_apt} • ` : ''}
                    علامة مميزة: <strong className="text-slate-800">{order.address_landmark}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Google Maps Live Pin */}
            {order.maps_url && (
              <div className="mt-3">
                <a
                  href={order.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3.5 py-1.5 rounded-xl text-xs font-bold btn-spring shadow-2xs transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5 text-blue-600" />
                  <span>فتح موقع العميل على خرائط جوجل (Google Maps)</span>
                  <ExternalLink className="w-3 h-3 text-blue-500" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Items Packing Checklist Card */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-store-primary" />
              <span className="text-xs font-black text-slate-800">
                أصناف الطلب وقائمة التحضير ({order.items.length})
              </span>
              {order.items.length > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
                    checkedCount === order.items.length
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {checkedCount}/{order.items.length} مجهّز
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              اضغط على الصنف لتعليمه كـ "تم التجهيز"
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {order.items.map((it, idx) => {
              const isChecked = !!checkedItems[idx];
              return (
                <div
                  key={idx}
                  onClick={() => toggleItemChecked(idx)}
                  className={`p-3.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                    isChecked ? 'bg-emerald-50/40 text-slate-400' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </div>

                    <div>
                      <div
                        className={`font-bold truncate ${
                          isChecked ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {it.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {it.quantity} {it.unit} × {(it.unit_price / 100).toFixed(2)} ج.م
                      </div>
                    </div>
                  </div>

                  <div className="text-left flex-shrink-0">
                    <span className="font-black text-store-primary font-mono">
                      {(it.total_price / 100).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold mr-1">ج.م</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subtotal, Delivery Fee & Grand Total */}
          <div className="p-3.5 bg-slate-50/80 border-t border-slate-200 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-500 font-medium">
              <span>حساب الأصناف:</span>
              <span className="font-mono font-bold">{(order.subtotal / 100).toFixed(2)} ج.م</span>
            </div>
            <div className="flex justify-between text-slate-500 font-medium">
              <span>مصاريف الدليفري ({order.address_zone}):</span>
              <span className="font-mono font-bold">{(order.delivery_fee / 100).toFixed(2)} ج.م</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>المطلوب تحصيله من الزبون:</span>
              <span className="text-store-primary font-mono text-base">
                {(order.total / 100).toFixed(2)} ج.م
              </span>
            </div>
          </div>
        </div>

        {/* Payment & Customer Notes Callout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Payment Method Details */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3 h-3" />
              <span>طريقة الدفع ومصدر التحويل</span>
            </span>
            <div className="font-bold text-slate-900">{order.payment_method}</div>
            {order.sender_phone && (
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span>الحساب / الرقم المحوّل منه:</span>
                <span className="font-mono font-bold text-slate-800" dir="ltr">
                  {order.sender_phone}
                </span>
              </div>
            )}
            {order.payment_ref && (
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span>رقم العملية / المرجع:</span>
                <span className="font-mono font-bold text-slate-800" dir="ltr">
                  {order.payment_ref}
                </span>
              </div>
            )}

            {/* Transfer Receipt Image Proof */}
            {order.receipt_image ? (
              <div className="pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-black text-store-primary flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>إيصال التحويل المرفق</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsReceiptZoomOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-store-primary-light hover:bg-store-primary/15 text-store-primary border border-store-primary/20 text-[11px] font-bold transition-colors btn-spring"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>تكبير الصورة</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReceiptZoomOpen(true)}
                  className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white block text-right focus:outline-none focus:ring-2 focus:ring-store-primary"
                  title="اضغط لتكبير صورة الإيصال"
                >
                  <img
                    src={order.receipt_image}
                    alt={`إيصال تحويل أوردر #ORD-${order.order_number}`}
                    className="w-full max-h-48 object-contain bg-slate-100/70 transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/75 text-white text-[10px] font-bold">
                    <ZoomIn className="w-3 h-3" />
                    <span>معاينة كاملة</span>
                  </span>
                </button>
              </div>
            ) : (
              (order.payment_method.includes('إنستاباي') ||
                order.payment_method.includes('InstaPay') ||
                order.payment_method.includes('فودافون')) && (
                <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 font-medium">
                  لم يُرفق العميل صورة إيصال — تحقق من وصول التحويل أو تواصل معه عبر واتساب.
                </div>
              )
            )}
          </div>

          {/* Notes */}
          <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/70 space-y-1.5">
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span>ملاحظات الزبون على الأوردر</span>
            </span>
            <div className="text-xs text-amber-900 font-medium leading-relaxed">
              {order.notes || 'مفيش ملاحظات خاصة مسجلة على الأوردر ده.'}
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Lightbox Modal */}
      {isReceiptZoomOpen && order.receipt_image && (
        <div
          onClick={() => setIsReceiptZoomOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]"
          >
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-store-primary flex-shrink-0" />
                  <span>إيصال التحويل — أوردر #ORD-{order.order_number}</span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  {order.payment_method}
                  {order.sender_phone ? ` • ${order.sender_phone}` : ''}
                  {order.payment_ref ? ` • المرجع: ${order.payment_ref}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a
                  href={order.receipt_image}
                  download={`receipt-ORD-${order.order_number}.jpg`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-store-primary-light text-store-primary hover:bg-store-primary/15 text-xs font-bold transition-colors"
                  title="فتح أو تحميل الإيصال"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>حفظ</span>
                </a>
                <button
                  type="button"
                  onClick={() => setIsReceiptZoomOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-900/5 overflow-auto flex-1 flex items-center justify-center">
              <img
                src={order.receipt_image}
                alt={`إيصال تحويل أوردر #ORD-${order.order_number}`}
                className="max-w-full max-h-[72vh] object-contain rounded-xl shadow-md bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Sticky Bottom Action Controls */}
      <div className="p-4 bg-store-card-subtle border-t border-store-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPrintReceipt(order)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-store-card hover:bg-store-line text-store-text text-xs font-bold border border-store-line transition-colors btn-spring shadow-2xs"
          >
            <Printer className="w-4 h-4 text-store-muted" />
            <span>طباعة البون</span>
          </button>
        </div>

        {/* Primary Action Button based on Workflow */}
        <div className="flex items-center gap-2 flex-wrap">
          {(isNew || isAccepted) && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order.id, 'rejected')}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold btn-spring transition-all"
            >
              <XCircle className="w-4 h-4" />
              <span>رفض / إلغاء</span>
            </button>
          )}

          {isNew && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order.id, 'accepted')}
              className="flex items-center gap-2 px-5 py-2.5 bg-store-primary hover:opacity-90 !text-white rounded-xl text-xs font-black shadow-md btn-spring transition-all"
            >
              <PackageCheck className="w-4 h-4 !text-white" />
              <span className="!text-white">قبول وبدء تجهيز الأوردر</span>
            </button>
          )}

          {isAccepted && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-bold">
              <Printer className="w-4 h-4 text-amber-600 shrink-0" />
              <span>الأوردر قيد التجهيز بالمحل — تسليم الطلب للدليفري وطباعة البون يتم حصراً من شاشة الكاشير في رفيق POS لخصم المخزن وحساب الخزنة.</span>
            </div>
          )}

          {isReady && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order.id, 'delivered')}
              className="flex items-center gap-2 px-5 py-2.5 bg-store-primary hover:opacity-90 !text-white rounded-xl text-xs font-black shadow-md btn-spring transition-all"
            >
              <CheckCircle2 className="w-4 h-4 !text-white" />
              <span className="!text-white">تأكيد تسليم الأوردر للزبون</span>
            </button>
          )}

          {isDelivered && (
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-store-primary-light text-store-primary border border-store-primary/20 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-store-primary" />
              <span>الأوردر اتسلم للزبون بنجاح</span>
            </div>
          )}

          {isRejected && (
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>تم رفض / إلغاء هذا الأوردر</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
