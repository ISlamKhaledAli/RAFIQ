import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Zap, X, Barcode, Check, AlertCircle, Layers, Calendar } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, Category } from '../types/models';
import { poundsToPiasters, normalizeArabicNumerals } from '../utils/money';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import { useFeatures } from '../context/useFeatures';

interface QuickAddProductModalProps {
  isOpen: boolean;
  barcode: string;
  onClose: () => void;
  onProductCreated: (product: Product) => void;
}

export function QuickAddProductModal({
  isOpen,
  barcode,
  onClose,
  onProductCreated,
}: QuickAddProductModalProps) {
  const { isEnabled } = useFeatures();
  const [name, setName] = useState('');
  const [priceEgp, setPriceEgp] = useState('');
  const [costEgp, setCostEgp] = useState('');
  const [unit, setUnit] = useState<'piece' | 'kg'>('piece');
  const [categoryId, setCategoryId] = useState('cat_general');
  const [categories, setCategories] = useState<Category[]>([]);
  const [variantSize, setVariantSize] = useState('');
  const [variantColor, setVariantColor] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load categories and focus form on open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    void (async () => {
      try {
        const cats = await invoke<Category[]>('categories:getAll', { includeArchived: false });
        if (active && Array.isArray(cats)) {
          setCategories(cats);
          const gen = cats.find((c) => c.id === 'cat_general' || c.name.includes('عام'));
          if (gen) setCategoryId(gen.id);
          else if (cats.length > 0) setCategoryId(cats[0].id);
        }
      } catch {
        // fallback to default
      }
    })();

    // Auto-focus the product name input after opening
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen]);

  // Keyboard shortcut listener (Escape to cancel)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('يرجى إدخال اسم الصنف');
      nameInputRef.current?.focus();
      return;
    }

    const priceNum = parseFloat(priceEgp.trim());
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('يرجى إدخال سعر بيع صحيح أكبر من الصفر');
      return;
    }

    const costNum = parseFloat(costEgp.trim() || '0');
    if (costNum < 0) {
      setError('لا يمكن أن يكون سعر التكلفة سالباً');
      return;
    }

    setLoading(true);
    try {
      const pricePiasters = poundsToPiasters(priceNum);
      const costPiasters = poundsToPiasters(costNum);

      const productPayload: Partial<Product> = {
        barcode: barcode.trim(),
        barcodes: [barcode.trim()],
        name: trimmedName,
        categoryId: categoryId || 'cat_general',
        pricePiasters,
        costPiasters,
        stockQuantityMilli: unit === 'kg' ? 1000 : 10000, // Initial provisional stock (10 pieces or 1kg)
        minStockQuantityMilli: 5000,
        unit,
        taxRatePercent: 0,
        isActive: true,
        variantSize: variantSize.trim() || undefined,
        variantColor: variantColor.trim() || undefined,
        needsReview: true, // Feature #108 / Task 108-3: Tagged as incomplete for later review
      };

      const saved = await invoke<Product>('products:save', productPayload);
      if (saved) {
        if (isEnabled('feature_expiry_dates') && expiryDate.trim()) {
          await invoke('batch:save', {
            productId: saved.id,
            batchNumber: batchNumber.trim() || `B-${Date.now().toString().slice(-6)}`,
            expiryDate: expiryDate.trim(),
            quantityMilli: saved.stockQuantityMilli,
            costPricePiasters: costPiasters,
            status: 'ACTIVE'
          }).catch(() => null);
        }
        onProductCreated(saved);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل حفظ الصنف: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div 
        className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-lg overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center">
              <Zap className="w-4 h-4 fill-amber-500/30" />
            </span>
            <div>
              <span className="text-sm font-bold text-ink">إضافة صنف غير مسجل سريعاً</span>
              <span className="text-[10px] text-ink-muted block leading-none">متابعة البيع الفوري دون مغادرة الشاشة</span>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {/* Readonly Barcode Banner */}
          <div className="p-2.5 rounded-lg bg-surface-2 border border-line flex items-center justify-between">
            <div className="flex items-center gap-2 text-ink">
              <Barcode className="w-4 h-4 text-brand shrink-0" />
              <span className="text-xs text-ink-muted">الباركود الممسوح:</span>
              <span className="font-mono font-bold text-xs text-brand tracking-wider select-all">{barcode}</span>
            </div>
            <span className="text-[10px] font-semibold bg-brand-soft text-brand px-2 py-0.5 rounded">
              تلقائي
            </span>
          </div>

          {/* Product Name Input */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              اسم الصنف <span className="text-danger">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: شيبسي عائلي بالجبنة"
              className="w-full h-9 px-3 text-xs bg-canvas rounded-lg border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand font-sans"
              required
            />
          </div>

          {/* Price and Cost Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                سعر البيع (ج.م) <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={priceEgp}
                onChange={(e) => {
                  const norm = normalizeArabicNumerals(e.target.value);
                  if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                    setPriceEgp(norm);
                  }
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0.00"
                className="w-full h-9 px-3 text-xs bg-canvas rounded-lg border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand font-mono font-bold text-left"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">
                سعر التكلفة (اختياري)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={costEgp}
                onChange={(e) => {
                  const norm = normalizeArabicNumerals(e.target.value);
                  if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                    setCostEgp(norm);
                  }
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0.00"
                className="w-full h-9 px-3 text-xs bg-canvas rounded-lg border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand font-mono text-left"
              />
            </div>
          </div>

          {/* Unit & Category Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">نوع الوحدة</label>
              <div className="grid grid-cols-2 gap-1 bg-surface-2 p-1 rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => setUnit('piece')}
                  className={`py-1 text-xs font-bold rounded ${unit === 'piece' ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted hover:text-ink'}`}
                >
                  قطعة (عدد)
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('kg')}
                  className={`py-1 text-xs font-bold rounded ${unit === 'kg' ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted hover:text-ink'}`}
                >
                  وزن (كجم)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">التصنيف</label>
              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                options={
                  categories.length === 0
                    ? [{ value: 'cat_general', label: 'عام / متنوع' }]
                    : categories.map((c) => ({ value: c.id, label: c.name }))
                }
              />
            </div>
          </div>

          {/* Optional Variants Fields (Feature #114) */}
          {isEnabled('feature_matrix_variants') && (
            <div className="p-2.5 rounded-lg bg-surface-2 border border-line space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>المقاس واللون (اختياري)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="text"
                    value={variantSize}
                    onChange={(e) => setVariantSize(e.target.value)}
                    placeholder="المقاس (مثال: L أو 42)"
                    className="w-full h-8 px-2.5 text-xs bg-surface rounded-lg border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={variantColor}
                    onChange={(e) => setVariantColor(e.target.value)}
                    placeholder="اللون (مثال: أزرق أو كحلي)"
                    className="w-full h-8 px-2.5 text-xs bg-surface rounded-lg border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Optional Expiry Date Field (Feature #60) */}
          {isEnabled('feature_expiry_dates') && (
            <div className="p-2.5 rounded-lg bg-surface-2 border border-line space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>تاريخ الصلاحية والشحنة (اختياري)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <CustomDatePicker
                    value={expiryDate}
                    onChange={(val) => setExpiryDate(val)}
                    placeholder="تاريخ الصلاحية"
                    size="sm"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="كود الشحنة (تلقائي لو فارغ)"
                    className="w-full h-[28px] px-2.5 text-xs bg-surface rounded-lg border border-line text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Incomplete Data Notice (Task 108-3) */}
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              سيتم وسم هذا الصنف كـ «ناقص البيانات» لكي يراجعه صاحب المحل في شاشة إدارة الأصناف لاحقاً.
            </span>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-2 rounded bg-danger-soft border border-danger-border text-danger text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-2 hairline-t flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-surface border border-line text-ink hover:bg-surface-2 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              إلغاء (Esc)
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand text-white hover:bg-brand-hover text-xs font-bold shadow-sm transition-all disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'جاري الحفظ...' : 'حفظ وإضافة للسلة (Enter)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
