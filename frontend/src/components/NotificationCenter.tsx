import React, { useState, useEffect, memo } from 'react';
import {
  Bell,
  AlertTriangle,
  KeyRound,
  Database,
  Sparkles,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import type { SystemNotificationItem } from '../utils/useSystemNotifications';

interface NotificationCenterProps {
  notifications: SystemNotificationItem[];
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onCloseDrawer: () => void;
}

/**
 * Top Header Bell Button with active alert badge counter
 */
export const NotificationBellButton: React.FC<{
  count: number;
  hasCritical: boolean;
  isOpen: boolean;
  onClick: () => void;
}> = memo(({ count, hasCritical, isOpen, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center w-8.5 h-8.5 min-w-[34px] min-h-[34px] rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 ${
        isOpen
          ? 'bg-[#00372d] text-white border-[#00372d] shadow-xs'
          : count > 0
          ? hasCritical
            ? 'bg-rose-50 text-rose-800 border-rose-300 hover:border-rose-400 hover:bg-rose-100/60'
            : 'bg-amber-50 text-amber-900 border-amber-300 hover:border-amber-400 hover:bg-amber-100/60'
          : 'bg-white text-[#52605d] border-[#dce1dc] hover:border-[#006d41] hover:text-[#006d41] hover:bg-[#eaf5ee]/50'
      }`}
      title={count > 0 ? `مركز الإشعارات والتنبيهات (${count} تنبيه نشط)` : 'مركز الإشعارات (لا توجد تنبيهات)'}
      aria-label="مركز الإشعارات"
    >
      <Bell
        className={`w-4 h-4 shrink-0 transition-transform ${
          hasCritical ? 'text-[#b23a2e]' : count > 0 ? 'text-[#b3720e]' : 'text-[#52605d]'
        }`}
      />
      {count > 0 && (
        <span
          className={`absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black font-mono flex items-center justify-center text-white border-2 border-white shadow-xs pointer-events-none select-none ${
            hasCritical ? 'bg-[#b23a2e]' : 'bg-[#b3720e]'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
});

/**
 * Notification Center Popover / Drawer
 */
export const NotificationCenterDrawer: React.FC<NotificationCenterProps> = memo(
  ({ notifications, isDrawerOpen, onCloseDrawer }) => {
    if (!isDrawerOpen) return null;

    const renderIcon = (iconType: SystemNotificationItem['iconType'], type: SystemNotificationItem['type']) => {
      switch (iconType) {
        case 'clock':
        case 'readonly':
          return <AlertTriangle className="w-4 h-4 text-amber-600" />;
        case 'license':
          return <Sparkles className="w-4 h-4 text-blue-600" />;
        case 'expiry':
          return <KeyRound className="w-4 h-4 text-rose-600" />;
        case 'backup':
          return <Database className="w-4 h-4 text-emerald-600" />;
        case 'stock':
          return <AlertTriangle className="w-4 h-4 text-rose-600" />;
        case 'demo':
          return <FlaskConical className="w-4 h-4 text-amber-600" />;
        default:
          return type === 'critical' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          ) : (
            <Bell className="w-4 h-4 text-[#006d41]" />
          );
      }
    };

    return (
      <div className="fixed inset-0 z-50 overflow-hidden" onClick={onCloseDrawer}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20 backdrop-blur-2xs transition-opacity" />

        {/* Popover Card positioned nicely below the header on the left side (RTL direction) */}
        <div
          className="absolute top-16 left-6 w-[420px] max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-[#dce1dc] shadow-2xl overflow-hidden flex flex-col z-50 animate-in slide-in-from-top-2 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-[#00372d] text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-emerald-300">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>مركز التنبيهات والإشعارات</span>
                <span className="text-[10px] bg-white/20 text-emerald-200 font-mono px-2 py-0.5 rounded-full font-bold">
                  {notifications.length}
                </span>
              </h3>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List of Notifications */}
          <div className="p-3 max-h-[70vh] overflow-y-auto flex flex-col gap-2.5 bg-[#f8fafc]">
            {notifications.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center text-[#52605d]">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 opacity-80" />
                <p className="text-sm font-bold text-[#0f172a]">كافة الأنظمة تعمل بشكل سليم</p>
                <p className="text-xs mt-1 text-[#52605d]">لا توجد أي تنبيهات أو متطلبات صيانة معلقة حالياً.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border text-right transition-all shadow-2xs relative flex flex-col gap-2 ${
                    item.type === 'critical'
                      ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                      : item.type === 'warning'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                      : item.type === 'info'
                      ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white border border-black/5 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        {renderIcon(item.iconType, item.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-[#0f172a]">{item.title}</span>
                          {item.badge && (
                            <span
                              className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-md ${
                                item.type === 'critical'
                                  ? 'bg-rose-600 text-white'
                                  : item.type === 'warning'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-[#52605d] leading-relaxed mt-1 font-medium whitespace-pre-line">
                          {item.message}
                        </p>
                      </div>
                    </div>

                    {item.dismissible && item.onDismiss && (
                      <button
                        type="button"
                        onClick={item.onDismiss}
                        className="text-[#52605d] hover:text-[#0f172a] p-1 rounded hover:bg-black/5 transition-colors cursor-pointer shrink-0"
                        title="إخفاء"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Actions / Live Counter footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-black/5 mt-1 text-xs">
                    {item.countdown ? (
                      <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-rose-700">
                        <Clock className="w-3.5 h-3.5" />
                        <span>متبقي: {item.countdown}</span>
                      </div>
                    ) : (
                      <span className="text-[10.5px] text-[#52605d]">تنبيه نظام معتمد</span>
                    )}

                    {item.actionLabel && item.onAction && (
                      <button
                        type="button"
                        onClick={() => {
                          item.onAction?.();
                          onCloseDrawer();
                        }}
                        className="bg-[#00372d] hover:bg-[#002820] text-white text-[11px] font-bold px-3 py-1 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
                      >
                        {item.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }
);

/**
 * Compact Single-line Alert Bar (Height ~34px)
 * Displays only the single top-priority alert, with cycling arrows and CTA.
 */
export const CompactAlertTickerBar: React.FC<{
  notifications: SystemNotificationItem[];
  onOpenDrawer: () => void;
  isDismissed: boolean;
  onDismissTicker: () => void;
}> = memo(({ notifications, onOpenDrawer, isDismissed, onDismissTicker }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep index within bounds if notifications change
  useEffect(() => {
    if (currentIndex >= notifications.length && notifications.length > 0) {
      setCurrentIndex(0);
    }
  }, [notifications.length, currentIndex]);

  if (notifications.length === 0 || isDismissed) return null;

  const current = notifications[currentIndex] || notifications[0];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % notifications.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + notifications.length) % notifications.length);
  };

  const isCritical = current.type === 'critical';
  const isWarning = current.type === 'warning';
  const isInfo = current.type === 'info';

  const barBg = isCritical
    ? 'bg-[#fff1f2] border-b border-[#fecdd3] text-[#881337]'
    : isWarning
    ? 'bg-[#fffbeb] border-b border-[#fde68a] text-[#78350f]'
    : isInfo
    ? 'bg-[#eff6ff] border-b border-[#bfdbfe] text-[#1e3a8a]'
    : 'bg-[#f0fdf4] border-b border-[#bbf7d0] text-[#14532d]';

  return (
    <div
      className={`h-[34px] px-4 flex items-center justify-between text-[11.5px] font-medium shrink-0 select-none shadow-2xs animate-in slide-in-from-top-1 duration-150 ${barBg}`}
    >
      {/* Right side: Badge + Message + Cycling */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        {/* Priority Badge */}
        {current.badge && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-2xs ${
              isCritical
                ? 'bg-rose-600 text-white'
                : isWarning
                ? 'bg-amber-600 text-white'
                : isInfo
                ? 'bg-blue-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {current.badge}
          </span>
        )}

        {/* Message */}
        <span className="truncate font-semibold text-xs">{current.message}</span>

        {/* Live Countdown if present */}
        {current.countdown && (
          <span className="font-mono font-bold bg-white/70 px-2 py-0.5 rounded border border-rose-300 text-rose-800 text-[11px] shrink-0">
            متبقي: {current.countdown}
          </span>
        )}

        {/* Multi-notification ticker indicator (e.g. 1/3) */}
        {notifications.length > 1 && (
          <div className="flex items-center gap-1 bg-black/5 px-2 py-0.5 rounded-md font-mono text-[10.5px] font-bold shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="hover:text-black p-0.5 cursor-pointer"
              title="السابق"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <span>
              {currentIndex + 1} / {notifications.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="hover:text-black p-0.5 cursor-pointer"
              title="التالي"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Left side: Action Button + View All + Dismiss */}
      <div className="flex items-center gap-2 shrink-0">
        {current.actionLabel && current.onAction && (
          <button
            type="button"
            onClick={current.onAction}
            className={`text-white text-[11px] font-bold px-3 py-1 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 ${
              isCritical
                ? 'bg-rose-600 hover:bg-rose-700'
                : isWarning
                ? 'bg-amber-700 hover:bg-amber-800'
                : isInfo
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-emerald-700 hover:bg-emerald-800'
            }`}
          >
            <span>{current.actionLabel}</span>
          </button>
        )}

        {notifications.length > 1 && (
          <button
            type="button"
            onClick={onOpenDrawer}
            className="text-[11px] font-bold underline hover:opacity-80 px-1 cursor-pointer flex items-center gap-1"
          >
            <Layers className="w-3 h-3" />
            <span>عرض الكل ({notifications.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDismissTicker}
          className="hover:bg-black/10 text-current p-1 rounded-md transition-colors cursor-pointer"
          title="طي شريط التنبيهات (يبقى في جرس الإشعارات)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

