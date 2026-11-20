import React, { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

interface Props {
  message: string;
  toastKey?: number;
  isVisible: boolean;
  onClose: () => void;
}

export const Toast: React.FC<Props> = ({
  message,
  toastKey,
  isVisible,
  onClose,
}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isVisible, toastKey]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-[110px] inset-x-3 sm:bottom-6 sm:left-6 sm:right-auto z-50 flex justify-center sm:justify-start pointer-events-none">
      <div
        key={toastKey}
        className="inline-flex items-center gap-2 max-w-[90vw] sm:max-w-xs bg-[#00372D] text-white px-3.5 py-1.5 rounded-full shadow-lg border border-[#006D41]/50 motion-toast"
      >
        <span className="w-4 h-4 rounded-full bg-[#006D41] text-white flex items-center justify-center shrink-0">
          <Check className="w-2.5 h-2.5 stroke-[3]" />
        </span>
        <span className="text-xs font-bold truncate leading-none py-0.5">{message}</span>
      </div>
    </div>
  );
};
