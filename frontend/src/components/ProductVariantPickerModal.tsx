import React, { useState, useEffect } from 'react';
import {
  Layers,
  X,
  Check,
  Package,
  Barcode,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, ProductVariant } from '../types/models';

interface ProductVariantPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentProduct: Product | null;
  onSelectVariant: (variantProduct: Product) => void;
}

export const ProductVariantPickerModal: React.FC<ProductVariantPickerModalProps> = ({
  isOpen,
  onClose,
  parentProduct,
  onSelectVariant,
}) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const loadVariants = async (parentId: string) => {
    setIsLoading(true);
    try {
      const res = await invoke<ProductVariant[]>('variants:getByParentId', { parentId });
      setVariants(res || []);
      if (res && res.length > 0) {
        setSelectedColor(res[0].color || null);
      }
    } catch (err) {
      console.error('Failed to load variants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && parentProduct?.id) {
      loadVariants(parentProduct.id);
    } else {
      setVariants([]);
      setSelectedColor(null);
      setSelectedSize(null);
    }
  }, [isOpen, parentProduct]);

  if (!isOpen || !parentProduct) return null;

  // Available unique colors and sizes
  const uniqueColors = Array.from(new Set(variants.map((v) => v.color).filter(Boolean)));
  const availableSizes = variants
    .filter((v) => !selectedColor || v.color === selectedColor)
    .map((v) => v.size)
    .filter(Boolean);

  // Filtered variants
  const filteredVariants = variants.filter((v) => {
    if (selectedColor && v.color !== selectedColor) return false;
    if (selectedSize && v.size !== selectedSize) return false;
    return true;
  });

  const handlePick = (v: ProductVariant) => {
    const prod: Product = {
      id: v.variantProductId,
      name: `${parentProduct.name} - ${v.color} - ${v.size}`,
      barcode: v.barcode,
      pricePiasters: v.pricePiasters,
      costPiasters: v.costPiasters,
      stockQuantityMilli: v.stockQuantityMilli,
      unit: 'piece',
      taxRatePercent: parentProduct.taxRatePercent || 0,
      isActive: true,
      categoryId: parentProduct.categoryId,
      parentId: parentProduct.id,
      variantColor: v.color,
      variantSize: v.size,
      variantSku: v.sku,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      priceFormatted: v.priceFormatted,
      stockFormatted: v.stockFormatted,
    };
    onSelectVariant(prod);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        dir="rtl"
        className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-lg overflow-hidden text-ink font-sans flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-2/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">{parentProduct.name}</h3>
              <p className="text-xs text-ink-muted">اختر المقاس واللون لإضافته إلى الفاتورة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-line/40 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs">جاري تحميل المقاسات والألوان...</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="py-8 text-center text-ink-muted text-xs flex flex-col items-center gap-2">
              <Package className="w-8 h-8 opacity-40" />
              <span>لا توجد تركيبات مسجلة لهذا المنتج</span>
            </div>
          ) : (
            <>
              {/* Color Selector */}
              {uniqueColors.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-2">1. اختر اللون:</label>
                  <div className="flex flex-wrap gap-2">
                    {uniqueColors.map((color) => {
                      const isSelected = selectedColor === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            setSelectedColor(color);
                            setSelectedSize(null);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? 'bg-brand text-white border-brand shadow-sm'
                              : 'bg-surface border-line text-ink hover:border-brand-soft hover:bg-surface-2'
                          }`}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selector */}
              {availableSizes.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-2">2. اختر المقاس:</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(availableSizes)).map((size) => {
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(isSelected ? null : size)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all border ${
                            isSelected
                              ? 'bg-paid text-white border-paid shadow-sm'
                              : 'bg-surface border-line text-ink hover:border-paid/40 hover:bg-surface-2'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Matching Variants List */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-ink-muted mb-2">
                  الخيارات المتاحة ({filteredVariants.length}):
                </label>
                <div className="space-y-2">
                  {filteredVariants.map((v) => {
                    const isOutOfStock = v.stockQuantityMilli <= 0;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handlePick(v)}
                        className="w-full p-3 rounded-xl border border-line bg-surface hover:border-brand hover:bg-brand-soft/10 text-right transition-all flex items-center justify-between group shadow-sm"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-ink">
                              {v.color} - {v.size}
                            </span>
                            {v.barcode && (
                              <span className="text-[11px] font-mono text-ink-muted flex items-center gap-1 bg-surface-2 px-1.5 py-0.5 rounded">
                                <Barcode className="w-3 h-3" />
                                {v.barcode}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span
                              className={`flex items-center gap-1 font-medium ${
                                isOutOfStock ? 'text-danger' : 'text-ink-muted'
                              }`}
                            >
                              {isOutOfStock ? (
                                <>
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  نفد من المخزن (0)
                                </>
                              ) : (
                                <>
                                  المخزون: <strong className="text-ink">{v.stockQuantityMilli / 1000}</strong> قطعة
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="text-left space-y-1">
                          <div className="text-base font-bold font-mono text-paid">
                            {(v.pricePiasters / 100).toFixed(2)} ج.م
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-brand opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                            <Check className="w-3 h-3" /> إضافة للسلة
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
