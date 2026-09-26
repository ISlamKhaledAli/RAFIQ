import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '../bridge/ipc';
import type { UserDto, LoginResult } from '../bridge/ipc';

interface LoginModalProps {
  isOpen: boolean;
  onSuccess: (user: UserDto) => void;
  canCancel?: boolean;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onSuccess,
  canCancel = false,
  onClose,
}) => {
  const [activeUsers, setActiveUsers] = useState<UserDto[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockoutSec, setLockoutSec] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLocked = lockoutSec > 0;

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  // Fetch active users on mount/open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const fetchUsers = async () => {
      try {
        const users: UserDto[] = await invoke('auth:getActiveUsers');
        if (!isMounted) return;
        setActiveUsers(users || []);
        if (users && users.length > 0) {
          const defaultPick = users.find((u) => u.role === 'cashier') || users[0];
          setSelectedUser(defaultPick);
          if (defaultPick.isLocked && defaultPick.remainingLockoutSeconds) {
            setLockoutSec(defaultPick.remainingLockoutSeconds);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err?.message || 'تعذر تحميل قائمة الموظفين');
      }
    };
    void fetchUsers();
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
  };

  const handleBackspace = () => {
    if (isLocked || loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    if (isLocked || loading) return;
    setPin('');
    setError('');
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleNumberClick(e.key);
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape' && canCancel && onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      dir="rtl"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="bg-[#0b141d] border border-slate-700/70 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#00372d] px-6 py-4 flex items-center justify-between border-b border-emerald-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">تسجيل دخول الموظف</h2>
              <p className="text-xs text-emerald-300/80">اختر حسابك وأدخل الرقم السري لبدء العمل</p>
            </div>
          </div>
          {canCancel && onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="إغلاق"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content Body: Left Employee Picker, Right Tactile PIN Pad */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-[#0e1a26]">
          {/* Employee Selector Column (5 cols) */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              الموظفون النشطون ({activeUsers.length})
            </label>
            <div className="flex-1 max-h-[340px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {activeUsers.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm bg-slate-900/50 rounded-xl border border-slate-800">
                  لا يوجد موظفون نشطون مسجلون.
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
                      className={`w-full text-right p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-950/60 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                            isAdmin
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {user.displayName.slice(0, 1)}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{user.displayName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">@{user.username}</div>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                          isAdmin
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isAdmin ? 'مدير' : 'كاشير'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* PIN Input & Tactile Keypad (7 cols) */}
          <div className="md:col-span-7 flex flex-col justify-between bg-slate-900/70 p-4 rounded-xl border border-slate-800">
            {/* PIN Display & Lockout Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  الرقم السري لـ: <span className="text-emerald-400 font-bold">{selectedUser?.displayName || 'الموظف'}</span>
                </span>
                {selectedUser?.role && (
                  <span className="text-[11px] text-slate-400">
                    الدور: {selectedUser.role === 'admin' ? 'مدير كامل الصلاحيات' : 'كاشير نقطة البيع'}
                  </span>
                )}
              </div>

              {/* Secret Dots Display */}
              <div className="bg-[#070d14] border border-slate-700/80 rounded-xl p-3.5 flex items-center justify-center h-14 mb-3">
                {isLocked ? (
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                    <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>الحساب مقفل: انتظر {lockoutSec} ثانية</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {[0, 1, 2, 3].map((idx) => {
                      const filled = idx < pin.length;
                      return (
                        <div
                          key={idx}
                          className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                            filled
                              ? 'bg-emerald-400 scale-125 shadow-sm shadow-emerald-400/50'
                              : 'bg-slate-700/80'
                          }`}
                        />
                      );
                    })}
                    {pin.length > 4 && (
                      <span className="text-xs text-emerald-400 font-mono font-bold mr-1">
                        +{pin.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs px-3 py-2 rounded-lg mb-3 flex items-center gap-2">
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
                  className="h-12 bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-lg rounded-xl border border-slate-700 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {digit}
                </button>
              ))}

              {/* Clear Button */}
              <button
                type="button"
                disabled={isLocked || loading || pin.length === 0}
                onClick={handleClear}
                className="h-12 bg-slate-800/60 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl border border-slate-700 active:scale-95 transition-all disabled:opacity-40"
              >
                مسح
              </button>

              {/* Zero */}
              <button
                type="button"
                disabled={isLocked || loading}
                onClick={() => handleNumberClick('0')}
                className="h-12 bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-lg rounded-xl border border-slate-700 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                0
              </button>

              {/* Backspace */}
              <button
                type="button"
                disabled={isLocked || loading || pin.length === 0}
                onClick={handleBackspace}
                className="h-12 bg-slate-800/60 hover:bg-slate-700 text-rose-300 font-bold text-xs rounded-xl border border-slate-700 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
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
              className="w-full mt-2 py-3 bg-[#006d41] hover:bg-[#008751] active:bg-[#005734] text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span>جاري التحقق...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>دخول النظام (Enter)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="px-6 py-2.5 bg-[#070d14] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>الافتراضي: المدير (1234) — الكاشير (0000)</span>
          <span>يدعم لوحة الأرقام المادية (Numpad) وزر Enter</span>
        </div>
      </div>
    </div>
  );
};
