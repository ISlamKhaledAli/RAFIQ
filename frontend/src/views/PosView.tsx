import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { 
  Barcode, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle, 
  RotateCcw,
  Search,
  Sparkles,
  ShoppingBag,
  CreditCard,
  Printer
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, SaleItem, Sale } from '../types/models';
import { formatArabicCurrency, calculateLineTotal } from '../utils/money';
import { MoneyInput } from '../components/MoneyInput';

interface CartItem extends SaleItem {
  stockQuantityMilli?: number;
}

// Preset Fast Pick Items for Supermarket Checkout lanes
interface FastCategory {
  id: string;
  name: string;
  items: { name: string; pricePiasters: number; barcode: string }[];
}

const FAST_CATEGORIES: FastCategory[] = [
  {
    id: 'bakery',
    name: 'مخبوزات وبقالة',
    items: [
      { name: 'خبز بلدي طازج', pricePiasters: 100, barcode: 'FAST-BREAD-01' },
      { name: 'عيش فينو كيس 5 رغيف', pricePiasters: 1000, barcode: 'FAST-FINO-02' },
      { name: 'سكر أبيض ناعم 1 كجم', pricePiasters: 3500, barcode: 'FAST-SUGAR-03' },
      { name: 'شاي العروسة 40 جم', pricePiasters: 1200, barcode: 'FAST-TEA-04' },
    ]
  },
  {
    id: 'dairy',
    name: 'ألبان ومشروبات',
    items: [
      { name: 'مياه بركة معدنية 1.5 لتر', pricePiasters: 800, barcode: 'FAST-WATER-01' },
      { name: 'لبن جهينة كامل الدسم 1 لتر', pricePiasters: 4200, barcode: 'FAST-MILK-02' },
      { name: 'زبادي المراعي سادة 105 جم', pricePiasters: 850, barcode: 'FAST-YOGURT-03' },
      { name: 'بيبسي كانز 330 مل', pricePiasters: 1500, barcode: 'FAST-SODA-04' },
    ]
  },
  {
    id: 'produce',
    name: 'خضار وفاكهة',
    items: [
      { name: 'طماطم بلدي طازجة', pricePiasters: 1500, barcode: 'FAST-TOMATO-01' },
      { name: 'بطاطس تحمير', pricePiasters: 1800, barcode: 'FAST-POTATO-02' },
      { name: 'بصل أحمر كجم', pricePiasters: 1400, barcode: 'FAST-ONION-03' },
      { name: 'خيار صوب', pricePiasters: 1600, barcode: 'FAST-CUCUM-04' },
    ]
  }
];

