import React from 'react';
import type { AdminOrder } from './OrderPrintReceipt';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import {
  Clock,
  MapPin,
  Phone,
  MessageSquare,
  AlertCircle,
  PackageCheck,
  Truck,
  CheckCircle2,
  ChevronLeft,
  XCircle,
  Image as ImageIcon,
} from 'lucide-react';

interface Props {
  order: AdminOrder;
  isSelected: boolean;
  onSelect: (order: AdminOrder) => void;
  storeName: string;
}

const OrderCardItemComponent: React.FC<Props> = ({
  order,
  isSelected,
  onSelect,
  storeName,
}) => {
  const itemsCount = order.items.reduce((sum, it) => sum + (it.quantity || 1), 0);

  // Status visual mapping
  const statusConfig = {
    new: {
      label: 'جديد - محتاج تأكيد',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500 animate-pulse',
      icon: AlertCircle,
    },
    viewed: {
      label: 'جديد - تم العرض',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      icon: AlertCircle,
    },
    accepted: {
      label: 'بيتجهز في المحل',
      bg: 'bg-blue-50 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
      icon: PackageCheck,
    },
    preparing: {
      label: 'بيتجهز في المحل',
      bg: 'bg-blue-50 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
      icon: PackageCheck,
    },
    ready: {
      label: 'مع الدليفري في الطريق',
      bg: 'bg-purple-50 text-purple-800 border-purple-200',
      dot: 'bg-purple-500',
      icon: Truck,
    },
    delivered: {
      label: 'اتسلم للزبون',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    rejected: {
      label: 'ملغي / مرفوض',
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      dot: 'bg-rose-500',
      icon: XCircle,
    },
    cancelled: {
      label: 'ملغي',
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      dot: 'bg-rose-500',
      icon: XCircle,
    },
  }[order.status] || {
    label: order.status,
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    icon: Clock,
  };

  const StatusIcon = statusConfig.icon;

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildWhatsAppUrl(
      order.customer_phone,
      `مرحباً أستاذ ${order.customer_name}، بنكلمك من ${storeName} بخصوص أوردرك رقم #ORD-${order.order_number}`
    );
    window.open(url, '_blank');
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${order.customer_phone}`;
  };

  return (
    <div
      onClick={() => onSelect(order)}
      className={`group relative p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer text-right btn-spring ${
        isSelected
          ? 'bg-store-primary-light/35 border-2 border-store-primary shadow-sm'
          : 'bg-store-card border-store-line hover:border-store-primary/40 hover:shadow-xs'
      }`}
    >
      {/* Active Left Indicator Bar on Desktop */}
      {isSelected && (
        <span className="hidden lg:block absolute right-0 top-3 bottom-3 w-1 bg-store-primary rounded-l-md" />
      )}

      {/* Top Bar: Order # + Time + Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs sm:text-sm font-black text-store-text tracking-wide">
            #ORD-{order.order_number}
          </span>
          <span className="text-[11px] text-store-muted font-medium flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3 h-3 text-store-muted flex-shrink-0" />
            <span>{order.created_at}</span>
          </span>
        </div>

        {/* Status Badge */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${statusConfig.bg}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
          <StatusIcon className="w-3 h-3" />
          <span>{statusConfig.label}</span>
        </span>
      </div>

      {/* Customer Name & Zone */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-black text-store-text truncate">
            {order.customer_name}
          </div>
          <div className="text-[11px] text-store-muted flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 text-store-primary flex-shrink-0" />
            <span className="truncate">{order.address_zone}</span>
            {order.address_street && (
              <span className="truncate text-store-muted">• {order.address_street}</span>
            )}
          </div>
        </div>

        {/* Quick Contact Buttons on Mobile / Card */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={handleCallClick}
            className="p-1.5 rounded-lg bg-store-card-subtle hover:bg-store-line text-store-text border border-store-line transition-colors btn-spring"
            title="اتصال هاتفي بالعميل"
          >
            <Phone className="w-3.5 h-3.5 text-store-primary" />
          </button>
          <button
            type="button"
            onClick={handleWhatsAppClick}
            className="p-1.5 rounded-lg bg-store-primary-light/60 hover:bg-store-primary-light text-store-primary border border-store-primary/20 transition-colors btn-spring"
            title="مراسلة واتساب"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Summary Bar: Items Preview & Grand Total */}
      <div className="pt-2 border-t border-store-line flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold text-store-text bg-store-card-subtle border border-store-line px-2 py-0.5 rounded-md">
            {itemsCount} {itemsCount > 1 ? 'أصناف' : 'صنف'}
          </span>
          <span className="text-[10px] text-store-muted font-medium truncate bg-store-card-subtle border border-store-line px-1.5 py-0.5 rounded-md">
            {order.payment_method}
          </span>
          {order.receipt_image && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-store-primary bg-store-primary-light border border-store-primary/25 px-1.5 py-0.5 rounded-md flex-shrink-0">
              <ImageIcon className="w-2.5 h-2.5" />
              <span>إيصال</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-sm font-black text-store-primary font-mono">
            {(order.total / 100).toFixed(2)}
          </span>
          <span className="text-[10px] font-bold text-store-muted">ج.م</span>
          <ChevronLeft className="w-3.5 h-3.5 text-store-muted group-hover:text-store-primary group-hover:-translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
};

export const OrderCardItem = React.memo(OrderCardItemComponent);
