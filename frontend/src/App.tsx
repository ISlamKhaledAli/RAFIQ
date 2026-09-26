import { useState, useEffect, memo } from 'react';
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
import { rafiqConfirm } from './utils/dialogService';
import type { UserDto } from './bridge/ipc';
import { LoginModal } from './components/LoginModal';
import { UserManagerModal } from './components/UserManagerModal';
import { SupervisorPromptModal } from './components/SupervisorPromptModal';

export interface SystemInfo {
  appName: string;
  version: string;
  osVersion: string;
  isWebView2: boolean;
  dbStatus: string;
}

export type TabType = 'pos' | 'dashboard' | 'customers' | 'products' | 'sales' | 'audit' | 'settings';

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
      setDate(now.toLocaleDateString('ar-EG', {
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
    <div className="flex items-center gap-2 bg-surface-2 border border-line px-3 py-1 rounded tabular-nums text-[12px] font-semibold text-ink">
      <Clock className="w-3.5 h-3.5 text-ink-muted" />
      <span className="text-ink-muted font-normal text-[11px]">{date}</span>
      <span className="text-line">|</span>
      <span className="font-mono text-brand font-bold">{time || '00:00:00'}</span>
    </div>
  );
});

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');
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
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
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
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('dashboard');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('customers');
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
  }, [activeTab]);

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
    const adminTabs: TabType[] = ['settings', 'sales', 'audit'];
    if (currentUser?.role === 'cashier' && adminTabs.includes(tabId)) {
      const tabNames: Record<string, string> = {
        settings: 'شاشة الإعدادات',
        sales: 'سجل المبيعات والتقارير',
        audit: 'سجل العمليات والرقابة',
      };
      setSupervisorPrompt({
        isOpen: true,
        title: `فتح ${tabNames[tabId] || 'القسم المطلوب'}`,
        description: 'هذا القسم مخصص لمدير النظام. يرجى إدخال الرقم السري لمدير النظام للمتابعة.',
        onApproved: () => {
          setActiveTab(tabId);
          if (subAction) subAction();
          setSupervisorPrompt((p) => ({ ...p, isOpen: false }));
        },
      });
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

  const navItems = [
    { id: 'pos' as TabType, label: 'نقطة البيع (POS)', icon: ShoppingCart, shortcut: 'F1 / Alt+1' },
    { id: 'dashboard' as TabType, label: 'لوحة اليوم والمتابعة', icon: LayoutDashboard, shortcut: 'Alt+2' },
    { id: 'customers' as TabType, label: 'العملاء والآجل', icon: Users, shortcut: 'Alt+3' },
    { id: 'products' as TabType, label: 'السلع والمخزن', icon: Package, shortcut: 'Alt+4' },
    { id: 'sales' as TabType, label: 'سجل الفواتير', icon: FileText, shortcut: 'Alt+5' },
    { id: 'audit' as TabType, label: 'سجل العمليات الحساسة', icon: ShieldAlert, shortcut: 'Alt+6' },
    { id: 'settings' as TabType, label: 'إعدادات المتجر والصيانة', icon: Settings, shortcut: 'Alt+7' },
  ];

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
      <header className="h-[60px] w-full bg-surface hairline-b flex items-center justify-between px-5 shrink-0 z-20">
        {/* Right Side: Store Title & Status Badges */}
        <div className="flex items-center gap-3">
          <img 
            src="/logo.png" 
            alt="رفيق" 
            className="w-8 h-8 object-contain drop-shadow-sm" 
          />
          <div>
            <h1 className="text-[17px] font-bold text-ink leading-tight m-0">{storeName || 'رفيق POS'}</h1>
            <p className="text-[11px] text-ink-muted m-0 mt-0.5">نظام نقاط البيع وإدارة المتاجر</p>
          </div>
        </div>

        {/* Left Side: Offline status, Cashier Badge, Action Buttons, Date, Time */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* Offline Status Pill (Informational - Distinct from interactive buttons) */}
          <div className="flex items-center gap-1.5 bg-emerald-50/90 border border-emerald-200/80 px-2.5 py-1 rounded-full text-emerald-800 font-semibold text-[11px] select-none shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <span>أوفلاين • محلي</span>
            <WifiOff className="w-3.5 h-3.5 text-emerald-700 opacity-75 mr-0.5" />
          </div>

          {/* Cashier / Employee Identity Badge (Clickable to switch user or lock screen) */}
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300/80 px-2.5 py-1 rounded-full text-slate-700 text-[11px] font-medium shadow-2xs transition-all cursor-pointer group"
            title="انقر لتبديل الموظف أو قفل الشاشة"
          >
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
              currentUser?.role === 'admin' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
            }`}>
              {currentUser?.displayName ? currentUser.displayName.slice(0, 1) : 'ك'}
            </div>
            <span className="font-bold text-slate-900">{currentUser?.displayName || cashierName || 'كاشير (1)'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
              currentUser?.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {currentUser?.role === 'admin' ? 'مدير' : 'كاشير'}
            </span>
            <KeyRound className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
          </button>

          {/* Manage Users Button for Admin (Task 166-4) */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setIsUserManagerOpen(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white hover:bg-amber-50 active:bg-amber-100 text-amber-800 border border-amber-300/90 hover:border-amber-400 border-b-2 border-b-amber-500/70 font-bold text-xs shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
              title="إدارة حسابات الموظفين والصلاحيات"
            >
              <Users className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="hidden lg:inline">الموظفون</span>
            </button>
          )}

          {/* Vertical subtle divider */}
          <div className="h-5 w-[1px] bg-slate-200 mx-0.5 hidden sm:block" />

          {/* Readiness Checklist Button (Feature #137) - Tactile Interactive Button */}
          <button
            type="button"
            onClick={() => setIsReadinessOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white hover:bg-emerald-50/80 active:bg-emerald-100 text-[#006d41] border border-emerald-300/90 hover:border-emerald-500 border-b-2 border-b-emerald-500/70 font-bold text-xs shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
            title="فحص جاهزية النظام والعتاد قبل أول بيع"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>جاهزية التشغيل</span>
          </button>

          {/* Fullscreen Kiosk Mode Toggle - Tactile Interactive Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 font-bold text-xs shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
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
            <kbd className="hidden md:inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px] font-bold">
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

      {/* Backup Overdue Warning Banner (Feature #9 / Task 9-6) */}
      {backupWarning && (
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
          </div>
        </div>
      )}

      {/* 2. MAIN APP SHELL (Sidebar Navigation + Dynamic Content Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar (RTL Right side, Responsive Collapsible: 64px collapsed / 220px expanded) */}
        <aside 
          className={`${
            isSidebarCollapsed ? 'w-[64px] px-1 py-2 items-center' : 'w-[225px] p-3'
          } bg-surface hairline-l flex flex-col shrink-0 select-none transition-all duration-150 h-full min-h-0 overflow-hidden`}
        >
          {/* Top Header of Sidebar: Title + Toggle Icon Button */}
          <div className={`w-full flex items-center mb-2 pb-2 border-b border-line shrink-0 ${
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
              className="w-7 h-7 rounded-md flex items-center justify-center text-ink-muted hover:text-brand hover:bg-brand-soft/70 transition-colors"
            >
              {isSidebarCollapsed ? (
                <PanelRightOpen className="w-4 h-4 text-brand" />
              ) : (
                <PanelRightClose className="w-4 h-4 text-ink-muted hover:text-brand" />
              )}
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1.5 w-full overflow-y-auto overflow-x-hidden min-h-0 py-0.5">

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
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
                    className={`relative w-full h-[44px] rounded flex items-center justify-center transition-colors group ${
                      isActive
                        ? 'bg-brand-soft text-brand font-bold'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-brand' : 'text-ink-muted group-hover:text-ink'}`} />
                    {isActive && (
                      <span className="absolute right-0 top-1.5 bottom-1.5 w-[3px] bg-brand rounded-r" />
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
                      if (isProductsItem) {
                        if (activeTab !== 'products') {
                          handleNavClick('products', () => setIsProductsMenuExpanded(true));
                        } else {
                          setIsProductsMenuExpanded(!isProductsMenuExpanded);
                        }
                      } else if (isSettingsItem) {
                        if (activeTab !== 'settings') {
                          handleNavClick('settings', () => setIsSettingsMenuExpanded(true));
                        } else {
                          setIsSettingsMenuExpanded(!isSettingsMenuExpanded);
                        }
                      } else {
                        handleNavClick(item.id);
                      }
                    }}
                    className={`w-full relative flex items-center justify-between px-3 h-[44px] rounded text-[13px] transition-colors ${
                      isActive
                        ? 'bg-brand-soft text-brand font-bold'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-brand' : 'text-ink-muted'}`} />
                      <span>{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.shortcut && (
                        <span className="text-[10px] font-mono text-ink-muted/70 bg-surface-2 px-1 rounded border border-line">
                          {item.shortcut}
                        </span>
                      )}
                      {(isProductsItem || isSettingsItem) && (
                        <span className="text-ink-muted/70">
                          {(isProductsItem ? isProductsMenuExpanded : isSettingsMenuExpanded) ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronLeft className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>

                    {isActive && (
                      <div className="absolute right-0 top-0 bottom-0 w-[3.5px] bg-brand rounded-r"></div>
                    )}
                  </button>

                  {/* Sub-tree for Products & Inventory */}
                  {isProductsItem && isProductsMenuExpanded && (
                    <div className="mr-4 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-brand/20 animate-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('products');
                          setProductsSubView('catalog');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 h-[32px] rounded text-[12px] transition-colors ${
                          activeTab === 'products' && productsSubView === 'catalog'
                            ? 'bg-brand text-white font-bold shadow-xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
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
                        className={`w-full flex items-center justify-between px-2.5 h-[32px] rounded text-[12px] transition-colors ${
                          activeTab === 'products' && productsSubView === 'movements'
                            ? 'bg-brand text-white font-bold shadow-xs'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
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
                    <div className="mr-4 pr-2.5 my-1 flex flex-col gap-1 border-r-2 border-brand/20 animate-in slide-in-from-top-1 duration-150">
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
                            className={`w-full flex items-center justify-between px-2.5 h-[32px] rounded text-[12px] transition-colors ${
                              isSubActive
                                ? 'bg-brand text-white font-bold shadow-xs'
                                : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-ink-muted'}`} />
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
          {activeTab === 'pos' && <PosView />}
          {activeTab === 'dashboard' && (
            <DashboardView 
              onNavigateToPos={() => setActiveTab('pos')} 
              onNavigateToProducts={() => {
                setActiveTab('products');
                setProductsSubView('catalog');
                setIsProductsMenuExpanded(true);
              }} 
              onNavigateToCustomers={() => setActiveTab('customers')}
              onNavigateToSales={() => setActiveTab('sales')}
            />
          )}
          {activeTab === 'customers' && <CustomersView />}
          {activeTab === 'products' && (
            <ProductsView subView={productsSubView} />
          )}
          {activeTab === 'sales' && <SalesHistoryView />}
          {activeTab === 'audit' && <AuditLogView />}
          {activeTab === 'settings' && (
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

      {/* Global Rafiq Custom Dialog Modal System */}
      <RafiqDialogContainer />
    </div>
  );
}
