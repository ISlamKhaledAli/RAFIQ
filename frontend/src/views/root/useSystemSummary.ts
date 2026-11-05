import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '../../bridge/ipc';
import { useFeatures } from '../../context/useFeatures';
import { buildStatusRows, type StatusRow } from '../../utils/diagnosticsSummary';
import type { SystemInfo } from '../../App';

export interface HealthMetrics {
  diskFreeFormatted?: string;
  lastBackupFormatted?: string;
  isBackupOverdue?: boolean;
  printerName?: string;
  isPrinterReady?: boolean;
  licenseStatus?: string;
  appVersion?: string;
  databaseStatus?: string;
  productsCount?: number;
  auditLogStatus?: string;
  deviceFingerprint?: string;
}

export interface HealthAlert {
  id: string;
  level: string;
  title: string;
  message: string;
}

export interface HealthStatus {
  overallStatus: string;
  oneSentenceSummary: string;
  alerts: HealthAlert[];
  metrics: HealthMetrics;
}

export interface SystemSummary {
  health: HealthStatus | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** The status rows shown on screen and copied in the diagnostics summary (one source for both) */
  rows: StatusRow[];
}

/** Loads the live system summary (health:getStatus + system info + active features) for the root status page. */
export function useSystemSummary(sysInfo?: SystemInfo | null): SystemSummary {
  const { flags, registry } = useFeatures();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<HealthStatus>('health:getStatus');
      setHealth(res ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const metrics = health?.metrics ?? {};
    return buildStatusRows({
      appVersion: metrics.appVersion || sysInfo?.version,
      osVersion: sysInfo?.osVersion,
      isWebView2: sysInfo?.isWebView2,
      databaseStatus: metrics.databaseStatus || sysInfo?.dbStatus,
      productsCount: metrics.productsCount,
      licenseStatus: metrics.licenseStatus,
      lastBackup: metrics.lastBackupFormatted,
      isBackupOverdue: metrics.isBackupOverdue,
      printerName: metrics.printerName,
      isPrinterReady: metrics.isPrinterReady,
      featuresActive: registry.filter((feat) => flags[feat.key] ?? feat.defaultValue ?? false).length,
      featuresTotal: registry.length,
      diskFree: metrics.diskFreeFormatted,
      auditStatus: metrics.auditLogStatus,
      deviceFingerprint: metrics.deviceFingerprint,
    });
  }, [health, sysInfo, flags, registry]);

  return { health, loading, error, reload, rows };
}
