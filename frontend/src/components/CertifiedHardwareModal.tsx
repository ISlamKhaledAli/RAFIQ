import React, { useState } from 'react';
import {
  Server,
  Printer,
  Tag,
  Barcode,
  Coins,
  Scale,
  BatteryCharging,
  Check,
  X,
  Sliders,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { SearchInput } from './SearchInput';
import { SegmentedTabs, type SegmentedTabOption } from './SegmentedTabs';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useMotionPanel } from '../hooks/useMotionPanel';
import MotionHeight from './MotionHeight';
import { AppButton } from './AppButton';
import { usePrintReport } from '../hooks/usePrintReport';
import {
  CATEGORY_GUIDE,
  CERTIFIED_DEVICES,
  CONNECTION_HINTS,
  CONNECTION_LABELS,
  HARDWARE_CATEGORIES,
  STATUS_LABELS,
  filterCertifiedDevices,
  type HardwareCategory,
  type HardwareStatus,
} from '../utils/certifiedHardware';

type CategoryFilter = 'all' | HardwareCategory;

const CATEGORY_ICONS: Record<HardwareCategory, LucideIcon> = {
  printer: Printer,
  label: Tag,
  scanner: Barcode,
  drawer: Coins,
  scale: Scale,
  power: BatteryCharging,
};

const STATUS_TONE: Record<HardwareStatus, string> = {
  certified: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30',
  recommended: 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30',
  untested: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30',
};

const CHIP = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold';

const CATEGORY_OPTIONS: SegmentedTabOption<CategoryFilter>[] = [
  { value: 'all', label: 'الكل' },
  ...HARDWARE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_GUIDE[c].label, icon: CATEGORY_ICONS[c] })),
];

interface CertifiedHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: CategoryFilter;
}

