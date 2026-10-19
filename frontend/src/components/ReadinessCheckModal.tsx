import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  Printer,
  Barcode,
  HardDrive,
  Store,
  Play,
  RotateCw,
  Sparkles,
  X,
  ShieldCheck,
  Zap,
  PackageCheck
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Sale } from '../types/models';
import { ReceiptModal } from './ReceiptModal';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface ReadinessCheckItem {
  key: string;
  title: string;
  passed: boolean;
  statusText: string;
  description: string;
  actionLabel: string;
  actionTarget: string;
}

interface ReadinessStatus {
  isReadyToSell: boolean;
  totalChecks: number;
  passedChecks: number;
  readinessPercentage: number;
  overallStatusMessage: string;
  checks: ReadinessCheckItem[];
}

interface ReadinessCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
}

// Helper to format any date or timestamp cleanly in Arabic
function formatCleanDate(str: string | undefined): string {
  if (!str) return '---';
  if (str.includes('(') && str.includes(')')) {
    // If it has something like "محفوظة (2026-09-25T...)" or "سليمة (...)"
    const match = str.match(/\((.*?)\)/);
    if (match && match[1]) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) {
        const time = parsed.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
        return str.replace(match[0], `(اليوم ${time})`);
      }
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  }
  return str;
}

export const ReadinessCheckModal: React.FC<ReadinessCheckModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab,
}) => {
  const [status, setStatus] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerMsg, setPrinterMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Barcode Scanner interactive test
  const [scannedCode, setScannedCode] = useState('');
  const [lastScannedItem, setLastScannedItem] = useState<{ code: string; time: string } | null>(null);

  // Pilot Test Sale state
  const [testSaleLoading, setTestSaleLoading] = useState(false);
  const [testSaleData, setTestSaleData] = useState<Sale | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await invoke<ReadinessStatus>('readiness:getStatus');
      if (res) {
        setStatus(res);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      void (async () => {
        try {
          const res = await invoke<ReadinessStatus>('readiness:getStatus');
          if (active && res) {
            setStatus(res);
          }
        } catch {
          // ignore
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Single-click test print
  const handleTestPrint = async () => {
    setTestingPrinter(true);
    setPrinterMsg(null);
    try {
      const res = await invoke<{ success: boolean; message: string }>('printer:testPrint');
      if (res && res.success) {
        setPrinterMsg({ text: res.message || 'تمت طباعة ورقة الاختبار بنجاح على طابعة الكاشير!', isError: false });
        await fetchStatus();
      } else {
        setPrinterMsg({ text: res?.message || 'تعذر إرسال أمر الطباعة للطابعة المحددة.', isError: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء فحص الطابعة.';
      setPrinterMsg({ text: msg, isError: true });
    } finally {
      setTestingPrinter(false);
    }
  };

  // Interactive scanner test submit
  const handleScannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scannedCode.trim();
    if (!code) return;
    const nowTime = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastScannedItem({ code, time: nowTime });
    setScannedCode('');
  };

  // Pilot Test Sale execution
  const handleExecuteTestSale = async () => {
    setTestSaleLoading(true);
    try {
      const res = await invoke<Sale>('readiness:processTestSale');
      if (res) {
        setTestSaleData(res);
        setIsReceiptModalOpen(true);
      }
    } catch {
      // Non-blocking
    } finally {
      setTestSaleLoading(false);
    }
  };

  const pct = status ? status.readinessPercentage : 0;
  const isAllReady = pct === 100;

  // Icon selector per check key
  const getCheckIcon = (key: string) => {
    switch (key) {
      case 'store_profile':
        return <Store className="w-5 h-5 text-emerald-600" />;
      case 'printer':
        return <Printer className="w-5 h-5 text-emerald-600" />;
      case 'scanner':
        return <Barcode className="w-5 h-5 text-emerald-600" />;
      case 'backup':
        return <HardDrive className="w-5 h-5 text-emerald-600" />;
      case 'products':
        return <PackageCheck className="w-5 h-5 text-emerald-600" />;
      case 'os_environment':
      case 'storage_permissions':
      case 'root_security':
      default:
        return <ShieldCheck className="w-5 h-5 text-emerald-600" />;
    }
  };

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !loading && !isReceiptModalOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-fadeIn"
        onClick={handleBackdropClick}
      >
        <div
          className="bg-surface dark:bg-surface-dark rounded-3xl shadow-2xl border border-line dark:border-line-dark w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. HERO LAUNCHPAD HEADER */}
          <div className="relative px-7 py-6 bg-gradient-to-br from-[#00372d] via-[#004d3e] to-[#002820] text-white overflow-hidden shrink-0">
            {/* Ambient background glows */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 left-10 w-64 h-64 bg-teal-400/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner shrink-0">
                  <ClipboardCheck className="w-7 h-7 text-emerald-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      لوحة التحقق الشامل
                    </span>
                    <span className="text-xs text-emerald-200/70 font-mono">Rafiq Pre-Flight</span>
                  </div>
                  <h2 className="text-xl font-black text-white mt-1">جاهزية نقطة البيع والتشغيل</h2>
                  <p className="text-xs text-emerald-100/80 mt-0.5">
                    التحقق التلقائي من سلامة الطابعة، قارئ الباركود، النسخ الاحتياطي، وبيانات المتجر
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={requestClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/15"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Readiness Gauge / Progress Banner */}
            <div className="mt-5 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${isAllReady ? 'bg-paid-bright animate-ping' : 'bg-warn-bright'}`} />
                  <span className="text-xs font-bold text-emerald-100">
                    مؤشر الجاهزية التشغيلية العام:
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono text-emerald-300">{pct}%</span>
                  <span className="text-xs text-emerald-200 font-bold">{isAllReady ? 'مكتمل' : 'يحتاج فحص'}</span>
                </div>
              </div>

              {/* Progress track */}
              <div className="w-full h-3 bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/10">
                <div
                  className={`h-full transition-all duration-700 rounded-full shadow-sm ${
                    isAllReady 
                      ? 'bg-gradient-to-r from-paid-bright to-brand-bright' 
                      : pct >= 60 
                      ? 'bg-gradient-to-r from-brand-bright to-paid-bright' 
                      : 'bg-gradient-to-r from-warn-bright to-danger-bright'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2.5 text-xs">
                <span className="text-emerald-100 font-medium">
                  {status?.overallStatusMessage || 'جاري التأكد من كافة مكونات الكاشير...'}
                </span>
                <span className="text-emerald-300 font-bold font-mono">
                  {status ? `${status.passedChecks} من ${status.totalChecks} بنود سليمة` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* 2. MAIN CHECKLIST WORKSTATION */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-canvas dark:bg-canvas-dark">
            {loading && !status ? (
              <div className="text-center py-12 text-ink-muted dark:text-ink-dark-muted text-sm font-bold flex flex-col items-center justify-center gap-3">
                <RotateCw className="w-8 h-8 animate-spin text-paid dark:text-paid-bright" />
                <span>جاري فحص اتصال الأجهزة وقاعدة البيانات...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {status?.checks.map((chk) => {
                  const isSuccess = chk.passed;
                  const cleanStatus = formatCleanDate(chk.statusText);
                  return (
                    <div
                      key={chk.key}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex items-start justify-between gap-4 ${
                        isSuccess
                          ? 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-paid/40 shadow-xs'
                          : 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 hover:border-warn-bright/50 shadow-xs'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isSuccess
                              ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid/30 text-paid dark:text-paid-bright'
                              : 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
                          }`}
                        >
                          {getCheckIcon(chk.key)}
                        </div>

                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h4 className="text-sm font-black text-ink dark:text-ink-dark">{chk.title}</h4>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                isSuccess
                                  ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30'
                                  : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30'
                              }`}
                            >
                              {isSuccess ? <CheckCircle2 className="w-3 h-3 text-paid dark:text-paid-bright" /> : <AlertCircle className="w-3 h-3 text-warn dark:text-warn-bright" />}
                              <span>{cleanStatus}</span>
                            </span>
                          </div>
                          <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed font-normal">{chk.description}</p>
                        </div>
                      </div>

                      {/* Action trigger button */}
                      <div className="shrink-0 flex items-center pt-1">
                        {chk.key === 'printer' ? (
                          <button
                            type="button"
                            onClick={handleTestPrint}
                            disabled={testingPrinter}
                            className="px-3.5 py-2 bg-brand hover:bg-brand-dark active:bg-brand-darker text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            <Printer className={`w-3.5 h-3.5 ${testingPrinter ? 'animate-bounce' : ''}`} />
                            <span>{testingPrinter ? 'جاري الطباعة...' : 'طباعة ورقة اختبار'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigateToTab) {
                                if (chk.key === 'store_profile' || chk.key === 'backup' || chk.key === 'os_environment' || chk.key === 'storage_permissions' || chk.key === 'root_security') {
                                  onNavigateToTab('settings');
                                } else if (chk.key === 'products') {
                                  onNavigateToTab('products');
                                }
                              }
                              onClose();
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer ${
                              isSuccess
                                ? 'bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark border border-line dark:border-line-dark'
                                : 'bg-warn hover:bg-warn-dark text-white shadow-sm'
                            }`}
                          >
                            {chk.actionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Printer Test Feedback Toast */}
            {printerMsg && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 transition-all ${
                  printerMsg.isError
                    ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30 shadow-xs'
                    : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/30 shadow-xs'
                }`}
              >
                {printerMsg.isError ? (
                  <AlertCircle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
                )}
                <span>{printerMsg.text}</span>
              </div>
            )}

            {/* 3. INTERACTIVE BARCODE SCANNER TEST DOCK */}
            <div className="bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
                    <Barcode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-ink dark:text-ink-dark">
                      منصة فحص استجابة قارئ الباركود (الماسح الضوئي)
                    </h4>
                    <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-normal">
                      وجّه القارئ وامسح أي سلعة بيدك الآن لتجربة سرعة الالتقاط الفورية
                    </span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-surface-2 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark font-mono">
                  USB HID Wedge
                </span>
              </div>

              <form onSubmit={handleScannerSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={scannedCode}
                    onChange={(e) => setScannedCode(e.target.value)}
                    placeholder="امسح الباركود الآن أو اكتب كوداً للتجربة..."
                    className="w-full pl-3 pr-9 py-2.5 bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-ink dark:text-ink-dark placeholder-ink-muted/50 focus:bg-surface dark:focus:bg-surface-dark focus:outline-none focus:border-brand transition-all"
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
                    <Zap className="w-4 h-4 text-brand dark:text-brand-bright" />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  فحص الكود
                </button>
              </form>

              {lastScannedItem && (
                <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/30 p-3 rounded-xl flex items-center justify-between text-xs animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-paid text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-ink-dark">تمت قراءة الباركود بنجاح تام: </span>
                      <span className="font-mono font-black text-paid dark:text-paid-bright text-sm">{lastScannedItem.code}</span>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-paid dark:text-paid-bright font-semibold">{lastScannedItem.time}</span>
                </div>
              )}
            </div>

            {/* 4. PILOT SAFE TEST SALE SECTION */}
            <div className="bg-gradient-to-br from-brand-soft/60 via-paid-soft/40 to-surface dark:from-brand-dark-soft/60 dark:via-paid-dark-soft/40 dark:to-surface-dark-2 border border-brand/20 dark:border-brand-bright/30 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-paid text-white flex items-center justify-center shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-black text-ink dark:text-ink-dark">
                    بيعة تجريبية آمنة (Pilot Test Sale)
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/30">
                    آمنة 100%
                  </span>
                </div>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed font-normal">
                  تتيح لك تجربة دورة البيع الكاملة وطباعة الإيصال الفعلي دون خصم أي رصيد من المخزن ودون أي تأثير على الحسابات أو أرقام الفواتير.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExecuteTestSale}
                disabled={testSaleLoading}
                className="px-4 py-2.5 bg-paid hover:bg-paid-dark active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow hover:shadow-md flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {testSaleLoading ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري التجهيز...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>تنفيذ بيعة تجريبية</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 5. FOOTER */}
          <div className="bg-surface dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-7 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted font-medium">
              <ShieldCheck className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
              <span>نظام رفيق مصمم للاستقرار التام ويعمل محلياً (Offline-First) بدون إنترنت.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-black text-ink dark:text-ink-dark bg-surface-2 dark:bg-surface-dark-3 hover:bg-surface-3 dark:hover:bg-surface-dark border border-line dark:border-line-dark rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      </div>

      {/* Test Sale Receipt Modal */}
      {isReceiptModalOpen && testSaleData && (
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          sale={testSaleData}
          onClose={() => setIsReceiptModalOpen(false)}
        />
      )}
    </>
  );
};
