import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  AlertTriangle,
  Clock,
  Flame,
  User,
  Phone,
  FileText,
  Check,
  X,
  Search,
  Package,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { extractProducts, type Product } from '../types/models';
import type { ShortageEntry } from '../types/shortage';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useAuth } from '../context/useAuth';

interface QuickShortageModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProductName?: string;
  initialProductId?: string;
  onSuccess?: (entry: ShortageEntry) => void;
}

export const QuickShortageModal: React.FC<QuickShortageModalProps> = ({
  isOpen,
  onClose,
  initialProductName = '',
  initialProductId = '',
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const [productName, setProductName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [urgency, setUrgency] = useState<'normal' | 'urgent' | 'critical'>('normal');
  const [source, setSource] = useState<'manual_pos' | 'customer_request'>('manual_pos');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProductName(initialProductName);
      setQuantity('1');
      setUrgency('normal');
      setSource('manual_pos');
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      setError(null);
      setSearchResults([]);
      setIsSearching(false);

      if (initialProductId) {
        void invoke<Product>('products:getById', { id: initialProductId }).then((prod) => {
          if (prod) {
            setSelectedProduct(prod);
            setProductName(prod.name);
          }
        }).catch(() => {
          setSelectedProduct(null);
        });
      } else {
        setSelectedProduct(null);
      }

      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, initialProductName, initialProductId]);

  const handleNameChange = (val: string) => {
    setProductName(val);
    setSelectedProduct(null);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!val || val.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await invoke<unknown>('products:search', { query: val.trim(), limit: 8 });
        const prods = extractProducts(res);
        setSearchResults(prods);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);
  };

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setProductName(prod.name);
    setSearchResults([]);
    setIsSearching(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = productName.trim();
    if (!cleanName) {
      setError('يرجى كتابة اسم الصنف الناقص');
      return;
    }

    const qtyNum = parseFloat(quantity) || 1;
    if (qtyNum <= 0) {
      setError('يرجى تحديد كمية صحيحة');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const entryPayload = {
        productId: selectedProduct?.id || null,
        productName: cleanName,
        barcode: selectedProduct?.barcode || null,
        unit: selectedProduct?.unit || 'قطعة',
        requestedQuantityMilli: Math.round(qtyNum * 1000),
        currentStockMilli: selectedProduct?.stockQuantityMilli || 0,
        minStockMilli: selectedProduct?.minStockQuantityMilli || 0,
        customerName: source === 'customer_request' ? (customerName.trim() || null) : null,
        customerPhone: source === 'customer_request' ? (customerPhone.trim() || null) : null,
        recordedByUserId: currentUser?.id || null,
        recordedByUserName: currentUser?.displayName || currentUser?.username || 'الكاشير',
        urgency,
        source,
        notes: notes.trim() || null,
      };

      const result = await invoke<ShortageEntry>('shortages:save', entryPayload);
      if (onSuccess && result) {
        onSuccess(result);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل النواقص';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/50 dark:bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col select-none">
        {/* Header */}
        <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 text-warn flex items-center justify-center shadow-2xs">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink dark:text-ink-dark leading-tight">
                تسجيل صنف ناقص في الدفتر
              </h2>
              <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                توثيق طلب العميل لعدم ضياع المبيعات وإدراجه في طلبيات الموردين
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-3 rounded-xl bg-danger-soft border border-danger/20 text-danger text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Product Name with Auto-Suggest */}
          <div className="relative">
            <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
              اسم الصنف أو الدواء المطلوب *
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={productName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="اكتب اسم الصنف أو ابحث في الكتالوج..."
                className="w-full h-10 px-3 pr-9 pl-24 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-dark focus:outline-none focus:border-brand shadow-2xs"
              />
              <Search className="w-4 h-4 text-ink-muted absolute right-3 top-3 pointer-events-none" />
              {isSearching && (
                <div className="absolute left-3 top-3 text-[11px] text-brand dark:text-brand-bright font-bold animate-pulse pointer-events-none">
                  جاري البحث...
                </div>
              )}
            </div>

            {/* Suggestions list */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                <div className="p-1.5 text-[10px] font-bold text-ink-muted bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark">
                  أصناف مطابقة من الكتالوج:
                </div>
                {searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod)}
                    className="w-full text-right px-3 py-2 text-xs hover:bg-brand-soft/40 dark:hover:bg-brand-soft/10 border-b border-line/40 dark:border-line-dark/40 last:border-0 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-brand" />
                      <span className="font-bold text-ink dark:text-ink-dark">{prod.name}</span>
                    </div>
                    <span className="text-[11px] text-ink-muted font-mono">
                      رصيد: {prod.stockQuantityMilli / 1000} {prod.unit}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedProduct && (
              <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-brand-soft/50 dark:bg-brand-soft/20 border border-brand/20 flex items-center justify-between text-[11px]">
                <span className="text-brand dark:text-brand-bright font-bold">
                  مرتبط بالصنف: {selectedProduct.name}
                </span>
                <span className="text-ink-muted font-mono">
                  الرصيد الحالي: {selectedProduct.stockQuantityMilli / 1000} {selectedProduct.unit}
                </span>
              </div>
            )}
          </div>

          {/* Requested Quantity & Urgency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                الكمية المطلوبة (بالوحدة)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold font-mono text-center text-ink dark:text-ink-dark focus:outline-none focus:border-brand shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                درجة الأهمية والاستعجال
              </label>
              <div className="grid grid-cols-3 gap-1 h-10 p-1 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
                <button
                  type="button"
                  onClick={() => setUrgency('normal')}
                  className={`flex items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-all ${
                    urgency === 'normal'
                      ? 'bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark shadow-2xs border border-line dark:border-line-dark'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Clock className="w-3 h-3 text-ink-muted" />
                  <span>عادي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('urgent')}
                  className={`flex items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-all ${
                    urgency === 'urgent'
                      ? 'bg-warn text-white shadow-2xs'
                      : 'text-warn hover:bg-warn-soft/50'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>عاجل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('critical')}
                  className={`flex items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-all ${
                    urgency === 'critical'
                      ? 'bg-danger text-white shadow-2xs'
                      : 'text-danger hover:bg-danger-soft/50'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  <span>حرج</span>
                </button>
              </div>
            </div>
          </div>

          {/* Source Selector */}
          <div>
            <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
              مصدر طلب النواقص
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSource('manual_pos')}
                className={`flex items-center justify-center gap-2 h-9 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  source === 'manual_pos'
                    ? 'border-brand bg-brand-soft/40 dark:bg-brand-soft/20 text-brand dark:text-brand-bright'
                    : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink-muted'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>ملاحظة كاشير / جرد رف</span>
              </button>
              <button
                type="button"
                onClick={() => setSource('customer_request')}
                className={`flex items-center justify-center gap-2 h-9 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  source === 'customer_request'
                    ? 'border-brand bg-brand-soft/40 dark:bg-brand-soft/20 text-brand dark:text-brand-bright'
                    : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink-muted'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>طلب عميل (زبون بالصيدلية/المحل)</span>
              </button>
            </div>
          </div>

          {/* Conditional Customer Info vs Cashier Auto-Identity */}
          {source === 'customer_request' ? (
            <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2.5 animate-in fade-in">
              <div className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                <span>بيانات العميل للاتصال به عند توافر الصنف (اختياري)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="اسم العميل"
                    className="w-full h-8 px-2.5 pr-8 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <User className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-2 pointer-events-none" />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="رقم الهاتف"
                    className="w-full h-8 px-2.5 pr-8 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <Phone className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-2 pointer-events-none" />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-brand-soft/40 dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                <span className="font-bold text-brand dark:text-brand-bright">
                  تسجيل كاشير: سيتم توثيق القيد باسم الكاشير المسجل حالياً تلقائياً
                </span>
              </div>
              <span className="font-bold text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark-3 px-2 py-0.5 rounded border border-line dark:border-line-dark shadow-2xs">
                {currentUser?.displayName || currentUser?.username || 'الكاشير'}
              </span>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
              ملاحظات إضافية (التركيز، الشركة، البديل المقترح...)
            </label>
            <div className="relative">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي تفاصيل تساعد مسؤول المشتريات أثناء عمل الطلبية..."
                className="w-full h-9 px-3 pr-8 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand shadow-2xs"
              />
              <FileText className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line dark:border-line-dark">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 px-4 rounded-xl border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'تسجيل في النواقص'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
