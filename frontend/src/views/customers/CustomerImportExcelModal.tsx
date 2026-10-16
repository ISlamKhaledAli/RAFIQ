import React from 'react';
import {
  FileSpreadsheet,
  X,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import type { CustomerImportPreviewResult, CustomerImportResult } from '../../types/models';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface CustomerImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  importError: string | null;
  importResult: CustomerImportResult | null;
  isDownloadingTemplate: boolean;
  onDownloadTemplate: () => void;
  isParsingFile: boolean;
  isImporting: boolean;
  importFileName: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importPreview: CustomerImportPreviewResult | null;
  onExecuteImport: () => void;
}

export const CustomerImportExcelModal: React.FC<CustomerImportExcelModalProps> = ({
  isOpen,
  onClose,
  importError,
  importResult,
  isDownloadingTemplate,
  onDownloadTemplate,
  isParsingFile,
  isImporting,
  importFileName,
  onFileChange,
  importPreview,
  onExecuteImport,
}) => {
  const isDirty = Boolean(importPreview && !importResult);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء استيراد العملاء؟',
    confirmMessage: 'تم رفع وفحص شيت العملاء. هل أنت متأكد من الإلغاء والتراجع دون استيراد؟',
  });

  if (!isOpen) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Modal Header */}
        <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-paid-soft dark:bg-paid-dark-soft flex items-center justify-center text-paid dark:text-paid-bright">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink dark:text-ink-dark">استيراد العملاء وديونهم الافتتاحية من إكسل</h3>
              <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted">نقل بيانات العملاء وأرصدة الدفتر القديم دفعة واحدة إلى النظام في ثوانٍ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 rounded hover:bg-surface dark:hover:bg-surface-dark flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Error Alert */}
          {importError && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 rounded text-xs text-danger dark:text-danger-bright flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger dark:text-danger-bright" />
              <span>{importError}</span>
            </div>
          )}

          {/* Success Alert */}
          {importResult && (
            <div className="p-4 bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-emerald-800/40 rounded-lg text-paid dark:text-paid-bright space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                <span>{importResult.message}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] border-t border-paid-border dark:border-emerald-800/40">
                <div>العملاء المضافون: <strong className="font-mono text-ink dark:text-ink-dark">{importResult.importedCount}</strong></div>
                <div>السطور المتخطاة: <strong className="font-mono text-ink dark:text-ink-dark">{importResult.skippedCount}</strong></div>
                <div>إجمالي الديون الافتتاحية: <strong className="font-mono text-paid dark:text-paid-bright">{importResult.totalOpeningDebtsFormatted}</strong></div>
              </div>
            </div>
          )}

          {/* Step 1: Download Template & Upload Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Download Template Box */}
            <div className="p-3.5 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-lg flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-xs text-ink dark:text-ink-dark flex items-center gap-1.5 mb-1">
                  <Download className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>1. تحميل النموذج المعتمد</span>
                </h4>
                <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                  قم بتحميل قالب الإكسل المنسق خصيصاً بنظام رفيق، والذي يحتوي على الأعمدة: اسم العميل، الهاتف، الرصيد الافتتاحي، وحد الائتمان.
                </p>
              </div>
              <button
                type="button"
                onClick={onDownloadTemplate}
                disabled={isDownloadingTemplate}
                className="mt-3 w-full h-8 px-3 rounded bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloadingTemplate ? 'جاري التحميل...' : 'تحميل نموذج العملاء (.xlsx)'}</span>
              </button>
            </div>

            {/* Upload File Box */}
            <div className="p-3.5 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-lg flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-xs text-ink dark:text-ink-dark flex items-center gap-1.5 mb-1">
                  <Upload className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>2. رفع وتدقيق ملف الإكسل</span>
                </h4>
                <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                  اختر ملف الإكسل بعد ملء بيانات العملاء. سيقوم النظام بفحص الأسماء وتفادي تكرار الهواتف وحساب مجموع الديون.
                </p>
              </div>
              <label className="mt-3 cursor-pointer w-full h-8 px-3 rounded bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{isParsingFile ? 'جاري فحص وتدقيق الملف...' : importFileName ? `تغيير الملف: ${importFileName}` : 'اختيار ملف الإكسل (.xlsx)'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={onFileChange}
                  disabled={isParsingFile || isImporting}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Step 2: Preview Results (when preview is loaded) */}
          {importPreview && (
            <div className="space-y-3 pt-2">
              {/* Stats Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="p-2.5 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded">
                  <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block">إجمالي السطور بالملف</span>
                  <span className="text-base font-bold font-mono text-ink dark:text-ink-dark">{importPreview.totalRowsCount}</span>
                </div>
                <div className="p-2.5 bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-emerald-800/40 rounded">
                  <span className="text-[10px] text-paid dark:text-paid-bright block">سطور صالحة للاستيراد</span>
                  <span className="text-base font-bold font-mono text-paid dark:text-paid-bright">{importPreview.validRowsCount}</span>
                </div>
                <div className="p-2.5 bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 rounded">
                  <span className="text-[10px] text-danger dark:text-danger-bright block">سطور غير صالحة / أخطاء</span>
                  <span className="text-base font-bold font-mono text-danger dark:text-danger-bright">{importPreview.invalidRowsCount}</span>
                </div>
                <div className="p-2.5 bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 rounded">
                  <span className="text-[10px] text-brand dark:text-brand-bright block">إجمالي الديون الافتتاحية</span>
                  <span className="text-base font-bold font-mono text-brand dark:text-brand-bright">{importPreview.totalOpeningDebtsFormatted}</span>
                </div>
              </div>

              {/* Warning on duplicates */}
              {importPreview.duplicatePhonesCount > 0 && (
                <div className="p-2.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 rounded text-xs text-ink dark:text-ink-dark flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-warn dark:text-warn-bright" />
                  <span>يوجد {importPreview.duplicatePhonesCount} رقم هاتف مكرر بالملف أو مسجل مسبقاً بالنظام. سيتم استبعاد الأسطر غير الصالحة تلقائياً.</span>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-[11px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-12">السطر</th>
                      <th className="px-3 py-2">اسم العميل</th>
                      <th className="px-3 py-2">رقم الهاتف</th>
                      <th className="px-3 py-2 text-center">الرصيد الافتتاحي</th>
                      <th className="px-3 py-2 text-center">حد الائتمان</th>
                      <th className="px-3 py-2">الملاحظات</th>
                      <th className="px-3 py-2 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-canvas dark:hover:bg-canvas-dark' : 'bg-danger-soft/30 dark:bg-danger-dark-soft/30'}>
                        <td className="px-3 py-1.5 font-mono text-ink-muted dark:text-ink-dark-muted text-[11px]">{row.rowIndex}</td>
                        <td className="px-3 py-1.5 font-bold text-ink dark:text-ink-dark">{row.name || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-ink-muted dark:text-ink-dark-muted">{row.phone || '—'}</td>
                        <td className="px-3 py-1.5 font-mono font-bold text-center text-ink dark:text-ink-dark">
                          {row.initialBalanceFormatted || '0.00 ج.م'}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-center text-ink-muted dark:text-ink-dark-muted">
                          {row.creditLimitFormatted || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-ink-muted dark:text-ink-dark-muted text-[11px] truncate max-w-[140px]" title={row.notes}>
                          {row.notes || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-emerald-800/40">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>جاهز</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30"
                              title={row.errors.join(' | ')}
                            >
                              <AlertCircle className="w-3 h-3" />
                              <span>{row.errors[0] || 'خطأ'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 hairline-t border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={requestClose}
            className="px-4 py-1.5 rounded bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            {importPreview && importPreview.validRowsCount > 0 && !importResult && (
              <button
                type="button"
                onClick={onExecuteImport}
                disabled={isImporting}
                className="px-5 py-2 rounded bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isImporting ? 'جاري الاستيراد والحفظ...' : `تأكيد واستيراد (${importPreview.validRowsCount}) عميل إلى النظام`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
