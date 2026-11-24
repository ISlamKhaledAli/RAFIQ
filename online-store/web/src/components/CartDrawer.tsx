import React, { useState, useMemo } from 'react';
import type { CartItem, Store, Product } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useSwipeDownDismiss } from '../hooks/useSwipeDownDismiss';
import { formatUnitArabic } from '../utils/unitFormatter';
import { FreeShippingProgressBar } from './FreeShippingProgressBar';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowLeft,
  MapPin,
  Truck,
  Store as StoreIcon,
  Check,
  ChevronDown,
  Sparkles,
  Package,
  MessageSquare,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  store: Store;
  selectedDeliveryZone: string;
  onSelectDeliveryZone: (zone: string) => void;
  deliveryMethod: 'delivery' | 'pickup';
  onSelectDeliveryMethod: (method: 'delivery' | 'pickup') => void;
  onAddToCart: (product: any) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearItem: (productId: string) => void;
  onProceedToCheckout: () => void;
  suggestedProducts?: Product[];
  showFreeShippingBar?: boolean;
  freeShippingThresholdPiasters?: number;
  showWhatsAppQuickOrder?: boolean;
  crossSellTitle?: string;
}

export const CartDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  cartItems,
  store,
  selectedDeliveryZone,
  onSelectDeliveryZone,
  deliveryMethod,
  onSelectDeliveryMethod,
  onAddToCart,
  onRemoveFromCart,
  onClearItem,
  onProceedToCheckout,
  suggestedProducts = [],
  showFreeShippingBar = true,
  freeShippingThresholdPiasters = 25000,
  showWhatsAppQuickOrder = true,
  crossSellTitle = 'يكتمل طلبك بهذه الأصناف:',
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 280);
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);

  const { dragHandleProps, sheetStyle } = useSwipeDownDismiss({
    onClose,
    threshold: 75,
  });

  // Safe integer calculations
  let subtotalPiasters = 0;
  cartItems.forEach(item => {
    subtotalPiasters += Math.round(item.product.price_piasters * item.quantity);
  });

  let deliveryFeePiasters = 0;
  if (deliveryMethod === 'delivery' && selectedDeliveryZone && store.delivery_zones) {
    const zone = store.delivery_zones.find(z => z.name === selectedDeliveryZone);
    if (zone) deliveryFeePiasters = Math.round(zone.fee);
  }

  const grandTotalPiasters = subtotalPiasters + deliveryFeePiasters;

  // Cross-selling: filter out products that are already in cart
  const unaddedSuggestions = useMemo(() => {
    const inCartIds = new Set(cartItems.map(i => i.product.id));
    return suggestedProducts.filter(p => !inCartIds.has(p.id) && p.in_stock && p.stock_quantity > 0).slice(0, 3);
  }, [suggestedProducts, cartItems]);

  // WhatsApp formatted direct order link
  const whatsappOrderUrl = useMemo(() => {
    const phone = store.whatsapp || store.phone;
    if (!phone || cartItems.length === 0) return '#';
    const lines = [
      `مرحباً ${store.name || ''}، أود تأكيد الطلب التالي:`,
      ...cartItems.map(
        (item, idx) =>
          `${idx + 1}. ${item.product.name} × ${item.quantity} = ${((item.product.price_piasters * item.quantity) / 100).toFixed(2)} ج.م`
      ),
      `------------------------`,
      `إجمالي الأصناف: ${(subtotalPiasters / 100).toFixed(2)} ج.م`,
      deliveryMethod === 'delivery'
        ? `طريقة الاستلام: توصيل (منطقة: ${selectedDeliveryZone || 'غير محدد'})`
        : `طريقة الاستلام: استلام من المحل`,
    ];
    return buildWhatsAppUrl(phone, lines.join('\n'));
  }, [store.whatsapp, store.phone, store.name, cartItems, subtotalPiasters, deliveryMethod, selectedDeliveryZone]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-slate-950/55 transition-opacity duration-200 ease-out ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer Panel */}
      <aside
        className={`fixed inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none h-[92vh] sm:h-full shadow-2xl flex flex-col justify-between border-t sm:border-l sm:border-t-0 border-store-line overflow-hidden transition-transform duration-[280ms] ease-out z-50 ${
          visible
            ? 'translate-y-0 sm:translate-x-0'
            : 'translate-y-full sm:translate-x-full'
        }`}
        style={{
          backgroundColor: 'var(--store-drawer-bg, #FFFFFF)',
          ...sheetStyle,
        }}
      >
        {/* Mobile Swipe Handle Pill with Touch Physics */}
        <div
          {...dragHandleProps}
          className="sm:hidden w-full py-2.5 flex items-center justify-center cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full"></div>
        </div>

        {/* Drawer Header */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b border-store-line flex items-center justify-between bg-slate-50 flex-shrink-0"
          style={{ backgroundColor: 'var(--store-drawer-header, #F8FAFC)' }}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-store-primary" />
            <h2 className="text-base sm:text-lg font-black text-slate-900">سلة المشتريات</h2>
            <span className="text-xs bg-store-primary text-white font-black px-2.5 py-0.5 rounded-full shadow-2xs">
              {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 hover:text-slate-900 transition-colors btn-spring"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Shipping Motivational Progress Bar */}
        {cartItems.length > 0 && showFreeShippingBar && (
          <div className="px-4 py-2.5 bg-slate-50 border-b border-store-line flex-shrink-0">
            <FreeShippingProgressBar
              currentSubtotalPiasters={subtotalPiasters}
              freeShippingThresholdPiasters={freeShippingThresholdPiasters}
            />
          </div>
        )}

        {/* Drawer Items List */}
        <div
          className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5 bg-slate-50"
          style={{ backgroundColor: 'var(--store-card-subtle, #F8FAFC)' }}
        >
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div className="w-20 h-20 rounded-3xl bg-store-primary-light text-store-primary flex items-center justify-center mb-3 shadow-sm border border-store-primary/20">
                <ShoppingBag className="w-10 h-10 text-store-primary" />
              </div>
              <h3 className="font-black text-base text-slate-900">سلة مشترياتك لسه فاضية!</h3>
              <p className="text-xs mt-1 text-slate-500 max-w-xs leading-relaxed">
                لسه ما ضفتش أي أصناف في الأوردر.. تصفح بضاعة المحل ونقي اللي يلزمك دلوقتي
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 px-6 py-2.5 rounded-xl text-xs font-black bg-store-primary hover:opacity-90 text-white shadow-md btn-spring transition-all flex items-center gap-2"
              >
                <span>تصفح بضاعة المحل دلوقتي</span>
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <>
              {cartItems.map(item => {
                const itemTotal = ((item.product.price_piasters * item.quantity) / 100).toFixed(2);
                return (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-slate-200 hover:border-store-primary/60 transition-colors shadow-2xs"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {item.product.name}
                      </h4>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {(item.product.price_piasters / 100).toFixed(2)} ج.م × {item.quantity} {formatUnitArabic(item.product.unit_name)}
                      </div>
                      <div className="text-xs font-black text-store-primary mt-1">
                        {itemTotal} ج.م
                      </div>
                    </div>

                    {/* Quantity Stepper */}
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => onRemoveFromCart(item.product.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors shadow-2xs btn-spring font-bold"
                        title="تقليل"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-black text-xs text-slate-900">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onAddToCart(item.product)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-store-primary text-white hover:opacity-90 transition-opacity shadow-2xs btn-spring font-bold"
                        title="زيادة"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Remove Button */}
                    <button
                      type="button"
                      onClick={() => onClearItem(item.product.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors btn-spring"
                      title="حذف من السلة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {/* Cross-Selling Suggestions */}
              {unaddedSuggestions.length > 0 && (
                <div className="pt-3 border-t border-slate-200 mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{crossSellTitle || 'يكتمل طلبك بهذه الأصناف:'}</span>
                  </div>
                  <div className="space-y-1.5">
                    {unaddedSuggestions.map(sp => {
                      const price = (sp.price_piasters / 100).toFixed(2);
                      return (
                        <div
                          key={sp.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:border-store-primary/40 shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 p-0.5 flex-shrink-0 flex items-center justify-center">
                              {sp.image_urls && sp.image_urls[0] ? (
                                <img src={sp.image_urls[0]} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <Package className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h6 className="text-[11px] font-bold text-slate-900 truncate">{sp.name}</h6>
                              <span className="text-[10px] font-black text-store-primary">{price} ج.م</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddToCart(sp)}
                            className="flex items-center gap-1 bg-store-primary text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all btn-spring flex-shrink-0"
                          >
                            <Plus className="w-3 h-3 text-white" />
                            <span>أضف</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer */}
        {cartItems.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-store-line bg-white space-y-3.5 shadow-lg flex-shrink-0">
            {/* Delivery Method Picker Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => onSelectDeliveryMethod('delivery')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all btn-spring ${
                  deliveryMethod === 'delivery'
                    ? 'bg-store-primary text-white shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>دليفري لباب البيت</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectDeliveryMethod('pickup')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all btn-spring ${
                  deliveryMethod === 'pickup'
                    ? 'bg-store-primary text-white shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <StoreIcon className="w-3.5 h-3.5" />
                <span>استلام من المحل</span>
              </button>
            </div>

            {/* Delivery Zone Selection (Only when Delivery is selected) */}
            {deliveryMethod === 'delivery' && store.delivery_zones && store.delivery_zones.length > 0 && (
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  اختار منطقة الدليفري لحساب التوصيل:
                </label>
                <button
                  type="button"
                  onClick={() => setIsZoneDropdownOpen(!isZoneDropdownOpen)}
                  className="w-full text-xs font-bold p-2.5 rounded-2xl border border-slate-200 bg-white hover:border-store-primary text-right flex items-center justify-between shadow-2xs transition-all btn-spring"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-slate-900 font-black">
                      {selectedDeliveryZone
                        ? store.delivery_zones.find(z => z.name === selectedDeliveryZone)?.name || selectedDeliveryZone
                        : 'اختار منطقة التوصيل...'}
                    </span>
                    {selectedDeliveryZone && (
                      <span className="text-[10px] bg-emerald-50 text-store-primary border border-emerald-200 px-2 py-0.5 rounded-lg font-black">
                        {(
                          (store.delivery_zones.find(z => z.name === selectedDeliveryZone)?.fee || 0) / 100
                        ).toFixed(2)}{' '}
                        ج.م
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-500 motion-chevron ${isZoneDropdownOpen ? 'rotate-180 text-store-primary' : ''}`} />
                </button>

                {/* Dropdown Custom Options Menu */}
                {isZoneDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setIsZoneDropdownOpen(false)}
                    ></div>
                    <div className="absolute bottom-full left-0 right-0 mb-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto motion-popup">
                      {store.delivery_zones.map(z => {
                        const isSelected = selectedDeliveryZone === z.name;
                        return (
                          <div
                            key={z.name}
                            onClick={() => {
                              onSelectDeliveryZone(z.name);
                              setIsZoneDropdownOpen(false);
                            }}
                            className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-emerald-50 font-black text-store-primary'
                                : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isSelected ? (
                                <Check className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0"></span>
                              )}
                              <span className="font-bold">{z.name}</span>
                            </div>
                            <span className="text-xs font-black text-slate-900">
                              {(z.fee / 100).toFixed(2)} ج.م
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Price Calculations */}
            <div className="space-y-1.5 text-xs text-slate-600 pt-1 border-t border-slate-100">
              <div className="flex justify-between">
                <span>حساب الأصناف:</span>
                <span className="font-bold text-slate-900">
                  {(subtotalPiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
              {deliveryMethod === 'delivery' && (
                <div className="flex justify-between">
                  <span>مصاريف الدليفري ({selectedDeliveryZone || 'عادي'}):</span>
                  <span className="font-bold text-slate-900">
                    {(deliveryFeePiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>إجمالي الأوردر المطلوب:</span>
                <span className="text-xl font-black text-store-primary font-mono">
                  {(grandTotalPiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
            </div>

            {/* Action Buttons: Checkout CTA + WhatsApp Direct Order */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={onProceedToCheckout}
                disabled={cartItems.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-store-primary hover:opacity-90 disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-black text-sm shadow-xl shadow-store-primary/20 transition-all btn-spring cursor-pointer"
              >
                <span>تأكيد وإتمام الأوردر</span>
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>

              {showWhatsAppQuickOrder && (store.whatsapp || store.phone) && (
                <a
                  href={whatsappOrderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all btn-spring"
                >
                  <MessageSquare className="w-4 h-4 text-white" />
                  <span>طلب فوري وسريع عبر واتساب</span>
                </a>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};
