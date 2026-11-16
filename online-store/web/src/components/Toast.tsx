import React, { useEffect } from 'react';
import { Check, ShoppingBag, ArrowLeft } from 'lucide-react';

interface Props {
  message: string;
  subMessage?: string;
  isVisible: boolean;
  onClose: () => void;
  onOpenCart?: () => void;
}

export const Toast: React.FC<Props> = ({
  message,
  subMessage,
  isVisible,
  onClose,
  onOpenCart,
}) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-20 sm:top-24 left-4 right-4 sm:left-auto sm:right-8 z-50 sm:max-w-md animate-toast-in pointer-events-auto">
      <div className="flex items-center justify-between gap-3 bg-slate-900/95 backdrop-blur-xl text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/30 animate-pop">
            <Check className="w-4 h-4 stroke-[3]" />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-black truncate">{message}</div>
            {subMessage && (
              <div className="text-[11px] text-slate-400 truncate">{subMessage}</div>
            )}
          </div>
        </div>

        {onOpenCart && (
          <button
            onClick={() => {
              onClose();
              onOpenCart();
            }}
            className="flex items-center gap-1 bg-white/15 hover:bg-white/25 active:scale-95 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0"
          >
            <span>عرض السلة</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
