import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  HelpCircle,
  X,
  Search,
  ShoppingCart,
  Banknote,
  FileText,
  Users,
  Package,
  Truck,
  Wallet,
  Clock,
  Printer,
  ShieldCheck,
  ShieldAlert,
  Headphones,
  FileQuestion,
  PhoneCall,
  Copy,
  Check,
  ChevronLeft,
  ChevronDown,
  Cpu,
  KeyRound,
  Download,
  FolderOpen,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Info
} from 'lucide-react';
import { SearchInput } from './SearchInput';
import { invoke } from '../bridge/ipc';
import { AppButton } from './AppButton';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { useAuth } from '../context/useAuth';
import type { SystemInfo } from '../App';
import type { LicenseInfoData } from './LicenseModal';
import { buildDatabaseCells, lastBackupLabel, licenseTypeLabel } from '../utils/systemSpecs';
import type { SystemSpecFacts } from '../utils/systemSpecs';
import {
  FAQS,
  HELP_ARTICLES,
  isHelpSectionAllowed,
  resolveHelpSection,
  searchHelp,
  type HelpArticleSectionId,
  type HelpSectionId
} from '../utils/helpContent';

export type { HelpSectionId };

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: HelpSectionId | string;
}

interface SupportBundleResult {
  success?: boolean;
  message?: string;
  filePath?: string;
  folderPath?: string;
}

const SUPPORT_PHONE = '01097782965';

const NAV_ITEMS: { id: HelpArticleSectionId; label: string; icon: LucideIcon }[] = [
  { id: 'pos', label: 'الكاشير والبيع', icon: ShoppingCart },
  { id: 'payment', label: 'الدفع والوصل', icon: Banknote },
  { id: 'sales', label: 'الفواتير والمرتجعات', icon: FileText },
  { id: 'customers', label: 'العملاء والشكك', icon: Users },
  { id: 'products', label: 'الأصناف والمخزن', icon: Package },
  { id: 'purchases', label: 'المشتريات والموردين', icon: Truck },
  { id: 'wallets', label: 'المحافظ وإنستاباي', icon: Wallet },
  { id: 'shifts', label: 'الوردية والإغلاق', icon: Clock },
  { id: 'printing', label: 'الطباعة والدرج والقارئ', icon: Printer },
  { id: 'backup_security', label: 'النسخ الاحتياطي والأمان', icon: ShieldCheck }
];

const NAV_BTN = 'w-full min-h-10 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-right transition-colors cursor-pointer';
const NAV_BTN_ON = 'bg-brand dark:bg-brand-container text-white shadow-xs';
const NAV_BTN_OFF = 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-3 dark:hover:bg-surface-dark-3 hover:text-ink dark:hover:text-ink-dark';
const KEY_CHIP = 'font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-surface dark:bg-surface-dark-3 border border-line-hover dark:border-line-dark-hover text-brand dark:text-brand-bright whitespace-nowrap';
const CARD = 'rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2';
const TAG = 'text-micro font-bold px-2 py-0.5 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-dark-border';

