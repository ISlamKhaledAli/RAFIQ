import React, { useState } from 'react';
import {
  Server,
  Printer,
  Barcode,
  Coins,
  Scale,
  CheckCircle2,
  X,
  Search,
  Sliders,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';

interface CertifiedDevice {
  id: string;
  category: 'printer' | 'scanner' | 'drawer' | 'scale';
  model: string;
  brand: string;
  type: string;
  status: 'certified' | 'recommended';
  arabicSupport: 'ممتاز (مدمج بدون تشويه)' | 'جيد جداً (عبر ESC/POS)' | 'قياسي';
  connectionType: 'USB' | 'USB + LAN' | 'RJ11' | 'Serial / USB';
  testResults: {
    latency: string;
    win7Compat: boolean;
    win10_11Compat: boolean;
    autoCutterOrTrigger: string;
  };
  setupSteps: string[];
  recommendedSettings: {
    paperOrCode?: string;
    driverName?: string;
    baudRateOrSuffix?: string;
    drawerCode?: string;
  };
  notes: string;
}

const CERTIFIED_DEVICES: CertifiedDevice[] = [
  // 1. RECEIPT PRINTERS
  {
    id: 'xp_n160ii',
    category: 'printer',
    model: 'XP-N160II / XP-Q200 / XP-C300H',
    brand: 'Xprinter',
    type: 'طابعة إيصالات حرارية 80mm',
    status: 'recommended',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'USB + LAN',
    testResults: {
      latency: '< 150ms (فورية)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'قاطع آلي سريع (Auto-Cutter)',
    },
    setupSteps: [
      'توصيل كابل USB وتشغيل الطابعة.',
      'تثبيت درايفر Xprinter الرسمي لنظام Windows (متوفر لويندوز 7 حتى 11).',
      'في إعدادات رفيق > الطابعة الحرارية: اختر الطابعة الافتراضية ومقاس 80mm.',
      'تفعيل خياري "طباعة فورية" و "فتح درج النقدية تلقائياً".',
      'الضغط على "طباعة صفحة تجريبية" للتأكد من خروج الإيصال باللغة العربية الواضحة.',
    ],
    recommendedSettings: {
      paperOrCode: '80mm (72mm printable area)',
      driverName: 'Xprinter 80 Series Driver',
      drawerCode: '27,112,0,25,250 (أمر فتح الدرج القياسي)',
    },
    notes: 'أكثر طابعات الفواتير انتشاراً واقتصادية في مصر، قطع الغيار ورولات الورق متوفرة في كل مكان، واعتماديتها ممتازة لكافة المحلات والمتاجر.',
  },
  {
    id: 'bixolon_srp330',
    category: 'printer',
    model: 'SRP-330II / SRP-350III',
    brand: 'Bixolon (Samsung)',
    type: 'طابعة إيصالات حرارية للمهام الشاقة 80mm',
    status: 'certified',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'USB',
    testResults: {
      latency: '< 100ms (فائقة السرعة)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'قاطع هيفي ديوتي (2 مليون قطوع)',
    },
    setupSteps: [
      'تثبيت درايفر Bixolon Windows Driver v7.',
      'اختيار مقاس الورق 80mm × 297mm من خصائص الطابعة.',
      'اختيار الطابعة كافتراضية في رفيق POS واختبار الطباعة والدرج.',
    ],
    recommendedSettings: {
      paperOrCode: '80mm',
      driverName: 'Bixolon SRP-330II Driver',
      drawerCode: 'Standard ESC/POS Pulse Pin 2',
    },
    notes: 'طابعة صناعية للمحلات الكبيرة والهايبرماركت، محرك طباعة صامت جداً ومقاوم للغبار ورطوبة المحل.',
  },
  {
    id: 'epson_tmt20',
    category: 'printer',
    model: 'TM-T20III / TM-T88VI',
    brand: 'Epson',
    type: 'طابعة فواتير قياسية عالمية 80mm',
    status: 'certified',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'USB',
    testResults: {
      latency: '< 120ms',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'قاطع آلي سيراميك',
    },
    setupSteps: [
      'تثبيت برنامج Epson Advanced Printer Driver (APD).',
      'ضبط خط الطابعة على وضع TrueType مع لغة Windows-1256.',
      'تعيينها كطابعة فواتير افتراضية في شاشة رفيق POS.',
    ],
    recommendedSettings: {
      paperOrCode: '80mm Roll',
      driverName: 'EPSON TM-T20III Receipt',
    },
    notes: 'الطابعة الأشهر في سلاسل المتاجر العالمية، استقرار عالي جداً على مدار 24 ساعة بدون انقطاع.',
  },
  {
    id: 'mini_pos_58',
    category: 'printer',
    model: 'POS-58 Series / Milestone 58mm',
    brand: 'Generic / Milestone',
    type: 'طابعة كاشير مدمجة 57mm / 58mm',
    status: 'certified',
    arabicSupport: 'جيد جداً (عبر ESC/POS)',
    connectionType: 'USB',
    testResults: {
      latency: '< 200ms',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'تمزيق يدوي (Manual Tear Bar)',
    },
    setupSteps: [
      'تثبيت درايفر POS-58 Series Driver.',
      'في إعدادات رفيق POS > اختيار مقاس الورق: 57mm (بدلاً من 80mm).',
      'إلغاء تفعيل قاطع الورق الآلي إن لم تكن مزودة به.',
    ],
    recommendedSettings: {
      paperOrCode: '57mm / 58mm Roll',
      driverName: 'POS-58 Driver',
    },
    notes: 'مثالية للأكشاك والمساحات الصغيرة حيث لا يتوفر مكان لطابعة 80mm الكبيرة، وتوفر استهلاك الورق.',
  },

  // 2. BARCODE SCANNERS
  {
    id: 'datalogic_qd2400',
    category: 'scanner',
    model: 'QuickScan QD2100 / QD2400 2D',
    brand: 'Datalogic',
    type: 'قارئ باركود سلكي ضوئي 1D & 2D QR',
    status: 'recommended',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'USB',
    testResults: {
      latency: '< 50ms (التقاط فوري)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'زر زناد مريح + كشف تلقائي على الحامل',
    },
    setupSteps: [
      'توصيل كابل USB بأي منفذ كمبيوتر (Plug & Play بدون تعريفات).',
      'التأكد من أن القارئ يصدر نغمة تنبيه صوتية (Beep) عند المسح.',
      'مسح باركود البرمجة "CR Suffix" لإرسال زر Enter تلقائياً بعد كل قراءة صنف.',
      'في شاشة البيع: مرر أي صنف وسيُضاف فوراً للسلة.',
    ],
    recommendedSettings: {
      paperOrCode: 'Code 128, EAN-13, QR, DataMatrix',
      baudRateOrSuffix: 'USB HID Keyboard Emulation + CR (Enter)',
    },
    notes: 'القارئ الموصى به رقم 1 لمشروع رفيق؛ يتميز بضوء استهداف ناعم، وقراءة سريعة للأصناف المجعدة أو الباركودات الصغيرة على الحلوى واللبان.',
  },
  {
    id: 'honeywell_1250g',
    category: 'scanner',
    model: 'Voyager 1250g / 1400g / 1450g 2D',
    brand: 'Honeywell',
    type: 'قارئ باركود ليزري عالي الحساسية',
    status: 'certified',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'USB',
    testResults: {
      latency: '< 60ms',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'حامل تلقائي (Auto-Sense Stand)',
    },
    setupSteps: [
      'توصيل كابل USB.',
      'وضع القارئ على الحامل لتفعيل المسح المستمر دون لمس الزناد.',
      'تأكد من إرسال Enter بنهاية كل باركود من خلال باركودات كتالوج Honeywell.',
    ],
    recommendedSettings: {
      baudRateOrSuffix: 'USB Keyboard PC + Carriage Return',
    },
    notes: 'قدرة فائقة على قراءة الباركودات الباهتة والمطبوعة بجودة منخفضة من الموردين.',
  },
  {
    id: 'zebra_ds9208',
    category: 'scanner',
    model: 'DS9208 / DS9308 Desktop Omnidirectional',
    brand: 'Zebra (Symbol)',
    type: 'قارئ طاولة متعدد الزوايا (شغل ثقيل كاشير)',
    status: 'recommended',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'USB',
    testResults: {
      latency: '< 30ms (فائق السرعة)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'مسح مستمر 360 درجة بدون زناد',
    },
    setupSteps: [
      'تثبيت القارئ على طاولة الكاشير وتوصيل كابل USB.',
      'لا يحتاج توجيه محدد؛ بمجرد تمرير المنتج أمامه يقرأ الباركود من أي زاوية.',
    ],
    recommendedSettings: {
      baudRateOrSuffix: 'USB HID + Auto-Enter',
    },
    notes: 'الخيار الأفضل للمتاجر والمحلات المزدحمة؛ يرفع سرعة الكاشير بنسبة 40% لعدم الحاجة لرفع المسدس اليدوي.',
  },

  // 3. CASH DRAWERS
  {
    id: 'cash_drawer_standard',
    category: 'drawer',
    model: 'MK-410 / E-410 Heavy Duty Metal Drawer',
    brand: 'Maken / POS-D',
    type: 'درج نقدية إلكتروني حديدي 5 خانات نقدية و 8 فكة',
    status: 'certified',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'RJ11',
    testResults: {
      latency: '< 50ms (فتح فوري مع أمر الطباعة)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'ملف مغناطيسي 24V / 12V',
    },
    setupSteps: [
      'توصيل كابل RJ11 المزود مع الدرج بمنفذ (DK / Cash Drawer) الموجود في ظهر طابعة الفواتير.',
      'في شاشة الإعدادات برفيق POS > الطابعة الحرارية: فعّل خيار "فتح درج النقدية تلقائياً".',
      'عند الضغط على "طباعة تجريبية" أو إنهاء أي عملية بيع، سيُفتح الدرج تلقائياً بصوت ناعم.',
    ],
    recommendedSettings: {
      drawerCode: 'ESC p 0 25 250 (Pin 2 / 24V)',
    },
    notes: 'هيكل حديدي صلب مع مفتاح أمان ثلاثي الأوضاع (قفل / فتح إلكتروني / فتح يدوي بالطوارئ).',
  },

  // 4. BARCODE SCALES
  {
    id: 'aclas_scale',
    category: 'scale',
    model: 'Aclas LS2X / Rongta RLS1000 / CAS CL5200',
    brand: 'Aclas / Rongta / CAS',
    type: 'ميزان باركود إلكتروني للأجبان والخضروات واللحوم',
    status: 'certified',
    arabicSupport: 'ممتاز (مدمج بدون تشويه)',
    connectionType: 'Serial / USB',
    testResults: {
      latency: '< 80ms استخراج الوزن والسعر',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'طباعة ملصق باركود فوري على الميزان',
    },
    setupSteps: [
      'ضبط صيغة الباركود في الميزان لتكون صيغة قياسية EAN-13 تبدأ بـ 20 أو 21 (النوع المعتمد للمتاجر ومحلات الأوزان والتجزئة).',
      'تكويد الصنف في رفيق بنفس كود الـ PLU المحدد في الميزان واختيار الوحدة (كيلوجرام).',
      'عند تمرير ملصق الميزان أمام الكاشير، يستخرج رفيق وزن الجرامات ويحسب السعر فوراً بدقة القروش.',
    ],
    recommendedSettings: {
      paperOrCode: 'EAN-13 Scale Barcode (20-XXXX-WWWWW-C)',
    },
    notes: 'متوافق بالكامل مع خوارزمية فك شفرات الموازين المدمجة في رفيق POS دون الحاجة لأي برامج وسيطة.',
  },
];

interface CertifiedHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: 'all' | 'printer' | 'scanner' | 'drawer' | 'scale';
}

