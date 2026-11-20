import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FileEdit,
  Check,
  X,
  RotateCw,
  Loader2,
  CheckCircle2,
  Layers,
  HelpCircle,
} from 'lucide-react';
import type { Product } from '../../types';
import {
  generateSmartDescriptionOptions,
  type DescriptionTone,
  type GeneratedDescriptions,
} from '../../utils/smartDescriptionGenerator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  categoryName?: string;
  isSaving: boolean;
  onSave: (productId: string, description: string) => Promise<void>;
}

export const SingleDescriptionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  product,
  categoryName,
  isSaving,
  onSave,
}) => {
  const [selectedTone, setSelectedTone] = useState<DescriptionTone>('catchy');
  const [options, setOptions] = useState<GeneratedDescriptions | null>(null);
  const [currentText, setCurrentText] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (product) {
      const opts = generateSmartDescriptionOptions(product, categoryName);
      setOptions(opts);
      const initial = product.description && product.description.trim()
        ? product.description
        : opts[selectedTone];
      setCurrentText(initial);
    }
  }, [product, categoryName]);

  if (!isOpen || !product) return null;
  if (typeof document === 'undefined') return null;

  const handleToneChange = (tone: DescriptionTone) => {
    setSelectedTone(tone);
    if (options && options[tone]) {
      setCurrentText(options[tone]);
    }
  };

  const handleRegenerate = () => {
    if (!product) return;
    const opts = generateSmartDescriptionOptions(product, categoryName);
    setOptions(opts);
    setCurrentText(opts[selectedTone]);
  };

  const handleSave = async () => {
    await onSave(product.id, currentText.trim());
    onClose();
  };

  const handleCopy = () => {
    if (!currentText) return;
    navigator.clipboard.writeText(currentText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-[#DCE1DC] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
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
                <span>صياغة وصف المنتج</span>
              </h3>
              <p className="text-xs text-[#52605D] mt-0.5 font-medium line-clamp-1">
                {product.name}
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

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Tone Selector Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-[#0F172A]">اختر نبرة وأسلوب الوصف:</span>
              <button
                type="button"
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#004D3F] hover:underline cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                <span>إعادة صياغة الخيارات</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleToneChange('catchy')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                  selectedTone === 'catchy'
                    ? 'bg-[#004D3F] border-[#004D3F] text-white shadow-sm'
                    : 'bg-[#F8FAFC] border-[#DCE1DC] text-[#52605D] hover:border-[#004D3F]'
                }`}
              >
                تسويقي جذاب
              </button>
              <button
                type="button"
                onClick={() => handleToneChange('short')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                  selectedTone === 'short'
                    ? 'bg-[#004D3F] border-[#004D3F] text-white shadow-sm'
                    : 'bg-[#F8FAFC] border-[#DCE1DC] text-[#52605D] hover:border-[#004D3F]'
                }`}
              >
                مختصر ونظيف
              </button>
              <button
                type="button"
                onClick={() => handleToneChange('detailed')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                  selectedTone === 'detailed'
                    ? 'bg-[#004D3F] border-[#004D3F] text-white shadow-sm'
                    : 'bg-[#F8FAFC] border-[#DCE1DC] text-[#52605D] hover:border-[#004D3F]'
                }`}
              >
                تفصيلي بالنقاط
              </button>
            </div>
          </div>

          {/* Textarea Editor with Character Count */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-[#0F172A] flex items-center gap-1.5">
                <FileEdit className="w-3.5 h-3.5 text-[#004D3F]" />
                <span>معاينة وتعديل نص الوصف:</span>
              </label>
              <span className="text-[10px] font-mono font-bold text-[#52605D]">
                {currentText.length} حرف
              </span>
            </div>
            <textarea
              rows={5}
              value={currentText}
              onChange={e => setCurrentText(e.target.value)}
              placeholder="اكتب أو عدّل الوصف الذي يظهر للعملاء في المتجر..."
              className="w-full bg-[#F8FAFC] border border-[#DCE1DC] focus:border-[#004D3F] focus:bg-white rounded-2xl p-3.5 text-xs text-[#0F172A] leading-relaxed resize-none outline-none transition-all shadow-inner"
            />
          </div>

          {/* Sync Reassurance */}
          <div className="bg-[#E6F2ED]/60 rounded-xl p-3 border border-[#004D3F]/15 flex items-start gap-2 text-[11px] text-[#00372D]">
            <CheckCircle2 className="w-4 h-4 text-[#006D41] flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              عند حفظ هذا الوصف، سيتزامن فوراً مع كاشير رفيق POS بالمحل ومع المتجر الإلكتروني.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-between">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DCE1DC] text-xs font-bold text-[#52605D] hover:bg-white cursor-pointer"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-[#006D41]" /> : null}
            <span>{isCopied ? 'تم النسخ!' : 'نسخ النص'}</span>
          </button>

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
              onClick={() => void handleSave()}
              disabled={isSaving || !currentText.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-colors shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>حفظ وتطبيق الوصف</span>
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
