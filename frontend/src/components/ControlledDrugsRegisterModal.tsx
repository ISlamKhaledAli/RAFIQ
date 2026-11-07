import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  Printer,
  X,
  FileSpreadsheet,
  Pill,
  Search,
  Eye,
  EyeOff,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { printReport } from '../utils/printReport';
import type { ControlledInspectionReportRow } from '../types/pharma';
import type { Product } from '../types/models';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { useAuth } from '../context/useAuth';
import { DateFilterControl } from './DateFilterControl';
import { type DateFilterValue, DEFAULT_DATE_FILTER, isDateFilterActive, describeDateFilter, useToday } from '../utils/dateFilter';
import { buildInspectionRegisterPayload, lastMonthFilter } from './pharmaDateRange';

interface ControlledDrugsRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProductId?: string;
}

export const ControlledDrugsRegisterModal: React.FC<ControlledDrugsRegisterModalProps> = ({
  isOpen,
  onClose,
  initialProductId,
}) => {
  const { hasPermission } = useAuth();
  const canViewFullNationalId = hasPermission ? hasPermission('pharma.controlled.view_full') : false;

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(() => lastMonthFilter());
  const today = useToday();
  const dateActive = isDateFilterActive(dateFilter);
  const [rows, setRows] = useState<ControlledInspectionReportRow[]>([]);
  const requestSeq = useRef(0);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [showFullNationalIds, setShowFullNationalIds] = useState(false);

  // Load controlled products list for filter dropdown
  const loadControlledProducts = useCallback(async () => {
    try {
      const allProds = await invoke<Product[]>('products:getAll', { limit: 1000 });
      if (allProds) {
        const controlled = allProds.filter(
          (p) => p.isControlled || (p.controlledSchedule && p.controlledSchedule !== 'none') || p.rxStatus === 'controlled'
        );
        setProducts(controlled.length > 0 ? controlled : allProds);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  // Fetch register rows from backend
  const loadRegisterData = useCallback(async () => {
    if (!selectedProductId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const data = await invoke<ControlledInspectionReportRow[]>(
        'pharma:getControlledInspectionRegister',
        buildInspectionRegisterPayload(selectedProductId, dateFilter)
      );
      if (seq === requestSeq.current) setRows(data || []);
    } catch (err: unknown) {
      console.error('Failed to load inspection register:', err);
      if (seq === requestSeq.current) setRows([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [selectedProductId, dateFilter]);

  useEffect(() => {
    if (isOpen) {
      void loadControlledProducts();
      // a reopened register starts from a fresh "last month" range, not the one frozen at first mount
      setDateFilter(lastMonthFilter());
      if (initialProductId) {
        setSelectedProductId(initialProductId);
      }
    }
  }, [isOpen, initialProductId, loadControlledProducts]);

  useEffect(() => {
    // today in the deps: a relative preset is re-evaluated when the day rolls over
    if (isOpen && selectedProductId) {
      void loadRegisterData();
    }
  }, [isOpen, selectedProductId, loadRegisterData, today]);

  // Product Options for CustomSelect
  const productOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'اختر دواء الجدول للمعاينة والتفتيش...' },
      ...products.map((p) => ({
        value: p.id,
        label: `${p.name} ${p.scientificName ? `(${p.scientificName})` : ''}`,
      })),
    ];
  }, [products]);

  // Current selected product object
  const currentProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Client-side text filter on rows
  const filteredRows = useMemo(() => {
    if (!searchFilter.trim()) return rows;
    const q = searchFilter.toLowerCase().trim();
    return rows.filter(
      (r) =>
        (r.supplierOrPatientName && r.supplierOrPatientName.toLowerCase().includes(q)) ||
        (r.doctorName && r.doctorName.toLowerCase().includes(q)) ||
        (r.prescriptionNo && r.prescriptionNo.toLowerCase().includes(q)) ||
        (r.batchNumber && r.batchNumber.toLowerCase().includes(q)) ||
        (r.documentRefNo && r.documentRefNo.toLowerCase().includes(q))
    );
  }, [rows, searchFilter]);

  // KPI Calculations
  const stats = useMemo(() => {
    let openingMilli = 0;
    let totalInflowMilli = 0;
    let totalOutflowMilli = 0;
    let runningBalanceMilli = 0;

    for (const r of rows) {
      if (r.transactionType === 'opening_balance') {
        openingMilli = r.runningBalanceMilli;
      } else {
        totalInflowMilli += r.inflowQtyMilli || 0;
        totalOutflowMilli += r.outflowQtyMilli || 0;
      }
      runningBalanceMilli = r.runningBalanceMilli;
    }

    return {
      openingUnits: openingMilli / 1000,
      inflowUnits: totalInflowMilli / 1000,
      outflowUnits: totalOutflowMilli / 1000,
      balanceUnits: runningBalanceMilli / 1000,
    };
  }, [rows]);

  const movementCount = useMemo(
    () => rows.filter((r) => r.transactionType !== 'opening_balance').length,
    [rows]
  );

  const resetFilters = () => {
    setDateFilter(DEFAULT_DATE_FILTER);
    setSearchFilter('');
  };

  const handlePrint = () => {
    void printReport({ kind: 'a4only', orientation: 'landscape' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/40 dark:bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div data-print-root className="w-full max-w-6xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[95vh] print:w-full print:max-h-none print:rounded-none print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Header - Screen & Print */}
        <div className="h-14 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 flex items-center justify-between shrink-0 print:border-b-2 print:border-black print:h-auto print:py-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-warn/15 text-warn dark:text-warn-bright print:hidden">
              <ShieldAlert className="w-5 h-5 text-warn dark:text-warn-bright" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0 print:text-lg">
                  دفتر قيد أدوية الجدول والرقابة والمؤثرات العقلية (سجل التفتيش الصيدلي)
                </h3>
                <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn dark:text-warn-bright border border-warn/30 print:hidden">
                  سجل رسمي معتمد
                </span>
              </div>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0 print:text-xs">
                طبقا للقرار الوزاري وقوانين مزاولة مهنة الصيدلة والتفتيش على أدوية الجدول والرقابة
              </p>
              <p className="text-micro font-bold text-ink dark:text-ink-dark m-0 print:text-xs">
                الفترة: {dateActive ? describeDateFilter(dateFilter) : 'كل الفترات'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={handlePrint}
              disabled={rows.length === 0}
              className="h-8 px-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted dark:disabled:border-line-dark transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
              <span>طباعة الدفتر A4</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar (Hidden during print) */}
        <div className="p-3.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden text-xs">
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[280px]">
            {/* Product Selector */}
            <div className="w-72">
              <CustomSelect
                options={productOptions}
                value={selectedProductId}
                onChange={(val) => setSelectedProductId(val)}
                size="sm"
              />
            </div>

            {/* Date Filter */}
            <DateFilterControl value={dateFilter} onChange={setDateFilter} variant="select" size="sm" />

            {/* Quick Search inside register */}
            <div className="relative min-w-[160px]">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="بحث بالمريض/الطبيب/الروشتة..."
                className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-7.5 px-2.5 pr-7 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
              />
              <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted absolute right-2 top-2 pointer-events-none" />
            </div>
          </div>

          {/* Privacy Toggle: Full National IDs (if permitted) */}
          {canViewFullNationalId && (
            <button
              type="button"
              onClick={() => setShowFullNationalIds((v) => !v)}
              className="h-7.5 px-2.5 rounded-lg border border-line dark:border-line-dark hover:border-brand text-xs font-bold flex items-center gap-1.5 text-ink dark:text-ink-dark transition-colors cursor-pointer"
            >
              {showFullNationalIds ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
                  <span>تقنيع الأرقام القومية</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>إظهار الأرقام القومية كاملة</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Selected Drug Banner & KPI Cards */}
        {currentProduct && (
          <div className="px-5 py-3 bg-brand-soft/20 dark:bg-brand-soft/10 border-b border-line dark:border-line-dark flex items-center justify-between flex-wrap gap-3 shrink-0 print:bg-white print:border-b print:py-1">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-brand dark:text-brand-bright" />
              <div>
                <span className="font-bold text-sm text-brand dark:text-brand-bright">{currentProduct.name}</span>
                {currentProduct.scientificName && (
                  <span className="text-xs font-mono text-ink-muted dark:text-ink-dark-muted mr-2">[{currentProduct.scientificName}]</span>
                )}
                {currentProduct.controlledSchedule && currentProduct.controlledSchedule !== 'none' && (
                  <span className="mr-2 text-micro font-bold px-2 py-0.5 rounded-full bg-warn/20 text-warn dark:text-warn-bright border border-warn/30">
                    تصنيف: {currentProduct.controlledSchedule}
                  </span>
                )}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-center">
                <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">رصيد أول المدة</span>
                <span className="text-xs font-mono font-bold text-ink dark:text-ink-dark">{stats.openingUnits}</span>
              </div>
              <div className="px-3 py-1 bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 rounded-lg text-center">
                <span className="text-micro text-paid block">إجمالي الوارد (+)</span>
                <span className="text-xs font-mono font-bold text-paid">{stats.inflowUnits}</span>
              </div>
              <div className="px-3 py-1 bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 rounded-lg text-center">
                <span className="text-micro text-danger dark:text-danger-bright block">إجمالي المنصرف (-)</span>
                <span className="text-xs font-mono font-bold text-danger dark:text-danger-bright">{stats.outflowUnits}</span>
              </div>
              <div className="px-3 py-1 bg-brand-soft dark:bg-brand-dark-soft border border-brand/30 rounded-lg text-center">
                <span className="text-micro text-brand dark:text-brand-bright block font-bold">الرصيد الفعلي الحالي</span>
                <span className="text-xs font-mono font-bold text-brand dark:text-brand-bright">{stats.balanceUnits}</span>
              </div>
            </div>
          </div>
        )}

        {/* Register Table Container */}
        <div className="flex-1 overflow-auto p-4 print:p-0">
          {!selectedProductId ? (
            <div className="h-64 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <ShieldAlert className="w-10 h-10 text-ink-muted/50 dark:text-ink-dark-muted" />
              <span className="text-xs font-bold">يرجى اختيار دواء جدول من القائمة أعلاه لعرض حركات دفتر التفتيش</span>
            </div>
          ) : loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">جاري تحميل حركات ورصيد دفتر التفتيش الصيدلي...</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <FileSpreadsheet className="w-10 h-10 text-ink-muted/50 dark:text-ink-dark-muted" />
              <span className="text-xs font-bold">
                {searchFilter.trim()
                  ? 'لا توجد حركات مطابقة للبحث'
                  : dateActive
                  ? `لا توجد حركات مسجلة لهذا الصنف خلال ${describeDateFilter(dateFilter)}`
                  : 'لا توجد حركات مسجلة لهذا الصنف'}
              </span>
              {(dateActive || searchFilter.trim()) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-8 px-3 rounded-lg bg-brand-dark dark:bg-brand text-white text-xs font-bold cursor-pointer"
                >
                  إعادة ضبط البحث والفترة
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-right border-collapse text-micro print:text-[9px]">
              <thead>
                <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b-2 border-brand text-ink dark:text-ink-dark font-bold print:bg-gray-100">
                  <th className="p-2 w-8 text-center border border-line dark:border-line-dark">#</th>
                  <th className="p-2 border border-line dark:border-line-dark">التاريخ والوقت</th>
                  <th className="p-2 border border-line dark:border-line-dark">نوع الحركة</th>
                  <th className="p-2 border border-line dark:border-line-dark">رقم الإذن / المستند</th>
                  <th className="p-2 border border-line dark:border-line-dark">اسم المريض / المورد</th>
                  <th className="p-2 border border-line dark:border-line-dark">الرقم القومي</th>
                  <th className="p-2 border border-line dark:border-line-dark">الطبيب المعالج</th>
                  <th className="p-2 border border-line dark:border-line-dark">رقم الروشتة</th>
                  <th className="p-2 border border-line dark:border-line-dark">التشغيلة</th>
                  <th className="p-2 border border-line dark:border-line-dark text-center text-paid">الوارد</th>
                  <th className="p-2 border border-line dark:border-line-dark text-center text-danger dark:text-danger-bright">المنصرف</th>
                  <th className="p-2 border border-line dark:border-line-dark text-center font-bold text-brand dark:text-brand-bright">الرصيد</th>
                  <th className="p-2 border border-line dark:border-line-dark">الصارف / الاعتماد</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const isOpening = row.transactionType === 'opening_balance';
                  const nationalIdDisplay = showFullNationalIds && canViewFullNationalId
                    ? row.patientNationalIdMasked
                    : row.patientNationalIdMasked;

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors ${
                        isOpening ? 'bg-brand-soft/20 dark:bg-brand-dark-soft/20 font-bold' : ''
                      }`}
                    >
                      <td className="p-2 text-center font-mono border border-line dark:border-line-dark">{idx + 1}</td>
                      <td className="p-2 font-mono whitespace-nowrap border border-line dark:border-line-dark">{row.date}</td>
                      <td className="p-2 border border-line dark:border-line-dark">
                        <span
                          className={`px-1.5 py-0.5 rounded text-micro font-bold ${
                            row.transactionType === 'dispense'
                              ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'
                              : row.transactionType === 'return'
                              ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright'
                              : row.transactionType === 'purchase'
                              ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark'
                          }`}
                        >
                          {row.transactionTypeAr}
                        </span>
                      </td>
                      <td className="p-2 font-mono border border-line dark:border-line-dark">{row.documentRefNo || '-'}</td>
                      <td className="p-2 font-bold border border-line dark:border-line-dark">{row.supplierOrPatientName || '-'}</td>
                      <td className="p-2 font-mono text-micro border border-line dark:border-line-dark">{nationalIdDisplay || '-'}</td>
                      <td className="p-2 border border-line dark:border-line-dark">
                        {row.doctorName ? (
                          <div>
                            <div>{row.doctorName}</div>
                            {row.doctorLicenseNo && (
                              <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono">قيد: {row.doctorLicenseNo}</div>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-2 font-mono border border-line dark:border-line-dark">
                        {row.prescriptionNo ? (
                          <div>
                            <div>{row.prescriptionNo}</div>
                            {row.prescriptionDate && (
                              <div className="text-micro text-ink-muted dark:text-ink-dark-muted">{row.prescriptionDate}</div>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-2 font-mono text-micro border border-line dark:border-line-dark">{row.batchNumber || '-'}</td>
                      <td className="p-2 text-center font-mono text-paid font-bold border border-line dark:border-line-dark">
                        {row.inflowQtyMilli > 0 ? (row.inflowQtyMilli / 1000).toFixed(0) : '-'}
                      </td>
                      <td className="p-2 text-center font-mono text-danger dark:text-danger-bright font-bold border border-line dark:border-line-dark">
                        {row.outflowQtyMilli > 0 ? (row.outflowQtyMilli / 1000).toFixed(0) : '-'}
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-brand dark:text-brand-bright border border-line dark:border-line-dark">
                        {(row.runningBalanceMilli / 1000).toFixed(0)}
                      </td>
                      <td className="p-2 border border-line dark:border-line-dark">
                        <div className="text-micro">
                          {row.dispensedBy && <div>صرف: {row.dispensedBy}</div>}
                          {row.approvedBy && <div className="text-paid font-bold">اعتماد: {row.approvedBy}</div>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {selectedProductId && !loading && movementCount === 0 && !searchFilter.trim() && (
            <div className="mt-3 flex items-center justify-center gap-3 text-xs font-bold text-ink-muted dark:text-ink-dark-muted print:hidden">
              <span>
                {dateActive ? `لا توجد حركات خلال ${describeDateFilter(dateFilter)}` : 'لا توجد حركات مسجلة'}
              </span>
              {dateActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-8 px-3 rounded-lg bg-brand-dark dark:bg-brand text-white text-xs font-bold cursor-pointer"
                >
                  إعادة ضبط الفترة
                </button>
              )}
            </div>
          )}

          {/* Official Signature Area for Print */}
          <div className="hidden print:flex items-center justify-between pt-12 px-6 text-xs font-bold text-black dark:text-ink-dark border-t-2 border-black mt-8">
            <div className="text-center">
              <div>الصيدلي المدير المسؤول</div>
              <div className="mt-8">....................................</div>
            </div>
            <div className="text-center">
              <div>خاتم المؤسسة الصيدلية</div>
              <div className="mt-8 border border-black border-dashed w-28 h-14 mx-auto rounded" />
            </div>
            <div className="text-center">
              <div>مفتش الصيدلة / الإدارة الصحية</div>
              <div className="mt-8">....................................</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
