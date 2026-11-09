import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '../bridge/ipc';
import { emitDataChanged } from '../utils/eventBus';
import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { useModalDismiss } from '../hooks/useModalDismiss';
import {
  FlaskConical,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  MinusCircle,
  Download,
  Trash2,
  AlertTriangle,
  Check,
  Compass,
  ShoppingCart,
  Croissant,
  Smartphone,
  Package,
  Sparkles,
  RefreshCw,
  Pill,
  Coffee,
  Shirt,
  Store,
} from 'lucide-react';

interface DemoDataStatus {
  hasDemoData: boolean;
  demoProductsCount: number;
  demoSalesCount: number;
  demoCustomersCount: number;
  removableProductsCount?: number;
  keptProductsCount?: number;
  removableCustomersCount?: number;
  keptCustomersCount?: number;
  realProductsCount?: number;
  realCustomersCount?: number;
  realSalesCount?: number;
  plannedProductsCount?: number;
  plannedCustomersCount?: number;
  canLoad?: boolean;
  loadBlockedReason?: string | null;
}

interface LoadResult {
  success: boolean;
  message?: string;
  productsAdded?: number;
  productsSkipped?: number;
  customersAdded?: number;
}

interface ClearResult {
  success: boolean;
  message?: string;
  deletedProducts?: number;
  deletedSales?: number;
  deletedCustomers?: number;
  keptProducts?: number;
  keptCustomers?: number;
}

type Outcome = { kind: 'loaded'; result: LoadResult } | { kind: 'cleared'; result: ClearResult };
type BusyAction = 'load' | 'clear' | 'wizard';

interface DemoDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour?: () => void;
  onDataChanged?: () => void;
}

const STORE_TYPE_OPTIONS = [
  { id: 'supermarket', label: 'سوبرماركت ومواد غذائية', icon: ShoppingCart },
  { id: 'pharmacy', label: 'صيدلية ومستحضرات تجميل', icon: Pill },
  { id: 'clothing_apparel', label: 'ملابس وأحذية وأزياء', icon: Shirt },
  { id: 'cafe_restaurant', label: 'مطاعم وكافيهات', icon: Coffee },
  { id: 'dairy_bakery', label: 'ألبان ومخبوزات', icon: Croissant },
  { id: 'accessories_gifts', label: 'إكسسوارات وموبايل', icon: Smartphone },
  { id: 'toys_kids', label: 'لعب أطفال وهدايا', icon: Package },
  { id: 'general_grocery', label: 'محل تجاري عام وتجزئة', icon: Store },
];

const EMPTY_STATUS: DemoDataStatus = {
  hasDemoData: false,
  demoProductsCount: 0,
  demoSalesCount: 0,
  demoCustomersCount: 0,
};

// The host runs a verified backup before it deletes anything, which can outlast the 15 s default
const LONG_OPERATION_TIMEOUT_MS = 180000;

const errorText = (err: unknown, fallback: string): string => (err instanceof Error && err.message ? err.message : fallback);

const readInitialStoreType = (): string => {
  try {
    const saved = localStorage.getItem('rafiq_preferred_store_type');
    if (saved) return saved;
    const wizardState = localStorage.getItem('rafiq_wizard_state');
    if (wizardState) {
      const parsed = JSON.parse(wizardState) as { selectedTemplateId?: string };
      const template = parsed.selectedTemplateId;
      if (template) {
        if (template.includes('pharmacy')) return 'pharmacy';
        if (template.includes('clothing')) return 'clothing_apparel';
        if (template.includes('cafe') || template.includes('restaurant')) return 'cafe_restaurant';
        if (template.includes('bakery') || template.includes('dairy')) return 'dairy_bakery';
        if (template.includes('accessories') || template.includes('mobile')) return 'accessories_gifts';
        if (template.includes('general')) return 'general_grocery';
        return 'supermarket';
      }
    }
  } catch {
    // unreadable saved preference: fall back to the default
  }
  return 'supermarket';
};

interface CountTileProps {
  value: number;
  label: string;
}

const CountTile = ({ value, label }: CountTileProps) => (
  <div className="bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-xl p-3 text-center">
    <span className="text-2xl font-black text-ink dark:text-ink-dark block">{value}</span>
    <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">{label}</span>
  </div>
);

