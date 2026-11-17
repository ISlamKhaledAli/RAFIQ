import React from 'react';
import { MapPin, Phone, MessageSquare } from 'lucide-react';
import type { Store } from '../types';

interface Props {
  store: Store;
  onExploreOffers?: () => void;
}

export const DesktopHero: React.FC<Props> = ({ store }) => {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-2 mb-3">
      {/* Sleek Compact Store Info Strip */}
      <div className="bg-store-card rounded-2xl border border-store-line/90 px-3.5 py-2.5 sm:px-5 sm:py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 transition-all">
        {/* Physical Address & Operational Status */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex-shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                store.is_paused === 1 ? 'bg-amber-500' : 'bg-emerald-600 animate-pulse'
              }`}
            ></span>
            <span>{store.is_paused === 1 ? 'المحل مغلق مؤقتاً' : 'شغالين وبنستقبل أوردراتكم دلوقتي'}</span>
          </div>

          {/* Store Address */}
          {store.address && (
            <div className="flex items-center gap-1.5 text-xs text-slate-800 font-medium truncate">
              <MapPin className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
              <span className="truncate">{store.address}</span>
            </div>
          )}
        </div>

        {/* Quick Contact & Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {store.phone && (
            <a
              href={`tel:${store.phone}`}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border border-slate-200 btn-spring shadow-2xs"
              title="اتصال هاتفي بالمحل"
            >
              <Phone className="w-3.5 h-3.5 text-slate-600" />
              <span dir="ltr">{store.phone}</span>
            </a>
          )}

          {store.whatsapp && (
            <a
              href={`https://wa.me/2${store.whatsapp.replace(/^0+/, '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 !text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition-all btn-spring shadow-xs"
              title="مراسلة المحل على الواتساب"
            >
              <MessageSquare className="w-3.5 h-3.5 !text-white" />
              <span className="!text-white">مراسلة واتساب</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
