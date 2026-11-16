import React from 'react';
import type { CartItem } from '../types';
import { ShoppingBag, ArrowLeft, Sparkles } from 'lucide-react';

interface Props {
  cartItems: CartItem[];
  onOpenCart: () => void;
}

export const FloatingCartBar: React.FC<Props> = ({ cartItems, onOpenCart }) => {
  const totalItems = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  if (totalItems === 0) return null;

  let totalPiasters = 0;
  cartItems.forEach(i => {
    totalPiasters += i.product.price_piasters * i.quantity;
  });
  const totalPounds = (totalPiasters / 100).toFixed(2);

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 z-40 sm:w-96 animate-in slide-in-from-bottom-8 duration-300">
      <button
        onClick={onOpenCart}
        className="w-full flex items-center justify-between bg-gradient-to-r from-store-primary via-store-primary-hover to-store-primary text-white p-3.5 sm:p-4 rounded-3xl shadow-2xl shadow-store-primary/35 hover:shadow-store-primary/50 btn-spring transition-all border border-white/20 group"
      >
        {/* Left: Total & Items */}
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center font-bold border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
            <ShoppingBag className="w-5 h-5 text-white" />
            <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-pop">
              {totalItems}
            </span>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/80 font-medium flex items-center gap-1">
              <span>سلة الشراء</span>
              <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse"></span>
              <span>{totalItems} أصناف</span>
            </div>
            <div className="text-base sm:text-lg font-black tracking-tight">{totalPounds} ج.م</div>
          </div>
        </div>

        {/* Right: CTA Arrow */}
        <div className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-black backdrop-blur-md shadow-xs group-hover:translate-x-1 transition-all">
          <span>متابعة الشراء</span>
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        </div>
      </button>
    </div>
  );
};
