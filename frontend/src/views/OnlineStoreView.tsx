import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  ShoppingBag,
  Settings,
  Activity,
  CheckCircle2,
  Store,
  AlertTriangle,
  Cloud,
  CloudOff,
  UploadCloud,
  Copy,
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { AppButton } from '../components/AppButton';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { UploadCatalogModal } from '../components/onlineStore/UploadCatalogModal';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { OnlineOrdersDispatch, type ReceiptPreviewData } from '../components/onlineStore/OnlineOrdersDispatch';
import { onBridgeEvent } from '../bridge/ipc';
import {
  isOnlineOrderSoundEnabled,
  playOnlineOrderChime,
  setOnlineOrderSoundEnabled,
} from '../utils/onlineOrderSound';
import {
  getOnlineStoreState,
  saveOnlineStoreConfig,
  triggerOnlineStoreSync,
  getOnlineStoreOrders,
  processOnlineStoreOrder,
  convertOnlineOrderToSale,
  printPosSaleReceipt,
  openOnlineStoreExternalUrl,
  purgeOnlineStoreOrders,
} from '../bridge/onlineStoreIpc';
import type { OnlineStoreSubTab, SyncStateDto, SyncInboxItem, CatalogSyncOptions } from '../bridge/onlineStoreIpc';

export type { OnlineStoreSubTab };

export interface OnlineStoreViewProps {
  isActive?: boolean;
  activeSubTab?: OnlineStoreSubTab;
  onStateChange?: (state: SyncStateDto) => void;
}

const SUB_TAB_META: Record<OnlineStoreSubTab, { title: string; subtitle: string; icon: typeof ShoppingBag }> = {
  orders: {
    title: 'الطلبات الواردة',
    subtitle: 'غرفة عمليات تجهيز الطلبات أونلاين وتحويلها لفواتير كاشير وطباعة البون الحراري',
    icon: ShoppingBag,
  },
  status: {
    title: 'حالة المزامنة السحابية',
    subtitle: 'متابعة صندوق الصادر والعمليات المعلقة وسلامة الاتصال مع المتجر الإلكتروني',
    icon: Activity,
  },
  settings: {
    title: 'إعدادات الربط السحابي',
    subtitle: 'التحكم في تشغيل المزامنة، رابط المتجر الإلكتروني، وفترة التحديث التلقائي مع السحابة',
    icon: Settings,
  },
};

const SYNC_INTERVAL_OPTIONS = [
  { value: '60', label: 'كل دقيقة (سريع)' },
  { value: '180', label: 'كل 3 دقائق' },
  { value: '300', label: 'كل 5 دقائق (موصى به)' },
  { value: '600', label: 'كل 10 دقائق' },
  { value: '900', label: 'كل 15 دقيقة (توفير الإنترنت)' },
];

const STATUS_AR_LABELS: Record<string, string> = {
  new: 'طلب جديد',
  viewed: 'تمت المشاهدة',
  accepted: 'مقبول',
  preparing: 'جاري التجهيز',
  ready: 'جاهز / بالطريق',
  delivered: 'تم التسليم',
  rejected: 'مرفوض',
};

