import type { Env, Store, SyncCatalogPayload, SyncStockPayload, Order, OrderItem } from '../types.ts';
import { generateUUID } from '../crypto.ts';

export async function handleSyncCatalog(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const payload = (await request.json()) as SyncCatalogPayload;
  const now = new Date().toISOString();
  let categoriesCount = 0;
  let productsCount = 0;

  // Process categories
  if (Array.isArray(payload.categories) && payload.categories.length > 0) {
    for (const cat of payload.categories) {
      if (!cat.id || !cat.name) continue;
      await env.DB.prepare(`
        INSERT INTO categories (id, store_id, name, parent_id, sort_order, is_active, is_online, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          parent_id = excluded.parent_id,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active,
          is_online = excluded.is_online,
          updated_at = excluded.updated_at
        WHERE store_id = ?
      `)
        .bind(
          cat.id,
          store.id,
          cat.name,
          cat.parent_id || null,
          cat.sort_order ?? 0,
          cat.is_active ?? 1,
          cat.is_online ?? 1,
          now,
          now,
          store.id
        )
        .run();
      categoriesCount++;
    }
  }

  // Process products
  if (Array.isArray(payload.products) && payload.products.length > 0) {
    for (const prod of payload.products) {
      if (!prod.id || !prod.name) continue;
      const imageUrlsJson = prod.image_urls ? JSON.stringify(prod.image_urls) : null;
      await env.DB.prepare(`
        INSERT INTO products (
          id, store_id, category_id, name, description, barcode, sku,
          price_piasters, compare_price, cost_piasters, unit_name, tax_rate,
          stock_quantity, low_stock_threshold, is_active, is_online, is_featured,
          sort_order, image_urls, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id,
          name = excluded.name,
          description = COALESCE(excluded.description, products.description),
          barcode = excluded.barcode,
          sku = excluded.sku,
          price_piasters = excluded.price_piasters,
          compare_price = excluded.compare_price,
          cost_piasters = excluded.cost_piasters,
          unit_name = excluded.unit_name,
          tax_rate = excluded.tax_rate,
          stock_quantity = excluded.stock_quantity,
          low_stock_threshold = excluded.low_stock_threshold,
          is_active = excluded.is_active,
          is_online = excluded.is_online,
          is_featured = excluded.is_featured,
          sort_order = excluded.sort_order,
          image_urls = COALESCE(excluded.image_urls, products.image_urls),
          updated_at = excluded.updated_at
        WHERE store_id = ?
      `)
        .bind(
          prod.id,
          store.id,
          prod.category_id || null,
          prod.name,
          prod.description || null,
          prod.barcode || null,
          prod.sku || null,
          Math.round(prod.price_piasters),
          prod.compare_price ? Math.round(prod.compare_price) : null,
          prod.cost_piasters ? Math.round(prod.cost_piasters) : null,
          prod.unit_name || 'قطعة',
          prod.tax_rate ?? 0,
          Math.round(prod.stock_quantity),
          Math.round(prod.low_stock_threshold ?? 0),
          prod.is_active ?? 1,
          prod.is_online ?? 1,
          prod.is_featured ?? 0,
          prod.sort_order ?? 0,
          imageUrlsJson,
          now,
          now,
          store.id
        )
        .run();
      productsCount++;
    }
  }

  // Update store last_sync_at & increment sync_version
  await env.DB.prepare(
    'UPDATE stores SET sync_version = sync_version + 1, last_sync_at = ?, updated_at = ? WHERE id = ?'
  )
    .bind(now, now, store.id)
    .run();

  // Audit sync log
  await env.DB.prepare(`
    INSERT INTO sync_log (id, store_id, sync_type, direction, records_count, status, created_at)
    VALUES (?, ?, 'catalog', 'up', ?, 'success', ?)
  `)
    .bind(generateUUID(), store.id, categoriesCount + productsCount, now)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      processed_categories: categoriesCount,
      processed_products: productsCount,
      synced_at: now,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleSyncStock(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const payload = (await request.json()) as SyncStockPayload;
  const now = new Date().toISOString();
  let updatedCount = 0;

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    for (const item of payload.items) {
      if (!item.product_id) continue;
      await env.DB.prepare(`
        UPDATE products
        SET stock_quantity = ?, updated_at = ?
        WHERE id = ? AND store_id = ?
      `)
        .bind(Math.round(item.stock_quantity), now, item.product_id, store.id)
        .run();
      updatedCount++;
    }
  }

  await env.DB.prepare('UPDATE stores SET last_sync_at = ? WHERE id = ?')
    .bind(now, store.id)
    .run();

  return new Response(
    JSON.stringify({ success: true, updated_count: updatedCount, synced_at: now }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleSyncSalesSummary(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as any;
  const now = new Date().toISOString();

  if (!body.summary_date || body.total_sales === undefined) {
    return new Response(JSON.stringify({ error: 'Missing summary_date or total_sales' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = generateUUID();
  await env.DB.prepare(`
    INSERT INTO daily_sales_summaries (
      id, store_id, summary_date, total_sales, invoice_count, avg_invoice,
      cash_total, card_total, credit_total, returns_count, returns_total,
      hourly_breakdown, top_products, synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, summary_date) DO UPDATE SET
      total_sales = excluded.total_sales,
      invoice_count = excluded.invoice_count,
      avg_invoice = excluded.avg_invoice,
      cash_total = excluded.cash_total,
      card_total = excluded.card_total,
      credit_total = excluded.credit_total,
      returns_count = excluded.returns_count,
      returns_total = excluded.returns_total,
      hourly_breakdown = excluded.hourly_breakdown,
      top_products = excluded.top_products,
      synced_at = excluded.synced_at
  `)
    .bind(
      id,
      store.id,
      body.summary_date,
      Math.round(body.total_sales),
      body.invoice_count || 0,
      Math.round(body.avg_invoice || 0),
      Math.round(body.cash_total || 0),
      Math.round(body.card_total || 0),
      Math.round(body.credit_total || 0),
      body.returns_count || 0,
      Math.round(body.returns_total || 0),
      body.hourly_breakdown ? JSON.stringify(body.hourly_breakdown) : null,
      body.top_products ? JSON.stringify(body.top_products) : null,
      now
    )
    .run();

  return new Response(
    JSON.stringify({ success: true, summary_date: body.summary_date, synced_at: now }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleGetPendingOrders(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  // Query pending / unsynced orders for this store
  const ordersQuery = await env.DB.prepare(`
    SELECT * FROM orders
    WHERE store_id = ? AND synced_to_pos = 0
    ORDER BY order_number ASC
  `)
    .bind(store.id)
    .all<Order>();

  const orders = ordersQuery.results || [];
  const enrichedOrders = [];

  for (const order of orders) {
    const itemsQuery = await env.DB.prepare(`
      SELECT * FROM order_items WHERE order_id = ?
    `)
      .bind(order.id)
      .all<OrderItem>();

    enrichedOrders.push({
      ...order,
      items: itemsQuery.results || [],
    });
  }

  // Mark them as synced to POS
  if (orders.length > 0) {
    const ids = orders.map(o => `'${o.id}'`).join(',');
    await env.DB.prepare(`UPDATE orders SET synced_to_pos = 1 WHERE id IN (${ids})`).run();
  }

  return new Response(
    JSON.stringify({ orders: enrichedOrders, count: enrichedOrders.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleUpdateOrdersStatus(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    order_id: string;
    status: Order['status'];
    rejection_reason?: string;
    pos_invoice_id?: string;
  };

  if (!body.order_id || !body.status) {
    return new Response(JSON.stringify({ error: 'Missing order_id or status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE orders
    SET status = ?, rejection_reason = ?, pos_invoice_id = COALESCE(?, pos_invoice_id), updated_at = ?
    WHERE id = ? AND store_id = ?
  `)
    .bind(
      body.status,
      body.rejection_reason || null,
      body.pos_invoice_id || null,
      now,
      body.order_id,
      store.id
    )
    .run();

  return new Response(
    JSON.stringify({ success: true, order_id: body.order_id, status: body.status }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleGetSettings(
  _request: Request,
  _env: Env,
  store: Store
): Promise<Response> {
  return new Response(
    JSON.stringify({
      store_id: store.id,
      name: store.name,
      slug: store.slug,
      theme_preset: store.theme_preset,
      theme_custom: store.theme_custom ? JSON.parse(store.theme_custom) : null,
      working_hours: store.working_hours ? JSON.parse(store.working_hours) : null,
      delivery_zones: store.delivery_zones ? JSON.parse(store.delivery_zones) : null,
      min_order_amount: store.min_order_amount,
      is_paused: store.is_paused,
      pause_message: store.pause_message,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleHeartbeat(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE stores SET last_sync_at = ? WHERE id = ?')
    .bind(now, store.id)
    .run();

  return new Response(
    JSON.stringify({ status: 'ok', store_id: store.id, server_time: now }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
