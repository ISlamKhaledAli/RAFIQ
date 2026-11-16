import React from 'react';
import type { Category } from '../types';
import { Layers, Sparkles, Utensils, Coffee, Milk, SprayCan as Spray } from 'lucide-react';

interface Props {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
}

export const CategoryPills: React.FC<Props> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
}) => {
  // Helper to pick contextual icons
  const getCategoryIcon = (name: string, isSelected: boolean) => {
    const iconClass = `w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-store-primary'}`;
    if (name.includes('الكل')) return <Sparkles className={iconClass} />;
    if (name.includes('ألبان') || name.includes('جبن')) return <Milk className={iconClass} />;
    if (name.includes('مشروبات') || name.includes('عصائر')) return <Coffee className={iconClass} />;
    if (name.includes('منظفات')) return <Spray className={iconClass} />;
    if (name.includes('بقالة')) return <Utensils className={iconClass} />;
    return <Layers className={iconClass} />;
  };

  return (
    <div className="py-2 overflow-x-auto no-scrollbar scroll-smooth">
      <div className="flex items-center gap-2 min-w-max px-1">
        {categories.map(cat => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-xs ${
                isSelected
                  ? 'bg-store-primary text-white shadow-md shadow-store-primary/20 scale-102 ring-2 ring-store-primary/20'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-store-line'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                  isSelected ? 'bg-white/20' : 'bg-slate-100'
                }`}
              >
                {getCategoryIcon(cat.name, isSelected)}
              </div>
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
