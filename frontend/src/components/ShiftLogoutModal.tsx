import React, { useEffect } from 'react';
import { Clock, AlertTriangle, LogOut, X, Wallet, DollarSign } from 'lucide-react';
import { AppButton } from './AppButton';
import type { Shift } from '../types/models';
import { formatArabicCurrency, formatDateTime } from '../utils/money';

export interface ShiftLogoutModalProps {
  isOpen: boolean;
  shift: Shift | null;
  cashierName?: string;
  onClose: () => void;
  onConfirmLogout: () => void;
  onOpenShiftClose: () => void;
}

export const ShiftLogoutModal: React.FC<ShiftLogoutModalProps> = ({
  isOpen,
  shift,
  cashierName,
  onClose,
  onConfirmLogout,
  onOpenShiftClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !shift) return null;

  const totalCashInDrawer = shift.expectedCashPiasters ?? (shift.openingFloatPiasters + shift.cashSalesPiasters);
  const displayName = shift.cashierName || cashierName || 'كاشير';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in select-none"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="shift-logout-title"
    >
      <div className="w-full max-w-lg bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden flex flex-col transform transition-all animate-scale-up">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-warn via-warn to-warn" />

        {/* Header */}
        <div className="bg-surface dark:bg-surface-dark px-6 py-4 flex items-center justify-between border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-warn/25 dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center shrink-0 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright" />
            </div>
            <div>
              <h3 id="shift-logout-title" className="text-base font-extrabold text-ink dark:text-ink-dark m-0">
                تنبيه: توجد وردية مفتوحة حالياً
              </h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                تنبيه قبل تسجيل الخروج من النظام
              </p>
            </div>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={onClose} />
        </div>

        {/* Content Body */}
        <div className="p-6 bg-surface-2 dark:bg-surface-dark-2 space-y-4">
          <div className="p-3.5 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/25 dark:border-warn-bright/30 flex items-start gap-3 text-xs font-semibold text-warn dark:text-warn-bright leading-relaxed">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              أنت على وشك تسجيل الخروج بينما لا تزال هناك وردية كاشير نشطة ومفتوحة. يُرجى مراجعة بيانات الوردية أدناه قبل المغادرة.
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-ink dark:text-ink-dark">
                  وردية #{shift.shiftNumber ?? 1}
                </span>
                <span className="px-2 py-0.5 text-micro font-bold rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/30">
                  مفتوحة ونشطة
                </span>
              </div>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                الكاشير: {displayName}
              </span>
            </div>

            <div className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
              <span>تاريخ ووقت الفتح:</span>
              <span className="text-ink dark:text-ink-dark font-mono">
                {formatDateTime(shift.openedAt)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                <div className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 mb-1">
                  <Wallet className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                  <span>عهدة الدرج البداية</span>
                </div>
                <div className="text-sm font-extrabold text-ink dark:text-ink-dark tabular-nums font-mono">
                  {formatArabicCurrency(shift.openingFloatPiasters)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                <div className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 mb-1">
                  <DollarSign className="w-3 h-3 text-paid dark:text-paid-bright" />
                  <span>المتوقع بالدرج الآن</span>
                </div>
                <div className="text-sm font-extrabold text-paid dark:text-paid-bright tabular-nums font-mono">
                  {formatArabicCurrency(totalCashInDrawer)}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
            إذا كنت قد أنهيت ساعات عملك، نوصيك بالضغط على <strong className="text-ink dark:text-ink-dark">"تقفيل وتشميع الوردية"</strong> لجرد الدرج وطباعة التقرير. إذا كنت تريد مغادرة الجهاز مؤقتاً أو ترك الوردية للكاشير التالي، اضغط <strong className="text-ink dark:text-ink-dark">"الخروج مع إبقاء الوردية"</strong>.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <AppButton variant="subtle" size="sm" onClick={onClose}>
              تراجع (Esc)
            </AppButton>
            <AppButton variant="danger" size="sm" icon={LogOut} onClick={onConfirmLogout}>
              الخروج مع إبقاء الوردية
            </AppButton>
          </div>
          <AppButton variant="primary" size="sm" icon={Clock} onClick={onOpenShiftClose}>
            تقفيل وتشميع الوردية
          </AppButton>
        </div>
      </div>
    </div>
  );
};

