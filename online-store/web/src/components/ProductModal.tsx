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
  // Cache the product so when onClose sets product to null in parent,
  // the component still has data to render while smoothly animating out!
  const [cachedProduct, setCachedProduct] = useState<Product | null>(product);

  useEffect(() => {
    if (product) {
      setCachedProduct(product);
    }
  }, [product]);

  const activeProduct = product || cachedProduct;
  const isOpen = Boolean(product);
  const { mounted, visible } = useModalAnimation(isOpen, 300);

  if (!mounted || !activeProduct) return null;

  const pricePounds = (activeProduct.price_piasters / 100).toFixed(2);
  const comparePounds = activeProduct.compare_price ? (activeProduct.compare_price / 100).toFixed(2) : null;
  const hasDiscount = Boolean(activeProduct.compare_price && activeProduct.compare_price > activeProduct.price_piasters);
  const isOutOfStock = !activeProduct.in_stock || activeProduct.stock_quantity <= 0;

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 transition-all duration-300 ease-in-out ${
        visible ? 'opacity-100 backdrop-blur-md' : 'opacity-0 backdrop-blur-none pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] transition-all duration-300 ease-in-out ${
          visible
            ? 'translate-y-0 sm:scale-100 opacity-100'
            : 'translate-y-full sm:translate-y-8 sm:scale-95 opacity-0'
        }`}
      >
        {/* Mobile Swipe Handle Pill */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-2.5 flex-shrink-0"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shadow-xs btn-spring"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Desktop 2-Column Grid / Mobile Stack */}
        <div className="grid grid-cols-1 sm:grid-cols-12 overflow-y-auto">
          {/* Product Image Stage (5 cols on desktop) */}
          <div className="sm:col-span-5 bg-slate-50 p-6 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-l border-slate-100 min-h-[220px] sm:min-h-[340px] relative">
            {activeProduct.image_urls && activeProduct.image_urls.length > 0 ? (
              <img
                src={activeProduct.image_urls[0]}
                alt={activeProduct.name}
                className="max-h-56 sm:max-h-72 object-contain drop-shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl bg-slate-100 text-slate-300 flex items-center justify-center">
                <Package className="w-10 h-10 sm:w-14 sm:h-14" />
              </div>
            )}

            {hasDiscount && (
              <span className="absolute top-3 right-3 bg-rose-600 text-white text-[10px] font-black px-2.5 py-1 rounded-xl shadow-xs">
                خصم خاص
              </span>
            )}
          </div>

          {/* Details & Specs (7 cols on desktop) */}
          <div className="sm:col-span-7 p-5 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {/* Badges */}
              <div className="flex items-center gap-2">
                <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl font-bold">
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
                  <span className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> مميز
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 leading-snug">
                {activeProduct.name}
              </h2>

              {/* Price Container */}
              <div className="flex items-baseline gap-2 p-3.5 rounded-2xl bg-store-primary-light/40 border border-store-primary/10">
                <span className="text-2xl sm:text-3xl font-black text-store-primary tracking-tight">
                  {pricePounds}
                </span>
                <span className="text-xs font-bold text-slate-600">جنيه مصري</span>
                {hasDiscount && (
                  <span className="text-sm text-slate-400 line-through mr-2 font-medium">
                    {comparePounds} ج.م
                  </span>
                )}
              </div>

              {/* Description (Only if product has a real description) */}
              {activeProduct.description && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 mb-1">تفاصيل الصنف:</h4>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    {activeProduct.description}
                  </p>
                </div>
              )}

              {/* Barcode & Quality guarantee */}
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
                {activeProduct.barcode && (
                  <span className="flex items-center gap-1 font-medium">
                    <Barcode className="w-4 h-4 text-slate-400" />
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
            <div className="pt-3 border-t border-slate-100">
              {quantityInCart > 0 ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Quantity Stepper */}
                  <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-100 text-slate-800 rounded-2xl p-1.5 border border-slate-200">
                    <button
                      onClick={() => onRemoveFromCart(activeProduct.id)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold btn-spring shadow-2xs border border-slate-200/80"
                      title="تقليل الكمية"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="px-3 text-center min-w-[3rem]">
                      <span className="font-black text-base text-store-text">{quantityInCart}</span>
                      <span className="text-[10px] text-slate-500 block -mt-1 font-bold">{activeProduct.unit_name}</span>
                    </div>
                    <button
                      onClick={() => onAddToCart(activeProduct)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-store-primary text-white hover:bg-store-primary-hover font-bold btn-spring shadow-2xs"
                      title="زيادة الكمية"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Go to Cart & Checkout Button */}
                  <button
                    onClick={() => {
                      onClose();
                      if (onOpenCart) onOpenCart();
                    }}
                    className="flex-1 flex items-center justify-center gap-2.5 bg-store-primary hover:bg-store-primary-hover text-white py-3.5 px-5 rounded-2xl font-black text-sm shadow-lg shadow-store-primary/20 transition-all btn-spring"
                  >
                    <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                    <span>الذهاب إلى السلة وإتمام الطلب</span>
                    <ArrowLeft className="w-4 h-4 mr-auto flex-shrink-0" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onAddToCart(activeProduct)}
                  disabled={isOutOfStock}
                  className="w-full flex items-center justify-center gap-2.5 bg-store-primary hover:bg-store-primary-hover disabled:bg-slate-200 disabled:text-slate-400 text-white py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base shadow-lg shadow-store-primary/20 transition-all btn-spring"
                >
                  <ShoppingBag className="w-5 h-5" />
                  <span>{isOutOfStock ? 'الصنف غير متوفر حالياً' : 'إضافة إلى السلة'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
