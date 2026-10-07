import React, { useState, useEffect } from 'react';
import {
  Layers,
  X,
  Package,
  Barcode,
  Tag,
  Loader2,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, ProductVariant } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

interface ProductVariantsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentProduct: Product | null;
  onPrintVariantLabel?: (variant: ProductVariant) => void;
  onOpenMatrixModal?: () => void;
}

export const ProductVariantsListModal: React.FC<ProductVariantsListModalProps> = ({
  isOpen,
  onClose,
  parentProduct,
  onPrintVariantLabel,
  onOpenMatrixModal,
}) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && parentProduct?.id) {
      setIsLoading(true);
      void invoke<ProductVariant[]>('variants:getByParentId', { parentId: parentProduct.id })
        .then((res) => {
          setVariants(res || []);
        })
        .catch((err) => {
          console.error('Failed to load variants:', err);
          setVariants([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setVariants([]);
    }
  }, [isOpen, parentProduct]);

  if (!isOpen || !parentProduct) return null;

  const totalStockUnits = variants.reduce((acc, v) => acc + (v.stockQuantityMilli / 1000), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        dir="rtl"
        className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-3xl overflow-hidden text-ink font-sans flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center text-brand">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">{parentProduct.name}</h3>
                <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand text-[11px] font-bold border border-brand/20">
                  {variants.length} تركيبة (مقاس × لون)
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                إجمالي رصيد المقاسات: <span className="font-bold text-paid font-mono">{totalStockUnits.toLocaleString('en-US')}</span> قطعة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-line/40 rounded-lg transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs">جاري تحميل تركيبات المقاسات والألوان...</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="py-12 text-center text-ink-muted text-xs flex flex-col items-center gap-3">
              <Package className="w-10 h-10 opacity-40 text-brand" />
              <span>لا توجد تركيبات مسجلة لهذا الصنف حالياً</span>
              {onOpenMatrixModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMatrixModal();
                  }}
                  className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء مصفوفة المقاسات والألوان الآن</span>
                </button>
              )}
            </div>
          ) : (
            <div className="border border-line rounded-xl overflow-hidden bg-surface">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 border-b border-line text-ink font-bold">
                    <th className="py-2.5 px-3">اللون</th>
                    <th className="py-2.5 px-3">المقاس</th>
                    <th className="py-2.5 px-3">الباركود</th>
                    <th className="py-2.5 px-3 text-center">الرصيد</th>
                    <th className="py-2.5 px-3 text-left">سعر البيع</th>
                    <th className="py-2.5 px-3 text-left">التكلفة</th>
                    <th className="py-2.5 px-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {variants.map((v) => {
                    const stockPieces = v.stockQuantityMilli / 1000;
                    return (
                      <tr key={v.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-ink">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-brand/30 border border-brand/60" />
                            <span>{v.color || 'عام'}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-surface-2 border border-line font-mono font-bold text-ink">
                            {v.size || 'حر'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted flex items-center gap-1">
                          <Barcode className="w-3.5 h-3.5 opacity-60" />
                          <span>{v.barcode || '—'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">
                          <span className={stockPieces <= 0 ? 'text-danger' : 'text-paid'}>
                            {stockPieces.toLocaleString('en-US')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-bold text-paid">
                          {formatArabicCurrency(v.pricePiasters)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono text-ink-muted">
                          {formatArabicCurrency(v.costPiasters)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {onPrintVariantLabel && (
                            <button
                              type="button"
                              onClick={() => onPrintVariantLabel(v)}
                              className="p-1 rounded-lg text-ink-muted hover:text-brand hover:bg-brand-soft transition-colors cursor-pointer"
                              title="طباعة ملصق باركود لهذا المقاس"
                            >
                              <Tag className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line bg-surface-2/40 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-ink-muted flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-paid" />
            <span>يتم بيع كل مقاس بالباركود الخاص به أو باختياره من شاشة الكاشير.</span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenMatrixModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMatrixModal();
                }}
                className="px-3.5 py-1.5 bg-brand-soft hover:bg-brand-soft/80 text-brand border border-brand/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة مقاسات جديدة</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
