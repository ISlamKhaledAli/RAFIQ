import React, { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  RotateCcw,
  X,
  AlertCircle,
  Printer,
  Check,
  CheckCircle2,
  Lock,
  ShoppingBag,
  CreditCard,
  Banknote,
  FileText,
  AlertTriangle,
  Minus,
  Plus,
  Smartphone,
  Landmark,
  Wallet
} from 'lucide-react';
import { SearchInput } from './SearchInput';
import type { Sale, Return, Product } from '../types/models';
import { extractProducts } from '../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';
import { parseInvoiceBarcode } from '../utils/invoiceBarcode';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useAuth } from '../context/useAuth';
import { createAttemptKey } from '../utils/idempotency';
import {
  REFUND_METHOD_LABELS,
  REFUND_METHOD_DONE_LABELS,
  describeRefund,
  toRefundMethodKey as toRefundKey,
  type RefundMethodKey
} from '../utils/refundMethods';
import { RequiredMark } from './RequiredMark';

import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';
import { useMotionPanel } from '../hooks/useMotionPanel';
interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSale?: Sale | null;
  onReturnCompleted?: (ret: Return) => void;
}

interface ReturnItemDraft {
  saleItemId?: string;
  productId: string;
  productName: string;
  unitPricePiasters: number;
  originalQuantityPieces: number;
  previouslyReturnedPieces: number;
  returnQuantityPieces: number;
  isDamaged: boolean;
  notes?: string;
}

// The refund follows the original tender: only methods that really paid the invoice are offered
interface RefundOption {
  method: RefundMethodKey;
  // null: the server decides (only when the caps call is unavailable and the invoice is a credit invoice)
  capPiasters: number | null;
}

interface RefundPart {
  method: RefundMethodKey;
  amountPiasters: number;
}

type ReturnWithRefunds = Return & { refunds?: { method: string; amountPiasters: number }[] | null };

// Server-computed remaining refundable amount per original tender (returns:getForSale with includeCaps)
interface RefundCapsPayload {
  cashPiasters: number;
  cardPiasters: number;
  instapayPiasters: number;
  walletPiasters: number;
  creditAllowed: boolean;
  remainingPiasters: number;
}

function refundOptionsFromCaps(caps: RefundCapsPayload): RefundOption[] {
  const options: RefundOption[] = [];
  if (caps.cashPiasters > 0) options.push({ method: 'cash', capPiasters: caps.cashPiasters });
  if (caps.cardPiasters > 0) options.push({ method: 'card', capPiasters: caps.cardPiasters });
  if (caps.instapayPiasters > 0) options.push({ method: 'instapay', capPiasters: caps.instapayPiasters });
  if (caps.walletPiasters > 0) options.push({ method: 'wallet', capPiasters: caps.walletPiasters });
  if (caps.creditAllowed) options.push({ method: 'credit', capPiasters: caps.remainingPiasters });
  return options;
}

const REFUND_ORDER: RefundMethodKey[] = ['cash', 'card', 'instapay', 'wallet', 'credit'];

const REFUND_ICONS: Record<RefundMethodKey, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  instapay: Landmark,
  wallet: Smartphone,
  credit: Wallet
};

const NO_INVOICE_REFUND_OPTIONS: RefundOption[] = [
  { method: 'cash', capPiasters: null },
  { method: 'credit', capPiasters: null }
];

function computeRefundOptions(sale: Sale | null, pastReturns: ReturnWithRefunds[]): RefundOption[] {
  if (!sale) return NO_INVOICE_REFUND_OPTIONS;

  const paid: Record<RefundMethodKey, number> = { cash: 0, card: 0, instapay: 0, wallet: 0, credit: 0 };
  const payments = sale.payments || [];
  const creditInvolved =
    toRefundKey(sale.paymentMethod) === 'credit' ||
    payments.some((p) => toRefundKey(p.method) === 'credit') ||
    (sale.paidPiasters || 0) < sale.totalPiasters;
  if (payments.length > 0) {
    payments.forEach((p) => {
      const key = toRefundKey(p.method);
      if (key && key !== 'credit') paid[key] += p.amountPiasters;
    });
    paid.cash = Math.max(0, paid.cash - (sale.changePiasters || 0));
  } else {
    const key = toRefundKey(sale.paymentMethod);
    if (key === 'cash' || key === 'credit') {
      paid.cash = Math.max(0, (sale.paidPiasters || 0) - (sale.changePiasters || 0));
    } else if (key) {
      paid[key] = Math.max(0, sale.paidPiasters || 0);
    }
  }

  const refunded: Record<RefundMethodKey, number> = { cash: 0, card: 0, instapay: 0, wallet: 0, credit: 0 };
  pastReturns.forEach((ret) => {
    const parts = ret.refunds && ret.refunds.length > 0
      ? ret.refunds
      : [{ method: ret.refundMethod, amountPiasters: ret.totalPiasters }];
    parts.forEach((part) => {
      const key = toRefundKey(part.method);
      if (key) refunded[key] += part.amountPiasters;
    });
  });

  const options: RefundOption[] = [];
  REFUND_ORDER.forEach((method) => {
    if (method === 'credit') return;
    if (paid[method] <= 0) return;
    // A credit invoice may also hold cash collected later as debt settlements, which only the server can see
    if (method === 'cash' && creditInvolved) {
      options.push({ method, capPiasters: null });
      return;
    }
    const remaining = paid[method] - refunded[method];
    if (remaining > 0) options.push({ method, capPiasters: remaining });
  });
  if (sale.customerId && sale.customerId !== 'cust_general_cash') {
    options.push({ method: 'credit', capPiasters: null });
  }
  return options;
}

