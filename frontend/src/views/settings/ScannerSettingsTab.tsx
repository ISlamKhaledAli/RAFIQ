import { useState } from 'react';
import { Barcode, Zap, ShieldCheck, Cpu, Server } from 'lucide-react';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';

interface ScannerSettingsTabProps {
  onOpenScannerModal: () => void;
}

export const ScannerSettingsTab = ({ onOpenScannerModal }: ScannerSettingsTabProps) => {
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-5 text-xs text-[#14181a]">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
            <Barcode className="w-5 h-5 text-[#0b4f42]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#14181a] m-0">Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ÙˆØ§Ø®ØªØ¨Ø§Ø± Ù‚Ø§Ø±Ø¦ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯</h3>
            <p className="text-[11px] text-[#5b6664] m-0">Ø¯Ø¹Ù… Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¨Ù†Ø³Ø¨Ø© 100% Ù…Ø¹ Ù„ÙˆØ­Ø§Øª Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©ØŒ ØªÙ…ÙŠÙŠØ² Ø§Ù„Ø³Ø±Ø¹Ø©ØŒ ÙˆØ¶Ø¨Ø· Ø§Ù„Ù…Ø¹Ø§ÙŠÙŠØ±</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHardwareModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[#006d41] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Ø¹Ø±Ø¶ Ù‚Ø§Ø¦Ù…Ø© Ù‚Ø§Ø±Ø¦Ø§Øª Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© ÙˆØ§Ù„Ù…Ø¬Ø±Ø¨Ø© Ù…Ø¹ Ø·Ø±ÙŠÙ‚Ø© Ø¥Ø¹Ø¯Ø§Ø¯Ù‡Ø§"
          >
            <Server className="w-3.5 h-3.5 text-[#006d41]" />
            <span>Ø§Ù„Ù‚Ø§Ø±Ø¦Ø§Øª Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© ÙˆØ§Ù„Ù…Ø¬Ø±Ø¨Ø©</span>
          </button>

          <button
            type="button"
            onClick={onOpenScannerModal}
            className="h-10 px-4 bg-[#0b4f42] hover:bg-[#0f6a57] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>ÙØªØ­ Ø´Ø§Ø´Ø© Ø§Ù„ÙØ­Øµ ÙˆØ§Ù„ØªØ¬Ø±Ø¨Ø© Ø§Ù„Ø­ÙŠØ© Ù„Ù„Ù‚Ø§Ø±Ø¦</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-[#f7f8f6] p-4 rounded-lg border border-[#dce1dc] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#14181a]">
            <ShieldCheck className="w-4 h-4 text-[#0b4f42]" />
            <span>Ø­Ù…Ø§ÙŠØ© Ù„ÙˆØ­Ø© Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©</span>
          </div>
          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            Ù…ÙØ¹Ù‘Ù„Ø© Ø¯Ø§Ø¦Ù…Ø§Ù‹ Ø¹Ø¨Ø± Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„ÙÙŠØ²ÙŠØ§Ø¦ÙŠØ© (DOM Physical Code Mapping). Ù„Ù† ØªØªØ£Ø«Ø± Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø­ØªÙ‰ Ù„Ùˆ Ù†Ø³ÙŠ Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ù„ØºØ© Ø¹Ù„Ù‰ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø£Ùˆ ØªÙ… Ø¶ØºØ· CapsLock.
          </p>
        </div>

        <div className="bg-[#f7f8f6] p-4 rounded-lg border border-[#dce1dc] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#14181a]">
            <Zap className="w-4 h-4 text-[#1b7a4d]" />
            <span>Ø§Ù„ØªÙ…ÙŠÙŠØ² Ø§Ù„Ø²Ù…Ù†ÙŠ Ø§Ù„Ø°ÙƒÙŠ (Timing Wedge)</span>
          </div>
          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            Ø§Ù„Ù†Ø¸Ø§Ù… ÙŠÙ‚ÙŠØ³ Ø§Ù„ÙØ§Ø±Ù‚ Ø§Ù„Ø²Ù…Ù†ÙŠ Ø¨ÙŠÙ† Ø§Ù„Ù†Ø¨Ø¶Ø§Øª (&lt; 65ms) Ù„ØªÙ…ÙŠÙŠØ² Ø§Ù„Ù…Ø³Ø­ Ø§Ù„Ø³Ø±ÙŠØ¹ Ø¹Ù† Ø§Ù„ÙƒØªØ§Ø¨Ø© Ø§Ù„ÙŠØ¯ÙˆÙŠØ© ÙˆØ¥Ø¶Ø§ÙØ© Ø§Ù„ØµÙ†Ù Ù…Ø¨Ø§Ø´Ø±Ø© Ù„Ù„Ø³Ù„Ø© Ø¨Ø¯ÙˆÙ† Ù„Ù…Ø³ Ø§Ù„Ù…Ø§ÙˆØ³.
          </p>
        </div>

        <div className="bg-[#f7f8f6] p-4 rounded-lg border border-[#dce1dc] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#14181a]">
            <Cpu className="w-4 h-4 text-[#0b4f42]" />
            <span>ØªÙˆØ§ÙÙ‚ Ø§Ù„Ø¹ØªØ§Ø¯ (Hardware Compatibility)</span>
          </div>
          <p className="text-[11px] text-[#5b6664] leading-relaxed m-0 font-sans">
            ÙŠØ¯Ø¹Ù… ÙƒØ§ÙØ© Ù‚Ø§Ø±Ø¦Ø§Øª Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø§Ù„Ø³Ù„ÙƒÙŠØ© ÙˆØ§Ù„Ù„Ø§Ø³Ù„ÙƒÙŠØ© ÙˆØ¨Ø§Ø±ÙƒÙˆØ¯Ø§Øª Ø§Ù„Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø¯Ù…Ø¬Ø© Ø°Ø§Øª Ø§Ù„Ù€ 13 Ø±Ù‚Ù…Ø§Ù‹ ÙˆCode 128 ÙˆCode 39.
          </p>
        </div>
      </div>

      <CertifiedHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        initialCategory="scanner"
      />
    </div>
  );
};

