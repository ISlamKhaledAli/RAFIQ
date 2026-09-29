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
  X,
  PhoneCall
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
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
    <div className="flex flex-col gap-5 text-xs text-[#14181a]">
      {/* Feature Toggles Section (Feature #105: ملف تعريف المحل ومفاتيح تشغيل الميزات) */}
      <div className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4 text-[#0b4f42]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#14181a] m-0">ملف تعريف المحل ومفاتيح الميزات (Feature Toggles)</h3>
              <span className="text-[11px] text-[#5b6664]">تخصيص النظام حسب نوع ونشاط المحل واحتياجات العمل اليومية</span>
            </div>
          </div>
          <span className="text-[11px] text-[#0b4f42] bg-[#0b4f42]/10 font-bold px-2 py-0.5 rounded">نظام تركيبي مرن</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
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
              title: 'منظومة الضرائب والجاهزية للإيصال',
              description: 'حساب ضريبة القيمة المضافة وإظهار حقول كود التصنيف الضريبي GS1/EGS للأصناف.',
            },
          ].map((feat) => {
            const isEnabled = flags[feat.key] ?? false;
            return (
              <div
                key={feat.key}
                onClick={() => void toggleFlag(feat.key, !isEnabled)}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isEnabled
                    ? 'bg-[#0b4f42]/5 border-[#0b4f42]/40 shadow-xs'
                    : 'bg-[#f7f8f6] border-[#dce1dc] hover:border-[#b5c0b7] opacity-85'
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#14181a] text-xs">{feat.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isEnabled
                          ? 'bg-[#eaf5ee] text-[#1b7a4d] border-[#c4e3d0]'
                          : 'bg-white text-[#5b6664] border-[#dce1dc]'
                      }`}
                    >
                      {isEnabled ? 'مفعّل' : 'معطّل'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
                    {feat.description}
                  </p>
                </div>

                <div className="flex justify-end pt-1 border-t border-[#dce1dc]/50">
                  <ToggleSwitch
                    checked={isEnabled}
                    onChange={(next) => void toggleFlag(feat.key, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Maintenance & System Diagnostics Section */}
      <div className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
              <Activity className="w-4 h-4 text-[#0b4f42]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#14181a] m-0">صيانة النظام وفحص الأجهزة</h3>
              <p className="text-[11px] text-[#5b6664] m-0">فحص سلامة قاعدة البيانات، وسرعة استجابة الجسر (IPC)، وكفاءة الطباعة</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-[#1b7a4d] bg-[#eaf5ee] border border-[#c4e3d0] font-bold px-2.5 py-1 rounded">
            SQLite WAL Active
          </span>
        </div>

        {/* Diagnostic Message Toast */}
        {diagnosticResult && (
          <div className="p-3 rounded-lg bg-[#f7f8f6] border border-[#dce1dc] text-[#14181a] font-mono text-xs flex items-center justify-between">
            <span>{diagnosticResult}</span>
            <button 
              onClick={() => setDiagnosticResult(null)}
              className="text-[#5b6664] hover:text-[#14181a] p-1 rounded hover:bg-black/5 cursor-pointer flex items-center justify-center shrink-0 mr-2"
              title="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => void runPrinterTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-[#f7f8f6] hover:bg-[#ebeef1] border border-[#dce1dc] text-[#14181a] rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4 text-[#0b4f42]" />
            <span>اختبار الطابعة</span>
          </button>

          <button
            type="button"
            onClick={() => void runSqliteTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-[#f7f8f6] hover:bg-[#ebeef1] border border-[#dce1dc] text-[#14181a] rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Database className="w-4 h-4 text-[#1b7a4d]" />
            <span>المعاملة الذرية</span>
          </button>

          <button
            type="button"
            onClick={() => void runPingTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-[#f7f8f6] hover:bg-[#ebeef1] border border-[#dce1dc] text-[#14181a] rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Zap className="w-4 h-4 text-amber-600" />
            <span>سرعة الجسر (IPC)</span>
          </button>

          <button
            type="button"
            onClick={runBenchmarkTest}
            disabled={diagnosticsLoading}
            className="h-11 bg-[#f7f8f6] hover:bg-[#ebeef1] border border-[#dce1dc] text-[#14181a] rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Gauge className="w-4 h-4 text-blue-600" />
            <span>اختبار الأداء والحمل</span>
          </button>
        </div>

        {/* Technical Specs Strip */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#dce1dc] text-xs font-mono text-[#5b6664]">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#f7f8f6] border border-[#dce1dc]">
            <Cpu className="w-4 h-4 text-[#0b4f42] shrink-0" />
            <span className="truncate">{sysInfo?.osVersion ? sysInfo.osVersion.split(' ')[0] : 'Windows'}</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#f7f8f6] border border-[#dce1dc]">
            <Layers className="w-4 h-4 text-[#1b7a4d] shrink-0" />
            <span className="truncate">{sysInfo?.isWebView2 ? 'Fixed 109' : 'Chrome/Edge'}</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#f7f8f6] border border-[#dce1dc]">
            <Database className="w-4 h-4 text-[#0b4f42] shrink-0" />
            <span className="truncate">Integer Piasters (قروش)</span>
          </div>
        </div>

        {/* Developer & Copyright Info */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-[#dce1dc] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">المطور والناشر:</span>
            <span className="font-bold text-[#006d41]">ISlam Khaled Ali</span>
          </div>
          <span className="text-slate-500 text-[11px] font-mono">
            جميع الحقوق محفوظة © 2026 رفيق POS
          </span>
        </div>

        {/* Support Bundle Section (Feature #111) */}
        <div className="mt-1 p-4 rounded-lg bg-[#f7f8f6] border border-[#dce1dc] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#0b4f42]" />
              <span className="font-bold text-[#14181a] text-xs">حزمة معلومات الدعم الفني وسجل الأخطاء</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#1b7a4d] font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>محمية: خالية تماماً من بيانات العملاء والأسعار</span>
            </div>
          </div>

          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            عند مواجهة أي استفسار أو مشكلة تقنية، انقر على الزر لتوليد ملف مضغوط آمن على سطح المكتب يحتوي على سجل الأخطاء الفنية ومواصفات النظام لإرساله لفريق الدعم.
          </p>

          <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-[#dce1dc]">
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <PhoneCall className="w-4 h-4 text-[#0b4f42]" />
              <span className="font-bold">رقم الدعم الفني وخدمة العملاء:</span>
            </div>
            <a 
              href="tel:01097782965" 
              className="font-mono text-[#0b4f42] hover:underline font-black text-sm select-all tracking-wider" 
              dir="ltr"
              title="انقر للاتصال المباشر"
            >
              01097782965
            </a>
          </div>

          {supportMessage && (
            <div className="p-3 rounded-lg bg-[#e1eae5] border border-[#0b4f42]/30 text-[#14181a] text-xs flex items-center justify-between whitespace-pre-line">
              <span>{supportMessage}</span>
              <button
                onClick={() => setSupportMessage(null)}
                className="text-[#5b6664] hover:text-[#14181a] p-1 rounded hover:bg-black/5 cursor-pointer flex items-center justify-center shrink-0 mr-2"
                title="إغلاق"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void runCreateSupportBundle()}
            disabled={supportLoading}
            className="h-10 bg-[#0b4f42] hover:bg-[#0f6a57] text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <Package className="w-4 h-4" />
            <span>{supportLoading ? 'جاري تجهيز حزمة الدعم...' : 'جمع معلومات للدعم الفني (Support Bundle)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
