import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import type { FC } from 'react';
import { 
  ShoppingCart, 
  Package, 
  FileText, 
  Settings, 
  Clock,
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
  FlaskConical,
  Power,
  Truck,
  Receipt,
  Plus,
  Building2,
  HelpCircle,
  TrendingUp,
  CreditCard,
  Smartphone,
  Wallet,
  Layers,
  KeyRound,
  RefreshCw,
  Database,
  BarChart3,
  Sun,
  Moon,
} from 'lucide-react';
import { 
  NotificationBellButton, 
  NotificationCenterDrawer, 
  CompactAlertTickerBar 
} from './components/NotificationCenter';
import { useSystemNotifications } from './utils/useSystemNotifications';
import { useTheme } from './context/useTheme';
import { invoke } from './bridge/ipc';
import { useDataSubscription, emitDataChanged } from './utils/eventBus';
import { PosView } from './views/PosView';
import { EpayView, type EpaySubTab } from './views/epay/EpayView';
import { WalletsView, type WalletsSubTab } from './views/wallets/WalletsView';
import { DashboardView } from './views/DashboardView';
import { RevenueAnalyticsView } from './views/analytics/RevenueAnalyticsView';
import { InventoryAnalyticsView } from './views/analytics/InventoryAnalyticsView';
import { CustomerAnalyticsView } from './views/analytics/CustomerAnalyticsView';
import type { DashboardSubTab, Shift } from './types/models';
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
import { RafiqLoadingState } from './components/RafiqLoadingState';
import { RafiqDialogContainer } from './components/RafiqDialog';
import { rafiqConfirm, rafiqAlert } from './utils/dialogService';
import { LoginModal } from './components/LoginModal';
import { UserManagerModal } from './components/UserManagerModal';
import { ShiftModal } from './components/ShiftModal';
import { SupervisorPromptModal } from './components/SupervisorPromptModal';
import { LicenseExpiredLockScreen } from './components/LicenseExpiredLockScreen';
import type { LicenseExpiryDetails } from './components/LicenseExpiredLockScreen';
import { LicenseModal } from './components/LicenseModal';
import { HelpCenterModal } from './components/HelpCenterModal';
import { useFeatures } from './context/useFeatures';
import { useAuth } from './context/useAuth';
import { LoginScreen } from './views/LoginScreen';

export interface SystemInfo {
  appName: string;
  version: string;
  osVersion: string;
  isWebView2: boolean;
  dbStatus: string;
}

export type TabType = 'pos' | 'epay' | 'wallets' | 'dashboard' | 'customers' | 'products' | 'purchases' | 'sales' | 'audit' | 'settings';

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
    <div className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-surface-dark-2 border border-line dark:border-line-dark px-2.5 py-1 rounded-lg tabular-nums text-xs font-semibold text-ink dark:text-ink-dark shadow-2xs shrink-0">
      <Clock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
      <span className="text-ink-muted dark:text-ink-dark-muted font-normal text-[11px] hidden xl:inline">{date}</span>
      <span className="text-line dark:text-line-dark hidden xl:inline">|</span>
      <span className="font-mono text-paid dark:text-brand-bright font-bold tracking-wide text-xs">{time || '00:00:00'}</span>
    </div>
  );
});

const ADMIN_ONLY_TABS: TabType[] = ['dashboard', 'products', 'purchases', 'sales', 'audit', 'settings'];
const CASHIER_ALLOWED_TABS: TabType[] = ['pos', 'epay', 'wallets', 'customers'];

