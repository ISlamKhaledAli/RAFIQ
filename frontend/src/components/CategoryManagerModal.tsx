import { useState, useEffect } from 'react';
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

interface CategoryManagerModalProps {
  onClose: () => void;
  onCategoriesChanged?: () => void;
}

export const CategoryManagerModal = ({ onClose, onCategoriesChanged }: CategoryManagerModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setErrorMessage(null);

    try {
      await invoke('categories:save', {
        name: trimmed,
        displayOrder: categories.length
      });
      setNewCatName('');
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

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg max-h-[92vh] bg-surface rounded-[8px] shadow-2xl border border-line overflow-hidden flex flex-col text-right">
        {/* Modal Header */}
        <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Tags className="w-4 h-4 text-brand" />
            <h3 className="text-[14px] font-bold text-ink m-0">إدارة تصنيفات وأقسام المنتجات</h3>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 flex flex-col gap-3 text-[12px] flex-1 min-h-0 overflow-y-auto">
          {errorMessage && (
            <div className="p-2.5 rounded bg-danger-soft border border-danger-border text-danger flex items-center gap-2 font-bold text-[11.5px]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Add Category Bar */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="اكتب اسم التصنيف الجديد (مثال: مجمدات، عصائر)..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddCategory();
                }
              }}
              className="flex-1 bg-surface border border-line rounded h-[36px] px-3 text-[12.5px] text-ink focus:outline-none focus:border-brand font-sans"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void handleAddCategory()}
              disabled={!newCatName.trim()}
              className="px-3.5 h-[36px] bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة تصنيف</span>
            </button>
          </div>

          {/* Toggle Archived Checkbox */}
          <div className="flex items-center justify-between border-b border-line pb-2 pt-1 text-[11px] text-ink-muted">
            <label className="flex items-center gap-2 cursor-pointer hover:text-ink">
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
            <span>{categories.length} تصنيف مسجل</span>
          </div>

          {/* Categories List */}
          <div className="max-h-[320px] overflow-y-auto divide-y divide-line border border-line rounded bg-surface">
            {categories.length === 0 ? (
              <div className="p-6 text-center text-ink-muted">
                {loading ? 'جاري تحميل التصنيفات...' : 'لا توجد تصنيفات حالياً'}
              </div>
            ) : (
              categories.map((cat, idx) => {
                const isEditing = editingId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`p-2.5 flex items-center justify-between transition-colors ${
                      !cat.isActive ? 'bg-surface-2/70 opacity-70' : 'hover:bg-surface-2/40'
                    }`}
                  >
                    {/* Right side: Reorder + Name */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                      {/* Move Order buttons */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void handleMoveOrder(idx, 'up')}
                          className="p-0.5 text-ink-muted hover:text-ink disabled:opacity-30 rounded hover:bg-surface-2"
                          title="تحريك لأعلى"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === categories.length - 1}
                          onClick={() => void handleMoveOrder(idx, 'down')}
                          className="p-0.5 text-ink-muted hover:text-ink disabled:opacity-30 rounded hover:bg-surface-2"
                          title="تحريك لأسفل"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

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
                            className="flex-1 bg-surface border border-brand rounded h-[28px] px-2 text-[12px] text-ink focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(cat)}
                            className="p-1 rounded bg-brand text-white hover:bg-brand-hover"
                            title="حفظ التعديل"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded bg-surface-2 text-ink-muted hover:text-ink"
                            title="إلغاء"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 truncate">
                          <span className={`font-semibold text-[12.5px] truncate ${cat.isActive ? 'text-ink' : 'line-through text-ink-muted'}`}>
                            {cat.name}
                          </span>
                          {!cat.isActive && (
                            <span className="px-1.5 py-0.2 rounded bg-surface-2 text-[10px] text-ink-muted border border-line">
                              مؤرشف
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Left side: Product Count Badge & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-surface-2 text-ink-muted border border-line" title="عدد الأصناف النشطة في هذا التصنيف">
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
                            className="p-1 text-ink-muted hover:text-brand rounded hover:bg-surface transition-colors"
                            title="إعادة تسمية التصنيف"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleToggleArchive(cat)}
                            className="p-1 text-ink-muted hover:text-danger rounded hover:bg-surface transition-colors"
                            title={cat.isActive ? 'أرشفة التصنيف' : 'إلغاء الأرشفة واستعادة التصنيف'}
                          >
                            {cat.isActive ? (
                              <Archive className="w-3.5 h-3.5" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5 text-paid" />
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
        <div className="h-[44px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted">
          <span>تظهر التصنيفات النشطة تلقائياً كأزرار فلترة وسريعة في شاشة الكاشير والمخزن.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-surface border border-line rounded text-ink hover:bg-surface-2 text-[11.5px] font-bold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
