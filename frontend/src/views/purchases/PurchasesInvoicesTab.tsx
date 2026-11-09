import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart,
  Plus,
  Filter,
  Eye,
  TrendingUp,
  CreditCard,
  Building2,
  HelpCircle,
  Tag,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { AppButton } from '../../components/AppButton';
import {
  MENU_PANEL,
  MENU_ITEM,
  MENU_ITEM_ICON,
  TABLE_ACTION_TRIGGER,
} from '../../utils/buttonStyles';
import { SearchInput } from '../../components/SearchInput';
import { DateFilterControl } from '../../components/DateFilterControl';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { openHelpCenter } from '../../utils/helpService';
import type { Purchase } from '../../types/models';
import { formatMoney } from './types';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import { usePermission } from '../../utils/usePermission';
import {
  type DateFilterValue,
  DEFAULT_DATE_FILTER,
  describeDateFilter,
  getDateFilterKey,
  isDateFilterActive,
} from '../../utils/dateFilter';
import { PURCHASES_LOAD_LIMIT } from './purchasesQuery';
import { remToPx } from '../../utils/textScale';

interface PurchasesInvoicesTabProps {
  purchases: Purchase[];
  loading?: boolean;
  /** The period is applied by the backend query, so the parent owns the state and the load. */
  dateFilter: DateFilterValue;
  onDateFilterChange: (value: DateFilterValue) => void;
  totalSupplierDebtsAmount: number;
  totalSupplierCreditsAmount: number;
  purchaseSearchQuery: string;
  setPurchaseSearchQuery: (val: string) => void;
  purchasePaymentFilter: string;
  setPurchasePaymentFilter: (val: string) => void;
  onOpenNewInvoice: () => void;
  onSelectPurchase: (purchase: Purchase) => void;
  onPrintLabels?: (purchase: Purchase) => void;
}

