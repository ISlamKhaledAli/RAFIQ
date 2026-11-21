import type { Env, Store, Order, OrderItem, Product } from '../types.ts';
import { sha256Hex, timingSafeEqual, createSessionToken } from '../crypto.ts';
import { checkCloudStoreEntitlement } from '../auth.ts';
import { notifyStoreRealtime } from '../realtime.ts';
import { formatUnitArabic } from '../units.ts';

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
    return new Response(JSON.stringify({ error: 'الترخيص غير موجود أو المتجر الإلكتروني غير مفعّل بعد' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entitlementError = await checkCloudStoreEntitlement(store.slug, env);
  if (entitlementError) {
    return entitlementError;
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

  // Generate 30-day session token (stays logged in on owner's device without repeated prompts)
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const secret = env.APP_SECRET || 'rafiq_default_owner_jwt_secret_key_32bytes!';
  const token = await createSessionToken({ store_id: store.id, role: 'owner', exp }, secret);

  return new Response(
    JSON.stringify({
      success: true,
      token,
      expires_in_days: 30,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        logo_url: store.logo_url,
        license_key: store.license_key,
        theme_preset: store.theme_preset,
        vodafone_cash_phone: store.vodafone_cash_phone ?? null,
        instapay_handle: store.instapay_handle ?? null,
        has_custom_pin: Boolean(store.owner_pin_hash),
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleOwnerChangePin(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as { current_pin?: string; new_pin?: string };
  const currentPin = (body.current_pin || '').trim();
  const newPin = (body.new_pin || '').trim();

  if (!currentPin || !newPin) {
    return new Response(
      JSON.stringify({ error: 'يرجى إدخال الرمز السري الحالي والجديد' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (newPin.length < 4 || newPin.length > 20) {
    return new Response(
      JSON.stringify({ error: 'يجب أن يتكون الرمز السري الجديد من 4 إلى 20 حرفاً أو رقماً' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const currentHash = await sha256Hex(currentPin);
  const expectedHash = store.owner_pin_hash || (await sha256Hex('1234'));

  if (!timingSafeEqual(currentHash, expectedHash)) {
    return new Response(
      JSON.stringify({ error: 'الرمز السري الحالي غير صحيح' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (currentPin === newPin) {
    return new Response(
      JSON.stringify({ error: 'الرمز السري الجديد يجب أن يختلف عن الرمز الحالي' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const newHash = await sha256Hex(newPin);
  const now = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE stores SET owner_pin_hash = ?, updated_at = ? WHERE id = ?'
  )
    .bind(newHash, now, store.id)
    .run();

  // Issue a fresh 30-day session token
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const secret = env.APP_SECRET || 'rafiq_default_owner_jwt_secret_key_32bytes!';
  const token = await createSessionToken({ store_id: store.id, role: 'owner', exp }, secret);

  return new Response(
    JSON.stringify({
      success: true,
      token,
      has_custom_pin: true,
      message: 'تم تغيير الرمز السري للوحة التحكم بنجاح',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface StoredExtendedMetrics {
  gross_profit?: number;
  expenses_total?: number;
  net_profit?: number;
  instapay_total?: number;
  wallet_total?: number;
  card_only_total?: number;
  debt_payments_total?: number;
  discount_total?: number;
  cancelled_count?: number;
  cancelled_total?: number;
  customer_debts_total?: number;
  debtor_customers_count?: number;
  supplier_debts_total?: number;
}

interface DailySummaryRow {
  summary_date: string;
  total_sales: number;
  invoice_count: number;
  avg_invoice: number;
  cash_total: number;
  card_total: number;
  credit_total: number;
  returns_count: number;
  returns_total: number;
  hourly_breakdown: string | null;
  top_products: string | null;
  metrics_json: string | null;
  synced_at: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function handleDashboardOverview(
  _request: Request,
  url: URL,
  env: Env,
  store: Store
): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const rawFrom = (url.searchParams.get('from') || '').trim();
  const rawTo = (url.searchParams.get('to') || '').trim();

  let fromDate = ISO_DATE_RE.test(rawFrom) ? rawFrom : today;
  let toDate = ISO_DATE_RE.test(rawTo) ? rawTo : today;
  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  // Span length in days (inclusive) for exact equal-length previous period comparison
  const spanDays = Math.max(
    1,
    Math.min(
      90,
      Math.round(
        (new Date(`${toDate}T12:00:00Z`).getTime() - new Date(`${fromDate}T12:00:00Z`).getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1
    )
  );
  const prevToDate = shiftIsoDate(fromDate, -1);
  const prevFromDate = shiftIsoDate(fromDate, -spanDays);

  // 1. Fetch ALL synced Desktop POS daily summaries within [fromDate .. toDate]
  const rangeRowsRes = await env.DB.prepare(`
    SELECT summary_date, total_sales, invoice_count, avg_invoice,
           cash_total, card_total, credit_total, returns_count, returns_total,
           hourly_breakdown, top_products, metrics_json, synced_at
    FROM daily_sales_summaries
    WHERE store_id = ? AND summary_date >= ? AND summary_date <= ?
    ORDER BY summary_date ASC
  `)
    .bind(store.id, fromDate, toDate)
    .all<DailySummaryRow>();

  const rangeRows = rangeRowsRes.results || [];

  // Aggregate range KPIs strictly in integer piasters
  let totalSales = 0;
  let invoiceCount = 0;
  let cashTotal = 0;
  let cardTotal = 0;
  let creditTotal = 0;
  let returnsCount = 0;
  let returnsTotal = 0;
  let grossProfit = 0;
  let expensesTotal = 0;
  let netProfit = 0;
  let instapayTotal = 0;
  let walletTotal = 0;
  let cardOnlyTotal = 0;
  let debtPaymentsTotal = 0;
  let discountTotal = 0;
  let cancelledCount = 0;
  let cancelledTotal = 0;

  const hourlyAgg: Record<string, number> = {};
  const topProductsMap = new Map<
    string,
    { id: string; name: string; qty: number; revenue: number; profit: number }
  >();

  for (const row of rangeRows) {
    totalSales += row.total_sales || 0;
    invoiceCount += row.invoice_count || 0;
    cashTotal += row.cash_total || 0;
    cardTotal += row.card_total || 0;
    creditTotal += row.credit_total || 0;
    returnsCount += row.returns_count || 0;
    returnsTotal += row.returns_total || 0;

    const ext = safeParseJson<StoredExtendedMetrics>(row.metrics_json, {});
    grossProfit += Math.round(ext.gross_profit || 0);
    expensesTotal += Math.round(ext.expenses_total || 0);
    netProfit +=
      ext.net_profit !== undefined
        ? Math.round(ext.net_profit)
        : Math.round((ext.gross_profit || 0) - (ext.expenses_total || 0));
    instapayTotal += Math.round(ext.instapay_total || 0);
    walletTotal += Math.round(ext.wallet_total || 0);
    cardOnlyTotal += Math.round(ext.card_only_total || 0);
    debtPaymentsTotal += Math.round(ext.debt_payments_total || 0);
    discountTotal += Math.round(ext.discount_total || 0);
    cancelledCount += Math.round(ext.cancelled_count || 0);
    cancelledTotal += Math.round(ext.cancelled_total || 0);

    const hourly = safeParseJson<Record<string, number>>(row.hourly_breakdown, {});
    for (const [hr, amt] of Object.entries(hourly)) {
      hourlyAgg[hr] = (hourlyAgg[hr] || 0) + Math.round(Number(amt) || 0);
    }

    const tops = safeParseJson<
      Array<{ id: string; name: string; qty: number; revenue?: number; profit?: number }>
    >(row.top_products, []);
    for (const tp of tops) {
      const key = tp.id || tp.name;
      if (!key) continue;
      const existing = topProductsMap.get(key) || {
        id: tp.id || key,
        name: tp.name || 'صنف',
        qty: 0,
        revenue: 0,
        profit: 0,
      };
      existing.qty += Math.round(Number(tp.qty) || 0);
      existing.revenue += Math.round(Number(tp.revenue) || 0);
      existing.profit += Math.round(Number(tp.profit) || 0);
      topProductsMap.set(key, existing);
    }
  }

  // Fallback if old POS synced card_total without instapay/wallet breakdown
  if (cardOnlyTotal === 0 && instapayTotal === 0 && walletTotal === 0 && cardTotal > 0) {
    cardOnlyTotal = cardTotal;
  }

  const netSales = Math.max(0, totalSales - returnsTotal);
  const avgInvoice = invoiceCount > 0 ? Math.round(totalSales / invoiceCount) : 0;
  const topProductsMerged = Array.from(topProductsMap.values())
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
    .slice(0, 8);

  // 2. Previous Equal-Length Period for Growth % Comparison
  const prevAgg = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(total_sales), 0) as total_sales,
      COALESCE(SUM(returns_total), 0) as returns_total,
      COALESCE(SUM(invoice_count), 0) as invoice_count
    FROM daily_sales_summaries
    WHERE store_id = ? AND summary_date >= ? AND summary_date <= ?
  `)
    .bind(store.id, prevFromDate, prevToDate)
    .first<{ total_sales: number; returns_total: number; invoice_count: number }>();

  // 3. Daily Chart History (if viewing single day, return last 14 days for trend context; otherwise return the filtered range up to 31 days)
  const chartHistoryRes =
    spanDays <= 1
      ? await env.DB.prepare(`
          SELECT summary_date, total_sales, invoice_count, avg_invoice,
                 cash_total, card_total, credit_total, returns_count, returns_total, metrics_json
          FROM daily_sales_summaries
          WHERE store_id = ? AND summary_date <= ?
          ORDER BY summary_date DESC
          LIMIT 14
        `)
          .bind(store.id, toDate)
          .all<DailySummaryRow>()
      : await env.DB.prepare(`
          SELECT summary_date, total_sales, invoice_count, avg_invoice,
                 cash_total, card_total, credit_total, returns_count, returns_total, metrics_json
          FROM daily_sales_summaries
          WHERE store_id = ? AND summary_date >= ? AND summary_date <= ?
          ORDER BY summary_date ASC
          LIMIT 31
        `)
          .bind(store.id, fromDate, toDate)
          .all<DailySummaryRow>();

  const rawChartRows =
    spanDays <= 1 ? (chartHistoryRes.results || []).slice().reverse() : chartHistoryRes.results || [];
  const dailyHistory = rawChartRows.map(r => {
    const ext = safeParseJson<StoredExtendedMetrics>(r.metrics_json, {});
    return {
      summary_date: r.summary_date,
      total_sales: r.total_sales || 0,
      invoice_count: r.invoice_count || 0,
      avg_invoice: r.avg_invoice || 0,
      cash_total: r.cash_total || 0,
      card_total: r.card_total || 0,
      credit_total: r.credit_total || 0,
      returns_count: r.returns_count || 0,
      returns_total: r.returns_total || 0,
      net_profit: Math.round(ext.net_profit || 0),
      expenses_total: Math.round(ext.expenses_total || 0),
    };
  });

  // 4. Latest Store Balances Snapshot (Customer Receivables + Supplier Payables from latest synced row)
  const latestMetricsRow = await env.DB.prepare(`
    SELECT metrics_json FROM daily_sales_summaries
    WHERE store_id = ? AND metrics_json IS NOT NULL
    ORDER BY summary_date DESC
    LIMIT 1
  `)
    .bind(store.id)
    .first<{ metrics_json: string | null }>();
  const latestExt = safeParseJson<StoredExtendedMetrics>(latestMetricsRow?.metrics_json, {});

  // 5. Online Store Orders within [fromDate .. toDate]
  const onlineRangeRes = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status IN ('new', 'viewed') THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status IN ('accepted', 'preparing') THEN 1 ELSE 0 END) as preparing_count,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_count,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
      SUM(CASE WHEN status IN ('rejected', 'cancelled') THEN 1 ELSE 0 END) as cancelled_count,
      COALESCE(SUM(CASE WHEN status NOT IN ('rejected', 'cancelled') THEN total ELSE 0 END), 0) as active_sales
    FROM orders
    WHERE store_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
  `)
    .bind(store.id, fromDate, toDate)
    .first<{
      total_orders: number;
      pending_count: number;
      preparing_count: number;
      ready_count: number;
      delivered_count: number;
      cancelled_count: number;
      active_sales: number;
    }>();

  // Global pending online orders (always live)
  const pendingOrdersRes = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE store_id = ? AND status = 'new'
  `)
    .bind(store.id)
    .first<{ count: number }>();

  // 6. Live Inventory Valuation & Critical Low-Stock Alerts (from Desktop-synced products table)
  const inventoryStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_products_count,
      SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
      SUM(CASE WHEN stock_quantity > 0 AND (
        (low_stock_threshold > 0 AND stock_quantity <= low_stock_threshold) OR
        (low_stock_threshold <= 0 AND stock_quantity <= 5000)
      ) THEN 1 ELSE 0 END) as low_stock_count,
      COALESCE(SUM(CASE WHEN stock_quantity > 0 THEN (stock_quantity * price_piasters) / 1000 ELSE 0 END), 0) as retail_value,
      COALESCE(SUM(CASE WHEN stock_quantity > 0 THEN (stock_quantity * COALESCE(cost_piasters, 0)) / 1000 ELSE 0 END), 0) as cost_value
    FROM products
    WHERE store_id = ? AND is_active = 1
  `)
    .bind(store.id)
    .first<{
      total_products_count: number;
      out_of_stock_count: number;
      low_stock_count: number;
      retail_value: number;
      cost_value: number;
    }>();

  const lowStockListRes = await env.DB.prepare(`
    SELECT id, name, unit_name, stock_quantity, low_stock_threshold, price_piasters
    FROM products
    WHERE store_id = ? AND is_active = 1 AND (
      stock_quantity <= 0 OR
      (low_stock_threshold > 0 AND stock_quantity <= low_stock_threshold) OR
      (low_stock_threshold <= 0 AND stock_quantity <= 5000)
    )
    ORDER BY stock_quantity ASC, name ASC
    LIMIT 10
  `)
    .bind(store.id)
    .all<{
      id: string;
      name: string;
      unit_name: string;
      stock_quantity: number;
      low_stock_threshold: number;
      price_piasters: number;
    }>();

  const retailValue = Math.round(inventoryStats?.retail_value || 0);
  const costValue = Math.round(inventoryStats?.cost_value || 0);
  const prevNetSales = Math.max(0, (prevAgg?.total_sales || 0) - (prevAgg?.returns_total || 0));

  return new Response(
    JSON.stringify({
      filter: {
        from: fromDate,
        to: toDate,
        span_days: spanDays,
        days_with_data: rangeRows.length,
      },
      // Backwards-compatible fields + enriched Desktop POS fields for the active date range
      today_pos_sales: totalSales,
      today_pos_invoices: invoiceCount,
      today_pos_avg_invoice: avgInvoice,
      today_pos_cash: cashTotal,
      today_pos_card: cardTotal,
      today_pos_card_only: cardOnlyTotal,
      today_pos_instapay: instapayTotal,
      today_pos_wallet: walletTotal,
      today_pos_credit: creditTotal,
      today_pos_returns_count: returnsCount,
      today_pos_returns_total: returnsTotal,
      today_pos_net_sales: netSales,
      today_pos_gross_profit: grossProfit,
      today_pos_expenses: expensesTotal,
      today_pos_net_profit: netProfit,
      today_pos_debt_payments: debtPaymentsTotal,
      today_pos_discounts: discountTotal,
      today_pos_cancelled_count: cancelledCount,
      today_pos_cancelled_total: cancelledTotal,
      today_pos_hourly_breakdown: hourlyAgg,
      today_pos_top_products: topProductsMerged,
      yesterday_pos_sales: prevAgg?.total_sales || 0,
      yesterday_pos_net_sales: prevNetSales,
      yesterday_pos_invoices: prevAgg?.invoice_count || 0,
      store_balances: {
        customer_debts_total: Math.round(latestExt.customer_debts_total || 0),
        debtor_customers_count: Math.round(latestExt.debtor_customers_count || 0),
        supplier_debts_total: Math.round(latestExt.supplier_debts_total || 0),
      },
      daily_history: dailyHistory,
      inventory_summary: {
        total_products_count: inventoryStats?.total_products_count || 0,
        out_of_stock_count: inventoryStats?.out_of_stock_count || 0,
        low_stock_count: inventoryStats?.low_stock_count || 0,
        retail_value: retailValue,
        cost_value: costValue,
        expected_profit: Math.max(0, retailValue - costValue),
      },
      low_stock_products: (lowStockListRes.results || []).map(r => ({ ...r, unit_name: formatUnitArabic(r.unit_name) })),
      online_range_summary: {
        total_orders: onlineRangeRes?.total_orders || 0,
        active_sales: onlineRangeRes?.active_sales || 0,
        pending: onlineRangeRes?.pending_count || 0,
        preparing: onlineRangeRes?.preparing_count || 0,
        ready: onlineRangeRes?.ready_count || 0,
        delivered: onlineRangeRes?.delivered_count || 0,
        cancelled: onlineRangeRes?.cancelled_count || 0,
      },
      today_online_orders: onlineRangeRes?.total_orders || 0,
      today_online_sales: onlineRangeRes?.active_sales || 0,
      pending_orders_count: pendingOrdersRes?.count || 0,
      low_stock_count: inventoryStats?.low_stock_count || 0,
      total_products_count: inventoryStats?.total_products_count || 0,
      last_sync_at: store.last_sync_at,
      is_paused: store.is_paused,
      has_custom_pin: Boolean(store.owner_pin_hash),
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
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
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

  const wasActive = existing.status !== 'rejected' && existing.status !== 'cancelled';
  const nowCancelled = body.status === 'rejected' || body.status === 'cancelled';

  // Physical print & POS cashier invoicing guard:
  // Transition to 'ready' (خرج مع الدليفري) MUST be performed from Desktop POS to print the fiscal receipt and deduct local inventory!
  if (body.status === 'ready') {
    return new Response(
      JSON.stringify({
        error:
          'لا يمكن تحويل الطلب إلى (خرج مع الدليفري) من المتجر الإلكتروني. يجب تسليم الطلب وطباعة الفاتورة من برنامج الكاشير في رفيق POS.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Prevent jumping directly to 'delivered' if the order has not been invoiced and set to 'ready' by POS yet
  if (body.status === 'delivered' && existing.status !== 'ready' && !existing.pos_invoice_id) {
    return new Response(
      JSON.stringify({
        error:
          'لا يمكن تأكيد تسليم الأوردر للزبون قبل فوترته وتسليمه للدليفري من برنامج رفيق POS أولاً.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Financial integrity guard: once Desktop POS has issued an official invoice, cancellation must happen via POS Return/Cancel
  if (wasActive && nowCancelled && existing.pos_invoice_id) {
    return new Response(
      JSON.stringify({
        error:
          'تم إصدار فاتورة كاشير لهذا الطلب بالفعل — يرجى عمل مرتجع أو إلغاء الفاتورة من برنامج الكاشير للحفاظ على توازن الخزنة والمخزن.',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const now = new Date().toISOString();
  const history = existing.status_history ? JSON.parse(existing.status_history) : [];
  if (existing.status !== body.status) {
    history.push({ status: body.status, at: now, reason: body.rejection_reason || undefined });
  }

  // Restore reserved stock when transitioning from active to rejected/cancelled
  if (wasActive && nowCancelled) {
    const itemsRes = await env.DB.prepare(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?'
    )
      .bind(orderId)
      .all<{ product_id: string; quantity: number }>();

    for (const item of itemsRes.results || []) {
      await env.DB.prepare(
        'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND store_id = ?'
      )
        .bind(Math.round(item.quantity), now, item.product_id, store.id)
        .run();
    }
  }

  // Reset synced_to_pos = 0 so Desktop POS pulls the updated status automatically on the next sync tick (2-Way Sync)
  await env.DB.prepare(`
    UPDATE orders
    SET status = ?, rejection_reason = ?, status_history = ?, synced_to_pos = 0, updated_at = ?
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

  // Broadcast immediately to Desktop POS & other open owner dashboard tabs (< 200ms)
  await notifyStoreRealtime(env, store.id, {
    type: 'order_status_updated',
    source: 'dashboard',
    orderId,
    status: body.status,
    at: now,
  });

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
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)));
  const offset = (page - 1) * limit;

  const includeOutOfStock = url.searchParams.get('include_out_of_stock') === '1';
  let sql = includeOutOfStock
    ? 'SELECT * FROM products WHERE store_id = ? AND is_active = 1'
    : 'SELECT * FROM products WHERE store_id = ? AND is_active = 1 AND stock_quantity > 0';
  const bindings: any[] = [store.id];

  if (categoryId) {
    sql += ' AND category_id = ?';
    bindings.push(categoryId);
  }
  if (search && search.trim().length > 0) {
    sql += ' AND (name LIKE ? OR barcode LIKE ?)';
    bindings.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const countSql = sql.replace('SELECT * FROM products', 'SELECT COUNT(*) as total FROM products');
  const countRes = await env.DB.prepare(countSql).bind(...bindings).first<{ total: number }>();

  sql += ' ORDER BY is_featured DESC, sort_order ASC, name ASC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const query = await env.DB.prepare(sql).bind(...bindings).all<Product>();

  const products = (query.results || []).map(p => ({
    ...p,
    unit_name: formatUnitArabic(p.unit_name),
    image_urls: p.image_urls ? JSON.parse(p.image_urls) : [],
    in_stock: p.stock_quantity > 0 && p.is_online === 1,
  }));

  const total = countRes?.total ?? products.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page < totalPages;

  return new Response(
    JSON.stringify({ products, total, page, limit, totalPages, hasMore }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function handleDashboardGetCategories(
  _request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const query = await env.DB.prepare(`
    SELECT
      c.id,
      c.name,
      c.parent_id,
      c.image_url,
      c.sort_order,
      c.is_active,
      c.is_online,
      COUNT(p.id) AS total_products,
      COALESCE(SUM(CASE WHEN p.id IS NOT NULL AND p.is_online = 1 AND c.is_online = 1 THEN 1 ELSE 0 END), 0) AS visible_products,
      COALESCE(SUM(CASE WHEN p.id IS NOT NULL AND p.is_online = 0 THEN 1 ELSE 0 END), 0) AS hidden_products,
      COALESCE(SUM(CASE WHEN p.id IS NOT NULL AND p.image_urls IS NOT NULL AND p.image_urls != '[]' AND p.image_urls != '' THEN 1 ELSE 0 END), 0) AS with_images_count
    FROM categories c
    LEFT JOIN products p
      ON p.category_id = c.id
      AND p.store_id = c.store_id
      AND p.is_active = 1
      AND p.stock_quantity > 0
    WHERE c.store_id = ? AND c.is_active = 1
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name ASC
  `)
    .bind(store.id)
    .all<{
      id: string;
      name: string;
      parent_id: string | null;
      image_url: string | null;
      sort_order: number;
      is_active: number;
      is_online: number;
      total_products: number;
      visible_products: number;
      hidden_products: number;
      with_images_count: number;
    }>();

  return new Response(JSON.stringify({ categories: query.results || [] }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleDashboardUpdateCategoryVisibility(
  request: Request,
  categoryId: string,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    is_online?: number | boolean;
    cascade_products?: boolean;
  };

  if (body.is_online === undefined) {
    return new Response(JSON.stringify({ error: 'حقل is_online مطلوب' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existing = await env.DB.prepare(
    'SELECT id, name FROM categories WHERE id = ? AND store_id = ?'
  )
    .bind(categoryId, store.id)
    .first<{ id: string; name: string }>();

  if (!existing) {
    return new Response(JSON.stringify({ error: 'القسم غير موجود' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nextOnline = body.is_online ? 1 : 0;
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      'UPDATE categories SET is_online = ?, updated_at = ? WHERE id = ? AND store_id = ?'
    ).bind(nextOnline, now, categoryId, store.id),
  ];

  if (body.cascade_products === true) {
    stmts.push(
      env.DB.prepare(`
        UPDATE products
        SET is_online = ?, updated_at = ?
        WHERE store_id = ? AND category_id = ? AND is_active = 1 AND stock_quantity > 0
      `).bind(nextOnline, now, store.id, categoryId)
    );
  }

  let affectedProducts = 0;
  if (typeof env.DB.batch === 'function') {
    const res = await env.DB.batch(stmts);
    if (body.cascade_products === true && res[1]) {
      affectedProducts = Number((res[1] as any)?.meta?.changes ?? 0);
    }
  } else {
    await stmts[0].run();
    if (stmts[1]) {
      const r = await stmts[1].run();
      affectedProducts = Number(r?.meta?.changes ?? 0);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      category_id: categoryId,
      is_online: nextOnline,
      affected_products: affectedProducts,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardBulkUpdateCategoriesVisibility(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    category_ids?: string[];
    is_online?: number | boolean;
    cascade_products?: boolean;
  };

  const ids = Array.isArray(body.category_ids)
    ? Array.from(new Set(body.category_ids.filter(id => typeof id === 'string' && id.trim().length > 0)))
    : [];

  if (ids.length === 0 || body.is_online === undefined) {
    return new Response(JSON.stringify({ error: 'يرجى تحديد قسم واحد على الأقل وحالة الظهور' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nextOnline = body.is_online ? 1 : 0;
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  for (const catId of ids) {
    stmts.push(
      env.DB.prepare(
        'UPDATE categories SET is_online = ?, updated_at = ? WHERE id = ? AND store_id = ?'
      ).bind(nextOnline, now, catId, store.id)
    );
    if (body.cascade_products === true) {
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = ?, updated_at = ?
          WHERE store_id = ? AND category_id = ? AND is_active = 1 AND stock_quantity > 0
        `).bind(nextOnline, now, store.id, catId)
      );
    }
  }

  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    if (typeof env.DB.batch === 'function') {
      await env.DB.batch(chunk);
    } else {
      for (const s of chunk) await s.run();
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      updated_count: ids.length,
      is_online: nextOnline,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardBulkUpdateProductsVisibility(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    product_ids?: string[];
    is_online?: number | boolean;
    is_featured?: number | boolean;
  };

  const ids = Array.isArray(body.product_ids)
    ? Array.from(new Set(body.product_ids.filter(id => typeof id === 'string' && id.trim().length > 0)))
    : [];

  if (ids.length === 0 || (body.is_online === undefined && body.is_featured === undefined)) {
    return new Response(JSON.stringify({ error: 'يرجى تحديد صنف واحد على الأقل والإجراء المطلوب' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const baseBindings: any[] = [now];

  if (body.is_online !== undefined) {
    setClauses.push('is_online = ?');
    baseBindings.push(body.is_online ? 1 : 0);
  }
  if (body.is_featured !== undefined) {
    setClauses.push('is_featured = ?');
    baseBindings.push(body.is_featured ? 1 : 0);
  }

  const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = ? AND store_id = ?`;
  const stmts = ids.map(prodId => env.DB.prepare(sql).bind(...baseBindings, prodId, store.id));

  let updatedCount = 0;
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    if (typeof env.DB.batch === 'function') {
      const results = await env.DB.batch(chunk);
      for (const r of results) {
        updatedCount += Number((r as any)?.meta?.changes ?? 0);
      }
    } else {
      for (const s of chunk) {
        const r = await s.run();
        updatedCount += Number(r?.meta?.changes ?? 0);
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      updated_count: updatedCount,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
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

export async function handleDashboardBatchUpdateProducts(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    updates?: Array<{
      id: string;
      description?: string;
      is_online?: number | boolean;
      is_featured?: number | boolean;
    }>;
  };

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return new Response(JSON.stringify({ success: true, updated_count: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  for (const u of updates) {
    if (!u.id) continue;
    const setClauses: string[] = ['updated_at = ?'];
    const bindings: any[] = [now];

    if (u.description !== undefined) {
      setClauses.push('description = ?');
      bindings.push(u.description && u.description.trim() ? u.description.trim() : null);
    }
    if (u.is_online !== undefined) {
      setClauses.push('is_online = ?');
      bindings.push(u.is_online ? 1 : 0);
    }
    if (u.is_featured !== undefined) {
      setClauses.push('is_featured = ?');
      bindings.push(u.is_featured ? 1 : 0);
    }

    bindings.push(u.id, store.id);
    const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = ? AND store_id = ?`;
    stmts.push(env.DB.prepare(sql).bind(...bindings));
  }

  let updatedCount = 0;
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    if (typeof env.DB.batch === 'function') {
      const results = await env.DB.batch(chunk);
      for (const r of results) updatedCount += Number((r as any)?.meta?.changes ?? 0);
    } else {
      for (const s of chunk) {
        const r = await s.run();
        updatedCount += Number(r?.meta?.changes ?? 0);
      }
    }
  }

  return new Response(JSON.stringify({ success: true, updated_count: updatedCount }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleDashboardSmartPublishCatalog(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
    preset: 'publish_in_stock' | 'publish_with_images_only' | 'publish_with_descriptions_only' | 'hide_out_of_stock' | 'hide_all' | 'publish_category';
    category_id?: string;
  };

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  let description = '';

  switch (body.preset) {
    case 'publish_in_stock':
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = 1, updated_at = ?
          WHERE store_id = ? AND is_active = 1 AND stock_quantity > 0
        `).bind(now, store.id)
      );
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = 0, updated_at = ?
          WHERE store_id = ? AND is_active = 1 AND stock_quantity <= 0
        `).bind(now, store.id)
      );
      stmts.push(
        env.DB.prepare(`
          UPDATE categories
          SET is_online = 1, updated_at = ?
          WHERE store_id = ? AND is_active = 1
        `).bind(now, store.id)
      );
      description = 'تم نشر كافة الأصناف المتوفرة بمخزون وإخفاء نافد المخزون وتفعيل الأقسام بنجاح.';
      break;

    case 'publish_with_images_only':
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = CASE
            WHEN image_urls IS NOT NULL AND image_urls != '[]' AND image_urls != '' AND stock_quantity > 0 THEN 1
            ELSE 0
          END,
          updated_at = ?
          WHERE store_id = ? AND is_active = 1
        `).bind(now, store.id)
      );
      description = 'تم حصر النشر على الأصناف المتوفرة التي تحتوي على صور فقط.';
      break;

    case 'publish_with_descriptions_only':
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = CASE
            WHEN description IS NOT NULL AND description != '' AND stock_quantity > 0 THEN 1
            ELSE 0
          END,
          updated_at = ?
          WHERE store_id = ? AND is_active = 1
        `).bind(now, store.id)
      );
      description = 'تم حصر النشر على الأصناف المتوفرة المزودة بوصف تسويقي فقط.';
      break;

    case 'hide_out_of_stock':
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = 0, updated_at = ?
          WHERE store_id = ? AND is_active = 1 AND stock_quantity <= 0
        `).bind(now, store.id)
      );
      description = 'تم إخفاء كافة الأصناف نافدة المخزون عن المتجر الإلكتروني.';
      break;

    case 'hide_all':
      stmts.push(
        env.DB.prepare(`
          UPDATE products
          SET is_online = 0, updated_at = ?
          WHERE store_id = ?
        `).bind(now, store.id)
      );
      description = 'تم إخفاء كافة أصناف المتجر الإلكتروني.';
      break;

    case 'publish_category':
      if (body.category_id) {
        stmts.push(
          env.DB.prepare(`
            UPDATE products
            SET is_online = 1, updated_at = ?
            WHERE store_id = ? AND category_id = ? AND is_active = 1 AND stock_quantity > 0
          `).bind(now, store.id, body.category_id)
        );
        stmts.push(
          env.DB.prepare(`
            UPDATE categories
            SET is_online = 1, updated_at = ?
            WHERE store_id = ? AND id = ?
          `).bind(now, store.id, body.category_id)
        );
        description = 'تم نشر كافة أصناف القسم المتوفرة وتفعيل ظهور القسم بالمتجر.';
      }
      break;

    default:
      return new Response(JSON.stringify({ error: 'Preset غير صالح' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  let totalChanges = 0;
  if (typeof env.DB.batch === 'function') {
    const results = await env.DB.batch(stmts);
    for (const r of results) totalChanges += Number((r as any)?.meta?.changes ?? 0);
  } else {
    for (const s of stmts) {
      const r = await s.run();
      totalChanges += Number(r?.meta?.changes ?? 0);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      preset: body.preset,
      affected_count: totalChanges,
      message: description,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function handleDashboardUpdateStoreSettings(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as {
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
    is_paused?: number | boolean;
    pause_message?: string | null;
  };

  const now = new Date().toISOString();
  let sql = 'UPDATE stores SET updated_at = ?';
  const bindings: any[] = [now];

  if (body.name !== undefined && body.name.trim()) {
    sql += ', name = ?';
    bindings.push(body.name.trim());
  }
  if (body.phone !== undefined) {
    sql += ', phone = ?';
    bindings.push(body.phone && body.phone.trim() ? body.phone.trim() : null);
  }
  if (body.whatsapp !== undefined) {
    sql += ', whatsapp = ?';
    bindings.push(body.whatsapp && body.whatsapp.trim() ? body.whatsapp.trim() : null);
  }
  if (body.address !== undefined) {
    sql += ', address = ?';
    bindings.push(body.address && body.address.trim() ? body.address.trim() : null);
  }
  if (body.working_hours !== undefined) {
    sql += ', working_hours = ?';
    bindings.push(body.working_hours ? JSON.stringify(body.working_hours) : null);
  }
  if (body.welcome_message !== undefined) {
    sql += ', welcome_message = ?';
    bindings.push(body.welcome_message && body.welcome_message.trim() ? body.welcome_message.trim() : null);
  }
  if (body.min_order_amount !== undefined) {
    sql += ', min_order_amount = ?';
    bindings.push(Math.max(0, Math.round(body.min_order_amount)));
  }
  if (body.delivery_zones !== undefined) {
    sql += ', delivery_zones = ?';
    bindings.push(body.delivery_zones ? JSON.stringify(body.delivery_zones) : null);
  }
  if (body.vodafone_cash_phone !== undefined) {
    sql += ', vodafone_cash_phone = ?';
    bindings.push(body.vodafone_cash_phone && body.vodafone_cash_phone.trim() ? body.vodafone_cash_phone.trim() : null);
  }
  if (body.instapay_handle !== undefined) {
    sql += ', instapay_handle = ?';
    bindings.push(body.instapay_handle && body.instapay_handle.trim() ? body.instapay_handle.trim() : null);
  }
  if (body.is_paused !== undefined) {
    sql += ', is_paused = ?';
    bindings.push(body.is_paused ? 1 : 0);
  }
  if (body.pause_message !== undefined) {
    sql += ', pause_message = ?';
    bindings.push(body.pause_message && body.pause_message.trim() ? body.pause_message.trim() : null);
  }

  sql += ' WHERE id = ?';
  bindings.push(store.id);

  await env.DB.prepare(sql).bind(...bindings).run();

  return new Response(JSON.stringify({ success: true, message: 'تم تحديث إعدادات المتجر بنجاح' }), {
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
