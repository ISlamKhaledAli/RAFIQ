import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Plus,
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
import { normalizeArabicNumerals, normalizeArabicText } from '../../utils/money';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { formatPhoneDisplay } from '../../utils/phoneFormat';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { AppButton } from '../../components/AppButton';
import { SearchInput } from '../../components/SearchInput';
import { MENU_PANEL, MENU_ITEM, MENU_ITEM_DANGER, MENU_ITEM_ICON, MENU_ITEM_ICON_DANGER, MENU_DIVIDER, TABLE_ACTION_TRIGGER } from '../../utils/buttonStyles';
import { remToPx } from '../../utils/textScale';

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
    const menuEstimatedHeight = remToPx(13.75);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const menuWidth = remToPx(13.75);
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
    const rawQuery = supplierSearchQuery.trim();
    if (!rawQuery) {
      return showArchivedSuppliers ? suppliers : suppliers.filter((s) => s.isActive);
    }
    const normTextQuery = normalizeArabicText(rawQuery);
    const normDigitQuery = normalizeArabicNumerals(rawQuery).replace(/[^\d]/g, '');

    return suppliers.filter((s) => {
      if (!showArchivedSuppliers && !s.isActive) return false;
      const sNameNorm = normalizeArabicText(s.name);
      const sCompNorm = normalizeArabicText(s.companyName || '');
      const sPhoneNorm = (s.phone || '').replace(/[^\d]/g, '');

      const textMatch = sNameNorm.includes(normTextQuery) || sCompNorm.includes(normTextQuery);
      const phoneMatch = normDigitQuery.length > 0 && sPhoneNorm.includes(normDigitQuery);

      return textMatch || phoneMatch;
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
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex-1 flex items-center gap-x-8 gap-y-3">
          <SearchInput
            size="md"
            value={supplierSearchQuery}
            onChange={setSupplierSearchQuery}
            placeholder="ابحث بالاسم أو الشركة أو رقم الهاتف..."
            ariaLabel="بحث في الموردين"
            className="flex-1 max-w-md"
          />

          <div className="h-10 px-3 flex items-center gap-2.5 shrink-0 rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
            <label
              htmlFor="suppliers-show-archived"
              className={`text-xs font-bold cursor-pointer select-none whitespace-nowrap ${
                showArchivedSuppliers ? 'text-ink dark:text-ink-dark' : 'text-ink-muted dark:text-ink-dark-muted'
              }`}
            >
              عرض الموردين المؤرشفين
            </label>
            <ToggleSwitch
              id="suppliers-show-archived"
              size="sm"
              checked={showArchivedSuppliers}
              onChange={setShowArchivedSuppliers}
            />
          </div>
        </div>

        <AppButton variant="primary" size="md" icon={Plus} onClick={onOpenAddSupplier}>
          إضافة مورد جديد
        </AppButton>
      </div>

      {/* Suppliers Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl overflow-hidden flex flex-col shadow-2xs">
        <div className="h-11 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
          <div className="col-span-3">اسم المورد والشركة</div>
          <div className="col-span-2">رقم الهاتف</div>
          <div className="col-span-3">العنوان / الملاحظات</div>
          <div className="col-span-2 text-center">الرصيد المستحق (المديونية)</div>
          <div className="col-span-1 text-center">الحالة</div>
          <div className="col-span-1 text-center">إجراءات</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark">
          {showLoading ? (
            <RafiqLoadingState
              label="جاري تحميل دليل الموردين والشركات..."
              sublabel="استرجاع الحسابات ومطابقة أرصدة المديونيات وحركات التوريد"
            />
          ) : filteredSuppliers.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <Building2 className="w-8 h-8 opacity-30" />
              <span className="text-sm font-medium">لا يوجد موردين مطابقين للبحث</span>
            </div>
          ) : (
            pagedSuppliers.map((sup) => (
              <div
                key={sup.id}
                className={`h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors ${
                  !sup.isActive ? 'bg-surface-2/50 dark:bg-surface-dark-2/50 opacity-60' : ''
                }`}
              >
                <div className="col-span-3">
                  <span className="font-bold text-ink dark:text-ink-dark block truncate">{sup.name}</span>
                  {sup.companyName && (
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted block truncate">{sup.companyName}</span>
                  )}
                </div>

                <div className="col-span-2 font-mono text-ink-muted dark:text-ink-dark-muted">
                  {sup.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                      <span>{formatPhoneDisplay(sup.phone)}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </div>

                <div className="col-span-3 text-ink-muted dark:text-ink-dark-muted truncate">
                  {sup.address || sup.notes || '—'}
                </div>

                <div className="col-span-2 text-center font-mono font-bold">
                  {sup.balancePiasters > 0 ? (
                    <div>
                      <span className="text-danger dark:text-danger-bright block">
                        {formatMoney(sup.balancePiasters)}
                      </span>
                      <span className="text-micro text-danger/80 dark:text-danger-bright/80 font-bold">له فلوس علينا</span>
                    </div>
                  ) : sup.balancePiasters < 0 ? (
                    <div>
                      <span className="text-paid dark:text-paid-bright block">
                        {formatMoney(Math.abs(sup.balancePiasters))}
                      </span>
                      <span className="text-micro text-paid/90 dark:text-paid-bright/90 font-bold">لينا فلوس عنده (سايبينها)</span>
                    </div>
                  ) : (
                    <span className="text-ink-muted dark:text-ink-dark-muted font-medium">خالص تماماً</span>
                  )}
                </div>

                <div className="col-span-1 text-center">
                  {sup.isActive ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/30">
                      نشط
                    </span>
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark">
                      مؤرشف
                    </span>
                  )}
                </div>

                <div className="col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => handleToggleMenu(sup, e)}
                    aria-expanded={activeMenu?.supplier.id === sup.id}
                    aria-haspopup="menu"
                    className={TABLE_ACTION_TRIGGER}
                    title="قائمة إجراءات وخيارات المورد"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    <span>إجراءات</span>
                    <ChevronDown className="w-3 h-3" />
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
              width: '13.75rem',
              zIndex: 9999,
            }}
            onWheel={(e) => e.stopPropagation()}
            className={`${MENU_PANEL} font-sans`}
            dir="rtl"
          >
            {/* Menu Items */}
            <div className="flex flex-col gap-0.5">
              {/* 1. Payment */}
              <button
                type="button"
                onClick={() => {
                  const s = activeMenu.supplier;
                  setActiveMenu(null);
                  onOpenPayment(s);
                }}
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <Banknote className="w-3.5 h-3.5" />
                </span>
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
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <Receipt className="w-3.5 h-3.5" />
                </span>
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
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <Edit2 className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 truncate">تعديل بيانات المورد</span>
              </button>

              {/* Divider */}
              <div className={MENU_DIVIDER} />

              {/* 4. Archive / Restore */}
              {activeMenu.supplier.isActive ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = activeMenu.supplier;
                    setActiveMenu(null);
                    onRequestArchiveSupplier(s);
                  }}
                  className={MENU_ITEM_DANGER}
                >
                  <span className={MENU_ITEM_ICON_DANGER}>
                    <Archive className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 truncate">أرشفة المورد</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const s = activeMenu.supplier;
                    setActiveMenu(null);
                    onRestoreSupplier(s.id);
                  }}
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 truncate">استعادة المورد النشط</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
