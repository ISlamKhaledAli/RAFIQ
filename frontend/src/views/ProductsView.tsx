import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  RefreshCw, 
  X, 
  Check, 
  AlertCircle,
  Edit2,
  Trash2,
  Barcode,
  Percent
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { MoneyInput } from '../components/MoneyInput';

export const ProductsView = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [pricePiasters, setPricePiasters] = useState(0);
  const [costPiasters, setCostPiasters] = useState(0);
  const [stockPieces, setStockPieces] = useState(10);
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [formError, setFormError] = useState('');

  const loadProducts = async (query = '') => {
    setLoading(true);
    try {
      const res = await invoke<Product[]>('products:search', { query });
      setProducts(res || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await invoke<Product[]>('products:search', { query: '' });
        if (active) {
          setProducts(res || []);
        }
      } catch (err: unknown) {
        console.error(err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void loadProducts(searchQuery);
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setBarcode('');
    setPricePiasters(0);
    setCostPiasters(0);
    setStockPieces(10);
    setTaxRatePercent(0);
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingId(prod.id);
    setName(prod.name);
    setBarcode(prod.barcode || '');
    setPricePiasters(prod.pricePiasters);
    setCostPiasters(prod.costPiasters);
    setStockPieces(Math.round((prod.stockQuantityMilli || 0) / 1000));
    setTaxRatePercent(prod.taxRatePercent || 0);
    setFormError('');
    setShowModal(true);
  };

  const generateInternalBarcode = () => {
    // Generate clean Egyptian internal supermarket barcode with prefix 200
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    setBarcode(`200${randomDigits}`);
  };

  const handleDeleteProduct = async (prod: Product) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الصنف "${prod.name}" من الكتالوج؟`)) {
      return;
    }

    try {
      setLoading(true);
      await invoke('products:delete', { id: prod.id });
      void loadProducts(searchQuery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`فشل الحذف: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('اسم المنتج مطلوب');
      return;
    }

    try {
      setLoading(true);
      const productPayload: Partial<Product> = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        pricePiasters,
        costPiasters,
        stockQuantityMilli: stockPieces * 1000,
        unit: 'piece',
        taxRatePercent,
        isActive: true,
      };

      if (editingId) {
        productPayload.id = editingId;
      }

      await invoke<Product>('products:save', productPayload);
      setShowModal(false);
      openAddModal();
      void loadProducts(searchQuery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas p-4 gap-3 overflow-hidden select-none">
      {/* 1. Header Toolbar (Title, Count Badge, Search, Add Button) */}
      <div className="h-[56px] bg-surface hairline-all rounded-[6px] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-ink leading-tight m-0">كتالوج السلع والمخزن</h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-surface-2 border border-line text-ink-muted tabular-nums">
                {products.length} صنف مسجل
              </span>
            </div>
          </div>
        </div>

        {/* Right Search Input & Add Button */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-1.5">
            <div className="relative w-64 h-[38px] flex items-center bg-surface-2 border border-line rounded px-2.5 focus-within:border-brand focus-within:bg-surface">
              <Search className="w-4 h-4 text-ink-muted ml-2 shrink-0 pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث بالاسم أو الباركود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-[12px] text-ink placeholder:text-ink-muted focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    void loadProducts('');
                  }}
                  className="text-ink-muted hover:text-ink text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="h-[38px] px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold transition-colors"
            >
              بحث
            </button>
          </form>

          <button
            onClick={() => void loadProducts(searchQuery)}
            disabled={loading}
            className="h-[38px] w-[38px] flex items-center justify-center bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded transition-colors"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openAddModal}
            className="h-[38px] px-4 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      {/* 2. Products Data Table */}
      <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
          <span className="col-span-1 text-center">#</span>
          <span className="col-span-2">الباركود</span>
          <span className="col-span-3">اسم الصنف والوصف</span>
          <span className="col-span-2 text-left pl-2">سعر البيع</span>
          <span className="col-span-1 text-left">التكلفة</span>
          <span className="col-span-1 text-center">الرصيد</span>
          <span className="col-span-1 text-center">الحالة</span>
          <span className="col-span-1 text-center">إجراءات</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {products.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
              <Package className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-50" />
              <p className="text-[14px] font-semibold text-ink m-0">لا توجد منتجات مسجلة مطابقة للبحث</p>
              <p className="text-[12px] text-ink-muted m-0">
                اضغط على زر &quot;إضافة صنف جديد&quot; أعلاه لتسجيل أول صنف في قاعدة البيانات
              </p>
            </div>
          ) : (
            products.map((prod, index) => {
              const stockPiecesCurrent = (prod.stockQuantityMilli || 0) / 1000;
              let stockStatus = { label: 'متوفر', class: 'bg-paid-soft text-paid border-paid-border' };
              if (stockPiecesCurrent <= 0) {
                stockStatus = { label: 'نافد', class: 'bg-danger-soft text-danger border-danger-border' };
              } else if (stockPiecesCurrent <= 5) {
                stockStatus = { label: 'منخفض', class: 'bg-warn-soft text-warn border-warn-border' };
              }

              return (
                <div 
                  key={prod.id} 
                  className="h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[13px] hover:bg-surface-2 transition-colors"
                >
                  <span className="col-span-1 text-center font-mono text-xs text-ink-muted">
                    {index + 1}
                  </span>
                  
                  <span className="col-span-2 font-mono text-xs text-ink truncate">
                    {prod.barcode || <span className="text-ink-muted">—</span>}
                  </span>

                  <div className="col-span-3 font-semibold text-ink truncate pr-1">
                    {prod.name}
                  </div>

                  <span className="col-span-2 text-left font-mono font-bold text-brand tabular-nums text-[13px] pl-2">
                    {formatArabicCurrency(prod.pricePiasters)}
                  </span>

                  <span className="col-span-1 text-left font-mono text-ink-muted tabular-nums text-[12px]">
                    {formatArabicCurrency(prod.costPiasters)}
                  </span>

                  <span className="col-span-1 text-center font-mono font-semibold text-ink tabular-nums text-[12px]">
                    {stockPiecesCurrent}
                  </span>

                  <div className="col-span-1 flex justify-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${stockStatus.class}`}>
                      {stockStatus.label}
                    </span>
                  </div>

                  {/* Actions: Edit & Soft Delete */}
                  <div className="col-span-1 flex items-center justify-center gap-1">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                      title="تعديل الصنف"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => void handleDeleteProduct(prod)}
                      className="p-1 rounded text-ink-muted hover:text-danger hover:bg-surface transition-colors"
                      title="حذف الصنف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Footer Status */}
        <div className="h-[32px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0">
          <span>يتم تخزين جميع الأسعار بالقروش وتحديث حركة المخزون في معاملات SQLite فورية.</span>
          <span className="font-mono tabular-nums">{products.length} منتج مسجل</span>
        </div>
      </div>

      {/* 3. Add/Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface rounded-[6px] border-2 border-brand overflow-hidden flex flex-col select-none">
            {/* Modal Header */}
            <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-brand" />
                <h3 className="text-[14px] font-bold text-ink m-0">
                  {editingId ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد للكتالوج'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProduct} className="p-5 flex flex-col gap-3.5 text-[12px]">
              {formError && (
                <div className="p-2.5 rounded bg-danger-soft border border-danger-border text-danger flex items-center gap-2 text-[12px] font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-ink font-semibold mb-1">اسم الصنف *</label>
                <input
                  type="text"
                  placeholder="مثال: شاي العروسة 250 جم"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                  autoFocus
                />
              </div>

              {/* Barcode with Auto-Generate button */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-ink font-semibold">الباركود الدولي أو الداخلي</label>
                  <button
                    type="button"
                    onClick={generateInternalBarcode}
                    className="text-[11px] text-brand hover:underline font-semibold flex items-center gap-1"
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    <span>توليد كود تلقائي</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="امسح الباركود أو اضغط توليد كود تلقائي"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>

              {/* Selling Price & Cost in Piasters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">سعر البيع للجمهور *</label>
                  <MoneyInput
                    valuePiasters={pricePiasters}
                    onChangePiasters={setPricePiasters}
                    className="h-[38px] text-[13px] font-bold text-brand"
                  />
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1">تكلفة الشراء من المورد</label>
                  <MoneyInput
                    valuePiasters={costPiasters}
                    onChangePiasters={setCostPiasters}
                    className="h-[38px] text-[13px]"
                  />
                </div>
              </div>

              {/* Initial Stock & Tax Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">رصيد المخزون (بالقطعة)</label>
                  <input
                    type="number"
                    min="0"
                    value={stockPieces}
                    onChange={(e) => setStockPieces(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1">نسبة الضريبة (%)</label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={taxRatePercent}
                      onChange={(e) => setTaxRatePercent(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono pl-8"
                    />
                    <Percent className="w-3.5 h-3.5 text-ink-muted absolute left-3 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-line flex items-center justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="h-[38px] px-4 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-[12px] font-semibold transition-colors"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="h-[38px] px-5 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingId ? 'حفظ التعديلات' : 'حفظ الصنف في قاعدة البيانات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
