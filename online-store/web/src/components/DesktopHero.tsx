import React from 'react';
import { ShieldCheck, Sparkles, Clock, MapPin, ArrowLeft, Phone, MessageSquare } from 'lucide-react';
import type { Store } from '../types';

interface Props {
  store: Store;
  onExploreOffers: () => void;
}

export const DesktopHero: React.FC<Props> = ({ store, onExploreOffers }) => {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-3 sm:mt-4 mb-4 sm:mb-6">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-l from-store-primary via-store-primary-hover to-slate-900 text-white shadow-xl p-4 sm:p-8 border border-white/10">
        {/* Subtle Decorative Ambient Glows */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-store-accent/20 rounded-full blur-2xl translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-center">
          {/* Main Store Identity Column (7 cols) */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-3.5">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-amber-300 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>متجر إلكتروني رسمي معتمد</span>
            </div>

            <h2 className="text-xl sm:text-4xl font-black tracking-tight leading-tight">
              أهلاً بكم في <span className="text-amber-300">{store.name}</span>
            </h2>

            {store.welcome_message ? (
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-xl font-medium">
                {store.welcome_message}
              </p>
            ) : null}

            {/* Store Essential Badges */}
            <div className="pt-1 flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Store Operational Status */}
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border border-white/10 text-xs font-bold">
                <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${store.is_paused === 1 ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                <span>{store.is_paused === 1 ? 'المتجر مغلق مؤقتاً' : 'مفتوح لاستقبال الطلبات الآن'}</span>
              </div>

              {/* Verified Quality */}
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border border-white/10 text-xs font-bold text-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>أسعار الكاشير الرسمية</span>
              </div>
            </div>
          </div>

          {/* Store Quick Contact & Location Card (5 cols) */}
          <div className="lg:col-span-5">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-4 sm:p-5 border border-white/20 shadow-2xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/15">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-300" />
                  بيانات التواصل والخدمة
                </span>
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-lg font-bold border border-emerald-400/30">
                  خدمة فورية
                </span>
              </div>

              {/* Physical Address */}
              {store.address && (
                <div className="flex items-start gap-2.5 text-xs text-slate-200">
                  <MapPin className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{store.address}</span>
                </div>
              )}

              {/* Phone & WhatsApp Quick Connect */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {store.phone && (
                  <a
                    href={`tel:${store.phone}`}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 text-white py-2 px-3 rounded-xl text-xs font-bold transition-colors border border-white/15 btn-spring"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span dir="ltr">{store.phone}</span>
                  </a>
                )}
                {store.whatsapp && (
                  <a
                    href={`https://wa.me/2${store.whatsapp.replace(/^0+/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-xl text-xs font-black transition-colors shadow-sm btn-spring"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>مراسلة واتساب</span>
                  </a>
                )}
              </div>

              {/* Explore Catalog CTA */}
              <div className="pt-2 border-t border-white/15 flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">تسوق وتصفح المنتجات:</span>
                <button
                  onClick={onExploreOffers}
                  className="flex items-center gap-1.5 bg-white text-store-primary hover:bg-slate-100 px-4 py-2 rounded-xl text-xs font-black shadow-md transition-all btn-spring"
                >
                  <span>تصفح الأصناف</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
