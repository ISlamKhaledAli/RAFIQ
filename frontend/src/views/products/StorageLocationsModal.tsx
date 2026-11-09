import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Printer,
  ClipboardList,
  X,
  AlertCircle,
  Snowflake,
  Package,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { SearchInput } from '../../components/SearchInput';
import type { StorageLocation, LocationInventoryDraft } from '../../types/models';
import { CustomSelect } from '../../components/CustomSelect';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useAuth } from '../../context/useAuth';
import { invoke } from '../../bridge/ipc';
import { usePrintReport } from '../../hooks/usePrintReport';
import { announceReportOutcome } from '../../utils/reportNotice';
import { describeError } from '../../utils/printReport';
import { formatUnitArabic } from '../../utils/units';
import { RequiredMark } from '../../components/RequiredMark';
import { AppButton } from '../../components/AppButton';

interface StorageLocationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationUpdated?: () => void;
}

const LOCATION_TYPES = [
  { value: 'shelf', label: 'رف تخزين' },
  { value: 'rack', label: 'استاند / قسم كامل' },
  { value: 'drawer', label: 'درج أدوية' },
  { value: 'fridge', label: 'ثلاجة أدوية / سلسلة تبريد' },
  { value: 'warehouse', label: 'مستودع / مخزن خلفي' },
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

  const handlePrintBarcode = async (loc: StorageLocation) => {
    try {
      await invoke('barcode:printLabel', {
        barcode: loc.code,
        title: loc.name,
        priceFormatted: loc.type === 'fridge' ? 'سلسلة تبريد' : 'رف تخزين',
        barcodeType: 'shelf_tag'
      });
    } catch (err) {
      announceReportOutcome({ status: 'failed', message: 'تعذرت طباعة باركود الرف: ' + describeError(err) });
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

  const { print: handlePrintDraftSheet, printing: isPrintingDraftSheet } = usePrintReport({
    reportName: 'كشف جرد الرف',
    kind: 'a4only',
    hasData: Boolean(draftSheet && draftSheet.items.length > 0),
  });

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
            <div className="p-2.5 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright">
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
          <AppButton variant="subtle" size="sm" icon={X} onClick={onClose} aria-label="إغلاق" />
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
              </div>

              {formError && (
                <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1">
                    كود الموقع / الرف <RequiredMark />
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
                    اسم الرف أو الوصف المختصر <RequiredMark />
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
                    نوع الموقع
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
                  />
                  <span>الموقع نشط ومتاح للتسكين</span>
                </label>

                <div className="flex items-center gap-2">
                  <AppButton variant="secondary" onClick={resetForm}>
                    إلغاء
                  </AppButton>
                  <AppButton type="submit" variant="primary" disabled={saving}>
                    {saving ? 'جاري الحفظ...' : editingId ? 'تحديث الموقع' : 'إضافة الموقع'}
                  </AppButton>
                </div>
              </div>
            </form>
          )}

          {/* Top Actions & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-x-8 gap-y-3 w-full sm:w-auto flex-1">
              <SearchInput
                size="sm"
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="بحث بالكود أو الاسم..."
                ariaLabel="بحث في أماكن التخزين"
                className="flex-1 max-w-sm"
              />

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
              <AppButton variant="primary" icon={Plus} onClick={handleStartAdd} className="w-full sm:w-auto">
                إضافة موقع / رف جديد
              </AppButton>
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
                            <div className="text-micro text-ink-muted dark:text-ink-dark-muted">{loc.description}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-micro font-medium ${
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
                            <span className="inline-flex items-center gap-1 text-paid dark:text-paid-bright font-medium text-micro">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>نشط</span>
                            </span>
                          ) : (
                            <span className="text-ink-muted dark:text-ink-dark-muted text-micro">معطل</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Draft Inventory Button (Task 185-5) */}
                            <AppButton
                              variant="subtle"
                              size="xs"
                              icon={ClipboardList}
                              onClick={() => handleOpenDraftInventory(loc)}
                              disabled={loadingDraft}
                              title="استخراج مسودة كشف جرد الرف"
                              aria-label="استخراج مسودة كشف جرد الرف"
                            />

                            {/* Print Shelf Tag Barcode */}
                            <AppButton
                              variant="subtle"
                              size="xs"
                              icon={Printer}
                              onClick={() => void handlePrintBarcode(loc)}
                              title="طباعة باركود الرف"
                              aria-label="طباعة باركود الرف"
                            />

                            {/* Edit */}
                            {canManage && (
                              <AppButton
                                variant="subtle"
                                size="xs"
                                icon={Edit2}
                                onClick={() => handleStartEdit(loc)}
                                title="تعديل بيانات الموقع"
                                aria-label="تعديل بيانات الموقع"
                              />
                            )}

                            {/* Delete/Deactivate */}
                            {canManage && (
                              <AppButton
                                variant="dangerSubtle"
                                size="xs"
                                icon={Trash2}
                                onClick={() => handleDelete(loc)}
                                title="تعطيل الموقع"
                                aria-label="تعطيل الموقع"
                              />
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
      </div>

      {/* Draft Inventory Sheet Viewer Modal (Task 185-5) */}
      {draftSheet && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          onClick={handleDraftBackdropClick}
        >
          <div
            data-print-root
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright">
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
              <AppButton variant="subtle" size="sm" icon={X} onClick={() => setDraftSheet(null)} aria-label="إغلاق" />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex justify-between items-center bg-brand-soft/40 dark:bg-brand-soft/10 p-3 rounded-lg border border-brand/20">
                <span className="text-xs font-semibold text-brand-dark dark:text-brand-bright">
                  إجمالي الأصناف المسكنة في هذا الموقع: {draftSheet.items.length} صنف
                </span>
                <AppButton variant="primary" size="sm" icon={Printer} onClick={handlePrintDraftSheet} loading={isPrintingDraftSheet}>
                  طباعة كشف الجرد الورقي
                </AppButton>
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
                        <td colSpan={7} className="p-6 text-center text-ink-muted dark:text-ink-dark-muted">
                          لا توجد أصناف مسكنة على هذا الرف حالياً
                        </td>
                      </tr>
                    ) : (
                      draftSheet.items.map((item, index) => (
                        <tr key={item.productId} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40">
                          <td className="p-2.5 font-mono text-ink-muted dark:text-ink-dark-muted">{index + 1}</td>
                          <td className="p-2.5 font-semibold text-ink dark:text-ink-dark">
                            <div className="flex items-center gap-1.5">
                              {item.isColdChain && (
                                <Snowflake className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                              )}
                              <span>{item.productName}</span>
                            </div>
                          </td>
                          <td className="p-2.5 font-mono text-ink-muted dark:text-ink-dark-muted">{item.barcode || '—'}</td>
                          <td className="p-2.5">{formatUnitArabic(item.unitName)}</td>
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
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                كشف الجرد الفعلي يملأ يدوياً بقلم الكاشير/الجارد لمطابقة الأرصدة
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
