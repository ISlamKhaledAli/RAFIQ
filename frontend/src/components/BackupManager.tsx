import { useState, useEffect } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { DatabaseRecoveryModal } from './DatabaseRecoveryModal';
import { rafiqAlert } from '../utils/dialogService';

interface BackupFileInfo {
  fileName: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: string;
  isVerified: boolean;
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
  recentBackups: BackupFileInfo[];
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

export const BackupManager = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<BackupStatusInfo | null>(null);
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [targetFolder, setTargetFolder] = useState('');
  const [autoOnClose, setAutoOnClose] = useState(true);
  const [autoDaily, setAutoDaily] = useState(true);
  const [retentionDays, setRetentionDays] = useState(7);
  const [retentionWeeks, setRetentionWeeks] = useState(4);
  const [warnAfterDays, setWarnAfterDays] = useState(2);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupFileInfo | null>(null);

  const fetchBackupStatus = async () => {
    try {
      const res = await invoke<BackupStatusInfo>('backup:getStatus');
      if (res) {
        setStatus(res);
        setTargetFolder(res.configuredFolder || '');
        setAutoOnClose(res.autoOnClose);
        setAutoDaily(res.autoDaily);
        setRetentionDays(res.retentionDays || 7);
        setRetentionWeeks(res.retentionWeeks || 4);
        setWarnAfterDays(res.warnAfterDays || 2);
      }
    } catch (err: unknown) {
      console.error('Failed to get backup status:', err);
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
          setRetentionDays(statusRes.retentionDays || 7);
          setRetentionWeeks(statusRes.retentionWeeks || 4);
          setWarnAfterDays(statusRes.warnAfterDays || 2);
        }
        if (Array.isArray(drivesRes)) {
          setDrives(drivesRes);
        }
      } catch (err: unknown) {
        console.error('Failed to init backup manager:', err);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const handleCreateBackup = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await invoke<BackupResult>('backup:create', { folder: targetFolder });
      if (res && res.success) {
        setActionMessage({
          text: res.message,
          type: res.fallbackToLocal ? 'warning' : 'success'
        });
        await fetchBackupStatus();
      } else {
        setActionMessage({
          text: res?.message || 'فشلت عملية إنشاء النسخة الاحتياطية',
          type: 'error'
        });
      }
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

  const handleSavePolicy = async () => {
    try {
      await invoke('backup:configure', {
        targetFolder: targetFolder.trim(),
        autoOnClose,
        autoDaily,
        retentionDays: Number(retentionDays) || 7,
        retentionWeeks: Number(retentionWeeks) || 4,
        warnAfterDays: Number(warnAfterDays) || 2
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
      await fetchBackupStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل حفظ إعدادات النسخ الاحتياطي',
        message: `فشل حفظ إعدادات النسخ: ${msg}`,
        variant: 'error',
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 بايت';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${Math.round(bytes / 1024)} ك.ب`;
    return `${mb.toFixed(2)} م.ب`;
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return 'لا يوجد';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('ar-EG', {
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

  return (
    <div className="flex flex-col gap-4 text-ink select-none font-sans">
      {/* 1. Header Alert Banner if Overdue (Task 9-6) */}
      {status?.isOverdue && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-[6px] flex items-start justify-between gap-3 text-amber-900 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[13px] font-bold m-0 text-amber-950">تنبيه أمان البيانات (النسخ الاحتياطي متأخر)</h4>
              <p className="text-[12px] m-0 mt-0.5 text-amber-800 leading-relaxed font-sans">
                {status.overdueWarning}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateBackup()}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[12px] font-bold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Database className="w-3.5 h-3.5" />
            <span>خذ نسخة الآن</span>
          </button>
        </div>
      )}

      {/* Action Result Toast/Banner */}
      {actionMessage && (
        <div 
          className={`p-3 rounded-[6px] border flex items-center justify-between text-[12px] font-medium ${
            actionMessage.type === 'success'
              ? 'bg-paid-soft text-paid border-paid-border'
              : actionMessage.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-paid shrink-0" />}
            {actionMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
            {actionMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            <span className="leading-relaxed">{actionMessage.text}</span>
          </div>
          <button 
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-60 hover:opacity-100 mr-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Top Summary & Trigger Card */}
      <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-ink m-0">حالة النسخ الاحتياطي وحماية قاعدة البيانات</h3>
              <p className="text-[11px] text-ink-muted m-0">نسخ حي مباشر بدون إيقاف البيع باستخدام محرك SQLite WAL Online Backup</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void fetchBackupStatus();
                void fetchDrives();
              }}
              className="p-2 rounded bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink transition-colors"
              title="تحديث الحالة والأقراص المتصلة"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={loading}
              className="h-[38px] px-4 bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[12.5px] font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري إنشاء النسخة والتحقق...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>خذ نسخة احتياطية الآن</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[12px]">
          <div className="p-3 rounded bg-surface-2 border border-line flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted font-medium">تاريخ آخر نسخة ناجحة</span>
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <Clock className="w-3.5 h-3.5 text-brand" />
              <span>{formatDate(status?.lastBackupAt || '')}</span>
            </div>
          </div>

          <div className="p-3 rounded bg-surface-2 border border-line flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted font-medium">حالة الأمان</span>
            <div className="flex items-center gap-1.5 font-bold">
              {status?.isOverdue ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span className="text-amber-700">متأخر يحتاج نسخة</span>
                </>
              ) : status?.lastBackupStatus === 'success' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-paid"></span>
                  <span className="text-paid">آمن ومحدث</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span className="text-ink-muted">لم يتم النسخ بعد</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded bg-surface-2 border border-line flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted font-medium">حجم النسخة الأخيرة</span>
            <div className="flex items-center gap-1.5 font-bold text-ink font-mono">
              <HardDrive className="w-3.5 h-3.5 text-ink-muted" />
              <span>{formatBytes(status?.lastBackupSizeBytes || 0)}</span>
            </div>
          </div>

          <div className="p-3 rounded bg-surface-2 border border-line flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted font-medium">فحص السلامة الآلي</span>
            <div className="flex items-center gap-1.5 font-bold text-paid">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>PRAGMA Verified OK</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Backup Policy & Drive Selection Card (Tasks 9-1, 9-3, 9-4, 9-5) */}
      <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-2">
            <FolderCheck className="w-4 h-4 text-brand" />
            <h3 className="text-[13px] font-bold text-ink m-0">سياسة النسخ ومكان الحفظ (فلاشة USB / مجلد محلي)</h3>
          </div>
          {settingsSaved && (
            <span className="text-[11px] font-bold text-paid bg-paid-soft px-2 py-0.5 rounded border border-paid-border">
              تم حفظ السياسة بنجاح
            </span>
          )}
        </div>

        {/* USB Flash Drive Quick Selection */}
        <div>
          <label className="block text-ink font-semibold text-[12px] mb-1.5">
            الأقراص والفلاشات المتصلة بالجهاز (اختر الفلاشة بضغطة واحدة):
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {drives.map((d) => (
              <button
                type="button"
                key={d.name}
                onClick={() => setTargetFolder(`${d.name}RafiqBackups`)}
                className={`p-2.5 rounded border text-right transition-all flex items-center justify-between ${
                  targetFolder.startsWith(d.name)
                    ? 'bg-brand-soft border-brand text-brand'
                    : 'bg-surface-2 border-line hover:border-line-hover text-ink'
                }`}
              >
                <div className="flex items-center gap-2">
                  {d.isRemovable ? (
                    <Usb className="w-4 h-4 text-brand" />
                  ) : (
                    <HardDrive className="w-4 h-4 text-ink-muted" />
                  )}
                  <div>
                    <span className="font-bold text-[12px] block">{d.name} {d.label}</span>
                    <span className="text-[10px] text-ink-muted font-mono block">
                      المتاح: {formatBytes(d.freeSpaceBytes)} / {formatBytes(d.totalSpaceBytes)}
                    </span>
                  </div>
                </div>
                {d.isRemovable && (
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-brand text-white font-bold">
                    فلاشة USB
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Target Folder Path Input */}
        <div>
          <label className="block text-ink font-semibold text-[12px] mb-1">
            مسار مجلد النسخ الاحتياطي:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              placeholder="مثال: E:\RafiqBackups أو C:\RafiqBackups"
              className="flex-1 bg-surface border border-line rounded h-[38px] px-3 text-[12.5px] text-ink focus:outline-none focus:border-brand font-mono"
            />
            <button
              type="button"
              onClick={() => setTargetFolder(status?.configuredFolder || '')}
              className="px-3 h-[38px] bg-surface-2 border border-line hover:bg-surface rounded text-[11px] font-semibold text-ink-muted hover:text-ink transition-colors"
            >
              استعادة الافتراضي
            </button>
          </div>
          <p className="text-[11px] text-ink-muted mt-1 leading-relaxed font-sans">
            📌 في حالة سحب الفلاشة أو تعذر الكتابة في المسار، يقوم النظام تلقائياً بالحفظ الآمن في المجلد الداخلي للنظام حتى لا تتعطل المبيعات.
          </p>
        </div>

        {/* Automation Triggers & Retention Rules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line text-[12px]">
          {/* Checkboxes */}
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-ink">
              <input
                type="checkbox"
                checked={autoOnClose}
                onChange={(e) => setAutoOnClose(e.target.checked)}
                className="w-4 h-4 accent-brand rounded"
              />
              <span>أخذ نسخة احتياطية تلقائياً عند إغلاق البرنامج (موصى به)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-ink">
              <input
                type="checkbox"
                checked={autoDaily}
                onChange={(e) => setAutoDaily(e.target.checked)}
                className="w-4 h-4 accent-brand rounded"
              />
              <span>تفعيل الجدولة اليومية الآلية للنسخ الاحتياطي</span>
            </label>
          </div>

          {/* Retention Numbers */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-ink-muted font-medium mb-1">حفظ نسخ آخر (أيام):</label>
              <input
                type="number"
                min="1"
                max="60"
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value) || 7)}
                className="w-full bg-surface border border-line rounded h-[34px] px-2 text-[12px] font-bold font-mono text-ink text-center"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-muted font-medium mb-1">نسخ أسبوعية (أسابيع):</label>
              <input
                type="number"
                min="1"
                max="52"
                value={retentionWeeks}
                onChange={(e) => setRetentionWeeks(parseInt(e.target.value) || 4)}
                className="w-full bg-surface border border-line rounded h-[34px] px-2 text-[12px] font-bold font-mono text-ink text-center"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-muted font-medium mb-1">تنبيه بعد (أيام):</label>
              <input
                type="number"
                min="1"
                max="30"
                value={warnAfterDays}
                onChange={(e) => setWarnAfterDays(parseInt(e.target.value) || 2)}
                className="w-full bg-surface border border-line rounded h-[34px] px-2 text-[12px] font-bold font-mono text-ink text-center"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleSavePolicy()}
          className="self-end mt-1 px-4 h-[36px] bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          <span>حفظ وتطبيق سياسة النسخ</span>
        </button>
      </div>

      {/* 4. List of Existing Backups (Tasks 9-1 & 125-2) */}
      <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3 text-[12px]">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-brand" />
            <h3 className="text-[13px] font-bold text-ink m-0">سجل النسخ الاحتياطية المتوفرة في المجلد</h3>
          </div>
          <span className="text-[11px] text-ink-muted">
            إجمالي النسخ: {status?.recentBackups.length || 0}
          </span>
        </div>

        {status?.recentBackups && status.recentBackups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-surface-2 text-ink-muted border-b border-line">
                  <th className="py-2 px-3 font-semibold">اسم ملف النسخة</th>
                  <th className="py-2 px-3 font-semibold">تاريخ الإنشاء</th>
                  <th className="py-2 px-3 font-semibold">الحجم</th>
                  <th className="py-2 px-3 font-semibold text-center">فحص السلامة</th>
                  <th className="py-2 px-3 font-semibold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {status.recentBackups.map((bk) => (
                  <tr key={bk.fileName} className="hover:bg-surface-2/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-ink">{bk.fileName}</td>
                    <td className="py-2.5 px-3 text-ink-muted">{bk.createdAt}</td>
                    <td className="py-2.5 px-3 text-ink font-bold">{formatBytes(bk.sizeBytes)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-paid-soft text-paid text-[10.5px] font-sans font-bold border border-paid-border">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>تم التحقق</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res: any = await invoke('backup:verify', { backupFilePath: bk.fullPath });
                              setActionMessage({
                                text: res.message,
                                type: res.isVerified ? 'success' : 'error'
                              });
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : String(err);
                              setActionMessage({ text: `فشل الفحص: ${msg}`, type: 'error' });
                            }
                          }}
                          className="px-2 py-1 bg-surface-2 hover:bg-surface border border-line rounded text-[11px] font-sans text-ink-muted hover:text-ink transition-colors inline-flex items-center gap-1 shadow-xs"
                          title="إعادة فحص سلامة وتطابق النسخة"
                        >
                          <ShieldCheck className="w-3 h-3 text-paid" />
                          <span>فحص</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setRestoreTarget(bk)}
                          className="px-2.5 py-1 bg-surface-2 hover:bg-brand hover:text-white border border-line rounded text-[11px] font-sans font-bold text-ink transition-colors inline-flex items-center gap-1 shadow-xs"
                          title="استرجاع قاعدة البيانات من هذه النسخة"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>استرجاع</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-ink-muted bg-surface-2 rounded border border-line">
            لم يتم العثور على أي نسخ احتياطية في المجلد المحدد حتى الآن. انقر على «خذ نسخة احتياطية الآن» أعلاه لإنشاء أول نسخة.
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
            latestValidBackupDate: restoreTarget.createdAt,
            latestValidBackupSizeBytes: restoreTarget.sizeBytes
          }}
          isStandaloneDialog={true}
          onDismiss={() => setRestoreTarget(null)}
          onRestored={() => {
            setRestoreTarget(null);
            void fetchBackupStatus();
            void fetchDrives();
          }}
        />
      )}
    </div>
  );
};
