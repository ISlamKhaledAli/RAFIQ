import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Banknote,
  Receipt,
  Archive,
  RotateCcw,
  Edit2,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import type { Supplier } from '../../types/models';
import { formatMoney } from './types';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';

interface SuppliersTabProps {
  suppliers: Supplier[];
  loading?: boolean;
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
  loading = false,
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
  const showLoading = useSmoothLoading(loading, 300);
  const [activeMenu, setActiveMenu] = useState<{
    supplier: Supplier;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close actions menu on click outside, Escape, or scrolling
  useEffect(() => {
    if (!activeMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };

    const handleScroll = (e: Event) => {
      if (menuRef.current && (menuRef.current === e.target || menuRef.current.contains(e.target as Node))) {
        return;
      }
      setActiveMenu(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeMenu]);

  const handleToggleMenu = (sup: Supplier, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (activeMenu?.supplier.id === sup.id) {
      setActiveMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuEstimatedHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const menuWidth = 220;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = window.innerWidth - menuWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    let top = openUpwards ? rect.top - 6 : rect.bottom + 6;
    if (!openUpwards && top + menuEstimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - menuEstimatedHeight - 8);
    }

    setActiveMenu({
      supplier: sup,
      top,
      left,
      openUpwards,
    });
  };
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
          <div className="col-span-1 text-center">إجراءات</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {showLoading ? (
            <RafiqLoadingState
              label="جاري تحميل دليل الموردين والشركات..."
              sublabel="استرجاع الحسابات ومطابقة أرصدة المديونيات وحركات التوريد"
            />
          ) : filteredSuppliers.length === 0 ? (
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
                    <div>
                      <span className="text-danger block">
                        {formatMoney(sup.balancePiasters)}
                      </span>
                      <span className="text-[10px] text-danger/80 font-bold">له فلوس علينا</span>
                    </div>
                  ) : sup.balancePiasters < 0 ? (
                    <div>
                      <span className="text-paid block">
                        {formatMoney(Math.abs(sup.balancePiasters))}
                      </span>
                      <span className="text-[10px] text-paid/90 font-bold">لينا فلوس عنده (سايبينها)</span>
                    </div>
                  ) : (
                    <span className="text-ink-muted font-medium">خالص تماماً (0.00 ج.م)</span>
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

                <div className="col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => handleToggleMenu(sup, e)}
                    className={`h-7 px-2.5 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer select-none ${
                      activeMenu?.supplier.id === sup.id
                        ? 'bg-brand text-white border-brand ring-2 ring-brand/20 shadow-xs'
                        : 'bg-surface hover:bg-surface-2 border-line text-ink hover:text-brand hover:border-brand/40'
                    }`}
                    title="قائمة إجراءات وخيارات المورد"
                  >
                    <MoreHorizontal
                      className={`w-3.5 h-3.5 transition-colors ${
                        activeMenu?.supplier.id === sup.id ? 'text-white' : 'text-brand'
                      }`}
                    />
                    <span>إجراءات</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-150 ${
                        activeMenu?.supplier.id === sup.id ? 'rotate-180 text-white' : 'text-ink-muted'
                      }`}
                    />
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
        totalCount={filteredSuppliers.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="مورد"
      />

      {/* Floating Actions Portal Dropdown Menu */}
      {activeMenu &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: activeMenu.top,
              left: activeMenu.left,
              transform: activeMenu.openUpwards ? 'translateY(-100%)' : 'none',
              width: '220px',
              zIndex: 9999,
            }}
            onWheel={(e) => e.stopPropagation()}
            className="bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden animate-fade-in text-right font-sans select-none"
            dir="rtl"
          >
            {/* Supplier Info Header */}
            <div className="p-2.5 bg-surface-2/80 border-b border-line">
              <div className="font-bold text-xs text-ink truncate">{activeMenu.supplier.name}</div>
              <div className="flex items-center justify-between text-[10px] text-ink-muted mt-1 font-mono">
                <span className="truncate">{activeMenu.supplier.companyName || activeMenu.supplier.phone || 'مورد'}</span>
                <span
                  className={`font-bold shrink-0 font-sans ${
                    activeMenu.supplier.balancePiasters > 0
                      ? 'text-danger'
                      : activeMenu.supplier.balancePiasters < 0
                      ? 'text-paid'
                      : 'text-ink-muted'
                  }`}
                >
                  {activeMenu.supplier.balancePiasters > 0
                    ? `له: ${formatMoney(activeMenu.supplier.balancePiasters)}`
                    : activeMenu.supplier.balancePiasters < 0
                    ? `لينا: ${formatMoney(Math.abs(activeMenu.supplier.balancePiasters))}`
                    : 'خالص (0.00)'}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-1.5 flex flex-col gap-0.5">
              {/* 1. Payment */}
              <button
                type="button"
                onClick={() => {
                  const s = activeMenu.supplier;
                  setActiveMenu(null);
                  onOpenPayment(s);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-paid-soft text-ink hover:text-paid text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-paid-soft text-paid group-hover:bg-paid group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Banknote className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">سداد دفعة للمورد</span>
              </button>

              {/* 2. Statement */}
              <button
                type="button"
                onClick={() => {
                  const s = activeMenu.supplier;
                  setActiveMenu(null);
                  onOpenStatement(s);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Receipt className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">كشف حساب المورد</span>
              </button>

              {/* 3. Edit */}
              <button
                type="button"
                onClick={() => {
                  const s = activeMenu.supplier;
                  setActiveMenu(null);
                  onOpenEditSupplier(s);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-surface-2 text-ink-muted group-hover:bg-brand-soft group-hover:text-brand flex items-center justify-center shrink-0 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">تعديل بيانات المورد</span>
              </button>

              {/* Divider */}
              <div className="my-0.5 border-t border-line" />

              {/* 4. Archive / Restore */}
              {activeMenu.supplier.isActive ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = activeMenu.supplier;
                    setActiveMenu(null);
                    onRequestArchiveSupplier(s);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-danger-soft text-ink hover:text-danger text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-danger-soft text-danger group-hover:bg-danger group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Archive className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate text-danger">أرشفة المورد</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const s = activeMenu.supplier;
                    setActiveMenu(null);
                    onRestoreSupplier(s.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate text-brand">استعادة المورد النشط</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
