import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap,
  Camera,
  Layers,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  X,
  Loader2,
  ShieldCheck,
  PackageCheck,
  FileText,
} from 'lucide-react';
import type { Category } from '../../types';

export type SmartPublishPreset =
  | 'publish_in_stock'
  | 'publish_with_images_only'
  | 'publish_with_descriptions_only'
  | 'hide_out_of_stock'
  | 'hide_all'
  | 'publish_category';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeCategory: Category | null;
  totalProductsCount: number;
  inStockProductsCount: number;
  withImagesProductsCount: number;
  outOfStockProductsCount: number;
  isExecuting: boolean;
  onExecutePreset: (preset: SmartPublishPreset, categoryId?: string) => Promise<void>;
}

export const SmartPublishModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeCategory,
  totalProductsCount,
  withImagesProductsCount,
  isExecuting,
  onExecutePreset,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<SmartPublishPreset>('publish_in_stock');

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleConfirm = async () => {
    await onExecutePreset(
      selectedPreset,
      selectedPreset === 'publish_category' && activeCategory ? activeCategory.id : undefined
    );
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-[#DCE1DC] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E6F2ED] border border-[#004D3F]/20 flex items-center justify-center text-[#004D3F]">
              <Zap className="w-5 h-5 fill-[#004D3F]" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                <span>معالج النشر السريع والتلقائي</span>
                <span className="px-2 py-0.5 rounded-full bg-[#EAF5EE] text-[#006D41] text-[10px] font-black border border-[#006D41]/20">
                  إدارة الفهرس السحابي
                </span>
              </h3>
              <p className="text-xs text-[#52605D] mt-0.5">
                اختر بضغطة واحدة ما تريد عرضه للزبائن دون الحاجة لتعديل آلاف الأصناف يدوياً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="p-2 rounded-xl text-[#52605D] hover:bg-[#EBECEF] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Channel Safety Notice */}
        <div className="px-6 py-2.5 bg-[#E6F2ED]/60 border-b border-[#004D3F]/15 flex items-center gap-2 text-[11px] font-bold text-[#00372D]">
          <ShieldCheck className="w-4 h-4 text-[#004D3F] flex-shrink-0" />
          <span>يؤثر حصراً على المتجر الإلكتروني — مخزون المحل وفواتير الكاشير لا تتأثران إطلاقاً.</span>
        </div>

        {/* Presets List */}
        <div className="p-6 space-y-3 overflow-y-auto flex-1">
          {/* Preset 1: Publish All Available Catalog */}
          <label
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              selectedPreset === 'publish_in_stock'
                ? 'border-[#004D3F] bg-[#EAF5EE]/40 shadow-sm'
                : 'border-[#DCE1DC] hover:border-[#B5C0B7] bg-white'
            }`}
          >
            <input
              type="radio"
              name="smartPreset"
              checked={selectedPreset === 'publish_in_stock'}
              onChange={() => setSelectedPreset('publish_in_stock')}
              className="mt-1 accent-[#004D3F] w-4 h-4"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-[#0F172A] flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-[#006D41]" />
                  <span>نشر كافة الأصناف المتاحة في الكتالوج</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#004D3F] text-white text-[10px] font-bold">
                  موصى به
                </span>
              </div>
              <p className="text-xs text-[#52605D] leading-relaxed">
                يُظهر فوراً جميع الأصناف المرفوعة على المتجر ({totalProductsCount} صنف) وتفعيل كافة أقسامها دفعة واحدة.
              </p>
            </div>
          </label>

          {/* Preset 2: Publish In-Stock with Images Only */}
          <label
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              selectedPreset === 'publish_with_images_only'
                ? 'border-[#004D3F] bg-[#EAF5EE]/40 shadow-sm'
                : 'border-[#DCE1DC] hover:border-[#B5C0B7] bg-white'
            }`}
          >
            <input
              type="radio"
              name="smartPreset"
              checked={selectedPreset === 'publish_with_images_only'}
              onChange={() => setSelectedPreset('publish_with_images_only')}
              className="mt-1 accent-[#004D3F] w-4 h-4"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-[#0F172A] flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#004D3F]" />
                  <span>نشر الأصناف المزودة بصور فقط</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-[#52605D]">
                  {withImagesProductsCount} صنف مصور
                </span>
              </div>
              <p className="text-xs text-[#52605D] leading-relaxed">
                يقتصر العرض على الأصناف التي تم رفع صور لها أو إدخال روابطها، لضمان واجهة تسوق أنيقة وجذابة بصرياً.
              </p>
            </div>
          </label>

          {/* Preset 3: Publish with Descriptions Only */}
          <label
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              selectedPreset === 'publish_with_descriptions_only'
                ? 'border-[#004D3F] bg-[#EAF5EE]/40 shadow-sm'
                : 'border-[#DCE1DC] hover:border-[#B5C0B7] bg-white'
            }`}
          >
            <input
              type="radio"
              name="smartPreset"
              checked={selectedPreset === 'publish_with_descriptions_only'}
              onChange={() => setSelectedPreset('publish_with_descriptions_only')}
              className="mt-1 accent-[#004D3F] w-4 h-4"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-[#0F172A] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#004D3F]" />
                  <span>نشر الأصناف المزودة بوصف تسويقي فقط</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-[#52605D]">
                  صياغة ذكية
                </span>
              </div>
              <p className="text-xs text-[#52605D] leading-relaxed">
                يقتصر العرض فقط على الأصناف التي تحتوي على وصف تسويقي تم إدخاله أو صياغته للمتجر.
              </p>
            </div>
          </label>

          {/* Preset 4: Publish Current Category Only */}
          {activeCategory && (
            <label
              className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                selectedPreset === 'publish_category'
                  ? 'border-[#004D3F] bg-[#EAF5EE]/40 shadow-sm'
                  : 'border-[#DCE1DC] hover:border-[#B5C0B7] bg-white'
              }`}
            >
              <input
                type="radio"
                name="smartPreset"
                checked={selectedPreset === 'publish_category'}
                onChange={() => setSelectedPreset('publish_category')}
                className="mt-1 accent-[#004D3F] w-4 h-4"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-[#0F172A] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#004D3F]" />
                    <span>نشر أصناف قسم "{activeCategory.name}" فقط</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                    القسم الحالي
                  </span>
                </div>
                <p className="text-xs text-[#52605D] leading-relaxed">
                  تفعيل ظهور قسم "{activeCategory.name}" ونشر جميع أصنافه المتوفرة دفعة واحدة.
                </p>
              </div>
            </label>
          )}

          {/* Preset 5: Reset / Hide All */}
          <label
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              selectedPreset === 'hide_all'
                ? 'border-[#B23A2E] bg-[#FDF2F2]/40 shadow-sm'
                : 'border-[#DCE1DC] hover:border-[#B5C0B7] bg-white'
            }`}
          >
            <input
              type="radio"
              name="smartPreset"
              checked={selectedPreset === 'hide_all'}
              onChange={() => setSelectedPreset('hide_all')}
              className="mt-1 accent-[#B23A2E] w-4 h-4"
            />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-black text-[#B23A2E] flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                <span>إلغاء نشر الكل (تصفير المتجر بأمان)</span>
              </span>
              <p className="text-xs text-[#52605D] leading-relaxed">
                إخفاء كافة الأصناف الـ {totalProductsCount} بالكامل للبدء باختيار ما يعرضه المتجر من الصفر بأمان.
              </p>
            </div>
          </label>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="px-4 py-2 text-xs font-bold text-[#52605D] hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isExecuting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-all cursor-pointer shadow-sm disabled:opacity-60"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري التطبيق...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تطبيق الإعداد المختار فوراً</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
