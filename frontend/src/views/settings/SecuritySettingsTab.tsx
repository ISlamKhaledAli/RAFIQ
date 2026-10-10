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
    <div className="bg-surface rounded-lg border border-line shadow-subtle p-5 flex flex-col gap-5 text-xs text-ink">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-line pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand/10 text-brand flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink m-0">أمان النظام وقفل العمليات الحساسة</h3>
            <p className="text-[11px] text-ink-muted m-0">حماية تعديل الأسعار، ومسح الفواتير، وتقارير الأرباح، وتسويات الجرد برقم سري (PIN)</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPinModal}
          className="h-10 px-4 bg-brand hover:bg-brand-dark text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          <span>{pinStatus?.isPinSet ? 'تغيير أو تعديل الرقم السري' : 'عمل رقم سري جديد'}</span>
        </button>
      </div>

      {/* Status Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-lg bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">حالة الحماية العامة:</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${pinStatus?.isPinSet ? (pinStatus?.isEnabled ? 'bg-paid' : 'bg-warn') : 'bg-line-hover'}`} />
            <span className="text-xs font-bold text-ink">
              {!pinStatus?.isPinSet ? 'لسه ما اتعملش' : (pinStatus?.isEnabled ? 'شغال ومحمي' : 'موقوف مؤقتاً')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">مستوى التشفير والحماية:</span>
          <span className="text-xs font-bold text-paid">حماية وتشفير عالي زي البنوك</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">الحماية من التخمين واللعب:</span>
          <span className="text-xs font-bold text-brand">قفل تصاعدي تلقائي أول ما حد يكتب غلط</span>
        </div>
      </div>

      {/* Protected Actions Preview */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-bold text-ink flex items-center gap-1.5 m-0">
          <Sliders className="w-4 h-4 text-brand" />
          <span>العمليات المحمية حالياً بالرقم السري:</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
          {[
            { key: 'settings', label: 'شاشة الإعدادات العامة وقاعدة البيانات' },
            { key: 'reports', label: 'شاشة تقارير الأرباح والمبيعات' },
            { key: 'product_edit', label: 'تعديل أسعار البضاعة ومسح الأصناف' },
            { key: 'stock_adjust', label: 'تسوية جرد وعدّ المخزن اليدوي' },
            { key: 'db_recovery', label: 'استرجاع أو تصفير بيانات المحل' },
            { key: 'discounts', label: 'عمل خصم يدوي في فاتورة البيع' },
          ].map((item) => {
            const isItemProtected = pinStatus?.isPinSet && pinStatus?.isEnabled && pinStatus?.protectedActions?.[item.key];
            return (
              <div key={item.key} className="p-3 rounded-lg bg-surface-2 border border-line flex items-center justify-between">
                <span className="text-ink font-medium">{item.label}</span>
                <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${isItemProtected ? 'bg-paid-soft text-paid border-paid/20' : 'bg-surface text-ink-muted border-line'}`}>
                  {isItemProtected ? 'محمي بالرقم السري' : 'متاح من غير رقم'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multiple Cashiers & Employee Accounts Card */}
      <div className="p-4 bg-paid-soft border border-paid/20 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface border border-paid/30 flex items-center justify-center text-paid shrink-0">
            <Users className="w-5 h-5 text-paid" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-brand-dark m-0">إدارة حسابات الكاشير والموظفين (Multiple Cashiers)</h4>
            <p className="text-[11.5px] text-brand m-0 mt-0.5">
              تقدر تسجل كذا كاشير (كاشير 1، كاشير 2، كاشير الوردية المسائية...) وكل واحد ليه رقم سري خاص وصلاحيات محددة للبيع أو الإشراف.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUserManagerModal}
          className="px-4 py-2 bg-paid hover:bg-paid-dark text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span>فتح شاشة حسابات الكاشير والموظفين</span>
        </button>
      </div>

      {/* Emergency Recovery & Offline Supermarket Notes */}
      <div className="p-4 bg-warn-soft border border-warn/30 rounded-lg flex flex-col gap-2 shadow-2xs">
        <div className="flex items-center gap-2 font-bold text-warn text-xs">
          <div className="w-6 h-6 rounded bg-surface border border-warn/30 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-3.5 h-3.5 text-warn" />
          </div>
          <span>استرجاع الطوارئ بدون أي قلق وبدون نت:</span>
        </div>
        <p className="text-ink font-normal leading-relaxed m-0 text-xs pr-8">
          أول ما تعمل رقم سري جديد، النظام بيطلعلك «كود استرجاع طوارئ» يظهرلك مرة واحدة بس. لو نسيت الرقم السري في أي وقت، دوس «نسيت الرقم السري» واكتب كود الطوارئ وهيرجع حسابك فوراً أوفلاين من غير نت ومن غير ما تمسح أي فاتورة أو حركة مخزن.
        </p>
      </div>
    </div>
  );
};
