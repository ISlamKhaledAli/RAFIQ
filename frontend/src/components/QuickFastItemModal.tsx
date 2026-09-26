import React, { useState } from 'react';
import { 
  Sparkles, 
  X, 
  Tag, 
  Check, 
  AlertCircle,
  Settings,
  Scale,
  Package
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { QuickItem } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';

interface QuickFastItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: (savedItem: QuickItem) => void;
  onOpenFullManager?: () => void;
  existingCategories?: string[];
}

export const QuickFastItemModal: React.FC<QuickFastItemModalProps> = ({
  isOpen,
  onClose,
  onItemAdded,
  onOpenFullManager,
  existingCategories = ['عام']
}) => {
  const [name, setName] = useState('');
  const [priceEgp, setPriceEgp] = useState('');
  const [isOpenPrice, setIsOpenPrice] = useState(false);
  const [unit, setUnit] = useState<'piece' | 'kg'>('piece');
  const [categoryName, setCategoryName] = useState('عام');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('يرجى كتابة اسم الصنف السريع');
      return;
    }

    let piasters = 0;
    if (!isOpenPrice) {
      const parsed = parseFloat(normalizeArabicNumerals(priceEgp));
      if (isNaN(parsed) || parsed < 0) {
        setError('يرجى إدخال سعر بيع صحيح بالجنيه أو تفعيل خيار السعر الحر');
        return;
      }
      piasters = Math.round(parsed * 100);
    }

    const finalCategory = isCustomCategory 
      ? (customCategoryInput.trim() || 'عام')
      : (categoryName.trim() || 'عام');

    setLoading(true);
    setError(null);

    try {
      const newItem: Partial<QuickItem> = {
        name: trimmedName,
        productId: null, // Standalone quick item, independent of warehouse inventory
        pricePiasters: piasters,
        isOpenPrice,
        unit,
        categoryName: finalCategory,
        color: null,
        displayOrder: 999
      };

      const saved = await invoke<QuickItem>('quickItems:save', newItem);
      
      // Reset form
      setName('');
      setPriceEgp('');
      setIsOpenPrice(false);
      setUnit('piece');
      setCategoryName('عام');
      setIsCustomCategory(false);
      setCustomCategoryInput('');

      if (onItemAdded) {
        onItemAdded(saved);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل حفظ الصنف السريع: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const quickPresets = [
    { label: 'كيس بلاستيك كبير', price: '1.00', unit: 'piece' },
    { label: 'كيس بلاستيك صغير', price: '0.50', unit: 'piece' },
    { label: 'خدمة توصيل / دليفري', price: '15.00', unit: 'piece' },
    { label: 'شاي / مشروب ساخن', price: '10.00', unit: 'piece' },
    { label: 'كرتونة فارغة', price: '5.00', unit: 'piece' },
    { label: 'سعر حر (مبلغ مفتوح)', price: '', isOpenPrice: true, unit: 'piece' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 select-none animate-in fade-in duration-150" dir="rtl">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-100/90 dark:bg-slate-900 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-[#006d41] dark:text-emerald-400 flex items-center justify-center shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-tight m-0">إضافة صنف سريع للمحل</h3>
              <p className="text-[11px] text-ink-muted m-0 mt-0.5">
                أزرار سريعة فورية للبيع بنقرة واحدة بدون مخزن أو جرد أو باركود
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
          
          {/* Error Banner */}
          {error && (
            <div className="p-2.5 rounded-lg bg-danger-soft border border-danger-border text-danger text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Presets for Cashiers */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1.5">
              نماذج جاهزة للاختيار السريع:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setName(preset.label);
                    if (preset.isOpenPrice) {
                      setIsOpenPrice(true);
                      setPriceEgp('');
                    } else {
                      setIsOpenPrice(false);
                      setPriceEgp(preset.price);
                    }
                    setUnit((preset.unit as 'piece' | 'kg') || 'piece');
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-surface-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-line transition-all active:scale-95 text-right flex items-center gap-1"
                >
                  <span>{preset.label}</span>
                  {!preset.isOpenPrice && preset.price && (
                    <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                      ({preset.price} ج)
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Item Name */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              اسم الصنف السريع <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                autoFocus
                placeholder="مثال: كيس كبير، خدمة توصيل، فنجان شاي، إلخ..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 pr-9 pl-3 text-xs bg-surface-2 border border-line rounded-lg text-ink focus:border-brand focus:bg-surface focus:outline-none transition-all font-medium"
              />
            </div>
          </div>

          {/* Pricing Options */}
          <div className="bg-surface-2/60 p-3 rounded-lg border border-line/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-ink">
                سعر البيع
              </label>
              
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 font-bold">
                <input
                  type="checkbox"
                  checked={isOpenPrice}
                  onChange={(e) => {
                    setIsOpenPrice(e.target.checked);
                    if (e.target.checked) setPriceEgp('');
                  }}
                  className="w-4 h-4 rounded border-line text-[#006d41] focus:ring-0 cursor-pointer"
                />
                <span>سعر حر (سعر مفتوح عند البيع)</span>
              </label>
            </div>

            {!isOpenPrice ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-mono pointer-events-none">
                  ج.م
                </span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  required={!isOpenPrice}
                  placeholder="0.00"
                  value={priceEgp}
                  onChange={(e) => setPriceEgp(normalizeArabicNumerals(e.target.value))}
                  className="w-full h-10 pr-3 pl-12 text-sm font-mono font-bold bg-surface border border-line rounded-lg text-[#006d41] focus:border-[#006d41] focus:outline-none transition-all"
                />
              </div>
            ) : (
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11.5px] text-amber-800 dark:text-amber-300 font-medium">
                عند النقر على هذا الزر في شاشة الكاشير، سيطلب النظام كتابة السعر المطلوب لحظياً.
              </div>
            )}
          </div>

          {/* Unit & Category */}
          <div className="grid grid-cols-2 gap-3">
            {/* Unit */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                وحدة الصنف
              </label>
              <div className="grid grid-cols-2 gap-1.5 h-10 bg-surface-2 p-1 rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => setUnit('piece')}
                  className={`flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-all ${
                    unit === 'piece'
                      ? 'bg-surface text-[#006d41] shadow-2xs border border-line'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>قطعة/عدد</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('kg')}
                  className={`flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-all ${
                    unit === 'kg'
                      ? 'bg-surface text-[#006d41] shadow-2xs border border-line'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>وزن (كجم)</span>
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                القسم / التبويب
              </label>
              {!isCustomCategory ? (
                <div className="flex gap-1.5 h-10">
                  <select
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="flex-1 px-2.5 text-xs bg-surface-2 border border-line rounded-lg text-ink focus:border-brand focus:outline-none"
                  >
                    {existingCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory(true)}
                    className="px-2 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs font-bold"
                    title="كتابة قسم جديد"
                  >
                    + جديد
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5 h-10">
                  <input
                    type="text"
                    placeholder="اسم القسم الجديد..."
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    className="flex-1 px-2.5 text-xs bg-surface border border-brand rounded-lg text-ink focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(false);
                      setCustomCategoryInput('');
                    }}
                    className="px-2 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs"
                    title="إلغاء القسم الجديد"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-2 pt-3 border-t border-line flex items-center justify-between gap-2">
            {onOpenFullManager && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullManager();
                }}
                className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-[#006d41] font-semibold py-1.5 px-2 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>إدارة وترتيب كافة الأزرار السريعة</span>
              </button>
            )}

            <div className="flex items-center gap-2 mr-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 h-9 bg-surface-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-ink rounded-lg text-xs font-semibold transition-colors"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-5 h-9 bg-[#006d41] hover:bg-[#005231] active:bg-[#00372d] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>حفظ وإضافة للمحل</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
