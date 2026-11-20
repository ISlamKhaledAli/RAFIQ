import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  ShoppingBag,
  Clock,
  Truck,
  Store,
  Phone,
  MessageCircle,
  MapPin,
  CreditCard,
  Image as ImageIcon,
  ZoomIn,
  Package,
  Check,
  CheckCircle2,
  XCircle,
  Copy,
  Printer,
  Receipt,
  Volume2,
  VolumeX,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  FileCheck2,
  ChevronLeft,
  Trash2,
} from 'lucide-react';
import { AppButton } from '../AppButton';
import { SearchInput } from '../SearchInput';
import type { SyncInboxItem } from '../../bridge/onlineStoreIpc';

export type OrderFilter = 'all' | 'new' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'rejected';

export interface ReceiptPreviewData {
  orderNumber: number;
  imageUrl: string;
  paymentMethod?: string | null;
  senderPhone?: string | null;
  paymentRef?: string | null;
}

interface Props {
  orders: SyncInboxItem[];
  storeSlug: string;
  loading: boolean;
  canProcess: boolean;
  canManage?: boolean;
  processingOrderId: string | null;
  convertingOrderId: string | null;
  printingOrderId: string | null;
  soundEnabled: boolean;
  purgingOrders?: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
  onPurgeOrders?: () => void;
  onUpdateStatus: (orderId: string, status: string, reason?: string) => Promise<void>;
  onConvertToSale: (orderId: string, markStatus?: string, autoPrint?: boolean) => Promise<void>;
  onPrintSaleReceipt: (orderId: string, saleId: string) => Promise<void>;
  onOpenExternalUrl: (url: string) => void;
  onCopySuccess: (message: string) => void;
  onPreviewReceipt: (data: ReceiptPreviewData) => void;
}

const ORDER_STATUS_META: Record<
  string,
  { label: string; badgeClass: string; stripClass: string }
> = {
  new: {
    label: 'طلب جديد',
    badgeClass:
      'bg-warn-soft text-ink border-warn/35 dark:bg-warn-dark/20 dark:text-warn-bright dark:border-warn-bright/30',
    stripClass: 'bg-warn',
  },
  viewed: {
    label: 'تمت المشاهدة',
    badgeClass:
      'bg-warn-soft/70 text-ink border-warn/25 dark:bg-warn-dark/15 dark:text-warn-bright dark:border-warn-bright/25',
    stripClass: 'bg-warn',
  },
  accepted: {
    label: 'مقبول',
    badgeClass:
      'bg-brand-soft text-brand border-brand/30 dark:bg-brand-dark/25 dark:text-paid-bright dark:border-brand/40',
    stripClass: 'bg-brand',
  },
  preparing: {
    label: 'جاري التجهيز',
    badgeClass:
      'bg-brand-soft text-brand border-brand/30 dark:bg-brand-dark/25 dark:text-paid-bright dark:border-brand/40',
    stripClass: 'bg-brand',
  },
  ready: {
    label: 'جاهز / بالطريق',
    badgeClass:
      'bg-paid-soft text-paid border-paid/30 dark:bg-paid-dark/25 dark:text-paid-bright dark:border-paid/40',
    stripClass: 'bg-paid',
  },
  delivered: {
    label: 'تم التسليم',
    badgeClass:
      'bg-paid-soft text-paid border-paid/30 dark:bg-paid-dark/25 dark:text-paid-bright dark:border-paid/40',
    stripClass: 'bg-paid',
  },
  rejected: {
    label: 'مرفوض',
    badgeClass:
      'bg-danger-soft text-danger border-danger/30 dark:bg-danger-dark/20 dark:text-danger-bright dark:border-danger-dark/30',
    stripClass: 'bg-danger',
  },
};

const QUICK_REJECTION_REASONS = [
  'أحد الأصناف غير متوفر بالمخزن حالياً',
  'العنوان خارج نطاق التوصيل',
  'تعذر التواصل مع العميل لتأكيد الطلب',
  'المحل مغلق مؤقتاً',
];

const PIPELINE_STEPS: Array<{ key: string; label: string; icon: typeof CheckCircle2 }> = [
  { key: 'new', label: 'استلام الطلب', icon: ShoppingBag },
  { key: 'preparing', label: 'التجهيز بالمحل', icon: Package },
  { key: 'ready', label: 'جاهز / مع الدليفري', icon: Truck },
  { key: 'delivered', label: 'تم التسليم', icon: CheckCircle2 },
];

