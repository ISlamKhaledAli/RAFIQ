import React from 'react';
import { Receipt, X } from 'lucide-react';
import type { Purchase } from '../../types/models';
import { formatMoney } from './types';

interface PurchaseDetailsModalProps {
  purchase: Purchase | null;
  onClose: () => void;
}

export const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({ purchase, onClose }) => {
  React.useEffect(() => {
    if (!purchase) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [purchase, onClose]);

  if (!purchase) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center shadow-2xs">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink dark:text-ink-dark">
              تفاصيل فاتورة الشراء رقم #{purchase.invoiceNumber}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Header info */}
        <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark grid grid-cols-3 gap-3 text-xs shrink-0">
          <div>
            <span className="text-ink-muted dark:text-ink-dark-muted block">المورد:</span>
            <span className="font-bold text-ink dark:text-ink-dark">{purchase.supplierName || 'بدون مورد'}</span>
          </div>
          <div>
            <span className="text-ink-muted dark:text-ink-dark-muted block">تاريخ الفاتورة:</span>
            <span className="font-semibold text-ink dark:text-ink-dark">
              {new Date(purchase.invoiceDate).toLocaleDateString('ar-EG-u-nu-latn', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          <div>
            <span className="text-ink-muted dark:text-ink-dark-muted block">رقم فاتورة المورد الورقية:</span>
            <span className="font-mono font-bold text-ink dark:text-ink-dark">
              {purchase.supplierInvoiceNumber || '—'}
            </span>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted sticky top-0 border-b border-line dark:border-line-dark">
              <tr>
                <th className="p-3">الصنف</th>
                <th className="p-3 text-center">الكمية</th>
                <th className="p-3 text-center">تكلفة الشراء</th>
                <th className="p-3 text-center">الإجمالي</th>
                <th className="p-3 text-center">التكلفة السابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line-dark">
              {purchase.items?.map((item) => (
                <tr key={item.id} className="hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                  <td className="p-3 font-semibold text-ink dark:text-ink-dark">
                    <span>{item.productName}</span>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted dark:text-ink-dark-muted mt-0.5 flex-wrap">
                      {item.barcode && <span className="font-mono">باركود: {item.barcode}</span>}
                      {item.batchNumber && (
                        <span className="bg-brand-soft/80 dark:bg-brand-soft/20 text-brand-dark dark:text-brand-bright px-1.5 py-0.2 rounded font-mono font-bold">
                          شحنة: {item.batchNumber}
                        </span>
                      )}
                      {item.expiryDate && (
                        <span className="bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 px-1.5 py-0.2 rounded font-mono font-bold">
                          صلاحية: {item.expiryDate}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-ink dark:text-ink-dark">
                    {(item.quantityMilli / 1000).toFixed(0)}
                  </td>
                  <td className="p-3 text-center font-mono text-ink dark:text-ink-dark">
                    {formatMoney(item.unitCostPiasters)}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-brand dark:text-brand-bright">
                    {formatMoney(item.totalCostPiasters)}
                  </td>
                  <td className="p-3 text-center font-mono text-ink-muted dark:text-ink-dark-muted">
                    {formatMoney(item.previousCostPiasters)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between shrink-0 text-xs">
          <div className="space-y-1">
            <div>
              <span className="text-ink-muted dark:text-ink-dark-muted">إجمالي التكلفة: </span>
              <span className="font-mono font-bold text-ink dark:text-ink-dark">
                {formatMoney(purchase.totalCostPiasters)}
              </span>
            </div>
            {purchase.discountPiasters > 0 && (
              <div>
                <span className="text-ink-muted dark:text-ink-dark-muted">الخصم: </span>
                <span className="font-mono text-paid dark:text-paid-bright">
                  -{formatMoney(purchase.discountPiasters)}
                </span>
              </div>
            )}
            <div>
              <span className="text-ink-muted dark:text-ink-dark-muted">صافي الفاتورة: </span>
              <span className="font-mono font-bold text-sm text-brand dark:text-brand-bright">
                {formatMoney(purchase.netCostPiasters)}
              </span>
            </div>
          </div>

          <div className="text-left space-y-1">
            <div>
              <span className="text-ink-muted dark:text-ink-dark-muted">حالة السداد: </span>
              <span className="font-bold text-ink dark:text-ink-dark">
                {purchase.paymentStatus === 'PAID' && 'مسددة بالكامل (نقدي)'}
                {purchase.paymentStatus === 'OVERPAID' && 'سداد بزيادة (تحت الحساب)'}
                {purchase.paymentStatus === 'CREDIT' && 'آجلة على المورد'}
                {purchase.paymentStatus === 'PARTIAL' && 'سداد جزئي'}
              </span>
            </div>
            {purchase.paidAmountPiasters > purchase.netCostPiasters ? (
              <div>
                <span className="text-ink-muted dark:text-ink-dark-muted">الزيادة المسددة (تحت الحساب): </span>
                <span className="font-mono font-bold text-sm text-paid dark:text-paid-bright">
                  +{formatMoney(purchase.paidAmountPiasters - purchase.netCostPiasters)}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-ink-muted dark:text-ink-dark-muted">المبلغ المتبقي: </span>
                <span className="font-mono font-bold text-sm text-danger dark:text-danger-bright">
                  {formatMoney(purchase.remainingAmountPiasters)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-9 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
