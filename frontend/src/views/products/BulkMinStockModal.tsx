import React from 'react';
import { normalizeArabicNumerals } from '../../utils/money';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-sm max-h-[90vh] bg-surface rounded-[8px] border border-line p-5 shadow-2xl flex flex-col gap-3.5 overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <h3 className="text-[14px] font-bold text-ink m-0">تعديل حد النواقص للأصناف المحددة</h3>
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-brand-soft text-brand">
            {selectedCount} صنف محدد
          </span>
        </div>
        
        <p className="text-[12px] text-ink-muted m-0 leading-relaxed">
          اكتب أقل كمية (حد النواقص) بالقطعة عشان النظام ينبهك تلقائياً لما بضاعة الأصناف دي تقرب تخلص.
        </p>

        <div>
          <label className="block text-ink font-semibold mb-1 text-[12px]">حد تنبيه النواقص (بالقطعة)</label>
          <input
            type="text"
            value={bulkMinStockValue}
            onChange={(e) => setBulkMinStockValue(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
            className="w-full bg-surface border border-line rounded h-[38px] px-3 font-mono text-[13px] text-ink focus:outline-none focus:border-brand"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 h-[34px] rounded border border-line text-[12px] font-semibold text-ink hover:bg-surface-2 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={bulkUpdating}
            onClick={onConfirm}
            className="px-4 h-[34px] bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold shadow-xs transition-colors"
          >
            {bulkUpdating ? 'جاري الحفظ...' : 'تطبيق حد النواقص'}
          </button>
        </div>
      </div>
    </div>
  );
};
