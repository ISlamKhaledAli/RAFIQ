import React from 'react';
import {
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  LayoutGrid,
  Printer,
  Users,
  Save,
  FileText,
  MapPin,
  X,
} from 'lucide-react';
import type { OrderMode, RestaurantTable, DeliveryOrderCreateInfo } from '../../types/cafe';
import { formatArabicCurrency } from '../../utils/money';

interface PosOrderModeBarProps {
  orderType: OrderMode;
  onOrderTypeChange: (mode: OrderMode) => void;
  showTableManagement: boolean;
  showKitchenPrinter: boolean;
  showDeliveryManagement: boolean;
  activeTable: RestaurantTable | null;
  occupiedTablesCount: number;
  onOpenFloorMap: () => void;
  onClearActiveTable: () => void;
  onSaveTableOrder: () => void;
  onPrintPreBill: () => void;
  onPrintKot: () => void;
  kotPrinting: boolean;
  tableSaving: boolean;
  deliveryInfo: DeliveryOrderCreateInfo | null;
  activeDeliveryOrdersCount: number;
  onOpenDeliveryModal: (initialTab?: 'order_setup' | 'active_orders' | 'rider_settlement' | 'zones_riders') => void;
  serviceChargePercent: number;
  onServiceChargePercentChange: (pct: number) => void;
  cartNotEmpty: boolean;
}

