import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Printer,
  ClipboardList,
  Search,
  X,
  AlertCircle,
  Snowflake,
  Package,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import type { StorageLocation, LocationInventoryDraft } from '../../types/models';
import { CustomSelect } from '../../components/CustomSelect';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useAuth } from '../../context/useAuth';
import { invoke } from '../../bridge/ipc';

interface StorageLocationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationUpdated?: () => void;
}

const LOCATION_TYPES = [
  { value: 'shelf', label: 'رف تخزين (Shelf)' },
  { value: 'rack', label: 'استاند / قسم كامل (Rack)' },
  { value: 'drawer', label: 'درج أدوية (Drawer)' },
  { value: 'fridge', label: 'ثلاجة أدوية / سلسلة تبريد (Fridge)' },
  { value: 'warehouse', label: 'مستودع / مخزن خلفي (Warehouse)' },
];

export const StorageLocationsModal: React.FC<StorageLocationsModalProps> = ({
  isOpen,
  onClose,
  onLocationUpdated
}) => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('inventory.locations.manage');

  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'shelf' | 'rack' | 'drawer' | 'fridge' | 'warehouse'>('shelf');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Draft Inventory Sheet State
  const [draftSheet, setDraftSheet] = useState<LocationInventoryDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const { handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !draftSheet,
    onClose
  });

  const { handleBackdropClick: handleDraftBackdropClick } = useModalDismiss({
    isOpen: Boolean(draftSheet),
    onClose: () => setDraftSheet(null)
  });

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setCode('');
    setName('');
    setType('shelf');
    setDescription('');
    setIsActive(true);
    setFormError('');
  };

  const loadLocations = async () => {
    setLoading(true);
    try {
      const res = await invoke<StorageLocation[]>('locations:list', { onlyActive: false });
      if (Array.isArray(res)) {
        setLocations(res);
      }
    } catch (err) {
      console.error('فشل تحميل مواقع التخزين:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadLocations();
      resetForm();
      setDraftSheet(null);
    }
  }, [isOpen]);

  const handleStartAdd = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleStartEdit = (loc: StorageLocation) => {
    setEditingId(loc.id);
    setCode(loc.code);
    setName(loc.name);
    setType(loc.type);
    setDescription(loc.description || '');
    setIsActive(loc.isActive);
    setFormError('');
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setFormError('يرجى إدخال كود الموقع (مثل: A1, FRIDGE-01)');
      return;
    }
    if (!name.trim()) {
      setFormError('يرجى إدخال اسم أو وصف الرف / الموقع');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        id: editingId || undefined,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        isActive
      };

      await invoke<StorageLocation>('locations:save', payload);
      resetForm();
      await loadLocations();
      if (onLocationUpdated) onLocationUpdated();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setFormError(errorMsg || 'حدث خطأ أثناء حفظ الموقع');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc: StorageLocation) => {
    if (!window.confirm(`هل أنت متأكد من تعطيل موقع التخزين "${loc.code} - ${loc.name}"؟`)) {
      return;
    }

    try {
      await invoke('locations:delete', { id: loc.id });
      await loadLocations();
      if (onLocationUpdated) onLocationUpdated();
    } catch (err) {
      console.error('خطأ أثناء تعطيل الموقع:', err);
    }
  };

  const handlePrintBarcode = (loc: StorageLocation) => {
    try {
      void invoke('barcode:printLabel', {
        barcode: loc.code,
        title: loc.name,
        priceFormatted: loc.type === 'fridge' ? 'سلسلة تبريد' : 'رف تخزين',
        barcodeType: 'shelf_tag'
      });
    } catch (err) {
      console.error('خطأ في إرسال أمر طباعة باركود الرف:', err);
    }
  };

  const handleOpenDraftInventory = async (loc: StorageLocation) => {
    setLoadingDraft(true);
    try {
      const res = await invoke<LocationInventoryDraft>('locations:getDraftInventory', { locationId: loc.id });
      if (res && res.items) {
        setDraftSheet(res);
      }
    } catch (err) {
      console.error('فشل جلب مسودة جرد الرف:', err);
    } finally {
      setLoadingDraft(false);
    }
  };

  const handlePrintDraftSheet = () => {
    window.print();
  };

  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const matchesSearch =
        !searchQuery.trim() ||
        loc.code.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        loc.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (loc.description && loc.description.toLowerCase().includes(searchQuery.trim().toLowerCase()));

      const matchesType = typeFilter === 'all' || loc.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [locations, searchQuery, typeFilter]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={handleBackdropClick}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink dark:text-ink-dark">
                إدارة مواقع التخزين والرفوف والأدراج
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                تنظيم أماكن الأدوية والسلع على الرفوف، وتتبع سلسلة التبريد وكشوف الجرد السريع
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Form when adding/editing */}
          {isEditing && (
            <form onSubmit={handleSave} className="p-4 bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink dark:text-ink-dark">
                  {editingId ? 'تعديل بيانات موقع التخزين' : 'إضافة موقع تخزين أو رف جديد'}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
                >
                  إلغاء التحرير
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-danger-soft dark:bg-danger-soft/20 text-danger dark:text-danger-bright rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1">
                    كود الموقع / الرف *
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="مثال: RACK-A1 أو F-01"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded text-xs font-mono font-bold text-ink dark:text-ink-dark focus:ring-1 focus:ring-brand focus:border-brand"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1">
                    اسم الرف أو الوصف المختصر *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: رف أدوية الضغط والقلب"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded text-xs text-ink dark:text-ink-dark focus:ring-1 focus:ring-brand focus:border-brand"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1">
                    نوع الموقع *
                  </label>
                  <CustomSelect
                    value={type}
                    onChange={(val) => setType(val as 'shelf' | 'rack' | 'drawer' | 'fridge' | 'warehouse')}
                    options={LOCATION_TYPES}
                    size="sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1">
                  ملاحظات وتفاصيل إضافية
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثال: الواجهة الأمامية يسار، العمود الثاني"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded text-xs text-ink dark:text-ink-dark focus:ring-1 focus:ring-brand focus:border-brand"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-ink dark:text-ink-dark font-medium">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-line text-brand focus:ring-brand w-4 h-4"
                  />
                  <span>الموقع نشط ومتاح للتسكين</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-1.5 text-xs font-medium text-ink-muted dark:text-ink-dark-muted hover:text-ink rounded border border-line dark:border-line-dark cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 bg-brand hover:bg-brand-dark text-white rounded text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {saving ? 'جاري الحفظ...' : editingId ? 'تحديث الموقع' : 'إضافة الموقع'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Top Actions & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-ink-muted dark:text-ink-dark-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالكود أو الاسم..."
                  className="w-full pr-9 pl-3 py-1.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded text-xs text-ink dark:text-ink-dark focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="w-48">
                <CustomSelect
                  value={typeFilter}
                  onChange={(val) => setTypeFilter(val)}
                  options={[
                    { value: 'all', label: 'جميع الأنواع' },
                    ...LOCATION_TYPES
                  ]}
                  size="sm"
                />
              </div>
            </div>

            {canManage && !isEditing && (
              <button
                type="button"
                onClick={handleStartAdd}
                className="w-full sm:w-auto px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة موقع / رف جديد</span>
              </button>
            )}
          </div>

          {/* Locations Table */}
          <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden bg-surface dark:bg-surface-dark">
            <table className="w-full text-right text-xs">
              <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark font-bold text-ink dark:text-ink-dark">
                <tr>
                  <th className="p-3">كود الموقع</th>
                  <th className="p-3">اسم الرف / الموقع</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">الأصناف المسكنة</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-line-dark">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-ink-muted dark:text-ink-dark-muted">
                      جاري تحميل مواقع التخزين...
                    </td>
                  </tr>
                ) : filteredLocations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-ink-muted dark:text-ink-dark-muted">
                      لا توجد مواقع تخزين مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filteredLocations.map((loc) => {
                    const isFridge = loc.type === 'fridge';
                    return (
                      <tr key={loc.id} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                        <td className="p-3 font-mono font-bold text-ink dark:text-ink-dark">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark">
                            {isFridge ? (
                              <Snowflake className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                            ) : (
                              <Package className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                            )}
                            <span>{loc.code}</span>
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-ink dark:text-ink-dark">{loc.name}</div>
                          {loc.description && (
                            <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{loc.description}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                            isFridge
                              ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border border-line dark:border-line-dark'
                          }`}>
                            {loc.type === 'shelf' && 'رف عادي'}
                            {loc.type === 'rack' && 'استاند كامل'}
                            {loc.type === 'drawer' && 'درج أدوية'}
                            {loc.type === 'fridge' && 'ثلاجة تبريد'}
                            {loc.type === 'warehouse' && 'مستودع'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-ink dark:text-ink-dark">
                          {loc.productsCount ?? 0} صنف
                        </td>
                        <td className="p-3">
                          {loc.isActive ? (
                            <span className="inline-flex items-center gap-1 text-paid dark:text-paid-bright font-medium text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>نشط</span>
                            </span>
                          ) : (
                            <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">معطل</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Draft Inventory Button (Task 185-5) */}
                            <button
                              type="button"
                              onClick={() => handleOpenDraftInventory(loc)}
                              disabled={loadingDraft}
                              title="استخراج مسودة كشف جرد الرف"
                              className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft/50 dark:hover:bg-brand-soft/10 rounded transition-colors cursor-pointer"
                            >
                              <ClipboardList className="w-4 h-4" />
                            </button>

                            {/* Print Shelf Tag Barcode */}
                            <button
                              type="button"
                              onClick={() => handlePrintBarcode(loc)}
                              title="طباعة باركود الرف (Shelf Tag)"
                              className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-paid-bright hover:bg-paid-soft/50 dark:hover:bg-paid-soft/10 rounded transition-colors cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Edit */}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(loc)}
                                title="تعديل بيانات الموقع"
                                className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}

                            {/* Delete/Deactivate */}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleDelete(loc)}
                                title="تعطيل الموقع"
                                className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft/50 dark:hover:bg-danger-soft/10 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark rounded-lg text-xs font-bold border border-line dark:border-line-dark transition-colors cursor-pointer shadow-xs"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Draft Inventory Sheet Viewer Modal (Task 185-5) */}
      {draftSheet && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          onClick={handleDraftBackdropClick}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-paid-soft text-paid dark:text-paid-bright">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink dark:text-ink-dark">
                    مسودة كشف جرد الرف / الموقع ({draftSheet.locationCode})
                  </h3>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                    {draftSheet.locationName} • تم التوليد: {new Date(draftSheet.generatedAt).toLocaleString('ar-EG')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDraftSheet(null)}
                className="p-1.5 text-ink-muted hover:text-ink rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex justify-between items-center bg-brand-soft/40 dark:bg-brand-soft/10 p-3 rounded-lg border border-brand/20">
                <span className="text-xs font-semibold text-brand-dark dark:text-brand-bright">
                  إجمالي الأصناف المسكنة في هذا الموقع: {draftSheet.items.length} صنف
                </span>
                <button
                  type="button"
                  onClick={handlePrintDraftSheet}
                  className="px-3 py-1.5 bg-brand hover:bg-brand-dark text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة كشف الجرد الورقي</span>
                </button>
              </div>

              <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark font-bold text-ink dark:text-ink-dark">
                    <tr>
                      <th className="p-2.5">م</th>
                      <th className="p-2.5">اسم الصنف</th>
                      <th className="p-2.5">الباركود</th>
                      <th className="p-2.5">الوحدة</th>
                      <th className="p-2.5">الرصيد الدفتري</th>
                      <th className="p-2.5 w-28 text-center bg-paid-soft/30 dark:bg-paid-soft/10">العدد الفعلي</th>
                      <th className="p-2.5">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {draftSheet.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-ink-muted">
                          لا توجد أصناف مسكنة على هذا الرف حالياً
                        </td>
                      </tr>
                    ) : (
                      draftSheet.items.map((item, index) => (
                        <tr key={item.productId} className="hover:bg-surface-2/40">
                          <td className="p-2.5 font-mono text-ink-muted">{index + 1}</td>
                          <td className="p-2.5 font-semibold text-ink dark:text-ink-dark">
                            <div className="flex items-center gap-1.5">
                              {item.isColdChain && (
                                <Snowflake className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                              )}
                              <span>{item.productName}</span>
                            </div>
                          </td>
                          <td className="p-2.5 font-mono text-ink-muted">{item.barcode || '—'}</td>
                          <td className="p-2.5">{item.unitName}</td>
                          <td className="p-2.5 font-mono font-bold text-ink dark:text-ink-dark">
                            {item.bookStockQuantityMilli / 1000}
                          </td>
                          <td className="p-2.5 text-center bg-paid-soft/20 dark:bg-paid-soft/5">
                            <div className="w-16 h-6 border-b-2 border-dotted border-ink-muted mx-auto"></div>
                          </td>
                          <td className="p-2.5">
                            <div className="w-20 h-6 border-b border-line dark:border-line-dark"></div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex justify-between items-center">
              <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                كشف الجرد الفعلي يملأ يدوياً بقلم الكاشير/الجارد لمطابقة الأرصدة
              </span>
              <button
                type="button"
                onClick={() => setDraftSheet(null)}
                className="px-4 py-2 bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark rounded-lg text-xs font-bold border border-line dark:border-line-dark cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
