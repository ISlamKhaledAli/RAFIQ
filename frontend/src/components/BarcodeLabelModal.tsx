import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { ToggleSwitch } from './ToggleSwitch';

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProduct?: Product | null;
}

interface LabelQueueItem extends BarcodeLabelItem {
  stockQuantityMilli?: number;
  categoryName?: string;
}

const PAPER_SIZES = [
  { value: '38x25', label: '38×25 مم (بكرة رول قياسية صغيرة - محلات التجزئة والملابس واللعب)', widthMm: 38, heightMm: 25 },
  { value: '40x30', label: '40×30 مم (بكرة رول متوسطة)', widthMm: 40, heightMm: 30 },
  { value: '50x25', label: '50×25 مم (بكرة رول عريضة مدمجة)', widthMm: 50, heightMm: 25 },
  { value: '50x30', label: '50×30 مم (بكرة رول عريضة قياسية)', widthMm: 50, heightMm: 30 },
  { value: '50x40', label: '50×40 مم (ملصق رف وتخزين كبير)', widthMm: 50, heightMm: 40 },
  { value: 'a4_24', label: 'ورق A4 ملصقات (24 ملصق: 3 أعمدة × 8 صفوف - 70×37 مم)', widthMm: 70, heightMm: 37 },
  { value: 'a4_40', label: 'ورق A4 ملصقات (40 ملصق: 4 أعمدة × 10 صفوف - 52×30 مم)', widthMm: 52, heightMm: 30 },
];

const DEFAULT_EXPIRY_FALLBACK = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];

/**
 * مكوّن رسم الباركود الدقيق كـ SVG باستخدام خوارزمية Code 128
 */
