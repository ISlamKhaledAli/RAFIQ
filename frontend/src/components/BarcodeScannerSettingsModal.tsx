import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Barcode,
  Settings,
  Zap,
  X,
  Save,
  CheckCircle,
  Trash2,
  Keyboard,
  ShieldCheck,
  Cpu,
  Server,
  ChevronDown,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';
import { useModalDismiss } from '../hooks/useModalDismiss';
import {
  type BarcodeScannerSettings,
  DEFAULT_SCANNER_SETTINGS,
  physicalCodeToChar,
  sanitizeScannedBarcode,
  type DiagnosticScanRecord,
} from '../utils/barcodeReader';

interface BarcodeScannerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (newSettings: BarcodeScannerSettings) => void;
}

type ScanTerminator = 'Enter' | 'Tab' | 'None';
type ChipTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger';

interface ScanSample extends DiagnosticScanRecord {
  rawText: string;
  detectedPrefix: string;
  terminator: ScanTerminator;
  totalMs: number;
}

const HISTORY_LIMIT = 5;

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark',
  brand: 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30',
  ok: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border',
  warn: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30',
  danger: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30',
};

const Chip = ({ tone, children }: { tone: ChipTone; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-bold whitespace-nowrap ${CHIP_TONE[tone]}`}>
    {children}
  </span>
);

const OPTION_IDLE =
  'bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark border-line dark:border-line-dark hover:border-brand/50 dark:hover:border-brand-bright/50';
const OPTION_ACTIVE =
  'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand dark:border-brand-bright';
const OPTION_BASE =
  'flex-1 h-10 px-2 rounded-lg border text-sm font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';
const FIELD =
  'w-full h-10 px-3 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm font-mono text-ink dark:text-ink-dark placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted/60 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-2 focus:ring-brand/20';
const FOOTER_BTN =
  'h-10 px-4 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

function detectPrefix(raw: string, configuredPrefix: string): string {
  if (configuredPrefix && raw.startsWith(configuredPrefix)) return configuredPrefix;
  const match = /^[^0-9A-Za-z\u0600-\u06FF]+/.exec(raw);
  return match ? match[0] : '';
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
  const [showModes, setShowModes] = useState(false);

  // Live scan sandbox
  const [samples, setSamples] = useState<ScanSample[]>([]);
  const [currentBuffer, setCurrentBuffer] = useState('');
  const [lastRejected, setLastRejected] = useState<string | null>(null);

  const settingsRef = useRef<BarcodeScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  const bufferRef = useRef('');
  const codesRef = useRef<string[]>([]);
  const deltasRef = useRef<number[]>([]);
  const lastKeyRef = useRef(0);
  const firstKeyRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const testInputRef = useRef<HTMLInputElement>(null);
  const initialSettingsRef = useRef<BarcodeScannerSettings>(DEFAULT_SCANNER_SETTINGS);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load existing settings from SQLite
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const all = await invoke<Record<string, string>>('settings:getAll');
        if (active && all) {
          const speedVal = all.scanner_speed_ms || all.scanner_speed_threshold_ms;
          const loaded: BarcodeScannerSettings = {
            speedThresholdMs: speedVal ? parseInt(speedVal, 10) || 65 : 65,
            prefix: all.scanner_prefix || '',
            suffix: (all.scanner_suffix as 'Enter' | 'Tab' | 'None') || 'Enter',
            minBarcodeLength: all.scanner_min_length ? parseInt(all.scanner_min_length, 10) || 3 : 3,
          };
          setSettings(loaded);
          initialSettingsRef.current = loaded;
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

  const isSettingsDirty = useCallback(() => {
    return (
      settings.speedThresholdMs !== initialSettingsRef.current.speedThresholdMs ||
      settings.prefix !== initialSettingsRef.current.prefix ||
      settings.suffix !== initialSettingsRef.current.suffix ||
      settings.minBarcodeLength !== initialSettingsRef.current.minBarcodeLength
    );
  }, [settings]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty: isSettingsDirty,
    confirmTitle: 'تعديلات إعدادات الباركود غير محفوظة',
    confirmMessage: 'هناك تعديلات على إعدادات قارئ الباركود لم يتم حفظها. هل أنت متأكد من الخروج وتجاهل التعديلات؟',
  });

  // Window-level capture: a scan is recorded wherever the focus is (except inside the settings fields).
  useEffect(() => {
    if (!isOpen) return;

    const resetCapture = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      bufferRef.current = '';
      codesRef.current = [];
      deltasRef.current = [];
      lastKeyRef.current = 0;
      firstKeyRef.current = 0;
    };

    const finalize = (terminator: ScanTerminator, endedAt: number) => {
      const rawText = bufferRef.current;
      if (!rawText) return;
      const cfg = settingsRef.current;
      if (rawText.length >= cfg.minBarcodeLength) {
        const deltas = [...deltasRef.current];
        const avg = deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;
        const sample: ScanSample = {
          id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          rawKeystrokes: rawText.split(''),
          rawCodes: [...codesRef.current],
          deltas,
          avgDeltaMs: avg,
          decodedBarcode: sanitizeScannedBarcode(rawText, cfg.prefix),
          sourceType: avg <= cfg.speedThresholdMs ? 'hardware_scanner' : 'manual_keyboard',
          rawText,
          detectedPrefix: detectPrefix(rawText, cfg.prefix),
          terminator,
          totalMs: Math.round(endedAt - firstKeyRef.current),
        };
        setSamples((prev) => [sample, ...prev].slice(0, HISTORY_LIMIT));
        setLastRejected(null);
      } else {
        setLastRejected(rawText);
      }
      resetCapture();
      setCurrentBuffer('');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isOtherField =
        target instanceof HTMLElement &&
        target !== testInputRef.current &&
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable);
      if (isOtherField || e.ctrlKey || e.metaKey || e.altKey) return;

      const now = performance.now();
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!bufferRef.current) return; // normal keyboard behaviour when nothing is being scanned
        e.preventDefault();
        finalize(e.key === 'Enter' ? 'Enter' : 'Tab', now);
        return;
      }

      const ch = physicalCodeToChar(e.code, e.shiftKey) || (e.key.length === 1 ? e.key : null);
      if (!ch) return;
      e.preventDefault();

      if (!bufferRef.current) {
        firstKeyRef.current = now;
      } else {
        deltasRef.current.push(Math.round(now - lastKeyRef.current));
      }
      lastKeyRef.current = now;
      bufferRef.current += ch;
      codesRef.current.push(e.code || e.key);
      setCurrentBuffer(bufferRef.current);
      setLastRejected(null);

      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      if (settingsRef.current.suffix === 'None') {
        // No terminator key: a long pause ends the scan.
        idleTimerRef.current = window.setTimeout(
          () => finalize('None', performance.now()),
          Math.max(250, settingsRef.current.speedThresholdMs * 3),
        );
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    // Pull focus off any background field (e.g. the POS search box) so scanner keystrokes never leak into it.
    testInputRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      resetCapture();
    };
  }, [isOpen]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        scanner_speed_ms: settings.speedThresholdMs.toString(),
        scanner_speed_threshold_ms: settings.speedThresholdMs.toString(),
        scanner_prefix: settings.prefix,
        scanner_suffix: settings.suffix,
        scanner_min_length: settings.minBarcodeLength.toString(),
      };
      await invoke('settings:save', payload);
      initialSettingsRef.current = { ...settings };
      setSavedSuccess(true);
      if (onSettingsSaved) {
        onSettingsSaved(settings);
      }
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل حفظ إعدادات القارئ',
        message: `فشل حفظ إعدادات القارئ: ${msg}`,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const clearLogs = () => {
    setSamples([]);
    setCurrentBuffer('');
    setLastRejected(null);
    bufferRef.current = '';
    codesRef.current = [];
    deltasRef.current = [];
    lastKeyRef.current = 0;
    firstKeyRef.current = 0;
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  if (!isOpen) return null;

  const lastSample = samples[0] ?? null;
  const isFast = lastSample?.sourceType === 'hardware_scanner';
  const suffixMatches = lastSample
    ? lastSample.terminator === settings.suffix
    : true;

  let statusTone: ChipTone = 'neutral';
  let statusLabel = 'جاهز للمسح';
  if (currentBuffer) {
    statusTone = 'brand';
    statusLabel = 'جاري استقبال الكود...';
  } else if (lastRejected !== null) {
    statusTone = 'danger';
    statusLabel = 'كود قصير جداً - اتجاهل';
  } else if (lastSample) {
    statusTone = isFast ? 'ok' : 'warn';
    statusLabel = isFast ? 'قارئ باركود سريع' : 'كتابة يدوية بطيئة';
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-xl border border-line dark:border-line-dark w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-ink dark:text-ink-dark transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-16 px-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
              <Barcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="t-modal-title text-ink dark:text-ink-dark leading-tight m-0 truncate">فحص وضبط قارئ الباركود</h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5 truncate">
                جرّب القارئ هنا الأول، وبعدين اظبط السرعة واللاحقة لو في حاجة مش مظبوطة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="w-10 h-10 rounded-lg hover:bg-surface dark:hover:bg-surface-dark-3 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 items-start bg-surface dark:bg-surface-dark">
          {/* Test panel */}
          <section className="bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark p-4 flex flex-col gap-4 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand dark:text-brand-bright" />
                <h3 className="t-card-title text-ink dark:text-ink-dark m-0">اختبار القارئ</h3>
              </div>
              <button
                type="button"
                onClick={clearLogs}
                disabled={samples.length === 0 && !currentBuffer && lastRejected === null}
                className="h-10 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:border-danger/40 dark:hover:border-danger-bright/40 text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح السجل</span>
              </button>
            </div>

            <ol className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-ink-muted dark:text-ink-dark-muted">
              {['اتأكد إن القارئ موصّل وشغال', 'امسح أي باركود بالقارئ', 'شوف النتيجة والسرعة تحت'].map((step, idx) => (
                <li key={step} className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-xs font-extrabold tabular-nums flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="leading-snug">{step}</span>
                </li>
              ))}
            </ol>

            {/* Live capture field */}
            <div className="relative">
              <input
                ref={testInputRef}
                type="text"
                readOnly
                tabIndex={-1}
                value={currentBuffer}
                dir="ltr"
                aria-label="الكود الجاري استقباله من القارئ"
                placeholder="الكود هيظهر هنا لحظة المسح..."
                className="w-full h-14 pr-4 pl-44 bg-surface dark:bg-surface-dark-3 border-2 border-brand/40 dark:border-brand-bright/40 rounded-xl font-mono text-xl font-bold tabular-nums text-ink dark:text-ink-dark placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted/60 placeholder:font-sans placeholder:text-sm placeholder:font-medium focus:outline-none"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Chip tone={statusTone}>
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>{statusLabel}</span>
                </Chip>
              </div>
            </div>

            {/* Last scan result */}
            <div className="min-h-[148px] bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-4 flex flex-col justify-center gap-3">
              {lastSample ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">آخر كود اتقرا</span>
                    <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ink-dark-muted">
                      {new Date(lastSample.timestamp).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div
                    dir="ltr"
                    className="text-3xl font-mono font-extrabold tabular-nums tracking-wide text-ink dark:text-ink-dark break-all leading-tight select-text"
                  >
                    {lastSample.decodedBarcode || '—'}
                  </div>
                  {lastSample.rawText !== lastSample.decodedBarcode && (
                    <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted">
                      <span className="shrink-0">الكود الخام:</span>
                      <span dir="ltr" className="font-mono break-all select-text">{lastSample.rawText}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={isFast ? 'ok' : 'warn'}>
                      <span className="tabular-nums">{lastSample.avgDeltaMs}</span>
                      <span>مللي/مفتاح</span>
                      <span className="opacity-70">(الحد {settings.speedThresholdMs})</span>
                    </Chip>
                    <Chip tone="neutral">
                      <span className="tabular-nums">{lastSample.totalMs}</span>
                      <span>مللي للكود كله</span>
                    </Chip>
                    <Chip tone="neutral">
                      <span className="tabular-nums">{lastSample.rawText.length}</span>
                      <span>خانة</span>
                    </Chip>
                    <Chip tone={lastSample.detectedPrefix ? 'brand' : 'neutral'}>
                      <span>{lastSample.detectedPrefix ? 'بادئة:' : 'بدون بادئة'}</span>
                      {lastSample.detectedPrefix && <span dir="ltr" className="font-mono">{lastSample.detectedPrefix}</span>}
                    </Chip>
                    <Chip tone={suffixMatches ? 'ok' : 'warn'}>
                      <span>لاحقة: {lastSample.terminator === 'None' ? 'بدون' : lastSample.terminator}</span>
                      {!suffixMatches && <span className="opacity-80">(المضبوط {settings.suffix === 'None' ? 'بدون' : settings.suffix})</span>}
                    </Chip>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center gap-2 text-ink-muted dark:text-ink-dark-muted py-3">
                  <Barcode className="w-8 h-8 opacity-50" />
                  <p className="text-sm font-bold text-ink dark:text-ink-dark m-0">لسه مفيش باركود اتمسح</p>
                  <p className="text-xs m-0 max-w-xs leading-relaxed">
                    امسح أي صنف بالقارئ وهتشوف هنا الكود وسرعة القراءة والبادئة واللاحقة فوراً.
                  </p>
                </div>
              )}
            </div>

            {/* Short history */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="t-label text-ink-muted dark:text-ink-dark-muted m-0">آخر عمليات المسح</h4>
                <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ink-dark-muted">{samples.length}/{HISTORY_LIMIT}</span>
              </div>
              <div className="rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark overflow-hidden divide-y divide-line dark:divide-line-dark">
                {samples.length === 0 ? (
                  <div className="h-10 flex items-center justify-center text-xs text-ink-muted dark:text-ink-dark-muted">السجل فاضي</div>
                ) : (
                  samples.map((log) => (
                    <div key={log.id} className="h-10 px-3 grid grid-cols-[88px_1fr_auto_auto] items-center gap-3 text-xs">
                      <span className="font-mono tabular-nums text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span dir="ltr" className="font-mono font-bold text-sm text-ink dark:text-ink-dark truncate text-left">{log.decodedBarcode}</span>
                      <span className="font-mono tabular-nums font-bold text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">{log.avgDeltaMs} مللي</span>
                      <Chip tone={log.sourceType === 'hardware_scanner' ? 'ok' : 'warn'}>
                        {log.sourceType === 'hardware_scanner' ? 'قارئ' : 'يدوي'}
                      </Chip>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Settings panel */}
          <section className="bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark p-4 flex flex-col gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-brand dark:text-brand-bright" />
              <h3 className="t-card-title text-ink dark:text-ink-dark m-0">إعدادات القارئ</h3>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink dark:text-ink-dark">أقصى زمن بين الحروف</span>
                <span className="text-sm font-mono font-extrabold tabular-nums text-brand dark:text-brand-bright">{settings.speedThresholdMs} مللي</span>
              </div>
              <div className="flex items-center gap-2">
                {[45, 65, 80, 100].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, speedThresholdMs: speed }))}
                    className={`${OPTION_BASE} font-mono tabular-nums ${settings.speedThresholdMs === speed ? OPTION_ACTIVE : OPTION_IDLE}`}
                    title={speed === 65 ? 'القيمة الموصى بها' : undefined}
                  >
                    {speed}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
                الحروف اللي بتوصل أسرع من الزمن ده بتتعامل كقارئ باركود وتنزل السلة فوراً، وغير كده بتتعامل كبحث بالكيبورد. الموصى به 65.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-ink dark:text-ink-dark">لاحقة القارئ بعد المسح</span>
              <div className="flex items-center gap-2">
                {(['Enter', 'Tab', 'None'] as const).map((suf) => (
                  <button
                    key={suf}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, suffix: suf }))}
                    className={`${OPTION_BASE} ${settings.suffix === suf ? OPTION_ACTIVE : OPTION_IDLE}`}
                  >
                    {suf === 'None' ? 'بدون' : suf}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
                أغلب القارئات بتبعت Enter تلقائياً بعد الكود. لو اختلف عن اللي بتشوفه في الاختبار هتظهر لك علامة تنبيه.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-ink dark:text-ink-dark">بادئة القارئ</span>
                <input
                  type="text"
                  dir="ltr"
                  value={settings.prefix}
                  onChange={(e) => setSettings((s) => ({ ...s, prefix: e.target.value }))}
                  placeholder="سيبها فاضية"
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-ink dark:text-ink-dark">أقل طول للكود</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.minBarcodeLength}
                  onChange={(e) => setSettings((s) => ({ ...s, minBarcodeLength: Math.max(1, parseInt(e.target.value, 10) || 3) }))}
                  className={FIELD}
                />
              </label>
              <p className="col-span-2 text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
                البادئة بتتشال من أول الكود لو القارئ بيبعت رمز ثابت، وأقل طول بيتجاهل أي ضغطة مفتاح قصيرة بالغلط.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border p-3 text-xs text-ink dark:text-ink-dark leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-paid dark:text-paid-bright shrink-0 mt-0.5" />
              <span>
                القراءة شغالة حتى لو الكيبورد بيكتب عربي أو Caps Lock شغال، لأن النظام بيقرأ المفتاح الفيزيائي نفسه.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowModes((v) => !v)}
                aria-expanded={showModes}
                className="h-10 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark hover:border-brand/50 dark:hover:border-brand-bright/50 text-sm font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>نمط اتصال القارئ (معلومات)</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-ink-muted dark:text-ink-dark-muted transition-transform ${showModes ? 'rotate-180' : ''}`} />
              </button>
              {showModes && (
                <div className="flex flex-col gap-2 text-xs leading-relaxed">
                  <div className="p-3 rounded-lg bg-surface dark:bg-surface-dark-3 border-2 border-brand/40 dark:border-brand-bright/40 flex flex-col gap-1">
                    <span className="font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-paid dark:text-paid-bright" />
                      <span>محاكاة الكيبورد (USB HID) - المعتمد في رفيق</span>
                    </span>
                    <span className="text-ink-muted dark:text-ink-dark-muted">لا يحتاج تعريفات، والقارئ بيبعت الباركود كضغطات مفاتيح سريعة.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark flex flex-col gap-1">
                    <span className="font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1.5">
                      <Server className="w-4 h-4" />
                      <span>منفذ تسلسلي (USB Virtual COM / RS232)</span>
                    </span>
                    <span className="text-ink-muted dark:text-ink-dark-muted">للقارئات الصناعية. لو القارئ وقف عن الكتابة بعد تغييره، امسح باركود البرمجة &quot;USB HID Mode&quot; من كتالوج القارئ.</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="h-16 px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center">
            {savedSuccess ? (
              <span className="h-10 px-3 text-sm font-bold text-paid dark:text-paid-bright flex items-center gap-2 bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border rounded-lg">
                <CheckCircle className="w-4 h-4" />
                <span>تم حفظ إعدادات القارئ</span>
              </span>
            ) : (
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted truncate">
                نفس الإعدادات موجودة في: الإعدادات &gt; قارئ الباركود والاسكانر
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void requestClose()}
              className={`${FOOTER_BTN} bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2`}
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving || loading}
              className={`${FOOTER_BTN} bg-brand hover:bg-brand-hover text-white shadow-xs`}
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
