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
    <div className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-5 text-xs text-[#14181a]">
      {/* Top Header Card */}
      <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
            <Printer className="w-5 h-5 text-[#0b4f42]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#14181a] m-0">إعدادات الطابعة الافتراضية ومقاس الورق</h3>
            <p className="text-[11px] text-[#5b6664] m-0">تحديد طابعة الإيصالات الحرارية، مقاس بكرة الورق، والتحكم في الطباعة التلقائية</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPrinters}
            disabled={printersLoading}
            className="px-3 py-1.5 rounded-lg bg-[#f7f8f6] hover:bg-[#ebeef1] border border-[#dce1dc] text-[#14181a] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="إعادة فحص الطابعات المتصلة بالجهاز"
          >
            <Cpu className={`w-3.5 h-3.5 ${printersLoading ? 'animate-spin' : ''}`} />
            <span>تحديث الطابعات</span>
          </button>

          <button
            type="button"
            onClick={onTestPrint}
            disabled={testPrinting || !selectedPrinter}
            className="px-4 py-1.5 rounded-lg bg-[#0b4f42] hover:bg-[#0f6a57] disabled:bg-[#f1f4f6] disabled:text-[#5b6664] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{testPrinting ? 'جاري إرسال التجربة...' : 'طباعة صفحة اختبار (Test Print)'}</span>
          </button>
        </div>
      </div>

      {testPrintMessage && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
          testPrintMessage.isError ? 'bg-[#fdf3f2] border-[#f6cbc6] text-[#b23a2e]' : 'bg-[#eaf5ee] border-[#c4e3d0] text-[#1b7a4d]'
        }`}>
          {testPrintMessage.isError ? <Zap className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          <span>{testPrintMessage.text}</span>
        </div>
      )}

      {printerSaveSuccess && (
        <div className="p-3 bg-[#eaf5ee] border border-[#c4e3d0] text-[#1b7a4d] rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>تم حفظ وتطبيق إعدادات الطابعة الافتراضية بنجاح!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Printer & Paper Selection */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[#14181a] font-semibold text-xs mb-1.5">الطابعة الافتراضية للفواتير والإيصالات</label>
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
            <p className="text-[11px] text-[#5b6664] mt-1.5 m-0 leading-relaxed">
              يدعم مشغّل رفيق طابعات USB والشبكة وطابعات الإيصالات الحرارية (Xprinter, Rongta, Epson, Bixolon, Sunmi وغيرها)
            </p>
          </div>

          <div>
            <label className="block text-[#14181a] font-semibold text-xs mb-2">مقاس ورق الإيصال (Paper Width)</label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: '80mm', title: '80 مم (حراري)', desc: 'المقاس القياسي لطابعات الإيصالات' },
                { id: '57mm', title: '57 مم (حراري)', desc: 'بكرات الإيصالات الصغيرة' },
                { id: 'a4', title: 'A4 (عادي)', desc: 'ورق تقارير وفواتير كاملة' },
              ].map((pw) => (
                <div
                  key={pw.id}
                  onClick={() => setPaperWidth(pw.id as '80mm' | '57mm' | 'a4')}
                  className={`p-3 rounded-lg border cursor-pointer flex flex-col gap-1 transition-all ${
                    paperWidth === pw.id
                      ? 'bg-[#0b4f42]/10 border-[#0b4f42] text-[#0b4f42] font-bold shadow-xs'
                      : 'bg-[#f7f8f6] border-[#dce1dc] hover:border-[#b5c0b7] text-[#14181a]'
                  }`}
                >
                  <span className="font-bold text-xs">{pw.title}</span>
                  <span className="text-[10px] text-[#5b6664] leading-tight">{pw.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Automation & Drawer Toggles */}
        <div className="flex flex-col gap-4">
          <label className="block text-[#14181a] font-semibold text-xs mb-0.5">خيارات التشغيل والأتمتة للكاشير</label>
          
          <div 
            onClick={() => {
              const next = !autoPrintOnSale;
              setAutoPrintOnSale(next);
              if (onToggleAutoPrint) onToggleAutoPrint(next);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              autoPrintOnSale ? 'bg-[#0b4f42]/5 border-[#0b4f42]/40' : 'bg-[#f7f8f6] border-[#dce1dc]'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-[#14181a] text-xs">طباعة فورية للإيصال عند إتمام البيع</span>
              <span className="text-[11px] text-[#5b6664] leading-relaxed">
                إرسال أمر الطباعة تلقائياً للطابعة الافتراضية فور ضغط Enter على تأكيد الدفع دون الحاجة لفتح المعاينة
              </span>
            </div>
            <button type="button" className="text-[#0b4f42] shrink-0 cursor-pointer">
              {autoPrintOnSale ? <ToggleRight className="w-8 h-8 text-[#0b4f42]" /> : <ToggleLeft className="w-8 h-8 text-[#5b6664]/60" />}
            </button>
          </div>

          <div 
            onClick={() => {
              const next = !openDrawerOnSale;
              setOpenDrawerOnSale(next);
              if (onToggleOpenDrawer) onToggleOpenDrawer(next);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              openDrawerOnSale ? 'bg-[#0b4f42]/5 border-[#0b4f42]/40' : 'bg-[#f7f8f6] border-[#dce1dc]'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-[#14181a] text-xs">فتح درج النقدية الإلكتروني تلقائياً (Cash Drawer)</span>
              <span className="text-[11px] text-[#5b6664] leading-relaxed">
                إرسال نبضة فتح الدرج (ESC/POS Pulse) مع كل عملية بيع نقدي
              </span>
            </div>
            <button type="button" className="text-[#0b4f42] shrink-0 cursor-pointer">
              {openDrawerOnSale ? <ToggleRight className="w-8 h-8 text-[#0b4f42]" /> : <ToggleLeft className="w-8 h-8 text-[#5b6664]/60" />}
            </button>
          </div>

          <button
            type="button"
            onClick={onSavePrinterSettings}
            disabled={saveLoading}
            className="mt-2 h-11 bg-[#0b4f42] hover:bg-[#0f6a57] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتفعيل إعدادات الطابعة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
