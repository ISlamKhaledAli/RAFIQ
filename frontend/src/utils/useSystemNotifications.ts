import { useState, useEffect, useMemo } from 'react';
import type { LicenseExpiryDetails } from '../components/LicenseExpiredLockScreen';

export interface SystemNotificationItem {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  badge?: string;
  iconType: 'license' | 'expiry' | 'readonly' | 'backup' | 'stock' | 'demo' | 'clock';
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  priority: number; // Higher number = higher priority
  countdown?: string | null;
}

export interface UseSystemNotificationsProps {
  clockWarning: string | null;
  setClockWarning: (val: string | null) => void;
  licenseExpiry: LicenseExpiryDetails | null;
  isLicenseReadOnlyMode: boolean;
  isLockScreenOpen: boolean;
  backupWarning: string | null;
  setBackupWarning: (val: string | null) => void;
  lowStockCount: number;
  lowStockDismissed: boolean;
  setLowStockDismissed: (val: boolean) => void;
  hasDemoData: boolean;
  onOpenLicenseModal: () => void;
  onOpenLockScreen: () => void;
  onOpenBackupSettings: () => void;
  onOpenLowStockCatalog: () => void;
  onOpenDemoManagement: () => void;
}

/**
 * Task 176-1 & 176-4: Central System Notifications Hook with strict deduplication
 * and conflict-resolution logic.
 */
