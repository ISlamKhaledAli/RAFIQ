import { useCallback, useEffect, useState } from 'react';
import { Cpu, KeyRound, ScanBarcode, Server, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { BarcodeScannerSettingsModal } from '../../components/BarcodeScannerSettingsModal';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';
import { PinSettingsModal } from '../../components/PinSettingsModal';
import { AppButton } from '../../components/AppButton';
import { SettingsCard } from '../settings/settingsParts';

interface PinStatus {
  isPinSet: boolean;
  isEnabled: boolean;
  protectedActions?: Record<string, boolean>;
}

const SCANNER_NOTES = [
  {
    icon: ShieldCheck,
    title: 'حماية الكيبورد العربي',
    text: 'تعمل تلقائياً: يُقرأ الباركود صحيحاً حتى لو كانت لغة الكيبورد عربية أو CapsLock مفعّلاً.',
  },
  {
    icon: Zap,
    title: 'إضافة سريعة للسلة',
    text: 'يتعرف البرنامج على سرعة إدخال الباركود ويضيف الصنف للفاتورة بدون لمس الماوس.',
  },
  {
    icon: Cpu,
    title: 'توافق مع القارئات والموازين',
    text: 'يدعم القارئات السلكية واللاسلكية (Bluetooth) وباركود الميزان الإلكتروني ذي 13 رقماً.',
  },
] as const;

function describePin(status: PinStatus | null): { label: string; dot: string } {
  if (!status || !status.isPinSet) return { label: 'لم يُضبط رقم سري بعد', dot: 'bg-ink-muted/50 dark:bg-ink-muted-dark/60' };
  if (!status.isEnabled) return { label: 'موقوفة مؤقتاً', dot: 'bg-warn dark:bg-warn-bright' };
  return { label: 'مفعّلة والعمليات الحساسة محمية', dot: 'bg-paid dark:bg-paid-bright' };
}

/** Root page: barcode reader checks and the PIN protection of sensitive screens. */
export const RootDevicesPage = () => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isHardwareOpen, setIsHardwareOpen] = useState(false);
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null);
  const [pinError, setPinError] = useState(false);

  const loadPinStatus = useCallback(async () => {
    try {
      setPinStatus(await invoke<PinStatus>('security:getStatus'));
      setPinError(false);
    } catch {
      setPinError(true);
    }
  }, []);

  useEffect(() => {
    void loadPinStatus();
  }, [loadPinStatus]);

  const pin = describePin(pinStatus);
  const protectedTotal = Object.keys(pinStatus?.protectedActions ?? {}).length;
  const protectedOn = Object.values(pinStatus?.protectedActions ?? {}).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5 text-sm text-ink dark:text-ink-dark pb-8">
      <SettingsCard
        icon={ScanBarcode}
        title="قارئ الباركود والماسح الضوئي"
        description="فحص استجابة القارئ وضبط سرعة الالتقاط، ومعرفة القارئات المجربة مع البرنامج."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" size="lg" icon={Server} onClick={() => setIsHardwareOpen(true)}>
              القارئات المعتمدة والمجربة
            </AppButton>
            <AppButton variant="primary" size="lg" icon={Zap} onClick={() => setIsScannerOpen(true)}>
              فحص وتجربة قارئ الباركود
            </AppButton>
          </div>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {SCANNER_NOTES.map((note) => {
            const Icon = note.icon;
            return (
              <div key={note.title} className="flex flex-col gap-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
                <span className="flex items-center gap-2 t-label text-ink dark:text-ink-dark">
                  <Icon className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  {note.title}
                </span>
                <p className="text-sm text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0">{note.text}</p>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        icon={KeyRound}
        title="حماية الشاشات والعمليات الحساسة بالرقم السري"
        description="قفل تعديل الأسعار والتقارير المالية واستعادة قاعدة البيانات برقم سري مشفّر."
        action={
          <AppButton variant="primary" size="lg" icon={KeyRound} onClick={() => setIsPinOpen(true)}>
            {pinStatus?.isPinSet ? 'إعدادات وتغيير الرقم السري' : 'إنشاء رقم سري'}
          </AppButton>
        }
      >
        {pinError ? (
          <div role="alert" className="flex items-center gap-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright rounded-xl p-4 font-semibold">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>تعذر قراءة حالة الحماية.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
            <span className="flex items-center gap-3 font-bold">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${pin.dot}`} aria-hidden="true" />
              {pin.label}
            </span>
            {pinStatus?.isPinSet && protectedTotal > 0 && (
              <span className="text-ink-muted dark:text-ink-muted-dark">
                {protectedOn} من {protectedTotal} عمليات محمية
              </span>
            )}
          </div>
        )}

        <p className="flex items-start gap-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/30 text-ink dark:text-ink-dark rounded-xl p-4 leading-relaxed m-0">
          <ShieldAlert className="w-5 h-5 shrink-0 text-warn dark:text-warn-bright" />
          <span>
            عند إنشاء رقم سري جديد يظهر «كود استرجاع الطوارئ» مرة واحدة فقط. من خلاله يمكن استرجاع الحساب بدون إنترنت إذا نُسي الرقم، ودون فقدان أي فاتورة أو حركة مخزن.
          </span>
        </p>
      </SettingsCard>

      <BarcodeScannerSettingsModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} />
      <CertifiedHardwareModal isOpen={isHardwareOpen} onClose={() => setIsHardwareOpen(false)} initialCategory="scanner" />
      <PinSettingsModal isOpen={isPinOpen} onClose={() => setIsPinOpen(false)} onStatusChanged={() => void loadPinStatus()} />
    </div>
  );
};
