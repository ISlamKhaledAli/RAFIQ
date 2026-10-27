import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Calendar, 
  AlertTriangle, 
  Check, 
  X, 
  Clock 
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import type { ProductBatch } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useModalDismiss } from '../../hooks/useModalDismiss';

interface BatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  currentBatchId?: string;
  onSelectBatch: (batch: ProductBatch) => void;
}

export const BatchSelectionModal: React.FC<BatchSelectionModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  currentBatchId,
  onSelectBatch,
}) => {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !productId) return;
    let isMounted = true;
    setLoading(true);

    invoke<ProductBatch[]>('batch:listByProduct', { productId })
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : [];
        setBatches(list);
      })
      .catch((err) => {
        console.error('Failed to load product batches:', err);
        if (isMounted) setBatches([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, productId]);

  useModalDismiss({
    isOpen,
    onDismiss: onClose,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-surface-dark-3 flex items-center justify-center text-brand dark:text-brand-bright shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-ink dark:text-ink-dark truncate">
                اختيار تشغيلة/دفعة محددة
              </h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted truncate mt-0.5">
                {productName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-lg hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
          {loading ? (
            <RafiqLoadingState label="جاري جلب تشغيلات الصنف..." />
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-ink-muted dark:text-ink-dark-muted text-xs">
              لا توجد تشغيلات مسجلة لهذا الصنف
            </div>
          ) : (
            batches.map((b) => {
              const isSelected = currentBatchId === b.id;
              const hasCustomPrice = b.sellPricePiasters !== null && b.sellPricePiasters !== undefined && b.sellPricePiasters > 0;
              const isZeroStock = b.quantityMilli <= 0;

              return (
                <div
                  key={b.id}
                  onClick={() => {
                    if (isZeroStock) return;
                    onSelectBatch(b);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isZeroStock
                      ? 'opacity-50 bg-surface-2/40 dark:bg-surface-dark-3/40 border-line/60 dark:border-line-dark/60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-brand-soft/40 dark:bg-brand-soft/10 border-brand/40 dark:border-brand-bright/40 shadow-2xs cursor-pointer'
                      : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:bg-surface-2 dark:hover:bg-surface-dark-3 cursor-pointer shadow-2xs'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 font-bold text-xs text-ink dark:text-ink-dark">
                        <span>تشغيلة</span>
                        <bdi className="font-mono text-brand dark:text-brand-bright font-bold" dir="ltr">#{b.batchNumber}</bdi>
                      </div>
                      {isSelected && (
                        <span className="px-1.5 py-0.2 bg-brand text-white text-[10px] font-bold rounded-md flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> المحددة حالياً
                        </span>
                      )}
                      {b.isExpired && (
                        <span className="px-1.5 py-0.2 bg-danger-soft text-danger dark:text-danger-bright text-[10px] font-bold rounded-md flex items-center gap-0.5 border border-danger/20">
                          <AlertTriangle className="w-2.5 h-2.5" /> منتهية الصلاحية
                        </span>
                      )}
                      {!b.isExpired && b.isExpiringSoon && (
                        <span className="px-1.5 py-0.2 bg-warn-soft text-warn dark:text-warn-bright text-[10px] font-bold rounded-md flex items-center gap-0.5 border border-warn/20">
                          <Clock className="w-2.5 h-2.5" /> تقترب من الانتهاء
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-ink-muted dark:text-ink-dark-muted flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-ink-muted" />
                        صلاحية: {b.expiryDate || 'غير محدد'}
                      </span>
                      <span>•</span>
                      <span>
                        الرصيد المتاح: <strong className="font-mono text-ink dark:text-ink-dark">{Math.floor(b.quantityMilli / 1000)}</strong> {b.unit || 'قطعة'}
                      </span>
                    </div>
                  </div>

                  {/* Price display & action */}
                  <div className="text-left shrink-0">
                    {hasCustomPrice ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-brand dark:text-brand-bright font-bold">
                          سعر خاص بالتشغيلة
                        </span>
                        <span className="font-mono font-extrabold text-sm text-paid dark:text-paid-bright">
                          {formatArabicCurrency(b.sellPricePiasters || 0)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
                          سعر الكتالوج
                        </span>
                        <span className="font-mono font-medium text-xs text-ink dark:text-ink-dark">
                          تلقائي
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-semibold hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};