export const PosOrderModeBar: React.FC<PosOrderModeBarProps> = ({
  orderType,
  onOrderTypeChange,
  showTableManagement,
  showKitchenPrinter,
  showDeliveryManagement,
  activeTable,
  occupiedTablesCount,
  onOpenFloorMap,
  onClearActiveTable,
  onSaveTableOrder,
  onPrintPreBill,
  onPrintKot,
  kotPrinting,
  tableSaving,
  deliveryInfo,
  activeDeliveryOrdersCount,
  onOpenDeliveryModal,
  serviceChargePercent,
  onServiceChargePercentChange,
  cartNotEmpty,
}) => {
  const needsTable = orderType === 'dine_in' && showTableManagement && !activeTable;
  return (
    <div className="bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none">
      {/* 1. Order Mode Switcher */}
      <div className="flex items-center gap-1.5 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark">
        {showTableManagement && (
          <button
            type="button"
            onClick={() => onOrderTypeChange('dine_in')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              orderType === 'dine_in'
                ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright shadow-sm dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>صالة (طاولات)</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onOrderTypeChange('takeaway')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
            orderType === 'takeaway'
              ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright shadow-sm dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
              : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>تيك أواي (سفري)</span>
        </button>

        {showDeliveryManagement && (
          <button
            type="button"
            onClick={() => onOrderTypeChange('delivery')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              orderType === 'delivery'
                ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright shadow-sm dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>دليفري (توصيل)</span>
          </button>
        )}
      </div>

      {/* 2. Context-Specific Controls (Dine-In Table / Delivery Info) */}
      <div className="flex flex-wrap items-center gap-2">
        {showTableManagement && (
          <button
            type="button"
            onClick={onOpenFloorMap}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition-all cursor-pointer ${
              needsTable
                ? 'bg-warn/15 dark:bg-warn-dark-soft border-warn/40 dark:border-warn-border/30 text-warn dark:text-warn-bright hover:bg-warn/25'
                : 'bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand/10 dark:hover:bg-brand-dark-soft border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 text-ink dark:text-ink-dark'
            }`}
          >
            <LayoutGrid className={`w-3.5 h-3.5 ${needsTable ? '' : 'text-brand dark:text-brand-bright'}`} />
            <span>{needsTable ? 'اختر طاولة للطلب' : 'خريطة الصالة والطاولات'}</span>
            {occupiedTablesCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-warn/20 dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-xs font-black tabular-nums">
                {occupiedTablesCount} مشغولة
              </span>
            )}
          </button>
        )}

        {orderType === 'dine_in' && showTableManagement && (
          <>
            {activeTable && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-brand/10 dark:bg-brand-dark-soft border border-brand/30 dark:border-brand-bright/30 text-xs">
                <UtensilsCrossed className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                <span className="font-black text-ink dark:text-ink-dark">{activeTable.name}</span>
                <span className="text-ink-muted dark:text-ink-dark-muted font-bold">({activeTable.zoneName})</span>
                {activeTable.guestsCount > 0 && (
                  <span className="flex items-center gap-1 text-ink-muted dark:text-ink-dark-muted font-bold">
                    <Users className="w-3 h-3" />
                    {activeTable.guestsCount}
                  </span>
                )}
                {activeTable.waiterName && (
                  <span className="text-brand dark:text-brand-bright font-bold">• {activeTable.waiterName}</span>
                )}
                <button
                  type="button"
                  onClick={onClearActiveTable}
                  title="إلغاء تحديد الطاولة من الشاشة"
                  className="p-0.5 rounded hover:bg-danger/10 dark:hover:bg-danger-dark-soft text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {activeTable && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={tableSaving || !cartNotEmpty}
                  onClick={onSaveTableOrder}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-paid text-white text-xs font-black hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{tableSaving ? 'جاري الحفظ...' : 'تعليق وحفظ بالطاولة'}</span>
                </button>
                <button
                  type="button"
                  onClick={onPrintPreBill}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright text-ink dark:text-ink-dark text-xs font-bold transition-all cursor-pointer"
                  title="طباعة شيك مبدئي للمراجعة دون إغلاق الطاولة"
                >
                  <FileText className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>شيك مبدئي</span>
                </button>
              </div>
            )}

            {/* Service Charge Quick Toggle */}
            <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 px-2.5 py-1 rounded-xl border border-line dark:border-line-dark text-xs">
              <span className="text-ink-muted dark:text-ink-dark-muted font-bold">خدمة صالة %:</span>
              <input
                type="number"
                min={0}
                max={30}
                value={serviceChargePercent}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(30, parseInt(e.target.value || '0', 10)));
                  onServiceChargePercentChange(Number.isNaN(val) ? 0 : val);
                }}
                className="w-12 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg px-1.5 py-0.5 text-center font-black text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
              />
            </div>
          </>
        )}

        {orderType === 'delivery' && showDeliveryManagement && (
          <div className="flex items-center gap-2">
            {deliveryInfo ? (
              <button
                type="button"
                onClick={() => onOpenDeliveryModal('order_setup')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand/10 dark:bg-brand-dark-soft border border-brand/30 dark:border-brand-bright/30 text-xs hover:bg-brand/15 transition-all cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                <span className="font-black text-ink dark:text-ink-dark">{deliveryInfo.customerName}</span>
                <span className="text-ink-muted dark:text-ink-dark-muted font-bold">({deliveryInfo.customerPhone})</span>
                {deliveryInfo.zoneName && (
                  <span className="px-1.5 py-0.5 rounded bg-surface dark:bg-surface-dark-2 text-brand dark:text-brand-bright font-black">
                    {deliveryInfo.zoneName} • {formatArabicCurrency(deliveryInfo.deliveryFeePiasters)}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenDeliveryModal('order_setup')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warn/15 dark:bg-warn-dark-soft border border-warn/40 dark:border-warn-border/30 text-warn dark:text-warn-bright text-xs font-black hover:bg-warn/25 transition-all cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>تحديد عنوان ومنطقة التوصيل</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Action Buttons (KOT Printer & Delivery Command Center) */}
      <div className="flex items-center gap-2">
        {showKitchenPrinter && (
          <button
            type="button"
            disabled={!cartNotEmpty || kotPrinting}
            onClick={onPrintKot}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand/10 dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 text-ink dark:text-ink-dark text-xs font-black disabled:opacity-40 transition-all cursor-pointer"
            title="إرسال الأصناف لطابعة المطبخ والبار (بدون أسعار)"
          >
            <Printer className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
            <span>{kotPrinting ? 'جاري الإرسال...' : 'إرسال للمطبخ / البار (KOT)'}</span>
          </button>
        )}

        {showDeliveryManagement && (
          <button
            type="button"
            onClick={() => onOpenDeliveryModal('active_orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand/10 dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 text-ink dark:text-ink-dark text-xs font-black transition-all cursor-pointer"
          >
            <Bike className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
            <span>مركز الدليفري والطيارين</span>
            {activeDeliveryOrdersCount > 0 && (
              <span className="min-w-[20px] text-center px-1.5 py-0.5 rounded-full bg-brand dark:bg-brand-bright text-white dark:text-surface-dark text-xs font-black tabular-nums">
                {activeDeliveryOrdersCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
