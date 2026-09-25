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

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG', {
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
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
      case 'SALE':
        return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20';
      case 'PURCHASE':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
      case 'ADJUSTMENT':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
      case 'RETURN':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20';
      default:
        return 'bg-surface-2 text-ink-muted border-line';
    }
  };

  const formatQuantity = (milli: number) => {
    const qty = Math.abs(milli / 1000);
    const formatted = isKg ? qty.toFixed(3).replace(/\.?0+$/, '') : Math.round(qty);
    const sign = milli >= 0 ? '+' : '-';
    return `${sign}${formatted} ${isKg ? 'كجم' : 'ق'}`;
  };

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-surface rounded-xl hairline-all shadow-2xl w-full max-w-5xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold text-ink leading-tight">كارت حركة المخزون</h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-brand text-on-brand">
                  الرصيد الحالي: {currentStockDisplay}
                </span>
              </div>
              <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{productName}</p>
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
                className="h-7 px-2.5 rounded bg-brand text-on-brand text-[11px] font-bold flex items-center gap-1 hover:bg-brand-hover transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>تسوية جردية</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 bg-surface border-b border-line flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
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
                    ? 'bg-brand-soft text-brand font-bold'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-ink-muted font-mono shrink-0">
            {movements.length} حركة مسجلة
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-danger-soft border border-danger/30 rounded text-danger text-[12px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-brand" />
              <span className="text-[12px]">جاري تحميل سجل حركات المخزون...</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Boxes className="w-8 h-8 opacity-40 text-brand" />
              <p className="text-[13px] font-semibold text-ink m-0">لا توجد حركات مخزون مسجلة لهذا الصنف</p>
              <p className="text-[11px] text-ink-muted m-0">
                تسجل الحركات تلقائياً عند عمليات البيع، الشراء، أو التسويات الجردية.
              </p>
            </div>
          ) : (
            <div className="border border-line rounded overflow-hidden">
              <table className="w-full text-right border-collapse text-[12px]">
                <thead>
                  <tr className="bg-surface-2/80 border-b border-line text-ink-muted font-semibold text-[11px]">
                    <th className="py-2.5 px-3">التاريخ والوقت</th>
                    <th className="py-2.5 px-3">نوع الحركة</th>
                    <th className="py-2.5 px-3">الكمية</th>
                    <th className="py-2.5 px-3">تكلفة الوحدة</th>
                    <th className="py-2.5 px-3">الملاحظات والسبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {movements.map(m => {
                    const isPositive = m.quantityMilli >= 0;
                    return (
                      <tr key={m.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-ink whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-ink-muted" />
                            <span>{formatDate(m.createdAt)}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${getBadgeStyle(m.movementType)}`}>
                            {m.movementTypeArabic || m.movementType}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                          <div className={`flex items-center gap-1 ${isPositive ? 'text-paid' : 'text-danger'}`}>
                            {isPositive ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            )}
                            <span dir="ltr">{formatQuantity(m.quantityMilli)}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-ink-muted whitespace-nowrap">
                          {formatArabicCurrency(m.unitCostPiasters)}
                        </td>

                        <td className="py-2.5 px-3 text-ink-muted text-[11px] max-w-sm truncate" title={m.note || ''}>
                          {m.note ? (
                            <span>{m.note}</span>
                          ) : (
                            <span className="text-ink-muted/50">—</span>
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
        <div className="px-5 py-3 border-t border-line bg-surface-2/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <FileText className="w-3.5 h-3.5" />
            <span>جميع الحركات مسجلة بقيود ذرية غير قابلة للحذف المادي (قاعدة أمان البيانات #2)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded bg-surface border border-line text-ink hover:bg-surface-2 text-[12px] font-semibold transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
