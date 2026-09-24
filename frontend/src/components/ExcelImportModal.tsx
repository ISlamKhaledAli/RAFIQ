import { useState, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  UploadCloud, 
  Download, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  FileText
} from 'lucide-react';
import type { Product, Category } from '../types/models';
import { 
  downloadExcelTemplate, 
  downloadErrorReport, 
  parseExcelOrCsvFile, 
  validateImportRows,
  type ValidatedImportRow
} from '../utils/excelImport';
import { invoke } from '../bridge/ipc';
import { formatArabicCurrency } from '../utils/money';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (summary: string) => void;
  existingProducts: Product[];
  categories: Category[];
}

export const ExcelImportModal = ({
  isOpen,
  onClose,
  onSuccess,
  existingProducts,
  categories
}: ExcelImportModalProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ValidatedImportRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'error'>('skip');
  const [onlyValidRows, setOnlyValidRows] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validRows = parsedRows.filter(r => r.status === 'valid');
  const warningRows = parsedRows.filter(r => r.status === 'warning');
  const errorRows = parsedRows.filter(r => r.status === 'error');

  const rowsToImport = onlyValidRows 
    ? parsedRows.filter(r => r.status !== 'error')
    : parsedRows;

  const canImport = rowsToImport.length > 0 && (
    duplicateStrategy !== 'error' || warningRows.length === 0
  ) && (
    onlyValidRows || errorRows.length === 0
  );

  const handleFileProcess = async (file: File) => {
    setErrorMessage('');
    setSelectedFile(file);
    setParsing(true);

    try {
      const rawRows = await parseExcelOrCsvFile(file);
      if (rawRows.length === 0) {
        setErrorMessage('الملف المختار فارغ أو لا يحتوي على صفوف بيانات صالحة.');
        setParsedRows([]);
        return;
      }

      const validated = validateImportRows(rawRows, existingProducts, categories);
      setParsedRows(validated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر قراءة ملف الإكسل. يرجى التأكد من سلامة الملف.';
      setErrorMessage(msg);
      setParsedRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      void handleFileProcess(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      void handleFileProcess(file);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParsedRows([]);
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!canImport) return;

    setImporting(true);
    setErrorMessage('');

    try {
      const itemsPayload = rowsToImport.map(r => ({
        barcode: r.payload.barcode || '',
        name: r.payload.name,
        categoryName: r.payload.categoryName,
        unit: r.payload.unit,
        pricePiasters: r.payload.pricePiasters,
        costPiasters: r.payload.costPiasters,
        stockQuantityMilli: r.payload.stockQuantityMilli,
        minStockQuantityMilli: r.payload.minStockQuantityMilli,
        taxRatePercent: r.payload.taxRatePercent,
        internalCode: r.payload.internalCode,
        taxCategoryCode: r.payload.taxCategoryCode,
        barcodes: r.payload.barcodes
      }));

      const res = await invoke<{
        totalProcessed: number;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
        failedCount: number;
        errors: string[];
      }>('products:importBatch', {
        items: itemsPayload,
        duplicateStrategy
      });

      const summary = `تمت العملية بنجاح: تم إضافة (${res.createdCount}) صنف جديد، وتحديث (${res.updatedCount})، وتخطي (${res.skippedCount}) صنف مكرر.`;
      onSuccess(summary);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الأصناف بقاعدة البيانات.';
      setErrorMessage(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div 
        className="bg-surface hairline-all rounded-lg shadow-xl w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        dir="rtl"
      >
        {/* 1. Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink">استيراد الأصناف من ملف إكسل أو CSV</h2>
              <p className="text-[11px] text-ink-muted">إضافة وتحديث المنتجات والمخزون دفعة واحدة في معاملة آمنة (ClosedXML / SQLite)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">

          {/* Template Download Banner */}
          <div className="bg-emerald-500/5 hairline-all rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-emerald-500/20">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-700 shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-950 text-[12.5px]">هل تحتاج نموذج الإكسل المعتمد لملء الأصناف؟</h4>
                <p className="text-emerald-800 text-[11px] leading-relaxed mt-0.5">
                  قم بتحميل ملف النموذج الجاهز (يحتوي على كافة الأعمدة، أمثلة واقعية للبقالة والخضار والوزن، وتنسيق باركود نصي سليم).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadExcelTemplate}
              className="shrink-0 h-9 px-3.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11.5px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4" />
              <span>تحميل نموذج الإكسل الجاهز (.xlsx)</span>
            </button>
          </div>

          {/* Upload Dropzone */}
          {!selectedFile ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-7 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2.5 ${
                isDragging 
                  ? 'border-emerald-500 bg-emerald-500/5' 
                  : 'border-line hover:border-emerald-400 bg-surface-2/40 hover:bg-surface-2'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-11 h-11 rounded-full bg-surface-3 hairline-all flex items-center justify-center text-ink-muted">
                <UploadCloud className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-ink text-[12.5px]">اسحب ملف الإكسل هنا، أو انقر لاختيار الملف من جهازك</p>
                <p className="text-ink-muted text-[11px] mt-0.5">الملفات المدعومة: مصنفات Excel (.xlsx, .xls) أو ملفات القيم المفصولة (.csv)</p>
              </div>
            </div>
          ) : (
            <div className="bg-surface-2 hairline-all rounded-md p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-ink text-[12px]">{selectedFile.name}</span>
                  <span className="text-[11px] text-ink-muted mr-2 font-mono">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-surface hover:bg-surface-3 hairline-all text-ink transition-colors"
                >
                  تغيير الملف
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-1 text-ink-muted hover:text-red-600 rounded transition-colors"
                  title="إلغاء الملف"
                >
                  <X className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-700 px-3.5 py-2.5 rounded-md flex items-center gap-2 text-[11.5px]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Validation & Preview Section */}
          {parsing ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
              <p className="text-xs font-bold">جاري قراءة وفحص بيانات الملف والتحقق من الأسعار والباركودات...</p>
            </div>
          ) : parsedRows.length > 0 ? (
            <div className="space-y-3.5">
              
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-surface-2 hairline-all p-2.5 rounded-md">
                  <span className="text-ink-muted text-[10.5px]">إجمالي الأصناف بالملف</span>
                  <p className="text-base font-bold text-ink mt-0.5 font-mono">{parsedRows.length}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-md">
                  <span className="text-emerald-700 text-[10.5px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    أصناف جديدة جاهزة
                  </span>
                  <p className="text-base font-bold text-emerald-800 mt-0.5 font-mono">{validRows.length}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-md">
                  <span className="text-amber-700 text-[10.5px] font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    أصناف مسجلة مسبقاً
                  </span>
                  <p className="text-base font-bold text-amber-800 mt-0.5 font-mono">{warningRows.length}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-md">
                  <span className="text-red-700 text-[10.5px] font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    صفوف تحتوي أخطاء
                  </span>
                  <p className="text-base font-bold text-red-800 mt-0.5 font-mono">{errorRows.length}</p>
                </div>
              </div>

              {/* Options & Strategies Bar */}
              <div className="bg-surface-2 hairline-all rounded-md p-3 space-y-2.5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  
                  {/* Duplicate Strategy */}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-[11.5px] shrink-0">معالجة الأصناف المكررة:</span>
                    <select
                      value={duplicateStrategy}
                      onChange={(e) => setDuplicateStrategy(e.target.value as 'skip' | 'update' | 'error')}
                      className="h-8 px-2.5 rounded bg-surface hairline-all text-ink text-[11px] font-bold focus:outline-none focus:border-emerald-500"
                    >
                      <option value="skip">تخطي (الإبقاء على الصنف القديم بدون تعديل)</option>
                      <option value="update">تحديث (تعديل السعر والبيانات بالجديد)</option>
                      <option value="error">إيقاف (رفض الاستيراد عند وجود أي تكرار)</option>
                    </select>
                  </div>

                  {/* Filter Valid / Export Errors */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11.5px] font-bold text-ink">
                      <input
                        type="checkbox"
                        checked={onlyValidRows}
                        onChange={(e) => setOnlyValidRows(e.target.checked)}
                        className="rounded border-line text-emerald-600 focus:ring-0"
                      />
                      <span>استيراد الصفوف السليمة وتجاوز الأخطاء ({rowsToImport.length} صنف)</span>
                    </label>

                    {errorRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => downloadErrorReport(errorRows)}
                        className="h-7 px-2.5 rounded bg-red-600/10 hover:bg-red-600/20 text-red-700 text-[10.5px] font-bold flex items-center gap-1 transition-colors border border-red-600/20"
                        title="تحميل تقرير تفصيلي بأسباب أخطاء الصفوف لتصحيحها"
                      >
                        <Download className="w-3 h-3" />
                        <span>تصدير تقرير الأخطاء ({errorRows.length})</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="hairline-all rounded-md overflow-hidden bg-surface">
                <div className="max-h-60 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-right border-collapse text-[11px]">
                    <thead className="bg-surface-2 text-ink-muted font-bold sticky top-0 z-10 hairline-b">
                      <tr>
                        <th className="py-2 px-3 w-16 text-center">الحالة</th>
                        <th className="py-2 px-3">الباركود</th>
                        <th className="py-2 px-3">اسم الصنف</th>
                        <th className="py-2 px-3">القسم</th>
                        <th className="py-2 px-3 text-center">الوحدة</th>
                        <th className="py-2 px-3 text-left">سعر البيع</th>
                        <th className="py-2 px-3 text-left">التكلفة</th>
                        <th className="py-2 px-3 text-center">الرصيد</th>
                        <th className="py-2 px-3">الملاحظات والتدقيق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {parsedRows.map((row, idx) => {
                        return (
                          <tr 
                            key={idx} 
                            className={`hover:bg-surface-2/60 transition-colors ${
                              row.status === 'error' ? 'bg-red-500/5' : row.status === 'warning' ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-center">
                              {row.status === 'valid' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/15 text-emerald-800">
                                  سليم
                                </span>
                              ) : row.status === 'warning' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-500/15 text-amber-800">
                                  مكرر
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-red-500/15 text-red-800">
                                  خطأ
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono text-ink font-semibold">
                              {row.data.barcode || <span className="text-ink-muted italic">بدون</span>}
                            </td>
                            <td className="py-2 px-3 font-bold text-ink">{row.data.name}</td>
                            <td className="py-2 px-3 text-ink-muted">{row.data.categoryName || 'عام'}</td>
                            <td className="py-2 px-3 text-center font-bold">
                              {row.data.unit === 'kg' ? 'كجم' : 'قطعة'}
                            </td>
                            <td className="py-2 px-3 text-left font-mono font-bold text-ink">
                              {formatArabicCurrency(row.payload.pricePiasters)}
                            </td>
                            <td className="py-2 px-3 text-left font-mono text-ink-muted">
                              {formatArabicCurrency(row.payload.costPiasters)}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">
                              {row.data.unit === 'kg' ? (row.payload.stockQuantityMilli / 1000).toFixed(3) : (row.payload.stockQuantityMilli / 1000)}
                            </td>
                            <td className="py-2 px-3 text-[10.5px]">
                              {row.errors.length > 0 ? (
                                <span className="text-red-700 font-bold">{row.errors.join(' • ')}</span>
                              ) : row.warnings.length > 0 ? (
                                <span className="text-amber-700">{row.warnings.join(' • ')}</span>
                              ) : (
                                <span className="text-emerald-700">جاهز للاستيراد</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : null}

        </div>

        {/* 3. Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-line bg-surface-2/60 shrink-0">
          <div className="text-[11.5px] text-ink-muted">
            {parsedRows.length > 0 && (
              <span>
                سيتم استيراد <strong className="text-ink font-mono">{rowsToImport.length}</strong> من إجمالي <strong className="text-ink font-mono">{parsedRows.length}</strong> صنف
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="h-8 px-4 rounded bg-surface hover:bg-surface-3 hairline-all text-ink font-bold text-[11.5px] transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={!canImport || importing}
              className={`h-8 px-5 rounded font-bold text-[11.5px] flex items-center gap-1.5 transition-colors shadow-sm ${
                canImport && !importing
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-surface-3 text-ink-muted border border-line cursor-not-allowed opacity-60'
              }`}
            >
              {importing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الاستيراد والتخزين...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تأكيد استيراد ({rowsToImport.length}) صنف</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
