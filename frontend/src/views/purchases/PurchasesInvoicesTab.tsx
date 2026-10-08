import React, { useMemo } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Eye,
  TrendingUp,
  CreditCard,
  Building2,
  HelpCircle,
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { openHelpCenter } from '../../utils/helpService';
import type { Purchase } from '../../types/models';
import { formatMoney } from './types';

interface PurchasesInvoicesTabProps {
  purchases: Purchase[];
  totalSupplierDebtsAmount: number;
  purchaseSearchQuery: string;
  setPurchaseSearchQuery: (val: string) => void;
  purchasePaymentFilter: string;
  setPurchasePaymentFilter: (val: string) => void;
  onOpenNewInvoice: () => void;
  onSelectPurchase: (purchase: Purchase) => void;
}

export const PurchasesInvoicesTab: React.FC<PurchasesInvoicesTabProps> = ({
  purchases,
  totalSupplierDebtsAmount,
  purchaseSearchQuery,
  setPurchaseSearchQuery,
  purchasePaymentFilter,
  setPurchasePaymentFilter,
  onOpenNewInvoice,
  onSelectPurchase,
}) => {
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

  const totalPurchasesAmount = useMemo(() => {
    return purchases.reduce((sum, p) => sum + p.netCostPiasters, 0);
  }, [purchases]);

  const totalUnpaidPurchasesCount = useMemo(() => {
    return purchases.filter((p) => p.paymentStatus === 'CREDIT' || p.paymentStatus === 'PARTIAL').length;
  }, [purchases]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedPurchases,
  } = useClientPagination(filteredPurchases, 25, `${purchaseSearchQuery}_${purchasePaymentFilter}`);

  return (
    <div className="flex-1 flex flex-col gap-2.5 sm:gap-3 overflow-hidden">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
        <div className="bg-surface border border-line rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] text-ink-muted font-bold block">إجمالي المشتريات المسجلة</span>
            <span className="text-lg sm:text-xl font-bold font-mono text-ink mt-0.5 block">
              {formatMoney(totalPurchasesAmount)}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-brand-soft flex items-center justify-center text-brand-dark border border-brand/20 shadow-2xs">
            <TrendingUp className="w-4 h-4 text-brand" />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] text-ink-muted font-bold block">فواتير غير مسددة بالكامل</span>
            <span className="text-lg sm:text-xl font-bold font-mono text-danger mt-0.5 block">
              {totalUnpaidPurchasesCount} فاتورة
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-danger-soft flex items-center justify-center text-danger border border-danger-border shadow-2xs">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] text-ink-muted font-bold block">إجمالي مديونية الموردين</span>
            <span className="text-lg sm:text-xl font-bold font-mono text-warn mt-0.5 block">
              {formatMoney(totalSupplierDebtsAmount)}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-warn-soft flex items-center justify-center text-warn border border-warn-border shadow-2xs">
            <Building2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Actions Bar */}
      <div className="bg-surface border border-line rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex-1 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة أو اسم المورد أو رقم فاتورة المورد..."
              value={purchaseSearchQuery}
              onChange={(e) => setPurchaseSearchQuery(e.target.value)}
              className="w-full h-10 pr-9 pl-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Filter className="w-3.5 h-3.5 text-ink-muted" />
            <span>حالة الدفع:</span>
            <CustomSelect
              value={purchasePaymentFilter}
              onChange={(val) => setPurchasePaymentFilter(val)}
              options={[
                { value: 'all', label: 'كافة الفواتير' },
                { value: 'PAID', label: 'مسددة بالكامل (نقدي)' },
                { value: 'CREDIT', label: 'آجلة (على الحساب)' },
                { value: 'PARTIAL', label: 'سداد جزئي' },
              ]}
              className="w-44"
              size="md"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openHelpCenter('purchases')}
            className="h-10 w-10 flex items-center justify-center bg-surface hover:bg-surface-2 border border-line text-paid rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
            title="شرح ودليل فواتير المشتريات والموردين (F1)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenNewInvoice}
            className="h-10 px-4 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة شراء جديدة</span>
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="flex-1 bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-2xs">
        <div className="h-11 bg-surface-2 border-b border-line grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted">
          <div className="col-span-1">رقم الفاتورة</div>
          <div className="col-span-2">تاريخ الاستلام</div>
          <div className="col-span-3">المورد</div>
          <div className="col-span-2 text-center">رقم فاتورة المورد</div>
          <div className="col-span-1 text-center">الصافي</div>
          <div className="col-span-1 text-center">المتبقي</div>
          <div className="col-span-1 text-center">حالة السداد</div>
          <div className="col-span-1 text-left">التفاصيل</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {filteredPurchases.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-ink-muted gap-2">
              <ShoppingCart className="w-8 h-8 opacity-30" />
              <span className="text-sm font-medium">لا توجد فواتير شراء مسجلة مطابقة للبحث</span>
            </div>
          ) : (
            pagedPurchases.map((pur) => (
              <div
                key={pur.id}
                className="h-12 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 transition-colors"
              >
                <div className="col-span-1 font-mono font-bold text-brand">
                  #{pur.invoiceNumber}
                </div>
                <div className="col-span-2 text-ink-muted">
                  {new Date(pur.invoiceDate).toLocaleDateString('ar-EG-u-nu-latn', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="col-span-3 font-semibold text-ink truncate">
                  {pur.supplierName || 'مورد عام / بدون تحديد'}
                </div>
                <div className="col-span-2 text-center font-mono text-ink-muted">
                  {pur.supplierInvoiceNumber || '—'}
                </div>
                <div className="col-span-1 text-center font-mono font-bold text-ink">
                  {formatMoney(pur.netCostPiasters)}
                </div>
                <div className="col-span-1 text-center font-mono font-semibold">
                  {pur.remainingAmountPiasters > 0 ? (
                    <span className="text-danger">
                      {formatMoney(pur.remainingAmountPiasters)}
                    </span>
                  ) : (
                    <span className="text-paid font-medium">0.00 ج.م</span>
                  )}
                </div>
                <div className="col-span-1 text-center">
                  {pur.paymentStatus === 'PAID' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft text-paid border border-paid/20">
                      مسددة
                    </span>
                  )}
                  {pur.paymentStatus === 'CREDIT' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft text-danger border border-danger-border">
                      آجلة
                    </span>
                  )}
                  {pur.paymentStatus === 'PARTIAL' && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warn-soft text-warn border border-warn-border">
                      جزئي
                    </span>
                  )}
                </div>
                <div className="col-span-1 text-left">
                  <button
                    type="button"
                    onClick={() => onSelectPurchase(pur)}
                    className="p-1.5 text-brand hover:text-brand-dark hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                    title="عرض تفاصيل الفاتورة وبنودها"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
    </div>
  );
};
