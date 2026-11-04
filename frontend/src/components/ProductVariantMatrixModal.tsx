import React, { useState, useMemo } from 'react';
import {
  Layers,
  X,
  Plus,
  Barcode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Package
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { MoneyInput } from './MoneyInput';
import { useModalDismiss } from '../hooks/useModalDismiss';
import type { Category, VariantMatrixCell, CreateVariantMatrixRequest, ParentProductWithVariants, Product, ProductVariant } from '../types/models';

interface ProductVariantMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ParentProductWithVariants) => void;
  categories: Category[];
  parentProduct?: Product | null;
}

const PRESET_SIZES = {
  clothing: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  shoes: ['38', '39', '40', '41', '42', '43', '44', '45'],
  numbers: ['1', '2', '3', '4', '5'],
};

const PRESET_COLORS = [
  'أسود',
  'أبيض',
  'كحلي',
  'رمادي',
  'أحمر',
  'أزرق',
  'بيج',
  'زيتي',
  'بني',
  'أصفر'
];

export const ProductVariantMatrixModal: React.FC<ProductVariantMatrixModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
  parentProduct,
}) => {
  // Base product fields
  const [parentName, setParentName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [defaultPricePiasters, setDefaultPricePiasters] = useState<number>(0);
  const [defaultCostPiasters, setDefaultCostPiasters] = useState<number>(0);
  const [defaultMinStock, setDefaultMinStock] = useState<number>(2000); // 2 pieces

  // Selected sizes & colors tags
  const [sizes, setSizes] = useState<string[]>(['M', 'L', 'XL']);
  const [colors, setColors] = useState<string[]>(['أسود', 'كحلي']);
  const [newSizeInput, setNewSizeInput] = useState('');
  const [newColorInput, setNewColorInput] = useState('');

  // Bulk fill inputs
  const [bulkStockUnits, setBulkStockUnits] = useState<string>('5');

  // Matrix cells state
  const [matrixCells, setMatrixCells] = useState<Record<string, VariantMatrixCell>>({});

  // Loading & feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or synchronize matrix cells whenever sizes or colors change
  const cellKeys = useMemo(() => {
    const keys: string[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        keys.push(`${c}_${s}`);
      }
    }
    return keys;
  }, [colors, sizes]);

  // Initialize / prefill from parentProduct when opened in edit mode
  React.useEffect(() => {
    if (isOpen && parentProduct?.id) {
      setParentName(parentProduct.name || '');
      setCategoryId(parentProduct.categoryId || '');
      setDefaultPricePiasters(parentProduct.pricePiasters || 0);
      setDefaultCostPiasters(parentProduct.costPiasters || 0);
      setDefaultMinStock(parentProduct.minStockQuantityMilli || 2000);

      void invoke<ProductVariant[]>('variants:getByParentId', { parentId: parentProduct.id })
        .then((existingList) => {
          if (existingList && existingList.length > 0) {
            const distinctSizes = Array.from(new Set(existingList.map((v) => v.size).filter(Boolean)));
            const distinctColors = Array.from(new Set(existingList.map((v) => v.color).filter(Boolean)));
            if (distinctSizes.length > 0) setSizes(distinctSizes);
            if (distinctColors.length > 0) setColors(distinctColors);

            setMatrixCells((prev) => {
              const updated = { ...prev };
              for (const ev of existingList) {
                const key = `${ev.color}_${ev.size}`;
                updated[key] = {
                  color: ev.color,
                  size: ev.size,
                  barcode: ev.barcode || '',
                  sku: ev.sku || '',
                  pricePiasters: ev.pricePiasters,
                  costPiasters: ev.costPiasters,
                  stockQuantityMilli: ev.stockQuantityMilli,
                  minStockQuantityMilli: ev.minStockQuantityMilli,
                  isEnabled: true,
                };
              }
              return updated;
            });
          }
        })
        .catch((err) => {
          console.error('Failed to prefill existing variants:', err);
        });
    } else if (isOpen && !parentProduct) {
      setParentName('');
      setCategoryId('');
      setDefaultPricePiasters(0);
      setDefaultCostPiasters(0);
      setDefaultMinStock(2000);
      setSizes(['M', 'L', 'XL']);
      setColors(['أسود', 'كحلي']);
      setMatrixCells({});
    }
  }, [isOpen, parentProduct]);

  // Sync cells when combinations change
  React.useEffect(() => {
    setMatrixCells((prev) => {
      const next: Record<string, VariantMatrixCell> = {};
      for (const c of colors) {
        for (const s of sizes) {
          const key = `${c}_${s}`;
          if (prev[key]) {
            next[key] = prev[key];
          } else {
            next[key] = {
              color: c,
              size: s,
              barcode: '',
              sku: '',
              pricePiasters: defaultPricePiasters,
              costPiasters: defaultCostPiasters,
              stockQuantityMilli: 0,
              minStockQuantityMilli: defaultMinStock,
              isEnabled: true,
            };
          }
        }
      }
      return next;
    });
  }, [colors, sizes, defaultPricePiasters, defaultCostPiasters, defaultMinStock]);

  // Handlers for tags
  const handleAddSize = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !sizes.includes(trimmed)) {
      setSizes([...sizes, trimmed]);
      setNewSizeInput('');
    }
  };

  const handleRemoveSize = (val: string) => {
    setSizes(sizes.filter((s) => s !== val));
  };

  const handleAddColor = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !colors.includes(trimmed)) {
      setColors([...colors, trimmed]);
      setNewColorInput('');
    }
  };

  const handleRemoveColor = (val: string) => {
    setColors(colors.filter((c) => c !== val));
  };

  // Bulk operations
  const applyDefaultPricesToAll = () => {
    setMatrixCells((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = {
          ...next[k],
          pricePiasters: defaultPricePiasters,
          costPiasters: defaultCostPiasters,
        };
      }
      return next;
    });
  };

  const applyBulkStockToAll = () => {
    const parsed = Math.max(0, parseFloat(bulkStockUnits) || 0);
    const milli = Math.round(parsed * 1000);
    setMatrixCells((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k].isEnabled) {
          next[k] = {
            ...next[k],
            stockQuantityMilli: milli,
          };
        }
      }
      return next;
    });
  };

  const autoGenerateAllBarcodes = async () => {
    try {
      const activeKeys = cellKeys.filter((k) => matrixCells[k]?.isEnabled);
      const generated = await invoke<string[]>('variants:generateBatchBarcodes', {
        count: activeKeys.length,
      });

      if (generated && generated.length === activeKeys.length) {
        setMatrixCells((prev) => {
          const next = { ...prev };
          activeKeys.forEach((key, idx) => {
            next[key] = {
              ...next[key],
              barcode: generated[idx],
            };
          });
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to auto-generate batch barcodes:', err);
    }
  };

  const toggleAllCells = (enable: boolean) => {
    setMatrixCells((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = { ...next[k], isEnabled: enable };
      }
      return next;
    });
  };

  // Metrics
  const activeCells = useMemo(() => {
    return Object.values(matrixCells).filter((c) => c.isEnabled);
  }, [matrixCells]);

  const totalStockUnits = useMemo(() => {
    return activeCells.reduce((sum, c) => sum + Math.round((c.stockQuantityMilli || 0) / 1000), 0);
  }, [activeCells]);

  const totalCostEGP = useMemo(() => {
    const totalPiasters = activeCells.reduce((sum, c) => {
      const units = (c.stockQuantityMilli || 0) / 1000;
      return sum + Math.round(units * (c.costPiasters || 0));
    }, 0);
    return totalPiasters / 100;
  }, [activeCells]);

  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!parentName.trim()) {
      setErrorMessage('يرجى إدخال اسم المنتج الأساسي');
      return;
    }

    if (activeCells.length === 0) {
      setErrorMessage('يرجى تفعيل تركيبة واحدة على الأقل في المصفوفة');
      return;
    }

    // Check that prices are non-negative integers
    for (const cell of activeCells) {
      if (cell.pricePiasters < 0 || cell.costPiasters < 0) {
        setErrorMessage(`السعر أو التكلفة لا يمكن أن تكون بالسالب للتركيبة (${cell.color} - ${cell.size})`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: CreateVariantMatrixRequest = {
        parentProductId: parentProduct?.id,
        parentName: parentName.trim(),
        categoryId: categoryId || undefined,
        defaultPricePiasters,
        defaultCostPiasters,
        defaultMinStockQuantityMilli: defaultMinStock,
        sizes,
        colors,
        matrixCells: activeCells,
      };

      const result = await invoke<ParentProductWithVariants>('variants:createMatrix', payload);
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`فشل حفظ مصفوفة التركيبات: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDirty = Boolean(parentName.trim() || activeCells.length > 0);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء إنشاء مصفوفة المقاسات والألوان؟',
    confirmMessage: 'تم تعديل بيانات المصفوفة. هل أنت متأكد من الإلغاء والتراجع دون حفظ؟',
  });

  if (!isOpen) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div
        dir="rtl"
        className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-ink dark:text-ink-dark font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center text-brand dark:text-brand-bright">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark flex items-center gap-2">
                {parentProduct ? `تعديل مصفوفة: ${parentProduct.name}` : 'إضافة منتج متعدد المقاسات والألوان'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-medium">
                  {activeCells.length} تركيبة مفعلة
                </span>
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                {parentProduct
                  ? 'تعديل أو إضافة مقاسات وألوان للمنتج وتحديث الأرصدة والباركود'
                  : 'إنشاء منتج أب وجميع تركيبات المقاسات والألوان بجدول تفاعلي واحد'}
              </p>
            </div>
          </div>
          <button
            onClick={requestClose}
            className="p-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-line/40 dark:hover:bg-line-dark/40 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-danger/10 dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/20 rounded-xl flex items-center gap-3 text-danger dark:text-danger-bright text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Base Product Info */}
          <div className="bg-surface-2/40 dark:bg-surface-dark-2/40 border border-line dark:border-line-dark rounded-xl p-4 space-y-4">
            <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-2">
              <Package className="w-4 h-4 text-brand dark:text-brand-bright" />
              بيانات المنتج الأساسي
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                  اسم المنتج الأساسي <span className="text-danger dark:text-danger-bright">*</span>
                </label>
                <input
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="مثال: قميص رجالي كاجوال / بنطلون جينز"
                  className="w-full h-10 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 text-sm focus:border-brand dark:focus:border-brand-bright outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                  القسم / التصنيف
                </label>
                <CustomSelect
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    { value: '', label: 'بدون تصنيف' },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  placeholder="اختر التصنيف..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                  حد الطلب الافتراضي (قطع)
                </label>
                <input
                  type="number"
                  min="0"
                  value={defaultMinStock / 1000}
                  onChange={(e) => setDefaultMinStock(Math.max(0, parseFloat(e.target.value) || 0) * 1000)}
                  className="w-full h-10 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-sm focus:border-brand dark:focus:border-brand-bright outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                  سعر البيع الافتراضي
                </label>
                <MoneyInput
                  valuePiasters={defaultPricePiasters}
                  onChangePiasters={setDefaultPricePiasters}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                  سعر التكلفة الافتراضي
                </label>
                <MoneyInput
                  valuePiasters={defaultCostPiasters}
                  onChangePiasters={setDefaultCostPiasters}
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={applyDefaultPricesToAll}
                  className="h-10 px-4 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright text-xs font-semibold text-ink dark:text-ink-dark transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تطبيق الأسعار الافتراضية على كل التركيبات
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Sizes & Colors Definition */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sizes Box */}
            <div className="bg-surface-2/40 dark:bg-surface-dark-2/40 border border-line dark:border-line-dark rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  المقاسات المتاحة ({sizes.length})
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted">نماذج:</span>
                  <button
                    type="button"
                    onClick={() => setSizes([...PRESET_SIZES.clothing])}
                    className="text-micro text-brand dark:text-brand-bright hover:underline px-1 cursor-pointer"
                  >
                    ملابس
                  </button>
                  <button
                    type="button"
                    onClick={() => setSizes([...PRESET_SIZES.shoes])}
                    className="text-micro text-brand dark:text-brand-bright hover:underline px-1 cursor-pointer"
                  >
                    أحذية
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                {sizes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-xs font-bold border border-brand/20 dark:border-brand-bright/20"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => handleRemoveSize(s)}
                      className="hover:text-danger dark:hover:text-danger-bright hover:bg-danger/10 rounded p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {sizes.length === 0 && (
                  <span className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center">أضف مقاساً أدناه...</span>
                )}
              </div>

              {/* Add Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSizeInput}
                  onChange={(e) => setNewSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSize(newSizeInput);
                    }
                  }}
                  placeholder="أدخل مقاساً واضغط Enter..."
                  className="flex-1 h-9 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 text-xs outline-none focus:border-brand dark:focus:border-brand-bright"
                />
                <button
                  type="button"
                  onClick={() => handleAddSize(newSizeInput)}
                  className="h-9 px-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright text-ink dark:text-ink-dark text-xs font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة
                </button>
              </div>
            </div>

            {/* Colors Box */}
            <div className="bg-surface-2/40 dark:bg-surface-dark-2/40 border border-line dark:border-line-dark rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                  الألوان المتاحة ({colors.length})
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted">سريعة:</span>
                  {PRESET_COLORS.slice(0, 5).map((pc) => (
                    <button
                      key={pc}
                      type="button"
                      onClick={() => handleAddColor(pc)}
                      className="text-micro text-brand dark:text-brand-bright hover:underline px-1 cursor-pointer"
                    >
                      {pc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                {colors.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-xs font-bold border border-paid/20 dark:border-paid-dark-border"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => handleRemoveColor(c)}
                      className="hover:text-danger dark:hover:text-danger-bright hover:bg-danger/10 rounded p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {colors.length === 0 && (
                  <span className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center">أضف لوناً أدناه...</span>
                )}
              </div>

              {/* Add Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newColorInput}
                  onChange={(e) => setNewColorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddColor(newColorInput);
                    }
                  }}
                  placeholder="أدخل لوناً واضغط Enter..."
                  className="flex-1 h-9 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 text-xs outline-none focus:border-brand dark:focus:border-brand-bright"
                />
                <button
                  type="button"
                  onClick={() => handleAddColor(newColorInput)}
                  className="h-9 px-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-paid dark:hover:border-paid-dark-border text-ink dark:text-ink-dark text-xs font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Matrix Grid Table & Quick Bulk Operations */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark p-3 rounded-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-ink dark:text-ink-dark">إجراءات جماعية سريعة:</span>
                <button
                  type="button"
                  onClick={autoGenerateAllBarcodes}
                  className="px-2.5 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright text-xs font-semibold text-brand dark:text-brand-bright flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  توليد باركود فريد للكل (214)
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllCells(true)}
                  className="px-2.5 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-xs font-medium text-ink dark:text-ink-dark transition-colors cursor-pointer"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllCells(false)}
                  className="px-2.5 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-xs font-medium text-ink dark:text-ink-dark transition-colors cursor-pointer"
                >
                  إلغاء تحديد الكل
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted dark:text-ink-dark-muted">رصيد افتتاحي للكل:</span>
                <input
                  type="number"
                  min="0"
                  value={bulkStockUnits}
                  onChange={(e) => setBulkStockUnits(e.target.value)}
                  className="w-16 h-8 px-2 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-xs text-center outline-none focus:border-brand dark:focus:border-brand-bright"
                />
                <button
                  type="button"
                  onClick={applyBulkStockToAll}
                  className="h-8 px-3 rounded-lg bg-brand dark:bg-brand-bright text-white dark:text-surface-dark text-xs font-semibold hover:bg-brand-dark transition-colors cursor-pointer"
                >
                  تطبيق
                </button>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden bg-surface dark:bg-surface-dark shadow-sm">
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted sticky top-0 z-10 border-b border-line dark:border-line-dark font-bold">
                    <tr>
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">اللون</th>
                      <th className="p-3">المقاس</th>
                      <th className="p-3 w-40">الباركود (داخلي أو مصنع)</th>
                      <th className="p-3 w-28">سعر البيع</th>
                      <th className="p-3 w-28">سعر التكلفة</th>
                      <th className="p-3 w-24">الرصيد الافتتاحي</th>
                      <th className="p-3 w-16 text-center">تفعيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {cellKeys.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-ink-muted dark:text-ink-dark-muted">
                          يرجى إضافة مقاسات وألوان لتوليد المصفوفة التفاعلية
                        </td>
                      </tr>
                    ) : (
                      cellKeys.map((key, idx) => {
                        const cell = matrixCells[key];
                        if (!cell) return null;
                        const isEnabled = cell.isEnabled;

                        return (
                          <tr
                            key={key}
                            className={`transition-colors ${
                              isEnabled ? 'hover:bg-brand-soft/20 dark:hover:bg-brand-dark-soft/20' : 'bg-surface-2/40 dark:bg-surface-dark-2/40 opacity-50'
                            }`}
                          >
                            <td className="p-3 text-center text-ink-muted dark:text-ink-dark-muted font-mono">{idx + 1}</td>
                            <td className="p-3 font-bold text-ink dark:text-ink-dark">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright">
                                {cell.color}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-ink dark:text-ink-dark">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-mono">
                                {cell.size}
                              </span>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={cell.barcode}
                                onChange={(e) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], barcode: e.target.value },
                                  }))
                                }
                                placeholder="تلقائي (214...)"
                                disabled={!isEnabled}
                                className="w-full h-8 px-2 rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-mono text-xs focus:border-brand dark:focus:border-brand-bright outline-none placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                              />
                            </td>
                            <td className="p-3">
                              <MoneyInput
                                valuePiasters={cell.pricePiasters}
                                onChangePiasters={(val) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], pricePiasters: val },
                                  }))
                                }
                                placeholder="0.00"
                                hideCurrency={true}
                                disabled={!isEnabled}
                                className="h-8 text-xs px-2 py-0"
                              />
                            </td>
                            <td className="p-3">
                              <MoneyInput
                                valuePiasters={cell.costPiasters}
                                onChangePiasters={(val) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], costPiasters: val },
                                  }))
                                }
                                placeholder="0.00"
                                hideCurrency={true}
                                disabled={!isEnabled}
                                className="h-8 text-xs px-2 py-0"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                min="0"
                                value={cell.stockQuantityMilli / 1000 || ''}
                                onChange={(e) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...prev[key],
                                      stockQuantityMilli: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 1000)),
                                    },
                                  }))
                                }
                                placeholder="0"
                                disabled={!isEnabled}
                                className="w-full h-8 px-2 rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark text-xs text-center font-mono focus:border-brand dark:focus:border-brand-bright outline-none placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={cell.isEnabled}
                                onChange={(e) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], isEnabled: e.target.checked },
                                  }))
                                }
                                className="w-4 h-4 rounded text-brand border-line dark:border-line-dark focus:ring-brand cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer & Metrics */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-6 text-xs text-ink-muted dark:text-ink-dark-muted">
            <div>
              التركيبات النشطة:{' '}
              <strong className="text-ink dark:text-ink-dark font-bold font-mono text-sm">{activeCells.length}</strong>
            </div>
            <div>
              إجمالي الرصيد:{' '}
              <strong className="text-brand dark:text-brand-bright font-bold font-mono text-sm">{totalStockUnits}</strong> قطعة
            </div>
            <div>
              قيمة التكلفة الافتتاحية:{' '}
              <strong className="text-paid dark:text-paid-bright font-bold font-mono text-sm">
                {totalCostEGP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>{' '}
              ج.م
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={requestClose}
              disabled={isSubmitting}
              className="h-10 px-4 rounded-xl border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-xs font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="h-10 px-6 rounded-xl bg-brand dark:bg-brand-bright text-white dark:text-surface-dark hover:bg-brand-dark text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  جاري الحفظ والإنشاء الذري...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  حفظ مصفوفة التركيبات في المخزن
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