const BarcodeSvgPreview: React.FC<{ 
  barcode: string; 
  showText: boolean; 
  height?: number; 
  widthFactor?: number 
}> = ({ barcode, showText, height = 36, widthFactor = 1.4 }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, barcode, {
        format: 'CODE128',
        lineColor: '#000000',
        width: widthFactor,
        height,
        displayValue: showText,
        fontSize: 10,
        font: 'Courier New',
        fontOptions: 'bold',
        textMargin: 2,
        margin: 1,
        background: 'transparent',
      });
    } catch {
      // Ignored for non-renderable characters
    }
  }, [barcode, showText, height, widthFactor]);

  if (!barcode) {
    return <div className="text-xs text-ink-muted italic py-2">لا يوجد باركود</div>;
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
}) => {
  const [queue, setQueue] = useState<LabelQueueItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [installedPrinters, setInstalledPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);

  // Settings & Toggles
  const [config, setConfig] = useState<BarcodeLabelConfig>({
    paperSize: '38x25',
    showStoreName: true,
    storeName: 'متجر رفيق',
    showPrice: true,
    showBarcodeText: true,
    showExpiryDate: false,
    printerName: '',
  });

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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

        setConfig((prev) => ({
          ...prev,
          storeName,
          printerName: defaultLabelPrinter,
          paperSize: defaultPaperSize,
        }));
      } catch (err) {
        console.error('Failed to load initial label modal data:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Handle preselected product
  useEffect(() => {
    if (!isOpen) return;

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
      setStatusMessage({
        text: `تنبيه: الصنف "${preselectedProduct.name}" ليس له رقم باركود مسجل!`,
        type: 'error',
      });
    }
  }, [isOpen, preselectedProduct]);

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
      text: 'تم ضبط أعداد النسخ بحسب رصيد كل صنف في المخزن بنجاح.',
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
    return PAPER_SIZES.find((p) => p.value === config.paperSize) || PAPER_SIZES[0];
  }, [config.paperSize]);

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
          text: `تمت طباعة ${result.totalLabelsPrinted} ملصق بنجاح على طابعة: ${result.printerUsed}`,
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
      });
      if (res && res.success) {
        setStatusMessage({
          text: `تم إرسال الملصق التجريبي بنجاح إلى: ${res.printerUsed}`,
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
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-brand text-white px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Tag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold m-0 leading-tight">طباعة ملصقات الباركود والأسعار (فيتشر #57)</h2>
              <p className="text-xs text-brand-soft/80 m-0">توليد وطباعة باركود المنتجات على طابعات الباركود الحرارية وورق A4</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/15 rounded-lg text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center gap-2 border-b ${
              statusMessage.type === 'success'
                ? 'bg-paid-soft text-paid border-paid/20'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {statusMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Body: 3-column / 2-column Layout */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-canvas">
          
          {/* Column 1: Product Selection & Queue (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            
            {/* Search and Category Filter */}
            <div className="bg-surface p-4 rounded-xl border border-line shadow-xs flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink">اختيار الأصناف المراد طباعتها</span>
                <span className="text-[11px] text-ink-muted">{allProducts.length} صنف متاح</span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-ink-muted absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو امسح الباركود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 text-xs bg-canvas border border-line rounded-lg focus:outline-none focus:border-brand text-ink"
                />
              </div>

              <CustomSelect
                value={selectedCategoryId}
                onChange={(val) => setSelectedCategoryId(val)}
                options={[
                  { value: '', label: 'كافة الأقسام والتصنيفات' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                placeholder="تصفية حسب القسم..."
                size="sm"
              />

              {/* Fast Result Add List */}
              <div className="max-h-40 overflow-y-auto divide-y divide-line/60 border border-line/60 rounded-lg bg-surface">
                {filteredProducts.length === 0 ? (
                  <div className="p-3 text-center text-xs text-ink-muted">لا توجد أصناف مطابقة أو لا تملك باركوداً</div>
                ) : (
                  filteredProducts.slice(0, 15).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => addProductToQueue(p)}
                      className="p-2 flex items-center justify-between hover:bg-surface-2 cursor-pointer transition-colors text-xs"
                    >
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="font-semibold text-ink truncate">{p.name}</div>
                        <div className="text-[10px] text-ink-muted font-mono">{p.barcode} • {formatArabicCurrency(p.pricePiasters)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addProductToQueue(p);
                        }}
                        className="px-2 py-1 bg-brand-soft text-brand rounded text-[11px] font-bold flex items-center gap-1 hover:bg-brand hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        إضافة
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Selected Queue List */}
            <div className="bg-surface p-4 rounded-xl border border-line shadow-xs flex-1 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink">قائمة الملصقات المطلوبة</span>
                  <span className="px-2 py-0.5 bg-brand/10 text-brand text-[11px] font-bold rounded-full">
                    {queue.length} أصناف ({totalLabelsCount} ملصق)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={fillCopiesFromStock}
                    title="تعبئة عدد النسخ برصيد المخزن الحالي لكل صنف"
                    className="px-2 py-1 bg-surface-2 hover:bg-line border border-line rounded text-[10px] font-bold text-ink flex items-center gap-1"
                  >
                    <Layers className="w-3 h-3 text-brand" />
                    رصيد المخزن
                  </button>
                  <button
                    onClick={resetCopiesToOne}
                    title="تصفير كل النسخ إلى 1"
                    className="px-2 py-1 bg-surface-2 hover:bg-line border border-line rounded text-[10px] text-ink-muted"
                  >
                    1 لكل صنف
                  </button>
                </div>
              </div>

              <div className="flex-1 max-h-56 overflow-y-auto divide-y divide-line/60 border border-line/60 rounded-lg">
                {queue.length === 0 ? (
                  <div className="p-6 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-2">
                    <Tag className="w-8 h-8 text-ink-muted/40" />
                    <span>القائمة فارغة، اختر أصنافاً من الأعلى لإضافتها</span>
                  </div>
                ) : (
                  queue.map((item, idx) => (
                    <div
                      key={`${item.productId}_${idx}`}
                      onClick={() => setPreviewIndex(idx)}
                      className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                        previewIndex === idx ? 'bg-brand-soft/30 border-r-4 border-brand' : 'hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-semibold text-ink truncate flex items-center gap-1.5">
                          <span>{item.productName}</span>
                          {item.variantInfo && (
                            <span className="text-[10px] bg-line px-1 rounded text-ink-muted">
                              {item.variantInfo}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-ink-muted flex items-center gap-2 mt-0.5 font-mono">
                          <span>{item.barcode}</span>
                          <span>•</span>
                          <span className="font-bold text-paid">{formatArabicCurrency(item.pricePiasters)}</span>
                          {item.stockQuantityMilli !== undefined && (
                            <span>• متاح: {Math.floor(item.stockQuantityMilli / 1000)}</span>
                          )}
                        </div>
                      </div>

                      {/* Copies Controls */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => updateCopies(idx, item.copies - 1)}
                          className="w-6 h-6 rounded bg-surface-2 hover:bg-line flex items-center justify-center text-ink"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={item.copies}
                          onChange={(e) => updateCopies(idx, parseInt(e.target.value, 10) || 1)}
                          className="w-12 py-0.5 text-center text-xs font-bold bg-canvas border border-line rounded text-ink font-mono"
                        />
                        <button
                          onClick={() => updateCopies(idx, item.copies + 1)}
                          className="w-6 h-6 rounded bg-surface-2 hover:bg-line flex items-center justify-center text-ink"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeProductFromQueue(idx)}
                          className="w-6 h-6 rounded hover:bg-red-50 text-ink-muted hover:text-red-600 flex items-center justify-center mr-1"
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

          {/* Column 2: Live Visual Label Preview (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface p-4 rounded-xl border border-line shadow-xs flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-brand" />
                  <span className="text-xs font-bold text-ink">معاينة الملصق الحية</span>
                </div>
                {queue.length > 1 && (
                  <div className="flex items-center gap-1 text-[11px] text-ink-muted font-bold">
                    <button
                      onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                      disabled={previewIndex === 0}
                      className="p-1 rounded hover:bg-surface-2 disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <span>{previewIndex + 1} / {queue.length}</span>
                    <button
                      onClick={() => setPreviewIndex((p) => Math.min(queue.length - 1, p + 1))}
                      disabled={previewIndex === queue.length - 1}
                      className="p-1 rounded hover:bg-surface-2 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Physical Label Visual Frame */}
              <div className="flex-1 bg-surface-2/60 rounded-xl p-4 flex items-center justify-center border border-dashed border-line">
                {currentPreviewItem ? (
                  <div
                    style={{
                      aspectRatio: `${selectedPaper.widthMm} / ${selectedPaper.heightMm}`,
                      maxWidth: '280px',
                      width: '100%',
                    }}
                    className="bg-white rounded-md border-2 border-line/80 shadow-md p-3 flex flex-col justify-between items-center text-center relative overflow-hidden transition-all duration-200 select-none"
                  >
                    {/* Store Header */}
                    {config.showStoreName && config.storeName && (
                      <div className="text-[10px] font-bold text-ink truncate w-full border-b border-line/40 pb-0.5 leading-tight">
                        {config.storeName}
                      </div>
                    )}

                    {/* Product Name & Variant */}
                    <div className="my-auto w-full py-1">
                      <div className="text-xs font-bold text-ink leading-snug line-clamp-2">
                        {currentPreviewItem.productName}
                      </div>
                      {currentPreviewItem.variantInfo && (
                        <div className="text-[9px] font-bold text-brand bg-brand-soft/60 px-1 py-0.5 rounded mt-0.5 inline-block">
                          {currentPreviewItem.variantInfo}
                        </div>
                      )}
                    </div>

                    {/* Big Price Tag */}
                    {config.showPrice && (
                      <div className="text-sm font-extrabold text-ink font-mono my-0.5 leading-tight">
                        {formatArabicCurrency(currentPreviewItem.pricePiasters)}
                      </div>
                    )}

                    {/* Barcode Visual Element */}
                    <div className="w-full my-auto">
                      <BarcodeSvgPreview
                        barcode={currentPreviewItem.barcode}
                        showText={config.showBarcodeText}
                        height={selectedPaper.heightMm <= 25 ? 26 : 34}
                      />
                    </div>

                    {/* Expiry Date */}
                    {config.showExpiryDate && (
                      <div className="text-[8px] text-ink-muted mt-0.5 font-mono">
                        صلاحية: {currentPreviewItem.expiryDate || DEFAULT_EXPIRY_FALLBACK}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-xs text-ink-muted">
                    اختر صنفاً لمعاينة شكل الملصق النهائي
                  </div>
                )}
              </div>

              {/* Dimensions specs label */}
              <div className="mt-3 text-center text-[11px] text-ink-muted flex items-center justify-center gap-2">
                <span>أبعاد المعاينة: {selectedPaper.widthMm} × {selectedPaper.heightMm} مم</span>
                <span>•</span>
                <span className="font-semibold text-brand">{selectedPaper.label.split('(')[0]}</span>
              </div>
            </div>
          </div>

          {/* Column 3: Format & Customization Options (3 Cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            
            {/* Paper Size & Printer Settings */}
            <div className="bg-surface p-4 rounded-xl border border-line shadow-xs flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-brand" />
                <span className="text-xs font-bold text-ink">إعدادات مقاس الورق والطابعة</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-muted mb-1">مقاس ورق الملصقات</label>
                <CustomSelect
                  value={config.paperSize}
                  onChange={(val) => setConfig((prev) => ({ ...prev, paperSize: val }))}
                  options={PAPER_SIZES.map((s) => ({ value: s.value, label: s.label }))}
                  size="sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-muted mb-1">طابعة الملصقات المستهدفة</label>
                <CustomSelect
                  value={config.printerName || ''}
                  onChange={(val) => setConfig((prev) => ({ ...prev, printerName: val }))}
                  options={[
                    { value: '', label: 'الطابعة الافتراضية للنظام' },
                    ...installedPrinters.map((p) => ({
                      value: p.name,
                      label: `${p.name} ${p.isDefault ? '(الافتراضية)' : ''}`,
                    })),
                  ]}
                  size="sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-muted mb-1">اسم المحل على الملصق</label>
                <input
                  type="text"
                  value={config.storeName || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, storeName: e.target.value }))}
                  placeholder="اسم المتجر / المحل"
                  className="w-full px-3 py-1.5 text-xs bg-canvas border border-line rounded-lg text-ink"
                />
              </div>
            </div>

            {/* Content Toggles */}
            <div className="bg-surface p-4 rounded-xl border border-line shadow-xs flex flex-col gap-3">
              <span className="text-xs font-bold text-ink">عناصر ومحتويات الملصق</span>

              <ToggleSwitch
                checked={config.showStoreName}
                onChange={(checked) => setConfig((p) => ({ ...p, showStoreName: checked }))}
                label="إظهار اسم المحل (الترويسة)"
                size="sm"
              />

              <ToggleSwitch
                checked={config.showPrice}
                onChange={(checked) => setConfig((p) => ({ ...p, showPrice: checked }))}
                label="إظهار سعر البيع بالجنيه"
                size="sm"
              />

              <ToggleSwitch
                checked={config.showBarcodeText}
                onChange={(checked) => setConfig((p) => ({ ...p, showBarcodeText: checked }))}
                label="إظهار أرقام الباركود أسفل الأعمدة"
                size="sm"
              />

              <ToggleSwitch
                checked={config.showExpiryDate}
                onChange={(checked) => setConfig((p) => ({ ...p, showExpiryDate: checked }))}
                label="إظهار تاريخ الصلاحية / التعبئة"
                size="sm"
              />
            </div>

            {/* Quick Test Button */}
            <button
              onClick={handleTestLabelPrint}
              disabled={loading}
              className="py-2 px-3 bg-surface hover:bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              طباعة ملصق تجريبي للفحص
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface border-t border-line flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">
              إجمالي الملصقات: <strong className="text-ink font-bold font-mono text-sm">{totalLabelsCount}</strong> ملصق
            </span>
            <span className="text-xs text-ink-muted">•</span>
            <span className="text-xs text-ink-muted">
              المقاس: <strong className="text-ink font-bold">{selectedPaper.widthMm}×{selectedPaper.heightMm} مم</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface hover:bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink transition-colors"
            >
              إغلاق
            </button>

            {/* Browser / Windows Print Preview Button */}
            <button
              onClick={handleBrowserPrint}
              disabled={queue.length === 0}
              className="px-4 py-2 bg-surface-2 hover:bg-line border border-line rounded-xl text-xs font-bold text-ink flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5 text-ink-muted" />
              طباعة بنافذة ويندوز (A4)
            </button>

            {/* Direct Thermal Label Print Button */}
            <button
              onClick={handlePrintLabels}
              disabled={loading || queue.length === 0}
              className="px-6 py-2.5 bg-paid hover:bg-[#005a36] text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{loading ? 'جاري الطباعة...' : `طباعة الملصقات (${totalLabelsCount})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
