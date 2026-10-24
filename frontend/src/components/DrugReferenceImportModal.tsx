import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BookOpen, 
  FileSpreadsheet, 
  Download, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Search, 
  RefreshCw, 
  FileText, 
  X, 
  Pill,
  Check,
  AlertCircle
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { downloadBase64File } from '../utils/excelImport';
import { formatArabicCurrency } from '../utils/money';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { ConfirmModal } from './ConfirmModal';
import type { 
  DrugReferenceItem, 
  DrugReferenceImportPreviewResult, 
  DrugReferenceImportRow 
} from '../types/pharma';

interface DrugReferenceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const DrugReferenceImportModal: React.FC<DrugReferenceImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'browse'>('import');
  
  // Import tab states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<DrugReferenceImportPreviewResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'NEW' | 'UPDATE' | 'ERROR'>('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Clear reference confirmation
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Browse tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DrugReferenceItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadReferenceData = useCallback(async (query = '') => {
    setIsSearching(true);
    try {
      const results = await invoke<DrugReferenceItem[]>('pharma:searchDrugReference', { query: query.trim(), limit: 50 });
      setSearchResults(Array.isArray(results) ? results : []);
      // also query empty search to get total if possible
      if (!query.trim()) {
        setTotalCount(Array.isArray(results) ? results.length : 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل بيانات الدليل';
      setErrorMessage(msg);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'browse') {
      void loadReferenceData(searchQuery);
    }
  }, [isOpen, activeTab, searchQuery, loadReferenceData]);

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setErrorMessage(null);
    try {
      const res = await invoke<{ success: boolean; base64?: string; fileName?: string }>('pharma:downloadDrugReferenceTemplate');
      if (res && res.base64) {
        downloadBase64File(
          res.base64,
          res.fileName || 'قالب_دليل_الأدوية_المرجعي_رفيق.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      } else {
        setErrorMessage('تعذر إنشاء نموذج الإكسل من النظام');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تحميل القالب';
      setErrorMessage(msg);
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  };

  const handleProcessFile = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedFile(file);
    setIsPreviewing(true);
    setPreviewData(null);

    try {
      const base64 = await readFileAsBase64(file);
      setFileBase64(base64);
      const preview = await invoke<DrugReferenceImportPreviewResult>('pharma:previewDrugReferenceImport', { base64 });
      setPreviewData(preview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل فحص ومعاينة ملف الإكسل';
      setErrorMessage(msg);
      setSelectedFile(null);
      setFileBase64('');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleProcessFile(e.target.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!fileBase64) return;
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const res = await invoke<{
        totalProcessed: number;
        createdCount: number;
        updatedCount: number;
        failedCount: number;
      }>('pharma:confirmDrugReferenceImport', { base64: fileBase64 });

      const msg = `تم استيراد الدليل المرجعي بنجاح: تم إضافة (${res.createdCount}) صنف جديد، وتحديث (${res.updatedCount}) صنف.`;
      setSuccessMessage(msg);
      setSelectedFile(null);
      setFileBase64('');
      setPreviewData(null);
      if (onSuccess) onSuccess(msg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الدليل في قاعدة البيانات';
      setErrorMessage(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const count = await invoke<number>('pharma:clearDrugReference');
      setIsConfirmClearOpen(false);
      setSuccessMessage(`تم مسح دليل الأدوية بالكامل بنجاح (${count} صنف تم تفريغها)`);
      setSearchResults([]);
      setTotalCount(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر مسح دليل الأدوية';
      setErrorMessage(msg);
    } finally {
      setIsClearing(false);
    }
  };

  const isDirty = Boolean(selectedFile || previewData);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'إلغاء نافذة دليل الأدوية؟',
    confirmMessage: 'هناك ملف قيد المعاينة لم يتم استيراده بعد. هل ترغب في الخروج وتجاهل الملف؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء في المعاينة',
  });

  if (!isOpen) return null;

  const filteredPreviewRows = (previewData?.rows || []).filter((r: DrugReferenceImportRow) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (previewSearch.trim()) {
      const q = previewSearch.trim().toLowerCase();
      const matchTrade = (r.tradeName || '').toLowerCase().includes(q);
      const matchSci = (r.scientificName || '').toLowerCase().includes(q);
      const matchBar = (r.barcode || '').toLowerCase().includes(q);
      return matchTrade || matchSci || matchBar;
    }
    return true;
  });

  return (
    <>
      <div 
        onClick={handleBackdropClick}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        dir="rtl"
      >
        <div 
          className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center shadow-2xs border border-brand/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                  دليل الأدوية المرجعي الخارجي
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    جدول منفصل معزول
                  </span>
                </h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  استيراد وتحديث قاعدة بيانات الأدوية والأسعار الرسمية من ملفات إكسل بدون التأثير على مخزنك أو شجرة أصنافك
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark">
                <button
                  type="button"
                  onClick={() => setActiveTab('import')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'import'
                      ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>استيراد وتحديث من إكسل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('browse')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'browse'
                      ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>تصفح وبحث الدليل</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => void requestClose()}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl flex items-center gap-2.5 text-xs text-danger dark:text-danger-bright">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center gap-2.5 text-xs text-paid dark:text-paid-bright">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 2. Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {activeTab === 'import' ? (
              <>
                {/* Download Template Banner */}
                <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-ink dark:text-ink-dark">
                        نموذج إكسل دليل الأدوية المعتمد (.xlsx)
                      </h4>
                      <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5">
                        حمل النموذج القياسي بالترتيب المعتمد للأعمدة: الباركود، الاسم التجاري، المادة الفعالة، الشكل الدوائي، التركيز، الشركة المصنعة، السعر الرسمي.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href="/دليل_الأدوية_المصرية_الشامل.xlsx"
                      download="دليل_الأدوية_المصرية_الشامل.xlsx"
                      className="shrink-0 h-9 px-3.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer no-underline"
                      title="تحميل الدليل الشامل المحتوي على 237 دواء مصري معتمد بالباركود والأسعار الرسمية"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل دليل الأدوية الشامل (237 دواء)</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleDownloadTemplate()}
                      disabled={isDownloadingTemplate}
                      className="shrink-0 h-9 px-3.5 rounded-xl bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>{isDownloadingTemplate ? 'جاري التوليد...' : 'تحميل نموذج إكسل فارغ'}</span>
                    </button>
                  </div>
                </div>

                {/* Upload Zone / Dropzone */}
                {!selectedFile && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                      isDragging
                        ? 'border-brand bg-brand-soft/20 dark:bg-brand-soft/10'
                        : 'border-line dark:border-line-dark hover:border-brand/60 bg-surface-2/40 hover:bg-surface-2 dark:bg-surface-dark-2/40 dark:hover:bg-surface-dark-2'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink dark:text-ink-dark">
                        اسحب ملف إكسل دواء هنا أو اضغط للاختيار من جهازك
                      </p>
                      <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">
                        يدعم ملفات بصيغة (.xlsx, .xls) - سرعة معالجة عالية حتى عشرات الآلاف من الأصناف
                      </p>
                    </div>
                  </div>
                )}

                {/* File Selected & Preview */}
                {selectedFile && (
                  <div className="space-y-4">
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-5 h-5 text-brand dark:text-brand-bright" />
                        <div>
                          <p className="text-xs font-bold text-ink dark:text-ink-dark font-mono">{selectedFile.name}</p>
                          <p className="text-[10px] text-ink-muted">{(selectedFile.size / 1024).toFixed(1)} كيلوبايت</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setFileBase64('');
                          setPreviewData(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="px-3 h-8 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs font-bold text-ink-muted hover:text-danger hover:border-danger/30 transition-colors cursor-pointer"
                      >
                        اختيار ملف آخر
                      </button>
                    </div>

                    {isPreviewing && (
                      <div className="p-8 text-center text-ink-muted space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand" />
                        <p className="text-xs font-bold">جاري قراءة وفحص ملف الإكسل ومقارنته بقاعدة البيانات...</p>
                      </div>
                    )}

                    {previewData && (
                      <div className="space-y-3">
                        {/* Summary Badges */}
                        <div className="grid grid-cols-4 gap-2.5">
                          <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                              statusFilter === 'all'
                                ? 'bg-surface dark:bg-surface-dark border-brand shadow-xs'
                                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark opacity-80'
                            }`}
                          >
                            <span className="text-[11px] text-ink-muted block font-medium">إجمالي الصفوف</span>
                            <span className="text-base font-bold font-mono text-ink dark:text-ink-dark">
                              {previewData.totalRows}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatusFilter('NEW')}
                            className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                              statusFilter === 'NEW'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-paid shadow-xs'
                                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark opacity-80'
                            }`}
                          >
                            <span className="text-[11px] text-paid block font-medium">أصناف جديدة</span>
                            <span className="text-base font-bold font-mono text-paid">
                              {previewData.newRowsCount}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatusFilter('UPDATE')}
                            className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                              statusFilter === 'UPDATE'
                                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 shadow-xs'
                                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark opacity-80'
                            }`}
                          >
                            <span className="text-[11px] text-blue-600 dark:text-blue-400 block font-medium">تحديث أسعار وبيانات</span>
                            <span className="text-base font-bold font-mono text-blue-600 dark:text-blue-400">
                              {previewData.updateRowsCount}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatusFilter('ERROR')}
                            className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                              statusFilter === 'ERROR'
                                ? 'bg-red-50 dark:bg-red-950/40 border-danger shadow-xs'
                                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark opacity-80'
                            }`}
                          >
                            <span className="text-[11px] text-danger block font-medium">صفوف بها أخطاء</span>
                            <span className="text-base font-bold font-mono text-danger">
                              {previewData.errorRowsCount}
                            </span>
                          </button>
                        </div>

                        {/* Search inside preview */}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="بحث في نتائج المعاينة بالباركود أو الاسم..."
                            value={previewSearch}
                            onChange={(e) => setPreviewSearch(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                          />
                          <Search className="w-4 h-4 text-ink-muted absolute left-2.5 top-2.5" />
                        </div>

                        {/* Preview Table */}
                        <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                          <table className="w-full text-right text-xs">
                            <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted sticky top-0 border-b border-line dark:border-line-dark text-[11px]">
                              <tr>
                                <th className="p-2 w-12 text-center">#</th>
                                <th className="p-2 w-32">الباركود</th>
                                <th className="p-2">الاسم التجاري</th>
                                <th className="p-2">المادة الفعالة</th>
                                <th className="p-2 w-20">السعر</th>
                                <th className="p-2 w-28 text-center">الحالة</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line dark:divide-line-dark">
                              {filteredPreviewRows.slice(0, 100).map((row, idx) => (
                                <tr key={idx} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50">
                                  <td className="p-2 text-center font-mono text-ink-muted">{row.rowNumber}</td>
                                  <td className="p-2 font-mono font-bold text-ink dark:text-ink-dark">{row.barcode}</td>
                                  <td className="p-2 font-bold text-ink dark:text-ink-dark">
                                    {row.tradeName}
                                    {row.form && <span className="text-[10px] text-ink-muted mr-1">({row.form})</span>}
                                  </td>
                                  <td className="p-2 text-ink-muted">{row.scientificName || '-'}</td>
                                  <td className="p-2 font-mono font-bold text-paid">
                                    {row.publicPricePiasters ? (row.publicPricePiasters / 100).toFixed(2) : '-'}
                                  </td>
                                  <td className="p-2 text-center">
                                    {row.status === 'NEW' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                                        <Check className="w-3 h-3" /> جديد
                                      </span>
                                    )}
                                    {row.status === 'UPDATE' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-[10px] font-bold">
                                        تحديث
                                      </span>
                                    )}
                                    {row.status === 'ERROR' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 text-[10px] font-bold" title={row.reason || ''}>
                                        <AlertTriangle className="w-3 h-3" /> خطأ: {row.reason}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {filteredPreviewRows.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="p-6 text-center text-ink-muted">
                                    لا توجد صفوف تطابق الفلتر الحالي
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Browse Tab */
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="ابحث بالاسم التجاري، المادة الفعالة، أو الباركود..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void loadReferenceData(searchQuery);
                      }}
                      className="w-full h-10 pl-9 pr-3.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    />
                    <Search className="w-4 h-4 text-ink-muted absolute left-3 top-3" />
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadReferenceData(searchQuery)}
                    disabled={isSearching}
                    className="h-10 px-4 rounded-xl bg-brand dark:bg-brand-bright text-white dark:text-surface-dark font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                    <span>بحث</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsConfirmClearOpen(true)}
                    className="h-10 px-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-danger dark:text-danger-bright font-bold text-xs flex items-center gap-1.5 hover:bg-red-100 transition-colors cursor-pointer"
                    title="تفريغ الدليل بالكامل"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>مسح الدليل كاملاً</span>
                  </button>
                </div>

                {/* Table of Drugs */}
                <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted sticky top-0 border-b border-line dark:border-line-dark text-[11px]">
                      <tr>
                        <th className="p-2.5 w-36">الباركود</th>
                        <th className="p-2.5">الاسم التجاري والشكل</th>
                        <th className="p-2.5">المادة الفعالة</th>
                        <th className="p-2.5">الشركة المصنعة</th>
                        <th className="p-2.5 w-24 text-left">السعر الرسمي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-line-dark">
                      {searchResults.map((item) => (
                        <tr key={item.id} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40">
                          <td className="p-2.5 font-mono font-bold text-ink dark:text-ink-dark">{item.barcode}</td>
                          <td className="p-2.5">
                            <span className="font-bold text-ink dark:text-ink-dark block">{item.tradeName}</span>
                            {(item.form || item.strength) && (
                              <span className="text-[10px] text-ink-muted">
                                {[item.form, item.strength].filter(Boolean).join(' - ')}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-ink-muted">{item.scientificName || '-'}</td>
                          <td className="p-2.5 text-ink-muted">{item.manufacturer || '-'}</td>
                          <td className="p-2.5 font-mono font-bold text-paid text-left">
                            {item.publicPricePiasters ? formatArabicCurrency(item.publicPricePiasters) : '-'}
                          </td>
                        </tr>
                      ))}
                      {searchResults.length === 0 && !isSearching && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-ink-muted">
                            <Pill className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-xs">لا توجد أدوية مطابقة للبحث أو أن الدليل فارغ حالياً.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 3. Footer */}
          <div className="px-6 py-3.5 border-t border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 flex items-center justify-between shrink-0">
            <div className="text-[11px] text-ink-muted">
              {totalCount > 0 && `إجمالي الأدوية المسجلة بالدليل: ${totalCount} صنف`}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void requestClose()}
                className="px-4 h-9 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold hover:bg-surface-2 transition-colors cursor-pointer"
              >
                إغلاق
              </button>

              {activeTab === 'import' && previewData && (
                <button
                  type="button"
                  onClick={() => void handleConfirmImport()}
                  disabled={isImporting || (previewData.newRowsCount === 0 && previewData.updateRowsCount === 0)}
                  className="px-5 h-9 bg-brand dark:bg-brand-bright hover:bg-brand-dark text-white dark:text-surface-dark rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isImporting ? 'جاري الاستيراد والتحديث...' : 'تأكيد الاستيراد والحفظ بالدليل'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Clear Modal */}
      <ConfirmModal
        isOpen={isConfirmClearOpen}
        onCancel={() => setIsConfirmClearOpen(false)}
        onConfirm={() => void handleClearAll()}
        title="تأكيد مسح دليل الأدوية بالكامل"
        message="هل أنت متأكد تماماً من رغبتك في تفريغ ومسح جميع الأصناف من دليل الأدوية المرجعي؟ لن تتأثر منتجات متجرك الحالية، ولكن لن تظهر اقتراحات الدليل عند مسح الأصناف غير المعرفة."
        confirmText={isClearing ? 'جاري المسح...' : 'نعم، أفرغ الدليل'}
        isDanger={true}
      />
    </>
  );
};
