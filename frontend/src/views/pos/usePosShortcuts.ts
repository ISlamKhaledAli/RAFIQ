import { useEffect } from 'react';
import type { CartItem } from './types';
import type { Sale } from '../../types/models';
import { 
  physicalCodeToChar, 
  sanitizeScannedBarcode,
  type BarcodeScannerSettings 
} from '../../utils/barcodeReader';

interface UsePosShortcutsProps {
  isActive?: boolean;
  isAnyModalOpen?: boolean;
  cart: CartItem[];
  loading: boolean;
  lastCompletedSale: Sale | null;
  scannerSettings: BarcodeScannerSettings;
  requestClearCart: () => void;
  handleOpenCheckout?: (forcedMethod?: 'cash' | 'credit') => void;
  handleFastCashCheckout: () => Promise<void>;
  handleInstapayCheckout?: () => Promise<void>;
  handleFastBarcodeScan: (barcode: string) => Promise<void>;
  openWeightEditorForCartItem: (index: number) => void;
  handleHoldCurrentSale: () => Promise<void>;
  setIsHelpModalOpen: (val: boolean) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement | null>;
  setQuantityModalItem: React.Dispatch<React.SetStateAction<{ index: number; name: string; currentQty: number } | null>>;
  setQuantityInputVal: React.Dispatch<React.SetStateAction<string>>;
  setIsDiscountModalOpen: (val: boolean) => void;
  setIsHeldSalesModalOpen: (val: boolean) => void;
  setIsScannerModalOpen: (val: boolean) => void;
  setIsReceiptOpen: (val: boolean) => void;
  setPaymentMethod: React.Dispatch<React.SetStateAction<'cash' | 'credit'>>;
  setIsReturnModalOpen: (val: boolean) => void;
  showStatus: (text: string, type?: 'success' | 'error' | 'warning') => void;
  cycleCartItemUnit?: () => void;
  onOpenAlternatives?: () => void;
  onOpenQuickShortage?: () => void;
  hasPermission?: (key: string) => boolean;
  isAdmin?: boolean;
}

