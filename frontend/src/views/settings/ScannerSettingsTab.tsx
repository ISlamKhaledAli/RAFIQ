import { Barcode, Zap, ShieldCheck, Cpu } from 'lucide-react';

interface ScannerSettingsTabProps {
  onOpenScannerModal: () => void;
}

export const ScannerSettingsTab = ({ onOpenScannerModal }: ScannerSettingsTabProps) => {
  return (
    <div className="bg-surface hairline-all rounded-[6px] p-6 flex flex-col gap-5 text-ink">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-brand-soft text-brand flex items-center justify-center">
            <Barcode className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-ink m-0">إعدادات واختبار قارئ الباركود</h3>
            <p className="text-[12px] text-ink-muted m-0">دعم قراءة الباركود بنسبة 100% مع لوحات المفاتيح العربية، تمييز السرعة، وضبط المعايير</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenScannerModal}
          className="px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
        >
          <Zap className="w-4 h-4" />
          <span>فتح شاشة الفحص والتجربة الحية للقارئ</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-2 p-4 rounded border border-line flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <span>حماية لوحة المفاتيح العربية</span>
          </div>
          <p className="text-[11px] text-ink-muted m-0">
            مفعّلة دائماً عبر خريطة الأكواد الفيزيائية (DOM Physical Code Mapping). لن تتأثر قراءة الباركود حتى لو نسي الكاشير اللغة على العربية أو تم ضغط CapsLock.
          </p>
        </div>

        <div className="bg-surface-2 p-4 rounded border border-line flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <Zap className="w-4 h-4 text-paid" />
            <span>التمييز الزمني الذكي (Timing Wedge)</span>
          </div>
          <p className="text-[11px] text-ink-muted m-0">
            النظام يقيس الفارق الزمني بين النبضات (&lt; 65ms) لتمييز المسح السريع عن الكتابة اليدوية وإضافة الصنف مباشرة للسلة بدون لمس الماوس.
          </p>
        </div>

        <div className="bg-surface-2 p-4 rounded border border-line flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <Cpu className="w-4 h-4 text-brand" />
            <span>توافق العتاد (Hardware Compatibility)</span>
          </div>
          <p className="text-[11px] text-ink-muted m-0">
            يدعم كافة قارئات الباركود السلكية واللاسلكية وباركودات الميزان المدمجة ذات الـ 13 رقماً وCode 128 وCode 39.
          </p>
        </div>
      </div>
    </div>
  );
};
