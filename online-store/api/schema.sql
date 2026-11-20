-- ============================================================================
-- Rafiq Online Store (Cloudflare D1 Schema)
-- Multi-Tenant Database with Row-Level Store Isolation
-- All financial amounts in piasters (INTEGER), zero floating point arithmetic.
-- ============================================================================

-- 1. Stores (المحلات المسجلة)
CREATE TABLE IF NOT EXISTS stores (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    license_key         TEXT NOT NULL UNIQUE,          -- Linked Rafiq POS license key
    slug                TEXT NOT NULL UNIQUE,          -- URL identifier e.g. souq-el-khair
    name                TEXT NOT NULL,                 -- Store public name
    phone               TEXT,                          -- Contact phone
    whatsapp            TEXT,                          -- WhatsApp number for customer queries
    address             TEXT,                          -- Physical address
    working_hours       TEXT,                          -- JSON: {"sat":"9:00-23:00", ...}
    welcome_message     TEXT,                          -- Header welcome banner message
    logo_url            TEXT,                          -- Logo URL in R2 or external
    banner_url          TEXT,                          -- Hero banner image URL
    theme_preset        TEXT NOT NULL DEFAULT 'classic-green', -- classic-green, medical-blue, warm-brown, etc.
    theme_custom        TEXT,                          -- JSON: custom CSS tokens override
    min_order_amount    INTEGER NOT NULL DEFAULT 0,    -- Minimum order amount in piasters
    delivery_zones      TEXT,                          -- JSON: [{"name":"وسط البلد","fee":1500}] (fees in piasters)
    vodafone_cash_phone TEXT,                          -- Primary Vodafone Cash wallet number for e-payments
    instapay_handle     TEXT,                          -- Primary InstaPay IPA handle / account for e-payments
    accept_vodafone_cash INTEGER NOT NULL DEFAULT 1,   -- 1 = accept Vodafone Cash, 0 = disabled
    accept_instapay     INTEGER NOT NULL DEFAULT 1,    -- 1 = accept InstaPay, 0 = disabled
    is_active           INTEGER NOT NULL DEFAULT 1,    -- 1 = active, 0 = disabled
    is_paused           INTEGER NOT NULL DEFAULT 0,    -- Temporary store closing (e.g. vacation)
    pause_message       TEXT,                          -- Message displayed when paused
    store_type          TEXT NOT NULL DEFAULT 'supermarket', -- supermarket, pharmacy, cafe, retail
    api_key_hash        TEXT NOT NULL,                 -- SHA-256 hash of store API key for POS sync
    owner_pin_hash      TEXT,                          -- SHA-256 hash of owner PIN/password for dashboard login
    sync_version        INTEGER NOT NULL DEFAULT 0,    -- Monotonic sync counter
    last_sync_at        TEXT,                          -- ISO 8601 timestamp of last POS sync
    created_at          TEXT NOT NULL,                 -- ISO 8601
    updated_at          TEXT NOT NULL                  -- ISO 8601
);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_license ON stores(license_key);

