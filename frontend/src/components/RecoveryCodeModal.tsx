import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { KeyRound, Copy, Check, Printer, ShieldAlert, ShieldCheck, FileText } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { printCompactReport } from '../utils/printReport';
import { encodeInvoiceBarcode, layoutReceiptBarcode, RECEIPT_DPI } from '../utils/receiptLayout';
import type { ReceiptPaperWidth } from '../utils/receiptLayout';

interface RecoveryCodeModalProps {
  isOpen: boolean;
  recoveryCode: string;
  onConfirmed: () => void;
}

interface StoreReceiptSettings {
  storeName: string;
  phone: string;
  logoUrl: string;
  showLogo: boolean;
  stationName: string;
  paperWidth: ReceiptPaperWidth;
}

const DEFAULT_STORE_SETTINGS: StoreReceiptSettings = {
  storeName: 'رفيق لإدارة المتاجر ونقاط البيع',
  phone: '',
  logoUrl: '/receipt_logo.png',
  showLogo: true,
  stationName: 'محطة الكاشير الرئيسية (POS-01)',
  paperWidth: '80mm',
};

/**
 * Renders the Code 128 barcode of the recovery code in crisp physical SVG printer dots
 * matching the thermal printer DPI (203 dpi) without blur.
 */
function RecoveryCodeBarcode({ value, paper }: { value: string; paper: ReceiptPaperWidth }) {
  const cleanValue = value.trim();
  const bits = useMemo(() => {
    try {
      return encodeInvoiceBarcode(cleanValue);
    } catch {
      return '';
    }
  }, [cleanValue]);

  if (!bits) return null;

  const layout = layoutReceiptBarcode(bits.length, paper);
  const mm = (dots: number) => `${((dots * 25.4) / RECEIPT_DPI).toFixed(2)}mm`;
  const bars: Array<{ x: number; width: number }> = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    let run = 1;
    while (bits[i + run] === '1') run++;
    bars.push({ x: i, width: run });
    i += run - 1;
  }

  return (
    <div className="mt-2 text-center select-none">
      <svg
        role="img"
        aria-label={`باركود كود الاسترجاع ${cleanValue}`}
        className="block mx-auto"
        style={{ width: mm(layout.widthDots), height: mm(layout.heightDots) }}
        viewBox={`0 0 ${bits.length} 1`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={1} fill="currentColor" />
        ))}
      </svg>
      <div className="font-mono text-micro text-neutral-700 mt-1 tracking-widest text-center" dir="ltr">
        * {cleanValue} *
      </div>
    </div>
  );
}

