import { useState } from 'react';
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
  PhoneCall,
  DownloadCloud,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { AppUpdateModal } from '../../components/AppUpdateModal';
import { FullStoreExportModal } from '../../components/FullStoreExportModal';
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
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5 text-xs text-ink">
      {/* Feature Toggles Section */}
      <div className="bg-surface rounded-lg border border-line shadow-subtle p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand/10 text-brand flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4 text-brand" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink m-0">تخصيص النظام ومفاتيح الميزات (Feature Toggles)</h3>
              <span className="text-[11px] text-ink-muted">شغل أو عطل الميزات حسب طبيعة ونشاط محلك واحتياجك اليومي</span>
            </div>
          </div>
          <span className="text-[11px] text-brand bg-brand/10 font-bold px-2 py-0.5 rounded">نظام مرن حسب محلك</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            {
              key: 'feature_fast_buttons',
              title: 'أزرار الأصناف السريعة (بدون باركود)',
              description: 'عرض زراير للأصناف اللي ملهاش باركود زي (العيش، الخضار، السجائر الفرط) على شاشة البيع بضغطة زر واحدة.',
            },
            {
              key: 'feature_credit_debts',
              title: 'حساب الشكك ودفتر ديون الزبائن',
              description: 'بيع بالآجل على الحساب ومتابعة كشف الحساب والحد الأقصى للشكك لكل زبون.',
            },
            {
              key: 'feature_taxes',
              title: 'منظومة الضرائب والرمز الضريبي',
              description: 'حساب ضريبة القيمة المضافة وإظهار أكواد GS1/EGS للأصناف في الفاتورة.',
            },
            {
              key: 'feature_expiry_dates',
              title: 'تواريخ الصلاحية وتشغيلات البضاعة',
              description: 'متابعة تواريخ انتهاء الصلاحية والتنبيه قبل ما البضاعة تخلص صلاحيتها وصرف الأقدم أولاً.',
            },
            {
              key: 'feature_matrix_variants',
              title: 'المقاسات والألوان ومصفوفة الملابس',
              description: 'إدارة الصنف الواحد بأكتر من مقاس ولون مع باركود خاص لكل مقاس لمحلات الملابس والأحذية.',
            },
            {
              key: 'feature_multi_units',
              title: 'تعدد وحدات البيع (كرتونة / دستة / قطعة)',
              description: 'بيع وشراء الصنف بالكرتونة أو الدستة أو القطعة مع تحويل رصيد المخزن تلقائياً وبدقة.',
            },
            {
              key: 'feature_scale_weight',
              title: 'ميزان الباركود والأصناف الموزونة',
              description: 'قراءة باركود ميزان الجبن واللحوم والخضار وحساب الوزن والسعر تلقائياً.',
            },
          ].map((feat) => {
            const isEnabled = flags[feat.key] ?? false;
            return (
              <div
                key={feat.key}
                onClick={() => void toggleFlag(feat.key, !isEnabled)}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isEnabled
                    ? 'bg-brand/5 border-brand/40 shadow-xs'
                    : 'bg-canvas border-line hover:border-line-hover opacity-85'
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink text-xs">{feat.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isEnabled
                          ? 'bg-paid-soft text-paid border-line'
                          : 'bg-surface text-ink-muted border-line'
                      }`}
                    >
                      {isEnabled ? 'شغال ومفعّل' : 'موقوف'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
                    {feat.description}
                  </p>
                </div>

                <div className="flex justify-end pt-1 border-t border-line/50">
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
      <div className="bg-surface rounded-lg border border-line shadow-subtle p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand/10 text-brand flex items-center justify-center font-bold">
              <Activity className="w-4 h-4 text-brand" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink m-0">فحص وصيانة كفاءة الجهاز والبرنامج</h3>
              <p className="text-[11px] text-ink-muted m-0">اطمن على سرعة الجهاز، استجابة قاعدة البيانات، وكفاءة طابعة الفواتير</p>
            </div>
          </div>
          <span className="text-[11px] font-sans text-paid bg-paid-soft border border-line font-bold px-2.5 py-1 rounded">
            قاعدة البيانات مؤمنة وسليمة 100%
          </span>
        </div>

        {/* Diagnostic Message Toast */}
        {diagnosticResult && (
          <div className="p-3 rounded-lg bg-canvas border border-line text-ink font-mono text-xs flex items-center justify-between">
            <span>{diagnosticResult}</span>
            <button 
              onClick={() => setDiagnosticResult(null)}
              className="text-ink-muted hover:text-ink p-1 rounded hover:bg-black/5 cursor-pointer flex items-center justify-center shrink-0 mr-2"
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
            className="h-11 bg-canvas hover:bg-surface-2 border border-line text-ink rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4 text-brand" />
            <span>اختبار طابعة الفواتير</span>
          </button>

          <button
            type="button"
            onClick={() => void runSqliteTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-canvas hover:bg-surface-2 border border-line text-ink rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Database className="w-4 h-4 text-paid" />
            <span>فحص حفظ المعاملات (SQLite)</span>
          </button>

          <button
            type="button"
            onClick={() => void runPingTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-canvas hover:bg-surface-2 border border-line text-ink rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Zap className="w-4 h-4 text-warn" />
            <span>سرعة استجابة البرنامج</span>
          </button>

          <button
            type="button"
            onClick={runBenchmarkTest}
            disabled={diagnosticsLoading}
            className="h-11 bg-canvas hover:bg-surface-2 border border-line text-ink rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Gauge className="w-4 h-4 text-brand" />
            <span>اختبار ضغط وسرعة البحث</span>
          </button>
        </div>

        {/* Technical Specs Strip */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-line text-xs font-mono text-ink-muted">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-canvas border border-line">
            <Cpu className="w-4 h-4 text-brand shrink-0" />
            <span className="truncate">{sysInfo?.osVersion ? sysInfo.osVersion.split(' ')[0] : 'Windows'}</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-canvas border border-line">
            <Layers className="w-4 h-4 text-paid shrink-0" />
            <span className="truncate">{sysInfo?.isWebView2 ? 'Fixed 109' : 'Chrome/Edge'}</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-canvas border border-line">
            <Database className="w-4 h-4 text-brand shrink-0" />
            <span className="truncate">حسابات مالية بالقروش (أمان 100%)</span>
          </div>
        </div>

        {/* Developer & Copyright Info */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-line text-xs">
          <div className="flex items-center gap-2">
            <span className="text-ink-muted font-medium">المطور والناشر:</span>
            <span className="font-bold text-paid">ISlam Khaled Ali</span>
          </div>
          <span className="text-ink-muted text-[11px] font-mono">
            جميع الحقوق محفوظة © 2026 رفيق POS
          </span>
        </div>

        {/* App Updates Section (Feature #115) */}
        <div className="mt-1 p-4 rounded-lg bg-canvas border border-line flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DownloadCloud className="w-4 h-4 text-brand" />
              <span className="font-bold text-ink text-xs">تحديثات رفيق الآمنة والتلقائية (Rafiq Update)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-paid font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>نسخة احتياطية إجبارية وتراجع فوري لو حصل أي خطأ</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            فحص وتنزيل أحدث إصدارات رفيق مع التأمين الكامل لقاعدة بيانات وفواتير المحل.
          </p>

          <button
            type="button"
            onClick={() => setIsUpdateModalOpen(true)}
            className="h-10 bg-paid hover:bg-paid/90 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-warn" />
            <span>فحص وتثبيت التحديثات الجديدة</span>
          </button>
        </div>

        {/* Full Store Export Section (Feature #148) */}
        <div className="mt-1 p-4 rounded-lg bg-canvas border border-line flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-paid" />
              <span className="font-bold text-ink text-xs">تصدير كل بيانات المحل بضغطة واحدة (بياناتك ملكك 100%)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-paid font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>شيتات Excel مفصلة + ملف شامل ومفتوح بدون أي تشفير</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            نزل كل بيانات محلك بالكامل (الأصناف، بضاعة المخزن، الزبائن والشكك، الموردين، فواتير المبيعات، والورديات) في مجلد شيتات Excel على جهازك بضغطة واحدة.
          </p>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="h-10 bg-paid hover:bg-paid/90 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>تصدير بيانات المحل بالكامل دلوقتي (Excel)</span>
          </button>
        </div>

        {/* Support Bundle Section (Feature #111) */}
        <div className="mt-1 p-4 rounded-lg bg-canvas border border-line flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-brand" />
              <span className="font-bold text-ink text-xs">تجهيز ملف الدعم الفني وسجل الأخطاء</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-paid font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>أمان تام: الملف مفيهوش أي بيانات زبائن أو أسعار سرية</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            لو واجهتك أي مشكلة تقنية، اضغط هنا لتجهيز ملف مضغوط آمن على سطح المكتب فيه تقرير الجهاز الفني وسجل الأخطاء لإرساله للدعم الفني مباشرة.
          </p>

          <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-line">
            <div className="flex items-center gap-2 text-xs text-ink">
              <PhoneCall className="w-4 h-4 text-brand" />
              <span className="font-bold">رقم الدعم الفني وخدمة العملاء:</span>
            </div>
            <a 
              href="tel:01097782965" 
              className="font-mono text-brand hover:underline font-black text-sm select-all tracking-wider" 
              dir="ltr"
              title="اضغط للاتصال المباشر"
            >
              01097782965
            </a>
          </div>

          {supportMessage && (
            <div className="p-3 rounded-lg bg-paid-soft border border-line text-ink text-xs flex items-center justify-between whitespace-pre-line">
              <span>{supportMessage}</span>
              <button
                onClick={() => setSupportMessage(null)}
                className="text-ink-muted hover:text-ink p-1 rounded hover:bg-black/5 cursor-pointer flex items-center justify-center shrink-0 mr-2"
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
            className="h-10 bg-brand hover:bg-brand-dark text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <Package className="w-4 h-4" />
            <span>{supportLoading ? 'جاري تجهيز ملف الدعم...' : 'تجهيز ملف للدعم الفني (Support Bundle)'}</span>
          </button>
        </div>
      </div>

      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />

      <FullStoreExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
};
