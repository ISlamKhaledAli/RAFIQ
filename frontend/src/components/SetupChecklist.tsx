import React from 'react';
import { ChevronLeft, FileText, HardDrive, Printer } from 'lucide-react';
import type { SettingsSubTab } from '../views/SettingsView';

export type SetupChecklistTarget = Extract<SettingsSubTab, 'printer' | 'backup' | 'profile'>;

interface SetupChecklistProps {
  onNavigate: (target: SetupChecklistTarget) => void;
}

const ROWS: { target: SetupChecklistTarget; title: string; hint: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  {
    target: 'printer',
    title: 'اختيار طابعة الفواتير',
    hint: 'اختر طابعة الكاشير الحرارية ومقاس ورق الفاتورة.',
    Icon: Printer,
  },
  {
    target: 'backup',
    title: 'تحديد مجلد النسخ الاحتياطي',
    hint: 'النسخ التلقائي يعمل الآن في مجلد آمن على الجهاز، ويمكنك اختيار فلاشة أو قرص خارجي.',
    Icon: HardDrive,
  },
  {
    target: 'profile',
    title: 'مراجعة بيانات الفاتورة',
    hint: 'راجع شعار المحل وترحيب الفاتورة وتذييلها وعدّلها كما تريد.',
    Icon: FileText,
  },
];

export const SetupChecklist: React.FC<SetupChecklistProps> = ({ onNavigate }) => (
  <section className="w-full flex flex-col gap-3" aria-label="خطوات ما بعد التجهيز">
    <h2 className="text-sm font-bold text-ink dark:text-ink-dark text-start">خطوات سريعة بعد التجهيز</h2>
    <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
      {ROWS.map(({ target, title, hint, Icon }) => (
        <li key={target}>
          <button
            type="button"
            onClick={() => onNavigate(target)}
            className="w-full min-h-[64px] px-4 py-3 flex items-center gap-3.5 text-start bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] hover:border-brand dark:hover:border-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-brand dark:focus-visible:outline-brand-bright"
          >
            <span className="w-10 h-10 shrink-0 rounded-[6px] border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark flex items-center justify-center">
              <Icon className="w-5 h-5 text-brand dark:text-brand-bright" />
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink dark:text-ink-dark">{title}</span>
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">{hint}</span>
            </span>
            <ChevronLeft className="w-5 h-5 shrink-0 text-ink-muted dark:text-ink-dark-muted" />
          </button>
        </li>
      ))}
    </ul>
  </section>
);
