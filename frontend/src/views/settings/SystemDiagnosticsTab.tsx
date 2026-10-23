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
  ShieldAlert,
  X,
  PhoneCall,
  DownloadCloud,
  Sparkles,
  FileSpreadsheet,
  Trash2
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { AppUpdateModal } from '../../components/AppUpdateModal';
import { FullStoreExportModal } from '../../components/FullStoreExportModal';
import { FactoryResetModal } from '../../components/FactoryResetModal';
import { useFeatures } from '../../context/useFeatures';
import { rafiqAlert } from '../../utils/dialogService';
import type { SystemInfo } from '../../App';

interface SystemDiagnosticsTabProps {
  sysInfo?: SystemInfo | null;
  flags: Record<string, boolean>;
  toggleFlag: (key: string, enabled: boolean) => Promise<void>;
  canManageFeatures?: boolean;
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
  onOpenWizard?: () => void;
}

export const SystemDiagnosticsTab = ({
  sysInfo,
  flags,
  toggleFlag,
  canManageFeatures = true,
  onOpenWizard,
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const { registry } = useFeatures();

  return (
    <div className="flex flex-col gap-5 text-xs text-ink dark:text-ink-dark">
      {/* Feature Toggles Section */}
      <div className="bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark shadow-subtle p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4 text-brand dark:text-brand-bright" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">تخصيص النظام ومفاتيح الميزات (Feature Toggles)</h3>
              <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">شغل أو عطل الميزات حسب طبيعة ونشاط محلك واحتياجك اليومي</span>
            </div>
          </div>
          {onOpenWizard ? (
            <button
              type="button"
              onClick={onOpenWizard}
              className="text-xs text-brand dark:text-brand-bright hover:text-white bg-brand/10 dark:bg-brand-dark-soft hover:bg-brand dark:hover:bg-brand-bright font-bold px-3 py-1 rounded-lg border border-brand/20 dark:border-brand-bright/20 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>ضبط الميزات حسب نشاط المحل (معالج المتجر)</span>
            </button>
          ) : (
            <span className="text-[11px] text-brand dark:text-brand-bright bg-brand/10 dark:bg-brand-dark-soft font-bold px-2 py-0.5 rounded">نظام مرن حسب محلك</span>
          )}
        </div>

        {!canManageFeatures && (
          <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-lg p-3 text-xs text-warn-dark dark:text-warn-bright font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
            <span>مفاتيح الميزات للقراءة فقط: تعديل وتفعيل ميزات النظام محصور بالمشرف الفني الأعلى (Root).</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {registry.map((feat) => {
            const isEnabled = flags[feat.key] ?? feat.defaultValue ?? false;
            return (
              <div
                key={feat.key}
                onClick={async () => {
                  if (!canManageFeatures) return;
                  try {
                    await toggleFlag(feat.key, !isEnabled);
                  } catch (err: any) {
                    await rafiqAlert(err.message || 'تعذر تعديل حالة الميزة');
                  }
                }}
                className={`p-3.5 rounded-lg border transition-all ${
                  canManageFeatures ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
                } flex flex-col justify-between gap-3 ${
                  isEnabled
                    ? 'bg-brand/5 dark:bg-brand-dark-soft/40 border-brand/40 dark:border-brand-bright/40 shadow-xs'
                    : 'bg-canvas dark:bg-canvas-dark border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark opacity-85'
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink dark:text-ink-dark text-xs">{feat.nameAr}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                        isEnabled
                          ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-line dark:border-line-dark'
                          : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-muted-dark border-line dark:border-line-dark'
                      }`}
                    >
                      {isEnabled ? 'شغال ومفعّل' : 'موقوف'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
                    {feat.descriptionAr}
                  </p>
                  {feat.requires && feat.requires.length > 0 && (
                    <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark flex items-center gap-1 mt-0.5">
                      <span className="font-bold">يتطلب:</span>
                      <span>
                        {feat.requires
                          .map((r) => registry.find((x) => x.key === r)?.nameAr || r)
                          .join('، ')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1 border-t border-line/50 dark:border-line-dark/50">
                  <ToggleSwitch
                    checked={isEnabled}
                    disabled={!canManageFeatures}
                    onChange={async (next) => {
                      if (!canManageFeatures) return;
                      try {
                        await toggleFlag(feat.key, next);
                      } catch (err: any) {
                        await rafiqAlert(err.message || 'تعذر تعديل حالة الميزة');
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Maintenance & System Diagnostics Section */}
      <div className="bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark shadow-subtle p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
              <Activity className="w-4 h-4 text-brand dark:text-brand-bright" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">فحص وصيانة كفاءة الجهاز والبرنامج</h3>
              <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">اطمن على سرعة الجهاز، استجابة قاعدة البيانات، وكفاءة طابعة الفواتير</p>
            </div>
          </div>
          <span className="text-[11px] font-sans text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-line dark:border-line-dark font-bold px-2.5 py-1 rounded">
            قاعدة البيانات مؤمنة وسليمة 100%
          </span>
        </div>

        {/* Diagnostic Message Toast */}
        {diagnosticResult && (
          <div className="p-3 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark font-mono text-xs flex items-center justify-between">
            <span>{diagnosticResult}</span>
            <button 
              onClick={() => setDiagnosticResult(null)}
              className="text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center justify-center shrink-0 mr-2"
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
            className="h-11 bg-canvas dark:bg-canvas-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>اختبار طابعة الفواتير</span>
          </button>

          <button
            type="button"
            onClick={() => void runSqliteTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-canvas dark:bg-canvas-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Database className="w-4 h-4 text-paid dark:text-paid-bright" />
            <span>فحص حفظ المعاملات (SQLite)</span>
          </button>

          <button
            type="button"
            onClick={() => void runPingTest()}
            disabled={diagnosticsLoading}
            className="h-11 bg-canvas dark:bg-canvas-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Zap className="w-4 h-4 text-warn dark:text-warn-bright" />
            <span>سرعة استجابة البرنامج</span>
          </button>

          <button
            type="button"
            onClick={runBenchmarkTest}
            disabled={diagnosticsLoading}
            className="h-11 bg-canvas dark:bg-canvas-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            <Gauge className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>اختبار ضغط وسرعة البحث</span>
          </button>
        </div>

        {/* Technical Specs Strip */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-line dark:border-line-dark text-xs font-mono text-ink-muted dark:text-ink-muted-dark">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark">
            <Cpu className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
            <span className="truncate">{sysInfo?.osVersion ? sysInfo.osVersion.split(' ')[0] : 'Windows'}</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark">
            <Layers className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span className="truncate">{sysInfo?.isWebView2 ? 'Fixed 109' : 'Chrome/Edge'}</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark">
            <Database className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
            <span className="truncate">حسابات مالية بالقروش (أمان 100%)</span>
          </div>
        </div>

        {/* Developer & Copyright Info */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs">
          <div className="flex items-center gap-2">
            <span className="text-ink-muted dark:text-ink-muted-dark font-medium">المطور والناشر:</span>
            <span className="font-bold text-paid dark:text-paid-bright">ISlam Khaled Ali</span>
          </div>
          <span className="text-ink-muted dark:text-ink-muted-dark text-[11px] font-mono">
            جميع الحقوق محفوظة © 2026 رفيق POS
          </span>
        </div>

        {/* App Updates Section (Feature #115) */}
        <div className="mt-1 p-4 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DownloadCloud className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span className="font-bold text-ink dark:text-ink-dark text-xs">تحديثات رفيق الآمنة والتلقائية (Rafiq Update)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-paid dark:text-paid-bright font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>نسخة احتياطية إجبارية وتراجع فوري لو حصل أي خطأ</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
            فحص وتنزيل أحدث إصدارات رفيق مع التأمين الكامل لقاعدة بيانات وفواتير المحل.
          </p>

          <button
            type="button"
            onClick={() => setIsUpdateModalOpen(true)}
            className="h-10 bg-paid dark:bg-brand hover:bg-paid/90 dark:hover:bg-brand-bright text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-white" />
            <span>فحص وتثبيت التحديثات الجديدة</span>
          </button>
        </div>

        {/* Full Store Export Section (Feature #148) */}
        <div className="mt-1 p-4 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-paid dark:text-paid-bright" />
              <span className="font-bold text-ink dark:text-ink-dark text-xs">تصدير كل بيانات المحل بضغطة واحدة (بياناتك ملكك 100%)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-paid dark:text-paid-bright font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>شيتات Excel مفصلة + ملف شامل ومفتوح بدون أي تشفير</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
            نزل كل بيانات محلك بالكامل (الأصناف، بضاعة المخزن، الزبائن والشكك، الموردين، فواتير المبيعات، والورديات) في مجلد شيتات Excel على جهازك بضغطة واحدة.
          </p>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="h-10 bg-paid dark:bg-paid-dark hover:bg-paid/90 dark:hover:bg-paid text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>تصدير بيانات المحل بالكامل دلوقتي (Excel)</span>
          </button>
        </div>

        {/* Support Bundle Section (Feature #111) */}
        <div className="mt-1 p-4 rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span className="font-bold text-ink dark:text-ink-dark text-xs">تجهيز ملف الدعم الفني وسجل الأخطاء</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-paid dark:text-paid-bright font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>أمان تام: الملف مفيهوش أي بيانات زبائن أو أسعار سرية</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
            لو واجهتك أي مشكلة تقنية، اضغط هنا لتجهيز ملف مضغوط آمن على سطح المكتب فيه تقرير الجهاز الفني وسجل الأخطاء لإرساله للدعم الفني مباشرة.
          </p>

          <div className="flex items-center justify-between p-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
            <div className="flex items-center gap-2 text-xs text-ink dark:text-ink-dark">
              <PhoneCall className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span className="font-bold">رقم الدعم الفني وخدمة العملاء:</span>
            </div>
            <a 
              href="tel:01097782965" 
              className="font-mono text-brand dark:text-brand-bright hover:underline font-black text-sm select-all tracking-wider" 
              dir="ltr"
              title="اضغط للاتصال المباشر"
            >
              01097782965
            </a>
          </div>

          {supportMessage && (
            <div className="p-3 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs flex items-center justify-between whitespace-pre-line">
              <span>{supportMessage}</span>
              <button
                onClick={() => setSupportMessage(null)}
                className="text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center justify-center shrink-0 mr-2"
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
            className="h-10 bg-brand dark:bg-brand-dark hover:bg-brand-dark dark:hover:bg-brand text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <Package className="w-4 h-4" />
            <span>{supportLoading ? 'جاري تجهيز ملف الدعم...' : 'تجهيز ملف للدعم الفني (Support Bundle)'}</span>
          </button>
        </div>

        {/* Total Factory Reset & Wipe Data Section */}
        <div className="mt-1 p-4 rounded-lg bg-danger-soft/60 dark:bg-danger-dark-soft/50 border border-danger/30 dark:border-danger-bright/30 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-danger dark:text-danger-bright" />
              <span className="font-bold text-danger-ink dark:text-danger-bright text-xs">
                تصفير ومسح كافة البيانات نهائياً (إعادة ضبط المصنع كأول مرة)
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-danger dark:text-danger-bright font-bold">
              <ShieldAlert className="w-4 h-4" />
              <span>تنظيف شامل وتصفير كامل</span>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
            يمسح كافة بيانات المبيعات والأصناف وحركات المخزن والديون بالكامل، مع إمكانية مسح كافة النسخ الاحتياطية وإعادة تشغيل البرنامج نظيفاً كأنك لسه مثبته حالا لأول مرة.
          </p>

          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="h-10 bg-danger hover:bg-danger-hover text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer shadow-xs"
          >
            <Trash2 className="w-4 h-4 text-white" />
            <span>مسح وتصفير كافة البيانات وبدء المحل من الصفر</span>
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

      <FactoryResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
      />
    </div>
  );
};
