import React, { useEffect, useRef } from 'react';
import type { Category } from '../types';
import { Layers, LayoutGrid, Utensils, Coffee, Milk, Croissant, SprayCan as Spray, Sparkles, Heart } from 'lucide-react';

interface Props {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  isSticky?: boolean;
}

export const CategoryPills: React.FC<Props> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  isSticky = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Auto-scroll the active pill into the visual center smoothly
  useEffect(() => {
    if (selectedCategoryId && pillRefs.current[selectedCategoryId]) {
      const pill = pillRefs.current[selectedCategoryId];
      pill?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [selectedCategoryId]);

  // Contextual SVG icons without emojis
  const getCategoryIcon = (name: string, isSelected: boolean) => {
    const iconClass = `w-3.5 h-3.5 ${isSelected ? '!text-white' : 'text-store-primary'}`;
    if (name.includes('الكل')) return <LayoutGrid className={iconClass} />;
    if (name.includes('ألبان') || name.includes('جبن') || name.includes('لبن')) return <Milk className={iconClass} />;
    if (name.includes('مخبوزات') || name.includes('فطار') || name.includes('عيش')) return <Croissant className={iconClass} />;
    if (name.includes('مشروبات') || name.includes('عصائر') || name.includes('شاي') || name.includes('قهوة')) return <Coffee className={iconClass} />;
    if (name.includes('منظفات') || name.includes('عناية') || name.includes('غسيل')) return <Spray className={iconClass} />;
    if (name.includes('بقالة') || name.includes('أرز') || name.includes('زيت') || name.includes('مكرونة')) return <Utensils className={iconClass} />;
    if (name.includes('عروض') || name.includes('تخفيض')) return <Sparkles className={iconClass} />;
    if (name.includes('مفضلة')) return <Heart className={iconClass} />;
    return <Layers className={iconClass} />;
  };

  return (
    <div
      ref={containerRef}
      className={`py-2 overflow-x-auto no-scrollbar scroll-smooth transition-all ${
        isSticky
          ? 'sticky top-12 z-20 bg-store-card/95 backdrop-blur-md border-b border-store-line shadow-xs px-2'
          : ''
      }`}
    >
      <div className="flex items-center gap-2 min-w-max px-1">
        {categories.map(cat => {
          const isSelected = selectedCategoryId === cat.id;
          const productCount = cat.visible_products ?? cat.total_products;
          return (
            <button
              key={cat.id}
              ref={el => {
                pillRefs.current[cat.id] = el;
              }}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap ${
                isSelected
                  ? 'bg-store-primary !text-white shadow-md scale-102 border-2 border-store-primary font-black'
                  : 'bg-store-card text-store-text hover:bg-store-card-subtle hover:text-store-primary border border-store-line'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-white/20 !text-white' : 'bg-store-card-subtle text-store-primary'
                }`}
              >
                {getCategoryIcon(cat.name, isSelected)}
              </div>
              <span className={isSelected ? '!text-white' : ''}>{cat.name}</span>
              {typeof productCount === 'number' && productCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums font-bold ${
                    isSelected
                      ? 'bg-white/25 !text-white'
                      : 'bg-store-card-subtle text-store-muted'
                  }`}
                >
                  {productCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
