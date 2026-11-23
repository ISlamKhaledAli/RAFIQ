import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Product, Store } from '../../types';
import type { AdminOrder } from './OrderPrintReceipt';
import {
  alertNewOrder,
  requestNotificationPermission,
  getNotificationPermission,
} from './audioChime';
import {
  Search,
  RefreshCw,
  Volume2,
  VolumeX,
  Bell,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  ChevronLeft,
  BadgeCheck,
  ShoppingBag,
  TrendingUp,
  Package,
  Palette,
  Settings,
  X,
  ArrowUpLeft,
  Clock,
  CheckCircle2,
  PauseCircle,
  Command,
} from 'lucide-react';

export type AdminHeaderTab = 'orders' | 'overview' | 'products' | 'settings' | 'theme';

interface Props {
  store: Store;
  storeName: string;
  isDemoStore: boolean;
  activeTab: AdminHeaderTab;
  orders: AdminOrder[];
  products: Product[];
  pendingOrdersCount: number;
  isLoadingOrders: boolean;
  soundEnabled: boolean;
  copiedHeaderLink: boolean;
  onRefresh: () => void;
  onToggleSound: () => void;
  onCopyUrl: () => void;
  onOpenStore: () => void;
  onLogout: () => void;
  onNavigateTab: (tab: AdminHeaderTab) => void;
  onSelectOrder: (orderId: string) => void;
}

const TAB_CONFIG: Record<
  AdminHeaderTab,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  orders: { label: 'الأوردرات والطلبات', icon: ShoppingBag },
  overview: { label: 'المبيعات والتقارير', icon: TrendingUp },
  products: { label: 'الأصناف والمخزون', icon: Package },
  theme: { label: 'القالب والألوان', icon: Palette },
  settings: { label: 'إعدادات المتجر', icon: Settings },
};

