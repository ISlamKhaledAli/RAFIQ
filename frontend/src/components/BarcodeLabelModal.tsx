import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Printer, 
  X, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Tag, 
  Layers, 
  Eye, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  AlertCircle,
  Copy,
  Settings2,
  RefreshCw
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { invoke } from '../bridge/ipc';
import { printReport } from '../utils/printReport';
import type { 
  Product, 
  Category, 
  BarcodeLabelItem, 
  BarcodeLabelConfig, 
  PrintLabelsRequest, 
  PrintLabelsResult 
} from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { CustomSelect } from './CustomSelect';
// ToggleSwitch replaced by compact content chips
import { useModalDismiss } from '../hooks/useModalDismiss';

export interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProduct?: Product | null;
  initialQueueItems?: LabelQueueItem[] | null;
  sourceTitle?: string;
}

export interface LabelQueueItem extends BarcodeLabelItem {
  stockQuantityMilli?: number;
  categoryName?: string;
}

const PAPER_SIZES = [
  { value: '38x25', label: '38×25 مم (بكرة رول قياسية صغيرة - محلات التجزئة والملابس واللعب)', widthMm: 38, heightMm: 25 },
  { value: '40x30', label: '40×30 مم (بكرة رول متوسطة)', widthMm: 40, heightMm: 30 },
  { value: '50x25', label: '50×25 مم (بكرة رول عريضة مدمجة)', widthMm: 50, heightMm: 25 },
  { value: '50x30', label: '50×30 مم (بكرة رول عريضة قياسية)', widthMm: 50, heightMm: 30 },
  { value: '50x40', label: '50×40 مم (ملصق رف وتخزين كبير)', widthMm: 50, heightMm: 40 },
  { value: '60x40', label: '60×40 مم (بكرة رول كرتونة وشحن متوسطة)', widthMm: 60, heightMm: 40 },
  { value: '80x50', label: '80×50 مم (ملصق مستودعات وكراتين كبيرة)', widthMm: 80, heightMm: 50 },
  { value: '100x150', label: '100×150 مم (بوليصة شحن واستيكر طرود بريدية)', widthMm: 100, heightMm: 150 },
  { value: 'a4_24', label: 'ورق A4 ملصقات (24 ملصق: 3 أعمدة × 8 صفوف - 70×37 مم)', widthMm: 70, heightMm: 37 },
  { value: 'a4_40', label: 'ورق A4 ملصقات (40 ملصق: 4 أعمدة × 10 صفوف - 52×30 مم)', widthMm: 52, heightMm: 30 },
  { value: 'custom', label: 'مقاس مخصص يدوي (تحديد العرض والارتفاع بالمليمتر)', widthMm: 50, heightMm: 30 },
];

const DEFAULT_EXPIRY_FALLBACK = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];

type LabelContentKey = 'showStoreName' | 'showPrice' | 'showBarcodeText' | 'showExpiryDate';

// Label content toggles and the settings keys that persist them between sessions
const CONTENT_TOGGLES: { key: LabelContentKey; label: string; settingKey: string }[] = [
  { key: 'showStoreName', label: 'اسم المحل', settingKey: 'label_show_store_name' },
  { key: 'showPrice', label: 'السعر', settingKey: 'label_show_price' },
  { key: 'showBarcodeText', label: 'أرقام الباركود', settingKey: 'label_show_barcode_text' },
  { key: 'showExpiryDate', label: 'تاريخ الصلاحية', settingKey: 'label_show_expiry_date' },
];

/**
 * مكوّن رسم الباركود الدقيق كـ SVG باستخدام خوارزمية Code 128
 */
