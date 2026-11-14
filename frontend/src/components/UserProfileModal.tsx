import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';
import { getRoleLabel } from '../utils/roleLabels';
import { isValidPinFormat, isWeakPin } from '../utils/pinPolicy';

const STORE_OWNER_ID = 'usr_admin_default';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
}) => {
  const { currentUser, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [changeSecurity, setChangeSecurity] = useState(false);
  const [securityType, setSecurityType] = useState<'pin' | 'password'>('pin');

  const [currentSecret, setCurrentSecret] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state whenever modal opens or currentUser updates
  useEffect(() => {
    if (isOpen && currentUser) {
      setDisplayName(currentUser.displayName || '');
      setChangeSecurity(false);
      setSecurityType('pin');
      setCurrentSecret('');
      setNewSecret('');
      setConfirmSecret('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setError('');
      setSuccess('');
    }
  }, [isOpen, currentUser]);

  const isDirty = Boolean(
    (currentUser && displayName.trim() !== (currentUser.displayName || '')) ||
    currentSecret ||
    newSecret ||
    confirmSecret
  );

  const handleDismiss = () => {
    if (isSubmitting) return;
    setError('');
    setSuccess('');
    onClose();
  };

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: handleDismiss,
    isDirty,
    confirmTitle: 'تجاهل التغييرات؟',
    confirmMessage: 'لديك تعديلات غير محفوظة في الملف الشخصي. هل أنت متأكد من الإغلاق؟',
  });

  if (!isOpen || !currentUser) return null;
  if (currentUser.role === 'cashier') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('يرجى إدخال الاسم المعروض.');
      return;
    }

    const nameChanged = trimmedName !== currentUser.displayName;

    if (!nameChanged && !changeSecurity) {
      onClose();
      return;
    }

    if (changeSecurity) {
      if (!currentSecret) {
        setError(
          securityType === 'pin'
            ? 'يرجى إدخال الرقم السري الحالي لتأكيد الهوية.'
            : 'يرجى إدخال كلمة المرور أو الرقم السري الحالي لتأكيد الهوية.'
        );
        return;
      }

      if (!newSecret) {
        setError(
          securityType === 'pin'
            ? 'يرجى كتابة الرقم السري الجديد.'
            : 'يرجى كتابة كلمة المرور الجديدة.'
        );
        return;
      }

      if (securityType === 'pin') {
        if (!isValidPinFormat(newSecret)) {
          setError('يجب أن يتكون الرقم السري من 4 إلى 8 أرقام فقط.');
          return;
        }
        if (isWeakPin(newSecret)) {
          setError('الرقم السري ضعيف وسهل التخمين. يرجى اختيار أرقام غير متتالية أو مكررة.');
          return;
        }
      } else {
        if (newSecret.length < 4) {
          setError('يجب ألا تقل كلمة المرور عن 4 أحرف أو أرقام.');
          return;
        }
      }

      if (newSecret !== confirmSecret) {
        setError(
          securityType === 'pin'
            ? 'الرقم السري وتأكيده غير متطابقين.'
            : 'كلمة المرور وتأكيدها غير متطابقين.'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1. Update display name if changed
      if (nameChanged) {
        await invoke('users:update', {
          id: currentUser.id,
          displayName: trimmedName,
        });
      }

      // 2. Update security credential if requested
      if (changeSecurity) {
        if (securityType === 'pin') {
          if (currentUser.id === STORE_OWNER_ID || currentUser.isOwner) {
            await invoke('security:setPin', {
              newPin: newSecret,
              currentPin: currentSecret,
            });
          } else {
            await invoke('users:changePin', {
              id: currentUser.id,
              newPin: newSecret,
              currentPin: currentSecret,
            });
          }
        } else {
          await invoke('users:setPassword', {
            userId: currentUser.id,
            newPassword: newSecret,
            currentPassword: currentSecret,
          });
        }
      }

      await refreshUser();

      const successText = nameChanged && changeSecurity
        ? 'تم تحديث الاسم وكلمة المرور بنجاح.'
        : nameChanged
        ? 'تم تحديث الاسم المعروض بنجاح.'
        : 'تم تغيير بيانات الأمان بنجاح.';

      setSuccess(successText);
      if (onSuccessToast) {
        onSuccessToast(successText);
      }

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'تعذر حفظ التعديلات.');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-title"
      dir="rtl"
    >
      <div
        className="w-full max-w-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 dark:border-brand-bright/20 shadow-2xs">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 id="user-profile-title" className="text-base font-extrabold text-ink dark:text-ink-dark m-0">
                الملف الشخصي وإعدادات الأمان
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5">
                تعديل الاسم المعروض لصاحب الحساب وتحديث كلمة المرور والرقم السري
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark transition-colors border border-transparent hover:border-line dark:hover:border-line-dark"
            aria-label="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[calc(85vh-7rem)]">
          {/* Status Banners */}
          {error && (
            <div className="p-3.5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-dark-border text-danger dark:text-danger-bright text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4.5 h-4.5 shrink-0" />
              <span className="font-semibold leading-relaxed">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid-dark-border text-paid dark:text-paid-bright text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
              <span className="font-semibold leading-relaxed">{success}</span>
            </div>
          )}

          {/* Account Overview Card */}
          <div className="p-3.5 rounded-xl bg-canvas dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-black text-sm flex items-center justify-center border border-paid/20">
                {currentUser.displayName ? currentUser.displayName.slice(0, 1) : 'U'}
              </span>
              <div>
                <div className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">اسم الدخول للمستخدم:</div>
                <div className="text-sm font-bold font-mono text-ink dark:text-ink-dark mt-0.5" dir="ltr">
                  @{currentUser.username}
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20">
              {getRoleLabel(currentUser)}
            </span>
          </div>

          {/* 1. Display Name Section */}
          <div className="space-y-1.5">
            <label htmlFor="user-display-name" className="block text-xs font-bold text-ink dark:text-ink-dark">
              الاسم المعروض <RequiredMark />
            </label>
            <input
              id="user-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark text-sm font-semibold focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-2 focus:ring-brand/20 shadow-2xs transition-all"
              placeholder="مثال: صاحب المحل أو اسمك الشخصي"
              maxLength={50}
              required
            />
            <p className="text-3xs text-ink-muted dark:text-ink-dark-muted mt-1 leading-normal">
              هذا الاسم يظهر في أعلى الشاشة الرئيسية وعلى إيصالات الطباعة وفواتير المبيعات.
            </p>
          </div>

          {/* 2. Security Section Toggle */}
          <div className="pt-2 border-t border-line dark:border-line-dark">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span className="text-xs font-bold text-ink dark:text-ink-dark">
                  تغيير كلمة المرور أو الرقم السري
                </span>
              </div>
              <button
                type="button"
                onClick={() => setChangeSecurity((prev) => !prev)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors border ${
                  changeSecurity
                    ? 'bg-brand text-white border-brand'
                    : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark hover:border-line-hover'
                }`}
              >
                {changeSecurity ? 'إلغاء التغيير' : 'تغيير الآن'}
              </button>
            </div>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                changeSecurity ? 'max-h-[35rem] opacity-100 mt-3.5' : 'max-h-0 opacity-0 mt-0 pointer-events-none'
              }`}
            >
              <div className="p-3.5 rounded-xl bg-canvas dark:bg-surface-dark-2 border border-line dark:border-line-dark space-y-3.5">
                {/* Security Type Selector (PIN vs Password) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityType('pin');
                      setNewSecret('');
                      setConfirmSecret('');
                      setError('');
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                      securityType === 'pin'
                        ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright border-brand/30 shadow-2xs'
                        : 'border-transparent text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>رقم سري سريع (4 - 8 أرقام)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityType('password');
                      setNewSecret('');
                      setConfirmSecret('');
                      setError('');
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                      securityType === 'password'
                        ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright border-brand/30 shadow-2xs'
                        : 'border-transparent text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>كلمة مرور نصية (أحرف وأرقام)</span>
                  </button>
                </div>

                {/* Current Secret */}
                <div className="space-y-1">
                  <label htmlFor="current-secret-input" className="block text-2xs font-bold text-ink dark:text-ink-dark">
                    {securityType === 'pin' ? 'الرقم السري الحالي' : 'كلمة المرور أو الرقم السري الحالي'} <RequiredMark />
                  </label>
                  <div className="relative">
                    <input
                      id="current-secret-input"
                      type={showCurrent ? 'text' : 'password'}
                      value={currentSecret}
                      onChange={(e) => setCurrentSecret(e.target.value)}
                      className="w-full h-9 pr-3 pl-10 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-xs text-right focus:outline-none focus:border-brand shadow-2xs"
                      placeholder="أدخل الرمز الحالي لتأكيد هويتك"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((p) => !p)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-1"
                      tabIndex={-1}
                      aria-label={showCurrent ? 'إخفاء' : 'إظهار'}
                    >
                      {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* New Secret */}
                <div className="space-y-1">
                  <label htmlFor="new-secret-input" className="block text-2xs font-bold text-ink dark:text-ink-dark">
                    {securityType === 'pin' ? 'الرقم السري الجديد (4 - 8 أرقام)' : 'كلمة المرور الجديدة (4 أحرف فأكثر)'} <RequiredMark />
                  </label>
                  <div className="relative">
                    <input
                      id="new-secret-input"
                      type={showNew ? 'text' : 'password'}
                      value={newSecret}
                      onChange={(e) => setNewSecret(e.target.value)}
                      className="w-full h-9 pr-3 pl-10 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-xs text-right focus:outline-none focus:border-brand shadow-2xs"
                      placeholder={securityType === 'pin' ? 'مثال: 5824' : 'أدخل كلمة المرور الجديدة'}
                      autoComplete="new-password"
                      maxLength={securityType === 'pin' ? 8 : 40}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((p) => !p)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-1"
                      tabIndex={-1}
                      aria-label={showNew ? 'إخفاء' : 'إظهار'}
                    >
                      {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Secret */}
                <div className="space-y-1">
                  <label htmlFor="confirm-secret-input" className="block text-2xs font-bold text-ink dark:text-ink-dark">
                    تأكيد الرمز الجديد <RequiredMark />
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-secret-input"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmSecret}
                      onChange={(e) => setConfirmSecret(e.target.value)}
                      className="w-full h-9 pr-3 pl-10 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-xs text-right focus:outline-none focus:border-brand shadow-2xs"
                      placeholder="أعد كتابة الرمز للتأكيد"
                      autoComplete="new-password"
                      maxLength={securityType === 'pin' ? 8 : 40}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((p) => !p)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-1"
                      tabIndex={-1}
                      aria-label={showConfirm ? 'إخفاء' : 'إظهار'}
                    >
                      {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-line dark:border-line-dark flex items-center justify-end gap-2.5">
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={requestClose}
              disabled={isSubmitting}
            >
              إلغاء
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
            >
              حفظ التعديلات
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
