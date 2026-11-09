import { normalizeArabicNumerals } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useFormBaseline } from '../../hooks/useFormBaseline';
import { AppButton } from '../../components/AppButton';

export interface BulkMinStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  bulkMinStockValue: number;
  setBulkMinStockValue: (val: number) => void;
  bulkUpdating: boolean;
  onConfirm: () => void;
}

export const BulkMinStockModal: React.FC<BulkMinStockModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  bulkMinStockValue,
  setBulkMinStockValue,
  bulkUpdating,
  onConfirm,
}) => {
  // The value is kept by the parent between openings, so "dirty" is measured from the value it opened with
  const openedMinStockValue = useFormBaseline(isOpen, bulkMinStockValue);
  const isDirty = bulkMinStockValue !== openedMinStockValue;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تعديل حد النواقص؟',
    confirmMessage: 'تم إدخال قيمة لحد النواقص. هل أنت متأكد من الإلغاء والتراجع؟',
  });

  if (!isOpen) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 bg-ink/40 dark:bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-sm max-h-[90vh] bg-surface dark:bg-surface-dark rounded-[8px] border border-line dark:border-line-dark p-5 shadow-2xl flex flex-col gap-3.5 overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-line dark:border-line-dark">
          <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">تعديل حد النواقص للأصناف المحددة</h3>
          <span className="text-micro font-mono font-bold px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright">
            {selectedCount} صنف محدد
          </span>
        </div>
        
        <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
          اكتب أقل كمية (حد النواقص) بالقطعة عشان النظام ينبهك تلقائياً لما بضاعة الأصناف دي تقرب تخلص.
        </p>

        <div>
          <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-xs">حد تنبيه النواقص (بالقطعة)</label>
          <input
            type="text"
            value={bulkMinStockValue}
            onChange={(e) => setBulkMinStockValue(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
            className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[2.375rem] px-3 font-mono text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line dark:border-line-dark">
          <AppButton variant="secondary" onClick={requestClose}>
            إلغاء
          </AppButton>
          <AppButton variant="primary" disabled={bulkUpdating} onClick={onConfirm}>
            {bulkUpdating ? 'جاري الحفظ...' : 'تطبيق حد النواقص'}
          </AppButton>
        </div>
      </div>
    </div>
  );
};
