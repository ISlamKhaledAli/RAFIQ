import React, { useState, useEffect } from 'react';
import { X, Sliders, Plus, Trash2, Link2, CheckCircle2 } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { formatArabicCurrency } from '../utils/money';
import type { ModifierGroup } from '../types/cafe';
import type { Product } from '../types/models';

interface ModifierManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialProductId?: string;
}

export const ModifierManagerModal: React.FC<ModifierManagerModalProps> = ({
  isOpen,
  onClose,
  products,
  initialProductId,
}) => {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newSelectionType, setNewSelectionType] = useState<'single' | 'multiple'>('multiple');
  const [newIsRequired, setNewIsRequired] = useState(false);

  // Create Option Form
  const [newOptName, setNewOptName] = useState('');
  const [newOptPriceEgp, setNewOptPriceEgp] = useState('0');
  const [newOptIngredientId, setNewOptIngredientId] = useState('');
  const [newOptIngredientQtyUnits, setNewOptIngredientQtyUnits] = useState('0');
  const [newOptIsDefault, setNewOptIsDefault] = useState(false);

  // Product Linking State
  const [targetProductId, setTargetProductId] = useState<string>(initialProductId || '');
  const [linkedGroupIds, setLinkedGroupIds] = useState<string[]>([]);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await invoke<ModifierGroup[]>('modifiers:getGroups', { includeInactive: false });
      if (Array.isArray(data)) {
        setGroups(data);
        if (!selectedGroupId && data.length > 0) {
          setSelectedGroupId(data[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    if (initialProductId) setTargetProductId(initialProductId);
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialProductId]);

  useEffect(() => {
    if (!isOpen || !targetProductId) {
      setLinkedGroupIds([]);
      return;
    }
    invoke<ModifierGroup[]>('modifiers:getForProduct', { productId: targetProductId })
      .then((data) => {
        if (Array.isArray(data)) {
          setLinkedGroupIds(data.map((g) => g.id));
        }
      })
      .catch(() => {});
  }, [targetProductId, isOpen]);

  if (!isOpen) return null;

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const created = await invoke<ModifierGroup>('modifiers:saveGroup', {
        name: newGroupName.trim(),
        selectionType: newSelectionType,
        isRequired: newIsRequired,
        minSelections: newIsRequired ? 1 : 0,
        maxSelections: newSelectionType === 'single' ? 1 : 5,
        isActive: true,
      });
      if (created) {
        setNewGroupName('');
        setSelectedGroupId(created.id);
        setSuccessMsg('تم إنشاء مجموعة الإضافات بنجاح.');
        await fetchGroups();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل إنشاء المجموعة');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await invoke('modifiers:deleteGroup', { id: groupId });
      if (selectedGroupId === groupId) setSelectedGroupId('');
      fetchGroups();
    } catch {
      // ignore
    }
  };

  const handleCreateOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !newOptName.trim()) return;
    const extraPricePiasters = Math.max(0, Math.round((parseFloat(newOptPriceEgp || '0') || 0) * 100));
    const linkedQtyMilli = Math.max(0, Math.round((parseFloat(newOptIngredientQtyUnits || '0') || 0) * 1000));

    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke('modifiers:saveOption', {
        groupId: selectedGroup.id,
        name: newOptName.trim(),
        extraPricePiasters,
        linkedIngredientId: newOptIngredientId || null,
        linkedQtyMilli,
        isDefault: newOptIsDefault,
        isActive: true,
      });
      setNewOptName('');
      setNewOptPriceEgp('0');
      setNewOptIngredientId('');
      setNewOptIngredientQtyUnits('0');
      setNewOptIsDefault(false);
      setSuccessMsg('تمت إضافة الخيار للمجموعة بنجاح.');
      await fetchGroups();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل حفظ خيار الإضافة');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    try {
      await invoke('modifiers:deleteOption', { id: optionId });
      fetchGroups();
    } catch {
      // ignore
    }
  };

  const handleSaveProductLinks = async () => {
    if (!targetProductId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke('modifiers:linkProduct', {
        productId: targetProductId,
        groupIds: linkedGroupIds,
      });
      setSuccessMsg('تم ربط مجموعات الإضافات المحددة بالصنف بنجاح.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل ربط المجموعات بالصنف');
    } finally {
      setLoading(false);
    }
  };

  const toggleLinkGroup = (gid: string) => {
    setLinkedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line bg-surface-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-ink">إدارة مجموعات الإضافات وتخصيصات الأصناف (Modifiers)</h2>
              <p className="text-xs text-ink-muted font-bold">
                تعريف مجموعات التخصيص (مستوى السكر، نوع الحليب، الصوصات، الإضافات المدفوعة) وربطها بأصناف المنيو
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-surface border border-line text-ink-muted hover:text-danger"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {(errorMsg || successMsg) && (
          <div className="px-6 pt-3">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-black">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-paid/10 border border-paid/30 text-paid text-xs font-black">
                {successMsg}
              </div>
            )}
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Groups List & Create Group */}
          <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-4">
            <h3 className="text-sm font-black text-ink">1. مجموعات الإضافات ({groups.length})</h3>
            <form onSubmit={handleCreateGroup} className="space-y-2.5 bg-surface p-3 rounded-xl border border-line">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="اسم المجموعة (مثال: مستوى السكر / إضافات البرجر)"
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink"
              />
              <div className="grid grid-cols-2 gap-2">
                <CustomSelect
                  value={newSelectionType}
                  onChange={(v) => setNewSelectionType(v as 'single' | 'multiple')}
                  options={[
                    { value: 'single', label: 'اختيار واحد' },
                    { value: 'multiple', label: 'اختيار متعدد' },
                  ]}
                />
                <label className="flex items-center gap-1.5 text-xs font-bold text-ink px-2">
                  <input
                    type="checkbox"
                    checked={newIsRequired}
                    onChange={(e) => setNewIsRequired(e.target.checked)}
                    className="rounded border-line text-brand"
                  />
                  <span>اختيار إجباري</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-xl bg-brand text-white text-xs font-black flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء مجموعة إضافات</span>
              </button>
            </form>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {groups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                    selectedGroupId === g.id
                      ? 'bg-brand/10 border-brand text-ink'
                      : 'bg-surface border-line text-ink hover:border-brand/40'
                  }`}
                >
                  <div>
                    <div className="text-xs font-black">{g.name}</div>
                    <div className="text-[11px] text-ink-muted font-bold">
                      {(g.options || []).length} خيارات • {g.selectionType === 'single' ? 'واحد' : 'متعدد'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteGroup(g.id);
                    }}
                    className="p-1 text-ink-muted hover:text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Middle: Options inside Selected Group */}
          <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-4">
            <h3 className="text-sm font-black text-ink">
              2. خيارات المجموعة: {selectedGroup ? selectedGroup.name : 'اختر مجموعة'}
            </h3>

            {selectedGroup ? (
              <>
                <form onSubmit={handleCreateOption} className="space-y-2.5 bg-surface p-3 rounded-xl border border-line">
                  <input
                    type="text"
                    value={newOptName}
                    onChange={(e) => setNewOptName(e.target.value)}
                    placeholder="اسم الخيار (مثال: جبنة شيدر إضافية / حليب لوز)"
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-ink-muted font-bold mb-0.5">السعر الإضافي (ج.م)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={newOptPriceEgp}
                        onChange={(e) => setNewOptPriceEgp(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface-2 border border-line text-xs font-black text-brand"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-ink">
                        <input
                          type="checkbox"
                          checked={newOptIsDefault}
                          onChange={(e) => setNewOptIsDefault(e.target.checked)}
                        />
                        <span>خيار افتراضي</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-ink-muted font-bold mb-0.5">
                      ربط بخامة مخزنية لخصمها تلقائياً (اختياري)
                    </label>
                    <CustomSelect
                      value={newOptIngredientId}
                      onChange={(v) => setNewOptIngredientId(v)}
                      options={[
                        { value: '', label: '-- بدون خصم خامة مخزنية --' },
                        ...products.map((p) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                  </div>

                  {newOptIngredientId && (
                    <div>
                      <label className="block text-[11px] text-ink-muted font-bold mb-0.5">
                        الكمية المخصومة من الخامة لكل وحدة
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={newOptIngredientQtyUnits}
                        onChange={(e) => setNewOptIngredientQtyUnits(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 rounded-xl bg-brand text-white text-xs font-black flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة الخيار للمجموعة</span>
                  </button>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(selectedGroup.options || []).map((opt) => (
                    <div
                      key={opt.id}
                      className="p-2.5 rounded-xl bg-surface border border-line flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-black text-ink">{opt.name}</span>
                        <span className="text-brand font-black mr-2">
                          {opt.extraPricePiasters > 0 ? `+${formatArabicCurrency(opt.extraPricePiasters)}` : 'مجاناً'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteOption(opt.id)}
                        className="p-1 text-ink-muted hover:text-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-muted font-bold">اختر مجموعة من القائمة اليمنى لإضافة خياراتها.</p>
            )}
          </div>

          {/* Right: Link Modifier Groups to Product */}
          <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-4">
            <h3 className="text-sm font-black text-ink flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-brand" />
              <span>3. ربط الإضافات بصنف في المنيو</span>
            </h3>

            <div>
              <label className="block text-xs font-bold text-ink-muted mb-1">اختر الصنف المراد تخصيصه:</label>
              <CustomSelect
                value={targetProductId}
                onChange={(v) => setTargetProductId(v)}
                options={[
                  { value: '', label: '-- اختر الصنف من الكتالوج --' },
                  ...products.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>

            {targetProductId && (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {groups.map((g) => {
                    const checked = linkedGroupIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${
                          checked ? 'bg-brand/10 border-brand' : 'bg-surface border-line'
                        }`}
                      >
                        <span className="text-xs font-black text-ink">{g.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLinkGroup(g.id)}
                          className="rounded border-line text-brand"
                        />
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSaveProductLinks}
                  className="w-full py-2.5 rounded-xl bg-paid text-white text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ ربط الإضافات بالصنف</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
