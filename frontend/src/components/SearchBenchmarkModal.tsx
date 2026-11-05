import React, { useState } from 'react';
import { Zap, CheckCircle2, XCircle, Clock, ShieldCheck, Play, X, Loader2, Barcode } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import type { SearchBenchmarkResult } from '../types/models';

interface SearchBenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchBenchmarkModal: React.FC<SearchBenchmarkModalProps> = ({ isOpen, onClose }) => {
  const [running, setRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<SearchBenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !running,
    onDismiss: onClose,
    isDirty: false,
  });

  const handleRun = async () => {
    try {
      setRunning(true);
      setError(null);
      const res = await invoke<SearchBenchmarkResult>('search:runBenchmark', {
        productCount: 5000,
        queryIterations: 100
      }, 40000);
      setBenchmarkResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const avgLatency = Number(benchmarkResult?.averageSearchLatencyMs ?? (benchmarkResult as any)?.AverageSearchLatencyMs ?? 0);
  const meetsSla = Boolean(benchmarkResult?.meetsSlaUnder100ms ?? (benchmarkResult as any)?.MeetsSlaUnder100ms);
  const normPassed = Boolean(benchmarkResult?.normalizationTestsPassed ?? (benchmarkResult as any)?.NormalizationTestsPassed);
  const scanPassed = Boolean(benchmarkResult?.scannerSimulationPassed ?? (benchmarkResult as any)?.ScannerSimulationPassed);
  const isSuccess = Boolean(benchmarkResult?.success ?? (benchmarkResult as any)?.Success);
  const totalCount = Number(benchmarkResult?.totalProductsTested ?? (benchmarkResult as any)?.TotalProductsTested ?? 5000);
  const testLogs: string[] = Array.isArray(benchmarkResult?.testLog) 
    ? benchmarkResult.testLog 
    : (Array.isArray((benchmarkResult as any)?.TestLog) ? (benchmarkResult as any).TestLog : []);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark hairline-all shadow-2xl max-w-4xl max-h-[90vh] w-full flex flex-col overflow-hidden text-right animate-in fade-in zoom-in-95 duration-150 text-ink dark:text-ink-dark"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-6 py-4 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark hairline-b flex items-center justify-between">
          <button
            onClick={requestClose}
            className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-1 rounded hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark">فحص سرعة البحث وقارئ الباركود (Benchmark)</h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">قياس سرعة استجابة البحث على 5000 صنف وتوحيد الحروف العربي</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] bg-surface dark:bg-surface-dark">
          {/* Intro Card */}
          <div className="p-4 rounded-lg bg-surface-2/60 dark:bg-surface-dark-2 border border-line dark:border-line-dark hairline-all text-sm leading-relaxed text-ink-muted dark:text-ink-dark-muted">
            <p>
              الاختبار ده بيعمل ويفهرس <span className="font-bold text-ink dark:text-ink-dark">5000 صنف متنوع</span> في قاعدة البيانات، ويقيس سرعة البحث بالباركود والاسم بجزء من الكلمة، ويتأكد إن توحيد الحروف العربي شغال تمام (أ/إ/آ ← ا، ة ← ه، ى ← ي، وحذف التشكيل)، ويحاكي سرعة قارئ الباركود الواقعي.
            </p>
            <div className="mt-2 text-xs text-brand dark:text-brand-bright font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>معيار السرعة: استجابة فورية في أقل من 100 مللي ثانية (&lt; 0.1 ثانية)</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger/30 text-danger dark:text-danger-bright text-sm rounded-lg flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {benchmarkResult && (
            <div className="space-y-4">
              {/* KPI Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark hairline-all text-center">
                  <div className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                    <span>متوسط زمن البحث</span>
                  </div>
                  <div className="text-xl font-mono font-bold text-brand dark:text-brand-bright">
                    {avgLatency.toFixed(2)} ms
                  </div>
                  <div className="text-micro text-paid dark:text-paid-bright font-semibold mt-0.5">
                    {meetsSla ? 'أقل من 100ms (فائق السرعة)' : 'بطيء'}
                  </div>
                </div>

                <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark hairline-all text-center">
                  <div className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                    <span>توحيد الحروف العربي</span>
                  </div>
                  <div className="text-lg font-bold text-ink dark:text-ink-dark">
                    {normPassed ? 'ناجح 100%' : 'فشل'}
                  </div>
                  <div className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5">
                    الهمزات والتاء والتشكيل
                  </div>
                </div>

                <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark hairline-all text-center">
                  <div className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 flex items-center justify-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                    <span>محاكاة قارئ الباركود</span>
                  </div>
                  <div className="text-lg font-bold text-ink dark:text-ink-dark">
                    {scanPassed ? 'استجابة فورية' : 'غير مكتمل'}
                  </div>
                  <div className="text-micro text-paid dark:text-paid-bright font-semibold mt-0.5">
                    إدخال سريع &lt; 50ms
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              <div className={`p-3 rounded-lg border flex items-center gap-2.5 text-sm font-bold ${
                isSuccess 
                  ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright'
                  : 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger/30 text-danger dark:text-danger-bright'
              }`}>
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 shrink-0" />
                )}
                <span>
                  {isSuccess 
                    ? `اجتاز النظام كل اختبارات السرعة على ${totalCount} صنف`
                    : 'النظام مجتازش أحد اختبارات السرعة المحددة.'}
                </span>
              </div>

              {/* Detailed Test Logs */}
              <div>
                <h4 className="t-label text-ink-muted dark:text-ink-dark-muted mb-2">سجل الخطوات والفحص الآلي:</h4>
                <div className="bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark hairline-all rounded-lg p-3 space-y-1.5 max-h-[160px] overflow-y-auto text-micro font-mono text-ink dark:text-ink-dark">
                  {testLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-ink-muted dark:text-ink-dark-muted">›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark hairline-t flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-line dark:border-line-dark hairline-all text-sm font-bold text-ink dark:text-ink-dark hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
          >
            إغلاق
          </button>
          
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2 rounded-lg bg-brand dark:bg-brand-container hover:bg-brand-hover dark:hover:bg-brand disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري توليد وفحص 5000 صنف...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>{benchmarkResult ? 'إعادة تشغيل الفحص' : 'بدء فحص 5000 صنف دلوقتي'}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
