import React, { useState } from 'react';
import { ShieldAlert, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { UserDto } from '../bridge/ipc';
import { isWeakPin, isValidPinFormat } from '../utils/pinPolicy';

interface ForcedPinChangeFormProps {
  user: UserDto;
  /** PIN typed at login; when absent the form asks for it (e.g. after an app restart). */
  currentPin?: string;
  onPinChanged: (updatedUser: UserDto) => void;
}

// Only the store owner account carries the store-wide PIN (security:setPin); every other account uses users:changePin.
const STORE_OWNER_ID = 'usr_admin_default';

export const ForcedPinChangeForm: React.FC<ForcedPinChangeFormProps> = ({ user, currentPin, onPinChanged }) => {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // A session opened with the owner recovery code already proved identity, so the forgotten PIN is not asked for
  const needsOldPin = !currentPin && !user.isRecoverySession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidPinFormat(newPin)) {
      setError('يجب أن يتكون الرقم السري من 4 إلى 8 أرقام فقط.');
      return;
    }
    if (isWeakPin(newPin)) {
      setError('الرقم السري ضعيف وسهل التخمين. يرجى اختيار رقم سري أقوى (غير مكرر أو متتالي).');
      return;
    }
    if (newPin !== newPinConfirm) {
      setError('الرقم السري وتأكيده غير متطابقين.');
      return;
    }
    const effectiveOldPin = currentPin || oldPin;
    if (!effectiveOldPin && !user.isRecoverySession) {
      setError('يرجى إدخال الرقم السري الحالي.');
      return;
    }

    setSaving(true);
    try {
      const currentPinPayload = effectiveOldPin || undefined;
      if (user.id === STORE_OWNER_ID) {
        await invoke('security:setPin', { newPin, currentPin: currentPinPayload });
      } else {
        await invoke('users:changePin', { id: user.id, newPin, currentPin: currentPinPayload });
      }
      setNewPin('');
      setNewPinConfirm('');
      setOldPin('');
      onPinChanged({ ...user, mustChangePin: false });
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'حدث خطأ أثناء حفظ الرقم السري.');
    } finally {
      setSaving(false);
    }
  };

  const pinInputClass =
    'w-full h-11 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark text-center text-lg font-mono tracking-widest focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-2xs';

  return (
    <div className="p-6 bg-canvas dark:bg-canvas-dark flex flex-col gap-5" dir="rtl">
      <div className="p-4 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-dark-soft text-warn dark:text-warn-bright flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <span className="font-bold block text-sm mb-1 text-ink dark:text-ink-dark">تنبيه حماية الحساب والبيانات:</span>
          الحساب الحالي ({user.displayName}) مسجل برقم سري مبدئي أو مؤقت. لحماية حسابك ومنع أي شخص من التلاعب بالأسعار أو الحسابات،
          يرجى كتابة رقم سري جديد وخاص بك (يتكون من 4 إلى 8 أرقام غير متتالية) قبل استخدام البرنامج.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md mx-auto w-full">
        {needsOldPin && (
          <div>
            <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">الرقم السري الحالي</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={oldPin}
              onChange={(e) => {
                setOldPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              className={pinInputClass}
              autoFocus
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">الرقم السري الجديد (4 إلى 8 أرقام)</label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={newPin}
            onChange={(e) => {
              setNewPin(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            className={pinInputClass}
            autoFocus={!needsOldPin}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">تأكيد الرقم السري الجديد</label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={newPinConfirm}
            onChange={(e) => {
              setNewPinConfirm(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            className={pinInputClass}
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 dark:bg-danger-dark-soft border border-danger/20 dark:border-danger/30 text-danger dark:text-danger-bright text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !newPin || !newPinConfirm || (needsOldPin && !oldPin)}
          className="w-full h-11 rounded-xl bg-brand dark:bg-brand-container hover:bg-brand-dark dark:hover:bg-brand text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التحديث والتأمين...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>حفظ ومتابعة الدخول</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