export default function App() {
  const { isEnabled } = useFeatures();
  const { currentUser, isLoading, logout, hasPermission, isRoot, isAdmin, refreshUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const isCashier = currentUser?.role === 'cashier';
  const effectiveActiveTab: TabType = isCashier && !CASHIER_ALLOWED_TABS.includes(activeTab) ? 'pos' : activeTab;

  const [isUniversalRefreshing, setIsUniversalRefreshing] = useState(false);
  const [refreshToastMsg, setRefreshToastMsg] = useState<string | null>(null);

  const [productsSubView, setProductsSubView] = useState<'catalog' | 'movements' | 'batches'>('catalog');
  const [isProductsMenuExpanded, setIsProductsMenuExpanded] = useState(false);
  const [epaySubTab, setEpaySubTab] = useState<EpaySubTab>('pos');
  const [isEpayMenuExpanded, setIsEpayMenuExpanded] = useState(false);
  const [walletsSubTab, setWalletsSubTab] = useState<WalletsSubTab>('transact');
  const [isWalletsMenuExpanded, setIsWalletsMenuExpanded] = useState(false);
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
  const [productToEditId, setProductToEditId] = useState<string | null>(null);
  const [isFirstRunWizardOpen, setIsFirstRunWizardOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rafiq_first_run_completed') !== 'true';
    }
    return false;
  });
  const [hasDemoData, setHasDemoData] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rafiq_show_guided_tour') === 'true';
    }
    return false;
  });
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [storeName, setStoreName] = useState('رفيق POS');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserManagerOpen, setIsUserManagerOpen] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
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
    const isAppDark = document.documentElement.classList.contains('dark') || localStorage.getItem('rafiq_pos_theme') === 'dark';
    void invoke('system:appReady', { theme: isAppDark ? 'dark' : 'light' }).catch(() => {});

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

  const loadActiveShift = useCallback(async () => {
    try {
      const active = await invoke<Shift | null>('shifts:getActive', { posRegisterId: 'default_pos' });
      setActiveShift(active);
    } catch {
      // Ignore in offline
    }
  }, []);

  useEffect(() => {
    void loadActiveShift();

    const handleOpenShift = () => setIsShiftModalOpen(true);
    const handleCloseShift = () => setIsShiftModalOpen(false);
    const handleShiftUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<Shift | null>;
      setActiveShift(customEvent.detail);
    };

    window.addEventListener('rafiq:open-shift-modal', handleOpenShift);
    window.addEventListener('rafiq:close-shift-modal', handleCloseShift);
    window.addEventListener('rafiq:shift-updated', handleShiftUpdated as EventListener);

    return () => {
      window.removeEventListener('rafiq:open-shift-modal', handleOpenShift);
      window.removeEventListener('rafiq:close-shift-modal', handleCloseShift);
      window.removeEventListener('rafiq:shift-updated', handleShiftUpdated as EventListener);
    };
  }, [loadActiveShift, currentUser]);

  const refreshSettings = useCallback(async () => {
    try {
      const s: any = await invoke('settings:getAll');
      if (s) {
        if (s.store_name) setStoreName(s.store_name);
      }
      void refreshUser();
      const sec: any = await invoke('security:getStatus');
      if (sec && typeof sec.idleTimeoutMinutes === 'number') {
        setIdleTimeoutMinutes(sec.idleTimeoutMinutes);
      }
    } catch {
      // Ignore in dev
    }
  }, [refreshUser]);

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
    // Initial fetch of public store settings on mount
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    // Reactive sync on auth resolution: once the session is verified in C#, fetch low stock & store profile
    if (!isLoading) {
      void refreshSettings();
      if (currentUser) {
        void refreshLowStock();
      } else {
        setLowStockCount(0);
      }
    }
  }, [currentUser, isLoading, refreshSettings, refreshLowStock]);

  useDataSubscription(['settings', 'all'], refreshSettings);
  useDataSubscription(['products', 'all'], refreshLowStock);

  // Context-aware refresh labels and icons tailored to active view
  const currentRefreshInfo = useMemo(() => {
    switch (effectiveActiveTab) {
      case 'pos':
        return {
          label: 'جاري تحديث شاشة البيع والكاشير...',
          sublabel: 'تحديث السلة، الأصناف السريعة، وأسعار المنتجات الحية',
          icon: <ShoppingCart className="w-6 h-6 text-brand" />,
        };
      case 'epay':
        return {
          label: 'جاري تحديث خدمات وماكينات الدفع...',
          sublabel: 'استرجاع أرصدة الماكينات وسجل العمليات والتحليلات',
          icon: <Smartphone className="w-6 h-6 text-brand" />,
        };
      case 'wallets':
        return {
          label: 'جاري تحديث أرصدة المحافظ وإنستاباي...',
          sublabel: 'استرجاع الأرصدة الحالية، وسجل المعاملات، وصافي الأرباح',
          icon: <Wallet className="w-6 h-6 text-brand" />,
        };
      case 'dashboard':
        return {
          label: dashboardSubTab === 'revenue' 
            ? 'جاري تحديث تحليلات الإيرادات والأرباح...' 
            : dashboardSubTab === 'inventory' 
            ? 'جاري تحديث تحليلات حركة المخزون...' 
            : dashboardSubTab === 'customers' 
            ? 'جاري تحديث تحليلات وسجل العملاء...' 
            : 'جاري تحديث لوحة اليوم والوردية...',
          sublabel: 'حساب الإيرادات والأرباح ومطابقة نقدية الدرج الحالية',
          icon: dashboardSubTab === 'revenue' ? <BarChart3 className="w-6 h-6 text-brand" /> : <LayoutDashboard className="w-6 h-6 text-brand" />,
        };
      case 'products':
        return {
          label: 'جاري تحميل وتحديث أصناف وبضاعة المحل...',
          sublabel: 'استرجاع السلع والوحدات ومطابقة الأرصدة الحالية من قاعدة البيانات',
          icon: <Package className="w-6 h-6 text-brand" />,
        };
      case 'customers':
        return {
          label: 'جاري تحديث سجل العملاء والمديونيات...',
          sublabel: 'استرجاع الحسابات، الدفعات، وأرصدة الشكك الحالية',
          icon: <Users className="w-6 h-6 text-brand" />,
        };
      case 'purchases':
        return {
          label: 'جاري تحديث فواتير المشتريات والموردين...',
          sublabel: 'مطابقة فواتير التوريد، الأرصدة، ومدفوعات الموردين',
          icon: <Truck className="w-6 h-6 text-brand" />,
        };
      case 'sales':
        return {
          label: 'جاري تحديث سجل فواتير البيع...',
          sublabel: 'استرجاع الفواتير المكتملة وحركات المبيعات من قاعدة البيانات',
          icon: <Receipt className="w-6 h-6 text-brand" />,
        };
      case 'audit':
        return {
          label: 'جاري تحديث سجل الرقابة والأمان...',
          sublabel: 'استرجاع حركات التدقيق وسجل نشاط المستخدمين',
          icon: <ShieldAlert className="w-6 h-6 text-brand" />,
        };
      case 'settings':
        return {
          label: 'جاري تحديث إعدادات النظام والمتجر...',
          sublabel: 'قراءة المتغيرات وتفضيلات النظام من قاعدة البيانات',
          icon: <Settings className="w-6 h-6 text-brand" />,
        };
      default:
        return {
          label: 'جاري تحديث بيانات النظام...',
          sublabel: 'الاتصال بقاعدة البيانات ومطابقة السجلات الحية',
          icon: <Database className="w-6 h-6 text-brand" />,
        };
    }
  }, [effectiveActiveTab, dashboardSubTab]);

  const handleUniversalRefresh = useCallback(async () => {
    if (isUniversalRefreshing) return;
    setIsUniversalRefreshing(true);
    try {
      emitDataChanged('all');
      await Promise.allSettled([
        refreshSettings(),
        refreshLowStock(),
        refreshUser(),
      ]);
      // Keep loading visible for a pleasant smooth feedback moment (600ms)
      await new Promise((resolve) => setTimeout(resolve, 600));
      setRefreshToastMsg('تم تحديث كافة بيانات النظام والعمليات بنجاح');
      setTimeout(() => {
        setRefreshToastMsg(null);
      }, 2500);
    } catch {
      // Graceful fallback
    } finally {
      setIsUniversalRefreshing(false);
    }
  }, [isUniversalRefreshing, refreshSettings, refreshLowStock, refreshUser]);

  // Global keyboard shortcuts for switching tabs and system actions
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Alt + Number shortcuts for main system navigation (avoids any collision with POS cashier F-keys)
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          if (hasPermission('pos.access')) setActiveTab('pos');
        } else if (e.key === '2') {
          e.preventDefault();
          if (hasPermission('epay.access')) setActiveTab('epay');
        } else if (e.key === '3') {
          e.preventDefault();
          if (hasPermission('wallets.access')) setActiveTab('wallets');
        } else if (currentUser?.role !== 'cashier') {
          if (e.key === '4') {
            e.preventDefault();
            if (isAdmin || hasPermission('reports.sales')) setActiveTab('dashboard');
          } else if (e.key === '5') {
            e.preventDefault();
            if (hasPermission('customers.view')) setActiveTab('customers');
          } else if (e.key === '6') {
            e.preventDefault();
            if (isAdmin || hasPermission('purchases.view')) setActiveTab('purchases');
          } else if (e.key === '7') {
            e.preventDefault();
            if (isAdmin || hasPermission('invoices.view')) setActiveTab('sales');
          } else if (e.key === '8') {
            e.preventDefault();
            if (isRoot || hasPermission('audit_log.view')) setActiveTab('audit');
          } else if (e.key === '9') {
            e.preventDefault();
            if (isAdmin || hasPermission('settings.store') || hasPermission('settings.printer') || hasPermission('settings.barcode')) {
              setActiveTab('settings');
              setIsSettingsMenuExpanded(true);
            }
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

      // 4. Ctrl+R or F5: Universal in-app refresh without reload or logout
      if (e.key === 'F5' || (e.ctrlKey && (e.key.toLowerCase() === 'r' || e.code === 'KeyR'))) {
        e.preventDefault();
        void handleUniversalRefresh();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTab, currentUser?.role, handleUniversalRefresh, hasPermission, isAdmin, isRoot]);

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
    if ((currentUser?.role === 'cashier' || (!isAdmin && !isRoot)) && ADMIN_ONLY_TABS.includes(tabId)) {
      setActiveTab('pos');
      return;
    }
    if (tabId === 'pos' && !hasPermission('pos.access')) return;
    if (tabId === 'epay' && !hasPermission('epay.access')) return;
    if (tabId === 'wallets' && !hasPermission('wallets.access')) return;
    if (tabId === 'customers' && !hasPermission('customers.view')) return;
    setActiveTab(tabId);
    if (subAction) subAction();
  };

  const dashboardTreeItems = [
    { id: 'today' as DashboardSubTab, label: 'لوحة اليوم والوردية', icon: LayoutDashboard },
    { id: 'revenue' as DashboardSubTab, label: 'حساب الإيرادات والأرباح', icon: TrendingUp },
    { id: 'inventory' as DashboardSubTab, label: 'حركة المخزن والتوالف', icon: Boxes },
    { id: 'customers' as DashboardSubTab, label: 'العملاء وحسابات الشكك', icon: Users },
  ];

  interface SettingsTreeItem {
    id: SettingsSubTab;
    label: string;
    icon: any;
  }

  const settingsTreeItems = useMemo<SettingsTreeItem[]>(() => {
    const items: SettingsTreeItem[] = [
      { id: 'profile' as SettingsSubTab, label: 'بيانات المحل والفاتورة', icon: Store },
      { id: 'backup' as SettingsSubTab, label: 'نسخة احتياطية وحماية البيانات', icon: HardDrive },
      { id: 'printer' as SettingsSubTab, label: 'إعدادات الطابعة والورق', icon: Printer },
    ];
    if (isRoot || hasPermission('settings.features')) {
      items.push(
        { id: 'system' as SettingsSubTab, label: 'مفاتيح الميزات وفحص السيستم', icon: Activity },
      );
    }
    if (isRoot) {
      items.push(
        { id: 'scanner' as SettingsSubTab, label: 'قارئ الباركود والاسكانر', icon: Barcode },
        { id: 'security' as SettingsSubTab, label: 'حماية وأرقام السر (PIN)', icon: KeyRound },
        { id: 'demo' as SettingsSubTab, label: 'بيانات تجريبية وتدريب', icon: FlaskConical },
      );
    }
    return items;
  }, [isRoot, hasPermission]);

  const allNavItems = [
    { id: 'pos' as TabType, label: 'الكاشير وشاشة البيع', icon: ShoppingCart, shortcut: 'F1 / Alt+1' },
    { id: 'epay' as TabType, label: 'خدمات وماكينات الدفع', icon: CreditCard, shortcut: 'Alt+2' },
    { id: 'wallets' as TabType, label: 'المحافظ وإنستاباي', icon: Wallet, shortcut: 'Alt+3' },
    { id: 'dashboard' as TabType, label: 'لوحة اليوم والوردية', icon: LayoutDashboard, shortcut: 'Alt+4' },
    { id: 'customers' as TabType, label: 'العملاء وحسابات الشكك', icon: Users, shortcut: 'Alt+5' },
    { id: 'products' as TabType, label: 'الأصناف والمخزن', icon: Package, shortcut: 'Alt+6' },
    { id: 'purchases' as TabType, label: 'فواتير الشراء والموردين', icon: Truck, shortcut: 'Alt+7' },
    { id: 'sales' as TabType, label: 'سجل وفواتير البيع', icon: FileText, shortcut: 'Alt+8' },
    { id: 'audit' as TabType, label: 'سجل المراقبة والأمان', icon: ShieldAlert, shortcut: 'Alt+9' },
    { id: 'settings' as TabType, label: 'إعدادات المحل والسيستم', icon: Settings, shortcut: '' },
  ];

  const canAccessPos = isRoot || hasPermission('pos.access') || hasPermission('pos');
  const canAccessEpay = (isRoot || hasPermission('epay.access') || hasPermission('epay')) && isEnabled('feature_epay_services');
  const canAccessWallets = isRoot || hasPermission('wallets.access') || hasPermission('wallets');
  const canAccessDashboard = isRoot || hasPermission('reports.sales') || hasPermission('reports');
  const canAccessCustomers = isRoot || hasPermission('customers.view') || hasPermission('customers');
  const canAccessProducts = isRoot || hasPermission('products.view') || hasPermission('products');
  const canAccessPurchases = isRoot || hasPermission('purchases.view');
  const canAccessSales = isRoot || hasPermission('invoices.view');
  const canAccessAudit = isRoot && hasPermission('audit_log.view');
  const canAccessSettings = isRoot || hasPermission('settings.store') || hasPermission('settings');

  const canAccessEpayTerminals = isRoot || isAdmin || hasPermission('epay.terminals_manage') || hasPermission('epay.fund');
  const canAccessEpayHistory = isRoot || isAdmin || hasPermission('epay.history');
  const canAccessEpayAnalytics = isRoot || isAdmin || hasPermission('epay.analytics');

  const canAccessWalletsTransact = isRoot || isAdmin || hasPermission('wallets.transact');
  const canAccessWalletsAccounts = isRoot || isAdmin || hasPermission('wallets.accounts_manage') || hasPermission('wallets.fund');
  const canAccessWalletsHistory = isRoot || isAdmin || hasPermission('wallets.history');
  const canAccessWalletsAnalytics = isRoot || isAdmin || hasPermission('wallets.analytics');

  const walletsTreeItems = useMemo(() => {
    const items = [];
    if (canAccessWalletsTransact) {
      items.push({ id: 'transact' as WalletsSubTab, label: 'تنفيذ عملية (سحب / إيداع)', icon: Smartphone });
    }
    if (canAccessWalletsAccounts) {
      items.push({ id: 'accounts' as WalletsSubTab, label: 'أرصدة المحافظ والحسابات', icon: Layers });
    }
    if (canAccessWalletsHistory) {
      items.push({ id: 'history' as WalletsSubTab, label: 'سجل العمليات والإيصالات', icon: Receipt });
    }
    if (canAccessWalletsAnalytics) {
      items.push({ id: 'analytics' as WalletsSubTab, label: 'أرباح وتحليلات المحافظ', icon: TrendingUp });
    }
    return items;
  }, [canAccessWalletsTransact, canAccessWalletsAccounts, canAccessWalletsHistory, canAccessWalletsAnalytics]);

  const epayTreeItems = useMemo(() => {
    const items = [
      { id: 'pos' as EpaySubTab, label: 'تنفيذ عملية جديدة', icon: Smartphone },
    ];
    if (canAccessEpayTerminals) {
      items.push({ id: 'terminals' as EpaySubTab, label: 'أرصدة وماكينات الدفع', icon: Layers });
    }
    if (canAccessEpayHistory) {
      items.push({ id: 'history' as EpaySubTab, label: 'سجل العمليات والإيصالات', icon: Receipt });
    }
    if (canAccessEpayAnalytics) {
      items.push({ id: 'analytics' as EpaySubTab, label: 'التحليلات والأرباح المستقلة', icon: TrendingUp });
    }
    return items;
  }, [canAccessEpayTerminals, canAccessEpayHistory, canAccessEpayAnalytics]);

  useEffect(() => {
    if (epaySubTab === 'terminals' && !canAccessEpayTerminals) {
      setEpaySubTab('pos');
    } else if (epaySubTab === 'history' && !canAccessEpayHistory) {
      setEpaySubTab('pos');
    } else if (epaySubTab === 'analytics' && !canAccessEpayAnalytics) {
      setEpaySubTab('pos');
    }
  }, [epaySubTab, canAccessEpayTerminals, canAccessEpayHistory, canAccessEpayAnalytics]);

  const navItems = allNavItems.filter((item) => {
    switch (item.id) {
      case 'pos': return canAccessPos;
      case 'epay': return canAccessEpay;
      case 'wallets': return canAccessWallets;
      case 'dashboard': return canAccessDashboard;
      case 'customers': return canAccessCustomers;
      case 'products': return canAccessProducts;
      case 'purchases': return canAccessPurchases;
      case 'sales': return canAccessSales;
      case 'audit': return canAccessAudit;
      case 'settings': return canAccessSettings;
      default: return true;
    }
  });

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.id === activeTab)) {
      setActiveTab('pos');
    }
  }, [navItems, activeTab]);

  if (isFirstRunWizardOpen) {
    return (
      <div className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden select-none bg-canvas" dir="rtl">
        <FirstRunWizardModal
          isOpen={true}
          isFirstRun={true}
          onClose={() => setIsFirstRunWizardOpen(false)}
          onCompleted={() => {
            try {
              localStorage.setItem('rafiq_first_run_completed', 'true');
              localStorage.setItem('rafiq_show_guided_tour', 'true');
              localStorage.removeItem('rafiq_wizard_state');
            } catch {
              // ignore
            }
            setIsFirstRunWizardOpen(false);
            setActiveTab('pos');
            window.location.reload();
          }}
        />
        <RafiqDialogContainer />
      </div>
    );
  }

  if (isLoading && !currentUser) {
    return (
      <div className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center bg-canvas select-none" dir="rtl">
        <RafiqLoadingState 
          label="جاري تحميل نظام رفيق..." 
          sublabel="التحقق من جلسة المستخدم والاتصال بقاعدة البيانات" 
        />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden select-none bg-canvas" dir="rtl">
        <LoginScreen />
        <RafiqDialogContainer />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark select-none overflow-hidden relative">
      {/* Floating Refresh Toast Feedback */}
      {refreshToastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-paid text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{refreshToastMsg}</span>
        </div>
      )}
      {/* 1. TOP BAR (52px professional high, hairline-b, Spans across top) */}
      <header className="h-[52px] w-full bg-surface dark:bg-surface-dark hairline-b flex items-center justify-between px-3 sm:px-4 shrink-0 z-20 shadow-2xs">
        {/* Right Side: Store Title & Status Badges */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-surface-dark-2 border border-[#DCE1DC] dark:border-line-dark flex items-center justify-center p-1 shadow-2xs shrink-0 select-none"
            title="رفيق POS"
          >
            <img 
              src={isDark ? '/logo_modern.png' : '/logo_classic.png'} 
              alt="شعار رفيق" 
              className="w-full h-full object-contain" 
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-ink dark:text-ink-dark leading-tight m-0 truncate">{storeName || 'رفيق POS'}</h1>
            <p className="text-[10px] sm:text-[11px] font-medium text-ink-muted dark:text-ink-dark-muted m-0 truncate">نظام نقاط البيع وإدارة المتاجر والمحلات</p>
          </div>
        </div>

        {/* Left Side: Staff Management, Action Buttons, Window Controls, Date & Time */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
          {/* Shift & Cash Drawer Quick Access Button (Always accessible to open or manage/close shift) */}
          <button
            type="button"
            onClick={() => setIsShiftModalOpen(true)}
            className={`flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-bold shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0 ${
              activeShift && activeShift.status !== 'closed'
                ? 'bg-paid-soft hover:bg-paid-soft/80 text-paid border-paid/30 dark:bg-paid-dark-soft dark:hover:bg-paid-dark-soft/80 dark:text-paid-bright dark:border-paid-dark-border'
                : 'bg-surface dark:bg-surface-dark-2 hover:bg-brand-soft/70 dark:hover:bg-brand-dark-soft border-line dark:border-line-dark hover:border-brand/40 text-ink dark:text-ink-dark'
            }`}
            title={
              activeShift && activeShift.status !== 'closed'
                ? `إدارة الوردية والدرج وحركات النقدية (وردية #${activeShift.shiftNumber ?? (activeShift as any).ShiftNumber ?? 1} مفتوحة)`
                : 'فتح وردية جديدة واستلام عهدة الدرج'
            }
          >
            <Clock className={`w-3.5 h-3.5 shrink-0 ${activeShift && activeShift.status !== 'closed' ? 'text-paid dark:text-paid-bright' : 'text-warn dark:text-warn-bright'}`} />
            <span className="truncate max-w-[110px]">
              {activeShift && activeShift.status !== 'closed'
                ? `وردية #${activeShift.shiftNumber ?? (activeShift as any).ShiftNumber ?? 1}`
                : 'فتح وردية'}
            </span>
          </button>

          {/* Fast Switch User / Profile Badge */}
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-brand-soft/70 dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-brand/40 text-ink dark:text-ink-dark text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0"
            title="تبديل المستخدم الحالي سريعاً برقم الـ PIN"
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
              isAdmin ? 'bg-paid-soft text-paid border border-paid-border dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border' : 'bg-brand-soft text-brand border border-brand/20 dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/20'
            }`}>
              {currentUser?.displayName ? currentUser.displayName.slice(0, 1) : 'U'}
            </div>
            <span className="font-bold hidden md:inline truncate max-w-[90px]">{currentUser?.displayName}</span>
            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted hidden lg:inline">({currentUser?.role === 'root' ? 'المالك' : (isAdmin ? 'صاحب المحل' : 'كاشير')})</span>
          </button>

          {/* Manage Users Button for Admin/Root or authorized managers (Task 166-4) */}
          {(isAdmin || hasPermission('users.view')) && (
            <button
              type="button"
              onClick={() => setIsUserManagerOpen(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-warn-soft/60 dark:hover:bg-warn-dark-soft border border-line dark:border-line-dark hover:border-warn/40 dark:hover:border-warn-bright/40 text-ink dark:text-ink-dark hover:text-warn dark:hover:text-warn-bright font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer shrink-0"
              title="إدارة حسابات الموظفين والصلاحيات والشجرة"
            >
              <Users className="w-3.5 h-3.5 text-warn dark:text-warn-bright shrink-0" />
              <span>الموظفون</span>
            </button>
          )}

          {/* Readiness Checklist Button (Feature #137) - Root/Developer Only */}
          {isRoot && (
            <button
              type="button"
              onClick={() => setIsReadinessOpen(true)}
              className="w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-paid-soft dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-paid dark:hover:border-brand-bright text-paid dark:text-brand-bright flex items-center justify-center shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
              title="فحص جاهزية التشغيل والعتاد (Root)"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}

          {/* Logout Button */}
          <button
            type="button"
            onClick={async () => {
              const confirmed = await rafiqConfirm({
                title: 'تسجيل الخروج',
                message: 'هل تريد تسجيل الخروج وقفل شاشة الكاشير الآن؟',
                confirmText: 'تسجيل الخروج',
                cancelText: 'إلغاء',
              });
              if (confirmed) {
                await logout();
              }
            }}
            className="w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-danger/10 dark:hover:bg-danger-dark-soft border border-line dark:border-line-dark hover:border-danger/30 text-ink-muted dark:text-ink-dark-muted hover:text-danger flex items-center justify-center shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title="تسجيل الخروج وقفل النظام"
          >
            <Power className="w-4 h-4 text-danger" />
          </button>

          {/* Minimize Window Button */}
          <button
            type="button"
            onClick={handleMinimizeWindow}
            className="w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark hover:border-ink-muted dark:hover:border-line-dark-hover text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark flex items-center justify-center shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title="تصغير التطبيق إلى شريط المهام"
          >
            <Minus className="w-4 h-4" />
          </button>

          {/* Fullscreen Kiosk Mode Toggle */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark hover:border-ink-muted dark:hover:border-line-dark-hover text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark flex items-center justify-center shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title={isFullscreen ? 'الخروج من ملء الشاشة (F11)' : 'ملء الشاشة بالكامل (F11)'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted" />
            ) : (
              <Maximize2 className="w-4 h-4 text-paid dark:text-brand-bright" />
            )}
          </button>

          {/* Universal System Refresh Button */}
          <button
            type="button"
            onClick={() => void handleUniversalRefresh()}
            disabled={isUniversalRefreshing}
            className={`w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-paid-soft dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-paid dark:hover:border-brand-bright text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-brand-bright flex items-center justify-center shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-60 ${
              isUniversalRefreshing ? 'bg-paid-soft text-paid border-paid/50' : ''
            }`}
            title="تحديث شامل لكافة البيانات والعمليات في النظام (F5)"
          >
            <RefreshCw className={`w-4 h-4 ${isUniversalRefreshing ? 'animate-spin text-paid dark:text-brand-bright' : ''}`} />
          </button>

          {/* Quick Theme Toggle (Light / Dark) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark hover:border-ink-muted dark:hover:border-line-dark-hover text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark flex items-center justify-center shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title={isDark ? 'التبديل إلى الوضع النهاري (الفاتح)' : 'التبديل إلى الوضع الليلي (الداكن)'}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted" />
            )}
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
        {/* Navigation Sidebar (RTL Right side, Perfectly Balanced: 64px collapsed / 240px expanded) */}
        <aside 
          className={`${
            isSidebarCollapsed ? 'w-[64px] px-1.5 py-2.5 items-center' : 'w-[240px] p-2.5'
          } bg-surface dark:bg-surface-dark hairline-l flex flex-col shrink-0 select-none transition-all duration-150 h-full min-h-0 overflow-hidden shadow-2xs`}
        >
          {/* Top Header of Sidebar: Title + Toggle Icon Button */}
          <div className={`w-full flex items-center mb-1.5 pb-1.5 border-b border-line dark:border-line-dark shrink-0 ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}>
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-medium text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider">
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
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft transition-colors cursor-pointer"
            >
              {isSidebarCollapsed ? (
                <PanelRightOpen className="w-4 h-4 text-brand-dark dark:text-brand-bright" />
              ) : (
                <PanelRightClose className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright" />
              )}
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1 w-full overflow-y-auto overflow-x-hidden min-h-0 py-0.5">

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = effectiveActiveTab === item.id;
              const isEpayItem = item.id === 'epay';
              const isWalletsItem = item.id === 'wallets';
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
                        if (isEpayItem) setEpaySubTab('pos');
                        if (isWalletsItem) setWalletsSubTab('transact');
                        if (isDashboardItem) setDashboardSubTab('today');
                        if (isProductsItem) setProductsSubView('catalog');
                        if (isPurchasesItem) setPurchasesSubView('invoices');
                        if (isSettingsItem) setSettingsSubTab('profile');
                      });
                    }}
                    title={item.label}
                    className={`relative w-full h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 group cursor-pointer ${
                      isActive
                        ? 'bg-brand-dark dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright shadow-xs'
                        : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white'
                    }`}
                  >
                    <div className="relative inline-flex items-center justify-center">
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/80 group-hover:text-ink dark:group-hover:text-white'}`} />
                      {isProductsItem && lowStockCount > 0 && (
                        <span
                          className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[9px] font-black font-mono leading-none flex items-center justify-center border-2 border-surface dark:border-surface-dark shadow-xs pointer-events-none select-none tracking-tight"
                          title={`${lowStockCount} أصناف نواقص / قاربت على النفاد`}
                        >
                          <span dir="ltr">{lowStockCount > 99 ? '99+' : lowStockCount > 9 ? '9+' : lowStockCount}</span>
                        </span>
                      )}
                    </div>
                    <span className="sr-only">{item.label}</span>
                  </button>
                );
              }

              return (
                <div key={item.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      if (isEpayItem) {
                        if (effectiveActiveTab !== 'epay') {
                          handleNavClick('epay', () => setIsEpayMenuExpanded(true));
                        } else {
                          setIsEpayMenuExpanded(!isEpayMenuExpanded);
                        }
                      } else if (isWalletsItem) {
                        if (effectiveActiveTab !== 'wallets') {
                          handleNavClick('wallets', () => setIsWalletsMenuExpanded(true));
                        } else {
                          setIsWalletsMenuExpanded(!isWalletsMenuExpanded);
                        }
                      } else if (isDashboardItem) {
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
                    className={`w-full relative flex items-center justify-between px-3 h-[41px] rounded-xl text-[13px] transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-brand-dark dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-xs'
                        : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/80 group-hover:dark:text-white'}`} />
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                      {isProductsItem && lowStockCount > 0 && (
                        <span
                          dir="ltr"
                          className="mr-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono bg-danger text-white shrink-0 leading-none shadow-2xs"
                          title={`${lowStockCount} أصناف نواقص / قاربت على النفاد`}
                        >
                          {lowStockCount > 99 ? '99+' : lowStockCount > 9 ? '9+' : lowStockCount}
                        </span>
                      )}
                    </div>

                    {(isEpayItem || isWalletsItem || isDashboardItem || isProductsItem || isPurchasesItem || isSettingsItem) && (
                      <span className={`shrink-0 ${isActive ? 'text-white/80 dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/70'}`}>
                        {(isEpayItem ? isEpayMenuExpanded : isWalletsItem ? isWalletsMenuExpanded : isDashboardItem ? isDashboardMenuExpanded : isProductsItem ? isProductsMenuExpanded : isPurchasesItem ? isPurchasesMenuExpanded : isSettingsMenuExpanded) ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronLeft className="w-3.5 h-3.5" />
                        )}
                      </span>
                    )}
                  </button>

                  {/* Sub-tree for Epay (SuperPay / Terminals / POS / Analytics) */}
                  {isEpayItem && isEpayMenuExpanded && (
                    <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
                      {epayTreeItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = effectiveActiveTab === 'epay' && epaySubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            title={sub.label}
                            onClick={() => {
                              setActiveTab('epay');
                              setEpaySubTab(sub.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                              isSubActive
                                ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                                : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/75'}`} />
                              <span className="truncate whitespace-nowrap">{sub.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-tree for Wallets & InstaPay */}
                  {isWalletsItem && isWalletsMenuExpanded && (
                    <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
                      {walletsTreeItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = effectiveActiveTab === 'wallets' && walletsSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            title={sub.label}
                            onClick={() => {
                              setActiveTab('wallets');
                              setWalletsSubTab(sub.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                              isSubActive
                                ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                                : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/75'}`} />
                              <span className="truncate whitespace-nowrap">{sub.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-tree for Dashboard & Executive Analytics */}
                  {isDashboardItem && isDashboardMenuExpanded && (
                    <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
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
                            className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                              isSubActive
                                ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                                : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/75'}`} />
                              <span className="truncate whitespace-nowrap">{sub.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-tree for Products & Inventory */}
                  {isProductsItem && isProductsMenuExpanded && (
                    <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('products');
                          setProductsSubView('catalog');
                          setInitialProductFilter('all');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'products' && productsSubView === 'catalog'
                            ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                            : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                        }`}
                        title="كتالوج الأصناف والأسعار"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">كتالوج الأصناف والأسعار</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('products');
                          setProductsSubView('movements');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'products' && productsSubView === 'movements'
                            ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                            : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                        }`}
                        title="حركات وجرد المخزن"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Boxes className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">حركات وجرد المخزن</span>
                        </div>
                      </button>

                      {isEnabled('feature_expiry_dates') && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('products');
                            setProductsSubView('batches');
                          }}
                          className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                            effectiveActiveTab === 'products' && productsSubView === 'batches'
                              ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                              : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
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
                    <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('purchases');
                          setPurchasesSubView('new_invoice');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'purchases' && purchasesSubView === 'new_invoice'
                            ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                            : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                        }`}
                        title="فاتورة شراء بضاعة جديدة"
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
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'purchases' && purchasesSubView === 'invoices'
                            ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                            : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                        }`}
                        title="سجل فواتير الشراء"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Receipt className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">سجل فواتير الشراء</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('purchases');
                          setPurchasesSubView('suppliers');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'purchases' && purchasesSubView === 'suppliers'
                            ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                            : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                        }`}
                        title="دليل الموردين والشركات"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">دليل الموردين والشركات</span>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Sub-tree for Settings */}
                  {isSettingsItem && isSettingsMenuExpanded && (
                    <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
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
                            className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12.5px] transition-all duration-150 cursor-pointer ${
                              isSubActive
                                ? 'bg-paid dark:bg-paid-dark-soft dark:border dark:border-paid-bright/40 text-white dark:text-paid-bright font-medium shadow-2xs'
                                : 'text-ink-muted dark:text-ink-dark/85 hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-white font-normal'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark/75'}`} />
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
          <div className="pt-2 mt-auto border-t border-line dark:border-line-dark shrink-0 w-full flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => openHelpCenterModal(effectiveActiveTab)}
              title="مركز المساعدة والشروحات والدعم الفني (F1)"
              className={`w-full rounded-xl transition-all duration-150 flex items-center gap-2.5 font-medium cursor-pointer ${
                isSidebarCollapsed
                  ? 'h-[40px] justify-center text-paid dark:text-brand-bright hover:bg-paid-soft dark:hover:bg-brand-dark-soft border border-transparent hover:border-paid/30'
                  : 'px-3 h-[39px] text-[12.5px] text-paid dark:text-brand-bright hover:text-brand-dark dark:hover:text-white bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 border border-paid-border dark:border-paid/30 shadow-2xs'
              }`}
            >
              <HelpCircle className="w-4.5 h-4.5 text-paid dark:text-brand-bright shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate whitespace-nowrap">مركز المساعدة والدعم</span>
                  <span className="font-mono text-[10.5px] font-medium text-paid dark:text-brand-bright bg-surface dark:bg-surface-dark-2 px-1.5 py-0.5 rounded border border-paid-border dark:border-paid/30">
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
              className={`w-full rounded-xl transition-all duration-150 flex items-center gap-2.5 font-medium cursor-pointer ${
                isSidebarCollapsed
                  ? 'h-[40px] justify-center text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft border border-transparent hover:border-danger/30 dark:hover:border-danger-bright/30'
                  : 'px-3 h-[39px] text-[12.5px] text-danger dark:text-danger-bright hover:text-danger-ink dark:hover:text-white bg-danger-soft dark:bg-danger-dark-soft hover:bg-danger-soft/80 dark:hover:bg-danger-dark-soft/80 border border-danger/20 dark:border-danger-bright/30 shadow-2xs'
              }`}
            >
              <Power className="w-4.5 h-4.5 text-danger dark:text-danger-bright shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate whitespace-nowrap">إغلاق البرنامج</span>
                  <span className="font-mono text-[10.5px] font-medium text-danger dark:text-danger-bright bg-surface dark:bg-surface-dark px-1.5 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30">خروج</span>
                </div>
              )}
            </button>
          </div>
        </aside>

        {/* Dynamic Views Viewport - Lazy Keep-Alive Architecture */}
        <main className="flex-1 h-full overflow-hidden bg-canvas dark:bg-canvas-dark relative">
          {/* Universal Context-Aware Refresh Loading Overlay */}
          {isUniversalRefreshing && (
            <div className="absolute inset-0 z-50 bg-canvas/85 dark:bg-canvas-dark/85 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-150 select-none">
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-2xl rounded-2xl p-6 sm:p-8 flex flex-col items-center max-w-md w-full mx-4 animate-in zoom-in-95 duration-150">
                <RafiqLoadingState
                  label={currentRefreshInfo.label}
                  sublabel={currentRefreshInfo.sublabel}
                  icon={currentRefreshInfo.icon}
                  minHeight="min-h-0"
                />
              </div>
            </div>
          )}

          {/* POS View is always mounted, kept alive, and instant */}
          <div className={`h-full w-full ${effectiveActiveTab === 'pos' ? '' : 'hidden'}`}>
            <PosView 
              isActive={effectiveActiveTab === 'pos'} 
              onNavigateToEpay={() => { setActiveTab('epay'); setEpaySubTab('pos'); setIsEpayMenuExpanded(true); }} 
              onNavigateToWallets={(subTab = 'accounts') => { setActiveTab('wallets'); setWalletsSubTab(subTab); setIsWalletsMenuExpanded(true); }}
            />
          </div>

          {/* E-Payment Terminals & Services View (SuperPay / Fawry / Aman) */}
          {canAccessEpay && visitedTabs.has('epay') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'epay' ? '' : 'hidden'}`}>
              <EpayView 
                activeSubTab={epaySubTab}
                onSubTabChange={(tab) => setEpaySubTab(tab)}
              />
            </div>
          )}

          {/* Digital Accounts & Wallets View (Vodafone Cash / InstaPay) */}
          {canAccessWallets && visitedTabs.has('wallets') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'wallets' ? '' : 'hidden'}`}>
              <WalletsView 
                activeSubTab={walletsSubTab}
                onSubTabChange={(tab) => setWalletsSubTab(tab)}
              />
            </div>
          )}

          {!isCashier && visitedTabs.has('dashboard') && (
            <div className={`h-full w-full overflow-hidden ${effectiveActiveTab === 'dashboard' ? '' : 'hidden'}`}>
              {visitedDashboardSubTabs.has('today') && (
                <div className={`h-full w-full ${dashboardSubTab === 'today' ? '' : 'hidden'}`}>
                  <DashboardView 
                    isActive={effectiveActiveTab === 'dashboard' && dashboardSubTab === 'today'}
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
                  <RevenueAnalyticsView isActive={effectiveActiveTab === 'dashboard' && dashboardSubTab === 'revenue'} />
                </div>
              )}
              {visitedDashboardSubTabs.has('inventory') && (
                <div className={`h-full w-full ${dashboardSubTab === 'inventory' ? '' : 'hidden'}`}>
                  <InventoryAnalyticsView 
                    isActive={effectiveActiveTab === 'dashboard' && dashboardSubTab === 'inventory'}
                    onNavigateToProducts={(sub, filter) => {
                      setActiveTab('products');
                      setProductsSubView(sub || 'catalog');
                      if (filter) setInitialProductFilter(filter);
                      setIsProductsMenuExpanded(true);
                    }}
                    onNavigateToProductEdit={(productId) => {
                      setActiveTab('products');
                      setProductsSubView('catalog');
                      setProductToEditId(productId);
                      setIsProductsMenuExpanded(true);
                    }}
                    onNavigateToPurchases={() => {
                      setActiveTab('purchases');
                      setPurchasesSubView('new_invoice');
                      setIsPurchasesMenuExpanded(true);
                    }}
                  />
                </div>
              )}
              {visitedDashboardSubTabs.has('customers') && (
                <div className={`h-full w-full ${dashboardSubTab === 'customers' ? '' : 'hidden'}`}>
                  <CustomerAnalyticsView 
                    isActive={effectiveActiveTab === 'dashboard' && dashboardSubTab === 'customers'}
                    onNavigateToCustomers={() => setActiveTab('customers')} 
                  />
                </div>
              )}
            </div>
          )}

          {visitedTabs.has('customers') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'customers' ? '' : 'hidden'}`}>
              <CustomersView isActive={effectiveActiveTab === 'customers'} />
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
                initialProductIdToEdit={productToEditId}
                onClearInitialProductIdToEdit={() => setProductToEditId(null)}
              />
            </div>
          )}

          {!isCashier && visitedTabs.has('purchases') && (
            <div className={`h-full w-full ${effectiveActiveTab === 'purchases' ? '' : 'hidden'}`}>
              <PurchasesView 
                isActive={effectiveActiveTab === 'purchases'}
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
              <AuditLogView isActive={effectiveActiveTab === 'audit'} />
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
          try {
            localStorage.setItem('rafiq_first_run_completed', 'true');
            localStorage.setItem('rafiq_show_guided_tour', 'true');
            localStorage.removeItem('rafiq_wizard_state');
          } catch {
            // ignore
          }
          setIsFirstRunWizardOpen(false);
          setActiveTab('pos');
          window.location.reload();
        }}
      />

      {/* Guided Tour Modal (Feature #113 / Task 113-4) */}
      <GuidedTourModal
        isOpen={isTourOpen}
        onClose={() => {
          setIsTourOpen(false);
          try {
            localStorage.removeItem('rafiq_show_guided_tour');
            localStorage.setItem('rafiq_guided_tour_completed', 'true');
          } catch {
            // ignore
          }
        }}
        hasDemoData={hasDemoData}
        onLoadDemoData={async () => {
          try {
            const res: any = await invoke('demo:load');
            if (res && res.success) {
              setHasDemoData(true);
              setActiveTab('pos');
              try {
                localStorage.removeItem('rafiq_show_guided_tour');
                localStorage.setItem('rafiq_guided_tour_completed', 'true');
              } catch {
                // ignore
              }
              window.location.reload();
            }
          } catch (err) {
            console.error('Failed to load demo data:', err);
          }
        }}
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
        onSuccess={async () => {
          await refreshUser();
          setIsLoginModalOpen(false);
          setActiveTab('pos');
          emitDataChanged('all');
        }}
      />

      {/* Employee & Role Management Modal (Task 166-4) */}
      <UserManagerModal
        isOpen={isUserManagerOpen}
        currentUser={currentUser}
        onClose={() => setIsUserManagerOpen(false)}
        onUsersChanged={async () => {
          void refreshUser();
        }}
      />

      {/* Cash Drawer & Shift Lifecycle Modal (Top Bar & POS Shared) */}
      <ShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => {
          setIsShiftModalOpen(false);
          window.dispatchEvent(new CustomEvent('rafiq:close-shift-modal'));
        }}
        onShiftStatusChanged={(shift) => {
          setActiveShift(shift);
          window.dispatchEvent(new CustomEvent('rafiq:shift-updated', { detail: shift }));
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
