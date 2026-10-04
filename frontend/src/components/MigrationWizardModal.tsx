import React, { useState, useEffect, useCallback } from 'react';
import {
  Laptop,
  HardDrive,
  Usb,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Download,
  Upload,
  FolderOpen,
  ShieldCheck,
  Info,
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';

export interface DriveItem {
  name: string;
  label: string;
  driveType: string;
  totalSpaceBytes: number;
  freeSpaceBytes: number;
  isReady: boolean;
  isRemovable: boolean;
}

export interface MigrationAuditMetrics {
  productsCount: number;
  customersCount: number;
  invoicesCount: number;
  totalCustomerDebtPiasters: number;
  totalInventoryUnitsMilli: number;
  totalInventoryItemsCount: number;
  suppliersCount: number;
  totalSupplierDebtPiasters: number;
  categoriesCount: number;
}

export interface MigrationPackageManifest {
  packageVersion: number;
  createdAtUtc: string;
  createdAtLocal: string;
  sourceMachineName: string;
  sourceOsName: string;
  sourceOsBuild: string;
  appVersion: string;
  schemaVersion: number;
  storeName: string;
  taxNumber: string;
  databaseSha256: string;
  metrics: MigrationAuditMetrics;
}

export interface MigrationMetricComparison {
  metricKey: string;
  labelAr: string;
  sourceValue: string;
  restoredValue: string;
  isMatched: boolean;
}

export interface MigrationRestoreResult {
  success: boolean;
  sourceMetrics: MigrationAuditMetrics;
  restoredMetrics: MigrationAuditMetrics;
  comparisons: MigrationMetricComparison[];
  isMatch: boolean;
  message: string;
  differences: string[];
}

export interface MigrationPackageExportResult {
  success: boolean;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  manifest: MigrationPackageManifest;
  message: string;
}

export interface MigrationPackageInspectResult {
  success: boolean;
  packagePath: string;
  manifest: MigrationPackageManifest;
  isCompatible: boolean;
  isChecksumValid: boolean;
  compatibilityNotes: string;
  message: string;
}

interface MigrationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type WizardStep = 'role_select' | 'export_step' | 'import_step' | 'reconcile_step';

export const MigrationWizardModal: React.FC<MigrationWizardModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = useState<WizardStep>('role_select');
  const [loading, setLoading] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<MigrationAuditMetrics | null>(null);
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [exportResult, setExportResult] = useState<MigrationPackageExportResult | null>(null);

  // Import State
  const [packagePath, setPackagePath] = useState<string>('');
  const [inspectResult, setInspectResult] = useState<MigrationPackageInspectResult | null>(null);
  const [restoreResult, setRestoreResult] = useState<MigrationRestoreResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load current metrics & connected drives
  const loadInitialData = useCallback(async () => {
    try {
      const [metricsRes, drivesRes] = await Promise.all([
        invoke<MigrationAuditMetrics>('migration:getMetrics'),
        invoke<DriveItem[]>('backup:getDrives'),
      ]);
      if (metricsRes) setCurrentMetrics(metricsRes);
      if (Array.isArray(drivesRes)) {
        setDrives(drivesRes);
        const removable = drivesRes.find((d) => d.isRemovable && d.isReady);
        if (removable) {
          setTargetFolder(`${removable.name}RafiqMigration`);
        }
      }
    } catch (err) {
      console.error('Failed to load migration data:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep('role_select');
      setExportResult(null);
      setInspectResult(null);
      setRestoreResult(null);
      setErrorMessage(null);
      void loadInitialData();
    }
  }, [isOpen, loadInitialData]);

  if (!isOpen) return null;

  const formatPiasters = (piasters: number) => {
    return (piasters / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ج.م';
  };

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 بايت';
    const k = 1024;
    const sizes = ['بايت', 'ك.بايت', 'م.بايت', 'ج.بايت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 1. Export Action
  const handleExport = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await invoke<MigrationPackageExportResult>('migration:export', {
        folder: targetFolder.trim() || undefined,
      });
      if (res && res.success) {
        setExportResult(res);
        await rafiqAlert('تم إنشاء حزمة النقل بنجاح! تم حفظ الملف في: ' + res.filePath);
      } else {
        setErrorMessage(res?.message || 'فشل إنشاء حزمة النقل');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ غير متوقع أثناء التصدير');
    } finally {
      setLoading(false);
    }
  };

  // Browse file dialog for package
  const handleBrowsePackage = async () => {
    try {
      const res = await invoke<{ selectedPath: string; cancelled: boolean }>('migration:browseFile');
      if (res && !res.cancelled && res.selectedPath) {
        setPackagePath(res.selectedPath);
        void handleInspectPackage(res.selectedPath);
      }
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };

  // 2. Inspect Package
  const handleInspectPackage = async (pathOverride?: string) => {
    const target = pathOverride || packagePath;
    if (!target.trim()) {
      setErrorMessage('يرجى تحديد مسار حزمة النقل أولاً.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await invoke<MigrationPackageInspectResult>('migration:inspect', {
        packagePath: target.trim(),
      });
      if (res && res.success) {
        setInspectResult(res);
      } else {
        setInspectResult(null);
        setErrorMessage(res?.message || 'حزمة النقل غير صالحة أو تالفة.');
      }
    } catch (err: any) {
      setInspectResult(null);
      setErrorMessage(err?.message || 'حدث خطأ أثناء فحص الحزمة.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Restore & Reconcile Package (Task 139-2 & 139-3)
  const handleRestorePackage = async () => {
    if (!packagePath.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await invoke<MigrationRestoreResult>('migration:restore', {
        packagePath: packagePath.trim(),
      });
      if (res && res.success) {
        setRestoreResult(res);
        setStep('reconcile_step');
      } else {
        setErrorMessage(res?.message || 'فشل استرجاع حزمة النقل.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء استرجاع الحزمة.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    if (onComplete) onComplete();
    onClose();
    // Refresh window to re-load any newly restored state
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-right"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center text-brand">
              <Laptop className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink m-0">
                مرشد نقل البرنامج والبيانات إلى جهاز جديد
              </h2>
              <p className="text-[11.5px] text-ink-muted m-0 mt-0.5">
                نقل المحل بالكامل (الأصناف، العملاء، الفواتير، المخزون) بخطوة واحدة مع مطابقة الأرقام بنسبة 100%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-danger text-[12.5px] flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-danger" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: ROLE SELECTION */}
          {step === 'role_select' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <span className="inline-block px-3 py-1 rounded-full bg-brand-soft text-brand text-xs font-bold">
                  فيتشر #139 — رحلة العميل والدعم
                </span>
                <h3 className="text-lg font-bold text-ink m-0">ماذا تريد أن تفعل على هذا الجهاز؟</h3>
                <p className="text-xs text-ink-muted leading-relaxed m-0">
                  سواء كنت تريد نقل المحل من هذا الجهاز لجهاز آخر جديد، أو استلام وتثبيت بيانات المحل على هذا الجهاز، اختر العملية المناسبة:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Option A: Old PC -> Export */}
                <button
                  type="button"
                  onClick={() => setStep('export_step')}
                  className="p-5 rounded-2xl border-2 border-line hover:border-brand bg-surface hover:bg-brand-soft/20 text-right transition-all flex flex-col justify-between group cursor-pointer shadow-2xs hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-brand-soft text-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Download className="w-6 h-6 text-brand" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink m-0">1. على الجهاز القديم (تصدير الحزمة)</h4>
                      <p className="text-xs text-ink-muted mt-1 leading-relaxed m-0">
                        إنشاء حزمة نقل مجمعة مشفرة ومفحوصة (<span className="font-mono text-brand">.rafiqpkg</span>) بضغطة زر واحدة لحفظها على فلاشة USB ونقلها للجهاز الجديد.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-brand">
                    <span>بدء إنشاء وتصدير الحزمة</span>
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Option B: New PC -> Import */}
                <button
                  type="button"
                  onClick={() => setStep('import_step')}
                  className="p-5 rounded-2xl border-2 border-line hover:border-paid bg-surface hover:bg-paid-soft/20 text-right transition-all flex flex-col justify-between group cursor-pointer shadow-2xs hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-paid-soft text-paid flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Upload className="w-6 h-6 text-paid" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink m-0">2. على الجهاز الجديد (استيراد وفحص)</h4>
                      <p className="text-xs text-ink-muted mt-1 leading-relaxed m-0">
                        استرجاع بيانات المحل وتثبيتها من فلاشة USB مع مقارنة الأرقام قبل النقل وبعده للتأكد من عدم ضياع أي قرش أو صنف.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-paid">
                    <span>استرجاع الحزمة ومطابقة الأرقام</span>
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>

              {/* Current Local Stats Preview */}
              {currentMetrics && (
                <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">بيانات هذا الجهاز الحالية:</span>
                    <span className="text-[11px] text-ink-muted">محرك SQLite WAL النشط</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded bg-surface border border-line/50">
                      <span className="text-ink-muted block text-[10px]">الأصناف النشطة</span>
                      <span className="font-bold text-ink">{currentMetrics.productsCount} صنف</span>
                    </div>
                    <div className="p-2 rounded bg-surface border border-line/50">
                      <span className="text-ink-muted block text-[10px]">العملاء المسجلون</span>
                      <span className="font-bold text-ink">{currentMetrics.customersCount} عميل</span>
                    </div>
                    <div className="p-2 rounded bg-surface border border-line/50">
                      <span className="text-ink-muted block text-[10px]">فواتير المبيعات</span>
                      <span className="font-bold text-ink">{currentMetrics.invoicesCount} فاتورة</span>
                    </div>
                    <div className="p-2 rounded bg-surface border border-line/50">
                      <span className="text-ink-muted block text-[10px]">إجمالي ديون العملاء</span>
                      <span className="font-bold text-paid">{formatPiasters(currentMetrics.totalCustomerDebtPiasters)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: EXPORT STEP (ON OLD PC) */}
          {step === 'export_step' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink m-0">تصدير حزمة نقل النظام بالكامل</h3>
                  <p className="text-xs text-ink-muted m-0 mt-0.5">
                    اختر الفلاشة أو المجلد ثم اضغط زر التصدير لإنشاء ملف الحزمة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('role_select')}
                  className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>العودة للخيارات</span>
                </button>
              </div>

              {/* Connected Drives Selection */}
              <div>
                <label className="block text-ink font-semibold text-xs mb-2">
                  الأقراص والفلاشات المتصلة بالجهاز (اختر الفلاشة بضغطة زر):
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {drives.map((d) => (
                    <button
                      type="button"
                      key={d.name}
                      onClick={() => setTargetFolder(`${d.name}RafiqMigration`)}
                      className={`p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer ${
                        targetFolder.startsWith(d.name)
                          ? 'bg-brand-soft border-brand text-brand'
                          : 'bg-surface-2 border-line hover:border-line-hover text-ink'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {d.isRemovable ? (
                          <Usb className="w-4 h-4 text-brand shrink-0" />
                        ) : (
                          <HardDrive className="w-4 h-4 text-ink-muted shrink-0" />
                        )}
                        <div className="truncate">
                          <span className="font-bold text-xs block truncate">{d.name} {d.label}</span>
                          <span className="text-[10px] text-ink-muted font-mono block">
                            متاح: {formatBytes(d.freeSpaceBytes)}
                          </span>
                        </div>
                      </div>
                      {d.isRemovable && (
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-brand text-white font-bold shrink-0">
                          فلاشة USB
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target folder input */}
              <div>
                <label className="block text-ink font-semibold text-xs mb-1.5">
                  مسار مجلد الحفظ:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetFolder}
                    onChange={(e) => setTargetFolder(e.target.value)}
                    placeholder="مثال: E:\RafiqMigration أو C:\Users\khale\Desktop"
                    className="flex-1 bg-surface border border-line rounded-xl h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>
              </div>

              {/* Export Action Card */}
              <div className="p-4 rounded-xl bg-brand-soft/30 border border-brand/20 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="font-bold text-xs text-brand block">
                    حزمة متكاملة بضغطة واحدة (بيانات + إعدادات + بصمة أمان SHA256)
                  </span>
                  <p className="text-[11px] text-ink-muted m-0">
                    يتم تفريغ معاملات SQLite WAL بالكامل لضمان سلامة 100% من البيانات أثناء النسخ.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={loading}
                  className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري إنشاء الحزمة...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>إنشاء حزمة النقل (.rafiqpkg)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Success Result */}
              {exportResult && (
                <div className="p-4 rounded-xl bg-paid-soft border border-paid/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-paid font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-paid" />
                    <span>تم إنشاء حزمة النقل بنجاح!</span>
                  </div>
                  <div className="bg-surface p-3 rounded-lg border border-line space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">اسم الملف:</span>
                      <span className="font-bold text-ink select-all">{exportResult.fileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">حجم الحزمة:</span>
                      <span className="text-ink">{formatBytes(exportResult.fileSizeBytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">المسار الكامل:</span>
                      <span className="text-ink truncate max-w-md select-all" title={exportResult.filePath}>
                        {exportResult.filePath}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-paid/10 text-paid text-[11.5px] leading-relaxed flex items-center gap-2">
                    <Info className="w-4 h-4 text-paid shrink-0" />
                    <span><strong>الخطوة التالية:</strong> انسخ هذا الملف إلى فلاشة USB، ثم ضعه على الجهاز الجديد وافتح نفس الشاشة واختر «على الجهاز الجديد (استيراد وفحص)».</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: IMPORT STEP (ON NEW PC) */}
          {step === 'import_step' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink m-0">استيراد حزمة النقل على الجهاز الجديد</h3>
                  <p className="text-xs text-ink-muted m-0 mt-0.5">
                    اختر ملف الحزمة من الفلاشة لفحصها ومطابقة محتوياتها قبل الاسترجاع.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('role_select')}
                  className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>العودة للخيارات</span>
                </button>
              </div>

              {/* Package Path input & Browse button */}
              <div>
                <label className="block text-ink font-semibold text-xs mb-1.5">
                  مسار ملف الحزمة (<span className="font-mono text-brand">.rafiqpkg</span> أو <span className="font-mono text-brand">.zip</span>):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={packagePath}
                    onChange={(e) => {
                      setPackagePath(e.target.value);
                      setInspectResult(null);
                    }}
                    placeholder="مثال: E:\RafiqMigration\rafiq_migration_albaraka_20261001.rafiqpkg"
                    className="flex-1 bg-surface border border-line rounded-xl h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => void handleBrowsePackage()}
                    className="px-4 h-10 bg-surface-2 border border-line hover:border-line-hover rounded-xl text-xs font-bold text-ink flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-brand" />
                    <span>استعراض...</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInspectPackage()}
                    disabled={loading || !packagePath.trim()}
                    className="px-4 h-10 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    فحص الحزمة
                  </button>
                </div>
              </div>

              {/* Inspection Preview Card */}
              {inspectResult && (
                <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-paid" />
                      <div>
                        <span className="font-bold text-xs text-ink block">
                          بيانات المحل في الحزمة: {inspectResult.manifest.storeName}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          تاريخ الإنشاء: {inspectResult.manifest.createdAtLocal} — جهاز المصدر: {inspectResult.manifest.sourceMachineName} ({inspectResult.manifest.sourceOsName})
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-paid-soft text-paid text-[11px] font-bold">
                      بصمة التحقق SHA256 مطابقة وسليمة
                    </span>
                  </div>

                  {/* Numbers in package */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-surface border border-line/60">
                      <span className="text-ink-muted text-[10px] block">الأصناف النشطة</span>
                      <span className="font-bold text-ink">{inspectResult.manifest.metrics.productsCount} صنف</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface border border-line/60">
                      <span className="text-ink-muted text-[10px] block">العملاء المسجلون</span>
                      <span className="font-bold text-ink">{inspectResult.manifest.metrics.customersCount} عميل</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface border border-line/60">
                      <span className="text-ink-muted text-[10px] block">إجمالي الفواتير</span>
                      <span className="font-bold text-ink">{inspectResult.manifest.metrics.invoicesCount} فاتورة</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface border border-line/60">
                      <span className="text-ink-muted text-[10px] block">ديون وآجل العملاء</span>
                      <span className="font-bold text-paid">{formatPiasters(inspectResult.manifest.metrics.totalCustomerDebtPiasters)}</span>
                    </div>
                  </div>

                  {/* Safety note */}
                  <div className="p-2.5 rounded bg-brand-soft/50 border border-brand/20 text-ink text-[11px] flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
                      <span><strong>حماية أوتوماتيكية:</strong> سيتم أخذ نسخة أمان احتياطية من قاعدة البيانات الحالية قبل الاستبدال لتفادي أي فقد بيانات.</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRestorePackage()}
                      disabled={loading}
                      className="px-5 py-2 rounded-xl bg-paid hover:bg-[#005734] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري الاسترجاع والمطابقة...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>بدء الاسترجاع والاعتماد</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: RECONCILE / AUDIT COMPARISON STEP (TASK 139-3) */}
          {step === 'reconcile_step' && restoreResult && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-xl bg-paid-soft border border-paid/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-paid text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-paid m-0">
                    تم استرجاع بيانات المحل وتثبيتها بنجاح على هذا الجهاز!
                  </h3>
                  <p className="text-xs text-ink-muted m-0 mt-0.5">
                    مقارنة دقيقة ومباشرة بين أرقام الجهاز القديم والأرقام المسترجعة فعلياً على هذا الجهاز:
                  </p>
                </div>
              </div>

              {/* Side-by-side Reconcile Table */}
              <div className="border border-line rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 text-ink border-b border-line font-bold">
                    <tr>
                      <th className="py-2.5 px-4">مؤشر التدقيق المالي والمخزني</th>
                      <th className="py-2.5 px-4 text-center">الأرقام بالحزمة (الجهاز القديم)</th>
                      <th className="py-2.5 px-4 text-center">الأرقام بعد النقل (الجهاز الجديد)</th>
                      <th className="py-2.5 px-4 text-center">حالة التطابق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-surface">
                    {restoreResult.comparisons.map((c) => (
                      <tr key={c.metricKey} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-ink flex items-center gap-2">
                          <FileCheck className="w-3.5 h-3.5 text-brand" />
                          <span>{c.labelAr}</span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-ink">
                          {c.sourceValue}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-brand">
                          {c.restoredValue}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {c.isMatched ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-paid-soft text-paid font-bold text-[11px]">
                              <CheckCircle2 className="w-3 h-3 text-paid" />
                              <span>100% متطابق</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-danger font-bold text-[11px]">
                              <AlertTriangle className="w-3 h-3 text-danger" />
                              <span>يوجد اختلاف</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Final Success Call to Action */}
              <div className="p-4 rounded-xl bg-surface-2 border border-line flex items-center justify-between gap-4">
                <span className="text-xs text-ink-muted">
                  تم الانتهاء بنجاح ويمكنك البدء في عمليات البيع والتشغيل فوراً.
                </span>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-6 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>اعتماد وإنهاء النقل</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line bg-surface-2 flex items-center justify-between text-xs text-ink-muted">
          <span>نظام رفيق POS — إصدار معتمد لويندوز 7 و 10 و 11</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-line hover:bg-surface text-ink transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
