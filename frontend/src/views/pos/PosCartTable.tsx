import React from 'react';
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
  Printer,
} from 'lucide-react';
import type { CartItem } from './types';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';

interface PosCartTableProps {
  cart: CartItem[];
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

export const PosCartTable: React.FC<PosCartTableProps> = ({
  cart,
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
              <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5 truncate">
                فيها {draftPrompt.items.length} صنف — حسابها: {formatArabicCurrency(draftPrompt.items.reduce((sum, i) => sum + i.totalPiasters, 0) - (draftPrompt.discountPiasters || 0))} — اتحفظت الساعة: {new Date(draftPrompt.savedAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRestoreDraft}
              className="px-2.5 py-1 bg-brand hover:bg-brand-hover text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
            >
              رجع الفاتورة
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="px-2 py-1 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-lg text-xs transition-colors cursor-pointer"
            >
              تجاهل وابدأ جديدة
            </button>
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
        {/* Table Column Headers */}
        <div className="h-8 sm:h-9 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center px-2 sm:px-3 text-xs font-bold text-ink-muted dark:text-ink-dark-muted select-none shrink-0 w-full gap-1 sm:gap-1.5 lg:gap-2">
          <div className="w-5 shrink-0 text-center font-mono">#</div>
          <div className="flex-1 min-w-0 text-right font-bold pr-1 truncate">اسم الصنف / الباركود</div>
          <div className="w-14 sm:w-16 lg:w-20 shrink-0 text-center font-bold">السعر</div>
          <div className="w-20 sm:w-24 lg:w-26 shrink-0 text-center font-bold">العدد / الوزن</div>
          <div className="w-8 sm:w-10 shrink-0 text-center font-bold">خصم</div>
          <div className="w-14 sm:w-16 lg:w-20 shrink-0 text-left tabular-nums font-bold">الإجمالي</div>
          <div className="w-6 sm:w-7 shrink-0 text-center font-bold">مسح</div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/60 dark:divide-line-dark/60 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2.5 p-6">
              <div className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center shadow-2xs">
                <ShoppingBag className="w-7 h-7 text-ink-muted/60 dark:text-ink-dark-muted/60 stroke-[1.5]" />
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
            cart.map((item, index) => (
              <div 
                key={item.productId || index} 
                className="min-h-[50px] sm:min-h-[54px] py-1.5 border-b border-line/40 dark:border-line-dark/50 flex items-center px-2 sm:px-3 text-xs hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors w-full gap-1 sm:gap-1.5 lg:gap-2"
              >
                {/* Index */}
                <div className="w-5 shrink-0 text-center font-mono text-ink-muted dark:text-ink-dark-muted text-xs font-bold">
                  {index + 1}
                </div>

                {/* Description Column */}
                <div className="flex-1 min-w-0 pr-1 flex flex-col justify-center gap-1">
                  {/* Line 1: Clear, Uncrowded Product Name */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="font-bold text-ink dark:text-ink-dark truncate text-xs sm:text-[13px] leading-snug"
                      title={item.productName}
                    >
                      {item.productName}
                    </span>
                    {item.isColdChain && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 text-[9px] font-bold rounded flex items-center gap-0.5" title="سلسلة تبريد: يحفظ في الثلاجة (2-8 مئوية)">
                        <Snowflake className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400" />
                        <span>ثلاجة</span>
                      </span>
                    )}
                    {item.unit === 'kg' && (
                      <span className="shrink-0 px-1 py-0.5 bg-brand-soft dark:bg-surface-dark-3 border border-brand/20 dark:border-line-dark text-brand dark:text-brand-bright text-[9px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                        <Scale className="w-2.5 h-2.5 text-brand dark:text-brand-bright" />
                        <span>وزن</span>
                      </span>
                    )}
                    {item.locationCode && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark text-[9px] font-mono font-bold text-ink dark:text-ink-dark rounded" title={`مكان الصنف: ${item.locationCode}`}>
                        [{item.locationCode}]
                      </span>
                    )}
                  </div>

                  {/* Line 2: Core Item Specs (Barcode, Unit with Switcher, Batch / Expiry) */}
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-muted dark:text-ink-dark-muted min-w-0 flex-wrap">
                    {/* Barcode */}
                    {item.barcode && (
                      <span className="font-mono text-ink-muted/90 dark:text-ink-dark-muted text-[10px] shrink-0 tracking-tight">
                        {item.barcode}
                      </span>
                    )}

                    {/* Dot separator */}
                    {item.barcode && item.unitName && (
                      <span className="text-line-hover dark:text-line-dark text-[8px] shrink-0">•</span>
                    )}

                    {/* Unit Badge with Inline Switcher */}
                    {item.unitName && (
                      item.productUnits && item.productUnits.length > 1 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cycleCartItemUnit?.(index);
                          }}
                          className="h-5 px-1.5 rounded bg-brand-soft/80 dark:bg-brand-soft/20 hover:bg-brand hover:text-white dark:hover:bg-brand border border-brand/25 text-brand dark:text-brand-bright text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-all shadow-2xs group"
                          title="اضغط لتبديل وحدة البيع للوحدة التالية (أو اضغط مفتاح / بالكيبورد)"
                        >
                          <span>
                            {item.unitName.toLowerCase() === 'piece' || item.unitName.toLowerCase() === 'pcs'
                              ? 'قطعة'
                              : item.unitName.toLowerCase() === 'box'
                              ? 'علبة'
                              : item.unitName.toLowerCase() === 'strip'
                              ? 'شريط'
                              : item.unitName}
                            {item.conversionFactor && item.conversionFactor > 1 ? ` = ${item.conversionFactor}` : ''}
                          </span>
                          <ArrowLeftRight className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100 shrink-0" />
                        </button>
                      ) : (
                        <span className="h-5 px-1.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-[9.5px] font-bold flex items-center shrink-0">
                          {item.unitName.toLowerCase() === 'piece' || item.unitName.toLowerCase() === 'pcs'
                            ? 'قطعة'
                            : item.unitName.toLowerCase() === 'box'
                            ? 'علبة'
                            : item.unitName.toLowerCase() === 'strip'
                            ? 'شريط'
                            : item.unitName}
                          {item.conversionFactor && item.conversionFactor > 1 ? ` = ${item.conversionFactor}` : ''}
                        </span>
                      )
                    )}

                    {/* Batch / Expiry Button */}
                    {!item.isExpiredBypass && (item.batchNumber || item.expiryDate || canSelectBatch) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canSelectBatch && onOpenBatchSelection) {
                            onOpenBatchSelection(index);
                          }
                        }}
                        disabled={!canSelectBatch || !onOpenBatchSelection}
                        className={`h-5 px-1.5 rounded flex items-center gap-1 shrink-0 text-[9.5px] font-medium transition-colors ${
                          canSelectBatch && onOpenBatchSelection
                            ? 'text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 hover:bg-paid-soft/80 cursor-pointer'
                            : 'text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30'
                        }`}
                        title={canSelectBatch ? 'اضغط لاختيار أو تغيير تشغيلة الصنف' : `تشغيلة: ${item.batchNumber || 'افتراضية'} - صلاحية: ${item.expiryDate || 'غير محدد'}`}
                      >
                        <Calendar className="w-2.5 h-2.5 text-paid dark:text-paid-bright shrink-0" />
                        <bdi className="font-mono font-bold" dir="ltr">
                          {item.batchNumber ? item.batchNumber : 'الدفعة'}
                        </bdi>
                        {item.expiryDate && (
                          <span className="text-[8.5px] opacity-75 font-mono">
                            ({item.expiryDate.split('-').slice(1).join('/')})
                          </span>
                        )}
                      </button>
                    )}

                    {/* Expired bypass badge */}
                    {item.isExpiredBypass && (
                      <span 
                        className="h-5 px-1.5 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 text-danger dark:text-danger-bright text-[9.5px] font-bold flex items-center gap-1 shrink-0"
                        title={`تاريخ الانتهاء: ${item.expiryDate || 'منتهي'} - بيع بتخطي واعتماد إداري`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
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
                        className="h-5 px-1.5 rounded bg-brand-soft/80 dark:bg-brand-soft/20 hover:bg-brand hover:text-white border border-brand/25 text-brand dark:text-brand-bright text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                        title="تخصيص الإضافات والملاحظات لهذا الصنف"
                      >
                        <Plus className="w-2.5 h-2.5 shrink-0" />
                        <span>إضافات</span>
                      </button>
                    )}
                  </div>

                  {/* Hospitality Modifiers & Notes Chips */}
                  {((item.modifiers && item.modifiers.length > 0) || item.notes) && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {item.modifiers?.map((mod, mIdx) => (
                        <span
                          key={`${mod.optionId || mIdx}`}
                          className="px-1.5 py-0.5 rounded bg-paid-soft/80 dark:bg-paid-dark-soft border border-paid/25 text-paid dark:text-paid-bright text-[9.5px] font-bold flex items-center gap-1"
                        >
                          <span>+ {mod.optionName}</span>
                          {mod.extraPricePiasters > 0 && (
                            <span className="font-mono opacity-80">({formatArabicCurrency(mod.extraPricePiasters, false)})</span>
                          )}
                        </span>
                      ))}
                      {item.notes && (
                        <span className="px-1.5 py-0.5 rounded bg-warn-soft/80 dark:bg-warn-dark-soft border border-warn/25 text-warn dark:text-warn-bright text-[9.5px] font-bold">
                          ملاحظة: {item.notes}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Line 3: Pharmacy Quick Actions Toolbar (Only when alternatives, controlled, or dosage labels exist) */}
                  {(onOpenAlternatives || item.isControlled || onPrintDosageLabel) && (
                    <div className="flex items-center gap-1 text-[9.5px] shrink-0 pt-0.5">
                      {/* Drug Alternatives (F8) */}
                      {onOpenAlternatives && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAlternatives(index);
                          }}
                          className="h-5 px-1.5 rounded bg-surface-2 dark:bg-surface-dark-3 hover:bg-brand-soft hover:text-brand dark:hover:bg-brand-soft/20 dark:hover:text-brand-bright border border-line dark:border-line-dark flex items-center gap-1 font-bold text-ink-muted dark:text-ink-dark-muted cursor-pointer transition-colors shadow-2xs"
                          title="البحث عن بدائل ومثائل دوائية لهذا الصنف (F8)"
                        >
                          <Pill className="w-2.5 h-2.5 text-brand dark:text-brand-bright shrink-0" />
                          <span>بدائل (F8)</span>
                        </button>
                      )}

                      {/* Controlled Drug Dispense Documentation */}
                      {item.isControlled && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenControlledDispense?.(index);
                          }}
                          className={`h-5 px-1.5 rounded flex items-center gap-1 font-bold cursor-pointer transition-colors shadow-2xs ${
                            item.controlledDispense
                              ? 'bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 text-paid dark:text-paid-bright hover:bg-paid/20'
                              : 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 text-warn dark:text-warn-bright hover:bg-warn/25 animate-pulse'
                          }`}
                          title={
                            item.controlledDispense
                              ? `تم توثيق الصرف للمريض: ${item.controlledDispense.patientName}`
                              : 'دواء جدول ورقابة مشددة - اضغط لتوثيق بيانات المريض والطبيب'
                          }
                        >
                          <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
                          <span>{item.controlledDispense ? 'موثق' : 'جدول'}</span>
                        </button>
                      )}

                      {/* Thermal Dosage Label Print */}
                      {onPrintDosageLabel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPrintDosageLabel(index);
                          }}
                          className="h-5 px-1.5 rounded bg-surface-2 dark:bg-surface-dark-3 hover:bg-brand-soft hover:text-brand dark:hover:bg-brand-soft/20 dark:hover:text-brand-bright border border-line dark:border-line-dark flex items-center gap-1 font-bold text-ink-muted dark:text-ink-dark-muted cursor-pointer transition-colors shadow-2xs"
                          title="طباعة ملصق جرعة حراري (استيكر صيدلي)"
                        >
                          <Printer className="w-2.5 h-2.5 text-brand dark:text-brand-bright shrink-0" />
                          <span>ملصق</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Unit Price (Read-only from inventory) */}
                <div className="w-14 sm:w-16 lg:w-20 shrink-0 text-center tabular-nums font-mono text-ink dark:text-ink-dark text-xs sm:text-[13px] font-bold">
                  <span>{formatArabicCurrency(item.unitPricePiasters, false)}</span>
                  <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted hidden sm:inline mr-0.5 font-normal">ج.م</span>
                </div>

                {/* Quantity Stepper or Weight Button */}
                <div className="w-20 sm:w-24 lg:w-26 shrink-0 flex items-center justify-center">
                  {item.unit === 'kg' ? (
                    <button
                      type="button"
                      onClick={() => openWeightEditorForCartItem(index)}
                      className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-brand-soft dark:bg-surface-dark-3 hover:bg-brand-soft/80 dark:hover:bg-surface-dark-2 border border-brand/20 dark:border-line-dark rounded flex items-center gap-1 text-brand-dark dark:text-ink-dark transition-all shadow-2xs group cursor-pointer active:scale-95"
                      title="اضغط لتعديل الوزن بالجرام أو الكيلو"
                    >
                      <Scale className="w-2.5 h-2.5 text-brand dark:text-brand-bright shrink-0" />
                      <span className="font-mono font-bold text-[10px] sm:text-[11px] tabular-nums truncate">
                        {(item.quantityMilli / 1000).toFixed(3).replace(/\.?0+$/, '')} كجم
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center h-6.5 sm:h-7 bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded px-0.5 gap-0.5 shadow-2xs">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(index, -1);
                        }}
                        className="w-4.5 h-4.5 sm:w-5 sm:h-5 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright font-bold text-xs rounded hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
                        title="إنقاص الكمية"
                      >
                        <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5]" />
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
                        className="w-5 sm:w-6 lg:w-7 h-4.5 sm:h-5 text-center font-mono font-extrabold text-ink dark:text-ink-dark text-xs tabular-nums bg-transparent border-0 focus:outline-none focus:bg-surface dark:focus:bg-surface-dark rounded p-0"
                        title="اضغط لتعديل الكمية بالكتابة مباشرة"
                      />
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(index, 1);
                        }}
                        className="w-4.5 h-4.5 sm:w-5 sm:h-5 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright font-bold text-xs rounded hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
                        title="زيادة الكمية"
                      >
                        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5]" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Item Discount Button */}
                <div className="w-8 sm:w-10 shrink-0 text-center">
                  <button
                    type="button"
                    onClick={() => onOpenItemDiscount(index)}
                    className={`px-1 sm:px-1.5 py-0.5 rounded transition-colors text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer ${
                      item.discountPiasters > 0
                        ? 'text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 hover:bg-warn-soft/80'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-paid-bright hover:bg-paid-soft dark:hover:bg-paid-dark-soft'
                    }`}
                    title="تطبيق خصم خاص على هذا الصنف"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">{item.discountPiasters > 0 ? '%' : 'خصم'}</span>
                  </button>
                </div>

                {/* Line Total */}
                <div className="w-14 sm:w-16 lg:w-20 shrink-0 text-left tabular-nums font-mono font-bold text-paid dark:text-brand-bright text-xs flex flex-col items-end justify-center">
                  <span className="font-extrabold">{formatArabicCurrency(item.totalPiasters, false)}</span>
                  {item.discountPiasters > 0 && (
                    <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted line-through font-normal">
                      {formatArabicCurrency(Math.round((item.unitPricePiasters * item.quantityMilli) / 1000), false)}
                    </span>
                  )}
                </div>

                {/* Delete Trigger */}
                <div className="w-6 sm:w-7 shrink-0 text-center">
                  <button 
                    onClick={() => removeItem(index)}
                    className="text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright p-1 rounded hover:bg-danger-soft dark:hover:bg-danger-dark-soft transition-colors cursor-pointer"
                    title="حذف الصنف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};