interface CommandItem {
  id: string;
  group: 'orders' | 'products' | 'navigation' | 'actions';
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

export const AdminTopHeader: React.FC<Props> = ({
  store,
  storeName,
  isDemoStore,
  activeTab,
  orders,
  products,
  pendingOrdersCount,
  isLoadingOrders,
  soundEnabled,
  copiedHeaderLink,
  onRefresh,
  onToggleSound,
  onCopyUrl,
  onOpenStore,
  onLogout,
  onNavigateTab,
  onSelectOrder,
}) => {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [activeCommandIdx, setActiveCommandIdx] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  const commandInputRef = useRef<HTMLInputElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const ActiveTabIcon = TAB_CONFIG[activeTab].icon;

  // Global Ctrl+K / Cmd+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBellOpen(false);
        setCommandOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
        setBellOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus input when Command Palette opens
  useEffect(() => {
    if (commandOpen) {
      setCommandQuery('');
      setActiveCommandIdx(0);
      window.setTimeout(() => commandInputRef.current?.focus(), 20);
    }
  }, [commandOpen]);

  // Close Bell popover on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [bellOpen]);

  const pendingOrders = useMemo(
    () => orders.filter(o => o.status === 'new' || o.status === 'viewed').slice(0, 6),
    [orders]
  );

  // Build dynamic Command Palette results
  const commandItems = useMemo<CommandItem[]>(() => {
    const q = commandQuery.trim().toLowerCase();
    const results: CommandItem[] = [];

    // 1. Matching Orders
    const matchedOrders = orders
      .filter(o => {
        if (!q) return o.status === 'new' || o.status === 'viewed';
        return (
          String(o.order_number).includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.includes(q) ||
          o.address_zone.toLowerCase().includes(q)
        );
      })
      .slice(0, q ? 5 : 3);

    for (const o of matchedOrders) {
      results.push({
        id: `ord-${o.id}`,
        group: 'orders',
        title: `أوردر #ORD-${o.order_number} — ${o.customer_name}`,
        subtitle: `${o.address_zone} • ${(o.total / 100).toFixed(2)} ج.م`,
        badge: o.status === 'new' || o.status === 'viewed' ? 'جديد' : undefined,
        icon: ShoppingBag,
        onSelect: () => {
          onSelectOrder(o.id);
          onNavigateTab('orders');
          setCommandOpen(false);
        },
      });
    }

    // 2. Matching Products (only when typing or top 3 if searching)
    if (q) {
      const matchedProducts = products
        .filter(
          p =>
            p.name.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q))
        )
        .slice(0, 5);

      for (const p of matchedProducts) {
        results.push({
          id: `prod-${p.id}`,
          group: 'products',
          title: p.name,
          subtitle: `${(p.price_piasters / 100).toFixed(2)} ج.م • المخزون: ${Math.round(p.stock_quantity / 1000)}`,
          badge: p.is_online === 0 ? 'مخفي' : 'معروض',
          icon: Package,
          onSelect: () => {
            onNavigateTab('products');
            setCommandOpen(false);
          },
        });
      }
    }

    // 3. Navigation Tabs
    const navEntries: Array<{ id: AdminHeaderTab; keywords: string }> = [
      { id: 'orders', keywords: 'أوردرات طلبات توصيل جديد' },
      { id: 'overview', keywords: 'مبيعات تقارير أرباح تحليلات' },
      { id: 'products', keywords: 'أصناف منتجات أقسام إخفاء صور مخزون' },
      { id: 'theme', keywords: 'قالب ألوان هوية تصميم' },
      { id: 'settings', keywords: 'إعدادات توصيل مناطق واتساب رمز سري pin إغلاق' },
    ];
    for (const entry of navEntries) {
      const meta = TAB_CONFIG[entry.id];
      if (!q || meta.label.toLowerCase().includes(q) || entry.keywords.includes(q)) {
        results.push({
          id: `nav-${entry.id}`,
          group: 'navigation',
          title: meta.label,
          subtitle: entry.id === activeTab ? 'القسم المفتوح حالياً' : 'انتقال سريع للقسم',
          icon: meta.icon,
          onSelect: () => {
            onNavigateTab(entry.id);
            setCommandOpen(false);
          },
        });
      }
    }

    // 4. Quick Utility Actions
    const quickActions: Array<{ id: string; title: string; keywords: string; icon: React.ComponentType<{ className?: string }>; run: () => void }> = [
      {
        id: 'act-open-store',
        title: 'معاينة المتجر الإلكتروني المباشر',
        keywords: 'فتح معاينة متجر رابط',
        icon: ExternalLink,
        run: () => {
          setCommandOpen(false);
          onOpenStore();
        },
      },
      {
        id: 'act-copy-url',
        title: 'نسخ رابط المتجر الإلكتروني',
        keywords: 'نسخ رابط مشاركة',
        icon: Copy,
        run: () => {
          onCopyUrl();
          setCommandOpen(false);
        },
      },
      {
        id: 'act-toggle-sound',
        title: soundEnabled ? 'كتم التنبيه الصوتي للطلبات' : 'تفعيل التنبيه الصوتي للطلبات',
        keywords: 'صوت تنبيه كتم جرس',
        icon: soundEnabled ? VolumeX : Volume2,
        run: () => {
          onToggleSound();
          setCommandOpen(false);
        },
      },
    ];
    for (const act of quickActions) {
      if (!q || act.title.toLowerCase().includes(q) || act.keywords.includes(q)) {
        results.push({
          id: act.id,
          group: 'actions',
          title: act.title,
          icon: act.icon,
          onSelect: act.run,
        });
      }
    }

    return results;
  }, [commandQuery, orders, products, activeTab, soundEnabled]);

  useEffect(() => {
    setActiveCommandIdx(0);
  }, [commandQuery]);

  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveCommandIdx(prev => (commandItems.length > 0 ? (prev + 1) % commandItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveCommandIdx(prev =>
        commandItems.length > 0 ? (prev - 1 + commandItems.length) % commandItems.length : 0
      );
    } else if (e.key === 'Enter' && commandItems[activeCommandIdx]) {
      e.preventDefault();
      commandItems[activeCommandIdx].onSelect();
    }
  };

  return (
    <>
      {/* Sleek 56px Executive Topbar (Stripe / Linear / Shopify Polaris Grade) */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#DCE1DC] px-3.5 sm:px-6 h-14 flex items-center justify-between gap-3 shrink-0">
        {/* ZONE 1 (RIGHT): Compact Breadcrumb + Store Logo Avatar + Store Live Status Pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Store Logo Avatar (Mobile & Desktop) */}
          <div className="w-8 h-8 rounded-xl bg-white border border-[#DCE1DC] p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs" title={storeName}>
            <img
              src={store.logo_url || '/rafiq_logo.png'}
              alt={storeName}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
              }}
              className="w-full h-full object-contain"
            />
          </div>

          <nav aria-label="مسار التنقل" className="flex items-center gap-1.5 min-w-0">
            <span className="hidden sm:inline text-xs font-bold text-[#52605D] truncate max-w-[150px]" title={storeName}>
              {storeName}
            </span>
            <ChevronLeft className="hidden sm:inline w-3.5 h-3.5 text-[#B5C0B7] flex-shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:inline-flex w-7 h-7 rounded-lg bg-[#E6F2ED] text-[#004D3F] items-center justify-center flex-shrink-0">
                <ActiveTabIcon className="w-3.5 h-3.5" />
              </span>
              <h1 className="text-[13px] sm:text-sm font-black text-[#0F172A] truncate">
                {TAB_CONFIG[activeTab].label}
              </h1>
            </div>
          </nav>

          {/* Compact Environment / Store Live Status Indicator */}
          {isDemoStore ? (
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/90 text-amber-800 text-[10px] font-bold flex-shrink-0">
              <BadgeCheck className="w-3 h-3" />
              <span>تجريبي</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateTab('settings')}
              title={
                store.is_paused === 1
                  ? 'المتجر متوقف مؤقتاً — اضغط لإعادة الفتح من الإعدادات'
                  : 'المتجر مفتوح ويستقبل الطلبات — اضغط لإدارة حالة التشغيل'
              }
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer flex-shrink-0 ${
                store.is_paused === 1
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100/70'
                  : 'bg-[#EAF5EE] border-[#006D41]/20 text-[#006D41] hover:bg-[#ddf0e4]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  store.is_paused === 1 ? 'bg-amber-500' : 'bg-[#006D41]'
                }`}
              />
              <span>{store.is_paused === 1 ? 'متوقف مؤقتاً' : 'مفتوح للطلب'}</span>
            </button>
          )}
        </div>

        {/* ZONE 2 (CENTER): Universal Command Palette Trigger (Ctrl+K) */}
        <div className="hidden md:flex flex-1 justify-center max-w-md mx-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="w-full h-9 px-3 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F4] border border-[#DCE1DC] hover:border-[#B5C0B7] flex items-center justify-between gap-2 text-xs text-[#52605D] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-[#52605D] flex-shrink-0" />
              <span className="truncate font-medium">بحث سريع في الأوردرات والأصناف والأقسام...</span>
            </span>
            <kbd
              dir="ltr"
              className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white border border-[#DCE1DC] text-[10px] font-mono font-bold text-[#52605D] flex-shrink-0"
            >
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* ZONE 3 (LEFT): Precision Utility Icon Cluster + Unified Store Split-Control */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Mobile Search Icon */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="md:hidden w-9 h-9 rounded-xl text-[#52605D] hover:text-[#004D3F] hover:bg-[#F1F5F4] flex items-center justify-center transition-colors cursor-pointer"
            title="بحث سريع (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Compact Icon-Only Controls */}
          <div className="flex items-center gap-1">
            {!isDemoStore && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoadingOrders}
                className="w-9 h-9 rounded-xl text-[#52605D] hover:text-[#004D3F] hover:bg-[#F1F5F4] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title={isLoadingOrders ? 'جاري التحديث من السحابة...' : 'تحديث البيانات من السحابة'}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin text-[#004D3F]' : ''}`} />
              </button>
            )}

            {/* Minimal Sound Toggle Icon with Status Dot */}
            <button
              type="button"
              onClick={onToggleSound}
              className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                soundEnabled
                  ? 'text-[#004D3F] hover:bg-[#E6F2ED]'
                  : 'text-[#52605D] hover:bg-[#F1F5F4]'
              }`}
              title={soundEnabled ? 'التنبيه الصوتي مفعل — اضغط للكتم' : 'التنبيه الصوتي صامت — اضغط للتفعيل'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#006D41]" />
              )}
            </button>

            {/* Incoming Orders Notification Bell + Popover */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setBellOpen(prev => !prev)}
                className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  bellOpen
                    ? 'bg-[#E6F2ED] text-[#004D3F]'
                    : 'text-[#52605D] hover:text-[#004D3F] hover:bg-[#F1F5F4]'
                }`}
                title="إشعارات الطلبات الجديدة"
              >
                <Bell className="w-4 h-4" />
                {pendingOrdersCount > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#B23A2E] text-white text-[9px] font-black font-mono flex items-center justify-center leading-none border-2 border-white">
                    {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white rounded-2xl border border-[#DCE1DC] shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#DCE1DC] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 text-[#004D3F]" />
                      <span className="text-xs font-black text-[#0F172A]">الطلبات بانتظار التأكيد</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-[#E6F2ED] text-[#004D3F] text-[10px] font-black font-mono">
                      {pendingOrdersCount}
                    </span>
                  </div>

                  {pendingOrders.length === 0 ? (
                    <div className="px-4 py-8 text-center space-y-1.5">
                      <CheckCircle2 className="w-7 h-7 text-[#006D41]/70 mx-auto" />
                      <p className="text-xs font-bold text-[#0F172A]">كل الطلبات تمت مراجعتها</p>
                      <p className="text-[11px] text-[#52605D]">
                        سيظهر هنا أي أوردر جديد بمجرد وصوله من المتجر.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#DCE1DC]/70 max-h-72 overflow-y-auto">
                      {pendingOrders.map(ord => (
                        <button
                          key={ord.id}
                          type="button"
                          onClick={() => {
                            onSelectOrder(ord.id);
                            onNavigateTab('orders');
                            setBellOpen(false);
                          }}
                          className="w-full px-4 py-3 text-right hover:bg-[#F8FAFC] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-[#0F172A] truncate">
                                {ord.customer_name}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-[#004D3F]" dir="ltr">
                                #ORD-{ord.order_number}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#52605D] flex items-center gap-1.5 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{ord.created_at}</span>
                              <span>•</span>
                              <span className="truncate">{ord.address_zone}</span>
                            </div>
                          </div>
                          <span className="text-xs font-black text-[#004D3F] font-mono flex-shrink-0" dir="ltr">
                            {(ord.total / 100).toFixed(2)} ج.م
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="p-2 bg-[#F8FAFC] border-t border-[#DCE1DC] flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab('orders');
                        setBellOpen(false);
                      }}
                      className="flex-1 py-1.5 rounded-xl text-[11px] font-black text-[#004D3F] hover:bg-[#E6F2ED] transition-colors cursor-pointer text-center"
                    >
                      عرض كل الأوردرات
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (getNotificationPermission() === 'default') {
                          await requestNotificationPermission();
                        }
                        alertNewOrder(
                          {
                            orderId: 'test-ping',
                            orderNumber: 'TEST',
                            customerName: 'فحص جرس واهتزاز الهاتف',
                            totalPounds: '100.00',
                            zone: 'الهاتف جاهز',
                          },
                          true
                        );
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-[#52605D] hover:text-[#004D3F] hover:bg-[#E6F2ED] transition-colors cursor-pointer flex items-center gap-1 border border-[#DCE1DC]"
                      title="تجربة رنة التنبيه والاهتزاز على الهاتف"
                    >
                      <Volume2 className="w-3 h-3 text-[#004D3F]" />
                      <span>تجربة التنبيه 🔔</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <span className="hidden sm:block h-5 w-px bg-[#DCE1DC] mx-0.5" aria-hidden="true" />

          {/* Unified Store Split-Control: [معاينة المتجر | نسخ الرابط] */}
          <div className="inline-flex items-stretch rounded-xl overflow-hidden border border-[#004D3F]/20 shadow-sm h-9">
            <button
              type="button"
              onClick={onOpenStore}
              className="inline-flex items-center gap-1.5 px-3 bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-colors cursor-pointer whitespace-nowrap"
              title="فتح ومعاينة المتجر الإلكتروني"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">معاينة المتجر</span>
            </button>
            <button
              type="button"
              onClick={onCopyUrl}
              className={`inline-flex items-center gap-1 px-2.5 border-r border-[#004D3F]/15 text-xs font-bold transition-colors cursor-pointer ${
                copiedHeaderLink
                  ? 'bg-[#EAF5EE] text-[#006D41]'
                  : 'bg-[#E6F2ED] hover:bg-[#d5ebe2] text-[#004D3F]'
              }`}
              title={copiedHeaderLink ? 'تم نسخ رابط المتجر!' : 'نسخ رابط المتجر الإلكتروني'}
            >
              {copiedHeaderLink ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[11px]">تم النسخ</span>
                </>
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Mobile Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="lg:hidden w-9 h-9 rounded-xl text-[#52605D] hover:text-[#B23A2E] hover:bg-[#FDF2F2] flex items-center justify-center transition-colors cursor-pointer"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Universal Command Palette Modal (Ctrl+K) */}
      {commandOpen && (
        <div
          onClick={() => setCommandOpen(false)}
          className="fixed inset-0 z-50 bg-[#0F172A]/55 flex items-start justify-center pt-[10vh] px-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-2xl border border-[#DCE1DC] shadow-2xl overflow-hidden"
          >
            {/* Search Input Header */}
            <div className="px-4 py-3 border-b border-[#DCE1DC] flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[#004D3F] flex-shrink-0" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                onKeyDown={handleCommandKeyDown}
                placeholder="اكتب رقم أوردر، اسم عميل، اسم صنف، أو قسم للانتقال السريع..."
                className="flex-1 text-xs sm:text-sm font-medium text-[#0F172A] placeholder:text-[#52605D] focus:outline-none bg-transparent"
              />
              {commandQuery && (
                <button
                  type="button"
                  onClick={() => setCommandQuery('')}
                  className="p-1 text-[#52605D] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCommandOpen(false)}
                className="px-2 py-1 rounded-lg bg-[#F1F5F4] text-[#52605D] text-[10px] font-mono font-bold hover:text-[#0F172A] cursor-pointer"
              >
                ESC
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
              {commandItems.length === 0 ? (
                <div className="py-10 text-center space-y-1">
                  <Command className="w-6 h-6 text-[#B5C0B7] mx-auto" />
                  <p className="text-xs font-bold text-[#0F172A]">لا توجد نتائج مطابقة</p>
                  <p className="text-[11px] text-[#52605D]">جرب البحث برقم الأوردر أو اسم الصنف أو القسم.</p>
                </div>
              ) : (
                commandItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isFocused = idx === activeCommandIdx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveCommandIdx(idx)}
                      onClick={item.onSelect}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                        isFocused ? 'bg-[#E6F2ED] text-[#00372D]' : 'text-[#0F172A] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isFocused ? 'bg-[#004D3F] text-white' : 'bg-[#F1F5F4] text-[#52605D]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-black truncate">{item.title}</div>
                          {item.subtitle && (
                            <div className="text-[10px] text-[#52605D] truncate mt-0.5">{item.subtitle}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.badge && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.badge === 'جديد'
                                ? 'bg-amber-100 text-amber-900'
                                : item.badge === 'مخفي'
                                ? 'bg-[#FDF2F2] text-[#B23A2E]'
                                : 'bg-[#EAF5EE] text-[#006D41]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                        <ArrowUpLeft className="w-3.5 h-3.5 text-[#52605D]/60" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Shortcuts Hint */}
            <div className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#DCE1DC] flex items-center justify-between text-[10px] text-[#52605D]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <PauseCircle className="w-3 h-3 text-[#004D3F]" />
                  <span>حالة المتجر: {store.is_paused === 1 ? 'متوقف مؤقتاً' : 'مفتوح للطلب'}</span>
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-2 font-mono">
                <span>↑↓ للتنقل</span>
                <span>•</span>
                <span>Enter للفتح</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
