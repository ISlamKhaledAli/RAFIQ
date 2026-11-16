import React from 'react';
import type { Category, Store } from '../types';
import { RafiqBrandingCard } from './RafiqBrandingCard';
import {
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Truck,
  Utensils,
  Milk,
  Coffee,
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
    const iconClass = `w-4 h-4 ${isSelected ? 'text-store-primary' : 'text-slate-500'}`;
    if (name.includes('الكل')) return <Sparkles className={iconClass} />;
    if (name.includes('ألبان') || name.includes('جبن')) return <Milk className={iconClass} />;
    if (name.includes('مشروبات') || name.includes('عصائر')) return <Coffee className={iconClass} />;
    if (name.includes('منظفات')) return <Spray className={iconClass} />;
    if (name.includes('بقالة')) return <Utensils className={iconClass} />;
    return <Layers className={iconClass} />;
  };

  return (
    <aside className="hidden lg:block w-72 flex-shrink-0 space-y-5">
      {/* Categories Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-store-primary" />
            <span>أقسام المنتجات</span>
          </h3>
          <span className="text-[11px] font-bold text-slate-400">{categories.length} أقسام</span>
        </div>

        <nav className="space-y-1">
          {categories.map(cat => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-store-primary-light text-store-primary font-black shadow-xs ring-1 ring-store-primary/20'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-xl ${isSelected ? 'bg-white text-store-primary shadow-xs' : 'bg-slate-100'}`}>
                    {getCategoryIcon(cat.name, isSelected)}
                  </div>
                  <span>{cat.name}</span>
                </div>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-store-primary"></span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Quick Filters Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
        <h4 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100">
          تصفية سريعة
        </h4>

        <div className="space-y-2">
          {/* Featured Filter */}
          <label className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>عروض وتخفيضات فقط</span>
            </div>
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={onToggleFeatured}
              className="w-4 h-4 rounded text-store-primary focus:ring-store-primary cursor-pointer accent-store-primary"
            />
          </label>

          {/* In Stock Filter */}
          <label className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-store-primary" />
              <span>المتوفر بالمخزن فقط</span>
            </div>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={onToggleInStock}
              className="w-4 h-4 rounded text-store-primary focus:ring-store-primary cursor-pointer accent-store-primary"
            />
          </label>
        </div>
      </div>

      {/* Store Info Widget */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3.5">
        <h4 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-store-primary" />
          <span>مواعيد العمل والتوصيل</span>
        </h4>

        {store.working_hours ? (
          <div className="space-y-1.5 text-xs text-slate-600">
            {Object.entries(store.working_hours).map(([day, hrs]) => (
              <div key={day} className="flex justify-between items-center py-0.5 border-b border-slate-50 last:border-none">
                <span className="font-bold text-slate-800">{day}</span>
                <span className="font-medium text-slate-500">{hrs}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">مفتوح يومياً لاستقبال طلباتكم</p>
        )}

        {/* Delivery Zones Table */}
        {store.delivery_zones && store.delivery_zones.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-store-primary" />
              <span>مناطق التوصيل ورسومها:</span>
            </div>
            <div className="space-y-1">
              {store.delivery_zones.map(z => (
                <div key={z.name} className="flex justify-between text-xs py-0.5 text-slate-600">
                  <span>{z.name}</span>
                  <span className="font-bold text-store-primary">{(z.fee / 100).toFixed(2)} ج.م</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact info */}
        {store.phone && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-700">
            <span className="flex items-center gap-1 text-slate-500 font-bold">
              <Phone className="w-3.5 h-3.5 text-store-primary" />
              خدمة العملاء:
            </span>
            <span className="font-black text-slate-900" dir="ltr">{store.phone}</span>
          </div>
        )}
      </div>

      {/* Rafiq POS Platform Branding & Promotional Card */}
      <RafiqBrandingCard variant="sidebar" />
    </aside>
  );
};
