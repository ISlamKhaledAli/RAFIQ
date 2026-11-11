import { useState, useEffect, type FormEvent, type RefObject } from 'react';
import { 
  Save, 
  Package, 
  Clock, 
  Wallet, 
  ShieldAlert, 
  CheckCircle, 
  BadgePercent, 
  ReceiptText, 
  ExternalLink,
  Calculator,
  Sparkles,
  FileText,
  Check
} from 'lucide-react';
import { useFeatures } from '../../context/useFeatures';
import { invoke } from '../../bridge/ipc';
import { rafiqAlert, rafiqConfirm } from '../../utils/dialogService';
import { formatArabicCurrency, calculateTaxPiasters } from '../../utils/money';
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
  defaultTaxRatePercent?: number;
  onChangeDefaultTaxRate?: (val: number) => void;
  taxInclusive?: boolean;
  onChangeTaxInclusive?: (val: boolean) => void;
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

const TAX_PRESETS = [
  { rate: 14, label: '14% (مصر)' },
  { rate: 15, label: '15% (السعودية)' },
  { rate: 5, label: '5% (الإمارات)' },
  { rate: 0, label: '0% (معفى)' },
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
  defaultTaxRatePercent = 14,
  onChangeDefaultTaxRate,
  taxInclusive = true,
  onChangeTaxInclusive,
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

  // Bulk untaxed products management
  const [untaxedCount, setUntaxedCount] = useState<number | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);

  // Live tax simulation sandbox
  const [simAmountEgp, setSimAmountEgp] = useState<number>(100);

  const fetchUntaxedCount = async () => {
    try {
      const res = await invoke<{ untaxedCount: number }>('products:getUntaxedCount');
      if (res && typeof res.untaxedCount === 'number') {
        setUntaxedCount(res.untaxedCount);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    if (vatEnabled) {
      void fetchUntaxedCount();
    }
  }, [vatEnabled]);

  const handleBulkApplyTax = async () => {
    const rate = defaultTaxRatePercent;
    const confirmed = await rafiqConfirm({
      title: 'تطبيق نسبة الضريبة على الأصناف الحالية',
      message: `هل تريد تطبيق نسبة ضريبة القيمة المضافة (${rate}%) على جميع أصناف المخزن غير الخاضعة للضريبة (${untaxedCount ?? 'كافة'} صنف)؟ يمكن تعديل أو استثناء أي صنف لاحقاً من شاشة الأصناف.`,
      confirmText: `نعم، تطبيق (${rate}%)`,
      cancelText: 'إلغاء',
      variant: 'info',
    });
    if (!confirmed) return;

    setBulkApplying(true);
    try {
      const res = await invoke<{ success: boolean; updatedCount: number }>('products:bulkUpdateTaxRate', {
        taxRatePercent: rate,
        onlyZeroOrNull: true,
      });
      await fetchUntaxedCount();
      void rafiqAlert({
        title: 'تم التحديث بنجاح',
        message: `تم تطبيق نسبة الضريبة (${rate}%) بنجاح على ${res?.updatedCount ?? ''} صنف من أصناف المخزن.`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل التحديث الجماعي',
        message: `تعذر تطبيق نسبة الضريبة: ${msg}`,
        variant: 'error',
      });
    } finally {
      setBulkApplying(false);
    }
  };

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

  // Live simulation values
  const simRate = defaultTaxRatePercent;
  const simTotalPiasters = Math.max(0, Math.round((simAmountEgp || 0) * 100));
  const simTaxPiasters = calculateTaxPiasters(simTotalPiasters, simRate, taxInclusive);
  const simNetPiasters = taxInclusive ? Math.max(0, simTotalPiasters - simTaxPiasters) : simTotalPiasters;
  const simFinalPayablePiasters = taxInclusive ? simTotalPiasters : (simTotalPiasters + simTaxPiasters);

  return (
    <div className={pharmacyEnabled ? 'grid grid-cols-1 xl:grid-cols-2 gap-5 items-start' : 'flex flex-col gap-5'}>
      <div className="flex flex-col gap-5">
        
        {/* 1. قواعد البيع والمخزن */}
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

        {/* 2. بطاقة ضريبة القيمة المضافة والفاتورة الضريبية المتكاملة */}
        {onToggleVat && (
          <SettingsCard
            icon={BadgePercent}
            title="ضريبة القيمة المضافة والفاتورة الضريبية"
            description="إعدادات احتساب وتطبيق ضريبة القيمة المضافة، النسبة الافتراضية، الرقم الضريبي، وتطبيقها على المبيعات والفواتير."
          >
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

              <MotionHeight>
                {vatEnabled ? (
                  <div className="mt-3 flex flex-col gap-4 pt-3 border-t border-line dark:border-line-dark">
                    
                    {/* أ) الرقم الضريبي للمنشأة */}
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
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

                    {/* ب) النسبة الافتراضية للضريبة (%) */}
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                        <BadgePercent className="w-4 h-4 text-paid dark:text-paid-bright" />
                        <span>النسبة الافتراضية لضريبة القيمة المضافة (%)</span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="relative w-full sm:w-36">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={defaultTaxRatePercent}
                            onChange={(e) => onChangeDefaultTaxRate?.(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                            className={`${FIELD_INPUT_CLASS} pe-8 font-mono tabular-nums font-bold`}
                          />
                          <span className="absolute inset-y-0 end-3 flex items-center text-xs font-bold text-ink-muted dark:text-ink-muted-dark pointer-events-none">
                            %
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {TAX_PRESETS.map((preset) => {
                            const isSelected = defaultTaxRatePercent === preset.rate;
                            return (
                              <button
                                key={preset.rate}
                                type="button"
                                onClick={() => onChangeDefaultTaxRate?.(preset.rate)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-paid text-white border-paid shadow-2xs'
                                    : 'bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark border-line dark:border-line-dark hover:border-line-hover'
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                        تُعتمد هذه النسبة افتراضياً عند إنشاء أي صنف جديد في النظام، وتُحسب تلقائياً في فواتير الكاشير.
                      </span>
                    </div>

                    {/* ج) طريقة تسعير الأصناف والضريبة (شامل / غير شامل) */}
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                        <FileText className="w-4 h-4 text-paid dark:text-paid-bright" />
                        <span>طريقة احتساب الضريبة في فواتير البيع</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => onChangeTaxInclusive?.(true)}
                          className={`p-3 rounded-xl border text-start transition-all cursor-pointer flex flex-col gap-1.5 ${
                            taxInclusive
                              ? 'bg-paid-soft/50 dark:bg-paid-dark-soft/30 border-paid dark:border-paid/40 shadow-2xs'
                              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-line-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-ink dark:text-ink-dark">
                              الأسعار شاملة الضريبة (شائع وقانوني)
                            </span>
                            {taxInclusive && <Check className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />}
                          </div>
                          <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                            السعر المعلن هو النهائي للزبون؛ ويستخرج النظام نسبة الضريبة من أصل السعر دون زيادة.
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onChangeTaxInclusive?.(false)}
                          className={`p-3 rounded-xl border text-start transition-all cursor-pointer flex flex-col gap-1.5 ${
                            !taxInclusive
                              ? 'bg-paid-soft/50 dark:bg-paid-dark-soft/30 border-paid dark:border-paid/40 shadow-2xs'
                              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-line-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-ink dark:text-ink-dark">
                              الأسعار غير شاملة (تُضاف عند الدفع)
                            </span>
                            {!taxInclusive && <Check className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />}
                          </div>
                          <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                            الأسعار المعروضة صافية، ويقوم النظام باحتساب قيمة الضريبة وإضافتها فوق الإجمالي.
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* د) زر التهيئة والتحديث الجماعي للأصناف الحالية */}
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                          <Sparkles className="w-4 h-4 text-brand dark:text-brand-bright" />
                          <span>تطبيق النسبة على الأصناف الحالية بالمخزن</span>
                        </div>
                        {untaxedCount !== null && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark">
                            {untaxedCount > 0 ? `${untaxedCount} صنف غير خاضع حالياً` : 'كافة الأصناف خاضعة للضريبة'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <AppButton
                          variant="secondary"
                          size="sm"
                          icon={CheckCircle}
                          onClick={() => void handleBulkApplyTax()}
                          loading={bulkApplying}
                          disabled={untaxedCount === 0}
                        >
                          {untaxedCount !== null && untaxedCount > 0
                            ? `تطبيق نسبة (${defaultTaxRatePercent}%) على ${untaxedCount} صنف غير خاضع`
                            : `تطبيق نسبة (${defaultTaxRatePercent}%) على جميع أصناف المخزن`}
                        </AppButton>
                        <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                          يهيئ أصناف المتجر فوراً لتطبيق الضريبة في شاشة الكاشير دون الحاجة لتعديل كل صنف يدوياً.
                        </span>
                      </div>
                    </div>

                    {/* هـ) محاكي حسابي حي للضريبة */}
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                          <Calculator className="w-4 h-4 text-paid dark:text-paid-bright" />
                          <span>محاكي حساب الضريبة المباشر (معاينة حية)</span>
                        </div>
                        <div className="flex items-center gap-2 text-micro font-mono">
                          <span className="text-ink-muted dark:text-ink-muted-dark">تجربة مبلغ:</span>
                          <input
                            type="number"
                            min="1"
                            step="10"
                            value={simAmountEgp}
                            onChange={(e) => setSimAmountEgp(Math.max(0, Number(e.target.value) || 0))}
                            className="w-20 px-2 py-0.5 rounded bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark text-center font-mono tabular-nums"
                          />
                          <span className="text-ink-muted dark:text-ink-muted-dark">ج.م</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
                          <div className="text-micro text-ink-muted dark:text-ink-muted-dark">السعر الصافي</div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-ink dark:text-ink-dark tabular-nums mt-0.5">
                            {formatArabicCurrency(simNetPiasters)}
                          </div>
                        </div>

                        <div className="p-2 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30">
                          <div className="text-micro text-paid dark:text-paid-bright font-semibold">
                            الضريبة ({simRate}%)
                          </div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-paid dark:text-paid-bright tabular-nums mt-0.5">
                            {formatArabicCurrency(simTaxPiasters)}
                          </div>
                        </div>

                        <div className="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
                          <div className="text-micro text-ink-muted dark:text-ink-muted-dark">المطلوب سداده</div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-ink dark:text-ink-dark tabular-nums mt-0.5">
                            {formatArabicCurrency(simFinalPayablePiasters)}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : null}
              </MotionHeight>
            </div>
          </SettingsCard>
        )}

        {/* 3. حد الدين للزبائن الجدد */}
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
