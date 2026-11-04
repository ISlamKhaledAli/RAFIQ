import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '../bridge/ipc';
import type { UserDto, LoginResult } from '../bridge/ipc';
import { UserManagerModal } from './UserManagerModal';
import { SupervisorPromptModal } from './SupervisorPromptModal';
import { ShieldCheck, Keyboard, ShieldAlert } from 'lucide-react';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { ForcedPinChangeForm } from './ForcedPinChangeForm';
import { getRoleLabel } from '../utils/roleLabels';

interface LoginModalProps {
  isOpen: boolean;
  onSuccess: (user: UserDto) => void;
  canCancel?: boolean;
  onClose?: () => void;
  onOpenUserManager?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onSuccess,
  canCancel = false,
  onClose,
  onOpenUserManager,
}) => {
  const [activeUsers, setActiveUsers] = useState<UserDto[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [isInternalUserManagerOpen, setIsInternalUserManagerOpen] = useState(false);
  const [isSupervisorPromptOpen, setIsSupervisorPromptOpen] = useState(false);
  const [verifiedSupervisorPin, setVerifiedSupervisorPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Forced PIN change state (F-37 Security Hardening)
  const [forceChangePinUser, setForceChangePinUser] = useState<UserDto | null>(null);
  const [oldPinEntered, setOldPinEntered] = useState('');

  const isLocked = lockoutSec > 0;

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  // Fetch active users when needed
  const fetchUsers = useCallback(async () => {
    try {
      const users: UserDto[] = await invoke('auth:getActiveUsers');
      const filtered = (users || []).filter((u) => u.role !== 'root');
      setActiveUsers(filtered);
      if (filtered.length > 0) {
        setSelectedUser((current) => {
          if (current && filtered.some((u) => u.id === current.id)) return current;
          return filtered.find((u) => u.role === 'cashier') || filtered[0];
        });
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل قائمة الموظفين');
    }
  }, []);

  // Fetch active users on mount/open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    void invoke<UserDto[]>('auth:getActiveUsers')
      .then((users) => {
        if (!isMounted) return;
        const filtered = (users || []).filter((u) => u.role !== 'root');
        setActiveUsers(filtered);
        if (filtered.length > 0) {
          const defaultPick = filtered.find((u) => u.role === 'cashier') || filtered[0];
          setSelectedUser(defaultPick);
          if (defaultPick.isLocked && defaultPick.remainingLockoutSeconds) {
            setLockoutSec(defaultPick.remainingLockoutSeconds);
          }
        }
      })
      .catch((err: any) => {
        if (isMounted) setError(err?.message || 'تعذر تحميل قائمة الموظفين');
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Focus hidden input for physical keyboard entry
  useEffect(() => {
    if (isOpen && selectedUser && !isLocked) {
      inputRef.current?.focus();
    }
  }, [isOpen, selectedUser, isLocked]);

  const handleSelectUser = (user: UserDto) => {
    setSelectedUser(user);
    setPin('');
    setError('');
    if (user.isLocked && user.remainingLockoutSeconds) {
      setLockoutSec(user.remainingLockoutSeconds);
    } else {
      setLockoutSec(0);
    }
  };

  const handleNumberClick = (digit: string) => {
    if (isLocked || loading || pin.length >= 8) return;
    setPin((prev) => prev + digit);
    setError('');
    inputRef.current?.focus();
  };

  const handleBackspace = () => {
    if (isLocked || loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError('');
    inputRef.current?.focus();
  };

  const handleClear = () => {
    if (isLocked || loading) return;
    setPin('');
    setError('');
    inputRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedUser || isLocked || loading) return;
    if (!pin) {
      setError('يرجى إدخال الرقم السري');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result: LoginResult = await invoke('auth:login', {
        usernameOrId: selectedUser.id,
        pin,
      });

      if (result.success && result.user) {
        if (result.user.mustChangePin || result.mustChangePin) {
          setForceChangePinUser(result.user);
          setOldPinEntered(pin);
          setPin('');
          setError('');
          return;
        }
        setPin('');
        setError('');
        onSuccess(result.user);
      } else {
        if (result.isLocked && result.remainingLockoutSeconds) {
          setLockoutSec(result.remainingLockoutSeconds);
        }
        setError(result.message || 'الرقم السري غير صحيح');
        setPin('');
      }
    } catch (err: any) {
      setError(err?.message || 'فشل تسجيل الدخول');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleForcedPinChanged = (updatedUser: UserDto) => {
    setForceChangePinUser(null);
    setOldPinEntered('');
    onSuccess(updatedUser);
  };

  const handleDismiss = () => {
    if (canCancel && onClose && !forceChangePinUser) {
      setPin('');
      setError('');
      onClose();
    }
  };

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && Boolean(canCancel && onClose) && !isInternalUserManagerOpen && !isSupervisorPromptOpen && !forceChangePinUser,
    onDismiss: handleDismiss,
    isDirty: false,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleNumberClick(e.key);
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      dir="rtl"
      onKeyDown={handleKeyDown}
      onClick={canCancel && onClose ? handleBackdropClick : undefined}
      tabIndex={0}
    >
      <div 
        className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sleek Top Accent Line */}
        <div className="h-1.5 w-full bg-brand dark:bg-brand-bright" />

        {/* Modern Clean Header */}
        <div className="bg-surface dark:bg-surface-dark-2 px-6 py-4 flex items-center justify-between border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs border ${
              forceChangePinUser 
                ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-dark-soft text-warn dark:text-warn-bright' 
                : 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright'
            }`}>
              {forceChangePinUser ? (
                <ShieldAlert className="w-5 h-5 text-warn dark:text-warn-bright" />
              ) : (
                <svg className="w-5 h-5 text-paid dark:text-paid-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark">
                {forceChangePinUser ? 'تحديث أمني إلزامي: تعيين رقم سري جديد' : 'تسجيل دخول الكاشير والموظفين'}
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">
                {forceChangePinUser 
                  ? 'يجب تغيير الرقم السري الافتراضي للمالك لتأمين المحل قبل المتابعة' 
                  : 'اختار حسابك واكتب الرقم السري لبدء الشغل'}
              </p>
            </div>
          </div>
          {canCancel && onClose && !forceChangePinUser && (
            <button
              onClick={requestClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content Body */}
        {forceChangePinUser ? (
          <ForcedPinChangeForm
            user={forceChangePinUser}
            currentPin={oldPinEntered}
            onPinChanged={handleForcedPinChanged}
          />
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-canvas dark:bg-canvas-dark">
          {/* Employee Selector Column (5 cols) */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <label className="text-xs font-bold text-ink dark:text-ink-dark">
              الموظفون والكاشير في المحل ({activeUsers.length})
            </label>
            <div className="flex-1 max-h-[340px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {activeUsers.length === 0 ? (
                <div className="p-6 text-center text-ink-muted dark:text-ink-dark-muted text-sm bg-surface dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
                  مفيش حسابات موظفين نشطة مسجلة.
                </div>
              ) : (
                activeUsers.map((user) => {
                  const isSelected = selectedUser?.id === user.id;
                  const isAdmin = user.role === 'admin';
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className={`w-full text-right p-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand dark:border-brand-bright shadow-xs ring-1 ring-brand/50 dark:ring-brand-bright/50'
                          : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:bg-surface-2 dark:hover:bg-surface-dark-3'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                            isAdmin
                              ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-dark-soft'
                              : 'bg-brand-soft dark:bg-surface-dark-3 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand/30'
                          }`}
                        >
                          {user.displayName.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-ink dark:text-ink-dark text-sm whitespace-nowrap truncate">{user.displayName}</div>
                          <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono whitespace-nowrap truncate">@{user.username}</div>
                        </div>
                      </div>
                      <span
                        className={`text-micro px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 ${
                          isAdmin
                            ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-dark-soft'
                            : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border'
                        }`}
                      >
                        {getRoleLabel(user)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Admin-Only Staff Management (Requires Admin PIN) */}
            <div className="mt-3 pt-2 border-t border-line dark:border-line-dark">
              <button
                type="button"
                onClick={() => {
                  if (onOpenUserManager) {
                    onOpenUserManager();
                  } else {
                    setIsSupervisorPromptOpen(true);
                  }
                }}
                className="w-full py-2 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright text-micro font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="تتطلب إدخال الرقم السري لمدير النظام"
              >
                <svg className="w-3.5 h-3.5 text-warn dark:text-warn-bright shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>إدارة حسابات الموظفين (برقم المدير السري)</span>
              </button>
            </div>
          </div>

          {/* PIN Input & Tactile Keypad (7 cols) */}
          <div className="md:col-span-7 flex flex-col justify-between bg-surface dark:bg-surface-dark-2 p-4 rounded-xl border border-line dark:border-line-dark shadow-xs">
            {/* PIN Display & Lockout Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                  الرقم السري لـ: <span className="text-brand dark:text-brand-bright font-bold">{selectedUser?.displayName || 'الكاشير'}</span>
                </span>
                {selectedUser?.role && (
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted">
                    الصلاحية: {getRoleLabel(selectedUser)}
                  </span>
                )}
              </div>

              {/* Masked PIN input */}
              <div className="bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-xl p-3.5 flex items-center justify-center h-14 mb-3">
                {isLocked ? (
                  <div className="flex items-center gap-2 text-danger dark:text-danger-bright font-bold text-sm">
                    <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>الحساب موقوف مؤقتاً: استنى {lockoutSec} ثانية</span>
                  </div>
                ) : (
                  <input
                    ref={inputRef}
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    autoFocus
                    autoComplete="off"
                    aria-label="الرقم السري (PIN)"
                    value={pin}
                    readOnly={loading}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                      setError('');
                    }}
                    onKeyDown={(e) => {
                      // Only stop keys the global handler would double-count; Escape and F-keys must still bubble
                      if (/^[0-9]$/.test(e.key) || e.key === 'Backspace' || e.key === 'Enter') {
                        e.stopPropagation();
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSubmit();
                      }
                    }}
                    className="w-full h-full bg-transparent text-center text-ink dark:text-ink-dark text-xl font-mono caret-brand dark:caret-brand-bright focus:outline-none"
                  />
                )}
              </div>

              {error && (
                <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger/30 text-danger dark:text-danger-bright text-xs px-3 py-2 rounded-lg mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Tactile 3x4 POS Keypad */}
            <div className="grid grid-cols-3 gap-2 my-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={isLocked || loading}
                  onClick={() => handleNumberClick(digit)}
                  className="h-12 bg-canvas dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark font-bold text-lg rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {digit}
                </button>
              ))}

              {/* Clear Button */}
              <button
                type="button"
                disabled={isLocked || loading || pin.length === 0}
                onClick={handleClear}
                className="h-12 bg-canvas dark:bg-surface-dark-3 hover:bg-warn-soft dark:hover:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold text-xs rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all disabled:opacity-40"
              >
                مسح
              </button>

              {/* Zero */}
              <button
                type="button"
                disabled={isLocked || loading}
                onClick={() => handleNumberClick('0')}
                className="h-12 bg-canvas dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark font-bold text-lg rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                0
              </button>

              {/* Backspace */}
              <button
                type="button"
                disabled={isLocked || loading || pin.length === 0}
                onClick={handleBackspace}
                className="h-12 bg-canvas dark:bg-surface-dark-3 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright font-bold text-xs rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                </svg>
              </button>
            </div>

            {/* Submit Action */}
            <button
              type="button"
              disabled={isLocked || loading || !pin}
              onClick={() => handleSubmit()}
              className="w-full mt-2 py-3 bg-brand dark:bg-brand-container hover:bg-brand-hover dark:hover:bg-brand active:bg-brand-dark text-white font-bold text-base rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span>بيتم التحقق...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>دخول وبدء البيع (Enter)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

        {/* Footer Guidance */}
        <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted">
          <div className="flex items-center gap-1.5 font-medium text-paid dark:text-paid-bright">
            <ShieldCheck className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span>تسجيل دخول آمن ومحمي بالصلاحيات</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-ink-muted dark:text-ink-dark-muted">
            <Keyboard className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
            <span>يدعم أرقام الكيبورد وزر Enter مباشرة</span>
          </div>
        </div>
      </div>

      {/* Supervisor PIN Check Before Opening User Manager */}
      <SupervisorPromptModal
        isOpen={isSupervisorPromptOpen}
        actionTitle="إدارة حسابات الموظفين والكاشيرات"
        actionDescription="هذه الشاشة محمية بكلمة مرور المدير. يرجى إدخال الرقم السري لمدير النظام لتفادي أي تعديل غير مصرح به على الحسابات."
        onApproved={(_supervisorName, approvedPin) => {
          setIsSupervisorPromptOpen(false);
          setVerifiedSupervisorPin(approvedPin || '');
          setIsInternalUserManagerOpen(true);
        }}
        onCancel={() => setIsSupervisorPromptOpen(false)}
      />

      {/* Internal User & Cashier Manager Modal */}
      <UserManagerModal
        isOpen={isInternalUserManagerOpen}
        supervisorPin={verifiedSupervisorPin}
        onClose={() => {
          setIsInternalUserManagerOpen(false);
          setVerifiedSupervisorPin('');
          void fetchUsers();
        }}
        onUsersChanged={() => {
          void fetchUsers();
        }}
      />
    </div>
  );
};
