import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar, 
  AlertCircle, 
  RefreshCw,
  PlusCircle,
  FileText
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import type { StockMovement } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

interface StockMovementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  unit: string;
  currentStockMilli: number;
  onOpenAdjustment?: () => void;
}

export const StockMovementsModal: React.FC<StockMovementsModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  unit,
  currentStockMilli,
  onOpenAdjustment,
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');

  const isKg = unit === 'kg';
  const currentStockDisplay = isKg
    ? `${(currentStockMilli / 1000).toFixed(3).replace(/\.?0+$/, '')} كجم`
    : `${Math.round(currentStockMilli / 1000)} قطعة`;

  useEffect(() => {
    if (!isOpen || !productId) return;
    let active = true;

    const fetchMovements = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await invoke<StockMovement[]>('inventory:getMovements', {
          productId,
          movementType: movementTypeFilter === 'ALL' ? undefined : movementTypeFilter,
          limit: 100,
        });
        if (active) {
          setMovements(Array.isArray(res) ? res : []);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`فشل تحميل حركات المخزون: ${msg}`);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchMovements();

    return () => {
      active = false;
    };
  }, [isOpen, productId, movementTypeFilter]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'INITIAL':
        return 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/20 dark:border-brand/30';
      case 'SALE':
        return 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30';
      case 'PURCHASE':
        return 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30';
      case 'ADJUSTMENT':
        return 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30';
      case 'RETURN':
        return 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30';
      default:
        return 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark';
    }
  };

  const formatQuantity = (milli: number) => {
    const qty = Math.abs(milli / 1000);
    const formatted = isKg ? qty.toFixed(3).replace(/\.?0+$/, '') : Math.round(qty);
    const sign = milli >= 0 ? '+' : '-';
    return `${sign}${formatted} ${isKg ? 'كجم' : 'ق'}`;
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none"
    >
      <div 
        className="bg-surface dark:bg-surface-dark rounded-xl hairline-all shadow-2xl w-full max-w-5xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="t-modal-title text-ink dark:text-ink-dark leading-tight">كارت حركة المخزون</h3>
                <span className="px-2 py-0.5 rounded text-micro font-mono font-bold bg-brand text-white">
                  الرصيد الحالي: {currentStockDisplay}
                </span>
              </div>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5">{productName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenAdjustment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdjustment();
                }}
                className="h-7 px-2.5 rounded bg-brand text-white text-micro font-bold flex items-center gap-1 hover:bg-brand-hover transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>تسوية جردية</span>
              </button>
            )}
            <button
              type="button"
              onClick={requestClose}
              className="w-7 h-7 rounded flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-2 border border-transparent hover:border-line transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto text-micro">
            {[
              { id: 'ALL', label: 'كل الحركات' },
              { id: 'INITIAL', label: 'رصيد افتتاحي' },
              { id: 'SALE', label: 'مبيعات' },
              { id: 'PURCHASE', label: 'مشتريات' },
              { id: 'ADJUSTMENT', label: 'تسويات جردية' },
              { id: 'RETURN', label: 'مرتجعات' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMovementTypeFilter(tab.id)}
                className={`px-2.5 py-1 rounded font-semibold transition-colors shrink-0 ${
                  movementTypeFilter === tab.id
                    ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-bold'
                    : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono shrink-0">
            {movements.length} حركة مسجلة
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 rounded text-danger dark:text-danger-bright text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-dark-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-brand dark:text-brand-bright" />
              <span className="text-xs">جاري تحميل سجل حركات المخزون...</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-dark-muted">
              <Boxes className="w-8 h-8 opacity-40 text-brand dark:text-brand-bright" />
              <p className="text-sm font-semibold text-ink dark:text-ink-dark m-0">لا توجد حركات مخزون مسجلة لهذا الصنف</p>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                تسجل الحركات تلقائياً عند عمليات البيع، الشراء، أو التسويات الجردية.
              </p>
            </div>
          ) : (
            <div className="border border-line dark:border-line-dark rounded overflow-hidden">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/80 dark:bg-surface-dark-2/80 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-semibold text-micro">
                    <th className="py-2.5 px-3">التاريخ والوقت</th>
                    <th className="py-2.5 px-3">نوع الحركة</th>
                    <th className="py-2.5 px-3">الكمية</th>
                    <th className="py-2.5 px-3">تكلفة الوحدة</th>
                    <th className="py-2.5 px-3">الملاحظات والسبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {movements.map(m => {
                    const isPositive = m.quantityMilli >= 0;
                    return (
                      <tr key={m.id} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-micro text-ink dark:text-ink-dark whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                            <span>{formatDate(m.createdAt)}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-micro font-bold border inline-block ${getBadgeStyle(m.movementType)}`}>
                            {m.movementTypeArabic || m.movementType}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                          <div className={`flex items-center gap-1 ${isPositive ? 'text-paid' : 'text-danger dark:text-danger-bright'}`}>
                            {isPositive ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            )}
                            <span dir="ltr">{formatQuantity(m.quantityMilli)}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                          {formatArabicCurrency(m.unitCostPiasters)}
                        </td>

                        <td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted text-micro max-w-sm truncate" title={m.note || ''}>
                          {m.note ? (
                            <span>{m.note}</span>
                          ) : (
                            <span className="text-ink-muted/50 dark:text-ink-dark-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-micro text-ink-muted dark:text-ink-dark-muted">
            <FileText className="w-3.5 h-3.5" />
            <span>جميع الحركات مسجلة بقيود ذرية غير قابلة للحذف المادي (قاعدة أمان البيانات #2)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
