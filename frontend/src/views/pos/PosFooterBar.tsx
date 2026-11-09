import React from 'react';
import { usePermission } from '../../utils/usePermission';
import { AppButton } from '../../components/AppButton';

interface PosFooterBarProps {
  onOpenHelp: () => void;
  onFocusSearch: () => void;
  onEditLastItemQuantity: () => void;
  onOpenDiscountModal: () => void;
  onHoldOrShowHeld: () => void;
  heldSalesCount: number;
  onOpenReturnModal: () => void;
  onRequestClearCart: () => void;
  onOpenScannerModal: () => void;
  onShowLastReceipt: () => void;
  paymentMethod: 'cash' | 'credit';
  onToggleCreditPayment: () => void;
  onFastCashCheckout: () => void;
}

export const PosFooterBar: React.FC<PosFooterBarProps> = ({
  onOpenHelp,
  onFocusSearch,
  onEditLastItemQuantity,
  onOpenDiscountModal,
  onHoldOrShowHeld,
  heldSalesCount,
  onOpenReturnModal,
  onRequestClearCart,
  onOpenScannerModal,
  onShowLastReceipt,
  paymentMethod,
  onToggleCreditPayment,
  onFastCashCheckout,
}) => {
  const canReturn = usePermission('returns.create');
  return (
    <footer className="h-10 w-full bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex items-center justify-between px-2.5 select-none shrink-0 z-10 text-xs overflow-x-auto gap-1.5 shadow-2xs">
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar w-full">
        {/* F1: Help */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onOpenHelp}
          title="دليل اختصارات لوحة المفاتيح الكامل (F1)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 font-mono text-micro font-bold text-paid dark:text-paid-bright">
            F1
          </kbd>
          <span>مساعدة</span>
        </AppButton>

        {/* F2: Search / Barcode Focus */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onFocusSearch}
          title="التركيز على حقل البحث والباركود (F2)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark font-mono text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
            F2
          </kbd>
          <span>بحث</span>
        </AppButton>

        {/* F3: Quantity / Weight */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onEditLastItemQuantity}
          title="تعديل كمية أو وزن الصنف الأخير في السلة (F3)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark font-mono text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
            F3
          </kbd>
          <span>كمية</span>
        </AppButton>

        {/* F4: Discount */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onOpenDiscountModal}
          title="إضافة خصم على إجمالي الفاتورة (F4)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark font-mono text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
            F4
          </kbd>
          <span>خصم</span>
        </AppButton>

        {/* F6: Hold / Suspend */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onHoldOrShowHeld}
          title="تعليق السلة الحالية أو استرجاع السلة المعلقة (F6)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark font-mono text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
            F6
          </kbd>
          <span>تعليق</span>
          {heldSalesCount > 0 && (
            <span className="w-3.5 h-3.5 rounded-full bg-warn-bright text-ink dark:bg-warn-bright dark:text-surface-dark font-mono text-micro flex items-center justify-center font-bold">
              {heldSalesCount}
            </span>
          )}
        </AppButton>

        {/* F11: Return */}
        {canReturn && (
        <AppButton
          variant="warningSoft"
          size="xs"
          onClick={onOpenReturnModal}
          title="تسجيل مرتجع مبيعات للعميل (F11)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 font-mono text-micro font-bold text-warn dark:text-warn-bright">
            F11
          </kbd>
          <span>مرتجع</span>
        </AppButton>
        )}
        {/* F7: New Cart */}
        <AppButton
          variant="dangerSoft"
          size="xs"
          onClick={onRequestClearCart}
          title="مسح السلة وبدء فاتورة جديدة (F7)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 font-mono text-micro font-bold text-danger dark:text-danger-bright">
            F7
          </kbd>
          <span>سلة جديدة</span>
        </AppButton>

        {/* F8: Barcode Scanner */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onOpenScannerModal}
          title="إعدادات وضبط قارئ الباركود (F8)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark font-mono text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
            F8
          </kbd>
          <span>القارئ</span>
        </AppButton>

        {/* F9: Last Receipt */}
        <AppButton
          variant="secondary"
          size="xs"
          onClick={onShowLastReceipt}
          title="معاينة وإعادة طباعة آخر إيصال تم حفظه (F9)"
          className="shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark font-mono text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
            F9
          </kbd>
          <span>إعادة الإيصال</span>
        </AppButton>

        {/* F10: Customer / Credit */}
        <AppButton
          variant={paymentMethod === 'credit' ? 'dangerSoft' : 'secondary'}
          size="xs"
          onClick={onToggleCreditPayment}
          title="التبديل بين الدفع النقدي والبيع الآجل للعميل (F10)"
          className="shrink-0"
        >
          <kbd className={`px-1.5 py-0.5 rounded font-mono text-micro font-bold ${
            paymentMethod === 'credit' ? 'bg-danger text-white dark:bg-danger-bright dark:text-surface-dark' : 'bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted'
          }`}>
            F10
          </kbd>
          <span>{paymentMethod === 'credit' ? 'بيع آجل' : 'آجل/عميل'}</span>
        </AppButton>

        {/* F12: Instant Cash Checkout */}
        <AppButton
          variant="success"
          size="xs"
          onClick={onFastCashCheckout}
          title="سداد نقدي فوري وحفظ الفاتورة مباشرة (F12)"
          className="mr-auto shrink-0"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-surface-dark/25 text-current font-mono text-micro font-bold">
            F12
          </kbd>
          <span>سداد نقدي</span>
        </AppButton>
      </div>
    </footer>
  );
};