// One part when the chosen method covers the whole refund; otherwise the chosen method first, then the others in order
function planRefund(total: number, options: RefundOption[], preferred: RefundMethodKey): RefundPart[] | null {
  if (total <= 0) return [];
  const chosen = options.find((o) => o.method === preferred) || options[0];
  if (!chosen) return null;
  if (chosen.capPiasters === null || total <= chosen.capPiasters) {
    return [{ method: chosen.method, amountPiasters: total }];
  }
  const parts: RefundPart[] = [{ method: chosen.method, amountPiasters: chosen.capPiasters }];
  let remaining = total - chosen.capPiasters;
  REFUND_ORDER.forEach((method) => {
    if (remaining <= 0 || method === chosen.method) return;
    const option = options.find((o) => o.method === method);
    if (!option) return;
    const take = option.capPiasters === null ? remaining : Math.min(option.capPiasters, remaining);
    if (take <= 0) return;
    parts.push({ method, amountPiasters: take });
    remaining -= take;
  });
  return remaining > 0 ? null : parts;
}

const FIELD =
  'w-full h-11 px-3.5 text-sm bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted/60 focus:outline-none focus:border-warn dark:focus:border-warn-bright focus:ring-2 focus:ring-warn/20 transition-colors';
const TAB_ACTIVE =
  'bg-warn-bright dark:bg-warn-dark-soft text-ink dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40 shadow-xs';
const TAB_IDLE =
  'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark';
const STEP_CARD = 'rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-5 flex flex-col gap-4';

const StepHeader = ({ step, title, aside }: { step: number; title: string; aside?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-7 h-7 shrink-0 rounded-full bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/40 text-warn dark:text-warn-bright text-sm font-black tabular-nums flex items-center justify-center">
        {step}
      </span>
      <h3 className="t-card-title text-ink dark:text-ink-dark m-0">{title}</h3>
    </div>
    {aside}
  </div>
);

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <div className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</div>
    <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-ink dark:text-ink-dark break-words">{value}</div>
  </div>
);

const SummaryRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 text-sm">
    <span className="text-ink-muted dark:text-ink-dark-muted">{label}</span>
    <span className="font-bold text-ink dark:text-ink-dark text-left">{children}</span>
  </div>
);

interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  max: number;
}

const QtyStepper = ({ value, onChange, max }: QtyStepperProps) => (
  <div className="flex items-center rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 shrink-0">
    <button
      type="button"
      onClick={() => onChange(value - 1)}
      aria-label="إنقاص الكمية"
      title="إنقاص الكمية"
      className="w-10 h-10 flex items-center justify-center rounded-r-lg text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer"
    >
      <Minus className="w-4 h-4" />
    </button>
    <input
      type="text"
      inputMode="decimal"
      aria-label="الكمية المرتجعة"
      value={value}
      onChange={(e) => {
        const raw = parseFloat(normalizeArabicNumerals(e.target.value)) || 0;
        onChange(Math.min(max, Math.max(0, raw)));
      }}
      className="w-16 h-10 text-center font-mono font-extrabold text-sm tabular-nums bg-transparent text-ink dark:text-ink-dark border-x border-line dark:border-line-dark focus:outline-none focus:bg-warn-soft dark:focus:bg-warn-dark-soft"
    />
    <button
      type="button"
      onClick={() => onChange(value + 1)}
      aria-label="زيادة الكمية"
      title="زيادة الكمية"
      className="w-10 h-10 flex items-center justify-center rounded-l-lg text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer"
    >
      <Plus className="w-4 h-4" />
    </button>
  </div>
);

