import { useState } from 'react';
import { Barcode, Zap, ShieldCheck, Cpu, Server } from 'lucide-react';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';

interface ScannerSettingsTabProps {
  onOpenScannerModal: () => void;
}

export const ScannerSettingsTab = ({ onOpenScannerModal }: ScannerSettingsTabProps) => {
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);

  return (
    <div className="bg-surface rounded-lg border border-line shadow-subtle p-5 flex flex-col gap-5 text-xs text-ink">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-line pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand/10 text-brand flex items-center justify-center font-bold">
            <Barcode className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink m-0">إعدادات واختبار قارئ الباركود</h3>
            <p className="text-[11px] text-ink-muted m-0">قراءة الباركود شغالة 100% حتى لو الكيبورد بيكتب عربي، مع سرعة استجابة فورية ونزول تلقائي للسلة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHardwareModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-paid-soft hover:bg-paid-soft/80 border border-paid/30 text-paid text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="عرض قائمة قارئات الباركود المعتمدة والمجربة مع طريقة إعدادها"
          >
            <Server className="w-3.5 h-3.5 text-paid" />
            <span>القارئات المعتمدة والمجربة</span>
          </button>

          <button
            type="button"
            onClick={onOpenScannerModal}
            className="h-10 px-4 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>فتح شاشة فحص وتجربة قارئ الباركود</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-surface-2 p-4 rounded-lg border border-line flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <span>حماية الكيبورد العربي</span>
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            شغالة تلقائياً؛ الباركود بيتقرأ سليم ومظبوط حتى لو الكاشير ناسي الكيبورد بيكتب عربي أو دايس CapsLock.
          </p>
        </div>

        <div className="bg-surface-2 p-4 rounded-lg border border-line flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <Zap className="w-4 h-4 text-paid" />
            <span>نزول تلقائي وسريع للسلة</span>
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            النظام بيعرف سرعة ضرب الباركود وبيضيف الصنف للفاتورة تلقائياً من غير ما الكاشير يحتاج يلمس الماوس.
          </p>
        </div>

        <div className="bg-surface-2 p-4 rounded-lg border border-line flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <Cpu className="w-4 h-4 text-brand" />
            <span>توافق مع كل القارئات والموازين</span>
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
            بيدعم كل قارئات الباركود السلكية واللاسلكية (Wireless / Bluetooth) وباركودات الميزان الإلكتروني (13 رقم).
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

