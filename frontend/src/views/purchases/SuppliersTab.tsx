import React, { useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Banknote,
  Receipt,
  Archive,
  RotateCcw,
} from 'lucide-react';
import type { Supplier } from '../../types/models';
import { formatMoney } from './types';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';

interface SuppliersTabProps {
  suppliers: Supplier[];
  supplierSearchQuery: string;
  setSupplierSearchQuery: (val: string) => void;
  showArchivedSuppliers: boolean;
  setShowArchivedSuppliers: (val: boolean) => void;
  onOpenAddSupplier: () => void;
  onOpenEditSupplier: (sup: Supplier) => void;
  onOpenPayment: (sup: Supplier) => void;
  onOpenStatement: (sup: Supplier) => void;
  onRequestArchiveSupplier: (sup: Supplier) => void;
  onRestoreSupplier: (id: string) => void;
}

export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  suppliers,
  supplierSearchQuery,
  setSupplierSearchQuery,
  showArchivedSuppliers,
  setShowArchivedSuppliers,
  onOpenAddSupplier,
  onOpenEditSupplier,
  onOpenPayment,
  onOpenStatement,
  onRequestArchiveSupplier,
  onRestoreSupplier,
}) => {
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearchQuery.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!showArchivedSuppliers && !s.isActive) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.companyName && s.companyName.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
      );
    });
  }, [suppliers, supplierSearchQuery, showArchivedSuppliers]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedSuppliers,
  } = useClientPagination(filteredSuppliers, 25, `${supplierSearchQuery}_${showArchivedSuppliers}`);

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
      {/* Top Toolbar */}
      <div className="bg-surface border border-line rounded-xl p-3 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex-1 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث بالاسم أو الشركة أو رقم الهاتف..."
              value={supplierSearchQuery}
              onChange={(e) => setSupplierSearchQuery(e.target.value)}
              className="w-full h-10 pr-9 pl-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchivedSuppliers}
              onChange={(e) => setShowArchivedSuppliers(e.target.checked)}
              className="rounded border-line text-brand focus:ring-brand"
            />
            <span>عرض الموردين المؤرشفين</span>
          </label>
        </div>

        <button
          type="button"
          onClick={onOpenAddSupplier}
          className="h-10 px-4 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مورد جديد</span>
        </button>
      </div>

      {/* Suppliers Table */}
      <div className="flex-1 bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-2xs">
        <div className="h-11 bg-surface-2 border-b border-line grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted">
          <div className="col-span-3">اسم المورد والشركة</div>
          <div className="col-span-2">رقم الهاتف</div>
          <div className="col-span-3">العنوان / الملاحظات</div>
          <div className="col-span-2 text-center">الرصيد المستحق (المديونية)</div>
          <div className="col-span-1 text-center">الحالة</div>
          <div className="col-span-1 text-left">إجراءات</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {filteredSuppliers.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-ink-muted gap-2">
              <Building2 className="w-8 h-8 opacity-30" />
              <span className="text-sm font-medium">لا يوجد موردين مطابقين للبحث</span>
            </div>
          ) : (
            pagedSuppliers.map((sup) => (
              <div
                key={sup.id}
                className={`h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 transition-colors ${
                  !sup.isActive ? 'bg-surface-2/50 opacity-60' : ''
                }`}
              >
                <div className="col-span-3">
                  <span className="font-bold text-ink block truncate">{sup.name}</span>
                  {sup.companyName && (
                    <span className="text-[11px] text-ink-muted block truncate">{sup.companyName}</span>
                  )}
                </div>

                <div className="col-span-2 font-mono text-ink-muted">
                  {sup.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-ink-muted" />
                      <span>{sup.phone}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </div>

                <div className="col-span-3 text-ink-muted truncate">
                  {sup.address || sup.notes || '—'}
                </div>

                <div className="col-span-2 text-center font-mono font-bold">
                  {sup.balancePiasters > 0 ? (
                    <span className="text-danger">
                      {formatMoney(sup.balancePiasters)}
                    </span>
                  ) : (
                    <span className="text-paid font-medium">خالص (0.00 ج.م)</span>
                  )}
                </div>

                <div className="col-span-1 text-center">
                  {sup.isActive ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft text-paid border border-paid/20">
                      نشط
                    </span>
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-2 text-ink-muted border border-line">
                      مؤرشف
                    </span>
                  )}
                </div>

                <div className="col-span-1 text-left flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenPayment(sup)}
                    className="p-1.5 text-paid hover:bg-paid-soft rounded-lg transition-colors cursor-pointer"
                    title="سداد دفعة للمورد"
                  >
                    <Banknote className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenStatement(sup)}
                    className="p-1.5 text-brand hover:text-brand-dark hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                    title="كشف حساب المورد"
                  >
                    <Receipt className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEditSupplier(sup)}
                    className="p-1.5 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                    title="تعديل بيانات المورد"
                  >
                    <Building2 className="w-4 h-4" />
                  </button>
                  {sup.isActive ? (
                    <button
                      type="button"
                      onClick={() => onRequestArchiveSupplier(sup)}
                      className="p-1.5 text-ink-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-colors cursor-pointer"
                      title="أرشفة المورد"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRestoreSupplier(sup.id)}
                      className="p-1.5 text-brand hover:text-brand-dark hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                      title="استعادة المورد النشط"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
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
        totalCount={filteredSuppliers.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="مورد"
      />
    </div>
  );
};
