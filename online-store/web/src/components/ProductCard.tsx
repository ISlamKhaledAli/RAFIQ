import React from 'react';
import type { Product } from '../types';
import { Plus, Minus, Package, Sparkles, ShoppingBag } from 'lucide-react';

interface Props {
  product: Product;
  quantityInCart: number;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
}

export const ProductCard: React.FC<Props> = ({
  product,
  quantityInCart,
  onAddToCart,
  onRemoveFromCart,
  onSelectProduct,
}) => {
  // Integer arithmetic: piasters converted to EGP string format only for final UI display!
  const pricePounds = (product.price_piasters / 100).toFixed(2);
  const comparePounds = product.compare_price ? (product.compare_price / 100).toFixed(2) : null;
  const hasDiscount = product.compare_price && product.compare_price > product.price_piasters;
  const discountPercent = hasDiscount && product.compare_price
    ? Math.round(((product.compare_price - product.price_piasters) / product.compare_price) * 100)
    : 0;

  const isOutOfStock = !product.in_stock || product.stock_quantity <= 0;

  return (
    <div className="group relative bg-store-card rounded-3xl border border-store-line hover:border-store-primary/60 shadow-2xs hover:shadow-xl card-lift flex flex-col justify-between overflow-hidden p-2.5 sm:p-3.5 transition-all">
      {/* Product Image Area */}
      <div
        onClick={() => onSelectProduct(product)}
        className="relative aspect-square w-full bg-store-card-subtle rounded-2xl flex items-center justify-center p-3 cursor-pointer overflow-hidden border border-store-line/60"
      >
        {product.image_urls && product.image_urls.length > 0 ? (
          <img
            src={product.image_urls[0]}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-store-card text-store-muted flex items-center justify-center group-hover:text-store-primary transition-colors duration-300 shadow-2xs">
            <Package className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
        )}

        {/* Top Badges - Bold High Contrast Badges */}
        <div className="absolute top-2 right-2 left-2 flex items-center justify-between pointer-events-none">
          {product.is_featured === 1 ? (
            <span className="bg-amber-500 !text-white text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
              <Sparkles className="w-3 h-3 !text-white" />
              <span>مميز</span>
            </span>
          ) : (
            <span></span>
          )}

          {hasDiscount && (
            <span className="bg-rose-600 !text-white text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-lg shadow-sm font-mono">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-2 text-center">
            <span className="bg-rose-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-xl shadow-md">
              نفذ من المخزون
            </span>
          </div>
        )}
      </div>

      {/* Product Information */}
      <div className="mt-2.5 flex-1 flex flex-col justify-between">
        <div onClick={() => onSelectProduct(product)} className="cursor-pointer">
          <div className="text-[10px] font-bold text-store-muted mb-1 flex items-center gap-1">
            <span>الوحدة: {product.unit_name}</span>
          </div>

          <h3 className="font-bold text-xs sm:text-sm text-store-text line-clamp-2 leading-snug group-hover:text-store-primary transition-colors min-h-[2rem]">
            {product.name}
          </h3>
        </div>

        {/* Price & Action Row */}
        <div className="mt-3 pt-2.5 border-t border-store-line/60 flex items-center justify-between gap-1.5">
          {/* Price */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black text-store-primary tracking-tight">
                {pricePounds}
              </span>
              <span className="text-[10px] font-extrabold text-store-muted">ج.م</span>
            </div>
            {hasDiscount && (
              <div className="text-[10px] text-store-muted line-through">
                {comparePounds} ج.م
              </div>
            )}
          </div>

          {/* Stepper with Spring Tap Animations */}
          <div className="flex-shrink-0">
            {isOutOfStock ? (
              <span className="text-[10px] text-store-muted font-bold bg-store-card-subtle px-2.5 py-1 rounded-xl border border-store-line/60">
                غير متوفر
              </span>
            ) : quantityInCart > 0 ? (
              <div className="flex items-center bg-store-primary !text-white rounded-xl p-0.5 shadow-sm animate-pop">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onRemoveFromCart(product.id);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 btn-spring !text-white"
                  title="تقليل"
                >
                  <Minus className="w-3.5 h-3.5 !text-white" />
                </button>
                <span className="w-5 text-center font-black text-xs !text-white">
                  {quantityInCart}
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onAddToCart(product);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 btn-spring !text-white"
                  title="زيادة"
                >
                  <Plus className="w-3.5 h-3.5 !text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onAddToCart(product);
                }}
                className="flex items-center gap-1.5 bg-store-primary hover:opacity-90 btn-spring !text-white px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black shadow-xs hover:shadow-md transition-all"
                title="إضافة إلى السلة"
              >
                <ShoppingBag className="w-3.5 h-3.5 !text-white" />
                <span className="!text-white">أضف</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
