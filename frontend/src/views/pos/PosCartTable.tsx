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
  AlertTriangle
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
  changeCartItemUnit: (index: number, newUnitId: string) => void;
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
  changeCartItemUnit,
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
                className="min-h-[46px] sm:min-h-[50px] border-b border-line/40 dark:border-line-dark/50 flex items-center px-2 sm:px-3 text-xs hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors w-full gap-1 sm:gap-1.5 lg:gap-2"
              >
                {/* Index */}
                <div className="w-5 shrink-0 text-center font-mono text-ink-muted dark:text-ink-dark-muted text-xs font-bold">
                  {index + 1}
                </div>

                {/* Description */}
                <div className="flex-1 min-w-0 pr-1 flex flex-col justify-center overflow-hidden">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-ink dark:text-ink-dark truncate text-xs sm:text-sm">{item.productName}</span>
                    {item.unit === 'kg' && (
                      <span className="shrink-0 px-1 py-0.2 bg-brand-soft dark:bg-surface-dark-3 border border-brand/20 dark:border-line-dark text-brand dark:text-brand-bright text-[9px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                        <Scale className="w-2.5 h-2.5 text-brand dark:text-brand-bright" />
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
                        className="w-20 sm:w-24 shrink-0 text-[10px]"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-muted dark:text-ink-dark-muted truncate">
                    <span className="font-mono truncate">
                      {item.barcode || 'بدون باركود'}
                    </span>
                    {item.discountPiasters > 0 && (
                      <span className="text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 font-bold px-1 rounded flex items-center gap-0.5 shrink-0">
                        <Tag className="w-2 h-2" />
                        خصم: {formatArabicCurrency(item.discountPiasters)}
                      </span>
                    )}
                    {item.unitName && item.conversionFactor && item.conversionFactor > 1 && (
                      <span className="text-paid dark:text-paid-bright font-bold bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-1 rounded shrink-0">
                        {item.unitName} = {item.conversionFactor} قطعة
                      </span>
                    )}
                    {item.isExpiredBypass && (
                      <span 
                        className="text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger/30 font-bold px-1 rounded flex items-center gap-0.5 shrink-0"
                        title={`تاريخ الانتهاء: ${item.expiryDate || 'منتهي'} - بيع بتخطي واعتماد إداري`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5 text-danger dark:text-danger-bright shrink-0" />
                        منتهي (بتخطي إداري){item.expiryDate ? `: ${item.expiryDate}` : ''}
                      </span>
                    )}
                    {!item.isExpiredBypass && (item.batchNumber || item.expiryDate) && (
                      <span 
                        className="text-paid dark:text-paid-bright font-bold bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-1 rounded flex items-center gap-0.5 shrink-0 font-mono"
                        title={`تشغيلة: ${item.batchNumber || 'افتراضية'} - صلاحية: ${item.expiryDate || 'غير محدد'}`}
                      >
                        <Calendar className="w-2.5 h-2.5 text-paid dark:text-paid-bright shrink-0" />
                        {item.batchNumber ? `${item.batchNumber}` : ''}{item.batchNumber && item.expiryDate ? ' | ' : ''}{item.expiryDate ? `${item.expiryDate}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Unit Price (Read-only from inventory) */}
                <div className="w-14 sm:w-16 lg:w-20 shrink-0 text-center tabular-nums font-mono text-ink dark:text-ink-dark text-xs sm:text-[13px] font-bold">
                  <span>{(item.unitPricePiasters / 100).toFixed(2)}</span>
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
                  <span className="font-extrabold">{(item.totalPiasters / 100).toFixed(2)}</span>
                  {item.discountPiasters > 0 && (
                    <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted line-through font-normal">
                      {((Math.round((item.unitPricePiasters * item.quantityMilli) / 1000)) / 100).toFixed(2)}
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
