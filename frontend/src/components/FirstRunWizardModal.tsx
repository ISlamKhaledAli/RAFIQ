import React, { useEffect, useRef, useState } from 'react';
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Coffee,
  Flame,
  Loader2,
  Milk,
  Package,
  Pill,
  Power,
  Shirt,
  ShoppingCart,
  Smartphone,
  Store,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { rafiqConfirm } from '../utils/dialogService';
import { RequiredMark } from './RequiredMark';
import { SetupChecklist } from './SetupChecklist';
import type { SetupChecklistTarget } from './SetupChecklist';
import { INITIAL_STORE_TEMPLATES, type StoreTemplateDto } from '../constants/storeTemplates';
export type { StoreTemplateDto };

export interface FirstRunWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
  isFirstRun?: boolean;
  /** Opens a settings sub-screen after setup; the host app must refresh (features changed) and close the wizard. */
  onNavigateToSettings?: (subTab: SetupChecklistTarget) => void;
}

type WizardStep = 1 | 2;

interface WizardDraft {
  step: WizardStep;
  selectedTemplateId: string;
  storeName: string;
  phone: string;
  address: string;
}

interface ApplyTemplateResponse {
  success?: boolean;
  message?: string;
}

const WIZARD_STORAGE_KEY = 'rafiq_wizard_state';
const DEFAULT_TEMPLATE_ID = 'supermarket';
const TOTAL_STEPS = 2;
const INPUT_CLASS =
  'w-full h-11 px-3.5 bg-surface dark:bg-surface-dark-2 border rounded-[6px] text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted outline-none focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors';

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  smartphone: Smartphone,
  milk: Milk,
  apple: Apple,
  book: BookOpen,
  flame: Flame,
  shirt: Shirt,
  pill: Pill,
  coffee: Coffee,
  package: Package,
};

const readDraft = (): Partial<WizardDraft> => {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
    return {
      step: parsed.step === 2 ? 2 : 1,
      selectedTemplateId: text(parsed.selectedTemplateId),
      storeName: text(parsed.storeName),
      phone: text(parsed.phone),
      address: text(parsed.address),
    };
  } catch {
    return {};
  }
};

