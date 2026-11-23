import type { Store, Category, Product, Order } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1';

// Official Rafiq Flagship Demo Store (/rafiq)
export const MOCK_STORE: Store = {
  id: 'rafiq-official-demo',
  slug: 'rafiq',
  name: 'متجر رفيق الرسمي',
  phone: '01097782965',
  whatsapp: '01097782965',
  address: 'القاهرة الكبرى • توصيل سريع لجميع المناطق',
  working_hours: {
    'السبت - الخميس': '9:00 ص - 11:30 م',
    الجمعة: '1:00 م - 12:00 م',
  },
  welcome_message: 'المتجر التجريبي الرسمي لنظام كاشير رفيق — جرّب الطلب، السلة، وتتبع الأوردر لحظياً',
  logo_url: '/rafiq_logo.png',
  banner_url: null,
  theme_preset: 'rafiq-official',
  theme_custom: null,
  min_order_amount: 0, // No minimum order restriction
  delivery_zones: [
    { name: 'وسط البلد', fee: 1500 }, // 15 EGP
    { name: 'الدقي والمهندسين', fee: 2000 },
    { name: 'المعادي', fee: 3000 },
    { name: 'مدينة نصر والتجمع', fee: 3500 },
  ],
  is_paused: 0,
  pause_message: null,
  store_type: 'supermarket',
  instapay_handle: 'rafiq-store@instapay',
  vodafone_cash_phone: '01097782965',
};

