import React from 'react';
import type { Product } from '../types';
import {
  Plus,
  Minus,
  Package,
  Sparkles,
  ShoppingBag,
  Utensils,
  Milk,
  Coffee,
  Croissant,
  SprayCan,
} from 'lucide-react';

function renderCategoryPlaceholderIcon(product: Product) {
  const n = product.name || '';
  const c = product.category_id || '';
  const iconCls = 'w-7 h-7 sm:w-9 sm:h-9';
  if (c === 'cat-3' || n.includes('جبن') || n.includes('حليب') || n.includes('لبن')) {
    return <Milk className={iconCls} />;
  }
  if (c === 'cat-4' || n.includes('عصير') || n.includes('شاي') || n.includes('قهوة')) {
    return <Coffee className={iconCls} />;
  }
  if (c === 'cat-6' || n.includes('توست') || n.includes('عيش') || n.includes('عسل') || n.includes('مخبوز')) {
    return <Croissant className={iconCls} />;
  }
  if (c === 'cat-5' || n.includes('غسيل') || n.includes('منظف') || n.includes('صابون')) {
    return <SprayCan className={iconCls} />;
  }
  if (c === 'cat-2' || n.includes('أرز') || n.includes('زيت') || n.includes('مكرونة')) {
    return <Utensils className={iconCls} />;
  }
  return <Package className={iconCls} />;
}

import type { StoreLayoutTemplate } from './ThemeInjector';

interface Props {
  product: Product;
  quantityInCart: number;
  layoutTemplate?: StoreLayoutTemplate;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
}

export const ProductCard: React.FC<Props> = ({
  product,
  quantityInCart,
  layoutTemplate = 'classic',
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

  const isCompact = layoutTemplate === 'compact';
  const isBoutique = layoutTemplate === 'boutique';

  return (
    <div
      style={{ borderRadius: 'var(--store-radius-card, 24px)' }}
      className={`group relative bg-store-card border border-store-line hover:border-store-primary/60 shadow-2xs hover:shadow-xl card-lift flex flex-col justify-between overflow-hidden transition-all ${
        isCompact ? 'p-2 sm:p-2.5' : isBoutique ? 'p-3.5 sm:p-4' : 'p-2.5 sm:p-3.5'
      }`}
    >
      {/* Product Image Area */}
      <div
        onClick={() => onSelectProduct(product)}
        style={{ borderRadius: 'var(--store-radius-btn, 14px)' }}
        className={`relative w-full bg-store-card-subtle flex items-center justify-center p-3 cursor-pointer overflow-hidden border border-store-line/60 ${
          isCompact ? 'aspect-[4/3]' : isBoutique ? 'aspect-[5/4]' : 'aspect-square'
        }`}
      >
        {product.image_urls && product.image_urls.length > 0 ? (
          <img
            src={product.image_urls[0]}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center gap-2">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-35"
              style={{
                backgroundImage: 'radial-gradient(var(--store-primary, #004D3F) 0.75px, transparent 0.75px)',
                backgroundSize: '14px 14px',
              }}
            />
            <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-store-card text-store-primary border border-store-primary/15 flex items-center justify-center group-hover:scale-105 group-hover:border-store-primary/40 transition-all duration-300 shadow-sm">
              {renderCategoryPlaceholderIcon(product)}
            </div>
            <span className="relative z-10 text-[10px] font-bold text-store-muted bg-store-card/90 border border-store-line/80 px-2.5 py-0.5 rounded-full">
              {product.unit_name}
            </span>
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
          <div className="absolute inset-0 bg-slate-900/65 flex items-center justify-center p-2 text-center">
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
                style={{ borderRadius: 'var(--store-radius-btn, 14px)' }}
                className="flex items-center gap-1.5 bg-store-primary hover:opacity-90 btn-spring !text-white px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-black shadow-xs hover:shadow-md transition-all"
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
