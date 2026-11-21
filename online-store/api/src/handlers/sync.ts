import type { Env, Store, SyncCatalogPayload, SyncCatalogPrunePayload, SyncStockPayload, Order, OrderItem } from '../types.ts';
import { generateUUID } from '../crypto.ts';
import { notifyStoreRealtime } from '../realtime.ts';
import { formatUnitArabic } from '../units.ts';

const D1_BATCH_CHUNK_SIZE = 50;

async function runD1Batch(db: D1Database, statements: D1PreparedStatement[]): Promise<any[]> {
  if (statements.length === 0) return [];
  const allResults: any[] = [];
  for (let i = 0; i < statements.length; i += D1_BATCH_CHUNK_SIZE) {
    const chunk = statements.slice(i, i + D1_BATCH_CHUNK_SIZE);
    if (typeof db.batch === 'function') {
      const res = await db.batch(chunk);
      allResults.push(...res);
    } else {
      for (const stmt of chunk) {
        allResults.push(await stmt.run());
      }
    }
  }
  return allResults;
}

/**
 * Removes out-of-stock / inactive / offline products from Cloud D1 to keep storage small
 * and the storefront clutter-free. Products referenced by historical order_items are safely
 * soft-hidden (stock_quantity = 0, is_online = 0) instead of deleted to preserve FK integrity.
 */
async function removeOrHideProducts(
  env: Env,
  storeId: string,
  rawIds: string[],
  now: string
): Promise<{ deleted: number; hidden: number }> {
  const uniqueIds = Array.from(new Set(rawIds.filter(id => typeof id === 'string' && id.trim().length > 0)));
  if (uniqueIds.length === 0) {
    return { deleted: 0, hidden: 0 };
  }

  const refQuery = await env.DB.prepare(`
    SELECT DISTINCT oi.product_id
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = ?
  `)
    .bind(storeId)
    .all<{ product_id: string }>();

  const referencedSet = new Set<string>((refQuery.results || []).map(r => r.product_id));
  const deleteStmts: D1PreparedStatement[] = [];
  const hideStmts: D1PreparedStatement[] = [];

  for (const prodId of uniqueIds) {
    if (referencedSet.has(prodId)) {
      hideStmts.push(
        env.DB.prepare(`
          UPDATE products
          SET stock_quantity = 0, is_online = 0, updated_at = ?
          WHERE id = ? AND store_id = ?
        `).bind(now, prodId, storeId)
      );
    } else {
      deleteStmts.push(
        env.DB.prepare(`DELETE FROM products WHERE id = ? AND store_id = ?`).bind(prodId, storeId)
      );
    }
  }

  let deleted = 0;
  let hidden = 0;

  if (deleteStmts.length > 0) {
    const delResults = await runD1Batch(env.DB, deleteStmts);
    for (const r of delResults) {
      deleted += Number(r?.meta?.changes ?? 0);
    }
  }
  if (hideStmts.length > 0) {
    const hideResults = await runD1Batch(env.DB, hideStmts);
    for (const r of hideResults) {
      hidden += Number(r?.meta?.changes ?? 0);
    }
  }

  return { deleted, hidden };
}

