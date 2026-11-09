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
import { AppButton } from './AppButton';

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
      setSuccessMessage(`تم حذف المتغير (${variantToDelete.color || 'عام'} - ${variantToDelete.size || 'حر'})`);
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
        className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl w-full max-w-4xl overflow-hidden text-ink dark:text-ink-dark font-sans flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center text-brand dark:text-brand-bright">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="t-modal-title text-ink dark:text-ink-dark">{parentProduct.name}</h3>
                <span className="px-2 py-0.5 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-micro font-bold border border-brand/20 dark:border-brand-bright/20">
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
              <AppButton
                variant="soft"
                size="sm"
                icon={Plus}
                onClick={() => {
                  onClose();
                  onOpenMatrixModal();
                }}
                title="تعديل أو إضافة أصناف متفرعة جديدة"
              >
                تعديل أو إضافة أصناف
              </AppButton>
            )}
            <AppButton variant="subtle" size="sm" icon={X} onClick={() => void requestClose()} aria-label="إغلاق" title="إغلاق" />
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
              <AppButton variant="subtle" size="xs" icon={X} onClick={() => setErrorMessage(null)} aria-label="إغلاق الرسالة" />
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid-dark-border text-paid dark:text-paid-bright text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <AppButton variant="subtle" size="xs" icon={X} onClick={() => setSuccessMessage(null)} aria-label="إغلاق الرسالة" />
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-dark-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand dark:text-brand-bright" />
              <span className="text-xs">جاري تحميل {terminology.variantsTitle}...</span>
            </div>
          ) : variants.length === 0 ? (
            <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted text-xs flex flex-col items-center gap-3">
              <Package className="w-10 h-10 opacity-40 dark:opacity-100 text-brand dark:text-brand-bright" />
              <span>لا توجد أصناف متفرعة مسجلة لهذا الصنف حالياً</span>
              {onOpenMatrixModal && (
                <AppButton
                  variant="primary"
                  icon={Plus}
                  onClick={() => {
                    onClose();
                    onOpenMatrixModal();
                  }}
                >
                  إنشاء الأصناف المتفرعة الآن
                </AppButton>
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
                          <Barcode className="w-3.5 h-3.5 opacity-60 dark:opacity-100" />
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
                              <AppButton
                                variant="subtle"
                                size="xs"
                                icon={Tag}
                                onClick={() => onPrintVariantLabel(v)}
                                aria-label="طباعة ملصق باركود لهذا الصنف"
                                title="طباعة ملصق باركود لهذا الصنف"
                              />
                            )}
                            <AppButton
                              variant="dangerSubtle"
                              size="xs"
                              icon={Trash2}
                              onClick={() => {
                                setErrorMessage(null);
                                setSuccessMessage(null);
                                setVariantToDelete(v);
                              }}
                              aria-label="حذف هذا الصنف المتفرع"
                              title="حذف هذا الصنف المتفرع"
                            />
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
              <h4 className="t-label text-ink dark:text-ink-dark mb-1">تأكيد حذف المتغير</h4>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mb-4 leading-relaxed">
                هل أنت متأكد من حذف المتغير <strong className="text-ink dark:text-ink-dark">({variantToDelete.color || 'عام'} - {variantToDelete.size || 'حر'})</strong>؟
                <br />
                <span className="text-micro text-warn dark:text-warn-bright font-semibold">تنبيه: سيتم رفض الحذف تلقائياً إذا كان للمتغير مبيعات أو حركات مخزنية سابقة.</span>
              </p>
              <div className="flex items-center justify-end gap-2">
                <AppButton variant="secondary" onClick={() => setVariantToDelete(null)} disabled={isDeleting}>
                  إلغاء
                </AppButton>
                <AppButton variant="danger" icon={Trash2} onClick={() => void handleDeleteVariant()} loading={isDeleting}>
                  {isDeleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
                </AppButton>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 flex items-center justify-between shrink-0">
          <div className="text-micro text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
            <span>يتم بيع كل مقاس بالباركود الخاص به أو باختياره من شاشة الكاشير.</span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenMatrixModal && (
              <AppButton
                variant="soft"
                icon={Plus}
                onClick={() => {
                  onClose();
                  onOpenMatrixModal();
                }}
              >
                إضافة مقاسات جديدة
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
