import React, { useEffect, useRef, useState } from 'react';
import type { Store } from '../types';
import { ShoppingBag, Search, X, Clock, MapPin, Shield, ChevronDown, Megaphone, BadgeCheck } from 'lucide-react';

interface Props {
  store: Store;
  announcementText?: string | null;
  cartCount: number;
  cartTotalPiasters?: number;
  searchQuery: string;
  selectedDeliveryZone: string;
  onSearchChange: (q: string) => void;
  onOpenCart: () => void;
  onOpenTracker: () => void;
  onOpenDashboard: () => void;
  onSelectZoneClick?: () => void;
  onOpenSearchModal?: () => void;
}

export const Header: React.FC<Props> = ({
  store,
  announcementText,
  cartCount,
  cartTotalPiasters = 0,
  searchQuery,
  selectedDeliveryZone,
  onSearchChange,
  onOpenCart,
  onOpenTracker,
  onOpenDashboard,
  onSelectZoneClick,
  onOpenSearchModal,
}) => {
  const activeAnnouncement =
    announcementText !== undefined && announcementText !== null && announcementText.trim() !== ''
      ? announcementText
      : store.welcome_message;

  const cartTotalPounds = (cartTotalPiasters / 100).toFixed(2);
  const [badgePop, setBadgePop] = useState<'a' | 'b'>('a');
  const prevCartCountRef = useRef(cartCount);

  useEffect(() => {
    if (cartCount > 0 && cartCount !== prevCartCountRef.current) {
      setBadgePop(prev => (prev === 'a' ? 'b' : 'a'));
    }
    prevCartCountRef.current = cartCount;
  }, [cartCount]);

  return (
    <>
      {/* Top Welcome Announcement ticker (scrolls away naturally to maximize mobile browsing space) */}
      {activeAnnouncement && (
        <div className="bg-gradient-to-r from-store-primary via-store-secondary to-store-primary text-store-primary-contrast text-[11px] sm:text-xs py-1 sm:py-1.5 px-3 sm:px-4 text-center font-bold tracking-wide flex items-center justify-center gap-1.5 sm:gap-2 overflow-hidden">
          <Megaphone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-store-accent flex-shrink-0" />
          <span className="truncate">{activeAnnouncement}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-store-card border-b border-store-line/80 shadow-sm">
        {/* Main Bar */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-20 gap-2.5 sm:gap-3">
            {/* Store Logo & Title & Delivery Area */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="relative flex-shrink-0 group cursor-pointer">
                <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white flex items-center justify-center shadow-md shadow-black/10 group-hover:scale-105 transition-transform overflow-hidden p-1 sm:p-1.5 border border-store-line">
                  <img
                    src={store.logo_url || '/rafiq_logo.png'}
                    alt={store.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 sm:h-3.5 sm:w-3.5">
                  {store.is_paused !== 1 && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 border-[1.5px] sm:border-2 border-white ${
                      store.is_paused === 1 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    title={store.is_paused === 1 ? 'مغلق مؤقتاً' : 'مفتوح للطلب الآن'}
                  ></span>
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <h1 className="text-[13px] sm:text-lg font-black text-store-text truncate leading-tight">
                    {store.name}
                  </h1>
                  {store.slug === 'rafiq' && (
                    <BadgeCheck
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-store-secondary flex-shrink-0"
                      aria-label="متجر رسمي معتمد"
                    />
                  )}
                  {store.is_paused === 1 && (
                    <span className="text-[9px] sm:text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md font-bold flex-shrink-0">
                      مغلق
                    </span>
                  )}
                </div>

                {/* Delivery Zone Dropdown Pill */}
                <button
                  onClick={onSelectZoneClick || onOpenCart}
                  className="flex items-center gap-1 text-[10px] sm:text-[11px] text-store-muted hover:text-store-primary transition-colors text-right truncate group leading-tight"
                >
                  <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-store-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="truncate">
                    التوصيل لحد: <strong className="text-store-text font-black">{selectedDeliveryZone || 'اختار منطقتك'}</strong>
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-400 flex-shrink-0" />
                </button>
              </div>
            </div>

          {/* Desktop Search Center */}
          <div className="hidden lg:flex flex-1 max-w-md mx-4">
            <div
              onClick={onOpenSearchModal}
              className={`relative w-full ${onOpenSearchModal ? 'cursor-pointer' : ''}`}
            >
              <input
                type="text"
                placeholder="بتدور على إيه؟ اضغط للبحث الفوري عن الأصناف..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onClick={e => {
                  if (onOpenSearchModal) {
                    e.preventDefault();
                    onOpenSearchModal();
                  }
                }}
                className={`w-full pl-9 pr-10 py-2.5 rounded-2xl border border-store-line bg-store-card-subtle text-xs sm:text-sm text-store-text placeholder:text-store-muted focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-all shadow-inner ${
                  onOpenSearchModal ? 'cursor-pointer' : ''
                }`}
              />
              <Search className="w-4 h-4 text-store-muted absolute right-3.5 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onSearchChange('');
                  }}
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
              title="لوحة تحكم وتخصيص المتجر"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-store-primary/10 text-store-primary hover:bg-store-primary hover:text-white font-black text-[11px] sm:text-xs btn-spring transition-all border border-store-primary/25 shadow-2xs cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>لوحة التحكم</span>
            </button>

            {/* Desktop Cart Button */}
            <button
              onClick={onOpenCart}
              className="hidden sm:flex items-center gap-2.5 bg-gradient-to-r from-store-primary to-store-secondary hover:brightness-105 text-store-primary-contrast px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-md shadow-store-primary/20 btn-spring transition-all whitespace-nowrap"
            >
              <span className="relative flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                {cartCount > 0 && (
                  <span
                    data-pop={badgePop}
                    className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-store-accent text-slate-950 text-[10px] font-black flex items-center justify-center shadow-sm tabular-nums leading-none"
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </span>
              <span>السلة</span>
              {cartCount > 0 && (
                <>
                  <span className="h-4 w-px bg-white/25" aria-hidden="true" />
                  <span
                    data-pop={badgePop}
                    className="text-xs font-black text-white tabular-nums whitespace-nowrap"
                  >
                    {cartTotalPounds} <span className="text-[10px] font-bold text-white/85">ج.م</span>
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

          {/* Mobile Search Bar */}
          <div className="lg:hidden pb-2 pt-0">
            <div
              onClick={onOpenSearchModal}
              className={`relative w-full ${onOpenSearchModal ? 'cursor-pointer' : ''}`}
            >
              <input
                type="text"
                placeholder="بتدور على إيه؟ اضغط للبحث الفوري..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onClick={e => {
                  if (onOpenSearchModal) {
                    e.preventDefault();
                    onOpenSearchModal();
                  }
                }}
                className={`w-full pl-8 pr-9 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl border border-store-line bg-store-card-subtle text-xs sm:text-sm text-store-text placeholder:text-store-muted focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-all shadow-inner ${
                  onOpenSearchModal ? 'cursor-pointer' : ''
                }`}
              />
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-store-muted absolute right-3 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onSearchChange('');
                  }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-store-muted hover:text-store-text rounded-full hover:bg-store-primary-light/40"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
