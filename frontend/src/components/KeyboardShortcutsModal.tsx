import React from 'react';
import { Keyboard, X, Search, ShoppingCart, DollarSign, Printer, ArrowLeft, HelpCircle } from 'lucide-react';
import { openHelpCenter } from '../utils/helpService';

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
        { key: 'F2', label: 'الوقوف في خانة البحث', desc: 'الوقوف في خانة البحث عشان تكتب اسم الصنف أو تقرأ الباركود' },
        { key: 'Enter', label: 'إضافة الصنف للسلة', desc: 'إضافة الصنف الممسوح أو المختار لسلة الفاتورة' },
        { key: 'Esc', label: 'إلغاء / قفل النوافذ', desc: 'قفل أي نافذة أو قائمة مفتوحة والرجوع للبحث' }
      ]
    },
    {
      title: 'إدارة السلة والأصناف',
      icon: <ShoppingCart className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F3', label: 'تعديل كمية الصنف', desc: 'تغيير كمية أو وزن آخر صنف نزل في الفاتورة' },
        { key: '+ / -', label: 'تزويد أو تقليل الكمية', desc: 'تزويد أو تقليل كمية الصنف الأخير بوحدة واحدة' },
        { key: 'Del', label: 'مسح صنف من الفاتورة', desc: 'مسح آخر صنف نزل في الفاتورة' }
      ]
    },
    {
      title: 'المالية والعمليات السريعة',
      icon: <DollarSign className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F4', label: 'خصم على الفاتورة', desc: 'عمل خصم بالجنيه على إجمالي الفاتورة' },
        { key: 'F6', label: 'تعليق / استرجاع الفاتورة', desc: 'تعليق الفاتورة الحالية لخدمة زبون تاني واسترجاعها بعدين' },
        { key: 'F7', label: 'فاتورة جديدة', desc: 'إلغاء الفاتورة الحالية والبدء من جديد بعد التأكيد' },
        { key: 'F10', label: 'سداد فوري بالفيزا / الكارت', desc: 'دفع سريع بالفيزا/الكارت وطباعة الوصل فوراً' }
      ]
    },
    {
      title: 'السداد والطباعة',
      icon: <Printer className="w-4 h-4 text-brand" />,
      shortcuts: [
        { key: 'F9', label: 'الدفع الكاش وحساب الباقي', desc: 'فتح شاشة الدفع الكاش وحساب باقي الزبون بالضبط' },
        { key: 'F12', label: 'سداد كاش فوري', desc: 'تقفيل الفاتورة كاش وطباعة الوصل فوراً بدون ماوس' },
        { key: 'F11', label: 'مرتجع مبيعات', desc: 'تسجيل بضاعة مرتجعة للزبون بفاتورة أو بدونها' },
        { key: 'Space', label: 'شاشة الدفع المتعدد', desc: 'فتح شاشة الدفع لاختيار طريقة الدفع (كاش/فيزا/آجل)' },
        { key: 'F8', label: 'ضبط قارئ الباركود', desc: 'ضبط وتجربة قارئ الباركود وسرعة المسح' }
      ]
    }
  ];

  return (
    <div 
      className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl bg-surface rounded-xl border border-brand/40 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-brand" />
            <h3 className="text-[14px] font-bold text-ink m-0">
              دليل اختصارات الكيبورد السريعة للكاشير (F1 - F12)
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
            تقدر تبيع وتقفل الفاتورة 100% من الكيبورد بدون ما تلمس الماوس
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                openHelpCenter('pos');
              }}
              className="h-8 px-3 rounded bg-paid-soft hover:bg-paid-soft/80 text-paid border border-paid-border font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>دليل الكاشير والأسئلة الشائعة والدعم</span>
            </button>
            <button
              onClick={onClose}
              className="h-8 px-4 bg-brand hover:bg-brand-hover text-white rounded font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>تمام، فهمت</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