export const FirstRunWizardModal: React.FC<FirstRunWizardModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
  isFirstRun = false,
  onNavigateToSettings,
}) => {
  // The draft only survives first-run sessions; reopening from settings starts from the saved store data
  const [draft] = useState<Partial<WizardDraft>>(() => (isFirstRun ? readDraft() : {}));
  const [step, setStep] = useState<WizardStep>(draft.step ?? 1);
  const [completed, setCompleted] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<StoreTemplateDto[]>(INITIAL_STORE_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(draft.selectedTemplateId ?? DEFAULT_TEMPLATE_ID);
  const [storeName, setStoreName] = useState(draft.storeName ?? '');
  const [phone, setPhone] = useState(draft.phone ?? '');
  const [address, setAddress] = useState(draft.address ?? '');
  const prefilledRef = useRef(false);

  const handleDismiss = () => {
    if (completed) onCompleted();
    else onClose();
  };
  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !isFirstRun && !isApplying,
    onDismiss: handleDismiss,
    isDirty: false,
  });

  // Keep an unfinished first run resumable if the app is closed midway
  useEffect(() => {
    if (!isFirstRun || completed) return;
    try {
      const data: WizardDraft = { step, selectedTemplateId, storeName, phone, address };
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage unavailable: the draft is a convenience only
    }
  }, [isFirstRun, completed, step, selectedTemplateId, storeName, phone, address]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let available: StoreTemplateDto[] = INITIAL_STORE_TEMPLATES;
    (async () => {
      try {
        const tplList = await invoke<StoreTemplateDto[]>('templates:getAll');
        if (!active || !Array.isArray(tplList)) return;
        const cleanList = tplList.filter((t) => t.id !== 'accessories_gifts');
        if (cleanList.length > 0) {
          available = cleanList;
          setTemplates(cleanList);
          setSelectedTemplateId((prev) => (cleanList.some((t) => t.id === prev) ? prev : cleanList[0].id));
        }
      } catch (err: unknown) {
        console.error('Failed to load store templates:', err);
      }
      if (isFirstRun || prefilledRef.current) return;
      try {
        const saved = await invoke<Record<string, string>>('settings:getAll');
        if (!active || !saved) return;
        prefilledRef.current = true;
        setStoreName((prev) => prev || saved.store_name || '');
        setPhone((prev) => prev || saved.store_phone || '');
        setAddress((prev) => prev || saved.store_address || '');
        if (saved.store_type) {
          const savedType = saved.store_type;
          setSelectedTemplateId((prev) => (available.some((t) => t.id === savedType) ? savedType : prev));
        }
      } catch (err: unknown) {
        console.error('Failed to load saved store data:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen, isFirstRun]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    try {
      const res = await invoke<ApplyTemplateResponse>('templates:apply', {
        templateId: selectedTemplateId,
        storeName: storeName.trim(),
        storePhone: phone.trim(),
        storeAddress: address.trim(),
        seedInitialProducts: false,
      });
      if (res && res.success) {
        try {
          localStorage.setItem('rafiq_first_run_completed', 'true');
          if (isFirstRun) {
            localStorage.setItem('rafiq_show_guided_tour', 'true');
          }
          localStorage.removeItem(WIZARD_STORAGE_KEY);
        } catch {
          // the host already recorded completion; the local cache is only a shortcut
        }
        setCompleted(true);
      } else {
        setError(res?.message || 'فشل تطبيق القالب');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const handleNext = () => {
    if (isApplying) return;
    if (step === 1) {
      setError(null);
      setStep(2);
      return;
    }
    if (!storeName.trim()) {
      setError('اسم المحل مطلوب للمتابعة.');
      return;
    }
    void handleApply();
  };

  const handleExitApp = async () => {
    const confirmed = await rafiqConfirm({
      title: 'إغلاق البرنامج',
      message: completed
        ? 'تم تجهيز النظام وحفظ إعداداتك.\nهل تريد إغلاق برنامج رفيق الآن؟'
        : 'لم يكتمل تجهيز النظام بعد.\nيمكنك إغلاق البرنامج الآن وسيظهر معالج التجهيز مجدداً عند فتحه في المرة القادمة لاستكمال الإعداد.',
      confirmText: 'نعم، إغلاق البرنامج',
      cancelText: 'العودة للتجهيز',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await invoke('window:close');
    } catch {
      window.close();
    }
  };

  if (!isOpen) return null;

  const stepTitle = completed ? 'النظام جاهز للعمل' : step === 1 ? 'اختر نوع نشاط محلك' : 'بيانات المحل';
  const stepHint = completed
    ? 'تم ضبط ميزات نشاطك وحفظ بيانات المحل.'
    : step === 1
      ? 'سيضبط رفيق ميزات البيع المناسبة لنشاطك تلقائياً.'
      : 'اسم المحل هو المطلوب للبدء، وباقي بيانات الفاتورة تُضبط لاحقاً من الإعدادات.';

  const renderTemplates = () => (
    <div role="radiogroup" aria-label="نوع النشاط" className="grid grid-cols-2 gap-3.5">
      {templates.map((tpl) => {
        const isSelected = tpl.id === selectedTemplateId;
        const Icon = TEMPLATE_ICONS[tpl.icon] || Store;
        const features = tpl.featuresSummary || [];
        return (
          <button
            key={tpl.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            autoFocus={isSelected}
            onClick={() => setSelectedTemplateId(tpl.id)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              setSelectedTemplateId(tpl.id);
              setError(null);
              setStep(2);
            }}
            className={`relative min-h-[132px] p-4 flex flex-col items-start gap-2 text-start rounded-[6px] border-2 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand dark:focus-visible:ring-brand-bright ${
              isSelected
                ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand dark:border-brand-bright'
                : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright'
            }`}
          >
            {isSelected && (
              <span className="absolute top-3 end-3 w-5 h-5 rounded-full bg-brand dark:bg-brand-bright text-white dark:text-surface-dark flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <span className="flex items-center gap-2.5 pe-7">
              <Icon className={`w-5 h-5 shrink-0 ${isSelected ? 'text-brand dark:text-brand-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
              <span className="text-sm font-bold text-ink dark:text-ink-dark">{tpl.name}</span>
            </span>
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed line-clamp-2">{tpl.description}</span>
            {features.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5 mt-auto">
                {features.slice(0, 3).map((feat) => (
                  <span
                    key={feat}
                    className="text-micro text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark rounded-[4px] px-1.5 py-0.5 bg-surface dark:bg-surface-dark-2"
                  >
                    {feat}
                  </span>
                ))}
                {features.length > 3 && (
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted tabular-nums">+{features.length - 3}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderStoreData = () => (
    <div className="w-full max-w-[520px] mx-auto flex flex-col gap-5 py-2">
      <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">الحقول المميزة بعلامة * مطلوبة</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="wizard-store-name" className="text-xs font-semibold text-ink dark:text-ink-dark">
          اسم المحل أو المنشأة <RequiredMark />
        </label>
        <input
          id="wizard-store-name"
          type="text"
          autoFocus
          value={storeName}
          onChange={(e) => {
            setStoreName(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error !== null && !storeName.trim()}
          placeholder="مثلاً: سوبر ماركت النور"
          className={`${INPUT_CLASS} font-semibold ${
            error !== null && !storeName.trim()
              ? 'border-danger dark:border-danger-bright'
              : 'border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright'
          }`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="wizard-store-phone" className="text-xs font-semibold text-ink dark:text-ink-dark">
          رقم الهاتف
        </label>
        <input
          id="wizard-store-phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01000000000"
          className={`${INPUT_CLASS} text-right tabular-nums border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="wizard-store-address" className="text-xs font-semibold text-ink dark:text-ink-dark">
          العنوان
        </label>
        <input
          id="wizard-store-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="مثلاً: 23 شارع الجمهورية - وسط البلد"
          className={`${INPUT_CLASS} border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright`}
        />
      </div>
    </div>
  );

  const renderFinish = () => (
    <div className="w-full max-w-[640px] mx-auto flex flex-col gap-5 py-1">
      <div className="flex items-center gap-4 p-4 rounded-[6px] bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border">
        <span className="w-12 h-12 shrink-0 rounded-[6px] bg-paid dark:bg-paid-bright text-white dark:text-surface-dark flex items-center justify-center">
          <Check className="w-7 h-7 stroke-[2.5]" />
        </span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-base font-bold text-ink dark:text-ink-dark m-0">
            تم تجهيز نشاط «{selectedTemplate?.name}» بنجاح
          </h2>
          <p className="text-sm text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
            يمكنك البدء بإضافة أصنافك الآن، وكل الإعدادات قابلة للتعديل في أي وقت.
          </p>
        </div>
      </div>
      {onNavigateToSettings && <SetupChecklist onNavigate={onNavigateToSettings} />}
    </div>
  );

  const progressSegment = (index: number) =>
    completed || step >= index ? 'bg-brand dark:bg-brand-bright' : 'bg-line dark:bg-line-dark';

  const card = (
    <form
      className="w-[880px] max-w-full h-[640px] max-h-full bg-surface dark:bg-surface-dark rounded-[8px] border border-line dark:border-line-dark shadow-card flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="معالج تجهيز النظام"
      noValidate
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!completed) handleNext();
      }}
    >
      <header className="h-[80px] px-6 flex items-center gap-4 shrink-0 border-b border-line dark:border-line-dark">
        <img src="/logo_full.png" alt="نظام رفيق" className="h-9 object-contain dark:hidden" />
        <img src="/logo_full_dark.png" alt="نظام رفيق" className="h-9 object-contain hidden dark:block" />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 ps-4 border-s border-line dark:border-line-dark">
          <h1 className="text-lg font-bold text-ink dark:text-ink-dark m-0 leading-tight truncate">{stepTitle}</h1>
          <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 truncate">{stepHint}</p>
        </div>
        {!completed && (
          <span className="shrink-0 text-xs font-medium text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-dark-soft border border-brand/40 dark:border-brand-bright/40 rounded-[6px] px-2.5 py-1 tabular-nums">
            الخطوة {step} من {TOTAL_STEPS}
          </span>
        )}
        {isFirstRun ? (
          <button
            type="button"
            onClick={() => void handleExitApp()}
            disabled={isApplying}
            className="h-11 px-4 shrink-0 flex items-center gap-2 text-sm font-semibold rounded-[6px] border border-danger dark:border-danger-bright text-danger dark:text-danger-bright bg-surface dark:bg-surface-dark hover:bg-danger-soft dark:hover:bg-danger-dark-soft transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Power className="w-4 h-4" />
            <span>إغلاق البرنامج</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void requestClose()}
            disabled={isApplying}
            title="إغلاق المعالج"
            aria-label="إغلاق المعالج"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[6px] border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark hover:bg-canvas dark:hover:bg-canvas-dark transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </header>

      <div className="flex shrink-0 gap-1 h-1" aria-hidden="true">
        <div className={`flex-1 ${progressSegment(1)}`} />
        <div className={`flex-1 ${progressSegment(2)}`} />
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-canvas dark:bg-canvas-dark">
        {completed ? renderFinish() : step === 1 ? renderTemplates() : renderStoreData()}
      </div>

      <footer className="h-[80px] px-6 flex items-center gap-4 shrink-0 border-t border-line dark:border-line-dark">
        {step === 2 && !completed ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(1);
            }}
            disabled={isApplying}
            className="h-11 px-5 shrink-0 flex items-center gap-2 text-sm font-medium rounded-[6px] border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark hover:bg-canvas dark:hover:bg-canvas-dark transition-colors cursor-pointer disabled:opacity-50"
          >
            <ArrowRight className="w-4 h-4" />
            <span>السابق</span>
          </button>
        ) : (
          <span className="shrink-0" />
        )}
        <p role="alert" className="flex-1 min-w-0 m-0 text-xs font-semibold text-danger dark:text-danger-bright text-center truncate">
          {error}
        </p>
        {completed ? (
          <button
            type="button"
            autoFocus
            onClick={onCompleted}
            className="h-11 px-7 shrink-0 flex items-center gap-2 text-sm font-bold rounded-[6px] bg-paid dark:bg-paid-bright hover:bg-paid-hover dark:hover:bg-paid-bright-hover text-white dark:text-surface-dark transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>{isFirstRun ? 'ابدأ البيع الآن' : 'إنهاء'}</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={isApplying}
            className={`h-11 px-7 shrink-0 flex items-center gap-2 text-sm font-bold rounded-[6px] text-white dark:text-surface-dark transition-colors cursor-pointer disabled:opacity-50 ${
              step === 1
                ? 'bg-brand dark:bg-brand-bright hover:bg-brand-hover dark:hover:bg-paid-bright-hover'
                : 'bg-paid dark:bg-paid-bright hover:bg-paid-hover dark:hover:bg-paid-bright-hover'
            }`}
          >
            {step === 1 ? (
              <>
                <span>التالي</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            ) : (
              <>
                {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                <span>إنهاء التجهيز</span>
              </>
            )}
          </button>
        )}
      </footer>
    </form>
  );

  if (isFirstRun) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark select-none overflow-hidden font-sans"
        dir="rtl"
      >
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs text-ink dark:text-ink-dark select-none font-sans"
      dir="rtl"
      onClick={handleBackdropClick}
    >
      {card}
    </div>
  );
};
