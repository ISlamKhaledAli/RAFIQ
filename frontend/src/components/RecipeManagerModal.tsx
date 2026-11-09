import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FlaskConical,
  Plus,
  Trash2,
  CheckCircle2,
  Factory,
  History,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { RequiredMark } from './RequiredMark';
import { formatArabicCurrency } from '../utils/money';
import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';
import { useMotionPanel } from '../hooks/useMotionPanel';
import type { Recipe, RecipeIngredient, ProductionBatch } from '../types/cafe';
import type { Product } from '../types/models';

interface RecipeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialProductId?: string;
  canProduceBatch: boolean;
  onProductsChanged?: () => void;
}

export const RecipeManagerModal: React.FC<RecipeManagerModalProps> = ({
  isOpen,
  onClose,
  products,
  initialProductId,
  canProduceBatch,
  onProductsChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'bom_editor' | 'batch_production'>('bom_editor');
  const motionPanel = useMotionPanel(activeTab);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productionLog, setProductionLog] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // BOM Editor State
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [recipeId, setRecipeId] = useState<string>('');
  const [yieldUnits, setYieldUnits] = useState<string>('1');
  const [depletionMode, setDepletionMode] = useState<'on_sale' | 'batch_production'>('on_sale');
  const [recipeWastagePct, setRecipeWastagePct] = useState<number>(0);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [updateProductCost, setUpdateProductCost] = useState<boolean>(true);
  const [recipeNotes, setRecipeNotes] = useState<string>('');

  // Add Ingredient Row State
  const [rawProductId, setRawProductId] = useState<string>('');
  const [rawQtyUnits, setRawQtyUnits] = useState<string>('0.050');
  const [rawWastagePct, setRawWastagePct] = useState<number>(0);

  // Batch Production State
  const [produceRecipeId, setProduceRecipeId] = useState<string>('');
  const [produceQtyUnits, setProduceQtyUnits] = useState<string>('10');
  const [produceNotes, setProduceNotes] = useState<string>('');

  const fetchRecipesAndLog = async () => {
    setLoading(true);
    try {
      const [rData, lData] = await Promise.all([
        invoke<Recipe[]>('recipes:getAll', {}),
        invoke<ProductionBatch[]>('recipes:getProductionLog', { limit: 50 }),
      ]);
      if (Array.isArray(rData)) setRecipes(rData);
      if (Array.isArray(lData)) setProductionLog(lData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    if (initialProductId) setSelectedProductId(initialProductId);
    fetchRecipesAndLog();
  }, [isOpen, initialProductId]);

  useEffect(() => {
    if (!isOpen || !selectedProductId) {
      setRecipeId('');
      setIngredients([]);
      return;
    }
    invoke<Recipe | null>('recipes:getByProduct', { productId: selectedProductId })
      .then((rec) => {
        if (rec) {
          setRecipeId(rec.id);
          setYieldUnits(((rec.yieldQtyMilli || 1000) / 1000).toString());
          setDepletionMode((rec.depletionMode as 'on_sale' | 'batch_production') || 'on_sale');
          setRecipeWastagePct(rec.wastagePercent || 0);
          setIngredients(rec.ingredients || []);
          setRecipeNotes(rec.notes || '');
        } else {
          setRecipeId('');
          setYieldUnits('1');
          setDepletionMode('on_sale');
          setRecipeWastagePct(0);
          setIngredients([]);
          setRecipeNotes('');
        }
      })
      .catch(() => {});
  }, [selectedProductId, isOpen]);

  const calculatedUnitCostPiasters = useMemo(() => {
    let totalBatchCost = 0;
    ingredients.forEach((ing) => {
      const prod = products.find((p) => p.id === ing.rawProductId);
      const rawUnitCost = prod ? prod.costPiasters : (ing.rawProductCostPiasters || 0);
      const effQtyMilli = Math.round((ing.quantityMilli * (100 + (ing.wastagePercent || 0))) / 100);
      totalBatchCost += Math.round((rawUnitCost * effQtyMilli) / 1000);
    });
    if (recipeWastagePct > 0) {
      totalBatchCost = Math.round((totalBatchCost * (100 + recipeWastagePct)) / 100);
    }
    const yieldMilli = Math.max(1, Math.round((parseFloat(yieldUnits || '1') || 1) * 1000));
    return Math.round((totalBatchCost * 1000) / yieldMilli);
  }, [ingredients, products, recipeWastagePct, yieldUnits]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  const handleAddIngredient = () => {
    if (!rawProductId) return;
    if (rawProductId === selectedProductId) {
      setErrorMsg('لا يمكن إضافة المنتج النهائي كمكون خام داخل نفس الوصفة.');
      return;
    }
    const rawProd = products.find((p) => p.id === rawProductId);
    if (!rawProd) return;
    const qtyMilli = Math.max(1, Math.round((parseFloat(rawQtyUnits || '0') || 0) * 1000));

    setIngredients((prev) => {
      const filtered = prev.filter((item) => item.rawProductId !== rawProductId);
      return [
        ...filtered,
        {
          rawProductId: rawProd.id,
          rawProductName: rawProd.name,
          rawProductUnit: rawProd.unit,
          rawProductCostPiasters: rawProd.costPiasters,
          quantityMilli: qtyMilli,
          wastagePercent: Math.max(0, Math.min(95, rawWastagePct)),
        },
      ];
    });
    setRawProductId('');
    setRawQtyUnits('0.050');
    setRawWastagePct(0);
    setErrorMsg(null);
  };

  const handleRemoveIngredient = (rawId: string) => {
    setIngredients((prev) => prev.filter((i) => i.rawProductId !== rawId));
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || ingredients.length === 0) {
      setErrorMsg('يرجى اختيار الصنف النهائي وإضافة مكون خام واحد على الأقل.');
      return;
    }

    const yieldQtyMilli = Math.max(1, Math.round((parseFloat(yieldUnits || '1') || 1) * 1000));
    setLoading(true);
    setErrorMsg(null);
    try {
      const saved = await invoke<Recipe>('recipes:save', {
        id: recipeId || undefined,
        productId: selectedProductId,
        productName: selectedProduct?.name || '',
        yieldQtyMilli,
        depletionMode,
        wastagePercent: Math.max(0, Math.min(95, recipeWastagePct)),
        notes: recipeNotes.trim(),
        isActive: true,
        ingredients,
        updateProductCost,
      });
      if (saved) {
        setRecipeId(saved.id);
        setSuccessMsg('تم حفظ الوصفة وتحديث تكلفة الصنف');
        await fetchRecipesAndLog();
        onProductsChanged?.();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل حفظ الوصفة');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!recipeId) return;
    setLoading(true);
    try {
      await invoke('recipes:delete', { id: recipeId });
      setRecipeId('');
      setIngredients([]);
      setSuccessMsg('تم حذف الوصفة');
      await fetchRecipesAndLog();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatchProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produceRecipeId) {
      setErrorMsg('يرجى اختيار الوصفة المراد تصنيعها.');
      return;
    }
    const producedQtyMilli = Math.max(1, Math.round((parseFloat(produceQtyUnits || '1') || 1) * 1000));
    setLoading(true);
    setErrorMsg(null);
    try {
      const batch = await invoke<ProductionBatch>('recipes:produce', {
        recipeId: produceRecipeId,
        producedQtyMilli,
        notes: produceNotes.trim(),
      });
      if (batch) {
        setSuccessMsg(
          `تم تنفيذ دفعة التصنيع: أُضيف ${(batch.producedQtyMilli / 1000).toFixed(2)} وحدة من «${batch.productName}» للمخزون`
        );
        setProduceNotes('');
        await fetchRecipesAndLog();
        onProductsChanged?.();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تنفيذ دفعة الإنتاج');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="motion-modal-backdrop fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="motion-modal-panel bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand-dark-soft border border-brand/30 flex items-center justify-center text-brand dark:text-brand-bright">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark">إدارة الرسبي والتصنيع وخصم الخامات التلقائي</h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
                ربط المشروبات والوجبات والمنتجات بمكوناتها الخام (بالجرام/المللي) مع الخصم الفوري عند البيع أو بالتصنيع المجمع
              </p>
            </div>
          </div>

          <AppButton variant="secondary" icon={X} onClick={onClose} aria-label="إغلاق" />
        </div>

        {/* Tabs */}
        <div className="px-6 py-2.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('bom_editor')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors ${
              activeTab === 'bom_editor'
                ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>            تكوين رسبي الأصناف</span>          </button>

          {canProduceBatch && (
            <button
              type="button"
              onClick={() => setActiveTab('batch_production')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors ${
                activeTab === 'batch_production'
                  ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                  : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              <Factory className="w-3.5 h-3.5" />
              <span>أوامر الإنتاج والتصنيع المجمّع ({productionLog.length})</span>
            </button>
          )}
        </div>

        {(errorMsg || successMsg) && (
          <div className="px-6 pt-3">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-danger/10 dark:bg-danger-dark-soft border border-danger/30 text-danger dark:text-danger-bright text-xs font-black">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-paid/10 dark:bg-paid-dark-soft border border-paid/30 text-paid dark:text-paid-bright text-xs font-black">
                {successMsg}
              </div>
            )}
          </div>
        )}

        <MotionHeight className="p-6 overflow-y-auto flex-1">
        <div {...motionPanel}>
          {activeTab === 'bom_editor' ? (
            <form onSubmit={handleSaveRecipe} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Product Selection & Depletion Mode */}
              <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-4 h-fit">
                <h3 className="t-card-title text-ink dark:text-ink-dark">1. المنتج النهائي وطريقة الخصم</h3>
                <p className="text-micro text-ink-muted dark:text-ink-muted-dark m-0 -mt-2">الحقول المميزة بعلامة * مطلوبة</p>

                <div>
                  <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">اختر الصنف النهائي (المشروب / الوجبة): <RequiredMark /></label>
                  <CustomSelect
                    value={selectedProductId}
                    onChange={(v) => setSelectedProductId(v)}
                    options={[
                      { value: '', label: '-- اختر الصنف النهائي --' },
                      ...products.map((p) => ({
                        value: p.id,
                        label: `${p.name} (سعر البيع: ${formatArabicCurrency(p.pricePiasters)})`,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">آلية خصم الخامات من المخزن:</label>
                  <CustomSelect
                    value={depletionMode}
                    onChange={(v) => setDepletionMode(v as 'on_sale' | 'batch_production')}
                    options={[
                      { value: 'on_sale', label: 'خصم فوري للخامات عند كل عملية بيع (كافيه ومطعم)' },
                      { value: 'batch_production', label: 'تصنيع مجمّع مسبق (مخبز / حلواني / تحميص)' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">كمية الإنتاج للوصفة</label>
                    <input
                      type="number"
                      min={0.1}
                      step="0.1"
                      value={yieldUnits}
                      onChange={(e) => setYieldUnits(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-black text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">نسبة هدر عامة %</label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={recipeWastagePct}
                      onChange={(e) => setRecipeWastagePct(parseInt(e.target.value || '0', 10))}
                      className="w-full px-3 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-black text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                {/* Live Cost & Margin Preview */}
                {selectedProduct && (
                  <div className="p-3.5 rounded-xl bg-surface dark:bg-surface-dark border border-brand/30 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-muted dark:text-ink-dark-muted font-bold">تكلفة الوحدة المحسوبة من الخامات:</span>
                      <span className="font-black text-brand dark:text-brand-bright">{formatArabicCurrency(calculatedUnitCostPiasters)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted dark:text-ink-dark-muted font-bold">سعر بيع الوحدة للعميل:</span>
                      <span className="font-black text-ink dark:text-ink-dark">{formatArabicCurrency(selectedProduct.pricePiasters)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-line dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted font-bold">صافي ربح الوحدة المتوقع:</span>
                      <span className="font-black text-paid dark:text-paid-bright">
                        {formatArabicCurrency(selectedProduct.pricePiasters - calculatedUnitCostPiasters)}
                      </span>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateProductCost}
                    onChange={(e) => setUpdateProductCost(e.target.checked)}
                  />
                  <span>تحديث تكلفة الصنف في الكتالوج تلقائياً</span>
                </label>
              </div>

              {/* Right 2 Columns: Raw Ingredients Builder */}
              <div className="lg:col-span-2 bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-4">
                <h3 className="t-card-title text-ink dark:text-ink-dark">2. المكونات والخامات الداخلة في التحضير ({ingredients.length}) <RequiredMark /></h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-surface dark:bg-surface-dark p-3 rounded-xl border border-line dark:border-line-dark">
                  <div className="sm:col-span-2">
                    <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1">المكون الخام من المخزون</label>
                    <CustomSelect
                      value={rawProductId}
                      onChange={(v) => setRawProductId(v)}
                      options={[
                        { value: '', label: '-- اختر الخامة (بن، حليب، سكر، لحم...) --' },
                        ...products
                          .filter((p) => p.id !== selectedProductId)
                          .map((p) => ({
                            value: p.id,
                            label: `${p.name} (تكلفة: ${formatArabicCurrency(p.costPiasters)})`,
                          })),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1">
                      الكمية (مثال: 0.018 كجم = 18 جم)
                    </label>
                    <input
                      type="number"
                      min={0.001}
                      step="0.001"
                      value={rawQtyUnits}
                      onChange={(e) => setRawQtyUnits(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs font-black text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div className="flex items-end">
                    <AppButton variant="primary" icon={Plus} onClick={handleAddIngredient} fullWidth>
                      إضافة للوصفة
                    </AppButton>
                  </div>
                </div>

                {/* Ingredients Table */}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {ingredients.length === 0 ? (
                    <div className="p-8 text-center text-xs text-ink-muted dark:text-ink-dark-muted font-bold bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark">
                      أضف المكونات الخام (مثل 0.018 كجم بن إسبريسو + 0.200 لتر حليب) ليتم خصمها تلقائياً عند البيع.
                    </div>
                  ) : (
                    ingredients.map((ing) => (
                      <div
                        key={ing.rawProductId}
                        className="p-3 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-black text-ink dark:text-ink-dark">{ing.rawProductName}</span>
                          <span className="text-ink-muted dark:text-ink-dark-muted font-bold mr-2">
                            • الكمية: {(ing.quantityMilli / 1000).toFixed(3)} ({ing.quantityMilli} مللي/جم)
                          </span>
                        </div>
                        <AppButton
                          variant="dangerSubtle"
                          size="xs"
                          icon={Trash2}
                          onClick={() => handleRemoveIngredient(ing.rawProductId)}
                          aria-label="حذف المكوّن"
                        />
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line dark:border-line-dark">
                  {recipeId ? (
                    <AppButton variant="dangerSoft" onClick={handleDeleteRecipe}>
                      حذف الرسبي
                    </AppButton>
                  ) : (
                    <div />
                  )}

                  <AppButton
                    type="submit"
                    variant="success"
                    icon={CheckCircle2}
                    disabled={loading || !selectedProductId || ingredients.length === 0}
                  >
                    حفظ واعتماد الوصفة
                  </AppButton>
                </div>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Batch Production Form */}
              <form
                onSubmit={handleRunBatchProduction}
                className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-4 h-fit"
              >
                <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-1.5">
                  <Factory className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>تسجيل أمر إنتاج وتصنيع جديد</span>
                </h3>

                <div>
                  <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">اختر الوصفة المراد تصنيعها: <RequiredMark /></label>
                  <CustomSelect
                    value={produceRecipeId}
                    onChange={(v) => setProduceRecipeId(v)}
                    options={[
                      { value: '', label: '-- اختر وصفة من القائمة --' },
                      ...recipes.map((r) => ({
                        value: r.id,
                        label: `${r.productName} (تكلفة الوحدة: ${formatArabicCurrency(r.unitCostPiasters)})`,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">الكمية المنتجة (بالوحدة):</label>
                  <input
                    type="number"
                    min={0.1}
                    step="0.5"
                    value={produceQtyUnits}
                    onChange={(e) => setProduceQtyUnits(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-sm font-black text-brand dark:text-brand-bright focus:outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">ملاحظات التشغيلة:</label>
                  <input
                    type="text"
                    value={produceNotes}
                    onChange={(e) => setProduceNotes(e.target.value)}
                    placeholder="مثال: تشغيلة الصباح"
                    className="w-full px-3 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                </div>

                <AppButton type="submit" variant="success" disabled={loading || !produceRecipeId} fullWidth>
                  تنفيذ التصنيع (خصم الخامات وإضافة المنتج التام)
                </AppButton>
              </form>

              {/* Production Batches Log */}
              <div className="lg:col-span-2 bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-3">
                <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-1.5">
                  <History className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>سجل أوامر الإنتاج والتصنيع السابقة</span>
                </h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {productionLog.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-black text-ink dark:text-ink-dark">
                          {b.productName} • الكمية المنتجة: {(b.producedQtyMilli / 1000).toFixed(2)}
                        </div>
                        <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold">
                          بواسطة: {b.producedByName || 'المدير'} • {new Date(b.createdAt).toLocaleString('ar-EG')}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-black text-brand dark:text-brand-bright">
                          التكلفة الكلية: {formatArabicCurrency(b.totalCostPiasters)}
                        </div>
                        <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold">
                          تكلفة الوحدة: {formatArabicCurrency(b.unitCostPiasters)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        </MotionHeight>
      </div>
    </div>
  );
};
