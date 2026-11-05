import { useState, useEffect, useCallback } from 'react';
import { Printer, X, CheckCircle, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import type { Sale } from '../types/models';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { ReceiptPaper } from './ReceiptPaper';
import { buildReceiptModel } from '../utils/receiptLayout';
import { BUILT_IN_SIGNATURE_IMAGES } from '../utils/signatureDefaults';
import type { ReceiptPaperWidth } from '../utils/receiptLayout';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  receiptHeader?: string;
  receiptFooter?: string;
}



export function ReceiptModal({
  isOpen,
  onClose,
  sale,
  storeName = 'متجر رفيق',
  storePhone = '',
  storeAddress = '',
  receiptHeader = '',
  receiptFooter = ''
}: ReceiptModalProps) {
  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty: false,
  });
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [liveSettings, setLiveSettings] = useState<Record<string, string>>({});
  const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>('80mm');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        const s = await invoke<Record<string, string>>('settings:getAll');
        if (active && s) {
          setLiveSettings(s);
          if (s.receipt_paper_width === '57mm' || s.receipt_paper_width === '58mm') {
            setPaperWidth('57mm');
          } else {
            setPaperWidth('80mm');
          }
        }
      } catch {
        // fallback to default
      }
    })();
    return () => { active = false; };
  }, [isOpen]);

  const configuredFooter = liveSettings.receipt_footer !== undefined ? liveSettings.receipt_footer : (receiptFooter || '');
  const activeStoreName = liveSettings.store_name || storeName;
  const activePhone = liveSettings.store_phone !== undefined ? liveSettings.store_phone : (storePhone || '');
  const activeAddress = liveSettings.store_address !== undefined ? liveSettings.store_address : (storeAddress || '');
  const activeTaxNumber = liveSettings.tax_number || '';
  const activeHeader = (liveSettings.receipt_header !== undefined && liveSettings.receipt_header !== '') ? liveSettings.receipt_header : (receiptHeader || '');
  const showReceiptLogo = liveSettings.show_receipt_logo !== '0';
  const activeLogoUrl =
    liveSettings.store_logo_url === '/logo.png' || liveSettings.store_logo_url === '/receipt_logo.png'
      ? '/receipt_logo_square.png'
      : (liveSettings.store_logo_url || '/receipt_logo_square.png');

  const handlePrint = useCallback(async () => {
    if (!sale || isPrinting) return;
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      // The host loads the stored sale by id, so what prints always equals what is saved
      const res = await invoke<{ success: boolean; message?: string; printerUsed?: string }>('printer:printReceipt', { saleId: sale.id });

      if (res && res.success) {
        setPrintStatus({
          ok: true,
          msg: `تم إرسال الفاتورة إلى الطابعة (${res.printerUsed || 'الافتراضية'})`,
        });
      } else {
        const errMsg = res?.message || 'تعذر إرسال أمر الطباعة للطابعة الحرارية. يرجى مراجعة التوصيل والكابل.';
        setPrintStatus({
          ok: false,
          msg: errMsg,
        });
      }
    } catch (err: unknown) {
      setPrintStatus({
        ok: false,
        msg: (err as Error)?.message || 'حدث خطأ غير متوقع أثناء التواصل مع خدمة الطباعة.',
      });
    } finally {
      setIsPrinting(false);
    }
  }, [sale, isPrinting]);

  // Keyboard shortcut: F9 prints, Escape closes
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrint, onClose]);

  if (!isOpen || !sale) return null;

  const is57mm = paperWidth === '57mm';

  // Same builder the printer layout mirrors: sections, order and labels match the thermal receipt
  const receipt = buildReceiptModel(
    sale,
    {
      name: activeStoreName,
      phone: activePhone,
      address: activeAddress,
      taxNumber: activeTaxNumber,
      header: activeHeader,
      footer: configuredFooter,
      signature: liveSettings.developer_signature,
    },
    {
      showCashier: liveSettings.receipt_show_cashier !== '0',
      signatureVisible: liveSettings.developer_signature_visible !== '0',
      signatureImage: liveSettings.developer_signature_image ?? '',
      builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES,
    },
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-lg shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-b px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span className="text-sm font-bold text-ink dark:text-ink-dark">معاينة الإيصال الحراري</span>
          </div>

          {/* Paper Width Selector Pill */}
          <div className="flex items-center gap-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPaperWidth('80mm')}
              className={`px-2.5 py-0.5 rounded transition-all ${
                !is57mm 
                  ? 'bg-brand text-white shadow-xs font-bold' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              80 مم (قياسي)
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('57mm')}
              className={`px-2.5 py-0.5 rounded transition-all ${
                is57mm 
                  ? 'bg-brand text-white shadow-xs font-bold' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              57 مم (مضغوط)
            </button>
          </div>

          <button 
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-surface dark:hover:bg-surface-dark-2 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Paper Out / Hardware Error Banner */}
        {printStatus && !printStatus.ok && (
          <div className="px-4 py-2.5 bg-warn-soft dark:bg-warn-dark-soft border-b border-warn-border dark:border-warn-bright/30 flex items-start gap-2.5 text-xs text-ink dark:text-ink-dark">
            <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold">{printStatus.msg}</div>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5">
                الفاتورة #{sale.invoiceNumber || '---'} محفوظة. تأكد من الطابعة والورق ثم اعد المحاولة.
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Receipt Body */}
        <div className="overflow-y-auto p-4 bg-canvas dark:bg-canvas-dark flex justify-center items-start">
          <ReceiptPaper id="printable-receipt" model={receipt} paper={paperWidth} logoUrl={showReceiptLogo ? activeLogoUrl : null} />
        </div>
        {/* Modal Actions Footer */}
        <div className="h-14 bg-surface-2 dark:bg-surface-dark-2 hairline-t px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {printStatus && printStatus.ok ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-paid">
                <CheckCircle className="w-4 h-4" />
                <span>{printStatus.msg}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isPrinting}
              className="px-4 py-2 rounded bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-xs font-semibold disabled:opacity-50 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted dark:disabled:border-line-dark transition-colors"
            >
              إغلاق (Esc)
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className={`flex items-center gap-2 px-5 py-2 rounded text-white text-xs font-bold shadow-sm disabled:opacity-60 transition-all ${
                printStatus && !printStatus.ok
                  ? 'bg-warn hover:bg-warn/90 dark:bg-warn-bright dark:text-surface-dark dark:hover:bg-warn-bright/90'
                  : 'bg-brand hover:bg-brand-hover'
              }`}
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : printStatus && !printStatus.ok ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>
                {isPrinting 
                  ? 'جاري إرسال الأمر...' 
                  : printStatus && !printStatus.ok 
                  ? 'إعادة المحاولة (F9)' 
                  : 'طباعة الإيصال (F9)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
