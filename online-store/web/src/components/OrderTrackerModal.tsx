import React, { useState } from 'react';
import type { Order } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { X, Search, Clock, Check, AlertTriangle, Package, Loader2 } from 'lucide-react';
import { playStatusPing, triggerOrderVibration } from './admin/audioChime';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  trackOrderApi: (orderNum: string, phone: string) => Promise<Order>;
}

export const OrderTrackerModal: React.FC<Props> = ({ isOpen, onClose, trackOrderApi }) => {
  const { mounted, visible } = useModalAnimation(isOpen, 280);

  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  if (!mounted) return null;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || !phone) {
      setError('يرجى إدخال رقم الأوردر ورقم الموبايل');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await trackOrderApi(orderNumber.trim(), phone.trim());
      if (order && order.status !== res.status) {
        playStatusPing();
        triggerOrderVibration('status_change');
      }
      setOrder(res);
    } catch (err: any) {
      setError(err.message || 'لم يتم العثور على الأوردر، تأكد من البيانات');
      setOrder(null);
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { key: 'new', label: 'استلمنا الأوردر' },
    { key: 'accepted', label: 'المحل وافق عليه' },
    { key: 'preparing', label: 'بيتجهز في المحل' },
    { key: 'ready', label: 'خرج مع الدليفري' },
    { key: 'delivered', label: 'اتسلم لحضرتك' },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'new':
      case 'viewed':
        return 0;
      case 'accepted':
        return 1;
      case 'preparing':
        return 2;
      case 'ready':
        return 3;
      case 'delivered':
        return 4;
      default:
        return 0;
    }
  };

  const currentIdx = order ? getStepIndex(order.status) : 0;
  const isRejected = order?.status === 'rejected' || (order?.status as string) === 'cancelled';

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-lg bg-store-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-store-line overflow-hidden flex flex-col max-h-[92vh] transition-[transform,opacity] duration-[280ms] ease-out ${
          visible
            ? 'translate-y-0 sm:scale-100 opacity-100'
            : 'translate-y-full sm:translate-y-6 sm:scale-95 opacity-0'
        }`}
      >
        {/* Mobile Swipe Handle */}
        <div className="sm:hidden w-12 h-1.5 bg-store-line rounded-full mx-auto my-2.5 flex-shrink-0"></div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-store-line flex items-center justify-between bg-store-drawer-header flex-shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-store-primary" />
            <h2 className="text-base sm:text-lg font-black text-store-text">تتبع حالة الأوردر</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-store-primary-light/40 text-store-muted hover:text-store-text transition-colors btn-spring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bottom-safe">
          {/* Search Inputs */}
          <form onSubmit={handleTrack} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-store-muted mb-1">رقم الأوردر</label>
                <input
                  type="text"
                  placeholder="مثال: 101"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary font-bold text-center"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-store-muted mb-1">رقم الموبايل</label>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="01x xxxx xxxx"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text text-right focus:outline-none focus:ring-2 focus:ring-store-primary font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-store-primary to-store-secondary hover:brightness-105 disabled:bg-slate-300 text-store-primary-contrast py-3 rounded-2xl font-black text-xs sm:text-sm shadow-md transition-all btn-spring"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>متابعة حالة الأوردر</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="p-3 text-xs font-bold text-rose-800 bg-rose-50 rounded-2xl border border-rose-200 text-center">
              {error}
            </div>
          )}

          {/* Order Details */}
          {order && (
            <div className="space-y-4 pt-3 border-t border-store-line">
              <div className="flex items-center justify-between p-3.5 bg-store-card-subtle rounded-2xl border border-store-line">
                <div>
                  <h3 className="text-base font-black text-store-text">طلب رقم #{order.order_number}</h3>
                  <div className="text-xs text-store-muted font-medium">{order.customer_name}</div>
                </div>
                <div className="text-left">
                  <div className="text-base font-black text-store-primary">{(order.total / 100).toFixed(2)} ج.م</div>
                  <div className="text-[11px] font-bold text-store-muted">
                    {order.delivery_method === 'delivery' ? 'توصيل للمنزل' : 'استلام من المحل'}
                  </div>
                </div>
              </div>

              {/* Status Stepper */}
              {isRejected ? (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-rose-900">تم إلغاء الطلب</h4>
                    <p className="text-xs text-rose-700 mt-0.5 font-medium">
                      السبب: {order.rejection_reason || 'غير متوفر حالياً بالمخزن'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-store-card-subtle border border-store-line">
                  <div className="flex items-center justify-between relative">
                    <div className="absolute top-3.5 left-2 right-2 h-1 bg-store-line z-0"></div>
                    <div
                      className="absolute top-3.5 right-2 h-1 bg-store-primary z-0 transition-all duration-500"
                      style={{ width: `${(currentIdx / (steps.length - 1)) * 95}%` }}
                    ></div>

                    {steps.map((st, i) => {
                      const isDone = i <= currentIdx;
                      return (
                        <div key={st.key} className="relative z-10 flex flex-col items-center">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                              isDone
                                ? 'bg-store-primary text-store-primary-contrast shadow-xs ring-4 ring-store-card'
                                : 'bg-store-card text-store-muted border border-store-line'
                            }`}
                          >
                            {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                          </div>
                          <span className={`text-[9px] sm:text-[10px] mt-1.5 font-bold ${isDone ? 'text-store-primary' : 'text-store-muted'}`}>
                            {st.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items Summary */}
              {order.items && order.items.length > 0 && (
                <div className="bg-store-card-subtle rounded-2xl p-3.5 border border-store-line space-y-2">
                  <div className="text-xs font-bold text-store-muted flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> الأصناف المطلوبة:
                  </div>
                  {order.items.map((it, idx) => {
                    const displayQty = it.quantity >= 100 ? Number((it.quantity / 1000).toFixed(3)) : it.quantity;
                    return (
                      <div key={idx} className="flex justify-between text-xs py-1 border-b border-store-line last:border-none">
                        <span className="font-bold text-store-text">{it.product_name} × {displayQty}</span>
                        <span className="font-black text-store-primary">{(it.line_total / 100).toFixed(2)} ج.م</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
