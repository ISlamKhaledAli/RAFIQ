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
  cart: CartItem[];
  loading: boolean;
  lastCompletedSale: Sale | null;
  scannerSettings: BarcodeScannerSettings;
  requestClearCart: () => void;
  handleOpenCheckout?: (forcedMethod?: 'cash' | 'credit') => void;
  handleFastCashCheckout: () => Promise<void>;
  handleFastCardCheckout?: () => Promise<void>;
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
}

export const usePosShortcuts = ({
  isActive = true,
  cart,
  loading,
  lastCompletedSale,
  scannerSettings,
  requestClearCart,
  handleOpenCheckout,
  handleFastCashCheckout,
  handleFastCardCheckout,
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
}: UsePosShortcutsProps) => {
  useEffect(() => {
    if (!isActive) return;

    let scanBuffer = '';
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
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
        setIsDiscountModalOpen(true);
        return;
      }

      // F6: Hold Current Cart or Open Held Sales Modal
      if (e.key === 'F6') {
        e.preventDefault();
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

      // F8: Scanner Settings
      if (e.key === 'F8') {
        e.preventDefault();
        setIsScannerModalOpen(true);
        return;
      }

      // F9: Open Cash Checkout if cart has items, otherwise Preview / Print Last Receipt
      if (e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0 && !loading && handleOpenCheckout) {
          handleOpenCheckout('cash');
        } else if (lastCompletedSale) {
          setIsReceiptOpen(true);
        } else {
          showStatus('لا توجد فاتورة سابقة لإعادة طباعتها', 'warning');
        }
        return;
      }

      // F10: Fast Direct Card Pay if cart has items, otherwise Toggle Credit / Cash
      if (e.key === 'F10') {
        e.preventDefault();
        if (cart.length > 0 && !loading && handleFastCardCheckout) {
          void handleFastCardCheckout();
        } else {
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
        setIsReturnModalOpen(true);
        return;
      }

      // F12: Quick Direct Cash Pay
      if (e.key === 'F12') {
        e.preventDefault();
        if (cart.length > 0 && !loading) {
          void handleFastCashCheckout();
        } else if (cart.length === 0) {
          showStatus('السلة فارغة! أضف أصنافاً أولاً للبيع', 'warning');
        }
        return;
      }

      // Modifiers
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const now = Date.now();
      const timeDelta = now - lastKeyTime;
      lastKeyTime = now;

      const isSuffix = 
        (scannerSettings.suffix === 'Enter' && e.key === 'Enter') ||
        (scannerSettings.suffix === 'Tab' && e.key === 'Tab');

      if (isSuffix) {
        if (scanBuffer.length >= scannerSettings.minBarcodeLength && timeDelta < (scannerSettings.speedThresholdMs + 30)) {
          const barcode = sanitizeScannedBarcode(scanBuffer, scannerSettings.prefix);
          scanBuffer = '';
          e.preventDefault();
          void handleFastBarcodeScan(barcode);
          return;
        }
        scanBuffer = '';
        return;
      }

      // Feature #131: Physical Key Code extraction (immune to Arabic keyboard layout)
      const physicalChar = physicalCodeToChar(e.code, e.shiftKey);
      const charToAdd = physicalChar || (e.key.length === 1 ? e.key : null);

      if (charToAdd) {
        if (timeDelta < scannerSettings.speedThresholdMs || scanBuffer.length === 0) {
          scanBuffer += charToAdd;
        } else {
          scanBuffer = charToAdd;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [
    cart,
    loading,
    lastCompletedSale,
    requestClearCart,
    handleOpenCheckout,
    handleFastCashCheckout,
    handleFastCardCheckout,
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
    isActive,
  ]);
};
