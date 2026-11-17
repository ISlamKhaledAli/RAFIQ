import React from 'react';
import type { AdminOrder } from './OrderPrintReceipt';
import {
  Clock,
  Phone,
  MessageSquare,
  AlertCircle,
  PackageCheck,
  Truck,
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react';

interface Props {
  orders: AdminOrder[];
  onSelectOrder: (order: AdminOrder) => void;
  onUpdateStatus: (orderId: string, newStatus: string) => void;
  storeName: string;
}

export const KanbanBoardView: React.FC<Props> = ({
  orders,
  onSelectOrder,
  onUpdateStatus,
  storeName,
}) => {
  const columns = [
    {
      id: 'new',
      title: 'أوردرات جديدة',
      subtitle: 'محتاجة مراجعة وتأكيد',
      theme: 'border-amber-200 bg-amber-50/40 text-amber-900',
      badge: 'bg-amber-100 text-amber-800',
      icon: AlertCircle,
      nextStatus: 'accepted',
      nextLabel: 'قبول وتجهيز',
    },
    {
      id: 'accepted',
      title: 'بيتجهز في المحل',
      subtitle: 'تعبئة وتغليف الأوردر',
      theme: 'border-blue-200 bg-blue-50/40 text-blue-900',
      badge: 'bg-blue-100 text-blue-800',
      icon: PackageCheck,
      nextStatus: 'ready',
      nextLabel: 'تسليم للدليفري',
    },
    {
      id: 'ready',
      title: 'خرج مع الدليفري',
      subtitle: 'في الطريق للزبون',
      theme: 'border-purple-200 bg-purple-50/40 text-purple-900',
      badge: 'bg-purple-100 text-purple-800',
      icon: Truck,
      nextStatus: 'delivered',
      nextLabel: 'اتسلم للزبون',
    },
    {
      id: 'delivered',
      title: 'اتسلم للزبون',
      subtitle: 'أوردرات مكتملة ومتحصلة',
      theme: 'border-emerald-200 bg-emerald-50/40 text-emerald-900',
      badge: 'bg-emerald-100 text-emerald-800',
      icon: CheckCircle2,
      nextStatus: null,
      nextLabel: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto pb-4">
      {columns.map(col => {
        const colOrders = orders.filter(o => o.status === col.id);
        const ColIcon = col.icon;

        return (
          <div
            key={col.id}
            className="flex flex-col bg-slate-50/80 rounded-3xl border border-slate-200/90 overflow-hidden min-h-[460px]"
          >
            {/* Column Header */}
            <div className={`p-4 border-b ${col.theme} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <ColIcon className="w-4 h-4" />
                <div>
                  <h4 className="text-xs font-black">{col.title}</h4>
                  <p className="text-[10px] opacity-75">{col.subtitle}</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${col.badge}`}>
                {colOrders.length}
              </span>
            </div>

            {/* Column Cards Feed */}
            <div className="p-3 flex-1 overflow-y-auto space-y-3">
              {colOrders.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                  <span className="text-xs font-medium">لا توجد طلبات هنا</span>
                </div>
              ) : (
                colOrders.map(ord => (
                  <div
                    key={ord.id}
                    onClick={() => onSelectOrder(ord)}
                    className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer space-y-2.5 text-right btn-spring"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-slate-900">
                        #ORD-{ord.order_number}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {ord.created_at}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-black text-slate-800 truncate">
                        {ord.customer_name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {ord.address_zone} • {ord.address_street}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                        {ord.items.length} أصناف
                      </span>
                      <span className="font-black text-store-primary font-mono">
                        {(ord.total / 100).toFixed(2)} ج.م
                      </span>
                    </div>

                    {/* Quick WhatsApp & Call + Advance Button */}
                    <div className="pt-1 flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            window.location.href = `tel:${ord.customer_phone}`;
                          }}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          title="اتصال"
                        >
                          <Phone className="w-3 h-3 text-store-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const cleanPhone = ord.customer_phone.replace(/^0+/, '');
                            const msg = encodeURIComponent(
                              `مرحباً أستاذ ${ord.customer_name}، نتواصل معك من ${storeName} بخصوص طلبك رقم #ORD-${ord.order_number}`
                            );
                            window.open(`https://wa.me/20${cleanPhone}?text=${msg}`, '_blank');
                          }}
                          className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                          title="واتساب"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </button>
                      </div>

                      {col.nextStatus && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onUpdateStatus(ord.id, col.nextStatus!);
                          }}
                          className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1 transition-all"
                        >
                          <span>{col.nextLabel}</span>
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
