import { useState, useEffect } from 'react';
import { 
  Printer, 
  Cpu, 
  Zap, 
  CheckCircle, 
  Save,
  Server,
  Tag
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';
import { invoke } from '../../bridge/ipc';

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
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [labelPrinter, setLabelPrinter] = useState('');
  const [labelPaperSize, setLabelPaperSize] = useState('38x25');
  const [labelTestPrinting, setLabelTestPrinting] = useState(false);
  const [labelTestMessage, setLabelTestMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await invoke<Record<string, string>>('settings:getAll');
        if (s) {
          if (s.default_label_printer_name) setLabelPrinter(s.default_label_printer_name);
          if (s.default_label_paper_size) setLabelPaperSize(s.default_label_paper_size);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const handleSaveAll = async () => {
    try {
      await invoke('settings:updateBatch', {
        settings: {
          default_label_printer_name: labelPrinter,
          default_label_paper_size: labelPaperSize,
        },
      });
    } catch {
      // non-blocking
    }
    await onSavePrinterSettings();
  };

  const handleTestLabel = async () => {
    setLabelTestPrinting(true);
    setLabelTestMessage(null);
    try {
      const res = await invoke<{ success: boolean; message: string; printerUsed: string }>('printer:testLabel', {
        printerName: labelPrinter || selectedPrinter,
        paperSize: labelPaperSize,
      });
      if (res && res.success) {
        setLabelTestMessage({ text: `تم إرسال الملصق التجريبي بنجاح إلى: ${res.printerUsed}`, isError: false });
      } else {
        setLabelTestMessage({ text: res?.message || 'فشلت تجربة طباعة الملصق', isError: true });
      }
    } catch (err: unknown) {
      setLabelTestMessage({ text: err instanceof Error ? err.message : 'فشلت تجربة الطباعة', isError: true });
    } finally {
      setLabelTestPrinting(false);
    }
  };

  return (
    <div className="bg-surface rounded-lg border border-line shadow-subtle p-5 flex flex-col gap-5 text-xs text-ink">
      {/* Top Header Card */}
      <div className="flex items-center justify-between border-b border-line pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand/10 text-brand flex items-center justify-center font-bold">
            <Printer className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink m-0">طابعة فواتير الكاشير ومقاس البكرة</h3>
            <p className="text-[11px] text-ink-muted m-0">تحديد طابعة الفواتير والوصل الحراري، مقاس البكرة (80مم / 57مم)، والطباعة التلقائية</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHardwareModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-paid-soft hover:bg-paid-soft/80 border border-paid/30 text-paid text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="عرض قائمة الطابعات والأجهزة المعتمدة والمجربة مع طريقة إعدادها"
          >
            <Server className="w-3.5 h-3.5 text-paid" />
            <span>الأجهزة والطابعات المعتمدة</span>
          </button>

          <button
            type="button"
            onClick={fetchPrinters}
            disabled={printersLoading}
            className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-line text-ink text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="إعادة فحص الطابعات المتصلة بالجهاز"
          >
            <Cpu className={`w-3.5 h-3.5 ${printersLoading ? 'animate-spin' : ''}`} />
            <span>تحديث وبحث الطابعات</span>
          </button>

          <button
            type="button"
            onClick={onTestPrint}
            disabled={testPrinting || !selectedPrinter}
            className="px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-dark disabled:bg-surface-2 disabled:text-ink-muted text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{testPrinting ? 'جاري إرسال التجربة...' : 'تجربة طباعة وصل (Test Print)'}</span>
          </button>
        </div>
      </div>

      {testPrintMessage && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
          testPrintMessage.isError ? 'bg-danger-soft border-danger-border text-danger' : 'bg-paid-soft border-paid-border text-paid'
        }`}>
          {testPrintMessage.isError ? <Zap className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          <span>{testPrintMessage.text}</span>
        </div>
      )}

      {printerSaveSuccess && (
        <div className="p-3 bg-paid-soft border border-paid-border text-paid rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>تم حفظ وتفعيل إعدادات طابعة الفواتير بنجاح!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Printer & Paper Selection */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-ink font-semibold text-xs mb-1.5">طابعة فواتير ووصولات الكاشير</label>
            <CustomSelect
              value={selectedPrinter}
              onChange={(val) => setSelectedPrinter(val)}
              options={
                printersList.length === 0
                  ? [{ value: '', label: 'مافيش طابعات متعرفة على الجهاز (أو جاري الفحص...)' }]
                  : printersList.map((p) => ({
                      value: p.name,
                      label: `${p.name} ${p.isDefault ? '(الافتراضية في الويندوز)' : ''}`
                    }))
              }
              size="lg"
              placeholder="اختار طابعة الفواتير..."
            />
            <p className="text-[11px] text-ink-muted mt-1.5 m-0 leading-relaxed">
              رفيق بيدعم كل طابعات الـ USB والشبكة وطابعات الكاشير الحرارية (Xprinter, Rongta, Epson, Bixolon, Sunmi وغيرها) بدون أي تعريفات معقدة.
            </p>
          </div>

          <div>
            <label className="block text-ink font-semibold text-xs mb-2">مقاس بكرة ورق الفاتورة</label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: '80mm', title: '80 مم (حراري عريض)', desc: 'المقاس القياسي لأغلب طابعات الكاشير' },
                { id: '57mm', title: '57 مم (حراري صغير)', desc: 'بكرات الفواتير الصغيرة (طابعات فوري والمحمولة)' },
                { id: 'a4', title: 'A4 (ورق عادي)', desc: 'ورق طباعة فواتير وتقارير كبيرة A4' },
              ].map((pw) => (
                <div
                  key={pw.id}
                  onClick={() => setPaperWidth(pw.id as '80mm' | '57mm' | 'a4')}
                  className={`p-3 rounded-lg border cursor-pointer flex flex-col gap-1 transition-all ${
                    paperWidth === pw.id
                      ? 'bg-brand/10 border-brand text-brand font-bold shadow-xs'
                      : 'bg-surface-2 border-line hover:border-line-hover text-ink'
                  }`}
                >
                  <span className="font-bold text-xs">{pw.title}</span>
                  <span className="text-[10px] text-ink-muted leading-tight">{pw.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Automation & Drawer Toggles */}
        <div className="flex flex-col gap-4">
          <label className="block text-ink font-semibold text-xs mb-0.5">خيارات وأتمتة الكاشير والدرج</label>
          
          <div 
            onClick={() => {
              const next = !autoPrintOnSale;
              setAutoPrintOnSale(next);
              if (onToggleAutoPrint) onToggleAutoPrint(next);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              autoPrintOnSale ? 'bg-brand/5 border-brand/40' : 'bg-surface-2 border-line'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-xs">طباعة وصل فورية أول ما البيع يخلص</span>
              <span className="text-[11px] text-ink-muted leading-relaxed">
                إرسال أمر الطباعة تلقائياً أول ما تدوس تأكيد الدفع من غير ما يفتح شاشة معاينة
              </span>
            </div>
            <ToggleSwitch
              checked={autoPrintOnSale}
              onChange={(next) => {
                setAutoPrintOnSale(next);
                if (onToggleAutoPrint) onToggleAutoPrint(next);
              }}
            />
          </div>

          <div 
            onClick={() => {
              const next = !openDrawerOnSale;
              setOpenDrawerOnSale(next);
              if (onToggleOpenDrawer) onToggleOpenDrawer(next);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              openDrawerOnSale ? 'bg-brand/5 border-brand/40' : 'bg-surface-2 border-line'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-xs">فتح درج النقدية والفلوس تلقائياً مع البيع (Cash Drawer)</span>
              <span className="text-[11px] text-ink-muted leading-relaxed">
                إرسال نبضة فتح الدرج تلقائياً مع كل عملية بيع كاش
              </span>
            </div>
            <ToggleSwitch
              checked={openDrawerOnSale}
              onChange={(next) => {
                setOpenDrawerOnSale(next);
                if (onToggleOpenDrawer) onToggleOpenDrawer(next);
              }}
            />
          </div>
        </div>
      </div>

      {/* Feature #57: Barcode Label Printer Settings */}
      <div className="border-t border-line pt-5 mt-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
              <Tag className="w-4 h-4 text-brand" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink m-0">طابعة استيكرات الباركود والأسعار</h4>
              <p className="text-[11px] text-ink-muted m-0">تحديد طابعة استيكرات البضاعة ومقاس بكرة الباركود (Roll & Sheet)</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestLabel}
            disabled={labelTestPrinting || printersList.length === 0}
            className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-line text-ink text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 text-brand ${labelTestPrinting ? 'animate-spin' : ''}`} />
            <span>{labelTestPrinting ? 'جاري إرسال الاستيكر...' : 'طباعة استيكر تجريبي'}</span>
          </button>
        </div>

        {labelTestMessage && (
          <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
            labelTestMessage.isError ? 'bg-danger-soft border-danger-border text-danger' : 'bg-paid-soft border-paid-border text-paid'
          }`}>
            <span>{labelTestMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-ink font-semibold text-xs mb-1.5">طابعة استيكرات الباركود</label>
            <CustomSelect
              value={labelPrinter}
              onChange={(val) => setLabelPrinter(val)}
              options={[
                { value: '', label: 'استخدام طابعة الإيصالات أو طابعة ويندوز الافتراضية' },
                ...printersList.map((p) => ({
                  value: p.name,
                  label: `${p.name} ${p.isDefault ? '(الافتراضية في ويندوز)' : ''}`,
                })),
              ]}
              size="md"
              placeholder="اختر طابعة الباركود (Zebra, Xprinter, TSC...)"
            />
          </div>

          <div>
            <label className="block text-ink font-semibold text-xs mb-1.5">المقاس الافتراضي لاستيكر الباركود</label>
            <CustomSelect
              value={labelPaperSize}
              onChange={(val) => setLabelPaperSize(val)}
              options={[
                { value: '38x25', label: '38×25 مم (بكرة رول قياسية صغيرة - محلات التجزئة والملابس واللعب)' },
                { value: '40x30', label: '40×30 مم (بكرة رول متوسطة)' },
                { value: '50x25', label: '50×25 مم (بكرة رول عريضة مدمجة)' },
                { value: '50x30', label: '50×30 مم (بكرة رول عريضة قياسية)' },
                { value: '50x40', label: '50×40 مم (استيكر رف ومخزن كبير)' },
                { value: 'a4_24', label: 'ورق A4 استيكرات (24 استيكر بالورقة: 3 أعمدة × 8 صفوف)' },
                { value: 'a4_40', label: 'ورق A4 استيكرات (40 استيكر بالورقة: 4 أعمدة × 10 صفوف)' },
              ]}
              size="md"
              placeholder="اختر مقاس ورق الباركود..."
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saveLoading}
          className="mt-2 h-11 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتفعيل كافة إعدادات الطابعات والاستيكرات'}</span>
        </button>
      </div>

      <CertifiedHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        initialCategory="printer"
      />
    </div>
  );
};
