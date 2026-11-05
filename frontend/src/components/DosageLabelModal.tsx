import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Sparkles, 
  Calendar, 
  User, 
  Pill, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';

interface DosageLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPatientName?: string;
  defaultDrugName?: string;
  defaultInstructions?: string;
  defaultStorageCondition?: string;
  defaultDoctorName?: string;
  initialDrugName?: string;
  initialPatientName?: string;
  initialDoctorName?: string;
  initialInstructions?: string;
  initialStorage?: string;
}

const DOSAGE_PRESETS = [
  'قرص بعد الأكل 3 مرات يومياً',
  'قرص كل 12 ساعة بعد الأكل',
  'قرص واحد يومياً قبل الإفطار',
  'قرص واحد قبل النوم مباشرة',
  'كبسولة كل 8 ساعات بعد الأكل',
  'ملعقة 5 مل كل 8 ساعات بعد الأكل',
  'ملعقة 10 مل عند اللزوم',
  'نقط بالفم 3 مرات يومياً',
  'دهان موضعي مرتين يومياً',
  'بخاخ بالفم عند اللزوم',
  'حسب إرشادات الطبيب المعالج',
];

const STORAGE_PRESETS = [
  'يحفظ في مكان بارد وجاف أقل من 25 درجة',
  'يحفظ في الثلاجة (2 إلى 8 درجات مئوية)',
  'يحفظ بعيداً عن الرطوبة وضوء الشمس المباشر',
  'يحفظ بعيداً عن متناول أيدي الأطفال',
];