export const MOCK_CATEGORIES: Category[] = [
  { id: 'all', name: 'الكل', parent_id: null, image_url: null, sort_order: 0 },
  { id: 'cat-2', name: 'بقالة تموينية', parent_id: null, image_url: null, sort_order: 1 },
  { id: 'cat-3', name: 'ألبان وأجبان طازجة', parent_id: null, image_url: null, sort_order: 2 },
  { id: 'cat-6', name: 'مخبوزات وفطار', parent_id: null, image_url: null, sort_order: 3 },
  { id: 'cat-4', name: 'مشروبات وعصائر', parent_id: null, image_url: null, sort_order: 4 },
  { id: 'cat-5', name: 'منظفات وعناية', parent_id: null, image_url: null, sort_order: 5 },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    category_id: 'cat-2',
    name: 'أرز مصري فاخر المطبخ 1 كجم',
    description: 'أرز حبة رفيعة منقى ومغسول آلياً، ممتاز للطبخ والمحاشي بضمان جودة عالية',
    barcode: '622123450001',
    sku: 'RICE-01',
    price_piasters: 3500, // 35.00 EGP
    compare_price: 4000,
    unit_name: 'كجم',
    tax_rate: 0,
    stock_quantity: 45000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-2',
    category_id: 'cat-2',
    name: 'زيت هلا عباد الشمس النقي 800 مل',
    description: 'زيت نقي خالي من الكوليسترول، مثالي للطهي الصحي والقلي الخفيف',
    barcode: '622123450002',
    sku: 'OIL-01',
    price_piasters: 7500,
    compare_price: 8500,
    unit_name: 'زجاجة',
    tax_rate: 0,
    stock_quantity: 20000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-3',
    category_id: 'cat-2',
    name: 'مكرونة الملكة 400 جم - خواتم',
    description: 'مصنوعة من دقيق السيمولينا عالي الجودة ولا تتعجن أثناء الطهي',
    barcode: '622123450003',
    sku: 'PASTA-01',
    price_piasters: 1400,
    compare_price: 1600,
    unit_name: 'كيس',
    tax_rate: 0,
    stock_quantity: 60000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-4',
    category_id: 'cat-3',
    name: 'جبنة دومتي فيتا بلس 500 جم',
    description: 'جبنة بيضاء طبيعية كريمية قليلة الملح بطعم غني ومميز للإفطار',
    barcode: '622123450004',
    sku: 'CHEESE-01',
    price_piasters: 4200,
    compare_price: 4800,
    unit_name: 'علبة',
    tax_rate: 0,
    stock_quantity: 35000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-5',
    category_id: 'cat-3',
    name: 'حليب جهينة كامل الدسم 1 لتر',
    description: 'حليب طبيعي 100% معقم ومعبأ بطريقة تحافظ على القيمة الغذائية والطعم الطازج',
    barcode: '622123450005',
    sku: 'MILK-01',
    price_piasters: 4400,
    compare_price: null,
    unit_name: 'لتر',
    tax_rate: 0,
    stock_quantity: 28000,
    is_featured: 0,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-9',
    category_id: 'cat-6',
    name: 'عيش توست أبيض طازج 500 جم',
    description: 'مخبوز يومياً بقوام طري وهش مثالي للسندوتشات ووجبة الإفطار الصباحية',
    barcode: '622123450009',
    sku: 'BAKERY-01',
    price_piasters: 3200,
    compare_price: 3800,
    unit_name: 'كيس',
    tax_rate: 0,
    stock_quantity: 24000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-10',
    category_id: 'cat-6',
    name: 'عسل نحل طبيعي امتنان 450 جم',
    description: 'عسل زهور البرسيم الطبيعي 100% نقي ومفحوص مخبرياً بدون أي إضافات',
    barcode: '622123450010',
    sku: 'HONEY-01',
    price_piasters: 9500,
    compare_price: 11000,
    unit_name: 'برطمان',
    tax_rate: 0,
    stock_quantity: 16000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-6',
    category_id: 'cat-4',
    name: 'عصير بيتي برتقال طبيعي 1 لتر',
    description: 'عصير برتقال منعش بدون مواد حافظة غني بفيتامين سي الطبيعي',
    barcode: '622123450006',
    sku: 'JUICE-01',
    price_piasters: 2600,
    compare_price: 3000,
    unit_name: 'علبة',
    tax_rate: 0,
    stock_quantity: 18000,
    is_featured: 0,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-7',
    category_id: 'cat-4',
    name: 'شاي العروسة أسود ناعم 250 جم',
    description: 'شاي كيني أصلي بلون داكن ونكهة غنية مضبوطة لجميع الأوقات',
    barcode: '622123450007',
    sku: 'TEA-01',
    price_piasters: 5200,
    compare_price: 5800,
    unit_name: 'باكو',
    tax_rate: 0,
    stock_quantity: 40000,
    is_featured: 1,
    image_urls: [],
    in_stock: true,
  },
  {
    id: 'p-8',
    category_id: 'cat-5',
    name: 'سائل غسيل الأطباق فيري 650 مل بالليمون',
    description: 'قوة مضاعفة لتفتيت الدهون الصعبة ولمعان فوري للأواني بأقل كمية',
    barcode: '622123450008',
    sku: 'CLEAN-01',
    price_piasters: 4800,
    compare_price: null,
    unit_name: 'زجاجة',
    tax_rate: 0,
    stock_quantity: 15000,
    is_featured: 0,
    image_urls: [],
    in_stock: true,
  },
];

export class StoreUnavailableError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'StoreUnavailableError';
    this.status = status;
    this.code = code;
  }
}

export interface DailySalesPoint {
  summary_date: string;
  total_sales: number;
  invoice_count: number;
  avg_invoice: number;
  cash_total: number;
  card_total: number;
  credit_total: number;
  returns_count: number;
  returns_total: number;
  net_profit?: number;
  expenses_total?: number;
}

export interface LowStockAlertItem {
  id: string;
  name: string;
  unit_name: string;
  stock_quantity: number;
  low_stock_threshold: number;
  price_piasters: number;
}

