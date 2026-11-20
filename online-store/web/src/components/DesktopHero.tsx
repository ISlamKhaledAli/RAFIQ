import React from 'react';
import {
  MapPin,
  Phone,
  MessageSquare,
  Sparkles,
  Truck,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  ArrowLeft,
} from 'lucide-react';
import type { Store } from '../types';
import { buildWhatsAppUrl } from '../utils/whatsapp';

interface Props {
  store: Store;
  onExploreOffers?: () => void;
  onOpenDashboard?: () => void;
}

export const DesktopHero: React.FC<Props> = ({
  store,
  onExploreOffers,
  onOpenDashboard,
}) => {
  const isOfficialRafiqDemo = store.slug === 'rafiq';
  const hasContactInfo = Boolean(
    store.address?.trim() || store.phone?.trim() || store.whatsapp?.trim()
  );

  if (!isOfficialRafiqDemo && !hasContactInfo) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-3 mb-3 space-y-3">
      {/* Flagship Rafiq Brand Showcase Banner for Official Demo Store */}
      {isOfficialRafiqDemo && (
        <section
          className="relative rounded-[26px] overflow-hidden text-white border border-white/15 shadow-[0_20px_50px_-20px_rgba(0,55,45,0.45)] transition-all duration-500"
          style={{
            background:
              'var(--store-gradient, linear-gradient(135deg, #00372D 0%, #004D3F 52%, #006D41 100%))',
          }}
        >
          {/* Architectural Barcode & Grid Motif */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.11]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="rafiq-hero-grid"
                width="38"
                height="38"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 38 0 L 0 0 0 38"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="0.75"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#rafiq-hero-grid)" />
            <g fill="#CED46A" opacity="0.55">
              <rect x="28" y="0" width="3" height="100%" />
              <rect x="36" y="0" width="1.5" height="100%" />
              <rect x="42" y="0" width="5" height="100%" />
              <rect x="52" y="0" width="2" height="100%" />
            </g>
          </svg>

          {/* Ambient Glow Orbs */}
          <div className="pointer-events-none absolute -top-20 -left-16 w-72 h-72 rounded-full bg-[#CED46A]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-1/3 w-64 h-64 rounded-full bg-emerald-300/15 blur-3xl" />

          <div className="relative z-10 p-5 sm:p-7 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Right Editorial Brand Column */}
            <div className="lg:col-span-7 space-y-4 text-right">
              {/* Official Brand Pill + Full Logo */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-2 bg-white/12 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-2xl">
                  <img
                    src="/rafiq_logo.png"
                    alt="شعار رفيق"
                    className="w-5 h-5 object-contain"
                  />
                  <span className="text-[11px] font-black text-white tracking-wide">
                    هوية رفيق الرسمية
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-2xl bg-[#CED46A]/20 text-[#F7F8E8] border border-[#CED46A]/35">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#CED46A]" />
                  <span>المتجر التجريبي المعتمد</span>
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-3xl lg:text-[32px] font-black text-white leading-tight tracking-tight">
                  تجربة التسوّق الذكية لمتاجر{' '}
                  <span className="text-[#CED46A]">رفيق</span> الإلكترونية
                </h2>
                <p className="text-xs sm:text-sm text-white/85 leading-relaxed max-w-xl font-medium">
                  استعرض المنتجات، أضف للسلة، جرّب الدفع عبر كاش أو إنستاباي وفودافون كاش، وتابع حالة الطلب لحظة بلحظة — بنفس تجربة عملاء محلك المرتبطة مباشرةً بكاشير رفيق.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {onExploreOffers && (
                  <button
                    type="button"
                    onClick={onExploreOffers}
                    className="inline-flex items-center gap-2 bg-[#CED46A] hover:bg-[#dce17d] text-[#00372D] px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-black shadow-lg shadow-black/20 transition-all btn-spring cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-[#00372D]" />
                    <span>استكشف العروض المميزة</span>
                    <ArrowLeft className="w-3.5 h-3.5 text-[#00372D]" />
                  </button>
                )}

                {onOpenDashboard && (
                  <button
                    type="button"
                    onClick={onOpenDashboard}
                    className="inline-flex items-center gap-2 bg-white/12 hover:bg-white/20 backdrop-blur-md text-white border border-white/25 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all btn-spring cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-[#CED46A]" />
                    <span>جرّب لوحة التاجر والهويات</span>
                  </button>
                )}
              </div>
            </div>

            {/* Left Frosted Glass Feature Pillars Card */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-black/20 backdrop-blur-md border border-white/15 p-4 sm:p-5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between pb-2.5 border-b border-white/12">
                  <img
                    src="/logo_full_dark.png"
                    alt="RAFIQ رفيق"
                    className="h-7 sm:h-8 w-auto object-contain"
                  />
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-200 bg-emerald-400/15 border border-emerald-300/25 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    متصل لحظياً
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 bg-white/8 hover:bg-white/12 transition-colors rounded-2xl p-2.5 border border-white/10">
                    <div className="w-9 h-9 rounded-xl bg-[#CED46A]/20 text-[#CED46A] flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white">توصيل سريع خلال 60 دقيقة</div>
                      <div className="text-[11px] text-white/75 truncate">
                        اختيار منطقة التوصيل أو الاستلام من الفرع بسهولة
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white/8 hover:bg-white/12 transition-colors rounded-2xl p-2.5 border border-white/10">
                    <div className="w-9 h-9 rounded-xl bg-emerald-400/20 text-emerald-200 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white">طرق دفع محلية مرنة</div>
                      <div className="text-[11px] text-white/75 truncate">
                        كاش عند الاستلام • إنستاباي • فودافون كاش
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white/8 hover:bg-white/12 transition-colors rounded-2xl p-2.5 border border-white/10">
                    <div className="w-9 h-9 rounded-xl bg-white/15 text-white flex items-center justify-center flex-shrink-0">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white">مزامنة فورية مع كاشير رفيق</div>
                      <div className="text-[11px] text-white/75 truncate">
                        الأسعار والكميات متطابقة 100% مع مخزن المحل
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Sleek Compact Store Info Strip (only shown when store has address/phone/whatsapp) */}
      {hasContactInfo && (
        <div className="bg-store-card rounded-2xl border border-store-line/90 px-3.5 py-2.5 sm:px-5 sm:py-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 transition-all">
          {/* Physical Address */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            {store.address?.trim() && (
              <div className="flex items-center gap-1.5 text-xs text-store-text font-medium truncate">
                <MapPin className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                <span className="truncate">{store.address}</span>
              </div>
            )}
          </div>

          {/* Quick Contact & Action Buttons */}
          {(store.phone?.trim() || store.whatsapp?.trim()) && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {store.phone?.trim() && (
                <a
                  href={`tel:${store.phone}`}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-store-card-subtle hover:bg-store-primary-light/60 text-store-text px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border border-store-line btn-spring shadow-sm"
                  title="اتصال هاتفي بالمحل"
                >
                  <Phone className="w-3.5 h-3.5 text-store-primary" />
                  <span dir="ltr">{store.phone}</span>
                </a>
              )}

              {store.whatsapp?.trim() && (
                <a
                  href={buildWhatsAppUrl(store.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-store-secondary hover:opacity-90 !text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition-all btn-spring shadow-sm"
                  title="مراسلة المحل على الواتساب"
                >
                  <MessageSquare className="w-3.5 h-3.5 !text-white" />
                  <span className="!text-white">مراسلة واتساب</span>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
