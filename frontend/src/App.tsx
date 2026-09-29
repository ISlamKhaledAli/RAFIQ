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
  AlertTriangle,
  Database,
  ChevronDown,
  ChevronLeft,
  Tag,
  Boxes,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Store,
  HardDrive,
  Printer,
  Activity,
  Barcode,
  KeyRound,
  FlaskConical,
  Power
} from 'lucide-react';
import { invoke } from './bridge/ipc';
import { PosView } from './views/PosView';
import { DashboardView } from './views/DashboardView';
import { CustomersView } from './views/CustomersView';
import { ProductsView } from './views/ProductsView';
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

export interface SystemInfo {
  appName: string;
  version: string;
  osVersion: string;
  isWebView2: boolean;
  dbStatus: string;
}

export type TabType = 'pos' | 'dashboard' | 'customers' | 'products' | 'sales' | 'audit' | 'settings';

const formatLicenseExpiryTime = (details: LicenseExpiryDetails): string => {
  if (!details.expiresAt) return 'قريباً';
  try {
    const raw = details.expiresAt.trim();
    const d = new Date(raw.endsWith('Z') || raw.includes('T') ? raw : `${raw} UTC`);
    if (isNaN(d.getTime())) return details.expiresAt;
    const localTime = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const localDate = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
    if (details.daysRemaining <= 1) {
      return `اليوم الساعة ${localTime}`;
    }
    return `خلال ${details.daysRemaining} أيام (${localDate} ${localTime})`;
  } catch {
    return details.expiresAt;
  }
};

