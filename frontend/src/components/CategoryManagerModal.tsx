import React, { useState, useEffect } from 'react';
import { 
  Tags, 
  Plus, 
  X, 
  Edit2, 
  Check, 
  Archive, 
  RotateCcw, 
  ArrowUp, 
  ArrowDown, 
  AlertCircle
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Category } from '../types/models';
import { 
  getCustomCategoryIconKey,
  setCustomCategoryIcon, 
  detectSmartCategoryIconKey,
  CATEGORY_ICON_MAP,
  CATEGORY_ICONS_CHANGED_EVENT 
} from '../utils/categoryIcons';
import { CategoryIconPickerModal } from './CategoryIconPickerModal';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface CategoryManagerModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onCategoriesChanged?: () => void;
}

const CategoryIconDisplay = ({ 
  name, 
  id, 
  customKey, 
  className = 'w-4 h-4' 
}: { 
  name: string; 
  id?: string; 
  customKey?: string | null; 
  className?: string;
}) => {
  const effectiveKey = customKey || getCustomCategoryIconKey(name, id) || detectSmartCategoryIconKey(name);
  const IconCmp = CATEGORY_ICON_MAP[effectiveKey] || CATEGORY_ICON_MAP.Package;
  return React.createElement(IconCmp, { className });
};

