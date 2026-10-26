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
  TrendingUp,
  TrendingDown,
  Check,
  ClipboardList,
  UserPlus,
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
  onOpenShortageModal?: (productId?: string, productName?: string) => void;
}

export const DrugAlternativesDrawer: React.FC<DrugAlternativesDrawerProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  onSubstitute,
  onAddToCart,
  onOpenShortageModal,
}) => {
  const [activeTier, setActiveTier] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DrugAlternativesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecordedInShortages, setIsRecordedInShortages] = useState(false);
  const [shortageSaving, setShortageSaving] = useState(false);
  const [shortageNotice, setShortageNotice] = useState<string | null>(null);

  const checkExistingShortage = useCallback(async (id?: string, name?: string) => {
    if (!id && !name) {
      setIsRecordedInShortages(false);
      return;
    }
    const trimmedId = id ? id.trim() : '';
    const trimmedName = name ? name.trim() : '';
    try {
      const list = await invoke<Array<{ productId?: string; freeText?: string; productName?: string; status?: string }>>('shortages:list', { status: 'open' });
      if (Array.isArray(list)) {
        const found = list.some(item => 
          (Boolean(trimmedId) && Boolean(item.productId) && item.productId === trimmedId) ||
          (Boolean(trimmedName) && ((item.productName && item.productName.trim() === trimmedName) || (item.freeText && item.freeText.trim() === trimmedName)))
        );
        setIsRecordedInShortages(found);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadAlternatives = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      let res: DrugAlternativesResult | null = null;
      try {
        res = await invoke<DrugAlternativesResult>('pharma:findAlternatives', { productId: id });
      } catch {
        res = await invoke<DrugAlternativesResult>('pharma:getAlternatives', { productId: id });
      }
      setData(res);
      // Auto switch to first tier that has items
      if (res) {
        const t1 = res.tier1IdenticalGenerics || (res as unknown as { exactGenerics?: DrugAlternativeItem[] }).exactGenerics || [];
        const t2 = res.tier2DifferentForms || (res as unknown as { differentForms?: DrugAlternativeItem[] }).differentForms || [];
        const t3 = res.tier3DifferentStrengths || (res as unknown as { differentStrengths?: DrugAlternativeItem[] }).differentStrengths || [];
        const t4 = res.tier4TherapeuticAlternatives || (res as unknown as { therapeuticAlternatives?: DrugAlternativeItem[] }).therapeuticAlternatives || [];

        if (t1.length > 0) {
          setActiveTier(1);
        } else if (t2.length > 0) {
          setActiveTier(2);
        } else if (t3.length > 0) {
          setActiveTier(3);
        } else if (t4.length > 0) {
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
      void checkExistingShortage(productId, productName);
    } else {
      setData(null);
      setError(null);
      setIsRecordedInShortages(false);
      setShortageNotice(null);
    }
  }, [isOpen, productId, productName, loadAlternatives, checkExistingShortage]);

  const handleQuickRecordShortage = async () => {
    try {
      setShortageSaving(true);
      const targetId = data?.originalProductId || productId;
      const targetName = data?.originalProductName || productName || 'صنف ناقص';
      await invoke('shortages:save', {
        productId: targetId || null,
        productName: targetName,
        requestedQuantityMilli: 1000,
        currentStockMilli: 0,
        source: 'pos',
        urgency: 'high',
        notes: 'تم التسجيل تلقائياً من محرك البدائل عند طلب العميل ونفاد الرصيد بالمخزن',
      });
      setIsRecordedInShortages(true);
      setShortageNotice('تم تسجيل الصنف في كشكول النواقص بنجاح');
      setTimeout(() => setShortageNotice(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل النواقص';
      setShortageNotice(msg);
    } finally {
      setShortageSaving(false);
    }
  };

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

  const tier1List = data?.tier1IdenticalGenerics || (data as unknown as { exactGenerics?: DrugAlternativeItem[] })?.exactGenerics || [];
  const tier2List = data?.tier2DifferentForms || (data as unknown as { differentForms?: DrugAlternativeItem[] })?.differentForms || [];
  const tier3List = data?.tier3DifferentStrengths || (data as unknown as { differentStrengths?: DrugAlternativeItem[] })?.differentStrengths || [];
  const tier4List = data?.tier4TherapeuticAlternatives || (data as unknown as { therapeuticAlternatives?: DrugAlternativeItem[] })?.therapeuticAlternatives || [];

  const tier1Count = tier1List.length;
  const tier2Count = tier2List.length;
  const tier3Count = tier3List.length;
  const tier4Count = tier4List.length;

  const currentItems: DrugAlternativeItem[] =
    activeTier === 1
      ? tier1List
      : activeTier === 2
      ? tier2List
      : activeTier === 3
      ? tier3List
      : tier4List;

  const currentProductName = data?.originalProductName || productName || 'الصنف الحالي';

  const formatUnitLabel = (u?: string): string => {
    if (!u) return 'علبة';
    const lower = u.toLowerCase().trim();
    if (lower === 'piece' || lower === 'pcs') return 'علبة';
    if (lower === 'box') return 'علبة';
    if (lower === 'strip') return 'شريط';
    if (lower === 'tablet' || lower === 'tab') return 'قرص';
    if (lower === 'capsule') return 'كبسولة';
    if (lower === 'bottle') return 'زجاجة';
    return u;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-ink/50 dark:bg-black/75 flex justify-end animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:w-[680px] md:w-[740px] max-w-[96vw] h-full bg-surface dark:bg-surface-dark border-r border-line dark:border-line-dark shadow-2xl flex flex-col select-none animate-in slide-in-from-left duration-200">
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 dark:border-brand-bright/20 shadow-2xs shrink-0">
              <Pill className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-bold text-ink dark:text-ink-dark leading-none">
                  محرك البدائل والمثائل الدوائية
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-mono font-bold border border-brand/20 dark:border-brand-bright/20">
                  F8
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-mono font-bold border border-paid/20 dark:border-paid-dark-border">
                  Pharma Matrix
                </span>
              </div>
              <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1 truncate">
                البحث الذكي عن المثائل والبدائل العلاجية المتوفرة وفروق الأسعار
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark-high flex items-center justify-center text-ink-muted dark:text-ink-dark hover:text-ink dark:hover:text-white transition-colors shadow-2xs cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Current Target Product Hero Card */}
        <div className="p-3.5 mx-4 mt-3 rounded-xl bg-canvas dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2.5 shrink-0 shadow-2xs">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="px-2 py-0.5 rounded bg-brand/10 dark:bg-brand-bright/20 text-brand dark:text-brand-bright text-[11px] font-bold shrink-0 border border-brand/20 dark:border-brand-bright/30">
                الصنف المطلوب
              </span>
              <span className="text-sm font-bold text-ink dark:text-ink-dark truncate" title={currentProductName}>
                {currentProductName}
              </span>
            </div>

            {/* Out-of-stock status & Shortage Action Toolbar */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright text-[11px] font-bold border border-danger-border dark:border-danger/30 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>رصيد 0 (نافد تماماً)</span>
              </span>

              {isRecordedInShortages ? (
                <span className="px-2.5 py-1 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-[11px] font-bold border border-paid-border dark:border-paid/30 flex items-center gap-1 shadow-2xs">
                  <Check className="w-3.5 h-3.5" />
                  <span>مُسجل في النواقص</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleQuickRecordShortage}
                  disabled={shortageSaving}
                  className="px-2.5 py-1 rounded-lg bg-warn-soft dark:bg-warn-dark-soft hover:bg-warn-border text-warn dark:text-warn-bright text-[11px] font-bold border border-warn-border dark:border-warn-bright/30 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs disabled:opacity-50"
                  title="تسجيل هذا الدواء في كشكول النواقص بنقرة واحدة لطلبه من الموزعين"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>{shortageSaving ? 'جاري التسجيل...' : '+ إضافة للنواقص'}</span>
                </button>
              )}

              {onOpenShortageModal && (
                <button
                  type="button"
                  onClick={() => onOpenShortageModal(productId, currentProductName)}
                  className="px-2 py-1 rounded-lg bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark text-[11px] font-medium border border-line dark:border-line-dark flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title="حجز الصنف باسم ورقم هاتف المريض مع تحديد كمية مخصصة"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>حجز لمريض</span>
                </button>
              )}
            </div>
          </div>

          {shortageNotice && (
            <div className="px-2.5 py-1 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-xs font-bold border border-paid-border dark:border-paid/20 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>{shortageNotice}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/50 dark:border-line-dark/50 flex-wrap text-xs">
            {data?.originalScientificName ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                <span className="font-bold text-ink-muted dark:text-ink-dark-muted text-[11px] shrink-0">المادة الفعالة:</span>
                <span className="font-mono font-bold text-ink dark:text-ink-dark text-xs truncate dir-ltr text-right">
                  {data.originalScientificName}
                </span>
              </div>
            ) : <div />}

            {data?.originalPricePiasters ? (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark shrink-0 shadow-2xs">
                <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">سعر الصنف الأصلي:</span>
                <span className="font-mono text-xs font-extrabold text-brand dark:text-brand-bright">
                  {formatArabicCurrency(data.originalPricePiasters)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* 4-Tier Navigation Tabs */}
        <div className="grid grid-cols-4 p-2 gap-1.5 bg-surface-2/60 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-xs mt-3">
          <button
            type="button"
            onClick={() => setActiveTier(1)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
              activeTier === 1
                ? 'bg-paid text-white shadow-2xs font-bold'
                : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">مثائل مطابقة</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 1 ? 'bg-white/25 text-white' : 'bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted'
              }`}>
                {tier1Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المادة والتركيز والشكل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier(2)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
              activeTier === 2
                ? 'bg-brand dark:bg-brand-container text-white shadow-2xs font-bold border border-brand/30 dark:border-brand-bright/30'
                : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">أشكال أخرى</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 2 ? 'bg-white/25 text-white' : 'bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted'
              }`}>
                {tier2Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المادة لكن شكل مختلف</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier(3)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
              activeTier === 3
                ? 'bg-warn text-white shadow-2xs font-bold'
                : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">تركيزات أخرى</span>
              <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                activeTier === 3 ? 'bg-white/25 text-white' : 'bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted'
              }`}>
                {tier3Count}
              </span>
            </div>
            <span className="text-[9px] opacity-85 leading-tight">نفس المادة بجرعة مختلفة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier(4)}
            className={`py-2 px-1 rounded-lg text-center flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
              activeTier === 4
                ? 'bg-brand dark:bg-brand-container text-white shadow-2xs font-bold border border-brand/30 dark:border-brand-bright/30'
                : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">بدائل علاجية</span>
              <span className={`text-[10px] px-1.5 rounded-full font-mono font-bold ${
                activeTier === 4 ? 'bg-white/25 text-white' : 'bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted'
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
            <div className="py-16 text-center text-ink-muted dark:text-ink-dark-muted flex flex-col items-center gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-brand dark:text-brand-bright" />
              <span className="text-xs font-semibold">جاري البحث في قاعدة البيانات الدوائية...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && currentItems.length === 0 && (
            <div className="py-16 text-center text-ink-muted dark:text-ink-dark-muted flex flex-col items-center gap-2">
              <Layers className="w-10 h-10 opacity-30 text-brand dark:text-brand-bright" />
              <span className="text-sm font-bold text-ink dark:text-ink-dark">
                لا توجد بدائل مسجلة في هذا المستوى ({activeTier === 1 ? 'مثائل متطابقة' : activeTier === 2 ? 'أشكال أخرى' : activeTier === 3 ? 'تركيزات أخرى' : 'بدائل علاجية'})
              </span>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                تأكد من تسجيل المواد الفعالة والأشكال الدوائية والتصنيف العلاجي في بطاقة الصنف
              </p>
            </div>
          )}

          {!loading && !error && currentItems.map((item) => {
            const hasStock = item.stockQuantityMilli > 0;
            const priceDiff = item.priceDifferencePiasters;
            const drugName = item.productName || item.name || 'صنف غير مسمى';
            const unitLabel = formatUnitLabel(item.unit);
            const stockCount = Math.floor(item.stockQuantityMilli / 1000);

            return (
              <div
                key={item.productId}
                className={`p-3.5 rounded-xl border transition-all ${
                  hasStock
                    ? 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/50 dark:hover:border-brand-bright/50 shadow-2xs'
                    : 'bg-surface-2/40 dark:bg-surface-dark-2/40 border-line/40 dark:border-line-dark/40 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-ink dark:text-ink-dark">
                        {drugName}
                      </span>
                      {hasStock ? (
                        <span className="px-2 py-0.5 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-dark-border text-[11px] font-bold flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          <span>متوفر {stockCount} {unitLabel}</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger/30 text-[11px] font-bold">
                          غير متوفر (رصيد 0)
                        </span>
                      )}
                    </div>

                    {/* Scientific name & dosage form & manufacturer */}
                    <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center gap-2 mt-1.5 flex-wrap">
                      {item.scientificName && (
                        <span className="font-mono font-medium text-brand dark:text-brand-bright bg-brand-soft/50 dark:bg-brand-dark-soft px-2 py-0.5 rounded border border-brand/15 dark:border-brand-bright/20">
                          {item.scientificName}
                        </span>
                      )}
                      {item.dosageFormName && (
                        <span className="px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark text-[10px] font-semibold border border-line/60 dark:border-line-dark">
                          {item.dosageFormName}
                        </span>
                      )}
                      {item.manufacturerName && (
                        <span className="flex items-center gap-1 text-[10px] text-ink-muted dark:text-ink-dark-muted">
                          <Building2 className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                          <span>{item.manufacturerName}</span>
                        </span>
                      )}
                    </div>

                    {/* Match Reason */}
                    {item.matchReason && (
                      <div className="text-[10px] text-ink-muted/80 dark:text-ink-dark-muted/80 mt-1 italic">
                        {item.matchReason}
                      </div>
                    )}
                  </div>

                  {/* Price & Professional Difference Badge */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="text-sm font-extrabold font-mono text-ink dark:text-ink-dark">
                      {formatArabicCurrency(item.pricePiasters)}
                    </div>
                    {priceDiff !== 0 ? (
                      priceDiff < 0 ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/25 dark:border-paid-dark-border shadow-2xs">
                          <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                          <span>أرخص بـ {formatArabicCurrency(Math.abs(priceDiff))}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/25 dark:border-danger/30 shadow-2xs">
                          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                          <span>أغلى بـ {formatArabicCurrency(priceDiff)}</span>
                        </div>
                      )
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark">
                        <span>نفس السعر</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions per item */}
                <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-line/40 dark:border-line-dark/60">
                  <button
                    type="button"
                    onClick={() => void handleAction(item, 'add')}
                    className="h-7.5 px-3 rounded-lg border border-line dark:border-line-dark-strong bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark-high text-ink dark:text-ink-dark text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-brand dark:text-brand-bright" />
                    <span>إضافة للسلة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleAction(item, 'substitute')}
                    className="h-7.5 px-3.5 rounded-lg bg-brand dark:bg-brand-container hover:bg-brand-hover dark:hover:bg-brand text-white border border-brand/40 dark:border-brand-bright/30 text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
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
