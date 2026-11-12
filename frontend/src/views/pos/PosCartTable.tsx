import React, { useEffect, useRef, useState } from 'react';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle, 
  AlertCircle, 
  Scale, 
  Tag,
  Calendar,
  AlertTriangle,
  ArrowLeftRight,
  Snowflake,
  Pill,
  ShieldAlert,
  BadgePercent,
  Printer,
} from 'lucide-react';
import type { CartItem } from './types';
import { AppButton } from '../../components/AppButton';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { formatUnitArabic } from '../../utils/units';

interface PosCartTableProps {
  cart: CartItem[];
  selectedCartIndex?: number | null;
  onSelectCartItem?: (index: number) => void;
  lastInvoiceNumber: number | null;
  draftPrompt: {
    items: CartItem[];
    discountPiasters: number;
    customerId?: string | null;
    savedAt: number;
  } | null;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  statusMessage: { text: string; type: 'success' | 'error' | 'warning' } | null;
  cycleCartItemUnit?: (index: number) => void;
  updateQuantity: (index: number, deltaPieces: number) => void;
  setDirectQuantity: (index: number, newQtyPieces: number) => void;
  openWeightEditorForCartItem: (index: number) => void;
  onOpenItemDiscount: (index: number) => void;
  removeItem: (index: number) => void;
  onOpenBatchSelection?: (index: number) => void;
  canSelectBatch?: boolean;
  onOpenAlternatives?: (index: number) => void;
  onOpenControlledDispense?: (index: number) => void;
  onPrintDosageLabel?: (index: number) => void;
  onOpenItemModifiers?: (index: number) => void;
}

const unitLabel = (item: CartItem & { unitName: string }): string =>
  `${formatUnitArabic(item.unitName)}${item.conversionFactor && item.conversionFactor > 1 ? ` = ${item.conversionFactor}` : ''}`;

// Per-line fingerprint used to spot which single line was just added or changed.
const lineSignature = (item: CartItem): string =>
  `${item.productId}|${item.quantityMilli}|${item.discountPiasters}|${item.unitPricePiasters}`;

const FLASH_MS = 1600;

// Weighed items already show "كجم" on the weight button, so the plain unit chip would repeat it.
const showsUnitChip = (item: CartItem): item is CartItem & { unitName: string } =>
  Boolean(item.unitName) && (item.unit !== 'kg' || (item.productUnits?.length ?? 0) > 1);

