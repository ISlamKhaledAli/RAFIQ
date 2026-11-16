import type { Env, Store, Product, Category, CreateOrderPayload, OrderItem } from '../types.ts';
import { generateUUID } from '../crypto.ts';

export async function handleGetStore(slug: string, env: Env): Promise<Response> {
  const store = await env.DB.prepare(
    'SELECT * FROM stores WHERE slug = ?'
  )
    .bind(slug)
    .first<Store>();

  if (!store || store.is_active !== 1) {
    return new Response(JSON.stringify({ error: 'Store not found or inactive' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Public safe store representation
  const publicStore = {
    id: store.id,
    slug: store.slug,
    name: store.name,
    phone: store.phone,
    whatsapp: store.whatsapp,
    address: store.address,
    working_hours: store.working_hours ? JSON.parse(store.working_hours) : null,
    welcome_message: store.welcome_message,
    logo_url: store.logo_url,
    banner_url: store.banner_url,
    theme_preset: store.theme_preset,
    theme_custom: store.theme_custom ? JSON.parse(store.theme_custom) : null,
    min_order_amount: store.min_order_amount,
    delivery_zones: store.delivery_zones ? JSON.parse(store.delivery_zones) : null,
    is_paused: store.is_paused,
    pause_message: store.pause_message,
    store_type: store.store_type,
  };

  return new Response(JSON.stringify({ store: publicStore }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleGetStoreCategories(slug: string, env: Env): Promise<Response> {
  const store = await env.DB.prepare('SELECT id FROM stores WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first<{ id: string }>();

  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = await env.DB.prepare(`
    SELECT id, name, parent_id, image_url, sort_order
    FROM categories
    WHERE store_id = ? AND is_active = 1 AND is_online = 1
    ORDER BY sort_order ASC, name ASC
  `)
    .bind(store.id)
    .all<Category>();

  return new Response(JSON.stringify({ categories: query.results || [] }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleGetStoreProducts(slug: string, url: URL, env: Env): Promise<Response> {
  const store = await env.DB.prepare('SELECT id FROM stores WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first<{ id: string }>();

  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const featured = url.searchParams.get('featured') === '1' || url.searchParams.get('featured') === 'true';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  let sql = `
    SELECT id, category_id, name, description, barcode, sku,
           price_piasters, compare_price, unit_name, tax_rate,
           stock_quantity, is_featured, image_urls
    FROM products
    WHERE store_id = ? AND is_active = 1 AND is_online = 1
  `;
  const bindings: any[] = [store.id];

  if (categoryId) {
    sql += ' AND category_id = ?';
    bindings.push(categoryId);
  }
  if (featured) {
    sql += ' AND is_featured = 1';
  }
  if (search && search.trim().length > 0) {
    sql += ' AND (name LIKE ? OR barcode LIKE ?)';
    bindings.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  // Count query
  const countSql = sql.replace(
    'SELECT id, category_id, name, description, barcode, sku, price_piasters, compare_price, unit_name, tax_rate, stock_quantity, is_featured, image_urls',
    'SELECT COUNT(*) as total'
  );
  const countRes = await env.DB.prepare(countSql).bind(...bindings).first<{ total: number }>();
  const totalCount = countRes?.total || 0;

  // Pagination & ordering
  sql += ' ORDER BY is_featured DESC, sort_order ASC, name ASC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const query = await env.DB.prepare(sql).bind(...bindings).all<Product>();

  const parsedProducts = (query.results || []).map(p => ({
    ...p,
    image_urls: p.image_urls ? JSON.parse(p.image_urls) : [],
    in_stock: p.stock_quantity > 0,
  }));

  return new Response(
    JSON.stringify({
      products: parsedProducts,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleGetStoreProductDetail(
  slug: string,
  productId: string,
  env: Env
): Promise<Response> {
  const store = await env.DB.prepare('SELECT id FROM stores WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first<{ id: string }>();

  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const product = await env.DB.prepare(`
    SELECT id, category_id, name, description, barcode, sku,
           price_piasters, compare_price, unit_name, tax_rate,
           stock_quantity, is_featured, image_urls
    FROM products
    WHERE id = ? AND store_id = ? AND is_active = 1 AND is_online = 1
  `)
    .bind(productId, store.id)
    .first<Product>();

  if (!product) {
    return new Response(JSON.stringify({ error: 'Product not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      product: {
        ...product,
        image_urls: product.image_urls ? JSON.parse(product.image_urls) : [],
        in_stock: product.stock_quantity > 0,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleCreateOrder(
  slug: string,
  request: Request,
  env: Env
): Promise<Response> {
  const store = await env.DB.prepare('SELECT * FROM stores WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first<Store>();

  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (store.is_paused === 1) {
    return new Response(
      JSON.stringify({
        error: store.pause_message || 'المتجر مغلق مؤقتاً ولا يقبل طلبات جديدة في الوقت الحالي',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const payload = (await request.json()) as CreateOrderPayload;

  if (!payload.customer_name || !payload.customer_phone) {
    return new Response(JSON.stringify({ error: 'اسم العميل ورقم الهاتف مطلوبان' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return new Response(JSON.stringify({ error: 'يجب اختيار صنف واحد على الأقل' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Calculate items and validate stock atomically
  let subtotalPiasters = 0;
  const verifiedItems: Array<{
    product_id: string;
    product_name: string;
    product_price: number;
    quantity: number;
    line_total: number;
    notes?: string;
  }> = [];

  for (const item of payload.items) {
    const qtyMilli = Math.round(item.quantity);
    if (qtyMilli <= 0) continue;

    const prod = await env.DB.prepare(`
      SELECT id, name, price_piasters, stock_quantity
      FROM products
      WHERE id = ? AND store_id = ? AND is_active = 1 AND is_online = 1
    `)
      .bind(item.product_id, store.id)
      .first<{ id: string; name: string; price_piasters: number; stock_quantity: number }>();

    if (!prod) {
      return new Response(
        JSON.stringify({ error: `الصنف غير متاح حالياً` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (prod.stock_quantity < qtyMilli) {
      return new Response(
        JSON.stringify({ error: `الكمية المطلوبة من (${prod.name}) غير متوفرة في المخزن` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Integer calculation: line_total = (price_piasters * quantity_milli) / 1000
    const lineTotal = Math.round((prod.price_piasters * qtyMilli) / 1000);
    subtotalPiasters += lineTotal;

    verifiedItems.push({
      product_id: prod.id,
      product_name: prod.name,
      product_price: prod.price_piasters,
      quantity: qtyMilli,
      line_total: lineTotal,
      notes: item.notes,
    });
  }

  if (verifiedItems.length === 0) {
    return new Response(JSON.stringify({ error: 'لا توجد أصناف صالحة في الطلب' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check minimum order amount (in piasters)
  if (store.min_order_amount > 0 && subtotalPiasters < store.min_order_amount) {
    const minPounds = (store.min_order_amount / 100).toFixed(2);
    return new Response(
      JSON.stringify({ error: `الحد الأدنى للطلب هو ${minPounds} ج.م` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Delivery zone fee
  let deliveryFee = 0;
  if (payload.delivery_method === 'delivery' && payload.delivery_zone && store.delivery_zones) {
    try {
      const zones = JSON.parse(store.delivery_zones) as Array<{ name: string; fee: number }>;
      const matchingZone = zones.find(z => z.name === payload.delivery_zone);
      if (matchingZone) {
        deliveryFee = Math.round(matchingZone.fee);
      }
    } catch {
      // ignore parse error, deliveryFee stays 0
    }
  }

  const grandTotalPiasters = subtotalPiasters + deliveryFee;

  // Determine sequential order_number for this store
  const maxOrderRes = await env.DB.prepare(
    'SELECT COALESCE(MAX(order_number), 0) as max_num FROM orders WHERE store_id = ?'
  )
    .bind(store.id)
    .first<{ max_num: number }>();
  const nextOrderNumber = (maxOrderRes?.max_num || 0) + 1;

  const now = new Date().toISOString();
  const orderId = generateUUID();
  const statusHistory = JSON.stringify([{ status: 'new', at: now }]);

  // Atomic insertion & stock reservation
  // Decrement stock in products
  for (const item of verifiedItems) {
    await env.DB.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity - ?, updated_at = ?
      WHERE id = ? AND store_id = ? AND stock_quantity >= ?
    `)
      .bind(item.quantity, now, item.product_id, store.id, item.quantity)
      .run();
  }

  // Insert order
  await env.DB.prepare(`
    INSERT INTO orders (
      id, store_id, order_number, customer_name, customer_phone, customer_address,
      delivery_method, delivery_zone, delivery_fee, subtotal, total, notes,
      status, status_history, synced_to_pos, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 0, ?, ?)
  `)
    .bind(
      orderId,
      store.id,
      nextOrderNumber,
      payload.customer_name.trim(),
      payload.customer_phone.trim(),
      payload.customer_address?.trim() || null,
      payload.delivery_method || 'delivery',
      payload.delivery_zone || null,
      deliveryFee,
      subtotalPiasters,
      grandTotalPiasters,
      payload.notes?.trim() || null,
      statusHistory,
      now,
      now
    )
    .run();

  // Insert order items
  for (const item of verifiedItems) {
    await env.DB.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity, line_total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        generateUUID(),
        orderId,
        item.product_id,
        item.product_name,
        item.product_price,
        item.quantity,
        item.line_total,
        item.notes || null
      )
      .run();
  }

  return new Response(
    JSON.stringify({
      success: true,
      order_id: orderId,
      order_number: nextOrderNumber,
      subtotal: subtotalPiasters,
      delivery_fee: deliveryFee,
      total: grandTotalPiasters,
      status: 'new',
      message: 'تم استلام طلبك بنجاح، سيقوم المحل بمراجعته وتجهيزه فوراً',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleTrackOrder(
  slug: string,
  orderRef: string,
  url: URL,
  env: Env
): Promise<Response> {
  const store = await env.DB.prepare('SELECT id FROM stores WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first<{ id: string }>();

  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const phone = url.searchParams.get('phone');
  if (!phone) {
    return new Response(JSON.stringify({ error: 'رقم الهاتف مطلوب لتتبع الطلب' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find order by UUID or order_number matching phone
  let order: any = null;
  const orderNum = parseInt(orderRef, 10);
  if (!isNaN(orderNum)) {
    order = await env.DB.prepare(`
      SELECT * FROM orders
      WHERE store_id = ? AND order_number = ? AND customer_phone = ?
    `)
      .bind(store.id, orderNum, phone.trim())
      .first<any>();
  }

  if (!order) {
    order = await env.DB.prepare(`
      SELECT * FROM orders
      WHERE store_id = ? AND id = ? AND customer_phone = ?
    `)
      .bind(store.id, orderRef, phone.trim())
      .first<any>();
  }

  if (!order) {
    return new Response(
      JSON.stringify({ error: 'لم يتم العثور على طلب مطابق لرقم الطلب والهاتف' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const items = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?')
    .bind(order.id)
    .all<OrderItem>();

  return new Response(
    JSON.stringify({
      order: {
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        delivery_method: order.delivery_method,
        delivery_zone: order.delivery_zone,
        delivery_fee: order.delivery_fee,
        subtotal: order.subtotal,
        total: order.total,
        status: order.status,
        rejection_reason: order.rejection_reason,
        status_history: order.status_history ? JSON.parse(order.status_history) : [],
        created_at: order.created_at,
        items: items.results || [],
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