export const useSystemNotifications = ({
  clockWarning,
  setClockWarning,
  licenseExpiry,
  isLicenseReadOnlyMode,
  isLockScreenOpen,
  backupWarning,
  setBackupWarning,
  lowStockCount,
  lowStockDismissed,
  setLowStockDismissed,
  hasDemoData,
  onOpenLicenseModal,
  onOpenLockScreen,
  onOpenBackupSettings,
  onOpenLowStockCatalog,
  onOpenDemoManagement,
}: UseSystemNotificationsProps): SystemNotificationItem[] => {
  const [liveCountdown, setLiveCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!licenseExpiry?.expiresAt) {
      return;
    }

    const updateTimer = () => {
      try {
        const raw = licenseExpiry.expiresAt.trim();
        const targetTime = new Date(raw.endsWith('Z') || raw.includes('T') ? raw : `${raw} UTC`).getTime();
        if (isNaN(targetTime)) return;

        const diffMs = targetTime - Date.now();
        if (diffMs <= 0) {
          setLiveCountdown('00:00:00 (انتهى)');
          return;
        }

        if (diffMs <= 24 * 60 * 60 * 1000) {
          const totalSecs = Math.floor(diffMs / 1000);
          const hours = Math.floor(totalSecs / 3600);
          const minutes = Math.floor((totalSecs % 3600) / 60);
          const seconds = totalSecs % 60;
          setLiveCountdown(
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          );
        } else {
          setLiveCountdown(null);
        }
      } catch {
        // ignore
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [licenseExpiry?.expiresAt]);

  const items = useMemo<SystemNotificationItem[]>(() => {
    const list: SystemNotificationItem[] = [];

    // 1. Clock Tampering Warning (Highest Critical Priority: 100)
    if (clockWarning) {
      list.push({
        id: 'clock_tampering',
        type: 'critical',
        title: 'تنبيه ساعة النظام',
        message: clockWarning,
        badge: 'تنبيه أمان',
        iconType: 'clock',
        dismissible: true,
        onDismiss: () => setClockWarning(null),
        priority: 100,
      });
    }

    // 2. License Notifications (Strict Deduplication Logic - Task 176-1)
    if (isLicenseReadOnlyMode) {
      // In read-only mode, only show the read-only alert. Do not show warning or trial banner.
      list.push({
        id: 'license_readonly',
        type: 'critical',
        title: 'وضع القراءة فقط',
        message: 'انتهت فترة الاشتراك. عمليات البيع معطلة، ويتاح فقط عرض التقارير والمبيعات السابقة وأخذ نسخة احتياطية.',
        badge: 'اشتراك منتهٍ',
        iconType: 'readonly',
        actionLabel: 'تفعيل الترخيص',
        onAction: onOpenLockScreen,
        priority: 95,
      });
    } else if (licenseExpiry && !isLockScreenOpen) {
      const isTrial = licenseExpiry.status === 'trial' || licenseExpiry.licenseType === 'trial';
      const isWarningOrExpiringSoon =
        licenseExpiry.status === 'warning' || licenseExpiry.daysRemaining <= 1;

      if (isWarningOrExpiringSoon) {
        // If warning / expiring soon (<= 1 day or warning status), show ONLY the expiry warning with countdown.
        // NEVER show both trial and expiry warning simultaneously!
        list.push({
          id: 'license_expiry_warning',
          type: 'critical',
          title: 'اقتراب انتهاء الاشتراك',
          message:
            licenseExpiry.daysRemaining <= 1
              ? 'سينتهي اشتراك البرنامج قريباً جداً! يرجى التجديد لتفادي توقف نقاط البيع تلقائياً.'
              : `سينتهي اشتراك البرنامج خلال ${licenseExpiry.daysRemaining} أيام. يرجى التجديد لضمان استمرار العمل.`,
          badge: licenseExpiry.daysRemaining <= 1 ? 'تنبيه حرج' : 'تجديد الترخيص',
          iconType: 'expiry',
          actionLabel: 'تجديد الترخيص الآن',
          onAction: onOpenLicenseModal,
          priority: 90,
          countdown: liveCountdown,
        });
      } else if (isTrial && licenseExpiry.daysRemaining > 1) {
        // Only show trial banner if days remaining > 1 and not in warning state
        list.push({
          id: 'license_trial',
          type: 'info',
          title: 'فترة تجريبية مجانية',
          message: `متبقي ${licenseExpiry.daysRemaining} أيام لتجربة كافة مميزات البرنامج كاملة بدون أي قيود.`,
          badge: 'نسخة تجريبية',
          iconType: 'license',
          actionLabel: 'تفعيل النسخة المشتراة',
          onAction: onOpenLicenseModal,
          priority: 40,
        });
      }
    }

    // 3. Low Stock Alert (Priority: 60)
    if (lowStockCount > 0 && !lowStockDismissed) {
      list.push({
        id: 'low_stock',
        type: 'critical',
        title: 'تنبيه حد الطلب والمخزون',
        message: `يوجد ${lowStockCount} صنف في المخزن وصلت إلى حد الطلب الأدنى أو نفدت تماماً.`,
        badge: 'نواقص المخزن',
        iconType: 'stock',
        actionLabel: 'معاينة النواقص',
        onAction: onOpenLowStockCatalog,
        dismissible: true,
        onDismiss: () => setLowStockDismissed(true),
        priority: 60,
      });
    }

    // 4. Backup Overdue Warning (Priority: 50)
    if (backupWarning) {
      list.push({
        id: 'backup_overdue',
        type: 'warning',
        title: 'تنبيه النسخ الاحتياطي',
        message: backupWarning,
        badge: 'أمان البيانات',
        iconType: 'backup',
        actionLabel: 'فتح شاشة النسخ',
        onAction: onOpenBackupSettings,
        dismissible: true,
        onDismiss: () => setBackupWarning(null),
        priority: 50,
      });
    }

    // 5. Demo Mode Active (Priority: 30)
    if (hasDemoData) {
      list.push({
        id: 'demo_data_active',
        type: 'warning',
        title: 'وضع التدريب والتجربة نشط',
        message: 'يحتوي النظام على بيانات نموذجية لتجربة الكاشير والميزات بأمان دون التأثير على الحسابات الفعلية.',
        badge: 'بيانات تجريبية',
        iconType: 'demo',
        actionLabel: 'إدارة ومسح البيانات',
        onAction: onOpenDemoManagement,
        priority: 30,
      });
    }

    // Sort by priority descending
    return list.sort((a, b) => b.priority - a.priority);
  }, [
    clockWarning,
    licenseExpiry,
    isLicenseReadOnlyMode,
    isLockScreenOpen,
    backupWarning,
    lowStockCount,
    lowStockDismissed,
    hasDemoData,
    liveCountdown,
    onOpenLicenseModal,
    onOpenLockScreen,
    onOpenBackupSettings,
    onOpenLowStockCatalog,
    onOpenDemoManagement,
    setClockWarning,
    setBackupWarning,
    setLowStockDismissed,
  ]);

  return items;
};
