import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  X,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  AlertCircle,
  Package,
  Search,
  Check,
  Tag,
  FolderPlus,
  Scale,
  Boxes,
  Link2,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { extractProducts, type QuickItem, type Product } from '../types/models';
import { CustomSelect } from './CustomSelect';
import { SegmentedTabs } from './SegmentedTabs';
import { ToggleSwitch } from './ToggleSwitch';
import { useModalDismiss } from '../hooks/useModalDismiss';
import {
  QUICK_FIELD,
  QUICK_BTN,
  QUICK_BTN_SECONDARY,
  QUICK_BTN_PRIMARY,
  FieldLabel,
  FormSection,
  ExtrasSection,
  PriceInput,
  InlineNotice,
  SmallChip,
} from './QuickItemFormParts';

interface QuickItemsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemsChanged?: () => void;
}

const ROW_ICON_BTN =
  'w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';

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

  // Drag-to-reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

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
      const res = await invoke<unknown>('products:search', { query: query.trim(), limit: 8 });
      setSearchResults(extractProducts(res));
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

  const persistOrder = async (reordered: QuickItem[]) => {
    const orderedIds = reordered.map((i) => i.id);
    try {
      await invoke('quickItems:reorder', { orderedIds });
      await fetchItems();
      if (onItemsChanged) onItemsChanged();
    } catch (err: unknown) {
      console.error(err);
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
    await persistOrder(reordered);
  };

  const handleDropOn = async (targetIndex: number) => {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null || from === targetIndex) return;
    const reordered = [...filteredItems];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIndex, 0, moved);
    await persistOrder(reordered);
  };

  const isDirty = isFormOpen && Boolean(formName.trim() || formPriceEgp.trim() || formProductId);

  const handleDismissAction = () => {
    if (isFormOpen) {
      setIsFormOpen(false);
    } else {
      onClose();
    }
  };

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: handleDismissAction,
    isDirty,
    confirmTitle: 'إلغاء تعديل الصنف السريع؟',
    confirmMessage: 'تم إدخال بيانات للصنف. هل أنت متأكد من الإلغاء والتراجع دون حفظ؟',
  });

  if (!isOpen) return null;

  const activeCount = filteredItems.length;
  const formCategoryLabel = formCategory === '__new__' ? formNewCategory.trim() || 'تبويب جديد' : formCategory;
  const formExtrasSummary = `${formCategoryLabel} · ${formUnit === 'kg' ? 'بالوزن' : 'بالقطعة'}${formProductId ? ' · مربوط بالمخزن' : ''}`;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] max-h-[850px] flex flex-col overflow-hidden text-ink dark:text-ink-dark animate-in fade-in zoom-in-95 duration-150"
        dir="rtl"
      >
        {/* Header */}
        <div className="h-16 px-5 flex items-center justify-between gap-3 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="t-modal-title text-ink dark:text-ink-dark leading-tight m-0 truncate">إدارة وترتيب الأزرار السريعة</h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5 m-0 truncate">
                اسحب الصنف من المقبض أو استخدم الأسهم لترتيبه في شاشة الكاشير
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-10 h-10 rounded-lg hover:bg-surface dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer flex items-center justify-center shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div role="alert" className="px-5 py-3 bg-danger-soft dark:bg-danger-dark-soft border-b border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright text-sm font-semibold flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div role="status" className="px-5 py-3 bg-paid-soft dark:bg-paid-dark-soft border-b border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright text-sm font-semibold flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex min-h-0">
          {/* Main List */}
          <div className="flex-1 min-w-0 flex flex-col p-4 gap-3 overflow-y-auto bg-surface dark:bg-surface-dark">
            {/* Category tabs + primary action */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                {categories.map((cat) => {
                  const count = items.filter((i) => (i.categoryName || 'عام') === cat).length;
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setActiveCategory(cat);
                        setIsFormOpen(false);
                        setIsAddingCategory(false);
                        setIsRenamingCategory(false);
                        setDeleteCategoryConfirm(null);
                      }}
                      className={`h-10 px-3 text-sm font-bold rounded-lg border transition-colors flex items-center gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand dark:border-brand-bright'
                          : 'bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-line dark:border-line-dark hover:border-brand/50 dark:hover:border-brand-bright/50 hover:bg-surface-2 dark:hover:bg-surface-dark-3'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className="min-w-6 h-6 px-1.5 rounded-md bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark text-xs font-mono font-extrabold tabular-nums flex items-center justify-center">
                        {count}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(!isAddingCategory);
                    setIsRenamingCategory(false);
                    setDeleteCategoryConfirm(null);
                    setNewCategoryName('');
                  }}
                  className={`h-10 px-3 text-sm font-bold rounded-lg border border-dashed flex items-center gap-2 transition-colors cursor-pointer ${
                    isAddingCategory
                      ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand dark:border-brand-bright'
                      : 'border-line-hover dark:border-line-dark-strong text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft'
                  }`}
                  title="إضافة قسم أو تصنيف جديد للأصناف السريعة"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>تصنيف جديد</span>
                </button>
              </div>

              <button
                type="button"
                onClick={openAddForm}
                className={`${QUICK_BTN} ${QUICK_BTN_PRIMARY} shrink-0`}
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف</span>
              </button>
            </div>

            {/* Active category strip */}
            {activeCategory && (
              <div className="flex items-center justify-between gap-2 bg-surface-2 dark:bg-surface-dark-2 px-3 py-2 rounded-xl border border-line dark:border-line-dark">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-ink-muted dark:text-ink-dark-muted">القسم المحدد</span>
                  <span className="text-sm font-bold text-ink dark:text-ink-dark truncate">{activeCategory}</span>
                  <SmallChip tone="neutral">
                    <span className="font-mono tabular-nums">{activeCount}</span>
                    <span>صنف</span>
                  </SmallChip>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamedCategoryName(activeCategory);
                      setIsRenamingCategory(!isRenamingCategory);
                      setIsAddingCategory(false);
                      setDeleteCategoryConfirm(null);
                    }}
                    className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}
                    title="تعديل اسم هذا القسم"
                  >
                    <Edit2 className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>تعديل الاسم</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDeleteCategoryConfirm(activeCategory);
                      setIsAddingCategory(false);
                      setIsRenamingCategory(false);
                    }}
                    className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY} hover:border-danger/40 dark:hover:border-danger-bright/40`}
                    title="حذف هذا القسم بالكامل"
                  >
                    <Trash2 className="w-4 h-4 text-danger dark:text-danger-bright" />
                    <span>حذف التصنيف</span>
                  </button>
                </div>
              </div>
            )}

            {/* Inline Add Category Form */}
            {isAddingCategory && (
              <form onSubmit={handleAddCategorySubmit} className="p-3 bg-brand-soft dark:bg-brand-dark-soft border border-brand/30 dark:border-brand-bright/30 rounded-xl flex items-center gap-2 animate-in fade-in duration-100">
                <FolderPlus className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="اسم التصنيف الجديد: مشروبات ساخنة، عصائر، إكسسوارات..."
                  className={`${QUICK_FIELD} flex-1`}
                  autoFocus
                />
                <button type="submit" className={`${QUICK_BTN} ${QUICK_BTN_PRIMARY}`}>
                  <Check className="w-4 h-4" />
                  <span>إضافة القسم</span>
                </button>
                <button type="button" onClick={() => setIsAddingCategory(false)} className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}>
                  إلغاء
                </button>
              </form>
            )}

            {/* Inline Rename Category Form */}
            {isRenamingCategory && (
              <form onSubmit={handleRenameCategorySubmit} className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-brand/30 dark:border-brand-bright/30 rounded-xl flex items-center gap-2 animate-in fade-in duration-100">
                <Edit2 className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                <input
                  type="text"
                  value={renamedCategoryName}
                  onChange={(e) => setRenamedCategoryName(e.target.value)}
                  aria-label={`تعديل اسم ${activeCategory}`}
                  className={`${QUICK_FIELD} flex-1`}
                  autoFocus
                />
                <button type="submit" disabled={loading} className={`${QUICK_BTN} ${QUICK_BTN_PRIMARY}`}>
                  <Check className="w-4 h-4" />
                  <span>حفظ الاسم</span>
                </button>
                <button type="button" onClick={() => setIsRenamingCategory(false)} className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}>
                  إلغاء
                </button>
              </form>
            )}

            {/* Delete Category Confirmation */}
            {deleteCategoryConfirm && (
              <div role="alert" className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-100">
                <div className="flex items-center gap-2 text-danger dark:text-danger-bright text-sm font-semibold min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    هل أنت متأكد من حذف قسم <b className="font-extrabold">&quot;{deleteCategoryConfirm}&quot;</b>؟
                    {(() => {
                      const cnt = items.filter((i) => (i.categoryName || 'عام') === deleteCategoryConfirm).length;
                      return cnt > 0 ? ` (سيتم حذف ${cnt} صنف سريع تابع له من شاشة الكاشير)` : ' (القسم فارغ)';
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDeleteCategory(deleteCategoryConfirm)}
                    className={`${QUICK_BTN} bg-danger hover:bg-danger-ink text-white dark:bg-danger-dark-fill dark:hover:bg-danger-dark-fill/90`}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، حذف القسم</span>
                  </button>
                  <button type="button" onClick={() => setDeleteCategoryConfirm(null)} className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}>
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {/* Items list */}
            {loading && items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-ink-muted dark:text-ink-dark-muted">
                جاري التحميل...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center gap-3 p-8 text-center border border-dashed border-line-hover dark:border-line-dark-strong rounded-xl bg-surface-2 dark:bg-surface-dark-2">
                <div className="w-14 h-14 rounded-2xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
                  <Package className="w-7 h-7" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-base font-extrabold text-ink dark:text-ink-dark m-0">مفيش أزرار سريعة في هذا القسم لسه</p>
                  <p className="text-sm text-ink-muted dark:text-ink-dark-muted m-0 max-w-sm leading-relaxed">
                    الأزرار السريعة بتظهر في شاشة البيع وتنزل السلة بنقرة واحدة، مناسبة للأصناف اللي من غير باركود زي الخبز والخضار.
                  </p>
                </div>
                <button type="button" onClick={openAddForm} className={`${QUICK_BTN} ${QUICK_BTN_PRIMARY}`}>
                  <Plus className="w-4 h-4" />
                  <span>إضافة أول صنف</span>
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                {filteredItems.map((item, index) => {
                  const isDropTarget = dragIndex !== null && overIndex === index && dragIndex !== index;
                  const isBundle = Boolean(item.bundleItemsJson) || Boolean(item.bundleItems && item.bundleItems.length > 0);
                  return (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', item.id);
                        setDragIndex(index);
                      }}
                      onDragOver={(e) => {
                        if (dragIndex === null) return;
                        e.preventDefault();
                        if (overIndex !== index) setOverIndex(index);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleDropOn(index);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      className={`min-h-[64px] px-3 py-2 rounded-xl border flex items-center gap-3 transition-colors ${
                        isDropTarget
                          ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-dark-soft'
                          : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:border-brand/50 dark:hover:border-brand-bright/50'
                      } ${dragIndex === index ? 'opacity-50' : ''}`}
                    >
                      <span
                        className="shrink-0 cursor-grab active:cursor-grabbing text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright"
                        title="اسحب لإعادة الترتيب"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-5 h-5" />
                      </span>

                      <span className="w-7 h-7 shrink-0 rounded-md bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted text-xs font-mono font-extrabold tabular-nums flex items-center justify-center">
                        {index + 1}
                      </span>

                      {/* Item Details */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <span className="text-sm font-bold text-ink dark:text-ink-dark truncate" title={item.name}>{item.name}</span>
                        {(item.productId || item.unit === 'kg' || isBundle) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.productId && (
                              <SmallChip tone="brand">
                                <Link2 className="w-3 h-3" />
                                <span>مربوط بالمخزن</span>
                              </SmallChip>
                            )}
                            {item.unit === 'kg' && (
                              <SmallChip tone="warn">
                                <Scale className="w-3 h-3" />
                                <span>بالوزن</span>
                              </SmallChip>
                            )}
                            {isBundle && (
                              <SmallChip tone="ok">
                                <Boxes className="w-3 h-3" />
                                <span>عرض كومبو</span>
                              </SmallChip>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="shrink-0 text-left min-w-[84px]">
                        {item.isOpenPrice ? (
                          <SmallChip tone="warn">سعر حر</SmallChip>
                        ) : (
                          <span className="font-mono tabular-nums font-extrabold text-base text-paid dark:text-paid-bright">
                            {(item.pricePiasters / 100).toFixed(2)} <span className="text-xs font-bold">ج.م</span>
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {deleteConfirmId === item.id ? (
                          <div className="flex items-center gap-1.5 bg-danger-soft dark:bg-danger-dark-soft px-2 py-1 rounded-lg border border-danger-border dark:border-danger-bright/30">
                            <span className="text-xs text-danger dark:text-danger-bright font-bold">تأكيد الحذف؟</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="h-8 px-3 bg-danger hover:bg-danger-ink dark:bg-danger-dark-fill text-white rounded-md text-xs font-bold cursor-pointer"
                            >
                              نعم
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="h-8 px-3 bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark rounded-md text-xs font-bold border border-line dark:border-line-dark cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMove(index, 'up')}
                              disabled={index === 0}
                              className={`${ROW_ICON_BTN} hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright`}
                              title="تحريك لأعلى"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMove(index, 'down')}
                              disabled={index === filteredItems.length - 1}
                              className={`${ROW_ICON_BTN} hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright`}
                              title="تحريك لأسفل"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditForm(item)}
                              className={`${ROW_ICON_BTN} hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft`}
                              title="تعديل"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(item.id)}
                              className={`${ROW_ICON_BTN} hover:text-danger dark:hover:text-danger-bright hover:border-danger dark:hover:border-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft`}
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Form Sidebar (Add / Edit) */}
          {isFormOpen && (
            <aside className="w-[380px] shrink-0 border-r border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex flex-col min-h-0 animate-in slide-in-from-left-2 duration-150">
              <form key={editingId ?? 'new'} onSubmit={handleSaveItem} className="flex-1 min-h-0 flex flex-col">
                <div className="h-14 px-5 flex items-center justify-between border-b border-line dark:border-line-dark shrink-0">
                  <span className="text-sm font-extrabold text-ink dark:text-ink-dark">
                    {editingId ? 'تعديل الصنف السريع' : 'إضافة صنف سريع جديد'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
                    title="إغلاق النموذج"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                  <FormSection title="الأساسيات">
                    {formProductId && (
                      <InlineNotice tone="brand" icon={<Link2 className="w-4 h-4 shrink-0 mt-0.5" />}>
                        الزر مربوط بصنف من المخزن (بيتخصم من رصيده عند البيع).
                      </InlineNotice>
                    )}

                    <label className="block">
                      <FieldLabel required>اسم الزر الظاهر للكاشير</FieldLabel>
                      <div className="relative">
                        <Tag className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="مثال: خبز بلدي طازج"
                          className={`${QUICK_FIELD} pr-9 font-semibold`}
                          required
                        />
                      </div>
                    </label>

                    <label className="block">
                      <FieldLabel required={!formIsOpenPrice}>السعر (جنيه)</FieldLabel>
                      <PriceInput
                        value={formPriceEgp}
                        onChange={setFormPriceEgp}
                        step="0.25"
                        min="0"
                        required={!formIsOpenPrice}
                        disabled={formIsOpenPrice}
                        placeholder={formIsOpenPrice ? 'سعر حر' : '0.00'}
                      />
                    </label>
                    <ToggleSwitch
                      size="sm"
                      checked={formIsOpenPrice}
                      onChange={setFormIsOpenPrice}
                      label="سعر حر"
                      description="الكاشير يكتب السعر عند البيع"
                    />
                  </FormSection>

                  <ExtrasSection summary={formExtrasSummary}>
                    <div>
                      <FieldLabel>ربط بالمخزن</FieldLabel>
                      <button
                        type="button"
                        onClick={() => setIsSearchingProduct(!isSearchingProduct)}
                        className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY} w-full`}
                      >
                        <Package className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>{formProductId ? 'تغيير الربط بالمخزن' : 'ربط بمنتج مسجل بالمخزن'}</span>
                      </button>

                      {isSearchingProduct && (
                        <div className="mt-2 p-2 bg-surface dark:bg-surface-dark-3 border border-brand/30 dark:border-brand-bright/30 rounded-lg flex flex-col gap-2">
                          <div className="relative">
                            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted pointer-events-none" />
                            <input
                              type="text"
                              value={productSearchQuery}
                              onChange={(e) => handleProductSearch(e.target.value)}
                              placeholder="ابحث بالاسم أو الباركود..."
                              className={`${QUICK_FIELD} pr-9`}
                              autoFocus
                            />
                          </div>
                          {searchingLoading && (
                            <div className="text-xs text-ink-muted dark:text-ink-dark-muted text-center py-1">جاري البحث...</div>
                          )}
                          {searchResults.length > 0 && (
                            <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
                              {searchResults.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => selectProductToLink(p)}
                                  className="w-full min-h-10 text-right px-2 py-1.5 rounded-md hover:bg-brand-soft dark:hover:bg-brand-dark-soft text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                >
                                  <span className="font-semibold text-ink dark:text-ink-dark truncate">{p.name}</span>
                                  <span className="font-mono tabular-nums text-xs text-brand dark:text-brand-bright font-bold shrink-0">
                                    {(p.pricePiasters / 100).toFixed(2)} ج.م
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <FieldLabel required>التبويب (القسم)</FieldLabel>
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
                          className={`${QUICK_FIELD} mt-2 border-brand dark:border-brand-bright`}
                          required
                        />
                      )}
                    </div>

                    <div>
                      <FieldLabel>طريقة البيع (الوحدة)</FieldLabel>
                      <SegmentedTabs
                        ariaLabel="وحدة الصنف السريع"
                        fullWidth
                        value={formUnit === 'kg' ? 'kg' : 'piece'}
                        onChange={setFormUnit}
                        options={[
                          { value: 'piece', label: 'بالقطعة / بالعدد', icon: Package },
                          { value: 'kg', label: 'بالميزان (كجم)', icon: Scale },
                        ]}
                      />
                    </div>
                  </ExtrasSection>
                </div>

                <div className="px-5 py-3 border-t border-line dark:border-line-dark flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`${QUICK_BTN} ${QUICK_BTN_PRIMARY} flex-1`}
                  >
                    {editingId ? 'حفظ التعديلات' : 'إضافة الصنف'}
                  </button>
                  <button
                    type="button"
                    onClick={requestClose}
                    className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between text-sm text-ink-muted dark:text-ink-dark-muted shrink-0">
          <span className="flex items-center gap-2">
            <span>إجمالي الأصناف السريعة المسجلة</span>
            <span className="min-w-7 h-7 px-2 rounded-lg bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark text-sm font-mono font-extrabold tabular-nums flex items-center justify-center">
              {items.length}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