const BarcodeSvgPreview: React.FC<{ 
  barcode: string; 
  showText: boolean; 
  height?: number; 
  fontSize?: number;
  widthFactor?: number 
}> = ({ barcode, showText, height = 36, fontSize = 10, widthFactor }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const effectiveWidthFactor = useMemo(() => {
    if (widthFactor !== undefined) return widthFactor;
    if (barcode.length > 16) return 0.95;
    if (barcode.length > 12) return 1.15;
    return 1.35;
  }, [barcode, widthFactor]);

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, barcode, {
        format: 'CODE128',
        lineColor: '#000000',
        width: effectiveWidthFactor,
        height,
        displayValue: showText,
        fontSize,
        font: 'Courier New',
        fontOptions: 'bold',
        textMargin: 1,
        margin: 0,
        background: 'transparent',
      });
    } catch {
      // Ignored for non-renderable characters
    }
  }, [barcode, showText, height, fontSize, effectiveWidthFactor]);

  if (!barcode) {
    return <div className="text-xs text-ink-muted dark:text-ink-dark-muted italic py-2">لا يوجد باركود</div>;
  }

  return (
    <div className="w-full flex justify-center items-center overflow-hidden">
      <svg ref={svgRef} className="max-w-full h-auto block" />
    </div>
  );
};

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  preselectedProduct,
  initialQueueItems,
  sourceTitle,
}) => {
  const [queue, setQueue] = useState<LabelQueueItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [installedPrinters, setInstalledPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Settings & Toggles
  const [config, setConfig] = useState<BarcodeLabelConfig>({
    paperSize: '38x25',
    customWidthMm: 50,
    customHeightMm: 30,
    showStoreName: true,
    storeName: 'متجر رفيق',
    showPrice: true,
    showBarcodeText: true,
    showExpiryDate: false,
    printerName: '',
  });

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Helper to persist label settings automatically to the database
  const saveLabelSettings = useCallback((updated: Partial<BarcodeLabelConfig>) => {
    const payload: Record<string, string> = {};
    if (updated.paperSize !== undefined) payload.default_label_paper_size = updated.paperSize;
    if (updated.printerName !== undefined) payload.default_label_printer_name = updated.printerName;
    if (updated.customWidthMm !== undefined) payload.label_custom_width_mm = String(updated.customWidthMm);
    if (updated.customHeightMm !== undefined) payload.label_custom_height_mm = String(updated.customHeightMm);
    if (updated.showStoreName !== undefined) payload.label_show_store_name = updated.showStoreName ? '1' : '0';
    if (updated.showPrice !== undefined) payload.label_show_price = updated.showPrice ? '1' : '0';
    if (updated.showBarcodeText !== undefined) payload.label_show_barcode_text = updated.showBarcodeText ? '1' : '0';
    if (updated.showExpiryDate !== undefined) payload.label_show_expiry_date = updated.showExpiryDate ? '1' : '0';

    void invoke('settings:save', payload).catch((err) => {
      console.warn('Failed to auto-save label settings:', err);
    });
  }, []);

  const updateConfig = useCallback((updater: (prev: BarcodeLabelConfig) => BarcodeLabelConfig) => {
    setConfig((prev) => {
      const next = updater(prev);
      saveLabelSettings(next);
      return next;
    });
  }, [saveLabelSettings]);

  // Load initial store settings & printers on open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    void (async () => {
      try {
        const [prodList, catList, printerList, appSettings] = await Promise.all([
          invoke<Product[]>('products:getAll', { limit: 1000 }).catch(() => []),
          invoke<Category[]>('categories:getAll').catch(() => []),
          invoke<{ name: string; isDefault: boolean }[]>('printer:list').catch(() => []),
          invoke<Record<string, string>>('settings:getAll').catch(() => ({})),
        ]);

        if (!active) return;
        setAllProducts(prodList || []);
        setCategories(catList || []);
        setInstalledPrinters(printerList || []);

        const sRecord = (appSettings || {}) as Record<string, string>;
        const storeName = sRecord.store_name || 'متجر رفيق';
        const defaultLabelPrinter = sRecord.default_label_printer_name || sRecord.default_printer_name || '';
        const defaultPaperSize = sRecord.default_label_paper_size || '38x25';
        const customW = parseInt(sRecord.label_custom_width_mm || '50', 10) || 50;
        const customH = parseInt(sRecord.label_custom_height_mm || '30', 10) || 30;
        const showStoreName = sRecord.label_show_store_name !== undefined ? sRecord.label_show_store_name === '1' : true;
        const showPrice = sRecord.label_show_price !== undefined ? sRecord.label_show_price === '1' : true;
        const showBarcodeText = sRecord.label_show_barcode_text !== undefined ? sRecord.label_show_barcode_text === '1' : true;
        const showExpiryDate = sRecord.label_show_expiry_date === '1';

        setConfig((prev) => ({
          ...prev,
          storeName,
          printerName: defaultLabelPrinter,
          paperSize: defaultPaperSize,
          customWidthMm: customW,
          customHeightMm: customH,
          showStoreName,
          showPrice,
          showBarcodeText,
          showExpiryDate,
        }));
      } catch (err) {
        console.error('Failed to load initial label modal data:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Handle preselected product or initial items from purchase invoices / products catalog
  useEffect(() => {
    if (!isOpen) {
      setQueue([]);
      setPreviewIndex(0);
      setStatusMessage(null);
      setSearchQuery('');
      setSelectedCategoryId('');
      return;
    }

    if (initialQueueItems && initialQueueItems.length > 0) {
      setQueue(initialQueueItems);
      setPreviewIndex(0);
      return;
    }

    if (preselectedProduct && preselectedProduct.barcode) {
      setQueue([
        {
          productId: preselectedProduct.id,
          productName: preselectedProduct.name,
          barcode: preselectedProduct.barcode,
          pricePiasters: preselectedProduct.pricePiasters,
          variantInfo: preselectedProduct.variantColor && preselectedProduct.variantSize 
            ? `${preselectedProduct.variantColor} / ${preselectedProduct.variantSize}` 
            : (preselectedProduct.variantSize || preselectedProduct.variantColor || ''),
          copies: Math.max(1, Math.floor((preselectedProduct.stockQuantityMilli || 1000) / 1000)),
          stockQuantityMilli: preselectedProduct.stockQuantityMilli,
        },
      ]);
      setPreviewIndex(0);
    } else if (preselectedProduct && !preselectedProduct.barcode) {
      setQueue([]);
      setPreviewIndex(0);
      setStatusMessage({
        text: `تنبيه: الصنف "${preselectedProduct.name}" ليس له رقم باركود مسجل!`,
        type: 'error',
      });
    } else {
      setQueue([]);
      setPreviewIndex(0);
    }
  }, [isOpen, preselectedProduct, initialQueueItems]);

  // Filtered available products to add
  const filteredProducts = useMemo(() => {
    let list = allProducts.filter((p) => p.barcode && p.barcode.trim().length > 0);
    if (selectedCategoryId) {
      list = list.filter((p) => p.categoryId === selectedCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 50);
  }, [allProducts, selectedCategoryId, searchQuery]);

  const dropdownResults = useMemo(() => {
    return filteredProducts.slice(0, 8);
  }, [filteredProducts]);

  const addProductToQueue = (prod: Product) => {
    if (!prod.barcode) return;
    const barcodeStr: string = prod.barcode;
    setQueue((prev) => {
      const idx = prev.findIndex((item) => item.productId === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx].copies += 1;
        return next;
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          barcode: barcodeStr,
          pricePiasters: prod.pricePiasters,
          variantInfo: prod.variantColor && prod.variantSize 
            ? `${prod.variantColor} / ${prod.variantSize}` 
            : (prod.variantSize || prod.variantColor || ''),
          copies: 1,
          stockQuantityMilli: prod.stockQuantityMilli,
          categoryName: prod.categoryName,
        },
      ];
    });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(dropdownResults.length - 1, prev + 1));
      setShowResults(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(0, prev - 1));
      setShowResults(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownResults.length > 0 && highlightIndex >= 0 && highlightIndex < dropdownResults.length) {
        addProductToQueue(dropdownResults[highlightIndex]);
        setSearchQuery('');
        setShowResults(false);
      }
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const removeProductFromQueue = (index: number) => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (previewIndex >= next.length) {
        setPreviewIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const updateCopies = (index: number, newCopies: number) => {
    setQueue((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index].copies = Math.max(1, newCopies);
      }
      return next;
    });
  };

  const fillCopiesFromStock = () => {
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        copies: Math.max(1, Math.floor((item.stockQuantityMilli || 1000) / 1000)),
      }))
    );
    setStatusMessage({
      text: 'تم ضبط عدد النسخ حسب رصيد كل صنف',
      type: 'success',
    });
  };

  const resetCopiesToOne = () => {
    setQueue((prev) => prev.map((item) => ({ ...item, copies: 1 })));
  };

  const totalLabelsCount = useMemo(() => {
    return queue.reduce((sum, item) => sum + (item.copies || 1), 0);
  }, [queue]);

  const currentPreviewItem = queue[previewIndex] || queue[0] || null;


  // Selected paper specs
  const selectedPaper = useMemo(() => {
    if (config.paperSize === 'custom') {
      const w = config.customWidthMm && config.customWidthMm > 0 ? config.customWidthMm : 50;
      const h = config.customHeightMm && config.customHeightMm > 0 ? config.customHeightMm : 30;
      return {
        value: 'custom',
        label: `مخصص (${w}×${h} مم)`,
        widthMm: w,
        heightMm: h,
      };
    }
    return PAPER_SIZES.find((p) => p.value === config.paperSize) || PAPER_SIZES[0];
  }, [config.paperSize, config.customWidthMm, config.customHeightMm]);

  const isSmallLabel = selectedPaper.heightMm <= 26;
  const isMediumLabel = selectedPaper.heightMm > 26 && selectedPaper.heightMm <= 35;

  // Proportional physical dimensions for label preview (maintains exact physical mm ratio, e.g. 38x25 mm)
  const previewDimensions = useMemo(() => {
    const maxW = 260;
    const maxH = 175;
    const wMm = Math.max(10, selectedPaper.widthMm || 38);
    const hMm = Math.max(10, selectedPaper.heightMm || 25);
    const scale = Math.min(maxW / wMm, maxH / hMm);
    return {
      width: Math.round(wMm * scale),
      height: Math.round(hMm * scale),
    };
  }, [selectedPaper.widthMm, selectedPaper.heightMm]);

  // Execute Direct Label Printing via IPC
  const handlePrintLabels = async () => {
    if (queue.length === 0) {
      setStatusMessage({ text: 'يرجى إضافة أصناف لقائمة طباعة الملصقات أولاً.', type: 'error' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const requestPayload: PrintLabelsRequest = {
        items: queue.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          pricePiasters: item.pricePiasters,
          variantInfo: item.variantInfo,
          copies: item.copies,
          expiryDate: item.expiryDate,
        })),
        config,
      };

      const result = await invoke<PrintLabelsResult>('printer:printLabels', requestPayload);
      if (result && result.success) {
        setStatusMessage({
          text: `تمت طباعة ${result.totalLabelsPrinted} ملصق على طابعة: ${result.printerUsed}`,
          type: 'success',
        });
      } else {
        setStatusMessage({
          text: result?.message || 'تعذر إتمام أمر الطباعة.',
          type: 'error',
        });
      }
    } catch (err: unknown) {
      console.error('Print labels error:', err);
      setStatusMessage({
        text: err instanceof Error ? err.message : 'حدث خطأ أثناء الاتصال بطابعة الملصقات.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Test Print Label
  const handleTestLabelPrint = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await invoke<PrintLabelsResult>('printer:testLabel', {
        printerName: config.printerName,
        paperSize: config.paperSize,
        customWidthMm: config.customWidthMm,
        customHeightMm: config.customHeightMm,
      });
      if (res && res.success) {
        setStatusMessage({
          text: `تم إرسال الملصق التجريبي إلى: ${res.printerUsed}`,
          type: 'success',
        });
      } else {
        setStatusMessage({
          text: res?.message || 'فشل أمر طباعة الملصق التجريبي.',
          type: 'error',
        });
      }
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'فشل طباعة الملصق التجريبي.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Browser Print Preview (Standard A4 Print Dialog)
  const handleBrowserPrint = () => {
    if (queue.length === 0) return;
    void printReport({ kind: 'a4only' });
  };

  const isDirty = queue.length > 0;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء قائمة طباعة الباركود؟',
    confirmMessage: 'توجد أصناف مجهزة في قائمة الطباعة. هل أنت متأكد من الخروج والتراجع؟',
  });

  if (!isOpen) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div data-print-root className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-brand text-white px-5 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Tag className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold m-0 leading-tight">طباعة ملصقات الباركود والأسعار</h2>
              {sourceTitle && (
                <span className="text-micro bg-white/20 px-2 py-0.5 rounded-full font-bold">
                  {sourceTitle}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="p-1.5 hover:bg-white/15 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 border-b shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30'
                : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30'
            }`}
          >
            {statusMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body: 2 columns (right = products & queue, left = preview & settings) */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-canvas dark:bg-canvas-dark">

          {/* Column 1: Search + Queue */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-w-0">

            {/* Search with dropdown results */}
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="ابحث بالاسم أو امسح الباركود ثم Enter..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightIndex(0);
                    setShowResults(true);
                  }}
                  onFocus={() => setShowResults(true)}
                  onBlur={() => setShowResults(false)}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full pl-3 pr-9 h-10 text-sm bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl focus:outline-none focus:border-brand dark:focus:border-brand-bright text-ink dark:text-ink-dark shadow-2xs"
                />
              </div>
              <div className="w-44 shrink-0">
                <CustomSelect
                  value={selectedCategoryId}
                  onChange={(val) => setSelectedCategoryId(val)}
                  options={[
                    { value: '', label: 'كل الأقسام' },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  placeholder="القسم"
                  size="sm"
                />
              </div>

              {showResults && searchQuery.trim().length > 0 && (
                <div className="absolute top-full right-0 left-0 mt-1 z-20 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-lg overflow-hidden">
                  {dropdownResults.length === 0 ? (
                    <div className="p-3 text-center text-xs text-ink-muted dark:text-ink-dark-muted">
                      لا توجد أصناف مطابقة لها باركود
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-line/60 dark:divide-line-dark">
                      {dropdownResults.map((p, i) => {
                        const inQueue = queue.find((q) => q.productId === p.id);
                        return (
                          <div
                            key={p.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              addProductToQueue(p);
                              setSearchQuery('');
                              setShowResults(false);
                            }}
                            onMouseEnter={() => setHighlightIndex(i)}
                            className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer text-xs transition-colors ${
                              highlightIndex === i ? 'bg-brand-soft dark:bg-brand-dark-soft' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-ink dark:text-ink-dark truncate">{p.name}</div>
                              <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono">
                                {p.barcode} • {formatArabicCurrency(p.pricePiasters)}
                              </div>
                            </div>
                            {inQueue ? (
                              <span className="text-micro font-bold text-paid dark:text-paid-bright flex items-center gap-1 shrink-0">
                                <Check className="w-3 h-3" />
                                في القائمة ({inQueue.copies})
                              </span>
                            ) : (
                              <span className="text-micro font-bold text-brand dark:text-brand-bright flex items-center gap-1 shrink-0">
                                <Plus className="w-3 h-3" />
                                إضافة
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Queue */}
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-xs flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-line dark:border-line-dark">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark whitespace-nowrap">الأصناف المطلوب طباعتها</span>
                  <span className="px-2 py-0.5 bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-micro font-bold rounded-full whitespace-nowrap">
                    {queue.length} صنف • {totalLabelsCount} ملصق
                  </span>
                </div>
                {queue.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted whitespace-nowrap ml-1">عدد النسخ:</span>
                    <button
                      type="button"
                      onClick={fillCopiesFromStock}
                      title="عدد نسخ كل صنف = رصيده في المخزن"
                      className="px-2 py-1 hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark rounded-md text-micro font-bold text-ink dark:text-ink-dark flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <Layers className="w-3 h-3 text-brand dark:text-brand-bright shrink-0" />
                      حسب الرصيد
                    </button>
                    <button
                      type="button"
                      onClick={resetCopiesToOne}
                      title="نسخة واحدة لكل صنف"
                      className="px-2 py-1 hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark rounded-md text-micro font-bold text-ink dark:text-ink-dark whitespace-nowrap transition-colors cursor-pointer"
                    >
                      1 لكل صنف
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQueue([]);
                        setPreviewIndex(0);
                      }}
                      title="تفريغ القائمة"
                      className="p-1 rounded-md text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="h-[340px] overflow-y-auto divide-y divide-line/60 dark:divide-line-dark">
                {queue.length === 0 ? (
                  <div className="h-full p-6 text-center text-xs text-ink-muted dark:text-ink-dark-muted flex flex-col items-center justify-center gap-2">
                    <Tag className="w-8 h-8 text-ink-muted/40 dark:text-ink-dark-muted" />
                    <span className="font-bold text-ink dark:text-ink-dark">القائمة فارغة</span>
                    <span>ابحث عن صنف بالأعلى أو امسح الباركود الخاص به لإضافته</span>
                  </div>
                ) : (
                  queue.map((item, idx) => (
                    <div
                      key={`${item.productId}_${idx}`}
                      onClick={() => setPreviewIndex(idx)}
                      className={`px-3 py-2 flex items-center gap-3 text-xs cursor-pointer transition-colors border-r-4 ${
                        previewIndex === idx
                          ? 'bg-brand-soft/40 dark:bg-brand-dark-soft/40 border-brand dark:border-brand-bright'
                          : 'border-transparent hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-ink dark:text-ink-dark truncate" title={item.productName}>
                          {item.productName}
                          {item.variantInfo && (
                            <span className="mr-1.5 text-micro bg-surface-2 dark:bg-surface-dark-2 px-1 rounded text-ink-muted dark:text-ink-dark-muted">
                              {item.variantInfo}
                            </span>
                          )}
                        </div>
                        <div className="text-micro text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                          <span className="font-mono">{item.barcode}</span>
                          <span>•</span>
                          <span className="font-bold text-paid dark:text-paid-bright">{formatArabicCurrency(item.pricePiasters)}</span>
                          {item.stockQuantityMilli !== undefined && (
                            <>
                              <span>•</span>
                              <span>الرصيد: {Math.floor(item.stockQuantityMilli / 1000)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Copies Controls */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateCopies(idx, item.copies - 1)}
                          className="w-6 h-6 rounded-md bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-line-dark flex items-center justify-center text-ink dark:text-ink-dark cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={item.copies}
                          onChange={(e) => updateCopies(idx, parseInt(e.target.value, 10) || 1)}
                          className="w-12 h-6 text-center text-xs font-bold bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-md text-ink dark:text-ink-dark font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => updateCopies(idx, item.copies + 1)}
                          className="w-6 h-6 rounded-md bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-line-dark flex items-center justify-center text-ink dark:text-ink-dark cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProductFromQueue(idx)}
                          title="حذف من القائمة"
                          className="w-6 h-6 mr-1 rounded-md hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Preview + Compact Settings */}
          <div className="lg:col-span-5 flex flex-col gap-3 min-w-0">

            {/* Live Preview */}
            <div className="bg-surface dark:bg-surface-dark p-3 rounded-xl border border-line dark:border-line-dark shadow-xs flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span className="text-xs font-bold text-ink dark:text-ink-dark">معاينة الملصق</span>
                  <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                    ({selectedPaper.widthMm}×{selectedPaper.heightMm} مم)
                  </span>
                </div>
                {queue.length > 1 && (
                  <div className="flex items-center gap-1 text-micro text-ink-muted dark:text-ink-dark-muted font-bold">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                      disabled={previewIndex === 0}
                      className="p-1 rounded hover:bg-surface-2 dark:hover:bg-surface-dark-2 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono">{previewIndex + 1} / {queue.length}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((p) => Math.min(queue.length - 1, p + 1))}
                      disabled={previewIndex === queue.length - 1}
                      className="p-1 rounded hover:bg-surface-2 dark:hover:bg-surface-dark-2 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="h-[200px] bg-surface-2/60 dark:bg-surface-dark-2/60 rounded-lg flex items-center justify-center border border-dashed border-line dark:border-line-dark">
                {currentPreviewItem ? (
                  <div
                    style={{
                      width: `${previewDimensions.width}px`,
                      height: `${previewDimensions.height}px`,
                    }}
                    className={`bg-white dark:bg-surface-dark rounded-md border border-line-hover dark:border-line-dark-hover shadow-sm flex flex-col items-center justify-center text-center overflow-hidden select-none shrink-0 ${
                      isSmallLabel ? 'px-2 py-1 gap-1' : (isMediumLabel ? 'px-2.5 py-1.5 gap-1.5' : 'p-3 gap-2')
                    }`}
                  >
                    {config.showStoreName && config.storeName && (
                      <div className="w-full shrink-0 border-b border-line/50 dark:border-line-dark/50 pb-0.5">
                        <span className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted truncate leading-tight">
                          {config.storeName}
                        </span>
                      </div>
                    )}

                    <div
                      className={`w-full shrink-0 px-1 font-bold text-ink dark:text-ink-dark leading-tight line-clamp-1 ${
                        isSmallLabel || isMediumLabel ? 'text-micro' : 'text-xs'
                      }`}
                      title={currentPreviewItem.productName}
                    >
                      {currentPreviewItem.productName}
                    </div>

                    {(currentPreviewItem.variantInfo || config.showPrice) && (
                      <div
                        className={`w-full flex items-center shrink-0 px-1 gap-1.5 ${
                          currentPreviewItem.variantInfo && config.showPrice ? 'justify-between' : 'justify-center'
                        }`}
                      >
                        {currentPreviewItem.variantInfo && (
                          <span className="text-micro font-bold text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-dark-soft px-1 py-0.5 rounded truncate max-w-[50%] leading-none">
                            {currentPreviewItem.variantInfo}
                          </span>
                        )}
                        {config.showPrice && (
                          <span className={`font-black text-ink dark:text-ink-dark font-mono shrink-0 leading-none ${isSmallLabel ? 'text-xs' : 'text-sm'}`}>
                            {formatArabicCurrency(currentPreviewItem.pricePiasters)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="w-full flex items-center justify-center overflow-hidden shrink-0">
                      <BarcodeSvgPreview
                        barcode={currentPreviewItem.barcode}
                        showText={config.showBarcodeText}
                        height={isSmallLabel ? 22 : (isMediumLabel ? 28 : 36)}
                        fontSize={isSmallLabel ? 9 : 10}
                      />
                    </div>

                    {config.showExpiryDate && (
                      <div className="w-full shrink-0 text-micro font-mono text-ink-muted dark:text-ink-dark-muted leading-none">
                        صلاحية: {currentPreviewItem.expiryDate || DEFAULT_EXPIRY_FALLBACK}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-xs text-ink-muted dark:text-ink-dark-muted flex flex-col items-center gap-2">
                    <Tag className="w-6 h-6 text-ink-muted/40 dark:text-ink-dark-muted" />
                    <span>أضف صنفاً لمعاينة شكل الملصق</span>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Settings */}
            <div className="bg-surface dark:bg-surface-dark p-3 rounded-xl border border-line dark:border-line-dark shadow-xs flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span className="text-xs font-bold text-ink dark:text-ink-dark">الإعدادات</span>
                <span className="text-micro text-ink-muted dark:text-ink-dark-muted">(تُحفظ تلقائياً)</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1">مقاس الورق</label>
                  <CustomSelect
                    value={config.paperSize}
                    onChange={(val) => updateConfig((prev) => ({ ...prev, paperSize: val }))}
                    options={PAPER_SIZES.map((s) => ({ value: s.value, label: s.label }))}
                    size="sm"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1">الطابعة</label>
                  <CustomSelect
                    value={config.printerName || ''}
                    onChange={(val) => updateConfig((prev) => ({ ...prev, printerName: val }))}
                    options={[
                      { value: '', label: 'الطابعة الافتراضية' },
                      ...installedPrinters.map((p) => ({
                        value: p.name,
                        label: `${p.name}${p.isDefault ? ' (الافتراضية)' : ''}`,
                      })),
                    ]}
                    size="sm"
                  />
                </div>
              </div>

              {config.paperSize === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-micro text-ink-muted dark:text-ink-dark-muted mb-0.5">العرض (مم)</label>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={config.customWidthMm || 50}
                      onChange={(e) => {
                        const val = Math.max(10, Math.min(200, parseInt(e.target.value, 10) || 10));
                        updateConfig((prev) => ({ ...prev, customWidthMm: val }));
                      }}
                      className="w-full px-2 py-1 text-xs bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-md font-mono text-center text-ink dark:text-ink-dark"
                    />
                  </div>
                  <div>
                    <label className="block text-micro text-ink-muted dark:text-ink-dark-muted mb-0.5">الارتفاع (مم)</label>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={config.customHeightMm || 30}
                      onChange={(e) => {
                        const val = Math.max(10, Math.min(200, parseInt(e.target.value, 10) || 10));
                        updateConfig((prev) => ({ ...prev, customHeightMm: val }));
                      }}
                      className="w-full px-2 py-1 text-xs bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-md font-mono text-center text-ink dark:text-ink-dark"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1.5">يظهر على الملصق</label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TOGGLES.map((t) => {
                    const on = Boolean(config[t.key]);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => updateConfig((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
                        className={`px-2.5 py-1 rounded-lg border text-micro font-bold flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                          on
                            ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand/30 dark:border-brand-bright/40 text-brand dark:text-brand-bright'
                            : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                        }`}
                      >
                        {on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleTestLabelPrint}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            ملصق تجريبي
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-bold text-ink dark:text-ink-dark transition-colors cursor-pointer"
            >
              إغلاق
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              disabled={queue.length === 0}
              className="px-4 py-2 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5 transition-colors disabled:opacity-50 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
              ورق A4
            </button>

            <button
              type="button"
              onClick={handlePrintLabels}
              disabled={loading || queue.length === 0}
              className="px-6 py-2.5 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{loading ? 'جاري الطباعة...' : `طباعة ${totalLabelsCount} ملصق`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
