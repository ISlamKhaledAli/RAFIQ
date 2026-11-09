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
import { useModalDismiss } from '../hooks/useModalDismiss';
import { AppButton } from './AppButton';

interface FullStoreExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullStoreExportModal = ({ isOpen, onClose }: FullStoreExportModalProps) => {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<FullStoreExportResult | null>(null);

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

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !isExporting,
    onDismiss: onClose,
    isDirty: false,
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div 
        className="w-full max-w-2xl bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col overflow-hidden text-ink dark:text-ink-dark font-sans text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-brand-dark dark:bg-surface-dark-2 px-6 py-4 flex items-center justify-between text-white dark:text-ink-dark border-b border-white/10 dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 dark:bg-surface-dark-3 flex items-center justify-center text-paid dark:text-paid-bright">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="t-modal-title text-white dark:text-ink-dark">تصدير كل بيانات المحل بضغطة واحدة</h2>
              <p className="text-xs text-white/70 dark:text-ink-dark-muted">
                بياناتك ملكك 100% في ملفات إكسل مفتوحة بدون أي قيود
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isExporting}
            aria-label="إغلاق"
            title="إغلاق"
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-white/70 dark:text-ink-dark-muted hover:text-white dark:hover:text-ink-dark hover:bg-white/10 dark:hover:bg-surface-dark-3 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] bg-surface dark:bg-surface-dark">
          {/* Freedom & Security Guarantee Banner */}
          <div className="flex items-start gap-3 p-4 bg-paid-soft dark:bg-paid-dark-soft rounded-xl text-xs text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-dark-border leading-relaxed font-sans">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-paid dark:text-paid-bright" />
            <div>
              <strong className="block text-sm font-bold text-paid dark:text-paid-bright mb-1">
                بياناتك ملكك بالكامل (حرية تامة 100%):
              </strong>
              تقدر في أي وقت تستخرج كل بيانات وسجلات محلك (البضاعة، الزبائن، الشكك والديون، الموردين، فواتير البيع، وحركات المخزن) في ملفات إكسل جاهزة ومنظمة، بدون أي تشفير أو رسوم خروج.
            </div>
          </div>

          {/* Files Summary Grid */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-xl border border-line dark:border-line-dark space-y-3">
            <h4 className="t-label text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider">
              الملفات اللي هتتعمل في المجلد ده:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-ink dark:text-ink-dark font-medium">
              <div className="flex items-center gap-2 p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                <Package className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                <span>01. البضاعة والمخزن</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                <Users className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                <span>02. الزبائن وحسابات الشكك</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                <Truck className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                <span>03. الموردين والأرصدة</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                <Receipt className="w-4 h-4 text-brand-dark dark:text-brand-bright shrink-0" />
                <span>04. فواتير وحركات البيع</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                <Database className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                <span>05. حركات المخزن</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                <Layers className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                <span>06. الورديات والتقفيل اليومي</span>
              </div>
            </div>
            <p className="text-micro text-ink-muted dark:text-ink-dark-muted font-normal pt-1">
              معاهم شيت مجمّع فيه كل البيانات في ملف واحد، ووثيقة رسمية بملكية البيانات.
            </p>
          </div>

          {/* Export Destination Folder Picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink dark:text-ink-dark">
              عاوز تحفظ الملفات فين؟ (مجلد على الجهاز أو فلاشة):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={selectedFolder || 'على سطح المكتب تلقائياً (Desktop / RafiqExport)'}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs font-mono text-ink-muted dark:text-ink-dark-muted select-all"
                dir="ltr"
              />
              <AppButton variant="secondary" icon={FolderOpen} onClick={handleBrowseFolder} disabled={isExporting}>
                تغيير المجلد
              </AppButton>
            </div>
          </div>

          {/* Result Card If Exported */}
          {exportResult && exportResult.success && (
            <div className="p-4 bg-paid-soft dark:bg-paid-dark-soft rounded-xl border border-paid/30 dark:border-paid-dark-border space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-paid dark:text-paid-bright font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>تم تصدير {exportResult.generatedFiles.length} ملفات</span>
                </div>
                <AppButton variant="success" size="sm" icon={FolderOpen} onClick={handleOpenFolder}>
                  فتح المجلد دلوقتي
                </AppButton>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-ink dark:text-ink-dark pt-1 border-t border-paid/20 dark:border-paid-dark-border">
                <div className="p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                  أصناف البضاعة: <strong>{exportResult.productsCount}</strong>
                </div>
                <div className="p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                  الزبائن: <strong>{exportResult.customersCount}</strong>
                </div>
                <div className="p-2 bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark">
                  الفواتير: <strong>{exportResult.salesCount}</strong>
                </div>
              </div>

              <div className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted break-all" dir="ltr">
                المجلد: {exportResult.exportFolder}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-surface-2 dark:bg-surface-dark-2 px-6 py-4 border-t border-line dark:border-line-dark flex items-center justify-between gap-3">
          <AppButton variant="secondary" icon={FileCheck} onClick={handleRunParityTests} disabled={isExporting} title="فحص مطابقة عدد الصفوف والمجاميع بين إكسل وقاعدة البيانات">
            مطابقة الأرقام والإجمالي
          </AppButton>

          <div className="flex items-center gap-2">
            <AppButton variant="secondary" onClick={onClose} disabled={isExporting}>
              إغلاق
            </AppButton>

            <AppButton variant="primary" icon={FolderDown} onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'بيتم تجهيز وتصدير كل الملفات دلوقتي...' : 'تصدير كل البيانات بضغطة واحدة'}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};
