import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  AlertCircle,
  Package,
  Search,
  Check,
  Tag
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { QuickItem, Product } from '../types/models';

interface QuickItemsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemsChanged?: () => void;
}

export const QuickItemsManagerModal: React.FC<QuickItemsManagerModalProps> = ({ isOpen, onClose, onItemsChanged }) => {
  const [items, setItems] = useState<QuickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State (Add / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPriceEgp, setFormPriceEgp] = useState('');
  const [formIsOpenPrice, setFormIsOpenPrice] = useState(false);
  const [formUnit, setFormUnit] = useState('piece');
  const [formCategory, setFormCategory] = useState('');
  const [formNewCategory, setFormNewCategory] = useState('');
  const [formProductId, setFormProductId] = useState<string | null>(null);

  // Product Search for Linking
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchingLoading, setSearchingLoading] = useState(false);

  // Delete Confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await invoke<QuickItem[]>('quickItems:getAll');
      if (Array.isArray(res)) {
        setItems(res);
        // Set default active category if none or not found
        const cats = Array.from(new Set(res.map((i) => i.categoryName || 'عام')));
        if (cats.length > 0) {
          setActiveCategory((prev) => (!prev || !cats.includes(prev) ? cats[0] : prev));
        } else {
          setActiveCategory('عام');
        }
      } else {
        setItems([]);
      }
    } catch {
      // Fallback cleanly without showing alarming technical error banners to the user
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void (async () => {
      try {
        const res = await invoke<QuickItem[]>('quickItems:getAll');
        if (active && Array.isArray(res)) {
          setItems(res);
          const cats = Array.from(new Set(res.map((i) => i.categoryName || 'عام')));
          if (cats.length > 0) {
            setActiveCategory((prev) => (!prev || !cats.includes(prev) ? cats[0] : prev));
          } else {
            setActiveCategory('عام');
          }
        } else if (active) {
          setItems([]);
        }
      } catch {
        if (active) {
          setItems([]);
        }
      }
    })();
    return () => { active = false; };
  }, [isOpen]);

  const categories = Array.from(new Set(items.map((i) => i.categoryName || 'عام')));
  if (categories.length === 0) categories.push('عام');

  const filteredItems = items
    .filter((i) => (i.categoryName || 'عام') === activeCategory)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormPriceEgp('');
    setFormIsOpenPrice(false);
    setFormUnit('piece');
    setFormCategory(activeCategory || 'عام');
    setFormNewCategory('');
    setFormProductId(null);
    setIsSearchingProduct(false);
    setProductSearchQuery('');
    setSearchResults([]);
    setIsFormOpen(true);
  };

  const openEditForm = (item: QuickItem) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormPriceEgp((item.pricePiasters / 100).toFixed(2));
    setFormIsOpenPrice(item.isOpenPrice);
    setFormUnit(item.unit || 'piece');
    setFormCategory(item.categoryName || 'عام');
    setFormNewCategory('');
    setFormProductId(item.productId || null);
    setIsSearchingProduct(false);
    setProductSearchQuery('');
    setSearchResults([]);
    setIsFormOpen(true);
  };

  const handleProductSearch = async (query: string) => {
    setProductSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingLoading(true);
    try {
      const results = await invoke<Product[]>('products:search', { query: query.trim(), limit: 8 });
      setSearchResults(Array.isArray(results) ? results : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchingLoading(false);
    }
  };

  const selectProductToLink = (prod: Product) => {
    setFormProductId(prod.id);
    setFormName(prod.name);
    setFormPriceEgp((prod.pricePiasters / 100).toFixed(2));
    setFormUnit(prod.unit || 'piece');
    setIsSearchingProduct(false);
    setProductSearchQuery('');
    setSearchResults([]);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = formCategory === '__new__' ? formNewCategory.trim() : formCategory.trim();
    if (!finalCategory) {
      setErrorMessage('يرجى تحديد اسم التبويب أو إدخال تبويب جديد');
      return;
    }

    if (!formName.trim()) {
      setErrorMessage('يرجى إدخال اسم الصنف');
      return;
    }

    let piasters = 0;
    if (!formIsOpenPrice) {
      const parsed = parseFloat(formPriceEgp);
      if (isNaN(parsed) || parsed < 0) {
        setErrorMessage('يرجى إدخال سعر صحيح بالجنيه');
        return;
      }
      piasters = Math.round(parsed * 100);
    }

    const payload: Partial<QuickItem> = {
      id: editingId || '',
      productId: formProductId || null,
      name: formName.trim(),
      pricePiasters: piasters,
      isOpenPrice: formIsOpenPrice,
      unit: formUnit,
      categoryName: finalCategory,
      displayOrder: editingId 
        ? (items.find((i) => i.id === editingId)?.displayOrder || 1)
        : (filteredItems.length + 1)
    };

    setLoading(true);
    setErrorMessage(null);
    try {
      await invoke('quickItems:save', payload);
      setSuccessMessage(editingId ? 'تم تحديث الصنف بنجاح' : 'تمت إضافة الصنف بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
      setIsFormOpen(false);
      setActiveCategory(finalCategory);
      await fetchItems();
      if (onItemsChanged) onItemsChanged();
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage('تعذر حفظ الصنف السريع، يرجى مراجعة البيانات والمحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await invoke('quickItems:delete', { id });
      setSuccessMessage('تم حذف الصنف بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
      setDeleteConfirmId(null);
      await fetchItems();
      if (onItemsChanged) onItemsChanged();
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage('تعذر حذف الصنف، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === filteredItems.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...filteredItems];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const orderedIds = reordered.map((i) => i.id);
    try {
      await invoke('quickItems:reorder', { orderedIds });
      await fetchItems();
      if (onItemsChanged) onItemsChanged();
    } catch (err: unknown) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="bg-surface border border-line rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-ink"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 hairline-b flex items-center justify-between bg-surface-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-brand/10 text-brand flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">إدارة الأصناف السريعة (Fast Picks)</h2>
              <p className="text-xs text-ink-muted leading-tight mt-0.5">
                تخصيص أزرار الكاشير السريعة للأصناف بدون باركود الأكثر طلباً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-600 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main List */}
          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            {/* Action Bar & Categories */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 hairline-b">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-[65%]">
                {categories.map((cat) => {
                  const count = items.filter((i) => (i.categoryName || 'عام') === cat).length;
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveCategory(cat);
                        setIsFormOpen(false);
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 flex items-center gap-1 ${
                        isActive 
                          ? 'bg-brand text-white shadow-sm' 
                          : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface-3'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`text-[10px] px-1 rounded-full ${isActive ? 'bg-white/20' : 'bg-black/5 text-ink-muted'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Add Button */}
              <button
                onClick={openAddForm}
                className="h-8 px-3 text-xs font-bold rounded bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف</span>
              </button>
            </div>

            {/* Items Table / Cards */}
            {loading && items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-ink-muted">
                جاري التحميل...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-ink-muted border border-dashed border-line rounded">
                <Package className="w-8 h-8 opacity-40 mb-2" />
                <p className="text-xs font-medium">لا توجد أصناف في هذا التبويب بعد</p>
                <button
                  onClick={openAddForm}
                  className="mt-3 text-xs font-bold text-brand hover:underline"
                >
                  اضغط هنا لإضافة أول صنف
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-surface-2 border border-line rounded flex items-center justify-between hover:border-brand/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Reorder Buttons */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMove(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30 hover:bg-surface"
                          title="تحريك لأعلى"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMove(index, 'down')}
                          disabled={index === filteredItems.length - 1}
                          className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30 hover:bg-surface"
                          title="تحريك لأسفل"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Item Details */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink">{item.name}</span>
                          {item.productId && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 font-medium">
                              مربوط بالمخزن
                            </span>
                          )}
                          {item.unit === 'kg' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600 font-medium">
                              بالميزان (كجم)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          {item.isOpenPrice ? (
                            <span className="text-amber-600 font-bold">سعر مفتوح عند البيع</span>
                          ) : (
                            <span className="font-mono text-brand font-bold">
                              {(item.pricePiasters / 100).toFixed(2)} ج.م
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {deleteConfirmId === item.id ? (
                        <div className="flex items-center gap-1 bg-red-500/10 p-1 rounded border border-red-500/20">
                          <span className="text-[11px] text-red-600 font-bold px-1">تأكيد الحذف؟</span>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold hover:bg-red-700"
                          >
                            نعم
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-0.5 bg-surface text-ink rounded text-[10px] font-bold border border-line"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => openEditForm(item)}
                            className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink border border-line transition-colors"
                            title="تعديل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-ink-muted hover:text-red-600 border border-line transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Sidebar (Add / Edit) */}
          {isFormOpen && (
            <div className="w-[320px] hairline-r bg-surface-2 p-4 flex flex-col justify-between overflow-y-auto">
              <form onSubmit={handleSaveItem} className="space-y-3">
                <div className="flex items-center justify-between pb-2 hairline-b">
                  <span className="text-xs font-bold text-ink">
                    {editingId ? 'تعديل الصنف السريع' : 'إضافة صنف سريع جديد'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="p-1 rounded text-ink-muted hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Option to Link Product from Inventory */}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsSearchingProduct(!isSearchingProduct)}
                    className="w-full text-xs font-semibold py-1.5 px-2.5 rounded bg-surface border border-line hover:border-brand text-brand flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>{formProductId ? 'تغيير الربط بالمخزن' : 'ربط بمنتج مسجل بالمخزن'}</span>
                  </button>

                  {/* Autocomplete Product Search Box */}
                  {isSearchingProduct && (
                    <div className="mt-2 p-2 bg-surface border border-brand/30 rounded space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-ink-muted" />
                        <input
                          type="text"
                          value={productSearchQuery}
                          onChange={(e) => handleProductSearch(e.target.value)}
                          placeholder="ابحث بالاسم أو الباركود..."
                          className="w-full pr-8 pl-2 py-1.5 text-xs bg-surface-2 border border-line rounded focus:outline-none focus:border-brand"
                          autoFocus
                        />
                      </div>
                      {searchingLoading && (
                        <div className="text-[11px] text-ink-muted text-center py-1">جاري البحث...</div>
                      )}
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectProductToLink(p)}
                            className="w-full text-right p-1.5 rounded hover:bg-brand/10 text-xs flex items-center justify-between transition-colors border border-transparent hover:border-brand/20"
                          >
                            <span className="font-semibold text-ink truncate max-w-[170px]">{p.name}</span>
                            <span className="font-mono text-[10px] text-brand font-bold">
                              {(p.pricePiasters / 100).toFixed(2)} ج.م
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    اسم الزر الظاهر للكاشير *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: خبز بلدي طازج"
                    className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded focus:outline-none focus:border-brand text-ink font-semibold"
                    required
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    <span>التبويب (القسم) *</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded focus:outline-none focus:border-brand text-ink font-semibold"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__new__">+ إضافة تبويب جديد...</option>
                  </select>
                  {formCategory === '__new__' && (
                    <input
                      type="text"
                      value={formNewCategory}
                      onChange={(e) => setFormNewCategory(e.target.value)}
                      placeholder="اكتب اسم التبويب الجديد..."
                      className="w-full mt-1 px-2.5 py-1.5 text-xs bg-surface border border-brand rounded focus:outline-none text-ink font-semibold"
                      required
                    />
                  )}
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-ink-muted">
                      السعر (جنيه) *
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-amber-600 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsOpenPrice}
                        onChange={(e) => setFormIsOpenPrice(e.target.checked)}
                        className="rounded border-line text-brand focus:ring-0"
                      />
                      <span>سعر مفتوح</span>
                    </label>
                  </div>
                  {!formIsOpenPrice && (
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={formPriceEgp}
                      onChange={(e) => setFormPriceEgp(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded focus:outline-none focus:border-brand text-ink font-mono font-bold text-left"
                      required={!formIsOpenPrice}
                    />
                  )}
                </div>

                {/* Unit */}
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    طريقة البيع (الوحدة)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormUnit('piece')}
                      className={`py-1.5 text-xs font-semibold rounded border transition-colors ${
                        formUnit === 'piece' 
                          ? 'bg-brand text-white border-brand' 
                          : 'bg-surface text-ink-muted border-line hover:text-ink'
                      }`}
                    >
                      بالقطعة / بالعدد
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormUnit('kg')}
                      className={`py-1.5 text-xs font-semibold rounded border transition-colors ${
                        formUnit === 'kg' 
                          ? 'bg-brand text-white border-brand' 
                          : 'bg-surface text-ink-muted border-line hover:text-ink'
                      }`}
                    >
                      بالميزان (كجم)
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 text-xs font-bold rounded bg-brand text-white hover:bg-brand-hover transition-colors shadow-sm disabled:opacity-50"
                  >
                    {editingId ? 'حفظ التعديلات' : 'إضافة الصنف'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3 py-2 text-xs font-bold rounded bg-surface border border-line text-ink hover:bg-surface-2 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 hairline-t bg-surface-2 flex items-center justify-between text-xs text-ink-muted">
          <span>إجمالي الأصناف السريعة المسجلة: {items.length} صنف</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-surface border border-line text-ink font-bold hover:bg-surface-2 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