export interface DashboardOverviewData {
  filter?: {
    from: string;
    to: string;
    span_days: number;
    days_with_data: number;
  };
  today_pos_sales: number;
  today_pos_invoices: number;
  today_pos_avg_invoice: number;
  today_pos_cash: number;
  today_pos_card: number;
  today_pos_card_only?: number;
  today_pos_instapay?: number;
  today_pos_wallet?: number;
  today_pos_credit: number;
  today_pos_returns_count: number;
  today_pos_returns_total: number;
  today_pos_net_sales: number;
  today_pos_gross_profit?: number;
  today_pos_expenses?: number;
  today_pos_net_profit?: number;
  today_pos_debt_payments?: number;
  today_pos_discounts?: number;
  today_pos_cancelled_count?: number;
  today_pos_cancelled_total?: number;
  today_pos_hourly_breakdown: Record<string, number>;
  today_pos_top_products: Array<{
    id: string;
    name: string;
    qty: number;
    revenue?: number;
    profit?: number;
  }>;
  yesterday_pos_sales: number;
  yesterday_pos_net_sales?: number;
  yesterday_pos_invoices: number;
  store_balances?: {
    customer_debts_total: number;
    debtor_customers_count: number;
    supplier_debts_total: number;
  };
  daily_history: DailySalesPoint[];
  inventory_summary: {
    total_products_count: number;
    out_of_stock_count: number;
    low_stock_count: number;
    retail_value: number;
    cost_value: number;
    expected_profit: number;
  };
  low_stock_products: LowStockAlertItem[];
  online_range_summary?: {
    total_orders: number;
    active_sales: number;
    pending: number;
    preparing: number;
    ready: number;
    delivered: number;
    cancelled: number;
  };
  today_online_orders: number;
  today_online_sales: number;
  pending_orders_count: number;
  low_stock_count: number;
  total_products_count: number;
  last_sync_at: string | null;
  is_paused: number;
  has_custom_pin?: boolean;
}

export class OwnerAuthError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 401, code = 'AUTH_REQUIRED') {
    super(message);
    this.name = 'OwnerAuthError';
    this.status = status;
    this.code = code;
  }
}

