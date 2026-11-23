import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  X,
  Loader2,
  FileEdit,
  RotateCcw,
  Check,
  ShieldCheck,
} from 'lucide-react';
import type { Product, Category } from '../../types';
import {
  generateSmartDescription,
  type DescriptionTone,
} from '../../utils/smartDescriptionGenerator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
  categories: Category[];
  isSaving: boolean;
  onBatchSave: (updates: Array<{ id: string; description: string }>) => Promise<void>;
}

export const BulkDescriptionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedProducts,
  categories,
  isSaving,
  onBatchSave,
}) => {
  const [selectedTone, setSelectedTone] = useState<DescriptionTone>('catchy');
  const [descriptionsMap, setDescriptionsMap] = useState<Record<string, string>>({});
  const [isGenerated, setIsGenerated] = useState(false);

  // Category map for fast lookup
  const categoryMap = new Map<string, string>();
  for (const c of categories) {
    categoryMap.set(c.id, c.name);
  }

  // Pre-generate descriptions on modal open
  useEffect(() => {
    if (isOpen && selectedProducts.length > 0) {
      const initial: Record<string, string> = {};
      for (const prod of selectedProducts) {
        const catName = prod.category_id ? categoryMap.get(prod.category_id) || '' : '';
        // If product already has description, keep it, else generate new
        initial[prod.id] = prod.description && prod.description.trim()
          ? prod.description
          : generateSmartDescription(prod, catName, selectedTone);
      }
      setDescriptionsMap(initial);
      setIsGenerated(true);
    }
  }, [isOpen, selectedProducts, selectedTone]);

  if (!isOpen || selectedProducts.length === 0) return null;
  if (typeof document === 'undefined') return null;

  const handleRegenerateAll = () => {
    const updated: Record<string, string> = {};
    for (const prod of selectedProducts) {
      const catName = prod.category_id ? categoryMap.get(prod.category_id) || '' : '';
      updated[prod.id] = generateSmartDescription(prod, catName, selectedTone);
    }
    setDescriptionsMap(updated);
  };

  const handleTextChange = (id: string, text: string) => {
    setDescriptionsMap(prev => ({ ...prev, [id]: text }));
  };

  const handleSaveAll = async () => {
    const updates = selectedProducts.map(p => ({
      id: p.id,
      description: (descriptionsMap[p.id] || '').trim(),
    }));
    await onBatchSave(updates);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-[#DCE1DC] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E6F2ED] border border-[#004D3F]/20 flex items-center justify-center text-[#004D3F]">
              <FileEdit className="w-5 h-5 text-[#004D3F]" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                <span>صياغة أوصاف المنتجات المحددة</span>
                <span className="px-2 py-0.5 rounded-full bg-[#004D3F] text-white text-[10px] font-black">
                  {selectedProducts.length} صنف محدد
                </span>
              </h3>
              <p className="text-xs text-[#52605D] mt-0.5">
                صياغة أوصاف تسويقية احترافية لكافة الأصناف المحددة دفعة واحدة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-2 rounded-xl text-[#52605D] hover:bg-[#EBECEF] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tone Selector & Control Bar */}
        <div className="px-6 py-3 border-b border-[#DCE1DC] bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[#0F172A]">صيغة الوصف التجاري:</span>
            <div className="flex rounded-xl bg-[#F8FAFC] border border-[#DCE1DC] p-0.5">
              <button
                type="button"
                onClick={() => setSelectedTone('catchy')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedTone === 'catchy' ? 'bg-[#004D3F] text-white shadow-xs' : 'text-[#52605D]'
                }`}
              >
                صياغة بيعية متزنة
              </button>
              <button
                type="button"
                onClick={() => setSelectedTone('short')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedTone === 'short' ? 'bg-[#004D3F] text-white shadow-xs' : 'text-[#52605D]'
                }`}
              >
                موجز تجاري سريع
              </button>
              <button
                type="button"
                onClick={() => setSelectedTone('detailed')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedTone === 'detailed' ? 'bg-[#004D3F] text-white shadow-xs' : 'text-[#52605D]'
                }`}
              >
                بطاقة مواصفات قياسية
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRegenerateAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DCE1DC] hover:border-[#004D3F] text-xs font-bold text-[#004D3F] bg-[#E6F2ED]/40 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة صياغة الكل</span>
          </button>
        </div>

        {/* Products List with Generated Descriptions */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-[#F8FAFC]">
          {selectedProducts.map((prod, idx) => {
            const catName = prod.category_id ? categoryMap.get(prod.category_id) || '' : '';
            const desc = descriptionsMap[prod.id] || '';

            return (
              <div
                key={prod.id}
                className="bg-white rounded-2xl border border-[#DCE1DC] p-4 shadow-2xl shadow-black/2 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-[#EAF5EE] text-[#006D41] text-[10px] font-black flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-[#0F172A] truncate">
                      {prod.name}
                    </span>
                    {catName && (
                      <span className="px-2 py-0.5 rounded-full bg-[#F1F5F4] text-[#52605D] text-[10px] font-bold flex-shrink-0">
                        {catName}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono font-bold text-[#52605D]">
                    {desc.length} حرف
                  </span>
                </div>

                <textarea
                  rows={2}
                  value={desc}
                  onChange={e => handleTextChange(prod.id, e.target.value)}
                  placeholder="الوصف التلقائي للصنف..."
                  className="w-full bg-[#F8FAFC] border border-[#DCE1DC] focus:border-[#004D3F] focus:bg-white rounded-xl p-2.5 text-xs text-[#0F172A] leading-relaxed resize-none outline-none transition-all"
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#00372D]">
            <ShieldCheck className="w-4 h-4 text-[#004D3F]" />
            <span>تتزامن الأوصاف تلقائياً مع كاشير المحل فور الحفظ.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-[#DCE1DC] text-xs font-bold text-[#52605D] hover:bg-white cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAll()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-colors shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ وتطبيق ({selectedProducts.length}) وصف</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
