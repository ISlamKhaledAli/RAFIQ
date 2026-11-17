import React, { useState } from 'react';
import type { Store, Product } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { THEME_PRESETS_CONFIG } from './ThemeInjector';
import {
  X,
  Shield,
  KeyRound,
  TrendingUp,
  Package,
  ShoppingBag,
  Palette,
  CheckCircle,
  XCircle,
  PauseCircle,
  PlayCircle,
  Loader2,
  Lock,
  ArrowRight,
  RefreshCw,
  Settings,
  Save,
  Plus,
  Trash2,
  MapPin,
  Phone,
  MessageSquare,
  FileText,
  DollarSign,
  Navigation,
  ExternalLink,
  CreditCard,
  Truck,
  Check,
  Clock,
  Sparkles,
  AlertCircle,
  User,
  Eye,
  Smartphone,
  ShieldCheck,
  Store as StoreIcon,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  products: Product[];
  onThemeChange: (preset: string) => void;
  onUpdateStore: (updatedStore: Store) => void;
}

export const DashboardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  store,
  products,
  onThemeChange,
  onUpdateStore,
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 300);

  const [token, setToken] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState('2026-سوق-الخير-تجريبي');
  const [pin, setPin] = useState('1234');
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'settings' | 'theme'>('orders');
  const [ordersFilter, setOrdersFilter] = useState<'all' | 'new' | 'accepted' | 'ready' | 'delivered'>('all');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Store editable settings state
  const [storeName, setStoreName] = useState(store.name);
  const [welcomeMessage, setWelcomeMessage] = useState(store.welcome_message || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [whatsapp, setWhatsapp] = useState(store.whatsapp || '');
  const [address, setAddress] = useState(store.address || '');
  const [instapayHandle, setInstapayHandle] = useState(store.instapay_handle || 'souq-elkhair@instapay');
  const [vodafoneCashPhone, setVodafoneCashPhone] = useState(store.vodafone_cash_phone || '01012345678');
  const [previewReceiptImg, setPreviewReceiptImg] = useState<string | null>(null);
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
    ]
  );
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFeePounds, setNewZoneFeePounds] = useState('20');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Enriched orders state with structured delivery addresses and detailed itemization
  const [mockOrders, setMockOrders] = useState(() => {
    const baseOrders = [
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
        receipt_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
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
        delivery_fee: 0,
        total: 8400, // 84.00 EGP
        status: 'accepted',
        items: [
          { name: 'جبنة دومتي فيتا 500 جم', quantity: 2, unit: 'علبة', unit_price: 4200, total_price: 8400 },
        ],
        created_at: 'منذ 35 دقيقة',
      },
    ];

    try {
      const stored = localStorage.getItem('rafiq_demo_placed_orders');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mapped = parsed.map((o: any) => ({
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
    } catch {
      // Ignore storage errors
    }
    return baseOrders;
  });

  const [selectedPreset, setSelectedPreset] = useState(store.theme_preset || 'duo-forest-cream');
  const [themeFilter, setThemeFilter] = useState<'all' | 'duotone' | 'material'>('all');

  if (!mounted) return null;

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

  const handleUpdateOrderStatus = (orderId: string, newStatus: string) => {
    setMockOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
  };

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

  // Convert theme presets config into array of presets
  const themePresets = Object.values(THEME_PRESETS_CONFIG);
  const filteredThemePresets = themePresets.filter(t => {
    if (themeFilter === 'all') return true;
    return t.styleType === themeFilter;
  });

  // Filtered orders
  const filteredOrders = mockOrders.filter(o => {
    if (ordersFilter === 'all') return true;
    return o.status === ordersFilter;
  });

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-center justify-center sm:p-4 md:p-6 bg-slate-950/70 transition-all duration-300 ease-in-out ${
        visible ? 'opacity-100 backdrop-blur-md' : 'opacity-0 backdrop-blur-none pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full h-full sm:h-[90vh] sm:max-h-[860px] max-w-5xl bg-white sm:rounded-3xl shadow-2xl border-0 sm:border border-slate-100 overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
          visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-6'
        }`}
      >
        {/* Dynamic Theme-Adaptive Header (Changes with active store theme!) */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-store-primary via-store-primary-hover to-store-primary text-white border-b border-white/10 flex items-center justify-between flex-shrink-0 shadow-sm transition-colors duration-300">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center shadow-md backdrop-blur-sm border border-white/20 p-1.5 flex-shrink-0">
              <img src="/rafiq_logo.png" alt="رفيق" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-tight truncate">لوحة تحكم المتجر</h2>
                <span className="text-[10px] sm:text-[11px] bg-white/20 text-white border border-white/30 px-2 py-0.5 rounded-full font-black flex-shrink-0">
                  إدارة سحابية
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-white/80 mt-0.5 font-medium truncate">{storeName} • برنامج كاشير رفيق</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors btn-spring text-xs font-bold flex-shrink-0"
          >
            <span className="sm:hidden">رجوع للمتجر</span>
            <span className="hidden sm:inline">إغلاق</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        {!token ? (
          // Login Form
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 max-w-md mx-auto w-full text-center">
            <div className="w-16 h-16 rounded-3xl bg-white p-3 border border-slate-200 text-store-primary flex items-center justify-center mb-4 shadow-md">
              <img src="/rafiq_logo.png" alt="برنامج رفيق" className="w-full h-full object-contain" />
            </div>
            <h3 className="text-xl font-black text-slate-900">تسجيل دخول المشرف</h3>
            <p className="text-xs text-slate-500 mt-1 mb-6 leading-relaxed">
              أدخل كود الترخيص والرمز السري الخاص بصاحب المحل لإدارة الأوردرات والمتجر
            </p>

            <form onSubmit={handleLogin} className="w-full space-y-4 text-right">
              {loginError && (
                <div className="p-3 text-xs font-bold text-rose-800 bg-rose-50 rounded-2xl border border-rose-200 text-center">
                  {loginError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">كود ترخيص المتجر</label>
                <input
                  type="text"
                  required
                  value={licenseKey}
                  onChange={e => setLicenseKey(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary font-bold text-center"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-store-primary" /> الرمز السري للدخول (الافتراضي: 1234)
                </label>
                <input
                  type="password"
                  required
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  className="w-full text-base p-3 rounded-2xl border border-slate-200 bg-slate-50 text-center tracking-[0.3em] font-black focus:outline-none focus:ring-2 focus:ring-store-primary"
                />
              </div>
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 bg-store-primary hover:bg-store-primary-hover disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-store-primary/20 transition-all active:scale-[0.98] btn-spring"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>دخول إلى لوحة التحكم</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          // Dashboard Management Area
          <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
            {/* Desktop Tabs Sidebar / Mobile Tabs Top Bar */}
            <div className="sm:w-60 bg-slate-50/90 border-b sm:border-b-0 sm:border-l border-slate-200 p-2 sm:p-4 flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-visible flex-shrink-0 scrollbar-none">
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all btn-spring flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'orders'
                    ? 'bg-store-primary text-white shadow-md font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                  <span>طلبات الزبائن</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  activeTab === 'orders' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {mockOrders.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all btn-spring flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'bg-store-primary text-white shadow-md font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <TrendingUp className="w-4 h-4 flex-shrink-0" />
                <span>نظرة عامة ومبيعات اليوم</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all btn-spring flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'settings'
                    ? 'bg-store-primary text-white shadow-md font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span>إعدادات وبيانات المتجر</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all btn-spring flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'products'
                    ? 'bg-store-primary text-white shadow-md font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 flex-shrink-0" />
                  <span>الأصناف المعروضة</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  activeTab === 'products' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {products.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('theme')}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all btn-spring flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'theme'
                    ? 'bg-store-primary text-white shadow-md font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Palette className="w-4 h-4 flex-shrink-0" />
                <span>ألوان وهوية المتجر ({themePresets.length})</span>
              </button>

              <div className="hidden sm:block mt-auto pt-4 border-t border-slate-200">
                <button
                  onClick={() => setToken(null)}
                  className="w-full text-right text-xs font-bold text-rose-600 hover:bg-rose-50 p-2.5 rounded-xl transition-colors btn-spring"
                >
                  تسجيل الخروج
                </button>
              </div>
            </div>

            {/* Dashboard Tab Panels */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
              {/* Orders Tab - High-End Management & Logistics */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  {/* Tab Header & Filter Pills */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900">إدارة ومتابعة طلبات الزبائن</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        بيانات العميل، تفاصيل العنوان، ورابط الخريطة لطاقم الدليفري
                      </p>
                    </div>

                    <button
                      onClick={() => {}}
                      className="flex items-center gap-1.5 text-xs font-bold text-store-primary hover:underline self-start sm:self-auto"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      تحديث الأوردرات
                    </button>
                  </div>

                  {/* Orders Filter Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    <button
                      onClick={() => setOrdersFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all btn-spring ${
                        ordersFilter === 'all'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      كافة الأوردرات ({mockOrders.length})
                    </button>
                    <button
                      onClick={() => setOrdersFilter('new')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition-all btn-spring ${
                        ordersFilter === 'new'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      طلبات جديدة ({mockOrders.filter(o => o.status === 'new').length})
                    </button>
                    <button
                      onClick={() => setOrdersFilter('accepted')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all btn-spring ${
                        ordersFilter === 'accepted'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                      }`}
                    >
                      جاري التجهيز ({mockOrders.filter(o => o.status === 'accepted').length})
                    </button>
                    <button
                      onClick={() => setOrdersFilter('ready')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all btn-spring ${
                        ordersFilter === 'ready'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                      }`}
                    >
                      مع الدليفري ({mockOrders.filter(o => o.status === 'ready').length})
                    </button>
                    <button
                      onClick={() => setOrdersFilter('delivered')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all btn-spring ${
                        ordersFilter === 'delivered'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      تم التسليم ({mockOrders.filter(o => o.status === 'delivered').length})
                    </button>
                  </div>

                  {/* Orders List */}
                  <div className="space-y-4">
                    {filteredOrders.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-3xl border border-slate-200">
                        <ShoppingBag className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <h4 className="text-sm font-bold text-slate-700">لا توجد طلبات في هذا القسم</h4>
                      </div>
                    ) : (
                      filteredOrders.map(ord => (
                        <div
                          key={ord.id}
                          className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4 hover:border-slate-300 transition-all"
                        >
                          {/* Order Header Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs font-black bg-store-primary text-white px-3 py-1 rounded-xl shadow-2xs">
                                طلب #{ord.order_number}
                              </span>
                              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {ord.created_at}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Status Badge */}
                              {ord.status === 'new' && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-amber-50 text-amber-800 px-3 py-1 rounded-xl border border-amber-200">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                  طلب جديد يحتاج مراجعة
                                </span>
                              )}
                              {ord.status === 'accepted' && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-blue-50 text-blue-800 px-3 py-1 rounded-xl border border-blue-200">
                                  <Check className="w-3.5 h-3.5 text-blue-600" />
                                  تم القبول وجاري التجهيز بالمحل
                                </span>
                              )}
                              {ord.status === 'ready' && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-purple-50 text-purple-800 px-3 py-1 rounded-xl border border-purple-200">
                                  <Truck className="w-3.5 h-3.5 text-purple-600" />
                                  في الطريق مع طيار الدليفري
                                </span>
                              )}
                              {ord.status === 'delivered' && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-emerald-50 text-emerald-800 px-3 py-1 rounded-xl border border-emerald-200">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  تم التسليم للعميل بنجاح
                                </span>
                              )}
                              {ord.status === 'rejected' && (
                                <span className="text-xs font-black bg-rose-50 text-rose-800 px-3 py-1 rounded-xl border border-rose-200">
                                  تم الاعتذار عن الطلب
                                </span>
                              )}

                              {/* Total Amount Pill */}
                              <div className="text-base font-black text-store-primary bg-store-primary-light px-3 py-1 rounded-xl">
                                {(ord.total / 100).toFixed(2)} ج.م
                              </div>
                            </div>
                          </div>

                          {/* Customer Identity & Contact Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-xs text-store-primary shadow-2xs">
                                <User className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-sm font-black text-slate-900">{ord.customer_name}</h4>
                                <div className="text-[11px] text-slate-500 font-medium">عميل المتجر الإلكتروني</div>
                              </div>
                            </div>

                            {/* Contact Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={`tel:${ord.customer_phone}`}
                                className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-black text-slate-800 hover:bg-slate-100 btn-spring shadow-2xs"
                              >
                                <Phone className="w-3.5 h-3.5 text-store-primary" />
                                <span dir="ltr">{ord.customer_phone}</span>
                              </a>

                              {ord.alt_phone && (
                                <a
                                  href={`tel:${ord.alt_phone}`}
                                  className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 btn-spring shadow-2xs"
                                >
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span dir="ltr">بديل: {ord.alt_phone}</span>
                                </a>
                              )}

                              <a
                                href={`https://wa.me/2${ord.customer_phone.replace(/^0+/, '')}?text=${encodeURIComponent(
                                  `مرحباً ${ord.customer_name}، نتواصل معك بخصوص طلبك رقم (#${ord.order_number}) من ${storeName}.`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black btn-spring shadow-2xs"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>مراسلة واتساب</span>
                              </a>
                            </div>
                          </div>

                          {/* Structured Delivery Address Box */}
                          <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 text-xs flex-1 min-w-0">
                                <MapPin className="w-4 h-4 text-store-primary flex-shrink-0 mt-0.5" />
                                <div className="space-y-1 min-w-0 leading-relaxed">
                                  <div className="font-bold text-slate-900">
                                    المنطقة: <strong className="text-store-primary">{ord.address_zone}</strong> • الشارع: {ord.address_street} • {ord.address_building}
                                  </div>
                                  <div className="text-slate-600 font-medium">
                                    {ord.address_floor_apt} • علامة مميزة: <strong className="text-slate-800">{ord.address_landmark}</strong>
                                  </div>
                                </div>
                              </div>

                              {/* Google Maps GPS Button */}
                              {ord.maps_url && (
                                <a
                                  href={ord.maps_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-xl text-xs font-black btn-spring flex-shrink-0 shadow-2xs"
                                >
                                  <Navigation className="w-3.5 h-3.5 text-blue-600" />
                                  <span>عرض موقع العميل على الخريطة</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Itemized Products List */}
                          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                            <div className="px-3.5 py-2 bg-slate-100/70 border-b border-slate-200 text-[11px] font-black text-slate-700 flex justify-between">
                              <span>الأصناف المطلوبة</span>
                              <span>السعر الإجمالي</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {ord.items.map((it: any, idx: number) => (
                                <div key={idx} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900">{it.name}</span>
                                    <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                                      {it.quantity} {it.unit} × {(it.unit_price / 100).toFixed(2)} ج.م
                                    </span>
                                  </div>
                                  <span className="font-black text-store-primary">
                                    {(it.total_price / 100).toFixed(2)} ج.م
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Financial breakdown & Payment Proof Bar */}
                            <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2.5 text-slate-600">
                              <div className="flex items-center gap-3">
                                <span>قيمة المشتريات: <strong>{(ord.subtotal / 100).toFixed(2)} ج.م</strong></span>
                                {ord.delivery_fee > 0 && (
                                  <span>رسوم التوصيل: <strong>{(ord.delivery_fee / 100).toFixed(2)} ج.م</strong></span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-700">طريقة الدفع:</span>
                                <span
                                  className={`px-2.5 py-0.5 rounded-lg font-black text-xs ${
                                    ord.payment_method.includes('فودافون')
                                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                      : ord.payment_method.includes('إنستاباي')
                                      ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  {ord.payment_method}
                                </span>

                                {ord.sender_phone && (
                                  <span className="text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg font-medium" dir="ltr">
                                    {ord.sender_phone}
                                  </span>
                                )}

                                {ord.receipt_image && (
                                  <button
                                    onClick={() => setPreviewReceiptImg(ord.receipt_image)}
                                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-xl font-bold text-xs shadow-2xs btn-spring"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>معاينة إيصال التحويل</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Customer Delivery Notes if any */}
                          {ord.notes && (
                            <div className="flex items-center gap-2 text-xs bg-amber-50/70 text-amber-900 p-2.5 rounded-xl border border-amber-200/70 font-medium">
                              <FileText className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                              <span>ملاحظات العميل: <strong>{ord.notes}</strong></span>
                            </div>
                          )}

                          {/* Order Lifecycle Workflow Actions */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                            <span className="text-xs text-slate-500 font-bold">إجراءات الوردية:</span>
                            <div className="flex flex-wrap items-center gap-2">
                              {ord.status === 'new' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateOrderStatus(ord.id, 'accepted')}
                                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm btn-spring"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>قبول الطلب وبدء التجهيز</span>
                                  </button>
                                  <button
                                    onClick={() => handleUpdateOrderStatus(ord.id, 'rejected')}
                                    className="flex items-center gap-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 px-3.5 py-2 rounded-xl text-xs font-bold btn-spring"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>اعتذار / رفض الطلب</span>
                                  </button>
                                </>
                              )}

                              {ord.status === 'accepted' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(ord.id, 'ready')}
                                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm btn-spring"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>تسليم للكابتن (خروج للتوصيل)</span>
                                </button>
                              )}

                              {ord.status === 'ready' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(ord.id, 'delivered')}
                                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm btn-spring"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>تأكيد اكتمال التسليم للعميل</span>
                                </button>
                              )}

                              {ord.status === 'delivered' && (
                                <span className="text-xs text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl font-black border border-emerald-200 flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  تم تسليم الطلب وتحصيل المبلغ بنجاح
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-base font-black text-slate-900">ملخص نشاط ومبيعات اليوم</h3>
                    <p className="text-xs text-slate-500 mt-0.5">متابعة فورية للمبيعات والأوردرات الواردة لحظياً</p>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-3xl bg-emerald-50 border border-emerald-200/70">
                      <div className="text-xs font-bold text-emerald-800">مبيعات اليوم الكلية</div>
                      <div className="text-xl sm:text-2xl font-black text-emerald-950 mt-1">15,450 ج.م</div>
                      <div className="text-[10px] text-emerald-700 mt-1">أوفلاين + أونلاين</div>
                    </div>

                    <div className="p-4 rounded-3xl bg-amber-50 border border-amber-200/70">
                      <div className="text-xs font-bold text-amber-800">أوردرات جديدة معلقة</div>
                      <div className="text-xl sm:text-2xl font-black text-amber-950 mt-1">
                        {mockOrders.filter(o => o.status === 'new').length}
                      </div>
                      <div className="text-[10px] text-amber-700 mt-1">محتاجة مراجعة وقبول</div>
                    </div>

                    <div className="p-4 rounded-3xl bg-blue-50 border border-blue-200/70">
                      <div className="text-xs font-bold text-blue-800">إجمالي الأصناف</div>
                      <div className="text-xl sm:text-2xl font-black text-blue-950 mt-1">{products.length} صنف</div>
                      <div className="text-[10px] text-blue-700 mt-1">معروضة أونلاين</div>
                    </div>

                    <div className="p-4 rounded-3xl bg-purple-50 border border-purple-200/70">
                      <div className="text-xs font-bold text-purple-800">حالة المتجر الآن</div>
                      <div className="text-sm font-black text-purple-950 mt-1.5 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                        {isPaused ? 'مغلق مؤقتاً' : 'مفتوح للطلب'}
                      </div>
                      <div className="text-[10px] text-purple-700 mt-1">تحكم فوري</div>
                    </div>
                  </div>

                  {/* Pause / Resume Control */}
                  <div className="p-4 sm:p-5 rounded-3xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">إيقاف أو فتح قبول الأوردرات</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        تقدر توقف استقبال الأوردرات في الإجازات أو أوقات الضغط في المحل بنقرة زرار
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const newPaused = !isPaused;
                        setIsPaused(newPaused);
                        onUpdateStore({ ...store, is_paused: newPaused ? 1 : 0 });
                      }}
                      className={`flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-black shadow-sm transition-colors btn-spring ${
                        isPaused
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                    >
                      {isPaused ? (
                        <>
                          <PlayCircle className="w-4 h-4" />
                          <span>فتح المتجر للزبائن الآن</span>
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-4 h-4" />
                          <span>إغلاق مؤقت للمتجر</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Settings Tab - Full Merchant Control */}
              {activeTab === 'settings' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900">إعدادات وبيانات المتجر</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        كل نص ومعلومة تظهر للزبون في واجهة المتجر يتم تعديلها من هنا
                      </p>
                    </div>
                    <button
                      onClick={handleSaveStoreSettings}
                      className="flex items-center gap-2 bg-store-primary hover:bg-store-primary-hover text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-md btn-spring"
                    >
                      <Save className="w-4 h-4" />
                      <span>حفظ التغييرات</span>
                    </button>
                  </div>

                  {saveSuccessMsg && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>{saveSuccessMsg}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Store Name */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">اسم المتجر / المحل</label>
                      <input
                        type="text"
                        value={storeName}
                        onChange={e => setStoreName(e.target.value)}
                        className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                      />
                    </div>

                    {/* Minimum Order Amount */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-store-primary" />
                        الحد الأدنى للطلب (بالجنيه)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={minOrderPounds}
                        onChange={e => setMinOrderPounds(e.target.value)}
                        className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                      />
                    </div>

                    {/* Phone Number */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-store-primary" />
                        رقم الهاتف لخدمة العملاء
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                      />
                    </div>

                    {/* WhatsApp Official Number */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        رقم الواتساب الرسمي للمتجر
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                        className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                      />
                    </div>

                    {/* InstaPay Account Handle / Phone */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-purple-900 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                        عنوان أو رقم إنستاباي (InstaPay) للدفع اللحظي
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثال: store@instapay أو 010xxxxxxxx"
                        value={instapayHandle}
                        onChange={e => setInstapayHandle(e.target.value)}
                        className="w-full text-xs font-bold p-3 rounded-2xl border border-purple-200 bg-purple-50/30 focus:outline-none focus:ring-2 focus:ring-purple-600 shadow-2xs"
                      />
                    </div>

                    {/* Vodafone Cash Wallet Number */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-rose-900 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-rose-600" />
                        رقم محفظة فودافون كاش والمحافظ الذكية
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثال: 010xxxxxxxx"
                        value={vodafoneCashPhone}
                        onChange={e => setVodafoneCashPhone(e.target.value)}
                        className="w-full text-xs font-bold p-3 rounded-2xl border border-rose-200 bg-rose-50/30 focus:outline-none focus:ring-2 focus:ring-rose-600 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Delivery & Pickup Methods Control */}
                  <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-store-primary" />
                      طرق استلام الأوردرات المتاحة للزبائن
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-store-primary" />
                          <div>
                            <span className="text-xs font-black text-slate-900 block">دليفري لحد البيت</span>
                            <span className="text-[10px] text-slate-500 font-medium">إتاحة خيار توصيل الأوردرات للعنوان</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={allowDelivery}
                          onChange={e => setAllowDelivery(e.target.checked)}
                          className="w-4 h-4 text-store-primary rounded accent-store-primary"
                        />
                      </label>

                      <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                        <div className="flex items-center gap-2">
                          <StoreIcon className="w-4 h-4 text-store-primary" />
                          <div>
                            <span className="text-xs font-black text-slate-900 block">استلام شخصي من المحل</span>
                            <span className="text-[10px] text-slate-500 font-medium">تجهيز الطلب والاستلام من الفرع</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={allowPickup}
                          onChange={e => setAllowPickup(e.target.checked)}
                          className="w-4 h-4 text-store-primary rounded accent-store-primary"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Payment Channels Activation Control */}
                  <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-store-primary" />
                      تفعيل وتعطيل قنوات الدفع للزبائن
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex items-center justify-between p-2.5 rounded-2xl bg-white border border-slate-200 cursor-pointer">
                        <span className="text-xs font-bold text-slate-800">كاش عند الاستلام</span>
                        <input
                          type="checkbox"
                          checked={acceptCash}
                          onChange={e => setAcceptCash(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded accent-emerald-600"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 rounded-2xl bg-white border border-purple-200 cursor-pointer">
                        <span className="text-xs font-bold text-purple-900">إنستاباي (InstaPay)</span>
                        <input
                          type="checkbox"
                          checked={acceptInstapay}
                          onChange={e => setAcceptInstapay(e.target.checked)}
                          className="w-4 h-4 text-purple-600 rounded accent-purple-600"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 rounded-2xl bg-white border border-rose-200 cursor-pointer">
                        <span className="text-xs font-bold text-rose-900">فودافون كاش والمحافظ</span>
                        <input
                          type="checkbox"
                          checked={acceptVodafoneCash}
                          onChange={e => setAcceptVodafoneCash(e.target.checked)}
                          className="w-4 h-4 text-rose-600 rounded accent-rose-600"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Physical Address */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-store-primary" />
                      عنوان المحل بالتفصيل
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                    />
                  </div>

                  {/* Welcome / Announcement Banner */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-store-primary" />
                      شريط الإعلانات والرسالة الترحيبية (يظهر أعلى الموقع وبطاقة المتجر)
                    </label>
                    <input
                      type="text"
                      value={welcomeMessage}
                      placeholder="مثال: خصومات حصرية لزبائننا وعروض خاصة على كافة احتياجاتك!"
                      onChange={e => setWelcomeMessage(e.target.value)}
                      className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs"
                    />
                  </div>

                  {/* Working Hours Settings */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-store-primary" />
                      مواعيد العمل والتوصيل (سطر لكل فترة)
                    </label>
                    <textarea
                      rows={2}
                      value={workingHoursText}
                      onChange={e => setWorkingHoursText(e.target.value)}
                      placeholder="السبت - الخميس: 9:00 ص - 12:00 م&#10;الجمعة: 1:00 م - 12:00 م"
                      className="w-full text-xs font-bold p-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary shadow-2xs resize-none"
                    />
                    <p className="text-[11px] text-slate-400 font-medium">
                      اكتب اليوم ثم نقطتين (:) ثم المواعيد، مثل: السبت - الخميس: 9:00 ص - 12:00 م
                    </p>
                  </div>

                  {/* Delivery Zones Management */}
                  <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-store-primary" />
                      إدارة مناطق التوصيل ورسومها
                    </h4>

                    {/* Existing Zones */}
                    <div className="space-y-2">
                      {deliveryZones.map((z, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-2xl border border-slate-200">
                          <span className="text-xs font-bold text-slate-800">{z.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-store-primary">
                              {(z.fee / 100).toFixed(2)} ج.م
                            </span>
                            <button
                              onClick={() => handleRemoveDeliveryZone(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                              title="حذف المنطقة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Zone */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                      <input
                        type="text"
                        placeholder="اسم المنطقة (مثال: حي الجامعة)"
                        value={newZoneName}
                        onChange={e => setNewZoneName(e.target.value)}
                        className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium"
                      />
                      <input
                        type="number"
                        placeholder="السعر (ج.م)"
                        value={newZoneFeePounds}
                        onChange={e => setNewZoneFeePounds(e.target.value)}
                        className="w-24 text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-center"
                      />
                      <button
                        onClick={handleAddDeliveryZone}
                        className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold btn-spring"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة</span>
                      </button>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleSaveStoreSettings}
                      className="w-full flex items-center justify-center gap-2 bg-store-primary hover:bg-store-primary-hover text-white py-3.5 rounded-2xl text-xs font-black shadow-lg shadow-store-primary/20 btn-spring"
                    >
                      <Save className="w-4 h-4" />
                      <span>حفظ إعدادات المتجر وتطبيقها فورياً</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Products Tab */}
              {activeTab === 'products' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900">الأصناف المعروضة للزبائن على الويب</h3>
                    <p className="text-xs text-slate-500 mt-0.5">يتم جلب الأسعار والمخزون لحظياً من كاشير المحل</p>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-xs">
                    {products.slice(0, 8).map(prod => (
                      <div key={prod.id} className="p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs sm:text-sm font-bold text-slate-900">{prod.name}</div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {(prod.price_piasters / 100).toFixed(2)} ج.م • المخزن: {prod.stock_quantity / 1000} {prod.unit_name}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl font-bold border border-emerald-100">
                          معروض أونلاين
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Theme Tab - Dynamic Color Presets from 2colors and Material */}
              {activeTab === 'theme' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <span>ألوان وهوية المتجر (هويات بصرية منسقة)</span>
                        <span className="text-xs bg-store-primary-light text-store-primary font-bold px-2 py-0.5 rounded-full">
                          {themePresets.length} هوية
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        لوحات ألوان احترافية مستوحاة من Colorion (ثنائية الألوان 2-Colors ومتعددة الألوان Material) تُغير الواجهة بالكامل
                      </p>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl flex-shrink-0 self-start sm:self-auto">
                      <button
                        onClick={() => setThemeFilter('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          themeFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        الكل ({themePresets.length})
                      </button>
                      <button
                        onClick={() => setThemeFilter('duotone')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          themeFilter === 'duotone'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ثنائية الألوان ({themePresets.filter(t => t.styleType === 'duotone').length})
                      </button>
                      <button
                        onClick={() => setThemeFilter('material')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          themeFilter === 'material'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        متعددة الألوان ({themePresets.filter(t => t.styleType === 'material').length})
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredThemePresets.map(t => {
                      const isSel = selectedPreset === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedPreset(t.id);
                            onThemeChange(t.id);
                            onUpdateStore({ ...store, theme_preset: t.id });
                            try {
                              localStorage.setItem('rafiq_active_theme_preset', t.id);
                            } catch {}
                          }}
                          className={`p-4 rounded-3xl border cursor-pointer flex flex-col justify-between transition-all btn-spring space-y-3.5 ${
                            isSel
                              ? 'border-2 border-store-primary bg-store-primary-light/40 shadow-sm'
                              : 'border border-slate-200 hover:border-slate-300 bg-white hover:shadow-2xs'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-slate-900">{t.name}</span>
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    t.styleType === 'duotone'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}
                                >
                                  {t.styleType === 'duotone' ? 'لونين (2-Colors)' : 'متعدد (4-Colors Material)'}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 font-medium mt-0.5">{t.category}</div>
                            </div>

                            {isSel ? (
                              <span className="p-1 rounded-full bg-store-primary text-white shadow-xs flex-shrink-0">
                                <CheckCircle className="w-4 h-4" />
                              </span>
                            ) : (
                              <span className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0 mt-0.5" />
                            )}
                          </div>

                          {/* Swatches strip */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                              {t.swatches.map((hex, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-0.5">
                                  <span
                                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl shadow-xs border border-black/10 flex-shrink-0"
                                    style={{ backgroundColor: hex }}
                                    title={hex}
                                  />
                                  <span className="text-[9px] font-mono text-slate-400 font-bold">{hex}</span>
                                </div>
                              ))}
                            </div>

                            {/* Mini UI Preview Element */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span
                                className="text-[10px] text-white font-black px-2.5 py-1 rounded-xl shadow-2xs"
                                style={{ background: t.gradient }}
                              >
                                تجربة الزر
                              </span>
                              <span
                                className="text-[10px] font-black px-2 py-1 rounded-xl shadow-2xs text-white"
                                style={{ backgroundColor: t.secondary }}
                              >
                                شارة
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Receipt Image Preview Lightbox Modal */}
      {previewReceiptImg && (
        <div
          onClick={() => setPreviewReceiptImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative max-w-lg w-full bg-white rounded-3xl p-4 sm:p-5 shadow-2xl border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h4 className="text-sm font-black text-slate-900">إيصال التحويل المرفق من العميل</h4>
              </div>
              <button
                onClick={() => setPreviewReceiptImg(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 flex items-center justify-center bg-slate-950">
              <img
                src={previewReceiptImg}
                alt="إيصال التحويل"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
              <span className="font-medium text-emerald-700">تأكد من مطابقة المبلغ ورقم التحويل في حسابك</span>
              <button
                onClick={() => setPreviewReceiptImg(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold btn-spring"
              >
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
