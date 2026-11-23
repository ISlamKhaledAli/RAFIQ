import React, { useState, useEffect, useRef } from 'react';
import { Flame, Zap, ShieldCheck, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Store } from '../types';
import type { StoreThemeCustom } from './ThemeInjector';

interface PromoSlide {
  id: string;
  tag: string;
  title: string;
  highlight: string;
  subtitle: string;
  ctaText: string;
  badgeIcon: React.ReactNode;
  bgGradient: string;
  actionType: 'offers' | 'delivery' | 'guarantee';
}

interface Props {
  store: Store;
  themeCustom?: StoreThemeCustom | null;
  onExploreOffers?: () => void;
  onExploreDelivery?: () => void;
  onExploreGuarantee?: () => void;
}

export const HeroPromoCarousel: React.FC<Props> = ({
  store,
  themeCustom,
  onExploreOffers,
  onExploreDelivery,
  onExploreGuarantee,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const slides: PromoSlide[] = [
    {
      id: 'offers',
      tag: themeCustom?.heroSlide1Tag || 'عروض وتخفيضات خاصة',
      title: themeCustom?.heroSlide1Title || 'تسوق أفضل منتجات',
      highlight: themeCustom?.heroSlide1Highlight || store.name || 'المتجر',
      subtitle:
        themeCustom?.heroSlide1Subtitle ||
        store.welcome_message ||
        'خصومات حصرية على تشكيلة واسعة من الأصناف واحتياجات المنزل اليومية.',
      ctaText: themeCustom?.heroSlide1Cta || 'استكشف التخفيضات',
      badgeIcon: <Flame className="w-4 h-4 text-amber-300" />,
      bgGradient: 'var(--store-gradient, linear-gradient(135deg, #00372D 0%, #004D3F 52%, #006D41 100%))',
      actionType: 'offers',
    },
    {
      id: 'delivery',
      tag: themeCustom?.heroSlide2Tag || 'توصيل فوري لباب البيت',
      title: themeCustom?.heroSlide2Title || 'طلبك يوصلك أينما كنت',
      highlight: themeCustom?.heroSlide2Highlight || 'بسرعة وأمان تام',
      subtitle:
        themeCustom?.heroSlide2Subtitle ||
        'فريق دليفري محترف لتسليم طلبك طازجاً مع دعم الدفع عند الاستلام أو إلكترونياً بإنستاباي ومحافظ الكاش.',
      ctaText: themeCustom?.heroSlide2Cta || 'ابدأ طلبك الآن',
      badgeIcon: <Zap className="w-4 h-4 text-emerald-300" />,
      bgGradient: 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)',
      actionType: 'delivery',
    },
    {
      id: 'guarantee',
      tag: themeCustom?.heroSlide3Tag || 'ضمان الأسعار والجودة',
      title: themeCustom?.heroSlide3Title || 'أسعار الكاشير الرسمية',
      highlight: themeCustom?.heroSlide3Highlight || 'بدون أي زيادات خفية',
      subtitle:
        themeCustom?.heroSlide3Subtitle ||
        'نظام رفيق يربط المتجر لحظياً بمخزن المحل لضمان توفر البضاعة ودقة الأسعار وجودة كل صنف.',
      ctaText: themeCustom?.heroSlide3Cta || 'تصفح كافة الأصناف',
      badgeIcon: <ShieldCheck className="w-4 h-4 text-cyan-300" />,
      bgGradient: 'linear-gradient(135deg, #1E293B 0%, #334155 55%, #0F172A 100%)',
      actionType: 'guarantee',
    },
  ];

  // Auto-slide every 6 seconds unless user pauses or hovers
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const handleNext = () => {
    setCurrentSlide(prev => (prev + 1) % slides.length);
  };

  const handlePrev = () => {
    setCurrentSlide(prev => (prev - 1 + slides.length) % slides.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    // RTL: positive diff means swiped left (towards next in RTL or prev)
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
    touchStartXRef.current = null;
  };

  const handleAction = (type: 'offers' | 'delivery' | 'guarantee') => {
    if (type === 'offers' && onExploreOffers) onExploreOffers();
    else if (type === 'delivery' && onExploreDelivery) onExploreDelivery();
    else if (type === 'guarantee' && onExploreGuarantee) onExploreGuarantee();
    else if (onExploreOffers) onExploreOffers();
  };

  const slide = slides[currentSlide];

  return (
    <div
      className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-2 mb-3 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="relative rounded-[26px] sm:rounded-[30px] overflow-hidden text-white shadow-xl transition-all duration-700 min-h-[175px] sm:min-h-[220px] flex items-center border border-white/10"
        style={{ background: slide.bgGradient }}
      >
        {/* Subtle Background Pattern */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        {/* Ambient Blur Orb */}
        <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        {/* Slide Content */}
        <div className="relative z-10 p-4 sm:p-7 w-full flex flex-col justify-between h-full">
          <div className="max-w-2xl space-y-1.5 sm:space-y-2 text-right">
            {/* Tag Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] sm:text-[11px] font-black text-amber-300 shadow-2xs">
              {slide.badgeIcon}
              <span>{slide.tag}</span>
            </div>

            {/* Headline */}
            <h2 className="text-base sm:text-2xl lg:text-3xl font-black leading-tight tracking-tight">
              {slide.title}{' '}
              <span className="text-amber-300 underline decoration-amber-400/40">
                {slide.highlight}
              </span>
            </h2>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm text-white/85 line-clamp-2 max-w-xl font-medium leading-relaxed">
              {slide.subtitle}
            </p>
          </div>

          {/* Action Row & Navigation Controls */}
          <div className="pt-2 sm:pt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleAction(slide.actionType)}
              className="inline-flex items-center gap-1.5 sm:gap-2 bg-white text-slate-950 hover:bg-amber-300 hover:text-slate-950 font-black px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm shadow-md transition-all btn-spring cursor-pointer"
            >
              <span>{slide.ctaText}</span>
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Navigation Indicators & Arrows */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                className="hidden sm:flex w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 items-center justify-center text-white transition-colors"
                title="السابق"
                aria-label="السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5 px-1">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentSlide(idx)}
                    className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                      idx === currentSlide
                        ? 'w-5 sm:w-6 bg-white shadow-xs'
                        : 'w-1.5 sm:w-2 bg-white/40 hover:bg-white/70'
                    }`}
                    aria-label={`الشريحة ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="hidden sm:flex w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 items-center justify-center text-white transition-colors"
                title="التالي"
                aria-label="التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
