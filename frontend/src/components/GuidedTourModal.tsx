import React, { useMemo, useState } from 'react';
import {
  X,
  Keyboard,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Compass,
  ShoppingCart,
  Banknote,
  FileText,
  Users,
  Package,
  Truck,
  Wallet,
  Clock,
  BarChart3,
  ShieldCheck,
  Settings,
  HardDrive,
  Pill,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useAuth } from '../context/useAuth';
import { useFeatures } from '../context/useFeatures';
import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { getVisibleTourSteps, type TourIconName } from '../utils/tourSteps';

interface GuidedTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadDemoData?: () => void;
  hasDemoData?: boolean;
}

const TOUR_ICONS: Record<TourIconName, LucideIcon> = {
  Compass,
  ShoppingCart,
  Banknote,
  FileText,
  Users,
  Package,
  Truck,
  Wallet,
  Clock,
  BarChart3,
  ShieldCheck,
  Settings,
  HardDrive,
  Pill,
  UtensilsCrossed,
};

export const GuidedTourModal: React.FC<GuidedTourModalProps> = ({
  isOpen,
  onClose,
  onLoadDemoData,
  hasDemoData = false,
}) => {
  const { currentUser, isRoot, isAdmin, hasPermission } = useAuth();
  const { isEnabled } = useFeatures();
  const [requestedStepIndex, setRequestedStepIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const tourSteps = useMemo(
    () => getVisibleTourSteps({ user: currentUser, isRoot, isAdmin, hasPermission, isEnabled }),
    [currentUser, isRoot, isAdmin, hasPermission, isEnabled],
  );
  const currentStepIndex = Math.min(requestedStepIndex, tourSteps.length - 1);
  const motionPanel = useMotionPanel(String(currentStepIndex));

  // A reopened tour always starts from its first step
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setRequestedStepIndex(0);
  }

  const currentStep = tourSteps[currentStepIndex];
  const StepIcon = TOUR_ICONS[currentStep.icon];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === tourSteps.length - 1;

  const handleNext = () => {
    if (!isLast) {
      setRequestedStepIndex(currentStepIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setRequestedStepIndex(currentStepIndex - 1);
    }
  };

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn select-none"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: step icon, title, step counter and a clickable progress bar */}
        <div className="bg-gradient-to-r from-brand-dark to-brand text-white px-6 py-5 flex flex-col gap-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                <StepIcon className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <span className="inline-block text-xs font-bold bg-white/25 px-2.5 py-1 rounded-full mb-1.5">
                  الخطوة {currentStepIndex + 1} من {tourSteps.length}
                </span>
                <h2 className="t-modal-title leading-snug m-0">{currentStep.title}</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="w-8 h-8 shrink-0 text-white/80 hover:text-white hover:bg-white/10 rounded-lg flex items-center justify-center"
              title="إغلاق"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav aria-label="تقدم الجولة" className="flex items-center gap-1.5">
            {tourSteps.map((s, idx) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setRequestedStepIndex(idx)}
                aria-label={`الخطوة ${idx + 1}: ${s.title}`}
                aria-current={idx === currentStepIndex ? 'step' : undefined}
                title={`الخطوة ${idx + 1}: ${s.title}`}
                className="h-5 flex-1 flex items-center"
              >
                <span
                  className={`block h-1.5 w-full rounded-full ${
                    idx === currentStepIndex ? 'bg-white' : idx < currentStepIndex ? 'bg-white/70' : 'bg-white/30'
                  }`}
                />
              </button>
            ))}
          </nav>
        </div>

        {/* Content body: the step swaps with an entrance and the dialog height glides between steps of different length */}
        <MotionHeight className="px-6 py-5 overflow-y-auto flex-1 bg-canvas dark:bg-canvas-dark">
        <div {...motionPanel} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted dark:text-ink-dark-muted">
            <Compass className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
            <span>المكان في البرنامج:</span>
            <strong className="font-bold text-ink dark:text-ink-dark">{currentStep.where}</strong>
          </div>

          <ul className="bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-5 flex flex-col gap-4 m-0 list-none">
            {currentStep.sentences.map((sentence) => (
              <li key={sentence} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </span>
                <span className="text-base leading-relaxed text-ink dark:text-ink-dark">{sentence}</span>
              </li>
            ))}
          </ul>

          {currentStep.shortcut && (
            <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-border/30 rounded-xl p-4 flex items-center gap-3 text-ink dark:text-ink-dark text-sm">
              <div className="w-10 h-10 rounded-lg bg-surface dark:bg-surface-dark-3 text-warn dark:text-warn-bright flex items-center justify-center shrink-0 border border-line dark:border-line-dark">
                <Keyboard className="w-5 h-5" />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                <span className="font-bold text-warn dark:text-warn-bright">اختصار مفيد:</span>
                <kbd dir="ltr" className="px-2.5 py-1 rounded-md border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 font-mono text-xs font-bold">
                  {currentStep.shortcut.keys}
                </kbd>
                <span className="font-medium leading-relaxed">{currentStep.shortcut.label}</span>
              </div>
            </div>
          )}
        </div>
        </MotionHeight>

        {/* Footer Navigation */}
        <div className="bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-6 py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {!hasDemoData && onLoadDemoData && (
              <AppButton
                variant="soft"
                icon={Sparkles}
                onClick={() => {
                  onClose();
                  onLoadDemoData();
                }}
              >
                تحميل بيانات تجريبية للتدريب
              </AppButton>
            )}
            <AppButton variant="subtle" onClick={onClose}>
              تخطي الجولة
            </AppButton>
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <AppButton variant="secondary" icon={ArrowRight} onClick={handlePrev}>
                السابق
              </AppButton>
            )}

            <AppButton variant="primary" icon={isLast ? Check : ArrowLeft} iconPosition="end" onClick={handleNext}>
              {isLast ? 'إنهاء الجولة وبدء الشغل' : 'التالي'}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};
