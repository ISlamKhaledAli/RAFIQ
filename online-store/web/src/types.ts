export interface Store {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  working_hours: Record<string, string> | null;
  welcome_message: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme_preset: string;
  theme_custom: Record<string, string | undefined> | null;
  min_order_amount: number; // in piasters
  delivery_zones: Array<{ name: string; fee: number }> | null;
  is_paused: number;
  pause_message: string | null;
  store_type: string;
  instapay_handle?: string | null;
  instapay_name?: string | null;
  vodafone_cash_phone?: string | null;
  vodafone_cash_name?: string | null;
  vodafone_cash_provider?: string | null;
  digital_accounts?: StoreDigitalAccount[] | null;
  accept_cash?: boolean;
  accept_instapay?: boolean;
  accept_vodafone_cash?: boolean;
  allow_delivery?: boolean;
  allow_pickup?: boolean;
}

export interface StoreDigitalAccount {
  id: string;
  name: string;
  type: string; // 'wallet' | 'instapay'
  provider: string; // 'vodafone_cash' | 'orange_cash' | 'etisalat_cash' | 'we_pay' | 'instapay' | 'bank_account' | 'other'
  account_number: string;
  holder_name?: string;
  is_default?: boolean;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  image_url: string | null;
  sort_order: number;
  is_active?: number;
  is_online?: number;
  total_products?: number;
  visible_products?: number;
  hidden_products?: number;
  with_images_count?: number;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  barcode: string | null;
  sku: string | null;
  price_piasters: number; // INTEGER
  compare_price: number | null;
  unit_name: string;
  tax_rate: number;
  stock_quantity: number; // in milli-units (1000 = 1 unit)
  is_online?: number;
  is_featured: number;
  image_urls: string[];
  in_stock: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number; // in units (e.g. 1, 2, 3)
}

export interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string | null;
  delivery_method: 'delivery' | 'pickup';
  delivery_zone: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  status: 'new' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'rejected';
  status_note?: string;
  notes?: string | null;
  rejection_reason?: string;
  status_history: Array<{ status: string; at: string; reason?: string }>;
  created_at: string;
  items: Array<{
    id: string;
    product_name: string;
    product_price: number;
    quantity: number;
    line_total: number;
    notes?: string;
  }>;
}
