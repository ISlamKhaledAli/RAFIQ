import React, { useState } from 'react';
import { AppButton } from '../../components/AppButton';
import {
  AlertTriangle,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  X,
  Pill,
  Lock,
  RefreshCw,
  Info,
} from 'lucide-react';
import type { CartInteractionCheckResult, InteractionConflictItem } from '../../types/pharma';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { RequiredMark } from '../../components/RequiredMark';

interface DrugInteractionAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: CartInteractionCheckResult | null;
  onRemoveProduct: (productId: string) => void;
  onOpenAlternatives?: (productId: string) => void;
  onAcknowledgeWarning?: () => void;
  onSupervisorOverride?: (pin: string, reason: string, conflictProductIds: string[]) => Promise<boolean>;
  canOverrideDirectly?: boolean;
}

export const DrugInteractionAlertModal: React.FC<DrugInteractionAlertModalProps> = ({
  isOpen,
  onClose,
  result,
  onRemoveProduct,
  onOpenAlternatives,
  onAcknowledgeWarning,
  onSupervisorOverride,
  canOverrideDirectly = false,
}) => {
  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
  });

  const [pin, setPin] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  if (!isOpen || !result || !result.hasInteractions || result.conflicts.length === 0) {
    return null;
  }

  const isSevere = result.maxSeverity === 'severe';
  const isModerate = result.maxSeverity === 'moderate';

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSupervisorOverride) return;

    if (!canOverrideDirectly && !pin.trim()) {
      setOverrideError('الرقم السري للمشرف مطلوب.');
      return;
    }

    setOverrideError(null);
    setIsSubmittingOverride(true);
    try {
      const allProductIds = Array.from(
        new Set(
          result.conflicts.flatMap((c) => [c.productAId, c.productBId])
        )
      );

      const success = await onSupervisorOverride(pin.trim(), overrideReason.trim(), allProductIds);
      if (success) {
        setPin('');
        setOverrideReason('');
        onClose();
      } else {
        setOverrideError('فشل التحقق من الرقم السري أو عدم كفاية الصلاحية.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تجاوز التحذير.';
      setOverrideError(msg);
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'severe':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/10 dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/30 dark:border-danger-bright/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            حرج - مانع صرف
          </span>
        );
      case 'moderate':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-warn/10 dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/30 dark:border-warn-border/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            متوسط - فصل زمني
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/30 dark:border-brand-bright/30">
            <Info className="w-3.5 h-3.5" />
            طفيف - إرشادي
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ddi-modal-title"
    >
      <div
        className={`w-full max-w-2xl bg-surface dark:bg-surface-dark border-2 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh] text-ink dark:text-ink-dark ${
          isSevere
            ? 'border-danger dark:border-danger-bright'
            : isModerate
            ? 'border-warn dark:border-warn-bright'
            : 'border-brand dark:border-brand-bright'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 flex items-center justify-between text-white shrink-0 ${
            isSevere ? 'bg-danger' : isModerate ? 'bg-warn' : 'bg-brand dark:bg-brand-dark'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
              {isSevere ? (
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              ) : isModerate ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <Info className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 id="ddi-modal-title" className="t-modal-title flex items-center gap-2">
                {isSevere
                  ? 'تحذير سريري حرج: تعارض دوائي مهدد للحياة'
                  : isModerate
                  ? 'تنبيه سريري: تعارض وتنافر دوائي يتطلب الفصل الزمني'
                  : 'إرشاد صيدلاني: تفاعل دوائي طفيف'}
              </h2>
              <p className="text-xs text-white/90">
                تم رصد {result.conflicts.length} تعارض سريري بين أصناف سلة البيع الحالية
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="إغلاق النافذة"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Clinical Banner */}
          <div
            className={`border rounded-xl p-3.5 flex items-start gap-3 ${
              isSevere
                ? 'bg-danger/10 dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                : isModerate
                ? 'bg-warn/10 dark:bg-warn-dark-soft border-warn/30 dark:border-warn-border/30 text-warn dark:text-warn-bright'
                : 'bg-brand-soft dark:bg-brand-dark-soft border-brand/30 dark:border-brand-bright/30 text-brand dark:text-brand-bright'
            }`}
          >
            {isSevere ? (
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="text-xs text-ink dark:text-ink-dark leading-relaxed">
              {isSevere
                ? 'يُحظر صرف هذه الأدوية معاً نظراً لوجود خطر نزيف، تسمم حاد، أو هبوط مهدد للحياة. تم إيقاف عملية إصدار الفاتورة تلقائياً حتى معالجة التعارض أو اعتماد الصيدلي المشرف.'
                : isModerate
                ? 'تناول هذين الدواءين معاً قد يقلل من امتصاص أحدهما أو يسبب تنافراً علاجياً. يجب توجيه المريض للفصل الزمني الصارم بين الجرعات.'
                : 'تفاعل دوائي ذو أهمية سريرية طفيفة. يرجى تزويد المريض بالنصيحة الصيدلانية المناسبة.'}
            </div>
          </div>

          {/* Conflict Cards */}
          <div className="space-y-3">
            {result.conflicts.map((conflict: InteractionConflictItem, idx: number) => (
              <div
                key={`${conflict.productAId}-${conflict.productBId}-${conflict.interactionId}-${idx}`}
                className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4 space-y-3 shadow-2xs hover:border-line-hover dark:hover:border-line-dark-hover transition-colors"
              >
                {/* Card Header: Products & Severity */}
                <div className="flex items-start justify-between gap-3 border-b border-line dark:border-line-dark pb-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Pill className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                      <span className="text-sm font-bold text-ink dark:text-ink-dark">{conflict.productAName}</span>
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted">({conflict.activeIngredientA})</span>
                    </div>
                    <div className="text-xs font-bold text-danger dark:text-danger-bright pr-6">
                      متعارض كيميائياً وحيوياً مع:
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                      <span className="text-sm font-bold text-ink dark:text-ink-dark">{conflict.productBName}</span>
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted">({conflict.activeIngredientB})</span>
                    </div>
                  </div>
                  <div className="shrink-0">{getSeverityBadge(conflict.severity)}</div>
                </div>

                {/* Clinical Mechanism & Risk */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="bg-surface dark:bg-surface-dark p-2.5 rounded-lg border border-line/60 dark:border-line-dark/60">
                    <span className="font-bold text-ink dark:text-ink-dark block mb-1">آلية التفاعل الصيدلانية:</span>
                    <p className="text-ink-muted dark:text-ink-dark-muted leading-relaxed">{conflict.mechanismAr}</p>
                  </div>
                  <div className="bg-surface dark:bg-surface-dark p-2.5 rounded-lg border border-line/60 dark:border-line-dark/60">
                    <span className="font-bold text-danger dark:text-danger-bright block mb-1">الخطر السريري على المريض:</span>
                    <p className="text-ink-muted dark:text-ink-dark-muted leading-relaxed">{conflict.clinicalRiskAr}</p>
                  </div>
                </div>

                {/* Recommendation */}
                <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-dark-border rounded-lg p-2.5 text-xs">
                  <span className="font-bold text-paid dark:text-paid-bright block mb-0.5">التوصية الطبية العملية:</span>
                  <p className="text-ink dark:text-ink-dark leading-relaxed">{conflict.recommendationAr}</p>
                </div>

                {/* Alternative suggestion if present */}
                {conflict.alternativeAr && (
                  <div className="flex items-center justify-between gap-2 bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 rounded-lg p-2.5 text-xs">
                    <div>
                      <span className="font-bold text-brand dark:text-brand-bright ml-1">البديل الآمن المقترح:</span>
                      <span className="text-ink dark:text-ink-dark font-medium">{conflict.alternativeAr}</span>
                    </div>
                    {onOpenAlternatives && (
                      <AppButton variant="primary" size="xs" icon={RefreshCw} onClick={() => onOpenAlternatives(conflict.productAId)}>
                        عرض البدائل (F8)
                      </AppButton>
                    )}
                  </div>
                )}

                {/* 1-Click Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-line/60 dark:border-line-dark/60">
                  <AppButton variant="dangerSoft" size="sm" icon={Trash2} onClick={() => onRemoveProduct(conflict.productAId)}>
                    حذف {conflict.productAName}
                  </AppButton>
                  <AppButton variant="dangerSoft" size="sm" icon={Trash2} onClick={() => onRemoveProduct(conflict.productBId)}>
                    حذف {conflict.productBName}
                  </AppButton>
                </div>
              </div>
            ))}
          </div>

          {/* Supervisor Override Panel (For Severe Stop) */}
          {isSevere && onSupervisorOverride && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 border border-danger/40 dark:border-danger-bright/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-danger dark:text-danger-bright font-bold text-xs">
                <Lock className="w-4 h-4" />
                حوكمة وتفويض المشرف لتجاوز مانع الصرف الحرج:
              </div>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                في حال وجود بروتوكول علاجي خاص أو موافقة استشاري موثقة، يمكن للصيدلي المشرف تجاوز
                الإيقاف مع توثيق اسم المشرف وسبب التجاوز في سجل التدقيق المعتمد.
              </p>

              <form onSubmit={handleOverrideSubmit} className="space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {!canOverrideDirectly && (
                    <div>
                      <label className="block text-micro font-bold text-ink dark:text-ink-dark mb-1">
                        الرقم السري للمشرف: <RequiredMark />
                      </label>
                      <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="أدخل الرقم السري للمشرف"
                        className="w-full px-3 py-1.5 text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg focus:outline-none focus:border-danger dark:focus:border-danger-bright text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                        disabled={isSubmittingOverride}
                      />
                    </div>
                  )}
                  <div className={canOverrideDirectly ? 'md:col-span-2' : ''}>
                    <label className="block text-micro font-bold text-ink dark:text-ink-dark mb-1">
                      مبرر التجاوز الإشرافي:
                    </label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="مثال: روشتة استشاري قلب بجرعة معدلة مع متابعة INR"
                      className="w-full px-3 py-1.5 text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg focus:outline-none focus:border-danger dark:focus:border-danger-bright text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                      disabled={isSubmittingOverride}
                    />
                  </div>
                </div>

                {overrideError && (
                  <div className="text-micro text-danger dark:text-danger-bright font-bold px-1">{overrideError}</div>
                )}

                <div className="flex justify-end pt-1">
                  <AppButton
                    type="submit"
                    variant="danger"
                    size="md"
                    icon={CheckCircle2}
                    disabled={isSubmittingOverride || (!canOverrideDirectly && !pin.trim())}
                  >
                    {isSubmittingOverride ? 'جاري التحقق...' : 'اعتماد التجاوز ومتابعة البيع'}
                  </AppButton>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3 shrink-0">
          <div className="text-micro text-ink-muted dark:text-ink-dark-muted">
            محرك التفاعلات الدوائية السريري المعتمد — نظام رفيق
          </div>

          <div className="flex items-center gap-2">
            {!isSevere && onAcknowledgeWarning && (
              <AppButton
                variant="success"
                size="md"
                icon={CheckCircle2}
                onClick={() => {
                  onAcknowledgeWarning();
                  onClose();
                }}
              >
                فهمت الإرشاد ومتابعة البيع
              </AppButton>
            )}

            <AppButton variant="secondary" size="md" onClick={onClose}>
              {isSevere ? 'العودة لتعديل السلة' : 'إغلاق'}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};