export const CertifiedHardwareModal: React.FC<CertifiedHardwareModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'all',
}) => {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);
  const listPanel = useMotionPanel(activeCategory);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  const { print: printSpecSheet, printing: isPrintingSpecSheet } = usePrintReport({
    reportName: 'ورقة مواصفات الأجهزة المعتمدة',
    kind: 'a4only',
  });

  if (!isOpen) return null;

  const filteredDevices = filterCertifiedDevices(CERTIFIED_DEVICES, activeCategory, searchQuery);
  const visibleCategories = HARDWARE_CATEGORIES.filter((c) => filteredDevices.some((d) => d.category === c));

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
      onClick={handleBackdropClick}
    >
      <div
        data-print-root
        className="w-full max-w-5xl h-[92vh] max-h-[53.75rem] bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col overflow-hidden font-sans text-ink dark:text-ink-dark"
        role="dialog"
        aria-modal="true"
        aria-label="دليل أجهزة الكاشير المعتمدة والمجربة"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-brand-dark text-white flex items-center justify-between gap-4 shrink-0 select-none shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white shadow-inner shrink-0">
              <Server className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white leading-snug m-0">
                دليل أجهزة الكاشير المعتمدة والمجربة
              </h2>
              <p className="text-sm text-white/80 leading-relaxed m-0">
                الطابعات وقارئات الباركود وأدراج النقدية والموازين وغيرها، مع ما يدعمه رفيق وطريقة تشغيل كل جهاز
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={requestClose}
            className="w-8 h-8 shrink-0 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            title="إغلاق (Esc)"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar & Search */}
        <div className="px-5 py-4 bg-canvas dark:bg-surface-dark border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-x-8 gap-y-3 shrink-0 select-none">
          <SearchInput
            size="md"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="ابحث بموديل أو ماركة الجهاز..."
            ariaLabel="بحث في الأجهزة المعتمدة"
            className="w-96 max-w-full"
          />
          <span className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted tabular-nums">
            عرض {filteredDevices.length} من {CERTIFIED_DEVICES.length}
          </span>
          <SegmentedTabs options={CATEGORY_OPTIONS} value={activeCategory} onChange={setActiveCategory} ariaLabel="فئات الأجهزة" size="compact" fullWidth />
        </div>

        {/* Device Cards List */}
        <div {...listPanel} className="flex-1 px-5 py-4 overflow-y-auto bg-surface dark:bg-surface-dark-2 flex flex-col gap-4 min-h-0">
          {/* How to read the guide */}
          <div className="p-4 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-line dark:border-line-dark text-ink dark:text-ink-dark text-sm leading-relaxed flex items-start gap-3">
            <Info className="w-5 h-5 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
            <p className="m-0">
              <strong>معتمد</strong> و<strong>موصى به</strong> أجهزة جُرّبت مع رفيق. أما <strong>غير مجرّب بعد</strong> فبطاقة متطلبات عامة لنوع جهاز يدعمه رفيق دون موديل بعينه، فاختبره بأزرار الاختبار في الإعدادات قبل الاعتماد عليه.
            </p>
          </div>

          {filteredDevices.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-line dark:border-line-dark text-center text-sm text-ink-muted dark:text-ink-dark-muted">
              لا توجد أجهزة مطابقة لبحثك. جرّب اسم الماركة أو الموديل أو غيّر الفئة.
            </div>
          )}

          {visibleCategories.map((category) => {
            const guide = CATEGORY_GUIDE[category];
            const CategoryIcon = CATEGORY_ICONS[category];
            const categoryDevices = filteredDevices.filter((d) => d.category === category);
            return (
              <section key={category} className="flex flex-col gap-3" aria-label={guide.label}>
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark border border-line dark:border-line-dark flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-line dark:border-line-dark flex items-center justify-center text-brand dark:text-brand-bright shrink-0">
                      <CategoryIcon className="w-5 h-5" />
                    </div>
                    <h3 className="t-card-title text-ink dark:text-ink-dark m-0">{guide.label}</h3>
                  </div>
                  <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 m-0 text-sm leading-relaxed">
                    <div>
                      <dt className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">ما يدعمه رفيق</dt>
                      <dd className="m-0 text-ink dark:text-ink-dark">{guide.supports}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">طريقة التوصيل</dt>
                      <dd className="m-0 text-ink dark:text-ink-dark">{guide.connects}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1">أين تضبطه</dt>
                      <dd className="m-0 text-ink dark:text-ink-dark">{guide.settings}</dd>
                    </div>
                  </dl>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  {categoryDevices.map((device) => {
                    const isExpanded = expandedDeviceId === device.id;
                    const DeviceIcon = CATEGORY_ICONS[device.category];
                    return (
                      <article
                        key={device.id}
                        className={`rounded-xl border bg-surface dark:bg-surface-dark flex flex-col ${
                          isExpanded ? 'border-brand dark:border-brand-bright shadow-sm' : 'border-line dark:border-line-dark'
                        }`}
                      >
                        <MotionHeight>
                        <div className="p-4 flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark flex items-center justify-center text-brand dark:text-brand-bright shrink-0">
                              <DeviceIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">{device.brand}</div>
                              <h4 dir="auto" className="text-sm font-bold text-ink dark:text-ink-dark leading-snug m-0 mt-0.5 break-words">{device.model}</h4>
                              <p className="text-sm text-ink-muted dark:text-ink-dark-muted leading-relaxed m-0 mt-1">{device.type}</p>
                            </div>
                            <span className={`${CHIP} shrink-0 ${STATUS_TONE[device.status]}`}>{STATUS_LABELS[device.status]}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {device.connections.map((connection) => (
                              <span
                                key={connection}
                                title={CONNECTION_HINTS[connection]}
                                className={`${CHIP} bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark border-line dark:border-line-dark`}
                              >
                                {CONNECTION_LABELS[connection]}
                              </span>
                            ))}
                            {device.windows && (
                              <span className={`${CHIP} bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30`}>
                                <Check className="w-3.5 h-3.5" />
                                {device.windows.win7 ? 'ويندوز 7 SP1 وحتى 11' : 'ويندوز 10 و11'}
                              </span>
                            )}
                          </div>

                          <p className="text-sm leading-relaxed text-ink dark:text-ink-dark m-0">{device.notes}</p>

                          <dl className="flex flex-col m-0 px-3 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
                            {device.specs.map((spec) => (
                              <div key={spec.label} className="py-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <dt className="text-sm text-ink-muted dark:text-ink-dark-muted">{spec.label}</dt>
                                <dd className="m-0 text-sm font-bold text-ink dark:text-ink-dark break-words">
                                  {spec.ltr ? <span dir="ltr" className="inline-block font-mono">{spec.value}</span> : spec.value}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          <AppButton
                            variant="secondary"
                            size="sm"
                            fullWidth
                            icon={isExpanded ? ChevronUp : ChevronDown}
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                          >
                            {isExpanded ? 'إخفاء خطوات التشغيل' : `عرض خطوات التشغيل (${device.setupSteps.length})`}
                          </AppButton>
                        </div>

                          <div className={isExpanded ? 'px-4 pb-4' : 'hidden print:block px-4 pb-4'}>
                            <div className="flex flex-col gap-3">
                              <span className="font-bold text-sm text-brand dark:text-brand-bright flex items-center gap-2">
                                <Sliders className="w-4 h-4 text-paid dark:text-paid-bright" />
                                <span>خطوات تشغيل هذا الجهاز مع رفيق</span>
                              </span>
                              <ol className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-3 m-0 list-none">
                                {device.setupSteps.map((step, stepIndex) => (
                                  <li key={step} className="flex items-start gap-3 text-sm text-ink dark:text-ink-dark">
                                    <span className="w-6 h-6 rounded-full bg-brand dark:bg-brand-bright text-white dark:text-surface-dark text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                      {stepIndex + 1}
                                    </span>
                                    <span className="leading-relaxed">{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        </MotionHeight>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-canvas dark:bg-surface-dark border-t border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm text-ink-muted dark:text-ink-dark-muted select-none shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span>اطبع هذه الورقة وسلّمها لمورد أجهزة الكاشير ليجهّز لك أجهزة تناسب رفيق.</span>
          </div>

          <AppButton variant="secondary" icon={FileText} onClick={printSpecSheet} loading={isPrintingSpecSheet}>
            طباعة ورقة المواصفات
          </AppButton>
        </div>
      </div>
    </div>
  );
};