const LicenseExpiryBanner: FC<{
  licenseExpiry: LicenseExpiryDetails;
  onRenew: () => void;
}> = memo(({ licenseExpiry, onRenew }) => {
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isCritical, setIsCritical] = useState<boolean>(licenseExpiry.daysRemaining <= 1);

  useEffect(() => {
    if (!licenseExpiry.expiresAt) return;

    const updateTimer = () => {
      try {
        const raw = licenseExpiry.expiresAt.trim();
        const targetTime = new Date(raw.endsWith('Z') || raw.includes('T') ? raw : `${raw} UTC`).getTime();
        if (isNaN(targetTime)) return;

        const diffMs = targetTime - Date.now();
        if (diffMs <= 0) {
          setCountdown('00:00:00 (انتهى)');
          setIsCritical(true);
          return;
        }

        // When <= 24 hours (1 day)
        if (diffMs <= 24 * 60 * 60 * 1000) {
          setIsCritical(true);
          const totalSecs = Math.floor(diffMs / 1000);
          const hours = Math.floor(totalSecs / 3600);
          const minutes = Math.floor((totalSecs % 3600) / 60);
          const seconds = totalSecs % 60;
          setCountdown(
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          );
        } else {
          setIsCritical(false);
          setCountdown(null);
        }
      } catch {
        // ignore
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [licenseExpiry.expiresAt]);

  return (
    <div
      className={`px-4 py-2 flex items-center justify-between text-[12px] font-bold shrink-0 select-none border-b transition-colors ${
        isCritical
          ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
          : 'bg-amber-500 text-amber-950 border-amber-600/30'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Clock className={`w-4 h-4 shrink-0 ${isCritical ? 'text-rose-200 animate-pulse' : 'text-amber-900'}`} />
        <div className="flex items-center gap-2 flex-wrap">
          {isCritical ? (
            <>
              <span className="bg-rose-950/60 text-rose-100 px-2 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wide border border-rose-400/30">
                تنبيه حرج
              </span>
              <span>سينتهي اشتراك البرنامج قريباً جداً!</span>
              {countdown && (
                <span className="inline-flex items-center gap-1.5 bg-black/40 text-white px-2.5 py-0.5 rounded-full font-mono font-black text-xs tracking-wider border border-white/20 tabular-nums">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
                  متبقي {countdown}
                </span>
              )}
              <span className="text-rose-100 text-[11px] font-semibold">(ساعات : دقائق : ثواني)</span>
              <span>— يرجى التجديد لتفادي توقف نقاط البيع تلقائياً.</span>
            </>
          ) : (
            <span>
              تنبيه هام: سينتهي اشتراك البرنامج {formatLicenseExpiryTime(licenseExpiry)}. يرجى التجديد لتفادي توقف نقاط البيع تلقائياً.
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRenew}
          className={`${
            isCritical
              ? 'bg-white text-rose-700 hover:bg-rose-50 shadow-md'
              : 'bg-amber-950 hover:bg-black text-amber-100 shadow-xs'
          } text-xs px-3.5 py-1 rounded font-bold transition-all cursor-pointer`}
        >
          تجديد الترخيص الآن
        </button>
      </div>
    </div>
  );
});


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
    <div className="flex items-center gap-2 bg-white border border-[#dce1dc] px-3 py-1.5 rounded-xl tabular-nums text-[12px] font-semibold text-[#0f172a] shadow-2xs">
      <Clock className="w-3.5 h-3.5 text-[#52605d]" />
      <span className="text-[#52605d] font-normal text-[11px]">{date}</span>
      <span className="text-[#dce1dc]">|</span>
      <span className="font-mono text-[#006d41] font-bold tracking-wide">{time || '00:00:00'}</span>
    </div>
  );
});

const ADMIN_ONLY_TABS: TabType[] = ['dashboard', 'products', 'sales', 'audit', 'settings'];
const CASHIER_ALLOWED_TABS: TabType[] = ['pos', 'customers'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
  const isCashier = currentUser?.role === 'cashier';
  const effectiveActiveTab: TabType = isCashier && !CASHIER_ALLOWED_TABS.includes(activeTab) ? 'pos' : activeTab;
  const [productsSubView, setProductsSubView] = useState<'catalog' | 'movements'>('catalog');
  const [isProductsMenuExpanded, setIsProductsMenuExpanded] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('profile');
  const [isSettingsMenuExpanded, setIsSettingsMenuExpanded] = useState(false);
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
  const [isLockScreenOpen, setIsLockScreenOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isLicenseReadOnlyMode, setIsLicenseReadOnlyMode] = useState(false);

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
    const checkSettings = async () => {
      try {
        const s: any = await invoke('settings:getAll');
        if (s && isMounted) {
          if (s.store_name) setStoreName(s.store_name);
          if (s.cashier_name) setCashierName((prev) => prev || s.cashier_name);
        }
        const u: UserDto = await invoke('auth:getCurrentUser');
        if (u && isMounted) {
          setCurrentUser(u);
          setCashierName(u.displayName);
        }
        const sec: any = await invoke('security:getStatus');
        if (sec && isMounted && typeof sec.idleTimeoutMinutes === 'number') {
          setIdleTimeoutMinutes(sec.idleTimeoutMinutes);
        }
      } catch {
        // Ignore in dev
      }
    };
    void checkDemo();
    void checkSettings();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);


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
            setActiveTab('sales');
          } else if (e.key === '6') {
            e.preventDefault();
            setActiveTab('audit');
          } else if (e.key === '7') {
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

  const settingsTreeItems = [
    { id: 'profile' as SettingsSubTab, label: 'بيانات المتجر والفاتورة', icon: Store },
    { id: 'backup' as SettingsSubTab, label: 'النسخ الاحتياطي وحماية البيانات', icon: HardDrive },
    { id: 'printer' as SettingsSubTab, label: 'إعدادات الطابعة والورق', icon: Printer },
    { id: 'system' as SettingsSubTab, label: 'مفاتيح الميزات وفحص النظام', icon: Activity },
    { id: 'scanner' as SettingsSubTab, label: 'قارئ الباركود (Wedge)', icon: Barcode },
    { id: 'security' as SettingsSubTab, label: 'الرقم السري وأمان الشاشات', icon: KeyRound },
    { id: 'demo' as SettingsSubTab, label: 'البيانات التجريبية والتدريب', icon: FlaskConical },
  ];

  const allNavItems = [
    { id: 'pos' as TabType, label: 'نقطة البيع (POS)', icon: ShoppingCart, shortcut: 'F1 / Alt+1' },
    { id: 'dashboard' as TabType, label: 'لوحة اليوم والمتابعة', icon: LayoutDashboard, shortcut: 'Alt+2' },
    { id: 'customers' as TabType, label: 'العملاء والآجل', icon: Users, shortcut: 'Alt+3' },
    { id: 'products' as TabType, label: 'السلع والمخزن', icon: Package, shortcut: 'Alt+4' },
    { id: 'sales' as TabType, label: 'سجل الفواتير', icon: FileText, shortcut: 'Alt+5' },
    { id: 'audit' as TabType, label: 'سجل العمليات الحساسة', icon: ShieldAlert, shortcut: 'Alt+6' },
    { id: 'settings' as TabType, label: 'إعدادات المتجر والصيانة', icon: Settings, shortcut: 'Alt+7' },
  ];

  const navItems = currentUser?.role === 'cashier'
    ? allNavItems.filter((item) => CASHIER_ALLOWED_TABS.includes(item.id))
    : allNavItems;

  if (isFirstRunWizardOpen) {
    return (
      <div className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden select-none bg-[#f8fafc] dark:bg-slate-950" dir="rtl">
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
      {/* 1. TOP BAR (60px high, hairline-b, Spans across top) */}
      <header className="h-[60px] w-full bg-white hairline-b flex items-center justify-between px-5 shrink-0 z-20 shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
        {/* Right Side: Store Title & Status Badges */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#eaf5ee] border border-[#c4e3d0] flex items-center justify-center p-1.5 shadow-2xs">
            <img 
              src="/logo.png" 
              alt="رفيق" 
              className="w-full h-full object-contain drop-shadow-xs" 
            />
          </div>
          <div>
            <h1 className="text-[16px] font-extrabold text-[#0f172a] leading-tight m-0">{storeName || 'رفيق POS'}</h1>
            <p className="text-[10.5px] font-medium text-[#52605d] m-0 mt-0.5">نظام نقاط البيع وإدارة السوبرماركت</p>
          </div>
        </div>

        {/* Left Side: Offline status, Cashier Badge, Action Buttons, Date, Time */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* Offline Status Pill (Informational - Distinct from interactive buttons) */}
          <div className="flex items-center gap-1.5 bg-[#eaf5ee] border border-[#c4e3d0] px-2.5 py-1 rounded-xl text-[#006d41] font-bold text-[11px] select-none shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#006d41] animate-pulse"></span>
            <span>أوفلاين • محلي</span>
            <WifiOff className="w-3.5 h-3.5 text-[#006d41] opacity-80 mr-0.5" />
          </div>

          {/* Cashier / Employee Identity Badge (Clickable to switch user or lock screen) */}
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-[#dce1dc] hover:border-[#006d41]/50 px-2.5 py-1 rounded-xl text-[#0f172a] text-[11px] font-medium shadow-2xs transition-all cursor-pointer group active:scale-[0.98]"
            title="انقر لتبديل الموظف أو قفل الشاشة"
          >
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-extrabold ${
              currentUser?.role === 'admin' ? 'bg-[#b3720e] text-white shadow-2xs' : 'bg-[#006d41] text-white shadow-2xs'
            }`}>
              {currentUser?.displayName ? currentUser.displayName.slice(0, 1) : 'ك'}
            </div>
            <span className="font-bold text-[#0f172a]">{currentUser?.displayName || cashierName || 'كاشير (1)'}</span>
            <span className={`text-[9.5px] px-1.5 py-0.2 rounded-md font-bold ${
              currentUser?.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
            }`}>
              {currentUser?.role === 'admin' ? 'مدير' : 'كاشير'}
            </span>
            <KeyRound className="w-3 h-3 text-[#52605d] group-hover:text-[#006d41] transition-colors" />
          </button>

          {/* Manage Users Button for Admin (Task 166-4) */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setIsUserManagerOpen(true)}
              className="flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-white hover:bg-amber-50/70 border border-amber-200 hover:border-amber-300 text-amber-900 font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer"
              title="إدارة حسابات الموظفين والصلاحيات"
            >
              <Users className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="hidden lg:inline">الموظفون</span>
            </button>
          )}

          {/* Vertical subtle divider */}
          <div className="h-5 w-[1px] bg-[#dce1dc] mx-0.5 hidden sm:block" />

          {/* Readiness Checklist Button (Feature #137) - Admin Only */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setIsReadinessOpen(true)}
              className="flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-white hover:bg-[#eaf5ee] border border-[#c4e3d0] hover:border-[#006d41] text-[#006d41] font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer"
              title="فحص جاهزية النظام والعتاد قبل أول بيع"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#006d41] shrink-0" />
              <span>جاهزية التشغيل</span>
            </button>
          )}

          {/* Fullscreen Kiosk Mode Toggle - Tactile Interactive Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-[#dce1dc] hover:border-slate-400 text-[#0f172a] font-bold text-xs shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all cursor-pointer"
            title={isFullscreen ? 'الخروج من ملء الشاشة (F11)' : 'ملء الشاشة بالكامل وإخفاء شريط ويندوز (F11)'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="hidden sm:inline">نافذة عادية</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#006d41] shrink-0" />
                <span className="hidden sm:inline">ملء الشاشة</span>
              </>
            )}
            <kbd className="hidden md:inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px] font-bold">
              F11
            </kbd>
          </button>

          {/* Date & Time (Isolated Component) */}
          <HeaderClock />
        </div>
      </header>

      {/* Clock Sanity Warning Banner (Feature #127 / Task 127-2) */}
      {clockWarning && (
        <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-[12px] font-semibold shrink-0 animate-in slide-in-from-top-1 select-none">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-200" />
            <span className="whitespace-pre-line">{clockWarning}</span>
          </div>
          <button 
            type="button"
            onClick={() => setClockWarning(null)} 
            className="text-white hover:bg-black/20 text-xs px-2.5 py-1 rounded border border-white/30 transition-colors"
          >
            تجاهل التنبيه مؤقتاً
          </button>
        </div>
      )}

      {/* Feature #172 / Task 172-2: Expiry Warning Banner with Live Countdown */}
      {licenseExpiry && (licenseExpiry.status === 'warning' || licenseExpiry.daysRemaining <= 1) && !isLockScreenOpen && !isLicenseReadOnlyMode && (
        <LicenseExpiryBanner
          licenseExpiry={licenseExpiry}
          onRenew={() => setIsLicenseModalOpen(true)}
        />
      )}

      {/* Feature #172 / Task 172-5: Read-Only Mode Banner */}
      {isLicenseReadOnlyMode && (
        <div className="bg-amber-700 text-white px-4 py-2 flex items-center justify-between text-[12px] font-bold shrink-0 animate-in slide-in-from-top-1 select-none border-b border-white/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-200" />
            <span>وضع القراءة والنسخ الاحتياطي نشط: انتهت فترة الاشتراك. عمليات البيع معطلة، ويتاح فقط عرض التقارير والمبيعات السابقة وأخذ نسخة احتياطية.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLockScreenOpen(true)}
              className="bg-white text-amber-900 hover:bg-amber-100 text-xs px-3 py-1 rounded font-bold transition-colors shadow-xs"
            >
              تفعيل الترخيص / التحقق
            </button>
          </div>
        </div>
      )}

      {/* Backup Overdue Warning Banner (Feature #9 / Task 9-6) - Admin Only */}
      {currentUser?.role === 'admin' && backupWarning && (
        <div className="bg-brand text-white px-4 py-2 flex items-center justify-between text-[12px] font-semibold shrink-0 animate-in slide-in-from-top-1 select-none border-b border-white/10">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 shrink-0 text-paid" />
            <span className="whitespace-pre-line">{backupWarning}</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => {
                setActiveTab('settings');
                setSettingsSubTab('backup');
                setIsSettingsMenuExpanded(true);
              }} 
              className="bg-paid hover:bg-paid-hover text-white text-xs px-3 py-1 rounded font-bold transition-colors shadow-xs"
            >
              فتح شاشة النسخ الاحتياطي
            </button>
            <button 
              type="button"
              onClick={() => setBackupWarning(null)} 
              className="text-white/80 hover:bg-white/10 text-xs px-2 py-1 rounded transition-colors"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {/* Demo Mode Active Banner (Feature #113 / Task 113-3) */}
      {hasDemoData && (
        <div className="bg-amber-500 text-amber-950 px-4 py-1.5 flex items-center justify-between text-[12px] font-bold shrink-0 animate-in slide-in-from-top-1 select-none border-b border-amber-600/30">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <span>وضع تجريبي نشط: يحتوي النظام على بيانات نموذجية لتدريب الكاشير وتجربة البرنامج.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTourOpen(true)}
              className="bg-white/90 hover:bg-white text-amber-950 text-xs px-2.5 py-0.5 rounded font-bold transition-colors shadow-xs"
            >
              جولة النظام (5 خطوات)
            </button>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setSettingsSubTab('demo');
                  setIsSettingsMenuExpanded(true);
                }}
                className="bg-amber-950 hover:bg-black text-white text-xs px-2.5 py-0.5 rounded transition-colors"
              >
                إدارة ومسح البيانات
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. MAIN APP SHELL (Sidebar Navigation + Dynamic Content Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar (RTL Right side, Responsive Collapsible: 68px collapsed / 230px expanded) */}
        <aside 
          className={`${
            isSidebarCollapsed ? 'w-[68px] px-2 py-3 items-center' : 'w-[230px] p-3'
          } bg-white hairline-l flex flex-col shrink-0 select-none transition-all duration-150 h-full min-h-0 overflow-hidden shadow-[2px_0_6px_rgba(0,0,0,0.02)]`}
        >
          {/* Top Header of Sidebar: Title + Toggle Icon Button */}
          <div className={`w-full flex items-center mb-2 pb-2 border-b border-[#dce1dc] shrink-0 ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}>
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-bold text-[#52605d] uppercase tracking-wider">
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
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#52605d] hover:text-[#00372d] hover:bg-[#eaf5ee] transition-colors cursor-pointer"
            >
              {isSidebarCollapsed ? (
                <PanelRightOpen className="w-4 h-4 text-[#00372d]" />
              ) : (
                <PanelRightClose className="w-4 h-4 text-[#52605d] hover:text-[#00372d]" />
              )}
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1.5 w-full overflow-y-auto overflow-x-hidden min-h-0 py-0.5">

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = effectiveActiveTab === item.id;
              const isProductsItem = item.id === 'products';
              const isSettingsItem = item.id === 'settings';

              if (isSidebarCollapsed) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      handleNavClick(item.id, () => {
                        if (isProductsItem) setProductsSubView('catalog');
                        if (isSettingsItem) setSettingsSubTab('profile');
                      });
                    }}
                    title={`${item.label} (${item.shortcut})`}
                    className={`relative w-full h-[46px] rounded-xl flex items-center justify-center transition-all duration-150 group cursor-pointer ${
                      isActive
                        ? 'bg-[#00372d] text-white shadow-xs'
                        : 'text-[#52605d] hover:bg-[#f1f5f4] hover:text-[#0f172a]'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-[#52605d] group-hover:text-[#0f172a]'}`} />
                    <span className="sr-only">{item.label}</span>
                  </button>
                );
              }

              return (
                <div key={item.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      if (isProductsItem) {
                        if (effectiveActiveTab !== 'products') {
                          handleNavClick('products', () => setIsProductsMenuExpanded(true));
                        } else {
                          setIsProductsMenuExpanded(!isProductsMenuExpanded);
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
                    className={`w-full relative flex items-center justify-between px-3 h-[44px] rounded-xl text-[13px] transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-[#00372d] text-white font-bold shadow-xs'
                        : 'text-[#52605d] hover:bg-[#f1f5f4] hover:text-[#0f172a] font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-white' : 'text-[#52605d]'}`} />
                      <span>{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.shortcut && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${
                          isActive
                            ? 'bg-white/15 text-white/90 border-white/20'
                            : 'bg-slate-100 text-[#52605d] border-[#dce1dc]'
                        }`}>
                          {item.shortcut}
                        </span>
                      )}
                      {(isProductsItem || isSettingsItem) && (
                        <span className={isActive ? 'text-white/80' : 'text-[#52605d]'}>
                          {(isProductsItem ? isProductsMenuExpanded : isSettingsMenuExpanded) ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronLeft className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Sub-tree for Products & Inventory */}
                  {isProductsItem && isProductsMenuExpanded && (
                    <div className="mr-3 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-[#00372d]/25 animate-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('products');
                          setProductsSubView('catalog');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                          effectiveActiveTab === 'products' && productsSubView === 'catalog'
                            ? 'bg-[#006d41] text-white font-bold shadow-2xs'
                            : 'text-[#52605d] hover:bg-[#f1f5f4] hover:text-[#0f172a] font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5" />
                          <span>كتالوج الأصناف</span>
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
                            ? 'bg-[#006d41] text-white font-bold shadow-2xs'
                            : 'text-[#52605d] hover:bg-[#f1f5f4] hover:text-[#0f172a] font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Boxes className="w-3.5 h-3.5" />
                          <span>حركات وجرد المخزون</span>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Sub-tree for Settings */}
                  {isSettingsItem && isSettingsMenuExpanded && (
                    <div className="mr-3 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-[#00372d]/25 animate-in slide-in-from-top-1 duration-150">
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
                                ? 'bg-[#006d41] text-white font-bold shadow-2xs'
                                : 'text-[#52605d] hover:bg-[#f1f5f4] hover:text-[#0f172a] font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-[#52605d]'}`} />
                              <span className="truncate">{sub.label}</span>
                            </div>
                            {sub.id === 'demo' && hasDemoData && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
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

          {/* Bottom Exit App Button */}
          <div className="pt-2 mt-auto border-t border-line shrink-0 w-full">
            <button
              type="button"
              onClick={() => void handleExitApp()}
              title="إغلاق البرنامج والخروج بأمان"
              className={`w-full rounded-xl transition-all duration-150 flex items-center gap-2.5 font-bold ${
                isSidebarCollapsed
                  ? 'h-[44px] justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200'
                  : 'px-3 py-2.5 text-xs text-rose-600 hover:text-rose-700 bg-rose-50/60 hover:bg-rose-100/80 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 border border-rose-200/80 dark:border-rose-900/50 shadow-xs'
              }`}
            >
              <Power className="w-4 h-4 text-rose-600 shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate">إغلاق البرنامج</span>
                  <span className="font-mono text-[10px] text-rose-400 bg-rose-100/80 dark:bg-rose-900/40 px-1.5 py-0.5 rounded">خروج</span>
                </div>
              )}
            </button>
          </div>
        </aside>

        {/* Dynamic Views Viewport */}
        <main className="flex-1 h-full overflow-hidden bg-canvas">
          {effectiveActiveTab === 'pos' && <PosView />}
          {!isCashier && effectiveActiveTab === 'dashboard' && (
            <DashboardView 
              onNavigateToPos={() => setActiveTab('pos')} 
              onNavigateToProducts={(sub?: 'catalog' | 'movements') => {
                setActiveTab('products');
                setProductsSubView(sub || 'catalog');
                setIsProductsMenuExpanded(true);
              }} 
              onNavigateToCustomers={() => setActiveTab('customers')}
              onNavigateToSales={() => setActiveTab('sales')}
              onNavigateToAudit={() => setActiveTab('audit')}
              onNavigateToSettings={(target) => {
                setActiveTab('settings');
                if (target?.includes('backup')) setSettingsSubTab('backup');
              }}
            />
          )}
          {effectiveActiveTab === 'customers' && <CustomersView />}
          {!isCashier && effectiveActiveTab === 'products' && (
            <ProductsView 
              subView={productsSubView} 
              onSubViewChange={(tab) => setProductsSubView(tab)} 
            />
          )}
          {!isCashier && effectiveActiveTab === 'sales' && <SalesHistoryView />}
          {!isCashier && effectiveActiveTab === 'audit' && <AuditLogView />}
          {!isCashier && effectiveActiveTab === 'settings' && (
            <SettingsView 
              sysInfo={sysInfo} 
              activeSubTab={settingsSubTab} 
              onSubTabChange={(tab) => setSettingsSubTab(tab)} 
            />
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

      {/* Global Rafiq Custom Dialog Modal System */}
      <RafiqDialogContainer />
    </div>
  );
}
