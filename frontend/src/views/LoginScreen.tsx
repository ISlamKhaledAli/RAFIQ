import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { CustomSelect, type SelectOption } from '../components/CustomSelect';

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
  const [userPickerMode, setUserPickerMode] = useState<'auto' | 'dropdown' | 'buttons'>('auto');

  const passwordInputRef = useRef<HTMLInputElement>(null);

  const isDropdown = userPickerMode === 'dropdown' || (userPickerMode === 'auto' && activeUsers.length > 3);

  const userSelectOptions: SelectOption[] = useMemo(() => {
    return activeUsers.map((u) => ({
      value: u.username,
      label: u.displayName,
      badge: u.role === 'admin' ? 'صاحب المحل' : 'كاشير',
      icon: (
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
            u.role === 'admin'
              ? 'bg-paid-soft text-paid border border-paid-border'
              : 'bg-brand-soft text-brand border border-brand/20'
          }`}
        >
          {u.displayName.slice(0, 1)}
        </div>
      ),
    }));
  }, [activeUsers]);

  useEffect(() => {
    // Load active users for fast cashier selection
    invoke<UserDto[]>('auth:getActiveUsers')
      .then((users: UserDto[]) => {
        const nonRootUsers = (users || []).filter((u: UserDto) => u.role !== 'root');
        if (nonRootUsers.length > 0) {
          setActiveUsers(nonRootUsers);
          const defaultUser = nonRootUsers.find((u: UserDto) => u.role === 'admin') || nonRootUsers[0];
          setUsername(defaultUser.username);
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
      className="min-h-screen w-full flex items-center justify-center bg-canvas dark:bg-canvas-dark p-4 font-cairo select-none"
    >
      <div className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark overflow-hidden flex flex-col md:flex-row">
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

          <div className="pt-6 border-t border-white/15 text-xs text-emerald-200/80 flex items-center justify-between">
            <span className="font-medium">يعمل محلياً بالكامل بدون إنترنت</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              جاهز للعمل
            </span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="w-full md:w-7/12 p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-line dark:border-line-dark">
              <div>
                <h2 className="text-xl font-bold text-ink dark:text-ink-dark">تسجيل الدخول للنظام</h2>
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                  أدخل بيانات الحساب للمتابعة
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsNumericMode(!isNumericMode)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-strong text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors flex items-center gap-1 cursor-pointer"
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

            {/* Quick User Picker: Adaptive Dropdown or Quick Chips */}
            {activeUsers.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                    {isDropdown ? 'اختر حساب الموظف من القائمة:' : 'اختر موظفاً سريعاً:'}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                      ({activeUsers.length} موظف متاح)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setUserPickerMode((prev) => {
                          const currentIsDropdown = prev === 'dropdown' || (prev === 'auto' && activeUsers.length > 3);
                          return currentIsDropdown ? 'buttons' : 'dropdown';
                        })
                      }
                      className="text-[11px] font-bold text-brand dark:text-brand-bright hover:underline cursor-pointer"
                      title="التبديل بين القائمة المنسدلة والأزرار"
                    >
                      {isDropdown ? 'عرض كأزرار' : 'عرض كقائمة'}
                    </button>
                  </div>
                </div>

                {isDropdown ? (
                  <CustomSelect
                    value={activeUsers.some((u) => u.username.toLowerCase() === username.toLowerCase()) ? username : ''}
                    onChange={(val) => {
                      setUsername(val);
                      setPassword('');
                      setError('');
                      if (passwordInputRef.current) {
                        passwordInputRef.current.focus();
                      }
                    }}
                    options={userSelectOptions}
                    placeholder="اختر موظفاً للدخول السريع..."
                    className="w-full text-xs"
                    searchable={activeUsers.length > 5}
                  />
                ) : (
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
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-brand text-white border-brand shadow-sm'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark-strong'
                          }`}
                        >
                          <UserIcon className="w-3.5 h-3.5" />
                          <span>{u.displayName}</span>
                          {u.role === 'admin' ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isSelected ? 'bg-white/20 text-white' : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright'}`}>
                              صاحب المحل
                            </span>
                          ) : (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isSelected ? 'bg-white/20 text-white' : 'bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted'}`}>
                              كاشير
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-ink dark:text-ink-dark">
                    اسم المستخدم (أو كتابة يدوية)
                  </label>
                  {username && (
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('');
                        setPassword('');
                      }}
                      className="text-[11px] text-ink-muted dark:text-ink-dark-muted hover:text-danger cursor-pointer"
                    >
                      مسح
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ادخل اسم المستخدم يدوياً..."
                    disabled={lockoutSeconds > 0 || isSubmitting}
                    className="w-full h-11 pr-10 pl-4 rounded-xl border border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright focus:ring-2 focus:ring-brand-soft dark:focus:ring-brand-soft/20 bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark text-sm transition-all"
                  />
                  <UserIcon className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink-dark mb-1.5">
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
                    className="w-full h-11 pr-10 pl-11 rounded-xl border border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright focus:ring-2 focus:ring-brand-soft dark:focus:ring-brand-soft/20 bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark text-sm transition-all"
                    autoFocus
                  />
                  <Lock className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3.5 top-3.5 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute left-3 top-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer"
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
                        className="h-11 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark font-bold text-lg border border-line dark:border-line-dark transition-colors active:scale-95 cursor-pointer"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleKeypadClear}
                      disabled={lockoutSeconds > 0}
                      className="h-11 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted font-medium text-xs border border-line dark:border-line-dark transition-colors flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      title="مسح الكل"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      مسح
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      disabled={lockoutSeconds > 0}
                      className="h-11 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark font-bold text-lg border border-line dark:border-line-dark transition-colors active:scale-95 cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleKeypadBackspace}
                      disabled={lockoutSeconds > 0}
                      className="h-11 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark transition-colors flex items-center justify-center active:scale-95 cursor-pointer"
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
                className="w-full h-11 mt-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
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
        </div>
      </div>
    </div>
  );
};
