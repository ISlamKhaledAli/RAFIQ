import { useState, useEffect, type FormEvent, type RefObject } from 'react';
import { Save, Package, Clock, Wallet, ShieldAlert, CheckCircle, BadgePercent, ReceiptText, ExternalLink } from 'lucide-react';
import { useFeatures } from '../../context/useFeatures';
import { invoke } from '../../bridge/ipc';
import { rafiqAlert } from '../../utils/dialogService';
import type { ControlledMandatoryFields } from '../../types/pharma';
import {
  ALWAYS_REQUIRED_MANDATORY_FIELDS,
  parseMandatoryFields,
  toHostMandatoryFields,
} from '../../utils/controlledMandatoryFields';
import { FIELD_INPUT_CLASS, Field, SettingsCard, ToggleRow } from './settingsParts';
import { UnsavedChangesChip } from '../../components/UnsavedChangesChip';
import { AppButton } from '../../components/AppButton';
import MotionHeight from '../../components/MotionHeight';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';

interface SalesPoliciesTabProps {
  allowNegativeStock: boolean;
  onToggleNegativeStock: (val: boolean) => void;
  requireOpenShiftToSell: boolean;
  onToggleRequireOpenShift: (val: boolean) => void;
  defaultCustomerCreditLimitEgp: number;
  setDefaultCustomerCreditLimitEgp: (val: number) => void;
  /** true when the typed credit limit differs from the saved one */
  creditLimitDirty: boolean;
  saveLoading: boolean;
  saved: boolean;
  onSave: (e: FormEvent) => void;
  /** Goes on the row that holds the save button: the settings page scrolls to it and rings it when the user stays */
  saveBarRef: RefObject<HTMLDivElement | null>;
  vatEnabled?: boolean;
  onToggleVat?: (val: boolean) => void;
  taxNumber?: string;
  onChangeTaxNumber?: (val: string) => void;
  onBlurTaxNumber?: (val: string) => void;
  onOpenStoreProfile?: () => void;
}

const MANDATORY_FIELD_ROWS: { key: keyof ControlledMandatoryFields; title: string; subject: string }[] = [
  { key: 'requireDoctorName', title: 'اسم الطبيب المعالج', subject: 'اسم الطبيب' },
  { key: 'requirePrescriptionDate', title: 'تاريخ تحرير الروشتة', subject: 'تاريخ الروشتة' },
  { key: 'requirePatientNationalId', title: 'الرقم القومي للمريض', subject: 'رقم قومي من 14 رقماً' },
  { key: 'requirePatientPhone', title: 'هاتف المريض أو المستلم', subject: 'رقم هاتف' },
  { key: 'requireDoctorLicense', title: 'رقم قيد الطبيب أو ترخيصه', subject: 'رقم القيد' },
  { key: 'requirePrescriptionNo', title: 'رقم الروشتة أو إذن الصرف', subject: 'رقم الروشتة' },
];

const IDLE_TIMEOUT_OPTIONS: SelectOption[] = [
  { value: '0', label: 'معطّل (بدون قفل تلقائي)' },
  { value: '5', label: 'بعد 5 دقائق من الخمول' },
  { value: '15', label: 'بعد 15 دقيقة (الافتراضي)' },
  { value: '30', label: 'بعد 30 دقيقة' },
  { value: '60', label: 'بعد ساعة كاملة (60 دقيقة)' },
  { value: '120', label: 'بعد ساعتين (120 دقيقة)' },
];

