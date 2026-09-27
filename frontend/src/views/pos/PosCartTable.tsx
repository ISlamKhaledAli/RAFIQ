import React from 'react';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle, 
  AlertCircle, 
  Scale, 
  Tag 
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
  editingPriceIndex: number | null;
  setEditingPriceIndex: (idx: number | null) => void;
  changeCartItemUnit: (index: number, newUnitId: string) => void;
  updateItemPrice: (index: number, newPricePiasters: number) => void;
  updateQuantity: (index: number, deltaPieces: number) => void;
  setDirectQuantity: (index: number, newQtyPieces: number) => void;
  openWeightEditorForCartItem: (index: number) => void;
  onOpenItemDiscount: (index: number) => void;
  removeItem: (index: number) => void;
}

export const PosCartTable: React.FC<PosCartTableProps> = ({
  cart,
  lastInvoiceNumber,
  draftPrompt,
  onRestoreDraft,
  onDiscardDraft,
  statusMessage,
  editingPriceIndex,
  setEditingPriceIndex,
  changeCartItemUnit,
  updateItemPrice,
  updateQuantity,
  setDirectQuantity,
  openWeightEditorForCartItem,
  onOpenItemDiscount,
  removeItem,
}) => {
  return (
    <>
      {/* Feature #132: Power Outage Cart Draft Recovery Prompt Banner */}
      {draftPrompt && (
        <div className="mx-3 mt-2 p-3 bg-amber-500/15 border-2 border-amber-500/40 rounded-lg flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
            <div>
              <div className="text-xs font-bold text-ink">
                توجد فاتورة سابقة مفتوحة لم تكتمل (حُفظت تلقائياً قبل إغلاق النظام أو انقطاع الكهرباء):
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                عدد الأصناف: {draftPrompt.items.length} — الإجمالي: {formatArabicCurrency(draftPrompt.items.reduce((sum, i) => sum + i.totalPiasters, 0) - (draftPrompt.discountPiasters || 0))} — تم الحفظ: {new Date(draftPrompt.savedAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRestoreDraft}
              className="px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded text-xs font-bold transition-colors shadow-2xs"
            >
              استرجاع السلة
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="px-2.5 py-1.5 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded text-xs transition-colors"
            >
              تجاهل ومسح
            </button>
          </div>
        </div>
      )}

      {/* Status Message Notification Toast */}
      {statusMessage && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded text-[12px] font-semibold border flex items-center gap-2 transition-all ${
          statusMessage.type === 'success' 
            ? 'bg-paid-soft border-paid-border text-paid' 
            : statusMessage.type === 'warning'
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300'
            : 'bg-danger-soft border-danger-border text-danger'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Cart Table Area */}
      <div className="flex-1 flex flex-col overflow-hidden mt-1">
        {/* Table Column Headers (36px tall, surface-2, hairline-b) */}
        <div className="h-[32px] sm:h-[36px] bg-surface-2 hairline-b flex items-center px-2 sm:px-4 text-[11px] sm:text-[12px] font-bold text-ink-muted select-none shrink-0">
          <div className="w-[6%] text-center">#</div>
          <div className="w-[37%] text-right">الصنف / الباركود</div>
          <div className="w-[14%] text-left tabular-nums">السعر</div>
          <div className="w-[18%] text-center">الكمية</div>
          <div className="w-[8%] text-center">خصم</div>
          <div className="w-[13%] text-left tabular-nums">الإجمالي</div>
          <div className="w-[4%] text-center">حذف</div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-3 p-6">
              <div className="w-14 h-14 rounded-full bg-surface-2 border border-line flex items-center justify-center">
                <ShoppingBag className="w-7 h-7 text-ink-muted stroke-[1.4]" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-bold text-ink m-0">سلة البيع فارغة</p>
                <p className="text-[12px] text-ink-muted m-0 mt-1">
                  امسح الباركود، أو اختر من قائمة الأصناف السريعة على اليسار لبدء الفاتورة
                </p>
              </div>
              {lastInvoiceNumber && (
                <span className="text-[11px] font-mono text-paid bg-paid-soft border border-paid-border px-2.5 py-1 rounded">
                  آخر فاتورة تم حفظها: #{lastInvoiceNumber}
                </span>
              )}
            </div>
          ) : (
            cart.map((item, index) => (
              <div 
                key={item.productId || index} 
                className="h-[48px] sm:h-[52px] hairline-b flex items-center px-2 sm:px-4 text-xs sm:text-[13px] hover:bg-surface-2 transition-colors"
              >
                {/* Index */}
                <div className="w-[6%] text-center font-mono text-ink-muted text-[11px] sm:text-xs">
                  {index + 1}
                </div>

                {/* Description */}
                <div className="w-[37%] pr-1 flex flex-col justify-center overflow-hidden">
                  <div className="flex items-center gap-1 truncate">
                    <span className="font-semibold text-ink truncate text-xs sm:text-[13px]">{item.productName}</span>
                    {item.unit === 'kg' && (
                      <span className="shrink-0 px-1 py-0.2 bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-[9px] sm:text-[10px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                        <Scale className="w-2.5 h-2.5" />
                        <span>وزن</span>
                      </span>
                    )}
                    {/* Task 161-5: Unit Selector Dropdown if multiple units exist */}
                    {item.productUnits && item.productUnits.length > 1 && (
                      <select
                        value={item.unitId || ''}
                        onChange={(e) => changeCartItemUnit(index, e.target.value)}
                        className="h-[22px] px-1 py-0 bg-brand-soft border border-brand/30 text-brand text-[10px] font-bold rounded cursor-pointer focus:outline-none shrink-0"
                        title="تغيير وحدة البيع (قطعة، دستة، كرتونة)"
                      >
                        {item.productUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.unitName} (×{u.conversionFactor})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] sm:text-[10px] font-mono text-ink-muted truncate">
                      {item.barcode || 'بدون باركود'}
                    </span>
                    {item.discountPiasters > 0 && (
                      <span className="text-[9px] text-amber-800 dark:text-amber-200 bg-amber-500/15 border border-amber-500/30 font-bold px-1 rounded flex items-center gap-0.5">
                        <Tag className="w-2.5 h-2.5" />
                        خصم: {formatArabicCurrency(item.discountPiasters)}
                      </span>
                    )}
                    {item.unitName && item.conversionFactor && item.conversionFactor > 1 && (
                      <span className="text-[9px] text-brand font-bold bg-brand-soft px-1 rounded">
                        {item.unitName} = {item.conversionFactor} قطعة
                      </span>
                    )}
                  </div>
                </div>

                {/* Unit Price (Editable on click — Task 161-6) */}
                <div className="w-[14%] text-left tabular-nums font-mono text-ink text-xs sm:text-[13px]">
                  {editingPriceIndex === index ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.25"
                        autoFocus
                        defaultValue={(item.unitPricePiasters / 100).toFixed(2)}
                        onBlur={(e) => {
                          const val = parseFloat(normalizeArabicNumerals(e.target.value));
                          if (!isNaN(val) && val >= 0) {
                            updateItemPrice(index, Math.round(val * 100));
                          }
                          setEditingPriceIndex(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            setEditingPriceIndex(null);
                          }
                        }}
                        className="w-16 h-6 px-1 text-center font-mono text-xs bg-surface border-2 border-brand rounded text-brand font-bold focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div 
                      onClick={() => setEditingPriceIndex(index)}
                      className="cursor-pointer hover:bg-surface-2 rounded px-1 inline-flex items-center gap-0.5 group"
                      title="اضغط لتعديل السعر يدويًا لهذه الفاتورة"
                    >
                      <span className="group-hover:text-brand font-bold">{formatArabicCurrency(item.unitPricePiasters)}</span>
                      <span className="text-[9px] text-ink-muted group-hover:text-brand">/{item.unit || 'قطعة'}</span>
                    </div>
                  )}
                </div>

                {/* Quantity Stepper or Weight Button */}
                <div className="w-[18%] flex items-center justify-center">
                  {item.unit === 'kg' ? (
                    <button
                      type="button"
                      onClick={() => openWeightEditorForCartItem(index)}
                      className="h-[28px] sm:h-[32px] px-1.5 sm:px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded flex items-center gap-1 text-amber-800 dark:text-amber-200 transition-colors shadow-2xs group"
                      title="اضغط لتعديل الوزن بالجرام أو الكيلو"
                    >
                      <Scale className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 group-hover:scale-110 transition-transform shrink-0" />
                      <span className="font-mono font-bold text-[11px] sm:text-[12px] tabular-nums">
                        {(item.quantityMilli / 1000).toFixed(3)} كجم
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center h-[28px] sm:h-[32px] bg-surface border border-line rounded px-0.5 sm:px-1 gap-0.5 sm:gap-1">
                      <button 
                        type="button"
                        onClick={() => updateQuantity(index, -1)}
                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-xs sm:text-sm rounded hover:bg-surface-2"
                        title="إنقاص الكمية"
                      >
                        <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                      <input
                        type="text"
                        value={item.quantityMilli / 1000}
                        onChange={(e) => {
                          const val = parseInt(normalizeArabicNumerals(e.target.value), 10);
                          if (!isNaN(val) && val >= 0) {
                            setDirectQuantity(index, val);
                          }
                        }}
                        className="w-8 sm:w-9 h-5 sm:h-6 text-center font-mono font-bold text-ink text-xs sm:text-[13px] tabular-nums bg-transparent border-0 focus:outline-hidden focus:bg-surface-2 rounded"
                        title="اضغط لتعديل الكمية بالكتابة مباشرة"
                      />
                      <button 
                        type="button"
                        onClick={() => updateQuantity(index, 1)}
                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-xs sm:text-sm rounded hover:bg-surface-2"
                        title="زيادة الكمية"
                      >
                        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Item Discount Button (Feature #24) */}
                <div className="w-[8%] text-center">
                  <button
                    type="button"
                    onClick={() => onOpenItemDiscount(index)}
                    className={`px-1.5 py-1 rounded transition-colors text-[10px] font-bold inline-flex items-center gap-0.5 ${
                      item.discountPiasters > 0
                        ? 'text-amber-700 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30'
                        : 'text-ink-muted hover:text-brand hover:bg-surface-2'
                    }`}
                    title="تطبيق خصم خاص على هذا الصنف"
                  >
                    <Tag className="w-3 h-3" />
                    <span>{item.discountPiasters > 0 ? '%' : 'خصم'}</span>
                  </button>
                </div>

                {/* Line Total */}
                <div className="w-[13%] text-left tabular-nums font-mono font-bold text-brand text-xs sm:text-[13px] flex flex-col items-end justify-center">
                  <span>{formatArabicCurrency(item.totalPiasters)}</span>
                  {item.discountPiasters > 0 && (
                    <span className="text-[10px] text-ink-muted line-through font-normal">
                      {formatArabicCurrency(Math.round((item.unitPricePiasters * item.quantityMilli) / 1000))}
                    </span>
                  )}
                </div>

                {/* Delete Trigger */}
                <div className="w-[4%] text-center">
                  <button 
                    onClick={() => removeItem(index)}
                    className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
                    title="حذف الصنف"
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
