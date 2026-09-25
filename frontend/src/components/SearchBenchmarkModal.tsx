import React, { useState } from 'react';
import { Zap, CheckCircle2, XCircle, Clock, ShieldCheck, Play, X, Loader2, Barcode } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { SearchBenchmarkResult } from '../types/models';

interface SearchBenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchBenchmarkModal: React.FC<SearchBenchmarkModalProps> = ({ isOpen, onClose }) => {
  const [running, setRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<SearchBenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-xl border hairline-all shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden text-right animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 bg-surface-2 hairline-b flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded hover:bg-surface-3 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-ink">فحص سرعة البحث وقارئ الباركود (Task 22-5)</h2>
              <p className="text-[12px] text-ink-muted">قياس الاستجابة على 5000 صنف وتوحيد الحروف العربية</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Intro Card */}
          <div className="p-4 rounded-lg bg-surface-2/60 border hairline-all text-[13px] leading-relaxed text-ink-muted">
            <p>
              يقوم هذا الاختبار بإنشاء وفهرسة <span className="font-bold text-ink">5000 منتج متنوع</span> في قاعدة البيانات، وقياس متوسط زمن استجابة البحث بالباركود والاسم بجزء من الكلمة، والتحقق التام من توحيد الحروف العربية (أ/إ/آ ← ا، ة ← ه، ى ← ي، وحذف التشكيل)، ومحاكاة سرعة قارئ الباركود الواقعي.
            </p>
            <div className="mt-2 text-[12px] text-brand font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>معيار القبول الصارم (SLA): الاستجابة الفورية في أقل من 100 مللي ثانية (&lt; 0.1 ثانية)</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-danger-soft border border-danger-border text-danger text-[13px] rounded-lg flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {benchmarkResult && (
            <div className="space-y-4">
              {/* KPI Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-surface-2 rounded-lg border hairline-all text-center">
                  <div className="text-[11px] font-bold text-ink-muted mb-1 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-brand" />
                    <span>متوسط زمن البحث</span>
                  </div>
                  <div className="text-[20px] font-mono font-bold text-brand">
                    {avgLatency.toFixed(2)} ms
                  </div>
                  <div className="text-[10px] text-paid font-semibold mt-0.5">
                    {meetsSla ? '✅ أقل من 100ms (فائق السرعة)' : '⚠️ بطيء'}
                  </div>
                </div>

                <div className="p-3 bg-surface-2 rounded-lg border hairline-all text-center">
                  <div className="text-[11px] font-bold text-ink-muted mb-1 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
                    <span>توحيد الحروف العربية</span>
                  </div>
                  <div className="text-[18px] font-bold text-ink">
                    {normPassed ? 'ناجح 100%' : 'فشل'}
                  </div>
                  <div className="text-[10px] text-ink-muted mt-0.5">
                    الهمزات والتاء والتشكيل
                  </div>
                </div>

                <div className="p-3 bg-surface-2 rounded-lg border hairline-all text-center">
                  <div className="text-[11px] font-bold text-ink-muted mb-1 flex items-center justify-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-brand" />
                    <span>محاكاة قارئ الباركود</span>
                  </div>
                  <div className="text-[18px] font-bold text-ink">
                    {scanPassed ? 'استجابة فورية' : 'غير مكتمل'}
                  </div>
                  <div className="text-[10px] text-paid font-semibold mt-0.5">
                    إدخال سريع &lt; 50ms
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              <div className={`p-3 rounded-lg border flex items-center gap-2.5 text-[13px] font-bold ${
                isSuccess 
                  ? 'bg-paid-soft border-paid-border text-paid'
                  : 'bg-danger-soft border-danger-border text-danger'
              }`}>
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 shrink-0" />
                )}
                <span>
                  {isSuccess 
                    ? `اجتاز النظام جميع معايير الأداء والسرعة بنجاح فائق على ${totalCount} صنف!`
                    : 'لم يجتز النظام أحد معايير الأداء المحددة.'}
                </span>
              </div>

              {/* Detailed Test Logs */}
              <div>
                <h4 className="text-[12px] font-bold text-ink-muted mb-2">سجل الخطوات والتحقق الآلي:</h4>
                <div className="bg-canvas border hairline-all rounded-lg p-3 space-y-1.5 max-h-[160px] overflow-y-auto text-[11px] font-mono text-ink">
                  {testLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-ink-muted">›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-surface-2 hairline-t flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border hairline-all text-[13px] font-bold text-ink hover:bg-surface-3 transition-colors"
          >
            إغلاق
          </button>
          
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري توليد وفحص 5000 صنف...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>{benchmarkResult ? 'إعادة تشغيل الفحص' : 'بدء فحص 5000 صنف الآن'}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
