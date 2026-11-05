// Cashier-controlled "print the receipt" switch. It is a per-device choice that overrides the store-wide
// setting (printer_auto_print, mirrored by PosView into rafiq_pos_printer_auto_print) until the cashier changes it again.
const PREF_KEY = 'rafiq_pos_print_receipt_pref';
const STORE_DEFAULT_KEY = 'rafiq_pos_printer_auto_print';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getReceiptPrintPreference(): boolean | null {
  const raw = readStorage(PREF_KEY);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function setReceiptPrintPreference(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, enabled ? '1' : '0');
  } catch {
    // storage unavailable: the switch simply falls back to the store setting
  }
}

export function shouldPrintReceipt(): boolean {
  const pref = getReceiptPrintPreference();
  if (pref !== null) return pref;
  return readStorage(STORE_DEFAULT_KEY) !== '0';
}
