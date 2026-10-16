import { useState } from 'react';
import { Barcode, Zap, ShieldCheck, Cpu, Server } from 'lucide-react';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';

interface ScannerSettingsTabProps {
  onOpenScannerModal: () => void;
}

export const ScannerSettingsTab = ({ onOpenScannerModal }: ScannerSettingsTabProps) => {
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);

  return (
    <div className="bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark shadow-subtle p-5 flex flex-col gap-5 text-xs text-ink dark:text-ink-dark">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
            <Barcode className="w-5 h-5 text-brand dark:text-brand-bright" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">إعدادات واختبار قارئ الباركود</h3>
            <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">قراءة الباركود شغالة 100% حتى لو الكيبورد بيكتب عربي، مع سرعة استجابة فورية ونزول تلقائي للسلة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHardwareModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 border border-paid/30 dark:border-paid-bright/30 text-paid dark:text-paid-bright text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="عرض قائمة قارئات الباركود المعتمدة والمجربة مع طريقة إعدادها"
          >
            <Server className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
            <span>القارئات المعتمدة والمجربة</span>
          </button>

          <button
            type="button"
            onClick={onOpenScannerModal}
            className="h-10 px-4 bg-brand dark:bg-brand-dark hover:bg-brand-dark dark:hover:bg-brand text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>فتح شاشة فحص وتجربة قارئ الباركود</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-lg border border-line dark:border-line-dark flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
            <ShieldCheck className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>حماية الكيبورد العربي</span>
          </div>
          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
            شغالة تلقائياً؛ الباركود بيتقرأ سليم ومظبوط حتى لو الكاشير ناسي الكيبورد بيكتب عربي أو دايس CapsLock.
          </p>
        </div>

        <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-lg border border-line dark:border-line-dark flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
            <Zap className="w-4 h-4 text-paid dark:text-paid-bright" />
            <span>نزول تلقائي وسريع للسلة</span>
          </div>
          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
            النظام بيعرف سرعة ضرب الباركود وبيضيف الصنف للفاتورة تلقائياً من غير ما الكاشير يحتاج يلمس الماوس.
          </p>
        </div>

        <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-lg border border-line dark:border-line-dark flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
            <Cpu className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>توافق مع كل القارئات والموازين</span>
          </div>
          <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans">
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

