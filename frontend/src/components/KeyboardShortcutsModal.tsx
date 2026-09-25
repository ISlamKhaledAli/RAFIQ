import React from 'react';
import { Keyboard, X, Search, ShoppingCart, DollarSign, Printer, ArrowLeft } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  icon: React.ReactNode;
  shortcuts: { key: string; label: string; desc: string }[];
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'البحث والباركود',
      icon: <Search className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F2', label: 'تركيز البحث والباركود', desc: 'تحديد خانة البحث للبدء بكتابة اسم الصنف أو مسح الباركود' },
        { key: 'Enter', label: 'إضافة الصنف', desc: 'إدخال الباركود الممسوح أو الصنف المختار في السلة' },
        { key: 'Esc', label: 'إلغاء البحث / إغلاق النوافذ', desc: 'إغلاق القوائم المنسدلة والنوافذ والعودة لخانة البحث' }
      ]
    },
    {
      title: 'إدارة السلة والأصناف',
      icon: <ShoppingCart className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F3', label: 'تعديل كمية الصنف', desc: 'تعديل كمية أو وزن آخر صنف تمت إضافته للسلة' },
        { key: '+ / -', label: 'زيادة أو إنقاص الكمية', desc: 'زيادة أو إنقاص كمية الصنف الأخير بوحدة واحدة' },
        { key: 'Del', label: 'حذف صنف من السلة', desc: 'حذف آخر صنف تمت إضافته من السلة' }
      ]
    },
    {
      title: 'المالية والعمليات السريعة',
      icon: <DollarSign className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F4', label: 'خصم الفاتورة', desc: 'تطبيق خصم مالي مباشر على إجمالي الفاتورة' },
        { key: 'F6', label: 'تعليق / استرجاع الفاتورة', desc: 'حفظ الفاتورة الحالية كمسودة واسترجاعها لاحقاً' },
        { key: 'F7', label: 'فاتورة جديدة', desc: 'مسح السلة الحالية والبدء من جديد مع رسالة تأكيد' },
        { key: 'F10', label: 'البيع الآجل والعملاء', desc: 'التحويل بين الدفع النقدي والبيع الآجل على الحساب' }
      ]
    },
    {
      title: 'السداد والطباعة',
      icon: <Printer className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F12', label: 'سداد نقدي فوري', desc: 'إنهاء الفاتورة نقدياً وطباعة الإيصال دون لمس الماوس' },
        { key: 'Space', label: 'نافذة الدفع المتعدد', desc: 'فتح شاشة الدفع لتسجيل مدفوعات نقدية أو بطاقات' },
        { key: 'F9', label: 'إعادة طباعة آخر إيصال', desc: 'فتح ومعاينة آخر فاتورة مكتملة وطباعة نسخة منها' },
        { key: 'F8', label: 'إعدادات القارئ', desc: 'ضبط ومحاذاة قارئ الباركود ومفتاح الإدخال' }
      ]
    }
  ];

  return (
    <div 
      className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-surface rounded-[6px] border-2 border-brand shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-brand" />
            <h3 className="text-[14px] font-bold text-ink m-0">
              دليل اختصارات لوحة المفاتيح للكاشير (F1 - F12)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 grid grid-cols-2 gap-4 max-h-[75vh] overflow-y-auto">
          {shortcutGroups.map((group, idx) => (
            <div key={idx} className="bg-canvas p-3 rounded hairline-all flex flex-col gap-2">
              <div className="flex items-center gap-1.5 pb-1 border-b border-line text-xs font-bold text-ink">
                {group.icon}
                <span>{group.title}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                {group.shortcuts.map((sc, sIdx) => (
                  <div key={sIdx} className="flex items-start justify-between gap-2 text-xs py-1 border-b border-line/40 last:border-b-0">
                    <div className="flex-1">
                      <div className="font-semibold text-ink">{sc.label}</div>
                      <div className="text-[10px] text-ink-muted leading-tight mt-0.5">{sc.desc}</div>
                    </div>
                    <kbd className="shrink-0 px-2 py-0.5 font-mono text-[11px] font-bold bg-surface border border-line rounded text-brand shadow-2xs">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="h-[44px] bg-surface-2 hairline-t px-4 flex items-center justify-between shrink-0 text-xs">
          <span className="text-ink-muted">
            مصمم لتمكين الكاشير من البيع بنسبة 100% بدون استخدام الماوس
          </span>
          <button
            onClick={onClose}
            className="h-8 px-4 bg-brand hover:bg-brand-hover text-white rounded font-bold flex items-center gap-1 transition-colors"
          >
            <span>فهمت</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
