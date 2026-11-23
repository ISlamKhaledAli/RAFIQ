import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Store, Category, Product, CartItem } from './types';
import { apiClient, MOCK_STORE, MOCK_CATEGORIES, MOCK_PRODUCTS, StoreUnavailableError } from './api/client';
import {
  ThemeInjector,
  resolveThemePreset,
  resolveLayoutTemplate,
  type StoreThemeCustom,
} from './components/ThemeInjector';
import { applyDocumentBranding } from './utils/documentMeta';
import { buildWhatsAppUrl } from './utils/whatsapp';
import { Header } from './components/Header';
import { DesktopSidebar } from './components/DesktopSidebar';
import { CategoryPills } from './components/CategoryPills';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { FloatingCartBar } from './components/FloatingCartBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Toast } from './components/Toast';
import { RafiqBrandingCard } from './components/RafiqBrandingCard';
import { StoreNotFoundPage } from './components/StoreNotFoundPage';
import { StoreStoriesBar } from './components/StoreStoriesBar';
import { HeroPromoCarousel } from './components/HeroPromoCarousel';
import { TrustBadgesStrip } from './components/TrustBadgesStrip';
import { ProductGridSkeleton } from './components/ProductGridSkeleton';
import { InstantSearchModal } from './components/InstantSearchModal';
import { Flame, Star, SearchX, MapPin, Clock, ShieldCheck, CheckCircle2, Loader2, Heart } from 'lucide-react';

const STOREFRONT_PAGE_SIZE = 48;

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

function getCartStorageKey(slug: string): string {
  return `rafiq_store_cart_v1:${slug || 'rafiq'}`;
}

function getDeliveryPrefsStorageKey(slug: string): string {
  return `rafiq_store_delivery_v1:${slug || 'rafiq'}`;
}

function readStoredCart(slug: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getCartStorageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        Boolean(item.product) &&
        typeof item.product.id === 'string' &&
        typeof item.product.name === 'string' &&
        typeof item.product.price_piasters === 'number' &&
        Number.isFinite(item.product.price_piasters) &&
        typeof item.quantity === 'number' &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
    );
  } catch {
    return [];
  }
}

function readStoredDeliveryPrefs(slug: string): { method?: 'delivery' | 'pickup'; zone?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getDeliveryPrefsStorageKey(slug));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      method: parsed.method === 'pickup' || parsed.method === 'delivery' ? parsed.method : undefined,
      zone: typeof parsed.zone === 'string' ? parsed.zone : undefined,
    };
  } catch {
    return {};
  }
}

function safeDecodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export const App: React.FC = () => {
  const { storeSlug, isDemoRoot, invalidRoute, rawPathname } = useMemo(() => {
    const rawPath = window.location.pathname || '/';
    const segments = rawPath
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);

    if (segments.length === 0) {
      return { storeSlug: 'rafiq', isDemoRoot: true, invalidRoute: false, rawPathname: rawPath };
    }

    const first = safeDecodeSegment(segments[0]).toLowerCase();
    if (segments.length === 1) {
      if (first === 'admin' || first === 'dashboard' || first === 'rafiq') {
        return { storeSlug: 'rafiq', isDemoRoot: true, invalidRoute: false, rawPathname: rawPath };
      }
      return {
        storeSlug: first,
        isDemoRoot: false,
        invalidRoute: !VALID_SLUG_REGEX.test(first),
        rawPathname: rawPath,
      };
    }

    if (segments.length === 2) {
      const second = safeDecodeSegment(segments[1]).toLowerCase();
      if (second === 'admin' || second === 'dashboard') {
        if (first === 'rafiq') {
          return { storeSlug: 'rafiq', isDemoRoot: true, invalidRoute: false, rawPathname: rawPath };
        }
        return {
          storeSlug: first,
          isDemoRoot: false,
          invalidRoute: !VALID_SLUG_REGEX.test(first),
          rawPathname: rawPath,
        };
      }
    }

    return {
      storeSlug: first,
      isDemoRoot: false,
      invalidRoute: true,
      rawPathname: rawPath,
    };
  }, []);

  const [storeUnavailable, setStoreUnavailable] = useState<{ status: number; message: string; code?: string } | null>(
    () =>
      invalidRoute
        ? {
            status: 404,
            message: 'الصفحة أو المتجر الذي تحاول الوصول إليه غير موجود. يرجى التأكد من صحة الرابط.',
            code: 'ROUTE_NOT_FOUND',
          }
        : null
  );
  const [isLoadingStore, setIsLoadingStore] = useState<boolean>(() => !isDemoRoot && !invalidRoute);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const [store, setStore] = useState<Store>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('rafiq_active_theme_preset_v2') : null;
    let savedCustom: StoreThemeCustom | null = null;
    try {
      const rawCustom = typeof window !== 'undefined' ? localStorage.getItem('rafiq_active_theme_custom_v2') : null;
      if (rawCustom) savedCustom = JSON.parse(rawCustom);
    } catch {}
    return {
      ...MOCK_STORE,
      ...(saved ? { theme_preset: saved } : {}),
      ...(savedCustom ? { theme_custom: savedCustom } : {}),
    };
  });
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [productsPage, setProductsPage] = useState<number>(1);
  const [productsTotal, setProductsTotal] = useState<number>(MOCK_PRODUCTS.length);
  const [productsTotalPages, setProductsTotalPages] = useState<number>(1);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState<boolean>(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchQuery]);
  const [themePreset, setThemePreset] = useState<string>(() => {
    return (
      (typeof window !== 'undefined' && localStorage.getItem('rafiq_active_theme_preset_v2')) ||
      MOCK_STORE.theme_preset ||
      'rafiq-official'
    );
  });

  const handleThemeChange = (newPreset: string) => {
    setThemePreset(newPreset);
    setStore(prev => ({ ...prev, theme_preset: newPreset }));
    try {
      if (isDemoRoot) {
        localStorage.setItem('rafiq_active_theme_preset_v2', newPreset);
      }
    } catch {}
  };

  const handleThemeCustomChange = (newCustom: StoreThemeCustom) => {
    setStore(prev => ({ ...prev, theme_custom: newCustom }));
    try {
      if (isDemoRoot) {
        localStorage.setItem('rafiq_active_theme_custom_v2', JSON.stringify(newCustom));
      }
    } catch {}
  };

  const activeLayoutTemplate = useMemo(
    () => resolveLayoutTemplate(store.theme_custom as StoreThemeCustom | null),
    [store.theme_custom]
  );

  const themeCustom = useMemo(
    () => (store.theme_custom as StoreThemeCustom | null) || {},
    [store.theme_custom]
  );
  const showStoriesBar = themeCustom.showStoriesBar !== false;
  const showPromoHero = themeCustom.showPromoHero !== false;
  const showTrustBadges = themeCustom.showTrustBadges !== false;
  const showFreeShippingBar = themeCustom.showFreeShippingBar !== false;
  const freeShippingThresholdPiasters = (Number(themeCustom.freeShippingThresholdEgp) || 250) * 100;
  const showCartCrossSell = themeCustom.showCartCrossSell !== false;
  const showWhatsAppQuickOrder = themeCustom.showWhatsAppQuickOrder !== false;
  const showWishlist = themeCustom.showWishlist !== false;
  const showSavingsBadge = themeCustom.showSavingsBadge !== false;
  const showLowStockBadge = themeCustom.showLowStockBadge !== false;

  const productsGridClass =
    activeLayoutTemplate === 'compact'
      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5'
      : activeLayoutTemplate === 'boutique'
      ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6'
      : 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3 sm:gap-5';

  // Desktop quick filters
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [wishlistOnly, setWishlistOnly] = useState(false);

  // Full-page view routing: 'store' | 'admin'
  const [currentView, setCurrentView] = useState<'store' | 'admin'>(() => {
    try {
      const search = new URLSearchParams(window.location.search);
      const path = window.location.pathname.toLowerCase();
      if (
        search.get('admin') === '1' ||
        search.get('view') === 'admin' ||
        path.endsWith('/admin') ||
        path.endsWith('/dashboard')
      ) {
        return 'admin';
      }
    } catch {}
    return 'store';
  });

  const navigateToView = (view: 'store' | 'admin') => {
    setCurrentView(view);
    try {
      const url = new URL(window.location.href);
      if (view === 'admin') {
        url.searchParams.set('admin', '1');
        window.history.pushState({}, '', url.toString());
      } else {
        url.searchParams.delete('admin');
        url.searchParams.delete('view');
        url.searchParams.delete('tab');
        const cleanedPath = url.pathname.replace(/\/(admin|dashboard)\/?$/i, '') || '/';
        window.history.pushState({}, '', cleanedPath + (url.search ? url.search : ''));
      }
    } catch {}
  };

  useEffect(() => {
    const handlePopState = () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const path = window.location.pathname.toLowerCase();
        if (
          search.get('admin') === '1' ||
          search.get('view') === 'admin' ||
          path.endsWith('/admin') ||
          path.endsWith('/dashboard')
        ) {
          setCurrentView('admin');
        } else {
          setCurrentView('store');
        }
      } catch {}
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Cart & Modals (persisted per store slug across page refreshes)
  const [cartItems, setCartItems] = useState<CartItem[]>(() => readStoredCart(storeSlug));
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{ visible: boolean; message: string; key: number }>({
    visible: false,
    message: '',
    key: 0,
  });

  // Orders State
  const [lastOrderNumber, setLastOrderNumber] = useState<number>(101);
  const [lastOrderTotal, setLastOrderTotal] = useState<number>(0);
  const [lastOrderPaymentMethod, setLastOrderPaymentMethod] = useState<string>('cash');
  const [lastOrderReceipt, setLastOrderReceipt] = useState<string | null>(null);

  // Delivery (persisted per store slug)
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>(
    () => readStoredDeliveryPrefs(storeSlug).method || 'delivery'
  );
  const [selectedDeliveryZone, setSelectedDeliveryZone] = useState<string>(
    () =>
      readStoredDeliveryPrefs(storeSlug).zone ||
      (isDemoRoot ? MOCK_STORE.delivery_zones?.[0]?.name || '' : '')
  );

  // Persist cart to localStorage on every update
  useEffect(() => {
    if (typeof window === 'undefined' || invalidRoute) return;
    try {
      const key = getCartStorageKey(storeSlug);
      if (cartItems.length === 0) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(cartItems));
      }
    } catch {}
  }, [cartItems, storeSlug, invalidRoute]);

  // Persist delivery method & zone per store
  useEffect(() => {
    if (typeof window === 'undefined' || invalidRoute) return;
    try {
      window.localStorage.setItem(
        getDeliveryPrefsStorageKey(storeSlug),
        JSON.stringify({ method: deliveryMethod, zone: selectedDeliveryZone })
      );
    } catch {}
  }, [deliveryMethod, selectedDeliveryZone, storeSlug, invalidRoute]);

  // Reload isolated cart if storeSlug changes
  const prevSlugRef = useRef(storeSlug);
  useEffect(() => {
    if (prevSlugRef.current !== storeSlug) {
      prevSlugRef.current = storeSlug;
      setCartItems(readStoredCart(storeSlug));
      const prefs = readStoredDeliveryPrefs(storeSlug);
      setDeliveryMethod(prefs.method || 'delivery');
      setSelectedDeliveryZone(prefs.zone || '');
    }
  }, [storeSlug]);

  // Active bottom nav tab
  const [mobileTab, setMobileTab] = useState<'home' | 'categories'>('home');

  // Customer Wishlist State (persisted per store slug)
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(`rafiq_store_wishlist_v1:${storeSlug || 'rafiq'}`);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });

  const toggleWishlist = (productId: string) => {
    setWishlistIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        setToast(t => ({
          visible: true,
          message: 'تمت إزالة الصنف من المفضلة',
          key: t.key + 1,
        }));
      } else {
        next.add(productId);
        setToast(t => ({
          visible: true,
          message: 'تمت إضافة الصنف إلى المفضلة',
          key: t.key + 1,
        }));
      }
      try {
        localStorage.setItem(
          `rafiq_store_wishlist_v1:${storeSlug || 'rafiq'}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  // Active Story Filter State
  const [activeStoryFilter, setActiveStoryFilter] = useState<string | null>(null);

  const handleSelectStory = (storyId: string) => {
    setActiveStoryFilter(storyId);
    if (storyId === 'deals') {
      setSelectedCategoryId('all');
      setFeaturedOnly(true);
      setInStockOnly(false);
      setSearchQuery('');
    } else if (storyId === 'best_sellers') {
      setSelectedCategoryId('all');
      setFeaturedOnly(true);
      setInStockOnly(false);
      setSearchQuery('');
    } else if (storyId === 'new_arrivals') {
      setSelectedCategoryId('all');
      setFeaturedOnly(false);
      setInStockOnly(true);
      setSearchQuery('');
    } else if (storyId === 'free_delivery') {
      setIsCartOpen(true);
    } else if (storyId === 'combos') {
      setSelectedCategoryId('all');
      setSearchQuery('');
    } else {
      setSelectedCategoryId('all');
      setFeaturedOnly(false);
      setInStockOnly(false);
      setSearchQuery('');
    }
  };

  const categoriesSectionRef = useRef<HTMLDivElement>(null);

  // Load Data
  useEffect(() => {
    if (invalidRoute) {
      setIsLoadingStore(false);
      return;
    }
    let cancelled = false;
    async function loadData() {
      try {
        if (!isDemoRoot) setIsLoadingStore(true);
        setStoreUnavailable(null);
        const storeData = await apiClient.getStore(storeSlug, isDemoRoot);
        if (cancelled) return;
        const saved = isDemoRoot && typeof window !== 'undefined' ? localStorage.getItem('rafiq_active_theme_preset_v2') : null;
        let savedCustom: StoreThemeCustom | null = null;
        if (isDemoRoot && typeof window !== 'undefined') {
          try {
            const rawC = localStorage.getItem('rafiq_active_theme_custom_v2');
            if (rawC) savedCustom = JSON.parse(rawC);
          } catch {}
        }
        const effectiveTheme = saved || storeData.theme_preset || 'rafiq-official';
        const mergedStore = {
          ...storeData,
          theme_preset: effectiveTheme,
          theme_custom: savedCustom || storeData.theme_custom || null,
        };
        setStore(mergedStore);
        setThemePreset(effectiveTheme);
        if (mergedStore.delivery_zones && mergedStore.delivery_zones.length > 0) {
          setSelectedDeliveryZone(prev =>
            mergedStore.delivery_zones!.some(z => z.name === prev)
              ? prev
              : mergedStore.delivery_zones![0].name
          );
        } else {
          setSelectedDeliveryZone('');
        }

        const [cats, firstPage] = await Promise.all([
          apiClient.getCategories(storeSlug, isDemoRoot),
          apiClient.getProductsPage(
            storeSlug,
            { page: 1, limit: STOREFRONT_PAGE_SIZE },
            isDemoRoot
          ),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setProducts(firstPage.products);
        setProductsPage(1);
        setProductsTotal(firstPage.pagination.total);
        setProductsTotalPages(firstPage.pagination.totalPages);

        // Refresh prices/stock for any restored cart items present in the first page (server validates full cart on checkout)
        if (firstPage.products.length > 0) {
          const liveById = new Map(firstPage.products.map(p => [p.id, p]));
          setCartItems(prev => {
            if (prev.length === 0) return prev;
            const reconciled: CartItem[] = [];
            for (const item of prev) {
              const live = liveById.get(item.product.id);
              if (live) {
                if (!live.in_stock || live.stock_quantity <= 0) continue;
                reconciled.push({ product: live, quantity: item.quantity });
              } else {
                reconciled.push(item);
              }
            }
            return reconciled;
          });
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof StoreUnavailableError) {
          setStoreUnavailable({ status: e.status, message: e.message, code: e.code });
          return;
        }
        console.error('Failed to load store data:', e);
      } finally {
        if (!cancelled) setIsLoadingStore(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [storeSlug, isDemoRoot, invalidRoute, reloadNonce]);

  // Server-side filtered query whenever category, featured toggle, or debounced search changes
  const isInitialFilterMountRef = useRef(true);
  useEffect(() => {
    if (invalidRoute || storeUnavailable) return;
    if (isInitialFilterMountRef.current) {
      isInitialFilterMountRef.current = false;
      return;
    }
    let cancelled = false;
    async function fetchFilteredFirstPage() {
      setIsLoadingProducts(true);
      try {
        const res = await apiClient.getProductsPage(
          storeSlug,
          {
            categoryId: selectedCategoryId,
            search: debouncedSearchQuery,
            featured: featuredOnly,
            page: 1,
            limit: STOREFRONT_PAGE_SIZE,
          },
          isDemoRoot
        );
        if (cancelled) return;
        setProducts(res.products);
        setProductsPage(1);
        setProductsTotal(res.pagination.total);
        setProductsTotalPages(res.pagination.totalPages);
      } catch {
        // Keep previous products on transient network hiccup
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    }
    void fetchFilteredFirstPage();
    return () => {
      cancelled = true;
    };
  }, [storeSlug, isDemoRoot, invalidRoute, storeUnavailable, selectedCategoryId, featuredOnly, debouncedSearchQuery]);

  const handleLoadMoreProducts = useCallback(async () => {
    if (isLoadingMoreProducts || isLoadingProducts || productsPage >= productsTotalPages) return;
    const nextPage = productsPage + 1;
    setIsLoadingMoreProducts(true);
    try {
      const res = await apiClient.getProductsPage(
        storeSlug,
        {
          categoryId: selectedCategoryId,
          search: debouncedSearchQuery,
          featured: featuredOnly,
          page: nextPage,
          limit: STOREFRONT_PAGE_SIZE,
        },
        isDemoRoot
      );
      setProducts(prev => {
        const seen = new Set(prev.map(p => p.id));
        const merged = [...prev];
        for (const p of res.products) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        return merged;
      });
      setProductsPage(nextPage);
      setProductsTotal(res.pagination.total);
      setProductsTotalPages(res.pagination.totalPages);
    } finally {
      setIsLoadingMoreProducts(false);
    }
  }, [
    isLoadingMoreProducts,
    isLoadingProducts,
    productsPage,
    productsTotalPages,
    storeSlug,
    selectedCategoryId,
    debouncedSearchQuery,
    featuredOnly,
    isDemoRoot,
  ]);

  // Smooth infinite scroll: automatically loads next 48 products when shopper approaches bottom
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || currentView !== 'store' || productsPage >= productsTotalPages) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          void handleLoadMoreProducts();
        }
      },
      { rootMargin: '320px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentView, productsPage, productsTotalPages, handleLoadMoreProducts]);

  // Dynamic Page Title, Favicon & Theme Color per Store / Slug / View
  useEffect(() => {
    if (storeUnavailable) {
      const title =
        storeUnavailable.status === 403
          ? 'المتجر غير متاح حالياً | رفيق للمتاجر الإلكترونية'
          : storeUnavailable.status === 0 || storeUnavailable.status >= 500
          ? 'تعذر الاتصال | رفيق للمتاجر الإلكترونية'
          : 'المتجر غير موجود (404) | رفيق للمتاجر الإلكترونية';
      applyDocumentBranding({
        title,
        description: storeUnavailable.message,
        faviconHref: '/app_icon_512.png',
        appleTouchIconHref: '/app_icon_512.png',
        themeColor: '#004D3F',
      });
      return;
    }

    if (!isLoadingStore && store?.name) {
      const themeCfg = resolveThemePreset(themePreset || store.theme_preset || 'rafiq-official');
      const isOfficialDemo = store.slug === 'rafiq';
      const cleanName = (store.name || '').trim();
      const displayStoreName =
        cleanName.length > 0 && cleanName.toLowerCase() !== 'test'
          ? cleanName
          : (store.slug && store.slug !== 'test' ? store.slug : 'متجر رفيق');

      const title =
        currentView === 'admin'
          ? `لوحة تحكم ${displayStoreName} | رفيق`
          : isOfficialDemo
          ? `${displayStoreName} | تسوق أونلاين`
          : `${displayStoreName} | اطلب أونلاين`;

      const faviconHref =
        store.logo_url && store.logo_url.trim().length > 0
          ? store.logo_url.trim()
          : '/rafiq_logo.png';

      const appleTouchIconHref =
        store.logo_url && store.logo_url.trim().length > 0
          ? store.logo_url.trim()
          : '/rafiq_logo.png';

      applyDocumentBranding({
        title,
        description:
          store.welcome_message ||
          `تسوق الآن من ${store.name}${store.address ? ` — ${store.address}` : ''} واطلب أونلاين بأسعار المحل الرسمية.`,
        faviconHref,
        appleTouchIconHref,
        themeColor: themeCfg.primary,
      });
    }
  }, [storeUnavailable, isLoadingStore, store, themePreset, currentView]);

  // Cart operations with Toast feedback
  const handleAddToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });

    // Compact micro-pill toast feedback
    setToast(prev => ({
      visible: true,
      message: `تمت إضافة "${product.name}" للسلة`,
      key: prev.key + 1,
    }));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.product.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(i =>
          i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i
        );
      }
      return prev.filter(i => i.product.id !== productId);
    });
  };

  const handleClearItem = (productId: string) => {
    setCartItems(prev => prev.filter(i => i.product.id !== productId));
  };

  const cartCount = useMemo(() => {
    return cartItems.reduce((acc, i) => acc + i.quantity, 0);
  }, [cartItems]);

  const cartTotalPiasters = useMemo(() => {
    return cartItems.reduce((acc, i) => acc + i.product.price_piasters * i.quantity, 0);
  }, [cartItems]);

  const hiddenCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) {
      if (c.is_online === 0) set.add(c.id);
    }
    return set;
  }, [categories]);

  // Storefront-visible products (strictly exclude manually hidden items, out-of-stock, and hidden categories)
  const storefrontProducts = useMemo(() => {
    return products.filter(p => {
      if (p.is_online === 0) return false;
      if (p.stock_quantity <= 0) return false;
      if (p.category_id && hiddenCategoryIds.has(p.category_id)) return false;
      return true;
    });
  }, [products, hiddenCategoryIds]);

  // Storefront-visible categories (server already excludes disabled & empty categories via SQL INNER JOIN)
  const storefrontCategories = useMemo(() => {
    const allEntry = categories.find(c => c.id === 'all' || c.id === 'cat-1') || {
      id: 'all',
      name: 'الكل',
      parent_id: null,
      image_url: null,
      sort_order: 0,
    };
    const visibleReal = categories.filter(
      c => c.id !== 'all' && c.id !== 'cat-1' && c.is_online !== 0
    );
    return [allEntry, ...visibleReal];
  }, [categories]);

  // Reset selected category to 'all' if it was just hidden in Admin
  useEffect(() => {
    if (
      selectedCategoryId &&
      selectedCategoryId !== 'all' &&
      selectedCategoryId !== 'cat-1' &&
      !storefrontCategories.some(c => c.id === selectedCategoryId)
    ) {
      setSelectedCategoryId('all');
    }
  }, [selectedCategoryId, storefrontCategories]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = [...storefrontProducts];

    if (selectedCategoryId && selectedCategoryId !== 'cat-1' && selectedCategoryId !== 'all') {
      list = list.filter(p => p.category_id === selectedCategoryId);
    }

    if (featuredOnly) {
      list = list.filter(p => p.is_featured === 1);
    }

    if (inStockOnly) {
      list = list.filter(p => p.in_stock && p.stock_quantity > 0);
    }

    if (wishlistOnly) {
      list = list.filter(p => wishlistIds.has(p.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
      );
    }

    return list;
  }, [storefrontProducts, selectedCategoryId, featuredOnly, inStockOnly, wishlistOnly, wishlistIds, searchQuery]);

  // Official Rafiq Motion Twin-Phase for Catalog Filtering & Search
  const [catalogMotionPhase, setCatalogMotionPhase] = useState<'a' | 'b'>('a');
  const prevImmediateFilterRef = useRef<string>(`${selectedCategoryId}|${featuredOnly}|${inStockOnly}|${wishlistOnly}`);
  const prevSearchRef = useRef<string>(searchQuery.trim().toLowerCase());

  useEffect(() => {
    const key = `${selectedCategoryId}|${featuredOnly}|${inStockOnly}|${wishlistOnly}`;
    if (prevImmediateFilterRef.current !== key) {
      prevImmediateFilterRef.current = key;
      setCatalogMotionPhase(prev => (prev === 'a' ? 'b' : 'a'));
    }
  }, [selectedCategoryId, featuredOnly, inStockOnly, wishlistOnly]);

  useEffect(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (prevSearchRef.current === normalized) return;
    const timer = window.setTimeout(() => {
      prevSearchRef.current = normalized;
      setCatalogMotionPhase(prev => (prev === 'a' ? 'b' : 'a'));
    }, 130);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const featuredProducts = useMemo(() => {
    return storefrontProducts.filter(p => p.is_featured === 1);
  }, [storefrontProducts]);

  const handleMobileNavSelect = (tab: string) => {
    if (tab === 'home') {
      setMobileTab('home');
      setSelectedCategoryId('all');
      setSearchQuery('');
      setFeaturedOnly(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tab === 'categories') {
      setMobileTab('categories');
      categoriesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Branded Loading State (prevents flashing demo store on real/404 slugs)
  if (isLoadingStore) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#F7FAFC] flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-5 animate-fade-in-up">
          <img
            src="/logo_full.png"
            alt="رفيق للمتاجر الإلكترونية"
            className="h-11 sm:h-12 w-auto object-contain"
          />
          <div className="w-44 h-1.5 rounded-full bg-[#E6F2ED] overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#004D3F] to-[#006D41] animate-pulse" />
          </div>
          <p className="text-xs font-bold text-[#52605D]">جاري تحميل بيانات المتجر...</p>
        </div>
      </div>
    );
  }

  // Store Unavailable / Disabled Gate (404 Not Found, 403 Kill-Switch, or Network Error)
  if (storeUnavailable) {
    return (
      <StoreNotFoundPage
        status={storeUnavailable.status}
        message={storeUnavailable.message}
        code={storeUnavailable.code}
        requestedSlug={storeSlug}
        requestedPath={rawPathname}
        onRetry={() => setReloadNonce(n => n + 1)}
      />
    );
  }

  // Full-Page Shopify Polaris Merchant Admin Portal
  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-[#F6F6F7]">
        <ThemeInjector preset={themePreset} custom={store.theme_custom} />
        <AdminDashboardPage
          store={store}
          categories={categories}
          products={products}
          currentThemePreset={themePreset}
          onThemeChange={handleThemeChange}
          onThemeCustomChange={handleThemeCustomChange}
          onUpdateStore={updated => setStore(updated)}
          onCategoriesChange={setCategories}
          onProductsChange={setProducts}
          onBackToStore={() => navigateToView('store')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-store-bg text-store-text pb-28 sm:pb-0">
      {/* Dynamic Theme Injector */}
      <ThemeInjector preset={themePreset} custom={store.theme_custom} />

      {/* Floating Micro-Pill Toast Notification */}
      <Toast
        isVisible={toast.visible}
        toastKey={toast.key}
        message={toast.message}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {/* Header */}
      <Header
        store={store}
        announcementText={themeCustom.announcementText}
        cartCount={cartCount}
        cartTotalPiasters={cartTotalPiasters}
        searchQuery={searchQuery}
        selectedDeliveryZone={selectedDeliveryZone}
        onSearchChange={setSearchQuery}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracker={() => setIsTrackerOpen(true)}
        onOpenDashboard={() => navigateToView('admin')}
        onSelectZoneClick={() => setIsCartOpen(true)}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
      />

      {/* Interactive Stories Bar (Instagram-like Stories UX) */}
      {showStoriesBar && (
        <StoreStoriesBar
          activeStoryId={activeStoryFilter}
          onSelectStory={handleSelectStory}
          themeCustom={themeCustom}
        />
      )}

      {/* Hero Promo Banner Slider / Carousel */}
      {showPromoHero && (
        <HeroPromoCarousel
          store={store}
          themeCustom={themeCustom}
          onExploreOffers={() => {
            setSelectedCategoryId('all');
            setFeaturedOnly(true);
          }}
          onExploreDelivery={() => {
            setIsCartOpen(true);
          }}
          onExploreGuarantee={() => {
            setSelectedCategoryId('all');
            setFeaturedOnly(false);
            setInStockOnly(false);
          }}
        />
      )}

      {/* Trust & Guarantee Badges Strip */}
      {showTrustBadges && <TrustBadgesStrip themeCustom={themeCustom} />}

      {/* Mobile-Only Category Pills Bar */}
      <div ref={categoriesSectionRef} className="sm:hidden px-3 w-full mt-1">
        <CategoryPills
          categories={storefrontCategories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={id => {
            setSelectedCategoryId(id);
            setMobileTab('home');
          }}
        />

        {/* Mobile Quick Filter Chips */}
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setFeaturedOnly(!featuredOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ${
              featuredOnly
                ? 'bg-store-accent text-store-accent-contrast shadow-xs'
                : 'bg-store-card text-store-text border border-store-line hover:border-store-primary/40'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>عروض وتخفيضات</span>
          </button>

          <button
            onClick={() => setInStockOnly(!inStockOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ${
              inStockOnly
                ? 'bg-store-primary text-store-primary-contrast shadow-xs'
                : 'bg-store-card text-store-text border border-store-line hover:border-store-primary/40'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>المتوفر بالمخزن فقط</span>
          </button>

          {showWishlist && wishlistIds.size > 0 && (
            <button
              onClick={() => setWishlistOnly(!wishlistOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ${
                wishlistOnly
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-store-card text-store-text border border-store-line hover:border-rose-400'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${wishlistOnly ? 'fill-white text-white' : 'text-rose-500'}`} />
              <span>المفضلة ({wishlistIds.size})</span>
            </button>
          )}

          {(featuredOnly || inStockOnly || wishlistOnly) && (
            <button
              onClick={() => {
                setFeaturedOnly(false);
                setInStockOnly(false);
                setWishlistOnly(false);
              }}
              className="text-[11px] font-bold text-store-muted hover:text-store-text px-2 py-1 flex-shrink-0"
            >
              إلغاء التصفية
            </button>
          )}
        </div>
      </div>

      {/* Mobile-Only Featured Carousel */}
      {!searchQuery && (selectedCategoryId === 'all' || selectedCategoryId === 'cat-1') && !featuredOnly && featuredProducts.length > 0 && (
        <section className="sm:hidden px-3 w-full mt-4">
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-lg bg-amber-500/10 text-amber-600">
                <Flame className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-black text-store-text">عروض وتخفيضات حصرية</h3>
            </div>
            <button
              onClick={() => setFeaturedOnly(true)}
              className="text-[11px] font-bold text-store-primary"
            >
              عرض الكل
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {featuredProducts.slice(0, 4).map(product => {
              const inCart = cartItems.find(i => i.product.id === product.id)?.quantity || 0;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantityInCart={inCart}
                  layoutTemplate={activeLayoutTemplate}
                  isWishlisted={wishlistIds.has(product.id)}
                  showWishlist={showWishlist}
                  showSavingsBadge={showSavingsBadge}
                  showLowStockBadge={showLowStockBadge}
                  onAddToCart={handleAddToCart}
                  onRemoveFromCart={handleRemoveFromCart}
                  onSelectProduct={setSelectedProduct}
                  onToggleWishlist={showWishlist ? toggleWishlist : undefined}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Main Content Area (Desktop with Sidebar, Mobile Fluid) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 w-full flex-1 mt-4 sm:mt-6 mb-12">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Desktop Categories & Info Sidebar */}
          <DesktopSidebar
            categories={storefrontCategories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            featuredOnly={featuredOnly}
            onToggleFeatured={() => setFeaturedOnly(!featuredOnly)}
            inStockOnly={inStockOnly}
            onToggleInStock={() => setInStockOnly(!inStockOnly)}
            wishlistCount={wishlistIds.size}
            wishlistOnly={wishlistOnly}
            onToggleWishlistOnly={() => setWishlistOnly(!wishlistOnly)}
            store={store}
          />

          {/* Main Product Catalog */}
          <main className="flex-1 w-full min-w-0">
            {/* Desktop Toolbar */}
            <div className="hidden sm:flex items-center justify-between bg-store-card p-4 rounded-3xl border border-store-line shadow-2xs mb-6 transition-colors">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-black text-store-text">
                  {searchQuery
                    ? `نتائج البحث عن: "${searchQuery}"`
                    : wishlistOnly
                    ? 'الأصناف في قائمة المفضلة'
                    : featuredOnly
                    ? 'العروض والتخفيضات المميزة'
                    : selectedCategoryId === 'all' || selectedCategoryId === 'cat-1'
                    ? 'كافة المنتجات المتاحة'
                    : categories.find(c => c.id === selectedCategoryId)?.name || 'الأصناف'}
                </h3>
                <span className="text-xs bg-store-card-subtle text-store-muted border border-store-line px-3 py-1 rounded-full font-bold tabular-nums">
                  {productsTotal.toLocaleString('en-US')} صنف متاح
                </span>
              </div>

              {/* Active Filter Badges */}
              <div className="flex items-center gap-2">
                {featuredOnly && (
                  <span className="flex items-center gap-1 text-xs bg-store-accent text-store-accent-contrast px-3 py-1 rounded-xl font-bold animate-pop shadow-2xs">
                    <Flame className="w-3.5 h-3.5" />
                    عروض مميزة
                  </span>
                )}
                {inStockOnly && (
                  <span className="flex items-center gap-1 text-xs bg-store-primary-light text-store-primary border border-store-primary/20 px-3 py-1 rounded-xl font-bold animate-pop">
                    <CheckCircle2 className="w-3.5 h-3.5 text-store-primary" />
                    المتوفر فقط
                  </span>
                )}
                {wishlistOnly && (
                  <span className="flex items-center gap-1 text-xs bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-xl font-bold animate-pop">
                    <Heart className="w-3.5 h-3.5 fill-current text-rose-600" />
                    المفضلة ({wishlistIds.size})
                  </span>
                )}
                {(featuredOnly || inStockOnly || wishlistOnly || searchQuery) && (
                  <button
                    onClick={() => {
                      setFeaturedOnly(false);
                      setInStockOnly(false);
                      setWishlistOnly(false);
                      setSearchQuery('');
                      setSelectedCategoryId('all');
                    }}
                    className="text-xs font-bold text-rose-600 hover:underline mr-2 btn-spring"
                  >
                    إعادة ضبط
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Category Title */}
            <div className="sm:hidden flex items-center justify-between mb-3 px-0.5">
              <h3 className="text-sm font-black text-store-text">
                {searchQuery
                  ? `نتائج البحث: "${searchQuery}"`
                  : featuredOnly
                  ? 'العروض والتخفيضات'
                  : selectedCategoryId === 'all' || selectedCategoryId === 'cat-1'
                  ? 'كافة الأصناف والمنتجات'
                  : categories.find(c => c.id === selectedCategoryId)?.name || 'الأصناف'}
              </h3>
              <span className="text-[11px] font-bold text-store-muted tabular-nums">
                {productsTotal.toLocaleString('en-US')} صنف
              </span>
            </div>

            {/* Products Grid */}
            {isLoadingProducts ? (
              <ProductGridSkeleton count={8} gridClass={productsGridClass} />
            ) : filteredProducts.length === 0 ? (
              <div data-motion-phase={catalogMotionPhase}>
                <div className="py-16 text-center text-store-muted bg-store-card rounded-3xl border border-store-line p-8 shadow-sm transition-colors">
                  <div className="w-16 h-16 rounded-3xl bg-store-primary-light text-store-primary mx-auto flex items-center justify-center mb-3 shadow-inner border border-store-primary/20">
                    <SearchX className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-black text-store-text">لا توجد أصناف مطابقة</h4>
                  <p className="text-xs text-store-muted mt-1">جرب إزالة بعض الفلاتر أو البحث بكلمة أخرى</p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFeaturedOnly(false);
                      setInStockOnly(false);
                      setSelectedCategoryId('all');
                    }}
                    className="mt-4 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-store-primary to-store-secondary text-store-primary-contrast text-xs font-black shadow-md btn-spring"
                  >
                    عرض كافة المنتجات
                  </button>
                </div>
              </div>
            ) : (
              <div
                data-motion-phase={catalogMotionPhase}
                className={`${productsGridClass} motion-catalog-grid`}
              >
                {filteredProducts.map(product => {
                  const inCart = cartItems.find(i => i.product.id === product.id)?.quantity || 0;
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantityInCart={inCart}
                      layoutTemplate={activeLayoutTemplate}
                      isWishlisted={wishlistIds.has(product.id)}
                      showWishlist={showWishlist}
                      showSavingsBadge={showSavingsBadge}
                      showLowStockBadge={showLowStockBadge}
                      onAddToCart={handleAddToCart}
                      onRemoveFromCart={handleRemoveFromCart}
                      onSelectProduct={setSelectedProduct}
                      onToggleWishlist={showWishlist ? toggleWishlist : undefined}
                    />
                  );
                })}
              </div>
            )}

            {/* Infinite Scroll Sentinel & Crisp Load More Control */}
            {!isLoadingProducts && productsPage < productsTotalPages && (
              <div ref={loadMoreSentinelRef} className="mt-6 flex flex-col items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isLoadingMoreProducts}
                  onClick={() => void handleLoadMoreProducts()}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-store-card hover:bg-store-primary-light border border-store-line hover:border-store-primary/40 text-xs font-black text-store-primary shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {isLoadingMoreProducts ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري تحميل المزيد...</span>
                    </>
                  ) : (
                    <span>
                      عرض المزيد ({filteredProducts.length.toLocaleString('en-US')} من{' '}
                      {productsTotal.toLocaleString('en-US')} صنف)
                    </span>
                  )}
                </button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Platform Signature & Promotional Card */}
      <RafiqBrandingCard variant="mobile-feed" />

      {/* Desktop Footer - Guaranteed Deep Rich Surface & High Contrast */}
      <footer
        className="hidden sm:block mt-auto border-t shadow-2xl transition-colors duration-500"
        style={{
          backgroundColor: 'var(--store-footer-bg, #0B131F)',
          color: '#FFFFFF',
          borderColor: 'var(--store-footer-line, #1E293B)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-right">
            {/* Store Information */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-white/25 overflow-hidden p-1">
                  <img
                    src={store.logo_url || '/rafiq_logo.png'}
                    alt={store.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">{store.name}</h4>
                  <div className="text-[11px] text-emerald-400 font-bold">متجر إلكتروني رسمي ومضمون</div>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-md font-medium">
                {store.welcome_message || 'متجر إلكتروني رسمي متصل لحظياً بنظام كاشير رفيق لإدارة المبيعات والمخزون بأسعار رسمية وجودة مضمونة لجميع احتياجات منزلك.'}
              </p>
              {store.address && (
                <div className="flex items-center gap-2 text-xs text-slate-200">
                  <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{store.address}</span>
                </div>
              )}
            </div>

            {/* Working Hours */}
            <div>
              <h5 className="text-xs font-black text-white mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                مواعيد العمل والتوصيل
              </h5>
              {store.working_hours ? (
                <div className="space-y-1.5 text-xs text-slate-300">
                  {Object.entries(store.working_hours).map(([day, hrs]) => (
                    <div key={day} className="flex justify-between border-b border-white/10 pb-1">
                      <span className="text-slate-400">{day}:</span>
                      <span className="font-bold text-white">{hrs}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">مفتوح يومياً لخدمتكم</p>
              )}
            </div>

            {/* Customer Support & Quick Access */}
            <div>
              <h5 className="text-xs font-black text-white mb-3 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                خدمة العملاء والطلب
              </h5>
              <div className="space-y-2.5 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => setIsTrackerOpen(true)}
                  className="w-full text-right hover:text-white transition-colors flex items-center justify-between pb-1.5 border-b border-white/10 text-xs"
                >
                  <span>تتبع حالة الأوردر</span>
                  <span className="text-[10px] text-emerald-400 font-bold">لحظة بلحظة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(true)}
                  className="w-full text-right hover:text-white transition-colors flex items-center justify-between pb-1.5 border-b border-white/10 text-xs"
                >
                  <span>سلة المشتريات</span>
                  <span className="text-[10px] text-slate-400 font-mono">({cartCount} صنف)</span>
                </button>
                {store.whatsapp && (
                  <a
                    href={buildWhatsAppUrl(store.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-emerald-400 transition-colors flex items-center justify-between pb-1.5 border-b border-white/10 text-xs"
                  >
                    <span>مراسلة واتساب المحل</span>
                    <span className="text-[10px] text-emerald-400 font-bold">دعم فوري</span>
                  </a>
                )}
                {store.phone && (
                  <a
                    href={`tel:${store.phone}`}
                    className="hover:text-white transition-colors flex items-center justify-between text-xs"
                  >
                    <span>اتصال هاتفي مباشر</span>
                    <span className="text-[10px] text-slate-300 font-mono" dir="ltr">{store.phone}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Executive Platform Promotional Banner */}
          <RafiqBrandingCard variant="footer-banner" />

          {/* Desktop Platform Signature Bar */}
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="text-[11px] text-slate-400 font-medium">
              جميع الحقوق محفوظة لـ <strong className="text-white">{store.name}</strong> © 2026
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">مشغّل بواسطة</span>
              <div className="flex items-center gap-1.5 text-white font-bold text-xs bg-white/10 px-2.5 py-1 rounded-xl border border-white/10">
                <img src="/rafiq_logo.png" alt="رفيق POS" className="w-4 h-4 object-contain rounded-md" />
                <span>نظام كاشير رفيق الذكي • Rafiq POS</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Bottom Cart Bar */}
      <FloatingCartBar
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Mobile App Bottom Nav Bar */}
      <MobileBottomNav
        activeTab={mobileTab}
        cartCount={cartCount}
        whatsappPhone={store.whatsapp || store.phone}
        onSelectTab={handleMobileNavSelect}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracker={() => setIsTrackerOpen(true)}
      />

      {/* Modals & Drawers */}
      <ProductModal
        product={selectedProduct}
        quantityInCart={selectedProduct ? cartItems.find(i => i.product.id === selectedProduct.id)?.quantity || 0 : 0}
        isWishlisted={selectedProduct ? wishlistIds.has(selectedProduct.id) : false}
        showSavingsBadge={showSavingsBadge}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onOpenCart={() => setIsCartOpen(true)}
        onToggleWishlist={showWishlist ? toggleWishlist : undefined}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        store={store}
        deliveryMethod={deliveryMethod}
        onSelectDeliveryMethod={setDeliveryMethod}
        selectedDeliveryZone={selectedDeliveryZone}
        onSelectDeliveryZone={setSelectedDeliveryZone}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onClearItem={handleClearItem}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
        suggestedProducts={showCartCrossSell ? (featuredProducts.length > 0 ? featuredProducts : products.slice(0, 4)) : []}
        showFreeShippingBar={showFreeShippingBar}
        freeShippingThresholdPiasters={freeShippingThresholdPiasters}
        showWhatsAppQuickOrder={showWhatsAppQuickOrder}
        crossSellTitle={themeCustom.cartCrossSellTitle}
      />

      <InstantSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        products={products}
        cartItems={cartItems}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onSelectProduct={setSelectedProduct}
        onSelectQueryFilter={q => {
          setSearchQuery(q);
          setSelectedCategoryId('all');
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        store={store}
        deliveryMethod={deliveryMethod}
        selectedDeliveryZone={selectedDeliveryZone}
        createOrderApi={orderData => apiClient.createOrder(storeSlug, orderData, isDemoRoot)}
        onOrderCompleted={(orderNum, total, payMethod, receiptImg) => {
          setLastOrderNumber(orderNum);
          setLastOrderTotal(total);
          setLastOrderPaymentMethod(payMethod || 'cash');
          setLastOrderReceipt(receiptImg || null);
          setCartItems([]);
          setIsCheckoutOpen(false);
          setIsSuccessOpen(true);
          if (!isDemoRoot) {
            apiClient
              .getProducts(storeSlug, undefined, false)
              .then(fresh => setProducts(fresh))
              .catch(() => {});
          }
        }}
      />

      <OrderSuccessModal
        isOpen={isSuccessOpen}
        orderNumber={lastOrderNumber}
        totalPiasters={lastOrderTotal}
        storePhone={store.whatsapp || store.phone}
        storeName={store.name}
        paymentMethod={lastOrderPaymentMethod}
        receiptImage={lastOrderReceipt}
        onClose={() => setIsSuccessOpen(false)}
        onTrackOrder={() => {
          setIsSuccessOpen(false);
          setIsTrackerOpen(true);
        }}
      />

      <OrderTrackerModal
        isOpen={isTrackerOpen}
        onClose={() => setIsTrackerOpen(false)}
        trackOrderApi={(num, ph) => apiClient.trackOrder(storeSlug, num, ph, isDemoRoot)}
      />
    </div>
  );
};

export default App;
