import React, { useState, useEffect } from 'react';
import type { Product } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { X, Package, Check, Plus, Minus, Barcode, ShoppingBag, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';

interface Props {
  product: Product | null;
  quantityInCart: number;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onOpenCart?: () => void;
}

export const ProductModal: React.FC<Props> = ({
  product,
  quantityInCart,
  onClose,
  onAddToCart,
  onRemoveFromCart,
  onOpenCart,
}) => {
  const [cachedProduct, setCachedProduct] = useState<Product | null>(product);

  useEffect(() => {
    if (product) {
      setCachedProduct(product);
    }
  }, [product]);

  const activeProduct = product || cachedProduct;
  const isOpen = Boolean(product);
  const { mounted, visible } = useModalAnimation(isOpen, 280);

  if (!mounted || !activeProduct) return null;

  const pricePounds = (activeProduct.price_piasters / 100).toFixed(2);
  const comparePounds = activeProduct.compare_price ? (activeProduct.compare_price / 100).toFixed(2) : null;
  const hasDiscount = Boolean(activeProduct.compare_price && activeProduct.compare_price > activeProduct.price_piasters);
  const isOutOfStock = !activeProduct.in_stock || activeProduct.stock_quantity <= 0;

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-store-line overflow-hidden flex flex-col max-h-[92vh] transition-[transform,opacity] duration-[280ms] ease-out ${
          visible
            ? 'translate-y-0 sm:scale-100 opacity-100'
            : 'translate-y-full sm:translate-y-6 sm:scale-95 opacity-0'
        }`}
        style={{ backgroundColor: 'var(--store-card-bg, #FFFFFF)' }}
      >
        {/* Mobile Swipe Handle Pill */}
        <div className="sm:hidden w-12 h-1.5 bg-store-line rounded-full mx-auto my-2.5 flex-shrink-0"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 p-2 rounded-full bg-store-card-subtle hover:bg-store-primary-light/50 text-store-muted hover:text-store-text border border-store-line transition-colors shadow-2xs btn-spring"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Desktop 2-Column Grid / Mobile Stack */}
        <div className="grid grid-cols-1 sm:grid-cols-12 overflow-y-auto">
          {/* Product Image Stage (5 cols on desktop) */}
          <div className="sm:col-span-5 bg-store-card-subtle p-6 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-l border-store-line/60 min-h-[220px] sm:min-h-[340px] relative">
            {activeProduct.image_urls && activeProduct.image_urls.length > 0 ? (
              <img
                src={activeProduct.image_urls[0]}
                alt={activeProduct.name}
                className="max-h-56 sm:max-h-72 object-contain drop-shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl bg-store-card text-store-muted flex items-center justify-center border border-store-line/60">
                <Package className="w-10 h-10 sm:w-14 sm:h-14" />
              </div>
            )}

            {hasDiscount && (
              <span className="absolute top-3 right-3 bg-store-secondary text-store-secondary-contrast text-[10px] font-black px-2.5 py-1 rounded-xl shadow-xs">
                خصم خاص
              </span>
            )}
          </div>

          {/* Details & Specs (7 cols on desktop) */}
          <div className="sm:col-span-7 p-5 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-store-card-subtle text-store-muted border border-store-line px-2.5 py-1 rounded-xl font-bold">
                  الوحدة: {activeProduct.unit_name}
                </span>
                {!isOutOfStock ? (
                  <span className="text-xs bg-store-primary-light/70 text-store-primary px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 border border-store-primary/20">
                    <Check className="w-3.5 h-3.5" /> متوفر بالمحل
                  </span>
                ) : (
                  <span className="text-xs bg-rose-50 text-rose-700 px-2.5 py-1 rounded-xl font-bold">
                    غير متوفر حالياً
                  </span>
                )}
                {activeProduct.is_featured === 1 && (
                  <span className="text-xs bg-store-accent text-store-accent-contrast px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5" /> مميز
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-lg sm:text-2xl font-black text-store-text leading-snug">
                {activeProduct.name}
              </h2>

              {/* Price Container */}
              <div className="flex items-baseline gap-2 p-3.5 rounded-2xl bg-store-primary-light/40 border border-store-primary/15">
                <span className="text-2xl sm:text-3xl font-black text-store-primary tracking-tight">
                  {pricePounds}
                </span>
                <span className="text-xs font-bold text-store-muted">جنيه مصري</span>
                {hasDiscount && (
                  <span className="text-sm text-store-muted line-through mr-2 font-medium">
                    {comparePounds} ج.م
                  </span>
                )}
              </div>

              {/* Description */}
              {activeProduct.description && (
                <div>
                  <h4 className="text-xs font-bold text-store-muted mb-1">تفاصيل الصنف:</h4>
                  <p className="text-xs sm:text-sm text-store-text leading-relaxed bg-store-card-subtle p-3.5 rounded-2xl border border-store-line">
                    {activeProduct.description}
                  </p>
                </div>
              )}

              {/* Barcode & Quality guarantee */}
              <div className="flex flex-wrap items-center justify-between text-xs text-store-muted pt-1">
                {activeProduct.barcode && (
                  <span className="flex items-center gap-1 font-medium">
                    <Barcode className="w-4 h-4 text-store-muted" />
                    الباركود: {activeProduct.barcode}
                  </span>
                )}
                <span className="flex items-center gap-1 text-store-primary font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  أصلي ومضمون
                </span>
              </div>
            </div>

            {/* Stepper & Action Controls */}
            <div className="pt-3 border-t border-store-line/60">
              {quantityInCart > 0 ? (
                <div className="flex items-center gap-2.5">
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 h-12 bg-store-card-subtle text-store-text rounded-2xl px-1.5 border border-store-line shrink-0">
                    <button
                      onClick={() => onRemoveFromCart(activeProduct.id)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-store-card hover:bg-store-primary-light/40 text-store-text font-bold btn-spring shadow-sm border border-store-line cursor-pointer"
                      title="تقليل الكمية"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="px-2 text-center min-w-[2.5rem]">
                      <span className="font-black text-sm text-store-text tabular-nums leading-none block">{quantityInCart}</span>
                      <span className="text-[10px] text-store-muted block mt-0.5 font-bold leading-none">{activeProduct.unit_name}</span>
                    </div>
                    <button
                      onClick={() => onAddToCart(activeProduct)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-store-primary !text-white hover:opacity-90 font-bold btn-spring shadow-sm cursor-pointer"
                      title="زيادة الكمية"
                    >
                      <Plus className="w-4 h-4 !text-white" />
                    </button>
                  </div>

                  {/* Go to Cart Button — Crisp Single-Line */}
                  <button
                    onClick={() => {
                      onClose();
                      if (onOpenCart) onOpenCart();
                    }}
                    className="flex-1 h-12 flex items-center justify-center gap-2 bg-store-primary hover:opacity-90 !text-white px-4 rounded-2xl font-black text-sm shadow-lg shadow-store-primary/20 transition-all btn-spring whitespace-nowrap cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 flex-shrink-0 !text-white" />
                    <span className="!text-white">عرض السلة</span>
                    <ArrowLeft className="w-4 h-4 flex-shrink-0 !text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onAddToCart(activeProduct)}
                  disabled={isOutOfStock}
                  className="w-full flex items-center justify-center gap-2.5 bg-store-primary hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-400 !text-white py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base shadow-lg shadow-store-primary/20 transition-all btn-spring"
                >
                  <ShoppingBag className="w-5 h-5 !text-white" />
                  <span className="!text-white">{isOutOfStock ? 'الصنف غير متوفر حالياً' : 'إضافة إلى السلة'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
