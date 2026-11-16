import React from 'react';
import type { Store, Category } from '../types';
import { ShoppingBag, Search, X, MessageSquare, Clock, MapPin, Shield, ChevronDown, Sparkles } from 'lucide-react';

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
    <header className="sticky top-0 z-30 glass-header border-b border-store-line/80 shadow-xs transition-all">
      {/* Top Welcome Announcement ticker if set */}
      {store.welcome_message && (
        <div className="bg-gradient-to-r from-store-primary via-store-primary-hover to-store-primary text-white text-[11px] sm:text-xs py-1.5 px-4 text-center font-bold tracking-wide flex items-center justify-center gap-2 overflow-hidden shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse-slow flex-shrink-0" />
          <span className="truncate">{store.welcome_message}</span>
        </div>
      )}

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
          {/* Store Logo & Title & Delivery Area */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0 group cursor-pointer">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-store-primary to-store-primary-hover text-white flex items-center justify-center font-black text-base sm:text-xl shadow-lg shadow-store-primary/20 group-hover:scale-105 transition-transform overflow-hidden p-1.5 border border-white/20">
                {store.logo_url ? (
                  <img src={store.logo_url} alt={store.name} className="w-full h-full object-contain" />
                ) : (
                  <img src="/logo_white.png" alt={store.name} className="w-full h-full object-contain" />
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
                  التوصيل إلى: <strong className="text-store-text font-black">{selectedDeliveryZone || 'اختر منطقتك'}</strong>
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
                placeholder="ابحث عن اسم المنتج أو الباركود..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 rounded-2xl border border-store-line bg-slate-50/80 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all shadow-inner"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* WhatsApp direct button */}
            {store.whatsapp && (
              <a
                href={`https://wa.me/2${store.whatsapp.replace(/^0+/, '')}`}
                target="_blank"
                rel="noreferrer"
                title="تواصل معنا عبر واتساب"
                className="flex items-center justify-center w-9 h-9 sm:w-auto sm:px-3.5 sm:py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 btn-spring rounded-2xl border border-emerald-200 transition-colors shadow-2xs"
              >
                <MessageSquare className="w-4 h-4 text-emerald-600 sm:ml-1.5" />
                <span className="hidden sm:inline">واتساب المحل</span>
              </a>
            )}

            {/* Order Tracker button on desktop */}
            <button
              onClick={onOpenTracker}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-store-primary hover:bg-slate-100 btn-spring rounded-2xl border border-store-line transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-store-primary" />
              <span>تتبع الطلب</span>
            </button>

            {/* Owner Dashboard Shortcut */}
            <button
              onClick={onOpenDashboard}
              title="لوحة تحكم صاحب المحل"
              className="p-2 sm:p-2.5 rounded-2xl text-slate-400 hover:text-store-primary hover:bg-store-primary-light btn-spring transition-colors"
            >
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Desktop Cart Button */}
            <button
              onClick={onOpenCart}
              className="hidden sm:flex items-center gap-2.5 bg-store-primary hover:bg-store-primary-hover text-white px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-md shadow-store-primary/20 btn-spring transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>السلة</span>
              {cartCount > 0 ? (
                <div className="flex items-center gap-1.5 bg-white/20 px-2 py-0.5 rounded-xl animate-pop">
                  <span className="font-black text-amber-300">{cartCount}</span>
                  <span className="text-[11px] text-white/90">• {cartTotalPounds} ج.م</span>
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
              placeholder="ابحث عن اسم المنتج أو الباركود..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-10 py-2 sm:py-2.5 rounded-2xl border border-store-line bg-slate-50/90 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all shadow-inner"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200"
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
