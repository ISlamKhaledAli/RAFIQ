import { invoke } from './ipc';

export type OnlineStoreSubTab = 'orders' | 'status' | 'settings';

export interface SyncStateDto {
  onlineStoreEnabled: boolean;
  storeCloudId: string;
  syncApiKeyMasked: string;
  hasApiKey: boolean;
  onlineStoreSlug: string;
  cloudApiUrl: string;
  lastSyncTimestamp: string;
  syncIntervalSeconds: number;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  newOrdersCount: number;
  isSyncing: boolean;
  lastError: string;
}

export interface SyncConfigUpdateRequest {
  onlineStoreEnabled?: boolean;
  storeCloudId?: string;
  syncApiKey?: string;
  onlineStoreSlug?: string;
  cloudApiUrl?: string;
  syncIntervalSeconds?: number;
}

export interface OnlineOrderItemDto {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  line_total: number;
  notes?: string | null;
}

export interface OnlineOrderDto {
  id: string;
  store_id?: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address?: string | null;
  delivery_method: 'delivery' | 'pickup' | string;
  delivery_zone?: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  notes?: string | null;
  payment_method?: string | null;
  sender_phone?: string | null;
  payment_ref?: string | null;
  receipt_image?: string | null;
  status: 'new' | 'viewed' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'rejected' | string;
  rejection_reason?: string | null;
  created_at: string;
  items: OnlineOrderItemDto[];
}

export interface SyncInboxItem {
  id: string;
  orderId: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  totalPiasters: number;
  orderDataJson: string;
  receivedAt: string;
  processStatus: string;
  posInvoiceId?: string | null;
  processedAt?: string | null;
  order?: OnlineOrderDto | null;
}

export interface SyncCycleResult {
  success: boolean;
  skipped: boolean;
  message: string;
  catalogSyncedCount: number;
  prunedOutOfStockCount?: number;
  stockSyncedCount: number;
  newOrdersDownloaded: number;
  orderStatusesUploaded: number;
  syncedAt?: string;
}

export interface OnlineOrderNotificationDto {
  orderId: string;
  orderNumber: number;
  customerName?: string | null;
  customerPhone?: string | null;
  totalPiasters: number;
  deliveryMethod?: string | null;
  paymentMethod?: string | null;
  itemsCount: number;
  processStatus?: string | null;
}

export interface OnlineOrdersSyncedEvent {
  newOrdersCount: number;
  updatedOrdersCount: number;
  totalPendingNewCount: number;
  syncedAt?: string | null;
  newOrders: OnlineOrderNotificationDto[];
}

export function getOnlineStoreState(): Promise<SyncStateDto> {
  return invoke<SyncStateDto>('onlineStore:getState');
}

export function saveOnlineStoreConfig(req: SyncConfigUpdateRequest): Promise<SyncStateDto> {
  return invoke<SyncStateDto>('onlineStore:saveConfig', req);
}

export function triggerOnlineStoreSync(fullCatalog = false): Promise<SyncCycleResult> {
  return invoke<SyncCycleResult>('onlineStore:triggerSync', { fullCatalog }, 180000);
}

export function getOnlineStoreOrders(status = 'all', limit = 100): Promise<SyncInboxItem[]> {
  return invoke<SyncInboxItem[]>('onlineStore:getOrders', { status, limit });
}

export interface ConvertOnlineOrderResult {
  success: boolean;
  alreadyConverted?: boolean;
  saleId: string;
  invoiceNumber: number;
  orderId: string;
  status?: string;
}

export function processOnlineStoreOrder(payload: {
  orderId: string;
  status: string;
  rejectionReason?: string;
  posInvoiceId?: string;
}): Promise<{ success: boolean; orderId: string; status: string }> {
  return invoke<{ success: boolean; orderId: string; status: string }>('onlineStore:processOrder', payload);
}

export function convertOnlineOrderToSale(payload: {
  orderId: string;
  markStatus?: string;
}): Promise<ConvertOnlineOrderResult> {
  return invoke<ConvertOnlineOrderResult>('onlineStore:processOrderToSale', payload, 30000);
}

export function printPosSaleReceipt(saleId: string): Promise<{ success: boolean; message?: string }> {
  return invoke<{ success: boolean; message?: string }>('printer:printReceipt', { saleId }, 30000);
}

export function updateProductOnlineSettings(payload: {
  productId: string;
  isOnline: boolean;
  isFeatured?: boolean;
  onlineDescription?: string | null;
  comparePricePiasters?: number | null;
}): Promise<{ success: boolean; productId: string }> {
  return invoke<{ success: boolean; productId: string }>('onlineStore:updateProductOnline', payload);
}

export function openOnlineStoreExternalUrl(url: string): Promise<{ opened: boolean; url: string }> {
  return invoke<{ opened: boolean; url: string }>('onlineStore:openExternalUrl', { url });
}

export function setCashierBusyForSync(busy: boolean): Promise<{ busy: boolean }> {
  return invoke<{ busy: boolean }>('onlineStore:setCashierBusy', { busy });
}

export interface OnlineStoreRealtimeSession {
  enabled: boolean;
  wsUrl: string;
  storeId: string;
  expiresAt?: string;
  error?: string;
}

export function getOnlineStoreRealtimeSession(): Promise<OnlineStoreRealtimeSession> {
  return invoke<OnlineStoreRealtimeSession>('onlineStore:getRealtimeSession', {}, 15000);
}

export function triggerOnlineStoreFastPulse(): Promise<{ triggered: boolean }> {
  return invoke<{ triggered: boolean }>('onlineStore:fastPulse', {}, 10000);
}

export function setOnlineStoreRealtimeConnected(connected: boolean): Promise<{ connected: boolean }> {
  return invoke<{ connected: boolean }>('onlineStore:setRealtimeConnected', { connected }, 5000);
}

export function purgeOnlineStoreOrders(): Promise<{ success: boolean }> {
  return invoke<{ success: boolean }>('onlineStore:purgeOrders', {}, 30000);
}

export function purgeOnlineStoreCatalog(): Promise<{ success: boolean }> {
  return invoke<{ success: boolean }>('onlineStore:purgeCatalog', {}, 30000);
}
