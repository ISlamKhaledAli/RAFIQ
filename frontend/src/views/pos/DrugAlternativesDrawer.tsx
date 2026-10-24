import React, { useState, useEffect, useCallback } from 'react';
import {
  Pill,
  X,
  Layers,
  ArrowRightLeft,
  Plus,
  Package,
  RefreshCw,
  AlertCircle,
  Building2,
  Sparkles,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import type { DrugAlternativesResult, DrugAlternativeItem } from '../../types/pharma';
import type { Product } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';

interface DrugAlternativesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string;
  productName?: string;
  onSubstitute?: (originalProductId: string, replacementProduct: Product) => void;
  onAddToCart?: (product: Product) => void;
}

export const DrugAlternativesDrawer: React.FC<DrugAlternativesDrawerProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  onSubstitute,
  onAddToCart,
}) => {
  const [activeTier, setActiveTier] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DrugAlternativesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAlternatives = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<DrugAlternativesResult>('pharma:findAlternatives', { productId: id });
      setData(res);
      // Auto switch to first tier that has items
      if (res) {
        if (res.tier1IdenticalGenerics && res.tier1IdenticalGenerics.length > 0) {
          setActiveTier(1);
        } else if (res.tier2DifferentForms && res.tier2DifferentForms.length > 0) {
          setActiveTier(2);
        } else if (res.tier3DifferentStrengths && res.tier3DifferentStrengths.length > 0) {
          setActiveTier(3);
        } else if (res.tier4TherapeuticAlternatives && res.tier4TherapeuticAlternatives.length > 0) {
          setActiveTier(4);
        }
      }
    } catch {
      setError('تعذر العثور على بدائل لهذا الصنف أو لم تسجل له بيانات دوائية بعد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && productId) {
      void loadAlternatives(productId);
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, productId, loadAlternatives]);

  const handleAction = async (item: DrugAlternativeItem, action: 'substitute' | 'add') => {
    try {
      const fullProd = await invoke<Product>('products:getById', { id: item.productId });
      if (!fullProd) return;
      if (action === 'substitute' && onSubstitute && productId) {
        onSubstitute(productId, fullProd);
      } else if (action === 'add' && onAddToCart) {
        onAddToCart(fullProd);
      }
      onClose();
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const tier1Count = data?.tier1IdenticalGenerics?.length || 0;
  const tier2Count = data?.tier2DifferentForms?.length || 0;
  const tier3Count = data?.tier3DifferentStrengths?.length || 0;
  const tier4Count = data?.tier4TherapeuticAlternatives?.length || 0;

  const currentItems: DrugAlternativeItem[] =
    activeTier === 1
      ? data?.tier1IdenticalGenerics || []
      : activeTier === 2
      ? data?.tier2DifferentForms || []
      : activeTier === 3
      ? data?.tier3DifferentStrengths || []
      : data?.tier4TherapeuticAlternatives || [];

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-ink/40 dark:bg-black/60 flex justify-end animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl h-full bg-surface dark:bg-surface-dark border-r border-line dark:border-line-dark shadow-2xl flex flex-col select-none animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 shadow-2xs">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark">
                  محرك البدائل والمثائل الدوائية (F8)
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-mono font-bold">
                  Pharma Matrix
                </span>
              </div>
              <div className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5 mt-0.5">
                <span>الصنف الحالي:</span>
                <span className="font-bold text-ink dark:text-ink-dark">{data?.originalProductName || productName}</span>
                {data?.originalPricePiasters ? (
                  <span className="font-mono text-[11px] text-brand">
                    ({formatArabicCurrency(data.originalPricePiasters)})
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {productId && (
              <button
                type="button"
                onClick={() => void loadAlternatives(productId)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark"
                title="إعادة الفحص"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scientific Name Banner if available */}
        {data?.originalScientificName && (
          <div className="px-4 py-2 bg-brand-soft/30 dark:bg-brand-soft/10 border-b border-brand/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-brand dark:text-brand-bright">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold">المادة الفعالة / الاسم العلمي:</span>
              <span className="font-mono font-bold text-ink dark:text-ink-dark">
                {data.originalScientificName}
              </span>
            </div>
          </div>
        )}

        {/* 4-Tier Navigation Tabs */}
        <div className="grid grid-cols-4 p-2 gap-1 bg-surface-2/60 dark:bg-surface-dark-2/60 border-b border-line dark:border-line-dark text-xs">
          <button
            type="button"
            onClick={() => setActiveTier(1)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all ${
              activeTier === 1
                ? 'bg-paid text-white shadow-2xs font-bold'
                : 'text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">مثائل مطابقة</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 1 ? 'bg-white/25 text-white' : 'bg-surface-2 text-ink-muted'
              }`}>
                {tier1Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المادة والتركيز والشكل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier(2)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all ${
              activeTier === 2
                ? 'bg-brand text-white shadow-2xs font-bold'
                : 'text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">أشكال أخرى</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 2 ? 'bg-white/25 text-white' : 'bg-surface-2 text-ink-muted'
              }`}>
                {tier2Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المادة لكن شكل مختلف</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier(3)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all ${
              activeTier === 3
                ? 'bg-warn text-white shadow-2xs font-bold'
                : 'text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">تركيزات أخرى</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 3 ? 'bg-white/25 text-white' : 'bg-surface-2 text-ink-muted'
              }`}>
                {tier3Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المادة بجرعة مختلفة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier(4)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all ${
              activeTier === 4
                ? 'bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark border border-line dark:border-line-dark shadow-2xs font-bold'
                : 'text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">بدائل علاجية</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 4 ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink-muted'
              }`}>
                {tier4Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المجموعة العلاجية</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {loading && (
            <div className="py-16 text-center text-ink-muted flex flex-col items-center gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-brand" />
              <span className="text-xs font-semibold">جاري البحث في قاعدة البيانات الدوائية...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-xl bg-warn-soft border border-warn/20 text-warn flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && currentItems.length === 0 && (
            <div className="py-16 text-center text-ink-muted flex flex-col items-center gap-2">
              <Layers className="w-10 h-10 opacity-30 text-brand" />
              <span className="text-sm font-bold text-ink dark:text-ink-dark">
                لا توجد بدائل مسجلة في هذا المستوى ({activeTier === 1 ? 'مثائل متطابقة' : activeTier === 2 ? 'أشكال أخرى' : activeTier === 3 ? 'تركيزات أخرى' : 'بدائل علاجية'})
              </span>
              <p className="text-xs text-ink-muted">
                تأكد من تسجيل المواد الفعالة والأشكال الدوائية والتصنيف العلاجي في بطاقة الصنف
              </p>
            </div>
          )}

          {!loading && !error && currentItems.map((item) => {
            const hasStock = item.stockQuantityMilli > 0;
            const priceDiff = item.priceDifferencePiasters;
            return (
              <div
                key={item.productId}
                className={`p-3.5 rounded-xl border transition-all ${
                  hasStock
                    ? 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-brand/50 shadow-2xs'
                    : 'bg-surface-2/40 dark:bg-surface-dark-2/40 border-line/40 dark:border-line-dark/40 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-ink dark:text-ink-dark">
                        {item.productName}
                      </span>
                      {hasStock ? (
                        <span className="px-1.5 py-0.5 rounded bg-paid-soft text-paid text-[10px] font-bold">
                          متوفر ({item.stockQuantityMilli / 1000} {item.unit})
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-danger-soft text-danger text-[10px] font-bold">
                          غير متوفر (0 رصيد)
                        </span>
                      )}
                    </div>

                    {/* Scientific name & dosage form */}
                    <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center gap-2 mt-1 flex-wrap">
                      {item.scientificName && (
                        <span className="font-mono text-brand dark:text-brand-bright">
                          {item.scientificName}
                        </span>
                      )}
                      {item.dosageFormName && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 text-[10px]">
                          {item.dosageFormName}
                        </span>
                      )}
                      {item.manufacturerName && (
                        <span className="flex items-center gap-0.5 text-[10px]">
                          <Building2 className="w-3 h-3 text-ink-muted" />
                          {item.manufacturerName}
                        </span>
                      )}
                    </div>

                    {/* Match Reason */}
                    {item.matchReason && (
                      <div className="text-[10px] text-ink-muted/80 mt-1 italic">
                        {item.matchReason}
                      </div>
                    )}
                  </div>

                  {/* Price & Difference */}
                  <div className="text-left shrink-0">
                    <div className="text-xs font-bold font-mono text-ink dark:text-ink-dark">
                      {formatArabicCurrency(item.pricePiasters)}
                    </div>
                    {priceDiff !== 0 && (
                      <div
                        className={`text-[10px] font-mono font-bold mt-0.5 ${
                          priceDiff < 0 ? 'text-paid' : 'text-danger'
                        }`}
                      >
                        {priceDiff > 0 ? `+${formatArabicCurrency(priceDiff)}` : `-${formatArabicCurrency(Math.abs(priceDiff))}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions per item */}
                <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-line/40 dark:border-line-dark/40">
                  <button
                    type="button"
                    onClick={() => void handleAction(item, 'add')}
                    className="h-7 px-2.5 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-surface-2 text-ink dark:text-ink-dark text-[11px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>إضافة للسلة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleAction(item, 'substitute')}
                    className="h-7 px-3 rounded-lg bg-brand hover:bg-brand-hover text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>استبدال في السلة</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="h-12 px-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between text-xs text-ink-muted shrink-0">
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-brand" />
            <span>يتم ترتيب البدائل بالأصناف المتوفرة أولاً، ثم الأقرب في السعر</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-lg border border-line dark:border-line-dark text-xs font-bold hover:bg-surface text-ink dark:text-ink-dark"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
