import React, { useEffect, useRef, useState } from 'react';
import { Home, Layers, ShoppingBag, Clock, MessageSquare } from 'lucide-react';
import { buildWhatsAppUrl } from '../utils/whatsapp';

interface Props {
  activeTab: string;
  cartCount: number;
  whatsappPhone?: string | null;
  onSelectTab: (tab: string) => void;
  onOpenCart: () => void;
  onOpenTracker: () => void;
}

export const MobileBottomNav: React.FC<Props> = ({
  activeTab,
  cartCount,
  whatsappPhone,
  onSelectTab,
  onOpenCart,
  onOpenTracker,
}) => {
  const [badgePop, setBadgePop] = useState<'a' | 'b'>('a');
  const prevCartCountRef = useRef(cartCount);

  useEffect(() => {
    if (cartCount > 0 && cartCount !== prevCartCountRef.current) {
      setBadgePop(prev => (prev === 'a' ? 'b' : 'a'));
    }
    prevCartCountRef.current = cartCount;
  }, [cartCount]);
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-store-line/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1.5 py-1 bottom-safe bg-store-card/95 backdrop-blur-md">
      <div className="grid grid-cols-5 items-center justify-around">
        {/* Home */}
        <button
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center py-0.5 rounded-xl transition-colors btn-spring cursor-pointer ${
            activeTab === 'home' ? 'text-store-primary' : 'text-store-muted hover:text-store-text'
          }`}
        >
          <Home className={`w-[18px] h-[18px] ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-0.5 font-bold leading-tight">الرئيسية</span>
        </button>

        {/* Categories */}
        <button
          onClick={() => onSelectTab('categories')}
          className={`flex flex-col items-center justify-center py-0.5 rounded-xl transition-colors btn-spring cursor-pointer ${
            activeTab === 'categories' ? 'text-store-primary' : 'text-store-muted hover:text-store-text'
          }`}
        >
          <Layers className={`w-[18px] h-[18px] ${activeTab === 'categories' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-0.5 font-bold leading-tight">الأقسام</span>
        </button>

        {/* Cart */}
        <button
          onClick={onOpenCart}
          className="relative flex flex-col items-center justify-center py-0.5 text-store-muted hover:text-store-primary transition-colors btn-spring cursor-pointer"
        >
          <div className="relative">
            <ShoppingBag className="w-[18px] h-[18px] stroke-[2]" />
            {cartCount > 0 && (
              <span
                data-pop={badgePop}
                className="absolute -top-1.5 -right-2 bg-store-secondary text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm tabular-nums"
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 font-bold leading-tight">السلة</span>
        </button>

        {/* Orders Tracker */}
        <button
          onClick={onOpenTracker}
          className="flex flex-col items-center justify-center py-0.5 text-store-muted hover:text-store-text transition-colors btn-spring cursor-pointer"
        >
          <Clock className="w-[18px] h-[18px] stroke-[1.8]" />
          <span className="text-[10px] mt-0.5 font-bold leading-tight">أوردراتي</span>
        </button>

        {/* WhatsApp Chat Support */}
        {whatsappPhone ? (
          <a
            href={buildWhatsAppUrl(whatsappPhone)}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center justify-center py-0.5 text-emerald-600 hover:text-emerald-700 transition-colors btn-spring"
          >
            <MessageSquare className="w-[18px] h-[18px] stroke-[2]" />
            <span className="text-[10px] mt-0.5 font-bold leading-tight">محادثة</span>
          </a>
        ) : (
          <div className="w-5 h-5"></div>
        )}
      </div>
    </nav>
  );
};
