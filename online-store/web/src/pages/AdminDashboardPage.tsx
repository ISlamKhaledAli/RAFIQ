import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Store, Category, Product } from '../types';
import type { StoreThemeCustom } from '../components/ThemeInjector';
import { formatUnitArabic } from '../utils/unitFormatter';
import { ThemeStudioPanel } from '../components/admin/ThemeStudioPanel';
import { AdminLoginScreen } from '../components/admin/AdminLoginScreen';
import {
  AnalyticsOverviewPanel,
  buildPresetDateRange,
  type AnalyticsPreset,
} from '../components/admin/AnalyticsOverviewPanel';
import { ProductsManagerPanel, type CatalogUndoAction } from '../components/admin/ProductsManagerPanel';
import { StoreSettingsPanel } from '../components/admin/StoreSettingsPanel';
import {
  playOrderChime,
  alertNewOrder,
  triggerOrderVibration,
  getNotificationPermission,
  requestNotificationPermission,
} from '../components/admin/audioChime';
import { OrderPrintReceipt } from '../components/admin/OrderPrintReceipt';
import type { AdminOrder } from '../components/admin/OrderPrintReceipt';
import { OrderCardItem } from '../components/admin/OrderCardItem';
import { OrderDetailsPanel } from '../components/admin/OrderDetailsPanel';
import { KanbanBoardView } from '../components/admin/KanbanBoardView';
import { AdminTopHeader } from '../components/admin/AdminTopHeader';
import { apiClient, OwnerAuthError, type DashboardOverviewData } from '../api/client';
import { compressProductImage } from '../utils/imageCompressor';
import {
  ShoppingBag,
  TrendingUp,
  Settings,
  Package,
  Palette,
  Search,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Columns3,
  ListFilter,
  X,
  PanelRightClose,
  PanelRightOpen,
  Cloud,
  Bell,
  Volume2,
} from 'lucide-react';

interface Props {
  store: Store;
  categories: Category[];
  products: Product[];
  currentThemePreset?: string;
  onThemeChange: (presetKey: string) => void;
  onThemeCustomChange?: (themeCustom: StoreThemeCustom) => void;
  onUpdateStore: (updated: Store) => void;
  onCategoriesChange?: (updated: Category[]) => void;
  onProductsChange?: (updated: Product[]) => void;
  onBackToStore: () => void;
}

type AdminTab = 'orders' | 'overview' | 'products' | 'settings' | 'theme';
type OrdersFilter = 'all' | 'new' | 'accepted' | 'ready' | 'delivered' | 'cancelled';

const VALID_ADMIN_TABS: AdminTab[] = ['orders', 'overview', 'products', 'settings', 'theme'];

function resolveInitialAdminTab(slug: string): AdminTab {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('tab') as AdminTab | null;
    if (fromUrl && VALID_ADMIN_TABS.includes(fromUrl)) {
      return fromUrl;
    }
    const fromStorage = sessionStorage.getItem(`rafiq_admin_tab:${slug}`) as AdminTab | null;
    if (fromStorage && VALID_ADMIN_TABS.includes(fromStorage)) {
      return fromStorage;
    }
  } catch {}
  return 'orders';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('تعذر قراءة الصورة المضغوطة'));
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة المضغوطة'));
    reader.readAsDataURL(blob);
  });
}

function formatOrderTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'الآن';
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return iso;
  const diffMin = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  return parsed.toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapCloudOrderToAdminOrder(raw: any): AdminOrder {
  const notesStr: string = raw.notes || '';
  const addrStr: string = raw.customer_address || '';
  const mapsMatch = addrStr.match(/https?:\/\/maps\.google\.com\/[^\s•|]+/);
  let paymentMethod = (raw.payment_method || '').trim();
  if (!paymentMethod) {
    paymentMethod = 'كاش عند الاستلام';
    if (notesStr.includes('إنستاباي') || notesStr.includes('InstaPay')) {
      paymentMethod = 'إنستاباي (InstaPay)';
    } else if (notesStr.includes('فودافون كاش')) {
      paymentMethod = 'فودافون كاش ومحافظ المحمول';
    }
  }

  let senderPhone = (raw.sender_phone || '').trim();
  if (!senderPhone && notesStr) {
    const senderMatch = notesStr.match(/(?:الحساب المحوّل منه|المحفظة المحوّل منها):\s*([^|]+)/);
    if (senderMatch) senderPhone = senderMatch[1].trim();
  }

  let paymentRef = (raw.payment_ref || '').trim();
  if (!paymentRef && notesStr) {
    const refMatch = notesStr.match(/كود المرجع:\s*([^|]+)/);
    if (refMatch) paymentRef = refMatch[1].trim();
  }

  return {
    id: raw.id,
    order_number: Number(raw.order_number) || 0,
    customer_name: raw.customer_name || 'عميل',
    customer_phone: raw.customer_phone || '',
    alt_phone: '',
    address_zone:
      raw.delivery_zone || (raw.delivery_method === 'pickup' ? 'استلام من المحل' : 'توصيل للمنزل'),
    address_street: addrStr || (raw.delivery_method === 'pickup' ? 'استلام شخصي من الفرع' : ''),
    address_building: '',
    address_floor_apt: '',
    address_landmark: '',
    maps_url: mapsMatch ? mapsMatch[0] : null,
    payment_method: paymentMethod,
    sender_phone: senderPhone,
    payment_ref: paymentRef,
    receipt_image: raw.receipt_image || null,
    notes: notesStr,
    subtotal: Number(raw.subtotal) || 0,
    delivery_fee: Number(raw.delivery_fee) || 0,
    total: Number(raw.total) || 0,
    status: raw.status || 'new',
    items: Array.isArray(raw.items)
      ? raw.items.map((it: any) => {
          const rawQty = Number(it.quantity) || 1000;
          const displayQty = rawQty >= 100 ? Number((rawQty / 1000).toFixed(3)) : rawQty;
          return {
            name: it.product_name || it.name || 'صنف',
            quantity: displayQty,
            unit: formatUnitArabic(it.unit || it.unit_name),
            unit_price: Number(it.product_price ?? it.unit_price) || 0,
            total_price: Number(it.line_total ?? it.total_price) || 0,
          };
        })
      : [],
    created_at: formatOrderTimestamp(raw.created_at),
  };
}

function buildInitialDemoOrders(): AdminOrder[] {
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
      total: 12500,
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
      address_zone: 'الدقي والمهندسين',
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
      total: 10400,
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
      total: 17500,
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
                unit: formatUnitArabic(it.unit || it.unit_name),
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
}