export const CategoryManagerModal = ({ onClose, onCategoriesChanged }: CategoryManagerModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCustomIcon, setNewCatCustomIcon] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickingCategory, setPickingCategory] = useState<{ id?: string; name: string } | null>(null);
  const [, setIconsTick] = useState(0);

  const fetchCategories = async (incArch = includeArchived) => {
    setLoading(true);
    try {
      const res = await invoke<Category[]>('categories:getAll', { includeArchived: incArch });
      if (Array.isArray(res)) {
        setCategories(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`فشل تحميل التصنيفات: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await invoke<Category[]>('categories:getAll', { includeArchived: false });
        if (active && Array.isArray(res)) {
          setCategories(res);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleIconsChanged = () => setIconsTick((t) => t + 1);
    window.addEventListener(CATEGORY_ICONS_CHANGED_EVENT, handleIconsChanged);
    return () => window.removeEventListener(CATEGORY_ICONS_CHANGED_EVENT, handleIconsChanged);
  }, []);

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setErrorMessage(null);

    try {
      const res = await invoke<Category>('categories:save', {
        name: trimmed,
        displayOrder: categories.length
      });
      if (newCatCustomIcon) {
        setCustomCategoryIcon(res?.id || trimmed, newCatCustomIcon);
      }
      setNewCatName('');
      setNewCatCustomIcon(null);
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  const handleSaveEdit = async (cat: Category) => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === cat.name) {
      setEditingId(null);
      return;
    }
    setErrorMessage(null);

    try {
      await invoke('categories:save', {
        id: cat.id,
        name: trimmed,
        displayOrder: cat.displayOrder,
        isActive: cat.isActive
      });
      const existingCustom = getCustomCategoryIconKey(cat.name, cat.id);
      if (existingCustom) {
        setCustomCategoryIcon(cat.id, existingCustom);
        setCustomCategoryIcon(trimmed, existingCustom);
      }
      setEditingId(null);
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  const handleToggleArchive = async (cat: Category) => {
    setErrorMessage(null);
    try {
      await invoke('categories:archive', {
        id: cat.id,
        isArchived: cat.isActive // toggle: if active, archive it
      });
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= categories.length) return;

    const list = [...categories];
    const [moved] = list.splice(index, 1);
    list.splice(newIdx, 0, moved);

    setCategories(list);
    try {
      await invoke('categories:reorder', {
        orderedIds: list.map(c => c.id)
      });
      onCategoriesChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      await fetchCategories();
    }
  };

  const isDirty = Boolean(newCatName.trim() || editingId !== null);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: true,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل إدخال التصنيف؟',
    confirmMessage: 'هناك بيانات أو تعديلات مدخلة على التصنيف، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة التعديل',
  });

  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-ink/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div className="w-full max-w-3xl max-h-[88vh] bg-surface dark:bg-surface-dark rounded-[8px] shadow-2xl border border-line dark:border-line-dark overflow-hidden flex flex-col text-right text-ink dark:text-ink-dark">
          {/* Modal Header */}
          <div className="h-[48px] bg-surface-2 dark:bg-surface-dark-2 hairline-b border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-brand dark:text-brand-bright" />
              <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">إدارة تصنيفات وأقسام المنتجات</h3>
            </div>
            <button
              type="button"
              onClick={() => void requestClose()}
              className="text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright p-1 rounded transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 flex flex-col gap-3 text-xs flex-1 min-h-0 overflow-y-auto bg-surface dark:bg-surface-dark">
            {errorMessage && (
              <div className="p-2.5 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger/30 text-danger dark:text-danger-bright flex items-center gap-2 font-bold text-micro">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Add Category Bar with Live Icon Selector */}
            <div className="flex items-center gap-2">
              {/* Icon selector button for the new category */}
              <button
                type="button"
                onClick={() => setPickingCategory({ name: newCatName || 'تصنيف جديد' })}
                className="h-[36px] px-2.5 rounded bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:bg-brand-soft/40 dark:hover:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="تخصيص أيقونة هذا القسم الجديد"
              >
                <CategoryIconDisplay name={newCatName} customKey={newCatCustomIcon} className="w-4 h-4" />
                <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted hidden sm:inline">
                  {newCatCustomIcon ? 'مخصصة' : 'تلقائي'}
                </span>
              </button>

              <input
                type="text"
                placeholder="اكتب اسم التصنيف الجديد (مثال: مجمدات، عصائر، مخبوزات)..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddCategory();
                  }
                }}
                className="flex-1 bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-[36px] px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-sans"
                autoFocus
              />
              <button
                type="button"
                onClick={() => void handleAddCategory()}
                disabled={!newCatName.trim()}
                className="px-3.5 h-[36px] bg-brand dark:bg-brand-container hover:bg-brand-hover dark:hover:bg-brand disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted dark:disabled:text-ink-dark-muted text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة تصنيف</span>
              </button>
            </div>

            {/* Toggle Archived Checkbox */}
            <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-2 pt-1 text-micro text-ink-muted dark:text-ink-dark-muted">
              <label className="flex items-center gap-2 cursor-pointer hover:text-ink dark:hover:text-ink-dark">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => {
                    setIncludeArchived(e.target.checked);
                    void fetchCategories(e.target.checked);
                  }}
                  className="w-3.5 h-3.5 accent-brand rounded"
                />
                <span>إظهار التصنيفات المؤرشفة</span>
              </label>
              <span>{categories.length} تصنيف مسجل (انقر على أيقونة أي قسم لتغييرها)</span>
            </div>

            {/* Categories List */}
            <div className="max-h-[320px] overflow-y-auto divide-y divide-line dark:divide-line-dark border border-line dark:border-line-dark rounded bg-surface dark:bg-surface-dark">
              {categories.length === 0 ? (
                <div className="p-6 text-center text-ink-muted dark:text-ink-dark-muted">
                  {loading ? 'جاري تحميل التصنيفات...' : 'لا توجد تصنيفات حالياً'}
                </div>
              ) : (
                categories.map((cat, idx) => {
                  const isEditing = editingId === cat.id;
                  const hasCustom = !!getCustomCategoryIconKey(cat.name, cat.id);

                  return (
                    <div
                      key={cat.id}
                      className={`p-2.5 flex items-center justify-between transition-colors ${
                        !cat.isActive ? 'bg-surface-2/70 dark:bg-surface-dark-2/70 opacity-70' : 'hover:bg-surface-2/40 dark:hover:bg-surface-dark-2'
                      }`}
                    >
                      {/* Right side: Reorder + Icon + Name */}
                      <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                        {/* Move Order buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMoveOrder(idx, 'up')}
                            className="p-0.5 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark disabled:opacity-30 rounded hover:bg-surface-2 dark:hover:bg-surface-dark-3 cursor-pointer"
                            title="تحريك لأعلى"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === categories.length - 1}
                            onClick={() => void handleMoveOrder(idx, 'down')}
                            className="p-0.5 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark disabled:opacity-30 rounded hover:bg-surface-2 dark:hover:bg-surface-dark-3 cursor-pointer"
                            title="تحريك لأسفل"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Interactive Category Icon Button */}
                        <button
                          type="button"
                          onClick={() => setPickingCategory({ id: cat.id, name: cat.name })}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 relative group ${
                            hasCustom
                              ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright border-brand dark:border-brand-bright shadow-xs'
                              : 'bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand-soft dark:hover:bg-brand-dark-soft border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 text-brand dark:text-brand-bright'
                          }`}
                          title={`أيقونة القسم: ${cat.name} (انقر لتغييرها أو استعادة التلقائي)`}
                        >
                          <CategoryIconDisplay name={cat.name} id={cat.id} className="w-4 h-4 transition-transform group-hover:scale-110" />
                        </button>

                        {/* Name or Input */}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveEdit(cat);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="flex-1 bg-surface dark:bg-surface-dark-2 border border-brand dark:border-brand-bright rounded h-[28px] px-2 text-xs text-ink dark:text-ink-dark focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(cat)}
                              className="p-1 rounded bg-brand dark:bg-brand-container text-white hover:bg-brand-hover dark:hover:bg-brand cursor-pointer"
                              title="حفظ التعديل"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
                              title="إلغاء"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 truncate">
                            <span className={`font-semibold text-xs truncate ${cat.isActive ? 'text-ink dark:text-ink-dark' : 'line-through text-ink-muted dark:text-ink-dark-muted'}`}>
                              {cat.name}
                            </span>
                            {!cat.isActive && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-2 dark:bg-surface-dark-3 text-micro text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark">
                                مؤرشف
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Left side: Product Count Badge & Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-micro px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark" title="عدد الأصناف النشطة في هذا التصنيف">
                          {cat.productCount} صنف
                        </span>

                        {!isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(cat.id);
                                setEditingName(cat.name);
                              }}
                              className="p-1 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright rounded hover:bg-surface dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
                              title="إعادة تسمية التصنيف"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleToggleArchive(cat)}
                              className="p-1 text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright rounded hover:bg-surface dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
                              title={cat.isActive ? 'أرشفة التصنيف' : 'إلغاء الأرشفة واستعادة التصنيف'}
                            >
                              {cat.isActive ? (
                                <Archive className="w-3.5 h-3.5" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="h-[44px] bg-surface-2 dark:bg-surface-dark-2 hairline-t border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted">
            <span>تتعرف المنظومة الذكية تلقائياً على أنسب أيقونة لكل قسم، كما يمكنك تغيير أيقونة أي قسم يدوياً بالضغط عليها.</span>
            <button
              type="button"
              onClick={() => void requestClose()}
              className="px-3 py-1 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark text-micro font-bold cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>

      {/* Icon Picker Sub-modal */}
      {pickingCategory && (
        <CategoryIconPickerModal
          categoryName={pickingCategory.name}
          categoryId={pickingCategory.id}
          onClose={() => setPickingCategory(null)}
          onIconSelected={(iconKey) => {
            if (!pickingCategory.id) {
              setNewCatCustomIcon(iconKey);
            } else {
              setIconsTick((t) => t + 1);
              onCategoriesChanged?.();
            }
          }}
        />
      )}
    </>
  );
};
