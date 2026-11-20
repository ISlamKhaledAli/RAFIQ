import React from 'react';
import type { Category, Store } from '../types';
import { ToggleSwitch } from './admin/ToggleSwitch';
import {
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  MapPin,
  Truck,
  Utensils,
  Milk,
  Coffee,
  Croissant,
  SprayCan as Spray,
} from 'lucide-react';

interface Props {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  featuredOnly: boolean;
  onToggleFeatured: () => void;
  inStockOnly: boolean;
  onToggleInStock: () => void;
  store: Store;
}

export const DesktopSidebar: React.FC<Props> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  featuredOnly,
  onToggleFeatured,
  inStockOnly,
  onToggleInStock,
  store,
}) => {
  const getCategoryIcon = (name: string, isSelected: boolean) => {
    const iconClass = `w-4 h-4 ${isSelected ? '!text-white' : 'text-slate-500 group-hover:text-store-primary'}`;
    if (name.includes('الكل')) return <Sparkles className={iconClass} />;
    if (name.includes('ألبان') || name.includes('جبن')) return <Milk className={iconClass} />;
    if (name.includes('مخبوزات') || name.includes('فطار')) return <Croissant className={iconClass} />;
    if (name.includes('مشروبات') || name.includes('عصائر')) return <Coffee className={iconClass} />;
    if (name.includes('منظفات')) return <Spray className={iconClass} />;
    if (name.includes('بقالة')) return <Utensils className={iconClass} />;
    return <Layers className={iconClass} />;
  };

  return (
    <aside className="hidden lg:block w-72 flex-shrink-0 space-y-5">
      {/* Categories Card */}
      <div className="bg-store-card rounded-3xl border border-store-line p-5 shadow-2xs space-y-3 transition-colors">
        <div className="flex items-center justify-between pb-2 border-b border-store-line/60">
          <h3 className="text-sm font-black text-store-text flex items-center gap-2">
            <Layers className="w-4 h-4 text-store-primary" />
            <span>أقسام المنتجات</span>
          </h3>
          <span className="text-[11px] font-bold text-store-muted">{categories.length} أقسام</span>
        </div>

        <nav className="space-y-1">
          {categories.map(cat => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`w-full group flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all btn-spring ${
                  isSelected
                    ? 'bg-store-primary !text-white font-black shadow-md border-2 border-store-primary'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-store-primary'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-xl transition-colors ${isSelected ? 'bg-white/20 !text-white shadow-xs' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                    {getCategoryIcon(cat.name, isSelected)}
                  </div>
                  <span className={isSelected ? '!text-white' : ''}>{cat.name}</span>
                </div>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-white shadow-xs"></span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Quick Filters Card */}
      <div className="bg-store-card rounded-3xl border border-store-line p-5 shadow-sm space-y-3 transition-colors">
        <h4 className="text-xs font-black text-store-text pb-2 border-b border-store-line/60">
          تصفية سريعة
        </h4>

        <div className="space-y-2">
          {/* Featured Filter */}
          <div
            role="button"
            tabIndex={0}
            onClick={onToggleFeatured}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleFeatured();
              }
            }}
            className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
              featuredOnly
                ? 'bg-store-primary-light/50 border-store-primary/30'
                : 'border-transparent hover:bg-store-primary-light/30 hover:border-store-line/60'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-store-text select-none">
              <Sparkles className="w-4 h-4 text-store-accent shrink-0" />
              <span>عروض وتخفيضات فقط</span>
            </div>
            <ToggleSwitch
              checked={featuredOnly}
              onChange={() => onToggleFeatured()}
              size="sm"
              activeClassName="bg-store-primary hover:bg-store-primary-hover"
            />
          </div>

          {/* In Stock Filter */}
          <div
            role="button"
            tabIndex={0}
            onClick={onToggleInStock}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleInStock();
              }
            }}
            className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
              inStockOnly
                ? 'bg-store-primary-light/50 border-store-primary/30'
                : 'border-transparent hover:bg-store-primary-light/30 hover:border-store-line/60'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-store-text select-none">
              <CheckCircle2 className="w-4 h-4 text-store-primary shrink-0" />
              <span>المتوفر بالمخزن فقط</span>
            </div>
            <ToggleSwitch
              checked={inStockOnly}
              onChange={() => onToggleInStock()}
              size="sm"
              activeClassName="bg-store-primary hover:bg-store-primary-hover"
            />
          </div>
        </div>
      </div>

      {/* Store Info Widget */}
      <div className="bg-store-card rounded-3xl border border-store-line p-5 shadow-sm space-y-3.5 transition-colors">
        <h4 className="text-xs font-black text-store-text pb-2 border-b border-store-line/60 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-store-primary" />
          <span>مواعيد العمل والتوصيل</span>
        </h4>

        {store.working_hours ? (
          <div className="space-y-2 text-xs text-store-muted">
            {Object.entries(store.working_hours).map(([day, hrs]) => (
              <div key={day} className="flex justify-between border-b border-store-line/50 pb-1.5">
                <span className="text-store-muted font-medium">{day}:</span>
                <span className="font-bold text-store-text">{hrs}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-store-muted font-medium">مفتوح يومياً لخدمتكم</p>
        )}

        {store.address && (
          <div className="pt-1 flex items-start gap-2 text-xs text-store-muted">
            <MapPin className="w-4 h-4 text-store-primary flex-shrink-0 mt-0.5" />
            <span className="leading-snug text-store-text font-medium">{store.address}</span>
          </div>
        )}

        {store.min_order_amount > 0 && (
          <div className="p-3 rounded-2xl bg-store-primary-light/50 border border-store-primary/20 text-xs font-bold text-store-primary flex items-center gap-2">
            <Truck className="w-4 h-4 flex-shrink-0" />
            <span>الحد الأدنى للطلب: {(store.min_order_amount / 100).toFixed(2)} ج.م</span>
          </div>
        )}
      </div>
    </aside>
  );
};
