import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockD1Database } from './d1-mock.ts';
import server from '../src/index.ts';
import type { Env } from '../src/types.ts';
import { sha256Hex } from '../src/crypto.ts';

describe('Rafiq Online Store Cloud API Tests', () => {
  let env: Env;
  const STORE_ID = 'store-uuid-001';
  const LICENSE_KEY = 'RFQ-STORE-2026-DEMO';
  const SLUG = 'souq-el-khair';
  const API_KEY = 'super_secret_pos_sync_key_999';
  const OWNER_PIN = '1234';

  beforeEach(async () => {
    const mockDb = createMockD1Database();
    const apiKeyHash = await sha256Hex(API_KEY);
    const pinHash = await sha256Hex(OWNER_PIN);
    const now = new Date().toISOString();

    // Seed test store
    mockDb._rawDb.exec(`
      INSERT INTO stores (
        id, license_key, slug, name, phone, whatsapp, address,
        working_hours, welcome_message, theme_preset, min_order_amount,
        delivery_zones, is_active, is_paused, store_type, api_key_hash,
        owner_pin_hash, sync_version, created_at, updated_at
      ) VALUES (
        '${STORE_ID}', '${LICENSE_KEY}', '${SLUG}', 'سوبرماركت سوق الخير', '01012345678', '01012345678', 'القاهرة - وسط البلد',
        '{"sat":"9:00-23:00","sun":"9:00-23:00"}', 'أهلاً بكم في متجرنا الإلكتروني', 'classic-green', 5000,
        '[{"name":"وسط البلد","fee":1500},{"name":"المعادي","fee":2500}]', 1, 0, 'supermarket', '${apiKeyHash}',
        '${pinHash}', 1, '${now}', '${now}'
      );
    `);

    env = {
      DB: mockDb,
      APP_SECRET: 'test_super_secure_jwt_secret_32_bytes_long!!',
    };
  });

  describe('1. Health Check', () => {
    it('Returns 200 and status online', async () => {
      const req = new Request('http://localhost/api/v1/health');
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.status, 'online');
      assert.equal(data.service, 'rafiq-store-api');
    });
  });

  describe('2. POS Sync Authentication', () => {
    it('Rejects sync request with missing headers (401)', async () => {
      const req = new Request('http://localhost/api/v1/sync/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 401);
    });

    it('Rejects sync request with wrong API key (401)', async () => {
      const req = new Request('http://localhost/api/v1/sync/catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Store-Id': STORE_ID,
          'X-Api-Key': 'wrong_api_key',
        },
        body: JSON.stringify({}),
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 401);
    });
  });

  describe('3. POS Catalog & Stock Sync', () => {
    it('Successfully synchronizes categories and products to cloud', async () => {
      const payload = {
        categories: [
          { id: 'cat-1', name: 'ألبان وجبن', sort_order: 1, is_active: 1, is_online: 1 },
          { id: 'cat-2', name: 'مشروبات وعصائر', sort_order: 2, is_active: 1, is_online: 1 },
        ],
        products: [
          {
            id: 'prod-1',
            category_id: 'cat-1',
            name: 'جبنة فيتا دومتي 500 جم',
            barcode: '6221234567890',
            price_piasters: 4500, // 45.00 EGP
            compare_price: 5000,
            cost_piasters: 3800,
            unit_name: 'علبة',
            stock_quantity: 10000, // 10 units
            is_active: 1,
            is_online: 1,
            is_featured: 1,
            image_urls: ['https://r2.rafiqpos.com/prod1.webp'],
          },
          {
            id: 'prod-2',
            category_id: 'cat-2',
            name: 'عصير جهينة برتقال 1 لتر',
            barcode: '6229876543210',
            price_piasters: 3000, // 30.00 EGP
            unit_name: 'عبوة',
            stock_quantity: 15000, // 15 units
            is_active: 1,
            is_online: 1,
            is_featured: 0,
          },
        ],
      };

      const req = new Request('http://localhost/api/v1/sync/catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.processed_categories, 2);
      assert.equal(data.processed_products, 2);

      // Verify categories in DB
      const catCheck = await env.DB.prepare('SELECT COUNT(*) as count FROM categories WHERE store_id = ?')
        .bind(STORE_ID)
        .first<{ count: number }>();
      assert.equal(catCheck?.count, 2);

      // Verify products in DB
      const prodCheck = await env.DB.prepare('SELECT COUNT(*) as count FROM products WHERE store_id = ?')
        .bind(STORE_ID)
        .first<{ count: number }>();
      assert.equal(prodCheck?.count, 2);

      // Verify sync log entry was created
      const logCheck = await env.DB.prepare('SELECT * FROM sync_log WHERE store_id = ? AND sync_type = \'catalog\'')
        .bind(STORE_ID)
        .first<any>();
      assert.ok(logCheck);
      assert.equal(logCheck.records_count, 4);
    });

    it('Successfully updates stock quantities in batch', async () => {
      // First insert product
      await env.DB.prepare(`
        INSERT INTO products (id, store_id, name, price_piasters, stock_quantity, created_at, updated_at)
        VALUES ('prod-x', '${STORE_ID}', 'شاي العروسة', 2000, 5000, '2026-11-15', '2026-11-15')
      `).run();

      const req = new Request('http://localhost/api/v1/sync/stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
        body: JSON.stringify({
          items: [{ product_id: 'prod-x', stock_quantity: 12000 }],
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.updated_count, 1);

      const check = await env.DB.prepare('SELECT stock_quantity FROM products WHERE id = ?')
        .bind('prod-x')
        .first<{ stock_quantity: number }>();
      assert.equal(check?.stock_quantity, 12000);
    });

    it('Successfully records daily sales summary', async () => {
      const req = new Request('http://localhost/api/v1/sync/sales-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
        body: JSON.stringify({
          summary_date: '2026-11-15',
          total_sales: 1545000, // 15,450.00 EGP
          invoice_count: 85,
          avg_invoice: 18176,
          cash_total: 1200000,
          card_total: 345000,
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);

      const check = await env.DB.prepare('SELECT * FROM daily_sales_summaries WHERE store_id = ?')
        .bind(STORE_ID)
        .first<any>();
      assert.equal(check.total_sales, 1545000);
      assert.equal(check.invoice_count, 85);
    });
  });

  describe('4. Storefront Customer Shopping & Ordering', () => {
    beforeEach(async () => {
      // Seed products for store
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO categories (id, store_id, name, sort_order, is_active, is_online, created_at, updated_at)
        VALUES ('cat-groceries', '${STORE_ID}', 'بقالة تموينية', 1, 1, 1, '${now}', '${now}');
      `).run();

      await env.DB.prepare(`
        INSERT INTO products (
          id, store_id, category_id, name, description, price_piasters,
          compare_price, cost_piasters, unit_name, stock_quantity,
          is_active, is_online, is_featured, created_at, updated_at
        ) VALUES
        ('prod-rice', '${STORE_ID}', 'cat-groceries', 'أرز مصري المطبخ 1 كجم', 'أرز حبة رفيعة ممتاز', 3500, 4000, 3000, 'كجم', 20000, 1, 1, 1, '${now}', '${now}'),
        ('prod-oil', '${STORE_ID}', 'cat-groceries', 'زيت هلا عباد الشمس 800 مل', 'زيت نقي للطبخ', 7500, null, 6800, 'زجاجة', 10000, 1, 1, 1, '${now}', '${now}'),
        ('prod-sugar', '${STORE_ID}', 'cat-groceries', 'سكر أبيض فاخر 1 كجم', null, 3200, null, 2900, 'كجم', 5000, 1, 1, 0, '${now}', '${now}');
      `).run();
    });

    it('Customer retrieves public store details (no secrets leaked)', async () => {
      const req = new Request(`http://localhost/api/v1/store/${SLUG}`);
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.ok(data.store);
      assert.equal(data.store.name, 'سوبرماركت سوق الخير');
      assert.equal(data.store.slug, SLUG);
      assert.equal(data.store.theme_preset, 'classic-green');
      assert.equal(data.store.min_order_amount, 5000);
      // Ensure private credentials are NEVER exposed
      assert.equal(data.store.api_key_hash, undefined);
      assert.equal(data.store.owner_pin_hash, undefined);
      assert.equal(data.store.license_key, undefined);
    });

    it('Customer retrieves categories and products list', async () => {
      const catReq = new Request(`http://localhost/api/v1/store/${SLUG}/categories`);
      const catRes = await server.fetch(catReq, env);
      assert.equal(catRes.status, 200);
      const catData = (await catRes.json()) as any;
      assert.equal(catData.categories.length, 1);
      assert.equal(catData.categories[0].name, 'بقالة تموينية');

      const prodReq = new Request(`http://localhost/api/v1/store/${SLUG}/products?featured=1`);
      const prodRes = await server.fetch(prodReq, env);
      assert.equal(prodRes.status, 200);
      const prodData = (await prodRes.json()) as any;
      assert.equal(prodData.products.length, 2); // 2 featured products
      // Ensure cost_piasters is NEVER exposed to public!
      assert.equal(prodData.products[0].cost_piasters, undefined);
    });

    it('Customer creates an online order with integer piasters arithmetic and atomic stock decrement', async () => {
      // Order: 2 units of rice (2 * 3500 = 7000 piasters) + delivery to 'وسط البلد' (1500 piasters) = 8500 piasters
      const orderReq = new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'أحمد محمود',
          customer_phone: '01123456789',
          customer_address: '15 شارع طلعت حرب، الدور 3',
          delivery_method: 'delivery',
          delivery_zone: 'وسط البلد',
          notes: 'يرجى الاتصال قبل الوصول',
          items: [
            { product_id: 'prod-rice', quantity: 2000 }, // 2 units in milli-units
          ],
        }),
      });

      const orderRes = await server.fetch(orderReq, env);
      assert.equal(orderRes.status, 200);
      const orderData = (await orderRes.json()) as any;
      assert.equal(orderData.success, true);
      assert.equal(orderData.order_number, 1);
      assert.equal(orderData.subtotal, 7000); // 70.00 EGP
      assert.equal(orderData.delivery_fee, 1500); // 15.00 EGP
      assert.equal(orderData.total, 8500); // 85.00 EGP
      assert.equal(orderData.status, 'new');

      // Verify stock was decremented atomically: was 20,000, now should be 18,000
      const stockCheck = await env.DB.prepare('SELECT stock_quantity FROM products WHERE id = ?')
        .bind('prod-rice')
        .first<{ stock_quantity: number }>();
      assert.equal(stockCheck?.stock_quantity, 18000);

      // Verify order items table has snapshot
      const itemsCheck = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?')
        .bind(orderData.order_id)
        .first<any>();
      assert.equal(itemsCheck.product_id, 'prod-rice');
      assert.equal(itemsCheck.product_price, 3500);
      assert.equal(itemsCheck.quantity, 2000);
      assert.equal(itemsCheck.line_total, 7000);
    });

    it('Rejects order when items subtotal is below store minimum order amount', async () => {
      // Min order amount is 5000 piasters. Order only 1 unit of rice (3500 piasters)
      const req = new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'علي حسن',
          customer_phone: '01234567890',
          delivery_method: 'pickup',
          items: [{ product_id: 'prod-rice', quantity: 1000 }],
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.error, /الحد الأدنى/);
    });

    it('Customer tracks placed order by order number and phone', async () => {
      // Place order first
      const placeReq = new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'طارق حسام',
          customer_phone: '01511223344',
          delivery_method: 'pickup',
          items: [{ product_id: 'prod-oil', quantity: 1000 }], // 7500 piasters
        }),
      });
      const placeRes = await server.fetch(placeReq, env);
      const placeData = (await placeRes.json()) as any;
      const orderNum = placeData.order_number;

      // Track with valid phone
      const trackReq = new Request(`http://localhost/api/v1/store/${SLUG}/orders/${orderNum}?phone=01511223344`);
      const trackRes = await server.fetch(trackReq, env);
      assert.equal(trackRes.status, 200);
      const trackData = (await trackRes.json()) as any;
      assert.equal(trackData.order.order_number, orderNum);
      assert.equal(trackData.order.status, 'new');
      assert.equal(trackData.order.customer_name, 'طارق حسام');
      assert.equal(trackData.order.items.length, 1);

      // Track with wrong phone -> 404
      const wrongReq = new Request(`http://localhost/api/v1/store/${SLUG}/orders/${orderNum}?phone=01000000000`);
      const wrongRes = await server.fetch(wrongReq, env);
      assert.equal(wrongRes.status, 404);
    });
  });

  describe('5. POS Pending Orders Download & Status Updates', () => {
    it('POS fetches pending orders and marks them as synced', async () => {
      // Insert product and an unsynced order
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO products (id, store_id, name, price_piasters, stock_quantity, created_at, updated_at)
        VALUES ('prod-sync-test', '${STORE_ID}', 'منتج تجريبي', 6000, 10000, '${now}', '${now}');
      `).run();

      await env.DB.prepare(`
        INSERT INTO orders (id, store_id, order_number, customer_name, customer_phone, delivery_method, subtotal, total, status, synced_to_pos, created_at, updated_at)
        VALUES ('ord-sync-1', '${STORE_ID}', 10, 'كريم سعيد', '01011112222', 'pickup', 6000, 6000, 'new', 0, '${now}', '${now}');
      `).run();

      await env.DB.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity, line_total)
        VALUES ('item-1', 'ord-sync-1', 'prod-sync-test', 'منتج تجريبي', 6000, 1000, 6000);
      `).run();

      const getReq = new Request('http://localhost/api/v1/sync/orders/pending', {
        headers: {
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
      });

      const getRes = await server.fetch(getReq, env);
      assert.equal(getRes.status, 200);
      const getData = (await getRes.json()) as any;
      assert.equal(getData.count, 1);
      assert.equal(getData.orders[0].id, 'ord-sync-1');
      assert.equal(getData.orders[0].items.length, 1);

      // Verify synced_to_pos was updated to 1
      const check = await env.DB.prepare('SELECT synced_to_pos FROM orders WHERE id = ?')
        .bind('ord-sync-1')
        .first<{ synced_to_pos: number }>();
      assert.equal(check?.synced_to_pos, 1);

      // POS updates status to 'accepted' with linked invoice id
      const statusReq = new Request('http://localhost/api/v1/sync/orders/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
        body: JSON.stringify({
          order_id: 'ord-sync-1',
          status: 'accepted',
          pos_invoice_id: 'inv-uuid-999',
        }),
      });

      const statusRes = await server.fetch(statusReq, env);
      assert.equal(statusRes.status, 200);

      const updatedOrder = await env.DB.prepare('SELECT status, pos_invoice_id FROM orders WHERE id = ?')
        .bind('ord-sync-1')
        .first<any>();
      assert.equal(updatedOrder.status, 'accepted');
      assert.equal(updatedOrder.pos_invoice_id, 'inv-uuid-999');
    });
  });

  describe('6. Store Owner Dashboard Login & Operations', () => {
    let sessionToken: string;

    it('Owner successfully logs in with license key and PIN', async () => {
      const loginReq = new Request('http://localhost/api/v1/dashboard/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: LICENSE_KEY,
          pin: OWNER_PIN,
        }),
      });

      const res = await server.fetch(loginReq, env);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.ok(data.token);
      assert.equal(data.store.id, STORE_ID);
      sessionToken = data.token;
    });

    it('Owner accesses dashboard overview and updates store settings', async () => {
      // First login to get fresh token
      const loginReq = new Request('http://localhost/api/v1/dashboard/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: LICENSE_KEY, pin: OWNER_PIN }),
      });
      const loginRes = await server.fetch(loginReq, env);
      const loginData = (await loginRes.json()) as any;
      sessionToken = loginData.token;

      // Overview
      const overReq = new Request('http://localhost/api/v1/dashboard/overview', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const overRes = await server.fetch(overReq, env);
      assert.equal(overRes.status, 200);
      const overData = (await overRes.json()) as any;
      assert.equal(typeof overData.today_online_orders, 'number');

      // Update store settings (e.g. pause store, change welcome message)
      const updateReq = new Request('http://localhost/api/v1/dashboard/store/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          welcome_message: 'عروض الجمعة البيضاء متوفرة الآن!',
          is_paused: 1,
          pause_message: 'إجازة أسبوعية حتى صباح السبت',
        }),
      });

      const updateRes = await server.fetch(updateReq, env);
      assert.equal(updateRes.status, 200);

      const storeCheck = await env.DB.prepare('SELECT welcome_message, is_paused, pause_message FROM stores WHERE id = ?')
        .bind(STORE_ID)
        .first<any>();
      assert.equal(storeCheck.welcome_message, 'عروض الجمعة البيضاء متوفرة الآن!');
      assert.equal(storeCheck.is_paused, 1);
      assert.equal(storeCheck.pause_message, 'إجازة أسبوعية حتى صباح السبت');
    });

    it('Owner updates store theme preset', async () => {
      const loginReq = new Request('http://localhost/api/v1/dashboard/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: LICENSE_KEY, pin: OWNER_PIN }),
      });
      const loginRes = await server.fetch(loginReq, env);
      const loginData = (await loginRes.json()) as any;
      const token = loginData.token;

      const themeReq = new Request('http://localhost/api/v1/dashboard/store/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          theme_preset: 'medical-blue',
          theme_custom: { '--store-primary': '#0284c7' },
        }),
      });

      const themeRes = await server.fetch(themeReq, env);
      assert.equal(themeRes.status, 200);

      const storeCheck = await env.DB.prepare('SELECT theme_preset FROM stores WHERE id = ?')
        .bind(STORE_ID)
        .first<any>();
      assert.equal(storeCheck.theme_preset, 'medical-blue');
    });
  });
});
