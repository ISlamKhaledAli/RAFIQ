import { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Settings, 
  Zap, 
  X, 
  Save, 
  CheckCircle, 
  Trash2, 
  Keyboard, 
  ShieldCheck 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { 
  type BarcodeScannerSettings, 
  DEFAULT_SCANNER_SETTINGS, 
  physicalCodeToChar, 
  sanitizeScannedBarcode,
  type DiagnosticScanRecord 
} from '../utils/barcodeReader';

interface BarcodeScannerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (newSettings: BarcodeScannerSettings) => void;
}

export const BarcodeScannerSettingsModal = ({
  isOpen,
  onClose,
  onSettingsSaved,
}: BarcodeScannerSettingsModalProps) => {
  const [settings, setSettings] = useState<BarcodeScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Live Diagnostic Sandbox State
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticScanRecord[]>([]);
  const [currentBuffer, setCurrentBuffer] = useState<string>('');
  const [rawCodesBuffer, setRawCodesBuffer] = useState<string[]>([]);
  const [lastDelta, setLastDelta] = useState<number | null>(null);

  const testInputRef = useRef<HTMLInputElement>(null);
  const keyTimesRef = useRef<number[]>([]);
  const lastKeyTimeRef = useRef<number>(0);
  const currentBufferRef = useRef<string>('');
  const rawCodesRef = useRef<string[]>([]);

  // Load existing settings from SQLite
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const all = await invoke<Record<string, string>>('settings:getAll');
        if (active && all) {
          setSettings({
            speedThresholdMs: all.scanner_speed_ms ? parseInt(all.scanner_speed_ms, 10) || 65 : 65,
            prefix: all.scanner_prefix || '',
            suffix: (all.scanner_suffix as 'Enter' | 'Tab' | 'None') || 'Enter',
            minBarcodeLength: all.scanner_min_length ? parseInt(all.scanner_min_length, 10) || 3 : 3,
          });
        }
      } catch {
        // Fallback to defaults
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchSettings();
    return () => { active = false; };
  }, [isOpen]);

  // Focus testing input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        testInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        scanner_speed_ms: settings.speedThresholdMs.toString(),
        scanner_prefix: settings.prefix,
        scanner_suffix: settings.suffix,
        scanner_min_length: settings.minBarcodeLength.toString(),
      };
      await invoke('settings:save', payload);
      setSavedSuccess(true);
      if (onSettingsSaved) {
        onSettingsSaved(settings);
      }
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`فشل حفظ إعدادات القارئ: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    const prev = lastKeyTimeRef.current;
    const delta = prev > 0 ? Math.round(now - prev) : 0;
    lastKeyTimeRef.current = now;

    if (delta > 0) {
      keyTimesRef.current.push(delta);
      setLastDelta(delta);
    }

    const isSuffixKey = 
      (settings.suffix === 'Enter' && e.key === 'Enter') ||
      (settings.suffix === 'Tab' && e.key === 'Tab');

    if (isSuffixKey) {
      e.preventDefault();
      const rawText = currentBufferRef.current;
      const rawCodes = [...rawCodesRef.current];
      const deltas = [...keyTimesRef.current];

      if (rawText.length >= settings.minBarcodeLength) {
        const avg = deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;
        const isHardwareScanner = avg <= settings.speedThresholdMs;
        const clean = sanitizeScannedBarcode(rawText, settings.prefix);

        const newRecord: DiagnosticScanRecord = {
          id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          rawKeystrokes: rawText.split(''),
          rawCodes,
          deltas,
          avgDeltaMs: avg,
          decodedBarcode: clean,
          sourceType: isHardwareScanner ? 'hardware_scanner' : 'manual_keyboard',
        };

        setDiagnosticLogs((prev) => [newRecord, ...prev].slice(0, 10));
      }

      // Reset
      currentBufferRef.current = '';
      rawCodesRef.current = [];
      keyTimesRef.current = [];
      setCurrentBuffer('');
      setRawCodesBuffer([]);
      setLastDelta(null);
      return;
    }

    // Capture printable keys or physical codes
    const physicalChar = physicalCodeToChar(e.code, e.shiftKey);
    const charToAppend = physicalChar || (e.key.length === 1 ? e.key : null);

    if (charToAppend) {
      currentBufferRef.current += charToAppend;
      rawCodesRef.current.push(e.code || e.key);
      setCurrentBuffer(currentBufferRef.current);
      setRawCodesBuffer([...rawCodesRef.current]);
    }
  };

  const clearLogs = () => {
    setDiagnosticLogs([]);
    setCurrentBuffer('');
    setRawCodesBuffer([]);
    setLastDelta(null);
    currentBufferRef.current = '';
    rawCodesRef.current = [];
    keyTimesRef.current = [];
    testInputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-surface rounded-lg shadow-2xl border border-line w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-ink">
        {/* Header */}
        <div className="h-[60px] px-5 bg-surface-2 hairline-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-brand-soft text-brand flex items-center justify-center shadow-xs">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-ink leading-tight m-0">
                إعدادات واختبار قارئ الباركود (Barcode Scanner Wedge)
              </h2>
              <p className="text-[11px] text-ink-muted m-0">
                ميزة #131: ضمان قراءة الأكواد بنسبة 100% مع لوحة المفاتيح العربية والإنجليزية واكتشاف القارئ السريع
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded hover:bg-surface flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Section 1: Live Diagnostic Sandbox */}
          <div className="bg-surface-2 p-4 rounded-lg border border-line flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand" />
                <span className="text-[13px] font-bold text-ink">شاشة الفحص والتجربة الحية (Live Testing Sandbox)</span>
              </div>
              <div className="flex items-center gap-2">
                {lastDelta !== null && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-line text-ink">
                    آخر سرعة نبضة: <strong className={lastDelta <= settings.speedThresholdMs ? 'text-paid' : 'text-amber-600'}>{lastDelta}ms</strong>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearLogs}
                  className="text-[11px] text-ink-muted hover:text-danger flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-surface"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح السجل</span>
                </button>
              </div>
            </div>

            {/* Live Input Field for Testing */}
            <div className="relative">
              <input
                ref={testInputRef}
                type="text"
                value={currentBuffer}
                onChange={() => {}} // Controlled by onKeyDown
                onKeyDown={handleTestKeyDown}
                placeholder="اضغط هنا ثم امسح أي باركود بالماسح أو اكتب لتجربة القارئ..."
                className="w-full h-[46px] px-4 pl-24 bg-surface border-2 border-brand/50 focus:border-brand rounded-md font-mono text-[15px] text-ink placeholder:text-ink-muted/60 focus:outline-hidden"
              />
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-bold text-ink-muted bg-surface-2 px-2 py-1 rounded border border-line">
                <Keyboard className="w-3.5 h-3.5 text-brand" />
                <span>جاهز للمسح</span>
              </div>
            </div>

            {/* Current Real-time Keystrokes Decoder Preview */}
            {rawCodesBuffer.length > 0 && (
              <div className="bg-surface p-2.5 rounded border border-line flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between text-ink-muted">
                  <span>الأكواد الفيزيائية المستقبلة (DOM Event Code):</span>
                  <span className="font-mono text-brand font-bold">{rawCodesBuffer.length} مفتاح</span>
                </div>
                <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                  {rawCodesBuffer.map((code, idx) => (
                    <span key={idx} className="bg-surface-2 border border-line px-1.5 py-0.5 rounded text-ink font-semibold">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Scans Table */}
            <div className="border border-line rounded bg-surface overflow-hidden">
              <div className="h-[32px] bg-surface-2 hairline-b flex items-center px-3 text-[11px] font-bold text-ink-muted">
                <div className="w-[12%] text-center">الوقت</div>
                <div className="w-[38%] text-right">الباركود المفكوك والمنظف</div>
                <div className="w-[20%] text-center">السرعة المتوسطة</div>
                <div className="w-[30%] text-center">نوع الإدخال المكتشف</div>
              </div>

              <div className="max-h-[140px] overflow-y-auto divide-y divide-line text-[12px]">
                {diagnosticLogs.length === 0 ? (
                  <div className="py-6 text-center text-ink-muted text-xs">
                    لم يتم مسح أي باركود تجريبي بعد. قم بالمسح الآن لرؤية النتيجة والتحليل الفوري.
                  </div>
                ) : (
                  diagnosticLogs.map((log) => (
                    <div key={log.id} className="h-[36px] flex items-center px-3 hover:bg-surface-2 transition-colors">
                      <div className="w-[12%] text-center font-mono text-[10px] text-ink-muted">
                        {new Date(log.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="w-[38%] text-right font-mono font-bold text-ink truncate pr-1">
                        {log.decodedBarcode}
                      </div>
                      <div className="w-[20%] text-center font-mono text-[11px] font-bold">
                        <span className={log.avgDeltaMs <= settings.speedThresholdMs ? 'text-paid' : 'text-amber-600'}>
                          {log.avgDeltaMs} ms/مفتاح
                        </span>
                      </div>
                      <div className="w-[30%] text-center">
                        {log.sourceType === 'hardware_scanner' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-paid-soft border border-paid-border text-paid">
                            <Zap className="w-3 h-3" />
                            <span>قارئ أجهزة سريع</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 border border-amber-300 text-amber-800">
                            <Keyboard className="w-3 h-3" />
                            <span>كتابة يدوية</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Hardware Configuration Settings */}
          <div className="bg-surface p-4 rounded-lg border border-line flex flex-col gap-4">
            <div className="flex items-center gap-2 hairline-b pb-2">
              <Settings className="w-4 h-4 text-brand" />
              <span className="text-[13px] font-bold text-ink">معايير ضبط وتكوين القارئ (Wedge Settings)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Speed Threshold */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink flex items-center justify-between">
                  <span>أقصى زمن لنبضة القارئ (Speed Threshold):</span>
                  <span className="text-brand font-mono">{settings.speedThresholdMs} مللي ثانية</span>
                </label>
                <div className="flex items-center gap-2">
                  {[45, 65, 80, 100].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, speedThresholdMs: speed }))}
                      className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
                        settings.speedThresholdMs === speed
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-2 text-ink border-line hover:border-brand/40'
                      }`}
                    >
                      {speed}ms {speed === 65 && '(موصى به)'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-muted m-0">
                  إذا وصلت الحروف أسرع من هذا الزمن تُعتبر ماسحاً ضوئياً وتُضاف مباشرة للسلة، وإلا تُعامل كبحث يدوي.
                </p>
              </div>

              {/* Suffix Configuration */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink">
                  لاحقة القارئ (Scanner Suffix):
                </label>
                <div className="flex items-center gap-2">
                  {(['Enter', 'Tab', 'None'] as const).map((suf) => (
                    <button
                      key={suf}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, suffix: suf }))}
                      className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
                        settings.suffix === suf
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-2 text-ink border-line hover:border-brand/40'
                      }`}
                    >
                      {suf === 'Enter' ? 'Enter (زر الإدخال)' : suf === 'Tab' ? 'Tab (المفتاح)' : 'بدون لاحقة'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-muted m-0">
                  99% من قارئات الباركود مبرمجة على إرسال مفتاح Enter بعد إتمام المسح تلقائياً.
                </p>
              </div>

              {/* Prefix Filter */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink">
                  بادئة القارئ (Prefix to Strip):
                </label>
                <input
                  type="text"
                  value={settings.prefix}
                  onChange={(e) => setSettings((s) => ({ ...s, prefix: e.target.value }))}
                  placeholder="اتركه فارغاً إلا إذا كان القارئ يرسل رمزاً ثابتاً في البداية"
                  className="h-[34px] px-3 bg-surface-2 border border-line rounded text-xs font-mono text-ink focus:outline-hidden focus:border-brand"
                />
                <p className="text-[10px] text-ink-muted m-0">
                  يتم إزالة هذا الرمز تلقائياً من بداية الباركود الممسوح إن وجد.
                </p>
              </div>

              {/* Minimum Length */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink">
                  الحد الأدنى لطول الباركود الصالح:
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.minBarcodeLength}
                  onChange={(e) => setSettings((s) => ({ ...s, minBarcodeLength: Math.max(1, parseInt(e.target.value, 10) || 3) }))}
                  className="h-[34px] px-3 bg-surface-2 border border-line rounded text-xs font-mono text-ink focus:outline-hidden focus:border-brand"
                />
                <p className="text-[10px] text-ink-muted m-0">
                  يتجاهل الإدخالات القصيرة لتجنب التقاط ضغطات المفاتيح الفردية العرضية.
                </p>
              </div>
            </div>

            {/* Invariant Note */}
            <div className="bg-brand-soft/20 border border-brand/20 p-2.5 rounded text-[11px] text-ink flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <span>
                <strong>التوافقية المطلقة:</strong> النظام يعتمد خريطة أكواد المفاتيح الفعلية (DOM Code Mapping)؛ فلن يتأثر مسح الباركود نهائياً حتى لو نسي الكاشير لوحة مفاتيح ويندوز على اللغة العربية أو تم تشغيل قفل الحروف الكبيرة (Caps Lock).
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-[60px] px-5 bg-surface-2 hairline-t flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-xs font-bold text-paid flex items-center gap-1.5 bg-paid-soft border border-paid-border px-3 py-1 rounded">
                <CheckCircle className="w-4 h-4" />
                <span>تم حفظ إعدادات القارئ بنجاح في قاعدة البيانات</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold text-ink-muted hover:text-ink hover:bg-surface border border-line transition-colors"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving || loading}
              className="px-5 py-2 rounded text-xs font-bold bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
