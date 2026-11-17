import React from 'react';
import type { Store, Category } from '../types';
import { ShoppingBag, Search, X, Clock, MapPin, Shield, ChevronDown, Sparkles } from 'lucide-react';

interface Props {
  store: Store;
  cartCount: number;
  cartTotalPiasters?: number;
  searchQuery: string;
  selectedDeliveryZone: string;
  onSearchChange: (q: string) => void;
  onOpenCart: () => void;
  onOpenTracker: () => void;
  onOpenDashboard: () => void;
  onSelectZoneClick?: () => void;
}

export const Header: React.FC<Props> = ({
  store,
  cartCount,
  cartTotalPiasters = 0,
  searchQuery,
  selectedDeliveryZone,
  onSearchChange,
  onOpenCart,
  onOpenTracker,
  onOpenDashboard,
  onSelectZoneClick,
}) => {
  const cartTotalPounds = (cartTotalPiasters / 100).toFixed(2);

  return (
    <header className="sticky top-0 z-30 bg-store-card/90 backdrop-blur-md border-b border-store-line/80 shadow-2xs transition-all">
      {/* Top Welcome Announcement ticker if set */}
      {store.welcome_message && (
        <div className="bg-gradient-to-r from-store-primary via-store-secondary to-store-primary text-store-primary-contrast text-[11px] sm:text-xs py-1.5 px-4 text-center font-bold tracking-wide flex items-center justify-center gap-2 overflow-hidden shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-store-accent animate-pulse-slow flex-shrink-0" />
          <span className="truncate">{store.welcome_message}</span>
        </div>
      )}

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
          {/* Store Logo & Title & Delivery Area */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0 group cursor-pointer">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-store-primary to-store-secondary text-store-primary-contrast flex items-center justify-center font-black text-base sm:text-xl shadow-lg shadow-store-primary/20 group-hover:scale-105 transition-transform overflow-hidden p-1.5 border border-white/20">
                {store.logo_url ? (
                  <img src={store.logo_url} alt={store.name} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-white font-black text-base sm:text-xl select-none">
                    {store.name.charAt(0)}
                  </span>
                )}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                {store.is_paused !== 1 && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white ${
                    store.is_paused === 1 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  title={store.is_paused === 1 ? 'مغلق مؤقتاً' : 'مفتوح للطلب الآن'}
                ></span>
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-lg font-black text-store-text truncate">
                  {store.name}
                </h1>
                {store.is_paused === 1 && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md font-bold flex-shrink-0">
                    مغلق
                  </span>
                )}
              </div>

              {/* Delivery Zone Dropdown Pill */}
              <button
                onClick={onSelectZoneClick || onOpenCart}
                className="flex items-center gap-1 text-[11px] text-store-muted hover:text-store-primary transition-colors text-right truncate group"
              >
                <MapPin className="w-3 h-3 text-store-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">
                  التوصيل لحد: <strong className="text-store-text font-black">{selectedDeliveryZone || 'اختار منطقتك'}</strong>
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
              </button>
            </div>
          </div>

          {/* Desktop Search Center */}
          <div className="hidden lg:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="بتدور على إيه؟ اكتب اسم الصنف أو الباركود..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 rounded-2xl border border-store-line bg-store-card-subtle text-xs sm:text-sm text-store-text placeholder:text-store-muted focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-all shadow-inner"
              />
              <Search className="w-4 h-4 text-store-muted absolute right-3.5 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-store-muted hover:text-store-text rounded-full hover:bg-store-primary-light/40 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Order Tracker button on desktop */}
            <button
              onClick={onOpenTracker}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-store-primary hover:bg-slate-100 btn-spring rounded-2xl border border-slate-200 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-store-primary" />
              <span>تتبع الأوردر</span>
            </button>

            {/* Owner Dashboard Shortcut */}
            <button
              onClick={onOpenDashboard}
              title="لوحة تحكم صاحب المحل"
              className="p-2 sm:p-2.5 rounded-2xl text-store-muted hover:text-store-primary hover:bg-store-primary-light/50 btn-spring transition-colors"
            >
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Desktop Cart Button */}
            <button
              onClick={onOpenCart}
              className="hidden sm:flex items-center gap-2.5 bg-gradient-to-r from-store-primary to-store-secondary hover:brightness-105 text-store-primary-contrast px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-md shadow-store-primary/20 btn-spring transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>السلة</span>
              {cartCount > 0 ? (
                <div className="flex items-center gap-1.5 bg-white/20 px-2 py-0.5 rounded-xl animate-pop">
                  <span className="font-black text-store-accent">{cartCount}</span>
                  <span className="text-[11px] text-store-primary-contrast/90">• {cartTotalPounds} ج.م</span>
                </div>
              ) : null}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar & Real Category Pills */}
        <div className="lg:hidden pb-3 pt-0.5">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="بتدور على إيه؟ اكتب اسم الصنف أو الباركود..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-10 py-2 sm:py-2.5 rounded-2xl border border-store-line bg-store-card-subtle text-xs sm:text-sm text-store-text placeholder:text-store-muted focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-all shadow-inner"
            />
            <Search className="w-4 h-4 text-store-muted absolute right-3.5 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-store-muted hover:text-store-text rounded-full hover:bg-store-primary-light/40"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
