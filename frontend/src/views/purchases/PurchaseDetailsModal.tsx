import React from 'react';
import { Receipt, X } from 'lucide-react';
import type { Purchase } from '../../types/models';
import { formatMoney } from './types';

interface PurchaseDetailsModalProps {
  purchase: Purchase | null;
  onClose: () => void;
}

export const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({ purchase, onClose }) => {
  if (!purchase) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shadow-2xs">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink">
              تفاصيل فاتورة الشراء رقم #{purchase.invoiceNumber}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Header info */}
        <div className="p-4 bg-surface-2 border-b border-line grid grid-cols-3 gap-3 text-xs shrink-0">
          <div>
            <span className="text-ink-muted block">المورد:</span>
            <span className="font-bold text-ink">{purchase.supplierName || 'بدون مورد'}</span>
          </div>
          <div>
            <span className="text-ink-muted block">تاريخ الفاتورة:</span>
            <span className="font-semibold text-ink">
              {new Date(purchase.invoiceDate).toLocaleDateString('ar-EG-u-nu-latn', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          <div>
            <span className="text-ink-muted block">رقم فاتورة المورد الورقية:</span>
            <span className="font-mono font-bold text-ink">
              {purchase.supplierInvoiceNumber || '—'}
            </span>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-surface-2 text-ink-muted sticky top-0 border-b border-line">
              <tr>
                <th className="p-3">الصنف</th>
                <th className="p-3 text-center">الكمية</th>
                <th className="p-3 text-center">تكلفة الشراء</th>
                <th className="p-3 text-center">الإجمالي</th>
                <th className="p-3 text-center">التكلفة السابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {purchase.items?.map((item) => (
                <tr key={item.id} className="hover:bg-surface-2/60 transition-colors">
                  <td className="p-3 font-semibold text-ink">
                    <span>{item.productName}</span>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted mt-0.5 flex-wrap">
                      {item.barcode && <span className="font-mono">باركود: {item.barcode}</span>}
                      {item.batchNumber && (
                        <span className="bg-brand-soft/80 text-brand-dark px-1.5 py-0.2 rounded font-mono font-bold">
                          شحنة: {item.batchNumber}
                        </span>
                      )}
                      {item.expiryDate && (
                        <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-mono font-bold">
                          صلاحية: {item.expiryDate}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-ink">
                    {(item.quantityMilli / 1000).toFixed(0)}
                  </td>
                  <td className="p-3 text-center font-mono text-ink">
                    {formatMoney(item.unitCostPiasters)}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-brand">
                    {formatMoney(item.totalCostPiasters)}
                  </td>
                  <td className="p-3 text-center font-mono text-ink-muted">
                    {formatMoney(item.previousCostPiasters)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="p-4 bg-surface-2 border-t border-line flex items-center justify-between shrink-0 text-xs">
          <div className="space-y-1">
            <div>
              <span className="text-ink-muted">إجمالي التكلفة: </span>
              <span className="font-mono font-bold text-ink">
                {formatMoney(purchase.totalCostPiasters)}
              </span>
            </div>
            {purchase.discountPiasters > 0 && (
              <div>
                <span className="text-ink-muted">الخصم: </span>
                <span className="font-mono text-paid">
                  -{formatMoney(purchase.discountPiasters)}
                </span>
              </div>
            )}
            <div>
              <span className="text-ink-muted">صافي الفاتورة: </span>
              <span className="font-mono font-bold text-sm text-brand">
                {formatMoney(purchase.netCostPiasters)}
              </span>
            </div>
          </div>

          <div className="text-left space-y-1">
            <div>
              <span className="text-ink-muted">حالة السداد: </span>
              <span className="font-bold text-ink">
                {purchase.paymentStatus === 'PAID' && 'مسددة بالكامل (نقدي)'}
                {purchase.paymentStatus === 'OVERPAID' && 'سداد بزيادة (تحت الحساب)'}
                {purchase.paymentStatus === 'CREDIT' && 'آجلة على المورد'}
                {purchase.paymentStatus === 'PARTIAL' && 'سداد جزئي'}
              </span>
            </div>
            {purchase.paidAmountPiasters > purchase.netCostPiasters ? (
              <div>
                <span className="text-ink-muted">الزيادة المسددة (تحت الحساب): </span>
                <span className="font-mono font-bold text-sm text-paid">
                  +{formatMoney(purchase.paidAmountPiasters - purchase.netCostPiasters)}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-ink-muted">المبلغ المتبقي: </span>
                <span className="font-mono font-bold text-sm text-danger">
                  {formatMoney(purchase.remainingAmountPiasters)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-surface border-t border-line flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-9 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
