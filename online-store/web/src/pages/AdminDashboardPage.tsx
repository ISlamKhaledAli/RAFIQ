import React, { useState, useMemo, useEffect } from 'react';
import type { Store, Product } from '../types';
import { THEME_PRESETS_CONFIG, resolveThemePreset } from '../components/ThemeInjector';
import { playOrderChime } from '../components/admin/audioChime';
import { OrderPrintReceipt } from '../components/admin/OrderPrintReceipt';
import type { AdminOrder } from '../components/admin/OrderPrintReceipt';
import { OrderCardItem } from '../components/admin/OrderCardItem';
import { OrderDetailsPanel } from '../components/admin/OrderDetailsPanel';
import { KanbanBoardView } from '../components/admin/KanbanBoardView';
import {
  ShoppingBag,
  TrendingUp,
  Settings,
  Package,
  Palette,
  ExternalLink,
  Search,
  Check,
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
  ChevronLeft,
  Columns3,
  ListFilter,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Truck,
  FileText,
  Clock,
  X,
} from 'lucide-react';

interface Props {
  store: Store;
  products: Product[];
  currentThemePreset?: string;
  onThemeChange: (presetKey: string) => void;
  onUpdateStore: (updated: Store) => void;
  onBackToStore: () => void;
}

export const AdminDashboardPage: React.FC<Props> = ({
  store,
  products,
  currentThemePreset,
  onThemeChange,
  onUpdateStore,
  onBackToStore,
}) => {
  // Session login protection
  const [token, setToken] = useState<string | null>('session-token-valid-mock');
  const [pin, setPin] = useState('1234');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'orders' | 'overview' | 'products' | 'settings' | 'theme'>('orders');

  // Orders display & filtering state
  const [ordersFilter, setOrdersFilter] = useState<'all' | 'new' | 'accepted' | 'ready' | 'delivered'>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-101');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'kanban'>('split');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [orderToPrint, setOrderToPrint] = useState<AdminOrder | null>(null);

  // Store editable settings state
  const [storeName, setStoreName] = useState(store.name);
  const [welcomeMessage, setWelcomeMessage] = useState(store.welcome_message || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [whatsapp, setWhatsapp] = useState(store.whatsapp || '');
  const [address, setAddress] = useState(store.address || '');
  const [instapayHandle, setInstapayHandle] = useState(store.instapay_handle || 'souq-elkhair@instapay');
  const [vodafoneCashPhone, setVodafoneCashPhone] = useState(store.vodafone_cash_phone || '01012345678');
  const [workingHoursText, setWorkingHoursText] = useState(
    store.working_hours
      ? Object.entries(store.working_hours)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      : 'السبت - الخميس: 9:00 ص - 12:00 م\nالجمعة: 1:00 م - 12:00 م'
  );
  const [minOrderPounds, setMinOrderPounds] = useState((store.min_order_amount / 100).toString());
  const [isPaused, setIsPaused] = useState(store.is_paused === 1);
  const [acceptCash, setAcceptCash] = useState(store.accept_cash ?? true);
  const [acceptInstapay, setAcceptInstapay] = useState(store.accept_instapay ?? true);
  const [acceptVodafoneCash, setAcceptVodafoneCash] = useState(store.accept_vodafone_cash ?? true);
  const [allowDelivery, setAllowDelivery] = useState(store.allow_delivery ?? true);
  const [allowPickup, setAllowPickup] = useState(store.allow_pickup ?? true);
  const [deliveryZones, setDeliveryZones] = useState<Array<{ name: string; fee: number }>>(
    store.delivery_zones || [
      { name: 'وسط البلد', fee: 1500 },
      { name: 'الدقي والمهندسين', fee: 2000 },
      { name: 'المعادي', fee: 3000 },
    ]
  );
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFeePounds, setNewZoneFeePounds] = useState('20');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Products manager state
  const [productSearch, setProductSearch] = useState('');
  const [managedProducts, setManagedProducts] = useState(products);

  // Orders state with structured delivery addresses and detailed itemization
  const [mockOrders, setMockOrders] = useState<AdminOrder[]>(() => {
    const baseOrders: AdminOrder[] = [
      {
        id: 'ord-101',
        order_number: 101,
        customer_name: 'أحمد سعيد محمود',
        customer_phone: '01011223344',
        alt_phone: '01223344556',
        address_zone: 'وسط البلد',
        address_street: 'شارع الجمهورية',
        address_building: 'عمارة 14',
        address_floor_apt: 'الدور الثالث - شقة 8',
        address_landmark: 'أمام محطة المترو، فوق صيدلية مصر',
        maps_url: 'https://maps.google.com/?q=30.0444,31.2357',
        payment_method: 'فودافون كاش ومحافظ المحمول',
        sender_phone: '01099887766',
        payment_ref: 'VF-884920',
        receipt_image: null,
        notes: 'اتصل قبل الوصول بخمس دقائق | تم التحويل عبر فودافون كاش',
        subtotal: 11000,
        delivery_fee: 1500,
        total: 12500, // 125.00 EGP
        status: 'new',
        items: [
          { name: 'أرز مصري فاخر 1 كجم', quantity: 2, unit: 'كجم', unit_price: 3500, total_price: 7000 },
          { name: 'زيت هلا عباد الشمس 800 مل', quantity: 1, unit: 'زجاجة', unit_price: 4000, total_price: 4000 },
        ],
        created_at: 'منذ 10 دقائق',
      },
      {
        id: 'ord-102',
        order_number: 102,
        customer_name: 'منى إبراهيم خالد',
        customer_phone: '01155667788',
        alt_phone: '',
        address_zone: 'الدقي',
        address_street: 'شارع مصدق',
        address_building: 'برج الأطباء',
        address_floor_apt: 'الدور السادس - شقة 22',
        address_landmark: 'بجوار بنك مصر',
        maps_url: 'https://maps.google.com/?q=30.0385,31.2016',
        payment_method: 'إنستاباي (InstaPay)',
        sender_phone: 'mona.khaled@instapay',
        payment_ref: 'IP-992144',
        receipt_image: null,
        notes: 'اترك الطلب عند البواب | تحويل إنستاباي',
        subtotal: 8400,
        delivery_fee: 2000,
        total: 10400, // 104.00 EGP
        status: 'accepted',
        items: [
          { name: 'جبنة دومتي فيتا 500 جم', quantity: 2, unit: 'علبة', unit_price: 4200, total_price: 8400 },
        ],
        created_at: 'منذ 35 دقيقة',
      },
      {
        id: 'ord-103',
        order_number: 103,
        customer_name: 'كريم عبد العزيز سالم',
        customer_phone: '01200112233',
        alt_phone: '',
        address_zone: 'المعادي',
        address_street: 'شارع النصر',
        address_building: 'عمارة 8',
        address_floor_apt: 'الدور الأول',
        address_landmark: 'أمام كارفور المعادي',
        maps_url: 'https://maps.google.com/?q=29.9602,31.2569',
        payment_method: 'كاش عند الاستلام',
        sender_phone: '',
        payment_ref: '',
        receipt_image: null,
        notes: 'معايا فكة 200 جنيه',
        subtotal: 14500,
        delivery_fee: 3000,
        total: 17500, // 175.00 EGP
        status: 'ready',
        items: [
          { name: 'سكر الأسرة ناعم 1 كجم', quantity: 3, unit: 'كجم', unit_price: 3500, total_price: 10500 },
          { name: 'مكرونة الملكة 400 جم', quantity: 4, unit: 'كيس', unit_price: 1000, total_price: 4000 },
        ],
        created_at: 'منذ ساعة',
      },
    ];

    try {
      const stored = localStorage.getItem('rafiq_demo_placed_orders');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mapped: AdminOrder[] = parsed.map((o: any) => ({
            id: o.id || `ord-${o.order_number}`,
            order_number: o.order_number,
            customer_name: o.customer_name,
            customer_phone: o.customer_phone,
            alt_phone: o.alt_phone || '',
            address_zone: o.address_zone || o.delivery_zone || 'وسط البلد',
            address_street: o.customer_address || 'عنوان التوصيل',
            address_building: '',
            address_floor_apt: '',
            address_landmark: '',
            maps_url: null,
            payment_method: o.payment_method || 'كاش عند الاستلام',
            sender_phone: o.sender_phone || '',
            payment_ref: o.payment_ref || '',
            receipt_image: o.receipt_image || null,
            notes: o.notes || '',
            subtotal: o.subtotal,
            delivery_fee: o.delivery_fee,
            total: o.total,
            status: o.status || 'new',
            items: Array.isArray(o.items)
              ? o.items.map((it: any) => ({
                  name: it.name || it.product_name || 'صنف',
                  quantity: it.quantity || 1,
                  unit: it.unit || it.unit_name || 'قطعة',
                  unit_price: it.unit_price || 0,
                  total_price: it.total_price || it.line_total || 0,
                }))
              : [],
            created_at: o.created_at || 'الآن',
          }));
          return [...mapped, ...baseOrders];
        }
      }
    } catch {}
    return baseOrders;
  });

  const [selectedPreset, setSelectedPreset] = useState(
    currentThemePreset || store.theme_preset || 'duo-forest-cream'
  );

  useEffect(() => {
    if (currentThemePreset && currentThemePreset !== selectedPreset) {
      setSelectedPreset(currentThemePreset);
    }
  }, [currentThemePreset]);

  // Handle Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    setTimeout(() => {
      setIsLoggingIn(false);
      if (pin === '1234' || pin.length >= 4) {
        setToken('session-token-valid-mock');
      } else {
        setLoginError('الرمز السري غير صحيح، يرجى التأكد والمحاولة مرة أخرى');
      }
    }, 400);
  };

  // Orders operations
  const handleUpdateOrderStatus = (orderId: string, newStatus: string) => {
    setMockOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    if (soundEnabled) {
      playOrderChime();
    }
  };

  // Receipt printing
  const handlePrintReceipt = (order: AdminOrder) => {
    setOrderToPrint(order);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Delivery zones operations
  const handleAddDeliveryZone = () => {
    if (!newZoneName.trim()) return;
    const feePiasters = Math.round(parseFloat(newZoneFeePounds || '0') * 100);
    setDeliveryZones(prev => [...prev, { name: newZoneName.trim(), fee: feePiasters }]);
    setNewZoneName('');
    setNewZoneFeePounds('20');
  };

  const handleRemoveDeliveryZone = (index: number) => {
    setDeliveryZones(prev => prev.filter((_, i) => i !== index));
  };

  // Save Settings
  const handleSaveStoreSettings = () => {
    const minOrderPiasters = Math.round(parseFloat(minOrderPounds || '0') * 100);

    const parsedWorkingHours: Record<string, string> = {};
    workingHoursText.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > -1) {
        const day = line.substring(0, idx).trim();
        const hrs = line.substring(idx + 1).trim();
        if (day && hrs) parsedWorkingHours[day] = hrs;
      }
    });

    const updatedStore: Store = {
      ...store,
      name: storeName.trim(),
      welcome_message: welcomeMessage.trim() || null,
      working_hours: Object.keys(parsedWorkingHours).length > 0 ? parsedWorkingHours : null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      address: address.trim() || null,
      instapay_handle: instapayHandle.trim() || null,
      vodafone_cash_phone: vodafoneCashPhone.trim() || null,
      accept_cash: acceptCash,
      accept_instapay: acceptInstapay,
      accept_vodafone_cash: acceptVodafoneCash,
      allow_delivery: allowDelivery,
      allow_pickup: allowPickup,
      min_order_amount: minOrderPiasters,
      is_paused: isPaused ? 1 : 0,
      delivery_zones: deliveryZones,
    };

    onUpdateStore(updatedStore);
    setSaveSuccessMsg('تم حفظ وتحديث كافة بيانات المتجر ومواعيد العمل بنجاح!');
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  // Product stock toggle
  const handleToggleProductStock = (id: string) => {
    setManagedProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, in_stock: !p.in_stock } : p))
    );
  };

  // Convert theme presets config into array with swatches
  const themePresets = useMemo(() => {
    return Object.entries(THEME_PRESETS_CONFIG).map(([key, config]) => ({
      key,
      name: config.name,
      category: config.category,
      color: config.primary,
      secondary: config.secondary,
      accent: config.accent,
      swatches: config.swatches || [config.primary, config.secondary],
      config,
    }));
  }, []);

  // Filtered orders calculation
  const filteredOrders = useMemo(() => {
    return mockOrders.filter(o => {
      // 1. Status filter
      if (ordersFilter !== 'all' && o.status !== ordersFilter) {
        return false;
      }
      // 2. Search query filter
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase().trim();
        const matchesNumber = o.order_number.toString().includes(q);
        const matchesName = o.customer_name.toLowerCase().includes(q);
        const matchesPhone = o.customer_phone.includes(q);
        const matchesZone = o.address_zone.toLowerCase().includes(q);
        return matchesNumber || matchesName || matchesPhone || matchesZone;
      }
      return true;
    });
  }, [mockOrders, ordersFilter, orderSearchQuery]);

  // Keep selected order valid
  useEffect(() => {
    if (filteredOrders.length > 0) {
      const exists = filteredOrders.some(o => o.id === selectedOrderId);
      if (!exists) {
        setSelectedOrderId(filteredOrders[0].id);
      }
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = useMemo(() => {
    return mockOrders.find(o => o.id === selectedOrderId) || mockOrders[0] || null;
  }, [mockOrders, selectedOrderId]);

  // Handle select order (opens modal on mobile, updates selection on desktop)
  const handleSelectOrder = (order: AdminOrder) => {
    setSelectedOrderId(order.id);
    setMobileDetailOpen(true);
  };

  // KPI Metrics Calculation
  const totalOrdersCount = mockOrders.length;
  const pendingOrdersCount = mockOrders.filter(o => o.status === 'new').length;
  const inPrepOrdersCount = mockOrders.filter(o => o.status === 'accepted').length;
  const readyOrdersCount = mockOrders.filter(o => o.status === 'ready').length;
  const deliveredOrdersCount = mockOrders.filter(o => o.status === 'delivered').length;
  const totalSalesPiasters = mockOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalSalesPounds = (totalSalesPiasters / 100).toFixed(2);
  const avgOrderPounds = totalOrdersCount > 0 ? (totalSalesPiasters / totalOrdersCount / 100).toFixed(2) : '0.00';

  // If not logged in, render Shopify Polaris Login Screen
  if (!token) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-200 p-3 mx-auto shadow-sm flex items-center justify-center">
            <img src="/rafiq_logo.png" alt="رفيق" className="w-full h-full object-contain" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900">لوحة تحكم صاحب المتجر</h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              أدخل الرمز السري للدخول إلى إدارة الطلبات والمبيعات
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 text-right">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-right">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-store-primary" />
                <span>الرمز السري للدخول (الافتراضي: 1234)</span>
              </label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="••••"
                className="w-full text-center tracking-widest text-lg font-mono p-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-store-primary hover:bg-store-primary-hover text-white py-3.5 px-4 rounded-2xl text-xs font-black shadow-md shadow-store-primary/20 btn-spring transition-all flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <span>جاري التحقق...</span>
              ) : (
                <>
                  <span>تسجيل الدخول للوحة التحكم</span>
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <button
            onClick={onBackToStore}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>الرجوع إلى المتجر الإلكتروني</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-store-bg/50 text-store-text flex flex-col font-sans selection:bg-store-primary selection:text-store-primary-contrast pb-12 transition-colors duration-300">
      {/* Printable Thermal Receipt (Hidden on Screen, Active on Print) */}
      {(orderToPrint || selectedOrder) && (
        <OrderPrintReceipt order={orderToPrint || selectedOrder!} store={store} />
      )}

      {/* ========================================================================= */}
      {/* 1. TOP APP BAR: High-density Polaris Admin Header with Store Identity     */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-store-card/95 backdrop-blur-md border-b border-store-line shadow-2xs transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
            {/* Store Avatar & Info */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-store-primary-light border border-store-primary/20 p-1.5 flex items-center justify-center flex-shrink-0 shadow-2xs text-store-primary">
                <img src="/rafiq_logo.png" alt="رفيق" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-xs sm:text-base font-black text-store-text truncate max-w-[120px] sm:max-w-xs">
                    {storeName}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${
                      store.is_paused === 1
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-store-primary-light text-store-primary border-store-primary/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        store.is_paused === 1 ? 'bg-amber-500' : 'bg-store-primary animate-pulse'
                      }`}
                    />
                    <span>{store.is_paused === 1 ? 'مغلق مؤقتاً' : 'مفتوح للطلب'}</span>
                  </span>
                </div>
                <div className="hidden sm:block text-[11px] text-store-muted font-medium truncate">
                  لوحة تحكم المتجر • نظام كاشير رفيق الذكي
                </div>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Sound alert chime toggle */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !soundEnabled;
                  setSoundEnabled(nextState);
                  if (nextState) {
                    playOrderChime();
                  }
                }}
                className={`p-2 rounded-xl text-xs font-bold border transition-colors btn-spring flex items-center gap-1 ${
                  soundEnabled
                    ? 'bg-store-primary-light text-store-primary border-store-primary/30 hover:bg-store-primary-light/80'
                    : 'bg-store-card-subtle text-store-muted border-store-line hover:bg-store-card'
                }`}
                title={soundEnabled ? 'تنبيهات الصوت مفعلة (انقر للتعطيل)' : 'تنبيهات الصوت معطلة'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden md:inline">{soundEnabled ? 'صوت التنبيه' : 'صامت'}</span>
              </button>

              {/* View Online Storefront */}
              <button
                type="button"
                onClick={onBackToStore}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-store-text bg-store-card hover:bg-store-card-subtle border border-store-line hover:border-store-primary/40 transition-colors btn-spring shadow-2xs"
                title="عرض المتجر كما يراه الزبائن"
              >
                <span className="hidden sm:inline">معاينة المتجر</span>
                <ExternalLink className="w-3.5 h-3.5 text-store-muted" />
              </button>

              {/* Logout Button */}
              <button
                type="button"
                onClick={() => setToken(null)}
                className="p-2 rounded-xl text-store-muted hover:text-rose-600 hover:bg-rose-50 transition-colors btn-spring border border-transparent hover:border-rose-100"
                title="قفل وتسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Horizontal Segmented Navigation Tabs */}
        <div className="border-t border-store-line bg-store-card transition-colors duration-300">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1.5">
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 whitespace-nowrap btn-spring ${
                  activeTab === 'orders'
                    ? 'bg-store-primary !text-white font-black shadow-sm'
                    : 'text-slate-600 hover:text-store-primary hover:bg-slate-100'
                }`}
              >
                <ShoppingBag className={`w-4 h-4 ${activeTab === 'orders' ? '!text-white' : 'text-slate-400'}`} />
                <span className={activeTab === 'orders' ? '!text-white' : ''}>الأوردرات</span>
                {pendingOrdersCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                      activeTab === 'orders'
                        ? 'bg-white/20 !text-white'
                        : 'bg-amber-100 text-amber-900 font-bold'
                    }`}
                  >
                    {pendingOrdersCount} جديد
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 whitespace-nowrap btn-spring ${
                  activeTab === 'overview'
                    ? 'bg-store-primary !text-white font-black shadow-sm'
                    : 'text-slate-600 hover:text-store-primary hover:bg-slate-100'
                }`}
              >
                <TrendingUp className={`w-4 h-4 ${activeTab === 'overview' ? '!text-white' : 'text-slate-400'}`} />
                <span className={activeTab === 'overview' ? '!text-white' : ''}>المبيعات والتقارير</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 whitespace-nowrap btn-spring ${
                  activeTab === 'products'
                    ? 'bg-store-primary !text-white font-black shadow-sm'
                    : 'text-slate-600 hover:text-store-primary hover:bg-slate-100'
                }`}
              >
                <Package className={`w-4 h-4 ${activeTab === 'products' ? '!text-white' : 'text-slate-400'}`} />
                <span className={activeTab === 'products' ? '!text-white' : ''}>الأصناف والمخزون</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    activeTab === 'products'
                      ? 'bg-white/20 !text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {managedProducts.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 whitespace-nowrap btn-spring ${
                  activeTab === 'settings'
                    ? 'bg-store-primary !text-white font-black shadow-sm'
                    : 'text-slate-600 hover:text-store-primary hover:bg-slate-100'
                }`}
              >
                <Settings className={`w-4 h-4 ${activeTab === 'settings' ? '!text-white' : 'text-slate-400'}`} />
                <span className={activeTab === 'settings' ? '!text-white' : ''}>إعدادات المتجر والتوصيل</span>
              </button>

              <button
                onClick={() => setActiveTab('theme')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 whitespace-nowrap btn-spring ${
                  activeTab === 'theme'
                    ? 'bg-store-primary !text-white font-black shadow-sm'
                    : 'text-slate-600 hover:text-store-primary hover:bg-slate-100'
                }`}
              >
                <Palette className={`w-4 h-4 ${activeTab === 'theme' ? '!text-white' : 'text-slate-400'}`} />
                <span className={activeTab === 'theme' ? '!text-white' : ''}>ألوان وهوية المتجر</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {saveSuccessMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold border border-emerald-500 animate-sheet">
          <CheckCircle2 className="w-4 h-4 text-emerald-200 flex-shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN CONTAINER                                                            */}
      {/* ========================================================================= */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 w-full flex-1">
        {/* ========================================================= */}
        {/* TAB 1: ORDERS COMMAND CENTER (Shopify & KDS Experience)   */}
        {/* ========================================================= */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* 1. KPI Compact Summary Ribbon with Dynamic Theme Tokens */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
              {/* Card 1: Pending */}
              <div
                onClick={() => setOrdersFilter('new')}
                className={`p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  pendingOrdersCount > 0
                    ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                    : 'bg-store-card border-store-line shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
                  <span>أوردرات جديدة</span>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-amber-900 font-mono">
                    {pendingOrdersCount}
                  </span>
                  <span className="text-[10px] text-amber-700 font-bold">أوردر</span>
                </div>
              </div>

              {/* Card 2: Total Orders */}
              <div
                onClick={() => setOrdersFilter('all')}
                className="bg-store-card p-3 sm:p-3.5 rounded-2xl border border-store-line shadow-2xs cursor-pointer hover:border-store-primary/40 transition-all"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-store-muted">
                  <span>إجمالي الأوردرات</span>
                  <ShoppingBag className="w-4 h-4 text-store-muted" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-store-text font-mono">
                    {totalOrdersCount}
                  </span>
                  <span className="text-[10px] text-store-muted font-bold">اليوم</span>
                </div>
              </div>

              {/* Card 3: Total Sales */}
              <div className="bg-store-card p-3 sm:p-3.5 rounded-2xl border border-store-line shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-store-muted">
                  <span>مبيعات الأونلاين</span>
                  <TrendingUp className="w-4 h-4 text-store-primary" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-store-primary font-mono">
                    {totalSalesPounds}
                  </span>
                  <span className="text-[10px] text-store-muted font-bold">ج.م</span>
                </div>
              </div>

              {/* Card 4: Average Order */}
              <div className="bg-store-card p-3 sm:p-3.5 rounded-2xl border border-store-line shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-store-muted">
                  <span>متوسط الأوردر</span>
                  <CheckCircle2 className="w-4 h-4 text-store-secondary" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-store-text font-mono">
                    {avgOrderPounds}
                  </span>
                  <span className="text-[10px] text-store-muted font-bold">ج.م</span>
                </div>
              </div>
            </div>

            {/* 2. Search & Filter Bar + View Mode Switcher */}
            <div className="bg-store-card p-2.5 sm:p-3 rounded-2xl border border-store-line shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 transition-colors duration-300">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-store-muted absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={e => setOrderSearchQuery(e.target.value)}
                  placeholder="ابحث برقم الأوردر، اسم الزبون، الموبايل، أو المنطقة..."
                  className="w-full pl-8 pr-9 py-2 rounded-xl border border-store-line bg-store-card-subtle text-store-text text-xs focus:bg-store-card focus:outline-none focus:ring-2 focus:ring-store-primary transition-all font-medium"
                />
                {orderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-store-muted hover:text-store-text p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {[
                  { key: 'all', label: 'الكل', count: mockOrders.length },
                  { key: 'new', label: 'جديدة', count: pendingOrdersCount, alert: pendingOrdersCount > 0 },
                  { key: 'accepted', label: 'بيتجهز', count: inPrepOrdersCount },
                  { key: 'ready', label: 'مع الدليفري', count: readyOrdersCount },
                  { key: 'delivered', label: 'اتسلم', count: deliveredOrdersCount },
                ].map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setOrdersFilter(f.key as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap btn-spring ${
                      ordersFilter === f.key
                        ? 'bg-store-primary !text-white font-black shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span className={ordersFilter === f.key ? '!text-white' : ''}>{f.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        ordersFilter === f.key
                          ? f.alert
                            ? 'bg-amber-400 text-slate-950 font-black'
                            : 'bg-white/20 !text-white'
                          : f.alert
                          ? 'bg-amber-200 text-amber-950 font-black'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Desktop View Switcher: Split View vs Kanban Columns */}
              <div className="hidden lg:flex items-center gap-1 bg-store-card-subtle p-1 rounded-xl flex-shrink-0 border border-store-line">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'split'
                      ? 'bg-store-card text-store-primary shadow-xs ring-1 ring-store-line'
                      : 'text-store-muted hover:text-store-text'
                  }`}
                  title="عرض القائمة المقسمة وتفاصيل الطلب"
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>لوحة الأوردرات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'kanban'
                      ? 'bg-store-card text-store-primary shadow-xs ring-1 ring-store-line'
                      : 'text-store-muted hover:text-store-text'
                  }`}
                  title="عرض خط سير التجهيز والتوصيل"
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  <span>خط التجهيز (كانبان)</span>
                </button>
              </div>
            </div>

            {/* 3. Orders Content Stage */}
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black text-slate-800">لا توجد طلبات مطابقة للبحث أو التصفية</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  قم بتغيير كلمة البحث أو اختيار تبويب تصفية آخر لعرض الطلبات المسجلة.
                </p>
                {orderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSearchQuery('');
                      setOrdersFilter('all');
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors inline-block"
                  >
                    إعادة ضبط الفلاتر
                  </button>
                )}
              </div>
            ) : viewMode === 'kanban' ? (
              /* KANBAN BOARD VIEW (Desktop Dispatch View) */
              <KanbanBoardView
                orders={filteredOrders}
                onSelectOrder={handleSelectOrder}
                onUpdateStatus={handleUpdateOrderStatus}
                storeName={storeName}
              />
            ) : (
              /* MASTER-DETAIL SPLIT VIEW (Shopify Standard) */
              <div className="lg:grid lg:grid-cols-12 lg:gap-5 items-start">
                {/* Master Order Feed (Left/Right depending on RTL) */}
                <div className="lg:col-span-5 xl:col-span-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                    <span>قائمة الأوردرات ({filteredOrders.length})</span>
                    <span className="text-[11px] text-slate-400">مرتبة من الأحدث للأقدم</span>
                  </div>

                  <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-250px)] pr-0.5">
                    {filteredOrders.map(ord => (
                      <OrderCardItem
                        key={ord.id}
                        order={ord}
                        isSelected={selectedOrder?.id === ord.id}
                        onSelect={handleSelectOrder}
                        storeName={storeName}
                      />
                    ))}
                  </div>
                </div>

                {/* Detail View on Desktop */}
                <div className="hidden lg:block lg:col-span-7 xl:col-span-8 sticky top-20">
                  {selectedOrder ? (
                    <OrderDetailsPanel
                      order={selectedOrder}
                      store={store}
                      onUpdateStatus={handleUpdateOrderStatus}
                      onPrintReceipt={handlePrintReceipt}
                    />
                  ) : (
                    <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400">
                      اختر أوردر من القائمة لعرض تفاصيله الكاملة هنا
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mobile Slide-Over / Full-Screen Order Detail Sheet */}
            {mobileDetailOpen && selectedOrder && (
              <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end">
                <div className="bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto animate-sheet flex flex-col shadow-2xl">
                  <OrderDetailsPanel
                    order={selectedOrder}
                    store={store}
                    onUpdateStatus={handleUpdateOrderStatus}
                    onPrintReceipt={handlePrintReceipt}
                    onCloseMobile={() => setMobileDetailOpen(false)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: OVERVIEW & ANALYTICS (Shopify Analytics)           */}
        {/* ========================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                <span className="text-xs font-bold text-slate-500">إجمالي مبيعات اليوم</span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {totalSalesPounds} <span className="text-xs font-bold text-slate-400">ج.م</span>
                </div>
                <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>متصل لحظياً بكاشير رفيق</span>
                </div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                <span className="text-xs font-bold text-slate-500">عدد طلبات الزبائن</span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {totalOrdersCount} <span className="text-xs font-bold text-slate-400">طلب</span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">كل الطلبات المستلمة اليوم</div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                <span className="text-xs font-bold text-slate-500">متوسط قيمة السلة</span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {avgOrderPounds} <span className="text-xs font-bold text-slate-400">ج.م</span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">لكل عميل طلب أونلاين</div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                <span className="text-xs font-bold text-slate-500">الأصناف المتاحة للبيع</span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {managedProducts.filter(p => p.in_stock).length}{' '}
                  <span className="text-xs font-bold text-slate-400">صنف متوفر</span>
                </div>
                <div className="text-[11px] text-emerald-600 font-bold">جاهزة للعرض والشراء</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-black text-slate-900">الأصناف الأكثر طلباً اليوم</h3>
              <div className="divide-y divide-slate-100">
                {managedProducts.slice(0, 5).map(prod => (
                  <div key={prod.id} className="py-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                        {prod.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{prod.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {prod.barcode || 'بدون باركود'}
                        </div>
                      </div>
                    </div>
                    <div className="font-black text-store-primary font-mono">
                      {(prod.price_piasters / 100).toFixed(2)} ج.م
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: PRODUCTS & INVENTORY (Shopify Products)             */}
        {/* ========================================================= */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            {/* Products Search */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="ابحث عن اسم الصنف أو الباركود..."
                  className="w-full pl-4 pr-10 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-store-primary bg-slate-50/50"
                />
              </div>

              <div className="text-xs text-slate-500 font-bold whitespace-nowrap">
                إجمالي الأصناف: <strong className="text-slate-900">{managedProducts.length}</strong>
              </div>
            </div>

            {/* Products List */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="divide-y divide-slate-100">
                {managedProducts
                  .filter(
                    p =>
                      p.name.includes(productSearch) ||
                      (p.barcode && p.barcode.includes(productSearch))
                  )
                  .map(prod => (
                    <div
                      key={prod.id}
                      className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-600 flex-shrink-0">
                          {prod.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-900">{prod.name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>الوحدة: {prod.unit_name}</span>
                            {prod.barcode && <span>• باركود: {prod.barcode}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <div className="text-left sm:text-right">
                          <div className="text-sm font-black text-store-primary font-mono">
                            {(prod.price_piasters / 100).toFixed(2)} ج.م
                          </div>
                          {prod.compare_price && prod.compare_price > prod.price_piasters && (
                            <div className="text-[11px] text-slate-400 line-through font-mono">
                              {(prod.compare_price / 100).toFixed(2)} ج.م
                            </div>
                          )}
                        </div>

                        {/* Stock Availability Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleProductStock(prod.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 btn-spring ${
                            prod.in_stock
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              prod.in_stock ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span>{prod.in_stock ? 'متوفر للطلب' : 'غير متوفر (نافذ)'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: STORE SETTINGS (Shopify Store Settings)            */}
        {/* ========================================================= */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-6 space-y-5">
              <div>
                <h3 className="text-base font-black text-slate-900">بيانات المتجر والتواصل</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تظهر هذه البيانات لعملائك في رأس صفحة المتجر وعند إتمام الطلب
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">اسم المتجر / المحل</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={e => setStoreName(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">رقم هاتف الاتصال</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    dir="ltr"
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs text-right font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">رقم واتساب المتجر</label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    dir="ltr"
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs text-right font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">عنوان المحل الفعلي</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                  />
                </div>
              </div>

              {/* Announcement Bar */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-store-primary" />
                  <span>شريط الإعلانات والرسالة الترحيبية (يظهر أعلى الموقع)</span>
                </label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={e => setWelcomeMessage(e.target.value)}
                  placeholder="مثال: توصيل مجاني للطلبات فوق 200 جنيه طوال الأسبوع!"
                  className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                />
              </div>

              {/* Working Hours */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-store-primary" />
                  <span>مواعيد العمل والتوصيل (سطر لكل فترة)</span>
                </label>
                <textarea
                  rows={2}
                  value={workingHoursText}
                  onChange={e => setWorkingHoursText(e.target.value)}
                  className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs resize-none"
                />
              </div>

              {/* Delivery Zones Management */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-store-primary" />
                  <span>مناطق التوصيل ورسوم التوصيل لكل منطقة</span>
                </h4>

                <div className="space-y-2">
                  {deliveryZones.map((z, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                    >
                      <div className="font-bold text-slate-800">{z.name}</div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-store-primary font-mono">
                          {(z.fee / 100).toFixed(2)} ج.م
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDeliveryZone(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="حذف المنطقة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new zone */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                    placeholder="اسم المنطقة الجديدة (مثال: مدينة نصر)"
                    className="flex-1 text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={newZoneFeePounds}
                      onChange={e => setNewZoneFeePounds(e.target.value)}
                      placeholder="رسوم التوصيل (ج.م)"
                      className="w-28 text-xs font-bold p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary text-center font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddDeliveryZone}
                      className="px-4 py-2.5 bg-store-primary hover:bg-store-primary-hover text-white rounded-xl text-xs font-black transition-all btn-spring flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة المنطقة</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Save Settings Action Bar */}
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveStoreSettings}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-6 py-2.5 rounded-xl shadow-md btn-spring transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ كافة الإعدادات والبيانات</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: THEME CUSTOMIZER & LIVE INTERACTIVE STORE PREVIEW   */}
        {/* ========================================================= */}
        {activeTab === 'theme' && (() => {
          const activeTheme = resolveThemePreset(selectedPreset);
          return (
            <div className="space-y-4">
              {/* Top Section Header */}
              <div className="bg-store-card rounded-2xl border border-store-line p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-store-text flex items-center gap-2">
                    <Palette className="w-5 h-5 text-store-primary" />
                    <span>ألوان وهوية المتجر البصرية (Store Visual Identity)</span>
                  </h3>
                  <p className="text-xs text-store-muted mt-1">
                    اختر الهوية الأنسب لنشاط محلك التجاري. يتم تحديث المعاينة الحية فورياً أمامك بجانب اختياراتك.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onBackToStore}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-store-primary hover:opacity-90 active:scale-95 text-white shadow-sm transition-all btn-spring flex-shrink-0"
                >
                  <ExternalLink className="w-4 h-4 text-white" />
                  <span className="text-white">معاينة المتجر الحي بكامل الشاشة</span>
                </button>
              </div>

              {/* Side-by-Side Responsive Grid: Column 1 Right (Themes), Column 2 Left (Live Sticky Preview) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* RIGHT COLUMN (in RTL): Theme Presets Gallery (lg:col-span-7) */}
                <div className="lg:col-span-7 xl:col-span-7 space-y-3.5">
                  <div className="bg-store-card rounded-3xl border border-store-line p-4 sm:p-5 shadow-2xs">
                    <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-store-line">
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-store-text">
                          مكتبة الهويات البصرية المعتمدة ({themePresets.length} هوية راقية)
                        </h4>
                        <p className="text-xs text-store-muted mt-0.5">
                          انقر على أي هوية لاختيارها؛ يتم تطبيقها وتحديث المعاينة فورياً
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {themePresets.map(preset => {
                        const isSelected = selectedPreset === preset.key;
                        return (
                          <div
                            key={preset.key}
                            onClick={() => {
                              setSelectedPreset(preset.key);
                              onThemeChange(preset.key);
                            }}
                            className={`group p-3.5 rounded-2xl border cursor-pointer transition-all btn-spring text-right space-y-2.5 relative ${
                              isSelected
                                ? 'border-2 border-store-primary bg-store-primary-light/40 shadow-md'
                                : 'border border-store-line hover:border-store-primary/60 bg-store-card hover:bg-store-card-subtle'
                            }`}
                          >
                            {/* Selected Indicator Pill */}
                            {isSelected && (
                              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-store-primary text-white flex items-center gap-1 shadow-sm">
                                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                                <span className="text-white">الهوية النشطة</span>
                              </div>
                            )}

                            {/* Multi-color Swatch Bar */}
                            <div className="h-7 rounded-xl overflow-hidden flex shadow-2xs border border-black/5">
                              {preset.swatches.map((color, idx) => (
                                <div
                                  key={idx}
                                  className="h-full flex-1 transition-transform group-hover:scale-105"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>

                            <div>
                              <div className="font-black text-xs text-store-text group-hover:text-store-primary transition-colors">
                                {preset.name}
                              </div>
                              <div className="text-[10px] text-store-muted font-medium mt-0.5 line-clamp-1">
                                {preset.category}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* LEFT COLUMN (in RTL): Live Interactive Sticky Preview Sandbox (lg:col-span-5 lg:sticky lg:top-20) */}
                <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-20 space-y-4">
                  {/* 1. Quick Info Card for Selected Theme */}
                  <div className="bg-store-card rounded-3xl border border-store-line p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shadow-xs border border-white/20 flex-shrink-0"
                          style={{
                            backgroundColor: activeTheme.primary,
                            color: activeTheme.primaryContrast,
                          }}
                        >
                          <Palette className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-store-text truncate max-w-[170px]">
                              {activeTheme.name}
                            </span>
                            <span
                              className="px-1.5 py-0.2 rounded-full text-[9px] font-black inline-flex items-center gap-0.5 shadow-2xs flex-shrink-0"
                              style={{
                                backgroundColor: activeTheme.secondary,
                                color: activeTheme.secondaryContrast,
                              }}
                            >
                              <Check className="w-2.5 h-2.5" />
                              <span>مطبق</span>
                            </span>
                          </div>
                          <p className="text-[10px] text-store-muted truncate max-w-[200px]">
                            {activeTheme.category}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Swatches breakdown bar */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-store-line">
                      {[
                        { label: 'الأساسي', hex: activeTheme.primary },
                        { label: 'الثانوي', hex: activeTheme.secondary },
                        { label: 'اللمسات', hex: activeTheme.accent },
                        { label: 'الكروت', hex: activeTheme.cardBg },
                        { label: 'الخلفية', hex: activeTheme.bg },
                        { label: 'الفوتر', hex: activeTheme.footerBg },
                      ].map((sw, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 p-1.5 rounded-xl bg-store-card-subtle border border-store-line text-[10px] font-medium"
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                            style={{ backgroundColor: sw.hex }}
                          />
                          <div className="min-w-0">
                            <div className="text-[9px] text-store-muted truncate">{sw.label}</div>
                            <div className="font-mono text-[9px] font-bold text-store-text" dir="ltr">
                              {sw.hex}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. Interactive Miniature Storefront Sandbox */}
                  <div
                    className="rounded-3xl border shadow-xl overflow-hidden transition-all duration-300"
                    style={{
                      borderColor: activeTheme.line,
                      backgroundColor: activeTheme.cardBg,
                    }}
                  >
                    {/* Browser Mockup Window Bar */}
                    <div
                      className="px-3 py-2 border-b flex items-center justify-between text-[11px]"
                      style={{
                        backgroundColor: activeTheme.cardSubtle,
                        borderColor: activeTheme.line,
                        color: activeTheme.muted,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      </div>
                      <div
                        className="px-3 py-0.5 rounded-lg border text-[10px] font-mono text-center truncate max-w-[180px] shadow-2xs"
                        style={{
                          backgroundColor: activeTheme.cardBg,
                          borderColor: activeTheme.line,
                          color: activeTheme.text,
                        }}
                        dir="ltr"
                      >
                        https://{store.name.toLowerCase().replace(/\s+/g, '-')}.rafiq.shop/
                      </div>
                      <div className="text-[10px] font-bold text-store-muted">معاينة تفاعلية</div>
                    </div>

                    {/* Mini Store Header */}
                    <div
                      className="p-3 border-b flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: activeTheme.cardBg,
                        borderColor: activeTheme.line,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow-2xs"
                          style={{
                            background: activeTheme.gradient,
                            color: activeTheme.primaryContrast,
                          }}
                        >
                          {storeName.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-black truncate max-w-[120px]" style={{ color: activeTheme.text }}>
                            {storeName}
                          </div>
                          <div className="text-[9px] flex items-center gap-1 font-bold" style={{ color: activeTheme.secondary }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTheme.primary }} />
                            <span>مفتوح للطلب</span>
                          </div>
                        </div>
                      </div>

                      {/* Mini Cart Button */}
                      <div
                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black shadow-2xs"
                        style={{
                          backgroundColor: activeTheme.primary,
                          color: activeTheme.primaryContrast,
                        }}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span className="text-[10px]">السلة (2)</span>
                      </div>
                    </div>

                    {/* Mini Categories */}
                    <div
                      className="p-2 border-b flex items-center gap-1.5 overflow-x-auto text-[10px] font-bold no-scrollbar"
                      style={{
                        backgroundColor: activeTheme.cardSubtle,
                        borderColor: activeTheme.line,
                      }}
                    >
                      <div
                        className="px-2.5 py-1 rounded-lg font-black shadow-2xs flex-shrink-0"
                        style={{
                          backgroundColor: activeTheme.primary,
                          color: activeTheme.primaryContrast,
                        }}
                      >
                        كافة الأصناف
                      </div>
                      <div
                        className="px-2.5 py-1 rounded-lg border flex-shrink-0"
                        style={{
                          backgroundColor: activeTheme.cardBg,
                          borderColor: activeTheme.line,
                          color: activeTheme.text,
                        }}
                      >
                        عروض حصرية
                      </div>
                      <div
                        className="px-2.5 py-1 rounded-lg border flex-shrink-0"
                        style={{
                          backgroundColor: activeTheme.cardBg,
                          borderColor: activeTheme.line,
                          color: activeTheme.text,
                        }}
                      >
                        الأكثر طلباً
                      </div>
                    </div>

                    {/* Mini Product Cards */}
                    <div
                      className="p-3 grid grid-cols-2 gap-2.5"
                      style={{ backgroundColor: activeTheme.bg }}
                    >
                      {/* Product 1 */}
                      <div
                        className="p-2.5 rounded-2xl border shadow-2xs space-y-2 transition-all"
                        style={{
                          backgroundColor: activeTheme.cardBg,
                          borderColor: activeTheme.line,
                        }}
                      >
                        <div
                          className="relative h-16 rounded-xl flex items-center justify-center border"
                          style={{
                            backgroundColor: activeTheme.cardSubtle,
                            borderColor: activeTheme.line,
                          }}
                        >
                          <Package className="w-6 h-6 opacity-40" style={{ color: activeTheme.primary }} />
                          <span
                            className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md text-[8px] font-black shadow-2xs"
                            style={{
                              backgroundColor: activeTheme.secondary,
                              color: activeTheme.secondaryContrast,
                            }}
                          >
                            -20% خصم
                          </span>
                        </div>

                        <div>
                          <div className="text-[10px] font-bold truncate" style={{ color: activeTheme.text }}>
                            أرز مصري فاخر
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] font-black font-mono" style={{ color: activeTheme.primary }}>
                              35.00 ج.م
                            </span>
                            <div
                              className="w-4 h-4 rounded-md flex items-center justify-center font-bold text-xs shadow-2xs"
                              style={{
                                backgroundColor: activeTheme.primary,
                                color: activeTheme.primaryContrast,
                              }}
                            >
                              <Plus className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Product 2 */}
                      <div
                        className="p-2.5 rounded-2xl border shadow-2xs space-y-2 transition-all"
                        style={{
                          backgroundColor: activeTheme.cardBg,
                          borderColor: activeTheme.line,
                        }}
                      >
                        <div
                          className="relative h-16 rounded-xl flex items-center justify-center border"
                          style={{
                            backgroundColor: activeTheme.cardSubtle,
                            borderColor: activeTheme.line,
                          }}
                        >
                          <Package className="w-6 h-6 opacity-40" style={{ color: activeTheme.primary }} />
                          <span
                            className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md text-[8px] font-black shadow-2xs"
                            style={{
                              backgroundColor: activeTheme.accent,
                              color: activeTheme.accentContrast,
                            }}
                          >
                            مميز
                          </span>
                        </div>

                        <div>
                          <div className="text-[10px] font-bold truncate" style={{ color: activeTheme.text }}>
                            زيت عباد الشمس
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] font-black font-mono" style={{ color: activeTheme.primary }}>
                              75.00 ج.م
                            </span>
                            <div
                              className="w-4 h-4 rounded-md flex items-center justify-center font-bold text-xs shadow-2xs"
                              style={{
                                backgroundColor: activeTheme.primary,
                                color: activeTheme.primaryContrast,
                              }}
                            >
                              <Plus className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mini Footer */}
                    <div
                      className="p-2.5 border-t text-center text-[9px]"
                      style={{
                        backgroundColor: activeTheme.footerBg,
                        color: activeTheme.footerText,
                        borderColor: activeTheme.footerLine,
                      }}
                    >
                      <div className="font-bold truncate">{storeName} • نظام كاشير رفيق الذكي</div>
                      <div className="text-[8px] mt-0.5" style={{ color: activeTheme.footerMuted }}>
                        كافة الحقوق محفوظة © 2026
                      </div>
                    </div>
                  </div>

                  {/* Button to open live store */}
                  <button
                    type="button"
                    onClick={onBackToStore}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black bg-store-primary hover:opacity-90 active:scale-95 text-white shadow-md transition-all btn-spring"
                  >
                    <ExternalLink className="w-4 h-4 text-white" />
                    <span className="text-white">معاينة المتجر الحي بكامل الشاشة</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
};
