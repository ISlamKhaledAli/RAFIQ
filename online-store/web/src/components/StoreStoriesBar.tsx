import React from 'react';
import { Flame, Sparkles, Truck, Award, Percent, LayoutGrid } from 'lucide-react';
import type { StoreThemeCustom } from './ThemeInjector';

export interface StoryItem {
  id: string;
  title: string;
  badge?: string;
  icon: React.ReactNode;
  gradient: string;
  hasUnseenRing?: boolean;
}

interface Props {
  activeStoryId?: string | null;
  onSelectStory: (storyId: string) => void;
  themeCustom?: StoreThemeCustom | null;
}

export const StoreStoriesBar: React.FC<Props> = ({ activeStoryId, onSelectStory, themeCustom }) => {
  const rawStories: Array<StoryItem & { visible: boolean }> = [
    {
      id: 'deals',
      title: themeCustom?.storyDealsTitle || 'عروض حصرية',
      badge: themeCustom?.storyDealsBadge || 'خصومات',
      icon: <Flame className="w-5 h-5 text-white" />,
      gradient: 'from-amber-500 via-rose-500 to-red-600',
      hasUnseenRing: true,
      visible: themeCustom?.showStoryDeals !== false,
    },
    {
      id: 'best_sellers',
      title: themeCustom?.storyBestSellersTitle || 'الأكثر طلباً',
      badge: themeCustom?.storyBestSellersBadge || 'رائج',
      icon: <Award className="w-5 h-5 text-white" />,
      gradient: 'from-violet-600 to-indigo-700',
      hasUnseenRing: true,
      visible: themeCustom?.showStoryBestSellers !== false,
    },
    {
      id: 'new_arrivals',
      title: themeCustom?.storyNewArrivalsTitle || 'وصل حديثاً',
      badge: themeCustom?.storyNewArrivalsBadge || 'جديد',
      icon: <Sparkles className="w-5 h-5 text-white" />,
      gradient: 'from-emerald-500 to-teal-700',
      hasUnseenRing: false,
      visible: themeCustom?.showStoryNewArrivals !== false,
    },
    {
      id: 'free_delivery',
      title: themeCustom?.storyFreeDeliveryTitle || 'شحن مجاني',
      badge: themeCustom?.storyFreeDeliveryBadge || 'توفير',
      icon: <Truck className="w-5 h-5 text-white" />,
      gradient: 'from-cyan-500 to-blue-600',
      hasUnseenRing: false,
      visible: themeCustom?.showStoryFreeDelivery !== false,
    },
    {
      id: 'combos',
      title: themeCustom?.storyCombosTitle || 'توفير العائلة',
      badge: themeCustom?.storyCombosBadge || 'حزم توفير',
      icon: <Percent className="w-5 h-5 text-white" />,
      gradient: 'from-fuchsia-500 to-pink-600',
      hasUnseenRing: false,
      visible: themeCustom?.showStoryCombos !== false,
    },
    {
      id: 'all',
      title: themeCustom?.storyAllTitle || 'كافة الأصناف',
      badge: themeCustom?.storyAllBadge || 'الكل',
      icon: <LayoutGrid className="w-5 h-5 text-white" />,
      gradient: 'from-slate-700 to-slate-900',
      hasUnseenRing: false,
      visible: themeCustom?.showStoryAll !== false,
    },
  ];

  const stories = rawStories.filter(s => s.visible);

  if (stories.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="قصص وتصنيفات سريعة"
      className="w-full py-2.5 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-x-auto no-scrollbar scroll-smooth"
    >
      <div className="flex items-center gap-3.5 sm:gap-5 min-w-max px-0.5">
        {stories.map(story => {
          const isActive = activeStoryId === story.id;
          return (
            <button
              key={story.id}
              type="button"
              onClick={() => onSelectStory(story.id)}
              className="group flex flex-col items-center gap-1.5 focus:outline-none cursor-pointer"
            >
              {/* Outer Ring with Breathing Animation */}
              <div
                className={`relative p-[2.5px] rounded-full transition-transform duration-300 group-hover:scale-105 group-active:scale-95 ${
                  isActive
                    ? 'ring-2 ring-store-primary ring-offset-2 scale-105'
                    : story.hasUnseenRing
                    ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-emerald-500 animate-pulse-slow shadow-sm'
                    : 'bg-slate-200 hover:bg-slate-300'
                }`}
              >
                <div className="p-0.5 bg-white rounded-full">
                  <div
                    className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br ${story.gradient} flex items-center justify-center shadow-inner relative overflow-hidden`}
                  >
                    {story.icon}
                    {/* Subtle Reflection Glare */}
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-white/25 pointer-events-none" />
                  </div>
                </div>

                {/* Micro Badge */}
                {story.badge && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs whitespace-nowrap border border-white">
                    {story.badge}
                  </span>
                )}
              </div>

              {/* Story Title */}
              <span
                className={`text-[11px] sm:text-xs transition-colors mt-0.5 ${
                  isActive
                    ? 'font-black text-store-primary underline decoration-2 underline-offset-4'
                    : 'font-bold text-slate-800 group-hover:text-store-primary'
                }`}
              >
                {story.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
