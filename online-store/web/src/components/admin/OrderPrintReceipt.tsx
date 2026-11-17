import React from 'react';
import type { Store } from '../../types';

export interface AdminOrder {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  alt_phone?: string;
  address_zone: string;
  address_street: string;
  address_building?: string;
  address_floor_apt?: string;
  address_landmark?: string;
  maps_url?: string | null;
  payment_method: string;
  sender_phone?: string;
  payment_ref?: string;
  receipt_image?: string | null;
  notes?: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }>;
  created_at: string;
}

interface Props {
  order: AdminOrder;
  store: Store;
}

export const OrderPrintReceipt: React.FC<Props> = ({ order, store }) => {
  return (
    <div
      id="rafiq-printable-receipt"
      className="hidden print:block bg-white text-black p-4 font-mono text-xs leading-tight w-[80mm] max-w-full mx-auto"
      dir="rtl"
    >
      {/* Receipt Header */}
      <div className="text-center pb-2 border-b border-dashed border-black">
        <h2 className="text-base font-black tracking-wide">{store.name}</h2>
        {store.address && <p className="text-[10px] mt-0.5">{store.address}</p>}
        {store.phone && <p className="text-[10px] mt-0.5" dir="ltr">{store.phone}</p>}
        <div className="mt-1.5 inline-block border border-black px-2 py-0.5 text-[11px] font-bold">
          بون توصيل طلب أونلاين
        </div>
      </div>

      {/* Meta Info */}
      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-1">
        <div className="flex justify-between font-bold">
          <span>رقم الطلب:</span>
          <span>#ORD-{order.order_number}</span>
        </div>
        <div className="flex justify-between">
          <span>التاريخ والوقت:</span>
          <span>{order.created_at}</span>
        </div>
        <div className="flex justify-between">
          <span>طريقة الدفع:</span>
          <span className="font-bold">{order.payment_method}</span>
        </div>
        {order.payment_ref && (
          <div className="flex justify-between text-[10px]">
            <span>المرجع:</span>
            <span>{order.payment_ref}</span>
          </div>
        )}
      </div>

      {/* Customer Info */}
      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-1">
        <div className="font-bold text-[12px]">{order.customer_name}</div>
        <div className="flex justify-between" dir="ltr">
          <span className="font-bold">{order.customer_phone}</span>
          {order.alt_phone && <span>{order.alt_phone}</span>}
        </div>
        <div className="text-[10px] pt-1">
          <span className="font-bold">العنوان: </span>
          <span>
            {order.address_zone} - {order.address_street}
            {order.address_building ? ` - ${order.address_building}` : ''}
            {order.address_floor_apt ? ` - ${order.address_floor_apt}` : ''}
          </span>
        </div>
        {order.address_landmark && (
          <div className="text-[10px]">
            <span className="font-bold">علامة مميزة: </span>
            <span>{order.address_landmark}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="py-2 border-b border-dashed border-black">
        <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-black">
          <span className="w-1/2">الصنف</span>
          <span className="w-1/4 text-center">الكمية</span>
          <span className="w-1/4 text-left">السعر</span>
        </div>
        <div className="divide-y divide-dotted divide-gray-400 pt-1">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between py-1 text-[11px]">
              <span className="w-1/2 font-bold truncate">{item.name}</span>
              <span className="w-1/4 text-center">
                {item.quantity} {item.unit}
              </span>
              <span className="w-1/4 text-left font-bold">
                {(item.total_price / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Financials */}
      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-1">
        <div className="flex justify-between">
          <span>قيمة المنتجات:</span>
          <span>{(order.subtotal / 100).toFixed(2)} ج.م</span>
        </div>
        <div className="flex justify-between">
          <span>رسوم التوصيل:</span>
          <span>{(order.delivery_fee / 100).toFixed(2)} ج.م</span>
        </div>
        <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
          <span>الإجمالي المطلوب:</span>
          <span>{(order.total / 100).toFixed(2)} ج.م</span>
        </div>
      </div>

      {/* Customer Notes */}
      {order.notes && (
        <div className="py-1.5 border-b border-dashed border-black text-[10px]">
          <span className="font-bold">ملاحظات العميل: </span>
          <span>{order.notes}</span>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-2 text-[10px] space-y-0.5">
        <p className="font-bold">شكراً لطلبكم من {store.name}</p>
        <p className="text-[9px] text-gray-600">نظام رفيق كاشير المتكامل لنقاط البيع</p>
      </div>
    </div>
  );
};