export const ReturnModal: React.FC<ReturnModalProps> = ({
  isOpen,
  onClose,
  initialSale,
  onReturnCompleted
}) => {
  const { hasPermission, isAdmin, isRoot } = useAuth();
  const canReturnWithoutInvoice = isRoot || isAdmin || hasPermission('returns.without_invoice');

  const [mode, setMode] = useState<'withInvoice' | 'withoutInvoice'>('withInvoice');
  const motionPanel = useMotionPanel(mode);
  const [invoiceQuery, setInvoiceQuery] = useState<string>(() => (initialSale?.invoiceNumber ? String(initialSale.invoiceNumber) : ''));
  const [loadedSale, setLoadedSale] = useState<Sale | null>(() => initialSale || null);
  const [searchingSale, setSearchingSale] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  // Return items state
  const [draftItems, setDraftItems] = useState<ReturnItemDraft[]>(() => {
    if (!initialSale || !initialSale.items) return [];
    return initialSale.items.map((item) => ({
      saleItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      unitPricePiasters: item.unitPricePiasters,
      originalQuantityPieces: item.quantityMilli / 1000,
      previouslyReturnedPieces: (item.returnedQuantityMilli || 0) / 1000,
      returnQuantityPieces: 0,
      isDamaged: false
    }));
  });
  const [reason, setReason] = useState<string>('مرتجع من العميل');
  const [refundOptions, setRefundOptions] = useState<RefundOption[]>(() => computeRefundOptions(initialSale || null, []));
  const [refundMethod, setRefundMethod] = useState<RefundMethodKey>(() => computeRefundOptions(initialSale || null, [])[0]?.method || 'cash');
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [printNotice, setPrintNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [completedReturn, setCompletedReturn] = useState<Return | null>(null);
  // A retry after a timeout reuses the key so the server never refunds the same return twice
  const returnAttemptRef = useRef(createAttemptKey('ret'));
  const [drawerBalance, setDrawerBalance] = useState<number | null>(null);

  // Without-invoice product search state
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);

  useEffect(() => {
    if (isOpen) {
      invoke<{ availableCashPiasters: number }>('drawer:getBalance')
        .then((res) => {
          if (res && typeof res.availableCashPiasters === 'number') {
            setDrawerBalance(res.availableCashPiasters);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const setupDraftFromSale = async (sale: Sale) => {
    setLoadedSale(sale);
    setInvoiceQuery(sale.invoiceNumber ? String(sale.invoiceNumber) : '');
    setSaleError(null);

    let returnedQtyMap: Record<string, number> = {};
    let pastReturnList: ReturnWithRefunds[] = [];
    let caps: RefundCapsPayload | null = null;
    try {
      if (sale.id) {
        // The server computes what each original tender can still refund with the same rules returns:create enforces
        const response = await invoke<ReturnWithRefunds[] | { returns: ReturnWithRefunds[]; caps: RefundCapsPayload }>('returns:getForSale', { saleId: sale.id, includeCaps: true });
        const pastReturns = Array.isArray(response) ? response : (response?.returns || []);
        caps = Array.isArray(response) ? null : (response?.caps || null);
        if (pastReturns.length > 0) {
          pastReturnList = pastReturns;
          pastReturns.forEach((ret) => {
            (ret.items || []).forEach((ritem) => {
              const key = ritem.saleItemId || `${ritem.productId}_${ritem.unit || ''}`;
              returnedQtyMap[key] = (returnedQtyMap[key] || 0) + (ritem.quantityMilli / 1000);
              returnedQtyMap[ritem.productId] = (returnedQtyMap[ritem.productId] || 0) + (ritem.quantityMilli / 1000);
            });
          });
        }
      }
    } catch {
      // ignore
    }

    const options = caps ? refundOptionsFromCaps(caps) : computeRefundOptions(sale, pastReturnList);
    setRefundOptions(options);
    setRefundMethod(options[0]?.method || 'cash');

    const drafts: ReturnItemDraft[] = (sale.items || []).map((item) => {
      const key = item.id || `${item.productId}_${item.unit || ''}`;
      const prevReturned = (returnedQtyMap[key] !== undefined)
        ? returnedQtyMap[key]
        : ((returnedQtyMap[item.productId] !== undefined) ? returnedQtyMap[item.productId] : ((item.returnedQuantityMilli || 0) / 1000));
      const effectiveUnitPrice = (item.quantityMilli > 0 && item.totalPiasters > 0)
        ? Math.round((item.totalPiasters * 1000) / item.quantityMilli)
        : item.unitPricePiasters;

      return {
        saleItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        unitPricePiasters: effectiveUnitPrice,
        originalQuantityPieces: item.quantityMilli / 1000,
        previouslyReturnedPieces: prevReturned,
        returnQuantityPieces: 0,
        isDamaged: false
      };
    });
    setDraftItems(drafts);
  };

  const fetchAndSetupSale = async (sale: Sale) => {
    setSearchingSale(true);
    setSaleError(null);
    try {
      const fullSale = sale.invoiceNumber 
        ? await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: sale.invoiceNumber })
        : (sale.id ? await invoke<Sale>('sales:getById', { id: sale.id }) : null);
      if (fullSale && fullSale.id && fullSale.items && fullSale.items.length > 0) {
        await setupDraftFromSale(fullSale);
      } else {
        await setupDraftFromSale(sale);
      }
    } catch {
      await setupDraftFromSale(sale);
    } finally {
      setSearchingSale(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      returnAttemptRef.current.complete();
      if (initialSale) {
        setMode('withInvoice');
        setInvoiceQuery(initialSale.invoiceNumber ? String(initialSale.invoiceNumber) : '');
        setCompletedReturn(null);
        setPrintNotice(null);
        setSubmitError(null);
        setSaleError(null);

        if (initialSale.items && initialSale.items.length > 0) {
          void setupDraftFromSale(initialSale);
        } else {
          void fetchAndSetupSale(initialSale);
        }
      } else {
        setMode('withInvoice');
        setInvoiceQuery('');
        setLoadedSale(null);
        setDraftItems([]);
        setRefundOptions(NO_INVOICE_REFUND_OPTIONS);
        setRefundMethod('cash');
        setCompletedReturn(null);
        setPrintNotice(null);
        setSubmitError(null);
        setSaleError(null);
      }
    }
  }, [isOpen, initialSale]);

  const handleSearchInvoice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = invoiceQuery.trim().replace(/^#/, '');
    if (!query) return;

    setSearchingSale(true);
    setSaleError(null);
    try {
      const invMatch = parseInvoiceBarcode(query);
      const num = invMatch?.invoiceNumber || parseInt(query, 10);
      let sale: Sale | null = null;
      if (!isNaN(num) && num > 0) {
        sale = await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: num });
      }
      if (!sale && invMatch?.rawId) {
        sale = await invoke<Sale>('sales:getById', { id: invMatch.rawId });
      }
      if (!sale) {
        const found = await invoke<Sale[]>('sales:search', { query, limit: 1 });
        if (found && found.length > 0) sale = found[0];
      }

      if (sale && sale.id) {
        if (sale.status === 'cancelled') {
          setSaleError('هذه الفاتورة ملغاة بالفعل، ولا يمكن عمل مرتجع لها.');
          return;
        }
        void setupDraftFromSale(sale);
      } else {
        setSaleError(`لم يتم العثور على أي فاتورة برقم "${query}"`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر البحث عن الفاتورة';
      setSaleError(msg);
    } finally {
      setSearchingSale(false);
    }
  };

  // Live product search for without-invoice mode
  const handleSearchCatalog = async (query: string) => {
    setCatalogQuery(query);
    if (!query.trim()) {
      setCatalogResults([]);
      return;
    }
    setSearchingCatalog(true);
    try {
      const res = await invoke<unknown>('products:search', { query: query.trim(), limit: 8 });
      setCatalogResults(extractProducts(res));
    } catch {
      setCatalogResults([]);
    } finally {
      setSearchingCatalog(false);
    }
  };

  const addCatalogProductToDraft = (p: Product) => {
    setDraftItems((prev) => {
      const exists = prev.find((d) => d.productId === p.id);
      if (exists) return prev;
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          unitPricePiasters: p.pricePiasters,
          originalQuantityPieces: 9999,
          previouslyReturnedPieces: 0,
          returnQuantityPieces: 1,
          isDamaged: false
        }
      ];
    });
    setCatalogQuery('');
    setCatalogResults([]);
  };

  const updateItemQty = (index: number, qty: number) => {
    setDraftItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const maxAllowed = item.originalQuantityPieces - item.previouslyReturnedPieces;
      const safeQty = Math.max(0, Math.min(qty, maxAllowed));
      updated[index] = { ...item, returnQuantityPieces: safeQty };
      return updated;
    });
  };

  const toggleItemDamaged = (index: number) => {
    setDraftItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      updated[index] = { ...item, isDamaged: !item.isDamaged };
      return updated;
    });
  };

  const activeReturnItems = draftItems.filter((d) => d.returnQuantityPieces > 0);
  const totalRefundPiasters = activeReturnItems.reduce(
    (sum, item) => sum + Math.round(item.unitPricePiasters * item.returnQuantityPieces),
    0
  );

  const effectiveRefundOptions = mode === 'withoutInvoice' ? NO_INVOICE_REFUND_OPTIONS : refundOptions;
  const selectedRefundMethod: RefundMethodKey = effectiveRefundOptions.some((o) => o.method === refundMethod)
    ? refundMethod
    : (effectiveRefundOptions[0]?.method || 'cash');
  const refundPlan = planRefund(totalRefundPiasters, effectiveRefundOptions, selectedRefundMethod);
  const cashRefundPiasters = (refundPlan || []).reduce((sum, part) => sum + (part.method === 'cash' ? part.amountPiasters : 0), 0);

  const handleSubmitReturn = async () => {
    if (activeReturnItems.length === 0) {
      setSubmitError('يرجى تحديد كمية صنف واحد على الأقل للمرتجع');
      return;
    }

    if (mode === 'withoutInvoice' && !supervisorPin.trim()) {
      setSubmitError('المرتجع بدون فاتورة يتطلب إدخال الرقم السري للمشرف');
      return;
    }

    if (!refundPlan || refundPlan.length === 0) {
      setSubmitError('طرق الدفع المتاحة في الفاتورة الأصلية لا تكفي لصرف قيمة المرتجع. اختر عميلاً مسجلاً للخصم من حسابه أو قلل الكمية.');
      return;
    }

    setLoading(true);
    setSubmitError(null);
    try {
      if (cashRefundPiasters > 0 && drawerBalance !== null && cashRefundPiasters > drawerBalance) {
        setSubmitError(`رصيد نقدية الدرج المتاح حالياً (${formatArabicCurrency(drawerBalance)}) غير كافٍ لصرف قيمة المرتجع نقداً (${formatArabicCurrency(cashRefundPiasters)}). يرجى اختيار 'خصم من حسابه الشكك' أو توريد نقدية للدرج أولاً.`);
        setLoading(false);
        return;
      }

      const payload = {
        saleId: loadedSale?.id || undefined,
        reason: reason.trim() || 'مرتجع أصناف',
        refundMethod: refundPlan[0].method,
        // Split refund: the last part carries amount 0 so the server gives it the exact remainder of its own total
        refunds: refundPlan.length > 1
          ? refundPlan.map((part, index) => ({ method: part.method, amountPiasters: index === refundPlan.length - 1 ? 0 : part.amountPiasters }))
          : undefined,
        supervisorPin: supervisorPin.trim() || undefined,
        idempotencyKey: returnAttemptRef.current.current(),
        items: activeReturnItems.map((item) => ({
          saleItemId: item.saleItemId,
          productId: item.productId,
          productName: item.productName,
          quantityMilli: Math.round(item.returnQuantityPieces * 1000),
          unitPricePiasters: item.unitPricePiasters,
          totalPiasters: Math.round(item.unitPricePiasters * item.returnQuantityPieces),
          isDamaged: item.isDamaged,
          notes: item.isDamaged ? 'صنف تالف' : undefined
        }))
      };

      const result = await invoke<ReturnWithRefunds>('returns:create', payload);
      if (result && result.id) {
        returnAttemptRef.current.complete();
        setCompletedReturn(result);
        if (onReturnCompleted) onReturnCompleted(result);
        // Automatically attempt receipt print
        try {
          await invoke('returns:printReceipt', { returnId: result.id });
        } catch (printErr: unknown) {
          // The return is already saved: a print failure is shown as a warning, never as a save error
          const printMsg = printErr instanceof Error ? printErr.message : 'تعذر إرسال أمر الطباعة';
          setPrintNotice({ ok: false, msg: `تم حفظ المرتجع لكن فشلت الطباعة: ${printMsg}` });
        }
      } else {
        throw new Error('تعذر حفظ المرتجع في قاعدة البيانات');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ المرتجع';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!completedReturn) return;
    setPrintNotice(null);
    try {
      await invoke('returns:printReceipt', { returnId: completedReturn.id });
      setPrintNotice({ ok: true, msg: 'تم إرسال وصل المرتجع للطابعة.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال أمر الطباعة';
      setPrintNotice({ ok: false, msg });
    }
  };

  const isDirty = activeReturnItems.length > 0 && !completedReturn;
  const cashShortfall = cashRefundPiasters > 0 && drawerBalance !== null && cashRefundPiasters > drawerBalance;
  const refundUncovered = totalRefundPiasters > 0 && refundPlan === null;
  const totalReturnedPieces = activeReturnItems.reduce((sum, item) => sum + item.returnQuantityPieces, 0);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل مسودة المرتجع؟',
    confirmMessage: 'هناك أصناف محددة للمرتجع لم يتم حفظها بعد، هل تريد الخروج وتجاهل المرتجع؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة المرتجع',
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-xl overflow-hidden flex flex-col max-h-[90vh] transform-gpu will-change-[transform,opacity] animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-warn text-ink dark:text-ink-dark"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-16 px-5 border-b border-warn/20 dark:border-warn-bright/30 flex items-center justify-between bg-warn-soft dark:bg-warn-dark-soft shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-surface dark:bg-surface-dark-3 border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <h2 className="t-modal-title text-ink dark:text-ink-dark m-0 truncate">مرتجع بضاعة واسترجاع فلوس</h2>
          </div>
          <AppButton variant="subtle" icon={X} onClick={() => void requestClose()} title="إغلاق" aria-label="إغلاق" />
        </div>

        {completedReturn ? (
          <>
            {/* Success State */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 mt-2 rounded-full bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright flex items-center justify-center">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <div>
                <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">تم تسجيل المرتجع</h3>
                <p className="text-sm text-ink-muted dark:text-ink-dark-muted mt-1.5 mb-0">
                  إيصال مرتجع رقم: <strong className="font-mono tabular-nums text-ink dark:text-ink-dark">#{completedReturn.returnNumber}</strong>
                </p>
              </div>

              <div className={`${STEP_CARD} w-full max-w-md text-right`}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-ink-muted dark:text-ink-dark-muted">إجمالي الفلوس اللي خرجت للزبون</span>
                  <strong className="t-kpi font-mono text-warn dark:text-warn-bright">{formatArabicCurrency(completedReturn.totalPiasters)}</strong>
                </div>
                <div className="border-t border-line dark:border-line-dark pt-4 flex flex-col gap-3">
                  <SummaryRow label="الفلوس خرجت إزاي">
                    {describeRefund(completedReturn, REFUND_METHOD_DONE_LABELS)}
                  </SummaryRow>
                  <SummaryRow label="عدد الأصناف اللي رجعت">
                    <span className="font-mono tabular-nums">{completedReturn.items?.length || 0}</span> صنف
                  </SummaryRow>
                </div>
              </div>

              {printNotice && (
                <div
                  className={`w-full max-w-md p-3 rounded-lg border text-sm font-bold flex items-start gap-2 text-right ${
                    printNotice.ok
                      ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright'
                      : 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                  }`}
                  role="status"
                >
                  {printNotice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span className="min-w-0 break-words">{printNotice.msg}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="lg" onClick={() => void requestClose()}>
                إغلاق
              </AppButton>
              <AppButton variant="primary" size="lg" icon={Printer} onClick={handlePrintReceipt}>
                طباعة وصل المرتجع
              </AppButton>
            </div>
          </>
        ) : (
          <>
            {/* Return Form */}
            <MotionHeight className="flex-1 min-h-0 overflow-y-auto p-5">
            <div {...motionPanel} className="flex flex-col gap-5">
              {/* Mode Tabs */}
              <div
                role="tablist"
                aria-label="نوع المرتجع"
                className="motion-static grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'withInvoice'}
                  onClick={() => setMode('withInvoice')}
                  className={`min-h-[2.75rem] px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    mode === 'withInvoice' ? TAB_ACTIVE : TAB_IDLE
                  }`}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>مرتجع برقم الفاتورة (الأفضل)</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'withoutInvoice'}
                  disabled={!canReturnWithoutInvoice}
                  onClick={() => {
                    if (!canReturnWithoutInvoice) {
                      setSubmitError('ليس لديك صلاحية تسجيل مرتجع بدون فاتورة');
                      return;
                    }
                    setMode('withoutInvoice');
                  }}
                  className={`min-h-[2.75rem] px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    !canReturnWithoutInvoice
                      ? 'opacity-50 cursor-not-allowed text-ink-muted dark:text-ink-dark-muted'
                      : `cursor-pointer ${mode === 'withoutInvoice' ? TAB_ACTIVE : TAB_IDLE}`
                  }`}
                  title={!canReturnWithoutInvoice ? 'يتطلب صلاحية المرتجع بدون فاتورة' : undefined}
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>مرتجع حر بدون فاتورة (مشرف)</span>
                </button>
              </div>

              {/* Step 1: find the invoice or the goods */}
              {mode === 'withInvoice' ? (
                <section className={STEP_CARD}>
                  <StepHeader step={1} title="ابحث عن الفاتورة" />
                  <form onSubmit={handleSearchInvoice} className="flex gap-3">
                    <SearchInput
                      size="md"
                      searchButton={false}
                      value={invoiceQuery}
                      onChange={setInvoiceQuery}
                      placeholder="امسح باركود الفاتورة (RFQ-INV-...) أو اكتب رقمها..."
                      autoFocus
                      ariaLabel="رقم الفاتورة"
                      className="flex-1 min-w-0"
                    />
                    <AppButton type="submit" variant="warning" size="md" className="shrink-0" disabled={searchingSale || !invoiceQuery.trim()}>
                      {searchingSale ? 'بندور عليها...' : 'هات الفاتورة'}
                    </AppButton>
                  </form>

                  {saleError && (
                    <div className="rounded-lg border border-danger/20 dark:border-danger-bright/30 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright text-sm font-bold p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="min-w-0 break-words">{saleError}</span>
                    </div>
                  )}

                  {loadedSale && (
                    <div className="rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Fact label="رقم الفاتورة" value={`#${loadedSale.invoiceNumber}`} />
                      <Fact
                        label="التاريخ"
                        value={loadedSale.createdAt ? new Date(loadedSale.createdAt).toLocaleDateString('ar-EG-u-nu-latn') : '-'}
                      />
                      <Fact label="العميل" value={loadedSale.customerName || '-'} />
                      <Fact label="إجمالي الفاتورة" value={formatArabicCurrency(loadedSale.totalPiasters)} />
                    </div>
                  )}
                </section>
              ) : (
                <section className={STEP_CARD}>
                  <StepHeader step={1} title="ابحث عن الصنف" />
                  <SearchInput
                    size="md"
                    value={catalogQuery}
                    onChange={(value) => void handleSearchCatalog(value)}
                    placeholder="اكتب اسم الصنف أو اضرب الباركود عشان تضيفه للمرتجع..."
                    ariaLabel="بحث عن صنف"
                  />

                  {searchingCatalog && (
                    <div className="text-xs text-ink-muted dark:text-ink-dark-muted">بندور في بضاعة المحل...</div>
                  )}

                  {catalogResults.length > 0 && (
                    <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden bg-surface dark:bg-surface-dark shadow-md divide-y divide-line dark:divide-line-dark max-h-64 overflow-y-auto">
                      {catalogResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addCatalogProductToDraft(p)}
                          className="w-full min-h-14 px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-right hover:bg-surface-2 dark:hover:bg-surface-dark-3 cursor-pointer transition-colors"
                        >
                          <span className="flex flex-col min-w-0">
                            <span className="font-bold text-ink dark:text-ink-dark line-clamp-2 break-words">{p.name}</span>
                            <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-mono">{p.barcode}</span>
                          </span>
                          <span className="font-bold font-mono tabular-nums text-warn dark:text-warn-bright shrink-0">{formatArabicCurrency(p.pricePiasters)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Step 2: returnable lines */}
              <section className="flex flex-col gap-4">
                <StepHeader
                  step={2}
                  title="الأصناف المرتجعة"
                  aside={
                    draftItems.length > 0 ? (
                      <span className="inline-flex items-center h-7 px-2.5 rounded-md border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                        <span className="tabular-nums">{activeReturnItems.length}</span>
                        <span className="mx-1">من</span>
                        <span className="tabular-nums">{draftItems.length}</span>
                        <span className="ms-1">محدد للمرتجع</span>
                      </span>
                    ) : undefined
                  }
                />

                {draftItems.length > 0 ? (
                  <ul className="m-0 p-0 list-none flex flex-col gap-3">
                    {draftItems.map((item, idx) => {
                      const maxReturnable = item.originalQuantityPieces - item.previouslyReturnedPieces;
                      const lineTotal = Math.round(item.unitPricePiasters * item.returnQuantityPieces);
                      const isActive = item.returnQuantityPieces > 0;

                      return (
                        <li
                          key={idx}
                          className={`rounded-xl border p-4 flex items-center gap-x-5 gap-y-4 flex-wrap transition-colors ${
                            isActive
                              ? 'border-warn/40 dark:border-warn-bright/50 bg-warn-soft/50 dark:bg-warn-dark-soft/40'
                              : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark'
                          }`}
                        >
                          <div className="flex-1 min-w-[15rem] flex flex-col gap-3">
                            <span className="text-sm font-bold text-ink dark:text-ink-dark break-words leading-relaxed">{item.productName}</span>
                            <div className="flex items-start gap-x-6 gap-y-2 flex-wrap">
                              <Fact label="سعر البيع" value={formatArabicCurrency(item.unitPricePiasters)} />
                              {mode === 'withInvoice' && (
                                <>
                                  <Fact label="العدد في الفاتورة" value={String(item.originalQuantityPieces)} />
                                  {item.previouslyReturnedPieces > 0 && (
                                    <Fact label="اترجع قبل كده" value={String(item.previouslyReturnedPieces)} />
                                  )}
                                  <Fact label="المتاح للإرجاع" value={String(maxReturnable)} />
                                </>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-bold text-ink dark:text-ink-dark mb-1.5">العدد اللي هيرجعه</div>
                            <QtyStepper
                              value={item.returnQuantityPieces}
                              max={maxReturnable}
                              onChange={(qty) => updateItemQty(idx, qty)}
                            />
                          </div>

                          <div>
                            <div className="text-xs font-bold text-ink dark:text-ink-dark mb-1.5">حالة البضاعة</div>
                            <AppButton
                              variant={item.isDamaged ? 'dangerSoft' : 'successSoft'}
                              icon={item.isDamaged ? AlertTriangle : Check}
                              aria-pressed={item.isDamaged}
                              onClick={() => toggleItemDamaged(idx)}
                              title={item.isDamaged ? 'بضاعة تالفة: مش هتدخل المخزن' : 'بضاعة سليمة: هترجع رصيد في المخزن'}
                            >
                              {item.isDamaged ? 'بايظ / تالف' : 'سليم'}
                            </AppButton>
                          </div>

                          <div className="min-w-[8rem] text-left">
                            <div className="text-xs text-ink-muted dark:text-ink-dark-muted mb-1.5">فلوس المرتجع</div>
                            <div className={`t-kpi font-mono ${isActive ? 'text-warn dark:text-warn-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                              {formatArabicCurrency(lineTotal)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="py-10 px-4 text-center bg-surface-2 dark:bg-surface-dark-2 border border-dashed border-line dark:border-line-dark-strong rounded-xl">
                    <ShoppingBag className="w-9 h-9 mx-auto mb-2 stroke-[1.5] text-ink-muted dark:text-ink-dark-muted" />
                    <p className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted m-0">
                      {mode === 'withInvoice' ? 'اكتب رقم الفاتورة واضغط "هات الفاتورة" عشان تختار البضاعة اللي هترجع' : 'اضرب باركود أو دور على الصنف عشان تضيفه للمرتجع'}
                    </p>
                  </div>
                )}
              </section>

              {/* Step 3: refund summary */}
              <section className={STEP_CARD}>
                <StepHeader
                  step={3}
                  title="ملخص الصرف"
                  aside={
                    drawerBalance !== null ? (
                      <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                        <span>كاش الدرج:</span>
                        <strong className={`font-mono tabular-nums ${drawerBalance < totalRefundPiasters ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'}`}>
                          {formatArabicCurrency(drawerBalance)}
                        </strong>
                      </span>
                    ) : undefined
                  }
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                  <div className="rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-4 flex flex-col justify-center">
                    <div className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted">إجمالي الفلوس اللي هترجع</div>
                    <div className="mt-1 text-3xl font-black font-mono tabular-nums text-warn dark:text-warn-bright break-words">
                      {formatArabicCurrency(totalRefundPiasters)}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                      <span className="tabular-nums">{activeReturnItems.length}</span> صنف
                      <span className="mx-1">·</span>
                      <span className="tabular-nums">{totalReturnedPieces}</span> قطعة
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-bold text-ink dark:text-ink-dark mb-1.5">هترجع الفلوس إزاي؟</div>
                    <div className="grid grid-cols-2 gap-2">
                      {effectiveRefundOptions.map((option) => {
                        const OptionIcon = REFUND_ICONS[option.method];
                        const isSelected = selectedRefundMethod === option.method;
                        return (
                          <button
                            key={option.method}
                            type="button"
                            onClick={() => setRefundMethod(option.method)}
                            aria-pressed={isSelected}
                            className={`min-h-[2.75rem] px-2 rounded-lg text-sm font-bold border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn/40 dark:border-warn-bright/50 text-warn dark:text-warn-bright shadow-2xs'
                                : 'bg-surface dark:bg-surface-dark-3 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                            }`}
                          >
                            <OptionIcon className="w-4 h-4 shrink-0" />
                            <span>{REFUND_METHOD_LABELS[option.method]}</span>
                          </button>
                        );
                      })}
                    </div>
                    {mode === 'withInvoice' && (
                      <div className="mt-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                        الفلوس بترجع بنفس طريقة دفع الفاتورة الأصلية بس.
                      </div>
                    )}
                    {refundPlan && refundPlan.length > 1 && (
                      <div className="mt-2 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-3 flex flex-col gap-2">
                        <div className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                          القيمة أكبر من المتاح على الطريقة المختارة، فهتتقسم كده:
                        </div>
                        {refundPlan.map((part) => (
                          <SummaryRow key={part.method} label={REFUND_METHOD_LABELS[part.method]}>
                            <span className="font-mono tabular-nums">{formatArabicCurrency(part.amountPiasters)}</span>
                          </SummaryRow>
                        ))}
                      </div>
                    )}
                    {refundUncovered && (
                      <div className="mt-2 p-2.5 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/40 text-danger dark:text-danger-bright text-xs font-bold flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>طرق الدفع المتاحة في الفاتورة الأصلية لا تكفي لقيمة المرتجع.</span>
                      </div>
                    )}
                    {cashShortfall && drawerBalance !== null && (
                      <div className="mt-2 p-2.5 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/40 text-danger dark:text-danger-bright text-xs font-bold flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>كاش الدرج المتاح ({formatArabicCurrency(drawerBalance)}) غير كافٍ لصرف المرتجع نقداً.</span>
                      </div>
                    )}
                  </div>
                </div>

                <label className="block">
                  <span className="block text-sm font-bold text-ink dark:text-ink-dark mb-1.5">سبب الترجيع (ملاحظة)</span>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثلاً: الصنف بايظ، أو الزبون غير رأيه..."
                    className={FIELD}
                  />
                </label>

                {/* Supervisor PIN: only for a return without an invoice */}
                {mode === 'withoutInvoice' && (
                  <div className="rounded-lg border border-warn/30 dark:border-warn-bright/40 bg-warn-soft dark:bg-warn-dark-soft p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Lock className="w-5 h-5 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-ink dark:text-ink-dark block">لازم موافقة المشرف (رقم سري) <RequiredMark /></span>
                        <span className="text-xs text-warn dark:text-warn-bright block mt-0.5">اكتب الرقم السري للمشرف عشان تصرف المرتجع ده من غير فاتورة</span>
                      </div>
                    </div>
                    <input
                      type="password"
                      aria-label="الرقم السري للمشرف"
                      value={supervisorPin}
                      onChange={(e) => setSupervisorPin(e.target.value)}
                      className="w-40 h-11 px-3 text-center text-base font-bold font-mono tracking-widest bg-surface dark:bg-surface-dark-3 border border-warn/40 dark:border-warn-bright/50 rounded-lg focus:outline-none focus:border-warn dark:focus:border-warn-bright focus:ring-2 focus:ring-warn/20 text-ink dark:text-ink-dark"
                    />
                  </div>
                )}
              </section>
            </div>
            </MotionHeight>

            {submitError && (
              <div className="px-5 pt-3 pb-1 shrink-0" role="alert">
                <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-sm font-bold rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{submitError}</span>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="px-5 py-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3 flex-wrap shrink-0">
              <div className="min-w-0">
                <div className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">إجمالي المرتجع</div>
                <div className="t-kpi font-mono text-warn dark:text-warn-bright break-words">
                  {formatArabicCurrency(totalRefundPiasters)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AppButton variant="secondary" size="lg" onClick={() => void requestClose()} disabled={loading}>
                  إلغاء
                </AppButton>
                <AppButton
                  variant="warning"
                  size="lg"
                  icon={RotateCcw}
                  onClick={() => void handleSubmitReturn()}
                  loading={loading}
                  disabled={activeReturnItems.length === 0 || cashShortfall || refundUncovered}
                >
                  {loading ? 'بنحفظ المرتجع...' : 'تنفيذ المرتجع'}
                </AppButton>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
