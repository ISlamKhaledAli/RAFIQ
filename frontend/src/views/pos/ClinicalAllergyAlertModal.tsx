import React from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  X,
  Pill,
} from 'lucide-react';
import type { AllergyCheckResult } from '../../types/patient';
import { useModalDismiss } from '../../hooks/useModalDismiss';

interface ClinicalAllergyAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  alertResult: AllergyCheckResult | null;
  onRemoveItem: (productId: string) => void;
  onRemoveAllConflicts: () => void;
}

export const ClinicalAllergyAlertModal: React.FC<ClinicalAllergyAlertModalProps> = ({
  isOpen,
  onClose,
  alertResult,
  onRemoveItem,
  onRemoveAllConflicts,
}) => {
  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
  });

  if (!isOpen || !alertResult || !alertResult.hasConflict || alertResult.conflicts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="allergy-modal-title"
    >
      <div
        className="w-full max-w-lg bg-surface dark:bg-surface-dark border-2 border-danger shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-danger text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 id="allergy-modal-title" className="text-base font-bold flex items-center gap-2">
                تحذير سريري خطير: تعارض حساسية دوائية
              </h2>
              <p className="text-xs text-white/90">
                المريض: <span className="font-bold underline">{alertResult.patientName || alertResult.customerName || 'المريض'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="إغلاق التنبيه"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 rounded-xl p-3.5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger dark:text-danger-bright shrink-0 mt-0.5" />
            <div className="text-xs text-ink dark:text-ink-dark leading-relaxed">
              تم اكتشاف أدوية في السلة الحالية تحتوي على مواد فعالة أو مركبات تطابق الحساسية المسجلة في الملف الطبي للمريض. قد يؤدي صرف هذا الدواء إلى مضاعفات تحسسية حادة!
            </div>
          </div>

          {/* List of Conflicts */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted px-1">
              الأصناف المتعارضة ({alertResult.conflicts.length}):
            </h3>
            {alertResult.conflicts.map((conflict) => (
              <div
                key={conflict.productId}
                className="bg-surface-2 dark:bg-surface-dark-2 border border-danger/40 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs hover:border-danger transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Pill className="w-4 h-4 text-danger shrink-0" />
                    <span className="text-sm font-bold text-ink dark:text-ink-dark truncate">
                      {conflict.productName}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-danger dark:text-danger-bright font-semibold bg-danger-soft dark:bg-danger-dark-soft px-2 py-0.5 rounded-md border border-danger/20">
                      الحساسية المطابقة: {conflict.matchedAllergy || conflict.allergyMatch}
                    </span>
                    <span className="text-ink-muted dark:text-ink-dark-muted text-[11px] truncate">
                      {conflict.conflictReason || conflict.warningDetails}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveItem(conflict.productId)}
                  className="px-3 py-1.5 rounded-lg bg-danger hover:bg-danger/90 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 shadow-xs cursor-pointer"
                  title="حذف هذا الدواء المتعارض من السلة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إزالة الصنف</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-3 rounded-xl transition-colors cursor-pointer"
          >
            تجاوز ومتابعة بحذر (مسؤولية الصيدلي)
          </button>

          <button
            type="button"
            onClick={onRemoveAllConflicts}
            className="px-4 py-2 text-xs font-bold bg-danger hover:bg-danger/90 text-white rounded-xl flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>إزالة كافة الأصناف المتعارضة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