export const PosCartTable: React.FC<PosCartTableProps> = ({
  cart,
  selectedCartIndex = null,
  onSelectCartItem,
  lastInvoiceNumber,
  draftPrompt,
  onRestoreDraft,
  onDiscardDraft,
  statusMessage,
  cycleCartItemUnit,
  updateQuantity,
  setDirectQuantity,
  openWeightEditorForCartItem,
  onOpenItemDiscount,
  removeItem,
  onOpenBatchSelection,
  canSelectBatch = false,
  onOpenAlternatives,
  onOpenControlledDispense,
  onPrintDosageLabel,
  onOpenItemModifiers,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevSignaturesRef = useRef<string[]>(cart.map(lineSignature));
  const flashTimerRef = useRef<number | undefined>(undefined);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  // Auto-scroll to selected cart item
  useEffect(() => {
    if (selectedCartIndex !== null && selectedCartIndex !== undefined && selectedCartIndex >= 0) {
      listRef.current
        ?.querySelector(`[data-cart-row="${selectedCartIndex}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedCartIndex]);

  // Highlights (and scrolls to) the one line that was just added or changed; bulk changes (restore, clear) stay quiet.
  useEffect(() => {
    const next = cart.map(lineSignature);
    const prev = prevSignaturesRef.current;
    prevSignaturesRef.current = next;
    let changed = -1;
    let changedCount = 0;
    for (let i = 0; i < Math.max(prev.length, next.length); i++) {
      if (prev[i] !== next[i]) {
        changed = i;
        changedCount++;
      }
    }
    if (changedCount !== 1 || changed >= next.length) return;
    setFlashIndex(changed);
    listRef.current
      ?.querySelector(`[data-cart-row="${changed}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashIndex(null), FLASH_MS);
  }, [cart]);

  useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

  return (
    <>
      {/* Feature #132: Power Outage Cart Draft Recovery Prompt Banner */}
      {draftPrompt && (
        <div className="mx-2.5 sm:mx-3 mt-2 p-2.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink dark:text-ink-dark truncate">
                لقينا فاتورة كانت مفتوحة قبل ما السيستم يقفل أو النور يقطع:
              </div>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5 truncate">
                فيها {draftPrompt.items.length} صنف — حسابها: {formatArabicCurrency(draftPrompt.items.reduce((sum, i) => sum + i.totalPiasters, 0) - (draftPrompt.discountPiasters || 0))} — اتحفظت الساعة: {new Date(draftPrompt.savedAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <AppButton variant="primary" size="sm" onClick={onRestoreDraft}>
              رجع الفاتورة
            </AppButton>
            <AppButton variant="secondary" size="sm" onClick={onDiscardDraft}>
              تجاهل وابدأ جديدة
            </AppButton>
          </div>
        </div>
      )}

      {/* Status Message Notification Toast */}
      {statusMessage && (
        <div className={`mx-2.5 sm:mx-3 mt-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all ${
          statusMessage.type === 'success' 
            ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid/30 text-paid dark:text-paid-bright' 
            : statusMessage.type === 'warning'
            ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn-border dark:border-warn-bright/40 text-warn dark:text-warn-bright' 
            : 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/40 text-danger dark:text-danger-bright'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Main Cart Items Container */}
      <div className="flex-1 flex flex-col overflow-hidden mt-1 bg-surface dark:bg-surface-dark">
        {/* Cart Items List */}
        <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2.5 p-6">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border-2 border-dashed border-line-hover dark:border-line-dark-strong flex items-center justify-center">
                <ShoppingBag className="w-8 h-8 text-ink-muted dark:text-ink-dark-muted stroke-[1.5]" />
              </div>
              <div className="text-center">
                <p className="text-sm sm:text-base font-extrabold text-ink dark:text-ink-dark m-0">السلة فاضية</p>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5 font-medium">
                  اضرب الباركود بالاسكانر أو اختار الصنف من الشاشة لبدء الفاتورة
                </p>
              </div>
              {lastInvoiceNumber && (
                <span className="text-xs font-mono font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-3 py-1 rounded-xl shadow-2xs">
                  آخر فاتورة طلعت: #{lastInvoiceNumber}
                </span>
              )}
            </div>
          ) : (
            cart.map((item, index) => {
              const isWeighed = item.unit === 'kg';
              const isFlashing = flashIndex === index;
              const isSelected = selectedCartIndex === index;
              const grossLinePiasters = Math.round((item.unitPricePiasters * item.quantityMilli) / 1000);
              return (
              <div
                key={item.productId || index}
                data-cart-row={index}
                onClick={() => onSelectCartItem?.(index)}
                className={`py-2.5 pe-4 ps-3 border-s-4 flex items-start gap-3 text-sm w-full transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'border-s-brand dark:border-s-brand-bright bg-brand-soft/70 dark:bg-brand-dark-soft/80 ring-1 ring-inset ring-brand/30 dark:ring-brand-bright/35 shadow-xs'
                    : isWeighed ? 'border-s-brand dark:border-s-brand-bright' : 'border-s-transparent'
                } ${
                  !isSelected && isFlashing
                    ? 'bg-brand-soft dark:bg-brand-dark-soft'
                    : !isSelected
                    ? 'even:bg-surface-2/50 dark:even:bg-surface-dark-2/60 hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                    : ''
                }`}
              >
                {/* Index */}
                <div
                  className={`w-7 h-7 shrink-0 mt-0.5 rounded-full border flex items-center justify-center font-mono tabular-nums text-xs font-bold transition-colors ${
                    isSelected
                      ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark-lowest border-brand dark:border-brand-bright shadow-xs'
                      : 'bg-surface-2 dark:bg-surface-dark-3 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark'
                  }`}
                >
                  {index + 1}
                </div>

                {/* Item Column: name + delete, then qty / unit price / line total, then chips */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  {/* Line 1: product name (up to 2 lines, full text in tooltip) and the quiet delete control */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className={`min-w-0 line-clamp-2 break-words text-base leading-snug pt-0.5 transition-colors ${
                          isSelected ? 'font-bold text-brand-dark dark:text-brand-bright' : 'font-semibold text-ink dark:text-ink-dark'
                        }`}
                        title={item.barcode ? `${item.productName}\nالباركود: ${item.barcode}` : item.productName}
                      >
                        {item.productName}
                      </span>
                    </div>
                    <AppButton
                      variant="dangerSubtle"
                      size="xs"
                      icon={Trash2}
                      onClick={() => removeItem(index)}
                      aria-label="حذف الصنف"
                      title="حذف الصنف"
                      className="-mt-0.5"
                    >
                      حذف
                    </AppButton>
                  </div>

                  {/* Line 2: quantity / weight, unit price and the end-aligned line total */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {isWeighed ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openWeightEditorForCartItem(index);
                        }}
                        className="h-10 px-3 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand-soft/70 dark:hover:bg-surface-dark-3 border border-brand/30 dark:border-brand-bright/50 focus-visible:border-brand dark:focus-visible:border-brand-bright rounded-lg flex items-center gap-2 text-brand-dark dark:text-brand-bright transition-colors shadow-2xs cursor-pointer active:scale-95 shrink-0"
                        title="اضغط لتعديل الوزن بالجرام أو الكيلو"
                      >
                        <Scale className="w-4 h-4 shrink-0" />
                        <span className="font-mono font-bold text-sm tabular-nums whitespace-nowrap">
                          {(item.quantityMilli / 1000).toFixed(3).replace(/\.?0+$/, '')} كجم
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center h-10 bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg p-0.5 gap-0.5 shadow-2xs shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateQuantity(index, -1);
                          }}
                          className="w-9 h-9 flex items-center justify-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright focus-visible:border-brand dark:focus-visible:border-brand-bright rounded-md transition-colors cursor-pointer"
                          title="إنقاص الكمية"
                          aria-label="إنقاص الكمية"
                        >
                          <Minus className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.quantityMilli / 1000}
                          onChange={(e) => {
                            const norm = normalizeArabicNumerals(e.target.value);
                            if (/^[0-9]*$/.test(norm)) {
                              const val = parseInt(norm, 10);
                              if (!isNaN(val) && val >= 0) {
                                setDirectQuantity(index, val);
                              }
                            }
                          }}
                          className="w-14 h-9 text-center font-mono font-bold text-ink dark:text-ink-dark text-base tabular-nums bg-transparent border border-transparent focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark focus:outline-none rounded-md p-0"
                          title="اضغط لتعديل الكمية بالكتابة مباشرة"
                          aria-label="الكمية"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateQuantity(index, 1);
                          }}
                          className="w-9 h-9 flex items-center justify-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright focus-visible:border-brand dark:focus-visible:border-brand-bright rounded-md transition-colors cursor-pointer"
                          title="زيادة الكمية"
                          aria-label="زيادة الكمية"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>
                    )}

                    {/* Unit price (read-only from inventory) */}
                    <span className="flex-1 min-w-fit whitespace-nowrap tabular-nums font-mono text-ink dark:text-ink-dark text-base font-semibold" title="سعر الوحدة">
                      × {formatArabicCurrency(item.unitPricePiasters, false)}
                      <span className="text-xs font-medium ms-1 text-ink-muted dark:text-ink-dark-muted max-xl:hidden">{isWeighed ? '/ كجم' : '/ وحدة'}</span>
                    </span>

                    {/* Line total: the pill under the delete button; when discounted, the original amount is struck through right under it */}
                    <div className="shrink-0 min-w-[7.5rem] flex flex-col items-end gap-0.5 tabular-nums font-mono">
                      <div
                        className="w-full flex items-baseline justify-end gap-1.5 px-3 py-1 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border"
                        title="إجمالي سعر الصنف بعد الخصم"
                      >
                        <span className="text-2xl font-extrabold leading-tight text-paid dark:text-paid-bright whitespace-nowrap">{formatArabicCurrency(item.totalPiasters, false)}</span>
                        <span className="text-xs font-bold text-paid dark:text-paid-bright">ج.م</span>
                      </div>
                      {item.discountPiasters > 0 && (
                        <span className="text-sm text-danger dark:text-danger-bright line-through font-semibold px-1" title="السعر قبل الخصم">
                          {formatArabicCurrency(grossLinePiasters, false)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Line 3: discount chip, then item specs (cold chain, location, unit, batch / expiry, modifiers) */}
                  <div className="flex items-center gap-2 text-micro text-ink-muted dark:text-ink-dark-muted min-w-0 flex-wrap">
                    <AppButton
                      variant={item.discountPiasters > 0 ? 'warningSoft' : 'secondary'}
                      size="sm"
                      icon={Tag}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenItemDiscount(index);
                      }}
                      className="max-w-full"
                      title="تطبيق خصم خاص على هذا الصنف"
                    >
                      <span className="tabular-nums truncate">
                        {item.discountPiasters > 0 ? `خصم -${formatArabicCurrency(item.discountPiasters, false)}` : 'خصم'}
                      </span>
                    </AppButton>

                    {item.taxRatePercent !== undefined && item.taxRatePercent > 0 && (
                      <span className="shrink-0 h-6 px-2 bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 text-paid dark:text-paid-bright text-micro font-semibold rounded-md flex items-center gap-1" title={`ضريبة القيمة المضافة (${item.taxRatePercent}%): ${formatArabicCurrency(item.taxPiasters)}`}>
                        <BadgePercent className="w-3 h-3 shrink-0" />
                        <span>ضريبة {item.taxRatePercent}%</span>
                      </span>
                    )}

                    {item.isColdChain && (
                      <span className="shrink-0 h-6 px-2 bg-brand-soft dark:bg-brand-dark-soft border border-brand/25 dark:border-brand-bright/40 text-brand dark:text-brand-bright text-micro font-semibold rounded-md flex items-center gap-1" title="سلسلة تبريد: يحفظ في الثلاجة (2-8 مئوية)">
                        <Snowflake className="w-3 h-3 shrink-0" />
                        <span>ثلاجة</span>
                      </span>
                    )}
                    {item.locationCode && (
                      <span className="shrink-0 h-6 px-2 bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark text-micro font-mono font-semibold text-ink dark:text-ink-dark rounded-md flex items-center" title={`مكان الصنف: ${item.locationCode}`}>
                        [{item.locationCode}]
                      </span>
                    )}
                    {/* Unit badge with inline switcher */}
                    {showsUnitChip(item) && (
                      item.productUnits && item.productUnits.length > 1 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cycleCartItemUnit?.(index);
                          }}
                          className="h-6 px-2 rounded-md bg-brand-soft/80 dark:bg-brand-dark-soft hover:bg-brand hover:text-white dark:hover:text-white dark:hover:bg-brand border border-brand/25 dark:border-brand-bright/40 text-brand dark:text-brand-bright text-micro font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors shadow-2xs group"
                          title="اضغط لتبديل وحدة البيع للوحدة التالية (أو اضغط مفتاح / بالكيبورد)"
                        >
                          <span>{unitLabel(item)}</span>
                          <ArrowLeftRight className="w-3 h-3 opacity-70 group-hover:opacity-100 shrink-0" />
                        </button>
                      ) : (
                        <span className="h-6 px-2 rounded-md bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-micro font-semibold flex items-center shrink-0">
                          {unitLabel(item)}
                        </span>
                      )
                    )}

                    {/* Batch / Expiry: a picker button when the cashier may change it, plain badge otherwise */}
                    {!item.isExpiredBypass && (item.batchNumber || item.expiryDate || canSelectBatch) && (() => {
                      const batchChipClass = 'h-6 px-2 rounded-md flex items-center gap-1 min-w-0 max-w-full text-micro font-medium text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border';
                      const batchChipBody = (
                        <>
                          <Calendar className="w-3 h-3 shrink-0" />
                          <bdi className="font-mono font-bold truncate" dir="ltr">
                            {item.batchNumber ? item.batchNumber : 'الدفعة'}
                          </bdi>
                          {item.expiryDate && (
                            <span className="text-micro font-mono shrink-0">
                              ({item.expiryDate.split('-').slice(1).join('/')})
                            </span>
                          )}
                        </>
                      );
                      return canSelectBatch && onOpenBatchSelection ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenBatchSelection(index);
                          }}
                          className={`${batchChipClass} hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 focus-visible:border-paid dark:focus-visible:border-paid-bright cursor-pointer transition-colors`}
                          title="اضغط لاختيار أو تغيير تشغيلة الصنف"
                        >
                          {batchChipBody}
                        </button>
                      ) : (
                        <span
                          className={batchChipClass}
                          title={`تشغيلة: ${item.batchNumber || 'افتراضية'} - صلاحية: ${item.expiryDate || 'غير محدد'}`}
                        >
                          {batchChipBody}
                        </span>
                      );
                    })()}

                    {/* Expired bypass badge */}
                    {item.isExpiredBypass && (
                      <span
                        className="h-6 px-2 rounded-md bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 text-danger dark:text-danger-bright text-micro font-semibold flex items-center gap-1 shrink-0"
                        title={`تاريخ الانتهاء: ${item.expiryDate || 'منتهي'} - بيع بتخطي واعتماد إداري`}
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>منتهي</span>
                      </span>
                    )}

                    {/* Hospitality Modifiers Button */}
                    {onOpenItemModifiers && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenItemModifiers(index);
                        }}
                        className="h-6 px-2 rounded-md bg-brand-soft/80 dark:bg-brand-dark-soft hover:bg-brand hover:text-white dark:hover:text-white dark:hover:bg-brand border border-brand/25 dark:border-brand-bright/40 text-brand dark:text-brand-bright text-micro font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                        title="تخصيص الإضافات والملاحظات لهذا الصنف"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span>إضافات</span>
                      </button>
                    )}
                  </div>

                  {/* Hospitality Modifiers & Notes Chips */}
                  {((item.modifiers && item.modifiers.length > 0) || item.notes) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.modifiers?.map((mod, mIdx) => (
                        <span
                          key={`${mod.optionId || mIdx}`}
                          className="px-2 py-1 rounded-md bg-paid-soft/80 dark:bg-paid-dark-soft border border-paid/25 text-paid dark:text-paid-bright text-micro font-semibold flex items-center gap-1 max-w-full"
                        >
                          <span className="truncate">+ {mod.optionName}</span>
                          {mod.extraPricePiasters > 0 && (
                            <span className="font-mono shrink-0">({formatArabicCurrency(mod.extraPricePiasters, false)})</span>
                          )}
                        </span>
                      ))}
                      {item.notes && (
                        <span className="px-2 py-1 rounded-md bg-warn-soft/80 dark:bg-warn-dark-soft border border-warn/25 text-ink dark:text-warn-bright text-micro font-semibold max-w-full break-words">
                          ملاحظة: {item.notes}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Pharmacy quick actions (only when alternatives, controlled, or dosage labels exist) */}
                  {(onOpenAlternatives || item.isControlled || onPrintDosageLabel) && (
                    <div className="flex flex-wrap items-center gap-2 text-micro shrink-0">
                      {/* Drug Alternatives (F8) */}
                      {onOpenAlternatives && (
                        <AppButton
                          variant="secondary"
                          size="xs"
                          icon={Pill}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAlternatives(index);
                          }}
                          title="البحث عن بدائل ومثائل دوائية لهذا الصنف (F8)"
                        >
                          بدائل (F8)
                        </AppButton>
                      )}

                      {/* Controlled Drug Dispense Documentation */}
                      {item.isControlled && (
                        <AppButton
                          variant={item.controlledDispense ? 'successSoft' : 'warningSoft'}
                          size="xs"
                          icon={ShieldAlert}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenControlledDispense?.(index);
                          }}
                          title={
                            item.controlledDispense
                              ? `تم توثيق الصرف للمريض: ${item.controlledDispense.patientName}`
                              : 'دواء جدول ورقابة مشددة - اضغط لتوثيق بيانات المريض والطبيب'
                          }
                        >
                          {item.controlledDispense ? 'موثق' : 'جدول'}
                        </AppButton>
                      )}

                      {/* Thermal Dosage Label Print */}
                      {onPrintDosageLabel && (
                        <AppButton
                          variant="secondary"
                          size="xs"
                          icon={Printer}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPrintDosageLabel(index);
                          }}
                          title="طباعة ملصق جرعة حراري (استيكر صيدلي)"
                        >
                          ملصق
                        </AppButton>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
