import { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Package, 
  FileText, 
  Settings, 
  User,
  Clock,
  WifiOff,
  CheckCircle2
} from 'lucide-react';
import { invoke } from './bridge/ipc';
import { PosView } from './views/PosView';
import { ProductsView } from './views/ProductsView';
import { SalesHistoryView } from './views/SalesHistoryView';
import { SettingsView } from './views/SettingsView';

export interface SystemInfo {
  appName: string;
  version: string;
  osVersion: string;
  isWebView2: boolean;
  dbStatus: string;
}

export type TabType = 'pos' | 'products' | 'sales' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

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

    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
      setCurrentDate(now.toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }));
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const navItems = [
    { id: 'pos' as TabType, label: 'نقطة البيع (POS)', icon: ShoppingCart, shortcut: 'F1' },
    { id: 'products' as TabType, label: 'السلع والمخزن', icon: Package, shortcut: 'F6' },
    { id: 'sales' as TabType, label: 'سجل الفواتير', icon: FileText, shortcut: 'F7' },
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
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-ink leading-none m-0">سوبرماركت رفيق</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-soft text-brand font-mono font-bold border border-line">
                v1.0.0
              </span>
            </div>
            <p className="text-[11px] text-ink-muted m-0 mt-0.5">نظام نقاط البيع وإدارة السوبرماركت (أوفلاين)</p>
          </div>
        </div>

        {/* Left Side: Offline status, SQLite WAL, Date, Time */}
        <div className="flex items-center gap-3 text-xs">
          {/* Offline Indicator matching design spec */}
          <div className="flex items-center gap-1.5 bg-paid-soft border border-paid-border px-2.5 py-1 rounded text-paid font-medium">
            <span className="w-2 h-2 rounded-full bg-paid animate-pulse"></span>
            <span className="text-[11px] font-semibold">يعمل بدون إنترنت</span>
            <WifiOff className="w-3.5 h-3.5 text-paid opacity-75 mr-0.5" />
          </div>

          {/* SQLite WAL Indicator */}
          <div className="flex items-center gap-1.5 bg-surface-2 border border-line px-2.5 py-1 rounded text-ink-muted font-mono text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
            <span className="text-ink font-semibold">SQLite WAL</span>
          </div>

          {/* Cashier Badge */}
          <div className="flex items-center gap-1.5 bg-surface-2 border border-line px-2.5 py-1 rounded text-ink text-[11px]">
            <User className="w-3.5 h-3.5 text-ink-muted" />
            <span className="font-medium">كاشير الوردية (1)</span>
          </div>

          {/* Date & Time */}
          <div className="flex items-center gap-2 bg-surface-2 border border-line px-3 py-1 rounded tabular-nums text-[12px] font-semibold text-ink">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span className="text-ink-muted font-normal text-[11px]">{currentDate}</span>
            <span className="text-line">|</span>
            <span className="font-mono text-brand font-bold">{currentTime || '00:00:00'}</span>
          </div>
        </div>
      </header>

      {/* 2. MAIN APP SHELL (Sidebar Navigation + Dynamic Content Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar (RTL Right side, 220px fixed) */}
        <aside className="w-[220px] bg-surface hairline-l flex flex-col justify-between shrink-0 p-3 select-none">
          <nav className="flex flex-col gap-1.5">
            <div className="px-2 py-1 text-[11px] font-bold text-ink-muted uppercase tracking-wider">
              القوائم الرئيسية
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full relative flex items-center justify-between px-3 h-[46px] rounded text-[13px] transition-colors ${
                    isActive
                      ? 'bg-brand-soft text-brand font-bold'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-brand' : 'text-ink-muted'}`} />
                    <span>{item.label}</span>
                  </div>

                  {isActive && (
                    <div className="absolute right-0 top-0 bottom-0 w-[3.5px] bg-brand rounded-r"></div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User & Environment Card Footer */}
          <div className="p-3 rounded border border-line bg-surface-2 text-[11px] text-ink-muted flex flex-col gap-1.5 font-mono">
            <div className="flex justify-between items-center text-ink font-semibold">
              <span className="font-sans">المشغّل:</span>
              <span className="text-brand font-bold">{sysInfo?.isWebView2 ? 'Fixed 109' : 'Dev Web'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-sans">نظام التشغيل:</span>
              <span className="text-[10px] text-ink truncate max-w-[110px]" title={sysInfo?.osVersion || 'Windows'}>
                {sysInfo?.osVersion ? sysInfo.osVersion.split(' ')[0] : 'Windows'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-line">
              <span className="font-sans">الحساب المالي:</span>
              <span className="text-paid font-bold">Integer (قروش)</span>
            </div>
          </div>
        </aside>

        {/* Dynamic Views Viewport */}
        <main className="flex-1 h-full overflow-hidden bg-canvas">
          {activeTab === 'pos' && <PosView />}
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'sales' && <SalesHistoryView />}
          {activeTab === 'settings' && <SettingsView sysInfo={sysInfo} />}
        </main>
      </div>
    </div>
  );
}
