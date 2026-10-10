import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
  Store,
  ShieldCheck,
  Delete,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { invoke, type UserDto } from '../bridge/ipc';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeUsers, setActiveUsers] = useState<UserDto[]>([]);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [isNumericMode, setIsNumericMode] = useState<boolean>(false);
  const [storeName, setStoreName] = useState<string>('متجر رفيق');

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load active users for fast cashier selection
    invoke<UserDto[]>('auth:getActiveUsers')
      .then((users: UserDto[]) => {
        if (users && users.length > 0) {
          setActiveUsers(users);
          // Default to first user or root
          const rootOrAdmin = users.find((u: UserDto) => u.role === 'root') || users[0];
          setUsername(rootOrAdmin.username);
        }
      })
      .catch(() => {});

    // Load store profile name
    invoke<any>('settings:getStoreProfile')
      .then((profile: any) => {
        if (profile?.storeName) {
          setStoreName(profile.storeName);
        }
      })
      .catch(() => {});
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim()) {
      setError('يرجى إدخال أو اختيار اسم المستخدم.');
      return;
    }
    if (!password) {
      setError('يرجى إدخال كلمة المرور أو الرقم السري.');
      return;
    }
    if (lockoutSeconds > 0) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await login(username.trim(), password);
      if (!res.success) {
        if (res.isLocked && res.remainingLockoutSeconds) {
          setLockoutSeconds(res.remainingLockoutSeconds);
        }
        setError(res.message || 'بيانات الدخول غير صحيحة.');
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (lockoutSeconds > 0) return;
    setPassword((prev) => prev + digit);
  };

  const handleKeypadBackspace = () => {
    setPassword((prev) => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setPassword('');
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full flex items-center justify-center bg-canvas p-4 font-cairo select-none"
    >
      <div className="w-full max-w-4xl bg-surface rounded-2xl shadow-xl border border-line overflow-hidden flex flex-col md:flex-row">
        {/* Left Branding Panel */}
        <div className="w-full md:w-5/12 bg-gradient-to-br from-brand-dark to-brand p-8 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute right-0 top-0 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                <Store className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight tracking-wide">
                  رفيق POS
                </h1>
                <p className="text-xs text-emerald-200/80">نظام نقاط البيع وإدارة المتاجر</p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="p-4 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm">
                <p className="text-xs text-emerald-100 font-medium mb-1">المتجر الحالي:</p>
                <p className="text-lg font-bold text-white truncate">{storeName}</p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-emerald-100/90 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                  <span>نظام أمان وتفويض هرمي محمي بالكامل</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                  <span>تسجيل دخول فوري وسريع بنقرة واحدة</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/15 text-xs text-emerald-200/70 flex items-center justify-between">
            <span>العمل بدون إنترنت (Offline-First)</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              جاهز
            </span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="w-full md:w-7/12 p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-line">
              <div>
                <h2 className="text-xl font-bold text-ink">تسجيل الدخول للنظام</h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  أدخل بيانات الحساب للمتابعة
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsNumericMode(!isNumericMode)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-line hover:border-line-hover text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
                title="التبديل بين وضع لوحة الأرقام والكيبورد العادي"
              >
                <span>{isNumericMode ? 'وضع الكيبورد' : 'لوحة الأرقام'}</span>
              </button>
            </div>

            {/* Error or Lockout Alert */}
            {lockoutSeconds > 0 ? (
              <div className="mb-4 p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 flex-shrink-0 animate-bounce" />
                <div>
                  <p className="font-semibold">النظام مقفل مؤقتاً لحماية الأمان</p>
                  <p className="text-xs mt-0.5">
                    يرجى الانتظار <span className="font-bold underline">{lockoutSeconds}</span> ثانية قبل المحاولة مجدداً.
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="mb-4 p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Quick User Picker */}
            {activeUsers.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-semibold text-ink-muted mb-2">
                  اختر موظفاً سريعاً:
                </label>
                <div className="flex flex-wrap gap-2">
                  {activeUsers.map((u) => {
                    const isSelected = username.toLowerCase() === u.username.toLowerCase();
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setUsername(u.username);
                          setPassword('');
                          setError('');
                          if (passwordInputRef.current) {
                            passwordInputRef.current.focus();
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-sm'
                            : 'bg-surface-2 text-ink border-line hover:border-line-hover'
                        }`}
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                        <span>{u.displayName}</span>
                        {u.role === 'root' && (
                          <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-brand-soft text-brand'}`}>
                            Root
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  اسم المستخدم
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ادخل اسم المستخدم..."
                    disabled={lockoutSeconds > 0 || isSubmitting}
                    className="w-full h-11 pr-10 pl-4 rounded-xl border border-line focus:border-brand focus:ring-2 focus:ring-brand-soft bg-surface text-ink text-sm transition-all"
                  />
                  <UserIcon className="w-4 h-4 text-ink-muted absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  كلمة المرور أو الرقم السري
                </label>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="ادخل كلمة المرور أو PIN..."
                    disabled={lockoutSeconds > 0 || isSubmitting}
                    className="w-full h-11 pr-10 pl-11 rounded-xl border border-line focus:border-brand focus:ring-2 focus:ring-brand-soft bg-surface text-ink text-sm transition-all"
                    autoFocus
                  />
                  <Lock className="w-4 h-4 text-ink-muted absolute right-3.5 top-3.5 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute left-3 top-3 text-ink-muted hover:text-ink transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* On-Screen Numeric Keypad (for touch POS terminals) */}
              {isNumericMode && (
                <div className="pt-2">
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleKeypadPress(digit)}
                        disabled={lockoutSeconds > 0}
                        className="h-11 rounded-xl bg-surface-2 hover:bg-line text-ink font-bold text-lg border border-line transition-colors active:scale-95"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleKeypadClear}
                      disabled={lockoutSeconds > 0}
                      className="h-11 rounded-xl bg-surface-2 hover:bg-line text-ink-muted font-medium text-xs border border-line transition-colors flex items-center justify-center gap-1 active:scale-95"
                      title="مسح الكل"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      مسح
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      disabled={lockoutSeconds > 0}
                      className="h-11 rounded-xl bg-surface-2 hover:bg-line text-ink font-bold text-lg border border-line transition-colors active:scale-95"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleKeypadBackspace}
                      disabled={lockoutSeconds > 0}
                      className="h-11 rounded-xl bg-surface-2 hover:bg-line text-ink-muted border border-line transition-colors flex items-center justify-center active:scale-95"
                      title="مسح رقم"
                    >
                      <Delete className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={lockoutSeconds > 0 || isSubmitting}
                className="w-full h-11 mt-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98"
              >
                {isSubmitting ? (
                  <span>جاري تسجيل الدخول...</span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>دخول إلى النظام</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="pt-4 mt-6 border-t border-line text-center">
            <p className="text-[11px] text-ink-muted">
              حساب الـ Root يملك كافة الصلاحيات • كلمة المرور الافتراضية للمدير الأول هي 1234 أو admin
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
