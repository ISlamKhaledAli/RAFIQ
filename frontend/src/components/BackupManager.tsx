import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { 
  Database, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  ShieldCheck, 
  Usb, 
  Save, 
  FolderCheck,
  AlertCircle,
  RotateCcw,
  Laptop,
  KeyRound,
  FolderOpen,
  Lock,
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { DatabaseRecoveryModal } from './DatabaseRecoveryModal';
import { AppButton } from './AppButton';
import { MigrationWizardModal } from './MigrationWizardModal';
import { rafiqAlert } from '../utils/dialogService';
import { useAuth } from '../context/useAuth';
import { useUnsavedChangesGuard } from '../context/useUnsavedChanges';
import { UnsavedChangesChip } from './UnsavedChangesChip';
import {
  DEFAULT_MAX_COPIES,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_RETENTION_WEEKS,
  DEFAULT_WARN_AFTER_DAYS,
  RETENTION_ROOT_ONLY_NOTE,
} from '../utils/backupRetention';
import { DateFilterControl } from './DateFilterControl';
import { useDateFilter, useToday, isDateFilterActive, describeDateFilter, getDateFilterPayload } from '../utils/dateFilter';
import type { DateFilterValue } from '../utils/dateFilter';
import {
  BACKUP_PAGE_SIZE,
  backupCountLabel,
  formatBackupDate,
  formatBackupSize,
  nextBackupLimit,
  normalizeFolderState,
  remainingBackups,
} from '../utils/backupList';

interface BackupFileInfo {
  fileName: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: string;
}

interface VerifyOutcome {
  ok: boolean;
  text: string;
}

interface BackupVerifyResult {
  isVerified: boolean;
  message: string;
}

interface DriveItem {
  name: string;
  label: string;
  driveType: string;
  totalSpaceBytes: number;
  freeSpaceBytes: number;
  isReady: boolean;
  isRemovable: boolean;
}

interface BackupStatusInfo {
  lastBackupAt: string;
  lastBackupStatus: string;
  lastBackupFile: string;
  lastBackupSizeBytes: number;
  isOverdue: boolean;
  overdueWarning: string | null;
  configuredFolder: string;
  autoOnClose: boolean;
  autoDaily: boolean;
  retentionDays: number;
  retentionWeeks: number;
  warnAfterDays: number;
  maxCopies?: number;
  recentBackups: BackupFileInfo[];
  totalBackupCount?: number;
  listedFolder?: string;
  folderStatus?: string;
  folderMessage?: string | null;
}

interface BackupResult {
  success: boolean;
  backupFilePath: string;
  fileSizeBytes: number;
  message: string;
  isVerified: boolean;
  fallbackToLocal: boolean;
  createdAt: string;
}

interface BackupManagerProps {
  onOpenLicenseModal?: () => void;
  /** false while the keep-alive settings page is hidden: a leftover draft must not block other pages */
  isActive?: boolean;
}

/** Same normalisation the save applies, so typing a value and reverting it is clean. */
function policySnapshotOf(folder: string, days: number, weeks: number, warn: number, copies: number): string {
  return JSON.stringify([folder.trim(), Number(days) || DEFAULT_RETENTION_DAYS, Number(weeks) || DEFAULT_RETENTION_WEEKS, Number(warn) || DEFAULT_WARN_AFTER_DAYS, Number(copies) || DEFAULT_MAX_COPIES]);
}

export const BackupManager = ({ onOpenLicenseModal, isActive = true }: BackupManagerProps = {}) => {
  // Restore / migration and license activation are owner-grade privileges (owner/root always, a manager only when granted; the server enforces the same keys)
  const { hasPermission, isRoot } = useAuth();
  const canRestore = hasPermission('settings.restore');
  const canManageLicense = hasPermission('settings.license');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<BackupStatusInfo | null>(null);
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [targetFolder, setTargetFolder] = useState('');
  const [autoOnClose, setAutoOnClose] = useState(true);
  const [autoDaily, setAutoDaily] = useState(true);
  const [retentionDays, setRetentionDays] = useState(DEFAULT_RETENTION_DAYS);
  const [retentionWeeks, setRetentionWeeks] = useState(DEFAULT_RETENTION_WEEKS);
  const [warnAfterDays, setWarnAfterDays] = useState(DEFAULT_WARN_AFTER_DAYS);
  const [maxCopies, setMaxCopies] = useState(DEFAULT_MAX_COPIES);
  // Retention policy form: compared with the values last loaded or saved (the two switches above it save themselves)
  const [policyBaseline, setPolicyBaseline] = useState<string | null>(null);
  const policySnapshot = policySnapshotOf(targetFolder, retentionDays, retentionWeeks, warnAfterDays, maxCopies);
  const policyDirty = policyBaseline !== null && policySnapshot !== policyBaseline;
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupFileInfo | null>(null);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  // The period is applied by the backend to the backup's own timestamp, before the list cap
  const { dateFilter, setDateFilter, resetDateFilter } = useDateFilter();
  const today = useToday();
  const listDateActive = isDateFilterActive(dateFilter);
  const [listLimit, setListLimit] = useState(BACKUP_PAGE_SIZE);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [verifyingPath, setVerifyingPath] = useState<string | null>(null);
  const [verifyOutcomes, setVerifyOutcomes] = useState<Record<string, VerifyOutcome>>({});
  const listQuery = useMemo(
    () => ({ ...getDateFilterPayload(dateFilter, today), limit: listLimit }),
    [dateFilter, today, listLimit]
  );
  const listQueryRef = useRef(listQuery);
  listQueryRef.current = listQuery;
  const firstListRunRef = useRef(true);
  // Only the latest list request may write state (a slow older answer must not overwrite a newer one)
  const listRequestRef = useRef(0);

  const handleDateFilterChange = (next: DateFilterValue) => {
    setListLimit(BACKUP_PAGE_SIZE);
    setDateFilter(next);
  };

  const handleResetDateFilter = () => {
    setListLimit(BACKUP_PAGE_SIZE);
    resetDateFilter();
  };

  const handleOpenLicense = () => {
    if (onOpenLicenseModal) {
      onOpenLicenseModal();
    } else {
      window.dispatchEvent(new CustomEvent('rafiq:open-license'));
    }
  };

  // Reloads the status banner and the list without touching the policy form (an unsaved draft must survive)
  const refreshList = async () => {
    const requestId = ++listRequestRef.current;
    setListLoading(true);
    try {
      const res = await invoke<BackupStatusInfo>('backup:getStatus', listQueryRef.current);
      if (requestId !== listRequestRef.current) return;
      if (res) setStatus(res);
      setListError(null);
    } catch (err: unknown) {
      if (requestId !== listRequestRef.current) return;
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === listRequestRef.current) setListLoading(false);
    }
  };

  const fetchBackupStatus = async () => {
    const requestId = ++listRequestRef.current;
    try {
      const res = await invoke<BackupStatusInfo>('backup:getStatus', listQueryRef.current);
      if (requestId !== listRequestRef.current) return;
      if (res) {
        setStatus(res);
        setListError(null);
        setTargetFolder(res.configuredFolder || '');
        setAutoOnClose(res.autoOnClose);
        setAutoDaily(res.autoDaily);
        setRetentionDays(res.retentionDays || DEFAULT_RETENTION_DAYS);
        setRetentionWeeks(res.retentionWeeks || DEFAULT_RETENTION_WEEKS);
        setWarnAfterDays(res.warnAfterDays || DEFAULT_WARN_AFTER_DAYS);
        setMaxCopies(res.maxCopies || DEFAULT_MAX_COPIES);
        setPolicyBaseline(policySnapshotOf(res.configuredFolder || '', res.retentionDays || DEFAULT_RETENTION_DAYS, res.retentionWeeks || DEFAULT_RETENTION_WEEKS, res.warnAfterDays || DEFAULT_WARN_AFTER_DAYS, res.maxCopies || DEFAULT_MAX_COPIES));
      }
    } catch (err: unknown) {
      if (requestId !== listRequestRef.current) return;
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === listRequestRef.current) setListLoading(false);
    }
  };

  const fetchDrives = async () => {
    try {
      const res = await invoke<DriveItem[]>('backup:getDrives');
      if (Array.isArray(res)) {
        setDrives(res);
      }
    } catch (err: unknown) {
      console.error('Failed to get drives:', err);
    }
  };

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const [statusRes, drivesRes] = await Promise.all([
          invoke<BackupStatusInfo>('backup:getStatus'),
          invoke<DriveItem[]>('backup:getDrives')
        ]);
        if (!active) return;
        if (statusRes) {
          setStatus(statusRes);
          setTargetFolder(statusRes.configuredFolder || '');
          setAutoOnClose(statusRes.autoOnClose);
          setAutoDaily(statusRes.autoDaily);
          setRetentionDays(statusRes.retentionDays || DEFAULT_RETENTION_DAYS);
          setRetentionWeeks(statusRes.retentionWeeks || DEFAULT_RETENTION_WEEKS);
          setWarnAfterDays(statusRes.warnAfterDays || DEFAULT_WARN_AFTER_DAYS);
          setMaxCopies(statusRes.maxCopies || DEFAULT_MAX_COPIES);
          setPolicyBaseline(policySnapshotOf(statusRes.configuredFolder || '', statusRes.retentionDays || DEFAULT_RETENTION_DAYS, statusRes.retentionWeeks || DEFAULT_RETENTION_WEEKS, statusRes.warnAfterDays || DEFAULT_WARN_AFTER_DAYS, statusRes.maxCopies || DEFAULT_MAX_COPIES));
        }
        if (Array.isArray(drivesRes)) {
          setDrives(drivesRes);
        }
      } catch (err: unknown) {
        if (!active) return;
        setListError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setListLoading(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  // Changing the period or the page size refreshes only the backup list (never the unsaved policy form)
  useEffect(() => {
    if (firstListRunRef.current) {
      firstListRunRef.current = false;
      return;
    }
    void refreshList();
    // refreshList reads the latest query through listQueryRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery]);

  useDataSubscription(['settings', 'all'], () => {
    void refreshList();
    void fetchDrives();
  });

  const handleCreateBackup = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      // The saved folder is used (the one the list shows); an unsaved draft path is not silently backed up to
      const res = await invoke<BackupResult>('backup:create');
      if (res && res.success) {
        setActionMessage({
          text: res.message,
          type: res.fallbackToLocal ? 'warning' : 'success'
        });
      } else {
        setActionMessage({
          text: res?.message || 'فشلت عملية إنشاء النسخة الاحتياطية',
          type: 'error'
        });
      }
      await refreshList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage({
        text: `خطأ أثناء إنشاء النسخة الاحتياطية: ${msg}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Only root sends the retention fields: for everyone else the host keeps the stored policy
  const buildConfigPayload = (autoClose: boolean, daily: boolean) => ({
    targetFolder: targetFolder.trim(),
    autoOnClose: autoClose,
    autoDaily: daily,
    warnAfterDays: Number(warnAfterDays) || DEFAULT_WARN_AFTER_DAYS,
    ...(isRoot
      ? {
          retentionDays: Number(retentionDays) || DEFAULT_RETENTION_DAYS,
          retentionWeeks: Number(retentionWeeks) || DEFAULT_RETENTION_WEEKS,
          maxCopies: Number(maxCopies) || DEFAULT_MAX_COPIES,
        }
      : {}),
  });

  const handleToggleAutoOnClose = async (val: boolean) => {
    setAutoOnClose(val);
    try {
      await invoke('backup:configure', buildConfigPayload(val, autoDaily));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAutoDaily = async (val: boolean) => {
    setAutoDaily(val);
    try {
      await invoke('backup:configure', buildConfigPayload(autoOnClose, val));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePolicy = async (): Promise<boolean> => {
    try {
      await invoke('backup:configure', buildConfigPayload(autoOnClose, autoDaily));
      setPolicyBaseline(policySnapshot);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
      await fetchBackupStatus();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل حفظ إعدادات النسخ الاحتياطي',
        message: `فشل حفظ إعدادات النسخ: ${msg}`,
        variant: 'error',
      });
      return false;
    }
  };

  const { saveBarRef: policySaveBarRef } = useUnsavedChangesGuard({
    id: 'backup-policy',
    label: 'سياسة النسخ الاحتياطي',
    isDirty: policyDirty,
    isActive,
    save: handleSavePolicy,
    // Reading the saved values again drops the draft; the form unmounts with its sub-tab anyway
    discard: () => void fetchBackupStatus(),
  });

  const handleVerifyBackup = async (bk: BackupFileInfo) => {
    setVerifyingPath(bk.fullPath);
    setVerifyOutcomes((prev) => {
      const next = { ...prev };
      delete next[bk.fullPath];
      return next;
    });
    try {
      const res = await invoke<BackupVerifyResult>('backup:verify', { backupFilePath: bk.fullPath });
      setVerifyOutcomes((prev) => ({
        ...prev,
        [bk.fullPath]: { ok: Boolean(res?.isVerified), text: res?.message || 'لم يصل رد من الفحص.' },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerifyOutcomes((prev) => ({ ...prev, [bk.fullPath]: { ok: false, text: `فشل الفحص: ${msg}` } }));
    } finally {
      setVerifyingPath(null);
    }
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return 'لا يوجد';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const shownCount = status?.recentBackups?.length ?? 0;
  const totalCount = status?.totalBackupCount ?? shownCount;
  const remaining = remainingBackups(shownCount, totalCount);
  const folderState = normalizeFolderState(status?.folderStatus);

  return (
    <div className="flex flex-col gap-5 text-ink dark:text-ink-dark select-none font-sans">
      {/* 1. Header Alert Banner if Overdue (Task 9-6) */}
      {status?.isOverdue && (
        <div className="p-4 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl flex flex-wrap items-start justify-between gap-x-4 gap-y-3 text-warn dark:text-warn-bright shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
            <div>
              <h4 className="t-label m-0 text-warn dark:text-warn-bright">تنبيه أمان البيانات (النسخ الاحتياطي متأخر)</h4>
              <p className="text-xs m-0 mt-1 text-warn/80 dark:text-warn-bright/80 leading-relaxed font-sans">
                {status.overdueWarning}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Result Toast/Banner */}
      {actionMessage && (
        <div 
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
            actionMessage.type === 'success'
              ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30'
              : actionMessage.type === 'warning'
              ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn-dark dark:text-warn-bright border-warn/30 dark:border-warn-bright/30'
              : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/30 dark:border-danger-bright/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />}
            {actionMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />}
            {actionMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />}
            <span className="leading-relaxed">{actionMessage.text}</span>
          </div>
          <AppButton variant="subtle" size="xs" icon={X} aria-label="إغلاق" onClick={() => setActionMessage(null)} className="mr-2" />
        </div>
      )}

      {/* 2. Top Summary & Trigger Card */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 sm:p-6 flex flex-col gap-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3 border-b border-line dark:border-line-dark pb-5">
          <div className="flex flex-wrap items-center gap-3">
            {canManageLicense && (
            <AppButton
              variant="soft"
              icon={KeyRound}
              onClick={handleOpenLicense}
              title="ترخيص وتفعيل برنامج رفيق، تجديد الاشتراك، أو نقل الترخيص لجهاز آخر"
            >
              ترخيص وتفعيل البرنامج
            </AppButton>
            )}

            {canRestore && (
            <AppButton
              variant="soft"
              icon={Laptop}
              onClick={() => setIsMigrationModalOpen(true)}
              title="نقل البرنامج والبيانات إلى جهاز جديد مع مقارنة الأرقام"
            >
              نقل لجهاز جديد
            </AppButton>
            )}

            <AppButton variant="primary" icon={Database} loading={loading} onClick={() => void handleCreateBackup()}>
              {loading ? 'جاري إنشاء النسخة والتحقق...' : 'خذ نسخة احتياطية دلوقتي'}
            </AppButton>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-medium">تاريخ آخر نسخة ناجحة</span>
            <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark">
              <Clock className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
              <span>{formatDate(status?.lastBackupAt || '')}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-medium">حالة الأمان</span>
            <div className="flex items-center gap-2 font-bold">
              {status?.isOverdue ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-warn dark:bg-warn-bright"></span>
                  <span className="text-warn dark:text-warn-bright">متأخر يحتاج نسخة</span>
                </>
              ) : status?.lastBackupStatus === 'success' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-paid dark:bg-paid-bright"></span>
                  <span className="text-paid dark:text-paid-bright">آمن ومحدث</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-line-hover dark:bg-line-dark-hover"></span>
                  <span className="text-ink-muted dark:text-ink-muted-dark">لم يتم النسخ بعد</span>
                </>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-medium">حجم النسخة الأخيرة</span>
            <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark font-mono">
              <HardDrive className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark shrink-0" />
              <span>{formatBackupSize(status?.lastBackupSizeBytes || 0)}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-medium">فحص السلامة الآلي</span>
            <div className="flex items-center gap-2 font-bold text-paid dark:text-paid-bright">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>اجتازت الفحص بنجاح</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Backup Policy & Drive Selection Card (Tasks 9-1, 9-3, 9-4, 9-5) */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 sm:p-6 flex flex-col gap-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line dark:border-line-dark pb-4">
          <div className="flex items-center gap-2.5">
            <FolderCheck className="w-4 h-4 text-brand dark:text-brand-bright" />
            <h3 className="t-card-title text-ink dark:text-ink-dark m-0">سياسة النسخ ومكان الحفظ (فلاشة USB / مجلد محلي)</h3>
          </div>
          {settingsSaved && (
            <span className="text-xs font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-2.5 py-1 rounded border border-paid-border dark:border-paid-bright/30">
              تم حفظ السياسة
            </span>
          )}
        </div>

        {/* USB Flash Drive Quick Selection */}
        <div>
          <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2.5">
            الأقراص والفلاشات المتصلة بالجهاز (اختر الفلاشة بضغطة واحدة):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {drives.map((d) => (
              <button
                type="button"
                key={d.name}
                onClick={() => setTargetFolder(`${d.name}RafiqBackups`)}
                aria-pressed={targetFolder.startsWith(d.name)}
                className={`p-3.5 rounded-lg border text-right flex items-center justify-between gap-3 ${
                  targetFolder.startsWith(d.name)
                    ? 'bg-brand-soft dark:bg-brand-bright/20 border-brand dark:border-brand-bright text-brand dark:text-brand-bright ring-1 ring-brand/30 dark:ring-brand-bright/30'
                    : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-hover text-ink dark:text-ink-dark'
                }`}
              >
                <div className="flex items-center gap-3">
                  {d.isRemovable ? (
                    <Usb className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  ) : (
                    <HardDrive className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-xs block text-ink dark:text-ink-dark">{d.name} {d.label}</span>
                    <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-mono block mt-0.5">
                      المتاح: {formatBackupSize(d.freeSpaceBytes)} / {formatBackupSize(d.totalSpaceBytes)}
                    </span>
                  </div>
                </div>
                {d.isRemovable && (
                  <span className="text-micro px-2 py-0.5 rounded bg-brand dark:bg-paid-bright text-white dark:text-surface-dark font-bold shrink-0">
                    فلاشة USB
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Target Folder Path Input */}
        <div>
          <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">
            مسار مجلد النسخ الاحتياطي:
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              placeholder="مثال: E:\RafiqBackups أو C:\RafiqBackups"
              className="flex-1 min-w-[14rem] bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-10 px-3 text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
            />
            <AppButton
              variant="secondary"
              onClick={() => setTargetFolder(status?.configuredFolder || '')}
              className="shrink-0"
            >
              استعادة الافتراضي
            </AppButton>
          </div>
          <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-2 leading-relaxed font-sans">
            ملاحظة: لو الفلاشة اتفصلت أو تعذر الحفظ فيها، النظام بيحفظ تلقائياً في مجلد آمن داخل الجهاز عشان البيع ما يقفش أبداً.
          </p>
        </div>

        {/* Automation Triggers & Retention Rules Grid */}
        <div className="grid grid-cols-1 gap-5 pt-5 border-t border-line dark:border-line-dark text-xs">
          {/* Checkboxes */}
          <div className="flex flex-col gap-3.5">
            <label className="flex items-center gap-2.5 cursor-pointer font-medium text-sm text-ink dark:text-ink-dark">
              <input
                type="checkbox"
                checked={autoOnClose}
                onChange={(e) => void handleToggleAutoOnClose(e.target.checked)}
                className="cursor-pointer"
              />
              <span>أخذ نسخة احتياطية تلقائياً عند قفل البرنامج (موصى به جداً)</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer font-medium text-sm text-ink dark:text-ink-dark">
              <input
                type="checkbox"
                checked={autoDaily}
                onChange={(e) => void handleToggleAutoDaily(e.target.checked)}
                className="cursor-pointer"
              />
              <span>تفعيل النسخ الاحتياطي اليومي التلقائي</span>
            </label>
          </div>

          {/* Retention Numbers */}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-ink-muted dark:text-ink-muted-dark font-medium mb-1.5">حفظ نسخ آخر (أيام):</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={retentionDays}
                  disabled={!isRoot}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value) || DEFAULT_RETENTION_DAYS)}
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-10 px-2 text-sm font-bold font-mono text-ink dark:text-ink-dark text-center focus:outline-none focus:border-brand dark:focus:border-brand-bright disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-2 dark:disabled:bg-surface-dark-3"
                />
              </div>

              <div>
                <label className="block text-xs text-ink-muted dark:text-ink-muted-dark font-medium mb-1.5">نسخ أسبوعية (أسابيع):</label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={retentionWeeks}
                  disabled={!isRoot}
                  onChange={(e) => setRetentionWeeks(parseInt(e.target.value) || DEFAULT_RETENTION_WEEKS)}
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-10 px-2 text-sm font-bold font-mono text-ink dark:text-ink-dark text-center focus:outline-none focus:border-brand dark:focus:border-brand-bright disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-2 dark:disabled:bg-surface-dark-3"
                />
              </div>

              <div>
                <label className="block text-xs text-ink-muted dark:text-ink-muted-dark font-medium mb-1.5">أقصى عدد نسخ (نسخة):</label>
                <input
                  type="number"
                  min="3"
                  max="50"
                  value={maxCopies}
                  disabled={!isRoot}
                  onChange={(e) => setMaxCopies(parseInt(e.target.value) || DEFAULT_MAX_COPIES)}
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-10 px-2 text-sm font-bold font-mono text-ink dark:text-ink-dark text-center focus:outline-none focus:border-brand dark:focus:border-brand-bright disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-2 dark:disabled:bg-surface-dark-3"
                />
              </div>

              <div>
                <label className="block text-xs text-ink-muted dark:text-ink-muted-dark font-medium mb-1.5">تنبيه بعد (أيام):</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={warnAfterDays}
                  onChange={(e) => setWarnAfterDays(parseInt(e.target.value) || DEFAULT_WARN_AFTER_DAYS)}
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-10 px-2 text-sm font-bold font-mono text-ink dark:text-ink-dark text-center focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
              </div>
            </div>
            {!isRoot && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink-muted dark:text-ink-muted-dark font-sans m-0">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                {RETENTION_ROOT_ONLY_NOTE}
              </p>
            )}
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark font-sans m-0 leading-relaxed">
              * محرك الاستبقاء الآمن: بيدمج نسخ نفس اليوم لمنع تراكم الملفات عند قفل البرنامج وفتحه، وبيحتفظ دائماً بـ 3 نسخ سليمة كحد أدنى مضمون مهما حصل.
            </p>
          </div>
        </div>

        <div ref={policySaveBarRef} className="self-end flex flex-wrap items-center justify-end gap-3 rounded-xl">
          <UnsavedChangesChip dirty={policyDirty} />
          <AppButton variant="primary" icon={Save} onClick={() => void handleSavePolicy()}>
            حفظ وتطبيق سياسة النسخ
          </AppButton>
        </div>
      </div>

      {/* 4. List of Existing Backups (Tasks 9-1 & 125-2) */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 sm:p-6 flex flex-col gap-4 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line dark:border-line-dark pb-4">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-brand dark:text-brand-bright" />
            <h3 className="t-card-title text-ink dark:text-ink-dark m-0">سجل النسخ الاحتياطية المتوفرة في المجلد</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">تاريخ النسخة:</span>
            <DateFilterControl value={dateFilter} onChange={handleDateFilterChange} size="sm" selectWidthClass="w-44" />
            {!listError && folderState !== 'unreadable' && (
              <span className="text-xs text-ink-muted dark:text-ink-muted-dark" aria-live="polite">
                {backupCountLabel(shownCount, totalCount, listDateActive ? describeDateFilter(dateFilter) : null)}
              </span>
            )}
          </div>
        </div>

        {status?.listedFolder && (
          <div className="flex items-start gap-2 text-ink-muted dark:text-ink-muted-dark">
            <FolderOpen className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="shrink-0">المجلد المعروض:</span>
            <span dir="ltr" className="font-mono break-all text-ink dark:text-ink-dark select-text">{status.listedFolder}</span>
          </div>
        )}

        {folderState === 'unavailable' && (
          <div role="alert" className="p-3 rounded-lg border bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-bright/30 text-warn dark:text-warn-bright flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{status?.folderMessage || 'تعذر الوصول إلى مجلد النسخ المحدد.'}</span>
          </div>
        )}

        {listError ? (
          <div role="alert" className="p-5 rounded-lg border bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>تعذر تحميل سجل النسخ الاحتياطية: {listError}</span>
            </div>
            <AppButton variant="secondary" size="sm" icon={RefreshCw} onClick={() => void refreshList()}>
              إعادة المحاولة
            </AppButton>
          </div>
        ) : folderState === 'unreadable' ? (
          <div role="alert" className="p-5 rounded-lg border bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{status?.folderMessage || 'تعذر قراءة مجلد النسخ الاحتياطية.'}</span>
            </div>
            <span className="leading-relaxed">قد تكون النسخ موجودة لكن المجلد غير متاح الآن. تأكد من توصيل الفلاشة أو صلاحيات المجلد ثم أعد المحاولة.</span>
            <AppButton variant="secondary" size="sm" icon={RefreshCw} onClick={() => void refreshList()}>
              إعادة المحاولة
            </AppButton>
          </div>
        ) : listLoading && !status ? (
          <div role="status" className="p-6 flex items-center justify-center gap-2 text-ink-muted dark:text-ink-muted-dark bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>جاري تحميل سجل النسخ الاحتياطية...</span>
          </div>
        ) : shownCount > 0 ? (
          <div className="flex flex-col gap-3">
            <div className={`overflow-x-auto rounded-lg border border-line dark:border-line-dark transition-opacity ${listLoading ? 'opacity-60' : ''}`} aria-busy={listLoading}>
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border-b border-line dark:border-line-dark">
                    <th className="py-2.5 px-3 font-semibold">اسم ملف النسخة</th>
                    <th className="py-2.5 px-3 font-semibold whitespace-nowrap">تاريخ الإنشاء</th>
                    <th className="py-2.5 px-3 font-semibold whitespace-nowrap">الحجم</th>
                    <th className="py-2.5 px-3 font-semibold text-center whitespace-nowrap">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {status?.recentBackups.map((bk) => {
                    const outcome = verifyOutcomes[bk.fullPath];
                    const isVerifying = verifyingPath === bk.fullPath;
                    return (
                      <Fragment key={bk.fullPath}>
                        <tr className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                          <td className="py-3 px-3 font-semibold text-ink dark:text-ink-dark">
                            <span dir="ltr" className="inline-block font-mono break-all text-left select-text">{bk.fileName}</span>
                          </td>
                          <td className="py-3 px-3 text-ink-muted dark:text-ink-muted-dark whitespace-nowrap">
                            <span dir="ltr" className="inline-block tabular-nums">{formatBackupDate(bk.createdAt)}</span>
                          </td>
                          <td className="py-3 px-3 text-ink dark:text-ink-dark font-bold whitespace-nowrap tabular-nums">{formatBackupSize(bk.sizeBytes)}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-center gap-2">
                              <AppButton
                                variant="secondary"
                                size="sm"
                                icon={ShieldCheck}
                                loading={isVerifying}
                                onClick={() => void handleVerifyBackup(bk)}
                                className="min-w-[4.5rem]"
                                title="فحص سلامة هذه النسخة وتطابقها (قراءة فقط، لا يمس بيانات النظام)"
                              >
                                {isVerifying ? 'جاري الفحص' : 'فحص'}
                              </AppButton>

                              {canRestore && (
                              <AppButton
                                variant="soft"
                                size="sm"
                                icon={RotateCcw}
                                onClick={() => setRestoreTarget(bk)}
                                disabled={isVerifying}
                                className="min-w-[4.5rem]"
                                title="استرجاع قاعدة البيانات من هذه النسخة"
                              >
                                استرجاع
                              </AppButton>
                              )}
                            </div>
                          </td>
                        </tr>
                        {outcome && (
                          <tr>
                            <td colSpan={4} className="px-3 pb-3 pt-0">
                              <div
                                role="status"
                                className={`p-2.5 rounded-lg border flex items-start justify-between gap-3 leading-relaxed ${
                                  outcome.ok
                                    ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30'
                                    : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/30 dark:border-danger-bright/30'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  {outcome.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                  <span>{outcome.text}</span>
                                </div>
                                <AppButton
                                  variant="subtle"
                                  size="xs"
                                  icon={X}
                                  aria-label="إغلاق"
                                  onClick={() => setVerifyOutcomes((prev) => {
                                    const next = { ...prev };
                                    delete next[bk.fullPath];
                                    return next;
                                  })}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {remaining > 0 && (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => setListLimit(nextBackupLimit(listLimit, totalCount))}
                disabled={listLoading}
                className="self-center"
              >
                عرض المزيد ({remaining})
              </AppButton>
            )}
            {totalCount > shownCount && remaining === 0 && (
              <p className="m-0 text-center text-ink-muted dark:text-ink-muted-dark">
                تم عرض أقصى عدد ممكن. استخدم فلتر «تاريخ النسخة» لعرض النسخ الأقدم.
              </p>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-ink-muted dark:text-ink-muted-dark bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark">
            {listDateActive ? (
              <div className="flex flex-col items-center gap-2">
                <span>{`مفيش نسخ احتياطية خلال ${describeDateFilter(dateFilter)}.`}</span>
                <AppButton variant="primary" size="sm" icon={RotateCcw} onClick={handleResetDateFilter}>
                  عرض كل النسخ
                </AppButton>
              </div>
            ) : folderState === 'unavailable' ? (
              'لا توجد نسخ محفوظة في المجلد المحلي الآمن أيضاً. وصّل الفلاشة أو اختر مجلداً متاحاً ثم خذ نسخة احتياطية.'
            ) : (
              'لم يتم العثور على أي نسخ احتياطية في المجلد المحدد حتى الآن. انقر على «خذ نسخة احتياطية الآن» أعلاه لإنشاء أول نسخة.'
            )}
          </div>
        )}
      </div>

      {/* Database Recovery Modal Dialog (Feature #124 / Task 124-2) */}
      {restoreTarget && (
        <DatabaseRecoveryModal
          status={{
            isValid: true,
            isCorrupt: false,
            message: 'طلب استرجاع يدوي موجه',
            latestValidBackupFile: restoreTarget.fullPath,
            latestValidBackupDate: formatBackupDate(restoreTarget.createdAt),
            latestValidBackupSizeBytes: restoreTarget.sizeBytes
          }}
          isStandaloneDialog={true}
          onDismiss={() => setRestoreTarget(null)}
          onRestored={() => {
            setRestoreTarget(null);
            // The data under every screen (products, users, settings, shift) was replaced: reload the app state from scratch
            window.location.reload();
          }}
        />
      )}

      <MigrationWizardModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        onComplete={() => {
          setIsMigrationModalOpen(false);
          void fetchBackupStatus();
          void fetchDrives();
        }}
      />
    </div>
  );
};