export const CertifiedHardwareModal: React.FC<CertifiedHardwareModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'all',
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'printer' | 'scanner' | 'drawer' | 'scale'>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredDevices = CERTIFIED_DEVICES.filter((d) => {
    const matchesCat = activeCategory === 'all' || d.category === activeCategory;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchesCat;

    const matchesSearch =
      d.model.toLowerCase().includes(q) ||
      d.brand.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.notes.toLowerCase().includes(q);

    return matchesCat && matchesSearch;
  });

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div
        className="w-full max-w-4xl h-[86vh] max-h-[800px] bg-white rounded-2xl shadow-2xl border border-[#dce1dc] flex flex-col overflow-hidden font-sans text-[#0f172a]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#00372d] text-white flex items-center justify-between shrink-0 select-none shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#006d41] flex items-center justify-center text-white shadow-inner">
              <Server className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  دليل الأجهزة والعتاد المعتمد والمجرّب (Hardware Matrix)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  فيتشر #141
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/80 m-0">
                قائمة الطابعات، قارئات الباركود، أدراج النقدية، والموازين المجربة مع طريقة إعداد كل جهاز
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar & Search */}
        <div className="p-3 bg-[#f8fafc] border-b border-[#dce1dc] flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 bg-[#edf2ee] p-1 rounded-xl border border-[#dce1dc] text-xs">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              الكل ({CERTIFIED_DEVICES.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('printer')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'printer'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>الطابعات الحرارية</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('scanner')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'scanner'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>قارئات الباركود</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('drawer')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'drawer'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>أدراج النقدية</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('scale')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'scale'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>موازين الباركود</span>
            </button>
          </div>

          {/* Quick search input */}
          <div className="relative w-64 max-w-full">
            <Search className="w-3.5 h-3.5 text-[#52605d] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بموديل أو ماركة الجهاز..."
              className="w-full h-8.5 pr-8.5 pl-3 rounded-lg bg-white border border-[#dce1dc] focus:border-[#006d41] focus:ring-1 focus:ring-[#006d41] text-xs text-[#0f172a] placeholder-[#52605d]/60 outline-none transition-all"
            />
          </div>
        </div>

        {/* Device Cards List */}
        <div className="flex-1 p-4 overflow-y-auto bg-white flex flex-col gap-3 min-h-0">
          {/* Advice Banner */}
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>ضمان التوافق التام:</strong> جميع الأجهزة في هذا الجدول خضعت لاختبارات ميدانية فعلية للتأكد من استجابتها الفورية على كافة إصدارات الويندوز (ويندوز 7 و 8 و 10 و 11) ودعمها الكامل للغة العربية.
              </span>
            </div>
            <span className="text-[10px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300 shrink-0">
              100% Plug & Play
            </span>
          </div>

          {filteredDevices.map((device) => {
            const isExpanded = expandedDeviceId === device.id;
            return (
              <div
                key={device.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isExpanded
                    ? 'border-[#006d41] bg-white shadow-sm'
                    : 'border-[#dce1dc] bg-[#f8fafc] hover:border-slate-400'
                }`}
              >
                {/* Header row */}
                <div
                  onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#dce1dc] flex items-center justify-center text-[#006d41] shadow-2xs shrink-0">
                      {device.category === 'printer' && <Printer className="w-5 h-5" />}
                      {device.category === 'scanner' && <Barcode className="w-5 h-5" />}
                      {device.category === 'drawer' && <Coins className="w-5 h-5" />}
                      {device.category === 'scale' && <Scale className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-[#0f172a] truncate">
                          {device.brand} — {device.model}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-md bg-emerald-100 text-[#006d41] border border-emerald-200">
                          {device.type}
                        </span>
                        {device.status === 'recommended' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            موصى به للمتاجر المزدحمة
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate m-0 mt-0.5">
                        {device.notes}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium text-slate-600">
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#dce1dc]">
                        {device.connectionType}
                      </span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {device.testResults.latency}
                      </span>
                    </div>

                    <span className="text-slate-400">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#006d41]" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </div>

                {/* Expanded details & setup checklist */}
                {isExpanded && (
                  <div className="p-4 border-t border-[#dce1dc] bg-white flex flex-col gap-4 text-xs animate-in slide-in-from-top-1 duration-150">
                    {/* Test Results Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">سرعة الاستجابة</span>
                        <span className="font-bold text-[#006d41]">{device.testResults.latency}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">دعم اللغة العربية</span>
                        <span className="font-bold text-[#0f172a]">{device.arabicSupport}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">ويندوز 7 و 8 و 10 و 11</span>
                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>متوافق ومجرّب 100%</span>
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">القاطع / الزناد</span>
                        <span className="font-bold text-[#0f172a] truncate block">
                          {device.testResults.autoCutterOrTrigger}
                        </span>
                      </div>
                    </div>

                    {/* Step by Step Setup Sheet */}
                    <div className="flex flex-col gap-2">
                      <span className="font-bold text-xs text-[#00372d] flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-[#006d41]" />
                        <span>ورقة إعداد وتشغيل هذا الجهاز في رفيق POS:</span>
                      </span>

                      <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce1dc] flex flex-col gap-1.5">
                        {device.setupSteps.map((step, sIdx) => (
                          <div key={sIdx} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="w-4 h-4 rounded-full bg-[#00372d] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {sIdx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommended Driver & Commands */}
                    {device.recommendedSettings && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-700">
                        {device.recommendedSettings.driverName && (
                          <div>
                            <span className="text-[10px] text-slate-500 block">اسم التعريف المعتمد:</span>
                            <strong className="font-mono text-[#00372d]">{device.recommendedSettings.driverName}</strong>
                          </div>
                        )}
                        {device.recommendedSettings.paperOrCode && (
                          <div>
                            <span className="text-[10px] text-slate-500 block">المقاس / الشفرة:</span>
                            <strong className="font-mono text-[#00372d]">{device.recommendedSettings.paperOrCode}</strong>
                          </div>
                        )}
                        {device.recommendedSettings.drawerCode && (
                          <div>
                            <span className="text-[10px] text-slate-500 block">أمر فتح الدرج:</span>
                            <strong className="font-mono text-emerald-800">{device.recommendedSettings.drawerCode}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#f8fafc] border-t border-[#dce1dc] flex items-center justify-between text-xs text-slate-500 select-none shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-700" />
            <span>
              يمكنك إعطاء هذه الصفحة لمحل بيع أجهزة الكاشير لتجهيز الأجهزة المتوافقة مباشرة.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#dce1dc] text-[#0f172a] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#006d41]" />
              <span>طباعة ورقة المواصفات</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#00372d] hover:bg-[#004d3f] text-white font-bold text-xs transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

