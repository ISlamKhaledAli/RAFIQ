import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Product, CartItem } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { formatUnitArabic } from '../utils/unitFormatter';
import {
  Search,
  X,
  Clock,
  Flame,
  ShoppingBag,
  Plus,
  Minus,
  ArrowLeft,
  Package,
  TrendingUp,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  cartItems: CartItem[];
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onSelectQueryFilter?: (query: string) => void;
}

const RECENT_SEARCHES_KEY = 'rafiq_store_recent_searches_v1';
const TRENDING_KEYWORDS = ['جبن', 'أرز', 'زيت', 'شاي', 'حليب', 'سكر', 'مكرونة', 'منظفات'];

export const InstantSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  products,
  cartItems,
  onAddToCart,
  onRemoveFromCart,
  onSelectProduct,
  onSelectQueryFilter,
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 240);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch {
      return [];
    }
  });

  // Focus search input when modal opens
  useEffect(() => {
    if (visible && inputRef.current) {
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const saveRecentSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(t => t.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 6);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  };

  const handleSelectKeyword = (term: string) => {
    setQuery(term);
    saveRecentSearch(term);
    if (onSelectQueryFilter) {
      onSelectQueryFilter(term);
    }
  };

  // Instant search results
  const matchingProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => {
        if (p.is_online === 0) return false;
        const nameMatch = p.name.toLowerCase().includes(q);
        const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
        return nameMatch || barcodeMatch;
      })
      .slice(0, 10);
  }, [products, query]);

  if (!mounted) return null;

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 md:pt-16 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-store-line overflow-hidden flex flex-col max-h-[85vh] transition-[transform,opacity] duration-200 ease-out ${
          visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 -translate-y-4'
        }`}
        style={{ backgroundColor: 'var(--store-card-bg, #FFFFFF)' }}
      >
        {/* Search Header Bar */}
        <div className="p-3.5 sm:p-4 border-b border-store-line flex items-center gap-2.5 bg-store-card-subtle flex-shrink-0">
          <Search className="w-5 h-5 text-store-primary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim()) {
                saveRecentSearch(query);
                if (onSelectQueryFilter) {
                  onSelectQueryFilter(query.trim());
                  onClose();
                }
              }
            }}
            placeholder="ابحث بالاسم أو الباركود أو الصنف..."
            className="flex-1 bg-transparent text-sm sm:text-base font-bold text-store-text placeholder:text-store-muted focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-full text-store-muted hover:text-store-text hover:bg-slate-200/60 transition-colors"
              title="مسح"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-bold text-store-muted hover:text-store-text rounded-xl hover:bg-slate-200/50 transition-colors"
          >
            إلغاء
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Query Empty: Show Trending & Recents */}
          {!query.trim() && (
            <div className="space-y-5">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-black text-store-muted flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-store-primary" />
                      <span>عمليات البحث الأخيرة</span>
                    </h4>
                    <button
                      type="button"
                      onClick={handleClearRecent}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      مسح السجل
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectKeyword(term)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-store-card-subtle hover:bg-store-primary-light border border-store-line hover:border-store-primary/30 text-xs font-bold text-store-text transition-colors btn-spring"
                      >
                        <Clock className="w-3 h-3 text-store-muted" />
                        <span>{term}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Searches */}
              <div>
                <h4 className="text-xs font-black text-store-muted mb-2.5 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>الأكثر بحثاً في المحل</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_KEYWORDS.map((kw, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectKeyword(kw)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-store-primary hover:text-white border border-store-line text-xs font-bold text-slate-700 transition-all btn-spring shadow-2xs"
                    >
                      <TrendingUp className="w-3 h-3 text-store-primary group-hover:text-white" />
                      <span>{kw}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active Query Results */}
          {query.trim() && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-store-muted pb-1 border-b border-store-line">
                <span>نتائج البحث عن: "{query}"</span>
                <span className="tabular-nums font-mono">{matchingProducts.length} نتائج</span>
              </div>

              {matchingProducts.length === 0 ? (
                <div className="py-10 text-center text-store-muted">
                  <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-bold text-store-text">لا توجد منتجات مطابقة لهذا البحث</p>
                  <p className="text-xs text-store-muted mt-1">تأكد من كتابة الاسم بشكل صحيح أو جرب كلمة بحث أخرى</p>
                </div>
              ) : (
                matchingProducts.map(product => {
                  const inCart = cartItems.find(i => i.product.id === product.id)?.quantity || 0;
                  const pricePounds = (product.price_piasters / 100).toFixed(2);
                  const isOutOfStock = !product.in_stock || product.stock_quantity <= 0;

                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        saveRecentSearch(query);
                        onSelectProduct(product);
                        onClose();
                      }}
                      className="group flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-store-card-subtle border border-transparent hover:border-store-line transition-all cursor-pointer"
                    >
                      {/* Product Thumbnail & Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-store-card-subtle border border-store-line/60 flex items-center justify-center p-1 overflow-hidden flex-shrink-0">
                          {product.image_urls && product.image_urls[0] ? (
                            <img
                              src={product.image_urls[0]}
                              alt={product.name}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                            />
                          ) : (
                            <Package className="w-6 h-6 text-store-muted" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h5 className="text-xs sm:text-sm font-bold text-store-text truncate group-hover:text-store-primary transition-colors">
                            {product.name}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-store-muted mt-0.5">
                            <span>الوحدة: {formatUnitArabic(product.unit_name)}</span>
                            {product.barcode && <span>• باركود: {product.barcode}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Price & Action */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-left">
                          <div className="text-xs sm:text-sm font-black text-store-primary tabular-nums">
                            {pricePounds} <span className="text-[10px] font-bold">ج.م</span>
                          </div>
                          {product.compare_price && product.compare_price > product.price_piasters && (
                            <div className="text-[10px] text-store-muted line-through tabular-nums">
                              {(product.compare_price / 100).toFixed(2)} ج.م
                            </div>
                          )}
                        </div>

                        {/* Direct Stepper / Add button */}
                        <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
                          {isOutOfStock ? (
                            <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-lg">
                              غير متوفر
                            </span>
                          ) : inCart > 0 ? (
                            <div className="flex items-center bg-store-primary text-white rounded-xl p-0.5 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => onRemoveFromCart(product.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 btn-spring text-white"
                                title="تقليل"
                              >
                                <Minus className="w-3 h-3 text-white" />
                              </button>
                              <span className="w-5 text-center font-black text-xs text-white">
                                {inCart}
                              </span>
                              <button
                                type="button"
                                onClick={() => onAddToCart(product)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 btn-spring text-white"
                                title="زيادة"
                              >
                                <Plus className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                saveRecentSearch(query);
                                onAddToCart(product);
                              }}
                              className="flex items-center gap-1 bg-store-primary text-white hover:opacity-90 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs btn-spring"
                            >
                              <ShoppingBag className="w-3.5 h-3.5 text-white" />
                              <span>أضف</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer Shortcut Bar */}
        {query.trim() && matchingProducts.length > 0 && (
          <div className="p-3 bg-store-card-subtle border-t border-store-line flex items-center justify-between text-xs">
            <span className="text-store-muted">اضغط Enter لعرض كافة النتائج في المتجر</span>
            <button
              type="button"
              onClick={() => {
                saveRecentSearch(query);
                if (onSelectQueryFilter) {
                  onSelectQueryFilter(query.trim());
                  onClose();
                }
              }}
              className="font-black text-store-primary hover:underline flex items-center gap-1"
            >
              <span>عرض في المتجر</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