export const RecoveryCodeModal: React.FC<RecoveryCodeModalProps> = ({
  isOpen,
  recoveryCode,
  onConfirmed,
}) => {
  const [copied, setCopied] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');
  const [storeSettings, setStoreSettings] = useState<StoreReceiptSettings>(DEFAULT_STORE_SETTINGS);

  // Load store profile & printer settings
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    invoke<Record<string, string>>('settings:getAll')
      .then((s) => {
        if (!isMounted || !s) return;
        setStoreSettings({
          storeName: s.store_name?.trim() || DEFAULT_STORE_SETTINGS.storeName,
          phone: s.store_phone?.trim() || '',
          logoUrl: s.store_logo_url?.trim() || DEFAULT_STORE_SETTINGS.logoUrl,
          showLogo: s.show_receipt_logo !== '0' && s.show_receipt_logo !== 'false',
          stationName: s.station_name?.trim() || s.device_name?.trim() || DEFAULT_STORE_SETTINGS.stationName,
          paperWidth: s.receipt_paper_width === '57mm' ? '57mm' : '80mm',
        });
      })
      .catch(() => {
        // Fallback to defaults
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(recoveryCode);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard write errors
    }
  };

  const handlePrint = useCallback(() => {
    void printCompactReport(printMode === 'thermal' ? 'thermal' : 'a4');
  }, [printMode]);

  // Keyboard shortcut: F9 prints
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrint]);

  const handleConfirm = async () => {
    if (!hasAcknowledged || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await invoke('backup:confirmRecoveryCode');
      onConfirmed();
    } catch {
      // Fallback
      onConfirmed();
    } finally {
      setIsSubmitting(false);
    }
  };

  const issueDate = useMemo(() => {
    try {
      return new Date().toLocaleString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return new Date().toLocaleString();
    }
  }, []);

  if (!isOpen) return null;

  const is57mm = printMode === 'thermal' && storeSettings.paperWidth === '57mm';
  const effectivePaper: ReceiptPaperWidth = is57mm ? '57mm' : '80mm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4 print:p-0 print:bg-white print:static print:backdrop-blur-none">
      <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl max-w-xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:max-h-none print:w-full print:rounded-none">
        {/* On-screen Header (Hidden in Print) */}
        <div className="no-print print:hidden bg-brand-soft dark:bg-surface-dark-2 px-5 py-3.5 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand/10 dark:bg-surface-dark-3 border border-brand/20 dark:border-line-dark flex items-center justify-center text-brand dark:text-brand-bright shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink dark:text-ink-dark">كود استرجاع النسخ الاحتياطية (Recovery Code)</h2>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5">مفتاح الأمان الرئيسي المشفر لاسترجاع البيانات على أي جهاز</p>
            </div>
          </div>

          {/* Paper Mode Selector */}
          <div className="inline-flex rounded-lg border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setPrintMode('thermal')}
              className={`px-2.5 py-1 rounded font-semibold text-micro transition-colors cursor-pointer ${
                printMode === 'thermal'
                  ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              بون كاشير ({storeSettings.paperWidth})
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('a4')}
              className={`px-2.5 py-1 rounded font-semibold text-micro transition-colors cursor-pointer ${
                printMode === 'a4'
                  ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              ورقة A4
            </button>
          </div>
        </div>

        {/* Action Toolbar (Screen only - Hidden in Print) */}
        <div className="no-print print:hidden bg-surface dark:bg-surface-dark px-5 py-2.5 border-b border-line dark:border-line-dark flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
            <FileText className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>معاينة شهادة استرجاع الطوارئ المعتمدة:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
              title="نسخ كود الاسترجاع للحافظة"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                  <span className="text-paid dark:text-paid-bright">تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                  <span>نسخ الكود</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-brand hover:bg-brand-hover dark:bg-brand-bright dark:text-surface-dark text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="طباعة إيصال الأمان على الطابعة الحرارية (F9)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة كارت الأمان (F9)</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-canvas dark:bg-canvas-dark flex justify-center items-start print:p-0 print:bg-white print:overflow-visible">
          {/* Printable Thermal/A4 Voucher */}
          <div
            data-print-root
            className={`bg-white text-black font-sans leading-relaxed select-text border border-line print:border-none print:shadow-none print:p-0 ${
              printMode === 'thermal'
                ? `${is57mm ? 'w-[220px] p-3 text-micro' : 'w-[310px] p-4 text-xs'} shadow-md print-compact`
                : 'w-full max-w-xl p-6 text-sm shadow-md'
            }`}
            dir="rtl"
          >
            {/* Store Header & Logo */}
            {storeSettings.showLogo && storeSettings.logoUrl && (
              <div className="flex justify-center mb-2">
                <img
                  src={storeSettings.logoUrl}
                  alt="شعار المتجر"
                  className={`object-contain max-h-[48px] ${is57mm ? 'max-w-[90px]' : 'max-w-[130px]'}`}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
                  }}
                />
              </div>
            )}

            <div className={`text-center font-extrabold break-words text-black leading-tight ${is57mm ? 'text-xs' : 'text-sm sm:text-base'}`}>
              {storeSettings.storeName}
            </div>
            <div className="text-center text-micro text-neutral-700 mt-0.5">
              نظام رفيق لإدارة المتاجر ونقاط البيع (Rafiq POS)
            </div>
            {storeSettings.phone && (
              <div className="text-center text-micro text-neutral-600 mt-0.5" dir="ltr">
                هاتف: {storeSettings.phone}
              </div>
            )}

            {/* Document Title Header */}
            <div className="border-t-2 border-black my-2"></div>

            <div className={`text-center font-black tracking-wide text-black ${is57mm ? 'text-xs' : 'text-sm'}`}>
              وثيقة أمان استرجاع البيانات المعتمدة
            </div>
            <div className="text-center font-mono font-bold text-micro text-neutral-800 tracking-wider" dir="ltr">
              EMERGENCY MASTER RECOVERY KEY
            </div>

            <div className="bg-black text-white text-center font-bold text-micro py-1 px-2 my-2 tracking-wide uppercase">
              ★ سري للغاية — يُحفظ في مكان آمن ومحمي ★
            </div>

            {/* Metadata Rows */}
            <div className="border-t border-dashed border-black my-2"></div>
            <div className="space-y-1 text-micro">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-neutral-700">تاريخ الإصدار:</span>
                <span dir="ltr" className="font-mono tabular-nums font-bold">{issueDate}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-neutral-700">المحطة / الجهاز:</span>
                <span className="font-bold">{storeSettings.stationName}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-neutral-700">مستوى الأمان:</span>
                <span className="font-bold">تشفير محلي عسكري (AES-256)</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-neutral-700">جهة الاعتماد:</span>
                <span className="font-bold text-black">المالك الرئيسي للنظام (Owner)</span>
              </div>
            </div>

            {/* Key Box */}
            <div className="border-t border-dashed border-black my-2.5"></div>
            <div className="text-center font-bold text-xs text-black mb-1">
              كود الاسترجاع المعتمد لمنشأتك:
            </div>
            <div className="border-2 border-black bg-neutral-50 rounded-sm p-3 text-center my-1.5 shadow-xs">
              <div
                className={`font-mono font-black text-black tracking-widest select-all break-all ${
                  is57mm ? 'text-base' : 'text-lg sm:text-xl'
                }`}
                dir="ltr"
              >
                {recoveryCode}
              </div>
            </div>

            {/* Code 128 Barcode for Scanners */}
            <RecoveryCodeBarcode value={recoveryCode} paper={effectivePaper} />

            {/* Security Notice Box */}
            <div className="border-t border-dashed border-black my-2.5"></div>
            <div className="bg-neutral-100 border border-black/30 rounded p-2.5 text-right space-y-1.5 text-micro leading-relaxed text-neutral-900">
              <div className="font-black text-black text-xs">
                تنبيه أمان بالغ الأهمية:
              </div>
              <div className="space-y-1">
                <p>• هذا الكود هو المفتاح الرئيسي الوحيد لفك تشفير واسترجاع قاعدة بيانات المحل عند تلف القرص الصلب أو تعطل الكمبيوتر.</p>
                <p>• احتفظ بهذه الورقة في خزانة حديدية أو مكان آمن تماماً خارج هذا الجهاز.</p>
                <p>• يُحظر مشاركة هذا الرمز مع الكاشيرات أو أي طرف غير مخول؛ ولا يُطلب إلا بمعرفة المالك شخصياً والدعم الفني المعتمد لرفيق.</p>
              </div>
            </div>

            {/* Signatures */}
            <div className="border-t border-dashed border-black my-2.5"></div>
            <div className="grid grid-cols-2 gap-4 text-center text-micro text-neutral-800 print-keep-cols my-2">
              <div>
                <span className="block font-bold">توقيع المالك / المسؤول</span>
                <span className="block mt-7 border-b border-black/60 w-24 mx-auto"></span>
              </div>
              <div>
                <span className="block font-bold">الختم المعتمد</span>
                <span className="block mt-7 border-b border-black/60 w-24 mx-auto"></span>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t-2 border-black my-2"></div>
            <div className="text-center space-y-0.5 text-micro text-neutral-700">
              <div className="font-bold text-black">رفيق للأنظمة والحلول البرمجية</div>
              <div>للدعم الفني والاستفسار: 01097782965</div>
              <div className="text-neutral-500 font-mono text-micro mt-0.5" dir="ltr">
                Rafiq POS Security Vault • Confidential
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer (Screen only - Hidden in Print) */}
        <div className="no-print print:hidden bg-surface-2 dark:bg-surface-dark-2 px-5 py-3.5 border-t border-line dark:border-line-dark space-y-3 shrink-0">
          <label className="flex items-start gap-3 cursor-pointer bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-xl p-3 hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-line dark:border-line-dark text-brand focus:ring-brand h-4 w-4 cursor-pointer"
            />
            <span className="text-xs text-ink dark:text-ink-dark leading-relaxed text-right select-none">
              أقر بأنني قمت بطباعة وحفظ كود الاسترجاع في مكان خارجي آمن ومستقل، وأدرك تماماً أنه لن يمكن استرجاع البيانات أو فك تشفير النسخ على أي جهاز آخر بدونه.
            </span>
          </label>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-micro text-ink-muted dark:text-ink-dark-muted">
              <ShieldAlert className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
              <span>لا يمكن إغلاق هذه النافذة إلا بعد تأكيد حفظ الكود</span>
            </div>

            <button
              type="button"
              disabled={!hasAcknowledged || isSubmitting}
              onClick={handleConfirm}
              className={`px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                hasAcknowledged && !isSubmitting
                  ? 'bg-brand dark:bg-brand-bright dark:text-surface-dark hover:bg-brand-hover text-white shadow-md active:scale-95'
                  : 'bg-line dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted cursor-not-allowed opacity-60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري التأكيد...' : 'نسخت الكود واحتفظت به'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};