export const PosView = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [discountPiasters, setDiscountPiasters] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('bakery');
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<number | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setDiscountPiasters(0);
    showStatus('تم مسح السلة وبدء فاتورة جديدة', 'success');
    barcodeInputRef.current?.focus();
  };

  // Integer Piaster Math (Rule 1)
  const subtotalPiasters = cart.reduce((sum, item) => sum + item.totalPiasters, 0);
  const netTotalPiasters = Math.max(0, subtotalPiasters - discountPiasters);
  const totalItemCount = cart.reduce((count, item) => count + (item.quantityMilli / 1000), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showStatus('سلة البيع فارغة! يرجى إضافة أصناف أولاً.', 'error');
      return;
    }

    setLoading(true);
    try {
      const salePayload: Partial<Sale> = {
        subtotalPiasters,
        discountPiasters,
        taxPiasters: 0,
        totalPiasters: netTotalPiasters,
        paidPiasters: netTotalPiasters,
        paymentMethod: 'cash',
        status: 'completed',
        items: cart,
      };

      const completedSale = await invoke<Sale>('sales:create', salePayload);
      setLastInvoiceNumber(completedSale.invoiceNumber || null);
      showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || ''} بنجاح وطباعة الإيصال!`, 'success');
      setCart([]);
      setDiscountPiasters(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`فشل حفظ الفاتورة: ${msg}`, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  };

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Keyboard shortcut listener for retail F-keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (e.key === 'F2') {
        e.preventDefault();
        clearCart();
      } else if (e.key === 'F12' || e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0 && !loading) {
          void handleCheckout();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleBarcodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = barcodeQuery.trim();
    if (!query) return;

    try {
      setLoading(true);
      const results = await invoke<Product[]>('products:search', { query });
      if (results && results.length > 0) {
        addProductToCart(results[0]);
        setBarcodeQuery('');
        showStatus(`تمت إضافة: ${results[0].name}`, 'success');
      } else {
        showStatus(`المنتج غير مسجل: "${query}" (يمكنك تسجيله من تبويب السلع والمخزن)`, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`خطأ في البحث: ${msg}`, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  };

  const addProductToCart = (prod: Product) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === prod.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const item = updated[existingIndex];
        const newQty = item.quantityMilli + 1000;
        item.quantityMilli = newQty;
        item.totalPiasters = calculateLineTotal(item.unitPricePiasters, newQty, item.discountPiasters);
        return updated;
      }

      const newItem: CartItem = {
        productId: prod.id,
        productName: prod.name,
        barcode: prod.barcode,
        quantityMilli: 1000,
        unitPricePiasters: prod.pricePiasters,
        unitCostPiasters: prod.costPiasters,
        discountPiasters: 0,
        totalPiasters: prod.pricePiasters,
        taxPiasters: 0,
        stockQuantityMilli: prod.stockQuantityMilli,
      };
      return [newItem, ...prev];
    });
  };

  // Add from fast-item grid
  const handleFastItemClick = (fastItem: { name: string; pricePiasters: number; barcode: string }) => {
    const dummyProduct: Product = {
      id: fastItem.barcode,
      name: fastItem.name,
      barcode: fastItem.barcode,
      pricePiasters: fastItem.pricePiasters,
      costPiasters: Math.round(fastItem.pricePiasters * 0.75),
      stockQuantityMilli: 100000,
      unit: 'piece',
      taxRatePercent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    addProductToCart(dummyProduct);
    showStatus(`تمت إضافة: ${fastItem.name}`, 'success');
    barcodeInputRef.current?.focus();
  };

  const updateQuantity = (index: number, deltaPieces: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const currentPieces = item.quantityMilli / 1000;
      const newPieces = Math.max(1, currentPieces + deltaPieces);
      item.quantityMilli = newPieces * 1000;
      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    barcodeInputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full w-full bg-canvas overflow-hidden">
      {/* 1. THREE-PANE MAIN WORKSPACE */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* ================= REGION A: BARCODE SEARCH & CART TABLE (58% Width) ================= */}
        <section className="w-[58%] h-full bg-surface hairline-l flex flex-col overflow-hidden">
          
          {/* Barcode Search Header (56px tall, 2px brand border focus state) */}
          <div className="p-3 bg-surface hairline-b shrink-0">
            <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-2">
              <div className="relative flex-1 h-[44px] flex items-center bg-surface rounded border-2 border-brand px-3 focus-within:ring-1 focus-within:ring-brand">
                <Barcode className="w-5 h-5 text-brand ml-2 shrink-0" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder="امسح الباركود أو اكتب اسم الصنف ثم اضغط Enter..."
                  value={barcodeQuery}
                  onChange={(e) => setBarcodeQuery(e.target.value)}
                  className="w-full h-full bg-transparent border-none text-[14px] text-ink placeholder:text-ink-muted focus:outline-none font-mono"
                />
                <div className="mr-2 flex items-center shrink-0">
                  <span className="px-1.5 py-0.5 text-[11px] font-mono font-bold bg-surface-2 text-ink-muted rounded border border-line">
                    F3
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-[44px] px-4 bg-brand hover:bg-brand-hover text-white rounded text-[13px] font-bold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>إضافة</span>
              </button>
            </form>
          </div>

          {/* Status Message Notification Toast */}
          {statusMessage && (
            <div className={`mx-3 mt-2 px-3 py-2 rounded text-[12px] font-semibold border flex items-center gap-2 transition-all ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft border-paid-border text-paid' 
                : 'bg-danger-soft border-danger-border text-danger'
            }`}>
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Cart Table Area */}
          <div className="flex-1 flex flex-col overflow-hidden mt-1">
            {/* Table Column Headers (36px tall, surface-2, hairline-b) */}
            <div className="h-[36px] bg-surface-2 hairline-b flex items-center px-4 text-[12px] font-bold text-ink-muted select-none shrink-0">
              <div className="w-[8%] text-center">#</div>
              <div className="w-[42%] text-right">الصنف / الباركود</div>
              <div className="w-[14%] text-left tabular-nums">السعر</div>
              <div className="w-[18%] text-center">الكمية</div>
              <div className="w-[14%] text-left tabular-nums">الإجمالي</div>
              <div className="w-[4%] text-center">حذف</div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-line">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-3 p-6">
                  <div className="w-14 h-14 rounded-full bg-surface-2 border border-line flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7 text-ink-muted stroke-[1.4]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-bold text-ink m-0">سلة البيع فارغة</p>
                    <p className="text-[12px] text-ink-muted m-0 mt-1">
                      امسح الباركود، أو اختر من قائمة الأصناف السريعة على اليسار لبدء الفاتورة
                    </p>
                  </div>
                  {lastInvoiceNumber && (
                    <span className="text-[11px] font-mono text-paid bg-paid-soft border border-paid-border px-2.5 py-1 rounded">
                      آخر فاتورة تم حفظها: #{lastInvoiceNumber}
                    </span>
                  )}
                </div>
              ) : (
                cart.map((item, index) => (
                  <div 
                    key={item.productId || index} 
                    className="h-[52px] hairline-b flex items-center px-4 text-[13px] hover:bg-surface-2 transition-colors"
                  >
                    {/* Index */}
                    <div className="w-[8%] text-center font-mono text-ink-muted text-xs">
                      {index + 1}
                    </div>

                    {/* Description */}
                    <div className="w-[42%] pr-1 flex flex-col justify-center overflow-hidden">
                      <span className="font-semibold text-ink truncate text-[13px]">{item.productName}</span>
                      <span className="text-[10px] font-mono text-ink-muted truncate">
                        {item.barcode || 'بدون باركود'}
                      </span>
                    </div>

                    {/* Unit Price */}
                    <div className="w-[14%] text-left tabular-nums font-mono text-ink text-[13px]">
                      {formatArabicCurrency(item.unitPricePiasters)}
                    </div>

                    {/* Quantity Stepper (32px tall, brand styled) */}
                    <div className="w-[18%] flex items-center justify-center">
                      <div className="flex items-center h-[32px] bg-surface border border-line rounded px-1 gap-1">
                        <button 
                          onClick={() => updateQuantity(index, -1)}
                          className="w-6 h-6 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-sm rounded hover:bg-surface-2"
                          title="إنقاص الكمية"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center font-mono font-bold text-ink text-[13px] tabular-nums">
                          {item.quantityMilli / 1000}
                        </span>
                        <button 
                          onClick={() => updateQuantity(index, 1)}
                          className="w-6 h-6 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-sm rounded hover:bg-surface-2"
                          title="زيادة الكمية"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Line Total */}
                    <div className="w-[14%] text-left tabular-nums font-mono font-bold text-brand text-[13px]">
                      {formatArabicCurrency(item.totalPiasters)}
                    </div>

                    {/* Delete Trigger */}
                    <div className="w-[4%] text-center">
                      <button 
                        onClick={() => removeItem(index)}
                        className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ================= REGION B: FINANCIAL TOTALS & PAYMENT PANEL (26% Width) ================= */}
        <section className="w-[26%] h-full bg-surface hairline-l flex flex-col justify-between p-4 select-none">
          {/* Top Section: Line Breakdown */}
          <div className="flex flex-col gap-2.5">
            <div className="pb-2 hairline-b flex items-center justify-between">
              <span className="text-[13px] font-bold text-ink">ملخص الفاتورة</span>
              <span className="text-[11px] font-mono text-ink-muted bg-surface-2 border border-line px-2 py-0.5 rounded">
                {cart.length} أصناف ({totalItemCount} قطعة)
              </span>
            </div>

            {/* Breakdown Rows */}
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-ink-muted">الإجمالي قبل الخصم:</span>
              <span className="font-semibold text-ink font-mono tabular-nums">
                {formatArabicCurrency(subtotalPiasters)}
              </span>
            </div>

            <div className="flex justify-between items-center text-[13px] py-1 gap-2">
              <span className="text-danger font-medium text-xs">خصم الفاتورة:</span>
              <div className="w-32">
                <MoneyInput
                  valuePiasters={discountPiasters}
                  onChangePiasters={setDiscountPiasters}
                  className="py-1 text-xs text-danger font-bold text-left"
                />
              </div>
            </div>

            <div className="flex justify-between items-center text-[11px] py-1 text-ink-muted border-t border-line">
              <span>ضريبة القيمة المضافة:</span>
              <span className="font-mono text-ink-muted">0.00 ج.م (معفاة/مشمولة)</span>
            </div>
          </div>

          {/* Bottom Section: Hero Grand Total + Action Triggers */}
          <div className="flex flex-col gap-3">
            {/* Grand Total Solid Dark Bar (#14181A, 28px text, Egyptian Pound) */}
            <div className="w-full bg-[#14181A] rounded-[6px] border border-[#2D3331] p-3.5 flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[#8FA69C]">المطلوب سداده</span>
                <span className="text-[12px] font-medium text-[#DCE1DC]">جنيه مصري (EGP)</span>
              </div>
              <div className="flex items-baseline justify-end pt-1">
                <span className="text-white text-[32px] leading-[36px] font-bold font-mono tabular-nums tracking-tight">
                  {formatArabicCurrency(netTotalPiasters)}
                </span>
              </div>
            </div>

            {/* Main Action Buttons Grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* نقدي [F9] */}
              <button 
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="h-[52px] bg-brand hover:bg-brand-hover active:bg-brand-dark disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-3 flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-[14px] font-bold">دفع نقدي</span>
                </div>
                <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold">
                  F9
                </span>
              </button>

              {/* حفظ وطباعة [F12] */}
              <button 
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="h-[52px] bg-paid hover:bg-[#15633E] active:bg-[#0E492C] disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-3 flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="flex items-center gap-1.5">
                  <Printer className="w-4 h-4" />
                  <span className="text-[14px] font-bold">حفظ وطباعة</span>
                </div>
                <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold">
                  F12
                </span>
              </button>
            </div>

            {/* Void / Clear Cart Button */}
            <button 
              onClick={clearCart}
              disabled={cart.length === 0}
              className="w-full h-[38px] bg-surface hover:bg-danger-soft text-danger disabled:text-ink-muted border border-danger disabled:border-line text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مسح السلة / فاتورة جديدة (F2)</span>
            </button>
          </div>
        </section>

        {/* ================= REGION C: FAST ITEMS GRID (16% Width) ================= */}
        <section className="w-[16%] h-full bg-surface-2 flex flex-col p-3 select-none overflow-hidden">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-2 pb-1 hairline-b shrink-0">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span className="text-[12px] font-bold text-ink">أصناف سريعة</span>
            </div>
            <span className="text-[10px] font-mono text-ink-muted">نقرة واحدة</span>
          </div>

          {/* Category Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-surface p-0.5 rounded border border-line mb-2 shrink-0">
            {FAST_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`h-7 text-[11px] font-bold rounded transition-colors truncate px-1 ${
                  activeCategory === cat.id 
                    ? 'bg-brand text-white' 
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {cat.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* 1-Column or 2-Column List of Quick Items */}
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-0.5">
            {FAST_CATEGORIES.find((c) => c.id === activeCategory)?.items.map((fastItem) => (
              <button
                key={fastItem.barcode}
                onClick={() => handleFastItemClick(fastItem)}
                className="w-full bg-surface hover:bg-brand-soft border border-line hover:border-brand text-ink rounded p-2 flex flex-col justify-between text-right transition-colors shadow-none shrink-0"
              >
                <span className="text-[12px] font-semibold text-ink line-clamp-1 leading-snug">
                  {fastItem.name}
                </span>
                <span className="text-[11px] font-mono text-brand font-bold tabular-nums mt-1 text-left">
                  {formatArabicCurrency(fastItem.pricePiasters)}
                </span>
              </button>
            ))}
          </div>

          {/* Bottom Fast Info Box */}
          <div className="mt-2 bg-surface p-2 rounded border border-line flex items-center justify-between text-[11px] text-ink-muted shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-paid"></span>
              <span className="font-semibold text-ink">الباركود</span>
            </div>
            <span className="font-mono text-[10px]">Auto-detect</span>
          </div>
        </section>
      </div>

      {/* 2. BOTTOM KEYBOARD SHORTCUTS STRIP (36px high, spans entire bottom, hairline-t) */}
      <footer className="h-[36px] w-full bg-surface-2 hairline-t flex items-center justify-between px-5 select-none shrink-0 z-10 text-[12px] text-ink-muted">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F2</span>
            <span>فاتورة جديدة</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F3</span>
            <span>قارئ الباركود</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F9</span>
            <span>دفع نقدي</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F12</span>
            <span>حفظ وطباعة</span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-ink-muted">
          <span>المعاملة: </span>
          <span className="text-paid font-bold">SQLite ACID Transaction</span>
        </div>
      </footer>
    </div>
  );
};
