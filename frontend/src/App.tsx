import { useState, useEffect, useCallback, memo } from 'react';
import type { FC } from 'react';
import { 
  ShoppingCart, 
  Package, 
  FileText, 
  Settings, 
  Clock,
  WifiOff,
  LayoutDashboard,
  Users,
  ShieldAlert,
  ChevronDown,
  ChevronLeft,
  Tag,
  Boxes,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Minus,
  Store,
  HardDrive,
  Printer,
  Activity,
  Barcode,
  KeyRound,
  FlaskConical,
  Power,
  Truck,
  Receipt,
  Plus,
  Building2,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import { 
  NotificationBellButton, 
  NotificationCenterDrawer, 
  CompactAlertTickerBar 
} from './components/NotificationCenter';
import { useSystemNotifications } from './utils/useSystemNotifications';
import { invoke } from './bridge/ipc';
import { useDataSubscription, emitDataChanged } from './utils/eventBus';
import { PosView } from './views/PosView';
import { DashboardView } from './views/DashboardView';
import { RevenueAnalyticsView } from './views/analytics/RevenueAnalyticsView';
import { InventoryAnalyticsView } from './views/analytics/InventoryAnalyticsView';
import { CustomerAnalyticsView } from './views/analytics/CustomerAnalyticsView';
import type { DashboardSubTab } from './types/models';
import { CustomersView } from './views/CustomersView';
import { ProductsView } from './views/ProductsView';
import { PurchasesView } from './views/PurchasesView';
import type { PurchasesSubView } from './views/PurchasesView';
import { SalesHistoryView } from './views/SalesHistoryView';
import { AuditLogView } from './views/AuditLogView';
import { SettingsView } from './views/SettingsView';
import type { SettingsSubTab } from './views/SettingsView';
import { DatabaseRecoveryModal } from './components/DatabaseRecoveryModal';
import type { DatabaseIntegrityStatus } from './components/DatabaseRecoveryModal';
import { FirstRunWizardModal } from './components/FirstRunWizardModal';
import { GuidedTourModal } from './components/GuidedTourModal';
import { ReadinessCheckModal } from './components/ReadinessCheckModal';
import { RafiqDialogContainer } from './components/RafiqDialog';
import { rafiqConfirm, rafiqAlert } from './utils/dialogService';
import type { UserDto } from './bridge/ipc';
import { LoginModal } from './components/LoginModal';
import { UserManagerModal } from './components/UserManagerModal';
import { SupervisorPromptModal } from './components/SupervisorPromptModal';
import { LicenseExpiredLockScreen } from './components/LicenseExpiredLockScreen';
import type { LicenseExpiryDetails } from './components/LicenseExpiredLockScreen';
import { LicenseModal } from './components/LicenseModal';
import { HelpCenterModal } from './components/HelpCenterModal';
import { useFeatures } from './context/useFeatures';

export interface SystemInfo {
  appName: string;
  version: string;
  osVersion: string;
  isWebView2: boolean;
  dbStatus: string;
}

export type TabType = 'pos' | 'dashboard' | 'customers' | 'products' | 'purchases' | 'sales' | 'audit' | 'settings';




const HeaderClock: FC = memo(() => {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
      setDate(now.toLocaleDateString('ar-EG-u-nu-latn', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 bg-white border border-line px-2.5 py-1 rounded-lg tabular-nums text-xs font-semibold text-ink shadow-2xs shrink-0">
      <Clock className="w-3.5 h-3.5 text-ink-muted shrink-0" />
      <span className="text-ink-muted font-normal text-[11px] hidden xl:inline">{date}</span>
      <span className="text-line hidden xl:inline">|</span>
      <span className="font-mono text-paid font-bold tracking-wide text-xs">{time || '00:00:00'}</span>
    </div>
  );
});

const ADMIN_ONLY_TABS: TabType[] = ['dashboard', 'products', 'purchases', 'sales', 'audit', 'settings'];
const CASHIER_ALLOWED_TABS: TabType[] = ['pos', 'customers'];

export default function App() {
  const { isEnabled } = useFeatures();
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
  const isCashier = currentUser?.role === 'cashier';
  const effectiveActiveTab: TabType = isCashier && !CASHIER_ALLOWED_TABS.includes(activeTab) ? 'pos' : activeTab;

  const [productsSubView, setProductsSubView] = useState<'catalog' | 'movements' | 'batches'>('catalog');
  const [isProductsMenuExpanded, setIsProductsMenuExpanded] = useState(false);
  const [dashboardSubTab, setDashboardSubTab] = useState<DashboardSubTab>('today');
  const [isDashboardMenuExpanded, setIsDashboardMenuExpanded] = useState(false);
  const [purchasesSubView, setPurchasesSubView] = useState<PurchasesSubView>('new_invoice');
  const [isPurchasesMenuExpanded, setIsPurchasesMenuExpanded] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('profile');
  const [isSettingsMenuExpanded, setIsSettingsMenuExpanded] = useState(false);

  // Senior Architecture: Lazy Keep-Alive Tabs
  // Views are mounted on first visit, then retained in DOM and toggled via CSS
  // This achieves 0ms switching without re-triggering IPC calls or resetting component state/scroll
  const [visitedTabs, setVisitedTabs] = useState<Set<TabType>>(() => new Set<TabType>(['pos']));
  const [visitedDashboardSubTabs, setVisitedDashboardSubTabs] = useState<Set<DashboardSubTab>>(() => new Set<DashboardSubTab>(['today']));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(effectiveActiveTab)) return prev;
      const next = new Set(prev);
      next.add(effectiveActiveTab);
      return next;
    });
  }, [effectiveActiveTab]);

  useEffect(() => {
    if (effectiveActiveTab === 'dashboard') {
      setVisitedDashboardSubTabs((prev) => {
        if (prev.has(dashboardSubTab)) return prev;
        const next = new Set(prev);
        next.add(dashboardSubTab);
        return next;
      });
    }
  }, [effectiveActiveTab, dashboardSubTab]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rafiq_pos_sidebar_collapsed');
      if (saved !== null) return saved === 'true';
      return window.innerWidth <= 1100;
    } catch {
      return false;
    }
  });
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [clockWarning, setClockWarning] = useState<string | null>(null);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);
  const [corruptDbStatus, setCorruptDbStatus] = useState<DatabaseIntegrityStatus | null>(null);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [lowStockDismissed, setLowStockDismissed] = useState<boolean>(false);
  const [initialProductFilter, setInitialProductFilter] = useState<'all' | 'lowStock' | 'outOfStock'>('all');
  const [isFirstRunWizardOpen, setIsFirstRunWizardOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rafiq_first_run_completed') !== 'true';
    }
    return false;
  });
  const [hasDemoData, setHasDemoData] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [storeName, setStoreName] = useState('رفيق POS');
  const [cashierName, setCashierName] = useState('كاشير (1)');
  const [logoVariant, setLogoVariant] = useState<'classic' | 'modern'>(() => {
    try {
      const saved = localStorage.getItem('rafiq_logo_variant');
      return saved === 'modern' ? 'modern' : 'classic';
    } catch {
      return 'classic';
    }
  });

  useEffect(() => {
    const handleVariantChange = () => {
      try {
        const saved = localStorage.getItem('rafiq_logo_variant');
        if (saved === 'modern' || saved === 'classic') {
          setLogoVariant(saved);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('rafiq_logo_variant_changed', handleVariantChange);
    window.addEventListener('storage', handleVariantChange);
    return () => {
      window.removeEventListener('rafiq_logo_variant_changed', handleVariantChange);
      window.removeEventListener('storage', handleVariantChange);
    };
  }, []);

  const toggleLogoVariant = useCallback(() => {
    setLogoVariant((prev) => {
      const next = prev === 'classic' ? 'modern' : 'classic';
      try {
        localStorage.setItem('rafiq_logo_variant', next);
        window.dispatchEvent(new Event('rafiq_logo_variant_changed'));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserManagerOpen, setIsUserManagerOpen] = useState(false);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(15);
  const [supervisorPrompt, setSupervisorPrompt] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    onApproved: () => void;
  }>({
    isOpen: false,
    title: '',
    onApproved: () => {},
  });

  // Feature #171 & #172: Real-time License Expiry & Lock Screen Enforcement
  const [licenseExpiry, setLicenseExpiry] = useState<LicenseExpiryDetails | null>(null);

  // Feature #147: Offline Help Center & Support (Story 102)
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [helpCenterSection, setHelpCenterSection] = useState<string>('pos');

  const openHelpCenterModal = useCallback((sec?: string) => {
    setHelpCenterSection(sec || effectiveActiveTab);
    setIsHelpCenterOpen(true);
  }, [effectiveActiveTab]);

  useEffect(() => {
    const handleHelpEvent = (e: any) => {
      const sec = e.detail?.section || effectiveActiveTab;
      openHelpCenterModal(sec);
    };
    window.addEventListener('rafiq:open-help', handleHelpEvent);
    return () => window.removeEventListener('rafiq:open-help', handleHelpEvent);
  }, [openHelpCenterModal, effectiveActiveTab]);

  useEffect(() => {
    const handleGlobalF1 = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        openHelpCenterModal(effectiveActiveTab);
      }
    };
    window.addEventListener('keydown', handleGlobalF1);
    return () => window.removeEventListener('keydown', handleGlobalF1);
  }, [openHelpCenterModal, effectiveActiveTab]);
  const [isLockScreenOpen, setIsLockScreenOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isLicenseReadOnlyMode, setIsLicenseReadOnlyMode] = useState(false);

  // Feature #176: Unified Notification & Alert System State
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isAlertTickerDismissed, setIsAlertTickerDismissed] = useState(false);

  const systemNotifications = useSystemNotifications({
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
    onOpenLicenseModal: () => setIsLicenseModalOpen(true),
    onOpenLockScreen: () => setIsLockScreenOpen(true),
    onOpenBackupSettings: () => {
      setActiveTab('settings');
      setSettingsSubTab('backup');
      setIsSettingsMenuExpanded(true);
    },
    onOpenLowStockCatalog: () => {
      setActiveTab('products');
      setProductsSubView('catalog');
      setInitialProductFilter('lowStock');
      setIsProductsMenuExpanded(true);
    },
    onOpenDemoManagement: () => {
      setActiveTab('settings');
      setSettingsSubTab('demo');
      setIsSettingsMenuExpanded(true);
    },
  });

  const refreshLicenseStatus = useCallback(async () => {
    try {
      const res = await invoke<LicenseExpiryDetails>('license:checkExpiry');
      if (res) {
        setLicenseExpiry(res);
        const shouldLock = !res.isActive || res.isExpired || res.clockTampered || res.status === 'expired' || res.status === 'disabled';
        if (shouldLock) {
          if (!isLicenseReadOnlyMode) {
            setIsLockScreenOpen(true);
          }
        } else {
          setIsLockScreenOpen(false);
          setIsLicenseReadOnlyMode(false);
        }
      }
    } catch {
      // ignore in dev
    }
  }, [isLicenseReadOnlyMode]);

  // Periodic License Check every 30s & on initial load (Feature #171 / Task 171-3 & Task 172-2, 172-4)
  useEffect(() => {
    let isMounted = true;
    const runCheck = async () => {
      try {
        const res = await invoke<LicenseExpiryDetails>('license:checkExpiry');
        if (res && isMounted) {
          setLicenseExpiry(res);
          const shouldLock = !res.isActive || res.isExpired || res.clockTampered || res.status === 'expired' || res.status === 'disabled';
          if (shouldLock) {
            if (!isLicenseReadOnlyMode) {
              setIsLockScreenOpen(true);
            }
          } else {
            setIsLockScreenOpen(false);
            setIsLicenseReadOnlyMode(false);
          }
        }
      } catch {
        // ignore in dev
      }
    };

    void runCheck();
    const timer = setInterval(() => {
      void runCheck();
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isLicenseReadOnlyMode]);

  // Track user idle timeout to lock session automatically (Task 166-6)
  useEffect(() => {
    if (idleTimeoutMinutes <= 0) return;

    let timeoutId: any;
    const resetIdleTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsLoginModalOpen(true);
      }, idleTimeoutMinutes * 60 * 1000);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [idleTimeoutMinutes]);

  const handleToggleFullscreen = async () => {
    try {
      const res = await invoke<{ isFullscreen: boolean }>('window:toggleFullscreen');
      if (res && typeof res.isFullscreen === 'boolean') {
        setIsFullscreen(res.isFullscreen);
        return;
      }
    } catch {
      // web preview fallback
    }

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

  const handleMinimizeWindow = async () => {
    try {
      await invoke('window:minimize');
    } catch {
      // web preview fallback
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadInfo = async () => {
      try {
        const info = await invoke<SystemInfo>('system:getInfo');
        if (isMounted) {
          setSysInfo(info);
        }
      } catch {
        // Fallback for dev mode
      }
    };
    void loadInfo();

    const checkClock = async () => {
      try {
        const res: any = await invoke('system:checkClock');
        if (res && res.isValid === false && isMounted) {
          setClockWarning(res.message);
        }
      } catch {
        // Ignore in dev
      }
    };
    void checkClock();

    const checkFullscreen = async () => {
      try {
        const res = await invoke<{ isFullscreen: boolean }>('window:isFullscreen');
        if (res && typeof res.isFullscreen === 'boolean' && isMounted) {
          setIsFullscreen(res.isFullscreen);
        }
      } catch {
        // web fallback
      }
    };
    void checkFullscreen();

    const checkBackup = async () => {
      try {
        const res: any = await invoke('backup:getStatus');
        if (res && res.isOverdue && isMounted) {
          setBackupWarning(res.overdueWarning || 'تنبيه أمان البيانات: لم يتم أخذ نسخة احتياطية حديثة!');
        }
      } catch {
        // Ignore in dev
      }
    };
    void checkBackup();

    const checkIntegrity = async () => {
      try {
        const res = await invoke<DatabaseIntegrityStatus>('database:checkIntegrity');
        if (res && res.isCorrupt && isMounted) {
          setCorruptDbStatus(res);
        }
      } catch {
        // Ignore in dev
      }
    };
    void checkIntegrity();

    const checkFirstRun = async () => {
      try {
        const res: any = await invoke('templates:isFirstRunNeeded');
        if (isMounted) {
          if (res && res.isNeeded) {
            setIsFirstRunWizardOpen(true);
          } else {
            setIsFirstRunWizardOpen(false);
            if (typeof window !== 'undefined') {
              localStorage.setItem('rafiq_first_run_completed', 'true');
            }
          }
        }
      } catch {
        // Ignore in dev
      }
    };
    void checkFirstRun();

    const checkDemo = async () => {
      try {
        const res: any = await invoke('demo:getStatus');
        if (res && res.hasDemoData && isMounted) {
          setHasDemoData(true);
        }
      } catch {
        // Ignore in dev
      }
    };
    void checkDemo();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  const refreshSettings = useCallback(async () => {
    try {
      const s: any = await invoke('settings:getAll');
      if (s) {
        if (s.store_name) setStoreName(s.store_name);
        if (s.cashier_name) setCashierName((prev) => prev || s.cashier_name);
        if (s.logo_variant === 'modern' || s.logo_variant === 'classic') {
          setLogoVariant(s.logo_variant);
          try {
            localStorage.setItem('rafiq_logo_variant', s.logo_variant);
          } catch {
            // ignore
          }
        }
      }
      const u: UserDto = await invoke('auth:getCurrentUser');
      if (u) {
        setCurrentUser(u);
        setCashierName(u.displayName);
      }
      const sec: any = await invoke('security:getStatus');
      if (sec && typeof sec.idleTimeoutMinutes === 'number') {
        setIdleTimeoutMinutes(sec.idleTimeoutMinutes);
      }
    } catch {
      // Ignore in dev
    }
  }, []);

  const refreshLowStock = useCallback(async () => {
    try {
      const res: any = await invoke('products:getLowStockCount');
      if (res && typeof res.count === 'number') {
        setLowStockCount(res.count);
      }
    } catch {
      // Ignore in dev
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    void refreshLowStock();
  }, [refreshSettings, refreshLowStock]);

  useDataSubscription(['settings', 'all'], refreshSettings);
  useDataSubscription(['products', 'all'], refreshLowStock);


  // Global keyboard shortcuts for switching tabs and system actions
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Alt + Number shortcuts for main system navigation (avoids any collision with POS cashier F-keys)
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('pos');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('customers');
        } else if (currentUser?.role !== 'cashier') {
          if (e.key === '2') {
            e.preventDefault();
            setActiveTab('dashboard');
          } else if (e.key === '4') {
            e.preventDefault();
            setActiveTab('products');
            setIsProductsMenuExpanded(true);
          } else if (e.key === '5') {
            e.preventDefault();
            setActiveTab('purchases');
          } else if (e.key === '6') {
            e.preventDefault();
            setActiveTab('sales');
          } else if (e.key === '7') {
            e.preventDefault();
            setActiveTab('audit');
          } else if (e.key === '8') {
            e.preventDefault();
            setActiveTab('settings');
            setIsSettingsMenuExpanded(true);
          }
        }
        return;
      }

      // 2. F11 for Fullscreen Toggle (always global)
      if (e.key === 'F11') {
        e.preventDefault();
        void handleToggleFullscreen();
        return;
      }

      // 3. If NOT on POS view, pressing F1 returns to POS view
      if (e.key === 'F1' && activeTab !== 'pos') {
        e.preventDefault();
        setActiveTab('pos');
        return;
      }

      // 4. F5 or Ctrl+R for instant live soft data refresh across all views
      if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        emitDataChanged('all');
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTab, currentUser?.role]);

  const handleExitApp = async () => {
    const confirmed = await rafiqConfirm({
      title: 'إغلاق البرنامج والخروج',
      message: 'هل تريد حقاً إغلاق نظام رفيق والخروج؟\nسيتم حفظ وتأمين كافة بيانات العمليات والنسخ الاحتياطي تلقائياً.',
      confirmText: 'نعم، إغلاق البرنامج',
      cancelText: 'إلغاء واستمرار العمل',
      variant: 'danger',
    });
    if (confirmed) {
      try {
        await invoke('window:close');
      } catch {
        window.close();
      }
    }
  };

  const handleNavClick = (tabId: TabType, subAction?: () => void) => {
    // Feature #172 / Task 172-5: Block POS sales screen in read-only mode
    if (isLicenseReadOnlyMode && tabId === 'pos') {
      void rafiqAlert({
        title: 'شاشة البيع معطلة',
        message: 'انتهت فترة اشتراك البرنامج أو تم رصد تراجع في ساعة النظام. البرنامج يعمل حالياً في وضع القراءة والنسخ الاحتياطي فقط. يرجى تجديد الترخيص لاستئناف عمليات البيع.',
        variant: 'warning',
      });
      return;
    }
    if (currentUser?.role === 'cashier' && ADMIN_ONLY_TABS.includes(tabId)) {
      setActiveTab('pos');
      return;
    }
    setActiveTab(tabId);
    if (subAction) subAction();
  };

  const dashboardTreeItems = [
    { id: 'today' as DashboardSubTab, label: 'لوحة اليوم والتشغيل', icon: LayoutDashboard },
    { id: 'revenue' as DashboardSubTab, label: 'تحليل الإيرادات والأرباح', icon: TrendingUp },
    { id: 'inventory' as DashboardSubTab, label: 'حركة المخزون والفاقد', icon: Boxes },
    { id: 'customers' as DashboardSubTab, label: 'العملاء والآجل والديون', icon: Users },
  ];

  const settingsTreeItems = [
    { id: 'profile' as SettingsSubTab, label: 'بيانات المتجر والفاتورة', icon: Store },
    { id: 'backup' as SettingsSubTab, label: 'النسخ الاحتياطي وحماية البيانات', icon: HardDrive },
    { id: 'printer' as SettingsSubTab, label: 'إعدادات الطابعة والورق', icon: Printer },
    { id: 'system' as SettingsSubTab, label: 'مفاتيح الميزات وفحص النظام', icon: Activity },
    { id: 'scanner' as SettingsSubTab, label: 'قارئ الباركود والماسح', icon: Barcode },
    { id: 'security' as SettingsSubTab, label: 'الرقم السري وأمان الشاشات', icon: KeyRound },
    { id: 'demo' as SettingsSubTab, label: 'البيانات التجريبية والتدريب', icon: FlaskConical },
  ];

  const allNavItems = [
    { id: 'pos' as TabType, label: 'نقطة البيع', icon: ShoppingCart, shortcut: 'F1 / Alt+1' },
    { id: 'dashboard' as TabType, label: 'لوحة اليوم والمتابعة', icon: LayoutDashboard, shortcut: 'Alt+2' },
    { id: 'customers' as TabType, label: 'العملاء والآجل', icon: Users, shortcut: 'Alt+3' },
    { id: 'products' as TabType, label: 'السلع والمخزن', icon: Package, shortcut: 'Alt+4' },
    { id: 'purchases' as TabType, label: 'المشتريات والموردين', icon: Truck, shortcut: 'Alt+5' },
    { id: 'sales' as TabType, label: 'سجل الفواتير', icon: FileText, shortcut: 'Alt+6' },
    { id: 'audit' as TabType, label: 'سجل العمليات الحساسة', icon: ShieldAlert, shortcut: 'Alt+7' },
    { id: 'settings' as TabType, label: 'إعدادات المتجر والصيانة', icon: Settings, shortcut: 'Alt+8' },
  ];

  const navItems = currentUser?.role === 'cashier'
    ? allNavItems.filter((item) => CASHIER_ALLOWED_TABS.includes(item.id))
    : allNavItems;

  if (isFirstRunWizardOpen) {
    return (
      <div className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden select-none bg-canvas" dir="rtl">
        <FirstRunWizardModal
          isOpen={true}
          isFirstRun={true}
          onClose={() => setIsFirstRunWizardOpen(false)}
          onCompleted={() => {
            setIsFirstRunWizardOpen(false);
            setActiveTab('pos');
            window.location.reload();
          }}
        />
        <RafiqDialogContainer />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas text-ink select-none overflow-hidden">
      {/* 1. TOP BAR (52px professional high, hairline-b, Spans across top) */}
      <header className="h-[52px] w-full bg-surface hairline-b flex items-center justify-between px-3 sm:px-4 shrink-0 z-20 shadow-2xs">
        {/* Right Side: Store Title & Status Badges */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={toggleLogoVariant}
            title={logoVariant === 'classic' 
              ? 'الشعار الكلاسيكي عالي التباين (مفعّل) — انقر للتبديل للشعار المودرن الفاتح' 
              : 'الشعار المودرن الفاتح (مفعّل) — انقر للتبديل للشعار الكلاسيكي عالي التباين'}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-[#DCE1DC] hover:border-paid/60 flex items-center justify-center p-1 shadow-2xs shrink-0 cursor-pointer transition-all hover:scale-105 active:scale-95 group relative"
          >
            <img 
              src={logoVariant === 'classic' ? '/logo_classic.png' : '/logo_modern.png'} 
              alt="شعار رفيق" 
              className="w-full h-full object-contain" 
            />
            <span className="absolute -bottom-1 -left-1 px-1 py-0.2 rounded text-[7.5px] font-bold bg-[#004D3F] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-2xs whitespace-nowrap">
              {logoVariant === 'classic' ? 'كلاسيك' : 'مودرن'}
            </span>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-ink leading-tight m-0 truncate">{storeName || 'رفيق POS'}</h1>
            <p className="text-[10px] sm:text-[11px] font-medium text-ink-muted m-0 truncate">نظام نقاط البيع وإدارة المتاجر والمحلات</p>
          </div>
        </div>

        {/* Left Side: Offline status, Cashier Badge, Action Buttons, Date, Time */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
          {/* Offline Status Pill */}
          <div className="flex items-center gap-1.5 bg-paid-soft border border-paid-border px-2 py-1 rounded-lg text-paid font-bold text-[11px] select-none shadow-2xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-paid animate-pulse"></span>
            <span className="hidden sm:inline">أوفلاين • محلي</span>
            <span className="sm:hidden">أوفلاين</span>
            <WifiOff className="w-3.5 h-3.5 text-paid opacity-85 mr-0.5 shrink-0" />
          </div>

          {/* Cashier / Employee Identity Badge */}
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-1.5 bg-surface hover:bg-surface-2 border border-line hover:border-paid/50 px-2 py-1 rounded-lg text-ink text-xs font-medium shadow-2xs transition-all cursor-pointer group active:scale-[0.98] shrink-0"
            title="انقر لتبديل الموظف أو قفل الشاشة"
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
              currentUser?.role === 'admin' ? 'bg-warn text-white shadow-2xs' : 'bg-paid text-white shadow-2xs'
            }`}>
              {currentUser?.displayName ? currentUser.displayName.slice(0, 1) : 'ك'}
            </div>
            <span className="font-bold text-ink text-xs max-w-[90px] sm:max-w-[120px] truncate">{currentUser?.displayName || cashierName || 'كاشير (1)'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
              currentUser?.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
            }`}>
              {currentUser?.role === 'admin' ? 'مدير' : 'كاشير'}
            </span>
            <KeyRound className="w-3 h-3 text-ink-muted group-hover:text-paid transition-colors shrink-0" />
          </button>

          {/* Manage Users Button for Admin (Task 166-4) */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setIsUserManagerOpen(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface hover:bg-amber-50/70 border border-amber-200 hover:border-amber-300 text-amber-900 font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0"
              title="إدارة حسابات الموظفين والصلاحيات"
            >
              <Users className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="hidden xl:inline">الموظفون</span>
            </button>
          )}

          {/* Readiness Checklist Button (Feature #137) - Admin Only */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setIsReadinessOpen(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface hover:bg-paid-soft border border-paid-border hover:border-paid text-paid font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0"
              title="فحص جاهزية النظام والعتاد قبل أول بيع"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-paid shrink-0" />
              <span className="hidden xl:inline">جاهزية التشغيل</span>
            </button>
          )}

          {/* Minimize Window Button */}
          <button
            type="button"
            onClick={handleMinimizeWindow}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface hover:bg-surface-2 border border-line hover:border-ink-muted text-ink font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0"
            title="تصغير التطبيق إلى شريط المهام"
          >
            <Minus className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span className="hidden lg:inline">تصغير</span>
          </button>

          {/* Fullscreen Kiosk Mode Toggle */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface hover:bg-surface-2 border border-line hover:border-ink-muted text-ink font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0"
            title={isFullscreen ? 'الخروج من ملء الشاشة (F11)' : 'ملء الشاشة بالكامل وإخفاء شريط ويندوز (F11)'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                <span className="hidden lg:inline">نافذة</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-paid shrink-0" />
                <span className="hidden lg:inline">ملء الشاشة</span>
              </>
            )}
            <kbd className="hidden 2xl:inline-flex items-center justify-center px-1 py-0.2 rounded bg-surface-2 border border-line text-ink-muted font-mono text-[9px] font-bold">
              F11
            </kbd>
          </button>

          {/* Notification Bell Button with live Badge */}
          <NotificationBellButton
            count={systemNotifications.length}
            hasCritical={systemNotifications.some((n) => n.type === 'critical')}
            isOpen={isNotificationDrawerOpen}
            onClick={() => setIsNotificationDrawerOpen((prev) => !prev)}
          />

          {/* Date & Time */}
          <HeaderClock />
        </div>
      </header>

      {/* Feature #176: Unified Compact Alert Ticker Bar (Single-line, Height ~34px) */}
      <CompactAlertTickerBar
        notifications={systemNotifications}
        onOpenDrawer={() => setIsNotificationDrawerOpen(true)}
        isDismissed={isAlertTickerDismissed}
        onDismissTicker={() => setIsAlertTickerDismissed(true)}
      />

      {/* Feature #176: Notification Center Popover / Drawer */}
      <NotificationCenterDrawer
        notifications={systemNotifications}
        isDrawerOpen={isNotificationDrawerOpen}
        onToggleDrawer={() => setIsNotificationDrawerOpen((prev) => !prev)}
        onCloseDrawer={() => setIsNotificationDrawerOpen(false)}
      />

      {/* 2. MAIN APP SHELL (Sidebar Navigation + Dynamic Content Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar (RTL Right side, Responsive Collapsible: 64px collapsed / 215px expanded) */}
        <aside 
          className={`${
            isSidebarCollapsed ? 'w-[64px] px-1.5 py-2.5 items-center' : 'w-[215px] p-2.5'
          } bg-surface hairline-l flex flex-col shrink-0 select-none transition-all duration-150 h-full min-h-0 overflow-hidden shadow-2xs`}
        >
          {/* Top Header of Sidebar: Title + Toggle Icon Button */}
          <div className={`w-full flex items-center mb-1.5 pb-1.5 border-b border-line shrink-0 ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}>
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                القوائم الرئيسية
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setIsSidebarCollapsed((prev) => {
                  const next = !prev;
                  try {
                    localStorage.setItem('rafiq_pos_sidebar_collapsed', String(next));
                  } catch {
                    // ignore
                  }
                  return next;
                });
              }}
              title={isSidebarCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-brand-dark hover:bg-brand-soft transition-colors cursor-pointer"
            >
              {isSidebarCollapsed ? (
                <PanelRightOpen className="w-4 h-4 text-brand-dark" />
              ) : (
                <PanelRightClose className="w-4 h-4 text-ink-muted hover:text-brand-dark" />
              )}
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1 w-full overflow-y-auto overflow-x-hidden min-h-0 py-0.5">

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = effectiveActiveTab === item.id;
              const isDashboardItem = item.id === 'dashboard';
              const isProductsItem = item.id === 'products';
              const isPurchasesItem = item.id === 'purchases';
              const isSettingsItem = item.id === 'settings';

              if (isSidebarCollapsed) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      handleNavClick(item.id, () => {
                        if (isDashboardItem) setDashboardSubTab('today');
                        if (isProductsItem) setProductsSubView('catalog');
                        if (isPurchasesItem) setPurchasesSubView('invoices');
                        if (isSettingsItem) setSettingsSubTab('profile');
                      });
                    }}
                    title={item.label}
                    className={`relative w-full h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 group cursor-pointer ${
                      isActive
                        ? 'bg-brand-dark text-white shadow-xs'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-ink-muted group-hover:text-ink'}`} />
                    {isProductsItem && lowStockCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center animate-pulse border-2 border-surface shadow-2xs">
                        {lowStockCount > 9 ? '+9' : lowStockCount}
                      </span>
                    )}
                    <span className="sr-only">{item.label}</span>
                  </button>
                );
              }

              return (
                <div key={item.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      if (isDashboardItem) {
                        if (effectiveActiveTab !== 'dashboard') {
                          handleNavClick('dashboard', () => setIsDashboardMenuExpanded(true));
                        } else {
                          setIsDashboardMenuExpanded(!isDashboardMenuExpanded);
                        }
                      } else if (isProductsItem) {
                        if (effectiveActiveTab !== 'products') {
                          handleNavClick('products', () => setIsProductsMenuExpanded(true));
                        } else {
                          setIsProductsMenuExpanded(!isProductsMenuExpanded);
                        }
                      } else if (isPurchasesItem) {
                        if (effectiveActiveTab !== 'purchases') {
                          handleNavClick('purchases', () => setIsPurchasesMenuExpanded(true));
                        } else {
                          setIsPurchasesMenuExpanded(!isPurchasesMenuExpanded);
                        }
                      } else if (isSettingsItem) {
                        if (effectiveActiveTab !== 'settings') {
                          handleNavClick('settings', () => setIsSettingsMenuExpanded(true));
                        } else {
                          setIsSettingsMenuExpanded(!isSettingsMenuExpanded);
                        }
                      } else {
                        handleNavClick(item.id);
                      }
                    }}
                    className={`w-full relative flex items-center justify-between px-2.5 h-[40px] rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-brand-dark text-white font-bold shadow-xs'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-ink-muted'}`} />
                      <span className="truncate">{item.label}</span>
                      {isProductsItem && lowStockCount > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5 shrink-0 ${
                          isActive ? 'bg-danger text-white' : 'bg-danger-soft text-danger border border-danger-border'
                        }`}>
                          {lowStockCount}
                        </span>
                      )}
                    </div>

                    {(isDashboardItem || isProductsItem || isPurchasesItem || isSettingsItem) && (
                      <span className={`shrink-0 ${isActive ? 'text-white/80' : 'text-[#52605d]'}`}>
                        {(isDashboardItem ? isDashboardMenuExpanded : isProductsItem ? isProductsMenuExpanded : isPurchasesItem ? isPurchasesMenuExpanded : isSettingsMenuExpanded) ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronLeft className="w-3.5 h-3.5" />
                        )}
                      </span>
                    )}
                  </button>

                  {/* Sub-tree for Dashboard & Executive Analytics */}
                  {isDashboardItem && isDashboardMenuExpanded && (
                    <div className="mr-3 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-[#00372d]/25 animate-in slide-in-from-top-1 duration-150">
                      {dashboardTreeItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = effectiveActiveTab === 'dashboard' && dashboardSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            title={sub.label}
                            onClick={() => {
                              setActiveTab('dashboard');
                              setDashboardSubTab(sub.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                              isSubActive
                                ? 'bg-[#006d41] text-white font-bold shadow-2xs'
                                : 'text-[#52605d] hover:bg-[#f1f5f4] hover:text-[#0f172a] font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-[#52605d]'}`} />
                              <span className="truncate">{sub.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-tree for Products & Inventory */}
                  {isProductsItem && isProductsMenuExpanded && (
                    <div className="mr-3 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 animate-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('products');
                          setProductsSubView('catalog');
                          setInitialProductFilter('all');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'products' && productsSubView === 'catalog'
                            ? 'bg-paid text-white font-bold shadow-2xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                        }`}
                        title="كتالوج الأصناف"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">كتالوج الأصناف</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('products');
                          setProductsSubView('movements');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'products' && productsSubView === 'movements'
                            ? 'bg-paid text-white font-bold shadow-2xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                        }`}
                        title="حركات وجرد المخزون"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Boxes className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">حركات وجرد المخزون</span>
                        </div>
                      </button>

                      {isEnabled('feature_expiry_dates') && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('products');
                            setProductsSubView('batches');
                          }}
                          className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                            effectiveActiveTab === 'products' && productsSubView === 'batches'
                              ? 'bg-paid text-white font-bold shadow-2xs'
                              : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                          }`}
                          title="تواريخ الصلاحية والدفعات"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate whitespace-nowrap">تواريخ الصلاحية والدفعات</span>
                          </div>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Sub-tree for Purchases & Suppliers */}
                  {isPurchasesItem && isPurchasesMenuExpanded && (
                    <div className="mr-3 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 animate-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('purchases');
                          setPurchasesSubView('new_invoice');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'purchases' && purchasesSubView === 'new_invoice'
                            ? 'bg-paid text-white font-bold shadow-2xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                        }`}
                        title="فاتورة شراء جديدة"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">فاتورة شراء جديدة</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('purchases');
                          setPurchasesSubView('invoices');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'purchases' && purchasesSubView === 'invoices'
                            ? 'bg-paid text-white font-bold shadow-2xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                        }`}
                        title="فواتير المشتريات"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Receipt className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">فواتير المشتريات</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('purchases');
                          setPurchasesSubView('suppliers');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'purchases' && purchasesSubView === 'suppliers'
                            ? 'bg-paid text-white font-bold shadow-2xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                        }`}
                        title="دليل الموردين"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">دليل الموردين</span>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Sub-tree for Settings */}
                  {isSettingsItem && isSettingsMenuExpanded && (
                    <div className="mr-3 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 animate-in slide-in-from-top-1 duration-150">
                      {settingsTreeItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = activeTab === 'settings' && settingsSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            title={sub.label}
                            onClick={() => {
                              setActiveTab('settings');
                              setSettingsSubTab(sub.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                              isSubActive
                                ? 'bg-paid text-white font-bold shadow-2xs'
                                : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-ink-muted'}`} />
                              <span className="truncate whitespace-nowrap">{sub.label}</span>
                            </div>
                            {sub.id === 'demo' && hasDemoData && (
                              <span className="w-2 h-2 rounded-full bg-warn animate-pulse shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Help Center & Support Button (Feature #147) */}
          <div className="pt-2 mt-auto border-t border-line shrink-0 w-full flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => openHelpCenterModal(effectiveActiveTab)}
              title="مركز المساعدة والشروحات والدعم الفني (F1)"
              className={`w-full rounded-xl transition-all duration-150 flex items-center gap-2 font-bold cursor-pointer ${
                isSidebarCollapsed
                  ? 'h-[40px] justify-center text-paid hover:bg-paid-soft border border-transparent hover:border-paid/30'
                  : 'px-2.5 py-1.5 text-xs text-paid hover:text-brand-dark bg-paid-soft hover:bg-paid-soft/80 border border-paid-border shadow-2xs'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-paid shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate">مركز المساعدة والدعم</span>
                  <span className="font-mono text-[10px] text-paid bg-surface px-1.5 py-0.2 rounded border border-paid-border">
                    F1
                  </span>
                </div>
              )}
            </button>

            {/* Bottom Exit App Button */}
            <button
              type="button"
              onClick={() => void handleExitApp()}
              title="إغلاق البرنامج والخروج بأمان"
              className={`w-full rounded-xl transition-all duration-150 flex items-center gap-2 font-bold cursor-pointer ${
                isSidebarCollapsed
                  ? 'h-[40px] justify-center text-danger hover:bg-danger-soft border border-transparent hover:border-danger/30'
                  : 'px-2.5 py-1.5 text-xs text-danger hover:text-danger-ink bg-danger-soft hover:bg-danger-soft/80 border border-danger-border shadow-2xs'
              }`}
            >
              <Power className="w-4 h-4 text-danger shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate">إغلاق البرنامج</span>
                  <span className="font-mono text-[10px] text-danger bg-surface px-1.5 py-0.2 rounded border border-danger-border">خروج</span>
                </div>
              )}
            </button>
          </div>
        </aside>

        {/* Dynamic Views Viewport - Lazy Keep-Alive Architecture */}
        <main className="flex-1 h-full overflow-hidden bg-canvas relative">
          {/* POS View is always mounted, kept alive, and instant */}
          <div className={`h-full w-full ${effectiveActiveTab === 'pos' ? '' : 'hidden'}`}>
            <PosView isActive={effectiveActiveTab === 'pos'} />
          </div>

          {!isCashier && visitedTabs.has('dashboard') && (
            <div className={`h-full w-full overflow-hidden ${effectiveActiveTab === 'dashboard' ? '' : 'hidden'}`}>
              {visitedDashboardSubTabs.has('today') && (
                <div className={`h-full w-full ${dashboardSubTab === 'today' ? '' : 'hidden'}`}>
                  <DashboardView 
                    onNavigateToPos={() => setActiveTab('pos')} 
                    onNavigateToProducts={(sub?: 'catalog' | 'movements' | 'batches', filter?: 'all' | 'lowStock' | 'outOfStock') => {
                      setActiveTab('products');
                      setProductsSubView(sub || 'catalog');
                      if (filter) setInitialProductFilter(filter);
                      setIsProductsMenuExpanded(true);
                    }} 
                    onNavigateToCustomers={() => setActiveTab('customers')}
                    onNavigateToSales={() => setActiveTab('sales')}
                    onNavigateToAudit={() => setActiveTab('audit')}
                    onNavigateToSettings={(target) => {
                      setActiveTab('settings');
                      if (target?.includes('backup')) setSettingsSubTab('backup');
                    }}
                    onNavigateSubTab={(sub) => setDashboardSubTab(sub)}
                  />
                </div>
              )}
              {visitedDashboardSubTabs.has('revenue') && (
                <div className={`h-full w-full ${dashboardSubTab === 'revenue' ? '' : 'hidden'}`}>
                  <RevenueAnalyticsView />
                </div>
              )}
              {visitedDashboardSubTabs.has('inventory') && (
                <div className={`h-full w-full ${dashboardSubTab === 'inventory' ? '' : 'hidden'}`}>
                  <InventoryAnalyticsView />
                </div>
              )}
              {visitedDashboardSubTabs.has('customers') && (
                <div className={`h-full w-full ${dashboardSubTab === 'customers' ? '' : 'hidden'}`}>
                  <CustomerAnalyticsView onNavigateToCustomers={() => setActiveTab('customers')} />
                </div>
              )}
            </div>
          )}

          {visitedTabs.has('customers') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'customers' ? '' : 'hidden'}`}>
              <CustomersView />
            </div>
          )}

          {!isCashier && visitedTabs.has('products') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'products' ? '' : 'hidden'}`}>
              <ProductsView 
                isActive={effectiveActiveTab === 'products'}
                subView={productsSubView} 
                onSubViewChange={(tab) => setProductsSubView(tab)} 
                initialFilter={initialProductFilter}
                onResetFilter={() => setInitialProductFilter('all')}
              />
            </div>
          )}

          {!isCashier && visitedTabs.has('purchases') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'purchases' ? '' : 'hidden'}`}>
              <PurchasesView 
                subView={purchasesSubView} 
                onSubViewChange={(tab) => setPurchasesSubView(tab)} 
              />
            </div>
          )}

          {!isCashier && visitedTabs.has('sales') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'sales' ? '' : 'hidden'}`}>
              <SalesHistoryView isActive={effectiveActiveTab === 'sales'} />
            </div>
          )}

          {!isCashier && visitedTabs.has('audit') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'audit' ? '' : 'hidden'}`}>
              <AuditLogView />
            </div>
          )}

          {!isCashier && visitedTabs.has('settings') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'settings' ? '' : 'hidden'}`}>
              <SettingsView 
                sysInfo={sysInfo} 
                activeSubTab={settingsSubTab} 
                onSubTabChange={(tab) => setSettingsSubTab(tab)} 
              />
            </div>
          )}
        </main>
      </div>

      {/* Guided Database Recovery Modal (Feature #124 / Task 124-2) */}
      {corruptDbStatus && (
        <DatabaseRecoveryModal
          status={corruptDbStatus}
          onRestored={() => window.location.reload()}
        />
      )}

      {/* First Run Store Setup Wizard (Feature #106 / Task 106-4) */}
      <FirstRunWizardModal
        isOpen={isFirstRunWizardOpen}
        isFirstRun={true}
        onClose={() => setIsFirstRunWizardOpen(false)}
        onCompleted={() => {
          setIsFirstRunWizardOpen(false);
          setActiveTab('pos');
          window.location.reload();
        }}
      />

      {/* Guided Tour Modal (Feature #113 / Task 113-4) */}
      <GuidedTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        hasDemoData={hasDemoData}
      />

      {/* Pilot Readiness Check Modal (Feature #137) */}
      <ReadinessCheckModal
        isOpen={isReadinessOpen}
        onClose={() => setIsReadinessOpen(false)}
        onNavigateToTab={(tab) => {
          setActiveTab(tab as TabType);
        }}
      />

      {/* Employee Login / Lock Screen Modal (Task 166-3 & Task 166-6) */}
      <LoginModal
        isOpen={isLoginModalOpen}
        canCancel={Boolean(currentUser)}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          setCashierName(user.displayName);
          setIsLoginModalOpen(false);
          // Cashiers are guided to POS
          if (user.role === 'cashier' && activeTab !== 'pos' && activeTab !== 'customers') {
            setActiveTab('pos');
          }
        }}
      />

      {/* Employee & Role Management Modal (Task 166-4) */}
      <UserManagerModal
        isOpen={isUserManagerOpen}
        onClose={() => setIsUserManagerOpen(false)}
        onUsersChanged={async () => {
          try {
            const u: UserDto = await invoke('auth:getCurrentUser');
            if (u) {
              setCurrentUser(u);
              setCashierName(u.displayName);
            }
          } catch {
            // ignore
          }
        }}
      />

      {/* Supervisor Approval Prompt Modal (Task 166-9) */}
      <SupervisorPromptModal
        isOpen={supervisorPrompt.isOpen}
        actionTitle={supervisorPrompt.title}
        actionDescription={supervisorPrompt.description}
        onCancel={() => setSupervisorPrompt((p) => ({ ...p, isOpen: false }))}
        onApproved={() => {
          supervisorPrompt.onApproved();
          setSupervisorPrompt((p) => ({ ...p, isOpen: false }));
        }}
      />

      {/* Feature #172: Fullscreen License Expired Lock Screen (Task 172-1, 172-3, 172-5) */}
      <LicenseExpiredLockScreen
        isOpen={isLockScreenOpen}
        expiryInfo={licenseExpiry}
        onUnlocked={() => {
          setIsLockScreenOpen(false);
          setIsLicenseReadOnlyMode(false);
          void refreshLicenseStatus();
        }}
        onEnterReadOnlyMode={() => {
          setIsLockScreenOpen(false);
          setIsLicenseReadOnlyMode(true);
          if (activeTab === 'pos') {
            setActiveTab('dashboard');
          }
        }}
      />

      {/* License Activation & Verification Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
        onLicenseUpdated={() => {
          void refreshLicenseStatus();
        }}
      />

      {/* Feature #147: Offline In-App Help Center */}
      <HelpCenterModal
        isOpen={isHelpCenterOpen}
        onClose={() => setIsHelpCenterOpen(false)}
        initialSection={helpCenterSection}
      />

      {/* Global Rafiq Custom Dialog Modal System */}
      <RafiqDialogContainer />
    </div>
  );
}
