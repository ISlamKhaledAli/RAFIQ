import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Sparkles, 
  Check, 
  RotateCcw,
  Layers
} from 'lucide-react';
import { 
  CATEGORY_ICON_CATALOG, 
  CATEGORY_ICON_MAP, 
  detectSmartCategoryIconKey, 
  setCustomCategoryIcon,
  getCustomCategoryIconKey
} from '../utils/categoryIcons';
import { normalizeArabicText } from '../utils/money';

interface CategoryIconPickerModalProps {
  categoryName: string;
  categoryId?: string;
  onClose: () => void;
  onIconSelected?: (iconKey: string | null) => void;
}

export const CategoryIconPickerModal: React.FC<CategoryIconPickerModalProps> = ({
  categoryName,
  categoryId,
  onClose,
  onIconSelected
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'food' | 'grocery' | 'general'>('all');

  const smartSuggestedKey = useMemo(() => {
    return detectSmartCategoryIconKey(categoryName);
  }, [categoryName]);

  const currentCustomKey = useMemo(() => {
    return getCustomCategoryIconKey(categoryName, categoryId);
  }, [categoryName, categoryId]);

  const activeKey = currentCustomKey || smartSuggestedKey;
  const isAutoMode = !currentCustomKey;

  const filteredIcons = useMemo(() => {
    const query = normalizeArabicText(searchQuery.trim());
    return CATEGORY_ICON_CATALOG.filter((item) => {
      if (selectedGroup !== 'all' && item.group !== selectedGroup) {
        return false;
      }
      if (!query) return true;
      const itemName = normalizeArabicText(item.name);
      return itemName.includes(query) || item.key.toLowerCase().includes(query.toLowerCase());
    });
  }, [searchQuery, selectedGroup]);

  const handleSelectIcon = (key: string | null) => {
    setCustomCategoryIcon(categoryId || categoryName, key);
    onIconSelected?.(key);
    onClose();
  };

  const SmartIconComponent = CATEGORY_ICON_MAP[smartSuggestedKey];

  return (
    <div 
      className="fixed inset-0 z-60 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[85vh] bg-surface rounded-xl shadow-2xl border border-line overflow-hidden flex flex-col text-right">
        {/* Header */}
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" />
            <div>
              <h3 className="text-xs font-bold text-ink m-0">
                اختيار أيقونة للقسم: <span className="text-brand font-extrabold">{categoryName}</span>
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-danger p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
          {/* Smart Auto Card */}
          <div className="p-3 rounded-xl bg-brand-soft/40 border border-brand/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-surface border border-brand/30 flex items-center justify-center text-brand shrink-0 shadow-xs">
                {SmartIconComponent && <SmartIconComponent className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-bold text-ink text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  <span>الاقتراح الذكي للنظام</span>
                  {isAutoMode && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand text-white">
                      مفعّل حالياً
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  تم تحديدها تلقائياً بالذكاء الاصطناعي بناءً على اسم القسم.
                </p>
              </div>
            </div>

            {!isAutoMode && (
              <button
                type="button"
                onClick={() => handleSelectIcon(null)}
                className="px-2.5 py-1.5 rounded-lg bg-surface border border-line hover:border-brand hover:bg-surface-2 text-ink text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                title="إعادة التعيين للاقتراح الذكي"
              >
                <RotateCcw className="w-3 h-3 text-brand" />
                <span>استعادة التلقائي</span>
              </button>
            )}
          </div>

          {/* Search Bar & Filter Tabs */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث في الأيقونات (مثال: حليب، خضار، دخان، عصير)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg h-9 pr-9 pl-3 text-xs text-ink focus:outline-none focus:border-brand"
                autoFocus
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-line shrink-0">
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  selectedGroup === 'all'
                    ? 'bg-surface text-brand shadow-xs border border-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroup('food')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  selectedGroup === 'food'
                    ? 'bg-surface text-brand shadow-xs border border-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                أغذية ومشروبات
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroup('grocery')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  selectedGroup === 'grocery'
                    ? 'bg-surface text-brand shadow-xs border border-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                بقالة وطازج
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroup('general')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  selectedGroup === 'general'
                    ? 'bg-surface text-brand shadow-xs border border-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                تجزئة وعامة
              </button>
            </div>
          </div>

          {/* Icons Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-1">
            {filteredIcons.length === 0 ? (
              <div className="col-span-full py-8 text-center text-ink-muted bg-surface-2/50 rounded-xl border border-dashed border-line">
                لا توجد أيقونة مطابقة للبحث
              </div>
            ) : (
              filteredIcons.map((item) => {
                const IconComponent = item.icon;
                const isCurrent = activeKey === item.key;
                const isCustomCurrent = currentCustomKey === item.key;

                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => handleSelectIcon(item.key)}
                    className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2.5 cursor-pointer group relative ${
                      isCustomCurrent
                        ? 'border-brand bg-brand-soft text-brand font-bold shadow-xs'
                        : isCurrent
                        ? 'border-brand/40 bg-surface-2 text-ink font-bold'
                        : 'border-line hover:border-brand/40 hover:bg-surface-2 text-ink'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isCustomCurrent
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-line text-brand group-hover:bg-brand-soft'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] truncate leading-tight">
                        {item.name}
                      </div>
                      <div className="text-[9.5px] text-ink-muted truncate font-mono mt-0.5">
                        {item.key}
                      </div>
                    </div>

                    {isCustomCurrent && (
                      <Check className="w-3.5 h-3.5 text-brand shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-11 bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted">
          <span>يتم تطبيق الأيقونة فوراً في الكاشير وشاشات المنتجات.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-surface border border-line rounded-lg text-ink hover:bg-surface-2 text-xs font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
