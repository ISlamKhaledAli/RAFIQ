// Types & Interfaces for Rafiq Online Store API

export interface Env {
  DB: D1Database;
  IMAGES?: R2Bucket;
  /** Zero-card free-tier KV fallback for compressed WebP product images (auto-upgrades to R2 when IMAGES is bound). */
  PRODUCT_IMAGES_KV?: KVNamespace;
  THEMES?: KVNamespace;
  /** Shared Cloudflare KV written by rafiq-license-server for instant storefront kill-switch. */
  STORE_LICENSES?: KVNamespace;
  /** Per-store SQLite-backed Durable Object hub for instant WebSocket Hibernation order notifications. */
  STORE_REALTIME?: DurableObjectNamespace;
  /** Shared HMAC-SHA256 secret (>= 32 chars) for cross-account license-server governance webhook. */
  GOVERNANCE_WEBHOOK_SECRET?: string;
  ENVIRONMENT?: string;
  APP_SECRET?: string;
}

export interface Store {
  id: string;
  license_key: string;
  slug: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  working_hours: string | null; // JSON string
  welcome_message: string | null;
  logo_url: string | null;
  banner_url: string | null;
  vodafone_cash_phone?: string | null;
  vodafone_cash_name?: string | null;
  vodafone_cash_provider?: string | null;
  instapay_handle?: string | null;
  instapay_name?: string | null;
  digital_accounts?: string | null;
  accept_vodafone_cash?: number;
  accept_instapay?: number;
  theme_preset: string;
  theme_custom: string | null; // JSON string
  min_order_amount: number; // in piasters
  delivery_zones: string | null; // JSON string
  is_active: number;
  is_paused: number;
  pause_message: string | null;
  store_type: string;
  api_key_hash: string;
  owner_pin_hash: string | null;
  sync_version: number;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  parent_id: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: number;
  is_online: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  barcode: string | null;
  sku: string | null;
  price_piasters: number; // INTEGER
  compare_price: number | null;
  cost_piasters: number | null;
  unit_name: string;
  tax_rate: number;
  stock_quantity: number; // milli-units (1000 = 1 unit)
  low_stock_threshold: number;
  is_active: number;
  is_online: number;
  is_featured: number;
  sort_order: number;
  image_urls: string | null; // JSON array string
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  delivery_method: 'delivery' | 'pickup';
  delivery_zone: string | null;
  delivery_fee: number; // in piasters
  subtotal: number; // in piasters
  total: number; // in piasters
  notes: string | null;
  payment_method?: string | null;
  sender_phone?: string | null;
  payment_ref?: string | null;
  receipt_image?: string | null;
  status: 'new' | 'viewed' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'rejected' | 'cancelled';
  rejection_reason: string | null;
  status_history: string | null; // JSON array string
  synced_to_pos: number;
  pos_invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_price: number; // in piasters
  quantity: number; // milli-units
  line_total: number; // in piasters
  notes: string | null;
}

export interface DailySalesSummary {
  id: string;
  store_id: string;
  summary_date: string;
  total_sales: number; // piasters
  invoice_count: number;
  avg_invoice: number; // piasters
  cash_total: number;
  card_total: number;
  credit_total: number;
  returns_count: number;
  returns_total: number;
  hourly_breakdown: string | null;
  top_products: string | null;
  synced_at: string;
}

// Request payloads
export interface SyncCatalogPayload {
  categories?: Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    sort_order?: number;
    is_active?: number;
    is_online?: number;
  }>;
  products?: Array<{
    id: string;
    category_id?: string | null;
    name: string;
    description?: string | null;
    barcode?: string | null;
    sku?: string | null;
    price_piasters: number;
    compare_price?: number | null;
    cost_piasters?: number | null;
    unit_name?: string;
    tax_rate?: number;
    stock_quantity: number;
    low_stock_threshold?: number;
    is_active?: number;
    is_online?: number;
    is_featured?: number;
    sort_order?: number;
    image_urls?: string[];
  }>;
  remove_product_ids?: string[];
}

export interface SyncCatalogPrunePayload {
  keep_product_ids: string[];
}

export interface SyncStockPayload {
  items: Array<{
    product_id: string;
    stock_quantity: number; // in milli-units
  }>;
  remove_product_ids?: string[];
}

export interface CreateOrderPayload {
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
  items: Array<{
    product_id: string;
    quantity: number; // in milli-units (1000 = 1 unit)
    notes?: string;
  }>;
}
