import React, { useState, useEffect } from 'react';
import type { Product } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useSwipeDownDismiss } from '../hooks/useSwipeDownDismiss';
import { formatUnitArabic } from '../utils/unitFormatter';
import {
  X,
  Package,
  Check,
  Plus,
  Minus,
  Barcode,
  ShoppingBag,
  ShieldCheck,
  Star,
  ArrowLeft,
  Heart,
  Share2,
  Truck,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  product: Product | null;
  quantityInCart: number;
  isWishlisted?: boolean;
  showSavingsBadge?: boolean;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onOpenCart?: () => void;
  onToggleWishlist?: (productId: string) => void;
}

export const ProductModal: React.FC<Props> = ({
  product,
  quantityInCart,
  isWishlisted = false,
  showSavingsBadge = true,
  onClose,
  onAddToCart,
  onRemoveFromCart,
  onOpenCart,
  onToggleWishlist,
}) => {
  const [cachedProduct, setCachedProduct] = useState<Product | null>(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (product) {
      setCachedProduct(product);
      setActiveImageIndex(0);
      setCopiedLink(false);
    }
  }, [product]);

  const activeProduct = product || cachedProduct;
  const isOpen = Boolean(product);
  const { mounted, visible } = useModalAnimation(isOpen, 280);

  const { dragHandleProps, sheetStyle } = useSwipeDownDismiss({
    onClose,
    threshold: 75,
  });

  if (!mounted || !activeProduct) return null;

  const pricePounds = (activeProduct.price_piasters / 100).toFixed(2);
  const comparePounds = activeProduct.compare_price ? (activeProduct.compare_price / 100).toFixed(2) : null;
  const hasDiscount = Boolean(activeProduct.compare_price && activeProduct.compare_price > activeProduct.price_piasters);
  const discountPercent = hasDiscount && activeProduct.compare_price
    ? Math.round(((activeProduct.compare_price - activeProduct.price_piasters) / activeProduct.compare_price) * 100)
    : 0;
  const savingsPounds = hasDiscount && activeProduct.compare_price
    ? Math.floor((activeProduct.compare_price - activeProduct.price_piasters) / 100)
    : null;

  const isOutOfStock = !activeProduct.in_stock || activeProduct.stock_quantity <= 0;
  const stockUnits = Math.round(activeProduct.stock_quantity / 1000);
  const isLowStock = !isOutOfStock && stockUnits > 0 && stockUnits <= 5;

  const images = activeProduct.image_urls && activeProduct.image_urls.length > 0
    ? activeProduct.image_urls
    : [];

  const handleShare = () => {
    try {
      const url = window.location.href;
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(url);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
      }
    } catch {}
  };

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-xs transition-opacity duration-200 ease-out ${
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
        style={{
          backgroundColor: 'var(--store-card-bg, #FFFFFF)',
          ...sheetStyle,
        }}
      >
        {/* Mobile Swipe Handle Pill with Touch Physics */}
        <div
          {...dragHandleProps}
          className="sm:hidden w-full py-2.5 flex items-center justify-center cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        >
          <div className="w-12 h-1.5 bg-store-line rounded-full"></div>
        </div>

        {/* Top Control Buttons (Close, Share, Wishlist) */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className="p-2 rounded-full bg-store-card-subtle hover:bg-store-primary-light/50 text-store-muted hover:text-store-text border border-store-line transition-colors shadow-2xs btn-spring relative"
            title="مشاركة رابط الصنف"
            aria-label="مشاركة رابط الصنف"
          >
            {copiedLink ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 animate-pop" />
            ) : (
              <Share2 className="w-4 h-4" />
            )}
            {copiedLink && (
              <span className="absolute top-full left-0 mt-1 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md whitespace-nowrap">
                تم نسخ الرابط!
              </span>
            )}
          </button>

          {/* Wishlist Button */}
          {onToggleWishlist && (
            <button
              type="button"
              onClick={() => onToggleWishlist(activeProduct.id)}
              className="p-2 rounded-full bg-store-card-subtle hover:bg-rose-50 text-slate-400 hover:text-rose-500 border border-store-line transition-colors shadow-2xs btn-spring"
              title={isWishlisted ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
              aria-label={isWishlisted ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  isWishlisted ? 'fill-rose-500 text-rose-500 animate-pop' : ''
                }`}
              />
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-store-card-subtle hover:bg-store-primary-light/50 text-store-muted hover:text-store-text border border-store-line transition-colors shadow-2xs btn-spring"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Desktop 2-Column Grid / Mobile Stack */}
        <div className="grid grid-cols-1 sm:grid-cols-12 overflow-y-auto">
          {/* Product Image Stage (5 cols on desktop) */}
          <div className="sm:col-span-5 bg-store-card-subtle p-5 sm:p-6 flex flex-col items-center justify-between border-b sm:border-b-0 sm:border-l border-store-line/60 min-h-[220px] sm:min-h-[340px] relative">
            <div className="flex-1 w-full flex items-center justify-center p-2">
              {images.length > 0 ? (
                <img
                  src={images[activeImageIndex] || images[0]}
                  alt={activeProduct.name}
                  className="max-h-52 sm:max-h-64 object-contain drop-shadow-sm transition-all duration-300"
                />
              ) : (
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl bg-store-card text-store-muted flex items-center justify-center border border-store-line/60 shadow-inner">
                  <Package className="w-10 h-10 sm:w-14 sm:h-14" />
                </div>
              )}
            </div>

            {/* Multi-image thumbnail selector */}
            {images.length > 1 && (
              <div className="flex items-center gap-1.5 pt-2 max-w-full overflow-x-auto no-scrollbar">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-10 h-10 rounded-xl bg-white p-0.5 border-2 transition-all flex-shrink-0 ${
                      idx === activeImageIndex
                        ? 'border-store-primary shadow-xs scale-105'
                        : 'border-store-line/70 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}

            {/* Discount Badge on Image */}
            {hasDiscount && (
              <span className="absolute top-3 right-3 bg-rose-600 text-white text-[10px] font-black px-2.5 py-1 rounded-xl shadow-xs">
                خصم {discountPercent}%
              </span>
            )}
          </div>

          {/* Details & Specs (7 cols on desktop) */}
          <div className="sm:col-span-7 p-5 sm:p-7 flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-store-card-subtle text-store-muted border border-store-line px-2.5 py-1 rounded-xl font-bold">
                  الوحدة: {formatUnitArabic(activeProduct.unit_name)}
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
                {isLowStock && (
                  <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-xl font-bold">
                    متبقي {stockUnits} قطع فقط
                  </span>
                )}
                {activeProduct.is_featured === 1 && (
                  <span className="text-xs bg-store-accent text-store-accent-contrast px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 shadow-2xs">
                    <Star className="w-3.5 h-3.5 fill-current" /> مميز
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-lg sm:text-2xl font-black text-store-text leading-snug">
                {activeProduct.name}
              </h2>

              {/* Price Container */}
              <div className="flex items-baseline justify-between p-3.5 rounded-2xl bg-store-primary-light/40 border border-store-primary/15">
                <div className="flex items-baseline gap-2">
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

                {showSavingsBadge && savingsPounds && savingsPounds > 0 && (
                  <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-xs">
                    وفرت {savingsPounds} ج.م
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

              {/* Assurance Mini-Strip */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-store-muted">
                <span className="flex items-center gap-1.5 p-2 rounded-xl bg-store-card-subtle border border-store-line/60">
                  <ShieldCheck className="w-4 h-4 text-store-primary flex-shrink-0" />
                  <span>أصلي بأسعار المحل الرسمية</span>
                </span>
                <span className="flex items-center gap-1.5 p-2 rounded-xl bg-store-card-subtle border border-store-line/60">
                  <Truck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>توصيل سريع لباب بيتك</span>
                </span>
              </div>

              {/* Barcode */}
              {activeProduct.barcode && (
                <div className="text-[11px] text-store-muted flex items-center gap-1 font-mono">
                  <Barcode className="w-3.5 h-3.5" />
                  <span>باركود: {activeProduct.barcode}</span>
                </div>
              )}
            </div>

            {/* Stepper & Action Controls */}
            <div className="pt-3 border-t border-store-line/60">
              {quantityInCart > 0 ? (
                <div className="flex items-center gap-2.5">
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 h-12 bg-store-card-subtle text-store-text rounded-2xl px-1.5 border border-store-line shrink-0">
                    <button
                      type="button"
                      onClick={() => onRemoveFromCart(activeProduct.id)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-store-card hover:bg-store-primary-light/40 text-store-text font-bold btn-spring shadow-sm border border-store-line cursor-pointer"
                      title="تقليل الكمية"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="px-2 text-center min-w-[2.5rem]">
                      <span className="font-black text-sm text-store-text tabular-nums leading-none block">{quantityInCart}</span>
                      <span className="text-[10px] text-store-muted block mt-0.5 font-bold leading-none">{formatUnitArabic(activeProduct.unit_name)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddToCart(activeProduct)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-store-primary !text-white hover:opacity-90 font-bold btn-spring shadow-sm cursor-pointer"
                      title="زيادة الكمية"
                    >
                      <Plus className="w-4 h-4 !text-white" />
                    </button>
                  </div>

                  {/* Go to Cart Button */}
                  <button
                    type="button"
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
                  type="button"
                  onClick={() => onAddToCart(activeProduct)}
                  disabled={isOutOfStock}
                  className="w-full flex items-center justify-center gap-2.5 bg-store-primary hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-400 !text-white py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base shadow-lg shadow-store-primary/20 transition-all btn-spring cursor-pointer"
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
