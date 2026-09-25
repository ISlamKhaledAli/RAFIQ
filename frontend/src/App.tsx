import { useState, useEffect, memo } from 'react';
import type { FC } from 'react';
import { 
  ShoppingCart, 
  Package, 
  FileText, 
  Settings, 
  User,
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
  Store,
  HardDrive,
  Printer,
  Activity,
  Barcode,
  KeyRound,
  FlaskConical
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
  const [isProductsMenuExpanded, setIsProductsMenuExpanded] = useState(true);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('profile');
  const [isSettingsMenuExpanded, setIsSettingsMenuExpanded] = useState(true);
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
  const [isFirstRunWizardOpen, setIsFirstRunWizardOpen] = useState(false);
  const [hasDemoData, setHasDemoData] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);

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
        if (res && res.isNeeded && isMounted) {
          setIsFirstRunWizardOpen(true);
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
  }, []);

  // Global F-keys shortcuts for switching tabs
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if modifier keys are pressed
      if (e.ctrlKey || e.altKey || e.shiftKey) return;

      if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('pos');
      } else if (e.key === 'F2') {
        // Only switch to dashboard if not currently in POS with cart
        // But POS handles F2 internally if focused on POS
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveTab('customers');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveTab('products');
        setIsProductsMenuExpanded(true);
      } else if (e.key === 'F7') {
        e.preventDefault();
        setActiveTab('sales');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setActiveTab('settings');
        setIsSettingsMenuExpanded(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        setActiveTab('audit');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const settingsTreeItems = [
    { id: 'profile' as SettingsSubTab, label: 'بيانات المحل والفاتورة', icon: Store },
    { id: 'backup' as SettingsSubTab, label: 'النسخ الاحتياطي وحماية البيانات', icon: HardDrive },
    { id: 'printer' as SettingsSubTab, label: 'إعدادات الطابعة والورق', icon: Printer },
    { id: 'system' as SettingsSubTab, label: 'مفاتيح الميزات وفحص النظام', icon: Activity },
    { id: 'scanner' as SettingsSubTab, label: 'قارئ الباركود (Wedge)', icon: Barcode },
    { id: 'security' as SettingsSubTab, label: 'الرقم السري وأمان الشاشات', icon: KeyRound },
    { id: 'demo' as SettingsSubTab, label: 'البيانات التجريبية والتدريب', icon: FlaskConical },
  ];

  const navItems = [
    { id: 'pos' as TabType, label: 'نقطة البيع (POS)', icon: ShoppingCart, shortcut: 'F1' },
    { id: 'dashboard' as TabType, label: 'لوحة اليوم والمتابعة', icon: LayoutDashboard, shortcut: 'لوحة' },
    { id: 'customers' as TabType, label: 'العملاء والآجل', icon: Users, shortcut: 'F4' },
    { id: 'products' as TabType, label: 'السلع والمخزن', icon: Package, shortcut: 'F6' },
    { id: 'sales' as TabType, label: 'سجل الفواتير', icon: FileText, shortcut: 'F7' },
    { id: 'audit' as TabType, label: 'سجل العمليات الحساسة', icon: ShieldAlert, shortcut: 'F10' },
    { id: 'settings' as TabType, label: 'إعدادات المحل والصيانة', icon: Settings, shortcut: 'F8' },
  ];

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
            <h1 className="text-[17px] font-bold text-ink leading-tight m-0">سوبرماركت رفيق</h1>
            <p className="text-[11px] text-ink-muted m-0 mt-0.5">نظام نقاط البيع وإدارة السوبرماركت</p>
          </div>
        </div>

        {/* Left Side: Offline status, Cashier Badge, Date, Time */}
        <div className="flex items-center gap-3 text-xs">
          {/* Offline Indicator */}
          <div className="flex items-center gap-1.5 bg-paid-soft border border-paid-border px-2.5 py-1 rounded text-paid font-medium">
            <span className="w-2 h-2 rounded-full bg-paid animate-pulse"></span>
            <span className="text-[11px] font-semibold">يعمل بدون إنترنت</span>
            <WifiOff className="w-3.5 h-3.5 text-paid opacity-75 mr-0.5" />
          </div>

          {/* Cashier Badge */}
          <div className="flex items-center gap-1.5 bg-surface-2 border border-line px-2.5 py-1 rounded text-ink text-[11px]">
            <User className="w-3.5 h-3.5 text-ink-muted" />
            <span className="font-medium">كاشير الوردية (1)</span>
          </div>

          {/* Readiness Checklist Button (Feature #137) */}
          <button
            type="button"
            onClick={() => setIsReadinessOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#006d41] border border-emerald-300 px-2.5 py-1 rounded text-[11px] font-bold transition-colors shadow-xs"
            title="فحص جاهزية النظام قبل أول بيع"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>جاهزية التشغيل</span>
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
            isSidebarCollapsed ? 'w-[64px] px-1 py-2 items-center' : 'w-[220px] p-3'
          } bg-surface hairline-l flex flex-col justify-between shrink-0 select-none transition-all duration-150`}
        >
          <nav className="flex flex-col gap-1.5 w-full">
            {!isSidebarCollapsed && (
              <div className="px-2 py-1 text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                القوائم الرئيسية
              </div>
            )}

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
                      setActiveTab(item.id);
                      if (isProductsItem) setProductsSubView('catalog');
                      if (isSettingsItem) setSettingsSubTab('profile');
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
                          setActiveTab('products');
                          setIsProductsMenuExpanded(true);
                        } else {
                          setIsProductsMenuExpanded(!isProductsMenuExpanded);
                        }
                      } else if (isSettingsItem) {
                        if (activeTab !== 'settings') {
                          setActiveTab('settings');
                          setIsSettingsMenuExpanded(true);
                        } else {
                          setIsSettingsMenuExpanded(!isSettingsMenuExpanded);
                        }
                      } else {
                        setActiveTab(item.id);
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

          {/* Sidebar Collapse/Expand Toggle Button (Task 159-2) */}
          <div className="pt-2 border-t border-line w-full flex items-center justify-center">
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
              title={isSidebarCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة (توفير مساحة 1024x768)'}
              className={`w-full h-[36px] rounded flex items-center justify-center gap-2 text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors text-[11px] ${
                isSidebarCollapsed ? 'px-1' : 'px-2.5'
              }`}
            >
              {isSidebarCollapsed ? (
                <PanelRightOpen className="w-4 h-4 text-brand" />
              ) : (
                <>
                  <PanelRightClose className="w-4 h-4 text-ink-muted" />
                  <span className="font-semibold">تصغير القائمة (1024×768)</span>
                </>
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
        onClose={() => setIsFirstRunWizardOpen(false)}
        onCompleted={() => {
          setIsFirstRunWizardOpen(false);
          setActiveTab('pos');
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
    </div>
  );
}
