import { useState } from 'react';
import { Barcode, Zap, ShieldCheck, Cpu, Server } from 'lucide-react';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';

interface ScannerSettingsTabProps {
  onOpenScannerModal: () => void;
}

export const ScannerSettingsTab = ({ onOpenScannerModal }: ScannerSettingsTabProps) => {
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-5 text-xs text-[#14181a]">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
            <Barcode className="w-5 h-5 text-[#0b4f42]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#14181a] m-0">إعدادات واختبار قارئ الباركود</h3>
            <p className="text-[11px] text-[#5b6664] m-0">دعم قراءة الباركود بنسبة 100% مع لوحات المفاتيح العربية، تمييز السرعة، وضبط المعايير</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHardwareModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[#006d41] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="عرض قائمة قارئات الباركود المعتمدة والمجربة مع طريقة إعدادها"
          >
            <Server className="w-3.5 h-3.5 text-[#006d41]" />
            <span>القارئات المعتمدة والمجربة</span>
          </button>

          <button
            type="button"
            onClick={onOpenScannerModal}
            className="h-10 px-4 bg-[#0b4f42] hover:bg-[#0f6a57] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>فتح شاشة الفحص والتجربة الحية للقارئ</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-[#f7f8f6] p-4 rounded-lg border border-[#dce1dc] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#14181a]">
            <ShieldCheck className="w-4 h-4 text-[#0b4f42]" />
            <span>حماية لوحة المفاتيح العربية</span>
          </div>
          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            مفعّلة دائماً عبر خريطة الأكواد الفيزيائية (DOM Physical Code Mapping). لن تتأثر قراءة الباركود حتى لو نسي الكاشير اللغة على العربية أو تم ضغط CapsLock.
          </p>
        </div>

        <div className="bg-[#f7f8f6] p-4 rounded-lg border border-[#dce1dc] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#14181a]">
            <Zap className="w-4 h-4 text-[#1b7a4d]" />
            <span>التمييز الزمني الذكي (Timing Wedge)</span>
          </div>
          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            النظام يقيس الفارق الزمني بين النبضات (&lt; 65ms) لتمييز المسح السريع عن الكتابة اليدوية وإضافة الصنف مباشرة للسلة بدون لمس الماوس.
          </p>
        </div>

        <div className="bg-[#f7f8f6] p-4 rounded-lg border border-[#dce1dc] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#14181a]">
            <Cpu className="w-4 h-4 text-[#0b4f42]" />
            <span>توافق العتاد (Hardware Compatibility)</span>
          </div>
          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            يدعم كافة قارئات الباركود السلكية واللاسلكية وباركودات الميزان المدمجة ذات الـ 13 رقماً وCode 128 وCode 39.
          </p>
        </div>
      </div>

      <CertifiedHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        initialCategory="scanner"
      />
    </div>
  );
};

