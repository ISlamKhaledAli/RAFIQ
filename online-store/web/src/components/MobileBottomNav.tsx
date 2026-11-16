import React from 'react';
import { Home, Layers, ShoppingBag, Clock, MessageSquare } from 'lucide-react';

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
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-slate-200/80 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] px-2 py-1.5 bottom-safe">
      <div className="grid grid-cols-5 items-center justify-around">
        {/* Home */}
        <button
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
            activeTab === 'home' ? 'text-store-primary' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 font-bold">الرئيسية</span>
        </button>

        {/* Categories */}
        <button
          onClick={() => onSelectTab('categories')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
            activeTab === 'categories' ? 'text-store-primary' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className={`w-5 h-5 ${activeTab === 'categories' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 font-bold">الأقسام</span>
        </button>

        {/* Cart */}
        <button
          onClick={onOpenCart}
          className="relative flex flex-col items-center justify-center py-1 text-slate-700 hover:text-store-primary transition-colors"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 stroke-[2]" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-rose-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 font-bold">السلة</span>
        </button>

        {/* Orders Tracker */}
        <button
          onClick={onOpenTracker}
          className="flex flex-col items-center justify-center py-1 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Clock className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] mt-1 font-bold">طلباتي</span>
        </button>

        {/* WhatsApp Chat Support */}
        {whatsappPhone ? (
          <a
            href={`https://wa.me/2${whatsappPhone.replace(/^0+/, '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center justify-center py-1 text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <MessageSquare className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] mt-1 font-bold">محادثة</span>
          </a>
        ) : (
          <div className="w-5 h-5"></div>
        )}
      </div>
    </nav>
  );
};