export const DosageLabelModal: React.FC<DosageLabelModalProps> = ({
  isOpen,
  onClose,
  defaultPatientName = '',
  defaultDrugName = '',
  defaultInstructions = 'قرص بعد الأكل 3 مرات يومياً',
  defaultStorageCondition = 'يحفظ في مكان بارد وجاف أقل من 25 درجة',
  defaultDoctorName = '',
  initialDrugName,
  initialPatientName,
  initialDoctorName,
  initialInstructions,
  initialStorage,
}) => {
  const [patientName, setPatientName] = useState(initialPatientName || defaultPatientName);
  const [drugName, setDrugName] = useState(initialDrugName || defaultDrugName);
  const [instructions, setInstructions] = useState(initialInstructions || defaultInstructions);
  const [storageCondition, setStorageCondition] = useState(initialStorage || defaultStorageCondition);
  const [doctorName, setDoctorName] = useState(initialDoctorName || defaultDoctorName);
  const [dispenseDate, setDispenseDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  });
  const [copies, setCopies] = useState<number>(1);
  const [printing, setPrinting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handlePrint = async () => {
    if (!drugName.trim() && !instructions.trim()) {
      setErrorMsg('يرجى كتابة اسم الدواء وتعليمات الجرعة قبل الطباعة.');
      return;
    }

    setPrinting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await invoke<{ success: boolean; message: string }>('printer:printDosageLabel', {
        patientName: patientName.trim(),
        drugName: drugName.trim(),
        dosageInstructions: instructions.trim(),
        dispenseDate: dispenseDate.trim(),
        doctorName: doctorName.trim(),
        storageCondition: storageCondition.trim(),
        copies: Math.max(1, Math.min(10, copies)),
      });

      if (res && res.success) {
        setSuccessMsg(res.message || 'تمت طباعة ملصق الجرعة');
        setTimeout(() => {
          setSuccessMsg('');
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res?.message || 'تعذر إتمام أمر الطباعة.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`خطأ أثناء إرسال أمر الطباعة: ${msg}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div 
        className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark leading-tight">
                طباعة ملصق الجرعة الحراري للعبوات الصيدلانية
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5">
                توليد ملصق حراري واضح باللغة العربية يلتصق على علبة الدواء لتوجيه المريض بالجرعة وتاريخ الصرف
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark rounded-lg hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-danger/10 border border-danger/20 flex items-center gap-2 text-danger dark:text-danger-bright text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 flex items-center gap-2 text-paid text-xs">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body: Split View (Form Inputs & Live Label Preview) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left/Form Inputs (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                  اسم المريض
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="مثال: أحمد محمد علي"
                    className="w-full pr-9 pl-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                  اسم الدواء والصنف
                </label>
                <div className="relative">
                  <Pill className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={drugName}
                    onChange={(e) => setDrugName(e.target.value)}
                    placeholder="مثال: كلافيموكس 1 جم أقراص"
                    className="w-full pr-9 pl-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden font-bold"
                  />
                </div>
              </div>
            </div>

            <p className="text-micro text-ink-muted dark:text-ink-muted-dark m-0 -mt-2">
              يلزم كتابة اسم الدواء أو تعليمات الجرعة (أحدهما على الأقل) للطباعة.
            </p>

            {/* Dosage Instructions */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-ink dark:text-ink-dark">
                  تعليمات وطريقة الجرعة بالعربية الصريحة
                </label>
                <span className="text-micro text-ink-muted dark:text-ink-dark-muted flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-brand dark:text-brand-bright" />
                  عبارات شائعة سريعة
                </span>
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="اكتب تعليمات الجرعة بوضوح للمريض..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden font-semibold resize-none"
              />

              {/* Presets Grid */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {DOSAGE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInstructions(preset)}
                    className="text-micro px-2 py-1 rounded-md bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft transition-colors border border-line/60 dark:border-line-dark"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Storage Condition */}
            <div>
              <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                تنبيه الحفظ وسلسلة التبريد
              </label>
              <input
                type="text"
                value={storageCondition}
                onChange={(e) => setStorageCondition(e.target.value)}
                placeholder="مثال: يحفظ في الثلاجة (2-8 درجات)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {STORAGE_PRESETS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setStorageCondition(sp)}
                    className="text-micro px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright transition-colors"
                  >
                    {sp}
                  </button>
                ))}
              </div>
            </div>

            {/* Doctor & Date & Copies */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                  الطبيب المعالج
                </label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="د/ ..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                  تاريخ الصرف
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={dispenseDate}
                    onChange={(e) => setDispenseDate(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                  عدد الملصقات (نسخ)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden font-mono font-bold text-center"
                />
              </div>
            </div>
          </div>

          {/* Right/Live Label Simulation (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider mb-3">
              معاينة الملصق الحراري الفعلي (Live Preview)
            </span>

            {/* Thermal Label Mockup */}
            <div className="w-full max-w-[310px] bg-white dark:bg-surface-dark text-black dark:text-ink-dark p-4 rounded-lg shadow-md border-2 border-black/80 font-sans text-right select-none">
              <div className="text-center font-black text-sm pb-1 border-b border-black">
                صيدلية رفيق
                <div className="text-micro font-normal text-gray-700 dark:text-ink-dark mt-0.5">
                  ملصق إرشادات الجرعة واستخدام العلاج
                </div>
              </div>

              <div className="py-2 space-y-1 text-xs">
                {patientName.trim() && (
                  <div className="font-bold flex items-center justify-between">
                    <span className="text-gray-600 dark:text-ink-dark-muted text-micro">المريض:</span>
                    <span>{patientName}</span>
                  </div>
                )}

                <div className="font-black text-sm text-black dark:text-ink-dark pt-1 border-t border-dashed border-gray-400">
                  {drugName || 'اسم الدواء'}
                </div>

                {/* Dosage highlight box */}
                <div className="my-2 p-2 rounded border border-black bg-gray-50 dark:bg-surface-dark-2 text-center font-black text-xs leading-relaxed">
                  {instructions || 'تعليمات الجرعة...'}
                </div>

                {storageCondition.trim() && (
                  <div className="text-micro text-gray-700 dark:text-ink-dark pt-1">
                    <span className="font-bold">تنبيه الحفظ:</span> {storageCondition}
                  </div>
                )}

                {doctorName.trim() && (
                  <div className="text-micro text-gray-700 dark:text-ink-dark">
                    <span className="font-bold">الطبيب:</span> د/ {doctorName}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-black text-center text-micro text-gray-700 dark:text-ink-dark space-y-0.5">
                <div>تاريخ الصرف: {dispenseDate}</div>
                <div className="font-bold">مع تمنياتنا لكم بتمام الصحة والشفاء العاجل</div>
              </div>
            </div>

            <p className="text-micro text-ink-muted dark:text-ink-dark-muted text-center mt-3 max-w-[280px]">
              يتم إرسال الملصق مباشرة لطابعة الإيصالات أو ملصقات الباركود الحرارية (ESC/POS) بدون هوامش زائدة.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-lg hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
          >
            إغلاق
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg bg-brand hover:bg-brand-dark text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted dark:disabled:border-line-dark"
          >
            <Printer className="w-4 h-4" />
            <span>{printing ? 'جارٍ إرسال أمر الطباعة...' : `طباعة الملصق الحراري (${copies} نسخ)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
