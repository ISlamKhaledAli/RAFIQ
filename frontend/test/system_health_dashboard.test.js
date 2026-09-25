import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #138: System Health Indicator & Dashboard Alert Logic (Story 62)', async (t) => {
  // Pure evaluation function matching C# SystemHealthService logic and frontend IPC mock
  const evaluateSystemHealth = ({
    freeDiskBytes = 15 * 1024 * 1024 * 1024, // 15 GB
    dbExists = true,
    lastBackupAt = '2026-09-25 10:00',
    isBackupOverdue = false,
    printers = [{ name: 'XP-80C', isDefault: true }],
    defaultPrinterName = 'XP-80C',
    productsCount = 25,
  }) => {
    const alerts = [];
    const metrics = {
      appVersion: 'رفيق POS v1.0.0 (أوفلاين)',
      licenseStatus: 'ترخيص دائم نشط (مدى الحياة)',
      databaseStatus: dbExists ? 'سليمة (وضع WAL الفائق)' : 'غير منشأة',
      diskFreeBytes: freeDiskBytes,
      lastBackupFormatted: lastBackupAt || 'لم تؤخذ بعد',
      isBackupOverdue,
      productsCount,
      printerName: printers.length > 0 ? (defaultPrinterName || printers[0].name) : 'لا توجد طابعة',
      isPrinterReady: printers.length > 0,
    };

    // 1. Disk space check
    if (freeDiskBytes < 300 * 1024 * 1024) {
      alerts.push({
        id: 'disk_critical',
        level: 'critical',
        title: 'مساحة القرص منخفضة جداً',
        message: 'المساحة المتبقية على القرص أقل من 300 ميجابايت. قد يتوقف تسجيل الفواتير.',
        fixAction: 'تفريغ مساحة',
        fixTarget: 'settings:system',
      });
    } else if (freeDiskBytes < 1024 * 1024 * 1024) {
      alerts.push({
        id: 'disk_warning',
        level: 'warning',
        title: 'تنبيه مساحة القرص',
        message: 'المساحة المتبقية على القرص تقترب من النفاد. ينصح بتفريغ مساحة.',
        fixAction: 'فحص القرص',
        fixTarget: 'settings:system',
      });
    }

    // 2. Backup check
    if (!lastBackupAt) {
      alerts.push({
        id: 'backup_missing',
        level: 'warning',
        title: 'لم يتم أخذ نسخة احتياطية',
        message: 'لا توجد أي نسخة احتياطية مسجلة للنظام. احفظ نسخة على فلاشة USB لحماية بياناتك.',
        fixAction: 'أخذ نسخة احتياطية الآن',
        fixTarget: 'settings:backup',
      });
    } else if (isBackupOverdue) {
      alerts.push({
        id: 'backup_overdue',
        level: 'warning',
        title: 'النسخة الاحتياطية قديمة',
        message: 'تجاوزت المدة المحددة دون أخذ نسخة احتياطية حديثة.',
        fixAction: 'تحديث النسخة الاحتياطية',
        fixTarget: 'settings:backup',
      });
    }

    // 3. Printer check
    if (printers.length === 0) {
      alerts.push({
        id: 'printer_missing',
        level: 'info',
        title: 'طابعة الإيصالات غير متصلة',
        message: 'لم يتم العثور على طابعة فواتير مثبتة في ويندوز. يمكنك الاستمرار بالبيع بدون طباعة ورقية.',
        fixAction: 'ضبط الطابعة',
        fixTarget: 'settings:printer',
      });
    }

    // 4. Products check
    if (productsCount === 0) {
      alerts.push({
        id: 'products_empty',
        level: 'info',
        title: 'كتالوج الأصناف فارغ',
        message: 'لا توجد منتجات مسجلة في المحل حتى الآن. أضف بعض المنتجات أو حمّل البيانات التجريبية.',
        fixAction: 'إضافة أصناف',
        fixTarget: 'products',
      });
    }

    // Sort alerts by severity: critical > warning > info
    const severityOrder = { critical: 1, warning: 2, info: 3 };
    alerts.sort((a, b) => severityOrder[a.level] - severityOrder[b.level]);

    const hasCritical = alerts.some(a => a.level === 'critical');
    const hasWarning = alerts.some(a => a.level === 'warning');

    let overallStatus = 'HEALTHY';
    let healthScore = 100;
    let oneSentenceSummary = 'كل شيء تمام! النظام سليم، قاعدة البيانات محمية، والنظام جاهز للبيع.';
    let primaryIssueFixAction = null;
    let primaryIssueFixTarget = null;

    if (hasCritical) {
      overallStatus = 'CRITICAL';
      healthScore = 40;
      const crit = alerts.find(a => a.level === 'critical');
      oneSentenceSummary = `انتباه حرج: ${crit.message}`;
      primaryIssueFixAction = crit.fixAction;
      primaryIssueFixTarget = crit.fixTarget;
    } else if (hasWarning) {
      overallStatus = 'ATTENTION_NEEDED';
      healthScore = 75;
      const warn = alerts.find(a => a.level === 'warning');
      oneSentenceSummary = `يحتاج انتباهك: ${warn.message}`;
      primaryIssueFixAction = warn.fixAction;
      primaryIssueFixTarget = warn.fixTarget;
    }

    return {
      overallStatus,
      healthScore,
      oneSentenceSummary,
      primaryIssueFixAction,
      primaryIssueFixTarget,
      alerts,
      metrics,
    };
  };

  await t.test('1. Normal healthy state yields HEALTHY, 100 score, and positive headline', () => {
    const health = evaluateSystemHealth({});
    assert.strictEqual(health.overallStatus, 'HEALTHY');
    assert.strictEqual(health.healthScore, 100);
    assert.strictEqual(health.primaryIssueFixAction, null);
    assert.strictEqual(health.alerts.length, 0);
    assert.ok(health.oneSentenceSummary.includes('كل شيء تمام'));
    assert.strictEqual(health.metrics.databaseStatus, 'سليمة (وضع WAL الفائق)');
    assert.strictEqual(health.metrics.isPrinterReady, true);
  });

  await t.test('2. Missing or overdue backup (e.g. disconnected flash drive) triggers ATTENTION_NEEDED and does not block sales', () => {
    // Missing backup
    const missingBackup = evaluateSystemHealth({ lastBackupAt: null });
    assert.strictEqual(missingBackup.overallStatus, 'ATTENTION_NEEDED');
    assert.strictEqual(missingBackup.healthScore, 75);
    assert.strictEqual(missingBackup.primaryIssueFixTarget, 'settings:backup');
    assert.strictEqual(missingBackup.alerts[0].id, 'backup_missing');
    assert.strictEqual(missingBackup.alerts[0].level, 'warning');

    // Overdue backup
    const overdueBackup = evaluateSystemHealth({
      lastBackupAt: '2026-09-01 12:00',
      isBackupOverdue: true,
    });
    assert.strictEqual(overdueBackup.overallStatus, 'ATTENTION_NEEDED');
    assert.strictEqual(overdueBackup.primaryIssueFixAction, 'تحديث النسخة الاحتياطية');
    assert.strictEqual(overdueBackup.alerts[0].id, 'backup_overdue');
  });

  await t.test('3. Low disk space (< 300MB) triggers CRITICAL alert and warning message', () => {
    const lowDisk = evaluateSystemHealth({
      freeDiskBytes: 150 * 1024 * 1024, // 150 MB < 300MB
    });
    assert.strictEqual(lowDisk.overallStatus, 'CRITICAL');
    assert.strictEqual(lowDisk.healthScore, 40);
    assert.ok(lowDisk.oneSentenceSummary.includes('انتباه حرج'));
    assert.strictEqual(lowDisk.primaryIssueFixAction, 'تفريغ مساحة');
    assert.strictEqual(lowDisk.primaryIssueFixTarget, 'settings:system');
    assert.strictEqual(lowDisk.alerts[0].id, 'disk_critical');
  });

  await t.test('4. Missing printer yields INFO alert only and does not downgrade overall status to ATTENTION or CRITICAL if everything else is fine', () => {
    const noPrinter = evaluateSystemHealth({
      printers: [],
      defaultPrinterName: '',
    });
    // System should remain HEALTHY because cashier can continue selling even without thermal paper printer
    assert.strictEqual(noPrinter.overallStatus, 'HEALTHY');
    assert.strictEqual(noPrinter.healthScore, 100);
    assert.strictEqual(noPrinter.alerts.length, 1);
    assert.strictEqual(noPrinter.alerts[0].id, 'printer_missing');
    assert.strictEqual(noPrinter.alerts[0].level, 'info');
    assert.ok(noPrinter.alerts[0].message.includes('يمكنك الاستمرار بالبيع'));
  });

  await t.test('5. Alerts are uniquely identified, non-repeating, and strictly sorted by severity', () => {
    const multipleIssues = evaluateSystemHealth({
      freeDiskBytes: 200 * 1024 * 1024, // Critical
      lastBackupAt: null, // Warning
      printers: [], // Info
      productsCount: 0, // Info
    });

    assert.strictEqual(multipleIssues.overallStatus, 'CRITICAL');
    assert.strictEqual(multipleIssues.alerts.length, 4);

    // Verify ordering: critical first, then warning, then info
    assert.strictEqual(multipleIssues.alerts[0].level, 'critical');
    assert.strictEqual(multipleIssues.alerts[1].level, 'warning');
    assert.strictEqual(multipleIssues.alerts[2].level, 'info');
    assert.strictEqual(multipleIssues.alerts[3].level, 'info');

    // Verify IDs are unique
    const ids = multipleIssues.alerts.map(a => a.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size);
  });
});
