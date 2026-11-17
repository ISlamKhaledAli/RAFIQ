import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Store, Category, Product, CartItem } from './types';
import { apiClient, MOCK_STORE, MOCK_CATEGORIES, MOCK_PRODUCTS } from './api/client';
import { ThemeInjector } from './components/ThemeInjector';
import { Header } from './components/Header';
import { DesktopHero } from './components/DesktopHero';
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
import { Sparkles, MapPin, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const storeSlug = useMemo(() => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    return path || 'souq-el-khair';
  }, []);

  const [store, setStore] = useState<Store>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('rafiq_active_theme_preset') : null;
    return saved ? { ...MOCK_STORE, theme_preset: saved } : MOCK_STORE;
  });
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('cat-1');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [themePreset, setThemePreset] = useState<string>(() => {
    return (
      (typeof window !== 'undefined' && localStorage.getItem('rafiq_active_theme_preset')) ||
      MOCK_STORE.theme_preset ||
      'duo-forest-cream'
    );
  });

  const handleThemeChange = (newPreset: string) => {
    setThemePreset(newPreset);
    setStore(prev => ({ ...prev, theme_preset: newPreset }));
    try {
      localStorage.setItem('rafiq_active_theme_preset', newPreset);
    } catch {}
  };

  // Desktop quick filters
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);

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
      if (view === 'admin') {
        const url = new URL(window.location.href);
        url.searchParams.set('admin', '1');
        window.history.pushState({}, '', url.toString());
      } else {
        const url = new URL(window.location.href);
        url.searchParams.delete('admin');
        url.searchParams.delete('view');
        window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
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

  // Cart & Modals
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{ visible: boolean; message: string; subMessage?: string }>({
    visible: false,
    message: '',
  });

  // Orders State
  const [lastOrderNumber, setLastOrderNumber] = useState<number>(101);
  const [lastOrderTotal, setLastOrderTotal] = useState<number>(0);
  const [lastOrderPaymentMethod, setLastOrderPaymentMethod] = useState<string>('cash');
  const [lastOrderReceipt, setLastOrderReceipt] = useState<string | null>(null);

  // Delivery
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [selectedDeliveryZone, setSelectedDeliveryZone] = useState<string>('وسط البلد');

  // Active bottom nav tab
  const [mobileTab, setMobileTab] = useState<'home' | 'categories'>('home');

  const categoriesSectionRef = useRef<HTMLDivElement>(null);

  // Load Data
  useEffect(() => {
    async function loadData() {
      try {
        const storeData = await apiClient.getStore(storeSlug);
        const saved = typeof window !== 'undefined' ? localStorage.getItem('rafiq_active_theme_preset') : null;
        const effectiveTheme = saved || storeData.theme_preset || 'duo-forest-cream';
        const mergedStore = { ...storeData, theme_preset: effectiveTheme };
        setStore(mergedStore);
        setThemePreset(effectiveTheme);

        const cats = await apiClient.getCategories(storeSlug);
        setCategories(cats);

        const prods = await apiClient.getProducts(storeSlug);
        setProducts(prods);
      } catch (e) {
        console.error('Failed to load store data:', e);
      }
    }
    loadData();
  }, [storeSlug]);

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

    // Sensory feedback toast
    setToast({
      visible: true,
      message: `تمت إضافة "${product.name}" إلى السلة`,
      subMessage: `السعر: ${(product.price_piasters / 100).toFixed(2)} ج.م`,
    });
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

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCategoryId && selectedCategoryId !== 'cat-1' && selectedCategoryId !== 'all') {
      list = list.filter(p => p.category_id === selectedCategoryId);
    }

    if (featuredOnly) {
      list = list.filter(p => p.is_featured === 1);
    }

    if (inStockOnly) {
      list = list.filter(p => p.in_stock && p.stock_quantity > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
      );
    }

    return list;
  }, [products, selectedCategoryId, featuredOnly, inStockOnly, searchQuery]);

  const featuredProducts = useMemo(() => {
    return products.filter(p => p.is_featured === 1);
  }, [products]);

  const handleMobileNavSelect = (tab: string) => {
    if (tab === 'home') {
      setMobileTab('home');
      setSelectedCategoryId('cat-1');
      setSearchQuery('');
      setFeaturedOnly(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tab === 'categories') {
      setMobileTab('categories');
      categoriesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Full-Page Shopify Polaris Merchant Admin Portal
  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-[#F6F6F7]">
        <ThemeInjector preset={themePreset} custom={store.theme_custom} />
        <AdminDashboardPage
          store={store}
          products={products}
          currentThemePreset={themePreset}
          onThemeChange={handleThemeChange}
          onUpdateStore={updated => setStore(updated)}
          onBackToStore={() => navigateToView('store')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-store-bg text-store-text pb-28 sm:pb-0">
      {/* Dynamic Theme Injector */}
      <ThemeInjector preset={themePreset} custom={store.theme_custom} />

      {/* Floating Mini-Toast Notification */}
      <Toast
        isVisible={toast.visible}
        message={toast.message}
        subMessage={toast.subMessage}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Header */}
      <Header
        store={store}
        cartCount={cartCount}
        cartTotalPiasters={cartTotalPiasters}
        searchQuery={searchQuery}
        selectedDeliveryZone={selectedDeliveryZone}
        onSearchChange={setSearchQuery}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracker={() => setIsTrackerOpen(true)}
        onOpenDashboard={() => navigateToView('admin')}
        onSelectZoneClick={() => setIsCartOpen(true)}
      />

      {/* Desktop Executive Hero Section */}
      <DesktopHero
        store={store}
        onExploreOffers={() => {
          setSelectedCategoryId('cat-1');
          setFeaturedOnly(true);
        }}
      />

      {/* Mobile-Only Category Pills Bar */}
      <div ref={categoriesSectionRef} className="sm:hidden px-3 w-full mt-1">
        <CategoryPills
          categories={categories}
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
            <Sparkles className="w-3.5 h-3.5" />
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

          {(featuredOnly || inStockOnly) && (
            <button
              onClick={() => {
                setFeaturedOnly(false);
                setInStockOnly(false);
              }}
              className="text-[11px] font-bold text-store-muted hover:text-store-text px-2 py-1 flex-shrink-0"
            >
              إلغاء التصفية
            </button>
          )}
        </div>
      </div>

      {/* Mobile-Only Featured Carousel */}
      {!searchQuery && selectedCategoryId === 'cat-1' && !featuredOnly && featuredProducts.length > 0 && (
        <section className="sm:hidden px-3 w-full mt-4">
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-lg bg-amber-500/10 text-amber-600 animate-pulse-slow">
                <Sparkles className="w-4 h-4" />
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
                  onAddToCart={handleAddToCart}
                  onRemoveFromCart={handleRemoveFromCart}
                  onSelectProduct={setSelectedProduct}
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
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            featuredOnly={featuredOnly}
            onToggleFeatured={() => setFeaturedOnly(!featuredOnly)}
            inStockOnly={inStockOnly}
            onToggleInStock={() => setInStockOnly(!inStockOnly)}
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
                    : featuredOnly
                    ? 'العروض والتخفيضات المميزة'
                    : selectedCategoryId === 'cat-1'
                    ? 'كافة المنتجات المتاحة'
                    : categories.find(c => c.id === selectedCategoryId)?.name || 'الأصناف'}
                </h3>
                <span className="text-xs bg-store-card-subtle text-store-muted border border-store-line px-3 py-1 rounded-full font-bold">
                  {filteredProducts.length} صنف متاح
                </span>
              </div>

              {/* Active Filter Badges */}
              <div className="flex items-center gap-2">
                {featuredOnly && (
                  <span className="flex items-center gap-1 text-xs bg-store-accent text-store-accent-contrast px-3 py-1 rounded-xl font-bold animate-pop shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    عروض مميزة
                  </span>
                )}
                {inStockOnly && (
                  <span className="flex items-center gap-1 text-xs bg-store-primary-light text-store-primary border border-store-primary/20 px-3 py-1 rounded-xl font-bold animate-pop">
                    <CheckCircle2 className="w-3.5 h-3.5 text-store-primary" />
                    المتوفر فقط
                  </span>
                )}
                {(featuredOnly || inStockOnly || searchQuery) && (
                  <button
                    onClick={() => {
                      setFeaturedOnly(false);
                      setInStockOnly(false);
                      setSearchQuery('');
                      setSelectedCategoryId('cat-1');
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
                  : selectedCategoryId === 'cat-1'
                  ? 'كافة الأصناف والمنتجات'
                  : categories.find(c => c.id === selectedCategoryId)?.name || 'الأصناف'}
              </h3>
              <span className="text-[11px] font-bold text-store-muted">
                {filteredProducts.length} صنف
              </span>
            </div>

            {/* Products Grid */}
            {filteredProducts.length === 0 ? (
              <div className="py-16 text-center text-store-muted bg-store-card rounded-3xl border border-store-line p-8 shadow-2xs transition-colors">
                <div className="w-16 h-16 rounded-3xl bg-store-primary-light text-store-primary mx-auto flex items-center justify-center mb-3 shadow-inner border border-store-primary/20">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-store-text">لا توجد أصناف مطابقة</h4>
                <p className="text-xs text-store-muted mt-1">جرب إزالة بعض الفلاتر أو البحث بكلمة أخرى</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFeaturedOnly(false);
                    setInStockOnly(false);
                    setSelectedCategoryId('cat-1');
                  }}
                  className="mt-4 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-store-primary to-store-secondary text-store-primary-contrast text-xs font-black shadow-md btn-spring"
                >
                  عرض كافة المنتجات
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3 sm:gap-5">
                {filteredProducts.map(product => {
                  const inCart = cartItems.find(i => i.product.id === product.id)?.quantity || 0;
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantityInCart={inCart}
                      onAddToCart={handleAddToCart}
                      onRemoveFromCart={handleRemoveFromCart}
                      onSelectProduct={setSelectedProduct}
                    />
                  );
                })}
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
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-store-primary to-store-secondary text-white flex items-center justify-center font-black text-base shadow-sm border border-white/20">
                  {store.name.charAt(0)}
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
                    href={`https://wa.me/2${store.whatsapp.replace(/^0+/, '')}`}
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
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onOpenCart={() => setIsCartOpen(true)}
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
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        store={store}
        deliveryMethod={deliveryMethod}
        selectedDeliveryZone={selectedDeliveryZone}
        createOrderApi={orderData => apiClient.createOrder(storeSlug, orderData)}
        onOrderCompleted={(orderNum, total, payMethod, receiptImg) => {
          setLastOrderNumber(orderNum);
          setLastOrderTotal(total);
          setLastOrderPaymentMethod(payMethod || 'cash');
          setLastOrderReceipt(receiptImg || null);
          setCartItems([]);
          setIsCheckoutOpen(false);
          setIsSuccessOpen(true);
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
        trackOrderApi={(num, ph) => apiClient.trackOrder(storeSlug, num, ph)}
      />
    </div>
  );
};

export default App;
