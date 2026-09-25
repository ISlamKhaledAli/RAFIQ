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
  Tag,
  FolderPlus
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { QuickItem, Product } from '../types/models';
import { CustomSelect } from './CustomSelect';

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

  // Category Management State
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isRenamingCategory, setIsRenamingCategory] = useState(false);
  const [renamedCategoryName, setRenamedCategoryName] = useState('');
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<string | null>(null);

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

  const categories = Array.from(new Set([...customCategories, ...items.map((i) => i.categoryName || 'عام')]));
  if (categories.length === 0) categories.push('عام');

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setErrorMessage('يرجى كتابة اسم التصنيف الجديد');
      return;
    }
    if (categories.includes(trimmed)) {
      setErrorMessage('هذا التصنيف موجود بالفعل');
      return;
    }
    setCustomCategories((prev) => [...prev, trimmed]);
    setActiveCategory(trimmed);
    setNewCategoryName('');
    setIsAddingCategory(false);
    setSuccessMessage(`تم إنشاء قسم "${trimmed}" بنجاح، يمكنك الآن إضافة أصناف إليه`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleRenameCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = renamedCategoryName.trim();
    if (!trimmed) {
      setErrorMessage('يرجى كتابة اسم التصنيف الجديد');
      return;
    }
    if (trimmed === activeCategory) {
      setIsRenamingCategory(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      await invoke('quickItems:renameCategory', { oldName: activeCategory, newName: trimmed });
      setCustomCategories((prev) => prev.map((c) => (c === activeCategory ? trimmed : c)));
      setActiveCategory(trimmed);
      setIsRenamingCategory(false);
      setSuccessMessage(`تم تعديل اسم القسم إلى "${trimmed}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchItems();
      if (onItemsChanged) onItemsChanged();
    } catch {
      setErrorMessage('تعذر تعديل اسم القسم');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    const itemsInCat = items.filter((i) => (i.categoryName || 'عام') === catToDelete);
    setLoading(true);
    setErrorMessage(null);
    try {
      if (itemsInCat.length > 0) {
        await invoke('quickItems:deleteCategory', { categoryName: catToDelete });
      }
      setCustomCategories((prev) => prev.filter((c) => c !== catToDelete));
      const remaining = categories.filter((c) => c !== catToDelete);
      setActiveCategory(remaining.length > 0 ? remaining[0] : 'عام');
      setDeleteCategoryConfirm(null);
      setSuccessMessage(`تم حذف قسم "${catToDelete}" بنجاح`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchItems();
      if (onItemsChanged) onItemsChanged();
    } catch {
      setErrorMessage('تعذر حذف القسم، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

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
        className="bg-surface border border-line rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] max-h-[850px] flex flex-col overflow-hidden text-ink animate-in fade-in zoom-in-95 duration-150"
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
            <div className="flex flex-col gap-2 mb-3 pb-2 hairline-b">
              <div className="flex items-center justify-between gap-2">
                {/* Category Pills & Add Category Button */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
                  {categories.map((cat) => {
                    const count = items.filter((i) => (i.categoryName || 'عام') === cat).length;
                    const isActive = activeCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setActiveCategory(cat);
                          setIsFormOpen(false);
                          setIsAddingCategory(false);
                          setIsRenamingCategory(false);
                          setDeleteCategoryConfirm(null);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 flex items-center gap-1.5 shadow-2xs border ${
                          isActive 
                            ? 'bg-brand text-white border-brand shadow-sm ring-2 ring-brand/20' 
                            : 'bg-surface text-slate-700 border-slate-300 hover:border-brand/70 hover:bg-brand-soft/40 hover:text-brand hover:shadow-xs hover:-translate-y-0.5'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                          isActive 
                            ? 'bg-white/25 text-white' 
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  {/* Add Category Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory(!isAddingCategory);
                      setIsRenamingCategory(false);
                      setDeleteCategoryConfirm(null);
                      setNewCategoryName('');
                    }}
                    className={`h-[32px] px-3 text-xs font-bold rounded-lg border-2 flex items-center gap-1.5 shrink-0 transition-all shadow-2xs ${
                      isAddingCategory 
                        ? 'bg-brand text-white border-brand shadow-sm' 
                        : 'border-dashed border-brand/60 bg-brand-soft/30 text-brand hover:bg-brand hover:text-white hover:border-brand hover:shadow-xs hover:-translate-y-0.5'
                    }`}
                    title="إضافة قسم أو تصنيف جديد للأصناف السريعة"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>+ إضافة تصنيف</span>
                  </button>
                </div>

                {/* Main Action: Add Quick Item */}
                <button
                  onClick={openAddForm}
                  className="h-8 px-3 text-xs font-bold rounded bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-1 shrink-0 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة صنف</span>
                </button>
              </div>

              {/* Active Category Controls Strip */}
              {activeCategory && (
                <div className="flex items-center justify-between bg-surface-2 px-2.5 py-1.5 rounded border border-line text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted">القسم المحدد:</span>
                    <span className="font-bold text-ink">{activeCategory}</span>
                    <span className="text-[10px] text-ink-muted font-mono">
                      ({items.filter((i) => (i.categoryName || 'عام') === activeCategory).length} صنف)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamedCategoryName(activeCategory);
                        setIsRenamingCategory(!isRenamingCategory);
                        setIsAddingCategory(false);
                        setDeleteCategoryConfirm(null);
                      }}
                      className="px-2.5 py-1 rounded-md bg-surface border border-slate-300 hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-slate-700 flex items-center gap-1.5 text-[11px] font-bold shadow-2xs transition-all hover:-translate-y-0.5"
                      title="تعديل اسم هذا القسم"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-brand" />
                      <span>تعديل الاسم</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteCategoryConfirm(activeCategory);
                        setIsAddingCategory(false);
                        setIsRenamingCategory(false);
                      }}
                      className="px-2.5 py-1 rounded-md bg-surface border border-slate-300 hover:border-danger hover:text-danger hover:bg-danger-soft/40 text-slate-700 flex items-center gap-1.5 text-[11px] font-bold shadow-2xs transition-all hover:-translate-y-0.5"
                      title="حذف هذا القسم بالكامل"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-danger" />
                      <span>حذف التصنيف</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Add Category Form */}
              {isAddingCategory && (
                <form onSubmit={handleAddCategorySubmit} className="p-2.5 bg-brand-soft/40 border border-brand/40 rounded flex items-center gap-2 animate-in fade-in duration-100">
                  <FolderPlus className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-xs font-bold text-brand shrink-0">اسم التصنيف الجديد:</span>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="مثال: مشروبات ساخنة، عصائر فريش، إكسسوارات..."
                    className="flex-1 h-7 px-2.5 text-xs bg-surface border border-line rounded focus:outline-none focus:border-brand font-semibold text-ink"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="h-7 px-3 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded flex items-center gap-1 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>إضافة القسم</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="h-7 px-2.5 bg-surface hover:bg-surface-2 text-ink-muted text-xs rounded border border-line"
                  >
                    إلغاء
                  </button>
                </form>
              )}

              {/* Inline Rename Category Form */}
              {isRenamingCategory && (
                <form onSubmit={handleRenameCategorySubmit} className="p-2.5 bg-surface-2 border border-brand/40 rounded flex items-center gap-2 animate-in fade-in duration-100">
                  <Edit2 className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-xs font-bold text-ink shrink-0">تعديل اسم ({activeCategory}):</span>
                  <input
                    type="text"
                    value={renamedCategoryName}
                    onChange={(e) => setRenamedCategoryName(e.target.value)}
                    className="flex-1 h-7 px-2.5 text-xs bg-surface border border-line rounded focus:outline-none focus:border-brand font-semibold text-ink"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-7 px-3 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded flex items-center gap-1 shadow-xs disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>حفظ الاسم</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenamingCategory(false)}
                    className="h-7 px-2.5 bg-surface hover:bg-surface-2 text-ink-muted text-xs rounded border border-line"
                  >
                    إلغاء
                  </button>
                </form>
              )}

              {/* Delete Category Confirmation Alert */}
              {deleteCategoryConfirm && (
                <div className="p-3 bg-danger-soft border border-danger-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-100">
                  <div className="flex items-center gap-2 text-danger text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      هل أنت متأكد من حذف قسم <b className="font-bold text-ink">"{deleteCategoryConfirm}"</b>؟
                      {(() => {
                        const cnt = items.filter((i) => (i.categoryName || 'عام') === deleteCategoryConfirm).length;
                        return cnt > 0 ? ` (سيتم حذف ${cnt} صنف سريع تابع له من شاشة الكاشير)` : ' (القسم فارغ)';
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleDeleteCategory(deleteCategoryConfirm)}
                      className="h-7 px-3 bg-danger hover:bg-red-700 text-white text-xs font-bold rounded flex items-center gap-1 shadow-xs disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>نعم، حذف القسم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteCategoryConfirm(null)}
                      className="h-7 px-2.5 bg-surface hover:bg-surface-2 text-ink text-xs font-semibold rounded border border-line"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
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
              <div className={isFormOpen ? "flex flex-col gap-2.5" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
                {filteredItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-surface border border-slate-200 rounded-lg flex items-center justify-between hover:border-brand/60 hover:shadow-xs transition-all"
                  >
                    <div className="flex items-center gap-3">
                      {/* Reorder Buttons */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleMove(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded bg-surface border border-slate-200 text-slate-600 hover:text-brand hover:border-brand disabled:opacity-20 shadow-2xs transition-all"
                          title="تحريك لأعلى"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMove(index, 'down')}
                          disabled={index === filteredItems.length - 1}
                          className="p-1 rounded bg-surface border border-slate-200 text-slate-600 hover:text-brand hover:border-brand disabled:opacity-20 shadow-2xs transition-all"
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
                            className="p-1.5 rounded-md bg-surface border border-slate-300 hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-slate-600 shadow-2xs transition-all hover:-translate-y-0.5"
                            title="تعديل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-1.5 rounded-md bg-surface border border-slate-300 hover:border-danger hover:text-danger hover:bg-danger-soft/40 text-slate-600 shadow-2xs transition-all hover:-translate-y-0.5"
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
            <div className="w-[360px] hairline-r bg-surface-2 p-5 flex flex-col justify-between overflow-y-auto shrink-0 animate-in slide-in-from-left-2 duration-150">
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
                  <CustomSelect
                    value={formCategory}
                    onChange={(val) => setFormCategory(val)}
                    options={[
                      ...categories.map((c) => ({ value: c, label: c })),
                      { value: '__new__', label: '+ إضافة تبويب جديد...', isAction: true }
                    ]}
                  />
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
