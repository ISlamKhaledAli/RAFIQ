import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '../bridge/ipc';
import type { UserDto } from '../bridge/ipc';

interface UserManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsersChanged?: () => void;
  supervisorPin?: string;
  currentUser?: UserDto | null;
}

export const UserManagerModal: React.FC<UserManagerModalProps> = ({
  isOpen,
  onClose,
  onUsersChanged,
  supervisorPin,
  currentUser,
}) => {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Mode: 'list' | 'add' | 'edit' | 'reset_pin'
  const [mode, setMode] = useState<'list' | 'add' | 'edit' | 'reset_pin'>('list');
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);

  // Form fields
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [isActive, setIsActive] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list: UserDto[] = await invoke('users:getAll', supervisorPin ? { supervisorPin } : undefined);
      setUsers(list || []);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل قائمة الموظفين');
    } finally {
      setLoading(false);
    }
  }, [supervisorPin]);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    invoke('users:getAll', supervisorPin ? { supervisorPin } : undefined)
      .then((list: any) => {
        if (isMounted) setUsers(list || []);
      })
      .catch((err: any) => {
        if (isMounted) setError(err?.message || 'تعذر تحميل قائمة الموظفين');
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, supervisorPin]);

  const handleStartAdd = () => {
    setUsername('');
    setDisplayName('');
    setRole('cashier');
    setPin('');
    setConfirmPin('');
    setCurrentPin('');
    setIsActive(true);
    setSelectedUser(null);
    setMode('add');
    setError('');
    setSuccessMsg('');
  };

  const handleStartEdit = (user: UserDto) => {
    setSelectedUser(user);
    setUsername(user.username);
    setDisplayName(user.displayName);
    setRole(user.role);
    setIsActive(user.isActive);
    setCurrentPin('');
    setPin('');
    setConfirmPin('');
    setMode('edit');
    setError('');
    setSuccessMsg('');
  };

  const handleStartResetPin = (user: UserDto) => {
    setSelectedUser(user);
    setPin('');
    setConfirmPin('');
    setCurrentPin('');
    setMode('reset_pin');
    setError('');
    setSuccessMsg('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) {
      setError('يرجى ملء كافة البيانات المطلوبة');
      return;
    }
    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError('يجب أن يتكون الرقم السري من 4 إلى 8 أرقام');
      return;
    }
    if (pin !== confirmPin) {
      setError('الرقم السري وتأكيد الرقم السري غير متطابقين');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await invoke('users:create', {
        username: username.trim(),
        displayName: displayName.trim(),
        pin,
        role,
        supervisorPin: supervisorPin || undefined,
      });
      setSuccessMsg(`تمت إضافة ${role === 'admin' ? 'مدير النظام' : 'الكاشير'} (${displayName}) بنجاح`);
      await loadUsers();
      setMode('list');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل إنشاء حساب الموظف');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !displayName.trim()) {
      setError('اسم الموظف مطلوب');
      return;
    }

    if (selectedUser.role === 'admin' && role !== 'admin') {
      setError('لا يمكن تخفيض صلاحيات حساب المدير إلى كاشير.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await invoke('users:update', {
        id: selectedUser.id,
        displayName: displayName.trim(),
        role: selectedUser.role === 'admin' ? 'admin' : role,
        isActive: selectedUser.role === 'admin' ? true : isActive,
        supervisorPin: supervisorPin || undefined,
      });
      setSuccessMsg('تم تحديث بيانات الموظف بنجاح');
      await loadUsers();
      setMode('list');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تحديث بيانات الموظف');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (selectedUser.role === 'admin' && !currentPin && !supervisorPin) {
      setError('يرجى إدخال الرقم السري الحالي لمدير النظام لتأكيد الهوية');
      return;
    }

    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError('يجب أن يتكون الرقم السري الجديد من 4 إلى 8 أرقام');
      return;
    }

    if (pin !== confirmPin) {
      setError('الرقم السري الجديد وتأكيده غير متطابقين');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await invoke('users:changePin', {
        id: selectedUser.id,
        newPin: pin,
        currentPin: currentPin || undefined,
        supervisorPin: supervisorPin || undefined,
      });
      setSuccessMsg(`تم تعيين رقم سري جديد للموظف (${selectedUser.displayName}) بنجاح`);
      await loadUsers();
      setMode('list');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تغيير الرقم السري');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (user: UserDto) => {
    if (user.role === 'admin') {
      setError('حساب مدير النظام الرئيسي محمي ولا يمكن تعطيله.');
      return;
    }

    try {
      await invoke('users:update', {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        isActive: !user.isActive,
        supervisorPin: supervisorPin || undefined,
      });
      await loadUsers();
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تعديل حالة الحساب');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-[#0b141d] border border-slate-700/70 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#00372d] px-6 py-4 flex items-center justify-between border-b border-emerald-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-wide">إدارة حسابات الموظفين ونقاط البيع</h2>
                <span className="bg-emerald-900/60 text-emerald-300 text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-emerald-700/50">
                  صلاحيات مدير النظام
                </span>
              </div>
              <p className="text-xs text-emerald-300/80">إضافة وتعديل الكاشيرات، وتعيين الأرقام السرية بصلاحيات محمية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="إغلاق"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="bg-rose-950/70 border-b border-rose-800 text-rose-300 px-6 py-2.5 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')} className="text-rose-400 hover:text-white font-bold">×</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-950/70 border-b border-emerald-800 text-emerald-300 px-6 py-2.5 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-white font-bold">×</button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 bg-[#0e1a26] overflow-y-auto flex-1 custom-scrollbar">
          {mode === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">الموظفون المسجلون في النظام</h3>
                  <p className="text-xs text-slate-400">يمكنك إضافة كاشير جديد، تعديل الأسماء، أو إعادة تعيين الأرقام السرية</p>
                </div>
                <button
                  onClick={handleStartAdd}
                  className="px-4 py-2 bg-[#006d41] hover:bg-[#008751] text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>إضافة كاشير / موظف جديد</span>
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070d14]">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-900/90 text-slate-400 text-xs uppercase border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">الموظف</th>
                      <th className="px-4 py-3">اسم الدخول</th>
                      <th className="px-4 py-3">الدور / الصلاحية</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">آخر تسجيل دخول</th>
                      <th className="px-4 py-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {loading && users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          جاري تحميل الموظفين...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          لا يوجد موظفون مسجلون.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const isAdmin = u.role === 'admin';
                        const isSelf = currentUser?.id === u.id;
                        return (
                          <tr key={u.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-white flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  isAdmin
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {u.displayName.slice(0, 1)}
                              </div>
                              <div className="flex flex-col">
                                <span>{u.displayName}</span>
                                {isSelf && (
                                  <span className="text-[10px] text-emerald-400 font-normal">(حسابك الحالي)</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300 text-xs">@{u.username}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  isAdmin
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {isAdmin ? 'مدير نظام (كامل الصلاحيات)' : 'كاشير (نقطة البيع)'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  u.isActive
                                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                {u.isActive ? 'نشط' : 'معطّل'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-EG-u-nu-latn') : 'لم يدخل بعد'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(u)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                                >
                                  تعديل
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartResetPin(u)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                    isAdmin
                                      ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-800/60'
                                      : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                                  }`}
                                  title={isAdmin ? 'تغيير الرقم السري للمدير (يتطلب الرقم الحالي)' : 'إعادة ضبط الرقم السري للكاشير'}
                                >
                                  {isAdmin ? 'تغيير PIN المدير' : 'تغيير PIN'}
                                </button>
                                {!isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(u)}
                                    className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                      u.isActive
                                        ? 'bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border-rose-800/40'
                                        : 'bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/40'
                                    }`}
                                    title={u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                                  >
                                    {u.isActive ? 'تعطيل' : 'تفعيل'}
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500 px-1.5 py-1">محمي</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mode === 'add' && (
            <form onSubmit={handleCreateSubmit} className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">إضافة موظف / كاشير جديد</h3>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  الرجوع للقائمة
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">اسم الموظف الكامل</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثال: أحمد عبد الله (أو كاشير 2)"
                  className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">اسم المستخدم (للتسجيل والدخول)</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="مثال: cashier2"
                  className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">الدور والصلاحيات</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('cashier')}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      role === 'cashier'
                        ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500/50'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="font-bold text-white text-sm">كاشير (نقطة البيع)</div>
                    <div className="text-[11px] text-slate-400">البيع، إضافة العملاء والبحث. لا يملك الوصول للتقارير أو الإعدادات أو تعديل الأسعار.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      role === 'admin'
                        ? 'bg-amber-950/60 border-amber-500 ring-1 ring-amber-500/50'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="font-bold text-white text-sm">مدير نظام</div>
                    <div className="text-[11px] text-slate-400">كامل الصلاحيات: التقارير، السلع والمخزن، الإعدادات، وإدارة حسابات الموظفين.</div>
                  </button>
                </div>
                {role === 'admin' && (
                  <p className="text-[11px] text-amber-300 mt-2 bg-amber-950/40 p-2 rounded-lg border border-amber-800/50">
                    تنبيه: حساب مدير النظام يمتلك صلاحيات كاملة على الخزينة والأسعار وحذف السجلات.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الرقم السري (PIN: 4 - 8 أرقام)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-500 text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">تأكيد الرقم السري</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-500 text-center"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-[#006d41] hover:bg-[#008751] text-white font-bold text-sm rounded-xl transition-all shadow-md disabled:opacity-40"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ وإنشاء الحساب'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {mode === 'edit' && selectedUser && (
            <form onSubmit={handleEditSubmit} className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">تعديل بيانات: {selectedUser.displayName}</h3>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  الرجوع للقائمة
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">اسم المستخدم</label>
                <input
                  type="text"
                  disabled
                  value={username}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-400 text-sm font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">اسم الموظف الظاهر</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {selectedUser.role === 'admin' ? (
                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs">
                  حساب مدير النظام الرئيسي يتمتع بصلاحيات إدارية دائمة ولا يمكن تحويله إلى كاشير لضمان عدم قفل النظام.
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الدور</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('cashier')}
                      className={`p-3 rounded-xl border text-right transition-all ${
                        role === 'cashier'
                          ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500/50'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="font-bold text-white text-sm">كاشير (نقطة البيع)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      className={`p-3 rounded-xl border text-right transition-all ${
                        role === 'admin'
                          ? 'bg-amber-950/60 border-amber-500 ring-1 ring-amber-500/50'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="font-bold text-white text-sm">ترقية إلى مدير نظام</div>
                    </button>
                  </div>
                </div>
              )}

              {selectedUser.role !== 'admin' && (
                <div className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <input
                    type="checkbox"
                    id="activeCheck"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="activeCheck" className="text-sm font-semibold text-white cursor-pointer">
                    حساب نشط (يمكنه تسجيل الدخول للبرنامج)
                  </label>
                </div>
              )}

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-[#006d41] hover:bg-[#008751] text-white font-bold text-sm rounded-xl transition-all shadow-md disabled:opacity-40"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {mode === 'reset_pin' && selectedUser && (
            <form onSubmit={handleResetPinSubmit} className="max-w-md mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">
                  {selectedUser.role === 'admin'
                    ? `تغيير الرقم السري لمدير النظام (${selectedUser.displayName})`
                    : `إعادة تعيين الرقم السري للكاشير (${selectedUser.displayName})`}
                </h3>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  الرجوع للقائمة
                </button>
              </div>

              {selectedUser.role === 'admin' && (
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1">
                    الرقم السري الحالي لمدير النظام (مطلوب لتأكيد هويتك)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    required
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full bg-[#070d14] border border-amber-600/70 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-amber-400 text-center text-lg"
                  />
                  <p className="text-[11px] text-amber-400/80 mt-1">
                    أمان متقدم: لا يمكن تعديل الرقم السري لحساب المدير دون إدخال الرقم السري الحالي.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">الرقم السري الجديد (4 - 8 أرقام)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-500 text-center text-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">تأكيد الرقم السري الجديد</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-[#070d14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-500 text-center text-lg"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl transition-all shadow-md disabled:opacity-40"
                >
                  {loading ? 'جاري التحديث...' : 'تأكيد وحفظ الرقم السري'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#070d14] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>حماية متعددة الموظفين — تشفير PBKDF2 مع Salt مستقل لكل حساب</span>
          <span>يتطلب النظام بقاء مدير نظام نشط واحد على الأقل</span>
        </div>
      </div>
    </div>
  );
};
