import { useState } from 'react';
import { 
  FileSpreadsheet, 
  FolderDown, 
  FolderOpen, 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  FileCheck, 
  Database, 
  Users, 
  Receipt, 
  Truck, 
  Package, 
  Layers
} from 'lucide-react';
import { invoke, type FullStoreExportResult } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';

interface FullStoreExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullStoreExportModal = ({ isOpen, onClose }: FullStoreExportModalProps) => {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<FullStoreExportResult | null>(null);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    try {
      const res = await invoke<{ selectedFolder?: string; cancelled: boolean }>('excel:browseExportFolder');
      if (res && !res.cancelled && res.selectedFolder) {
        setSelectedFolder(res.selectedFolder);
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'خطأ في التحديد',
        message: err?.message || 'تعذر فتح نافذة اختيار المجلد.',
        variant: 'error'
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const res = await invoke<FullStoreExportResult>('excel:exportFullStore', {
        targetFolder: selectedFolder || undefined
      });

      setExportResult(res);

      if (res.success) {
        await rafiqAlert({
          title: 'اكتمال التصدير الشامل',
          message: `${res.message}\nتم حفظ الملفات في:\n${res.exportFolder}`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'فشل التصدير',
          message: res.message || 'تعذر تصدير بيانات المحل.',
          variant: 'error'
        });
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'خطأ غير متوقع',
        message: err?.message || 'حدث خطأ أثناء تصدير البيانات.',
        variant: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenFolder = async () => {
    const folderToOpen = exportResult?.exportFolder || selectedFolder;
    if (!folderToOpen) return;

    try {
      await invoke('excel:openExportFolder', { folderPath: folderToOpen });
    } catch (err: any) {
      await rafiqAlert({
        title: 'تعذر فتح المجلد',
        message: err?.message || 'المجلد غير موجود على هذا الجهاز.',
        variant: 'error'
      });
    }
  };

  const handleRunParityTests = async () => {
    try {
      const res = await invoke<any>('excel:runExportTests');
      if (res.success) {
        await rafiqAlert({
          title: 'تأكيد مطابقة البيانات',
          message: `${res.message}\nتأكيدات النجاح: ${res.passedAssertions}/${res.totalAssertions}`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'فحص المطابقة',
          message: res.message || 'تعذر مطابقة بعض الصفوف أو المجاميع.',
          variant: 'error'
        });
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'خطأ',
        message: err?.message || 'تعذر تشغيل اختبارات المطابقة.',
        variant: 'error'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-line flex flex-col overflow-hidden text-ink font-sans text-right"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="bg-brand-dark px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-paid">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">تصدير كل بيانات المحل بضغطة واحدة</h2>
              <p className="text-xs text-white/70">
                بياناتك ملكك 100% في ملفات إكسل مفتوحة بدون أي قيود
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isExporting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Freedom & Security Guarantee Banner */}
          <div className="flex items-start gap-3 p-4 bg-paid-soft rounded-xl text-xs text-paid border border-paid/20 leading-relaxed font-sans">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sm font-bold text-paid mb-1">
                بياناتك ملكك بالكامل (حرية تامة 100%):
              </strong>
              تقدر في أي وقت تستخرج كل بيانات وسجلات محلك (البضاعة، الزبائن، الشكك والديون، الموردين، فواتير البيع، وحركات المخزن) في ملفات إكسل جاهزة ومنظمة، بدون أي تشفير أو رسوم خروج.
            </div>
          </div>

          {/* Files Summary Grid */}
          <div className="bg-surface-2 p-4 rounded-xl border border-line space-y-3">
            <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider">
              الملفات اللي هتتعمل في المجلد ده:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-ink font-medium">
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Package className="w-4 h-4 text-brand shrink-0" />
                <span>01. البضاعة والمخزن</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Users className="w-4 h-4 text-paid shrink-0" />
                <span>02. الزبائن وحسابات الشكك</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Truck className="w-4 h-4 text-warn shrink-0" />
                <span>03. الموردين والأرصدة</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Receipt className="w-4 h-4 text-brand-dark shrink-0" />
                <span>04. فواتير وحركات البيع</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Database className="w-4 h-4 text-brand shrink-0" />
                <span>05. حركات المخزن</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Layers className="w-4 h-4 text-paid shrink-0" />
                <span>06. الورديات والتقفيل اليومي</span>
              </div>
            </div>
            <p className="text-[11px] text-ink-muted font-normal pt-1">
              معاهم شيت مجمّع فيه كل البيانات في ملف واحد، ووثيقة رسمية بملكية البيانات.
            </p>
          </div>

          {/* Export Destination Folder Picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink">
              عاوز تحفظ الملفات فين؟ (مجلد على الجهاز أو فلاشة):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={selectedFolder || 'على سطح المكتب تلقائياً (Desktop / RafiqExport)'}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line text-xs font-mono text-ink-muted select-all"
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={isExporting}
                className="px-4 py-2.5 rounded-xl bg-surface border border-line hover:border-line-hover text-ink text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <FolderOpen className="w-4 h-4 text-brand" />
                <span>تغيير المجلد</span>
              </button>
            </div>
          </div>

          {/* Result Card If Exported */}
          {exportResult && exportResult.success && (
            <div className="p-4 bg-paid-soft rounded-xl border border-paid/30 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-paid font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>تم تصدير {exportResult.generatedFiles.length} ملفات بنجاح تام!</span>
                </div>
                <button
                  onClick={handleOpenFolder}
                  className="px-3 py-1.5 rounded-lg bg-paid text-white text-xs font-bold flex items-center gap-1.5 hover:bg-paid/90 transition-all shadow-xs"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>فتح المجلد دلوقتي</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-ink pt-1 border-t border-paid/20">
                <div className="p-2 bg-surface rounded-lg">
                  أصناف البضاعة: <strong>{exportResult.productsCount}</strong>
                </div>
                <div className="p-2 bg-surface rounded-lg">
                  الزبائن: <strong>{exportResult.customersCount}</strong>
                </div>
                <div className="p-2 bg-surface rounded-lg">
                  الفواتير: <strong>{exportResult.salesCount}</strong>
                </div>
              </div>

              <div className="text-[11px] font-mono text-ink-muted break-all" dir="ltr">
                Folder: {exportResult.exportFolder}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-surface-2 px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRunParityTests}
            disabled={isExporting}
            className="px-3.5 py-2 rounded-xl bg-surface border border-line hover:border-line-hover text-ink-muted hover:text-ink text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
            title="فحص مطابقة عدد الصفوف والمجاميع بين إكسل وقاعدة البيانات"
          >
            <FileCheck className="w-4 h-4 text-paid" />
            <span>مطابقة الأرقام والإجمالي</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl border border-line text-ink-muted hover:text-ink text-xs font-semibold hover:bg-surface transition-all disabled:opacity-50"
            >
              إغلاق
            </button>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              <FolderDown className="w-4 h-4" />
              <span>{isExporting ? 'بيتم تجهيز وتصدير كل الملفات دلوقتي...' : 'تصدير كل البيانات بضغطة واحدة'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

