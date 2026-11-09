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
  Download,
  Upload,
  FolderOpen,
  ShieldCheck,
  Info,
  Eye,
  EyeOff,
  KeyRound,
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqConfirm } from '../utils/dialogService';
import { hasUnpaidPosCart } from '../utils/posCartDraft';
import { useAuth } from '../context/useAuth';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';

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
  totalSalesPiasters?: number | null;
  totalWalletBalancePiasters?: number | null;
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

// Snapshot, encryption and verification of a whole shop can take minutes on a slow PC and a flash drive: the 15 second bridge default would report a failure while the host is still working
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export const MigrationWizardModal: React.FC<MigrationWizardModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('settings.backup');
  const canImport = hasPermission('settings.restore');
  const [step, setStep] = useState<WizardStep>('role_select');
  const [loading, setLoading] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<MigrationAuditMetrics | null>(null);
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [exportResult, setExportResult] = useState<MigrationPackageExportResult | null>(null);

  // Import State
  const [packagePath, setPackagePath] = useState<string>('');
  const [recoveryCode, setRecoveryCode] = useState<string>('');
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
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
      setErrorMessage(messageOf(err, 'تعذر قراءة أرقام هذا الجهاز أو الفلاشات المتصلة.'));
    }
  }, []);

  // The recovery code never outlives the open wizard
  useEffect(() => {
    setRecoveryCode('');
    setShowRecoveryCode(false);
    if (isOpen) {
      setStep('role_select');
      setExportResult(null);
      setPackagePath('');
      setInspectResult(null);
      setRestoreResult(null);
      setErrorMessage(null);
      void loadInitialData();
    }
  }, [isOpen, loadInitialData]);

  const formatPiasters = (piasters: number) => {
    return (piasters / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ج.م';
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 بايت';
    const k = 1024;
    const sizes = ['بايت', 'ك.بايت', 'م.بايت', 'ج.بايت'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 1. Export Action
  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMessage(null);
    setExportResult(null);
    try {
      const res = await invoke<MigrationPackageExportResult>('migration:export', {
        folder: targetFolder.trim() || undefined,
      }, MIGRATION_TIMEOUT_MS);
      if (res && res.success) {
        setExportResult(res);
      } else {
        setErrorMessage(res?.message || 'فشل إنشاء حزمة النقل');
      }
    } catch (err: unknown) {
      setErrorMessage(messageOf(err, 'حدث خطأ غير متوقع أثناء التصدير'));
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const res = await invoke<{ selectedFolder: string | null; cancelled: boolean }>('migration:browseFolder');
      if (res && !res.cancelled && res.selectedFolder) {
        setTargetFolder(res.selectedFolder);
        setExportResult(null);
      }
    } catch (err: unknown) {
      setErrorMessage(messageOf(err, 'تعذر فتح نافذة اختيار المكان.'));
    }
  };

  // Browse file dialog for package
  const handleBrowsePackage = async () => {
    try {
      const res = await invoke<{ selectedPath: string; cancelled: boolean }>('migration:browseFile');
      if (res && !res.cancelled && res.selectedPath) {
        setPackagePath(res.selectedPath);
        setInspectResult(null);
        setErrorMessage(null);
        if (recoveryCode.trim()) void handleInspectPackage(res.selectedPath);
      }
    } catch (err: unknown) {
      setErrorMessage(messageOf(err, 'تعذر فتح نافذة اختيار الملف.'));
    }
  };

  // 2. Inspect Package
  const handleInspectPackage = async (pathOverride?: string) => {
    if (loading) return;
    const target = pathOverride || packagePath;
    if (!target.trim()) {
      setErrorMessage('يرجى تحديد مسار حزمة النقل أولاً.');
      return;
    }
    if (!recoveryCode.trim()) {
      setErrorMessage('يرجى إدخال كود استرجاع المالك الخاص بالجهاز القديم لفتح الحزمة.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await invoke<MigrationPackageInspectResult>('migration:inspect', {
        packagePath: target.trim(),
        recoveryCode: recoveryCode.trim(),
      }, MIGRATION_TIMEOUT_MS);
      if (res && res.success) {
        setInspectResult(res);
      } else {
        setInspectResult(null);
        setErrorMessage(res?.message || 'حزمة النقل غير صالحة أو تالفة.');
      }
    } catch (err: unknown) {
      setInspectResult(null);
      setErrorMessage(messageOf(err, 'حدث خطأ أثناء فحص الحزمة.'));
    } finally {
      setLoading(false);
    }
  };

  // 3. Restore & Reconcile Package (Task 139-2 & 139-3)
  const handleRestorePackage = async () => {
    if (loading || !inspectResult || !packagePath.trim() || !recoveryCode.trim()) return;
    if (hasUnpaidPosCart()) {
      setErrorMessage('في شاشة البيع فاتورة لم تُدفع بعد. أنهِ الفاتورة أو أفرغ السلة ثم أعد المحاولة، لأن النقل يستبدل كل بيانات هذا الجهاز.');
      return;
    }
    const m = inspectResult.manifest.metrics;
    const confirmed = await rafiqConfirm({
      title: 'استبدال كل بيانات هذا الجهاز؟',
      message: `سيتم استبدال كل بيانات هذا الجهاز الحالية (${currentMetrics ? `${currentMetrics.productsCount} صنف و${currentMetrics.customersCount} عميل و${currentMetrics.invoicesCount} فاتورة` : 'الأصناف والعملاء والفواتير والحسابات'}) ببيانات الملف (${m.productsCount} صنف و${m.customersCount} عميل و${m.invoicesCount} فاتورة). يؤخذ نسخة أمان من البيانات الحالية قبل الاستبدال. هل تريد المتابعة؟`,
      confirmText: 'نعم، استبدل البيانات',
      cancelText: 'تراجع',
      variant: 'danger',
    });
    if (!confirmed) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await invoke<MigrationRestoreResult>('migration:restore', {
        packagePath: packagePath.trim(),
        recoveryCode: recoveryCode.trim(),
      }, MIGRATION_TIMEOUT_MS);
      if (res && res.success) {
        setRecoveryCode('');
        setRestoreResult(res);
        setStep('reconcile_step');
      } else {
        setErrorMessage(res?.message || 'فشل استرجاع حزمة النقل.');
      }
    } catch (err: unknown) {
      setErrorMessage(messageOf(err, 'حدث خطأ أثناء استرجاع الحزمة.'));
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

  // Choosing a step is navigation, not work: only data typed or inspected in the import step is lost on close
  const isDirty = step === 'import_step' && Boolean(packagePath.trim() || recoveryCode.trim() || inspectResult);
  const isBusy = loading;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !isBusy,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء عملية نقل البيانات؟',
    confirmMessage: 'أنت في منتصف خطوات نقل البيانات. هل تريد حقاً الإلغاء والخروج؟',
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 flex items-center justify-center text-brand dark:text-brand-bright">
              <Laptop className="w-5 h-5 text-brand dark:text-brand-bright" />
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark m-0">
                نقل بيانات المحل لجهاز جديد (عبر الفلاشة)
              </h2>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                انقل كل شغلك (البضاعة، الفواتير، الحسابات، والعملاء) للكمبيوتر الجديد في خطوة واحدة وبأمان تام
              </p>
            </div>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={requestClose} />
        </div>

        {/* Content Body */}
        <MotionHeight className="p-6 overflow-y-auto flex-1">
        <div className="space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-danger dark:text-danger-bright" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: ROLE SELECTION */}
          {step === 'role_select' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <span className="inline-block px-3 py-1 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-xs font-bold">
                  نقل المحل
                </span>
                <h3 className="t-card-title text-ink dark:text-ink-dark m-0">انت قاعد على أنهي جهاز دلوقتي؟</h3>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed m-0">
                  اختار الخطوة المناسبة حسب الكمبيوتر اللي انت فاتح من عليه البرنامج دلوقتي:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Option A: Old PC -> Export */}
                <button
                  type="button"
                  onClick={() => setStep('export_step')}
                  disabled={!canExport}
                  className="p-5 rounded-2xl border-2 border-line dark:border-line-dark hover:border-brand bg-surface dark:bg-surface-dark hover:bg-brand-soft/20 dark:hover:bg-brand-dark-soft/20 text-right transition-all flex flex-col justify-between group cursor-pointer shadow-2xs hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-2xs"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Download className="w-6 h-6 text-brand dark:text-brand-bright" />
                    </div>
                    <div>
                      <h4 className="t-label text-ink dark:text-ink-dark m-0">1. على جهازك القديم (نسخ المحل على الفلاشة)</h4>
                      <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1 leading-relaxed m-0">
                        اضغط هنا وإنت على جهازك القديم.. البرنامج هيجمعلك كل بضاعة المحل وحساباته ويحفظهملك في ملف واحد على الفلاشة.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-line/60 dark:border-line-dark flex items-center justify-between text-xs font-bold text-brand dark:text-brand-bright">
                    <span>{canExport ? 'حفظ بيانات المحل على الفلاشة' : 'ليس لديك صلاحية النسخ الاحتياطي'}</span>
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Option B: New PC -> Import */}
                <button
                  type="button"
                  onClick={() => setStep('import_step')}
                  disabled={!canImport}
                  className="p-5 rounded-2xl border-2 border-line dark:border-line-dark hover:border-paid bg-surface dark:bg-surface-dark hover:bg-paid-soft/20 dark:hover:bg-paid-dark-soft/20 text-right transition-all flex flex-col justify-between group cursor-pointer shadow-2xs hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-2xs"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Upload className="w-6 h-6 text-paid" />
                    </div>
                    <div>
                      <h4 className="t-label text-ink dark:text-ink-dark m-0">2. على جهازك الجديد (تنزيل المحل من الفلاشة)</h4>
                      <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1 leading-relaxed m-0">
                        اضغط هنا وإنت على جهازك الجديد.. البرنامج هيقرأ الملف من الفلاشة وينزل كل بضاعتك وحساباتك هنا بضغطة واحدة.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-line/60 dark:border-line-dark flex items-center justify-between text-xs font-bold text-paid">
                    <span>{canImport ? 'تنزيل وتشغيل البيانات من الفلاشة' : 'ليس لديك صلاحية الاسترجاع'}</span>
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed flex items-start gap-2">
                <KeyRound className="w-4 h-4 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
                <span>
                  <strong className="text-ink dark:text-ink-dark">قبل ما تبدأ:</strong> الملف مشفر بكود استرجاع المالك الخاص بالجهاز القديم، وهتحتاجه على الجهاز الجديد لفتح الملف. وترخيص البرنامج مرتبط بالجهاز، فبعد النقل ممكن يطلب منك تفعيل الترخيص من جديد على الجهاز الجديد (من «ترخيص وتفعيل البرنامج»)، أو تواصل مع الدعم الفني.
                </span>
              </div>

              {/* Current Local Stats Preview */}
              {currentMetrics && (
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink dark:text-ink-dark">البيانات المتسجلة على الجهاز ده حالياً:</span>
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted">تأكيد الأرقام الموجودة عندك</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded bg-surface dark:bg-surface-dark border border-line/50 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted block text-micro">أصناف البضاعة</span>
                      <span className="font-bold text-ink dark:text-ink-dark">{currentMetrics.productsCount} صنف</span>
                    </div>
                    <div className="p-2 rounded bg-surface dark:bg-surface-dark border border-line/50 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted block text-micro">الزبائن المسجلين</span>
                      <span className="font-bold text-ink dark:text-ink-dark">{currentMetrics.customersCount} عميل</span>
                    </div>
                    <div className="p-2 rounded bg-surface dark:bg-surface-dark border border-line/50 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted block text-micro">فواتير المبيعات</span>
                      <span className="font-bold text-ink dark:text-ink-dark">{currentMetrics.invoicesCount} فاتورة</span>
                    </div>
                    <div className="p-2 rounded bg-surface dark:bg-surface-dark border border-line/50 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted block text-micro">إجمالي حسابات الشكك والديون</span>
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
                  <h3 className="t-card-title text-ink dark:text-ink-dark m-0">حفظ بيانات المحل على الفلاشة (من جهازك القديم)</h3>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                    اختار الفلاشة واضغط "حفظ البيانات" عشان تاخد نسخة كاملة من المحل في جيبك.
                  </p>
                </div>
                <AppButton variant="subtle" size="xs" icon={ArrowRight} disabled={loading} onClick={() => setStep('role_select')}>
                  رجوع للاختيارات
                </AppButton>
              </div>

              {/* Connected Drives Selection */}
              <div>
                <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">
                  الفلاشات المتوصلة بالجهاز (اضغط على الفلاشة بتاعتك):
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {drives.map((d) => (
                    <button
                      type="button"
                      key={d.name}
                      disabled={loading || !d.isReady}
                      onClick={() => setTargetFolder(`${d.name}RafiqMigration`)}
                      aria-pressed={targetFolder.startsWith(d.name)}
                      className={`p-2.5 rounded-xl border text-right flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed ${
                        targetFolder.startsWith(d.name)
                          ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand text-brand dark:text-brand-bright'
                          : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-line-hover text-ink dark:text-ink-dark'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {d.isRemovable ? (
                          <Usb className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                        ) : (
                          <HardDrive className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted shrink-0" />
                        )}
                        <div className="truncate">
                          <span className="font-bold text-xs block truncate"><bdi dir="ltr">{d.name}</bdi> {d.label}</span>
                          <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono block">
                            متاح: {formatBytes(d.freeSpaceBytes)}
                          </span>
                        </div>
                      </div>
                      {d.isRemovable && (
                        <span className="text-micro px-1.5 py-0.5 rounded bg-brand text-white font-bold shrink-0">
                          فلاشة USB
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target folder input */}
              <div>
                <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">
                  مكان حفظ الملف:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetFolder}
                    disabled={loading}
                    onChange={(e) => setTargetFolder(e.target.value)}
                    placeholder="E:\RafiqMigration"
                    dir="ltr"
                    className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono disabled:opacity-50"
                  />
                  <AppButton variant="secondary" icon={FolderOpen} disabled={loading} onClick={() => void handleBrowseFolder()}>
                    اختيار المكان...
                  </AppButton>
                </div>
              </div>

              {/* Export Action Card */}
              <div className="p-4 rounded-xl bg-brand-soft/30 dark:bg-brand-dark-soft/30 border border-brand/20 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="font-bold text-xs text-brand dark:text-brand-bright block">
                    نسخة شاملة بضغطة واحدة (البضاعة + الفواتير + الحسابات والإعدادات)
                  </span>
                  <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                    البرنامج بياخد صورة كاملة ومتسقة من بيانات المحل في لحظة واحدة، ويشفّر الملف، ويراجعه بعد ما يكتبه على الفلاشة قبل ما يقولك إنه تم.
                  </p>
                </div>
                <AppButton
                  variant="primary"
                  icon={Download}
                  loading={loading}
                  disabled={loading}
                  onClick={() => void handleExport()}
                  className="w-full md:w-auto"
                >
                  {loading ? 'جاري حفظ بيانات المحل دلوقتي...' : 'حفظ كل بيانات المحل على الفلاشة'}
                </AppButton>
              </div>

              {/* Success Result */}
              {exportResult && (
                <div className="p-4 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-paid font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-paid" />
                    <span>تم حفظ بيانات المحل على الفلاشة وفحص الملف بعد الكتابة</span>
                  </div>
                  <div className="bg-surface dark:bg-surface-dark p-3 rounded-lg border border-line dark:border-line-dark space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-ink-muted dark:text-ink-dark-muted">اسم الملف:</span>
                      <span className="font-bold text-ink dark:text-ink-dark select-all">{exportResult.fileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted dark:text-ink-dark-muted">حجم الملف:</span>
                      <span className="text-ink dark:text-ink-dark">{formatBytes(exportResult.fileSizeBytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted dark:text-ink-dark-muted">مكان الحفظ:</span>
                      <span className="text-ink dark:text-ink-dark truncate max-w-md select-all" title={exportResult.filePath}>
                        {exportResult.filePath}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 flex-wrap">
                      <span className="text-ink-muted dark:text-ink-dark-muted">محتوى الملف:</span>
                      <span className="text-ink dark:text-ink-dark">
                        {exportResult.manifest.metrics.productsCount} صنف — {exportResult.manifest.metrics.customersCount} عميل — {exportResult.manifest.metrics.invoicesCount} فاتورة — ديون العملاء {formatPiasters(exportResult.manifest.metrics.totalCustomerDebtPiasters)}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-paid/10 text-paid text-micro leading-relaxed flex items-start gap-2">
                    <KeyRound className="w-4 h-4 text-paid shrink-0 mt-0.5" />
                    <span><strong>مهم جداً:</strong> الملف مشفر، ومش هيتفتح على الجهاز الجديد غير بكود استرجاع المالك الخاص بالمحل. احتفظ بالكود في مكان آمن ومنفصل عن الفلاشة، ولو ضاع الكود مش هتقدر تفتح الملف.</span>
                  </div>
                  <div className="p-2.5 rounded bg-paid/10 text-paid text-micro leading-relaxed flex items-start gap-2">
                    <Info className="w-4 h-4 text-paid shrink-0 mt-0.5" />
                    <span><strong>الخطوة الجاية:</strong> افصل الفلاشة بأمان من الجهاز، وركّبها في جهازك الجديد، وافتح نفس الشاشة دي واختار «2. على جهازك الجديد (تنزيل المحل من الفلاشة)».</span>
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
                  <h3 className="t-card-title text-ink dark:text-ink-dark m-0">تنزيل وتشغيل بيانات المحل (على جهازك الجديد)</h3>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                    اختار ملف المحل من الفلاشة، والبرنامج هيراجع كل البضاعة والأرقام الأول قبل التثبيت.
                  </p>
                </div>
                <AppButton variant="subtle" size="xs" icon={ArrowRight} disabled={loading} onClick={() => setStep('role_select')}>
                  رجوع للاختيارات
                </AppButton>
              </div>

              {/* Package Path input & Browse button */}
              <div>
                <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">
                  مكان ملف المحل على الفلاشة: <RequiredMark />
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={packagePath}
                    disabled={loading}
                    onChange={(e) => {
                      setPackagePath(e.target.value);
                      setInspectResult(null);
                    }}
                    placeholder="E:\RafiqMigration\rafiq_migration_albaraka.rafiqpkg"
                    dir="ltr"
                    className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono disabled:opacity-50"
                  />
                  <AppButton variant="secondary" icon={FolderOpen} disabled={loading} onClick={() => void handleBrowsePackage()}>
                    اختيار الملف...
                  </AppButton>
                </div>
              </div>

              {/* Owner recovery code of the OLD shop: opens the encrypted package, never stored or logged */}
              <div>
                <label htmlFor="migration-recovery-code" className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">
                  كود استرجاع المالك (بتاع الجهاز القديم): <RequiredMark />
                </label>
                <div className="flex gap-2">
                  <input
                    id="migration-recovery-code"
                    type={showRecoveryCode ? 'text' : 'password'}
                    value={recoveryCode}
                    disabled={loading}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value);
                      setInspectResult(null);
                    }}
                    placeholder="RFK-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    dir="ltr"
                    className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono tracking-widest disabled:opacity-50"
                  />
                  <AppButton
                    variant="secondary"
                    icon={showRecoveryCode ? EyeOff : Eye}
                    aria-label={showRecoveryCode ? 'إخفاء الكود' : 'إظهار الكود'}
                    onClick={() => setShowRecoveryCode((v) => !v)}
                  />
                  <AppButton
                    variant="primary"
                    loading={loading}
                    onClick={() => void handleInspectPackage()}
                    disabled={loading || !packagePath.trim() || !recoveryCode.trim()}
                  >
                    فحص الملف
                  </AppButton>
                </div>
                <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0 mt-1.5">
                  الكود اللي اتسلم لصاحب المحل عند إعداد النسخ الاحتياطي على الجهاز القديم. بدونه مش هيتفتح الملف.
                </p>
              </div>

              {/* Inspection Preview Card */}
              {inspectResult && (
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-paid" />
                      <div>
                        <span className="font-bold text-xs text-ink dark:text-ink-dark block">
                          بيانات المحل في الملف: {inspectResult.manifest.storeName}
                        </span>
                        <span className="text-micro text-ink-muted dark:text-ink-dark-muted">
                          تاريخ النسخ: {inspectResult.manifest.createdAtLocal} — من جهاز: {inspectResult.manifest.sourceMachineName} ({inspectResult.manifest.sourceOsName})
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid text-micro font-bold">
                      الملف سليم ومطابق 100%
                    </span>
                  </div>

                  {/* Numbers in package */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted text-micro block">أصناف البضاعة</span>
                      <span className="font-bold text-ink dark:text-ink-dark">{inspectResult.manifest.metrics.productsCount} صنف</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted text-micro block">الزبائن المسجلين</span>
                      <span className="font-bold text-ink dark:text-ink-dark">{inspectResult.manifest.metrics.customersCount} عميل</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted text-micro block">إجمالي الفواتير</span>
                      <span className="font-bold text-ink dark:text-ink-dark">{inspectResult.manifest.metrics.invoicesCount} فاتورة</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
                      <span className="text-ink-muted dark:text-ink-dark-muted text-micro block">حسابات الشكك والديون</span>
                      <span className="font-bold text-paid">{formatPiasters(inspectResult.manifest.metrics.totalCustomerDebtPiasters)}</span>
                    </div>
                  </div>

                  {/* Safety note */}
                  <div className="p-2.5 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-micro flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>تنبيه:</strong> التثبيت هيستبدل كل بيانات الجهاز ده الحالية ببيانات الملف. لازم يكون الجهاز ده جديد أو فاضي، ومفيش فاتورة شغالة في شاشة البيع.</span>
                  </div>
                  <div className="p-2.5 rounded bg-brand-soft/50 dark:bg-brand-dark-soft/50 border border-brand/20 text-ink dark:text-ink-dark text-micro flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                      <span><strong>أمان وحماية:</strong> البرنامج بياخد نسخة أمان من البيانات الحالية قبل الاستبدال، ولو حصل أي خطأ بيرجّعها زي ما كانت.</span>
                    </span>
                    <AppButton
                      variant="success"
                      icon={CheckCircle2}
                      loading={loading}
                      disabled={loading}
                      onClick={() => void handleRestorePackage()}
                      className="shrink-0"
                    >
                      {loading ? 'بيتم تثبيت ومطابقة البيانات دلوقتي...' : 'تثبيت وتشغيل البيانات دلوقتي'}
                    </AppButton>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: RECONCILE / AUDIT COMPARISON STEP (TASK 139-3) */}
          {step === 'reconcile_step' && restoreResult && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-paid text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="t-card-title text-paid m-0">
                    تم نقل بيانات المحل للجهاز الجديد
                  </h3>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                    مقارنة مباشرة بين أرقام الجهاز القديم والجديد (كل مليم وصنف في مكانه):
                  </p>
                </div>
              </div>

              {!restoreResult.isMatch && (
                <div className="p-3.5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{restoreResult.message}</span>
                  </div>
                  {restoreResult.differences.map((d) => (
                    <div key={d} className="ps-6">{d}</div>
                  ))}
                  <div className="ps-6">راجع الأرقام قبل بدء الشغل، ونسخة الأمان من بيانات هذا الجهاز قبل النقل محفوظة في مجلد النسخ الاحتياطية الآمنة بجوار قاعدة البيانات، وتقدر تتواصل مع الدعم الفني لاسترجاعها.</div>
                </div>
              )}

              {/* Side-by-side Reconcile Table */}
              <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-b border-line dark:border-line-dark font-bold">
                    <tr>
                      <th className="py-2.5 px-4">البيان</th>
                      <th className="py-2.5 px-4 text-center">أرقام الجهاز القديم</th>
                      <th className="py-2.5 px-4 text-center">أرقام الجهاز الجديد</th>
                      <th className="py-2.5 px-4 text-center">حالة التطابق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark bg-surface dark:bg-surface-dark">
                    {restoreResult.comparisons.map((c) => (
                      <tr key={c.metricKey} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-ink dark:text-ink-dark flex items-center gap-2">
                          <FileCheck className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                          <span>{c.labelAr}</span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-ink dark:text-ink-dark">
                          {c.sourceValue}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-brand dark:text-brand-bright">
                          {c.restoredValue}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {c.isMatched ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-bold text-micro border border-paid/20 dark:border-paid/30">
                              <CheckCircle2 className="w-3 h-3 text-paid dark:text-paid-bright" />
                              <span>100% متطابق</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright font-bold text-micro border border-danger/20 dark:border-danger-bright/30">
                              <AlertTriangle className="w-3 h-3 text-danger dark:text-danger-bright" />
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
              <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between gap-4">
                <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  {restoreResult.isMatch
                    ? 'كل الأرقام مطابقة 100%. هتتحمّل الشاشة من جديد (مش هيتقفل البرنامج)، وبعدها سجّل الدخول بنفس الأرقام السرية اللي كنت بتستخدمها على الجهاز القديم. وراجع تفعيل الترخيص على الجهاز ده.'
                    : 'في أرقام مش متطابقة، راجعها قبل ما تبدأ الشغل. هتتحمّل الشاشة من جديد (مش هيتقفل البرنامج)، وبعدها سجّل الدخول بنفس أرقام الدخول القديمة.'}
                </span>
                <AppButton variant="primary" icon={CheckCircle2} onClick={handleFinish}>
                  اعتماد وبدء الشغل
                </AppButton>
              </div>
            </div>
          )}
        </div>
        </MotionHeight>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted">
          <span>نظام رفيق — إصدار معتمد لويندوز 7 و 10 و 11</span>
        </div>
      </div>
    </div>
  );
};
