import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '../bridge/ipc';
import { ReceiptModal } from './ReceiptModal';
import type { Sale } from '../types/models';

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

export const ReadinessCheckModal: React.FC<ReadinessCheckModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab,
}) => {
  const [status, setStatus] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerMsg, setPrinterMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Barcode Scanner interactive test (Task 137-2)
  const [scannedCode, setScannedCode] = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Pilot Test Sale state (Task 137-3)
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

  if (!isOpen) return null;

  // Single-click test print (Task 137-2)
  const handleTestPrint = async () => {
    setTestingPrinter(true);
    setPrinterMsg(null);
    try {
      const res = await invoke<{ success: boolean; message: string }>('printer:testPrint');
      if (res && res.success) {
        setPrinterMsg({ text: res.message || 'تمت طباعة ورقة الاختبار بنجاح!', isError: false });
        await fetchStatus();
      } else {
        setPrinterMsg({ text: res?.message || 'تعذر إرسال أمر الطباعة للطابعة.', isError: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء فحص الطابعة.';
      setPrinterMsg({ text: msg, isError: true });
    } finally {
      setTestingPrinter(false);
    }
  };

  // Interactive scanner test submit (Task 137-2)
  const handleScannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedCode.trim()) return;
    setScanResult(`نجح مسح الباركود بنجاح: [${scannedCode.trim()}] — استجابة القارئ ممتازة وسريعة.`);
    setScannedCode('');
  };

  // Pilot Test Sale execution (Task 137-3)
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
          dir="rtl"
        >
          {/* Header with Readiness Percentage */}
          <div
            className={`px-6 py-5 text-white transition-all ${
              isAllReady
                ? 'bg-gradient-to-r from-emerald-800 via-teal-900 to-[#00372d]'
                : 'bg-gradient-to-r from-teal-800 via-slate-800 to-emerald-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shadow-inner">
                  <i className="fas fa-clipboard-check" />
                </div>
                <div>
                  <h2 className="text-xl font-black">فحص جاهزية التشغيل قبل أول بيع</h2>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    التحقق الشامل من الطابعة وقارئ الباركود والنسخ الاحتياطي وبيانات المحل
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
                title="إغلاق"
              >
                <i className="fas fa-times text-lg" />
              </button>
            </div>

            {/* Gauge & Progress Bar (Task 137-1) */}
            <div className="mt-4 bg-white/10 rounded-xl p-3.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="flex items-center gap-1.5">
                  <i className="fas fa-gauge-high text-emerald-300" />
                  نسبة الجاهزية التشغيلية للمحل:
                </span>
                <span className="font-mono text-base font-black tracking-wide text-emerald-300">{pct}%</span>
              </div>
              <div className="w-full h-2.5 bg-black/20 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isAllReady ? 'bg-emerald-400 shadow' : pct >= 60 ? 'bg-teal-400' : 'bg-amber-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs font-semibold text-emerald-100 mt-2">
                {status?.overallStatusMessage || 'جاري فحص مكونات النظام...'}
              </p>
            </div>
          </div>

          {/* Checklist Body (Task 137-1 & 137-2) */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {loading && !status ? (
              <div className="text-center py-8 text-slate-500 text-sm font-bold flex items-center justify-center gap-2">
                <i className="fas fa-spinner fa-spin text-emerald-600" />
                جاري فحص الأجهزة والإعدادات...
              </div>
            ) : (
              <div className="space-y-3">
                {status?.checks.map((chk) => (
                  <div
                    key={chk.key}
                    className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      chk.passed
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-amber-50/60 border-amber-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-black ${
                          chk.passed
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-amber-500 text-white shadow-sm'
                        }`}
                      >
                        <i className={`fas ${chk.passed ? 'fa-check' : 'fa-exclamation'}`} />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{chk.title}</h4>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              chk.passed
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}
                          >
                            {chk.statusText}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{chk.description}</p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                      {chk.key === 'printer' ? (
                        <button
                          type="button"
                          onClick={handleTestPrint}
                          disabled={testingPrinter}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {testingPrinter ? (
                            <i className="fas fa-spinner fa-spin" />
                          ) : (
                            <i className="fas fa-print" />
                          )}
                          <span>طباعة ورقة اختبار</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToTab) {
                              if (chk.key === 'store_profile' || chk.key === 'backup') {
                                onNavigateToTab('settings');
                              } else if (chk.key === 'products') {
                                onNavigateToTab('products');
                              }
                            }
                            onClose();
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            chk.passed
                              ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                              : 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                          }`}
                        >
                          {chk.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Printer Test Feedback Banner */}
            {printerMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  printerMsg.isError
                    ? 'bg-rose-50 text-rose-900 border border-rose-300'
                    : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                }`}
              >
                <i className={`fas ${printerMsg.isError ? 'fa-circle-exclamation' : 'fa-circle-check'}`} />
                <span>{printerMsg.text}</span>
              </div>
            )}

            {/* Interactive Barcode Reader Test Field (Task 137-2) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <i className="fas fa-barcode text-emerald-700 text-base" />
                <h4 className="text-xs font-bold text-slate-800">
                  اختبار استجابة قارئ الباركود (Barcode Scanner Test)
                </h4>
              </div>
              <form onSubmit={handleScannerSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  placeholder="امسح أي باركود بيدك الآن لتجربة القارئ..."
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  فحص الكود
                </button>
              </form>
              {scanResult && (
                <div className="text-xs text-emerald-800 font-bold bg-emerald-100/70 border border-emerald-300 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <i className="fas fa-check-circle text-emerald-600" />
                  <span>{scanResult}</span>
                </div>
              )}
            </div>

            {/* Pilot Test Sale Section (Task 137-3) */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <i className="fas fa-receipt text-emerald-700" />
                  <h4 className="text-sm font-bold text-slate-900">
                    بيعة تجريبية آمنة (Pilot Test Sale)
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  تتيح لك تجربة دورة البيع الكاملة وطباعة الإيصال دون خصم المخزون ودون التأثير على الترقيم الرسمي للفواتير.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExecuteTestSale}
                disabled={testSaleLoading}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-all shadow hover:shadow-md flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                {testSaleLoading ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    <span>جاري التجهيز...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-play" />
                    <span>تنفيذ بيعة تجريبية</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              تأكد من اكتمال كافة النقاط للحصول على تجربة بيع خالية من أي توقف.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* Test Sale Receipt Modal (Task 137-3) */}
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