export const HelpCenterModal = ({
  isOpen,
  onClose,
  initialSection = 'pos'
}: HelpCenterModalProps) => {
  const [activeSection, setActiveSection] = useState<HelpSectionId>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const [sysInfo, setSysInfo] = useState<(SystemInfo & SystemSpecFacts) | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfoData | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [supportSavedPath, setSupportSavedPath] = useState<string | null>(null);
  const [supportFolderPath, setSupportFolderPath] = useState<string | null>(null);
  const [copied, setCopied] = useState<'phone' | 'fingerprint' | 'failed' | null>(null);

  const { hasPermission, isAdmin } = useAuth();

  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIsOpenRef = useRef(false);
  const lastInitialSectionRef = useRef<string | undefined>(undefined);

  const isSectionAllowed = useCallback(
    (id: HelpSectionId): boolean => isHelpSectionAllowed(id, isAdmin, hasPermission),
    [isAdmin, hasPermission]
  );

  // Open on the requested guide (screen names map to their guide), once per open or explicit change
  useEffect(() => {
    const isOpening = isOpen && !prevIsOpenRef.current;
    const isExplicitSectionChange = isOpen && initialSection !== lastInitialSectionRef.current;
    if (isOpening || isExplicitSectionChange) {
      lastInitialSectionRef.current = initialSection;
      setActiveSection(resolveHelpSection(initialSection, isSectionAllowed));
      setSearchQuery('');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialSection, isSectionAllowed]);

  // Diagnostics are optional: when a call fails the support tab shows a dash
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    void invoke<SystemInfo & SystemSpecFacts>('system:getInfo')
      .then((sys) => { if (isMounted && sys) setSysInfo(sys); })
      .catch(() => undefined);
    void invoke<LicenseInfoData>('license:getInfo')
      .then((lic) => { if (isMounted && lic) setLicenseInfo(lic); })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Keyboard users land in the search box and return to where they were on close
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => previous?.focus?.();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const hasQuery = searchQuery.trim().length > 0;
  const motionPanel = useMotionPanel(hasQuery ? 'search' : activeSection);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeSection, hasQuery]);

  const allowedArticles = useMemo(
    () => HELP_ARTICLES.filter((art) => isSectionAllowed(art.sectionId)),
    [isSectionAllowed]
  );
  const allowedNav = useMemo(() => NAV_ITEMS.filter((item) => isSectionAllowed(item.id)), [isSectionAllowed]);

  const searchResult = useMemo(() => searchHelp(searchQuery, allowedArticles, FAQS), [searchQuery, allowedArticles]);

  const activeArticle = useMemo(
    () => (isSectionAllowed(activeSection) ? allowedArticles.find((a) => a.sectionId === activeSection) ?? null : null),
    [activeSection, allowedArticles, isSectionAllowed]
  );

  const goToSection = (id: HelpSectionId) => {
    setActiveSection(id);
    setSearchQuery('');
  };

  const handleCreateSupportBundle = async () => {
    setSupportLoading(true);
    setSupportMessage(null);
    setSupportSavedPath(null);
    setSupportFolderPath(null);
    try {
      const res = await invoke<SupportBundleResult>('support:createBundle');
      if (res?.success) {
        setSupportMessage(res.message || 'تم إنشاء حزمة الدعم');
        setSupportSavedPath(res.filePath || null);
        setSupportFolderPath(res.folderPath || null);
      } else {
        setSupportMessage(res?.message || 'تعذر إنشاء حزمة الدعم الفني');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSupportMessage(`تعذر إنشاء الحزمة: ${msg}`);
    } finally {
      setSupportLoading(false);
    }
  };

  const handleOpenSupportFolder = async () => {
    if (!supportFolderPath) return;
    try {
      await invoke('excel:openExportFolder', { folderPath: supportFolderPath });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSupportMessage(`تعذر فتح المجلد: ${msg}`);
    }
  };

  const copyText = async (text: string, kind: 'phone' | 'fingerprint') => {
    let next: 'phone' | 'fingerprint' | 'failed' = kind;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = 'failed';
    }
    setCopied(next);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
  };

  // Keep Tab inside the dialog while it is open
  const handleDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!isOpen) return null;

  const fingerprint = licenseInfo?.deviceFingerprint || '';
  const dash = '—';

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9990] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div
        className="w-full max-w-6xl h-full max-h-[53.75rem] bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col overflow-hidden font-sans text-ink dark:text-ink-dark"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
        onKeyDown={handleDialogKeyDown}
      >
        {/* Header: title, search, close */}
        <div className="px-5 py-3 bg-brand-dark dark:bg-surface-dark-2 text-white flex items-center gap-4 shrink-0 select-none dark:border-b dark:border-line-dark">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-paid flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-white" />
            </div>
            <h2 id="help-center-title" className="t-modal-title text-white m-0 whitespace-nowrap">مركز المساعدة والدعم</h2>
          </div>

          <SearchInput
            ref={searchRef}
            size="md"
            searchButton={false}
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="ابحث: باركود، مرتجع، آجل، طابعة..."
            ariaLabel="ابحث في مركز المساعدة"
            className="flex-1 min-w-0 max-w-xl me-auto"
          />

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="إغلاق"
            title="إغلاق (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Guide list */}
          <nav
            aria-label="أدلة مركز المساعدة"
            className="w-60 bg-surface-2 dark:bg-surface-dark-2 border-l border-line dark:border-line-dark p-3 flex flex-col gap-1 overflow-y-auto shrink-0 select-none"
          >
            {allowedNav.length > 0 && (
              <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted px-2 pb-1">
                شروحات الشاشات
              </span>
            )}

            {allowedNav.map(({ id, label, icon: Icon }) => {
              const isActive = !hasQuery && activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goToSection(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`${NAV_BTN} ${isActive ? NAV_BTN_ON : NAV_BTN_OFF}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                </button>
              );
            })}

            <div className="h-px bg-line dark:bg-line-dark my-2" />

            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted px-2 pb-1">
              مساعدة إضافية
            </span>

            <button
              type="button"
              onClick={() => goToSection('faq')}
              aria-current={!hasQuery && activeSection === 'faq' ? 'page' : undefined}
              className={`${NAV_BTN} ${!hasQuery && activeSection === 'faq' ? NAV_BTN_ON : NAV_BTN_OFF}`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <FileQuestion className="w-4 h-4 shrink-0" />
                <span className="truncate">الأسئلة الشائعة</span>
              </span>
              <span className={`text-micro font-bold px-1.5 rounded-full tabular-nums ${!hasQuery && activeSection === 'faq' ? 'bg-white/20 text-white' : 'bg-surface-3 dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted'}`}>
                {FAQS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => goToSection('support')}
              aria-current={!hasQuery && activeSection === 'support' ? 'page' : undefined}
              className={`${NAV_BTN} ${!hasQuery && activeSection === 'support' ? NAV_BTN_ON : NAV_BTN_OFF}`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Headphones className="w-4 h-4 shrink-0" />
                <span className="truncate">طلب الدعم والمواصفات</span>
              </span>
            </button>
          </nav>

          {/* Content */}
          <div ref={contentRef} {...motionPanel} className="flex-1 min-w-0 px-6 py-5 overflow-y-auto bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark">
            {hasQuery && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-line dark:border-line-dark">
                  <h3 className="t-card-title text-ink dark:text-ink-dark m-0 flex items-center gap-2 min-w-0">
                    <Search className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
                    <span className="truncate">نتائج البحث عن: «{searchQuery.trim()}»</span>
                  </h3>
                  <span className="text-xs text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                    {searchResult.articles.length} شرح و {searchResult.faqs.length} سؤال
                  </span>
                </div>

                {searchResult.articles.length === 0 && searchResult.faqs.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-center text-ink-muted dark:text-ink-dark-muted gap-2">
                    <AlertTriangle className="w-8 h-8 text-warn dark:text-warn-bright" />
                    <p className="font-bold text-sm text-ink dark:text-ink-dark m-0">لا توجد نتائج مطابقة</p>
                    <p className="text-sm m-0">جرّب كلمات أخرى مثل «كاشير» أو «باركود» أو «ديون»، أو تواصل مع الدعم.</p>
                  </div>
                )}

                {searchResult.articles.length > 0 && (
                  <section className="flex flex-col gap-3" aria-label="الشروحات المطابقة">
                    <h3 className="t-label text-ink-muted dark:text-ink-dark-muted m-0">الشروحات</h3>
                    {searchResult.articles.map(({ article, matchedSteps }) => (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => goToSection(article.sectionId)}
                        className={`${CARD} p-4 text-right flex flex-col gap-2 hover:border-paid dark:hover:border-paid-bright transition-colors cursor-pointer`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="t-card-title text-brand dark:text-brand-bright">{article.title}</span>
                          <span className="text-xs font-bold text-paid dark:text-paid-bright flex items-center gap-1 whitespace-nowrap">
                            عرض الدليل
                            <ChevronLeft className="w-4 h-4" />
                          </span>
                        </span>
                        <span className="text-sm leading-7 text-ink-muted dark:text-ink-dark-muted">{article.summary}</span>
                        {matchedSteps.length > 0 && (
                          <span className="flex flex-wrap gap-1.5">
                            {matchedSteps.slice(0, 4).map((s) => (
                              <span key={s.title} className="text-micro font-semibold px-2 py-0.5 rounded-md bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                                {s.title}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    ))}
                  </section>
                )}

                {searchResult.faqs.length > 0 && (
                  <section className="flex flex-col gap-3" aria-label="الأسئلة المطابقة">
                    <h3 className="t-label text-ink-muted dark:text-ink-dark-muted m-0">الأسئلة الشائعة</h3>
                    {searchResult.faqs.map((faq) => (
                      <div key={faq.id} className={`${CARD} p-4 flex flex-col gap-2`}>
                        <span className={`${TAG} w-fit`}>{faq.category} • {faq.tag}</span>
                        <h4 className="t-card-title text-ink dark:text-ink-dark m-0">{faq.question}</h4>
                        <p className="text-sm leading-7 text-ink-muted dark:text-ink-dark-muted m-0 whitespace-pre-line">{faq.answer}</p>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}

            {!hasQuery && activeSection !== 'faq' && activeSection !== 'support' && activeArticle && (
              <article className="flex flex-col gap-5">
                <header className="flex flex-col gap-1.5">
                  <h3 className="t-section-title text-brand dark:text-brand-bright m-0">{activeArticle.title}</h3>
                  <p className="text-sm leading-7 text-ink-muted dark:text-ink-dark-muted m-0">{activeArticle.summary}</p>
                </header>

                <div className="p-4 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
                  <div className="text-sm leading-7 text-ink dark:text-ink-dark">
                    <span className="font-bold block">نصيحة سريعة</span>
                    <span>{activeArticle.goldenRule}</span>
                  </div>
                </div>

                <ol className="flex flex-col gap-3 m-0 p-0 list-none">
                  {activeArticle.steps.map((st, idx) => (
                    <li key={st.title} className={`${CARD} p-4 flex items-start gap-3`}>
                      <span className="w-7 h-7 shrink-0 rounded-lg bg-brand dark:bg-brand-container text-white text-xs font-bold flex items-center justify-center tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <h4 className="t-card-title text-ink dark:text-ink-dark m-0">{st.title}</h4>
                          {st.shortcut && (
                            <kbd dir="ltr" className={KEY_CHIP}>{st.shortcut}</kbd>
                          )}
                        </div>
                        <p className="text-sm leading-7 text-ink-muted dark:text-ink-dark-muted m-0">{st.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {activeArticle.troubleshooting && (
                  <div className="p-4 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-paid-dark-border flex items-start gap-3">
                    <Info className="w-5 h-5 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
                    <div className="text-sm leading-7 text-ink dark:text-ink-dark">
                      <span className="font-bold block">لو واجهتك مشكلة</span>
                      <span>{activeArticle.troubleshooting}</span>
                    </div>
                  </div>
                )}
              </article>
            )}

            {!hasQuery && activeSection !== 'faq' && activeSection !== 'support' && !activeArticle && (
              <div className="py-16 flex flex-col items-center justify-center text-center gap-3">
                <ShieldAlert className="w-12 h-12 text-warn dark:text-warn-bright" />
                <p className="font-bold text-base text-ink dark:text-ink-dark m-0">هذا الدليل غير متاح لصلاحيات حسابك</p>
                <p className="text-sm text-ink-muted dark:text-ink-dark-muted max-w-sm m-0">
                  اختر دليلاً من القائمة الجانبية أو اطلب من المالك أو المدير تعديل صلاحياتك.
                </p>
              </div>
            )}

            {!hasQuery && activeSection === 'faq' && (
              <div className="flex flex-col gap-4">
                <header className="pb-3 border-b border-line dark:border-line-dark">
                  <h3 className="t-section-title text-brand dark:text-brand-bright m-0">الأسئلة الشائعة</h3>
                  <p className="text-sm text-ink-muted dark:text-ink-dark-muted m-0">
                    إجابات سريعة لمشكلات التشغيل اليومي في المحل.
                  </p>
                </header>

                <div className="flex flex-col gap-2.5">
                  {FAQS.map((faq) => {
                    const isExpanded = expandedFaqId === faq.id;
                    return (
                      <div
                        key={faq.id}
                        className={`rounded-xl border overflow-hidden transition-colors ${
                          isExpanded
                            ? 'border-paid dark:border-paid-bright bg-surface dark:bg-surface-dark-2'
                            : 'border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 hover:border-line-hover dark:hover:border-line-dark-hover'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`faq-panel-${faq.id}`}
                          className="w-full min-h-14 px-4 py-3 text-right flex items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <span className="flex flex-col items-start gap-1.5 min-w-0">
                            <span className={TAG}>{faq.tag}</span>
                            <span className="font-bold text-sm leading-6 text-ink dark:text-ink-dark">{faq.question}</span>
                          </span>
                          <ChevronDown className={`w-5 h-5 shrink-0 text-ink-muted dark:text-ink-dark-muted transition-transform ${isExpanded ? 'rotate-180 text-paid dark:text-paid-bright' : ''}`} />
                        </button>

                        {isExpanded && (
                          <div
                            id={`faq-panel-${faq.id}`}
                            className="px-4 py-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3"
                          >
                            <p className="m-0 text-sm leading-7 text-ink-muted dark:text-ink-dark-muted whitespace-pre-line">{faq.answer}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!hasQuery && activeSection === 'support' && (
              <div className="flex flex-col gap-4">
                <header className="pb-3 border-b border-line dark:border-line-dark">
                  <h3 className="t-section-title text-brand dark:text-brand-bright m-0">طلب الدعم الفني</h3>
                  <p className="text-sm text-ink-muted dark:text-ink-dark-muted m-0">
                    رقم التواصل وبصمة الجهاز ومواصفات النظام، لتسهيل حل المشكلة مع فريق الدعم.
                  </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-brand-dark dark:bg-surface-dark-2 text-white border border-transparent dark:border-line-dark flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <PhoneCall className="w-4 h-4 text-warn-bright" />
                      <span>الهاتف وواتساب</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-black/20 p-3 rounded-lg border border-white/10">
                      <a
                        href={`tel:${SUPPORT_PHONE}`}
                        className="font-mono text-base font-black text-warn-bright hover:underline select-all"
                        dir="ltr"
                        title="انقر للاتصال"
                      >
                        {SUPPORT_PHONE}
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyText(SUPPORT_PHONE, 'phone')}
                        className="h-8 text-xs px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center gap-1.5"
                      >
                        {copied === 'phone' ? <Check className="w-3.5 h-3.5 text-paid-bright" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied === 'phone' ? 'تم النسخ' : copied === 'failed' ? 'تعذر النسخ' : 'نسخ الرقم'}</span>
                      </button>
                    </div>
                    <p className="text-xs leading-6 text-white/80 m-0">
                      يمكنك مراسلتنا على واتساب بنفس الرقم لإرسال حزمة الدعم أو الاستفسار.
                    </p>
                  </div>

                  <div className={`${CARD} p-4 flex flex-col gap-3`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-ink dark:text-ink-dark">
                        <KeyRound className="w-4 h-4 text-paid dark:text-paid-bright" />
                        <span>بصمة هذا الجهاز</span>
                      </div>
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted">تُطلب لتفعيل الترخيص</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-surface dark:bg-surface-dark-3 p-3 rounded-lg border border-line dark:border-line-dark">
                      <span className="font-mono text-xs font-bold text-brand dark:text-brand-bright truncate select-all" dir="ltr" title={fingerprint || undefined}>
                        {fingerprint || dash}
                      </span>
                      <AppButton
                        variant="secondary"
                        size="sm"
                        icon={copied === 'fingerprint' ? Check : Copy}
                        onClick={() => void copyText(fingerprint, 'fingerprint')}
                        disabled={!fingerprint}
                      >
                        {copied === 'fingerprint' ? 'تم النسخ' : 'نسخ'}
                      </AppButton>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                      <span>اسم المحل: <strong className="text-ink dark:text-ink-dark">{licenseInfo?.shopName || dash}</strong></span>
                      <span>الترخيص: <strong className="text-paid dark:text-paid-bright">{licenseInfo?.statusLabel || dash}</strong></span>
                    </div>
                  </div>
                </div>

                <div className={`${CARD} p-4 flex flex-col gap-3`}>
                  <div className="flex items-center gap-2 text-sm font-bold text-ink dark:text-ink-dark">
                    <Cpu className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>مواصفات النظام</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'إصدار البرنامج', value: sysInfo?.version, tone: 'normal', mono: true },
                      { label: 'نظام التشغيل', value: sysInfo?.osVersion, tone: 'normal', mono: false },
                      { label: 'نوع الترخيص', value: licenseTypeLabel(licenseInfo?.licenseType), tone: 'normal', mono: false },
                      { label: 'آخر نسخة احتياطية', value: lastBackupLabel(sysInfo?.lastBackupAt), tone: 'normal', mono: false },
                      ...buildDatabaseCells(sysInfo)
                    ].map((cell) => (
                      <div
                        key={cell.label}
                        className={`p-3 rounded-lg border min-w-0 ${cell.tone === 'danger'
                          ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/40 dark:border-danger-bright/40'
                          : 'bg-surface dark:bg-surface-dark-3 border-line dark:border-line-dark'}`}
                      >
                        <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">{cell.label}</span>
                        <span className={`text-sm font-bold block break-words ${cell.tone === 'danger' ? 'text-danger dark:text-danger-bright' : 'text-ink dark:text-ink-dark'} ${cell.mono ? 'font-mono' : ''}`}>
                          {cell.value || dash}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-paid/30 dark:border-paid-dark-border bg-paid-soft dark:bg-surface-dark-2 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-brand dark:text-brand-bright">
                    <Package className="w-4 h-4 text-paid dark:text-paid-bright" />
                    <span>حزمة معلومات الدعم الفني</span>
                  </div>
                  <p className="text-sm leading-7 text-ink-muted dark:text-ink-dark-muted m-0">
                    ملف مضغوط يُحفظ على سطح المكتب (أو في التنزيلات إن تعذر) فيه تقرير مقروء بحالة الجهاز وقاعدة البيانات والنسخ الاحتياطي والترخيص وآخر الأخطاء، دون ملف قاعدة البيانات أو بيانات الزبائن أو الفواتير. أرسله للدعم الفني ليحل المشكلة أسرع.
                  </p>

                  {supportMessage && (
                    <div className="p-3 rounded-lg bg-surface dark:bg-surface-dark-3 border border-paid-border dark:border-paid-dark-border text-sm text-ink dark:text-ink-dark flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold">{supportMessage}</span>
                        <AppButton
                          variant="subtle"
                          size="sm"
                          icon={X}
                          aria-label="إخفاء الرسالة"
                          onClick={() => {
                            setSupportMessage(null);
                            setSupportSavedPath(null);
                            setSupportFolderPath(null);
                          }}
                          className="-m-1"
                        />
                      </div>
                      {supportSavedPath && (
                        <span className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-lowest p-2 rounded break-all" dir="ltr">
                          {supportSavedPath}
                        </span>
                      )}
                      {supportFolderPath && (
                        <AppButton variant="secondary" size="sm" icon={FolderOpen} onClick={() => void handleOpenSupportFolder()} className="self-start">
                          فتح المجلد
                        </AppButton>
                      )}
                    </div>
                  )}

                  {isAdmin ? (
                    <AppButton
                      variant="success"
                      size="lg"
                      fullWidth
                      icon={Download}
                      loading={supportLoading}
                      onClick={() => void handleCreateSupportBundle()}
                    >
                      {supportLoading ? 'جاري تجهيز الحزمة...' : 'إنشاء حزمة الدعم على سطح المكتب'}
                    </AppButton>
                  ) : (
                    <p className="text-sm font-semibold text-ink dark:text-ink-dark m-0">إنشاء الحزمة متاح للمالك أو المدير، اطلب منه تجهيزها.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3 text-xs text-ink-muted dark:text-ink-dark-muted select-none shrink-0">
          <span className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
            <span className="truncate">نظام رفيق لإدارة نقاط البيع والمتاجر</span>
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <kbd dir="ltr" className={KEY_CHIP}>Esc</kbd>
            <span>للإغلاق</span>
          </span>
        </div>
      </div>
    </div>
  );
};
