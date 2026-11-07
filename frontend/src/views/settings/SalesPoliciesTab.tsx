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
              <div className="flex flex-col">
                <ToggleRow
                  icon={BadgePercent}
                  title="تفعيل ضريبة القيمة المضافة (VAT)"
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
                        <button
                          type="button"
                          onClick={onOpenStoreProfile}
                          className="text-xs font-semibold text-paid dark:text-paid-bright hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>فتح بيانات المحل بالكامل</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
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
            )}
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
              <button
                type="submit"
                disabled={!creditLimitDirty || saveLoading}
                className="h-11 px-5 bg-brand dark:bg-paid-bright hover:bg-brand-dark dark:hover:bg-paid-bright-hover disabled:bg-surface-2 dark:disabled:bg-surface-dark-2 disabled:text-ink-muted dark:disabled:text-ink-muted-dark disabled:cursor-not-allowed text-white dark:text-surface-dark rounded-lg text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ الحد'}</span>
              </button>
              {creditLimitDirty && (
                <div className="h-11 flex items-center" role="status">
                  <UnsavedChangesChip />
                </div>
              )}
              {saved && !creditLimitDirty && (
                <span className="h-11 flex items-center gap-1.5 text-xs font-bold text-paid dark:text-paid-bright">
                  <CheckCircle className="w-4 h-4" />
                  تم الحفظ
                </span>
              )}
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
