import React, { useState, memo, useMemo } from 'react';
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
  DownloadCloud,
} from 'lucide-react';
import type { SystemNotificationItem } from '../utils/useSystemNotifications';
import { useExitList, useExitTransition, useExitValue } from '../hooks/useExitTransition';

import { AppButton } from './AppButton';
interface NotificationCenterProps {
  notifications: SystemNotificationItem[];
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onCloseDrawer: () => void;
}

/**
 * Top Header Bell Button with active alert badge counter
 * Harmonized with light top header bar and design tokens
 */
export const NotificationBellButton: React.FC<{
  count: number;
  hasCritical: boolean;
  isOpen: boolean;
  onClick: () => void;
}> = memo(({ count, hasCritical, isOpen, onClick }) => {
  const buttonStyle = useMemo(() => {
    if (hasCritical) {
      return isOpen
        ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger dark:border-danger-bright/60 ring-2 ring-danger/30 shadow-xs'
        : 'bg-danger-soft/70 dark:bg-danger-dark-soft/80 text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/40 hover:bg-danger-soft dark:hover:bg-danger-dark-soft hover:border-danger dark:hover:border-danger-bright/60 shadow-2xs';
    }
    if (count > 0) {
      return isOpen
        ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn dark:border-warn-bright/60 ring-2 ring-warn/30 shadow-xs'
        : 'bg-warn-soft/70 dark:bg-warn-dark-soft/80 text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/40 hover:bg-warn-soft dark:hover:bg-warn-dark-soft hover:border-warn dark:hover:border-warn-bright/60 shadow-2xs';
    }
    return isOpen
      ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand dark:border-brand-bright ring-2 ring-brand/25 shadow-xs'
      : 'bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark hover:border-paid dark:hover:border-brand-bright hover:text-paid dark:hover:text-brand-bright hover:bg-paid-soft/50 dark:hover:bg-brand-dark-soft shadow-2xs';
  }, [count, hasCritical, isOpen]);

  // The badge pops (index.css, motion on only) when the count goes up; the a / b phase restarts it without remounting
  const [pop, setPop] = useState<{ count: number; phase: 'a' | 'b' | null }>({ count, phase: null });
  if (pop.count !== count) {
    setPop({ count, phase: count > pop.count ? (pop.phase === 'a' ? 'b' : 'a') : pop.phase });
  }

  const iconColor = hasCritical
    ? 'text-danger dark:text-danger-bright'
    : count > 0
    ? 'text-warn dark:text-warn-bright'
    : isOpen
    ? 'text-brand dark:text-brand-bright'
    : 'text-ink-muted dark:text-ink-muted-dark group-hover:text-paid dark:group-hover:text-brand-bright';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative group flex items-center justify-center w-8.5 h-8.5 min-w-[2.125rem] min-h-[2.125rem] rounded-xl border transition-all cursor-pointer ${buttonStyle}`}
      title={count > 0 ? `مركز الإشعارات والتنبيهات (${count} تنبيه نشط)` : 'مركز الإشعارات (لا توجد تنبيهات)'}
      aria-label={count > 0 ? `مركز الإشعارات، ${count} تنبيه نشط` : 'مركز الإشعارات'}
    >
      <Bell className={`w-4 h-4 shrink-0 transition-transform ${iconColor}`} />
      {count > 0 && (
        <span
          data-pop={pop.phase ?? undefined}
          className={`absolute -top-2 -end-2 min-w-[1.25rem] h-5 px-1 rounded-full text-micro font-black font-mono flex items-center justify-center text-white border-2 border-surface dark:border-surface-dark shadow-xs pointer-events-none select-none ${
            hasCritical ? 'bg-danger' : 'bg-warn'
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
    const { mounted, exiting } = useExitTransition(isDrawerOpen);
    const rows = useExitList(notifications, mounted);
    if (!mounted) return null;

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
        case 'update':
          return <DownloadCloud className="w-4 h-4 text-emerald-600" />;
        default:
          return type === 'critical' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          ) : (
            <Bell className="w-4 h-4 text-paid dark:text-paid-bright" />
          );
      }
    };

    return (
      <div className="fixed inset-0 z-50 overflow-hidden" onClick={onCloseDrawer}>
        {/* Backdrop */}
        <div
          className="motion-modal-backdrop motion-exit-fade absolute inset-0 bg-black/20 backdrop-blur-2xs transition-opacity"
          data-exiting={exiting || undefined}
        />

        {/* Popover Card positioned nicely below the header on the left side (RTL direction) */}
        <div
          className="absolute top-16 left-6 w-[26.25rem] max-w-[calc(100vw-32px)] bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col z-50 motion-exit-popup animate-in slide-in-from-top-2 duration-150"
          data-exiting={exiting || undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-brand-dark text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-paid-soft">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="t-card-title text-white m-0">مركز التنبيهات والإشعارات</h3>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="إغلاق"
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List of Notifications */}
          <div className="p-3 max-h-[70vh] overflow-y-auto flex flex-col gap-2.5 bg-surface-2 dark:bg-surface-dark-2">
            {rows.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted">
                <CheckCircle2 className="w-10 h-10 text-paid dark:text-brand-bright mb-2 opacity-80" />
                <p className="text-sm font-bold text-ink dark:text-ink-dark">كافة الأنظمة تعمل بشكل سليم</p>
                <p className="text-xs mt-1 text-ink-muted dark:text-ink-dark-muted">لا توجد أي تنبيهات أو متطلبات صيانة معلقة حالياً.</p>
              </div>
            ) : (
              rows.map(({ item, exiting: leaving }) => (
                <div
                  key={item.id}
                  className="motion-exit-collapse [--rq-collapse-gap:0.625rem]"
                  data-exiting={leaving || undefined}
                  inert={leaving || undefined}
                >
                <div>
                <div
                  className={`p-3 rounded-xl border text-right transition-all shadow-2xs relative flex flex-col gap-2 ${
                    item.type === 'critical'
                      ? 'bg-danger-soft/90 dark:bg-danger-dark-soft/90 border-danger-border dark:border-danger/30 text-danger-ink dark:text-danger-bright'
                      : item.type === 'warning'
                      ? 'bg-warn-soft/90 dark:bg-warn-dark-soft/90 border-warn-border dark:border-warn/30 text-ink dark:text-ink-dark'
                      : item.type === 'info'
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-200'
                      : 'bg-paid-soft/80 dark:bg-paid-dark-soft/80 border-paid-border dark:border-paid/30 text-paid dark:text-brand-bright'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        {renderIcon(item.iconType, item.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-ink dark:text-ink-dark">{item.title}</span>
                          {item.badge && (
                            <span
                              className={`text-micro font-bold px-1.5 py-0.2 rounded-md ${
                                item.type === 'critical'
                                  ? 'bg-danger text-white'
                                  : item.type === 'warning'
                                  ? 'bg-warn text-white dark:bg-warn-dark-soft dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed mt-1 font-medium whitespace-pre-line">
                          {item.message}
                        </p>
                      </div>
                    </div>

                    {item.dismissible && item.onDismiss && (
                      <AppButton variant="subtle" size="xs" icon={X} className="shrink-0" onClick={item.onDismiss} title="إخفاء" aria-label="إخفاء" />
                    )}
                  </div>

                  {/* Actions / Live Counter footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/10 mt-1 text-xs">
                    {item.countdown ? (
                      <div className="flex items-center gap-1 font-mono text-micro font-bold text-danger dark:text-danger-bright">
                        <Clock className="w-3.5 h-3.5" />
                        <span>متبقي: {item.countdown}</span>
                      </div>
                    ) : (
                      <span className="text-micro text-ink-muted dark:text-ink-dark-muted">تنبيه نظام معتمد</span>
                    )}

                    {item.actionLabel && item.onAction && (
                      <AppButton
                        variant="primary"
                        size="xs"
                        onClick={() => {
                          item.onAction?.();
                          onCloseDrawer();
                        }}
                      >
                        {item.actionLabel}
                      </AppButton>
                    )}
                  </div>
                </div>
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
  // The bar keeps its last content while it plays the exit (dismissed, or the last alert went away)
  const bar = useExitValue(notifications.length > 0 && !isDismissed ? notifications : null);
  const list = bar.value;

  if (!list) return null;

  const safeIndex = currentIndex >= list.length ? 0 : currentIndex;
  const current = list[safeIndex] || list[0];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % list.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + list.length) % list.length);
  };

  const isCritical = current.type === 'critical';
  const isWarning = current.type === 'warning';
  const isInfo = current.type === 'info';

  const barBg = isCritical
    ? 'bg-danger-soft dark:bg-danger-dark-soft border-b border-danger-border dark:border-danger-bright/30 text-danger-ink dark:text-danger-bright'
    : isWarning
    ? 'bg-warn-soft dark:bg-warn-dark-soft border-b border-warn-border dark:border-warn-bright/30 text-warn dark:text-warn-bright'
    : isInfo
    ? 'bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
    : 'bg-paid-soft dark:bg-paid-dark-soft border-b border-paid-border dark:border-paid/30 text-paid dark:text-brand-bright';

  return (
    <div className="motion-exit-collapse shrink-0" data-exiting={bar.exiting || undefined} inert={bar.exiting || undefined}>
    <div>
    <div
      className={`h-[2.125rem] px-4 flex items-center justify-between text-micro font-medium shrink-0 select-none shadow-2xs animate-in slide-in-from-top-1 duration-150 ${barBg}`}
    >
      {/* Right side: Badge + Message + Cycling */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        {/* Priority Badge */}
        {current.badge && (
          <span
            className={`text-micro font-bold px-2 py-0.5 rounded-full shrink-0 shadow-2xs ${
              isCritical
                ? 'bg-danger text-white'
                : isWarning
                ? 'bg-warn text-white dark:bg-warn-bright dark:text-surface-dark'
                : isInfo
                ? 'bg-blue-600 text-white'
                : 'bg-paid text-white'
            }`}
          >
            {current.badge}
          </span>
        )}

        {/* Message */}
        <span className="truncate font-semibold text-xs">{current.message}</span>

        {/* Live Countdown if present */}
        {current.countdown && (
          <span className="font-mono font-bold bg-surface/80 dark:bg-danger-dark-soft px-2 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-micro shrink-0 shadow-2xs">
            متبقي: {current.countdown}
          </span>
        )}

        {/* Multi-notification ticker indicator (e.g. 1/3) */}
        {list.length > 1 && (
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-md font-mono text-micro font-bold shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="hover:text-black dark:hover:text-ink-dark p-0.5 cursor-pointer"
              title="السابق"
              aria-label="التنبيه السابق"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <span>
              {safeIndex + 1} / {list.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="hover:text-black dark:hover:text-ink-dark p-0.5 cursor-pointer"
              title="التالي"
              aria-label="التنبيه التالي"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Left side: Action Button + View All + Dismiss */}
      <div className="flex items-center gap-2 shrink-0">
        {current.actionLabel && current.onAction && (
          <AppButton variant={isCritical ? 'danger' : isWarning ? 'warning' : isInfo ? 'primary' : 'success'} size="xs" onClick={current.onAction}>
            {current.actionLabel}
          </AppButton>
        )}

        {list.length > 1 && (
          <AppButton variant="subtle" size="xs" icon={Layers} onClick={onOpenDrawer}>
            عرض الكل
          </AppButton>
        )}

        <AppButton
          variant="subtle"
          size="xs"
          icon={X}
          onClick={onDismissTicker}
          title="طي شريط التنبيهات (يبقى في جرس الإشعارات)"
          aria-label="طي شريط التنبيهات"
        />
      </div>
    </div>
    </div>
    </div>
  );
});