-- 2. Categories (أقسام المتجر)
CREATE TABLE IF NOT EXISTS categories (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    store_id            TEXT NOT NULL,                 -- Foreign key to stores(id)
    name                TEXT NOT NULL,                 -- Category name
    parent_id           TEXT,                          -- For subcategories
    image_url           TEXT,                          -- Category icon / photo
    sort_order          INTEGER NOT NULL DEFAULT 0,    -- Display order
    is_active           INTEGER NOT NULL DEFAULT 1,    -- 1 = active, 0 = soft deleted
    is_online           INTEGER NOT NULL DEFAULT 1,    -- 1 = display on web storefront
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_categories_store ON categories(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_online ON categories(store_id, is_online, is_active);

-- 3. Products (أصناف ومنتجات المتجر)
CREATE TABLE IF NOT EXISTS products (
    id                  TEXT PRIMARY KEY,              -- UUID v4 (synced with POS product id)
    store_id            TEXT NOT NULL,                 -- Foreign key to stores(id)
    category_id         TEXT,                          -- Foreign key to categories(id)
    name                TEXT NOT NULL,                 -- Product title
    description         TEXT,                          -- Long description for web
    barcode             TEXT,                          -- Barcode
    sku                 TEXT,                          -- Internal SKU
    price_piasters      INTEGER NOT NULL,              -- Current selling price in piasters (INTEGER ONLY)
    compare_price       INTEGER,                       -- Price before discount in piasters (optional)
    cost_piasters       INTEGER,                       -- Cost price in piasters (INTERNAL ONLY, NEVER EXPOSED TO WEB)
    unit_name           TEXT NOT NULL DEFAULT 'قطعة',   -- Piece, KG, Box, etc.
    tax_rate            INTEGER NOT NULL DEFAULT 0,    -- Tax rate multiplied by 100 (e.g. 1400 = 14%)
    stock_quantity      INTEGER NOT NULL DEFAULT 0,    -- Current available stock (in milli-units: 1 unit = 1000)
    low_stock_threshold INTEGER NOT NULL DEFAULT 0,    -- Threshold in milli-units
    is_active           INTEGER NOT NULL DEFAULT 1,    -- 1 = active in POS
    is_online           INTEGER NOT NULL DEFAULT 1,    -- 1 = display on web storefront
    is_featured         INTEGER NOT NULL DEFAULT 0,    -- 1 = feature on homepage
    sort_order          INTEGER NOT NULL DEFAULT 0,    -- Ordering within category
    image_urls          TEXT,                          -- JSON array of URLs: ["url1","url2","url3"]
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(store_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(store_id, is_featured)
    WHERE is_online = 1 AND is_active = 1;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(store_id, barcode);

-- 4. Online Orders (طلبات الزبائن من المتجر الإلكتروني)
CREATE TABLE IF NOT EXISTS orders (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    store_id            TEXT NOT NULL,                 -- Foreign key to stores(id)
    order_number        INTEGER NOT NULL,              -- Sequential per store: 1, 2, 3...
    customer_name       TEXT NOT NULL,                 -- Customer name
    customer_phone      TEXT NOT NULL,                 -- Customer phone number
    customer_address    TEXT,                          -- Delivery address
    delivery_method     TEXT NOT NULL,                 -- 'delivery' | 'pickup'
    delivery_zone       TEXT,                          -- Zone name if delivery
    delivery_fee        INTEGER NOT NULL DEFAULT 0,    -- Delivery fee in piasters
    subtotal            INTEGER NOT NULL,              -- Items total in piasters
    total               INTEGER NOT NULL,              -- Final grand total (subtotal + delivery_fee) in piasters
    notes               TEXT,                          -- Customer special instructions
    payment_method      TEXT,                          -- 'كاش عند الاستلام' | 'إنستاباي' | 'فودافون كاش ومحافظ المحمول'
    sender_phone        TEXT,                          -- Sender phone or InstaPay IPA handle
    payment_ref         TEXT,                          -- Transfer reference number (optional)
    receipt_image       TEXT,                          -- Cloud URL (R2/KV) or compressed data URL of transfer receipt
    status              TEXT NOT NULL DEFAULT 'new',   -- 'new' | 'viewed' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'rejected' | 'cancelled'
    rejection_reason    TEXT,                          -- Reason if rejected
    status_history      TEXT,                          -- JSON array: [{"status":"new","at":"..."}, ...]
    synced_to_pos       INTEGER NOT NULL DEFAULT 0,    -- 1 once downloaded by POS sync engine
    pos_invoice_id      TEXT,                          -- Linked POS sale invoice UUID once converted
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_store_date ON orders(store_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_seq ON orders(store_id, order_number);

-- 5. Order Items (أصناف الطلب بتفاصيلها)
CREATE TABLE IF NOT EXISTS order_items (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    order_id            TEXT NOT NULL,                 -- Foreign key to orders(id)
    product_id          TEXT NOT NULL,                 -- Foreign key to products(id)
    product_name        TEXT NOT NULL,                 -- Snapshot of name at time of order
    product_price       INTEGER NOT NULL,              -- Snapshot of unit price in piasters
    quantity            INTEGER NOT NULL,              -- Quantity ordered in milli-units (1000 = 1 unit)
    line_total          INTEGER NOT NULL,              -- (product_price * quantity / 1000) in piasters
    notes               TEXT,                          -- Item special requests
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 6. Daily Sales Summaries (ملخصات المبيعات اليومية التجميعية)
-- Private aggregated data pushed from POS for store owner remote analytics
CREATE TABLE IF NOT EXISTS daily_sales_summaries (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    store_id            TEXT NOT NULL,                 -- Foreign key to stores(id)
    summary_date        TEXT NOT NULL,                 -- YYYY-MM-DD
    total_sales         INTEGER NOT NULL,              -- Total sales in piasters
    invoice_count       INTEGER NOT NULL,              -- Number of completed invoices
    avg_invoice         INTEGER NOT NULL,              -- Average invoice value in piasters
    cash_total          INTEGER NOT NULL DEFAULT 0,    -- Cash total in piasters
    card_total          INTEGER NOT NULL DEFAULT 0,    -- Card total in piasters
    credit_total        INTEGER NOT NULL DEFAULT 0,    -- Credit (آجل) total in piasters
    returns_count       INTEGER NOT NULL DEFAULT 0,    -- Number of return receipts
    returns_total       INTEGER NOT NULL DEFAULT 0,    -- Returns total in piasters
    hourly_breakdown    TEXT,                          -- JSON: {"09": 150000, "10": 245000, ...}
    top_products        TEXT,                          -- JSON: [{"id":"...","name":"...","qty":50000}, ...]
    metrics_json        TEXT,                          -- JSON: extended desktop POS metrics (profit, expenses, wallets, debts)
    synced_at           TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE(store_id, summary_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_sales_store_date ON daily_sales_summaries(store_id, summary_date);

-- 7. Sync Log (سجل عمليات المزامنة للمراقبة واستكشاف الأخطاء)
CREATE TABLE IF NOT EXISTS sync_log (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    store_id            TEXT NOT NULL,                 -- Foreign key to stores(id)
    sync_type           TEXT NOT NULL,                 -- 'catalog' | 'stock' | 'sales_summary' | 'orders' | 'heartbeat'
    direction           TEXT NOT NULL,                 -- 'up' (POS to cloud) | 'down' (cloud to POS)
    records_count       INTEGER NOT NULL DEFAULT 0,
    bytes_transferred   INTEGER NOT NULL DEFAULT 0,
    duration_ms         INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL,                 -- 'success' | 'partial' | 'failed'
    error_message       TEXT,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sync_log_store ON sync_log(store_id, created_at);

-- 8. Page Views & Analytics (تحليلات الزوار المجهولة)
CREATE TABLE IF NOT EXISTS page_views (
    id                  TEXT PRIMARY KEY,              -- UUID v4
    store_id            TEXT NOT NULL,                 -- Foreign key to stores(id)
    page_type           TEXT NOT NULL,                 -- 'home' | 'category' | 'product' | 'cart' | 'checkout'
    page_id             TEXT,                          -- product_id or category_id
    visitor_hash        TEXT,                          -- Anonymized visitor fingerprint
    referrer            TEXT,
    view_date           TEXT NOT NULL,                 -- YYYY-MM-DD
    created_at          TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pageviews_daily ON page_views(store_id, view_date);