export const usePosShortcuts = ({
  isActive = true,
  isAnyModalOpen = false,
  cart,
  loading,
  lastCompletedSale,
  scannerSettings,
  requestClearCart,
  handleOpenCheckout,
  handleFastCashCheckout,
  handleInstapayCheckout,
  handleFastBarcodeScan,
  openWeightEditorForCartItem,
  handleHoldCurrentSale,
  setIsHelpModalOpen,
  barcodeInputRef,
  setQuantityModalItem,
  setQuantityInputVal,
  setIsDiscountModalOpen,
  setIsHeldSalesModalOpen,
  setIsScannerModalOpen,
  setIsReceiptOpen,
  setPaymentMethod,
  setIsReturnModalOpen,
  showStatus,
  cycleCartItemUnit,
  onOpenAlternatives,
  onOpenQuickShortage,
  hasPermission,
  isAdmin,
}: UsePosShortcutsProps) => {
  useEffect(() => {
    if (!isActive) return;

    let scanBuffer = '';
    let lastKeyTime = 0;
    let scanStartTime = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Modals & Popups Protection (Requirement 2):
      // Check if any modal is currently visible or active in the application
      const activeEl = document.activeElement as HTMLElement | null;
      const isInputFocused = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;
      const isModalActive = Boolean(isAnyModalOpen) || Boolean(document.querySelector('.fixed.z-50, [role="dialog"], .modal-backdrop'));

      if (isModalActive) {
        // If an input is focused inside the modal (e.g. typing a search query, entering phone, or scanner test field),
        // let the key events flow naturally into that input element without hijacking or triggering background cart actions!
        if (isInputFocused) {
          scanBuffer = '';
          return;
        }
        // If a modal is open but no input is focused (e.g. Confirm or Payment modal active),
        // safely discard any background scanner bursts so items are never added to the cart behind active modals!
        scanBuffer = '';
        return;
      }

      // F1: Cheatsheet / Help Modal
      if (e.key === 'F1') {
        e.preventDefault();
        setIsHelpModalOpen(true);
        return;
      }

      // F2: Focus Search / Barcode Input
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
        return;
      }

      // F3: Modify Quantity of Last Cart Item
      if (e.key === 'F3') {
        e.preventDefault();
        if (cart.length > 0) {
          const lastIdx = cart.length - 1;
          const lastItem = cart[lastIdx];
          if (lastItem.unit === 'kg') {
            openWeightEditorForCartItem(lastIdx);
          } else {
            setQuantityModalItem({
              index: lastIdx,
              name: lastItem.productName,
              currentQty: lastItem.quantityMilli / 1000
            });
            setQuantityInputVal(String(lastItem.quantityMilli / 1000));
          }
        } else {
          showStatus('السلة فارغة. يرجى إضافة صنف أولاً لتعديل كميته', 'warning');
        }
        return;
      }

      // F4: Edit Discount
      if (e.key === 'F4') {
        e.preventDefault();
        if (hasPermission && !hasPermission('pos.discount_line') && !hasPermission('pos.discount_invoice') && !isAdmin) {
          showStatus('ليس لديك صلاحية لإجراء خصومات على الفاتورة', 'warning');
          return;
        }
        setIsDiscountModalOpen(true);
        return;
      }

      // F6: Hold Current Cart or Open Held Sales Modal
      if (e.key === 'F6') {
        e.preventDefault();
        if (hasPermission && !hasPermission('pos.hold_invoice') && !isAdmin) {
          showStatus('ليس لديك صلاحية لتعليق أو استرجاع الفواتير', 'warning');
          return;
        }
        if (cart.length > 0) {
          void handleHoldCurrentSale();
        } else {
          setIsHeldSalesModalOpen(true);
        }
        return;
      }

      // F7: Clear Cart / New Sale
      if (e.key === 'F7') {
        e.preventDefault();
        requestClearCart();
        return;
      }

      // F8: Drug Alternatives Engine (Story 130) or Barcode Scanner Settings
      if (e.key === 'F8') {
        e.preventDefault();
        if (onOpenAlternatives && !e.ctrlKey) {
          onOpenAlternatives();
          return;
        }
        if (hasPermission && !hasPermission('settings.barcode') && !isAdmin) {
          showStatus('ليس لديك صلاحية لتعديل إعدادات قارئ الباركود', 'warning');
          return;
        }
        setIsScannerModalOpen(true);
        return;
      }

      // F11 / Ctrl+Q: Quick Shortage Recording (Story 129)
      if (e.key === 'F11' || (e.ctrlKey && e.key.toLowerCase() === 'q')) {
        e.preventDefault();
        onOpenQuickShortage?.();
        return;
      }

      // F9: Open Cash Checkout if cart has items, otherwise Preview / Print Last Receipt
      if (e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0 && !loading && handleOpenCheckout) {
          if (hasPermission && !hasPermission('pos.sell') && !isAdmin) {
            showStatus('ليس لديك صلاحية لإتمام عمليات البيع', 'warning');
            return;
          }
          handleOpenCheckout('cash');
        } else if (lastCompletedSale) {
          if (hasPermission && !hasPermission('pos.reprint') && !isAdmin) {
            showStatus('ليس لديك صلاحية لإعادة طباعة الفواتير', 'warning');
            return;
          }
          setIsReceiptOpen(true);
        } else {
          showStatus('لا توجد فاتورة سابقة لإعادة طباعتها', 'warning');
        }
        return;
      }

      // F10: Fast Direct InstaPay Pay if cart has items, otherwise Toggle Credit / Cash
      if (e.key === 'F10') {
        e.preventDefault();
        if (cart.length > 0 && !loading && handleInstapayCheckout) {
          if (hasPermission && !hasPermission('pos.sell') && !isAdmin) {
            showStatus('ليس لديك صلاحية لإتمام عمليات البيع', 'warning');
            return;
          }
          void handleInstapayCheckout();
        } else {
          if (hasPermission && !hasPermission('customers.credit_sale') && !isAdmin) {
            showStatus('ليس لديك صلاحية للبيع الآجل (على الحساب)', 'warning');
            return;
          }
          setPaymentMethod((prev) => {
            const next = prev === 'cash' ? 'credit' : 'cash';
            showStatus(next === 'credit' ? 'تم التبديل إلى البيع الآجل (F10)' : 'تم التبديل إلى الدفع النقدي (F10)', 'success');
            return next;
          });
        }
        return;
      }

      // F11: Sales Returns Modal
      if (e.key === 'F11') {
        e.preventDefault();
        if (hasPermission && !hasPermission('returns.create') && !isAdmin) {
          showStatus('ليس لديك صلاحية لإنشاء مرتجع مبيعات', 'warning');
          return;
        }
        setIsReturnModalOpen(true);
        return;
      }

      // F12: Quick Direct Cash Pay
      if (e.key === 'F12') {
        e.preventDefault();
        if (e.repeat) return;
        if (hasPermission && !hasPermission('pos.sell') && !isAdmin) {
          showStatus('ليس لديك صلاحية لإتمام عمليات البيع', 'warning');
          return;
        }
        if (cart.length > 0 && !loading) {
          void handleFastCashCheckout();
        } else if (cart.length === 0) {
          showStatus('السلة فارغة! أضف أصنافاً أولاً للبيع', 'warning');
        }
        return;
      }

      // Key '/' or NumpadDivide: Cycle Packaging Unit of cart item (Feature #183 / Task 183-5)
      if (e.key === '/' || e.code === 'Slash' || e.code === 'NumpadDivide') {
        const isSearchInput = activeEl === barcodeInputRef.current;
        if (!isInputFocused || (isSearchInput && (!barcodeInputRef.current?.value || barcodeInputRef.current.value.trim() === ''))) {
          e.preventDefault();
          if (cycleCartItemUnit) {
            cycleCartItemUnit();
          }
          return;
        }
      }

      // 2. Hardware Barcode Scanner & Typing Discrimination (Requirement 1 & 3):
      // Ignore OS shortcut modifiers
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Key repeat (holding down a key) is NEVER a scanner; ignore it to prevent false trigger
      if (e.repeat) return;

      const now = performance.now();
      const timeDelta = lastKeyTime > 0 ? now - lastKeyTime : 0;
      lastKeyTime = now;

      const isSuffix = 
        (scannerSettings.suffix === 'Enter' && e.key === 'Enter') ||
        (scannerSettings.suffix === 'Tab' && e.key === 'Tab');

      if (isSuffix) {
        if (idleTimer) clearTimeout(idleTimer);
        const totalElapsed = scanStartTime > 0 ? now - scanStartTime : timeDelta;
        const avgDelta = scanBuffer.length > 1 ? totalElapsed / (scanBuffer.length - 1) : timeDelta;

        // Strict discrimination: Scanner must have delivered characters rapidly (avgDelta <= threshold + 25ms)
        // and met minimum barcode length
        if (
          scanBuffer.length >= scannerSettings.minBarcodeLength &&
          avgDelta <= (scannerSettings.speedThresholdMs + 25) &&
          timeDelta < (scannerSettings.speedThresholdMs + 40)
        ) {
          const barcode = sanitizeScannedBarcode(scanBuffer, scannerSettings.prefix);
          scanBuffer = '';
          scanStartTime = 0;
          e.preventDefault();
          e.stopPropagation();

          // If main search input was focused during scan, clear its raw text to prevent duplicate submission
          if (barcodeInputRef.current) {
            barcodeInputRef.current.value = '';
          }
          void handleFastBarcodeScan(barcode);
          return;
        }

        // If not a scanner burst, reset buffer so manual typing submits search normally
        scanBuffer = '';
        scanStartTime = 0;
        return;
      }

      // Physical Key Code extraction (100% immune to Arabic Windows keyboard layout)
      const physicalChar = physicalCodeToChar(e.code, e.shiftKey);
      const charToAdd = physicalChar || (e.key.length === 1 ? e.key : null);

      if (charToAdd) {
        if (timeDelta < scannerSettings.speedThresholdMs || scanBuffer.length === 0) {
          if (scanBuffer.length === 0) {
            scanStartTime = now;
          }
          scanBuffer += charToAdd;
        } else {
          // Time gap exceeded scanner threshold; start new potential buffer with this key
          scanBuffer = charToAdd;
          scanStartTime = now;
        }

        // Support scanners programmed without suffix (scannerSettings.suffix === 'None')
        if (scannerSettings.suffix === 'None') {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (scanBuffer.length >= scannerSettings.minBarcodeLength) {
              const currentNow = performance.now();
              const elapsed = scanStartTime > 0 ? currentNow - scanStartTime : 0;
              const avg = scanBuffer.length > 1 ? elapsed / (scanBuffer.length - 1) : 0;
              if (avg <= (scannerSettings.speedThresholdMs + 25)) {
                const barcode = sanitizeScannedBarcode(scanBuffer, scannerSettings.prefix);
                scanBuffer = '';
                scanStartTime = 0;
                if (barcodeInputRef.current) {
                  barcodeInputRef.current.value = '';
                }
                void handleFastBarcodeScan(barcode);
              }
            }
          }, scannerSettings.speedThresholdMs + 35);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [
    cart,
    loading,
    lastCompletedSale,
    requestClearCart,
    handleOpenCheckout,
    handleFastCashCheckout,
    handleInstapayCheckout,
    scannerSettings,
    handleFastBarcodeScan,
    openWeightEditorForCartItem,
    handleHoldCurrentSale,
    setIsHelpModalOpen,
    barcodeInputRef,
    setQuantityModalItem,
    setQuantityInputVal,
    setIsDiscountModalOpen,
    setIsHeldSalesModalOpen,
    setIsScannerModalOpen,
    setIsReceiptOpen,
    setPaymentMethod,
    setIsReturnModalOpen,
    showStatus,
    cycleCartItemUnit,
    onOpenAlternatives,
    onOpenQuickShortage,
    isActive,
    isAnyModalOpen,
    hasPermission,
    isAdmin,
  ]);
};
