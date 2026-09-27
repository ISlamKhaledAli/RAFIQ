import { 
  Sliders, 
  Activity, 
  Printer, 
  Database, 
  Zap, 
  Gauge, 
  Cpu, 
  Layers, 
  Package, 
  ShieldCheck, 
  ToggleLeft, 
  ToggleRight 
} from 'lucide-react';
import type { SystemInfo } from '../../App';

interface SystemDiagnosticsTabProps {
  sysInfo?: SystemInfo | null;
  flags: Record<string, boolean>;
  toggleFlag: (key: string, enabled: boolean) => Promise<void>;
  diagnosticsLoading: boolean;
  diagnosticResult: string | null;
  setDiagnosticResult: (res: string | null) => void;
  runPrinterTest: () => Promise<void>;
  runSqliteTest: () => Promise<void>;
  runPingTest: () => Promise<void>;
  runBenchmarkTest: () => void;
  supportLoading: boolean;
  supportMessage: string | null;
  setSupportMessage: (msg: string | null) => void;
  runCreateSupportBundle: () => Promise<void>;
}

export const SystemDiagnosticsTab = ({
  sysInfo,
  flags,
  toggleFlag,
  diagnosticsLoading,
  diagnosticResult,
  setDiagnosticResult,
  runPrinterTest,
  runSqliteTest,
  runPingTest,
  runBenchmarkTest,
  supportLoading,
  supportMessage,
  setSupportMessage,
  runCreateSupportBundle,
}: SystemDiagnosticsTabProps) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Feature Toggles Section (Feature #105: ملف تعريف المحل ومفاتيح تشغيل الميزات) */}
      <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-brand" />
            <h3 className="text-[13px] font-bold text-ink m-0">ملف تعريف المحل ومفاتيح الميزات (Feature Toggles)</h3>
          </div>
          <span className="text-[11px] text-ink-muted font-sans">تخصيص النظام حسب نوع ونشاط المحل</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              key: 'feature_fast_buttons',
              title: 'شبكة الأصناف السريعة (Fast Picks)',
              description: 'عرض قائمة بالأصناف الشائعة بدون باركود (خبز، خضار، منتجات يومية) على شاشة البيع السريع.',
            },
            {
              key: 'feature_credit_debts',
              title: 'نظام البيع الآجل ودفتر ديون العملاء',
              description: 'تسجيل المبيعات على الحساب، ومتابعة كشف الحساب والحد الائتماني لكل عميل.',
            },
            {
              key: 'feature_taxes',
              title: 'منظومة الضرائب والجاهزية للإيصال الإلكتروني',
              description: 'حساب ضريبة القيمة المضافة وإظهار حقول كود التصنيف الضريبي GS1/EGS للأصناف.',
            },
          ].map((feat) => {
            const isEnabled = flags[feat.key] ?? false;
            return (
              <div
                key={feat.key}
                onClick={() => void toggleFlag(feat.key, !isEnabled)}
                className={`p-3 rounded border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isEnabled
                    ? 'bg-brand-soft/40 border-brand/30 hover:border-brand'
                    : 'bg-surface-2 border-line hover:border-line-hover opacity-75'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-[12.5px]">{feat.title}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        isEnabled
                          ? 'bg-paid-soft text-paid border-paid-border'
                          : 'bg-surface text-ink-muted border-line'
                      }`}
                    >
                      {isEnabled ? 'مفعل' : 'معطل'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
                    {feat.description}
                  </p>
                </div>

                <div className="shrink-0 pt-0.5">
                  {isEnabled ? (
                    <ToggleRight className="w-6 h-6 text-brand" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-ink-muted" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Maintenance & System Diagnostics Section */}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => void runPrinterTest()}
            disabled={diagnosticsLoading}
            className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
          >
            <Printer className="w-4 h-4 text-brand" />
            <span>اختبار الطابعة</span>
          </button>

          <button
            type="button"
            onClick={() => void runSqliteTest()}
            disabled={diagnosticsLoading}
            className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
          >
            <Database className="w-4 h-4 text-paid" />
            <span>المعاملة الذرية</span>
          </button>

          <button
            type="button"
            onClick={() => void runPingTest()}
            disabled={diagnosticsLoading}
            className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
          >
            <Zap className="w-4 h-4 text-amber-600" />
            <span>سرعة الجسر (IPC)</span>
          </button>

          <button
            type="button"
            onClick={runBenchmarkTest}
            disabled={diagnosticsLoading}
            className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
          >
            <Gauge className="w-4 h-4 text-blue-600" />
            <span>اختبار الأداء والحمل</span>
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

        {/* Support Bundle Section (Feature #111) */}
        <div className="mt-2 p-3 rounded bg-surface-2 hairline-all flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-brand" />
              <span className="font-bold text-ink text-[12px]">حزمة معلومات الدعم الفني وسجل الأخطاء</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-paid font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>محمية: خالية تماماً من بيانات العملاء</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            عند مواجهة أي استفسار أو مشكلة تقنية، انقر على الزر لتوليد ملف مضغوط آمن على سطح المكتب يحتوي على سجل الأخطاء الفنية ومواصفات النظام لإرساله لفريق الدعم.
          </p>

          {supportMessage && (
            <div className="p-2.5 rounded bg-brand-soft border border-brand/30 text-ink text-[11px] flex items-center justify-between whitespace-pre-line">
              <span>{supportMessage}</span>
              <button
                onClick={() => setSupportMessage(null)}
                className="text-ink-muted hover:text-ink text-xs mr-2"
              >
                ✕
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void runCreateSupportBundle()}
            disabled={supportLoading}
            className="h-[38px] bg-brand hover:bg-brand-hover text-white rounded font-bold flex items-center justify-center gap-2 transition-colors text-[12px]"
          >
            <Package className="w-4 h-4" />
            <span>{supportLoading ? 'جاري تجهيز حزمة الدعم...' : 'جمع معلومات للدعم الفني (Support Bundle)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
