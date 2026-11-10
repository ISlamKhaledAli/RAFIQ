import React, { useEffect } from 'react';
import { Clock, CheckCircle2, X, Wallet, Store } from 'lucide-react';
import { AppButton } from './AppButton';
import type { Shift } from '../types/models';
import { formatArabicCurrency, formatDateTime } from '../utils/money';

export interface ShiftLoginModalProps {
  isOpen: boolean;
  shift: Shift | null;
  currentUserName?: string;
  onClose: () => void;
  onOpenShiftDetails: () => void;
}

export const ShiftLoginModal: React.FC<ShiftLoginModalProps> = ({
  isOpen,
  shift,
  currentUserName,
  onClose,
  onOpenShiftDetails,
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

  const isSameCashier = Boolean(
    currentUserName &&
      shift.cashierName &&
      currentUserName.trim().toLowerCase() === shift.cashierName.trim().toLowerCase()
  );

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
      aria-labelledby="shift-login-title"
    >
      <div className="w-full max-w-lg bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden flex flex-col transform transition-all animate-scale-up">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand via-brand to-paid" />

        {/* Header */}
        <div className="bg-surface dark:bg-surface-dark px-6 py-4 flex items-center justify-between border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-paid/25 dark:border-paid/30 bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0 shadow-2xs">
              <Clock className="w-5 h-5 text-paid dark:text-paid-bright" />
            </div>
            <div>
              <h3 id="shift-login-title" className="text-base font-extrabold text-ink dark:text-ink-dark m-0">
                تنبيه: توجد وردية مفتوحة حالياً
              </h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                إشعار باستلام نقطة البيع
              </p>
            </div>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={onClose} />
        </div>

        {/* Content Body */}
        <div className="p-6 bg-surface-2 dark:bg-surface-dark-2 space-y-4">
          <div className="p-3.5 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/25 dark:border-paid/30 flex items-start gap-3 text-xs font-semibold text-paid dark:text-paid-bright leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {isSameCashier ? (
                <span>
                  مرحباً بك مجدداً. توجد وردية مفتوحة ومسجلة باسمك حالياً على هذا الجهاز، يمكنك مواصلة تسجيل المبيعات مباشرة.
                </span>
              ) : (
                <span>
                  تنبيه: توجد وردية عمل جارية ومفتوحة حالياً على هذا الجهاز مسجلة باسم الكاشير (
                  <strong className="underline">{shift.cashierName || 'كاشير سابق'}</strong>).
                </span>
              )}
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
                  مفتوحة
                </span>
              </div>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                <span>الكاشير: {shift.cashierName || 'كاشير'}</span>
              </span>
            </div>

            <div className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
              <span>تاريخ وتوقيت الفتح:</span>
              <span className="text-ink dark:text-ink-dark font-mono">
                {formatDateTime(shift.openedAt)}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between">
              <div className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                <span>عهدة بداية الدرج</span>
              </div>
              <div className="text-sm font-extrabold text-ink dark:text-ink-dark tabular-nums font-mono">
                {formatArabicCurrency(shift.openingFloatPiasters)}
              </div>
            </div>
          </div>

          <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
            يمكنك مواصلة العمل وتسجيل الفواتير فوراً على هذه الوردية، أو فتح نافذة الوردية للاطلاع على تقرير النقدية أو تقفيلها.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex items-center justify-between gap-2.5 flex-wrap">
          <AppButton variant="secondary" size="sm" icon={Clock} onClick={onOpenShiftDetails}>
            عرض تفاصيل الوردية
          </AppButton>
          <AppButton variant="primary" size="sm" icon={CheckCircle2} autoFocus onClick={onClose}>
            متابعة العمل
          </AppButton>
        </div>
      </div>
    </div>
  );
};

