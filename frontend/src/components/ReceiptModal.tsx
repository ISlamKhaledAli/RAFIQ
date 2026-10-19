import { useState, useEffect, useCallback } from 'react';
import { Printer, X, CheckCircle, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import type { Sale } from '../types/models';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';

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
  storeName = 'متجر رفيق',
  storePhone = '',
  storeAddress = '',
  receiptFooter = 'شكراً لتعاملكم معنا! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.'
}: ReceiptModalProps) {
  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty: false,
  });
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [liveSettings, setLiveSettings] = useState<Record<string, string>>({});
  const [paperWidth, setPaperWidth] = useState<'80mm' | '57mm'>('80mm');

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

  const activeStoreName = liveSettings.store_name || storeName;
  const activePhone = liveSettings.store_phone || storePhone;
  const activeAddress = liveSettings.store_address || storeAddress;
  const activeTaxNumber = liveSettings.tax_number || '';
  const activeHeader = liveSettings.receipt_header || '';
  const activeFooter = liveSettings.receipt_footer || receiptFooter;
  const activeCashier = liveSettings.cashier_name || 'كاشير (1)';

  const handlePrint = useCallback(async () => {
    if (!sale || isPrinting) return;
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      if (window.chrome?.webview) {
        // Native Desktop C# PrintDocument via Win32 Spooler / ESC-POS
        const res = await invoke<{ success: boolean; message: string; printerUsed?: string }>('printer:printReceipt', {
          sale,
          paperWidth
        });
        if (res.success) {
          setPrintStatus({ ok: true, msg: res.message || 'تم إرسال الإيصال للطابعة وقص الورق بنجاح' });
        } else {
          setPrintStatus({ 
            ok: false, 
            msg: res.message || 'تعذر الاتصال بالطابعة أو نفاد الورق. تحقق من الكابل والورق.' 
          });
        }
      } else {
        // Browser fallback / mock mode
        await invoke('printer:printReceipt', { sale, paperWidth });
        setPrintStatus({ ok: true, msg: 'تمت الطباعة التجريبية (وضع المتصفح)' });
        window.print();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setPrintStatus({ 
        ok: false, 
        msg: `تعذر الاتصال بالطابعة: ${errMsg}. الفاتورة محفوظة بأمان.` 
      });
    } finally {
      setIsPrinting(false);
    }
  }, [sale, isPrinting, paperWidth]);

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
    ? new Date(sale.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : new Date().toLocaleDateString('ar-EG-u-nu-latn');

  const formattedTime = sale.createdAt
    ? new Date(sale.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('ar-EG-u-nu-latn');

  const changePiasters = Math.max(0, sale.paidPiasters - sale.totalPiasters);
  const remainingPiasters = Math.max(0, sale.totalPiasters - sale.paidPiasters);

  const is57mm = paperWidth === '57mm';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface rounded-lg shadow-2xl border border-line flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand" />
            <span className="text-sm font-bold text-ink">معاينة الإيصال الحراري</span>
          </div>

          {/* Paper Width Selector Pill */}
          <div className="flex items-center gap-1 bg-surface border border-line rounded p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPaperWidth('80mm')}
              className={`px-2.5 py-0.5 rounded transition-all ${
                !is57mm 
                  ? 'bg-brand text-white shadow-xs font-bold' 
                  : 'text-ink-muted hover:text-ink'
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
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              57 مم (مضغوط)
            </button>
          </div>

          <button 
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Paper Out / Hardware Error Banner */}
        {printStatus && !printStatus.ok && (
          <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold">{printStatus.msg}</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                الفاتورة رقم #{sale.invoiceNumber || '---'} محفوظة ومسجلة بنجاح. تأكد من توصيل الكابل ووجود الورق في الطابعة ثم اضغط &quot;إعادة المحاولة&quot;.
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Receipt Body (Proportionate 80mm: 302px vs 57mm: 220px) */}
        <div className="overflow-y-auto p-4 bg-canvas flex justify-center">
          <div 
            id="printable-receipt"
            className={`${
              is57mm ? 'w-[220px] p-2.5 text-[10px]' : 'w-[302px] p-4 text-[11px]'
            } bg-white text-black font-mono leading-relaxed shadow-sm select-text border border-line transition-all duration-200`}
            dir="rtl"
          >
            {/* Store Header */}
            <div className={`text-center font-bold ${is57mm ? 'text-[13px]' : 'text-[15px]'} pb-0.5 text-black font-sans`}>
              {activeStoreName}
            </div>
            {activeAddress && <div className="text-center text-[10px] text-gray-700">{activeAddress}</div>}
            {activePhone && <div className="text-center text-[10px] text-gray-700">هاتف: {activePhone}</div>}
            {activeTaxNumber && <div className="text-center text-[10px] text-gray-700">الرقم الضريبي: {activeTaxNumber}</div>}
            {activeHeader && <div className="text-center text-[10.5px] font-semibold text-gray-800 my-0.5">{activeHeader}</div>}

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2"></div>

            {/* Invoice Meta */}
            <div className="flex justify-between text-[10px] font-sans">
              <span>فاتورة رقم: #{sale.invoiceNumber || '---'}</span>
              <span>التاريخ: {formattedDate}</span>
            </div>
            <div className="flex justify-between text-[10px] font-sans">
              <span>الكاشير: {activeCashier}</span>
              <span>الوقت: {formattedTime}</span>
            </div>
            {sale.customerId && (
              <div className="text-[10px] text-right font-sans text-gray-800 font-semibold mt-0.5">
                نوع الفاتورة: {sale.paymentMethod === 'credit' ? 'آجل (على الحساب)' : 'نقدي'}
              </div>
            )}

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2"></div>

            {/* Items Table */}
            <div className="space-y-1.5 font-sans">
              {sale.items.map((item, idx) => (
                <div key={idx} className={is57mm ? 'text-[10px]' : 'text-[11px]'}>
                  <div className="font-semibold text-right text-black">{item.productName}</div>
                  <div className="flex justify-between items-baseline font-mono text-[10px]">
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
            <div className="space-y-1 font-sans">
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

              <div className={`border-t-2 border-black my-1.5 pt-1 flex justify-between font-bold ${is57mm ? 'text-[12.5px]' : 'text-[14px]'}`}>
                <span>الصافي المستحق:</span>
                <span className="font-mono font-bold">{(sale.totalPiasters / 100).toFixed(2)} ج.م</span>
              </div>

              <div className="flex justify-between pt-0.5">
                <span>المدفوع ({
                  sale.paymentMethod === 'credit' 
                    ? 'آجل' 
                    : sale.paymentMethod === 'instapay'
                    ? 'انستاباي'
                    : sale.paymentMethod === 'vodafone_cash'
                    ? 'محفظة كاش'
                    : 'نقداً'
                }):</span>
                <span className="font-mono font-bold">{(sale.paidPiasters / 100).toFixed(2)} ج.م</span>
              </div>

              {sale.notes && (
                <div className="text-[10px] text-gray-700 font-sans pt-1 text-center">
                  {sale.notes}
                </div>
              )}

              {changePiasters > 0 && (
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>الباقي للعميل:</span>
                  <span className="font-mono font-bold">{(changePiasters / 100).toFixed(2)} ج.م</span>
                </div>
              )}

              {remainingPiasters > 0 && (
                <div className="flex justify-between font-bold text-red-700">
                  <span>المتبقي (آجل):</span>
                  <span className="font-mono font-bold">{(remainingPiasters / 100).toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2.5"></div>

            {/* Footer and Code 128 Barcode Simulation */}
            <div className="text-center space-y-1.5">
              <div className="text-[10px] text-gray-700 font-sans">{activeFooter}</div>
              
              {/* Authentic Barcode Visual Strip */}
              <div className="pt-1 flex flex-col items-center">
                <div className="flex items-end justify-center h-8 gap-[1.5px] px-2 py-0.5 bg-white">
                  {/* Visual SVG bar sequence resembling Code 128 */}
                  {[2,1,3,1,2,1,1,3,2,1,2,2,1,1,3,1,2,1,1,2,3,1,1,2,2,1,3,1,2,1].map((w, i) => (
                    <div 
                      key={i} 
                      className={`bg-black h-full ${w === 3 ? 'w-[3px]' : w === 2 ? 'w-[2px]' : 'w-[1px]'}`} 
                    />
                  ))}
                </div>
                <div className="text-[9.5px] text-black font-mono font-semibold tracking-wider mt-0.5">
                  {sale.invoiceNumber ? String(sale.invoiceNumber).padStart(8, '0') : sale.id}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="h-14 bg-surface-2 hairline-t px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {printStatus && printStatus.ok ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-paid">
                <CheckCircle className="w-4 h-4" />
                <span>{printStatus.msg}</span>
              </div>
            ) : !printStatus ? (
              <div className="flex items-center gap-1.5 text-xs text-paid font-medium">
                <CheckCircle className="w-4 h-4" />
                <span>تم حفظ الفاتورة بنجاح في قاعدة البيانات</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isPrinting}
              className="px-4 py-2 rounded bg-surface border border-line text-ink hover:bg-surface-2 text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              إغلاق (Esc)
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className={`flex items-center gap-2 px-5 py-2 rounded text-white text-xs font-bold shadow-sm disabled:opacity-60 transition-all ${
                printStatus && !printStatus.ok
                  ? 'bg-amber-600 hover:bg-amber-700'
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
