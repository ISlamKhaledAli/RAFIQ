import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  Search,
  Plus,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Download,
  UploadCloud,
  X,
  CheckCircle2,
  Pill,
  RefreshCw,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { ConfirmModal } from './ConfirmModal';
import { CustomSelect } from './CustomSelect';
import type { DrugInteraction, DdiSeverity } from '../types/pharma';

interface DrugInteractionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export const DrugInteractionManagerModal: React.FC<DrugInteractionManagerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
  });

  const [items, setItems] = useState<DrugInteraction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  // Add/Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DrugInteraction | null>(null);
  const [formA, setFormA] = useState('');
  const [formB, setFormB] = useState('');
  const [formSeverity, setFormSeverity] = useState<DdiSeverity>('moderate');
  const [formMech, setFormMech] = useState('');
  const [formRisk, setFormRisk] = useState('');
  const [formRec, setFormRec] = useState('');
  const [formAlt, setFormAlt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteCandidate, setDeleteCandidate] = useState<DrugInteraction | null>(null);

  // Excel operations state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadInteractions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<{
        items: DrugInteraction[];
        totalCount: number;
        page: number;
        limit: number;
      }>('ddi:getAll', {
        search: search.trim(),
        severity: severityFilter,
        page,
        limit,
      });
      if (res) {
        setItems(res.items || []);
        setTotalCount(res.totalCount || 0);
      }
    } catch (err: unknown) {
      console.error('Failed to load drug interactions:', err);
    } finally {
      setLoading(false);
    }
  }, [search, severityFilter, page]);

  useEffect(() => {
    if (isOpen) {
      loadInteractions();
    }
  }, [isOpen, loadInteractions]);

  if (!isOpen) return null;

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormA('');
    setFormB('');
    setFormSeverity('moderate');
    setFormMech('');
    setFormRisk('');
    setFormRec('');
    setFormAlt('');
    setFormError(null);
    setIsEditOpen(true);
  };

  const handleOpenEdit = (item: DrugInteraction) => {
    setEditingItem(item);
    setFormA(item.activeIngredientA);
    setFormB(item.activeIngredientB);
    setFormSeverity(item.severity);
    setFormMech(item.mechanismAr);
    setFormRisk(item.clinicalRiskAr);
    setFormRec(item.recommendationAr);
    setFormAlt(item.alternativeAr || '');
    setFormError(null);
    setIsEditOpen(true);
  };

  const handleSaveInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formA.trim()) {
      setFormError('المادة الفعالة الأولى مطلوبة.');
      return;
    }
    if (!formB.trim()) {
      setFormError('المادة الفعالة الثانية مطلوبة.');
      return;
    }
    if (formA.trim().toLowerCase() === formB.trim().toLowerCase()) {
      setFormError('لا يمكن تسجيل تعارض للمادة مع نفسها.');
      return;
    }
    if (!formMech.trim()) {
      setFormError('شرح آلية التفاعل مطلوب.');
      return;
    }
    if (!formRisk.trim()) {
      setFormError('الخطر السريري مطلوب.');
      return;
    }
    if (!formRec.trim()) {
      setFormError('التوصية الطبية مطلوبة.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Partial<DrugInteraction> = {
        id: editingItem ? editingItem.id : undefined,
        activeIngredientA: formA.trim().toLowerCase(),
        activeIngredientB: formB.trim().toLowerCase(),
        severity: formSeverity,
        mechanismAr: formMech.trim(),
        clinicalRiskAr: formRisk.trim(),
        recommendationAr: formRec.trim(),
        alternativeAr: formAlt.trim(),
        source: editingItem?.source || 'custom',
      };

      await invoke('ddi:save', payload);
      setIsEditOpen(false);
      setMessage({ type: 'success', text: 'تم حفظ التفاعل الدوائي بنجاح.' });
      loadInteractions();
      if (onSuccess) onSuccess('تم حفظ التفاعل الدوائي بنجاح.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حفظ التفاعل الدوائي.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      await invoke('ddi:delete', { id: deleteCandidate.id });
      setDeleteCandidate(null);
      setMessage({ type: 'success', text: 'تم حذف التفاعل الدوائي بنجاح.' });
      loadInteractions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حذف التفاعل الدوائي.';
      setMessage({ type: 'error', text: msg });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setMessage(null);
    try {
      const res = await invoke<{ success: boolean; filePath: string }>('ddi:exportToExcel', {
        search: search.trim(),
        severity: severityFilter,
      });
      if (res && res.filePath) {
        setMessage({
          type: 'success',
          text: `تم تصدير جدول التفاعلات إلى: ${res.filePath}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تصدير ملف الإكسل.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await invoke<{ success: boolean; filePath: string }>('ddi:generateTemplate', {});
      if (res && res.filePath) {
        setMessage({
          type: 'success',
          text: `تم حفظ القالب الفارغ في: ${res.filePath}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل توليد القالب.';
      setMessage({ type: 'error', text: msg });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read full path if available in WebView/Electron environment, or handle file upload
    const filePath = (file as unknown as { path?: string }).path || file.name;

    setIsImporting(true);
    setMessage(null);
    try {
      const res = await invoke<{ success: boolean; importedCount: number }>('ddi:importFromExcel', {
        filePath,
      });
      if (res) {
        setMessage({
          type: 'success',
          text: `تم استيراد ${res.importedCount} تفاعل دوائي بنجاح.`,
        });
        loadInteractions();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل استيراد ملف الإكسل.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getSeverityBadge = (sev: string) => {
    if (sev === 'severe') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-danger/10 text-danger border border-danger/30">
          <ShieldAlert className="w-3 h-3" />
          حرج
        </span>
      );
    }
    if (sev === 'moderate') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-warn/10 text-warn border border-warn/30">
          <AlertTriangle className="w-3 h-3" />
          متوسط
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-brand/10 text-brand border border-brand/30">
        <Info className="w-3 h-3" />
        طفيف
      </span>
    );
  };

  const severityOptions = [
    { value: 'all', label: 'كافة درجات الخطورة' },
    { value: 'severe', label: 'حرج (مانع صرف)' },
    { value: 'moderate', label: 'متوسط (فصل زمني)' },
    { value: 'minor', label: 'طفيف (إرشادي)' },
  ];

  const formSeverityOptions = [
    { value: 'severe', label: 'حرج — مانع صرف قطعي (Hard Stop)' },
    { value: 'moderate', label: 'متوسط — تحذير إرشادي وفصل زمني' },
    { value: 'minor', label: 'طفيف — إرشاد صيدلاني خفيف' },
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ddi-manager-title"
    >
      <div
        className="w-full max-w-5xl bg-surface border-2 border-line shadow-2xl rounded-2xl overflow-hidden flex flex-col h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 id="ddi-manager-title" className="text-base font-bold flex items-center gap-2">
                إدارة جدول التفاعلات والتعارضات الدوائية (DDI)
              </h2>
              <p className="text-xs text-white/90">
                قاعدة البيانات السريرية المرجعية لفحص تعارضات الأدوية في شاشة البيع ({totalCount} تفاعل مسجل)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 bg-surface-2 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="بحث بالمادة الفعالة أو آلية التفاعل أو التوصية..."
                className="w-full pr-9 pl-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink"
              />
            </div>

            {/* Severity Filter */}
            <div className="w-44">
              <CustomSelect
                value={severityFilter}
                onChange={(val) => {
                  setSeverityFilter(val);
                  setPage(1);
                }}
                options={severityOptions}
                size="sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-dark transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              إضافة تفاعل
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-surface border border-line text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              title="استيراد تفاعلات من ملف إكسل"
            >
              <UploadCloud className="w-4 h-4 text-brand" />
              {isImporting ? 'جاري الاستيراد...' : 'استيراد إكسل'}
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-surface border border-line text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              title="تصدير جدول التفاعلات لملف إكسل"
            >
              <FileSpreadsheet className="w-4 h-4 text-paid" />
              {isExporting ? 'جاري التصدير...' : 'تصدير'}
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold bg-surface border border-line text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              title="تحميل قالب إكسل فارغ"
            >
              <Download className="w-4 h-4 text-ink-muted" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Notification Toast */}
        {message && (
          <div
            className={`mx-4 mt-3 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between gap-2 border ${
              message.type === 'success'
                ? 'bg-paid-soft text-paid border-paid/30'
                : 'bg-danger/10 text-danger border-danger/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="text-current hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="p-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs">جاري تحميل جدول التفاعلات...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
              <ShieldAlert className="w-12 h-12 text-ink-muted/40" />
              <span className="text-sm font-bold text-ink">لا توجد تفاعلات دوائية مطابقة للبحث</span>
              <p className="text-xs text-ink-muted">
                يمكنك إضافة تفاعل جديد يدوياً أو استيراد ملف إكسل يحتوي على المواد الفعالة المتعارضة.
              </p>
            </div>
          ) : (
            <div className="border border-line rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-surface-2 border-b border-line text-ink font-bold">
                  <tr>
                    <th className="p-3 w-40">المادة الفعالة الأولى</th>
                    <th className="p-3 w-40">المادة الفعالة الثانية</th>
                    <th className="p-3 w-28 text-center">درجة الخطورة</th>
                    <th className="p-3">آلية التفاعل والخطر السريري</th>
                    <th className="p-3">التوصية والبديل الآمن</th>
                    <th className="p-3 w-24 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="p-3 font-bold text-ink">
                        <div className="flex items-center gap-1.5">
                          <Pill className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>{item.activeIngredientA}</span>
                        </div>
                      </td>
                      <td className="p-3 font-bold text-ink">
                        <div className="flex items-center gap-1.5">
                          <Pill className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>{item.activeIngredientB}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">{getSeverityBadge(item.severity)}</td>
                      <td className="p-3 space-y-1">
                        <div className="text-ink leading-relaxed">{item.mechanismAr}</div>
                        <div className="text-2xs text-danger font-medium leading-relaxed">
                          الخطر: {item.clinicalRiskAr}
                        </div>
                      </td>
                      <td className="p-3 space-y-1">
                        <div className="text-ink leading-relaxed font-medium">{item.recommendationAr}</div>
                        {item.alternativeAr && (
                          <div className="text-2xs text-paid font-bold">
                            البديل: {item.alternativeAr}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 rounded-lg text-brand hover:bg-brand/10 transition-colors cursor-pointer"
                            title="تعديل"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(item)}
                            className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-between text-xs">
          <div className="text-ink-muted">
            إجمالي التفاعلات المسجلة: <span className="font-bold text-ink">{totalCount}</span> (الصفحة {page} من {totalPages})
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-line bg-surface text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
            >
              السابق
            </button>
            <span className="text-xs font-bold text-ink px-2">{page}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-line bg-surface text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Interaction Modal */}
      {isEditOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsEditOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-surface border-2 border-brand shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-brand text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                {editingItem ? 'تعديل التفاعل الدوائي' : 'إضافة تفاعل دوائي جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInteraction} className="p-5 flex-1 overflow-y-auto space-y-3.5">
              {formError && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-bold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-bold text-ink mb-1">
                    المادة الفعالة الأولى (بالإنجليزية): <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={formA}
                    onChange={(e) => setFormA(e.target.value)}
                    placeholder="مثال: warfarin"
                    className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-2xs font-bold text-ink mb-1">
                    المادة الفعالة الثانية (بالإنجليزية): <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={formB}
                    onChange={(e) => setFormB(e.target.value)}
                    placeholder="مثال: diclofenac"
                    className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold text-ink mb-1">
                  درجة الخطورة السريرية: <span className="text-danger">*</span>
                </label>
                <CustomSelect
                  value={formSeverity}
                  onChange={(val) => setFormSeverity(val as DdiSeverity)}
                  options={formSeverityOptions}
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-ink mb-1">
                  شرح آلية التفاعل الصيدلانية: <span className="text-danger">*</span>
                </label>
                <textarea
                  value={formMech}
                  onChange={(e) => setFormMech(e.target.value)}
                  placeholder="شرح علمي لكيفية تأثير المادتين على بعضهما كبدياً أو امتصاصاً..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink leading-relaxed"
                  required
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-ink mb-1">
                  الخطر السريري على المريض: <span className="text-danger">*</span>
                </label>
                <textarea
                  value={formRisk}
                  onChange={(e) => setFormRisk(e.target.value)}
                  placeholder="الأثر الخطير المتوقع: نزيف حاد، فشل امتصاص، تسمم، استطالة QT..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink leading-relaxed"
                  required
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-ink mb-1">
                  التوصية الطبية العملية للصيدلي: <span className="text-danger">*</span>
                </label>
                <textarea
                  value={formRec}
                  onChange={(e) => setFormRec(e.target.value)}
                  placeholder="الإجراء الصيدلاني المطلوب: منع الجمع، الفصل بساعتين، خفض الجرعة..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink leading-relaxed"
                  required
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-ink mb-1">
                  البديل الآمن المقترح (اختياري):
                </label>
                <input
                  type="text"
                  value={formAlt}
                  onChange={(e) => setFormAlt(e.target.value)}
                  placeholder="مثال: باراسيتامول (Paracetamol) أو بانتوبرازول (Pantoprazole)"
                  className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg focus:outline-none focus:border-brand text-ink"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-surface border border-line text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'جاري الحفظ...' : 'حفظ التفاعل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <ConfirmModal
          isOpen={!!deleteCandidate}
          title="تأكيد حذف التفاعل الدوائي"
          message={`هل أنت متأكد من حذف التفاعل الدوائي المسجل بين «${deleteCandidate.activeIngredientA}» و «${deleteCandidate.activeIngredientB}»؟ لن يتم تنبيه الصيدلي بهذا التعارض مستقبلاً.`}
          confirmText="نعم، احذف التفاعل"
          cancelText="إلغاء"
          onConfirm={handleDelete}
          onCancel={() => setDeleteCandidate(null)}
          isDanger={true}
        />
      )}
    </div>
  );
};
