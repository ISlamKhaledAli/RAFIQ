import React from 'react';
import { ShieldCheck, Clock, RefreshCw, Smartphone } from 'lucide-react';
import type { StoreThemeCustom } from './ThemeInjector';

interface Props {
  themeCustom?: StoreThemeCustom | null;
}

export const TrustBadgesStrip: React.FC<Props> = ({ themeCustom }) => {
  const items = [
    {
      icon: <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />,
      title: themeCustom?.trustBadge1Title || 'توصيل فوري سريع',
      desc: themeCustom?.trustBadge1Desc || 'من رف المحل لباب بيتك',
    },
    {
      icon: <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-store-primary" />,
      title: themeCustom?.trustBadge2Title || 'أسعار الكاشير الرسمية',
      desc: themeCustom?.trustBadge2Desc || 'نفس أسعار المحل بدون أي زيادة',
    },
    {
      icon: <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />,
      title: themeCustom?.trustBadge3Title || 'دفع مرن وسهل',
      desc: themeCustom?.trustBadge3Desc || 'كاش عند الاستلام أو إنستاباي ومحافظ',
    },
    {
      icon: <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />,
      title: themeCustom?.trustBadge4Title || 'معاينة عند الاستلام',
      desc: themeCustom?.trustBadge4Desc || 'حق مراجعة طلبك قبل الاستلام',
    },
  ];

  return (
    <section aria-label="مميزات وثقة المتجر" className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 my-2.5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3.5 bg-store-card p-3 sm:p-4 rounded-3xl border border-store-line shadow-2xs">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-2xl hover:bg-store-card-subtle transition-colors"
          >
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-2xl bg-store-card-subtle border border-store-line/60 flex items-center justify-center flex-shrink-0 shadow-2xs">
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-[11px] sm:text-xs font-black text-store-text line-clamp-1 leading-tight">
                {item.title}
              </h4>
              <p className="text-[9px] sm:text-[11px] text-store-muted line-clamp-2 mt-0.5 leading-snug">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
