import { 
  ShieldCheck, 
  KeyRound, 
  Sliders, 
  Users, 
  ShieldAlert 
} from 'lucide-react';

interface SecuritySettingsTabProps {
  pinStatus: any;
  onOpenPinModal: () => void;
  onOpenUserManagerModal: () => void;
}

export const SecuritySettingsTab = ({
  pinStatus,
  onOpenPinModal,
  onOpenUserManagerModal,
}: SecuritySettingsTabProps) => {
  return (
    <div className="bg-surface hairline-all rounded-[6px] p-6 flex flex-col gap-6 text-ink">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand-soft border border-brand/30 flex items-center justify-center text-brand">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-[14px] text-ink m-0">أمان النظام وقفل الشاشات الحساسة</h3>
            <p className="text-[11px] text-ink-muted m-0">حماية تعديل الأسعار، تقارير الأرباح، تسوية المخزون، وتصفير قاعدة البيانات برقم سري</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPinModal}
          className="h-[34px] px-4 bg-brand hover:bg-brand-hover text-white rounded font-bold text-xs flex items-center gap-2 transition-colors shadow-xs"
        >
          <KeyRound className="w-4 h-4" />
          <span>{pinStatus?.isPinSet ? 'إدارة وتغيير الرقم السري' : 'تعيين رقم سري جديد'}</span>
        </button>
      </div>

      {/* Status Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">حالة الحماية:</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${pinStatus?.isPinSet ? (pinStatus?.isEnabled ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-400'}`} />
            <span className="text-xs font-bold text-ink">
              {!pinStatus?.isPinSet ? 'غير منشأ' : (pinStatus?.isEnabled ? 'مفعل ونشط' : 'معطل مؤقتاً')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">خوارزمية التشفير (Task 52-1):</span>
          <span className="text-xs font-mono font-bold text-emerald-700">PBKDF2 Salted Hash (10,000 دورة)</span>
        </div>

        <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">الحماية من التخمين (Brute-Force):</span>
          <span className="text-xs font-bold text-brand">قفل تصاعدي (30 ثانية - 5 دقائق)</span>
        </div>
      </div>

      {/* Protected Actions Preview */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-brand" />
          <span>العمليات المحمية حالياً بالرقم السري:</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {[
            { key: 'settings', label: 'شاشة الإعدادات العامة وقاعدة البيانات' },
            { key: 'reports', label: 'شاشة التقارير والأرباح المالية' },
            { key: 'product_edit', label: 'تعديل أسعار المنتجات وحذفها' },
            { key: 'stock_adjust', label: 'التسوية اليدوية للمخزون' },
            { key: 'db_recovery', label: 'استعادة وتصفير قاعدة البيانات' },
            { key: 'discounts', label: 'تطبيق الخصم اليدوي في الفاتورة' },
          ].map((item) => {
            const isItemProtected = pinStatus?.isPinSet && pinStatus?.isEnabled && pinStatus?.protectedActions?.[item.key];
            return (
              <div key={item.key} className="p-2.5 rounded bg-surface-2 border border-line flex items-center justify-between">
                <span className="text-ink">{item.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isItemProtected ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                  {isItemProtected ? 'محمي بالرقم السري' : 'متاح دون طلب رقم'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multiple Cashiers & Employee Accounts Card */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-emerald-950 m-0">إدارة الكاشيرات وصلاحيات الموظفين (Multiple Cashiers)</h4>
            <p className="text-[11.5px] text-emerald-850 m-0 mt-0.5">
              إضافة عدة كاشيرات (كاشير 1، كاشير 2، كاشير مسائي...) برقم سري مستقل لكل كاشير، وتحديد صلاحيات البيع والإشراف.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUserManagerModal}
          className="px-4 py-2 bg-[#006d41] hover:bg-[#005734] text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span>فتح شاشة إدارة الكاشيرات والموظفين</span>
        </button>
      </div>

      {/* Emergency Recovery & Offline Supermarket Notes */}
      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col gap-2.5 shadow-xs">
        <div className="flex items-center gap-2.5 font-black text-amber-950 text-[13px]">
          <div className="w-7 h-7 rounded-lg bg-amber-200/70 border border-amber-400/60 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4 text-amber-900" />
          </div>
          <span>ميزة استرجاع الطوارئ بدون فقدان بيانات (Task 52-4):</span>
        </div>
        <p className="text-amber-950 font-semibold leading-relaxed m-0 text-[12px] pr-9.5">
          عند إنشاء الرقم السري أو تغييره، يولد النظام تلقائياً «رمز استرجاع طوارئ» فريداً يظهر لك مرة واحدة. في حال نسيان الكاشير أو صاحب المحل للرقم السري، يمكن الضغط على «نسيت الرقم السري» في نافذة الإدخال واستخدام رمز الطوارئ لإعادة التعيين فوراً دون الحاجة لاتصال بالإنترنت ودون إتلاف قاعدة البيانات.
        </p>
      </div>
    </div>
  );
};