export const apiClient = {
  async getStore(slug: string, allowDemoFallback = false): Promise<Store> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/store/${encodeURIComponent(slug)}`);
    } catch {
      if (allowDemoFallback) {
        return { ...MOCK_STORE, slug };
      }
      throw new StoreUnavailableError(
        0,
        'تعذر الاتصال بخادم المتجر حالياً. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.',
        'NETWORK_ERROR'
      );
    }
    if (res.status === 403) {
      let msg = 'هذا المتجر الإلكتروني غير متاح حالياً. يرجى التواصل مع إدارة المحل.';
      let code: string | undefined;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
        code = err?.code;
      } catch {}
      throw new StoreUnavailableError(403, msg, code);
    }
    if (res.status === 404) {
      if (allowDemoFallback) {
        return { ...MOCK_STORE, slug };
      }
      throw new StoreUnavailableError(
        404,
        'الرابط الذي حاولت الوصول إليه غير مسجّل في شبكة متاجر رفيق، أو ربما تم تعديل المعرّف الإلكتروني للمتجر مؤخراً.',
        'STORE_NOT_FOUND'
      );
    }
    if (!res.ok) {
      if (allowDemoFallback) {
        return { ...MOCK_STORE, slug };
      }
      throw new StoreUnavailableError(res.status, 'تعذر تحميل بيانات المتجر حالياً. يرجى المحاولة بعد لحظات.');
    }
    const data = await res.json();
    return data.store;
  },

  async getCategories(slug: string, allowDemoFallback = false): Promise<Category[]> {
    if (allowDemoFallback) {
      return MOCK_CATEGORIES;
    }
    try {
      const res = await fetch(`${API_BASE}/store/${encodeURIComponent(slug)}/categories`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const serverCats = Array.isArray(data?.categories) ? data.categories : [];
      return [{ id: 'all', name: 'الكل', parent_id: null, image_url: null, sort_order: 0 }, ...serverCats];
    } catch {
      return [{ id: 'all', name: 'الكل', parent_id: null, image_url: null, sort_order: 0 }];
    }
  },

  async getProductsPage(
    slug: string,
    options?: {
      categoryId?: string;
      search?: string;
      featured?: boolean;
      page?: number;
      limit?: number;
    },
    allowDemoFallback = false
  ): Promise<{
    products: Product[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(200, Math.max(1, options?.limit || 48));

    if (allowDemoFallback) {
      let filtered = [...MOCK_PRODUCTS];
      if (options?.categoryId && options.categoryId !== 'all' && options.categoryId !== 'cat-1') {
        filtered = filtered.filter(p => p.category_id === options.categoryId);
      }
      if (options?.search && options.search.trim()) {
        const q = options.search.toLowerCase().trim();
        filtered = filtered.filter(
          p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
        );
      }
      if (options?.featured) {
        filtered = filtered.filter(p => p.is_featured === 1);
      }
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      return {
        products: filtered.slice(start, start + limit),
        pagination: { page, limit, total, totalPages },
      };
    }

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (options?.categoryId && options.categoryId !== 'all' && options.categoryId !== 'cat-1') {
      params.set('category', options.categoryId);
    }
    if (options?.search && options.search.trim()) {
      params.set('search', options.search.trim());
    }
    if (options?.featured) {
      params.set('featured', '1');
    }

    const res = await fetch(`${API_BASE}/store/${encodeURIComponent(slug)}/products?${params.toString()}`);
    if (!res.ok) {
      return { products: [], pagination: { page, limit, total: 0, totalPages: 1 } };
    }
    const data = await res.json().catch(() => ({}));
    const products: Product[] = Array.isArray(data?.products) ? data.products : [];
    const total = Number(data?.pagination?.total ?? products.length);
    const totalPages = Math.max(1, Number(data?.pagination?.totalPages ?? Math.ceil(total / limit)));
    return {
      products,
      pagination: { page, limit, total, totalPages },
    };
  },

  async getProducts(
    slug: string,
    options?: { categoryId?: string; search?: string; featured?: boolean },
    allowDemoFallback = false
  ): Promise<Product[]> {
    const first = await this.getProductsPage(slug, { ...options, page: 1, limit: 48 }, allowDemoFallback);
    return first.products;
  },

  async createOrder(
    slug: string,
    orderData: {
      customer_name: string;
      customer_phone: string;
      customer_address?: string;
      delivery_method: 'delivery' | 'pickup';
      delivery_zone?: string;
      notes?: string;
      payment_method?: string;
      sender_phone?: string;
      payment_ref?: string;
      receipt_image?: string;
      items: Array<{ product_id: string; product_name?: string; unit_name?: string; unit_price?: number; quantity: number }>;
    },
    allowDemoFallback = false
  ): Promise<{ success: boolean; order_number: number; total: number; order_id: string }> {
    // Official Demo Store (/rafiq): instant local order simulation
    if (allowDemoFallback) {
      const mockOrderNum = Math.floor(Math.random() * 800) + 104;
      let subtotal = 0;
      const orderItems = orderData.items.map(i => {
        const prod = MOCK_PRODUCTS.find(p => p.id === i.product_id);
        const unitPrice = i.unit_price ?? prod?.price_piasters ?? 0;
        const lineTotal = Math.round((unitPrice * i.quantity) / 1000);
        subtotal += lineTotal;
        return {
          name: i.product_name || prod?.name || 'صنف',
          unit: i.unit_name || prod?.unit_name || 'قطعة',
          unit_price: unitPrice,
          quantity: Math.max(1, Math.round(i.quantity / 1000)),
          quantity_milli: Math.round(i.quantity),
          total_price: lineTotal,
          product_id: i.product_id,
          product_name: i.product_name || prod?.name || 'صنف',
          line_total: lineTotal,
        };
      });

      const matchingZone = MOCK_STORE.delivery_zones?.find(z => z.name === orderData.delivery_zone);
      const deliveryFee = orderData.delivery_method === 'delivery' ? (matchingZone?.fee ?? 1500) : 0;
      const grandTotal = subtotal + deliveryFee;

      const newOrder = {
        id: `ord-${mockOrderNum}`,
        order_number: mockOrderNum,
        customer_name: orderData.customer_name,
        customer_phone: orderData.customer_phone,
        alt_phone: '',
        address_zone: orderData.delivery_zone || 'وسط البلد',
        customer_address: orderData.customer_address || null,
        delivery_method: orderData.delivery_method,
        delivery_zone: orderData.delivery_zone || null,
        delivery_fee: deliveryFee,
        subtotal,
        total: grandTotal,
        status: 'new',
        status_note: 'تم استلام طلبك بنجاح وجاري مراجعته وتجهيزه في المحل',
        notes: orderData.notes || null,
        payment_method: orderData.payment_method || 'كاش عند الاستلام',
        sender_phone: orderData.sender_phone || '',
        payment_ref: orderData.payment_ref || '',
        receipt_image: orderData.receipt_image || null,
        items: orderItems,
        created_at: 'الآن',
      };

      try {
        const existingRaw = localStorage.getItem('rafiq_demo_placed_orders');
        const existing = existingRaw ? JSON.parse(existingRaw) : [];
        existing.unshift(newOrder);
        localStorage.setItem('rafiq_demo_placed_orders', JSON.stringify(existing));
      } catch {
        // Ignore storage errors
      }

      return {
        success: true,
        order_number: mockOrderNum,
        total: grandTotal,
        order_id: newOrder.id,
      };
    }

    // Real Cloud Store: strictly submit to live D1 API (never fabricate fake local orders!)
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/store/${encodeURIComponent(slug)}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
    } catch {
      throw new Error('تعذر الاتصال بخادم المتجر لإرسال الطلب. يرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.');
    }

    const contentType = res.headers.get('content-type') || '';
    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    }

    if (res.ok && data?.success) {
      return data;
    }

    throw new Error(data?.error || 'تعذر تسجيل الطلب حالياً. يرجى المحاولة مرة أخرى أو التواصل مع المحل عبر واتساب.');
  },

  async trackOrder(
    slug: string,
    orderNumberOrId: string,
    phone: string,
    allowDemoFallback = false
  ): Promise<Order> {
    if (!allowDemoFallback) {
      let res: Response;
      try {
        res = await fetch(
          `${API_BASE}/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderNumberOrId)}?phone=${encodeURIComponent(phone)}`
        );
      } catch {
        throw new Error('تعذر الاتصال بالخادم حالياً. يرجى المحاولة مرة أخرى.');
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data?.order) {
        return data.order;
      }
      throw new Error(data?.error || 'لم يتم العثور على طلب مطابق لرقم الطلب ورقم الهاتف.');
    }

    // Demo store (/rafiq): check locally placed demo orders first
    try {
      const existingRaw = localStorage.getItem('rafiq_demo_placed_orders');
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        const cleanPhone = phone.replace(/[\s-]/g, '');
        const found = existing.find(
          (o: any) =>
            (o.order_number.toString() === orderNumberOrId.trim() || o.id === orderNumberOrId.trim()) &&
            (!cleanPhone || (o.customer_phone && o.customer_phone.replace(/[\s-]/g, '').includes(cleanPhone)))
        );
        if (found) {
          return {
            id: found.id,
            order_number: found.order_number,
            customer_name: found.customer_name,
            customer_phone: found.customer_phone,
            customer_address: found.customer_address,
            delivery_method: found.delivery_method,
            delivery_zone: found.delivery_zone,
            delivery_fee: found.delivery_fee,
            subtotal: found.subtotal,
            total: found.total,
            status: found.status,
            status_note: found.status_note || 'تم استلام طلبك بنجاح وجاري مراجعته وتجهيزه',
            notes: found.notes,
            status_history: [{ status: 'new', at: found.created_at || new Date().toISOString() }],
            created_at: new Date().toISOString(),
            items: found.items.map((i: any) => ({
              id: i.product_id || 'p-1',
              product_name: i.name || i.product_name || 'صنف',
              product_price: i.unit_price || 0,
              quantity: i.quantity_milli ?? (i.quantity || 1) * 1000,
              line_total: i.total_price || i.line_total || 0,
            })),
          };
        }
      }
    } catch {
      // Ignore storage errors
    }

    const num = parseInt(orderNumberOrId, 10) || 101;
    return {
      id: `mock-order-${num}`,
      order_number: num,
      customer_name: 'عميل رفيق',
      customer_phone: phone || '01097782965',
      customer_address: 'وسط البلد - القاهرة',
      delivery_method: 'delivery',
      delivery_zone: 'وسط البلد',
      delivery_fee: 1500,
      subtotal: 7500,
      total: 9000,
      status: 'accepted',
      status_note: 'تم قبول طلبك وجاري تحضيره في المحل بعناية',
      notes: null,
      status_history: [
        { status: 'new', at: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
        { status: 'accepted', at: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
      ],
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      items: [
        {
          id: 'p-2',
          product_name: 'زيت هلا عباد الشمس 800 مل',
          product_price: 7500,
          quantity: 1000,
          line_total: 7500,
        },
      ],
    };
  },

  async ownerLogin(
    licenseKey: string,
    pin: string
  ): Promise<{
    success: boolean;
    token: string;
    expires_in_days?: number;
    store: { id: string; name: string; slug: string; license_key: string; theme_preset: string; has_custom_pin?: boolean };
  }> {
    const res = await fetch(`${API_BASE}/dashboard/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: licenseKey.trim(),
        pin: pin.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تسجيل الدخول. تأكد من مفتاح الترخيص والـ PIN.');
    }
    return data;
  },

  async changeOwnerPin(
    currentPin: string,
    newPin: string,
    ownerToken?: string | null
  ): Promise<{ success: boolean; token?: string; has_custom_pin?: boolean; message?: string }> {
    const token = (ownerToken || localStorage.getItem('rafiq_owner_token') || '').trim();
    if (!token || token === 'demo-sandbox' || token === 'session-token-valid-mock') {
      throw new OwnerAuthError('يرجى تسجيل الدخول بمفتاح الترخيص والـ PIN أولاً لتغيير الرمز السري.');
    }
    const res = await fetch(`${API_BASE}/dashboard/auth/change-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_pin: currentPin.trim(),
        new_pin: newPin.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !data.error?.includes('الرمز السري الحالي')) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.');
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحديث الرمز السري.');
    }
    return data;
  },

  async uploadProductImage(
    productId: string,
    blob: Blob,
    contentType: string,
    ownerToken?: string | null
  ): Promise<{ success: boolean; url: string; image_urls: string[] }> {
    const token = (ownerToken || localStorage.getItem('rafiq_owner_token') || '').trim();
    if (!token || token === 'demo-sandbox' || token === 'session-token-valid-mock') {
      throw new OwnerAuthError('يرجى تسجيل الدخول بمفتاح الترخيص والـ PIN أولاً لرفع الصور إلى السحابة.');
    }
    const res = await fetch(`${API_BASE}/dashboard/products/${encodeURIComponent(productId)}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${token}`,
      },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(
        data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول بمفتاح الترخيص والـ PIN.',
        401,
        data.code || 'SESSION_EXPIRED'
      );
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر رفع صورة المنتج');
    }
    return data;
  },

  async addProductImageUrl(
    productId: string,
    imageUrl: string,
    ownerToken?: string | null
  ): Promise<{ success: boolean; url: string; image_urls: string[] }> {
    const token = (ownerToken || localStorage.getItem('rafiq_owner_token') || '').trim();
    if (!token || token === 'demo-sandbox' || token === 'session-token-valid-mock') {
      throw new OwnerAuthError('يرجى تسجيل الدخول بمفتاح الترخيص والـ PIN أولاً لإضافة صور المنتجات.');
    }
    const res = await fetch(`${API_BASE}/dashboard/products/${encodeURIComponent(productId)}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت صلاحية الجلسة');
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر إضافة رابط الصورة');
    }
    return data;
  },

  async deleteProductImage(
    productId: string,
    url: string,
    ownerToken?: string | null
  ): Promise<{ success: boolean; image_urls: string[] }> {
    const token = (ownerToken || localStorage.getItem('rafiq_owner_token') || '').trim();
    if (!token || token === 'demo-sandbox' || token === 'session-token-valid-mock') {
      throw new OwnerAuthError('يرجى تسجيل الدخول بمفتاح الترخيص والـ PIN أولاً لتعديل صور المنتجات.');
    }
    const res = await fetch(`${API_BASE}/dashboard/products/${encodeURIComponent(productId)}/images`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(
        data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول بمفتاح الترخيص والـ PIN.',
        401,
        data.code || 'SESSION_EXPIRED'
      );
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر حذف صورة المنتج');
    }
    return data;
  },

  async updateStoreTheme(
    themePreset: string,
    themeCustom: Record<string, any> | null,
    ownerToken?: string | null
  ): Promise<{ success: boolean; persistedCloud: boolean; message?: string }> {
    const token = (ownerToken || localStorage.getItem('rafiq_owner_token') || '').trim();
    if (!token || token === 'demo-sandbox' || token === 'session-token-valid-mock') {
      return { success: true, persistedCloud: false, message: 'تم تطبيق الهوية محلياً في وضع المعاينة' };
    }
    try {
      const res = await fetch(`${API_BASE}/dashboard/store/theme`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          theme_preset: themePreset,
          theme_custom: themeCustom || {},
        }),
      });
      if (res.status === 401) {
        throw new OwnerAuthError('انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401, 'SESSION_EXPIRED');
      }
      if (!res.ok) {
        return { success: true, persistedCloud: false, message: 'تم تطبيق الهوية محلياً' };
      }
      const data = await res.json();
      return { success: true, persistedCloud: true, message: data.message || 'تم حفظ الهوية والقالب سحابياً بنجاح' };
    } catch (err) {
      if (err instanceof OwnerAuthError) throw err;
      return { success: true, persistedCloud: false, message: 'تم تطبيق الهوية محلياً' };
    }
  },

  async getDashboardOverview(
    ownerToken: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<DashboardOverviewData> {
    const params = new URLSearchParams();
    if (dateRange?.from) params.set('from', dateRange.from);
    if (dateRange?.to) params.set('to', dateRange.to);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/dashboard/overview${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحميل ملخص المبيعات');
    }
    return data as DashboardOverviewData;
  },

  async getDashboardOrders(ownerToken: string, status?: string): Promise<any[]> {
    const params = new URLSearchParams({ limit: '100' });
    if (status && status !== 'all') params.set('status', status);
    const res = await fetch(`${API_BASE}/dashboard/orders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحميل طلبات المتجر');
    }
    return Array.isArray(data?.orders) ? data.orders : [];
  },

  async updateDashboardOrderStatus(
    orderId: string,
    status: string,
    ownerToken: string,
    rejectionReason?: string
  ): Promise<{ success: boolean; order_id: string; status: string }> {
    const res = await fetch(`${API_BASE}/dashboard/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        status,
        ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحديث حالة الطلب');
    }
    return data;
  },

  async getDashboardProducts(ownerToken: string): Promise<Product[]> {
    const fetchPage = async (pageNum: number): Promise<{ products: Product[]; totalPages: number }> => {
      const res = await fetch(`${API_BASE}/dashboard/products?page=${pageNum}&limit=1000&include_out_of_stock=1`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
      }
      if (!res.ok) {
        throw new Error(data.error || 'تعذر تحميل أصناف المتجر');
      }
      const products: Product[] = Array.isArray(data?.products) ? data.products : [];
      const total = typeof data?.total === 'number' ? data.total : products.length;
      const totalPages = Math.max(
        1,
        typeof data?.totalPages === 'number' ? data.totalPages : Math.ceil(total / 1000)
      );
      return { products, totalPages };
    };

    const first = await fetchPage(1);
    if (first.totalPages <= 1) {
      return first.products;
    }

    // Fetch all remaining pages in parallel waves (up to 30,000 products — zero 1,000 cap!)
    const maxPages = Math.min(first.totalPages, 30);
    const allProducts: Product[] = [...first.products];
    const seen = new Set<string>(allProducts.map(p => p.id));

    for (let start = 2; start <= maxPages; start += 4) {
      const batchNums: number[] = [];
      for (let pg = start; pg < start + 4 && pg <= maxPages; pg++) {
        batchNums.push(pg);
      }
      const results = await Promise.all(batchNums.map(fetchPage));
      for (const r of results) {
        for (const prod of r.products) {
          if (!seen.has(prod.id)) {
            seen.add(prod.id);
            allProducts.push(prod);
          }
        }
      }
    }

    return allProducts;
  },

  async getDashboardCategories(ownerToken: string): Promise<Category[]> {
    const res = await fetch(`${API_BASE}/dashboard/categories`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحميل أقسام المتجر');
    }
    return Array.isArray(data?.categories) ? data.categories : [];
  },

  async updateDashboardCategoryVisibility(
    categoryId: string,
    isOnline: boolean,
    ownerToken: string,
    cascadeProducts = false
  ): Promise<{ success: boolean; category_id: string; is_online: number; affected_products?: number }> {
    const res = await fetch(
      `${API_BASE}/dashboard/categories/${encodeURIComponent(categoryId)}/visibility`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          is_online: isOnline ? 1 : 0,
          cascade_products: cascadeProducts,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحديث ظهور القسم');
    }
    return data;
  },

  async bulkUpdateDashboardCategoriesVisibility(
    categoryIds: string[],
    isOnline: boolean,
    ownerToken: string,
    cascadeProducts = false
  ): Promise<{ success: boolean; updated_count: number; is_online: number }> {
    const res = await fetch(`${API_BASE}/dashboard/categories/bulk-visibility`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        category_ids: categoryIds,
        is_online: isOnline ? 1 : 0,
        cascade_products: cascadeProducts,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحديث ظهور الأقسام المحددة');
    }
    return data;
  },

  async bulkUpdateDashboardProductsVisibility(
    productIds: string[],
    settings: { is_online?: number; is_featured?: number },
    ownerToken: string
  ): Promise<{ success: boolean; updated_count: number }> {
    const res = await fetch(`${API_BASE}/dashboard/products/bulk-visibility`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        product_ids: productIds,
        ...settings,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تطبيق التعديل الجماعي على الأصناف');
    }
    return data;
  },

  async updateDashboardProductOnlineSettings(
    productId: string,
    settings: { is_online?: number; is_featured?: number; description?: string },
    ownerToken: string
  ): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/dashboard/products/${encodeURIComponent(productId)}/online-settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تحديث حالة الصنف');
    }
    return data;
  },

  async batchUpdateDashboardProducts(
    updates: Array<{ id: string; description?: string; is_online?: number | boolean; is_featured?: number | boolean }>,
    ownerToken: string
  ): Promise<{ success: boolean; updated_count: number }> {
    const res = await fetch(`${API_BASE}/dashboard/products/batch`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ updates }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تطبيق التعديل الجماعي للأصناف');
    }
    return data;
  },

  async smartPublishDashboardCatalog(
    preset: 'publish_in_stock' | 'publish_with_images_only' | 'publish_with_descriptions_only' | 'hide_out_of_stock' | 'hide_all' | 'publish_category',
    options: { category_id?: string },
    ownerToken: string
  ): Promise<{ success: boolean; affected_count: number; message: string }> {
    const res = await fetch(`${API_BASE}/dashboard/products/smart-publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ preset, ...options }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تنفيذ معالج النشر السريع');
    }
    return data;
  },

  async updateStoreSettings(
    settings: {
      name?: string;
      phone?: string | null;
      whatsapp?: string | null;
      address?: string | null;
      working_hours?: Record<string, string> | null;
      welcome_message?: string | null;
      min_order_amount?: number;
      delivery_zones?: Array<{ name: string; fee: number }> | null;
      vodafone_cash_phone?: string | null;
      instapay_handle?: string | null;
      is_paused?: number;
      pause_message?: string | null;
    },
    ownerToken: string
  ): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/dashboard/store/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new OwnerAuthError(data.error || 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.', 401);
    }
    if (!res.ok) {
      throw new Error(data.error || 'تعذر حفظ إعدادات المتجر سحابياً');
    }
    return data;
  },

  getRealtimeWebSocketUrl(ownerToken: string): string {
    const base = API_BASE.replace(/\/+$/, '');
    const wsBase = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsBase}/realtime/ws?token=${encodeURIComponent(ownerToken)}`;
  },
};
