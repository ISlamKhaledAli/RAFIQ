import React, { useState } from 'react';
import { Key, Copy, Check, AlertTriangle, ShieldCheck, Printer } from 'lucide-react';
import { invoke } from '../bridge/ipc';

interface RecoveryCodeModalProps {
  isOpen: boolean;
  recoveryCode: string;
  onConfirmed: () => void;
}

export const RecoveryCodeModal: React.FC<RecoveryCodeModalProps> = ({
  isOpen,
  recoveryCode,
  onConfirmed,
}) => {
  const [copied, setCopied] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(recoveryCode);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard write errors
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleConfirm = async () => {
    if (!hasAcknowledged) return;
    setIsSubmitting(true);
    try {
      await invoke('backup:confirmRecoveryCode');
      onConfirmed();
    } catch {
      // Fallback
      onConfirmed();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-brand-soft dark:bg-surface-dark-2 px-6 py-5 border-b border-line dark:border-line-dark flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-surface-dark-3 border border-brand/20 dark:border-line-dark flex items-center justify-center text-brand dark:text-brand-bright shrink-0">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink dark:text-ink-dark">كود استرجاع النسخ الاحتياطية (Recovery Code)</h2>
            <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">مفتاح الأمان الرئيسي المشفر لاسترجاع البيانات على أي جهاز</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Warning Banner */}
          <div className="bg-warn/10 dark:bg-warn-dark-soft border border-warn/25 dark:border-warn-dark-soft rounded-xl p-4 flex gap-3 text-right">
            <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
            <div className="text-xs text-ink dark:text-ink-dark space-y-1">
              <p className="font-semibold text-warn dark:text-warn-bright">تنبيه أمان بالغ الأهمية:</p>
              <p className="text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                كود استرجاع النسخ الاحتياطية — اطبعه واحتفظ به في مكان آمن ومحمي. بدونه لن تستطيع استرجاع بياناتك في حالة تلف جهازك أو نقله إلى جهاز كمبيوتر جديد.
              </p>
            </div>
          </div>

          {/* Recovery Code Display */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted block text-right">
              كود الاسترجاع المعتمد لمنشأتك:
            </label>
            <div className="flex items-center gap-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-3">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs font-medium text-ink dark:text-ink-dark flex items-center gap-1.5 transition-colors shrink-0"
                title="نسخ الكود"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-paid dark:text-paid-bright" />
                    <span className="text-paid dark:text-paid-bright font-bold">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted" />
                    <span>نسخ</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="p-2 bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors shrink-0"
                title="طباعة"
              >
                <Printer className="w-4 h-4" />
              </button>

              <div className="flex-1 text-center font-mono font-bold text-lg text-brand dark:text-brand-bright tracking-widest select-all">
                {recoveryCode}
              </div>
            </div>
          </div>

          {/* Checkbox Acknowledgment */}
          <label className="flex items-start gap-3 cursor-pointer bg-surface-2/60 dark:bg-surface-dark-2 border border-line/60 dark:border-line-dark rounded-xl p-3.5 hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-1 rounded border-line dark:border-line-dark text-brand focus:ring-brand h-4 w-4"
            />
            <span className="text-xs text-ink dark:text-ink-dark leading-relaxed text-right select-none">
              أقر بأنني قمت بنسخ وحفظ كود الاسترجاع في مكان خارجي آمن ومستقل، وأدرك تماماً أنه لن يمكن فك تشفير النسخ الاحتياطية على أي جهاز آخر بدونه.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="bg-surface-2 dark:bg-surface-dark-2 px-6 py-4 border-t border-line dark:border-line-dark flex items-center justify-end">
          <button
            type="button"
            disabled={!hasAcknowledged || isSubmitting}
            onClick={handleConfirm}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              hasAcknowledged && !isSubmitting
                ? 'bg-brand dark:bg-brand-container hover:bg-brand-dark dark:hover:bg-brand text-white shadow-md active:scale-95'
                : 'bg-line dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted cursor-not-allowed opacity-60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isSubmitting ? 'جاري التأكيد...' : 'نسخت الكود واحتفظت به'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
