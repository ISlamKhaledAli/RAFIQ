import React, { useState } from 'react';
import type { CartItem, Store } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowLeft, MapPin, Truck, Store as StoreIcon, Check, ChevronDown } from 'lucide-react';

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
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 300);
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);

  if (!mounted) return null;

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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-slate-950/60 transition-opacity duration-300 ease-in-out ${
          visible ? 'opacity-100 backdrop-blur-sm' : 'opacity-0 backdrop-blur-none pointer-events-none'
        }`}
      />

      {/* Drawer Panel */}
      <aside
        className={`fixed inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none h-[92vh] sm:h-full shadow-2xl flex flex-col justify-between border-t sm:border-l sm:border-t-0 border-store-line overflow-hidden transition-transform duration-300 ease-in-out z-50 ${
          visible
            ? 'translate-y-0 sm:translate-x-0'
            : 'translate-y-full sm:translate-x-full'
        }`}
      >
        {/* Mobile Swipe Handle Pill */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-2.5 flex-shrink-0"></div>

        {/* Drawer Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-store-line flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-store-primary" />
            <h2 className="text-base sm:text-lg font-black text-store-text">سلة المشتريات</h2>
            <span className="text-xs bg-store-primary text-white font-black px-2 py-0.5 rounded-full">
              {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors btn-spring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Items List */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-300">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-base text-slate-800">السلة فارغة حالياً</h3>
              <p className="text-xs mt-1 text-slate-500">اختر من المنتجات المتاحة للبدء في الشراء</p>
            </div>
          ) : (
            cartItems.map(item => {
              const itemTotal = ((item.product.price_piasters * item.quantity) / 100).toFixed(2);
              return (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-store-text truncate">
                      {item.product.name}
                    </h4>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {(item.product.price_piasters / 100).toFixed(2)} ج.م × {item.quantity} {item.product.unit_name}
                    </div>
                    <div className="text-xs font-black text-store-primary mt-1">
                      {itemTotal} ج.م
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-white rounded-xl p-1 border border-slate-200 shadow-2xs">
                    <button
                      onClick={() => onRemoveFromCart(item.product.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 btn-spring"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-black text-xs text-slate-900">{item.quantity}</span>
                    <button
                      onClick={() => onAddToCart(item.product)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-store-primary text-white hover:bg-store-primary-hover btn-spring"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => onClearItem(item.product.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors btn-spring"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Bottom Actions */}
        {cartItems.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-store-line bg-slate-50 space-y-3 flex-shrink-0 bottom-safe">
            {/* Delivery Method Segmented Control */}
            {store.allow_delivery !== false && store.allow_pickup !== false ? (
              <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 p-1 rounded-2xl text-xs font-bold">
                <button
                  onClick={() => onSelectDeliveryMethod('delivery')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all ${
                    deliveryMethod === 'delivery'
                      ? 'bg-white text-store-primary shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>توصيل دليفري</span>
                </button>
                <button
                  onClick={() => onSelectDeliveryMethod('pickup')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all ${
                    deliveryMethod === 'pickup'
                      ? 'bg-white text-store-primary shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <StoreIcon className="w-3.5 h-3.5" />
                  <span>استلام من المحل</span>
                </button>
              </div>
            ) : (
              <div className="p-2.5 bg-slate-100 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-center gap-2">
                {store.allow_delivery !== false ? (
                  <>
                    <Truck className="w-4 h-4 text-store-primary" />
                    <span>توصيل دليفري للعنوان</span>
                  </>
                ) : (
                  <>
                    <StoreIcon className="w-4 h-4 text-store-primary" />
                    <span>استلام شخصي من الفرع فقط</span>
                  </>
                )}
              </div>
            )}

            {/* Custom Styled Delivery Zone Dropdown */}
            {deliveryMethod === 'delivery' && store.delivery_zones && store.delivery_zones.length > 0 && (
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-store-primary" /> حدد منطقة التوصيل:
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">لحساب الرسوم الدقيقة</span>
                </label>

                {/* Dropdown Toggle Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsZoneDropdownOpen(!isZoneDropdownOpen)}
                  className="w-full text-xs font-bold p-2.5 rounded-2xl border border-store-line bg-white hover:border-store-primary/60 text-right flex items-center justify-between shadow-2xs transition-all btn-spring"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-store-text font-black">
                      {selectedDeliveryZone
                        ? store.delivery_zones.find(z => z.name === selectedDeliveryZone)?.name || selectedDeliveryZone
                        : 'اختر المنطقة للتوصيل...'}
                    </span>
                    {selectedDeliveryZone && (
                      <span className="text-[10px] bg-store-primary-light text-store-primary px-2 py-0.5 rounded-lg font-black">
                        {(
                          (store.delivery_zones.find(z => z.name === selectedDeliveryZone)?.fee || 0) / 100
                        ).toFixed(2)}{' '}
                        ج.م
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isZoneDropdownOpen ? 'rotate-180 text-store-primary' : ''}`} />
                </button>

                {/* Dropdown Custom Options Menu */}
                {isZoneDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setIsZoneDropdownOpen(false)}
                    ></div>
                    <div className="absolute bottom-full left-0 right-0 mb-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto animate-in fade-in">
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
                                ? 'bg-store-primary-light/70 font-black text-store-primary'
                                : 'hover:bg-slate-50 text-slate-700'
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
            <div className="space-y-1.5 text-xs text-slate-600 pt-1">
              <div className="flex justify-between">
                <span>قيمة المشتريات:</span>
                <span className="font-bold text-slate-900">
                  {(subtotalPiasters / 100).toFixed(2)} ج.م
                </span>
              </div>
              {deliveryMethod === 'delivery' && (
                <div className="flex justify-between">
                  <span>رسوم التوصيل ({selectedDeliveryZone || 'عادي'}):</span>
                  <span className="font-bold text-slate-900">
                    {(deliveryFeePiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-store-primary pt-2 border-t border-slate-200">
                <span>الإجمالي للدفع:</span>
                <span className="text-lg">{(grandTotalPiasters / 100).toFixed(2)} ج.م</span>
              </div>
            </div>

            {/* Checkout CTA */}
            <button
              onClick={onProceedToCheckout}
              disabled={cartItems.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-store-primary hover:bg-store-primary-hover disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-store-primary/20 transition-all btn-spring"
            >
              <span>متابعة إتمام الطلب</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
