import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  X,
  Check,
  Package,
  Barcode,
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, ProductVariant } from '../types/models';

interface ProductVariantPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentProduct: Product | null;
  onSelectVariant: (variantProduct: Product) => void;
  mode?: 'pos' | 'purchase';
}

export const ProductVariantPickerModal: React.FC<ProductVariantPickerModalProps> = ({
  isOpen,
  onClose,
  parentProduct,
  onSelectVariant,
  mode = 'pos',
}) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  const loadVariants = async (parentId: string) => {
    setIsLoading(true);
    try {
      const res = await invoke<ProductVariant[]>('variants:getByParentId', { parentId });
      setVariants(res || []);
      // Keep null on open so user sees ALL combinations without hiding any size or color
      setSelectedColor(null);
      setSelectedSize(null);
    } catch (err) {
      console.error('Failed to load variants:', err);
      setVariants([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && parentProduct?.id) {
      void loadVariants(parentProduct.id);
    } else {
      setVariants([]);
      setSelectedColor(null);
      setSelectedSize(null);
      setRecentlyAddedId(null);
    }
  }, [isOpen, parentProduct]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Unique colors and sizes across all variants
  const allColors = useMemo(() => {
    return Array.from(new Set(variants.map((v) => v.color).filter(Boolean)));
  }, [variants]);

  const allSizes = useMemo(() => {
    return Array.from(new Set(variants.map((v) => v.size).filter(Boolean)));
  }, [variants]);

  // Dynamically show which colors exist for the selected size
  const colorsMatchingSelectedSize = useMemo(() => {
    if (!selectedSize) return allColors;
    return Array.from(
      new Set(variants.filter((v) => v.size === selectedSize).map((v) => v.color).filter(Boolean))
    );
  }, [variants, selectedSize, allColors]);

  // Dynamically show which sizes exist for the selected color
  const sizesMatchingSelectedColor = useMemo(() => {
    if (!selectedColor) return allSizes;
    return Array.from(
      new Set(variants.filter((v) => v.color === selectedColor).map((v) => v.size).filter(Boolean))
    );
  }, [variants, selectedColor, allSizes]);

  // Filtered variants based on selected color and/or size
  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      if (selectedColor && v.color !== selectedColor) return false;
      if (selectedSize && v.size !== selectedSize) return false;
      return true;
    });
  }, [variants, selectedColor, selectedSize]);

  if (!isOpen || !parentProduct) return null;

  const handlePick = (v: ProductVariant, keepOpen = false) => {
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
    setRecentlyAddedId(v.id);
    setTimeout(() => {
      setRecentlyAddedId(null);
    }, 1500);

    if (!keepOpen) {
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        dir="rtl"
        className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-xl overflow-hidden text-ink font-sans flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">{parentProduct.name}</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand border border-brand/20">
                  {variants.length} تركيبة
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                {mode === 'purchase'
                  ? 'اختر المقاس واللون لإضافته إلى فاتورة الشراء وتوريد الكميات'
                  : 'اختر المقاس واللون المطلوب لإضافته إلى سلة البيع'}
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

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs">جاري تحميل المقاسات والألوان...</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="py-8 text-center text-ink-muted text-xs flex flex-col items-center gap-2">
              <Package className="w-8 h-8 opacity-40 text-brand" />
              <span>لا توجد تركيبات مسجلة لهذا المنتج</span>
            </div>
          ) : (
            <>
              {/* Quick Filter Reset */}
              {(selectedColor || selectedSize) && (
                <div className="flex items-center justify-between bg-surface-2/70 px-3 py-1.5 rounded-xl border border-line text-xs">
                  <span className="text-ink-muted font-medium">
                    تصفية نشطة: {selectedColor && `لون ${selectedColor}`} {selectedSize && `• مقاس ${selectedSize}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedColor(null);
                      setSelectedSize(null);
                    }}
                    className="text-brand hover:underline font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    عرض الكل
                  </button>
                </div>
              )}

              {/* Color Selector */}
              {allColors.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-ink-muted">1. تصفية باللون:</label>
                    {selectedColor && (
                      <button
                        type="button"
                        onClick={() => setSelectedColor(null)}
                        className="text-[11px] text-ink-muted hover:text-brand"
                      >
                        إلغاء التحديد
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allColors.map((color) => {
                      const isSelected = selectedColor === color;
                      const isAvailableForSelectedSize = colorsMatchingSelectedSize.includes(color);

                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            setSelectedColor((prev) => (prev === color ? null : color));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            isSelected
                              ? 'bg-brand text-white border-brand shadow-sm'
                              : isAvailableForSelectedSize
                              ? 'bg-surface border-line text-ink hover:border-brand-soft hover:bg-surface-2'
                              : 'bg-surface-2/40 border-line text-ink-muted opacity-40 hover:opacity-80'
                          }`}
                        >
                          <span>{color}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selector */}
              {allSizes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-ink-muted">2. تصفية بالمقاس:</label>
                    {selectedSize && (
                      <button
                        type="button"
                        onClick={() => setSelectedSize(null)}
                        className="text-[11px] text-ink-muted hover:text-paid"
                      >
                        إلغاء التحديد
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allSizes.map((size) => {
                      const isSelected = selectedSize === size;
                      const isAvailableForSelectedColor = sizesMatchingSelectedColor.includes(size);

                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setSelectedSize((prev) => (prev === size ? null : size));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all border cursor-pointer ${
                            isSelected
                              ? 'bg-paid text-white border-paid shadow-sm'
                              : isAvailableForSelectedColor
                              ? 'bg-surface border-line text-ink hover:border-paid/40 hover:bg-surface-2'
                              : 'bg-surface-2/40 border-line text-ink-muted opacity-40 hover:opacity-80'
                          }`}
                        >
                          <span>{size}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Matching Variants List */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-ink-muted">
                    التركيبات المتاحة ({filteredVariants.length}):
                  </label>
                  <span className="text-[11px] text-ink-muted">
                    اضغط للإضافة المباشرة
                  </span>
                </div>

                <div className="space-y-2">
                  {filteredVariants.length === 0 ? (
                    <div className="p-6 text-center text-xs text-ink-muted border border-dashed border-line rounded-xl">
                      لا توجد تركيبة تطابق هذا المقاس واللون معاً
                    </div>
                  ) : (
                    filteredVariants.map((v) => {
                      const isOutOfStock = v.stockQuantityMilli <= 0;
                      const isOnlyOnePiece = v.stockQuantityMilli === 1000;
                      const wasJustAdded = recentlyAddedId === v.id;

                      return (
                        <div
                          key={v.id}
                          className={`w-full p-3 rounded-xl border text-right transition-all flex items-center justify-between gap-3 shadow-sm ${
                            wasJustAdded
                              ? 'border-paid bg-paid-soft/50 ring-1 ring-paid'
                              : 'border-line bg-surface hover:border-brand hover:bg-brand-soft/10'
                          }`}
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-ink">
                                {v.color} - {v.size}
                              </span>
                              {v.barcode && (
                                <span className="text-[11px] font-mono text-ink-muted flex items-center gap-1 bg-surface-2 px-1.5 py-0.5 rounded border border-line">
                                  <Barcode className="w-3 h-3 text-ink-muted" />
                                  {v.barcode}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              {/* Stock status badges */}
                              {isOutOfStock ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-md border border-danger/20">
                                  <AlertTriangle className="w-3 h-3" />
                                  {mode === 'purchase'
                                    ? 'المخزون الحالي: 0 قطعة (جاهز للتوريد)'
                                    : 'نفد من المخزن (0)'}
                                </span>
                              ) : isOnlyOnePiece ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-warn bg-warn/10 px-2 py-0.5 rounded-md border border-warn/20">
                                  <Sparkles className="w-3 h-3 text-warn" />
                                  متبقي قطعة واحدة فقط بالمخزن!
                                </span>
                              ) : (
                                <span className="text-ink-muted text-xs">
                                  المخزون: <strong className="text-ink font-mono font-bold">{v.stockQuantityMilli / 1000}</strong> قطعة
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-left space-y-1.5 shrink-0 flex flex-col items-end">
                            <div className="text-sm font-bold font-mono text-paid">
                              {(v.pricePiasters / 100).toFixed(2)} ج.م
                            </div>

                            <div className="flex items-center gap-1">
                              {mode === 'purchase' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handlePick(v, true)}
                                    className="px-2 py-1 rounded-lg bg-surface-2 border border-line hover:border-brand text-[11px] font-bold text-brand flex items-center gap-1 transition-colors cursor-pointer"
                                    title="إضافة إلى الفاتورة مع إبقاء النافذة مفتوحة لاختيار باقي المقاسات"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>+ متابعة</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePick(v, false)}
                                    className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-dark text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>إضافة وإنهاء</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handlePick(v, false)}
                                  className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>إضافة للسلة</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