export const AdminDashboardPage: React.FC<Props> = ({
  store,
  categories,
  products,
  currentThemePreset,
  onThemeChange,
  onThemeCustomChange,
  onUpdateStore,
  onCategoriesChange,
  onProductsChange,
  onBackToStore,
}) => {
  const isDemoStore = store.id === 'rafiq-official-demo' || store.slug === 'rafiq';
  const tokenStorageKey = `rafiq_owner_token:${store.slug}`;
  const storePublicUrl = `https://rafiq-store-web.rafiq-store-api.workers.dev/${store.slug}`;

  // Real JWT Owner Auth for live stores; instant sandbox access for /rafiq demo store
  const [token, setToken] = useState<string | null>(() => {
    if (isDemoStore) return 'demo-sandbox';
    try {
      const saved = localStorage.getItem(tokenStorageKey);
      if (saved && saved !== 'demo-sandbox' && saved !== 'session-token-valid-mock') {
        localStorage.setItem('rafiq_owner_token', saved);
        return saved;
      }
    } catch {}
    return null;
  });
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [pin, setPin] = useState(isDemoStore ? '1234' : '');
  const [hasCustomPin, setHasCustomPin] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const clearOwnerSession = (reason?: string) => {
    try {
      localStorage.removeItem(tokenStorageKey);
      localStorage.removeItem('rafiq_owner_token');
    } catch {}
    setToken(null);
    if (reason) setLoginError(reason);
  };

  // Layout & Navigation (persisted in URL ?tab=... & sessionStorage so refresh stays on the exact tab!)
  const [activeTab, setActiveTabState] = useState<AdminTab>(() => resolveInitialAdminTab(store.slug));
  const [tabMotionPhase, setTabMotionPhase] = useState<'a' | 'b'>('a');
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rafiq_admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      localStorage.setItem('rafiq_admin_sidebar_collapsed', String(collapsed));
    } catch {}
  }, []);

  const [copiedHeaderLink, setCopiedHeaderLink] = useState(false);

  const setActiveTab = useCallback(
    (nextTab: AdminTab) => {
      setActiveTabState(prev => {
        if (prev !== nextTab) {
          setTabMotionPhase(p => (p === 'a' ? 'b' : 'a'));
        }
        return nextTab;
      });
      try {
        sessionStorage.setItem(`rafiq_admin_tab:${store.slug}`, nextTab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      } catch {}
    },
    [store.slug]
  );

  // Keep URL ?tab= synced on initial load & browser back/forward
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
      sessionStorage.setItem(`rafiq_admin_tab:${store.slug}`, activeTab);
    } catch {}
  }, [activeTab, store.slug]);

  useEffect(() => {
    const onPopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') as AdminTab | null;
        if (tab && VALID_ADMIN_TABS.includes(tab)) {
          setActiveTabState(tab);
        }
      } catch {}
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Orders Display State
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-101');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'kanban'>('split');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showMobileNotificationBanner, setShowMobileNotificationBanner] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const dismissed = sessionStorage.getItem('rafiq_mobile_notif_dismissed');
    if (dismissed) return false;
    return getNotificationPermission() === 'default';
  });
  const [orderToPrint, setOrderToPrint] = useState<AdminOrder | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>(() =>
    isDemoStore ? buildInitialDemoOrders() : []
  );

  // Store Editable Settings State
  const [storeName, setStoreName] = useState(store.name);
  const [welcomeMessage, setWelcomeMessage] = useState(store.welcome_message || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [whatsapp, setWhatsapp] = useState(store.whatsapp || '');
  const [address, setAddress] = useState(store.address || '');
  const [vodafoneCashPhone, setVodafoneCashPhone] = useState(store.vodafone_cash_phone || '');
  const [instapayHandle, setInstapayHandle] = useState(store.instapay_handle || '');
  const [workingHoursText, setWorkingHoursText] = useState(
    store.working_hours
      ? Object.entries(store.working_hours)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      : ''
  );
  const [minOrderPounds, setMinOrderPounds] = useState(((store.min_order_amount || 0) / 100).toString());
  const [isPaused, setIsPaused] = useState(store.is_paused === 1);
  const [pauseMessage, setPauseMessage] = useState(store.pause_message || '');
  const [deliveryZones, setDeliveryZones] = useState<Array<{ name: string; fee: number }>>(
    store.delivery_zones || []
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Global Toast Feedback & Cloud Sync
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState<{
    preset: AnalyticsPreset;
    from: string;
    to: string;
  }>(() => buildPresetDateRange('today'));
  const [overviewData, setOverviewData] = useState<DashboardOverviewData | null>(null);
  const lastKnownOrderCountRef = useRef<number | null>(null);

  const showToast = (msg: string, isError = false) => {
    if (isError) {
      setSaveErrorMsg(msg);
      setTimeout(() => setSaveErrorMsg(null), 3800);
    } else {
      setSaveSuccessMsg(msg);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  useEffect(() => {
    setStoreName(store.name);
    setWelcomeMessage(store.welcome_message || '');
    setPhone(store.phone || '');
    setWhatsapp(store.whatsapp || '');
    setAddress(store.address || '');
    setWorkingHoursText(
      store.working_hours
        ? Object.entries(store.working_hours)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : ''
    );
    setMinOrderPounds(((store.min_order_amount || 0) / 100).toString());
    setIsPaused(store.is_paused === 1);
    setPauseMessage(store.pause_message || '');
    setDeliveryZones(store.delivery_zones || []);
  }, [store.id, store.slug]);

  // Products & Categories Visibility Manager State
  const [managedCategories, setManagedCategories] = useState<Category[]>(categories);
  const [managedProducts, setManagedProducts] = useState<Product[]>(products);
  const [uploadingImageProductId, setUploadingImageProductId] = useState<string | null>(null);
  const [isBulkUpdatingCatalog, setIsBulkUpdatingCatalog] = useState(false);
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [productImageFeedback, setProductImageFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [catalogUndoAction, setCatalogUndoAction] = useState<CatalogUndoAction | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const registerUndoAction = (action: CatalogUndoAction | null) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setCatalogUndoAction(action);
    if (action) {
      undoTimerRef.current = window.setTimeout(() => {
        setCatalogUndoAction(null);
      }, 7500);
    }
  };

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setManagedCategories(categories);
  }, [categories]);

  useEffect(() => {
    setManagedProducts(products);
  }, [products]);

  const commitCategoriesUpdate = (updater: (prev: Category[]) => Category[]) => {
    setManagedCategories(prev => {
      const next = updater(prev);
      if (onCategoriesChange) onCategoriesChange(next);
      return next;
    });
  };

  const commitProductsUpdate = (updater: (prev: Product[]) => Product[]) => {
    setManagedProducts(prev => {
      const next = updater(prev);
      if (onProductsChange) onProductsChange(next);
      return next;
    });
  };

  // Theme Studio State
  const [selectedPreset, setSelectedPreset] = useState(
    currentThemePreset || store.theme_preset || 'rafiq-official'
  );
  const [themeCustomState, setThemeCustomState] = useState<StoreThemeCustom | null>(
    (store.theme_custom as StoreThemeCustom | null) || null
  );
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [themeSaveStatus, setThemeSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (currentThemePreset && currentThemePreset !== selectedPreset) {
      setSelectedPreset(currentThemePreset);
    }
  }, [currentThemePreset, selectedPreset]);

  // Live Cloud Dashboard Fetcher + 30s Auto-Poll
  const loadLiveCloudDashboard = useCallback(
    async (silent = false, customRange?: { from: string; to: string }) => {
      if (isDemoStore || !token || token === 'demo-sandbox') return;
      const targetRange = customRange || { from: analyticsRange.from, to: analyticsRange.to };
      if (!silent) setIsLoadingOrders(true);
      try {
        const [rawOrders, cloudProducts, cloudCategories, overview] = await Promise.all([
          apiClient.getDashboardOrders(token),
          apiClient.getDashboardProducts(token).catch(() => null),
          apiClient.getDashboardCategories(token).catch(() => null),
          apiClient.getDashboardOverview(token, targetRange).catch(() => null),
        ]);
        const mappedOrders = rawOrders.map(mapCloudOrderToAdminOrder);
        if (
          silent &&
          lastKnownOrderCountRef.current !== null &&
          mappedOrders.length > lastKnownOrderCountRef.current
        ) {
          const newest = mappedOrders[0];
          alertNewOrder(
            newest
              ? {
                  orderId: newest.id,
                  orderNumber: newest.order_number,
                  customerName: newest.customer_name,
                  totalPounds: (newest.total / 100).toFixed(2),
                  zone: newest.address_zone,
                }
              : undefined,
            soundEnabled
          );
        }
        lastKnownOrderCountRef.current = mappedOrders.length;
        setOrders(mappedOrders);
        if (cloudProducts) {
          setManagedProducts(cloudProducts);
        }
        if (cloudCategories) {
          setManagedCategories(cloudCategories);
        }
        if (overview) {
          setOverviewData(overview);
        }
      } catch (err: any) {
        if (err instanceof OwnerAuthError) {
          clearOwnerSession(err.message);
          return;
        }
        if (!silent) {
          showToast(err?.message || 'تعذر تحديث بيانات لوحة التحكم من السحابة', true);
        }
      } finally {
        if (!silent) setIsLoadingOrders(false);
      }
    },
    [isDemoStore, token, soundEnabled, analyticsRange.from, analyticsRange.to]
  );

  const handleAnalyticsRangeChange = async (next: {
    preset: AnalyticsPreset;
    from: string;
    to: string;
  }) => {
    setAnalyticsRange(next);
    if (isDemoStore || !token || token === 'demo-sandbox') return;
    setIsLoadingOverview(true);
    try {
      const overview = await apiClient.getDashboardOverview(token, {
        from: next.from,
        to: next.to,
      });
      setOverviewData(overview);
    } catch (err: any) {
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      showToast(err?.message || 'تعذر تحميل تقارير هذه الفترة', true);
    } finally {
      setIsLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (isDemoStore || !token || token === 'demo-sandbox') return;
    void loadLiveCloudDashboard(false);

    let disposed = false;
    let ws: WebSocket | null = null;
    let wsConnected = false;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectDelay = 2000;

    const refreshOrdersQuick = async () => {
      try {
        const rawOrders = await apiClient.getDashboardOrders(token);
        if (disposed) return;
        const mappedOrders = rawOrders.map(mapCloudOrderToAdminOrder);
        if (
          lastKnownOrderCountRef.current !== null &&
          mappedOrders.length > lastKnownOrderCountRef.current
        ) {
          const newest = mappedOrders[0];
          alertNewOrder(
            newest
              ? {
                  orderId: newest.id,
                  orderNumber: newest.order_number,
                  customerName: newest.customer_name,
                  totalPounds: (newest.total / 100).toFixed(2),
                  zone: newest.address_zone,
                }
              : undefined,
            soundEnabled
          );
        }
        lastKnownOrderCountRef.current = mappedOrders.length;
        setOrders(mappedOrders);
      } catch {
        // Silent fallback; full refresh handles auth/error states
      }
    };

    const connectRealtime = () => {
      if (disposed) return;
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // Ignore
        }
        ws = null;
      }

      try {
        const socket = new WebSocket(apiClient.getRealtimeWebSocketUrl(token));
        ws = socket;

        socket.onopen = () => {
          if (disposed) {
            try {
              socket.close();
            } catch {
              // Ignore
            }
            return;
          }
          wsConnected = true;
          reconnectDelay = 2000;
          // Zero-cost edge keepalive handled by Cloudflare WebSocket Auto-Response (0 billed DO requests)
          pingTimer = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send('ping');
              } catch {
                // Ignore
              }
            }
          }, 45000);
        };

        socket.onmessage = (event) => {
          if (disposed) return;
          const raw = typeof event.data === 'string' ? event.data.trim() : '';
          if (!raw || raw === 'pong') return;
          try {
            const msg = JSON.parse(raw) as { type?: string };
            if (msg.type === 'order_created' || msg.type === 'order_status_updated') {
              void refreshOrdersQuick();
            }
          } catch {
            // Ignore control frames
          }
        };

        socket.onerror = () => {
          // onclose handles reconnect
        };

        socket.onclose = () => {
          wsConnected = false;
          if (pingTimer !== null) {
            window.clearInterval(pingTimer);
            pingTimer = null;
          }
          if (!disposed) {
            const wait = reconnectDelay;
            reconnectDelay = Math.min(45000, Math.round(reconnectDelay * 1.8));
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              connectRealtime();
            }, wait);
          }
        };
      } catch {
        wsConnected = false;
      }
    };

    connectRealtime();

    // Adaptive fallback safety check: 100s calm orders/overview check when WS connected (never re-fetches thousands of products automatically)
    let tickCount = 0;
    const safetyTimer = window.setInterval(() => {
      if (document.hidden) return;
      tickCount++;
      if (!wsConnected) {
        void refreshOrdersQuick();
      } else if (tickCount % 4 === 0) {
        void refreshOrdersQuick();
      }
    }, 25000);

    return () => {
      disposed = true;
      if (pingTimer !== null) window.clearInterval(pingTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(safetyTimer);
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // Ignore
        }
        ws = null;
      }
    };
  }, [isDemoStore, token, soundEnabled, loadLiveCloudDashboard]);

  // Handlers: Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    if (isDemoStore) {
      setTimeout(() => {
        setIsLoggingIn(false);
        if (pin.trim().length >= 4) {
          setToken('demo-sandbox');
        } else {
          setLoginError('الرمز السري غير صحيح، يرجى إدخال 4 أرقام على الأقل (الافتراضي: 1234)');
        }
      }, 220);
      return;
    }

    if (!licenseKeyInput.trim()) {
      setIsLoggingIn(false);
      setLoginError('يرجى إدخال مفتاح الترخيص الخاص بالمحل (RFQ-XXXX-XXXX-XXXX)');
      return;
    }
    if (!pin.trim()) {
      setIsLoggingIn(false);
      setLoginError('يرجى إدخال الرمز السري (PIN)');
      return;
    }

    try {
      const res = await apiClient.ownerLogin(licenseKeyInput, pin);
      if (res.store?.slug && res.store.slug.toLowerCase() !== store.slug.toLowerCase()) {
        setLoginError(
          `مفتاح الترخيص هذا يخص المتجر (${res.store.name}) وليس هذا الرابط (${store.slug}).`
        );
        return;
      }
      try {
        localStorage.setItem(tokenStorageKey, res.token);
        localStorage.setItem('rafiq_owner_token', res.token);
      } catch {}
      if (typeof res.store?.has_custom_pin === 'boolean') {
        setHasCustomPin(res.store.has_custom_pin);
      }
      setToken(res.token);
    } catch (err: any) {
      setLoginError(err?.message || 'تعذر تسجيل الدخول. تأكد من مفتاح الترخيص والـ PIN.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleChangePin = async (currentPinVal: string, newPinVal: string) => {
    const res = await apiClient.changeOwnerPin(currentPinVal, newPinVal, token);
    if (res.token) {
      try {
        localStorage.setItem(tokenStorageKey, res.token);
        localStorage.setItem('rafiq_owner_token', res.token);
      } catch {}
      setToken(res.token);
    }
    setHasCustomPin(true);
    showToast('تم تحديث الرمز السري للوحة التحكم بنجاح');
  };

  // Handlers: Product Images & Settings
  const handleUploadProductImage = async (productId: string, file: File | null) => {
    if (!file) return;
    setUploadingImageProductId(productId);
    setProductImageFeedback(null);
    try {
      const { blob, contentType } = await compressProductImage(file);
      if (isDemoStore) {
        const targetProd = managedProducts.find(p => p.id === productId);
        const existing = targetProd?.image_urls || [];
        if (existing.length >= 3) {
          setProductImageFeedback({
            type: 'error',
            text: 'الحد الأقصى هو 3 صور لكل منتج. احذف صورة أولاً لإضافة صورة جديدة.',
          });
          return;
        }
        const dataUrl = await blobToDataUrl(blob);
        const nextUrls = [...existing, dataUrl];
        commitProductsUpdate(prev =>
          prev.map(p => (p.id === productId ? { ...p, image_urls: nextUrls } : p))
        );
        setProductImageFeedback({
          type: 'success',
          text: 'تم ضغط وإضافة الصورة بنجاح (وضع التجربة المحلية — في المتاجر المفعّلة تُرفع سحابياً).',
        });
        return;
      }

      const res = await apiClient.uploadProductImage(productId, blob, contentType, token);
      commitProductsUpdate(prev =>
        prev.map(p => (p.id === productId ? { ...p, image_urls: res.image_urls } : p))
      );
      setProductImageFeedback({
        type: 'success',
        text: 'تم ضغط ورفع صورة المنتج إلى السحابة بنجاح.',
      });
    } catch (err: any) {
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({
        type: 'error',
        text: err?.message || 'تعذر رفع الصورة. يرجى المحاولة مرة أخرى.',
      });
    } finally {
      setUploadingImageProductId(null);
    }
  };

  const handleAddProductImageUrl = async (productId: string, imageUrl: string) => {
    if (!imageUrl.trim()) return;
    setUploadingImageProductId(productId);
    setProductImageFeedback(null);
    try {
      if (isDemoStore) {
        const targetProd = managedProducts.find(p => p.id === productId);
        const existing = targetProd?.image_urls || [];
        if (existing.length >= 3) {
          setProductImageFeedback({
            type: 'error',
            text: 'الحد الأقصى هو 3 صور لكل منتج. احذف صورة أولاً لإضافة صورة جديدة.',
          });
          return;
        }
        const nextUrls = [...existing, imageUrl.trim()];
        commitProductsUpdate(prev =>
          prev.map(p => (p.id === productId ? { ...p, image_urls: nextUrls } : p))
        );
        setProductImageFeedback({
          type: 'success',
          text: 'تمت إضافة رابط الصورة بنجاح.',
        });
        return;
      }

      const res = await apiClient.addProductImageUrl(productId, imageUrl.trim(), token);
      commitProductsUpdate(prev =>
        prev.map(p => (p.id === productId ? { ...p, image_urls: res.image_urls } : p))
      );
      setProductImageFeedback({
        type: 'success',
        text: 'تمت إضافة رابط الصورة بنجاح.',
      });
    } catch (err: any) {
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({
        type: 'error',
        text: err?.message || 'تعذر إضافة رابط الصورة.',
      });
    } finally {
      setUploadingImageProductId(null);
    }
  };

  const handleDeleteProductImage = async (productId: string, url: string) => {
    setUploadingImageProductId(productId);
    setProductImageFeedback(null);
    try {
      if (isDemoStore) {
        commitProductsUpdate(prev =>
          prev.map(p =>
            p.id === productId ? { ...p, image_urls: (p.image_urls || []).filter(u => u !== url) } : p
          )
        );
        setProductImageFeedback({ type: 'success', text: 'تم حذف الصورة بنجاح.' });
        return;
      }

      const res = await apiClient.deleteProductImage(productId, url, token);
      commitProductsUpdate(prev =>
        prev.map(p => (p.id === productId ? { ...p, image_urls: res.image_urls } : p))
      );
      setProductImageFeedback({ type: 'success', text: 'تم حذف الصورة من السحابة بنجاح.' });
    } catch (err: any) {
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر حذف الصورة.' });
    } finally {
      setUploadingImageProductId(null);
    }
  };

  const handleToggleProductVisibility = async (id: string) => {
    const target = managedProducts.find(p => p.id === id);
    if (!target) return;
    const prevOnline = target.is_online !== 0 && target.stock_quantity > 0;
    const nextOnline = !prevOnline;
    const previousProducts = managedProducts;

    commitProductsUpdate(prev =>
      prev.map(p => (p.id === id ? { ...p, in_stock: nextOnline, is_online: nextOnline ? 1 : 0 } : p))
    );

    const feedbackText = nextOnline
      ? `تم إظهار "${target.name}" على المتجر الإلكتروني.`
      : `تم إخفاء "${target.name}" من المتجر الإلكتروني.`;

    const applyUndo = async () => {
      commitProductsUpdate(prev =>
        prev.map(p => (p.id === id ? { ...p, in_stock: prevOnline, is_online: prevOnline ? 1 : 0 } : p))
      );
      registerUndoAction(null);
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        await apiClient.updateDashboardProductOnlineSettings(id, { is_online: prevOnline ? 1 : 0 }, token);
      }
      setProductImageFeedback({ type: 'success', text: `تم التراجع واستعادة حالة "${target.name}".` });
    };

    if (isDemoStore || !token || token === 'demo-sandbox') {
      setProductImageFeedback({ type: 'success', text: feedbackText });
      registerUndoAction({ label: feedbackText, onUndo: applyUndo });
      return;
    }

    try {
      await apiClient.updateDashboardProductOnlineSettings(id, { is_online: nextOnline ? 1 : 0 }, token);
      setProductImageFeedback({ type: 'success', text: feedbackText });
      registerUndoAction({ label: feedbackText, onUndo: applyUndo });
    } catch (err: any) {
      commitProductsUpdate(() => previousProducts);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر تحديث حالة الصنف.' });
    }
  };

  const handleToggleCategoryVisibility = async (
    categoryId: string,
    nextOnline: boolean,
    cascadeProducts = false
  ) => {
    const target = managedCategories.find(c => c.id === categoryId);
    if (!target) return;
    const prevOnline = target.is_online !== 0;
    const previousCategories = managedCategories;
    const previousProducts = managedProducts;

    setUpdatingCategoryId(categoryId);
    commitCategoriesUpdate(prev =>
      prev.map(c => (c.id === categoryId ? { ...c, is_online: nextOnline ? 1 : 0 } : c))
    );
    if (cascadeProducts) {
      commitProductsUpdate(prev =>
        prev.map(p =>
          p.category_id === categoryId ? { ...p, is_online: nextOnline ? 1 : 0, in_stock: nextOnline } : p
        )
      );
    }

    const feedbackText = nextOnline
      ? `تم إظهار قسم "${target.name}" بالمتجر الإلكتروني.`
      : `تم إخفاء قسم "${target.name}" وجميع أصنافه عن المتجر الإلكتروني.`;

    const applyUndo = async () => {
      commitCategoriesUpdate(() => previousCategories);
      if (cascadeProducts) commitProductsUpdate(() => previousProducts);
      registerUndoAction(null);
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        await apiClient.updateDashboardCategoryVisibility(categoryId, prevOnline, token, cascadeProducts);
      }
      setProductImageFeedback({ type: 'success', text: `تم التراجع واستعادة ظهور قسم "${target.name}".` });
    };

    try {
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        await apiClient.updateDashboardCategoryVisibility(categoryId, nextOnline, token, cascadeProducts);
      }
      setProductImageFeedback({ type: 'success', text: feedbackText });
      registerUndoAction({ label: feedbackText, onUndo: applyUndo });
    } catch (err: any) {
      commitCategoriesUpdate(() => previousCategories);
      if (cascadeProducts) commitProductsUpdate(() => previousProducts);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر تحديث ظهور القسم.' });
    } finally {
      setUpdatingCategoryId(null);
    }
  };

  const handleBulkToggleCategoriesVisibility = async (categoryIds: string[], nextOnline: boolean) => {
    if (categoryIds.length === 0) return;
    const idSet = new Set(categoryIds);
    const previousCategories = managedCategories;

    setIsBulkUpdatingCatalog(true);
    commitCategoriesUpdate(prev =>
      prev.map(c => (idSet.has(c.id) ? { ...c, is_online: nextOnline ? 1 : 0 } : c))
    );

    const feedbackText = nextOnline
      ? `تم إظهار ${categoryIds.length} قسم بالمتجر الإلكتروني.`
      : `تم إخفاء ${categoryIds.length} قسم عن المتجر الإلكتروني.`;

    const applyUndo = async () => {
      commitCategoriesUpdate(() => previousCategories);
      registerUndoAction(null);
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        await apiClient.bulkUpdateDashboardCategoriesVisibility(categoryIds, !nextOnline, token, false);
      }
      setProductImageFeedback({ type: 'success', text: 'تم التراجع واستعادة حالة الأقسام السابقة.' });
    };

    try {
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        await apiClient.bulkUpdateDashboardCategoriesVisibility(categoryIds, nextOnline, token, false);
      }
      setProductImageFeedback({ type: 'success', text: feedbackText });
      registerUndoAction({ label: feedbackText, onUndo: applyUndo });
    } catch (err: any) {
      commitCategoriesUpdate(() => previousCategories);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر تحديث ظهور الأقسام.' });
    } finally {
      setIsBulkUpdatingCatalog(false);
    }
  };

  const handleBulkUpdateProducts = async (
    productIds: string[],
    patch: { is_online?: number; is_featured?: number }
  ) => {
    if (productIds.length === 0) return;
    const idSet = new Set(productIds);
    const previousProducts = managedProducts;
    const prevOnlineIds = previousProducts.filter(p => idSet.has(p.id) && p.is_online !== 0).map(p => p.id);
    const prevOfflineIds = previousProducts.filter(p => idSet.has(p.id) && p.is_online === 0).map(p => p.id);
    const prevFeaturedIds = previousProducts.filter(p => idSet.has(p.id) && p.is_featured === 1).map(p => p.id);
    const prevUnfeaturedIds = previousProducts.filter(p => idSet.has(p.id) && p.is_featured !== 1).map(p => p.id);

    setIsBulkUpdatingCatalog(true);
    commitProductsUpdate(prev =>
      prev.map(p => {
        if (!idSet.has(p.id)) return p;
        const nextOnlineVal = patch.is_online !== undefined ? patch.is_online : p.is_online;
        const nextFeaturedVal = patch.is_featured !== undefined ? patch.is_featured : p.is_featured;
        return {
          ...p,
          is_online: nextOnlineVal,
          in_stock: nextOnlineVal !== 0 && p.stock_quantity > 0,
          is_featured: nextFeaturedVal,
        };
      })
    );

    const feedbackText =
      patch.is_online === 0
        ? `تم إخفاء ${productIds.length} صنف عن المتجر الإلكتروني.`
        : patch.is_online === 1
        ? `تم إظهار ${productIds.length} صنف بالمتجر الإلكتروني.`
        : `تم تمييز ${productIds.length} صنف في قسم العروض المميزة.`;

    const applyUndo = async () => {
      commitProductsUpdate(() => previousProducts);
      registerUndoAction(null);
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        if (patch.is_online !== undefined) {
          if (prevOnlineIds.length > 0) {
            await apiClient.bulkUpdateDashboardProductsVisibility(prevOnlineIds, { is_online: 1 }, token);
          }
          if (prevOfflineIds.length > 0) {
            await apiClient.bulkUpdateDashboardProductsVisibility(prevOfflineIds, { is_online: 0 }, token);
          }
        }
        if (patch.is_featured !== undefined) {
          if (prevFeaturedIds.length > 0) {
            await apiClient.bulkUpdateDashboardProductsVisibility(prevFeaturedIds, { is_featured: 1 }, token);
          }
          if (prevUnfeaturedIds.length > 0) {
            await apiClient.bulkUpdateDashboardProductsVisibility(prevUnfeaturedIds, { is_featured: 0 }, token);
          }
        }
      }
      setProductImageFeedback({ type: 'success', text: 'تم التراجع واستعادة حالة الأصناف السابقة.' });
    };

    try {
      if (!isDemoStore && token && token !== 'demo-sandbox') {
        await apiClient.bulkUpdateDashboardProductsVisibility(productIds, patch, token);
      }
      setProductImageFeedback({ type: 'success', text: feedbackText });
      registerUndoAction({ label: feedbackText, onUndo: applyUndo });
    } catch (err: any) {
      commitProductsUpdate(() => previousProducts);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر تطبيق التعديل الجماعي.' });
    } finally {
      setIsBulkUpdatingCatalog(false);
    }
  };

  const handleToggleProductFeatured = async (id: string) => {
    const target = managedProducts.find(p => p.id === id);
    if (!target) return;
    const nextFeatured = target.is_featured === 1 ? 0 : 1;
    const previousProducts = managedProducts;

    commitProductsUpdate(prev =>
      prev.map(p => (p.id === id ? { ...p, is_featured: nextFeatured } : p))
    );

    if (isDemoStore || !token || token === 'demo-sandbox') return;

    try {
      await apiClient.updateDashboardProductOnlineSettings(id, { is_featured: nextFeatured }, token);
      setProductImageFeedback({
        type: 'success',
        text: nextFeatured === 1 ? 'تم إضافة الصنف إلى قسم العروض المميزة.' : 'تمت إزالة الصنف من العروض المميزة.',
      });
    } catch (err: any) {
      commitProductsUpdate(() => previousProducts);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر تحديث تمييز الصنف.' });
    }
  };

  const handleSaveProductDescription = async (id: string, description: string) => {
    const previousProducts = managedProducts;
    commitProductsUpdate(prev =>
      prev.map(p => (p.id === id ? { ...p, description: description || null } : p))
    );

    if (isDemoStore || !token || token === 'demo-sandbox') {
      setProductImageFeedback({ type: 'success', text: 'تم تحديث وصف الصنف بنجاح.' });
      return;
    }

    try {
      await apiClient.updateDashboardProductOnlineSettings(id, { description }, token);
      setProductImageFeedback({ type: 'success', text: 'تم حفظ وصف الصنف سحابياً بنجاح.' });
    } catch (err: any) {
      commitProductsUpdate(() => previousProducts);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر حفظ وصف الصنف.' });
    }
  };

  const handleBatchSaveProductDescriptions = async (
    updates: Array<{ id: string; description: string }>
  ) => {
    if (updates.length === 0) return;
    const descMap = new Map(updates.map(u => [u.id, u.description]));
    const previousProducts = managedProducts;

    setIsBulkUpdatingCatalog(true);
    commitProductsUpdate(prev =>
      prev.map(p => {
        if (descMap.has(p.id)) {
          return { ...p, description: descMap.get(p.id) || null };
        }
        return p;
      })
    );

    if (isDemoStore || !token || token === 'demo-sandbox') {
      setProductImageFeedback({
        type: 'success',
        text: `تم حفظ وتحديث أوصاف ${updates.length} صنف بنجاح.`,
      });
      setIsBulkUpdatingCatalog(false);
      return;
    }

    try {
      await apiClient.batchUpdateDashboardProducts(updates, token);
      setProductImageFeedback({
        type: 'success',
        text: `تم حفظ ${updates.length} وصف صنف سحابياً وتزامنها مع الكاشير.`,
      });
      registerUndoAction({
        label: `استعادة أوصاف ${updates.length} صنف السابقة`,
        onUndo: async () => {
          commitProductsUpdate(() => previousProducts);
          const rollbackUpdates = updates.map(u => {
            const old = previousProducts.find(p => p.id === u.id);
            return { id: u.id, description: old?.description || '' };
          });
          if (!isDemoStore && token && token !== 'demo-sandbox') {
            await apiClient.batchUpdateDashboardProducts(rollbackUpdates, token);
          }
          setProductImageFeedback({ type: 'success', text: 'تم التراجع واستعادة الأوصاف السابقة.' });
        },
      });
    } catch (err: any) {
      commitProductsUpdate(() => previousProducts);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر حفظ الأوصاف دفعة واحدة.' });
    } finally {
      setIsBulkUpdatingCatalog(false);
    }
  };

  const handleSmartPublishCatalog = async (
    preset: 'publish_in_stock' | 'publish_with_images_only' | 'publish_with_descriptions_only' | 'hide_out_of_stock' | 'hide_all' | 'publish_category',
    categoryId?: string
  ) => {
    const previousProducts = managedProducts;
    const previousCategories = managedCategories;
    setIsBulkUpdatingCatalog(true);

    commitProductsUpdate(prev =>
      prev.map(p => {
        if (preset === 'publish_in_stock') {
          const inStock = p.stock_quantity > 0;
          return { ...p, is_online: inStock ? 1 : 0, in_stock: inStock };
        }
        if (preset === 'publish_with_images_only') {
          const hasImg = Boolean(p.image_urls && p.image_urls.length > 0 && p.stock_quantity > 0);
          return { ...p, is_online: hasImg ? 1 : 0, in_stock: hasImg };
        }
        if (preset === 'publish_with_descriptions_only') {
          const hasDesc = Boolean(p.description && p.description.trim() && p.stock_quantity > 0);
          return { ...p, is_online: hasDesc ? 1 : 0, in_stock: hasDesc };
        }
        if (preset === 'hide_out_of_stock') {
          return p.stock_quantity <= 0 ? { ...p, is_online: 0, in_stock: false } : p;
        }
        if (preset === 'hide_all') {
          return { ...p, is_online: 0, in_stock: false };
        }
        if (preset === 'publish_category' && categoryId && p.category_id === categoryId) {
          const inStock = p.stock_quantity > 0;
          return { ...p, is_online: inStock ? 1 : 0, in_stock: inStock };
        }
        return p;
      })
    );

    if (preset === 'publish_in_stock' || preset === 'publish_category') {
      commitCategoriesUpdate(prev =>
        prev.map(c => {
          if (preset === 'publish_in_stock') return { ...c, is_online: 1 };
          if (preset === 'publish_category' && categoryId && c.id === categoryId) return { ...c, is_online: 1 };
          return c;
        })
      );
    }

    if (isDemoStore || !token || token === 'demo-sandbox') {
      setProductImageFeedback({
        type: 'success',
        text: 'تم تطبيق معالج النشر السريع بنجاح.',
      });
      setIsBulkUpdatingCatalog(false);
      return;
    }

    try {
      const res = await apiClient.smartPublishDashboardCatalog(preset, { category_id: categoryId }, token);
      const msg = res.message || 'تم تطبيق معالج النشر بنجاح.';
      setProductImageFeedback({ type: 'success', text: msg });
      registerUndoAction({
        label: 'التراجع عن معالج النشر واستعادة حالة الكتالوج',
        onUndo: async () => {
          commitProductsUpdate(() => previousProducts);
          commitCategoriesUpdate(() => previousCategories);
          const onlineIds = previousProducts.filter(p => p.is_online !== 0).map(p => p.id);
          const offlineIds = previousProducts.filter(p => p.is_online === 0).map(p => p.id);
          if (onlineIds.length > 0) {
            await apiClient.bulkUpdateDashboardProductsVisibility(onlineIds, { is_online: 1 }, token);
          }
          if (offlineIds.length > 0) {
            await apiClient.bulkUpdateDashboardProductsVisibility(offlineIds, { is_online: 0 }, token);
          }
          setProductImageFeedback({ type: 'success', text: 'تم التراجع واستعادة حالة الكتالوج السابقة.' });
        },
      });
    } catch (err: any) {
      commitProductsUpdate(() => previousProducts);
      commitCategoriesUpdate(() => previousCategories);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      setProductImageFeedback({ type: 'error', text: err?.message || 'تعذر تنفيذ معالج النشر السريع.' });
    } finally {
      setIsBulkUpdatingCatalog(false);
    }
  };

  // Handlers: Orders
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    if (newStatus === 'ready') {
      showToast('لا يمكن تحويل الطلب إلى (خرج مع الدليفري) من المتجر الإلكتروني. يجب تسليمه وطباعة الفاتورة من شاشة الكاشير في رفيق POS.', true);
      return;
    }

    const previousOrders = orders;
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o)));
    if (soundEnabled) playOrderChime();
    triggerOrderVibration('status_change');

    if (isDemoStore || !token || token === 'demo-sandbox') return;

    try {
      await apiClient.updateDashboardOrderStatus(orderId, newStatus, token);
      showToast('تم تحديث حالة الأوردر سحابياً بنجاح');
    } catch (err: any) {
      setOrders(previousOrders);
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
      showToast(err?.message || 'تعذر تحديث حالة الطلب على الخادم', true);
    }
  };

  const handlePrintReceipt = (order: AdminOrder) => {
    setOrderToPrint(order);
    setTimeout(() => window.print(), 100);
  };

  // Handlers: Store Settings
  const handleSaveStoreSettings = async () => {
    const parsedMinOrder = parseFloat(minOrderPounds || '0');
    const minOrderPiasters = isNaN(parsedMinOrder) ? 0 : Math.max(0, Math.round(parsedMinOrder * 100));

    const parsedWorkingHours: Record<string, string> = {};
    workingHoursText.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > -1) {
        const day = line.substring(0, idx).trim();
        const hrs = line.substring(idx + 1).trim();
        if (day && hrs) parsedWorkingHours[day] = hrs;
      }
    });
    const workingHoursValue = Object.keys(parsedWorkingHours).length > 0 ? parsedWorkingHours : null;

    const updatedStore: Store = {
      ...store,
      name: storeName.trim() || store.name,
      welcome_message: welcomeMessage.trim() || null,
      working_hours: workingHoursValue,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      address: address.trim() || null,
      vodafone_cash_phone: vodafoneCashPhone.trim() || null,
      instapay_handle: instapayHandle.trim() || null,
      min_order_amount: minOrderPiasters,
      is_paused: isPaused ? 1 : 0,
      pause_message: pauseMessage.trim() || null,
      delivery_zones: deliveryZones,
    };

    if (!isDemoStore && token && token !== 'demo-sandbox') {
      setIsSavingSettings(true);
      try {
        await apiClient.updateStoreSettings(
          {
            name: updatedStore.name,
            phone: updatedStore.phone,
            whatsapp: updatedStore.whatsapp,
            address: updatedStore.address,
            vodafone_cash_phone: updatedStore.vodafone_cash_phone,
            instapay_handle: updatedStore.instapay_handle,
            working_hours: workingHoursValue,
            welcome_message: updatedStore.welcome_message,
            min_order_amount: minOrderPiasters,
            delivery_zones: deliveryZones,
            is_paused: updatedStore.is_paused,
            pause_message: updatedStore.pause_message,
          },
          token
        );
        onUpdateStore(updatedStore);
        showToast('تم حفظ وتحديث كافة إعدادات المتجر سحابياً بنجاح!');
      } catch (err: any) {
        if (err instanceof OwnerAuthError) {
          clearOwnerSession(err.message);
          return;
        }
        showToast(err?.message || 'تعذر حفظ إعدادات المتجر سحابياً', true);
      } finally {
        setIsSavingSettings(false);
      }
      return;
    }

    onUpdateStore(updatedStore);
    showToast('تم حفظ الإعدادات بنجاح (وضع المعاينة المحلية)!');
  };

  // Handlers: Theme Studio
  const persistThemeSelection = async (nextPreset: string, nextCustom: StoreThemeCustom | null) => {
    setIsSavingTheme(true);
    setThemeSaveStatus(null);
    try {
      const res = await apiClient.updateStoreTheme(nextPreset, nextCustom, token);
      setThemeSaveStatus(res.persistedCloud ? 'تم الحفظ سحابياً' : 'تم التطبيق فوراً');
      setTimeout(() => setThemeSaveStatus(null), 2600);
    } catch (err: any) {
      if (err instanceof OwnerAuthError) {
        clearOwnerSession(err.message);
        return;
      }
    } finally {
      setIsSavingTheme(false);
    }
  };

  const handleSelectThemePreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    onThemeChange(presetKey);
    void persistThemeSelection(presetKey, themeCustomState);
  };

  const handleUpdateThemeCustom = (nextCustom: StoreThemeCustom) => {
    setThemeCustomState(nextCustom);
    if (onThemeCustomChange) {
      onThemeCustomChange(nextCustom);
    } else {
      onUpdateStore({ ...store, theme_custom: nextCustom });
    }
    void persistThemeSelection(selectedPreset, nextCustom);
  };

  const handleCopyHeaderUrl = () => {
    try {
      navigator.clipboard.writeText(storePublicUrl);
      setCopiedHeaderLink(true);
      setTimeout(() => setCopiedHeaderLink(false), 2000);
    } catch {}
  };

  // Filtered Orders & KPIs
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (ordersFilter !== 'all') {
        if (ordersFilter === 'new' && o.status !== 'new' && o.status !== 'viewed') return false;
        if (ordersFilter === 'accepted' && o.status !== 'accepted' && o.status !== 'preparing') return false;
        if (ordersFilter === 'cancelled' && o.status !== 'rejected' && o.status !== 'cancelled') return false;
        if (
          ordersFilter !== 'new' &&
          ordersFilter !== 'accepted' &&
          ordersFilter !== 'cancelled' &&
          o.status !== ordersFilter
        ) {
          return false;
        }
      }
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase().trim();
        return (
          o.order_number.toString().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.includes(q) ||
          o.address_zone.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, ordersFilter, orderSearchQuery]);

  useEffect(() => {
    if (filteredOrders.length > 0 && !filteredOrders.some(o => o.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => orders.find(o => o.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter(o => o.status === 'new' || o.status === 'viewed').length;
  const inPrepOrdersCount = orders.filter(o => o.status === 'accepted' || o.status === 'preparing').length;
  const readyOrdersCount = orders.filter(o => o.status === 'ready').length;
  const deliveredOrdersCount = orders.filter(o => o.status === 'delivered').length;
  const cancelledOrdersCount = orders.filter(o => o.status === 'rejected' || o.status === 'cancelled').length;
  const totalSalesPiasters = orders
    .filter(o => o.status !== 'rejected' && o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const totalSalesPounds = (totalSalesPiasters / 100).toFixed(2);
  const avgOrderPounds =
    totalOrdersCount > 0 ? (totalSalesPiasters / totalOrdersCount / 100).toFixed(2) : '0.00';

  // Gate 1: Flagship Split Login Portal
  if (!token) {
    return (
      <AdminLoginScreen
        store={store}
        isDemoStore={isDemoStore}
        licenseKeyInput={licenseKeyInput}
        pin={pin}
        isLoggingIn={isLoggingIn}
        loginError={loginError}
        onLicenseKeyChange={setLicenseKeyInput}
        onPinChange={setPin}
        onSubmit={handleLogin}
        onBackToStore={onBackToStore}
      />
    );
  }

  const navGroups: Array<{
    title: string;
    items: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; badgeAlert?: boolean }>;
  }> = [
    {
      title: 'العمليات اليومية',
      items: [
        {
          id: 'orders',
          label: 'الأوردرات',
          icon: ShoppingBag,
          badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
          badgeAlert: true,
        },
        { id: 'overview', label: 'المبيعات والتقارير', icon: TrendingUp },
        {
          id: 'products',
          label: 'الأصناف والمخزون',
          icon: Package,
          badge: managedProducts.length,
        },
      ],
    },
    {
      title: 'تخصيص المتجر',
      items: [
        { id: 'theme', label: 'القالب والألوان', icon: Palette },
        { id: 'settings', label: 'إعدادات المتجر والتوصيل', icon: Settings },
      ],
    },
  ];

  const mobileNavItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'orders', label: 'الأوردرات', icon: ShoppingBag, badge: pendingOrdersCount },
    { id: 'overview', label: 'التقارير', icon: TrendingUp },
    { id: 'products', label: 'الأصناف', icon: Package },
    { id: 'theme', label: 'الهوية', icon: Palette },
    { id: 'settings', label: 'الإعدادات', icon: Settings },
  ];

  const handleEnableMobileNotifications = async () => {
    const perm = await requestNotificationPermission();
    setShowMobileNotificationBanner(false);
    sessionStorage.setItem('rafiq_mobile_notif_dismissed', '1');
    alertNewOrder(
      {
        orderId: 'test-order',
        orderNumber: 'TEST',
        customerName: 'فحص تنبيهات الهاتف',
        totalPounds: '100.00',
        zone: 'الهاتف جاهز لاستقبال الطلبات',
      },
      soundEnabled
    );
    if (perm === 'granted') {
      showToast('تم تفعيل تنبيهات الهاتف الصوتية والإشعارات بنجاح!');
    } else {
      showToast('تم اختبار رنة التنبيه والاهتزاز على هاتفك.');
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#F4F6F8] text-slate-900 flex font-sans pb-20 lg:pb-0"
    >
      {/* Printable Thermal Receipt (Hidden on Screen, Active on Print) */}
      {(orderToPrint || selectedOrder) && (
        <OrderPrintReceipt order={orderToPrint || selectedOrder!} store={store} />
      )}

      {/* ========================================================================= */}
      {/* DESKTOP RTL SIDEBAR RAIL (Full-Viewport Pinned — Zero Empty Gap on Scroll) */}
      {/* ========================================================================= */}
      <aside
        className={`motion-sidebar hidden lg:flex flex-col h-full bg-[#00372D] text-white border-l border-white/10 flex-shrink-0 z-30 overflow-hidden ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between gap-2">
          <div className={`flex items-center gap-2.5 min-w-0 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
            <div className="w-10 h-10 rounded-2xl bg-white border border-white/25 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
              <img
                src={store.logo_url || '/rafiq_logo.png'}
                alt={storeName}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
                }}
                className="w-full h-full object-contain"
              />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-sm font-black text-white truncate">{storeName}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      store.is_paused === 1 ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                  <span className="text-[10px] text-emerald-100/80 font-bold truncate">
                    {store.is_paused === 1 ? 'مغلق مؤقتاً' : 'مفتوح للطلب'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-xl text-emerald-100/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="طي القائمة الجانبية"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="w-full p-2.5 rounded-xl text-emerald-100/70 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              title="توسيع القائمة الجانبية"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          )}

          {navGroups.map(group => (
            <div key={group.title} className="space-y-1.5">
              {!sidebarCollapsed && (
                <div className="px-3 text-[10px] font-bold text-emerald-200/60 tracking-wide">
                  {group.title}
                </div>
              )}
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-[#00372D] font-black shadow-md'
                        : 'text-emerald-50/85 hover:bg-white/10 hover:text-white'
                    } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive ? 'text-[#004D3F]' : 'text-emerald-200/80'
                        }`}
                      />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
                          item.badgeAlert
                            ? isActive
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                            : isActive
                            ? 'bg-[#E6F2ED] text-[#004D3F]'
                            : 'bg-white/15 text-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Bottom Utility Card */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {!sidebarCollapsed && (
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 flex items-center justify-between text-[11px] text-emerald-100/85 font-bold">
              <span className="flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-[#CED46A]" />
                <span>{isDemoStore ? 'وضع التجربة التفاعلي' : 'متصل بسحابة رفيق'}</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
          )}

          <button
            type="button"
            onClick={() => clearOwnerSession()}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-200 hover:text-white hover:bg-rose-500/20 transition-colors cursor-pointer ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="قفل وتسجيل الخروج"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN WORKSPACE COLUMN (Independent Scroll Pane on Desktop)                */}
      {/* ========================================================================= */}
      <div className="flex-1 min-w-0 flex flex-col lg:h-full lg:overflow-y-auto admin-scroll-pane">
        {/* Sleek 56px Executive Merchant Topbar */}
        <AdminTopHeader
          store={store}
          storeName={storeName}
          isDemoStore={isDemoStore}
          activeTab={activeTab}
          orders={orders}
          products={managedProducts}
          pendingOrdersCount={pendingOrdersCount}
          isLoadingOrders={isLoadingOrders}
          soundEnabled={soundEnabled}
          copiedHeaderLink={copiedHeaderLink}
          onRefresh={() => void loadLiveCloudDashboard(false)}
          onToggleSound={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) playOrderChime();
          }}
          onCopyUrl={handleCopyHeaderUrl}
          onOpenStore={onBackToStore}
          onLogout={() => clearOwnerSession()}
          onNavigateTab={setActiveTab}
          onSelectOrder={orderId => {
            setSelectedOrderId(orderId);
            setMobileDetailOpen(true);
          }}
        />

        {/* Global Floating Toast Notifications (Official Rafiq Desktop Motion) */}
        {saveSuccessMsg && (
          <div className="motion-toast fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#00372D] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-emerald-500/40">
            <CheckCircle2 className="w-4 h-4 text-[#CED46A] flex-shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
        {saveErrorMsg && (
          <div className="motion-toast fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-rose-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-rose-400/50">
            <AlertCircle className="w-4 h-4 text-rose-200 flex-shrink-0" />
            <span>{saveErrorMsg}</span>
          </div>
        )}

        {/* Mobile Phone Notification Permission & Activation Banner */}
        {showMobileNotificationBanner && (
          <div className="max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 pt-3">
            <div className="rounded-2xl p-3.5 bg-gradient-to-r from-[#00372D] to-[#004D3F] text-white border border-[#CED46A]/30 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 text-[#CED46A]">
                  <Bell className="w-5 h-5 text-[#CED46A]" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                    <span>تفعيل تنبيهات الطلبات على الهاتف</span>
                    <span className="text-[10px] bg-[#CED46A] text-[#00372D] px-2 py-0.5 rounded-full font-black">
                      رنة + اهتزاز + إشعار
                    </span>
                  </h4>
                  <p className="text-[11px] text-white/80 mt-0.5 font-medium leading-relaxed">
                    فعّل إشعارات الهاتف لتصلك رنة واهتزاز وتنبيه على شاشة القفل فور وصول أي أوردر جديد لمتجرك حتى لو كانت الشاشة مغلقة.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
                <button
                  type="button"
                  onClick={handleEnableMobileNotifications}
                  className="px-4 py-2 rounded-xl bg-[#CED46A] hover:bg-[#dce17d] text-[#00372D] text-xs font-black shadow-md btn-spring cursor-pointer flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#00372D]" />
                  <span>تفعيل وتجربة التنبيه 🔔</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileNotificationBanner(false);
                    sessionStorage.setItem('rafiq_mobile_notif_dismissed', '1');
                  }}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold btn-spring cursor-pointer"
                >
                  لاحقاً
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workspace Content Container (Desktop Twin-Phase Tab Motion) */}
        <main
          data-motion-phase={tabMotionPhase}
          className="max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 flex-1"
        >
          {/* ========================================================= */}
          {/* TAB 1: ORDERS COMMAND CENTER                              */}
          {/* ========================================================= */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {/* Compact Executive KPI Ribbon */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setOrdersFilter('new')}
                  className={`text-right p-4 rounded-2xl border transition-all cursor-pointer ${
                    pendingOrdersCount > 0
                      ? 'bg-amber-50/90 border-amber-300 shadow-2xs'
                      : 'bg-white border-slate-200/90 shadow-2xs hover:border-store-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
                    <span>أوردرات جديدة</span>
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-amber-950 font-mono">
                      {pendingOrdersCount}
                    </span>
                    <span className="text-[10px] text-amber-700 font-bold">بانتظار التأكيد</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrdersFilter('all')}
                  className="text-right bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-store-primary/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>إجمالي الأوردرات</span>
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-900 font-mono">
                      {totalOrdersCount}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">
                      ({deliveredOrdersCount} تم تسليمه)
                    </span>
                  </div>
                </button>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>مبيعات الأونلاين</span>
                    <TrendingUp className="w-4 h-4 text-[#004D3F]" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-[#004D3F] font-mono">
                      {totalSalesPounds}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">ج.م</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>متوسط الأوردر</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-900 font-mono">
                      {avgOrderPounds}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">ج.م</span>
                  </div>
                </div>
              </div>

              {/* Search, Status Filter Chips & View Mode Bar */}
              <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={e => setOrderSearchQuery(e.target.value)}
                    placeholder="ابحث برقم الأوردر، اسم الزبون، الموبايل، أو المنطقة..."
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F] transition-all font-medium"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOrderSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Chips */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {(
                    [
                      { key: 'all', label: 'الكل', count: orders.length },
                      { key: 'new', label: 'جديدة', count: pendingOrdersCount, alert: pendingOrdersCount > 0 },
                      { key: 'accepted', label: 'بيتجهز', count: inPrepOrdersCount },
                      { key: 'ready', label: 'مع الدليفري', count: readyOrdersCount },
                      { key: 'delivered', label: 'اتسلم', count: deliveredOrdersCount },
                      { key: 'cancelled', label: 'ملغي', count: cancelledOrdersCount },
                    ] as Array<{ key: OrdersFilter; label: string; count: number; alert?: boolean }>
                  ).map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setOrdersFilter(f.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap cursor-pointer ${
                        ordersFilter === f.key
                          ? 'bg-[#004D3F] !text-white font-black shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                      }`}
                    >
                      <span className={ordersFilter === f.key ? '!text-white' : ''}>{f.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                          ordersFilter === f.key
                            ? f.alert
                              ? 'bg-amber-400 text-slate-950 font-black'
                              : 'bg-white/20 !text-white'
                            : f.alert
                            ? 'bg-amber-200 text-amber-950 font-black'
                            : 'bg-white text-slate-600'
                        }`}
                      >
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Split vs Kanban Switcher */}
                <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-shrink-0 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewMode('split')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'split'
                        ? 'bg-white text-[#004D3F] shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>لوحة الأوردرات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('kanban')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'kanban'
                        ? 'bg-white text-[#004D3F] shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                    <span>كانبان</span>
                  </button>
                </div>
              </div>

              {/* Orders Content Stage */}
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">
                    {orders.length === 0 && !isDemoStore
                      ? isLoadingOrders
                        ? 'جاري تحميل طلبات المتجر...'
                        : 'لا توجد طلبات أونلاين حتى الآن'
                      : 'لا توجد طلبات مطابقة للبحث أو التصفية'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {orders.length === 0 && !isDemoStore
                      ? 'شارك رابط متجرك مع عملائك على واتساب، وفور وصول أي طلب سيظهر هنا لحظياً مع تنبيه صوتي.'
                      : 'قم بتغيير كلمة البحث أو اختيار تبويب تصفية آخر لعرض الطلبات المسجلة.'}
                  </p>
                  {(orderSearchQuery || ordersFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery('');
                        setOrdersFilter('all');
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors inline-block cursor-pointer"
                    >
                      إعادة ضبط الفلاتر
                    </button>
                  )}
                </div>
              ) : viewMode === 'kanban' ? (
                <KanbanBoardView
                  orders={filteredOrders}
                  onSelectOrder={ord => {
                    setSelectedOrderId(ord.id);
                    setMobileDetailOpen(true);
                  }}
                  onUpdateStatus={handleUpdateOrderStatus}
                  storeName={storeName}
                />
              ) : (
                <div className="lg:grid lg:grid-cols-12 lg:gap-5 items-start">
                  {/* Master Order Feed */}
                  <div className="lg:col-span-5 xl:col-span-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                      <span>قائمة الأوردرات ({filteredOrders.length})</span>
                      <span className="text-[11px] text-slate-400">الأحدث أولاً</span>
                    </div>
                    <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-260px)] pl-0.5">
                      {filteredOrders.map(ord => (
                        <OrderCardItem
                          key={ord.id}
                          order={ord}
                          isSelected={selectedOrder?.id === ord.id}
                          onSelect={o => {
                            setSelectedOrderId(o.id);
                            setMobileDetailOpen(true);
                          }}
                          storeName={storeName}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Detail Panel on Desktop */}
                  <div className="hidden lg:block lg:col-span-7 xl:col-span-8 sticky top-20">
                    {selectedOrder ? (
                      <OrderDetailsPanel
                        order={selectedOrder}
                        store={store}
                        onUpdateStatus={handleUpdateOrderStatus}
                        onPrintReceipt={handlePrintReceipt}
                      />
                    ) : (
                      <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
                        اختر أوردر من القائمة لعرض تفاصيله الكاملة هنا
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile Order Detail Sheet */}
              {mobileDetailOpen && selectedOrder && (
                <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/60 flex flex-col justify-end">
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
          {/* TAB 2: EXECUTIVE SALES & ANALYTICS                        */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <AnalyticsOverviewPanel
              store={store}
              orders={orders}
              products={managedProducts}
              overviewData={overviewData}
              isLoadingOverview={isLoadingOverview}
              isDemoStore={isDemoStore}
              activeRange={analyticsRange}
              onRangeChange={next => void handleAnalyticsRangeChange(next)}
              onNavigateTab={setActiveTab}
            />
          )}

          {/* ========================================================= */}
          {/* TAB 3: PRODUCTS & CLOUD MEDIA MANAGER                     */}
          {/* ========================================================= */}
          {activeTab === 'products' && (
            <ProductsManagerPanel
              categories={managedCategories}
              products={managedProducts}
              uploadingImageProductId={uploadingImageProductId}
              isBulkUpdating={isBulkUpdatingCatalog}
              updatingCategoryId={updatingCategoryId}
              feedback={productImageFeedback}
              undoAction={catalogUndoAction}
              onDismissFeedback={() => {
                setProductImageFeedback(null);
                registerUndoAction(null);
              }}
              onUploadImage={(pid, f) => void handleUploadProductImage(pid, f)}
              onAddImageUrl={(pid, url) => void handleAddProductImageUrl(pid, url)}
              onDeleteImage={(pid, url) => void handleDeleteProductImage(pid, url)}
              onToggleVisibility={pid => void handleToggleProductVisibility(pid)}
              onToggleFeatured={pid => void handleToggleProductFeatured(pid)}
              onSaveDescription={handleSaveProductDescription}
              onBatchSaveDescriptions={handleBatchSaveProductDescriptions}
              onSmartPublish={handleSmartPublishCatalog}
              onToggleCategoryVisibility={handleToggleCategoryVisibility}
              onBulkToggleCategoriesVisibility={handleBulkToggleCategoriesVisibility}
              onBulkUpdateProducts={handleBulkUpdateProducts}
            />
          )}

          {/* ========================================================= */}
          {/* TAB 4: ORGANIZED STORE SETTINGS & DELIVERY                */}
          {/* ========================================================= */}
          {activeTab === 'settings' && (
            <StoreSettingsPanel
              store={store}
              isDemoStore={isDemoStore}
              hasCustomPin={hasCustomPin || Boolean(overviewData?.has_custom_pin)}
              storeName={storeName}
              welcomeMessage={welcomeMessage}
              phone={phone}
              whatsapp={whatsapp}
              address={address}
              vodafoneCashPhone={vodafoneCashPhone}
              instapayHandle={instapayHandle}
              workingHoursText={workingHoursText}
              minOrderPounds={minOrderPounds}
              isPaused={isPaused}
              pauseMessage={pauseMessage}
              deliveryZones={deliveryZones}
              isSaving={isSavingSettings}
              onStoreNameChange={setStoreName}
              onWelcomeMessageChange={setWelcomeMessage}
              onPhoneChange={setPhone}
              onWhatsappChange={setWhatsapp}
              onAddressChange={setAddress}
              onVodafoneCashPhoneChange={setVodafoneCashPhone}
              onInstapayHandleChange={setInstapayHandle}
              onWorkingHoursChange={setWorkingHoursText}
              onMinOrderChange={setMinOrderPounds}
              onTogglePaused={() => setIsPaused(p => !p)}
              onPauseMessageChange={setPauseMessage}
              onAddDeliveryZone={(name, fee) => setDeliveryZones(prev => [...prev, { name, fee }])}
              onRemoveDeliveryZone={idx => setDeliveryZones(prev => prev.filter((_, i) => i !== idx))}
              onSave={() => void handleSaveStoreSettings()}
              onChangePin={handleChangePin}
              onBackToStore={onBackToStore}
            />
          )}

          {/* ========================================================= */}
          {/* TAB 5: THEME & TEMPLATE STUDIO                            */}
          {/* ========================================================= */}
          {activeTab === 'theme' && (
            <ThemeStudioPanel
              store={store}
              storeName={storeName}
              selectedPreset={selectedPreset}
              themeCustom={themeCustomState}
              onSelectPreset={handleSelectThemePreset}
              onChangeThemeCustom={handleUpdateThemeCustom}
              onBackToStore={onBackToStore}
              isSaving={isSavingTheme}
              saveStatusText={themeSaveStatus}
            />
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE THUMB-FRIENDLY BOTTOM NAVIGATION BAR (48px+ touch targets)         */}
      {/* ========================================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-1.5 py-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-5 gap-1">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors min-h-[48px] ${
                  active ? 'text-[#004D3F] bg-[#E6F2ED]/80' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -left-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black font-mono flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold mt-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
