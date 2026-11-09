import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { FirstRunWizardModal } from '../../components/FirstRunWizardModal';
import { AuditLogView } from '../AuditLogView';
import { getAllowedRootSubTabs, resolveRootSubTab, type RootSubTab } from '../../utils/rootAccess';
import type { SystemInfo } from '../../App';
import { useFeatures } from '../../context/useFeatures';
import { ROOT_SUB_TAB_META } from './rootSubTabMeta';
import { useMotionPanel } from '../../hooks/useMotionPanel';
import { RootStatusPage } from './RootStatusPage';
import { RootReceiptPage } from './RootReceiptPage';
import { RootFeaturesPage } from './RootFeaturesPage';
import { RootDevicesPage } from './RootDevicesPage';
import { RootDataPage } from './RootDataPage';

export interface RootConsoleViewProps {
  activeSubTab: RootSubTab;
  isActive: boolean;
  sysInfo?: SystemInfo | null;
  /** Lets the readiness checklist jump to the screen a failed check belongs to */
  onNavigateToTab: (tab: string) => void;
}

/** Root-only developer console. Renders nothing for anyone else, even if the host app mounts it by mistake. */
export const RootConsoleView = ({ activeSubTab, isActive, sysInfo, onNavigateToTab }: RootConsoleViewProps) => {
  const { isRoot, hasPermission } = useAuth();
  const { flags, toggleFlag } = useFeatures();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  // Bumped to restart the receipt page from the saved values when its unsaved draft is discarded
  const [receiptGeneration, setReceiptGeneration] = useState(0);

  const allowed = getAllowedRootSubTabs({ isRoot, canViewAudit: hasPermission('audit_log.view') });
  const subTab = resolveRootSubTab(activeSubTab, allowed);
  const motionPanel = useMotionPanel(subTab ?? '');
  if (subTab === null) return null;

  const meta = ROOT_SUB_TAB_META[subTab];
  const TabIcon = meta.icon;

  // The audit log is a full-height screen with its own header and filters
  if (subTab === 'audit') {
    return <AuditLogView isActive={isActive} />;
  }

  return (
    <div {...motionPanel} className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-4 sm:p-5 gap-5 overflow-y-auto select-none">
      <header className="motion-static min-h-[4.5rem] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-xs rounded-2xl px-5 py-3.5 flex items-center gap-4 shrink-0">
        <div className="w-11 h-11 rounded-xl bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30 flex items-center justify-center shrink-0">
          <TabIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">لوحة المطور</span>
            <span aria-hidden="true" className="text-ink-muted dark:text-ink-muted-dark font-bold">/</span>
            <h2 className="t-page-title text-ink dark:text-ink-dark leading-tight m-0">{meta.title}</h2>
          </div>
          <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 mt-1">{meta.subtitle}</p>
        </div>
      </header>

      {subTab === 'status' && <RootStatusPage sysInfo={sysInfo} onNavigateToTab={onNavigateToTab} />}
      {subTab === 'receipt' && (
        <RootReceiptPage key={receiptGeneration} isActive={isActive} onDiscard={() => setReceiptGeneration((n) => n + 1)} />
      )}
      {subTab === 'features' && <RootFeaturesPage flags={flags} toggleFlag={toggleFlag} onOpenWizard={() => setIsWizardOpen(true)} />}
      {subTab === 'devices' && <RootDevicesPage />}
      {subTab === 'data' && <RootDataPage />}

      <FirstRunWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onCompleted={() => {
          setIsWizardOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
};