/** Operating rules of the till (stock, shifts, credit, controlled drugs). Admin-only on the server, so the screen is too. */
export const SalesPoliciesTab = ({
  allowNegativeStock,
  onToggleNegativeStock,
  requireOpenShiftToSell,
  onToggleRequireOpenShift,
  defaultCustomerCreditLimitEgp,
  setDefaultCustomerCreditLimitEgp,
  creditLimitDirty,
  saveLoading,
  saved,
  onSave,
  saveBarRef,
  vatEnabled,
  onToggleVat,
  taxNumber = '',
  onChangeTaxNumber,
  onBlurTaxNumber,
  onOpenStoreProfile,
}: SalesPoliciesTabProps) => {
  const { isEnabled } = useFeatures();
  // Only pharmacies that dispense controlled drugs ever use these rules
  const pharmacyEnabled = isEnabled('feature_controlled_drugs');

  const [mandatoryFields, setMandatoryFields] = useState<ControlledMandatoryFields | null>(null);
  const [mandatoryLoadFailed, setMandatoryLoadFailed] = useState(false);
  const [mandatorySaving, setMandatorySaving] = useState(false);

  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(15);
  const [idleTimeoutSaving, setIdleTimeoutSaving] = useState(false);

  useEffect(() => {
    let active = true;
    invoke<any>('security:getStatus')
      .then((status) => {
        if (active && status && typeof status.idleTimeoutMinutes === 'number') {
          setIdleTimeoutMinutes(status.idleTimeoutMinutes);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleIdleTimeoutChange = async (valStr: string) => {
    const val = parseInt(valStr, 10);
    if (isNaN(val)) return;
    const prev = idleTimeoutMinutes;
    setIdleTimeoutMinutes(val);
    setIdleTimeoutSaving(true);
    try {
      await invoke('security:setIdleTimeout', { minutes: val });
      window.dispatchEvent(new CustomEvent('rafiq:idle-timeout-changed', { detail: val }));
    } catch (err: unknown) {
      setIdleTimeoutMinutes(prev);
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({ title: 'تعذر تعديل مهلة الخمول', message: msg, variant: 'error' });
    } finally {
      setIdleTimeoutSaving(false);
    }
  };

  useEffect(() => {
    if (!pharmacyEnabled) return;
    let active = true;
    invoke<unknown>('pharma:getControlledMandatoryFields')
      .then((res) => {
        if (active) setMandatoryFields(parseMandatoryFields(res));
      })
      .catch(() => {
        if (active) setMandatoryLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [pharmacyEnabled]);

  const handleToggleMandatoryField = async (field: keyof ControlledMandatoryFields, val: boolean) => {
    if (!mandatoryFields || mandatorySaving) return;
    const previous = mandatoryFields;
    const next = { ...previous, [field]: val };
    setMandatoryFields(next);
    setMandatorySaving(true);
    try {
      await invoke('pharma:saveControlledMandatoryFields', toHostMandatoryFields(next));
    } catch (err: unknown) {
      setMandatoryFields(previous);
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({ title: 'تعذر حفظ الإعداد', message: `ضوابط أدوية الجدول: ${msg}`, variant: 'error' });
    } finally {
      setMandatorySaving(false);
    }
  };

  return (
    <div className={pharmacyEnabled ? 'grid grid-cols-1 xl:grid-cols-2 gap-5 items-start' : 'flex flex-col gap-5'}>
      <div className="flex flex-col gap-5">
        <SettingsCard
          icon={Package}
          title="قواعد البيع والمخزن"
          description="تُطبَّق على كل الكاشيرات فور تغيير المفتاح، ولا تحتاج إلى زر حفظ. تخص مالك المحل فقط."
        >
          <div className="flex flex-col divide-y divide-line dark:divide-line-dark">
            <ToggleRow
              icon={Package}
              title="السماح بالبيع بالسالب"
              description="مفعّل: يكتمل البيع حتى لو رصيد الصنف خلص ويظهر تنبيه للكاشير. متوقف: يُمنع بيع أي كمية أكبر من الرصيد."
              checked={allowNegativeStock}
              onChange={onToggleNegativeStock}
              warning={allowNegativeStock ? 'الرصيد ممكن ينزل تحت الصفر فتفقد أرقام المخزن دقتها. راجع الجرد بانتظام أو أوقفه بعد انتهاء الجرد.' : null}
            />
            <ToggleRow
              icon={Clock}
              title="إلزام فتح وردية قبل البيع"
              description="مفعّل: لا يبيع الكاشير إلا بعد فتح وردية واستلام عهدة الدرج. متوقف: بيع مباشر دون وردية، مناسب للمحل الفردي."
              checked={requireOpenShiftToSell}
              onChange={onToggleRequireOpenShift}
              warning={requireOpenShiftToSell ? null : 'المبيعات دون وردية يصعب ربطها بعهدة كاشير محدد، ويصعب مراجعة فروق الدرج وقت التقفيل.'}
            />
            {onToggleVat && (
              <MotionHeight>
              <div className="flex flex-col">
                <ToggleRow
                  icon={BadgePercent}
                  title="تفعيل ضريبة القيمة المضافة"
                  description="مفعّل: استخراج وحساب نسبة الضريبة من مبيعات الأصناف الخاضعة وإظهارها في الفواتير والتقارير المالية. متوقف: للمتاجر غير المسجلة ضريبياً لإخفاء أي بنود أو حسابات للضريبة."
                  checked={Boolean(vatEnabled)}
                  onChange={onToggleVat}
                  warning={
                    vatEnabled && !taxNumber.trim()
                      ? 'يرجى إدخال الرقم الضريبي للمحل في الخانة بالأسفل ليتم اعتماده وطباعته على الفواتير والإيصالات.'
                      : null
                  }
                />
                {vatEnabled && (
                  <div className="mt-2 mb-3 p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                        <ReceiptText className="w-4 h-4 text-paid dark:text-paid-bright" />
                        <span>الرقم الضريبي للمنشأة (المطبوع على الفاتورة)</span>
                      </div>
                      {onOpenStoreProfile && (
                        <AppButton variant="subtle" size="xs" icon={ExternalLink} iconPosition="end" onClick={onOpenStoreProfile}>
                          فتح بيانات المحل بالكامل
                        </AppButton>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-full sm:w-72">
                        <input
                          type="text"
                          value={taxNumber}
                          onChange={(e) => onChangeTaxNumber?.(e.target.value)}
                          onBlur={(e) => onBlurTaxNumber?.(e.target.value)}
                          placeholder="مثال: 934-210-884"
                          dir="ltr"
                          className={`${FIELD_INPUT_CLASS} text-right font-mono tabular-nums`}
                        />
                      </div>
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                        يُطبع هذا الرقم أعلى الإيصال مع اسم المحل وفق تعليمات الضرائب.
                      </span>
                    </div>
                  </div>
                )}
              </div>
              </MotionHeight>
            )}
            <div className="py-3 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink dark:text-ink-dark">
                    قفل الشاشة التلقائي عند الخمول
                  </div>
                  <div className="text-micro text-ink-muted dark:text-ink-muted-dark mt-0.5 leading-relaxed">
                    {idleTimeoutMinutes === 0
                      ? 'معطّل: لن يسجل النظام الخروج تلقائياً عند ترك الجهاز.'
                      : `يقفل النظام الشاشة تلقائياً بعد ${idleTimeoutMinutes} دقيقة من عدم النشاط لحماية الدرج والمبيعات.`}
                  </div>
                </div>
              </div>
              <div className="w-full sm:w-60 shrink-0">
                <CustomSelect
                  value={String(idleTimeoutMinutes)}
                  onChange={(val) => void handleIdleTimeoutChange(val)}
                  options={IDLE_TIMEOUT_OPTIONS}
                  disabled={idleTimeoutSaving}
                />
              </div>
            </div>
          </div>
        </SettingsCard>

        <form onSubmit={onSave}>
          <SettingsCard
            icon={Wallet}
            title="حد الدين للزبائن الجدد"
            description="أقصى مبلغ دين يُعطى لكل زبون جديد عند تسجيله. عند تجاوزه يطلب النظام تأكيد الكاشير قبل البيع الآجل. الزبائن الحاليون يحتفظون بحدودهم."
          >
            <div ref={saveBarRef} className="flex flex-wrap items-end gap-3 rounded-xl">
              <Field label="الحد الافتراضي بالجنيه" className="w-full sm:w-56">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    inputMode="numeric"
                    value={defaultCustomerCreditLimitEgp}
                    onChange={(e) => setDefaultCustomerCreditLimitEgp(Number(e.target.value) || 0)}
                    className={`${FIELD_INPUT_CLASS} pe-14 font-bold tabular-nums font-mono`}
                  />
                  <span className="absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-ink-muted dark:text-ink-muted-dark pointer-events-none">
                    ج.م
                  </span>
                </div>
              </Field>
              <AppButton type="submit" variant="primary" size="lg" icon={Save} loading={saveLoading} disabled={!creditLimitDirty}>
                {saveLoading ? 'جاري الحفظ...' : 'حفظ الحد'}
              </AppButton>
              <div className="h-11 grid items-center">
                <div className="col-start-1 row-start-1">
                  <UnsavedChangesChip dirty={creditLimitDirty} />
                </div>
                {saved && !creditLimitDirty && (
                  <span className="col-start-1 row-start-1 flex items-center gap-1.5 text-xs font-bold text-paid dark:text-paid-bright">
                    <CheckCircle className="w-4 h-4" />
                    تم الحفظ
                  </span>
                )}
              </div>
            </div>
          </SettingsCard>
        </form>
      </div>

      {pharmacyEnabled && (
        <SettingsCard
          icon={ShieldAlert}
          tone="warn"
          title="بيانات صرف أدوية الجدول"
          description="البيانات التي لا يكمل النظام صرف صنف خاضع للجدول قبل إدخالها، وتدخل في دفتر التفتيش. تُطبَّق فور تغيير المفتاح."
        >
          {mandatoryLoadFailed && (
            <p className="text-xs font-semibold text-danger dark:text-danger-bright m-0">
              تعذر قراءة الضوابط الحالية، أعد فتح الشاشة وحاول مرة أخرى.
            </p>
          )}
          <div className="flex flex-col divide-y divide-line dark:divide-line-dark">
            {MANDATORY_FIELD_ROWS.map((row) => {
              const locked = ALWAYS_REQUIRED_MANDATORY_FIELDS.includes(row.key);
              return (
                <ToggleRow
                  key={row.key}
                  title={row.title}
                  description={
                    locked
                      ? 'مطلوب دائماً في كل صرف ولا يمكن إيقافه.'
                      : `مفعّل: لا يُصرف الصنف دون ${row.subject}. متوقف: يمكن تركه فارغاً.`
                  }
                  checked={mandatoryFields ? mandatoryFields[row.key] : false}
                  onChange={(checked) => void handleToggleMandatoryField(row.key, checked)}
                  disabled={mandatoryFields === null || mandatorySaving}
                  lockedLabel={locked ? 'إلزامي دائماً' : undefined}
                />
              );
            })}
          </div>
        </SettingsCard>
      )}
    </div>
  );
};
