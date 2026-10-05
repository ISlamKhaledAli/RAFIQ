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
    <div className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-5 text-xs text-[#14181a]">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5 text-[#0b4f42]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#14181a] m-0">أمان النظام وقفل العمليات الحساسة</h3>
            <p className="text-[11px] text-[#5b6664] m-0">حماية تعديل الأسعار، تقارير الأرباح، تسوية المخزون، والعمليات الحساسة برقم سري</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPinModal}
          className="h-10 px-4 bg-[#0b4f42] hover:bg-[#0f6a57] text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          <span>{pinStatus?.isPinSet ? 'إدارة وتغيير الرقم السري' : 'تعيين رقم سري جديد'}</span>
        </button>
      </div>

      {/* Status Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-lg bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">حالة الحماية العامة:</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${pinStatus?.isPinSet ? (pinStatus?.isEnabled ? 'bg-paid' : 'bg-warn') : 'bg-line-hover'}`} />
            <span className="text-xs font-bold text-ink">
              {!pinStatus?.isPinSet ? 'غير منشأ' : (pinStatus?.isEnabled ? 'مفعل ونشط' : 'معطل مؤقتاً')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">خوارزمية التشفير (Task 52-1):</span>
          <span className="text-xs font-mono font-bold text-paid">PBKDF2 Salted Hash (10,000 دورة)</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">الحماية من التخمين (Brute-Force):</span>
          <span className="text-xs font-bold text-brand">قفل تصاعدي (30 ثانية - 5 دقائق)</span>
        </div>
      </div>

      {/* Protected Actions Preview */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-bold text-[#14181a] flex items-center gap-1.5 m-0">
          <Sliders className="w-4 h-4 text-[#0b4f42]" />
          <span>العمليات المحمية حالياً بالرقم السري:</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
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
              <div key={item.key} className="p-3 rounded-lg bg-[#f7f8f6] border border-[#dce1dc] flex items-center justify-between">
                <span className="text-[#14181a] font-medium">{item.label}</span>
                <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${isItemProtected ? 'bg-[#eaf5ee] text-[#1b7a4d] border-[#c4e3d0]' : 'bg-white text-[#5b6664] border-[#dce1dc]'}`}>
                  {isItemProtected ? 'محمي بالرقم السري' : 'متاح دون طلب رقم'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multiple Cashiers & Employee Accounts Card */}
      <div className="p-4 bg-[#eaf5ee]/70 border border-[#c4e3d0] rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#eaf5ee] border border-[#c4e3d0] flex items-center justify-center text-[#006d41] shrink-0">
            <Users className="w-5 h-5 text-[#006d41]" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-[#00372d] m-0">إدارة الكاشيرات وصلاحيات الموظفين (Multiple Cashiers)</h4>
            <p className="text-[11.5px] text-[#005230] m-0 mt-0.5">
              إضافة عدة كاشيرات (كاشير 1، كاشير 2، كاشير مسائي...) برقم سري مستقل لكل كاشير، وتحديد صلاحيات البيع والإشراف.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUserManagerModal}
          className="px-4 py-2 bg-[#006d41] hover:bg-[#005230] text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span>فتح شاشة إدارة الكاشيرات والموظفين</span>
        </button>
      </div>

      {/* Emergency Recovery & Offline Supermarket Notes */}
      <div className="p-4 bg-[#fef7ec] border border-[#f5deb4] rounded-lg flex flex-col gap-2 shadow-2xs">
        <div className="flex items-center gap-2 font-bold text-[#b3720e] text-xs">
          <div className="w-6 h-6 rounded bg-[#fef7ec] border border-[#f5deb4] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-3.5 h-3.5 text-[#b3720e]" />
          </div>
          <span>ميزة استرجاع الطوارئ بدون فقدان بيانات (Task 52-4):</span>
        </div>
        <p className="text-[#663e00] font-normal leading-relaxed m-0 text-xs pr-8">
          عند إنشاء الرقم السري أو تغييره، يولد النظام تلقائياً «رمز استرجاع طوارئ» فريداً يظهر لك مرة واحدة. في حال نسيان الكاشير أو صاحب المحل للرقم السري، يمكن الضغط على «نسيت الرقم السري» في نافذة الإدخال واستخدام رمز الطوارئ لإعادة التعيين فوراً دون الحاجة لاتصال بالإنترنت ودون إتلاف قاعدة البيانات.
        </p>
      </div>
    </div>
  );
};
