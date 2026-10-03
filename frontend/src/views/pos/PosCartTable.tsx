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
import { CustomSelect } from '../../components/CustomSelect';

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
        <div className="mx-2.5 sm:mx-3 mt-2 p-2.5 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink truncate">
                توجد فاتورة سابقة مفتوحة لم تكتمل (حُفظت تلقائياً قبل إغلاق النظام أو انقطاع الكهرباء):
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                عدد الأصناف: {draftPrompt.items.length} — الإجمالي: {formatArabicCurrency(draftPrompt.items.reduce((sum, i) => sum + i.totalPiasters, 0) - (draftPrompt.discountPiasters || 0))} — تم الحفظ: {new Date(draftPrompt.savedAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRestoreDraft}
              className="px-2.5 py-1 bg-brand hover:bg-brand-hover text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
            >
              استرجاع
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="px-2 py-1 bg-surface hover:bg-surface-2 border border-line text-ink-muted hover:text-ink rounded-lg text-xs transition-colors cursor-pointer"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {/* Status Message Notification Toast */}
      {statusMessage && (
        <div className={`mx-2.5 sm:mx-3 mt-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all ${
          statusMessage.type === 'success' 
            ? 'bg-paid-soft border-paid-border text-paid' 
            : statusMessage.type === 'warning'
            ? 'bg-warn-soft border-warn-border text-warn' 
            : 'bg-danger-soft border-danger-border text-danger'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-paid" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Main Cart Items Container */}
      <div className="flex-1 flex flex-col overflow-hidden mt-1 bg-surface">
        {/* Table Column Headers */}
        <div className="h-8 sm:h-9 bg-surface-2 border-b border-line flex items-center px-2 sm:px-3 text-xs font-bold text-ink-muted select-none shrink-0 w-full">
          <div className="w-5 shrink-0 text-center font-mono">#</div>
          <div className="flex-1 min-w-[90px] text-right font-bold pr-1.5 truncate">الصنف / الباركود</div>
          <div className="w-14 sm:w-16 shrink-0 text-left tabular-nums font-bold">السعر</div>
          <div className="w-18 sm:w-20 shrink-0 text-center font-bold">الكمية</div>
          <div className="w-10 sm:w-11 shrink-0 text-center font-bold">خصم</div>
          <div className="w-14 sm:w-16 shrink-0 text-left tabular-nums font-bold">الإجمالي</div>
          <div className="w-6 sm:w-7 shrink-0 text-center font-bold">حذف</div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/60 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2.5 p-6">
              <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center shadow-2xs">
                <ShoppingBag className="w-7 h-7 text-ink-muted/60 stroke-[1.5]" />
              </div>
              <div className="text-center">
                <p className="text-sm sm:text-base font-extrabold text-ink m-0">سلة البيع فارغة</p>
                <p className="text-xs text-ink-muted m-0 mt-0.5 font-medium">
                  امسح الباركود، أو اختر من قائمة الأصناف السريعة على اليسار لبدء الفاتورة
                </p>
              </div>
              {lastInvoiceNumber && (
                <span className="text-xs font-mono font-bold text-paid bg-paid-soft border border-paid-border px-3 py-1 rounded-xl shadow-2xs">
                  آخر فاتورة تم حفظها: #{lastInvoiceNumber}
                </span>
              )}
            </div>
          ) : (
            cart.map((item, index) => (
              <div 
                key={item.productId || index} 
                className="min-h-[46px] sm:min-h-[50px] border-b border-line/40 flex items-center px-2 sm:px-3 text-xs hover:bg-surface-2/60 transition-colors w-full"
              >
                {/* Index */}
                <div className="w-5 shrink-0 text-center font-mono text-ink-muted text-xs font-bold">
                  {index + 1}
                </div>

                {/* Description */}
                <div className="flex-1 min-w-[90px] pr-1.5 flex flex-col justify-center overflow-hidden">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-ink truncate text-xs sm:text-sm">{item.productName}</span>
                    {item.unit === 'kg' && (
                      <span className="shrink-0 px-1 py-0.2 bg-sky-50 border border-sky-200 text-sky-800 text-[9px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                        <Scale className="w-2.5 h-2.5 text-sky-600" />
                        <span>وزن</span>
                      </span>
                    )}
                    {/* Unit Selector Dropdown if multiple units exist */}
                    {item.productUnits && item.productUnits.length > 1 && (
                      <CustomSelect
                        value={item.unitId || ''}
                        onChange={(val) => changeCartItemUnit(index, val)}
                        options={item.productUnits.map((u) => ({
                          value: u.id || '',
                          label: `${u.unitName} (×${u.conversionFactor})`
                        }))}
                        size="sm"
                        className="w-24 shrink-0 text-[10px]"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-ink-muted truncate">
                    <span className="font-mono truncate">
                      {item.barcode || 'بدون باركود'}
                    </span>
                    {item.discountPiasters > 0 && (
                      <span className="text-amber-800 bg-amber-50 border border-amber-200 font-bold px-1 rounded flex items-center gap-0.5 shrink-0">
                        <Tag className="w-2 h-2" />
                        خصم: {formatArabicCurrency(item.discountPiasters)}
                      </span>
                    )}
                    {item.unitName && item.conversionFactor && item.conversionFactor > 1 && (
                      <span className="text-paid font-bold bg-paid-soft border border-paid-border px-1 rounded shrink-0">
                        {item.unitName} = {item.conversionFactor} قطعة
                      </span>
                    )}
                  </div>
                </div>

                {/* Unit Price (Editable on click) */}
                <div className="w-14 sm:w-16 shrink-0 text-left tabular-nums font-mono text-ink text-xs">
                  {editingPriceIndex === index ? (
                    <div className="flex items-center gap-0.5">
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
                        className="w-12 h-6 px-1 text-center font-mono text-xs bg-surface border-2 border-brand rounded text-brand font-bold focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div 
                      onClick={() => setEditingPriceIndex(index)}
                      className="cursor-pointer hover:bg-paid-soft rounded px-1 py-0.5 inline-flex items-baseline gap-0.5 group transition-colors"
                      title="اضغط لتعديل السعر يدويًا لهذه الفاتورة"
                    >
                      <span className="group-hover:text-paid font-bold text-xs">{(item.unitPricePiasters / 100).toFixed(2)}</span>
                      <span className="text-[10px] text-ink-muted">ج.م</span>
                    </div>
                  )}
                </div>

                {/* Quantity Stepper or Weight Button */}
                <div className="w-18 sm:w-20 shrink-0 flex items-center justify-center">
                  {item.unit === 'kg' ? (
                    <button
                      type="button"
                      onClick={() => openWeightEditorForCartItem(index)}
                      className="h-6.5 px-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded flex items-center gap-1 text-sky-800 transition-all shadow-2xs group cursor-pointer active:scale-95"
                      title="اضغط لتعديل الوزن بالجرام أو الكيلو"
                    >
                      <Scale className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                      <span className="font-mono font-bold text-[10px] tabular-nums">
                        {(item.quantityMilli / 1000).toFixed(2)} كجم
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center h-6.5 bg-surface-2 border border-line rounded px-0.5 gap-0.5 shadow-2xs">
                      <button 
                        type="button"
                        onClick={() => updateQuantity(index, -1)}
                        className="w-4.5 h-4.5 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-xs rounded hover:bg-surface transition-colors cursor-pointer"
                        title="إنقاص الكمية"
                      >
                        <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
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
                        className="w-6 h-4.5 text-center font-mono font-extrabold text-ink text-xs tabular-nums bg-transparent border-0 focus:outline-none focus:bg-surface rounded"
                        title="اضغط لتعديل الكمية بالكتابة مباشرة"
                      />
                      <button 
                        type="button"
                        onClick={() => updateQuantity(index, 1)}
                        className="w-4.5 h-4.5 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-xs rounded hover:bg-surface transition-colors cursor-pointer"
                        title="زيادة الكمية"
                      >
                        <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Item Discount Button */}
                <div className="w-10 sm:w-11 shrink-0 text-center">
                  <button
                    type="button"
                    onClick={() => onOpenItemDiscount(index)}
                    className={`px-1.5 py-0.5 rounded transition-colors text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer ${
                      item.discountPiasters > 0
                        ? 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                        : 'text-ink-muted hover:text-paid hover:bg-paid-soft'
                    }`}
                    title="تطبيق خصم خاص على هذا الصنف"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    <span>{item.discountPiasters > 0 ? '%' : 'خصم'}</span>
                  </button>
                </div>

                {/* Line Total */}
                <div className="w-14 sm:w-16 shrink-0 text-left tabular-nums font-mono font-bold text-paid text-xs flex flex-col items-end justify-center">
                  <span className="font-extrabold">{(item.totalPiasters / 100).toFixed(2)}</span>
                  {item.discountPiasters > 0 && (
                    <span className="text-[10px] text-ink-muted line-through font-normal">
                      {((Math.round((item.unitPricePiasters * item.quantityMilli) / 1000)) / 100).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Delete Trigger */}
                <div className="w-6 sm:w-7 shrink-0 text-center">
                  <button 
                    onClick={() => removeItem(index)}
                    className="text-ink-muted hover:text-danger p-1 rounded hover:bg-danger-soft transition-colors cursor-pointer"
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
