import type { Store, Category, Product, Order } from '../types';

const API_BASE = '/api/v1';

// Default mock store for standalone preview if backend is not running
export const MOCK_STORE: Store = {
  id: 'demo-store-001',
  slug: 'souq-el-khair',
  name: 'سوبرماركت سوق الخير',
  phone: '01012345678',
  whatsapp: '01012345678',
  address: 'شارع الجمهورية - وسط البلد - القاهرة',
  working_hours: {
    'السبت - الخميس': '9:00 ص - 11:30 م',
    الجمعة: '1:00 م - 12:00 م',
  },
  welcome_message: null,
  logo_url: null,
  banner_url: null,
  theme_preset: 'duo-forest-cream',
  theme_custom: null,
  min_order_amount: 0, // No minimum order restriction
  delivery_zones: [
    { name: 'وسط البلد', fee: 1500 }, // 15 EGP
    { name: 'الدقي والمهندسين', fee: 2000 },
    { name: 'المعادي', fee: 3000 },
    { name: 'مدينة نصر', fee: 3500 },
  ],
  is_paused: 0,
  pause_message: null,
  store_type: 'supermarket',
  instapay_handle: 'souq-elkhair@instapay',
  vodafone_cash_phone: '01012345678',
};

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'الكل', parent_id: null, image_url: null, sort_order: 0 },
  { id: 'cat-2', name: 'بقالة تموينية', parent_id: null, image_url: null, sort_order: 1 },
  { id: 'cat-3', name: 'ألبان وأجبان', parent_id: null, image_url: null, sort_order: 2 },
  { id: 'cat-4', name: 'مشروبات وعصائر', parent_id: null, image_url: null, sort_order: 3 },
  { id: 'cat-5', name: 'منظفات وعناية', parent_id: null, image_url: null, sort_order: 4 },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    category_id: 'cat-2',
    name: 'أرز مصري فاخر المطبخ 1 كجم',
    description: 'أرز حبة رفيعة منقى ومغسول آلياً، ممتاز للطبخ والمحاشي',
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
    name: 'زيت هلا عباد الشمس 800 مل',
    description: 'زيت نقي خالي من الكوليسترول، مناسب للطهي والقلي الخفيف',
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
    description: 'جبنة بيضاء طبيعية كريمية قليلة الملح بطعم غني ولذيذ',
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
    description: 'حليب طبيعي 100% معقم ومعبأ بطريقة تحافظ على القيمة الغذائية',
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
    id: 'p-6',
    category_id: 'cat-4',
    name: 'عصير بيتي برتقال 1 لتر',
    description: 'عصير طبيعي بدون مواد حافظة منعش ومليء بفيتامين سي',
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
    description: 'شاي كيني أصلي بلون داكن ونكهة قوية مميزة',
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
    description: 'قوة مضاعفة لتفتيت الدهون الصعبة ولمعان فوري للأواني',
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

export const apiClient = {
  async getStore(slug: string): Promise<Store> {
    try {
      const res = await fetch(`${API_BASE}/store/${slug}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      return data.store;
    } catch {
      return { ...MOCK_STORE, slug };
    }
  },

  async getCategories(slug: string): Promise<Category[]> {
    try {
      const res = await fetch(`${API_BASE}/store/${slug}/categories`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      return [{ id: 'all', name: 'الكل', parent_id: null, image_url: null, sort_order: 0 }, ...data.categories];
    } catch {
      return MOCK_CATEGORIES;
    }
  },

  async getProducts(slug: string, options?: { categoryId?: string; search?: string; featured?: boolean }): Promise<Product[]> {
    try {
      const params = new URLSearchParams();
      if (options?.categoryId && options.categoryId !== 'all' && options.categoryId !== 'cat-1') {
        params.append('category', options.categoryId);
      }
      if (options?.search) params.append('search', options.search);
      if (options?.featured) params.append('featured', '1');

      const res = await fetch(`${API_BASE}/store/${slug}/products?${params.toString()}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      return data.products;
    } catch {
      let filtered = [...MOCK_PRODUCTS];
      if (options?.categoryId && options.categoryId !== 'all' && options.categoryId !== 'cat-1') {
        filtered = filtered.filter(p => p.category_id === options.categoryId);
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q)));
      }
      if (options?.featured) {
        filtered = filtered.filter(p => p.is_featured === 1);
      }
      return filtered;
    }
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
    }
  ): Promise<{ success: boolean; order_number: number; total: number; order_id: string }> {
    try {
      const res = await fetch(`${API_BASE}/store/${slug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      // Safely inspect response content-type
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (res.ok && data) {
        return data;
      }

      // If backend returned a clear business validation error (e.g. 400 with message)
      if (res.status >= 400 && res.status < 500 && data?.error) {
        throw new Error(data.error);
      }

      // Server not reachable or proxy returned 502/504/empty
      throw new Error('API_UNAVAILABLE');
    } catch (err: any) {
      // Re-throw genuine business validation error from server
      if (
        err.message &&
        err.message !== 'API_UNAVAILABLE' &&
        !err.message.includes('fetch') &&
        !err.message.includes('JSON') &&
        !err.message.includes('Unexpected')
      ) {
        throw err;
      }

      // Seamless Demo & Offline Order Creation
      const mockOrderNum = Math.floor(Math.random() * 800) + 103;
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
          total_price: lineTotal,
          product_id: i.product_id,
          product_name: i.product_name || prod?.name || 'صنف',
          line_total: lineTotal,
        };
      });

      const deliveryFee = orderData.delivery_method === 'delivery' ? 1500 : 0;
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
        subtotal: subtotal,
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
  },

  async trackOrder(slug: string, orderNumberOrId: string, phone: string): Promise<Order> {
    try {
      const res = await fetch(`${API_BASE}/store/${slug}/orders/${orderNumberOrId}?phone=${encodeURIComponent(phone)}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json().catch(() => null);
        if (data?.order) return data.order;
      }
    } catch {
      // Ignore network errors in demo/preview mode
    }

    // Check locally saved orders in demo mode
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
            status_history: [
              { status: 'new', at: found.created_at || new Date().toISOString() },
            ],
            created_at: new Date().toISOString(),
            items: found.items.map((i: any) => ({
              id: i.product_id || 'p-1',
              product_name: i.name || i.product_name || 'صنف',
              product_price: i.unit_price || 0,
              quantity: i.quantity || 1,
              line_total: i.total_price || i.line_total || 0,
            })),
          };
        }
      }
    } catch {
      // Ignore storage errors
    }

    // Fallback mock order if not found
    const num = parseInt(orderNumberOrId, 10) || 101;
    return {
      id: `mock-order-${num}`,
      order_number: num,
      customer_name: 'عميل رفيق',
      customer_phone: phone || '01012345678',
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
          quantity: 1,
          line_total: 7500,
        },
      ],
    };
  },
};
