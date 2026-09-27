import { 
  Printer, 
  Cpu, 
  Zap, 
  CheckCircle, 
  Save, 
  ToggleLeft, 
  ToggleRight 
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';

interface PrinterSettingsTabProps {
  printersList: { name: string; isDefault: boolean; isOnline: boolean }[];
  selectedPrinter: string;
  setSelectedPrinter: (val: string) => void;
  paperWidth: '80mm' | '57mm' | 'a4';
  setPaperWidth: (val: '80mm' | '57mm' | 'a4') => void;
  autoPrintOnSale: boolean;
  setAutoPrintOnSale: (val: boolean) => void;
  onToggleAutoPrint?: (val: boolean) => void;
  openDrawerOnSale: boolean;
  setOpenDrawerOnSale: (val: boolean) => void;
  onToggleOpenDrawer?: (val: boolean) => void;
  printersLoading: boolean;
  testPrinting: boolean;
  printerSaveSuccess: boolean;
  testPrintMessage: { text: string; isError: boolean } | null;
  fetchPrinters: () => Promise<void>;
  onTestPrint: () => Promise<void>;
  onSavePrinterSettings: () => Promise<void>;
  saveLoading: boolean;
}

export const PrinterSettingsTab = ({
  printersList,
  selectedPrinter,
  setSelectedPrinter,
  paperWidth,
  setPaperWidth,
  autoPrintOnSale,
  setAutoPrintOnSale,
  onToggleAutoPrint,
  openDrawerOnSale,
  setOpenDrawerOnSale,
  onToggleOpenDrawer,
  printersLoading,
  testPrinting,
  printerSaveSuccess,
  testPrintMessage,
  fetchPrinters,
  onTestPrint,
  onSavePrinterSettings,
  saveLoading,
}: PrinterSettingsTabProps) => {
  return (
    <div className="bg-surface hairline-all rounded-[6px] p-6 flex flex-col gap-6 text-ink">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-brand-soft text-brand flex items-center justify-center">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-ink m-0">إعدادات الطابعة الافتراضية ومقاس الورق</h3>
            <p className="text-[12px] text-ink-muted m-0">تحديد طابعة الإيصالات الحرارية، مقاس بكرة الورق، والتحكم في الطباعة التلقائية</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPrinters}
            disabled={printersLoading}
            className="px-3 py-2 rounded bg-surface-2 hover:bg-surface border border-line text-ink text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="إعادة فحص الطابعات المتصلة بالجهاز"
          >
            <Cpu className={`w-3.5 h-3.5 ${printersLoading ? 'animate-spin' : ''}`} />
            <span>تحديث الطابعات</span>
          </button>

          <button
            type="button"
            onClick={onTestPrint}
            disabled={testPrinting || !selectedPrinter}
            className="px-4 py-2 rounded bg-brand hover:bg-brand-hover disabled:bg-surface-2 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
          >
            <Zap className="w-4 h-4" />
            <span>{testPrinting ? 'جاري إرسال التجربة...' : 'طباعة صفحة اختبار (Test Print)'}</span>
          </button>
        </div>
      </div>

      {testPrintMessage && (
        <div className={`p-3 rounded text-xs font-semibold flex items-center gap-2 border ${
          testPrintMessage.isError ? 'bg-danger-soft border-danger-border text-danger' : 'bg-paid-soft border-paid-border text-paid'
        }`}>
          {testPrintMessage.isError ? <Zap className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          <span>{testPrintMessage.text}</span>
        </div>
      )}

      {printerSaveSuccess && (
        <div className="p-3 bg-paid-soft border border-paid-border text-paid rounded text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>تم حفظ وتطبيق إعدادات الطابعة الافتراضية بنجاح!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Printer & Paper Selection */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-ink font-semibold text-xs mb-1.5">الطابعة الافتراضية للفواتير والإيصالات</label>
            <CustomSelect
              value={selectedPrinter}
              onChange={(val) => setSelectedPrinter(val)}
              options={
                printersList.length === 0
                  ? [{ value: '', label: 'لا توجد طابعات مثبتة في النظام (أو جاري الفحص...)' }]
                  : printersList.map((p) => ({
                      value: p.name,
                      label: `${p.name} ${p.isDefault ? '(الافتراضية في ويندوز)' : ''}`
                    }))
              }
              size="lg"
              placeholder="اختر طابعة الإيصالات..."
            />
            <p className="text-[11px] text-ink-muted mt-1 m-0">
              يدعم مشغّل رفيق طابعات USB والشبكة وطابعات الإيصالات الحرارية (Xprinter, Rongta, Epson, Bixolon, Sunmi وغيرها)
            </p>
          </div>

          <div>
            <label className="block text-ink font-semibold text-xs mb-2">مقاس ورق الإيصال (Paper Width)</label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: '80mm', title: '80 مم (حراري)', desc: 'المقاس القياسي لطابعات الإيصالات' },
                { id: '57mm', title: '57 مم (حراري)', desc: 'بكرات الإيصالات الصغيرة' },
                { id: 'a4', title: 'A4 (عادي)', desc: 'ورق تقارير وفواتير كاملة' },
              ].map((pw) => (
                <div
                  key={pw.id}
                  onClick={() => setPaperWidth(pw.id as '80mm' | '57mm' | 'a4')}
                  className={`p-3 rounded border cursor-pointer flex flex-col gap-1 transition-all ${
                    paperWidth === pw.id
                      ? 'bg-brand-soft/50 border-brand text-brand'
                      : 'bg-surface-2 border-line hover:border-line-hover text-ink'
                  }`}
                >
                  <span className="font-bold text-[12px]">{pw.title}</span>
                  <span className="text-[10px] text-ink-muted">{pw.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Automation & Drawer Toggles */}
        <div className="flex flex-col gap-4">
          <label className="block text-ink font-semibold text-xs mb-0.5">خيارات التشغيل والأتمتة للكاشير</label>
          
          <div 
            onClick={() => {
              const next = !autoPrintOnSale;
              setAutoPrintOnSale(next);
              if (onToggleAutoPrint) onToggleAutoPrint(next);
            }}
            className={`p-3.5 rounded border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              autoPrintOnSale ? 'bg-brand-soft/30 border-brand/40' : 'bg-surface-2 border-line'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-[12.5px]">طباعة فورية للإيصال عند إتمام البيع</span>
              <span className="text-[11px] text-ink-muted">
                إرسال أمر الطباعة تلقائياً للطابعة الافتراضية فور ضغط Enter على تأكيد الدفع دون الحاجة لفتح المعاينة
              </span>
            </div>
            <button type="button" className="text-brand shrink-0">
              {autoPrintOnSale ? <ToggleRight className="w-8 h-8 text-brand" /> : <ToggleLeft className="w-8 h-8 text-ink-muted" />}
            </button>
          </div>

          <div 
            onClick={() => {
              const next = !openDrawerOnSale;
              setOpenDrawerOnSale(next);
              if (onToggleOpenDrawer) onToggleOpenDrawer(next);
            }}
            className={`p-3.5 rounded border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              openDrawerOnSale ? 'bg-brand-soft/30 border-brand/40' : 'bg-surface-2 border-line'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-[12.5px]">فتح درج النقدية الإلكتروني تلقائياً (Cash Drawer)</span>
              <span className="text-[11px] text-ink-muted">
                إرسال نبضة فتح الدرج (ESC/POS Pulse) مع كل عملية بيع نقدي
              </span>
            </div>
            <button type="button" className="text-brand shrink-0">
              {openDrawerOnSale ? <ToggleRight className="w-8 h-8 text-brand" /> : <ToggleLeft className="w-8 h-8 text-ink-muted" />}
            </button>
          </div>

          <button
            type="button"
            onClick={onSavePrinterSettings}
            disabled={saveLoading}
            className="mt-2 h-[42px] bg-brand hover:bg-brand-hover text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتفعيل إعدادات الطابعة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
