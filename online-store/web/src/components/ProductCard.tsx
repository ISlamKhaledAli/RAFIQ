import React from 'react';
import type { Product } from '../types';
import { formatUnitArabic } from '../utils/unitFormatter';
import {
  Plus,
  Minus,
  Package,
  Star,
  ShoppingBag,
  Utensils,
  Milk,
  Coffee,
  Croissant,
  SprayCan,
  Heart,
  Clock,
  ShieldCheck,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import type { StoreLayoutTemplate } from './ThemeInjector';

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

interface Props {
  product: Product;
  quantityInCart: number;
  layoutTemplate?: StoreLayoutTemplate;
  isWishlisted?: boolean;
  showWishlist?: boolean;
  showSavingsBadge?: boolean;
  showLowStockBadge?: boolean;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleWishlist?: (productId: string) => void;
}

export const ProductCard: React.FC<Props> = ({
  product,
  quantityInCart,
  layoutTemplate = 'classic',
  isWishlisted = false,
  showWishlist = true,
  showSavingsBadge = true,
  showLowStockBadge = true,
  onAddToCart,
  onRemoveFromCart,
  onSelectProduct,
  onToggleWishlist,
}) => {
  // Integer arithmetic: piasters converted to EGP string format only for final UI display!
  const pricePounds = (product.price_piasters / 100).toFixed(2);
  const comparePounds = product.compare_price ? (product.compare_price / 100).toFixed(2) : null;
  const hasDiscount = Boolean(product.compare_price && product.compare_price > product.price_piasters);
  const discountPercent = hasDiscount && product.compare_price
    ? Math.round(((product.compare_price - product.price_piasters) / product.compare_price) * 100)
    : 0;

  const savingsPounds = hasDiscount && product.compare_price
    ? Math.floor((product.compare_price - product.price_piasters) / 100)
    : null;

  const isOutOfStock = !product.in_stock || product.stock_quantity <= 0;
  const stockUnits = Math.round(product.stock_quantity / 1000);
  const isLowStock = !isOutOfStock && stockUnits > 0 && stockUnits <= 5;

  const isCompact = layoutTemplate === 'compact';
  const isBoutique = layoutTemplate === 'boutique';
  const isFood = layoutTemplate === 'food';
  const isPharmacy = layoutTemplate === 'pharmacy';

  // -------------------------------------------------------------
  // TEMPLATE 3: Food & Restaurant Card (Horizontal Appetite Layout)
  // -------------------------------------------------------------
  if (isFood) {
    return (
      <div
        style={{ borderRadius: 'var(--store-radius-card, 24px)' }}
        className="group relative bg-store-card border border-store-line hover:border-store-primary/60 shadow-2xs hover:shadow-lg card-lift flex flex-row items-stretch p-3 sm:p-4 gap-3.5 transition-all overflow-hidden"
      >
        {/* Right side in RTL: Image */}
        <div
          onClick={() => onSelectProduct(product)}
          style={{ borderRadius: 'var(--store-radius-btn, 14px)' }}
          className="relative w-28 h-28 sm:w-36 sm:h-36 bg-store-card-subtle flex-shrink-0 flex items-center justify-center cursor-pointer overflow-hidden border border-store-line/60"
        >
          {product.image_urls && product.image_urls.length > 0 ? (
            <img
              src={product.image_urls[0]}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-store-card text-store-primary flex items-center justify-center shadow-xs">
              {renderCategoryPlaceholderIcon(product)}
            </div>
          )}

          {hasDiscount && (
            <span className="absolute top-1.5 right-1.5 bg-rose-600 !text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
              -{discountPercent}%
            </span>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center p-1 text-center">
              <span className="bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-lg">
                نفد
              </span>
            </div>
          )}
        </div>

        {/* Left side in RTL: Details & Action */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div onClick={() => onSelectProduct(product)} className="cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>15 - 25 دقيقة</span>
              </span>
              {product.is_featured === 1 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-store-primary bg-store-primary-light px-2 py-0.5 rounded-md">
                  <Star className="w-3 h-3 fill-current" />
                  <span>الأكثر طلباً</span>
                </span>
              )}
            </div>

            <h3 className="font-black text-sm sm:text-base text-store-text line-clamp-1 group-hover:text-store-primary transition-colors">
              {product.name}
            </h3>

            {product.description && (
              <p className="text-[11px] text-store-muted line-clamp-2 mt-1 leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-store-line/60 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-store-primary tracking-tight">
                  {pricePounds}
                </span>
                <span className="text-[10px] font-extrabold text-store-muted">ج.م</span>
              </div>
              {hasDiscount && (
                <span className="text-[10px] text-store-muted line-through block">
                  {comparePounds} ج.م
                </span>
              )}
            </div>

            {/* Stepper or Add button */}
            <div>
              {isOutOfStock ? (
                <span className="text-[10px] text-store-muted font-bold bg-store-card-subtle px-2 py-1 rounded-lg">
                  غير متوفر
                </span>
              ) : quantityInCart > 0 ? (
                <div className="flex items-center bg-store-primary !text-white rounded-xl p-0.5 shadow-sm">
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
                  className="flex items-center gap-1.5 bg-store-primary hover:opacity-90 btn-spring !text-white px-3 py-1.5 text-xs font-black shadow-xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5 !text-white" />
                  <span>أضف للطلب</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // TEMPLATES 1, 2, 4 & CLASSIC: Vertical Grid Cards
  // -------------------------------------------------------------
  return (
    <div
      style={{ borderRadius: 'var(--store-radius-card, 24px)' }}
      className={`group relative bg-store-card border border-store-line hover:border-store-primary/60 shadow-2xs hover:shadow-xl card-lift flex flex-col justify-between overflow-hidden transition-all ${
        isCompact
          ? 'p-2 sm:p-2.5'
          : isBoutique
          ? 'p-3.5 sm:p-4'
          : isPharmacy
          ? 'p-3 sm:p-3.5 border-teal-500/20'
          : 'p-2.5 sm:p-3.5'
      }`}
    >
      {/* Product Image Area */}
      <div
        onClick={() => onSelectProduct(product)}
        style={{ borderRadius: 'var(--store-radius-btn, 14px)' }}
        className={`relative w-full bg-store-card-subtle flex items-center justify-center p-3 cursor-pointer overflow-hidden border border-store-line/60 ${
          isBoutique ? 'aspect-[4/5]' : isCompact ? 'aspect-[4/3]' : 'aspect-square'
        }`}
      >
        {product.image_urls && product.image_urls.length > 0 ? (
          <img
            src={product.image_urls[0]}
            alt={product.name}
            className={`w-full h-full group-hover:scale-108 transition-transform duration-500 ease-out ${
              isBoutique ? 'object-cover' : 'object-contain'
            }`}
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
              {formatUnitArabic(product.unit_name)}
            </span>
          </div>
        )}

        {/* Pharmacy Trust Badge */}
        {isPharmacy && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center pointer-events-none z-10">
            <span className="bg-store-card/90 backdrop-blur-xs border border-store-line text-store-primary text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
              <span>أصلي 100% ومضمون</span>
            </span>
          </div>
        )}

        {/* Top Badges & Wishlist Controls */}
        <div className="absolute top-2 right-2 left-2 flex items-start justify-between pointer-events-none z-10">
          {/* Badges on Right in RTL */}
          <div className="flex flex-col gap-1 items-start max-w-[calc(100%-36px)]">
            {product.is_featured === 1 && (
              <span className="bg-amber-500 !text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs">
                <Star className="w-3 h-3 fill-current !text-white" />
                <span>مميز</span>
              </span>
            )}

            {hasDiscount && (
              <span className="bg-rose-600 !text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-lg shadow-xs flex items-center gap-1">
                <span>-{discountPercent}%</span>
                {showSavingsBadge && savingsPounds && savingsPounds > 0 && (
                  <span className="border-r border-white/30 pr-1 text-[9px] font-bold">
                    وفر {savingsPounds} ج.م
                  </span>
                )}
              </span>
            )}

            {showLowStockBadge && isLowStock && (
              <span className="bg-amber-600 !text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-2xs">
                متبقي {stockUnits} فقط
              </span>
            )}
          </div>

          {/* Wishlist Heart Button on Left in RTL */}
          {showWishlist && onToggleWishlist && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onToggleWishlist(product.id);
              }}
              className="pointer-events-auto w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-store-card/90 backdrop-blur-md shadow-xs hover:shadow-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:scale-110 active:scale-90 transition-all btn-spring border border-store-line"
              title={isWishlisted ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
              aria-label={isWishlisted ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            >
              <Heart
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
                  isWishlisted ? 'fill-rose-500 text-rose-500 animate-pop' : ''
                }`}
              />
            </button>
          )}
        </div>

        {/* Quick View Button for Boutique */}
        {isBoutique && !isOutOfStock && (
          <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden sm:flex">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onSelectProduct(product);
              }}
              className="w-full py-1.5 rounded-xl bg-store-card/95 backdrop-blur-md text-store-text text-xs font-black shadow-md border border-store-line flex items-center justify-center gap-1.5 hover:bg-store-primary hover:text-white transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>معاينة القطعة</span>
            </button>
          </div>
        )}

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
            {isPharmacy ? (
              <span className="text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                عبوة: {formatUnitArabic(product.unit_name)}
              </span>
            ) : (
              <span>الوحدة: {formatUnitArabic(product.unit_name)}</span>
            )}
          </div>

          <h3
            className={`font-bold text-store-text line-clamp-2 leading-snug group-hover:text-store-primary transition-colors min-h-[2rem] ${
              isBoutique ? 'text-sm sm:text-base font-black' : 'text-xs sm:text-sm'
            }`}
          >
            {product.name}
          </h3>
        </div>

        {/* Price & Action Row */}
        <div className="mt-3 pt-2.5 border-t border-store-line/60 flex items-center justify-between gap-1.5">
          {/* Price */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span
                className={`font-black text-store-primary tracking-tight ${
                  isBoutique ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                }`}
              >
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
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-white/20 btn-spring !text-white cursor-pointer"
                  title="تقليل"
                  aria-label="تقليل الكمية"
                >
                  <Minus className="w-3.5 h-3.5 !text-white" />
                </button>
                <span className="w-5 sm:w-6 text-center font-black text-xs sm:text-sm !text-white tabular-nums">
                  {quantityInCart}
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onAddToCart(product);
                  }}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-white/20 btn-spring !text-white cursor-pointer"
                  title="زيادة"
                  aria-label="زيادة الكمية"
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
                className={`flex items-center gap-1.5 bg-store-primary hover:opacity-90 btn-spring !text-white font-black shadow-xs hover:shadow-md transition-all cursor-pointer ${
                  isCompact
                    ? 'px-3 py-1.5 sm:px-4 sm:py-2 text-xs'
                    : 'px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs'
                }`}
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
