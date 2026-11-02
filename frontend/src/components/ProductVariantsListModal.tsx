import React, { useState, useEffect } from 'react';
import {
  Layers,
  X,
  Package,
  Barcode,
  Tag,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import type { Product, ProductVariant } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { getStoreTerminology } from '../utils/storeTerminology';

interface ProductVariantsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentProduct: Product | null;
  onPrintVariantLabel?: (variant: ProductVariant) => void;
  onOpenMatrixModal?: () => void;
  onVariantsChanged?: () => void;
}

export const ProductVariantsListModal: React.FC<ProductVariantsListModalProps> = ({
  isOpen,
  onClose,
  parentProduct,
  onPrintVariantLabel,
  onOpenMatrixModal,
  onVariantsChanged,
}) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [variantToDelete, setVariantToDelete] = useState<ProductVariant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const terminology = React.useMemo(() => getStoreTerminology(), []);

  useEffect(() => {
    if (isOpen && parentProduct?.id) {
      setIsLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      void invoke<ProductVariant[]>('variants:getByParentId', { parentId: parentProduct.id })
        .then((res) => {
          setVariants(res || []);
        })
        .catch((err) => {
          console.error('Failed to load variants:', err);
          setVariants([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setVariants([]);
      setVariantToDelete(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, parentProduct]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: Boolean(isOpen && parentProduct),
    onClose,
    isDirty: false,
  });

  if (!isOpen || !parentProduct) return null;

  const totalStockUnits = variants.reduce((acc, v) => acc + (v.stockQuantityMilli / 1000), 0);

  const handleDeleteVariant = async () => {
    if (!variantToDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await invoke('variants:delete', { variantProductId: variantToDelete.variantProductId });
      setSuccessMessage(`تم حذف المتغير (${variantToDelete.color || 'عام'} - ${variantToDelete.size || 'حر'}) بنجاح`);
      setVariantToDelete(null);
      if (parentProduct?.id) {
        const res = await invoke<ProductVariant[]>('variants:getByParentId', { parentId: parentProduct.id });
        setVariants(res || []);
      }
      if (onVariantsChanged) {
        onVariantsChanged();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'تعذر حذف هذا المتغير');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        dir="rtl"
        className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl w-full max-w-3xl overflow-hidden text-ink dark:text-ink-dark font-sans flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center text-brand dark:text-brand-bright">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink dark:text-ink-dark">{parentProduct.name}</h3>
                <span className="px-2 py-0.5 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-[11px] font-bold border border-brand/20 dark:border-brand-bright/20">
                  {variants.length} صنف متفرع
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                إجمالي الرصيد المتوفر: <span className="font-bold text-paid dark:text-paid-bright font-mono">{totalStockUnits.toLocaleString('en-US')}</span> قطعة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenMatrixModal && variants.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMatrixModal();
                }}
                className="px-3 py-1.5 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand dark:hover:bg-brand-bright text-brand dark:text-brand-bright hover:text-white dark:hover:text-surface-dark rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-brand/20 dark:border-brand-bright/20"
                title="تعديل أو إضافة أصناف متفرعة جديدة"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تعديل أو إضافة أصناف</span>
              </button>
            )}
            <button
              onClick={() => void requestClose()}
              className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-line/40 dark:hover:bg-line-dark/40 rounded-lg transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/20 text-danger dark:text-danger-bright text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="p-1 hover:bg-danger/20 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid-dark-border text-paid dark:text-paid-bright text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="p-1 hover:bg-paid/20 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-dark-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand dark:text-brand-bright" />
              <span className="text-xs">جاري تحميل {terminology.variantsTitle}...</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted text-xs flex flex-col items-center gap-3">
              <Package className="w-10 h-10 opacity-40 text-brand dark:text-brand-bright" />
              <span>لا توجد أصناف متفرعة مسجلة لهذا الصنف حالياً</span>
              {onOpenMatrixModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMatrixModal();
                  }}
                  className="px-3.5 py-1.5 bg-brand dark:bg-brand-bright hover:bg-brand-dark text-white dark:text-surface-dark rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء الأصناف المتفرعة الآن</span>
                </button>
              )}
            </div>
          ) : (
            <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden bg-surface dark:bg-surface-dark">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold">
                    <th className="py-2.5 px-3">{terminology.colorLabel}</th>
                    <th className="py-2.5 px-3">{terminology.sizeLabel}</th>
                    <th className="py-2.5 px-3">الباركود</th>
                    <th className="py-2.5 px-3 text-center">الرصيد</th>
                    <th className="py-2.5 px-3 text-left">سعر البيع</th>
                    <th className="py-2.5 px-3 text-left">التكلفة</th>
                    <th className="py-2.5 px-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {variants.map((v) => {
                    const stockPieces = v.stockQuantityMilli / 1000;
                    return (
                      <tr key={v.id} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-ink dark:text-ink-dark">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-brand/30 dark:bg-brand-dark-soft border border-brand/60 dark:border-brand-bright/60" />
                            <span>{v.color || 'عام'}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark font-mono font-bold text-ink dark:text-ink-dark">
                            {v.size || 'حر'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-muted dark:text-ink-dark-muted flex items-center gap-1">
                          <Barcode className="w-3.5 h-3.5 opacity-60" />
                          <span>{v.barcode || '—'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">
                          <span className={stockPieces <= 0 ? 'text-danger dark:text-danger-bright' : 'text-paid dark:text-paid-bright'}>
                            {stockPieces.toLocaleString('en-US')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-bold text-paid dark:text-paid-bright">
                          {formatArabicCurrency(v.pricePiasters)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono text-ink-muted dark:text-ink-dark-muted">
                          {formatArabicCurrency(v.costPiasters)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {onPrintVariantLabel && (
                              <button
                                type="button"
                                onClick={() => onPrintVariantLabel(v)}
                                className="p-1.5 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft transition-colors cursor-pointer"
                                title="طباعة ملصق باركود لهذا الصنف"
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMessage(null);
                                setSuccessMessage(null);
                                setVariantToDelete(v);
                              }}
                              className="p-1.5 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger/10 dark:hover:bg-danger-dark-soft transition-colors cursor-pointer"
                              title="حذف هذا الصنف المتفرع"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Confirmation Modal */}
        {variantToDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-100 select-none">
            <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl p-5 max-w-sm w-full text-right font-sans text-ink dark:text-ink-dark">
              <div className="w-10 h-10 rounded-xl bg-danger/10 dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center justify-center mb-3">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-ink dark:text-ink-dark mb-1">تأكيد حذف المتغير</h4>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mb-4 leading-relaxed">
                هل أنت متأكد من حذف المتغير <strong className="text-ink dark:text-ink-dark">({variantToDelete.color || 'عام'} - {variantToDelete.size || 'حر'})</strong>؟
                <br />
                <span className="text-[11px] text-warn dark:text-warn-bright font-semibold">تنبيه: سيتم رفض الحذف تلقائياً إذا كان للمتغير مبيعات أو حركات مخزنية سابقة.</span>
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVariantToDelete(null)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 rounded-lg border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs font-medium hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteVariant()}
                  disabled={isDeleting}
                  className="px-4 py-1.5 rounded-lg bg-danger text-white text-xs font-bold hover:bg-danger/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{isDeleting ? 'جاري الحذف...' : 'تأكيد الحذف'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
            <span>يتم بيع كل مقاس بالباركود الخاص به أو باختياره من شاشة الكاشير.</span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenMatrixModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMatrixModal();
                }}
                className="px-3.5 py-1.5 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand-soft/80 text-brand dark:text-brand-bright border border-brand/30 dark:border-brand-bright/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة مقاسات جديدة</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