export const DemoDataModal: React.FC<DemoDataModalProps> = ({ isOpen, onClose, onStartTour, onDataChanged }) => {
  const [status, setStatus] = useState<DemoDataStatus>(EMPTY_STATUS);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selectedStoreType, setSelectedStoreType] = useState<string>(readInitialStoreType);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const motionPanel = useMotionPanel(outcome ? outcome.kind : status.hasDemoData ? 'present' : 'empty');

  const refreshStatus = useCallback(async (storeType: string) => {
    try {
      const res = await invoke<DemoDataStatus>('demo:getStatus', { storeType });
      setStatus(res ?? EMPTY_STATUS);
      setStatusError(null);
    } catch (err: unknown) {
      setStatusError(errorText(err, 'تعذر قراءة حالة البيانات التجريبية.'));
    }
  }, []);

  useEffect(() => {
    if (isOpen) void refreshStatus(selectedStoreType);
  }, [isOpen, selectedStoreType, refreshStatus]);

  const handleDismiss = () => {
    setOutcome(null);
    setError(null);
    setShowLoadConfirm(false);
    setShowClearConfirm(false);
    onClose();
  };

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && busy === null,
    onDismiss: handleDismiss,
    isDirty: false,
  });

  const handleLoadDemo = async () => {
    setBusy('load');
    setError(null);
    setOutcome(null);
    try {
      const res = await invoke<LoadResult>('demo:load', { storeType: selectedStoreType, acknowledgeRealData: true });
      if (!res || !res.success) {
        setError(res?.message || 'لم يؤكد النظام نجاح تحميل البيانات التجريبية، ولا يمكن اعتبار العملية ناجحة.');
        return;
      }
      setShowLoadConfirm(false);
      setOutcome({ kind: 'loaded', result: res });
      emitDataChanged(['products', 'customers', 'dashboard']);
      onDataChanged?.();
      await refreshStatus(selectedStoreType);
    } catch (err: unknown) {
      setError(errorText(err, 'تعذر تحميل البيانات التجريبية.'));
    } finally {
      setBusy(null);
    }
  };

  const handleClearDemo = async () => {
    setBusy('clear');
    setError(null);
    setOutcome(null);
    try {
      const res = await invoke<ClearResult>('demo:clear', undefined, LONG_OPERATION_TIMEOUT_MS);
      if (!res || !res.success) {
        setError(res?.message || 'لم يؤكد النظام نجاح مسح البيانات التجريبية، ولا يمكن اعتبار العملية ناجحة.');
        return;
      }
      setShowClearConfirm(false);
      setOutcome({ kind: 'cleared', result: res });
      onDataChanged?.();
      await refreshStatus(selectedStoreType);
    } catch (err: unknown) {
      setError(errorText(err, 'تعذر مسح البيانات التجريبية.'));
    } finally {
      setBusy(null);
    }
  };

  const handleOpenSetupWizard = async () => {
    setBusy('wizard');
    setError(null);
    try {
      await invoke('settings:save', { first_run_completed: '0' });
      localStorage.removeItem('rafiq_first_run_completed');
      localStorage.removeItem('rafiq_wizard_state');
      window.location.reload();
    } catch (err: unknown) {
      setError(errorText(err, 'تعذر فتح معالج الإعداد.'));
      setBusy(null);
    }
  };

  if (!isOpen) return null;

  const selectedOption = STORE_TYPE_OPTIONS.find((o) => o.id === selectedStoreType) ?? STORE_TYPE_OPTIONS[0];
  const SelectedIcon = selectedOption.icon;
  const isBusy = busy !== null;
  const loadBlocked = status.canLoad === false && !status.hasDemoData;
  const plannedProducts = status.plannedProductsCount;
  const plannedCustomers = status.plannedCustomersCount;
  const realProducts = status.realProductsCount ?? 0;
  const realCustomers = status.realCustomersCount ?? 0;
  const mixesWithReal = realProducts > 0 || realCustomers > 0;
  const removableProducts = status.removableProductsCount ?? status.demoProductsCount;
  const removableCustomers = status.removableCustomersCount ?? status.demoCustomersCount;
  const keptProducts = status.keptProductsCount ?? 0;
  const keptCustomers = status.keptCustomersCount ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn select-none"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand dark:bg-brand-dark text-white px-6 py-5 flex items-center justify-between border-b border-brand-dark dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="t-modal-title">البيانات التجريبية وتدريب الكاشير</h2>
              <p className="text-xs text-white/80 mt-0.5">أصناف وزبائن وهمية للتجربة والتدريب فقط، بدون فواتير ولا ديون ولا أرصدة.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            disabled={isBusy}
            aria-label="إغلاق"
            title="إغلاق"
            className="w-8 h-8 shrink-0 text-white/80 hover:text-white hover:bg-white/10 rounded-lg flex items-center justify-center disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <MotionHeight className="p-6 overflow-y-auto flex-1 bg-canvas dark:bg-canvas-dark">
          <div {...motionPanel} className="space-y-5">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl text-sm font-semibold flex items-start gap-2.5 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger/30">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}
            {statusError && (
              <div role="alert" className="p-3.5 rounded-xl text-sm font-semibold flex items-start gap-2.5 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-border/30">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{statusError}</span>
              </div>
            )}

            {outcome?.kind === 'loaded' && (
              <div className="bg-paid-soft dark:bg-paid-dark-soft border-2 border-paid dark:border-paid-dark-border rounded-2xl p-5 text-center space-y-3.5 shadow-md">
                <div className="w-14 h-14 bg-surface dark:bg-surface-dark-2 text-paid dark:text-paid-bright rounded-full flex items-center justify-center mx-auto border border-line dark:border-line-dark">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="t-card-title text-brand-dark dark:text-brand-bright">تم تحميل البيانات التجريبية</h3>
                  {outcome.result.message && (
                    <p className="text-xs text-paid dark:text-paid-bright mt-1 font-bold leading-relaxed">{outcome.result.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
                  <CountTile value={outcome.result.productsAdded ?? 0} label="صنف أُضيف" />
                  <CountTile value={outcome.result.productsSkipped ?? 0} label="صنف تُخطّي" />
                  <CountTile value={outcome.result.customersAdded ?? 0} label="زبون أُضيف" />
                </div>
                <div className="pt-1 flex items-center justify-center">
                  <AppButton variant="secondary" onClick={handleDismiss}>
                    إغلاق النافذة
                  </AppButton>
                </div>
              </div>
            )}

            {outcome?.kind === 'cleared' && (
              <div className="bg-paid-soft dark:bg-paid-dark-soft border-2 border-paid dark:border-paid-dark-border rounded-2xl p-5 text-center space-y-3.5 shadow-md">
                <div className="w-14 h-14 bg-surface dark:bg-surface-dark-2 text-paid dark:text-paid-bright rounded-full flex items-center justify-center mx-auto border border-line dark:border-line-dark">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="t-card-title text-brand-dark dark:text-brand-bright">تم مسح البيانات التجريبية</h3>
                  {outcome.result.message && (
                    <p className="text-xs text-paid dark:text-paid-bright mt-1 font-bold leading-relaxed">{outcome.result.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
                  <CountTile value={outcome.result.deletedProducts ?? 0} label="صنف حُذف" />
                  <CountTile value={outcome.result.deletedCustomers ?? 0} label="زبون حُذف" />
                  <CountTile value={outcome.result.deletedSales ?? 0} label="فاتورة حُذفت" />
                </div>
                {((outcome.result.keptProducts ?? 0) > 0 || (outcome.result.keptCustomers ?? 0) > 0) && (
                  <p className="text-xs font-bold text-warn dark:text-warn-bright leading-relaxed m-0">
                    بقي {outcome.result.keptProducts ?? 0} صنف و{outcome.result.keptCustomers ?? 0} زبون تجريبي لأن عمليات حقيقية استخدمتهم.
                  </p>
                )}
                <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <AppButton variant="primary" onClick={handleDismiss} className="w-full sm:w-auto">
                    إغلاق النافذة
                  </AppButton>
                  <AppButton variant="secondary" icon={RefreshCw} onClick={() => window.location.reload()} className="w-full sm:w-auto">
                    إعادة تحميل الشاشة الآن
                  </AppButton>
                </div>
              </div>
            )}

            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-1.5">
                <span className="font-bold text-ink dark:text-ink-dark block text-sm">ماذا يحدث بالضبط</span>
                <ul className="list-disc ps-4 space-y-1 text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0">
                  <li>
                    {plannedProducts !== undefined && plannedCustomers !== undefined
                      ? `يُضاف ${plannedProducts} صنف تجريبي بأسعارها وكميات مخزنها، و${plannedCustomers} زبون تجريبي بدون ديون.`
                      : 'تُضاف أصناف تجريبية بأسعارها وكميات مخزنها وزبونان تجريبيان بدون ديون.'}
                  </li>
                  <li>لا تُنشأ فواتير ولا ديون ولا أرصدة محافظ ولا حركات خزينة.</li>
                  <li>
                    كل سجل تجريبي يبدأ كوده بـ <code dir="ltr" className="font-mono font-bold text-brand-dark dark:text-brand-bright">demo_</code>، والفواتير والزبائن التجريبية مستبعدة من التقارير وإقفال اليوم. أما الأصناف التجريبية فتظهر في البيع والمخزن حتى تمسحها.
                  </li>
                  <li>المسح يأخذ نسخة احتياطية موثقة أولاً ثم يحذف السجلات التجريبية فقط، وما استُخدم منها في عملية حقيقية يبقى موقوفاً ولا يُحذف.</li>
                </ul>
              </div>
            </div>

            <div className="border border-line dark:border-line-dark rounded-xl p-4 space-y-3 bg-surface dark:bg-surface-dark">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">حالة البيانات التجريبية الآن</span>
                {status.hasDemoData ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-border/30">
                    <span className="w-2 h-2 rounded-full bg-warn dark:bg-warn-bright" />
                    محمّلة في النظام
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark">
                    <MinusCircle className="w-3.5 h-3.5" />
                    غير محمّلة
                  </span>
                )}
              </div>

              {status.hasDemoData ? (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <CountTile value={status.demoProductsCount} label="صنف تجريبي" />
                  <CountTile value={status.demoCustomersCount} label="زبون تجريبي" />
                  <CountTile value={status.demoSalesCount} label="فاتورة تجريبية" />
                </div>
              ) : (
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark font-medium leading-relaxed m-0">
                  لا توجد بيانات تجريبية الآن. النظام يعمل ببيانات المحل الحقيقية فقط.
                </p>
              )}
            </div>

            {!status.hasDemoData && (
              <div className="space-y-3">
                {loadBlocked && (
                  <div role="status" className="p-3.5 rounded-xl text-sm font-semibold flex items-start gap-2.5 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-border/30">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{status.loadBlockedReason}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
                      <SelectedIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-semibold block">نشاط المحل المعتمد:</span>
                      <span className="font-bold text-ink dark:text-ink-dark text-xs">{selectedOption.label}</span>
                    </div>
                  </div>
                  <AppButton variant="secondary" size="xs" disabled={isBusy} onClick={() => setShowTypeSelector((prev) => !prev)}>
                    {showTypeSelector ? 'إخفاء الخيارات' : 'تغيير النشاط'}
                  </AppButton>
                </div>

                {showTypeSelector && (
                  <div className="p-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl space-y-2">
                    <span className="block text-xs font-bold text-ink dark:text-ink-dark">اختر نشاط المحل لتُحمَّل أصناف مناسبة له:</span>
                    <div className="grid grid-cols-2 gap-2">
                      {STORE_TYPE_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = selectedStoreType === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setSelectedStoreType(opt.id);
                              try {
                                localStorage.setItem('rafiq_preferred_store_type', opt.id);
                              } catch {
                                // the choice still applies for this session
                              }
                              setShowTypeSelector(false);
                              setShowLoadConfirm(false);
                            }}
                            aria-pressed={isSelected}
                            className={`p-2.5 rounded-lg border text-right flex items-center gap-2.5 ${
                              isSelected
                                ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-bold ring-1 ring-brand dark:ring-brand-bright'
                                : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-brand dark:text-brand-bright' : 'text-ink-muted dark:text-ink-muted-dark'}`} />
                            <span className="text-xs font-bold">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!showLoadConfirm ? (
                  <AppButton variant="primary" size="lg" fullWidth icon={Download} disabled={loadBlocked || isBusy} onClick={() => setShowLoadConfirm(true)}>
                    {plannedProducts !== undefined
                      ? `تحميل ${plannedProducts} صنف تجريبي لنشاط «${selectedOption.label}»`
                      : `تحميل أصناف تجريبية لنشاط «${selectedOption.label}»`}
                  </AppButton>
                ) : (
                  <div className="bg-warn-soft dark:bg-warn-dark-soft border-2 border-warn-border dark:border-warn/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
                      <div>
                        <h4 className="t-label text-warn dark:text-warn-bright">تأكيد تحميل البيانات التجريبية</h4>
                        <p className="text-xs text-ink dark:text-ink-dark mt-1 leading-relaxed font-medium">
                          {plannedProducts !== undefined && plannedCustomers !== undefined
                            ? `سيُضاف ${plannedProducts} صنف تجريبي و${plannedCustomers} زبون تجريبي لنشاط «${selectedOption.label}»، بدون أي فواتير أو ديون.`
                            : `ستُضاف أصناف وزبائن تجريبيون لنشاط «${selectedOption.label}»، بدون أي فواتير أو ديون.`}{' '}
                          {mixesWithReal
                            ? `يوجد في النظام ${realProducts} صنف و${realCustomers} زبون حقيقيون، وستظهر البيانات التجريبية بجانبهم في البيع والمخزن حتى تمسحها.`
                            : 'لا توجد بيانات حقيقية في النظام حالياً.'}{' '}
                          أي صنف حقيقي يحمل نفس الباركود لن يُلمس ولن يُدمج معه شيء.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <AppButton variant="secondary" onClick={() => setShowLoadConfirm(false)} disabled={isBusy}>
                        إلغاء
                      </AppButton>
                      <AppButton variant="primary" icon={Check} loading={busy === 'load'} disabled={isBusy} onClick={() => void handleLoadDemo()}>
                        {busy === 'load' ? 'جاري تحميل البيانات...' : 'تأكيد التحميل'}
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
            )}

            {status.hasDemoData && (
              <div className="space-y-3">
                {!showClearConfirm ? (
                  <AppButton variant="dangerSoft" fullWidth icon={Trash2} disabled={isBusy} onClick={() => setShowClearConfirm(true)}>
                    مسح البيانات التجريبية
                  </AppButton>
                ) : (
                  <div className="bg-danger-soft dark:bg-danger-dark-soft border-2 border-danger-border dark:border-danger/40 rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-danger dark:text-danger-bright shrink-0 mt-0.5" />
                      <div>
                        <h4 className="t-label text-danger dark:text-danger-bright">تأكيد مسح البيانات التجريبية</h4>
                        <p className="text-xs text-ink dark:text-ink-dark mt-1 leading-relaxed font-medium">
                          {`سيُحذف ${removableProducts} صنف و${removableCustomers} زبون${status.demoSalesCount > 0 ? ` و${status.demoSalesCount} فاتورة` : ''} من السجلات التجريبية فقط، بعد أخذ نسخة احتياطية موثقة؛ وإن تعذر أخذها فلن يُحذف شيء.`}
                          {keptProducts > 0 || keptCustomers > 0
                            ? ` وسيبقى ${keptProducts} صنف و${keptCustomers} زبون تجريبي لأن فواتير أو حركات حقيقية استخدمتهم، فيُوقف الصنف ويُؤرشف الزبون ولا يُحذفان.`
                            : ''}{' '}
                          بيانات المحل الحقيقية لا تُمس.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <AppButton variant="secondary" onClick={() => setShowClearConfirm(false)} disabled={isBusy}>
                        إلغاء
                      </AppButton>
                      <AppButton variant="danger" icon={Check} loading={busy === 'clear'} disabled={isBusy} onClick={() => void handleClearDemo()}>
                        {busy === 'clear' ? 'جاري أخذ النسخة الاحتياطية والمسح...' : 'تأكيد المسح'}
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-line dark:border-line-dark pt-4 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-ink dark:text-ink-dark block">إعادة فتح معالج الإعداد الأول</span>
                <span className="text-micro text-ink-muted dark:text-ink-muted-dark">يعرض شاشة اسم المحل والنشاط ونظام البيع من جديد، ولا يمسح أي بيانات.</span>
              </div>
              <AppButton variant="soft" icon={Sparkles} loading={busy === 'wizard'} disabled={isBusy} onClick={() => void handleOpenSetupWizard()}>
                فتح معالج الإعداد
              </AppButton>
            </div>

            {onStartTour && (
              <div className="border-t border-line dark:border-line-dark pt-4 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-ink dark:text-ink-dark block">الجولة السريعة لشرح النظام</span>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark">جولة من 5 خطوات تشرح شاشات البرنامج وأزرار البيع.</span>
                </div>
                <AppButton
                  variant="successSoft"
                  icon={Compass}
                  disabled={isBusy}
                  onClick={() => {
                    handleDismiss();
                    onStartTour();
                  }}
                >
                  بدء الجولة الآن
                </AppButton>
              </div>
            )}
          </div>
        </MotionHeight>
      </div>
    </div>
  );
};
