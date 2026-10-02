import { useState } from 'react';
import { 
  FileSpreadsheet, 
  FolderDown, 
  FolderOpen, 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  FileCheck, 
  Database, 
  Users, 
  Receipt, 
  Truck, 
  Package, 
  Layers
} from 'lucide-react';
import { invoke, type FullStoreExportResult } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';

interface FullStoreExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullStoreExportModal = ({ isOpen, onClose }: FullStoreExportModalProps) => {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<FullStoreExportResult | null>(null);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    try {
      const res = await invoke<{ selectedFolder?: string; cancelled: boolean }>('excel:browseExportFolder');
      if (res && !res.cancelled && res.selectedFolder) {
        setSelectedFolder(res.selectedFolder);
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„ØªØ­Ø¯ÙŠØ¯',
        message: err?.message || 'ØªØ¹Ø°Ø± ÙØªØ­ Ù†Ø§ÙØ°Ø© Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…Ø¬Ù„Ø¯.',
        variant: 'error'
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const res = await invoke<FullStoreExportResult>('excel:exportFullStore', {
        targetFolder: selectedFolder || undefined
      });

      setExportResult(res);

      if (res.success) {
        await rafiqAlert({
          title: 'Ø§ÙƒØªÙ…Ø§Ù„ Ø§Ù„ØªØµØ¯ÙŠØ± Ø§Ù„Ø´Ø§Ù…Ù„',
          message: `${res.message}\nØªÙ… Ø­ÙØ¸ Ø§Ù„Ù…Ù„ÙØ§Øª ÙÙŠ:\n${res.exportFolder}`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'ÙØ´Ù„ Ø§Ù„ØªØµØ¯ÙŠØ±',
          message: res.message || 'ØªØ¹Ø°Ø± ØªØµØ¯ÙŠØ± Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù„.',
          variant: 'error'
        });
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹',
        message: err?.message || 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØµØ¯ÙŠØ± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.',
        variant: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenFolder = async () => {
    const folderToOpen = exportResult?.exportFolder || selectedFolder;
    if (!folderToOpen) return;

    try {
      await invoke('excel:openExportFolder', { folderPath: folderToOpen });
    } catch (err: any) {
      await rafiqAlert({
        title: 'ØªØ¹Ø°Ø± ÙØªØ­ Ø§Ù„Ù…Ø¬Ù„Ø¯',
        message: err?.message || 'Ø§Ù„Ù…Ø¬Ù„Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø².',
        variant: 'error'
      });
    }
  };

  const handleRunParityTests = async () => {
    try {
      const res = await invoke<any>('excel:runExportTests');
      if (res.success) {
        await rafiqAlert({
          title: 'ØªØ£ÙƒÙŠØ¯ Ù…Ø·Ø§Ø¨Ù‚Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',
          message: `${res.message}\nØªØ£ÙƒÙŠØ¯Ø§Øª Ø§Ù„Ù†Ø¬Ø§Ø­: ${res.passedAssertions}/${res.totalAssertions}`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'ÙØ­Øµ Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©',
          message: res.message || 'ØªØ¹Ø°Ø± Ù…Ø·Ø§Ø¨Ù‚Ø© Ø¨Ø¹Ø¶ Ø§Ù„ØµÙÙˆÙ Ø£Ùˆ Ø§Ù„Ù…Ø¬Ø§Ù…ÙŠØ¹.',
          variant: 'error'
        });
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'Ø®Ø·Ø£',
        message: err?.message || 'ØªØ¹Ø°Ø± ØªØ´ØºÙŠÙ„ Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©.',
        variant: 'error'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-line flex flex-col overflow-hidden text-ink font-sans text-right"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="bg-brand-dark px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">ØªØµØ¯ÙŠØ± ÙƒÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù„ Ø¨Ø¶ØºØ·Ø© ÙˆØ§Ø­Ø¯Ø©</h2>
              <p className="text-xs text-white/70">
                Ø¨ÙŠØ§Ù†Ø§ØªÙƒ Ù…Ù„ÙƒÙƒ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ 100% Ø¨ØªÙ†Ø³ÙŠÙ‚ Excel Ù‚ÙŠØ§Ø³ÙŠ ÙˆÙ…ÙØªÙˆØ­
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isExporting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Freedom & Security Guarantee Banner */}
          <div className="flex items-start gap-3 p-4 bg-paid-soft rounded-xl text-xs text-paid border border-paid/20 leading-relaxed font-sans">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sm font-bold text-paid mb-1">
                Ø§Ù„ØªØ²Ø§Ù… Ø±ÙÙŠÙ‚ Ø§Ù„ØµØ§Ø±Ù… Ø¨Ø­Ø±ÙŠØ© Ø§Ù„Ù…Ù„ÙƒÙŠØ© Ø§Ù„Ø±Ù‚Ù…ÙŠØ©:
              </strong>
              ÙŠØ­Ù‚ Ù„Ùƒ ÙÙŠ Ø£ÙŠ ÙˆÙ‚Øª Ø§Ø³ØªØ®Ø±Ø§Ø¬ ÙƒØ§ÙØ© Ø³Ø¬Ù„Ø§Øª Ù…Ø­Ù„Ùƒ (Ø§Ù„Ù…Ù†ØªØ¬Ø§ØªØŒ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ø¯ÙŠÙˆÙ†ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†ØŒ ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§ØªØŒ ÙˆØ­Ø±ÙƒØ§Øª Ø§Ù„Ù…Ø®Ø²ÙˆÙ†) ÙÙŠ Ù…Ù„ÙØ§Øª Ø¥ÙƒØ³Ù„ Ù…Ù†Ø³Ù‚Ø© ÙˆØ¬Ø§Ù‡Ø²Ø© Ø¨Ø¯ÙˆÙ† Ø£ÙŠ ØªØ´ÙÙŠØ± Ø£Ùˆ Ø§Ø­ØªÙƒØ§Ø± Ø£Ùˆ Ø±Ø³ÙˆÙ… Ø®Ø±ÙˆØ¬.
            </div>
          </div>

          {/* Files Summary Grid */}
          <div className="bg-surface-2 p-4 rounded-xl border border-line space-y-3">
            <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider">
              Ø­Ø²Ù…Ø© Ø§Ù„Ù…Ù„ÙØ§Øª Ø§Ù„ØªÙŠ Ø³ÙŠØªÙ… Ø¥Ù†Ø´Ø§Ø¤Ù‡Ø§ ÙÙŠ Ù…Ø¬Ù„Ø¯ ÙˆØ§Ø­Ø¯:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-ink font-medium">
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Package className="w-4 h-4 text-brand shrink-0" />
                <span>01. Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ†</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Users className="w-4 h-4 text-paid shrink-0" />
                <span>02. Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ø¯ÙŠÙˆÙ†</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>03. Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØ§Ù„Ø£Ø±ØµØ¯Ø©</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Receipt className="w-4 h-4 text-blue-600 shrink-0" />
                <span>04. ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Database className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>05. Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù…Ø®Ø²ÙˆÙ†</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-line">
                <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>06. Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª ÙˆØ§Ù„Ø¥ØºÙ„Ø§Ù‚</span>
              </div>
            </div>
            <p className="text-[11px] text-ink-muted font-normal pt-1">
              Ø¨Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ù…Ù„Ù <strong className="font-mono">00_Ø¨ÙŠØ§Ù†Ø§Øª_Ø§Ù„Ù…Ø­Ù„_Ø§Ù„Ø´Ø§Ù…Ù„Ø©.xlsx</strong> Ø§Ù„Ø¬Ø§Ù…Ø¹ Ù„ÙƒØ§ÙØ© Ø§Ù„Ø´ÙŠØªØ§ØªØŒ ÙˆÙˆØ«ÙŠÙ‚Ø© Ù…Ù„ÙƒÙŠØ© Ø±Ø³Ù…ÙŠØ© Ø¨ØµÙŠØºØ© Ù†ØµÙŠØ©.
            </p>
          </div>

          {/* Export Destination Folder Picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink">
              Ù…ÙƒØ§Ù† Ø­ÙØ¸ Ù…Ø¬Ù„Ø¯ Ø§Ù„ØªØµØ¯ÙŠØ± (Ø§Ù„Ù…Ø¬Ù„Ø¯ Ø£Ùˆ Ø§Ù„ÙÙ„Ø§Ø´Ø©):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={selectedFolder || 'Ø³Ø·Ø­ Ø§Ù„Ù…ÙƒØªØ¨ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ (Desktop / RafiqExport)'}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line text-xs font-mono text-ink-muted select-all"
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={isExporting}
                className="px-4 py-2.5 rounded-xl bg-surface border border-line hover:border-line-hover text-ink text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <FolderOpen className="w-4 h-4 text-brand" />
                <span>ØªØºÙŠÙŠØ± Ø§Ù„Ù…Ø¬Ù„Ø¯</span>
              </button>
            </div>
          </div>

          {/* Result Card If Exported */}
          {exportResult && exportResult.success && (
            <div className="p-4 bg-paid-soft rounded-xl border border-paid/30 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-paid font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>ØªÙ… ØªØµØ¯ÙŠØ± {exportResult.generatedFiles.length} Ù…Ù„ÙØ§Øª Ø¨Ù†Ø¬Ø§Ø­ ØªØ§Ù…!</span>
                </div>
                <button
                  onClick={handleOpenFolder}
                  className="px-3 py-1.5 rounded-lg bg-paid text-white text-xs font-bold flex items-center gap-1.5 hover:bg-paid/90 transition-all shadow-xs"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>ÙØªØ­ Ø§Ù„Ù…Ø¬Ù„Ø¯ Ø§Ù„Ø¢Ù†</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-ink pt-1 border-t border-paid/20">
                <div className="p-2 bg-surface rounded-lg">
                  Ø§Ù„Ø£ØµÙ†Ø§Ù: <strong>{exportResult.productsCount}</strong>
                </div>
                <div className="p-2 bg-surface rounded-lg">
                  Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡: <strong>{exportResult.customersCount}</strong>
                </div>
                <div className="p-2 bg-surface rounded-lg">
                  Ø§Ù„ÙÙˆØ§ØªÙŠØ±: <strong>{exportResult.salesCount}</strong>
                </div>
              </div>

              <div className="text-[11px] font-mono text-ink-muted break-all" dir="ltr">
                Folder: {exportResult.exportFolder}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-surface-2 px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRunParityTests}
            disabled={isExporting}
            className="px-3.5 py-2 rounded-xl bg-surface border border-line hover:border-line-hover text-ink-muted hover:text-ink text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
            title="ÙØ­Øµ Ù…Ø·Ø§Ø¨Ù‚Ø© Ø¹Ø¯Ø¯ Ø§Ù„ØµÙÙˆÙ ÙˆØ§Ù„Ù…Ø¬Ø§Ù…ÙŠØ¹ Ø¨ÙŠÙ† Ø¥ÙƒØ³Ù„ ÙˆÙ‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª"
          >
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <span>ÙØ­Øµ Ù…Ø·Ø§Ø¨Ù‚Ø© Ø§Ù„Ù…Ø¬Ø§Ù…ÙŠØ¹</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl border border-line text-ink-muted hover:text-ink text-xs font-semibold hover:bg-surface transition-all disabled:opacity-50"
            >
              Ø¥ØºÙ„Ø§Ù‚
            </button>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              <FolderDown className="w-4 h-4" />
              <span>{isExporting ? 'Ø¬Ø§Ø±ÙŠ ØªØ¬Ù‡ÙŠØ² ÙˆØªØµØ¯ÙŠØ± Ø§Ù„Ù…Ù„ÙØ§Øª...' : 'ØªØµØ¯ÙŠØ± ÙƒÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø¶ØºØ·Ø© ÙˆØ§Ø­Ø¯Ø©'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

