import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockD1Database } from './d1-mock.ts';
import server, { runDataRetentionCleanup } from '../src/index.ts';
import type { Env } from '../src/types.ts';
import { sha256Hex, hmacSha256Hex } from '../src/crypto.ts';

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

    it('POS purges all store orders and order items (orders/purge)', async () => {
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO products (id, store_id, name, price_piasters, stock_quantity, created_at, updated_at)
        VALUES ('prod-purge-test', '${STORE_ID}', 'منتج تجريبي', 6000, 10000, '${now}', '${now}');
      `).run();

      await env.DB.prepare(`
        INSERT INTO orders (id, store_id, order_number, customer_name, customer_phone, delivery_method, subtotal, total, status, synced_to_pos, created_at, updated_at)
        VALUES ('ord-purge-1', '${STORE_ID}', 10, 'كريم سعيد', '01011112222', 'pickup', 6000, 6000, 'new', 0, '${now}', '${now}');
      `).run();

      await env.DB.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity, line_total)
        VALUES ('item-p-1', 'ord-purge-1', 'prod-purge-test', 'منتج تجريبي', 6000, 1000, 6000);
      `).run();

      const purgeReq = new Request('http://localhost/api/v1/sync/orders/purge', {
        method: 'POST',
        headers: {
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
      });

      const purgeRes = await server.fetch(purgeReq, env);
      assert.equal(purgeRes.status, 200);
      const purgeData = (await purgeRes.json()) as any;
      assert.equal(purgeData.success, true);
      assert.ok(purgeData.deleted_orders >= 1);

      // Verify orders table is empty for this store
      const count = await env.DB.prepare('SELECT COUNT(*) as c FROM orders WHERE store_id = ?')
        .bind(STORE_ID)
        .first<{ c: number }>();
      assert.equal(count?.c, 0);

      // Verify order_items table has no orphaned rows
      const itemsCount = await env.DB.prepare('SELECT COUNT(*) as c FROM order_items WHERE order_id = ?')
        .bind('ord-purge-1')
        .first<{ c: number }>();
      assert.equal(itemsCount?.c, 0);
    });

    it('POS purges catalog (catalog/purge)', async () => {
      const purgeReq = new Request('http://localhost/api/v1/sync/catalog/purge', {
        method: 'POST',
        headers: {
          'X-Store-Id': STORE_ID,
          'X-Api-Key': API_KEY,
        },
      });

      const purgeRes = await server.fetch(purgeReq, env);
      assert.equal(purgeRes.status, 200);
      const purgeData = (await purgeRes.json()) as any;
      assert.equal(purgeData.success, true);

      // Verify products table is empty for this store
      const count = await env.DB.prepare('SELECT COUNT(*) as c FROM products WHERE store_id = ?')
        .bind(STORE_ID)
        .first<{ c: number }>();
      assert.equal(count?.c, 0);
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

  describe('7. Senior Edge Cases: Stock Restoration, Oversell Guard & Data Retention', () => {
    it('POS order rejection restores reserved stock and appends status_history', async () => {
      // Seed product with 5 units (5000 milli)
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            categories: [],
            products: [
              {
                id: 'prod-restore',
                name: 'زيت عباد الشمس 1 لتر',
                price_piasters: 8000,
                stock_quantity: 5000,
                is_active: 1,
                is_online: 1,
              },
            ],
          }),
        }),
        env
      );

      // Customer orders 2 units (2000 milli) -> stock becomes 3000
      const orderRes = await server.fetch(
        new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: 'محمود',
            customer_phone: '01099998888',
            delivery_method: 'pickup',
            items: [{ product_id: 'prod-restore', quantity: 2000 }],
          }),
        }),
        env
      );
      assert.equal(orderRes.status, 200);
      const orderData = (await orderRes.json()) as any;

      const stockAfterOrder = await env.DB.prepare('SELECT stock_quantity FROM products WHERE id = ?')
        .bind('prod-restore')
        .first<{ stock_quantity: number }>();
      assert.equal(stockAfterOrder?.stock_quantity, 3000);

      // POS rejects order -> stock must be restored to 5000 and status_history updated
      const rejectRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/orders/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            order_id: orderData.order_id,
            status: 'rejected',
            rejection_reason: 'الصنف تالف بالمخزن',
          }),
        }),
        env
      );
      assert.equal(rejectRes.status, 200);

      const stockAfterReject = await env.DB.prepare('SELECT stock_quantity FROM products WHERE id = ?')
        .bind('prod-restore')
        .first<{ stock_quantity: number }>();
      assert.equal(stockAfterReject?.stock_quantity, 5000);

      const orderRow = await env.DB.prepare('SELECT status, status_history FROM orders WHERE id = ?')
        .bind(orderData.order_id)
        .first<{ status: string; status_history: string }>();
      assert.equal(orderRow?.status, 'rejected');
      const hist = JSON.parse(orderRow?.status_history || '[]');
      assert.equal(hist.length, 2);
      assert.equal(hist[1].status, 'rejected');
      assert.equal(hist[1].reason, 'الصنف تالف بالمخزن');
    });

    it('Rejects invalid order status transition with 400', async () => {
      const res = await server.fetch(
        new Request('http://localhost/api/v1/sync/orders/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({ order_id: 'any-id', status: 'hacked_status' }),
        }),
        env
      );
      assert.equal(res.status, 400);
    });

    it('Prunes expired completed orders (>90d), sync_log (>30d), and page_views (>14d) while preserving recent data', async () => {
      const now = new Date('2026-11-17T12:00:00.000Z');
      const old100d = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const old40d = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const old20d = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const recent2d = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

      // Seed old delivered order (should be pruned) and recent delivered order (should NOT be pruned)
      await env.DB.prepare(`
        INSERT INTO orders (id, store_id, order_number, customer_name, customer_phone, delivery_method, subtotal, total, status, synced_to_pos, created_at, updated_at)
        VALUES ('ord-old-done', ?, 1, 'قديم', '0101', 'pickup', 5000, 5000, 'delivered', 1, ?, ?)
      `).bind(STORE_ID, old100d, old100d).run();
      await env.DB.prepare(`
        INSERT INTO orders (id, store_id, order_number, customer_name, customer_phone, delivery_method, subtotal, total, status, synced_to_pos, created_at, updated_at)
        VALUES ('ord-recent-done', ?, 2, 'حديث', '0102', 'pickup', 5000, 5000, 'delivered', 1, ?, ?)
      `).bind(STORE_ID, recent2d, recent2d).run();
      await env.DB.prepare(`
        INSERT INTO sync_log (id, store_id, sync_type, direction, records_count, status, created_at)
        VALUES ('log-old', ?, 'catalog', 'up', 1, 'success', ?), ('log-new', ?, 'catalog', 'up', 1, 'success', ?)
      `).bind(STORE_ID, old40d, STORE_ID, recent2d).run();
      await env.DB.prepare(`
        INSERT INTO page_views (id, store_id, page_type, view_date, created_at)
        VALUES ('pv-old', ?, 'home', ?, ?), ('pv-new', ?, 'home', ?, ?)
      `).bind(STORE_ID, old20d.slice(0, 10), old20d, STORE_ID, recent2d.slice(0, 10), recent2d).run();

      const stats = await runDataRetentionCleanup(env, now);
      assert.equal(stats.prunedOrders, 1);
      assert.equal(stats.prunedSyncLogs, 1);
      assert.equal(stats.prunedPageViews, 1);

      const remainingOrders = await env.DB.prepare('SELECT id FROM orders').all<{ id: string }>();
      assert.deepEqual(remainingOrders.results.map(r => r.id), ['ord-recent-done']);
    });
  });

  describe('8. Central KV Kill-Switch & Cloud-Only Product Images (R2)', () => {
    it('Blocks storefront and POS sync immediately when Shared KV marks store disabled or expired', async () => {
      const kvMap = new Map<string, string>();
      kvMap.set(
        `store-license:${SLUG}`,
        JSON.stringify({ enabled: false, plan: 'basic', expires_at: null })
      );
      const envWithKv: Env = {
        ...env,
        STORE_LICENSES: {
          get: async (k: string) => kvMap.get(k) ?? null,
        } as any,
      };

      const storeRes = await server.fetch(new Request(`http://localhost/api/v1/store/${SLUG}`), envWithKv);
      assert.equal(storeRes.status, 403);
      const storeErr = (await storeRes.json()) as any;
      assert.equal(storeErr.code, 'STORE_LICENSE_INACTIVE');

      const syncRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/heartbeat', {
          method: 'POST',
          headers: { 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
        }),
        envWithKv
      );
      assert.equal(syncRes.status, 403);
    });

    it('Uploads, serves, preserves across POS sync, and deletes product images via R2', async () => {
      const r2Map = new Map<string, { body: Uint8Array; contentType: string }>();
      const mockR2: any = {
        put: async (key: string, value: ArrayBuffer, opts?: any) => {
          r2Map.set(key, {
            body: new Uint8Array(value),
            contentType: opts?.httpMetadata?.contentType || 'image/webp',
          });
        },
        get: async (key: string) => {
          const item = r2Map.get(key);
          if (!item) return null;
          return { body: item.body, httpMetadata: { contentType: item.contentType } };
        },
        delete: async (key: string) => {
          r2Map.delete(key);
        },
      };
      const envWithR2: Env = { ...env, IMAGES: mockR2 };

      // Seed product via POS sync
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [],
            products: [
              { id: 'prod-img', name: 'شاي العروسة', price_piasters: 2500, stock_quantity: 10000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        envWithR2
      );

      // Login as store owner
      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: OWNER_PIN }),
        }),
        envWithR2
      );
      const { token } = (await loginRes.json()) as any;

      // Upload WebP binary image
      const fakeWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      const uploadRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/prod-img/images', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/webp',
          },
          body: fakeWebp,
        }),
        envWithR2
      );
      assert.equal(uploadRes.status, 201);
      const uploaded = (await uploadRes.json()) as any;
      assert.equal(uploaded.image_urls.length, 1);
      assert.ok(uploaded.url.includes(`/api/v1/images/stores/${STORE_ID}/products/prod-img/`));

      // Serve public image
      const getImgRes = await server.fetch(new Request(uploaded.url), envWithR2);
      assert.equal(getImgRes.status, 200);
      assert.equal(getImgRes.headers.get('Content-Type'), 'image/webp');

      // Subsequent POS catalog sync without images (null) MUST NOT erase cloud image_urls!
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [],
            products: [
              { id: 'prod-img', name: 'شاي العروسة 250 جم', price_piasters: 2800, stock_quantity: 9000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        envWithR2
      );
      const prodRow = await env.DB.prepare('SELECT price_piasters, image_urls FROM products WHERE id = ?')
        .bind('prod-img')
        .first<{ price_piasters: number; image_urls: string | null }>();
      assert.equal(prodRow?.price_piasters, 2800);
      assert.deepEqual(JSON.parse(prodRow?.image_urls || '[]'), [uploaded.url]);

      // Delete image removes from both D1 and R2
      const delRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/prod-img/images', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: uploaded.url }),
        }),
        envWithR2
      );
      assert.equal(delRes.status, 200);
      assert.equal(r2Map.size, 0);
    });

    it('Cross-account HMAC-SHA256 Governance Webhook enforces signatures, anti-replay, and syncs KV + D1', async () => {
      const webhookSecret = 'rafiq_cross_account_governance_secret_key_2026_32bytes!!';
      const kvMap = new Map<string, string>();
      const mockKv: any = {
        get: async (k: string) => kvMap.get(k) ?? null,
        put: async (k: string, v: string) => { kvMap.set(k, v); },
        delete: async (k: string) => { kvMap.delete(k); },
      };
      const envGov: Env = {
        ...env,
        STORE_LICENSES: mockKv,
        GOVERNANCE_WEBHOOK_SECRET: webhookSecret,
      };

      const rawBody = JSON.stringify({
        action: 'upsert',
        slug: SLUG,
        enabled: false,
        plan: 'pro',
        expires_at: null,
        license_key: LICENSE_KEY,
        shop_name: 'سوبرماركت سوق الخير',
      });
      const nowSec = Math.floor(Date.now() / 1000).toString();
      const validSig = await hmacSha256Hex(`${nowSec}.${rawBody}`, webhookSecret);

      // 1. Missing secret on worker -> 503
      const noSecretRes = await server.fetch(
        new Request('http://localhost/api/v1/internal/governance/store-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rafiq-Timestamp': nowSec, 'X-Rafiq-Signature': validSig },
          body: rawBody,
        }),
        env
      );
      assert.equal(noSecretRes.status, 503);

      // 2. Tampered signature -> 401
      const badSigRes = await server.fetch(
        new Request('http://localhost/api/v1/internal/governance/store-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rafiq-Timestamp': nowSec, 'X-Rafiq-Signature': '0'.repeat(64) },
          body: rawBody,
        }),
        envGov
      );
      assert.equal(badSigRes.status, 401);

      // 3. Replayed timestamp (>10 minutes old) -> 401
      const oldSec = (Math.floor(Date.now() / 1000) - 600).toString();
      const oldSig = await hmacSha256Hex(`${oldSec}.${rawBody}`, webhookSecret);
      const replayRes = await server.fetch(
        new Request('http://localhost/api/v1/internal/governance/store-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rafiq-Timestamp': oldSec, 'X-Rafiq-Signature': oldSig },
          body: rawBody,
        }),
        envGov
      );
      assert.equal(replayRes.status, 401);

      // 4. Valid signed webhook disables store in BOTH KV and D1 immediately
      const okRes = await server.fetch(
        new Request('http://localhost/api/v1/internal/governance/store-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rafiq-Timestamp': nowSec, 'X-Rafiq-Signature': validSig },
          body: rawBody,
        }),
        envGov
      );
      assert.equal(okRes.status, 200);
      const okData = (await okRes.json()) as any;
      assert.equal(okData.kv_updated, true);
      assert.equal(okData.db_updated, true);
      assert.equal(okData.enabled, false);

      // Storefront immediately returns 403 STORE_LICENSE_INACTIVE
      const blockedRes = await server.fetch(new Request(`http://localhost/api/v1/store/${SLUG}`), envGov);
      assert.equal(blockedRes.status, 403);
      const dbStore = await env.DB.prepare('SELECT is_active FROM stores WHERE slug = ?')
        .bind(SLUG)
        .first<{ is_active: number }>();
      assert.equal(dbStore?.is_active, 0);
    });

    it('Falls back seamlessly to PRODUCT_IMAGES_KV (zero-card free tier) for upload, serve, and delete', async () => {
      const kvImages = new Map<string, { value: ArrayBuffer; metadata?: any }>();
      const mockImgKv: any = {
        put: async (key: string, value: ArrayBuffer, opts?: any) => {
          kvImages.set(key, { value, metadata: opts?.metadata });
        },
        getWithMetadata: async (key: string) => {
          const item = kvImages.get(key);
          return item ? { value: item.value, metadata: item.metadata } : { value: null, metadata: null };
        },
        delete: async (key: string) => {
          kvImages.delete(key);
        },
      };
      const envKvImg: Env = { ...env, PRODUCT_IMAGES_KV: mockImgKv };

      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [],
            products: [
              { id: 'prod-kv-img', name: 'بن عبد المعبود', price_piasters: 6500, stock_quantity: 5000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        envKvImg
      );

      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: OWNER_PIN }),
        }),
        envKvImg
      );
      const { token } = (await loginRes.json()) as any;

      const fakeWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x02, 0x03, 0x04]);
      const upRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/prod-kv-img/images', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/webp' },
          body: fakeWebp,
        }),
        envKvImg
      );
      assert.equal(upRes.status, 201);
      const upData = (await upRes.json()) as any;
      assert.equal(upData.storage, 'kv');

      const getRes = await server.fetch(new Request(upData.url), envKvImg);
      assert.equal(getRes.status, 200);
      assert.equal(getRes.headers.get('Content-Type'), 'image/webp');

      const delRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/prod-kv-img/images', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: upData.url }),
        }),
        envKvImg
      );
      assert.equal(delRes.status, 200);
      assert.equal(kvImages.size, 0);
    });

    it('Auto-provisions a brand-new store row via signed Governance Webhook and preserves ID on slug rename', async () => {
      const webhookSecret = 'rafiq_cross_account_governance_secret_key_2026_32bytes!!';
      const kvMap = new Map<string, string>();
      const mockKv: any = {
        get: async (k: string) => kvMap.get(k) ?? null,
        put: async (k: string, v: string) => { kvMap.set(k, v); },
        delete: async (k: string) => { kvMap.delete(k); },
      };
      const envGov: Env = { ...env, STORE_LICENSES: mockKv, GOVERNANCE_WEBHOOK_SECRET: webhookSecret };

      const syncKeyHash = await sha256Hex('rfq_sync_brand_new_shop_key');
      const nowSec = Math.floor(Date.now() / 1000).toString();
      const createBody = JSON.stringify({
        action: 'upsert',
        store_id: 'auto-store-uuid-99',
        slug: 'shop-auto1234',
        enabled: true,
        plan: 'pro',
        license_key: 'RFQ-AUTO-9999-8888',
        shop_name: 'سوبرماركت النور',
        owner_phone: '01055554444',
        api_key_hash: syncKeyHash,
      });
      const sig1 = await hmacSha256Hex(`${nowSec}.${createBody}`, webhookSecret);

      const res1 = await server.fetch(
        new Request('http://localhost/api/v1/internal/governance/store-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rafiq-Timestamp': nowSec, 'X-Rafiq-Signature': sig1 },
          body: createBody,
        }),
        envGov
      );
      assert.equal(res1.status, 200);
      const data1 = (await res1.json()) as any;
      assert.equal(data1.provisioned, true);

      // Rename slug via admin webhook -> updates same store row and cleans old KV key
      const renameBody = JSON.stringify({
        action: 'upsert',
        store_id: 'auto-store-uuid-99',
        slug: 'al-nour-market',
        previous_slug: 'shop-auto1234',
        enabled: true,
        plan: 'pro',
        license_key: 'RFQ-AUTO-9999-8888',
        shop_name: 'سوبرماركت النور',
        api_key_hash: syncKeyHash,
      });
      const sig2 = await hmacSha256Hex(`${nowSec}.${renameBody}`, webhookSecret);
      const res2 = await server.fetch(
        new Request('http://localhost/api/v1/internal/governance/store-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rafiq-Timestamp': nowSec, 'X-Rafiq-Signature': sig2 },
          body: renameBody,
        }),
        envGov
      );
      assert.equal(res2.status, 200);
      assert.equal(kvMap.has('store-license:shop-auto1234'), false);
      assert.equal(kvMap.has('store-license:al-nour-market'), true);

      const dbRow = await env.DB.prepare('SELECT id, slug, is_active FROM stores WHERE license_key = ?')
        .bind('RFQ-AUTO-9999-8888')
        .first<{ id: string; slug: string; is_active: number }>();
      assert.equal(dbRow?.id, 'auto-store-uuid-99');
      assert.equal(dbRow?.slug, 'al-nour-market');
      assert.equal(dbRow?.is_active, 1);
    });

    it('Persists InstaPay/Vodafone Cash receipt image to KV and returns it to both Dashboard and POS Sync', async () => {
      const kvImages = new Map<string, { value: ArrayBuffer; metadata?: any }>();
      const mockImgKv: any = {
        put: async (key: string, value: ArrayBuffer, opts?: any) => {
          kvImages.set(key, { value, metadata: opts?.metadata });
        },
        getWithMetadata: async (key: string) => {
          const item = kvImages.get(key);
          return item ? { value: item.value, metadata: item.metadata } : { value: null, metadata: null };
        },
        delete: async (key: string) => {
          kvImages.delete(key);
        },
      };
      const envReceipt: Env = { ...env, PRODUCT_IMAGES_KV: mockImgKv };

      // Ensure store is active and has stock
      await env.DB.prepare('UPDATE stores SET is_active = 1 WHERE id = ?').bind(STORE_ID).run();
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [],
            products: [
              { id: 'prod-rcpt', name: 'زيت ذرة 1 لتر', price_piasters: 9000, stock_quantity: 10000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        envReceipt
      );

      // Minimal valid JPEG base64 payload
      const fakeJpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';

      // Customer creates order with InstaPay receipt
      const createRes = await server.fetch(
        new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: 'إسلام خالد',
            customer_phone: '01099112233',
            customer_address: 'شارع النصر - عمارة 5',
            delivery_method: 'delivery',
            delivery_zone: 'وسط البلد',
            payment_method: 'إنستاباي',
            sender_phone: 'islam@instapay',
            payment_ref: 'IP-554433',
            receipt_image: fakeJpegDataUrl,
            items: [{ product_id: 'prod-rcpt', quantity: 1000 }],
          }),
        }),
        envReceipt
      );
      assert.equal(createRes.status, 200);
      const created = (await createRes.json()) as any;
      assert.equal(created.success, true);

      // 1. Owner Dashboard receives payment_method, sender_phone, payment_ref, and public receipt_image URL
      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: '1234' }),
        }),
        envReceipt
      );
      const { token } = (await loginRes.json()) as any;
      const dashOrdersRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/orders', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        envReceipt
      );
      assert.equal(dashOrdersRes.status, 200);
      const dashData = (await dashOrdersRes.json()) as any;
      const dashOrder = dashData.orders.find((o: any) => o.id === created.order_id);
      assert.ok(dashOrder);
      assert.equal(dashOrder.payment_method, 'إنستاباي');
      assert.equal(dashOrder.sender_phone, 'islam@instapay');
      assert.equal(dashOrder.payment_ref, 'IP-554433');
      assert.ok(dashOrder.receipt_image.includes(`/api/v1/images/stores/${STORE_ID}/receipts/`));

      // 2. Public image endpoint serves the stored receipt binary
      const serveRes = await server.fetch(new Request(dashOrder.receipt_image), envReceipt);
      assert.equal(serveRes.status, 200);
      assert.equal(serveRes.headers.get('Content-Type'), 'image/jpeg');

      // 3. Desktop POS Sync receives the exact same payment details & receipt_image URL
      const posOrdersRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/orders/pending', {
          headers: { 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
        }),
        envReceipt
      );
      assert.equal(posOrdersRes.status, 200);
      const posData = (await posOrdersRes.json()) as any;
      const posOrder = posData.orders.find((o: any) => o.id === created.order_id);
      assert.ok(posOrder);
      assert.equal(posOrder.payment_method, 'إنستاباي');
      assert.equal(posOrder.sender_phone, 'islam@instapay');
      assert.equal(posOrder.payment_ref, 'IP-554433');
      assert.equal(posOrder.receipt_image, dashOrder.receipt_image);
    });
  });

  describe('9. High-Speed Batch Sync & Zero Out-of-Stock Clutter', () => {
    it('Skips out-of-stock products on catalog sync, prunes stale items safely (FK-aware), and reports missing restocked IDs', async () => {
      // 1. Catalog sync with 1 in-stock + 1 out-of-stock + 1 in-stock that will be ordered
      const syncRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            categories: [{ id: 'cat-clean', name: 'منظفات', is_active: 1, is_online: 1 }],
            products: [
              { id: 'prod-in-stock', category_id: 'cat-clean', name: 'مسحوق غسيل', price_piasters: 8500, stock_quantity: 5000, is_active: 1, is_online: 1 },
              { id: 'prod-zero-stock', category_id: 'cat-clean', name: 'صنف خلصان', price_piasters: 2000, stock_quantity: 0, is_active: 1, is_online: 1 },
              { id: 'prod-ordered-then-oos', category_id: 'cat-clean', name: 'صابون سائل', price_piasters: 4500, stock_quantity: 3000, is_active: 1, is_online: 1 },
              { id: 'prod-will-sell-out', category_id: 'cat-clean', name: 'كلور 1 لتر', price_piasters: 3000, stock_quantity: 2000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        env
      );
      assert.equal(syncRes.status, 200);
      const syncData = (await syncRes.json()) as any;
      assert.equal(syncData.processed_products, 3); // prod-zero-stock was skipped!

      const zeroRow = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind('prod-zero-stock').first();
      assert.equal(zeroRow, null, 'Out-of-stock product must NOT be stored in Cloud D1');

      // 2. Place an order referencing prod-ordered-then-oos so it has an order_items FK
      const ordRes = await server.fetch(
        new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: 'عميل اختبار',
            customer_phone: '01012345678',
            delivery_method: 'pickup',
            items: [{ product_id: 'prod-ordered-then-oos', quantity: 2000 }],
          }),
        }),
        env
      );
      assert.equal(ordRes.status, 200);

      // 3. Full catalog prune keeping ONLY prod-in-stock ->
      //    prod-will-sell-out (unreferenced) must be DELETED;
      //    prod-ordered-then-oos (referenced in order_items) must be soft-hidden (stock=0, is_online=0) without FK error!
      const pruneRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog/prune', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({ keep_product_ids: ['prod-in-stock'] }),
        }),
        env
      );
      assert.equal(pruneRes.status, 200);
      const pruneData = (await pruneRes.json()) as any;
      assert.equal(pruneData.success, true);
      assert.equal(pruneData.deleted_count, 1);
      assert.equal(pruneData.hidden_count, 1);

      const deletedRow = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind('prod-will-sell-out').first();
      assert.equal(deletedRow, null);

      const hiddenRow = await env.DB.prepare('SELECT stock_quantity, is_online FROM products WHERE id = ?')
        .bind('prod-ordered-then-oos')
        .first<{ stock_quantity: number; is_online: number }>();
      assert.equal(hiddenRow?.stock_quantity, 0);
      assert.equal(hiddenRow?.is_online, 0);

      // Storefront only returns prod-in-stock
      const sfRes = await server.fetch(new Request(`http://localhost/api/v1/store/${SLUG}/products`), env);
      const sfData = (await sfRes.json()) as any;
      assert.equal(sfData.products.length, 1);
      assert.equal(sfData.products[0].id, 'prod-in-stock');

      // 4. Stock sync: prod-in-stock drops to 0 (deleted) while prod-will-sell-out gets restocked (reported in missing_product_ids!)
      const stockRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/stock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            items: [
              { product_id: 'prod-in-stock', stock_quantity: 0 },
              { product_id: 'prod-will-sell-out', stock_quantity: 10000 },
              { product_id: 'prod-ordered-then-oos', stock_quantity: 7000 },
            ],
          }),
        }),
        env
      );
      assert.equal(stockRes.status, 200);
      const stockData = (await stockRes.json()) as any;
      assert.equal(stockData.removed_count, 1);
      assert.equal(stockData.updated_count, 1); // prod-ordered-then-oos was soft-hidden, now auto-restored!
      assert.deepEqual(stockData.missing_product_ids, ['prod-will-sell-out']);

      const restoredRow = await env.DB.prepare('SELECT stock_quantity, is_online FROM products WHERE id = ?')
        .bind('prod-ordered-then-oos')
        .first<{ stock_quantity: number; is_online: number }>();
      assert.equal(restoredRow?.stock_quantity, 7000);
      assert.equal(restoredRow?.is_online, 1);
    });

    it('Upserts 30-day batch sales summaries in a single HTTP request', async () => {
      const batchSummaries = [
        { summary_date: '2026-11-16', total_sales: 120000, invoice_count: 10, avg_invoice: 12000, cash_total: 100000, card_total: 20000, credit_total: 0 },
        { summary_date: '2026-11-17', total_sales: 250000, invoice_count: 20, avg_invoice: 12500, cash_total: 200000, card_total: 50000, credit_total: 0 },
        { summary_date: '2026-11-18', total_sales: 310000, invoice_count: 25, avg_invoice: 12400, cash_total: 260000, card_total: 50000, credit_total: 0 },
      ];

      const res = await server.fetch(
        new Request('http://localhost/api/v1/sync/sales-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({ summaries: batchSummaries }),
        }),
        env
      );
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.processed_count, 3);

      const countRes = await env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM daily_sales_summaries WHERE store_id = ?'
      )
        .bind(STORE_ID)
        .first<{ cnt: number }>();
      assert.equal(countRes?.cnt, 3);
    });

    it('Hiding categories or products cascades cleanly to storefront, blocks hidden orders, and survives POS re-sync', async () => {
      // Seed 2 categories and 3 in-stock products
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [
              { id: 'cat-dairy', name: 'ألبان', sort_order: 1, is_active: 1, is_online: 1 },
              { id: 'cat-tobacco', name: 'قسم مخفي', sort_order: 2, is_active: 1, is_online: 1 },
            ],
            products: [
              { id: 'p-milk', category_id: 'cat-dairy', name: 'حليب 1 لتر', price_piasters: 4200, stock_quantity: 10000, is_active: 1, is_online: 1 },
              { id: 'p-cheese', category_id: 'cat-dairy', name: 'جبنة فيتا', price_piasters: 3800, stock_quantity: 10000, is_active: 1, is_online: 1 },
              { id: 'p-hidden-cat-item', category_id: 'cat-tobacco', name: 'صنف داخلي', price_piasters: 6000, stock_quantity: 10000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        env
      );

      // Login as owner
      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: '1234' }),
        }),
        env
      );
      const { token } = (await loginRes.json()) as any;

      // 1. Hide category cat-tobacco
      const hideCatRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/categories/cat-tobacco/visibility', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ is_online: 0 }),
        }),
        env
      );
      assert.equal(hideCatRes.status, 200);

      // Storefront categories & products must NOT expose cat-tobacco or p-hidden-cat-item
      const sfCatsRes = await server.fetch(new Request(`http://localhost/api/v1/store/${SLUG}/categories`), env);
      const sfCats = (await sfCatsRes.json()) as any;
      assert.equal(sfCats.categories.length, 1);
      assert.equal(sfCats.categories[0].id, 'cat-dairy');

      const sfProdsRes = await server.fetch(new Request(`http://localhost/api/v1/store/${SLUG}/products`), env);
      const sfProds = (await sfProdsRes.json()) as any;
      assert.equal(sfProds.products.length, 2);
      assert.ok(!sfProds.products.some((p: any) => p.id === 'p-hidden-cat-item'));

      // Ordering an item inside a hidden category must be rejected (400)
      const hiddenOrderRes = await server.fetch(
        new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: 'عميل',
            customer_phone: '01012345678',
            delivery_method: 'pickup',
            items: [{ product_id: 'p-hidden-cat-item', quantity: 1000 }],
          }),
        }),
        env
      );
      assert.equal(hiddenOrderRes.status, 400);

      // 2. Bulk hide p-cheese via bulk-visibility endpoint
      const bulkRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/bulk-visibility', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ product_ids: ['p-cheese'], is_online: 0 }),
        }),
        env
      );
      assert.equal(bulkRes.status, 200);
      const bulkData = (await bulkRes.json()) as any;
      assert.equal(bulkData.updated_count, 1);

      // 3. POS re-syncs catalog & stock with is_online=1 -> cloud owner overrides MUST SURVIVE!
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [{ id: 'cat-tobacco', name: 'قسم مخفي', sort_order: 2, is_active: 1, is_online: 1 }],
            products: [
              { id: 'p-cheese', category_id: 'cat-dairy', name: 'جبنة فيتا 500جم', price_piasters: 4000, stock_quantity: 9000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        env
      );
      await server.fetch(
        new Request('http://localhost/api/v1/sync/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({ items: [{ product_id: 'p-cheese', stock_quantity: 8000 }] }),
        }),
        env
      );

      const sfAfterSync = await (await server.fetch(new Request(`http://localhost/api/v1/store/${SLUG}/products`), env)).json() as any;
      assert.equal(sfAfterSync.products.length, 1);
      assert.equal(sfAfterSync.products[0].id, 'p-milk');

      // Dashboard categories endpoint reports live breakdown accurately
      const dashCatsRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/categories', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        env
      );
      assert.equal(dashCatsRes.status, 200);
      const dashCats = (await dashCatsRes.json()) as any;
      const dairyCat = dashCats.categories.find((c: any) => c.id === 'cat-dairy');
      const hiddenCat = dashCats.categories.find((c: any) => c.id === 'cat-tobacco');
      assert.equal(dairyCat.is_online, 1);
      assert.equal(dairyCat.total_products, 2);
      assert.equal(dairyCat.visible_products, 1);
      assert.equal(dairyCat.hidden_products, 1);
      assert.equal(hiddenCat.is_online, 0);
      assert.equal(hiddenCat.visible_products, 0);
    });

    it('Syncs Web Dashboard order status updates back to Desktop POS (2-way) and blocks rejecting POS-invoiced orders', async () => {
      // Seed product & place order
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [{ id: 'cat-2w', name: 'مخبوزات', is_active: 1, is_online: 1 }],
            products: [
              { id: 'p-2w', category_id: 'cat-2w', name: 'توست أبيض', price_piasters: 3000, stock_quantity: 10000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        env
      );

      const createRes = await server.fetch(
        new Request(`http://localhost/api/v1/store/${SLUG}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: 'عميل ثنائي المزامنة',
            customer_phone: '01055554444',
            delivery_method: 'pickup',
            items: [{ product_id: 'p-2w', quantity: 2000 }],
          }),
        }),
        env
      );
      const { order_id } = (await createRes.json()) as any;

      // 1. Desktop POS downloads order -> synced_to_pos becomes 1
      const firstPull = await (
        await server.fetch(
          new Request('http://localhost/api/v1/sync/orders/pending', {
            headers: { 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          }),
          env
        )
      ).json() as any;
      assert.equal(firstPull.orders.length, 1);
      assert.equal(firstPull.orders[0].status, 'new');

      // 2. Owner updates order status from Web/Mobile Dashboard to 'preparing' -> resets synced_to_pos = 0
      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: '1234' }),
        }),
        env
      );
      const { token } = (await loginRes.json()) as any;

      const dashUpRes = await server.fetch(
        new Request(`http://localhost/api/v1/dashboard/orders/${order_id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'preparing' }),
        }),
        env
      );
      assert.equal(dashUpRes.status, 200);

      // Attempting to transition to 'ready' (خرج مع الدليفري) from Web Dashboard must be blocked (400)
      const blockedReadyRes = await server.fetch(
        new Request(`http://localhost/api/v1/dashboard/orders/${order_id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'ready' }),
        }),
        env
      );
      assert.equal(blockedReadyRes.status, 400);
      const blockedReadyJson = (await blockedReadyRes.json()) as any;
      assert.ok(blockedReadyJson.error.includes('خرج مع الدليفري'));

      // Attempting to skip to 'delivered' before POS invoiced/ready must also be blocked (400)
      const blockedEarlyDelivered = await server.fetch(
        new Request(`http://localhost/api/v1/dashboard/orders/${order_id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'delivered' }),
        }),
        env
      );
      assert.equal(blockedEarlyDelivered.status, 400);

      // 3. Desktop POS pulls again -> receives the updated status 'preparing'!
      const secondPull = await (
        await server.fetch(
          new Request('http://localhost/api/v1/sync/orders/pending', {
            headers: { 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          }),
          env
        )
      ).json() as any;
      assert.equal(secondPull.orders.length, 1);
      assert.equal(secondPull.orders[0].id, order_id);
      assert.equal(secondPull.orders[0].status, 'preparing');

      // 4. POS links pos_invoice_id & marks 'ready' -> Web Dashboard must block rejecting an already-invoiced order (409)
      const posInvRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/orders/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({ order_id, status: 'ready', pos_invoice_id: 'sale-uuid-123' }),
        }),
        env
      );
      assert.equal(posInvRes.status, 200);

      const blockedReject = await server.fetch(
        new Request(`http://localhost/api/v1/dashboard/orders/${order_id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'rejected', rejection_reason: 'محاولة إلغاء بعد الفوترة' }),
        }),
        env
      );
      assert.equal(blockedReject.status, 409);
    });

    it('Issues signed POS realtime token, guards WebSocket connect, and broadcasts via StoreRealtimeHub Durable Object', async () => {
      const { StoreRealtimeHub } = await import('../src/realtime.ts');

      // 1. Issue signed short-lived POS realtime WebSocket token
      const tokRes = await server.fetch(
        new Request('https://rafiq-store-api.workers.dev/api/v1/sync/realtime-token', {
          method: 'POST',
          headers: { 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
        }),
        env
      );
      assert.equal(tokRes.status, 200);
      const tokData = (await tokRes.json()) as any;
      assert.ok(tokData.token && tokData.token.split('.').length === 3);
      assert.ok(tokData.ws_url.startsWith('wss://rafiq-store-api.workers.dev/api/v1/realtime/ws?token='));

      // 2. Non-upgrade HTTP request to /realtime/ws returns 426
      const noUpgrade = await server.fetch(
        new Request(`http://localhost/api/v1/realtime/ws?token=${encodeURIComponent(tokData.token)}`),
        env
      );
      assert.equal(noUpgrade.status, 426);

      // 3. Invalid token with Upgrade: websocket returns 401 when DO binding is present
      const sentPos: string[] = [];
      const sentDash: string[] = [];
      const mockState = {
        getWebSockets: (tag?: string) => {
          const posWs = { send: (m: string) => sentPos.push(m), close: () => {} };
          const dashWs = { send: (m: string) => sentDash.push(m), close: () => {} };
          if (tag === 'pos') return [posWs];
          if (tag === 'dashboard') return [dashWs];
          return [posWs, dashWs];
        },
      } as any;
      const hub = new StoreRealtimeHub(mockState, env);
      const envWithDo = {
        ...env,
        STORE_REALTIME: {
          idFromName: (name: string) => name,
          get: () => hub,
        } as any,
      };

      const badTokRes = await server.fetch(
        new Request('http://localhost/api/v1/realtime/ws?token=invalid.token.here', {
          headers: { Upgrade: 'websocket' },
        }),
        envWithDo
      );
      assert.equal(badTokRes.status, 401);

      // 4. Broadcast from storefront reaches BOTH pos & dashboard; broadcast from pos reaches ONLY dashboard (no self-echo)
      const b1 = await hub.fetch(
        new Request('https://realtime.internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_created',
            source: 'storefront',
            orderId: 'ord-rt-1',
            orderNumber: 99,
            status: 'new',
            at: new Date().toISOString(),
          }),
        })
      );
      assert.equal(b1.status, 200);
      assert.equal(sentPos.length, 1);
      assert.equal(sentDash.length, 1);

      const b2 = await hub.fetch(
        new Request('https://realtime.internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_status_updated',
            source: 'pos',
            orderId: 'ord-rt-1',
            status: 'ready',
            at: new Date().toISOString(),
          }),
        })
      );
      assert.equal(b2.status, 200);
      assert.equal(sentPos.length, 1); // no self-echo back to POS!
      assert.equal(sentDash.length, 2); // delivered instantly to Web Dashboard!
    });

    it('Syncs real Desktop store name & true-color receipt logo to cloud and supports paginated dashboard products', async () => {
      // Minimal valid 1x1 PNG base64
      const tinyPngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

      const kvStore = new Map<string, { value: ArrayBuffer; metadata?: any }>();
      const envWithKv = {
        ...env,
        PRODUCT_IMAGES_KV: {
          put: async (k: string, v: ArrayBuffer, opts?: any) => {
            kvStore.set(k, { value: v, metadata: opts?.metadata });
          },
          getWithMetadata: async (k: string) => kvStore.get(k) ?? { value: null, metadata: null },
          delete: async (k: string) => {
            kvStore.delete(k);
          },
        } as any,
      };

      const profRes = await server.fetch(
        new Request('https://rafiq-store-api.workers.dev/api/v1/sync/store-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            name: 'سوبر ماركت الأمل',
            phone: '01099887766',
            address: 'شارع التحرير - القاهرة',
            vodafone_cash_phone: '01012345678',
            instapay_handle: 'elamal@instapay',
            logo_data_url: tinyPngDataUrl,
          }),
        }),
        envWithKv
      );
      assert.equal(profRes.status, 200);
      const profData = (await profRes.json()) as any;
      assert.equal(profData.name, 'سوبر ماركت الأمل');
      assert.equal(profData.vodafone_cash_phone, '01012345678');
      assert.equal(profData.instapay_handle, 'elamal@instapay');
      assert.ok(profData.logo_url && profData.logo_url.includes(`/api/v1/images/stores/${STORE_ID}/logo.png`));

      // Verify public store returns updated name, wallets and logo
      const pubRes = await server.fetch(new Request(`https://rafiq-store-api.workers.dev/api/v1/store/${SLUG}`), envWithKv);
      assert.equal(pubRes.status, 200);
      const pubData = (await pubRes.json()) as any;
      assert.equal(pubData.store.name, 'سوبر ماركت الأمل');
      assert.equal(pubData.store.vodafone_cash_phone, '01012345678');
      assert.equal(pubData.store.instapay_handle, 'elamal@instapay');
      assert.equal(pubData.store.accept_vodafone_cash, true);
      assert.equal(pubData.store.accept_instapay, true);

      // Verify public image serving works cleanly with ?v= cache-buster
      const imgRes = await server.fetch(new Request(profData.logo_url), envWithKv);
      assert.equal(imgRes.status, 200);
      assert.equal(imgRes.headers.get('Content-Type'), 'image/png');

      // Verify clearing logo sets logo_url back to null
      const clearRes = await server.fetch(
        new Request('https://rafiq-store-api.workers.dev/api/v1/sync/store-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-Id': STORE_ID,
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({ name: 'سوبر ماركت الأمل', clear_logo: true }),
        }),
        envWithKv
      );
      assert.equal(clearRes.status, 200);
      const cleared = (await clearRes.json()) as any;
      assert.equal(cleared.logo_url, null);

      // Verify paginated dashboard products metadata (totalPages, hasMore, page, limit)
      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: '1234' }),
        }),
        env
      );
      const { token } = (await loginRes.json()) as any;
      const p1Res = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products?page=1&limit=1', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        env
      );
      assert.equal(p1Res.status, 200);
      const p1 = (await p1Res.json()) as any;
      assert.equal(p1.page, 1);
      assert.equal(p1.limit, 1);
      assert.ok(typeof p1.totalPages === 'number' && p1.totalPages >= 1);
      assert.equal(typeof p1.hasMore, 'boolean');
    });

    it('Supports 2-way description sync, batch product updates, and smart publishing presets', async () => {
      // 1. Seed products via catalog sync (one with stock, one out of stock)
      await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
          body: JSON.stringify({
            categories: [{ id: 'cat-icecream', name: 'مجمدات وحلويات', is_active: 1, is_online: 1 }],
            products: [
              { id: 'prod-ic-1', category_id: 'cat-icecream', name: 'آيس كريم فانيليا', price_piasters: 2500, stock_quantity: 5000, is_active: 1, is_online: 1 },
              { id: 'prod-ic-2', category_id: 'cat-icecream', name: 'آيس كريم مانجو', price_piasters: 3000, stock_quantity: 5000, is_active: 1, is_online: 1 },
            ],
          }),
        }),
        env
      );

      // Login as owner
      const loginRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: LICENSE_KEY, pin: '1234' }),
        }),
        env
      );
      const { token } = (await loginRes.json()) as any;

      // 2. Batch update product descriptions & visibility from Dashboard
      const batchRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/batch', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            updates: [
              { id: 'prod-ic-1', description: 'آيس كريم فانيليا غني ومنعش مذاق كريمي ساحر', is_online: 1, is_featured: 1 },
              { id: 'prod-ic-2', description: 'آيس كريم مانجو طبيعي 100%' },
            ],
          }),
        }),
        env
      );
      assert.equal(batchRes.status, 200);
      const batchData = (await batchRes.json()) as any;
      assert.equal(batchData.success, true);
      assert.equal(batchData.updated_count, 2);

      // 3. Desktop POS pulls catalog updates via /sync/catalog/updates
      const syncUpdatesRes = await server.fetch(
        new Request('http://localhost/api/v1/sync/catalog/updates', {
          headers: { 'X-Store-Id': STORE_ID, 'X-Api-Key': API_KEY },
        }),
        env
      );
      assert.equal(syncUpdatesRes.status, 200);
      const syncUpdates = (await syncUpdatesRes.json()) as any;
      assert.ok(Array.isArray(syncUpdates.products));
      const p1 = syncUpdates.products.find((p: any) => p.id === 'prod-ic-1');
      assert.ok(p1);
      assert.equal(p1.description, 'آيس كريم فانيليا غني ومنعش مذاق كريمي ساحر');
      assert.equal(p1.is_online, 1);
      assert.equal(p1.is_featured, 1);

      // 4. Test smart publish preset: 'publish_in_stock'
      // Set prod-ic-2 stock to 0 in D1
      await env.DB.prepare('UPDATE products SET stock_quantity = 0 WHERE id = ?').bind('prod-ic-2').run();

      const smartRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/smart-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preset: 'publish_in_stock' }),
        }),
        env
      );
      assert.equal(smartRes.status, 200);
      const smartData = (await smartRes.json()) as any;
      assert.equal(smartData.success, true);
      assert.equal(smartData.preset, 'publish_in_stock');

      // Verify in-stock item (prod-ic-1) is online, out-of-stock item (prod-ic-2) is offline
      const verifyProdsRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products?limit=100&include_out_of_stock=1', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        env
      );
      const verifyProds = (await verifyProdsRes.json()) as any;
      const v1 = verifyProds.products.find((p: any) => p.id === 'prod-ic-1');
      const v2 = verifyProds.products.find((p: any) => p.id === 'prod-ic-2');
      assert.equal(v1.is_online, 1);
      assert.equal(v2.is_online, 0);

      // 5. Test smart publish preset: 'hide_all'
      const hideAllRes = await server.fetch(
        new Request('http://localhost/api/v1/dashboard/products/smart-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preset: 'hide_all' }),
        }),
        env
      );
      assert.equal(hideAllRes.status, 200);
      const hideAllData = (await hideAllRes.json()) as any;
      assert.equal(hideAllData.success, true);
    });
  });
});
