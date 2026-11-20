import React from 'react';
import { BellRing, ShoppingBag, Truck, Store, Volume2, VolumeX, X, ArrowLeft } from 'lucide-react';
import type { OnlineOrderNotificationDto } from '../../bridge/onlineStoreIpc';
import { AppButton } from '../AppButton';

interface Props {
  orders: OnlineOrderNotificationDto[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenOrders: () => void;
  onDismiss: () => void;
}

function formatPiasters(piasters: number): string {
  return (piasters / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatOrderCode(num: number): string {
  return `#ORD-${String(num).padStart(4, '0')}`;
}

function getPaymentLabel(method?: string | null): string {
  const m = (method || '').toLowerCase();
  if (m === 'instapay') return 'إنستاباي';
  if (m === 'vodafone_cash' || m === 'wallet') return 'محفظة إلكترونية';
  return 'كاش عند الاستلام';
}

export const IncomingOrderAlertToast: React.FC<Props> = ({
  orders,
  soundEnabled,
  onToggleSound,
  onOpenOrders,
  onDismiss,
}) => {
  if (!orders || orders.length === 0) return null;

  const latest = orders[0];
  const count = orders.length;
  const totalPiasters = orders.reduce((acc, o) => acc + (o.totalPiasters || 0), 0);
  const isPickup = (latest.deliveryMethod || '').toLowerCase() === 'pickup';

  return (
    <div
      role="alert"
      aria-live="assertive"
      dir="rtl"
      className="fixed top-14 left-1/2 -translate-x-1/2 z-[90] w-[min(94vw,540px)] rounded-2xl bg-surface dark:bg-surface-dark border-2 border-warn shadow-2xl overflow-hidden"
    >
      {/* Top Warm Accent Strip */}
      <div className="h-1.5 w-full bg-warn" />

      <div className="p-4 flex flex-col gap-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 rounded-xl bg-warn-soft dark:bg-warn-dark/25 border border-warn/40 flex items-center justify-center shrink-0">
              <span className="absolute inset-0 rounded-xl bg-warn/25 animate-ping" />
              <BellRing className="relative w-5 h-5 text-warn dark:text-warn-bright" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-extrabold text-ink dark:text-ink-dark">
                  {count === 1 ? 'طلب أونلاين جديد وصل الآن' : `وصل ${count} طلبات أونلاين جديدة الآن`}
                </span>
                <span
                  dir="ltr"
                  className="px-2 py-0.5 rounded-md bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-paid-bright text-micro font-extrabold tabular-nums"
                >
                  {formatOrderCode(latest.orderNumber)}
                </span>
              </div>
              <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-ink dark:text-ink-dark truncate max-w-[10rem]">
                  {latest.customerName || 'عميل المتجر'}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  {isPickup ? <Store className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                  <span>{isPickup ? 'استلام بالمحل' : 'توصيل للمنزل'}</span>
                </span>
                <span>•</span>
                <span>{getPaymentLabel(latest.paymentMethod)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'كتم صوت تنبيه الطلبات' : 'تفعيل صوت تنبيه الطلبات'}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-ink-dark-muted dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-paid" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              title="إغلاق التنبيه مؤقتاً"
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-ink-dark-muted dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary & CTA Footer */}
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-line dark:border-line-dark">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-ink-muted dark:text-ink-dark-muted">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>
                {count === 1
                  ? `${latest.itemsCount || 1} ${(latest.itemsCount || 1) === 1 ? 'صنف' : 'أصناف'}`
                  : `${count} طلبات جديدة`}
              </span>
            </span>
            <span className="text-line-hover">•</span>
            <span dir="ltr" className="text-sm font-extrabold text-paid dark:text-paid-bright tabular-nums">
              {formatPiasters(totalPiasters)} ج.م
            </span>
          </div>

          <div className="flex items-center gap-2">
            <AppButton variant="subtle" size="xs" onClick={onDismiss}>
              لاحقاً
            </AppButton>
            <AppButton variant="primary" size="sm" icon={ArrowLeft} onClick={onOpenOrders}>
              عرض وتجهيز الطلب
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};
