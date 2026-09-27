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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Modal Header */}
        <div className="h-14 px-5 bg-surface-2 hairline-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-100 flex items-center justify-center text-emerald-800">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink">استيراد العملاء وديونهم الافتتاحية من إكسل</h3>
              <p className="text-[11px] text-ink-muted">نقل بيانات العملاء وأرصدة الدفتر القديم دفعة واحدة إلى النظام في ثوانٍ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Error Alert */}
          {importError && (
            <div className="p-3 bg-danger-soft border border-danger/30 rounded text-xs text-danger flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* Success Alert */}
          {importResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{importResult.message}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] border-t border-emerald-200/60">
                <div>العملاء المضافون: <strong className="font-mono">{importResult.importedCount}</strong></div>
                <div>السطور المتخطاة: <strong className="font-mono">{importResult.skippedCount}</strong></div>
                <div>إجمالي الديون الافتتاحية: <strong className="font-mono text-emerald-800">{importResult.totalOpeningDebtsFormatted}</strong></div>
              </div>
            </div>
          )}

          {/* Step 1: Download Template & Upload Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Download Template Box */}
            <div className="p-3.5 bg-canvas border border-line rounded-lg flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-xs text-ink flex items-center gap-1.5 mb-1">
                  <Download className="w-3.5 h-3.5 text-brand" />
                  <span>1. تحميل النموذج المعتمد</span>
                </h4>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  قم بتحميل قالب الإكسل المنسق خصيصاً بنظام رفيق، والذي يحتوي على الأعمدة: اسم العميل، الهاتف، الرصيد الافتتاحي، وحد الائتمان.
                </p>
              </div>
              <button
                type="button"
                onClick={onDownloadTemplate}
                disabled={isDownloadingTemplate}
                className="mt-3 w-full h-8 px-3 rounded bg-surface hover:bg-surface-2 border border-line text-xs font-bold text-ink flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloadingTemplate ? 'جاري التحميل...' : 'تحميل نموذج العملاء (.xlsx)'}</span>
              </button>
            </div>

            {/* Upload File Box */}
            <div className="p-3.5 bg-canvas border border-line rounded-lg flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-xs text-ink flex items-center gap-1.5 mb-1">
                  <Upload className="w-3.5 h-3.5 text-emerald-700" />
                  <span>2. رفع وتدقيق ملف الإكسل</span>
                </h4>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  اختر ملف الإكسل بعد ملء بيانات العملاء. سيقوم النظام بفحص الأسماء وتفادي تكرار الهواتف وحساب مجموع الديون.
                </p>
              </div>
              <label className="mt-3 cursor-pointer w-full h-8 px-3 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors">
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
                <div className="p-2.5 bg-canvas border border-line rounded">
                  <span className="text-[10px] text-ink-muted block">إجمالي السطور بالملف</span>
                  <span className="text-base font-bold font-mono text-ink">{importPreview.totalRowsCount}</span>
                </div>
                <div className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded">
                  <span className="text-[10px] text-emerald-800 block">سطور صالحة للاستيراد</span>
                  <span className="text-base font-bold font-mono text-emerald-700">{importPreview.validRowsCount}</span>
                </div>
                <div className="p-2.5 bg-danger-soft/50 border border-danger/20 rounded">
                  <span className="text-[10px] text-danger block">سطور غير صالحة / أخطاء</span>
                  <span className="text-base font-bold font-mono text-danger">{importPreview.invalidRowsCount}</span>
                </div>
                <div className="p-2.5 bg-brand-soft border border-brand/20 rounded">
                  <span className="text-[10px] text-brand block">إجمالي الديون الافتتاحية</span>
                  <span className="text-base font-bold font-mono text-brand">{importPreview.totalOpeningDebtsFormatted}</span>
                </div>
              </div>

              {/* Warning on duplicates */}
              {importPreview.duplicatePhonesCount > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>يوجد {importPreview.duplicatePhonesCount} رقم هاتف مكرر بالملف أو مسجل مسبقاً بالنظام. سيتم استبعاد الأسطر غير الصالحة تلقائياً.</span>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-line rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 hairline-b text-ink-muted text-[11px] sticky top-0">
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
                  <tbody className="divide-y divide-line">
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowIndex} className={row.isValid ? 'hover:bg-canvas' : 'bg-danger-soft/30'}>
                        <td className="px-3 py-1.5 font-mono text-ink-muted text-[11px]">{row.rowIndex}</td>
                        <td className="px-3 py-1.5 font-bold text-ink">{row.name || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-ink-muted">{row.phone || '—'}</td>
                        <td className="px-3 py-1.5 font-mono font-bold text-center text-ink">
                          {row.initialBalanceFormatted || '0.00 ج.م'}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-center text-ink-muted">
                          {row.creditLimitFormatted || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-ink-muted text-[11px] truncate max-w-[140px]" title={row.notes}>
                          {row.notes || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>جاهز</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft text-danger"
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
        <div className="h-14 px-5 bg-surface-2 hairline-t flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2"
          >
            إغلاق
          </button>

          <div className="flex items-center gap-2">
            {importPreview && importPreview.validRowsCount > 0 && !importResult && (
              <button
                type="button"
                onClick={onExecuteImport}
                disabled={isImporting}
                className="px-5 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
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
