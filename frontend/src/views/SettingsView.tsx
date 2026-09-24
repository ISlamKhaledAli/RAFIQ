import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  Settings, 
  Save, 
  CheckCircle, 
  Database, 
  Printer, 
  Cpu, 
  Zap,
  Activity,
  Layers
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { SystemInfo } from '../App';

interface SettingsViewProps {
  sysInfo?: SystemInfo | null;
}

export const SettingsView = ({ sysInfo }: SettingsViewProps) => {
  const [storeName, setStoreName] = useState('سوبرماركت رفيق');
  const [phone, setPhone] = useState('01012345678');
  const [address, setAddress] = useState('فرع أسيوط الرئيسي - ش الجمهورية');
  const [taxNumber, setTaxNumber] = useState('123-456-789');
  const [receiptHeader, setReceiptHeader] = useState('أهلاً بكم في سوبرماركت رفيق');
  const [receiptFooter, setReceiptFooter] = useState('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.');
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Load saved settings from SQLite DB on mount
  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      try {
        const settings = await invoke<Record<string, string>>('settings:getAll');
        if (active && settings) {
          if (settings.store_name) setStoreName(settings.store_name);
          if (settings.store_phone) setPhone(settings.store_phone);
          if (settings.store_address) setAddress(settings.store_address);
          if (settings.tax_number) setTaxNumber(settings.tax_number);
          if (settings.receipt_header) setReceiptHeader(settings.receipt_header);
          if (settings.receipt_footer) setReceiptFooter(settings.receipt_footer);
        }
      } catch (err: unknown) {
        console.error('Failed to load settings from SQLite:', err);
      }
    };
    void fetchSettings();
    return () => {
      active = false;
    };
  }, []);

  // Maintenance & Diagnostics state
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        store_name: storeName.trim(),
        store_phone: phone.trim(),
        store_address: address.trim(),
        tax_number: taxNumber.trim(),
        receipt_header: receiptHeader.trim(),
        receipt_footer: receiptFooter.trim(),
      };
      await invoke('settings:save', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`فشل حفظ الإعدادات: ${msg}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const runSqliteTest = async () => {
    setDiagnosticsLoading(true);
    try {
      const res: any = await invoke('db:testTransaction', { count: 10 });
      setDiagnosticResult(`نجاح المعاملة: ${res.message}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في المعاملة: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const runPrinterTest = async () => {
    setDiagnosticsLoading(true);
    try {
      const res: any = await invoke('printer:test');
      setDiagnosticResult(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في الطابعة: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const runPingTest = async () => {
    setDiagnosticsLoading(true);
    const start = performance.now();
    try {
      await invoke('system:ping', { timestamp: Date.now() });
      const latency = Math.round(performance.now() - start);
      setDiagnosticResult(`استجابة الجسر (IPC): تم الرد في ${latency} مللي ثانية`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في الجسر: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas p-4 gap-3 overflow-y-auto select-none">
      {/* 1. Top Header */}
      <div className="h-[56px] bg-surface hairline-all rounded-[6px] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-ink leading-tight m-0">إعدادات المحل ومعاينة الإيصال الحراري</h2>
            <p className="text-[11px] text-ink-muted m-0">تخصيص بيانات الفاتورة وصيانة وأدوات النظام</p>
          </div>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-paid font-bold bg-paid-soft border border-paid-border px-3 py-1.5 rounded-[4px]">
            <CheckCircle className="w-4 h-4" />
            <span>تم حفظ الإعدادات بنجاح</span>
          </div>
        )}
      </div>

      {/* 2. Main Two-Column Viewport */}
      <div className="grid grid-cols-12 gap-4 flex-1">
        {/* RIGHT COLUMN: Store Profile Form & Maintenance (7 cols) */}
        <div className="col-span-7 flex flex-col gap-4">
          {/* Store Profile Form */}
          <form onSubmit={handleSave} className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="text-[13px] font-bold text-ink m-0">بيانات السوبرماركت والفاتورة</h3>
              <span className="text-[11px] text-ink-muted">تنعكس فوراً على الإيصال المطبوع</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">اسم المحل *</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">رقم الهاتف *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">العنوان والفرع</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">الرقم الضريبي / السجل</label>
                <input
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">ترويسة الإيصال الحراري (السطر الترحيبي)</label>
              <input
                type="text"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
              />
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">تذييل الإيصال (سياسة الاستبدال والاسترجاع)</label>
              <textarea
                rows={2}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full bg-surface border border-line rounded p-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-sans resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saveLoading}
              className="mt-1 h-[40px] bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[13px] font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتطبيق بيانات المتجر في قاعدة البيانات'}</span>
            </button>
          </form>

          {/* Maintenance & System Diagnostics Section (Cleanly Integrated from DiagnosticsView) */}
          <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                <h3 className="text-[13px] font-bold text-ink m-0">صيانة النظام وفحص الأجهزة</h3>
              </div>
              <span className="text-[11px] font-mono text-paid font-bold">SQLite WAL Active</span>
            </div>

            {/* Diagnostic Message Toast */}
            {diagnosticResult && (
              <div className="p-2.5 rounded bg-surface-2 border border-line text-ink font-mono text-[11px] flex items-center justify-between">
                <span>{diagnosticResult}</span>
                <button 
                  onClick={() => setDiagnosticResult(null)}
                  className="text-ink-muted hover:text-ink text-xs mr-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void runPrinterTest()}
                disabled={diagnosticsLoading}
                className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-2 transition-colors text-[12px]"
              >
                <Printer className="w-4 h-4 text-brand" />
                <span>اختبار الطابعة (80 مم)</span>
              </button>

              <button
                type="button"
                onClick={() => void runSqliteTest()}
                disabled={diagnosticsLoading}
                className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-2 transition-colors text-[12px]"
              >
                <Database className="w-4 h-4 text-paid" />
                <span>اختبار المعاملة الذرية</span>
              </button>

              <button
                type="button"
                onClick={() => void runPingTest()}
                disabled={diagnosticsLoading}
                className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-2 transition-colors text-[12px]"
              >
                <Zap className="w-4 h-4 text-amber-600" />
                <span>فحص سرعة الجسر (IPC)</span>
              </button>
            </div>

            {/* Technical Specs Strip */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line text-[11px] font-mono text-ink-muted">
              <div className="flex items-center gap-1.5 p-2 rounded bg-surface-2 border border-line">
                <Cpu className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="truncate">{sysInfo?.osVersion ? sysInfo.osVersion.split(' ')[0] : 'Windows'}</span>
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded bg-surface-2 border border-line">
                <Layers className="w-3.5 h-3.5 text-paid shrink-0" />
                <span className="truncate">{sysInfo?.isWebView2 ? 'Fixed 109' : 'Chrome/Edge'}</span>
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded bg-surface-2 border border-line">
                <Database className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="truncate">Integer Piasters</span>
              </div>
            </div>
          </div>
        </div>

        {/* LEFT COLUMN: Real 80mm Live Thermal Receipt Preview (5 cols, matching folder 80) */}
        <div className="col-span-5 flex flex-col items-center justify-start">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-ink-muted">معاينة الإيصال الحراري الفعلي (80 مم)</span>
            <span className="text-[10px] font-mono bg-surface border border-line px-2 py-0.5 rounded text-ink-muted">
              203 DPI / 96 DPI Display
            </span>
          </div>

          {/* Realistic Receipt Canvas Paper */}
          <div className="w-[310px] bg-white text-black font-mono text-[12px] p-5 shadow-sm border border-line rounded flex flex-col relative select-text">
            {/* Top Zigzag Cut */}
            <div className="w-full h-2 receipt-zigzag mb-2 opacity-30"></div>

            {/* Receipt Header */}
            <div className="text-center flex flex-col gap-0.5">
              <h4 className="text-[16px] font-bold m-0 font-sans">{storeName || 'سوبرماركت رفيق'}</h4>
              <p className="text-[11px] text-gray-700 m-0">{address}</p>
              <p className="text-[11px] text-gray-700 m-0">هاتف: {phone}</p>
              <p className="text-[10px] text-gray-500 m-0">ر.ض: {taxNumber}</p>
              <p className="text-[11px] font-semibold text-gray-800 mt-1 border-t border-b border-dashed border-gray-400 py-1 font-sans">
                {receiptHeader}
              </p>
            </div>

            {/* Meta Row */}
            <div className="flex justify-between text-[10px] text-gray-600 my-2">
              <span>فاتورة: #1042</span>
              <span>2026/09/24 14:35</span>
            </div>

            {/* Table Line Items */}
            <div className="border-t border-dashed border-black pt-1 pb-1 flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between font-bold text-[10px] text-gray-600 pb-0.5">
                <span>الصنف</span>
                <span>الكمية × السعر</span>
                <span>الإجمالي</span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[130px]">لبن جهينة 1 لتر</span>
                <span>1 × 42.00</span>
                <span className="font-bold">42.00</span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[130px]">مياه بركة 1.5 لتر</span>
                <span>2 × 8.00</span>
                <span className="font-bold">16.00</span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[130px]">عيش فينو 5 رغيف</span>
                <span>1 × 10.00</span>
                <span className="font-bold">10.00</span>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-black pt-1.5 flex flex-col gap-1 text-[12px]">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span>68.00 ج.م</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>الخصم:</span>
                <span>0.00 ج.م</span>
              </div>
              <div className="flex justify-between font-bold text-[15px] border-t border-black pt-1 mt-0.5">
                <span>الإجمالي المطلوب:</span>
                <span>68.00 ج.م</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-700">
                <span>المدفوع نقداً:</span>
                <span>70.00 ج.م</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-gray-900">
                <span>الباقي للعميل:</span>
                <span>2.00 ج.م</span>
              </div>
            </div>

            {/* Barcode Simulation */}
            <div className="my-3 flex flex-col items-center">
              <div className="h-9 w-44 bg-black flex items-center justify-center text-white text-[9px] font-mono tracking-widest">
                ||| | |||| | ||| |||| | ||
              </div>
              <span className="text-[9px] text-gray-500 mt-0.5">2026104200068</span>
            </div>

            {/* Receipt Footer */}
            <div className="text-center text-[10px] text-gray-700 border-t border-dashed border-gray-400 pt-1.5 font-sans leading-relaxed">
              {receiptFooter}
            </div>

            {/* Bottom Zigzag Cut */}
            <div className="w-full h-2 receipt-zigzag mt-3 opacity-30"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