function formatPiasters(piasters: number): string {
  return ((piasters || 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQtyMilli(qtyMilli: number): string {
  const val = (qtyMilli || 0) / 1000;
  return Number.isInteger(val) ? String(val) : val.toFixed(3).replace(/\.?0+$/, '');
}

function formatTimestamp(iso?: string | null): string {
  if (!iso) return 'الآن';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatOrderCode(num: number): string {
  return `#ORD-${String(num || 0).padStart(4, '0')}`;
}

function extractMapsUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/https:\/\/(?:maps\.google\.com|www\.google\.com\/maps)[^\s|]+/i);
  return match ? match[0] : null;
}

function resolvePaymentLabel(item: SyncInboxItem): string {
  const raw = item.order?.payment_method?.trim();
  if (raw) return raw;
  const notes = item.order?.notes || '';
  if (/إنستاباي|انستاباي|instapay/i.test(notes)) return 'إنستاباي';
  if (/فودافون|محافظ|vodafone/i.test(notes)) return 'فودافون كاش';
  return 'كاش عند الاستلام';
}

function extractCleanCustomerNotes(notes?: string | null): string {
  if (!notes) return '';
  const cleaned = notes
    .replace(/طريقة الدفع:\s*[^|]+(\|\s*)?/gi, '')
    .replace(/https:\/\/(?:maps\.google\.com|www\.google\.com\/maps)[^\s|]+/gi, '')
    .replace(/موقع الخريطة:\s*/gi, '')
    .replace(/^\s*[|•-]\s*|\s*[|•-]\s*$/g, '')
    .trim();
  return cleaned;
}

function buildWhatsAppLink(
  phone: string,
  orderNumber: number,
  customerName: string,
  status: string,
  storeSlug: string
): string {
  let clean = (phone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('01') && clean.length === 11) {
    clean = '2' + clean;
  }
  const statusAr = ORDER_STATUS_META[status]?.label || status;
  const trackingUrl = storeSlug ? `https://rafiq-store-web.rafiq-store-api.workers.dev/${storeSlug}` : '';
  const text = `أهلاً بك يا ${customerName}، حالة طلبك رقم ${formatOrderCode(orderNumber)} أصبحت الآن: (${statusAr}).${
    trackingUrl ? ` يمكنك متابعة طلبك عبر: ${trackingUrl}` : ''
  }`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function getPipelineStepIndex(status: string): number {
  switch (status) {
    case 'new':
    case 'viewed':
      return 0;
    case 'accepted':
    case 'preparing':
      return 1;
    case 'ready':
      return 2;
    case 'delivered':
      return 3;
    default:
      return -1;
  }
}

export const OnlineOrdersDispatch: React.FC<Props> = ({
  orders,
  storeSlug,
  loading,
  canProcess,
  canManage = false,
  processingOrderId,
  convertingOrderId,
  printingOrderId,
  soundEnabled,
  purgingOrders = false,
  onToggleSound,
  onRefresh,
  onPurgeOrders,
  onUpdateStatus,
  onConvertToSale,
  onPrintSaleReceipt,
  onOpenExternalUrl,
  onCopySuccess,
  onPreviewReceipt,
}) => {
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [checkedItemsByOrder, setCheckedItemsByOrder] = useState<Record<string, Record<string, boolean>>>({});
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Live KPI counts across all inbox orders
  const counts = useMemo(() => {
    let newCnt = 0;
    let acceptedCnt = 0;
    let preparingCnt = 0;
    let readyCnt = 0;
    let deliveredCnt = 0;
    let rejectedCnt = 0;
    let activeTotalPiasters = 0;
    let invoicedCnt = 0;

    for (const o of orders) {
      const st = o.processStatus;
      if (st === 'new' || st === 'viewed') newCnt++;
      else if (st === 'accepted') acceptedCnt++;
      else if (st === 'preparing') preparingCnt++;
      else if (st === 'ready') readyCnt++;
      else if (st === 'delivered') deliveredCnt++;
      else if (st === 'rejected') rejectedCnt++;

      if (st !== 'rejected') {
        activeTotalPiasters += o.totalPiasters || 0;
      }
      if (o.posInvoiceId) {
        invoicedCnt++;
      }
    }

    return {
      all: orders.length,
      new: newCnt,
      accepted: acceptedCnt,
      preparing: preparingCnt,
      inProgress: acceptedCnt + preparingCnt,
      ready: readyCnt,
      delivered: deliveredCnt,
      rejected: rejectedCnt,
      activeTotalPiasters,
      invoicedCnt,
    };
  }, [orders]);

  // Filtered queue list
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((item) => {
      if (orderFilter !== 'all') {
        if (orderFilter === 'new') {
          if (item.processStatus !== 'new' && item.processStatus !== 'viewed') return false;
        } else if (item.processStatus !== orderFilter) {
          return false;
        }
      }

      if (q) {
        const ordCode = formatOrderCode(item.orderNumber).toLowerCase();
        const matchesNum = ordCode.includes(q) || String(item.orderNumber).includes(q);
        const matchesName = (item.customerName || '').toLowerCase().includes(q);
        const matchesPhone = (item.customerPhone || '').toLowerCase().includes(q);
        const matchesAddr = (item.order?.customer_address || '').toLowerCase().includes(q);
        const matchesItems = Boolean(
          item.order?.items?.some((it) => (it.product_name || '').toLowerCase().includes(q))
        );
        return matchesNum || matchesName || matchesPhone || matchesAddr || matchesItems;
      }

      return true;
    });
  }, [orders, orderFilter, searchQuery]);

  // Keep selectedOrderId valid whenever filter/list updates
  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !filteredOrders.some((o) => o.orderId === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].orderId);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedItem = useMemo(
    () => filteredOrders.find((o) => o.orderId === selectedOrderId) || filteredOrders[0] || null,
    [filteredOrders, selectedOrderId]
  );

  // Reset inline reject box when switching orders
  useEffect(() => {
    setRejectingOrderId(null);
    setRejectionReason('');
  }, [selectedItem?.orderId]);

  const toggleItemPacked = (orderId: string, itemId: string) => {
    setCheckedItemsByOrder((prev) => {
      const curr = prev[orderId] || {};
      return {
        ...prev,
        [orderId]: {
          ...curr,
          [itemId]: !curr[itemId],
        },
      };
    });
  };

  const handleCopyPhone = (phone: string) => {
    if (!phone || !navigator.clipboard) return;
    void navigator.clipboard.writeText(phone).then(() => {
      onCopySuccess(`تم نسخ رقم الهاتف (${phone})`);
    });
  };

  const selectedOrder = selectedItem?.order || null;
  const selectedStatusMeta = selectedItem
    ? ORDER_STATUS_META[selectedItem.processStatus] || ORDER_STATUS_META.new
    : null;
  const selectedItems = selectedOrder?.items || [];
  const selectedCheckedMap = selectedItem ? checkedItemsByOrder[selectedItem.orderId] || {} : {};
  const packedCount = selectedItems.filter((line) => selectedCheckedMap[line.id]).length;
  const packedPct = selectedItems.length > 0 ? Math.round((packedCount / selectedItems.length) * 100) : 0;
  const selectedPaymentLabel = selectedItem ? resolvePaymentLabel(selectedItem) : '';
  const selectedMapsUrl =
    extractMapsUrl(selectedOrder?.customer_address) || extractMapsUrl(selectedOrder?.notes);
  const selectedCleanNotes = extractCleanCustomerNotes(selectedOrder?.notes);
  const selectedStepIdx = selectedItem ? getPipelineStepIndex(selectedItem.processStatus) : -1;

  const isSelectedBusy = Boolean(selectedItem && processingOrderId === selectedItem.orderId);
  const isSelectedConverting = Boolean(selectedItem && convertingOrderId === selectedItem.orderId);
  const isSelectedPrinting = Boolean(selectedItem && printingOrderId === selectedItem.orderId);
  const isRejectingSelected = Boolean(selectedItem && rejectingOrderId === selectedItem.orderId);

  return (
    <div className="h-full flex flex-col gap-3.5 max-w-[90rem] mx-auto">
      {/* 1. Compact 4-Card Operational KPI Ribbon (Clickable Quick Filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setOrderFilter('new')}
          className={`text-right rounded-2xl border p-3.5 transition-colors cursor-pointer ${
            counts.new > 0
              ? 'bg-warn-soft/75 border-warn/40 dark:bg-warn-dark/20 dark:border-warn-bright/35'
              : 'bg-surface border-line hover:border-line-hover dark:bg-surface-dark dark:border-line-dark'
          } ${orderFilter === 'new' ? 'ring-2 ring-brand/30' : ''}`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
            <span>بانتظار التأكيد</span>
            <AlertTriangle className={`w-4 h-4 ${counts.new > 0 ? 'text-warn' : 'opacity-50'}`} />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-ink dark:text-ink-dark tabular-nums">
              {counts.new}
            </span>
            <span className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
              {counts.new > 0 ? 'تحتاج مراجعة الآن' : 'لا توجد طلبات معلقة'}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setOrderFilter('preparing')}
          className={`text-right rounded-2xl border p-3.5 bg-surface dark:bg-surface-dark transition-colors cursor-pointer ${
            orderFilter === 'preparing' || orderFilter === 'accepted'
              ? 'border-brand ring-2 ring-brand/25'
              : 'border-line hover:border-line-hover dark:border-line-dark'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
            <span>قيد التجهيز بالمحل</span>
            <Package className="w-4 h-4 text-brand dark:text-paid-bright" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-brand dark:text-paid-bright tabular-nums">
              {counts.inProgress}
            </span>
            <span className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
              مقبول / جاري التحضير
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setOrderFilter('ready')}
          className={`text-right rounded-2xl border p-3.5 bg-surface dark:bg-surface-dark transition-colors cursor-pointer ${
            orderFilter === 'ready'
              ? 'border-paid ring-2 ring-paid/25'
              : 'border-line hover:border-line-hover dark:border-line-dark'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
            <span>جاهز / مع الدليفري</span>
            <Truck className="w-4 h-4 text-paid dark:text-paid-bright" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-paid dark:text-paid-bright tabular-nums">
              {counts.ready}
            </span>
            <span className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
              {counts.delivered} تم تسليمه
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setOrderFilter('all')}
          className={`text-right rounded-2xl border p-3.5 bg-surface dark:bg-surface-dark transition-colors cursor-pointer ${
            orderFilter === 'all'
              ? 'border-brand ring-2 ring-brand/25'
              : 'border-line hover:border-line-hover dark:border-line-dark'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
            <span>إجمالي طلبات الأونلاين</span>
            <Receipt className="w-4 h-4 text-paid dark:text-paid-bright" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-extrabold text-ink dark:text-ink-dark tabular-nums" dir="ltr">
              {formatPiasters(counts.activeTotalPiasters)} ج.م
            </span>
            <span className="text-micro font-semibold text-paid dark:text-paid-bright">
              {counts.invoicedCnt} مفوتر بالكاشير
            </span>
          </div>
        </button>
      </div>

      {/* 2. Search + Status Filter Pills + Sound/Refresh Utility Bar */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-3 space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="flex-1 min-w-[13.75rem]">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ابحث برقم الأوردر (#ORD)، اسم العميل، الموبايل، أو الصنف..."
              ariaLabel="بحث في طلبات المتجر الإلكتروني"
              size="sm"
            />
          </div>

          {/* Sound Toggle & Manual Refresh */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleSound}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-brand-soft text-brand border-brand/25 dark:bg-brand-dark-soft dark:text-paid-bright dark:border-paid-dark-border'
                  : 'bg-surface-2 text-ink-muted border-line dark:bg-surface-dark-2 dark:text-ink-dark-muted dark:border-line-dark'
              }`}
              title={soundEnabled ? 'التنبيه الصوتي مفعل للطلبات الجديدة' : 'التنبيه الصوتي صامت'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{soundEnabled ? 'تنبيه صوتي' : 'صامت'}</span>
            </button>

            <AppButton variant="subtle" size="sm" icon={RefreshCw} onClick={onRefresh} loading={loading}>
              تحديث
            </AppButton>

            {canManage && onPurgeOrders && (
              <AppButton
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={onPurgeOrders}
                loading={purgingOrders}
                title="تصفير ومسح كافة طلبات المتجر الإلكتروني السحابية والمحلية"
              >
                تصفير الطلبات
              </AppButton>
            )}
          </div>
        </div>

        {/* Status Tabs with Live Counters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="tablist">
          {(
            [
              { id: 'all', label: 'الكل', count: counts.all },
              { id: 'new', label: 'جديدة', count: counts.new },
              { id: 'accepted', label: 'مقبولة', count: counts.accepted },
              { id: 'preparing', label: 'قيد التجهيز', count: counts.preparing },
              { id: 'ready', label: 'جاهزة / بالطريق', count: counts.ready },
              { id: 'delivered', label: 'تم التسليم', count: counts.delivered },
              { id: 'rejected', label: 'مرفوضة', count: counts.rejected },
            ] as Array<{ id: OrderFilter; label: string; count: number }>
          ).map((pill) => {
            const active = orderFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setOrderFilter(pill.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors shrink-0 cursor-pointer ${
                  active
                    ? 'bg-brand text-white border-brand dark:bg-paid dark:border-paid'
                    : 'bg-canvas text-ink-muted border-line hover:bg-surface-2 dark:bg-canvas-dark dark:text-ink-dark-muted dark:border-line-dark dark:hover:bg-surface-dark-2'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-micro font-bold tabular-nums leading-none ${
                    active
                      ? 'bg-white/20 text-white'
                      : pill.id === 'new' && pill.count > 0
                      ? 'bg-warn-soft text-ink dark:bg-warn-dark/30 dark:text-warn-bright'
                      : 'bg-surface-2 text-ink-muted dark:bg-surface-dark-2 dark:text-ink-dark-muted'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Master-Detail Split Fulfillment Workspace */}
      {filteredOrders.length === 0 ? (
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-12 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-paid-bright flex items-center justify-center mb-3">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-ink dark:text-ink-dark mb-1">
            {orders.length === 0
              ? 'لا توجد طلبات أونلاين واردة حتى الآن'
              : 'لا توجد طلبات مطابقة للبحث أو الفلتر المحدد'}
          </h3>
          <p className="text-xs text-ink-muted dark:text-ink-dark-muted max-w-md mx-auto">
            {orders.length === 0
              ? 'بمجرد أن يطلب أي عميل من متجرك الإلكتروني، سيظهر الطلب هنا فوراً لتجهيزه وتحويله لفاتورة كاشير وطباعة البون.'
              : 'جرب مسح كلمة البحث أو اختيار "الكل" لعرض جميع الطلبات.'}
          </p>
          {(searchQuery || orderFilter !== 'all') && (
            <div className="mt-4">
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setOrderFilter('all');
                }}
              >
                عرض جميع الطلبات
              </AppButton>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[20.625rem_minmax(0,1fr)] xl:grid-cols-[23.125rem_minmax(0,1fr)] gap-4 items-start flex-1 min-h-0">
          {/* MASTER PANE (Right): Scrollable High-Scan Orders Queue */}
          <aside className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-300px)] min-h-[23.75rem]">
            <div className="px-3.5 py-2.5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between text-xs">
              <span className="font-bold text-ink dark:text-ink-dark">
                قائمة الطلبات ({filteredOrders.length})
              </span>
              <span className="text-micro text-ink-muted dark:text-ink-dark-muted">الأحدث أولاً</span>
            </div>

            <div className="divide-y divide-line dark:divide-line-dark overflow-y-auto flex-1">
              {filteredOrders.map((item) => {
                const isSelected = selectedItem?.orderId === item.orderId;
                const meta = ORDER_STATUS_META[item.processStatus] || ORDER_STATUS_META.new;
                const payLabel = resolvePaymentLabel(item);
                const hasReceipt = Boolean(item.order?.receipt_image);
                const itemsCount = item.order?.items?.length || 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedOrderId(item.orderId)}
                    className={`w-full text-right p-3.5 transition-colors relative flex flex-col gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-brand-soft/65 dark:bg-brand-dark-soft/45'
                        : 'hover:bg-surface-2/70 dark:hover:bg-surface-dark-2/70'
                    }`}
                  >
                    {/* Color-Coded Right Urgency Accent Strip */}
                    <span
                      className={`absolute top-2 bottom-2 right-0 w-1 rounded-l-full ${
                        isSelected ? 'bg-brand dark:bg-paid-bright' : meta.stripClass
                      }`}
                    />

                    {/* Row 1: Order Code (LTR) + Status Badge */}
                    <div className="flex items-center justify-between gap-2 pr-1.5">
                      <span
                        dir="ltr"
                        className="inline-block text-xs font-extrabold text-ink dark:text-ink-dark tabular-nums"
                      >
                        {formatOrderCode(item.orderNumber)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-micro font-bold border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    {/* Row 2: Customer Name + Total */}
                    <div className="flex items-center justify-between gap-2 pr-1.5">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-ink dark:text-ink-dark truncate">
                          {item.customerName}
                        </div>
                        <div className="text-micro text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5 mt-0.5 truncate">
                          {item.order?.delivery_method === 'pickup' ? (
                            <Store className="w-3 h-3 shrink-0" />
                          ) : (
                            <Truck className="w-3 h-3 shrink-0" />
                          )}
                          <span>{itemsCount} {itemsCount === 1 ? 'صنف' : 'أصناف'}</span>
                          <span>•</span>
                          <span className="truncate">{formatTimestamp(item.receivedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          dir="ltr"
                          className="text-sm font-extrabold text-paid dark:text-paid-bright tabular-nums"
                        >
                          {formatPiasters(item.totalPiasters)} ج.م
                        </span>
                        <ChevronLeft className="w-3.5 h-3.5 text-ink-muted/60" />
                      </div>
                    </div>

                    {/* Row 3: Compact Payment + Receipt + POS Invoice Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap pr-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
                        {payLabel}
                      </span>
                      {hasReceipt && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-paid-bright text-micro font-bold">
                          <ImageIcon className="w-3 h-3" />
                          <span>إيصال</span>
                        </span>
                      )}
                      {item.posInvoiceId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright text-micro font-bold">
                          <FileCheck2 className="w-3 h-3" />
                          <span>مفوتر</span>
                        </span>
                      ) : (
                        (item.processStatus === 'ready' || item.processStatus === 'delivered') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-warn-soft text-ink border border-warn/35 dark:bg-warn-dark/20 dark:text-warn-bright dark:border-warn-bright/30 text-micro font-bold">
                            <AlertTriangle className="w-3 h-3 text-warn dark:text-warn-bright" />
                            <span>بانتظار الفوترة</span>
                          </span>
                        )
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* DETAIL PANE (Left): Full Order Fulfillment & POS Dispatch Inspector */}
          {selectedItem && selectedStatusMeta && (
            <section className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl overflow-hidden flex flex-col">
              {/* Inspector Top Bar */}
              <div className="px-5 py-3.5 bg-surface-2/60 dark:bg-surface-dark-2/70 border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      dir="ltr"
                      className="inline-block text-base font-extrabold text-ink dark:text-ink-dark tabular-nums"
                    >
                      {formatOrderCode(selectedItem.orderNumber)}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${selectedStatusMeta.badgeClass}`}
                    >
                      {selectedStatusMeta.label}
                    </span>
                    {selectedItem.posInvoiceId ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-paid-soft text-paid border border-paid/30 dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border">
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span>مسجل بفاتورة كاشير</span>
                      </span>
                    ) : (
                      (selectedItem.processStatus === 'ready' || selectedItem.processStatus === 'delivered') && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-warn-soft text-ink border border-warn/35 dark:bg-warn-dark/20 dark:text-warn-bright dark:border-warn-bright/30">
                          <AlertTriangle className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
                          <span>بانتظار الفوترة وخصم المخزن</span>
                        </span>
                      )
                    )}
                  </div>
                  <div className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatTimestamp(selectedItem.receivedAt)}</span>
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-ink dark:text-ink-dark">
                      {selectedOrder?.delivery_method === 'pickup' ? (
                        <>
                          <Store className="w-3.5 h-3.5 text-brand dark:text-paid-bright" />
                          <span>استلام من المحل</span>
                        </>
                      ) : (
                        <>
                          <Truck className="w-3.5 h-3.5 text-brand dark:text-paid-bright" />
                          <span>
                            توصيل{selectedOrder?.delivery_zone ? ` إلى ${selectedOrder.delivery_zone}` : ''}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Top Quick Reprint Action (only shown once POS invoice is issued) */}
                {selectedItem.posInvoiceId && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <AppButton
                      variant="secondary"
                      size="sm"
                      icon={Printer}
                      loading={isSelectedPrinting}
                      onClick={() =>
                        void onPrintSaleReceipt(selectedItem.orderId, selectedItem.posInvoiceId!)
                      }
                    >
                      إعادة طباعة الفاتورة
                    </AppButton>
                  </div>
                )}
              </div>

              {/* 4-Stage Visual Fulfillment Stepper OR Rejected Banner */}
              <div className="px-5 py-3.5 border-b border-line dark:border-line-dark bg-canvas/50 dark:bg-canvas-dark/50">
                {selectedItem.processStatus === 'rejected' ? (
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-danger-soft border border-danger/30 text-danger dark:bg-danger-dark/20 dark:text-danger-bright text-xs">
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">تم رفض هذا الطلب</div>
                      {selectedOrder?.rejection_reason && (
                        <div className="mt-0.5 opacity-90">السبب: {selectedOrder.rejection_reason}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {PIPELINE_STEPS.map((step, idx) => {
                      const StepIcon = step.icon;
                      const isDone = selectedStepIdx > idx;
                      const isCurrent = selectedStepIdx === idx;
                      return (
                        <div key={step.key} className="flex flex-col items-center text-center gap-1.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
                              isDone
                                ? 'bg-paid text-white border-paid'
                                : isCurrent
                                ? 'bg-brand text-white border-brand ring-4 ring-brand/15'
                                : 'bg-surface dark:bg-surface-dark text-ink-muted border-line dark:border-line-dark'
                            }`}
                          >
                            {isDone ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                          </div>
                          <span
                            className={`text-micro font-bold leading-tight ${
                              isCurrent
                                ? 'text-brand dark:text-paid-bright'
                                : isDone
                                ? 'text-paid dark:text-paid-bright'
                                : 'text-ink-muted dark:text-ink-dark-muted'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Inspector Scrollable Body */}
              <div className="p-5 space-y-4">
                {/* Customer & Delivery Details Card */}
                <div className="rounded-2xl border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
                        بيانات العميل والتوصيل
                      </div>
                      <div className="text-sm font-extrabold text-ink dark:text-ink-dark mt-0.5">
                        {selectedItem.customerName}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleCopyPhone(selectedItem.customerPhone)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark hover:border-brand/40 transition-colors cursor-pointer"
                        title="نسخ رقم الموبايل"
                      >
                        <Phone className="w-3.5 h-3.5 text-brand dark:text-paid-bright" />
                        <span dir="ltr" className="tabular-nums">
                          {selectedItem.customerPhone}
                        </span>
                        <Copy className="w-3 h-3 text-ink-muted" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenExternalUrl(
                            buildWhatsAppLink(
                              selectedItem.customerPhone,
                              selectedItem.orderNumber,
                              selectedItem.customerName,
                              selectedItem.processStatus,
                              storeSlug
                            )
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-paid text-white hover:opacity-95 text-xs font-bold transition-opacity cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>واتساب</span>
                      </button>
                    </div>
                  </div>

                  {selectedOrder?.customer_address && (
                    <div className="pt-2.5 border-t border-line dark:border-line-dark flex flex-wrap items-start justify-between gap-2 text-xs">
                      <div className="flex items-start gap-1.5 text-ink dark:text-ink-dark flex-1 min-w-[12.5rem]">
                        <MapPin className="w-4 h-4 text-brand dark:text-paid-bright shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{selectedOrder.customer_address}</span>
                      </div>
                      {selectedMapsUrl && (
                        <button
                          type="button"
                          onClick={() => onOpenExternalUrl(selectedMapsUrl)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-paid-bright border border-brand/25 text-micro font-bold hover:opacity-90 cursor-pointer shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>فتح خرائط جوجل</span>
                        </button>
                      )}
                    </div>
                  )}

                  {selectedCleanNotes && (
                    <div className="px-3 py-2 rounded-xl bg-warn-soft/55 dark:bg-warn-dark/15 border border-warn/25 text-xs text-ink dark:text-ink-dark">
                      <span className="font-bold">ملاحظات العميل: </span>
                      <span>{selectedCleanNotes}</span>
                    </div>
                  )}
                </div>

                {/* Interactive Supermarket Picking Checklist */}
                <div className="rounded-2xl border border-line dark:border-line-dark overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                      <Package className="w-4 h-4 text-brand dark:text-paid-bright" />
                      <span>قائمة تجهيز الأصناف ({selectedItems.length})</span>
                    </div>
                    {selectedItems.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted tabular-nums">
                          تم التجهيز: {packedCount} / {selectedItems.length}
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-line dark:bg-line-dark overflow-hidden">
                          <div
                            className="h-full rounded-full bg-paid transition-all duration-200"
                            style={{ width: `${packedPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-line dark:divide-line-dark">
                    {selectedItems.map((line) => {
                      const isChecked = Boolean(selectedCheckedMap[line.id]);
                      return (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => toggleItemPacked(selectedItem.orderId, line.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-paid-soft/45 dark:bg-paid-dark-soft/25'
                              : 'hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? 'bg-paid border-paid text-white'
                                  : 'bg-surface dark:bg-surface-dark border-line-hover dark:border-line-dark'
                              }`}
                            >
                              {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </span>
                            <div className="min-w-0">
                              <div
                                className={`text-xs font-bold truncate ${
                                  isChecked
                                    ? 'line-through text-ink-muted dark:text-ink-dark-muted'
                                    : 'text-ink dark:text-ink-dark'
                                }`}
                              >
                                {line.product_name}
                              </div>
                              <div className="text-micro text-ink-muted dark:text-ink-dark-muted tabular-nums mt-0.5">
                                الكمية: {formatQtyMilli(line.quantity)} ×{' '}
                                <span dir="ltr">{formatPiasters(line.product_price)} ج.م</span>
                              </div>
                            </div>
                          </div>

                          <span
                            dir="ltr"
                            className="text-xs font-extrabold text-ink dark:text-ink-dark tabular-nums shrink-0"
                          >
                            {formatPiasters(line.line_total)} ج.م
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Financial Summary Footer */}
                  <div className="px-4 py-3 bg-canvas dark:bg-canvas-dark border-t border-line dark:border-line-dark space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted">
                      <span>إجمالي الأصناف</span>
                      <span dir="ltr" className="font-bold tabular-nums">
                        {formatPiasters(selectedOrder?.subtotal ?? selectedItem.totalPiasters)} ج.م
                      </span>
                    </div>
                    {(selectedOrder?.delivery_fee ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted">
                        <span>مصاريف التوصيل</span>
                        <span dir="ltr" className="font-bold tabular-nums">
                          {formatPiasters(selectedOrder?.delivery_fee || 0)} ج.م
                        </span>
                      </div>
                    )}
                    <div className="pt-1.5 border-t border-line dark:border-line-dark flex items-center justify-between">
                      <span className="font-extrabold text-ink dark:text-ink-dark">
                        المطلوب تحصيله من العميل
                      </span>
                      <span
                        dir="ltr"
                        className="text-base font-extrabold text-paid dark:text-paid-bright tabular-nums"
                      >
                        {formatPiasters(selectedItem.totalPiasters)} ج.م
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Method, Transfer Receipt & POS Invoice Integration Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Payment & Transfer Receipt */}
                  <div className="rounded-2xl border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-ink dark:text-ink-dark">
                        <CreditCard className="w-4 h-4 text-brand dark:text-paid-bright" />
                        <span>{selectedPaymentLabel}</span>
                      </span>
                      {selectedOrder?.receipt_image && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewReceipt({
                              orderNumber: selectedItem.orderNumber,
                              imageUrl: selectedOrder.receipt_image!,
                              paymentMethod: selectedOrder.payment_method,
                              senderPhone: selectedOrder.sender_phone,
                              paymentRef: selectedOrder.payment_ref,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-paid-bright text-micro font-bold cursor-pointer"
                        >
                          <ZoomIn className="w-3 h-3" />
                          <span>تكبير الإيصال</span>
                        </button>
                      )}
                    </div>

                    {(selectedOrder?.sender_phone || selectedOrder?.payment_ref) && (
                      <div className="space-y-1 text-micro text-ink-muted dark:text-ink-dark-muted">
                        {selectedOrder.sender_phone && (
                          <div className="flex items-center justify-between gap-2">
                            <span>المحوّل منه:</span>
                            <strong dir="ltr" className="font-mono text-ink dark:text-ink-dark">
                              {selectedOrder.sender_phone}
                            </strong>
                          </div>
                        )}
                        {selectedOrder.payment_ref && (
                          <div className="flex items-center justify-between gap-2">
                            <span>الرقم المرجعي:</span>
                            <strong dir="ltr" className="font-mono text-ink dark:text-ink-dark">
                              {selectedOrder.payment_ref}
                            </strong>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedOrder?.receipt_image && (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewReceipt({
                            orderNumber: selectedItem.orderNumber,
                            imageUrl: selectedOrder.receipt_image!,
                            paymentMethod: selectedOrder.payment_method,
                            senderPhone: selectedOrder.sender_phone,
                            paymentRef: selectedOrder.payment_ref,
                          })
                        }
                        className="relative w-full overflow-hidden rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark block cursor-pointer"
                      >
                        <img
                          src={selectedOrder.receipt_image}
                          alt={`إيصال تحويل ${formatOrderCode(selectedItem.orderNumber)}`}
                          className="w-full max-h-32 object-contain bg-surface-2 dark:bg-surface-dark-2"
                          loading="lazy"
                        />
                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-dark/85 text-white text-micro font-bold">
                          <ImageIcon className="w-3 h-3" />
                          <span>معاينة</span>
                        </span>
                      </button>
                    )}
                  </div>

                  {/* POS Cashier Invoice Sync & Inventory Deduction Status (No duplicate button — unified with Dispatch action) */}
                  {(() => {
                    const needsRetroactiveInvoice =
                      !selectedItem.posInvoiceId &&
                      (selectedItem.processStatus === 'ready' || selectedItem.processStatus === 'delivered');

                    return (
                      <div
                        className={`rounded-2xl border p-3.5 flex flex-col justify-between gap-2.5 text-xs ${
                          needsRetroactiveInvoice
                            ? 'border-warn/45 bg-warn-soft/35 dark:bg-warn-dark/15 dark:border-warn-bright/35'
                            : 'border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-ink dark:text-ink-dark">
                            {needsRetroactiveInvoice ? (
                              <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                            ) : (
                              <Sparkles className="w-4 h-4 text-brand dark:text-paid-bright shrink-0" />
                            )}
                            <span>
                              {needsRetroactiveInvoice
                                ? 'بانتظار إصدار فاتورة كاشير محلية'
                                : 'الربط التلقائي مع الكاشير والمخزن'}
                            </span>
                          </div>
                          {selectedItem.posInvoiceId ? (
                            <p className="text-micro text-paid dark:text-paid-bright leading-relaxed font-semibold">
                              تم إصدار فاتورة كاشير رسمية، خصم الأصناف من المخزن، وإضافة المبلغ تلقائياً إلى {selectedPaymentLabel}.
                            </p>
                          ) : selectedItem.processStatus === 'rejected' ? (
                            <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                              الطلب مرفوض — لم يتم خصم أي أصناف من المخزن المحلي أو تسجيل مبالغ.
                            </p>
                          ) : needsRetroactiveInvoice ? (
                            <p className="text-micro text-ink dark:text-ink-dark leading-relaxed">
                              تم تحديث حالة هذا الطلب من لوحة المتجر (الموبايل/الويب) ولم يُفوتر على الكاشير بعد — اضغط الزر أدناه لخصم المخزن وإضافة المبلغ إلى{' '}
                              <strong>{selectedPaymentLabel}</strong> وطباعة البون.
                            </p>
                          ) : (
                            <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                              تلقائي بالكامل: عند الضغط على زر{' '}
                              <strong className="text-ink dark:text-ink-dark">
                                {selectedOrder?.delivery_method === 'pickup'
                                  ? '"جاهز للاستلام وطباعة الفاتورة"'
                                  : '"تسليم للمندوب وطباعة الفاتورة"'}
                              </strong>{' '}
                              يتم خصم المخزن وإضافة المبلغ لـ {selectedPaymentLabel} وطباعة البون بضغطة واحدة.
                            </p>
                          )}
                        </div>

                        {selectedItem.posInvoiceId ? (
                          <div className="inline-flex items-center gap-1.5 text-micro font-bold text-paid dark:text-paid-bright">
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>مفوتر ومخصوم من المخزن</span>
                          </div>
                        ) : (
                          canProcess &&
                          needsRetroactiveInvoice && (
                            <AppButton
                              variant="primary"
                              size="sm"
                              icon={Receipt}
                              loading={isSelectedConverting}
                              onClick={() => void onConvertToSale(selectedItem.orderId, undefined, true)}
                            >
                              إصدار فاتورة كاشير وخصم المخزن وطباعة
                            </AppButton>
                          )
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Inline Rejection Form with Quick Preset Chips */}
                {isRejectingSelected && (
                  <div className="rounded-2xl bg-danger-soft/55 dark:bg-danger-dark/15 border border-danger/30 p-4 space-y-3">
                    <div className="text-xs font-bold text-danger dark:text-danger-bright">
                      اختر سبب رفض الطلب (سيظهر للعميل في شاشة التتبع ويُعاد المخزون السحابي تلقائياً):
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REJECTION_REASONS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRejectionReason(preset)}
                          className={`px-2.5 py-1 rounded-lg text-micro font-semibold border transition-colors cursor-pointer ${
                            rejectionReason === preset
                              ? 'bg-danger text-white border-danger'
                              : 'bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark border-line dark:border-line-dark hover:border-danger/40'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="أو اكتب سبب الرفض هنا..."
                      className="w-full px-3 py-2 text-xs rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-danger/40"
                    />

                    <div className="flex items-center justify-end gap-2">
                      <AppButton
                        variant="subtle"
                        size="sm"
                        onClick={() => {
                          setRejectingOrderId(null);
                          setRejectionReason('');
                        }}
                      >
                        إلغاء
                      </AppButton>
                      <AppButton
                        variant="danger"
                        size="sm"
                        icon={XCircle}
                        loading={isSelectedBusy}
                        onClick={() =>
                          void onUpdateStatus(
                            selectedItem.orderId,
                            'rejected',
                            rejectionReason.trim() || 'تعذر تنفيذ الطلب حالياً'
                          )
                        }
                      >
                        تأكيد رفض الطلب
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky Primary Dispatch Action Footer */}
              {canProcess && selectedItem.processStatus !== 'rejected' && (
                <div className="px-5 py-3.5 bg-surface-2/70 dark:bg-surface-dark-2/80 border-t border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    {(selectedItem.processStatus === 'new' ||
                      selectedItem.processStatus === 'viewed' ||
                      selectedItem.processStatus === 'accepted') &&
                      !isRejectingSelected && (
                        <AppButton
                          variant="danger"
                          size="sm"
                          icon={XCircle}
                          disabled={isSelectedBusy}
                          onClick={() => setRejectingOrderId(selectedItem.orderId)}
                        >
                          رفض الطلب
                        </AppButton>
                      )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {(selectedItem.processStatus === 'new' ||
                      selectedItem.processStatus === 'viewed') && (
                      <AppButton
                        variant="success"
                        size="md"
                        icon={Check}
                        loading={isSelectedBusy}
                        onClick={() => void onUpdateStatus(selectedItem.orderId, 'preparing')}
                      >
                        قبول وبدء التجهيز
                      </AppButton>
                    )}

                    {selectedItem.processStatus === 'accepted' && (
                      <AppButton
                        variant="primary"
                        size="md"
                        icon={Package}
                        loading={isSelectedBusy}
                        onClick={() => void onUpdateStatus(selectedItem.orderId, 'preparing')}
                      >
                        بدء التجهيز بالمحل
                      </AppButton>
                    )}

                    {selectedItem.processStatus === 'preparing' && (
                      <AppButton
                        variant="primary"
                        size="md"
                        icon={selectedOrder?.delivery_method === 'pickup' ? Store : Truck}
                        loading={isSelectedConverting || isSelectedBusy}
                        onClick={() => void onConvertToSale(selectedItem.orderId, 'ready', true)}
                        title="تحويل الطلب للمندوب + تسجيل فاتورة كاشير + خصم المخزن + إضافة المبلغ + طباعة الفاتورة تلقائياً"
                      >
                        {selectedOrder?.delivery_method === 'pickup'
                          ? 'جاهز للاستلام وطباعة الفاتورة'
                          : 'تسليم للمندوب وطباعة الفاتورة'}
                      </AppButton>
                    )}

                    {selectedItem.processStatus === 'ready' && (
                      <AppButton
                        variant="success"
                        size="md"
                        icon={CheckCircle2}
                        loading={isSelectedBusy}
                        onClick={() => void onUpdateStatus(selectedItem.orderId, 'delivered')}
                      >
                        تأكيد التسليم للعميل
                      </AppButton>
                    )}

                    {selectedItem.processStatus === 'delivered' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-paid dark:text-paid-bright">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>اكتمل تسليم هذا الطلب بنجاح</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
