import React from 'react';
import { Truck, CheckCircle2 } from 'lucide-react';

interface Props {
  currentSubtotalPiasters: number;
  freeShippingThresholdPiasters?: number;
  unlockedMessage?: string;
}

export const FreeShippingProgressBar: React.FC<Props> = ({
  currentSubtotalPiasters,
  freeShippingThresholdPiasters = 25000, // 250 EGP in piasters
  unlockedMessage,
}) => {
  const currentPounds = Math.floor(currentSubtotalPiasters / 100);
  const thresholdPounds = Math.floor(freeShippingThresholdPiasters / 100);
  const remainingPounds = Math.max(0, thresholdPounds - currentPounds);
  const progressPercent = Math.min(100, Math.round((currentSubtotalPiasters / freeShippingThresholdPiasters) * 100));
  const isUnlocked = remainingPounds === 0;

  return (
    <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200/90 rounded-2xl p-2.5 sm:p-3 shadow-2xs">
      <div className="flex items-center justify-between text-xs font-bold mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isUnlocked ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 animate-pop" />
              <span className="font-black text-emerald-800 text-[11px] sm:text-xs truncate">
                {unlockedMessage || 'مبروك! حصلت على توصيل مجاني لطلبك'}
              </span>
            </>
          ) : (
            <>
              <Truck className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span className="text-[11px] sm:text-xs text-emerald-950 truncate">
                أضف بـ <strong className="font-black text-emerald-800 underline tabular-nums">{remainingPounds} ج.م</strong> لتكسب توصيل مجاني!
              </span>
            </>
          )}
        </div>
        <span className="text-[10px] sm:text-[11px] font-black text-emerald-700 tabular-nums flex-shrink-0">
          {progressPercent}%
        </span>
      </div>

      {/* Progress Bar Track */}
      <div className="w-full h-1.5 sm:h-2 rounded-full bg-emerald-200/60 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isUnlocked
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
              : 'bg-gradient-to-r from-amber-500 to-emerald-600'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};