function formatTimestamp(iso?: string | null): string {
  if (!iso) return 'لم تتم بعد';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const OnlineStoreView: React.FC<OnlineStoreViewProps> = ({
  isActive,
  activeSubTab = 'orders',
  onStateChange,
}) => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('online_store.manage');
  const canProcess = hasPermission('online_store.process_orders');
  const canSync = hasPermission('online_store.sync');

  const subTab: OnlineStoreSubTab = activeSubTab === 'settings' && !canManage ? 'orders' : activeSubTab;
  const currentTabMeta = SUB_TAB_META[subTab] || SUB_TAB_META.orders;
  const ActiveTabIcon = currentTabMeta.icon;
  const panelMotion = useMotionPanel(subTab);
  const [syncState, setSyncState] = useState<SyncStateDto | null>(null);
  const [orders, setOrders] = useState<SyncInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncMode, setSyncMode] = useState<'sync' | 'full' | null>(null);
  const syncing = syncMode !== null;
  const [savingConfig, setSavingConfig] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [convertingOrderId, setConvertingOrderId] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isOnlineOrderSoundEnabled());
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptPreviewData | null>(null);
  const [showPurgeOrdersConfirm, setShowPurgeOrdersConfirm] = useState(false);
  const [purgingOrders, setPurgingOrders] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  useEffect(() => {
    if (!previewReceipt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewReceipt(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewReceipt]);

  // Settings form state
  const [cfgEnabled, setCfgEnabled] = useState(false);
  const [cfgStoreId, setCfgStoreId] = useState('');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgSlug, setCfgSlug] = useState('');
  const [cfgApiUrl, setCfgApiUrl] = useState('https://rafiq-store-api.rafiqpos.workers.dev/api/v1');
  const [cfgInterval, setCfgInterval] = useState('300');

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [stateRes, ordersRes] = await Promise.all([
        getOnlineStoreState(),
        getOnlineStoreOrders('all', 100),
      ]);
      const nextOrders = Array.isArray(ordersRes) ? ordersRes : [];
      setSyncState(stateRes);
      onStateChange?.(stateRes);
      setOrders(nextOrders);
      if (!silent) {
        setCfgEnabled(stateRes.onlineStoreEnabled);
        setCfgStoreId(stateRes.storeCloudId || '');
        setCfgApiKey(stateRes.syncApiKeyMasked || '');
        setCfgSlug(stateRes.onlineStoreSlug || '');
        setCfgApiUrl(stateRes.cloudApiUrl || 'https://rafiq-store-api.rafiqpos.workers.dev/api/v1');
        setCfgInterval(String(stateRes.syncIntervalSeconds || 300));
      }
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : 'تعذر تحميل بيانات المتجر الإلكتروني';
        setBannerMessage({ type: 'error', text: msg });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onStateChange]);

  useEffect(() => {
    if (!isActive) return;
    setSoundEnabled(isOnlineOrderSoundEnabled());
    void loadData(false);
    // Instant live reload the moment C# SyncEngine receives a new order or a 2-way Web Dashboard status update
    const unsubscribe = onBridgeEvent('onlineStore:ordersSynced', () => {
      void loadData(true);
    });
    const unsubscribeState = onBridgeEvent<SyncStateDto>('onlineStore:stateChanged', (nextState) => {
      if (nextState) {
        setSyncState(nextState);
        onStateChange?.(nextState);
        setCfgEnabled(nextState.onlineStoreEnabled);
      }
    });
    const intervalId = window.setInterval(() => {
      void loadData(true);
    }, 30000);
    return () => {
      unsubscribe();
      unsubscribeState();
      window.clearInterval(intervalId);
    };
  }, [isActive, loadData, onStateChange]);

  const handleManualSync = async (fullCatalog: boolean) => {
    if (!canSync) return;
    setSyncMode(fullCatalog ? 'full' : 'sync');
    setBannerMessage(null);
    try {
      const res = await triggerOnlineStoreSync(fullCatalog);
      if (res.success) {
        const parts: string[] = [];
        if (res.catalogSyncedCount > 0 || fullCatalog) {
          parts.push(`أصناف متوفرة: ${res.catalogSyncedCount}`);
        }
        if ((res.prunedOutOfStockCount ?? 0) > 0) {
          parts.push(`تم تنظيف ${res.prunedOutOfStockCount} صنف منتهي`);
        }
        if (res.stockSyncedCount > 0) {
          parts.push(`تحديث مخزون: ${res.stockSyncedCount}`);
        }
        parts.push(`طلبات جديدة: ${res.newOrdersDownloaded}`);
        setBannerMessage({
          type: 'success',
          text: `${res.message} (${parts.join(' | ')})`,
        });
      } else {
        setBannerMessage({ type: 'error', text: res.message || 'تعذرت المزامنة مع السحابة' });
      }
      await loadData(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء المزامنة';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setSyncMode(null);
    }
  };

  const handleCustomCatalogUpload = async (options: CatalogSyncOptions) => {
    if (!canSync) return;
    setSyncMode('full');
    setBannerMessage(null);
    try {
      const res = await triggerOnlineStoreSync(options);
      if (res.success) {
        const parts: string[] = [];
        if (res.catalogSyncedCount > 0) {
          parts.push(`أصناف مرفوعة: ${res.catalogSyncedCount}`);
        }
        if ((res.prunedOutOfStockCount ?? 0) > 0) {
          parts.push(`تم تنظيف ${res.prunedOutOfStockCount} صنف منتهي`);
        }
        if (res.stockSyncedCount > 0) {
          parts.push(`تحديث مخزون: ${res.stockSyncedCount}`);
        }
        parts.push(`طلبات جديدة: ${res.newOrdersDownloaded}`);
        setBannerMessage({
          type: 'success',
          text: `${res.message} (${parts.join(' | ')})`,
        });
        setIsUploadModalOpen(false);
      } else {
        setBannerMessage({ type: 'error', text: res.message || 'تعذرت المزامنة مع السحابة' });
      }
      await loadData(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء المزامنة';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setSyncMode(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSavingConfig(true);
    setBannerMessage(null);
    try {
      const updated = await saveOnlineStoreConfig({
        onlineStoreEnabled: cfgEnabled,
        storeCloudId: cfgStoreId.trim(),
        syncApiKey: cfgApiKey.trim(),
        onlineStoreSlug: cfgSlug.trim().toLowerCase(),
        cloudApiUrl: cfgApiUrl.trim(),
        syncIntervalSeconds: Number(cfgInterval) || 300,
      });
      setSyncState(updated);
      onStateChange?.(updated);
      setCfgApiKey(updated.syncApiKeyMasked || '');
      setBannerMessage({ type: 'success', text: 'تم حفظ إعدادات الربط السحابي بنجاح.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ إعدادات المتجر الإلكتروني';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string, reason?: string) => {
    if (!canProcess) return;
    setProcessingOrderId(orderId);
    setBannerMessage(null);
    try {
      await processOnlineStoreOrder({
        orderId,
        status,
        rejectionReason: reason,
      });
      setBannerMessage({
        type: 'success',
        text: `تم تحديث حالة الطلب إلى "${STATUS_AR_LABELS[status] || status}" وجاري إبلاغ المتجر الإلكتروني.`,
      });
      await loadData(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحديث حالة الطلب';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleConvertOrderToSale = async (orderId: string, markStatus?: string, autoPrint = false) => {
    if (!canProcess) return;
    setConvertingOrderId(orderId);
    setBannerMessage(null);
    try {
      const res = await convertOnlineOrderToSale({ orderId, markStatus });
      let printNote = '';
      if (autoPrint && res.saleId) {
        try {
          await printPosSaleReceipt(res.saleId);
          printNote = ' وتمت طباعة الفاتورة على الطابعة الحرارية.';
        } catch (printErr: unknown) {
          const pMsg = printErr instanceof Error ? printErr.message : 'تعذرت الطباعة التلقائية';
          printNote = ` (ملاحظة طباعة: ${pMsg} — يمكنك إعادة الطباعة من زر الطباعة).`;
        }
      }

      const prefix =
        markStatus === 'ready'
          ? `تم تسليم الطلب للمندوب، وتسجيل فاتورة كاشير #${res.invoiceNumber} وخصم المخزن وإضافة المبلغ لحسابه`
          : res.alreadyConverted
          ? `الطلب مسجل مسبقاً بفاتورة كاشير رقم #${res.invoiceNumber}`
          : `تم تسجيل فاتورة كاشير رقم #${res.invoiceNumber} وخصم المخزن وإضافة المبلغ بنجاح`;

      setBannerMessage({
        type: 'success',
        text: `${prefix}${printNote || '.'}`,
      });
      await loadData(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحويل الطلب إلى فاتورة كاشير';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setConvertingOrderId(null);
    }
  };

  const handlePrintOrderSaleReceipt = async (orderId: string, saleId: string) => {
    setPrintingOrderId(orderId);
    setBannerMessage(null);
    try {
      const res = await printPosSaleReceipt(saleId);
      setBannerMessage({
        type: 'success',
        text: res?.message || 'تم إرسال فاتورة الطلب إلى الطابعة الحرارية بنجاح.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر طباعة إيصال الفاتورة على الطابعة الحرارية';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setPrintingOrderId(null);
    }
  };

  const handleOpenExternal = (url: string) => {
    void openOnlineStoreExternalUrl(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  const handlePurgeOrders = async () => {
    if (!canManage) return;
    setPurgingOrders(true);
    setBannerMessage(null);
    try {
      const res = await purgeOnlineStoreOrders();
      if (res.success) {
        setBannerMessage({
          type: 'success',
          text: 'تم تصفير ومسح كافة طلبات المتجر الإلكتروني بنجاح (المحلية والسحابية).',
        });
        await loadData(false);
      } else {
        setBannerMessage({
          type: 'error',
          text: 'تعذر تصفير بعض الطلبات، يرجى التحقق من الاتصال والمحاولة ثانية.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تصفير طلبات المتجر الإلكتروني';
      setBannerMessage({ type: 'error', text: msg });
    } finally {
      setPurgingOrders(false);
      setShowPurgeOrdersConfirm(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark overflow-hidden" dir="rtl">
      {/* Top Header */}
      <header className="shrink-0 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-paid-bright border border-brand/20 dark:border-paid-bright/25 flex items-center justify-center shrink-0 shadow-2xs">
            <ActiveTabIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-micro font-bold text-ink-muted dark:text-ink-muted-dark">المتجر الإلكتروني</span>
              <span className="text-ink-muted/60 dark:text-ink-muted-dark/60 font-bold" aria-hidden="true">/</span>
              <h1 className="t-page-title text-ink dark:text-ink-dark m-0 leading-tight truncate">
                {currentTabMeta.title}
              </h1>
              {syncState?.onlineStoreEnabled ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paid-soft text-paid border border-paid/30 dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border">
                  <Cloud className="w-3.5 h-3.5" />
                  مفعل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-ink-muted border border-line dark:bg-surface-dark-2 dark:text-ink-dark-muted dark:border-line-dark">
                  <CloudOff className="w-3.5 h-3.5" />
                  معطل
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5 font-medium truncate">
              {currentTabMeta.subtitle}
              <span className="mx-1.5 opacity-40" aria-hidden="true">•</span>
              آخر مزامنة: {formatTimestamp(syncState?.lastSyncTimestamp)}
              {syncState?.onlineStoreSlug ? ` — رابط المتجر: /${syncState.onlineStoreSlug}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canSync && (
            <>
              <AppButton
                variant="secondary"
                size="sm"
                icon={UploadCloud}
                loading={syncMode === 'full'}
                disabled={!syncState?.onlineStoreEnabled || syncing}
                onClick={() => setIsUploadModalOpen(true)}
                title="تخصيص ورفع أقسام وأصناف المحل إلى المتجر الإلكتروني"
              >
                {syncMode === 'full' ? 'جاري رفع الكتالوج...' : 'رفع الكتالوج'}
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                icon={RefreshCw}
                loading={syncMode === 'sync'}
                disabled={!syncState?.onlineStoreEnabled || syncing}
                onClick={() => handleManualSync(false)}
              >
                {syncMode === 'sync' ? 'جاري المزامنة...' : 'مزامنة الآن'}
              </AppButton>
            </>
          )}
        </div>
      </header>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div className="shrink-0 px-5 pt-3">
          <div
            className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium ${
              bannerMessage.type === 'success'
                ? 'bg-paid-soft text-paid border-paid/30 dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border'
                : 'bg-danger-soft text-danger border-danger/30 dark:bg-danger-dark-soft dark:text-danger-bright dark:border-danger-bright/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {bannerMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{bannerMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-xs underline opacity-80 hover:opacity-100"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-5">
        <div {...panelMotion}>
        {subTab === 'orders' && (
          <OnlineOrdersDispatch
            orders={orders}
            storeSlug={syncState?.onlineStoreSlug || ''}
            loading={loading}
            canProcess={canProcess}
            canManage={canManage}
            processingOrderId={processingOrderId}
            convertingOrderId={convertingOrderId}
            printingOrderId={printingOrderId}
            soundEnabled={soundEnabled}
            purgingOrders={purgingOrders}
            onToggleSound={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              setOnlineOrderSoundEnabled(next);
              if (next) playOnlineOrderChime();
            }}
            onRefresh={() => void loadData(false)}
            onPurgeOrders={() => setShowPurgeOrdersConfirm(true)}
            onUpdateStatus={handleUpdateOrderStatus}
            onConvertToSale={handleConvertOrderToSale}
            onPrintSaleReceipt={handlePrintOrderSaleReceipt}
            onOpenExternalUrl={handleOpenExternal}
            onCopySuccess={(msg) => setBannerMessage({ type: 'success', text: msg })}
            onPreviewReceipt={setPreviewReceipt}
          />
        )}

        {subTab === 'settings' && canManage && (
          <form onSubmit={handleSaveConfig} className="max-w-2xl mx-auto bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-5 space-y-5">
            {/* 1. Master Cloud Sync Toggle */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-line dark:border-line-dark">
              <div>
                <h2 className="text-sm font-bold text-ink dark:text-ink-dark">تفعيل المزامنة السحابية للمتجر الإلكتروني</h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                  يعمل النظام أوفلاين كالمعتاد؛ وعند توفر الإنترنت تتم المزامنة في الخلفية دون التأثير على سرعة الكاشير.
                </p>
              </div>
              <ToggleSwitch checked={cfgEnabled} onChange={setCfgEnabled} />
            </div>

            {/* 2. Automatic License Link & Store Public URL Card */}
            <div className="rounded-xl border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-brand dark:text-paid-bright shrink-0" />
                  <span className="text-xs font-bold text-ink dark:text-ink-dark">رابط المتجر الإلكتروني المباشر</span>
                </div>
                {cfgStoreId ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-paid-soft text-paid border border-paid/30 dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    مربوط تلقائياً بالترخيص
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-warn-soft text-ink border border-warn/30 dark:bg-warn-dark/20 dark:text-warn-bright">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    بانتظار التفعيل من لوحة التراخيص
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  readOnly
                  value={
                    cfgSlug
                      ? `https://store.rafiqpos.workers.dev/${cfgSlug}`
                      : 'يتزامن تلقائياً فور تفعيل المتجر من لوحة التراخيص'
                  }
                  className="flex-1 min-w-[12.5rem] px-3 py-2 text-xs font-mono rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark select-all focus:outline-none"
                />
                {cfgSlug && (
                  <>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      icon={Copy}
                      onClick={() => {
                        const url = `https://store.rafiqpos.workers.dev/${cfgSlug}`;
                        if (navigator.clipboard) {
                          void navigator.clipboard.writeText(url).then(() => {
                            setBannerMessage({ type: 'success', text: 'تم نسخ رابط المتجر الإلكتروني بنجاح.' });
                          });
                        }
                      }}
                    >
                      نسخ الرابط
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      icon={ExternalLink}
                      onClick={() => {
                        const url = `https://store.rafiqpos.workers.dev/${cfgSlug}`;
                        void openOnlineStoreExternalUrl(url).catch(() => {
                          window.open(url, '_blank', 'noopener,noreferrer');
                        });
                      }}
                    >
                      فتح المتجر
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      icon={Settings}
                      onClick={() => {
                        const url = `https://store.rafiqpos.workers.dev/${cfgSlug}/admin`;
                        void openOnlineStoreExternalUrl(url).catch(() => {
                          window.open(url, '_blank', 'noopener,noreferrer');
                        });
                      }}
                    >
                      لوحة تحكم المتجر
                    </AppButton>
                  </>
                )}
              </div>

              <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                يتم ضبط بيانات الربط السحابي ومفاتيح الأمان تلقائياً ومشفراً من لوحة التراخيص لحماية متجرك ومنع أي تعطل غير مقصود.
              </p>
            </div>

            {/* 3. Sync Interval */}
            <div className="max-w-sm">
              <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1.5">
                فترة المزامنة التلقائية
              </label>
              <CustomSelect
                value={cfgInterval}
                onChange={setCfgInterval}
                options={SYNC_INTERVAL_OPTIONS}
              />
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1.5">
                تحدد سرعة تحديث المخزون والأسعار وسحب الطلبات الجديدة في الخلفية عند توفر الإنترنت.
              </p>
            </div>

            {/* 4. Save Action + Subtle Read-Only Technical Support ID */}
            <div className="pt-3 border-t border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-3">
              {cfgStoreId ? (
                <div className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                  <span>معرّف الدعم الفني:</span>
                  <code className="font-mono bg-surface-2 dark:bg-surface-dark-2 px-2 py-0.5 rounded-md border border-line dark:border-line-dark select-all" dir="ltr">
                    {cfgStoreId.slice(0, 8)}...{cfgStoreId.slice(-4)}
                  </code>
                  <button
                    type="button"
                    title="نسخ المعرّف الكامل للدعم الفني"
                    onClick={() => {
                      if (navigator.clipboard) {
                        void navigator.clipboard.writeText(cfgStoreId).then(() => {
                          setBannerMessage({ type: 'success', text: 'تم نسخ معرّف الدعم الفني.' });
                        });
                      }
                    }}
                    className="p-1 rounded-lg hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-paid-bright transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div />
              )}

              <AppButton type="submit" variant="primary" size="md" loading={savingConfig}>
                حفظ إعدادات المتجر الإلكتروني
              </AppButton>
            </div>
          </form>
        )}

        {subTab === 'status' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4">
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">تغييرات بانتظار الرفع للسحابة</p>
                <p className="text-2xl font-extrabold text-ink dark:text-ink-dark mt-1 tabular-nums">
                  {syncState?.pendingOutboxCount ?? 0}
                </p>
              </div>
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4">
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">طلبات أونلاين جديدة</p>
                <p className="text-2xl font-extrabold text-brand dark:text-paid-bright mt-1 tabular-nums">
                  {syncState?.newOrdersCount ?? 0}
                </p>
              </div>
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4">
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted">عمليات فشلت وتُعاد تلقائياً</p>
                <p className="text-2xl font-extrabold text-danger dark:text-danger-bright mt-1 tabular-nums">
                  {syncState?.failedOutboxCount ?? 0}
                </p>
              </div>
            </div>

            {syncState?.lastError && (
              <div className="bg-danger-soft dark:bg-danger-dark/20 border border-danger/30 rounded-2xl p-4 text-xs text-danger dark:text-danger-bright">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>آخر ملاحظة اتصال سحابي:</span>
                </div>
                <p dir="ltr" className="font-mono break-all">{syncState.lastError}</p>
              </div>
            )}

            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 text-xs text-ink-muted dark:text-ink-dark-muted space-y-1.5">
              <p className="font-bold text-ink dark:text-ink-dark">ضمانات الأمان والاستقرار الأوفلاين:</p>
              <p>1. يعمل محرك المزامنة في مسار خلفي منخفض الأولوية ويتوقف مؤقتاً عند انشغال الكاشير بعملية بيع.</p>
              <p>2. عند انقطاع الإنترنت أو الكهرباء، تُحفظ كل التغييرات في صندوق الصادر المحلي وتُستكمل تلقائياً عند العودة.</p>
              <p>3. الأسعار والمخزون تُحسب دائماً بالقروش والمللي-وحدات كأعداد صحيحة دون أي أخطاء كسرية.</p>
              <p>4. يتم رفع الأصناف المتوفرة بالمخزن فقط تلقائياً وإزالة أو إخفاء الأصناف المنتهية لتقليل الحجم والحفاظ على سرعة المتجر.</p>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Receipt Image Lightbox Modal */}
      {previewReceipt && (
        <div
          onClick={() => setPreviewReceipt(null)}
          className="fixed inset-0 z-50 bg-ink/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="px-4 py-3 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-brand dark:text-paid-bright shrink-0" />
                  <span>
                    إيصال التحويل — طلب{' '}
                    <span className="tabular-nums" dir="ltr">
                      #ORD-{String(previewReceipt.orderNumber).padStart(4, '0')}
                    </span>
                  </span>
                </h3>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5 truncate">
                  {previewReceipt.paymentMethod || 'دفع إلكتروني'}
                  {previewReceipt.senderPhone ? ` • ${previewReceipt.senderPhone}` : ''}
                  {previewReceipt.paymentRef ? ` • المرجع: ${previewReceipt.paymentRef}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted hover:text-ink dark:text-ink-dark-muted dark:hover:text-ink-dark transition-colors"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-canvas dark:bg-canvas-dark overflow-auto flex-1 flex items-center justify-center">
              <img
                src={previewReceipt.imageUrl}
                alt={`إيصال تحويل طلب #ORD-${String(previewReceipt.orderNumber).padStart(4, '0')}`}
                className="max-w-full max-h-[72vh] object-contain rounded-xl border border-line dark:border-line-dark bg-surface"
              />
            </div>
          </div>
        </div>
      )}
      {/* Confirm Purge Orders Modal */}
      <ConfirmModal
        isOpen={showPurgeOrdersConfirm}
        title="تصفير ومسح طلبات المتجر الإلكتروني"
        message="هل أنت متأكد من رغبتك في حذف وتصفير كافة طلبات المتجر الإلكتروني الواردة؟"
        consequence="سيتم حذف جميع الطلبات المحلية والسحابية وتصفير العداد إلى الصفر، ولا يمكن التراجع عن هذه الخطوة."
        confirmText="تصفير وحذف الكل"
        cancelText="تراجع"
        isDanger={true}
        onConfirm={() => void handlePurgeOrders()}
        onCancel={() => setShowPurgeOrdersConfirm(false)}
      />
      {/* Upload Catalog Custom Modal */}
      <UploadCatalogModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onConfirmUpload={handleCustomCatalogUpload}
        isUploading={syncMode === 'full'}
      />
    </div>
  );
};

export default OnlineStoreView;
