import { useState, useEffect, useCallback } from 'react';
import { Printer, X, CheckCircle, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import type { Sale } from '../types/models';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { formatArabicCurrency, totalSaleDiscountPiasters } from '../utils/money';
import { readPrintResult, receiptPrintRequest } from '../utils/printing';

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
  const [printStatus, setPrintStatus] = useState<{ ok: boolean; msg: string; warning?: string } | null>(null);
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

  const rawStoreType = liveSettings.store_type || 'supermarket';
  const storeType = rawStoreType.trim().toLowerCase();

  const isHospitality = ['cafe_restaurant', 'cafe', 'restaurant'].includes(storeType);
  const isPharmacy = storeType === 'pharmacy';
  const isClothing = ['clothing_apparel', 'clothing', 'clothing_shoes'].includes(storeType);
  const isElectronics = ['phones_electronics', 'electronics'].includes(storeType);
  const isProduceOrButchery = ['produce_butchery', 'butchery', 'meat_poultry', 'fruits_vegetables'].includes(storeType);
  const isRoastery = ['spices_roastery', 'roastery', 'nuts'].includes(storeType);
  const isBakery = ['dairy_bakery', 'bakery', 'pastry'].includes(storeType);
  const isStationeryOrToys = ['stationery_gifts', 'toys_kids'].includes(storeType);
  const isSupermarketOrGrocery = ['supermarket', 'general_grocery', 'grocery'].includes(storeType) || !storeType;


  const configuredFooter = liveSettings.receipt_footer !== undefined ? liveSettings.receipt_footer : (receiptFooter || '');
  const activeFooter = (configuredFooter && configuredFooter !== 'شكراً لتعاملكم معنا! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.' && configuredFooter !== 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.')
    ? configuredFooter
    : '';

  const activeStoreName = liveSettings.store_name || storeName;
  const activePhone = liveSettings.store_phone !== undefined ? liveSettings.store_phone : (storePhone || '');
  const activeAddress = liveSettings.store_address !== undefined ? liveSettings.store_address : (storeAddress || '');
  const activeTaxNumber = liveSettings.tax_number || '';
  const activeHeader = (liveSettings.receipt_header !== undefined && liveSettings.receipt_header !== '') ? liveSettings.receipt_header : (receiptHeader || '');
  const activeCashier = liveSettings.cashier_name || 'كاشير (1)';
  const showReceiptLogo = liveSettings.show_receipt_logo !== '0';
  const activeLogoUrl = 
    liveSettings.store_logo_url === '/logo.png' || liveSettings.store_logo_url === '/receipt_logo.png'
      ? '/receipt_logo_square.png' 
      : (liveSettings.store_logo_url || '/receipt_logo_square.png');
  const developerSignature = 
    liveSettings.developer_signature && liveSettings.developer_signature !== 'نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد'
      ? liveSettings.developer_signature
      : 'نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965';

  const handlePrint = useCallback(async () => {
    if (!sale || isPrinting) return;
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      const res = readPrintResult(await invoke<unknown>('printer:printReceipt', receiptPrintRequest(sale.id)));

      if (res.success) {
        setPrintStatus({
          ok: true,
          msg: `تم إرسال نسخة الإيصال إلى الطابعة (${res.printerUsed || 'الافتراضية'})`,
          warning: res.warningMessage || undefined,
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
        msg: `لم يمكن تأكيد إرسال الإيصال. لا تُعد تسجيل البيع؛ أعد طباعة نسخة فقط. ${err instanceof Error ? err.message : String(err)}`,
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

  const formattedDate = sale.createdAt 
    ? new Date(sale.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : new Date().toLocaleDateString('ar-EG-u-nu-latn');

  const formattedTime = sale.createdAt
    ? new Date(sale.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('ar-EG-u-nu-latn');

  const changePiasters = Math.max(0, sale.paidPiasters - sale.totalPiasters);
  const remainingPiasters = Math.max(0, sale.totalPiasters - sale.paidPiasters);
  const is57mm = paperWidth === '57mm';

  // Hospitality detection
  const isDineIn = (sale.orderType || '').toLowerCase() === 'dine_in' || !!sale.tableName;
  const isDelivery = (sale.orderType || '').toLowerCase() === 'delivery' || (sale.deliveryFeePiasters || 0) > 0 || !!sale.deliveryInfo;
  const isTakeaway = (sale.orderType || '').toLowerCase() === 'takeaway';
  const hasHospitalityMeta = isDineIn || isDelivery || (isHospitality && (isTakeaway || (sale.orderCallNumber || 0) > 0));

  // Pharmacy cold-chain items check
  const hasColdChain = isPharmacy && (sale.hasColdChainItems || sale.items?.some((it) => it.isColdChain));

  // Total discounts
  const totalDiscount = totalSaleDiscountPiasters(sale);

  // Summary counts
  let totalPieces = 0;
  let totalKg = 0;
  if (sale.items && sale.items.length > 0) {
    for (const item of sale.items) {
      totalPieces += Math.max(1, Math.floor(item.quantityMilli / 1000));
      if (item.unit === 'kg' || item.quantityMilli % 1000 !== 0) {
        totalKg += (item.quantityMilli / 1000);
      }
    }
  }

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
        {printStatus?.warning && (
          <div role="status" className="mx-4 mt-2 rounded-lg border border-warn/30 dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft p-3 text-xs text-ink dark:text-ink-dark">
            {printStatus.warning}
          </div>
        )}
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

        {/* Scrollable Receipt Body */}
        <div className="overflow-y-auto p-4 bg-canvas flex justify-center">
          <div 
            id="printable-receipt"
            className={`${
              is57mm ? 'w-[220px] p-2.5 text-[10px]' : 'w-[302px] p-4 text-[11px]'
            } bg-white text-black font-mono leading-relaxed shadow-sm select-text border border-line transition-all duration-200`}
            dir="rtl"
          >
            {/* Store Header & Logo */}
            {showReceiptLogo && (
              <div className="flex justify-center mb-1.5">
                <img
                  src={activeLogoUrl}
                  alt="شعار المتجر"
                  className={`object-contain max-h-[48px] ${is57mm ? 'max-w-[120px]' : 'max-w-[150px]'}`}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
                  }}
                />
              </div>
            )}
            <div className={`text-center font-bold ${is57mm ? 'text-[13px]' : 'text-[15px]'} pb-0.5 text-black font-sans`}>
              {activeStoreName}
            </div>
            {activeAddress && <div className="text-center text-[10px] text-gray-700">{activeAddress}</div>}
            {activePhone && <div className="text-center text-[10px] text-gray-700">هاتف: {activePhone}</div>}
            {activeTaxNumber && <div className="text-center text-[10px] text-gray-700">الرقم الضريبي: {activeTaxNumber}</div>}
            {activeHeader && <div className="text-center text-[10.5px] font-semibold text-gray-800 my-0.5">{activeHeader}</div>}

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2"></div>

            {/* Pharmacy insurance claim info */}
            {isPharmacy && sale.insuranceClaim && (
              <div className="text-[10px] font-sans text-gray-800 pb-1 mb-1 border-b border-dotted border-gray-300">
                <div>تأمين طبي: {sale.insuranceClaim.companyName || sale.insuranceClaim.contractName || 'جهة التأمين'}</div>
                {sale.insuranceClaim.memberNo && <div>رقم العضوية: {sale.insuranceClaim.memberNo}</div>}
                {sale.insuranceClaim.approvalNo && <div>رقم الموافقة: {sale.insuranceClaim.approvalNo}</div>}
              </div>
            )}

            {/* Hospitality Banner (strictly isolated) */}
            {hasHospitalityMeta && (
              <div className="border border-black rounded p-1 mb-2 text-center font-sans bg-gray-50">
                <div className="font-bold text-[12px]">
                  {sale.orderCallNumber ? `نداء #${String(sale.orderCallNumber).padStart(3, '0')} | ` : ''}
                  {isDineIn ? (sale.tableName ? `صالة - طاولة: ${sale.tableName}` : 'طلب صالة') : isDelivery ? 'دليفري - توصيل طلبات' : 'تيك أواي (سفري)'}
                </div>
                {(sale.waiterName || (sale.guestsCount && sale.guestsCount > 0)) && (
                  <div className="text-[9.5px] text-gray-700 mt-0.5">
                    {sale.waiterName ? `الكابتن: ${sale.waiterName}` : ''}
                    {sale.waiterName && sale.guestsCount ? ' | ' : ''}
                    {sale.guestsCount ? `عدد الضيوف: ${sale.guestsCount}` : ''}
                  </div>
                )}
              </div>
            )}

            {/* Invoice Meta */}
            <div className="flex justify-between text-[10px] font-sans">
              <span>فاتورة رقم: #{sale.invoiceNumber || '---'}</span>
              <span>التاريخ: {formattedDate}</span>
            </div>
            <div className="flex justify-between text-[10px] font-sans">
              <span>الكاشير: {activeCashier}</span>
              <span>الوقت: {formattedTime}</span>
            </div>
            {sale.customerName && (
              <div className="text-[10px] text-right font-sans text-gray-800 font-semibold mt-0.5">
                {isPharmacy ? 'المريض: ' : 'العميل: '} {sale.customerName} {sale.customerPhone ? `(${sale.customerPhone})` : ''}
              </div>
            )}

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2"></div>

            {/* Table Header */}
            <div className="flex justify-between items-center text-[10.5px] font-bold border-b border-black pb-1 mb-1.5 font-sans">
              <span className="w-1/2 text-right">الصنف</span>
              <span className="w-1/4 text-center">الكمية × السعر</span>
              <span className="w-1/4 text-left">الإجمالي</span>
            </div>

            {/* Items Table */}
            <div className="space-y-1.5 font-sans">
              {sale.items.map((item, idx) => {
                
                const isSingle = (item.quantityMilli === 1000) && (item.unit !== 'kg');
                const qtyVal = item.quantityMilli % 1000 !== 0 ? (item.quantityMilli / 1000).toFixed(3) : (item.quantityMilli / 1000).toString();
                
                let notePrefix = '* ملاحظة: ';
                if (isPharmacy) notePrefix = '* الجرعة/الإرشادات: ';
                else if (isClothing) notePrefix = '* المقاس/اللون: ';
                else if (isElectronics) notePrefix = '* السيريال/الضمان: ';
                else if (isRoastery) notePrefix = '* التحميص/الطحن: ';
                else if (isProduceOrButchery) notePrefix = '* التقطيع/الطلب: ';

                return (
                  <div key={idx} className={is57mm ? 'text-[10px]' : 'text-[11px]'}>
                    <div className="flex justify-between items-baseline pt-0.5">
                      <span className="truncate max-w-[130px] font-medium text-right text-black">{item.productName}</span>
                    

                      <span className="font-mono text-gray-700">
                        {isSingle ? (
                          <span>1 × {formatArabicCurrency(item.unitPricePiasters, false)}</span>
                        ) : (
                          <span dir="ltr">{qtyVal} × {formatArabicCurrency(item.unitPricePiasters, false)}</span>
                        )}
                        {item.discountPiasters > 0 && (
                          <span className="text-red-700 mr-1"> (خصم -{(item.discountPiasters / 100).toFixed(2)})</span>
                        )}
                      </span>
                      <span className="font-bold text-black font-mono">{formatArabicCurrency(item.totalPiasters, false)}</span>
                    </div>

                    {/* Pharmacy batch and expiry */}
                    {isPharmacy && (item.batchNumber || item.expiryDate) && (
                      <div className="text-[9px] text-gray-600 mt-0.5">
                        تشغيلة: {item.batchNumber || '---'} {item.expiryDate ? ` | انتهاء: ${item.expiryDate}` : ''}
                      </div>
                    )}

                    {/* Hospitality kitchen modifiers */}
                    {isHospitality && item.modifiers && item.modifiers.length > 0 && (
                      <div className="text-[9px] text-gray-600 space-y-0.5 mt-0.5 pr-1">
                        {item.modifiers.map((m, mi) => (
                          <div key={mi}>+ {m.optionName}{m.extraPricePiasters > 0 ? ` (+${(m.extraPricePiasters / 100).toFixed(2)})` : ''}</div>
                        ))}
                      </div>
                    )}

                    {/* Domain-tailored item notes */}
                    {item.notes && (
                      <div className="text-[9px] text-gray-600 mt-0.5 italic">
                        {notePrefix}{item.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary Badges per Store Domain */}
            {(isClothing || isStationeryOrToys) && totalPieces > 0 && (
              <div className="border-t border-dashed border-gray-400 mt-2 pt-1 text-[10px] font-semibold text-gray-800">
                إجمالي عدد القطع: {totalPieces} قطعة
              </div>
            )}

            {isProduceOrButchery && totalKg > 0 && (
              <div className="border-t border-dashed border-gray-400 mt-2 pt-1 text-[10px] font-semibold text-gray-800">
                إجمالي وزن الأصناف الموزونة: {totalKg.toFixed(3)} كجم
              </div>
            )}

            

            {/* Solid Divider */}
            <div className="border-t border-black my-2"></div>

            {/* Totals */}
            <div className="space-y-1 font-sans">
              {(totalDiscount > 0 || sale.taxPiasters > 0 || (sale.serviceChargePiasters || 0) > 0 || (sale.deliveryFeePiasters || 0) > 0) && (
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono">{formatArabicCurrency(sale.subtotalPiasters)}</span>
                </div>
              )}
              {totalDiscount > 0 && (
                <div className="flex justify-between text-red-700">
                  <span>قيمة الخصم:</span>
                  <span className="font-mono">-{formatArabicCurrency(totalDiscount)}</span>
                </div>
              )}
              {(sale.serviceChargePiasters || 0) > 0 && (
                <div className="flex justify-between">
                  <span>رسوم الخدمة / الصالة:</span>
                  <span className="font-mono">{formatArabicCurrency(sale.serviceChargePiasters || 0)}</span>
                </div>
              )}
              {(sale.deliveryFeePiasters || 0) > 0 && (
                <div className="flex justify-between">
                  <span>رسوم التوصيل (دليفري):</span>
                  <span className="font-mono">{formatArabicCurrency(sale.deliveryFeePiasters || 0)}</span>
                </div>
              )}
              {sale.taxPiasters > 0 && (
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة:</span>
                  <span className="font-mono">{formatArabicCurrency(sale.taxPiasters)}</span>
                </div>
              )}

              <div className={`border-t-2 border-black my-1.5 pt-1 flex justify-between font-bold ${is57mm ? 'text-[12.5px]' : 'text-[14px]'}`}>
                <span>الإجمالي المطلوب:</span>
                <span className="font-mono font-bold">{formatArabicCurrency(sale.totalPiasters)}</span>
              </div>

              {changePiasters > 0 ? (
                <>
                  <div className="flex justify-between pt-0.5">
                    <span>المدفوع ({
                      sale.paymentMethod === 'credit' 
                        ? 'آجل' 
                        : sale.paymentMethod === 'instapay'
                        ? 'انستاباي'
                        : sale.paymentMethod === 'vodafone_cash'
                        ? 'محفظة كاش'
                        : sale.paymentMethod === 'card'
                        ? 'بطاقة بنكية'
                        : 'نقداً'
                    }):</span>
                    <span className="font-mono font-bold">{formatArabicCurrency(sale.paidPiasters)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800">
                    <span>الباقي للزبون:</span>
                    <span className="font-mono font-bold">{formatArabicCurrency(changePiasters)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between pt-0.5 text-gray-800">
                  <span>طريقة السداد:</span>
                  <span className="font-semibold">{
                    sale.paymentMethod === 'credit' 
                      ? 'آجل (على الحساب)' 
                      : sale.paymentMethod === 'instapay'
                      ? 'انستاباي (InstaPay)'
                      : sale.paymentMethod === 'vodafone_cash'
                      ? 'محفظة كاش'
                      : sale.paymentMethod === 'card'
                      ? 'بطاقة بنكية / فيزا'
                      : 'نقداً'
                  }</span>
                </div>
              )}

              {remainingPiasters > 0 && (
                <div className="flex justify-between font-bold text-red-700">
                  <span>المتبقي (آجل):</span>
                  <span className="font-mono font-bold">{formatArabicCurrency(remainingPiasters)}</span>
                </div>
              )}

              {sale.notes && (
                <div className="text-[10px] text-gray-700 font-sans pt-1 text-center">
                  {sale.notes}
                </div>
              )}
            </div>

            {/* Dotted Divider */}
            <div className="border-t border-dotted border-black my-2.5"></div>

            {/* Domain-specific Banners */}
            {isSupermarketOrGrocery && totalDiscount > 0 && (
              <div className="border border-dashed border-emerald-700 bg-emerald-50 text-emerald-900 py-1 my-1.5 text-center font-bold text-[10.5px] font-sans">
                * وفرت معنا اليوم: {formatArabicCurrency(totalDiscount)} *
              </div>
            )}

            {hasColdChain && (
              <div className="border-t-2 border-b-2 border-black py-1 my-2 text-center font-bold text-[11px] text-black font-sans">
                * تنبيه طبي: يحفظ في الثلاجة (2-8 مئوية) *
              </div>
            )}

            {isElectronics && (
              <div className="border border-dashed border-black py-1 my-1.5 text-center font-bold text-[10px] text-black font-sans">
                * ضمان الأجهزة الإلكترونية ساري بالفاتورة الأصلية *
              </div>
            )}

            {isProduceOrButchery && (
              <div className="border border-dashed border-black py-1 my-1.5 text-center font-bold text-[10px] text-black font-sans">
                * لحوم وخضروات طازجة مذبوحة وفقاً للشريعة الإسلامية *
              </div>
            )}

            {isClothing && (
              <div className="border border-dashed border-black py-1 my-1.5 text-center font-bold text-[10px] text-black font-sans">
                * الاستبدال والاسترجاع خلال 14 يوماً بتكت المصنع *
              </div>
            )}

            {isRoastery && (
              <div className="border border-dashed border-black py-1 my-1.5 text-center font-bold text-[10px] text-black font-sans">
                * بن ومكسرات وتوابل طازجة عالية الجودة *
              </div>
            )}

            {isBakery && (
              <div className="border border-dashed border-black py-1 my-1.5 text-center font-bold text-[10px] text-black font-sans">
                * مخبوزات وحلويات طازجة يومياً خالية من المواد الحافظة *
              </div>
            )}

            {/* Rider Delivery Slip if order is delivery */}
            {isDelivery && (
              <div className="border-t-2 border-black pt-2 mt-2 font-sans text-center">
                <div className="font-bold text-[11px] mb-1">=== قسيمة توصيل الطيار (DELIVERY) ===</div>
                <div className="text-[10px] text-right space-y-0.5 text-gray-800">
                  <div>العميل: {sale.deliveryInfo?.customerName || sale.customerName || 'عميل دليفري'}</div>
                  {(sale.deliveryInfo?.customerPhone || sale.customerPhone) && (
                    <div>الهاتف: {sale.deliveryInfo?.customerPhone || sale.customerPhone}</div>
                  )}
                  {sale.deliveryInfo?.deliveryAddress && (
                    <div>العنوان: {sale.deliveryInfo.deliveryAddress}</div>
                  )}
                  {sale.deliveryInfo?.landmark && (
                    <div>علامة مميزة: {sale.deliveryInfo.landmark}</div>
                  )}
                  {sale.deliveryInfo?.notes && (
                    <div>ملاحظات: {sale.deliveryInfo.notes}</div>
                  )}
                </div>
                <div className="font-bold text-[11px] mt-1.5 py-1 bg-gray-100 border border-gray-300">
                  المطلوب تحصيله من العميل: {formatArabicCurrency(sale.totalPiasters)}
                </div>
              </div>
            )}

            {/* Footer and Code 128 Barcode Simulation */}
            <div className="text-center space-y-1.5 mt-2">
              {activeFooter && <div className="text-[10px] text-gray-700 font-sans leading-relaxed">{activeFooter}</div>}
              
              {/* Authentic Barcode Visual Strip */}
              <div className="pt-1 flex flex-col items-center">
                <div className="flex items-end justify-center h-8 gap-[1.5px] px-2 py-0.5 bg-white">
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

              {/* Developer Branding Signature */}
              <div className="border-t border-dotted border-gray-400 pt-1.5 mt-2 text-center text-[9px] text-gray-500 font-sans tracking-tight">
                {developerSignature}
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
