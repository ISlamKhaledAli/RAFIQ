import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  X, 
  Search, 
  AlertCircle, 
  Printer, 
  Check, 
  Lock, 
  ShoppingBag, 
  CreditCard,
  Banknote,
  FileText,
  AlertTriangle
} from 'lucide-react';
import type { Sale, Return, Product } from '../types/models';
import { extractProducts } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { invoke } from '../bridge/ipc';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSale?: Sale | null;
  onReturnCompleted?: (ret: Return) => void;
}

interface ReturnItemDraft {
  saleItemId?: string;
  productId: string;
  productName: string;
  unitPricePiasters: number;
  originalQuantityPieces: number;
  previouslyReturnedPieces: number;
  returnQuantityPieces: number;
  isDamaged: boolean;
  notes?: string;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
  isOpen,
  onClose,
  initialSale,
  onReturnCompleted
}) => {
  const [mode, setMode] = useState<'withInvoice' | 'withoutInvoice'>('withInvoice');
  const [invoiceQuery, setInvoiceQuery] = useState<string>(() => (initialSale?.invoiceNumber ? String(initialSale.invoiceNumber) : ''));
  const [loadedSale, setLoadedSale] = useState<Sale | null>(() => initialSale || null);
  const [searchingSale, setSearchingSale] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  // Return items state
  const [draftItems, setDraftItems] = useState<ReturnItemDraft[]>(() => {
    if (!initialSale || !initialSale.items) return [];
    return initialSale.items.map((item) => ({
      saleItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      unitPricePiasters: item.unitPricePiasters,
      originalQuantityPieces: item.quantityMilli / 1000,
      previouslyReturnedPieces: (item.returnedQuantityMilli || 0) / 1000,
      returnQuantityPieces: 0,
      isDamaged: false
    }));
  });
  const [reason, setReason] = useState<string>('مرتجع من العميل');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit'>(() => (initialSale?.paymentMethod === 'credit' ? 'credit' : 'cash'));
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completedReturn, setCompletedReturn] = useState<Return | null>(null);

  // Without-invoice product search state
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);

  const setupDraftFromSale = async (sale: Sale) => {
    setLoadedSale(sale);
    setInvoiceQuery(sale.invoiceNumber ? String(sale.invoiceNumber) : '');
    setRefundMethod(sale.paymentMethod === 'credit' ? 'credit' : 'cash');
    setSaleError(null);

    let returnedQtyMap: Record<string, number> = {};
    try {
      if (sale.id) {
        const pastReturns = await invoke<Return[]>('returns:getForSale', { saleId: sale.id });
        if (pastReturns && pastReturns.length > 0) {
          pastReturns.forEach((ret) => {
            (ret.items || []).forEach((ritem) => {
              const key = ritem.saleItemId || `${ritem.productId}_${ritem.unit || ''}`;
              returnedQtyMap[key] = (returnedQtyMap[key] || 0) + (ritem.quantityMilli / 1000);
              returnedQtyMap[ritem.productId] = (returnedQtyMap[ritem.productId] || 0) + (ritem.quantityMilli / 1000);
            });
          });
        }
      }
    } catch {
      // ignore
    }

    const drafts: ReturnItemDraft[] = (sale.items || []).map((item) => {
      const key = item.id || `${item.productId}_${item.unit || ''}`;
      const prevReturned = (returnedQtyMap[key] !== undefined)
        ? returnedQtyMap[key]
        : ((returnedQtyMap[item.productId] !== undefined) ? returnedQtyMap[item.productId] : ((item.returnedQuantityMilli || 0) / 1000));
      const effectiveUnitPrice = (item.quantityMilli > 0 && item.totalPiasters > 0)
        ? Math.round((item.totalPiasters * 1000) / item.quantityMilli)
        : item.unitPricePiasters;

      return {
        saleItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        unitPricePiasters: effectiveUnitPrice,
        originalQuantityPieces: item.quantityMilli / 1000,
        previouslyReturnedPieces: prevReturned,
        returnQuantityPieces: 0,
        isDamaged: false
      };
    });
    setDraftItems(drafts);
  };

  const fetchAndSetupSale = async (sale: Sale) => {
    setSearchingSale(true);
    setSaleError(null);
    try {
      const fullSale = sale.invoiceNumber 
        ? await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: sale.invoiceNumber })
        : (sale.id ? await invoke<Sale>('sales:getById', { id: sale.id }) : null);
      if (fullSale && fullSale.id && fullSale.items && fullSale.items.length > 0) {
        await setupDraftFromSale(fullSale);
      } else {
        await setupDraftFromSale(sale);
      }
    } catch {
      await setupDraftFromSale(sale);
    } finally {
      setSearchingSale(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialSale) {
        setMode('withInvoice');
        setInvoiceQuery(initialSale.invoiceNumber ? String(initialSale.invoiceNumber) : '');
        setCompletedReturn(null);
        setSubmitError(null);
        setSaleError(null);

        if (initialSale.items && initialSale.items.length > 0) {
          void setupDraftFromSale(initialSale);
        } else {
          void fetchAndSetupSale(initialSale);
        }
      } else {
        setMode('withInvoice');
        setInvoiceQuery('');
        setLoadedSale(null);
        setDraftItems([]);
        setCompletedReturn(null);
        setSubmitError(null);
        setSaleError(null);
      }
    }
  }, [isOpen, initialSale]);

  if (!isOpen) return null;

  const handleSearchInvoice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = invoiceQuery.trim().replace(/^#/, '');
    if (!query) return;

    setSearchingSale(true);
    setSaleError(null);
    try {
      const num = parseInt(query, 10);
      let sale: Sale | null = null;
      if (!isNaN(num) && num > 0) {
        sale = await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: num });
      }
      if (!sale) {
        const found = await invoke<Sale[]>('sales:search', { query, limit: 1 });
        if (found && found.length > 0) sale = found[0];
      }

      if (sale && sale.id) {
        if (sale.status === 'cancelled') {
          setSaleError('هذه الفاتورة ملغاة بالفعل، ولا يمكن عمل مرتجع لها.');
          return;
        }
        void setupDraftFromSale(sale);
      } else {
        setSaleError(`لم يتم العثور على أي فاتورة برقم "${query}"`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر البحث عن الفاتورة';
      setSaleError(msg);
    } finally {
      setSearchingSale(false);
    }
  };

  // Live product search for without-invoice mode
  const handleSearchCatalog = async (query: string) => {
    setCatalogQuery(query);
    if (!query.trim()) {
      setCatalogResults([]);
      return;
    }
    setSearchingCatalog(true);
    try {
      const res = await invoke<unknown>('products:search', { query: query.trim(), limit: 8 });
      setCatalogResults(extractProducts(res));
    } catch {
      setCatalogResults([]);
    } finally {
      setSearchingCatalog(false);
    }
  };

  const addCatalogProductToDraft = (p: Product) => {
    setDraftItems((prev) => {
      const exists = prev.find((d) => d.productId === p.id);
      if (exists) return prev;
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          unitPricePiasters: p.pricePiasters,
          originalQuantityPieces: 9999,
          previouslyReturnedPieces: 0,
          returnQuantityPieces: 1,
          isDamaged: false
        }
      ];
    });
    setCatalogQuery('');
    setCatalogResults([]);
  };

  const updateItemQty = (index: number, qty: number) => {
    setDraftItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const maxAllowed = item.originalQuantityPieces - item.previouslyReturnedPieces;
      const safeQty = Math.max(0, Math.min(qty, maxAllowed));
      updated[index] = { ...item, returnQuantityPieces: safeQty };
      return updated;
    });
  };

  const toggleItemDamaged = (index: number) => {
    setDraftItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      updated[index] = { ...item, isDamaged: !item.isDamaged };
      return updated;
    });
  };

  const activeReturnItems = draftItems.filter((d) => d.returnQuantityPieces > 0);
  const totalRefundPiasters = activeReturnItems.reduce(
    (sum, item) => sum + item.unitPricePiasters * item.returnQuantityPieces,
    0
  );

  const handleSubmitReturn = async () => {
    if (activeReturnItems.length === 0) {
      setSubmitError('يرجى تحديد كمية صنف واحد على الأقل للمرتجع');
      return;
    }

    if (mode === 'withoutInvoice' && !supervisorPin.trim()) {
      setSubmitError('المرتجع بدون فاتورة يتطلب إدخال الرقم السري للمشرف');
      return;
    }

    setLoading(true);
    setSubmitError(null);
    try {
      const payload = {
        saleId: loadedSale?.id || undefined,
        reason: reason.trim() || 'مرتجع أصناف',
        refundMethod,
        supervisorPin: supervisorPin.trim() || undefined,
        items: activeReturnItems.map((item) => ({
          saleItemId: item.saleItemId,
          productId: item.productId,
          productName: item.productName,
          quantityMilli: Math.round(item.returnQuantityPieces * 1000),
          unitPricePiasters: item.unitPricePiasters,
          totalPiasters: Math.round(item.unitPricePiasters * item.returnQuantityPieces),
          isDamaged: item.isDamaged,
          notes: item.isDamaged ? 'صنف تالف' : undefined
        }))
      };

      const result = await invoke<Return>('returns:create', payload);
      if (result && result.id) {
        setCompletedReturn(result);
        if (onReturnCompleted) onReturnCompleted(result);
        // Automatically attempt receipt print
        try {
          await invoke('returns:printReceipt', { returnId: result.id });
        } catch {
          // print failure non-fatal
        }
      } else {
        throw new Error('تعذر حفظ المرتجع في قاعدة البيانات');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ المرتجع';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!completedReturn) return;
    try {
      await invoke('returns:printReceipt', { returnId: completedReturn.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال أمر الطباعة';
      setSubmitError(msg);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[700px] bg-white rounded-xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-amber-600"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-[52px] px-4 border-b border-amber-200 flex items-center justify-between bg-amber-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-700" />
            <h2 className="text-[17px] font-bold text-amber-900 m-0">مرتجع بضاعة واسترجاع فلوس</h2>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {completedReturn ? (
            /* Success State */
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">تم تسجيل المرتجع ورجعت البضاعة بنجاح</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  إيصال مرتجع رقم: <strong className="text-slate-800 font-bold">#{completedReturn.returnNumber}</strong>
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-sm mx-auto space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>إجمالي الفلوس اللي خرجت للزبون:</span>
                  <strong className="font-bold text-amber-700 font-mono text-sm">
                    {formatArabicCurrency(completedReturn.totalPiasters)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>الفلوس خرجت إزاي:</span>
                  <span className="font-bold text-slate-800">
                    {completedReturn.refundMethod === 'credit' ? 'اتخصمت من حسابه الشكك' : 'كاش طلع من الدرج'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>عدد الأصناف اللي رجعت:</span>
                  <span className="font-mono text-slate-800">{completedReturn.items?.length || 0} صنف</span>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="h-10 px-4 bg-[#0B4F42] hover:bg-[#0F6A57] text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-colors shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة وصل المرتجع</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-5 border border-slate-300 bg-white hover:bg-slate-50 font-bold text-xs text-slate-700 rounded-lg transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : (
            /* Return Form */
            <>
              {/* Mode Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode('withInvoice')}
                  className={`h-8 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'withInvoice' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  <span>مرتجع برقم الفاتورة (الأفضل)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('withoutInvoice')}
                  className={`h-8 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'withoutInvoice' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>مرتجع حر بدون فاتورة (مشرف)</span>
                </button>
              </div>

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {mode === 'withInvoice' ? (
                /* Search Invoice Header */
                <div className="space-y-2">
                  <form onSubmit={handleSearchInvoice} className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="اكتب رقم الفاتورة هنا..."
                        value={invoiceQuery}
                        onChange={(e) => setInvoiceQuery(e.target.value)}
                        className="w-full h-10 px-3 pr-9 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                    <button
                      type="submit"
                      disabled={searchingSale || !invoiceQuery.trim()}
                      className="h-10 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>{searchingSale ? 'بندور عليها...' : 'هات الفاتورة'}</span>
                    </button>
                  </form>

                  {saleError && (
                    <div className="text-xs text-rose-600 font-bold bg-rose-50 p-2 rounded border border-rose-200">
                      {saleError}
                    </div>
                  )}

                  {loadedSale && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">فاتورة رقم #{loadedSale.invoiceNumber}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 font-mono">{formatArabicCurrency(loadedSale.totalPiasters)}</span>
                        {loadedSale.customerName && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span className="text-[#0B4F42] font-semibold">{loadedSale.customerName}</span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {loadedSale.createdAt ? new Date(loadedSale.createdAt).toLocaleDateString('ar-EG-u-nu-latn') : ''}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Without Invoice Product Search */
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="اكتب اسم الصنف أو اضرب الباركود عشان تضيفه للمرتجع..."
                      value={catalogQuery}
                      onChange={(e) => void handleSearchCatalog(e.target.value)}
                      className="w-full h-10 px-3 pr-9 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>

                  {searchingCatalog && (
                    <div className="text-[11px] text-slate-400">بندور في بضاعة المحل...</div>
                  )}

                  {catalogResults.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
                      {catalogResults.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => addCatalogProductToDraft(p)}
                          className="px-3 py-2 flex items-center justify-between text-xs hover:bg-amber-50 cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-slate-800">{p.name}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">{p.barcode}</span>
                          </div>
                          <span className="font-bold font-mono text-amber-700">{formatArabicCurrency(p.pricePiasters)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Items List */}
              {draftItems.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="h-8 bg-[#F7F8F6] border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                        <th className="px-3">اسم الصنف</th>
                        <th className="px-2 text-center">سعر البيع</th>
                        <th className="px-2 text-center">العدد في الفاتورة</th>
                        <th className="px-2 text-center w-28">العدد اللي هيرجعه</th>
                        <th className="px-2 text-center">حالة البضاعة</th>
                        <th className="px-3 text-left">فلوس المرتجع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {draftItems.map((item, idx) => {
                        const maxReturnable = item.originalQuantityPieces - item.previouslyReturnedPieces;
                        const lineTotal = item.unitPricePiasters * item.returnQuantityPieces;

                        return (
                          <tr key={idx} className={`h-11 ${item.returnQuantityPieces > 0 ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-3 font-semibold text-slate-800">
                              <span className="truncate block max-w-[150px]">{item.productName}</span>
                            </td>
                            <td className="px-2 text-center font-mono text-slate-600">
                              {formatArabicCurrency(item.unitPricePiasters)}
                            </td>
                            <td className="px-2 text-center font-mono text-slate-500">
                              {mode === 'withInvoice' ? (
                                <span>{item.originalQuantityPieces} {item.previouslyReturnedPieces > 0 && `(-${item.previouslyReturnedPieces})`}</span>
                              ) : (
                                <span>---</span>
                              )}
                            </td>
                            <td className="px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, item.returnQuantityPieces - 1)}
                                  className="w-6 h-6 rounded bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={maxReturnable}
                                  value={item.returnQuantityPieces}
                                  onChange={(e) => updateItemQty(idx, parseFloat(e.target.value) || 0)}
                                  className="w-12 h-6 text-center font-mono font-bold text-xs bg-white border border-slate-300 rounded focus:border-amber-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, item.returnQuantityPieces + 1)}
                                  className="w-6 h-6 rounded bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="px-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleItemDamaged(idx)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors inline-flex items-center gap-1 ${
                                  item.isDamaged
                                    ? 'bg-[#FDF3F2] text-[#B23A2E] border-[#F6CBC6]'
                                    : 'bg-[#EAF5EE] text-[#006D41] border-[#C4E3D0]'
                                }`}
                                title={item.isDamaged ? 'بضاعة تالفة: مش هتدخل المخزن' : 'بضاعة سليمة: هترجع رصيد في المخزن'}
                              >
                                {item.isDamaged ? (
                                  <>
                                    <AlertTriangle className="w-3 h-3 text-[#B23A2E] shrink-0" />
                                    <span>بايظ / تالف</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 text-[#006D41] shrink-0" />
                                    <span>سليم</span>
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="px-3 text-left font-mono font-bold text-amber-700">
                              {formatArabicCurrency(lineTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                  <ShoppingBag className="w-8 h-8 mx-auto mb-1 stroke-[1.5] text-slate-300" />
                  <p className="text-xs font-semibold">
                    {mode === 'withInvoice' ? 'اكتب رقم الفاتورة واضغط "هات الفاتورة" عشان تختار البضاعة اللي هترجع' : 'اضرب باركود أو دور على الصنف عشان تضيفه للمرتجع'}
                  </p>
                </div>
              )}

              {/* Bottom Options & Financial Refund Method */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    هترجع الفلوس إزاي؟:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('cash')}
                      className={`h-8 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                        refundMethod === 'cash'
                          ? 'bg-amber-100/70 border-amber-400 text-amber-900 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>كاش من الدرج</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMethod('credit')}
                      className={`h-8 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                        refundMethod === 'credit'
                          ? 'bg-amber-100/70 border-amber-400 text-amber-900 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>خصم من حسابه الشكك</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    سبب الترجيع (ملاحظة):
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثلاً: الصنف بايظ، أو الزبون غير رأيه..."
                    className="w-full h-8 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Supervisor PIN if without invoice or needed */}
              {mode === 'withoutInvoice' && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-amber-900 block">لازم موافقة المشرف (رقم سري)</span>
                      <span className="text-[10px] text-amber-700 block">اكتب الرقم السري للمشرف عشان تصرف المرتجع ده من غير فاتورة</span>
                    </div>
                  </div>
                  <input
                    type="password"
                    placeholder="••••"
                    value={supervisorPin}
                    onChange={(e) => setSupervisorPin(e.target.value)}
                    className="w-24 h-8 px-2 text-center text-sm font-bold font-mono tracking-widest bg-white border border-amber-300 rounded-lg focus:outline-none focus:border-amber-600 text-slate-900"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!completedReturn && (
          <div className="h-[56px] px-4 bg-[#F7F8F6] border-t border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-slate-500 font-bold">إجمالي الفلوس اللي هترجع:</span>
              <span className="text-lg font-black font-mono text-amber-800 tabular-nums">
                {formatArabicCurrency(totalRefundPiasters)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="h-9 px-4 border border-slate-300 bg-white hover:bg-slate-50 font-bold text-xs text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                رجوع
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitReturn()}
                disabled={loading || activeReturnItems.length === 0}
                className="h-9 px-5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{loading ? 'بنحفظ المرتجع...' : 'تأكيد وصرف فلوس المرتجع'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
