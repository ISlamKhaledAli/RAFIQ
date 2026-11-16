import type { Env, Store, Order, OrderItem, Product } from '../types.ts';
import { sha256Hex, timingSafeEqual, createSessionToken } from '../crypto.ts';

export async function handleOwnerLogin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { license_key?: string; pin?: string };

  if (!body.license_key || !body.pin) {
    return new Response(JSON.stringify({ error: 'رمز الترخيص والـ PIN مطلوبان' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const store = await env.DB.prepare(
    'SELECT * FROM stores WHERE license_key = ?'
  )
    .bind(body.license_key.trim())
    .first<Store>();

  if (!store || store.is_active !== 1) {
    return new Response(JSON.stringify({ error: 'الترخيص غير موجود أو غير نشط' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // If store has no owner_pin_hash set yet, accept default '1234' or initial pin
  const pinHash = await sha256Hex(body.pin.trim());
  const expectedHash = store.owner_pin_hash || (await sha256Hex('1234'));

  if (!timingSafeEqual(pinHash, expectedHash)) {
    return new Response(JSON.stringify({ error: 'رمز الـ PIN غير صحيح' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate 7-day session token
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const secret = env.APP_SECRET || 'rafiq_default_owner_jwt_secret_key_32bytes!';
  const token = await createSessionToken({ store_id: store.id, role: 'owner', exp }, secret);

  return new Response(
    JSON.stringify({
      success: true,
      token,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        license_key: store.license_key,
        theme_preset: store.theme_preset,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardOverview(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);

  // Sales summary today from POS
  const salesSummary = await env.DB.prepare(`
    SELECT total_sales, invoice_count FROM daily_sales_summaries
    WHERE store_id = ? AND summary_date = ?
  `)
    .bind(store.id, today)
    .first<{ total_sales: number; invoice_count: number }>();

  // Online orders today
  const onlineOrdersToday = await env.DB.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
    FROM orders
    WHERE store_id = ? AND DATE(created_at) = ? AND status != 'rejected'
  `)
    .bind(store.id, today)
    .first<{ count: number; total: number }>();

  // Pending orders
  const pendingOrdersRes = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE store_id = ? AND status = 'new'
  `)
    .bind(store.id)
    .first<{ count: number }>();

  // Low stock products count
  const lowStockRes = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM products
    WHERE store_id = ? AND is_active = 1 AND stock_quantity <= low_stock_threshold
  `)
    .bind(store.id)
    .first<{ count: number }>();

  // Total active products count
  const totalProductsRes = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM products
    WHERE store_id = ? AND is_active = 1
  `)
    .bind(store.id)
    .first<{ count: number }>();

  return new Response(
    JSON.stringify({
      today_pos_sales: salesSummary?.total_sales || 0,
      today_pos_invoices: salesSummary?.invoice_count || 0,
      today_online_orders: onlineOrdersToday?.count || 0,
      today_online_sales: onlineOrdersToday?.total || 0,
      pending_orders_count: pendingOrdersRes?.count || 0,
      low_stock_count: lowStockRes?.count || 0,
      total_products_count: totalProductsRes?.count || 0,
      last_sync_at: store.last_sync_at,
      is_paused: store.is_paused,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardGetOrders(
  _request: Request,
  url: URL,
  env: Env,
  store: Store
): Promise<Response> {
  const status = url.searchParams.get('status');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  let sql = 'SELECT * FROM orders WHERE store_id = ?';
  const bindings: any[] = [store.id];

  if (status) {
    sql += ' AND status = ?';
    bindings.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const ordersRes = await env.DB.prepare(sql).bind(...bindings).all<Order>();
  const orders = ordersRes.results || [];
  const enrichedOrders = [];

  for (const order of orders) {
    const itemsRes = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?')
      .bind(order.id)
      .all<OrderItem>();

    enrichedOrders.push({
      ...order,
      status_history: order.status_history ? JSON.parse(order.status_history) : [],
      items: itemsRes.results || [],
    });
  }

  return new Response(
    JSON.stringify({ orders: enrichedOrders, count: enrichedOrders.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardUpdateOrderStatus(
  request: Request,
  orderId: string,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as { status: Order['status']; rejection_reason?: string };

  if (!body.status) {
    return new Response(JSON.stringify({ error: 'الحالة مطلوبة' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existing = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?')
    .bind(orderId, store.id)
    .first<Order>();

  if (!existing) {
    return new Response(JSON.stringify({ error: 'الطلب غير موجود' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const history = existing.status_history ? JSON.parse(existing.status_history) : [];
  history.push({ status: body.status, at: now, reason: body.rejection_reason || undefined });

  await env.DB.prepare(`
    UPDATE orders
    SET status = ?, rejection_reason = ?, status_history = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `)
    .bind(
      body.status,
      body.rejection_reason || null,
      JSON.stringify(history),
      now,
      orderId,
      store.id
    )
    .run();

  return new Response(
    JSON.stringify({ success: true, order_id: orderId, status: body.status }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardGetProducts(
  _request: Request,
  url: URL,
  env: Env,
  store: Store
): Promise<Response> {
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
  const offset = (page - 1) * limit;

  let sql = 'SELECT * FROM products WHERE store_id = ? AND is_active = 1';
  const bindings: any[] = [store.id];

  if (categoryId) {
    sql += ' AND category_id = ?';
    bindings.push(categoryId);
  }
  if (search && search.trim().length > 0) {
    sql += ' AND (name LIKE ? OR barcode LIKE ?)';
    bindings.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  sql += ' ORDER BY is_featured DESC, sort_order ASC, name ASC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const query = await env.DB.prepare(sql).bind(...bindings).all<Product>();

  const products = (query.results || []).map(p => ({
    ...p,
    image_urls: p.image_urls ? JSON.parse(p.image_urls) : [],
  }));

  return new Response(JSON.stringify({ products }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleDashboardUpdateProductOnlineSettings(
  request: Request,
  productId: string,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    is_online?: number;
    is_featured?: number;
    description?: string;
    image_urls?: string[];
  };

  const now = new Date().toISOString();
  const imageUrlsJson = body.image_urls ? JSON.stringify(body.image_urls) : undefined;

  let sql = 'UPDATE products SET updated_at = ?';
  const bindings: any[] = [now];

  if (body.is_online !== undefined) {
    sql += ', is_online = ?';
    bindings.push(body.is_online ? 1 : 0);
  }
  if (body.is_featured !== undefined) {
    sql += ', is_featured = ?';
    bindings.push(body.is_featured ? 1 : 0);
  }
  if (body.description !== undefined) {
    sql += ', description = ?';
    bindings.push(body.description || null);
  }
  if (imageUrlsJson !== undefined) {
    sql += ', image_urls = ?';
    bindings.push(imageUrlsJson);
  }

  sql += ' WHERE id = ? AND store_id = ?';
  bindings.push(productId, store.id);

  await env.DB.prepare(sql).bind(...bindings).run();

  return new Response(JSON.stringify({ success: true, product_id: productId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleDashboardUpdateStoreSettings(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    working_hours?: object;
    welcome_message?: string;
    min_order_amount?: number;
    delivery_zones?: object[];
    is_paused?: number;
    pause_message?: string;
  };

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE stores SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      whatsapp = COALESCE(?, whatsapp),
      address = COALESCE(?, address),
      working_hours = COALESCE(?, working_hours),
      welcome_message = COALESCE(?, welcome_message),
      min_order_amount = COALESCE(?, min_order_amount),
      delivery_zones = COALESCE(?, delivery_zones),
      is_paused = COALESCE(?, is_paused),
      pause_message = COALESCE(?, pause_message),
      updated_at = ?
    WHERE id = ?
  `)
    .bind(
      body.name || null,
      body.phone || null,
      body.whatsapp || null,
      body.address || null,
      body.working_hours ? JSON.stringify(body.working_hours) : null,
      body.welcome_message || null,
      body.min_order_amount !== undefined ? Math.round(body.min_order_amount) : null,
      body.delivery_zones ? JSON.stringify(body.delivery_zones) : null,
      body.is_paused !== undefined ? (body.is_paused ? 1 : 0) : null,
      body.pause_message || null,
      now,
      store.id
    )
    .run();

  return new Response(JSON.stringify({ success: true, message: 'تم تحديث الإعدادات بنجاح' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleDashboardUpdateStoreTheme(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    theme_preset?: string;
    theme_custom?: object;
  };

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE stores SET
      theme_preset = COALESCE(?, theme_preset),
      theme_custom = COALESCE(?, theme_custom),
      updated_at = ?
    WHERE id = ?
  `)
    .bind(
      body.theme_preset || null,
      body.theme_custom ? JSON.stringify(body.theme_custom) : null,
      now,
      store.id
    )
    .run();

  return new Response(JSON.stringify({ success: true, message: 'تم حفظ الثيم بنجاح' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
