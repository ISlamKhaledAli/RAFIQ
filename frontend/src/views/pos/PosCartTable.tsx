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
      <div className="flex-1 flex flex-col overflow-hidden mt-1 bg-white">
        {/* Table Column Headers (38px tall, surface-container-low, clean border) */}
        <div className="h-9 sm:h-10 bg-[#f8fafc] border-b border-[#dce1dc] flex items-center px-2 sm:px-3 text-xs font-bold text-[#52605d] select-none shrink-0 min-w-[420px]">
          <div className="w-6 shrink-0 text-center font-mono">#</div>
          <div className="flex-1 min-w-[120px] text-right font-bold pr-1.5">الصنف / الباركود</div>
          <div className="w-16 shrink-0 text-left tabular-nums font-bold">السعر</div>
          <div className="w-20 shrink-0 text-center font-bold">الكمية</div>
          <div className="w-11 shrink-0 text-center font-bold">خصم</div>
          <div className="w-16 shrink-0 text-left tabular-nums font-bold">الإجمالي</div>
          <div className="w-7 shrink-0 text-center font-bold">حذف</div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#dce1dc]/60">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#52605d] gap-3 p-6">
              <div className="w-16 h-16 rounded-2xl bg-[#f8fafc] border border-[#dce1dc] flex items-center justify-center shadow-2xs">
                <ShoppingBag className="w-8 h-8 text-[#52605d]/60 stroke-[1.5]" />
              </div>
              <div className="text-center">
                <p className="text-sm sm:text-base font-extrabold text-[#0f172a] m-0">سلة البيع فارغة</p>
                <p className="text-xs text-[#52605d] m-0 mt-1 font-medium">
                  امسح الباركود، أو اختر من قائمة الأصناف السريعة على اليسار لبدء الفاتورة
                </p>
              </div>
              {lastInvoiceNumber && (
                <span className="text-xs font-mono font-bold text-[#006d41] bg-[#eaf5ee] border border-[#c4e3d0] px-3 py-1 rounded-xl shadow-2xs">
                  آخر فاتورة تم حفظها: #{lastInvoiceNumber}
                </span>
              )}
            </div>
          ) : (
            cart.map((item, index) => (
              <div 
                key={item.productId || index} 
                className="h-12 sm:h-14 border-b border-[#dce1dc]/40 flex items-center px-2 sm:px-3 text-xs sm:text-sm hover:bg-[#f8fafc] transition-colors min-w-[420px]"
              >
                {/* Index */}
                <div className="w-6 shrink-0 text-center font-mono text-[#52605d] text-xs font-bold">
                  {index + 1}
                </div>

                {/* Description */}
                <div className="flex-1 min-w-[120px] pr-1.5 flex flex-col justify-center overflow-hidden">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-[#0f172a] truncate text-xs sm:text-sm">{item.productName}</span>
                    {item.unit === 'kg' && (
                      <span className="shrink-0 px-1.5 py-0.2 bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-bold rounded-md flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                        <Scale className="w-3 h-3 text-sky-600" />
                        <span>وزن</span>
                      </span>
                    )}
                    {/* Task 161-5 & 54-4: Unit Selector Dropdown if multiple units exist */}
                    {item.productUnits && item.productUnits.length > 1 && (
                      <CustomSelect
                        value={item.unitId || ''}
                        onChange={(val) => changeCartItemUnit(index, val)}
                        options={item.productUnits.map((u) => ({
                          value: u.id || '',
                          label: `${u.unitName} (×${u.conversionFactor})`
                        }))}
                        size="sm"
                        className="w-28 shrink-0 text-[10px]"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#52605d] truncate">
                      {item.barcode || 'بدون باركود'}
                    </span>
                    {item.discountPiasters > 0 && (
                      <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 font-bold px-1.5 rounded-md flex items-center gap-0.5">
                        <Tag className="w-2.5 h-2.5" />
                        خصم: {formatArabicCurrency(item.discountPiasters)}
                      </span>
                    )}
                    {item.unitName && item.conversionFactor && item.conversionFactor > 1 && (
                      <span className="text-[10px] text-[#006d41] font-bold bg-[#eaf5ee] border border-[#c4e3d0] px-1.5 rounded-md">
                        {item.unitName} = {item.conversionFactor} قطعة
                      </span>
                    )}
                  </div>
                </div>

                {/* Unit Price (Editable on click — Task 161-6) */}
                <div className="w-16 shrink-0 text-left tabular-nums font-mono text-[#0f172a] text-xs">
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
                        className="w-14 h-6 px-1 text-center font-mono text-xs bg-white border-2 border-[#006d41] rounded-md text-[#006d41] font-bold focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div 
                      onClick={() => setEditingPriceIndex(index)}
                      className="cursor-pointer hover:bg-[#eaf5ee] rounded-md px-1 py-0.5 inline-flex items-baseline gap-0.5 group transition-colors"
                      title="اضغط لتعديل السعر يدويًا لهذه الفاتورة"
                    >
                      <span className="group-hover:text-[#006d41] font-bold text-xs">{(item.unitPricePiasters / 100).toFixed(2)}</span>
                      <span className="text-[9px] text-[#52605d]">ج.م</span>
                    </div>
                  )}
                </div>

                {/* Quantity Stepper or Weight Button */}
                <div className="w-20 shrink-0 flex items-center justify-center">
                  {item.unit === 'kg' ? (
                    <button
                      type="button"
                      onClick={() => openWeightEditorForCartItem(index)}
                      className="h-7 px-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg flex items-center gap-1 text-sky-800 transition-all shadow-2xs group cursor-pointer active:scale-95"
                      title="اضغط لتعديل الوزن بالجرام أو الكيلو"
                    >
                      <Scale className="w-3 h-3 text-sky-600 shrink-0" />
                      <span className="font-mono font-bold text-[11px] tabular-nums">
                        {(item.quantityMilli / 1000).toFixed(2)} كجم
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center h-7 bg-[#f8fafc] border border-[#dce1dc] rounded-lg px-0.5 gap-0.5 shadow-2xs">
                      <button 
                        type="button"
                        onClick={() => updateQuantity(index, -1)}
                        className="w-5 h-5 flex items-center justify-center text-[#52605d] hover:text-[#006d41] font-bold text-xs rounded hover:bg-white transition-colors cursor-pointer"
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
                        className="w-7 h-5 text-center font-mono font-extrabold text-[#0f172a] text-xs tabular-nums bg-transparent border-0 focus:outline-none focus:bg-white rounded"
                        title="اضغط لتعديل الكمية بالكتابة مباشرة"
                      />
                      <button 
                        type="button"
                        onClick={() => updateQuantity(index, 1)}
                        className="w-5 h-5 flex items-center justify-center text-[#52605d] hover:text-[#006d41] font-bold text-xs rounded hover:bg-white transition-colors cursor-pointer"
                        title="زيادة الكمية"
                      >
                        <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Item Discount Button (Feature #24) */}
                <div className="w-11 shrink-0 text-center">
                  <button
                    type="button"
                    onClick={() => onOpenItemDiscount(index)}
                    className={`px-1.5 py-0.5 rounded-md transition-colors text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer ${
                      item.discountPiasters > 0
                        ? 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                        : 'text-[#52605d] hover:text-[#006d41] hover:bg-[#eaf5ee]'
                    }`}
                    title="تطبيق خصم خاص على هذا الصنف"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    <span>{item.discountPiasters > 0 ? '%' : 'خصم'}</span>
                  </button>
                </div>

                {/* Line Total */}
                <div className="w-16 shrink-0 text-left tabular-nums font-mono font-bold text-[#006d41] text-xs flex flex-col items-end justify-center">
                  <span className="font-extrabold">{(item.totalPiasters / 100).toFixed(2)}</span>
                  {item.discountPiasters > 0 && (
                    <span className="text-[9px] text-[#52605d] line-through font-normal">
                      {((Math.round((item.unitPricePiasters * item.quantityMilli) / 1000)) / 100).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Delete Trigger */}
                <div className="w-7 shrink-0 text-center">
                  <button 
                    onClick={() => removeItem(index)}
                    className="text-[#52605d] hover:text-[#b23a2e] p-1 rounded-md hover:bg-[#fdf3f2] transition-colors cursor-pointer"
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
