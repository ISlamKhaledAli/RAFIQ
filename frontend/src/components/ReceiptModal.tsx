import { useState, useEffect, useCallback } from 'react';
import { Printer, X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { Sale } from '../types/models';
import { invoke } from '../bridge/ipc';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  receiptFooter?: string;
}

export function ReceiptModal({
  isOpen,
  onClose,
  sale,
  storeName = 'سوبرماركت رفيق',
  storePhone = '01012345678',
  storeAddress = 'جمهورية مصر العربية',
  receiptFooter = 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوم'
}: ReceiptModalProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const handlePrint = useCallback(async () => {
    if (!sale || isPrinting) return;
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      if (window.chrome?.webview) {
        // Native Desktop C# PrintDocument via Win32 Spooler
        const res = await invoke<{ success: boolean; message: string; printerUsed?: string }>('printer:printReceipt', {
          sale
        });
        if (res.success) {
          setPrintStatus({ ok: true, msg: res.message || 'تم إرسال الإيصال للطابعة بنجاح' });
        } else {
          setPrintStatus({ ok: false, msg: res.message || 'فشلت الطباعة المباشرة' });
          // Fallback to browser print dialog
          window.print();
        }
      } else {
        // Browser fallback / mock mode
        await invoke('printer:printReceipt', { sale });
        setPrintStatus({ ok: true, msg: 'تمت الطباعة التجريبية (وضع المتصفح)' });
        window.print();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setPrintStatus({ ok: false, msg: `تعذر الطباعة المباشرة: ${errMsg}` });
      window.print();
    } finally {
      setIsPrinting(false);
    }
  }, [sale, isPrinting]);

  // Keyboard shortcut listener (F9 to print, Escape to close)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        void handlePrint();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handlePrint, onClose]);

  if (!isOpen || !sale) return null;

  const formattedDate = sale.createdAt 
    ? new Date(sale.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : new Date().toLocaleDateString('ar-EG');

  const formattedTime = sale.createdAt
    ? new Date(sale.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('ar-EG');

  const changePiasters = Math.max(0, sale.paidPiasters - sale.totalPiasters);
  const remainingPiasters = Math.max(0, sale.totalPiasters - sale.paidPiasters);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-lg shadow-2xl border border-line flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-brand-soft text-brand text-xs flex items-center justify-center font-bold">
              80
            </span>
            <span className="text-sm font-bold text-ink">معاينة الإيصال الحراري (80 مم)</span>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Receipt Body (302px thermal standard width) */}
        <div className="overflow-y-auto p-6 bg-canvas flex justify-center">
          <div 
            id="printable-receipt"
            className="w-[302px] bg-white text-black p-4 font-mono text-[11px] leading-relaxed shadow-sm select-text border border-[#DCE1DC]"
            dir="rtl"
          >
            {/* Header */}
            <div className="text-center font-bold text-[15px] pb-0.5 text-black font-sans">{storeName}</div>
            <div className="text-center text-[10px] text-gray-700">{storeAddress}</div>
            <div className="text-center text-[10px] text-gray-700">ت: {storePhone}</div>
            <div className="text-center text-[10px] text-gray-700">الرقم الضريبي: 100-245-890</div>

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2"></div>

            {/* Meta */}
            <div className="flex justify-between text-[10px] font-sans">
              <span>فاتورة رقم: #{sale.invoiceNumber || '---'}</span>
              <span>التاريخ: {formattedDate}</span>
            </div>
            <div className="flex justify-between text-[10px] font-sans">
              <span>الكاشير: كاشير 1</span>
              <span>الوقت: {formattedTime}</span>
            </div>
            {sale.customerId && (
              <div className="text-[10px] text-right font-sans text-gray-800 font-semibold mt-0.5">
                نوع الفاتورة: {sale.paymentMethod === 'credit' ? 'آجل (على الحساب)' : 'نقدي'}
              </div>
            )}

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2"></div>

            {/* Items */}
            <div className="space-y-1.5 font-sans">
              {sale.items.map((item, idx) => (
                <div key={idx} className="text-[11px]">
                  <div className="font-semibold text-right text-black">{item.productName}</div>
                  <div className="flex justify-between items-baseline font-mono text-[10.5px]">
                    <span>
                      {item.unitName
                        ? `${item.quantityMilli % 1000 !== 0 ? (item.quantityMilli / 1000).toFixed(3) : item.quantityMilli / 1000} ${item.unitName}`
                        : (item.unit === 'kg' || item.quantityMilli % 1000 !== 0
                          ? `${(item.quantityMilli / 1000).toFixed(3)} كجم`
                          : `${item.quantityMilli / 1000} ق`)} × {(item.unitPricePiasters / 100).toFixed(2)}
                    </span>
                    <span className="font-bold text-black">{(item.totalPiasters / 100).toFixed(2)} ج.م</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Solid Divider */}
            <div className="border-t border-black my-2"></div>

            {/* Totals */}
            <div className="space-y-1 text-[11px] font-sans">
              <div className="flex justify-between">
                <span>المجموع:</span>
                <span className="font-mono">{(sale.subtotalPiasters / 100).toFixed(2)} ج.م</span>
              </div>
              {sale.discountPiasters > 0 && (
                <div className="flex justify-between text-red-700">
                  <span>الخصم:</span>
                  <span className="font-mono">-{(sale.discountPiasters / 100).toFixed(2)} ج.م</span>
                </div>
              )}
              {sale.taxPiasters > 0 && (
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة:</span>
                  <span className="font-mono">{(sale.taxPiasters / 100).toFixed(2)} ج.م</span>
                </div>
              )}

              <div className="border-t-2 border-black my-1.5 pt-1 flex justify-between font-bold text-[14px]">
                <span>الإجمالي:</span>
                <span className="font-mono font-bold">{(sale.totalPiasters / 100).toFixed(2)} ج.م</span>
              </div>

              <div className="flex justify-between text-[11px] pt-1">
                <span>المدفوع ({sale.paymentMethod === 'credit' ? 'آجل' : 'نقداً'}):</span>
                <span className="font-mono font-bold">{(sale.paidPiasters / 100).toFixed(2)} ج.م</span>
              </div>

              {changePiasters > 0 && (
                <div className="flex justify-between text-[11px] font-bold text-emerald-800">
                  <span>الباقي للعميل:</span>
                  <span className="font-mono font-bold">{(changePiasters / 100).toFixed(2)} ج.م</span>
                </div>
              )}

              {remainingPiasters > 0 && (
                <div className="flex justify-between text-[11px] font-bold text-red-700">
                  <span>المتبقي (آجل):</span>
                  <span className="font-mono font-bold">{(remainingPiasters / 100).toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2.5"></div>

            {/* Footer and Simulated Barcode */}
            <div className="text-center space-y-1">
              <div className="text-[10px] text-gray-700 font-sans">{receiptFooter}</div>
              <div className="py-1">
                <div className="inline-block tracking-[4px] font-mono text-[14px] font-bold text-black border-y border-black px-3 py-0.5">
                  ||||| | |||| || |||||
                </div>
                <div className="text-[9px] text-gray-600 font-mono mt-0.5">INV-{sale.invoiceNumber}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="h-14 bg-surface-2 hairline-t px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {printStatus ? (
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${printStatus.ok ? 'text-paid' : 'text-amber-600'}`}>
                {printStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span>{printStatus.msg}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-paid font-medium">
                <CheckCircle className="w-4 h-4" />
                <span>تم حفظ الفاتورة بنجاح في قاعدة البيانات</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isPrinting}
              className="px-4 py-2 rounded bg-surface border border-line text-ink hover:bg-surface-2 text-xs font-semibold disabled:opacity-50"
            >
              إغلاق (Esc)
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-2 px-5 py-2 rounded bg-brand text-white hover:bg-brand-container text-xs font-bold shadow-sm disabled:opacity-60"
            >
              {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              <span>{isPrinting ? 'جاري الطباعة...' : 'طباعة الإيصال (F9)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