export async function handleSyncCatalog(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const payload = (await request.json()) as SyncCatalogPayload;
  const now = new Date().toISOString();
  let categoriesCount = 0;
  let productsCount = 0;
  const writeStmts: D1PreparedStatement[] = [];
  const idsToRemove: string[] = Array.isArray(payload.remove_product_ids)
    ? [...payload.remove_product_ids]
    : [];

  // Process categories in batch
  if (Array.isArray(payload.categories) && payload.categories.length > 0) {
    for (const cat of payload.categories) {
      if (!cat.id || !cat.name) continue;
      writeStmts.push(
        env.DB.prepare(`
          INSERT INTO categories (id, store_id, name, parent_id, sort_order, is_active, is_online, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            parent_id = excluded.parent_id,
            sort_order = excluded.sort_order,
            is_active = excluded.is_active,
            is_online = categories.is_online,
            updated_at = excluded.updated_at
          WHERE store_id = ?
        `).bind(
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
      );
      categoriesCount++;
    }
  }

  // Process products in batch — never store out-of-stock / inactive / offline clutter
  if (Array.isArray(payload.products) && payload.products.length > 0) {
    for (const prod of payload.products) {
      if (!prod.id || !prod.name) continue;
      const stockQty = Math.round(prod.stock_quantity ?? 0);
      const isActive = prod.is_active ?? 1;
      const isOnline = prod.is_online ?? 1;

      if (stockQty <= 0 || isActive !== 1 || isOnline !== 1) {
        idsToRemove.push(prod.id);
        continue;
      }

      const imageUrlsJson = prod.image_urls ? JSON.stringify(prod.image_urls) : null;
      writeStmts.push(
        env.DB.prepare(`
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
            is_online = CASE WHEN products.stock_quantity <= 0 AND excluded.stock_quantity > 0 THEN 1 ELSE products.is_online END,
            is_featured = products.is_featured,
            sort_order = excluded.sort_order,
            image_urls = COALESCE(excluded.image_urls, products.image_urls),
            updated_at = excluded.updated_at
          WHERE store_id = ?
        `).bind(
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
          formatUnitArabic(prod.unit_name),
          prod.tax_rate ?? 0,
          stockQty,
          Math.round(prod.low_stock_threshold ?? 0),
          1,
          1,
          prod.is_featured ?? 0,
          prod.sort_order ?? 0,
          imageUrlsJson,
          now,
          now,
          store.id
        )
      );
      productsCount++;
    }
  }

  // Execute all category & product upserts in atomic D1 batches
  await runD1Batch(env.DB, writeStmts);

  // Remove or hide any out-of-stock / inactive / explicitly removed products
  const removed = await removeOrHideProducts(env, store.id, idsToRemove, now);
  const removedTotal = removed.deleted + removed.hidden;

  // Update store metadata & audit sync log in a single batch
  await runD1Batch(env.DB, [
    env.DB.prepare(
      'UPDATE stores SET sync_version = sync_version + 1, last_sync_at = ?, updated_at = ? WHERE id = ?'
    ).bind(now, now, store.id),
    env.DB.prepare(`
      INSERT INTO sync_log (id, store_id, sync_type, direction, records_count, status, created_at)
      VALUES (?, ?, 'catalog', 'up', ?, 'success', ?)
    `).bind(generateUUID(), store.id, categoriesCount + productsCount, now),
  ]);

  return new Response(
    JSON.stringify({
      success: true,
      processed_categories: categoriesCount,
      processed_products: productsCount,
      removed_products: removedTotal,
      deleted_products: removed.deleted,
      hidden_products: removed.hidden,
      synced_at: now,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handlePruneCatalog(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const payload = (await request.json()) as SyncCatalogPrunePayload;
  if (!payload || !Array.isArray(payload.keep_product_ids)) {
    return new Response(JSON.stringify({ error: 'keep_product_ids array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const keepSet = new Set<string>(payload.keep_product_ids.filter(id => typeof id === 'string' && id.length > 0));

  const existingQuery = await env.DB.prepare(
    'SELECT id, stock_quantity, is_online FROM products WHERE store_id = ?'
  )
    .bind(store.id)
    .all<{ id: string; stock_quantity: number; is_online: number }>();

  const staleIds: string[] = [];
  for (const row of existingQuery.results || []) {
    if (!keepSet.has(row.id)) {
      staleIds.push(row.id);
    }
  }

  const pruned = await removeOrHideProducts(env, store.id, staleIds, now);
  const totalPruned = pruned.deleted + pruned.hidden;

  await env.DB.prepare('UPDATE stores SET last_sync_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, store.id)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      deleted_count: pruned.deleted,
      hidden_count: pruned.hidden,
      total_pruned: totalPruned,
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

  const inStockItems: Array<{ product_id: string; stock_quantity: number }> = [];
  const idsToRemove: string[] = Array.isArray(payload.remove_product_ids)
    ? [...payload.remove_product_ids]
    : [];

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    for (const item of payload.items) {
      if (!item.product_id) continue;
      const qty = Math.round(item.stock_quantity ?? 0);
      if (qty <= 0) {
        idsToRemove.push(item.product_id);
      } else {
        inStockItems.push({ product_id: item.product_id, stock_quantity: qty });
      }
    }
  }

  const missingProductIds: string[] = [];
  if (inStockItems.length > 0) {
    const updateStmts = inStockItems.map(item =>
      env.DB.prepare(`
        UPDATE products
        SET stock_quantity = ?,
            is_online = CASE WHEN stock_quantity <= 0 THEN 1 ELSE is_online END,
            updated_at = ?
        WHERE id = ? AND store_id = ? AND is_active = 1
      `).bind(item.stock_quantity, now, item.product_id, store.id)
    );

    const results = await runD1Batch(env.DB, updateStmts);
    for (let i = 0; i < inStockItems.length; i++) {
      const changes = Number(results[i]?.meta?.changes ?? 0);
      if (changes > 0) {
        updatedCount++;
      } else {
        missingProductIds.push(inStockItems[i].product_id);
      }
    }
  }

  const removed = await removeOrHideProducts(env, store.id, idsToRemove, now);
  const removedCount = removed.deleted + removed.hidden;

  await env.DB.prepare('UPDATE stores SET last_sync_at = ? WHERE id = ?')
    .bind(now, store.id)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      updated_count: updatedCount,
      removed_count: removedCount,
      missing_product_ids: missingProductIds,
      synced_at: now,
    }),
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

  // Support both batch { summaries: [...] } (fast 1-request 30-day backfill) and legacy single object
  const summaries: any[] = Array.isArray(body?.summaries) ? body.summaries : [body];
  const validSummaries = summaries.filter(
    item => item && typeof item.summary_date === 'string' && item.summary_date.length > 0 && item.total_sales !== undefined
  );

  if (validSummaries.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing summary_date or total_sales' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stmts = validSummaries.map(item => {
    const id = generateUUID();
    const metricsJson = item.metrics ? JSON.stringify(item.metrics) : null;
    return env.DB.prepare(`
      INSERT INTO daily_sales_summaries (
        id, store_id, summary_date, total_sales, invoice_count, avg_invoice,
        cash_total, card_total, credit_total, returns_count, returns_total,
        hourly_breakdown, top_products, metrics_json, synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        metrics_json = COALESCE(excluded.metrics_json, daily_sales_summaries.metrics_json),
        synced_at = excluded.synced_at
    `).bind(
      id,
      store.id,
      item.summary_date,
      Math.round(item.total_sales),
      item.invoice_count || 0,
      Math.round(item.avg_invoice || 0),
      Math.round(item.cash_total || 0),
      Math.round(item.card_total || 0),
      Math.round(item.credit_total || 0),
      item.returns_count || 0,
      Math.round(item.returns_total || 0),
      item.hourly_breakdown ? JSON.stringify(item.hourly_breakdown) : null,
      item.top_products ? JSON.stringify(item.top_products) : null,
      metricsJson,
      now
    );
  });

  await runD1Batch(env.DB, stmts);

  return new Response(
    JSON.stringify({
      success: true,
      summary_date: validSummaries[validSummaries.length - 1].summary_date,
      processed_count: validSummaries.length,
      synced_at: now,
    }),
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

  // Mark them as synced to POS using parameterized placeholders (strict SQL hygiene & tenant isolation)
  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(',');
    const orderIds = orders.map(o => o.id);
    await env.DB.prepare(
      `UPDATE orders SET synced_to_pos = 1 WHERE store_id = ? AND id IN (${placeholders})`
    )
      .bind(store.id, ...orderIds)
      .run();
  }

  return new Response(
    JSON.stringify({ orders: enrichedOrders, count: enrichedOrders.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

const ALLOWED_ORDER_STATUSES = new Set<Order['status']>([
  'new',
  'viewed',
  'accepted',
  'preparing',
  'ready',
  'delivered',
  'rejected',
  'cancelled',
]);

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

  if (!ALLOWED_ORDER_STATUSES.has(body.status)) {
    return new Response(JSON.stringify({ error: 'Invalid order status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existing = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?')
    .bind(body.order_id, store.id)
    .first<Order>();

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  let history: Array<{ status: string; at: string; reason?: string }> = [];
  try {
    history = existing.status_history ? JSON.parse(existing.status_history) : [];
  } catch {
    history = [];
  }
  if (existing.status !== body.status) {
    history.push({ status: body.status, at: now, reason: body.rejection_reason || undefined });
  }

  // Restore reserved cloud stock if transitioning into rejected/cancelled from an active order
  const wasActive = existing.status !== 'rejected' && existing.status !== 'cancelled';
  const nowCancelled = body.status === 'rejected' || body.status === 'cancelled';
  if (wasActive && nowCancelled) {
    const itemsRes = await env.DB.prepare(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?'
    )
      .bind(body.order_id)
      .all<{ product_id: string; quantity: number }>();

    for (const item of itemsRes.results || []) {
      await env.DB.prepare(
        'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND store_id = ?'
      )
        .bind(Math.round(item.quantity), now, item.product_id, store.id)
        .run();
    }
  }

  await env.DB.prepare(`
    UPDATE orders
    SET status = ?, rejection_reason = ?, pos_invoice_id = COALESCE(?, pos_invoice_id), status_history = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `)
    .bind(
      body.status,
      body.rejection_reason || null,
      body.pos_invoice_id || null,
      JSON.stringify(history),
      now,
      body.order_id,
      store.id
    )
    .run();

  // Notify Owner Web/Mobile Dashboard immediately (< 200ms)
  await notifyStoreRealtime(env, store.id, {
    type: 'order_status_updated',
    source: 'pos',
    orderId: body.order_id,
    status: body.status,
    at: now,
  });

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

const MAX_STORE_LOGO_BYTES = 1200 * 1024; // 1.2 MB ceiling for true-color shop logo
const LOGO_DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

function decodeBase64Bytes(base64: string): ArrayBuffer {
  const cleaned = base64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function ensureStoreColumns(db: D1Database): Promise<void> {
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN vodafone_cash_phone TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN vodafone_cash_name TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN vodafone_cash_provider TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN instapay_handle TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN instapay_name TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN digital_accounts TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN accept_vodafone_cash INTEGER NOT NULL DEFAULT 1').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE stores ADD COLUMN accept_instapay INTEGER NOT NULL DEFAULT 1').run();
  } catch {}
}

/**
 * Synchronizes the shop's real Desktop POS identity (store_name, store_phone, store_address,
 * digital wallets, InstaPay accounts, and original full-color receipt logo)
 * to Cloud D1 + R2/KV image storage.
 */
export async function handleSyncStoreProfile(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    name?: string;
    phone?: string | null;
    address?: string | null;
    vodafone_cash_phone?: string | null;
    vodafone_cash_name?: string | null;
    vodafone_cash_provider?: string | null;
    instapay_handle?: string | null;
    instapay_name?: string | null;
    digital_accounts?: any[] | null;
    logo_data_url?: string | null;
    clear_logo?: boolean;
  };

  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid store profile payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const nextName =
    typeof body.name === 'string' && body.name.trim().length > 0
      ? body.name.trim().slice(0, 120)
      : store.name;
  const nextPhone =
    typeof body.phone === 'string' && body.phone.trim().length > 0
      ? body.phone.trim().slice(0, 40)
      : store.phone;
  const nextAddress =
    typeof body.address === 'string' && body.address.trim().length > 0
      ? body.address.trim().slice(0, 300)
      : store.address;
  const nextVodafone =
    typeof body.vodafone_cash_phone === 'string'
      ? body.vodafone_cash_phone.trim().slice(0, 40)
      : store.vodafone_cash_phone ?? null;
  const nextVodafoneName =
    typeof body.vodafone_cash_name === 'string'
      ? body.vodafone_cash_name.trim().slice(0, 80)
      : store.vodafone_cash_name ?? null;
  const nextVodafoneProvider =
    typeof body.vodafone_cash_provider === 'string'
      ? body.vodafone_cash_provider.trim().slice(0, 40)
      : store.vodafone_cash_provider ?? 'vodafone_cash';
  const nextInstapay =
    typeof body.instapay_handle === 'string'
      ? body.instapay_handle.trim().slice(0, 80)
      : store.instapay_handle ?? null;
  const nextInstapayName =
    typeof body.instapay_name === 'string'
      ? body.instapay_name.trim().slice(0, 80)
      : store.instapay_name ?? null;
  const nextDigitalAccounts =
    Array.isArray(body.digital_accounts)
      ? JSON.stringify(body.digital_accounts)
      : store.digital_accounts ?? null;

  let nextLogoUrl: string | null = store.logo_url;
  let logoUpdated = false;

  if (body.clear_logo === true) {
    const oldKeys = [`stores/${store.id}/logo.png`, `stores/${store.id}/logo.jpg`, `stores/${store.id}/logo.webp`];
    for (const key of oldKeys) {
      if (env.IMAGES) {
        try { await env.IMAGES.delete(key); } catch {}
      }
      if (env.PRODUCT_IMAGES_KV) {
        try { await env.PRODUCT_IMAGES_KV.delete(key); } catch {}
      }
    }
    nextLogoUrl = null;
    logoUpdated = true;
  } else if (typeof body.logo_data_url === 'string' && body.logo_data_url.trim().length > 0) {
    const match = LOGO_DATA_URL_RE.exec(body.logo_data_url.trim());
    if (!match) {
      return new Response(JSON.stringify({ error: 'Invalid logo image format (expected PNG, JPEG, or WebP base64 data URL)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawMime = match[1].toLowerCase();
    const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const bytes = decodeBase64Bytes(match[2]);

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_STORE_LOGO_BYTES) {
      return new Response(JSON.stringify({ error: 'Store logo exceeds maximum size (1.2 MB)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (env.IMAGES || env.PRODUCT_IMAGES_KV) {
      const objectKey = `stores/${store.id}/logo.${ext}`;
      if (env.IMAGES) {
        await env.IMAGES.put(objectKey, bytes, {
          httpMetadata: {
            contentType: mimeType,
            cacheControl: 'public, max-age=86400',
          },
        });
      } else if (env.PRODUCT_IMAGES_KV) {
        await env.PRODUCT_IMAGES_KV.put(objectKey, bytes, {
          metadata: { contentType: mimeType },
        });
      }
      const origin = new URL(request.url).origin;
      nextLogoUrl = `${origin}/api/v1/images/${objectKey}?v=${Date.now()}`;
      logoUpdated = true;
    }
  }

  await ensureStoreColumns(env.DB);

  const hasVodafone = Boolean(nextVodafone && nextVodafone.trim().length > 0);
  const hasInstapay = Boolean(nextInstapay && nextInstapay.trim().length > 0);

  await env.DB.prepare(`
    UPDATE stores
    SET name = ?, phone = ?, address = ?, logo_url = ?,
        vodafone_cash_phone = ?, vodafone_cash_name = ?, vodafone_cash_provider = ?,
        instapay_handle = ?, instapay_name = ?,
        digital_accounts = ?,
        accept_vodafone_cash = ?, accept_instapay = ?,
        updated_at = ?
    WHERE id = ?
  `)
    .bind(
      nextName,
      nextPhone ?? null,
      nextAddress ?? null,
      nextLogoUrl ?? null,
      nextVodafone || null,
      nextVodafoneName || null,
      nextVodafoneProvider || 'vodafone_cash',
      nextInstapay || null,
      nextInstapayName || null,
      nextDigitalAccounts || null,
      hasVodafone ? 1 : 0,
      hasInstapay ? 1 : 0,
      now,
      store.id
    )
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      name: nextName,
      phone: nextPhone ?? null,
      address: nextAddress ?? null,
      vodafone_cash_phone: nextVodafone || null,
      vodafone_cash_name: nextVodafoneName || null,
      vodafone_cash_provider: nextVodafoneProvider || 'vodafone_cash',
      instapay_handle: nextInstapay || null,
      instapay_name: nextInstapayName || null,
      digital_accounts: nextDigitalAccounts ? JSON.parse(nextDigitalAccounts) : [],
      logo_url: nextLogoUrl ?? null,
      logo_updated: logoUpdated,
      synced_at: now,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handlePurgeStoreOrders(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const now = new Date().toISOString();

  const itemsRes = await env.DB.prepare(`
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE store_id = ?)
  `)
    .bind(store.id)
    .run();

  const ordersRes = await env.DB.prepare(`
    DELETE FROM orders
    WHERE store_id = ?
  `)
    .bind(store.id)
    .run();

  try {
    await env.DB.prepare(`
      DELETE FROM sync_log
      WHERE store_id = ? AND sync_type IN ('order', 'order_status')
    `)
      .bind(store.id)
      .run();
  } catch {}

  await env.DB.prepare('UPDATE stores SET sync_version = sync_version + 1, last_sync_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, store.id)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      deleted_orders: ordersRes?.meta?.changes ?? 0,
      deleted_items: itemsRes?.meta?.changes ?? 0,
      purged_at: now,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handlePurgeCatalog(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(`
      DELETE FROM order_items
      WHERE order_id IN (SELECT id FROM orders WHERE store_id = ?)
    `)
      .bind(store.id)
      .run();
  } catch {}

  const prodRes = await env.DB.prepare('DELETE FROM products WHERE store_id = ?')
    .bind(store.id)
    .run();

  const catRes = await env.DB.prepare('DELETE FROM categories WHERE store_id = ?')
    .bind(store.id)
    .run();

  await env.DB.prepare('UPDATE stores SET sync_version = sync_version + 1, last_sync_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, store.id)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      deleted_products: prodRes?.meta?.changes ?? 0,
      deleted_categories: catRes?.meta?.changes ?? 0,
      purged_at: now,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleGetCatalogUpdates(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const query = await env.DB.prepare(`
    SELECT id, description, is_online, is_featured, image_urls, updated_at
    FROM products
    WHERE store_id = ? AND (
      (description IS NOT NULL AND description != '')
      OR (image_urls IS NOT NULL AND image_urls != '[]' AND image_urls != '')
      OR is_featured = 1
      OR is_online = 0
    )
    ORDER BY updated_at DESC
    LIMIT 3000
  `)
    .bind(store.id)
    .all<{
      id: string;
      description: string | null;
      is_online: number;
      is_featured: number;
      image_urls: string | null;
      updated_at: string;
    }>();

  const products = (query.results || []).map(p => ({
    id: p.id,
    description: p.description || null,
    is_online: p.is_online,
    is_featured: p.is_featured,
    image_urls: p.image_urls ? JSON.parse(p.image_urls) : [],
    updated_at: p.updated_at,
  }));

  return new Response(JSON.stringify({ products }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