export const PurchasesInvoicesTab: React.FC<PurchasesInvoicesTabProps> = ({
  purchases,
  loading = false,
  dateFilter,
  onDateFilterChange,
  totalSupplierDebtsAmount,
  totalSupplierCreditsAmount,
  purchaseSearchQuery,
  setPurchaseSearchQuery,
  purchasePaymentFilter,
  setPurchasePaymentFilter,
  onOpenNewInvoice,
  onSelectPurchase,
  onPrintLabels,
}) => {
  const showLoading = useSmoothLoading(loading, 300);
  const [activeMenu, setActiveMenu] = useState<{
    purchase: Purchase;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the options menu on outside click, Escape, scroll outside the menu, or resize
  useEffect(() => {
    if (!activeMenu) return;

    const close = () => setActiveMenu(null);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const handleScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [activeMenu]);

  const handleToggleMenu = (purchase: Purchase, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (activeMenu?.purchase.id === purchase.id) {
      setActiveMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuEstimatedHeight = remToPx(6.875);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const menuWidth = remToPx(14.375);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) left = window.innerWidth - menuWidth - 12;
    if (left < 12) left = 12;

    setActiveMenu({
      purchase,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left,
      openUpwards,
    });
  };

  const canCreatePurchase = usePermission('purchases.create');
  const isDateActive = isDateFilterActive(dateFilter);
  const periodLabel = describeDateFilter(dateFilter);
  const isTruncated = purchases.length >= PURCHASES_LOAD_LIMIT;
  const hasAnyFilter = isDateActive || purchasePaymentFilter !== 'all' || purchaseSearchQuery.trim() !== '';

  const resetAllFilters = () => {
    onDateFilterChange({ ...DEFAULT_DATE_FILTER });
    setPurchasePaymentFilter('all');
    setPurchaseSearchQuery('');
  };

  const filteredPurchases = useMemo(() => {
    const q = purchaseSearchQuery.trim().toLowerCase();
    return purchases.filter((p) => {
      if (purchasePaymentFilter !== 'all' && p.paymentStatus !== purchasePaymentFilter) {
        return false;
      }
      if (!q) return true;
      const numMatch = p.invoiceNumber.toString().includes(q);
      const supMatch = p.supplierName && p.supplierName.toLowerCase().includes(q);
      const supInvMatch = p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(q);
      return numMatch || supMatch || supInvMatch;
    });
  }, [purchases, purchaseSearchQuery, purchasePaymentFilter]);

  // Cards follow the rows on screen (period, payment status and search together)
  const totalPurchasesAmount = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + p.netCostPiasters, 0);
  }, [filteredPurchases]);

  const totalUnpaidPurchasesCount = useMemo(() => {
    return filteredPurchases.filter((p) => p.paymentStatus === 'CREDIT' || p.paymentStatus === 'PARTIAL').length;
  }, [filteredPurchases]);


  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedPurchases,
  } = useClientPagination(filteredPurchases, 25, `${purchaseSearchQuery}_${purchasePaymentFilter}_${getDateFilterKey(dateFilter)}`);

  return (
    <div className="flex-1 flex flex-col gap-2.5 sm:gap-3 overflow-hidden">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs">
          <div className="min-w-0">
            <span
              className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold block truncate"
              title={isDateActive ? `إجمالي فواتير شراء البضاعة (${periodLabel})` : undefined}
            >
              إجمالي فواتير شراء البضاعة{isDateActive ? ` (${periodLabel})` : ''}
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-ink dark:text-ink-dark mt-0.5 block">
              {formatMoney(totalPurchasesAmount)}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-soft/20 flex items-center justify-center text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 shadow-2xs">
            <TrendingUp className="w-4 h-4 text-brand dark:text-brand-bright" />
          </div>
        </div>

        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold block">فواتير لسه ما كملتش دفع</span>
            <span className="text-lg sm:text-xl font-bold font-mono text-danger dark:text-danger-bright mt-0.5 block">
              {totalUnpaidPurchasesCount} فاتورة
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-danger-soft dark:bg-danger-dark-soft flex items-center justify-center text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30 shadow-2xs">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold block">
              {totalSupplierCreditsAmount > 0 ? 'فلوس علينا للموردين / رصيد لنا' : 'فلوس علينا للموردين والشركات'}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-lg sm:text-xl font-bold font-mono text-warn dark:text-warn-bright">
                {formatMoney(totalSupplierDebtsAmount)}
              </span>
              {totalSupplierCreditsAmount > 0 && (
                <span className="text-micro font-mono font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.5 rounded border border-paid/20 dark:border-paid/40" title="رصيد لصالحنا عند الموردين تحت الحساب">
                  +{formatMoney(totalSupplierCreditsAmount)} لنا
                </span>
              )}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-warn-soft dark:bg-warn-dark-soft flex items-center justify-center text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30 shadow-2xs">
            <Building2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Actions Bar */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex-1 flex flex-wrap items-center gap-x-8 gap-y-3">
          <SearchInput
            size="md"
            value={purchaseSearchQuery}
            onChange={setPurchaseSearchQuery}
            placeholder="دور برقم الفاتورة، اسم الشركة، أو رقم فاتورة المورد..."
            ariaLabel="بحث في فواتير الشراء"
            className="flex-1 min-w-[15rem] max-w-md"
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              <Filter className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
              <span>طريقة السداد:</span>
              <CustomSelect
                value={purchasePaymentFilter}
                onChange={(val) => setPurchasePaymentFilter(val)}
                options={[
                  { value: 'all', label: 'كل الفواتير' },
                  { value: 'PAID', label: 'خالصة ومدفوعة بالكامل' },
                  { value: 'OVERPAID', label: 'مدفوع بزيادة (رصيد لنا)' },
                  { value: 'CREDIT', label: 'آجل (على الحساب)' },
                  { value: 'PARTIAL', label: 'مدفوع جزء منها والباقي آجل' },
                ]}
                className="w-44"
                size="md"
              />
            </div>

            <DateFilterControl
              value={dateFilter}
              onChange={onDateFilterChange}
              size="md"
              selectWidthClass="w-44 sm:w-48"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCreatePurchase && (
          <AppButton variant="primary" size="md" icon={Plus} onClick={onOpenNewInvoice}>
            فاتورة شراء جديدة
          </AppButton>
          )}

          <AppButton
            variant="secondary"
            size="md"
            icon={HelpCircle}
            aria-label="شرح ودليل فواتير المشتريات والموردين"
            title="شرح ودليل فواتير المشتريات والموردين"
            onClick={() => openHelpCenter('purchases')}
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl overflow-hidden flex flex-col shadow-2xs">
        <div className="h-11 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
          <div className="col-span-1">رقم الفاتورة</div>
          <div className="col-span-2">تاريخ استلام البضاعة</div>
          <div className="col-span-2">المورد / الشركة</div>
          <div className="col-span-2 text-center">رقم وصل المورد</div>
          <div className="col-span-1 text-center">إجمالي الفاتورة</div>
          <div className="col-span-1 text-center">الباقي علينا</div>
          <div className="col-span-1 text-center">حالة الدفع</div>
          <div className="col-span-2 text-center">خيارات</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark">
          {showLoading ? (
            <RafiqLoadingState
              label="بنحمّل فواتير الشراء والبضاعة اللي دخلت..."
              sublabel="جاري جلب فواتير التوريد وحسابات الشركات من قاعدة البيانات"
            />
          ) : filteredPurchases.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <ShoppingCart className="w-8 h-8 opacity-30" />
              <span className="text-sm font-medium">
                {isDateActive ? `مفيش فواتير شراء في الفترة دي (${periodLabel})` : 'مفيش فواتير شراء مطابقة للي بتدور عليه'}
              </span>
              {hasAnyFilter && (
                <AppButton variant="soft" size="md" onClick={resetAllFilters}>
                  مسح الفلاتر وعرض كل الفواتير
                </AppButton>
              )}
            </div>
          ) : (
            pagedPurchases.map((pur) => (
              <div
                key={pur.id}
                className="h-12 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors"
              >
                <div className="col-span-1 font-mono font-bold text-brand dark:text-brand-bright">
                  #{pur.invoiceNumber}
                </div>
                <div className="col-span-2 text-ink-muted dark:text-ink-dark-muted">
                  {new Date(pur.invoiceDate).toLocaleDateString('ar-EG-u-nu-latn', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="col-span-2 font-semibold text-ink dark:text-ink-dark truncate" title={pur.supplierName || undefined}>
                  {pur.supplierName || 'مورد عام / بدون تحديد'}
                </div>
                <div className="col-span-2 text-center font-mono text-ink-muted dark:text-ink-dark-muted">
                  {pur.supplierInvoiceNumber || '—'}
                </div>
                <div className="col-span-1 text-center font-mono font-bold text-ink dark:text-ink-dark">
                  {formatMoney(pur.netCostPiasters)}
                </div>
                <div className="col-span-1 text-center font-mono font-semibold">
                  {pur.remainingAmountPiasters > 0 ? (
                    <span className="text-danger dark:text-danger-bright">
                      {formatMoney(pur.remainingAmountPiasters)}
                    </span>
                  ) : (
                    <span className="text-ink-muted dark:text-ink-dark-muted font-medium">—</span>
                  )}
                </div>
                <div className="col-span-1 text-center">
                  {pur.paymentStatus === 'PAID' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/30">
                      {pur.paymentSource === 'instapay'
                        ? 'إنستاباي'
                        : pur.paymentSource === 'vodafone_cash'
                        ? 'فودافون كاش'
                        : pur.paymentSource === 'external_cash'
                        ? 'كاش خارجي'
                        : 'خالصة'}
                    </span>
                  )}
                  {pur.paymentStatus === 'OVERPAID' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-bold bg-paid text-white border border-paid dark:border-paid-bright shadow-2xs">
                      زيادة
                    </span>
                  )}
                  {pur.paymentStatus === 'CREDIT' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30">
                      آجل
                    </span>
                  )}
                  {pur.paymentStatus === 'PARTIAL' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30">
                      جزء مدفوع
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-center">
                  <button
                    type="button"
                    onClick={(e) => handleToggleMenu(pur, e)}
                    aria-expanded={activeMenu?.purchase.id === pur.id}
                    aria-haspopup="menu"
                    className={TABLE_ACTION_TRIGGER}
                    title="قائمة خيارات الفاتورة"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    <span>خيارات</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isTruncated && (
        <div className="shrink-0 text-micro font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 rounded-xl px-3 py-1.5">
          معروض أحدث {PURCHASES_LOAD_LIMIT} فاتورة فقط، حدّد فترة أضيق لعرض الفواتير الأقدم.
        </div>
      )}

      {/* Pagination Bar */}
      <PaginationBar
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={filteredPurchases.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="فاتورة شراء"
      />

      {activeMenu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: activeMenu.top,
              left: activeMenu.left,
              transform: activeMenu.openUpwards ? 'translateY(-100%)' : 'none',
              width: '14.375rem',
              zIndex: 9999,
            }}
            onWheel={(e) => e.stopPropagation()}
            className={`${MENU_PANEL} font-sans`}
            dir="rtl"
          >
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const pur = activeMenu.purchase;
                  setActiveMenu(null);
                  onSelectPurchase(pur);
                }}
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <Eye className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 truncate">عرض التفاصيل والبنود</span>
              </button>
              {onPrintLabels && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const pur = activeMenu.purchase;
                    setActiveMenu(null);
                    onPrintLabels(pur);
                  }}
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <Tag className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 truncate">طباعة ملصقات الباركود</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
