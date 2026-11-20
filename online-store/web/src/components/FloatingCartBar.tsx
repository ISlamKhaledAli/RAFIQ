import React, { useEffect, useRef, useState } from 'react';
import type { CartItem } from '../types';
import { ShoppingBag, ArrowLeft } from 'lucide-react';

interface Props {
  cartItems: CartItem[];
  onOpenCart: () => void;
}

export const FloatingCartBar: React.FC<Props> = ({ cartItems, onOpenCart }) => {
  const totalItems = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const [badgePop, setBadgePop] = useState<'a' | 'b'>('a');
  const prevTotalRef = useRef(totalItems);

  useEffect(() => {
    if (totalItems > 0 && totalItems !== prevTotalRef.current) {
      setBadgePop(prev => (prev === 'a' ? 'b' : 'a'));
    }
    prevTotalRef.current = totalItems;
  }, [totalItems]);

  if (totalItems === 0) return null;

  let totalPiasters = 0;
  cartItems.forEach(i => {
    totalPiasters += i.product.price_piasters * i.quantity;
  });
  const totalPounds = (totalPiasters / 100).toFixed(2);

  const itemsCountLabel =
    totalItems === 1 ? 'صنف واحد' : totalItems === 2 ? 'صنفان' : `${totalItems} أصناف`;

  return (
    <div className="fixed bottom-[56px] sm:bottom-6 left-2.5 right-2.5 sm:left-auto sm:right-6 z-40 sm:w-auto sm:min-w-[360px] sm:max-w-[440px] motion-panel">
      <button
        onClick={onOpenCart}
        className="w-full flex items-center justify-between gap-2.5 sm:gap-4 bg-gradient-to-r from-store-primary via-store-secondary to-store-primary text-white px-2.5 py-2 sm:px-4 sm:py-3.5 rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl shadow-store-primary/35 hover:shadow-store-primary/50 btn-spring transition-all border border-white/20 group"
      >
        {/* Right: Total & Items */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="relative w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/15 flex items-center justify-center font-bold border border-white/20 shadow-inner group-hover:scale-105 transition-transform shrink-0">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            <span
              data-pop={badgePop}
              className="absolute -top-1.5 -right-1.5 bg-store-accent text-slate-950 text-[9px] sm:text-[10px] font-black min-w-[18px] h-[18px] sm:min-w-[20px] sm:h-5 px-1 rounded-full flex items-center justify-center shadow-md tabular-nums"
            >
              {totalItems}
            </span>
          </div>
          <div className="text-right min-w-0">
            <div className="hidden sm:flex text-[11px] text-white/85 font-medium items-center gap-1.5 whitespace-nowrap">
              <span>سلة الأوردر</span>
              <span className="w-1 h-1 rounded-full bg-store-accent shrink-0"></span>
              <span>{itemsCountLabel}</span>
            </div>
            <div className="flex sm:block items-baseline gap-1.5">
              <span className="text-sm sm:text-lg font-black tracking-tight tabular-nums whitespace-nowrap">
                {totalPounds} <span className="text-[11px] sm:text-xs font-bold text-white/85">ج.م</span>
              </span>
              <span className="sm:hidden text-[10px] text-white/80 font-bold whitespace-nowrap">
                • {itemsCountLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Left: CTA Arrow */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black shadow-sm whitespace-nowrap shrink-0 transition-colors">
          <span>إتمام الأوردر</span>
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:-translate-x-1" />
        </div>
      </button>
    </div>
  );
};
