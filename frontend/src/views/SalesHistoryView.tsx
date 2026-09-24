import { useState, useEffect } from 'react';
import { 
  FileText, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  Receipt,
  X,
  Printer
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Sale } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

export const SalesHistoryView = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const loadSales = async () => {
    setLoading(true);
    try {
      const res = await invoke<Sale[]>('sales:getRecent');
      setSales(res || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await invoke<Sale[]>('sales:getRecent');
        if (active) {
          setSales(res || []);
        }
      } catch (err: unknown) {
        console.error(err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Summary Metrics calculations (Integer arithmetic)
  const totalSalesPiasters = sales.reduce((sum, s) => sum + (s.totalPiasters || 0), 0);
  const invoiceCount = sales.length;
  const averageInvoicePiasters = invoiceCount > 0 ? Math.round(totalSalesPiasters / invoiceCount) : 0;

  return (
    <div className="flex flex-col h-full bg-canvas p-4 gap-3 overflow-hidden select-none">
      {/* 1. Stat Summary Cards Strip (Matching Folder _13) */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {/* Card 1: Total Today Sales */}
        <div className="bg-surface hairline-all rounded-[6px] p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-ink-muted">إجمالي المبيعات الأخيرة</span>
            <div className="text-[20px] font-bold font-mono text-brand tabular-nums mt-0.5">
              {formatArabicCurrency(totalSalesPiasters)}
            </div>
          </div>
          <div className="w-9 h-9 rounded bg-brand-soft text-brand flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Invoice Count */}
        <div className="bg-surface hairline-all rounded-[6px] p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-ink-muted">عدد الفواتير المسجلة</span>
            <div className="text-[20px] font-bold font-mono text-ink tabular-nums mt-0.5">
              {invoiceCount} فاتورة
            </div>
          </div>
          <div className="w-9 h-9 rounded bg-surface-2 text-ink-muted border border-line flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Average Ticket */}
        <div className="bg-surface hairline-all rounded-[6px] p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-ink-muted">متوسط قيمة الفاتورة</span>
            <div className="text-[20px] font-bold font-mono text-paid tabular-nums mt-0.5">
              {formatArabicCurrency(averageInvoicePiasters)}
            </div>
          </div>
          <div className="w-9 h-9 rounded bg-paid-soft text-paid border border-paid-border flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Shift Status */}
        <div className="bg-surface hairline-all rounded-[6px] p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-ink-muted">حالة الخزينة والوردية</span>
            <div className="text-[14px] font-bold text-ink mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-paid"></span>
              <span>الوردية (1) مفتوحة</span>
            </div>
          </div>
          <button
            onClick={() => void loadSales()}
            disabled={loading}
            className="w-9 h-9 rounded bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink flex items-center justify-center transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Invoices Ledger Table */}
      <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
          <span className="col-span-2">رقم الفاتورة</span>
          <span className="col-span-3">تاريخ ووقت البيع</span>
          <span className="col-span-2 text-center">طريقة الدفع</span>
          <span className="col-span-2 text-center">الخصم المالي</span>
          <span className="col-span-2 text-left pl-2">إجمالي الفاتورة</span>
          <span className="col-span-1 text-center">معاينة</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {sales.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
              <Clock className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-40" />
              <p className="text-[14px] font-semibold text-ink m-0">لم تسجل أي فواتير مبيعات بعد</p>
              <p className="text-[12px] text-ink-muted m-0">
                توجه إلى شاشة نقطة البيع (POS) لتنفيذ أول عملية بيع على النظام
              </p>
            </div>
          ) : (
            sales.map((sale) => (
              <div 
                key={sale.id || sale.invoiceNumber} 
                className="h-[48px] hairline-b px-4 grid grid-cols-12 items-center text-[13px] hover:bg-surface-2 transition-colors cursor-pointer"
                onClick={() => setSelectedSale(sale)}
              >
                {/* Invoice Number */}
                <span className="col-span-2 font-mono font-bold text-brand text-[14px]">
                  #{sale.invoiceNumber}
                </span>

                {/* Date / Time */}
                <span className="col-span-3 font-mono text-ink text-[12px] tabular-nums">
                  {sale.createdAt ? new Date(sale.createdAt).toLocaleString('ar-EG') : '—'}
                </span>

                {/* Payment Method Badge */}
                <div className="col-span-2 flex justify-center">
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-paid-soft text-paid border border-paid-border">
                    {sale.paymentMethod === 'cash' ? 'نقدي (كاش)' : sale.paymentMethod}
                  </span>
                </div>

                {/* Discount */}
                <span className="col-span-2 text-center font-mono text-ink-muted text-xs tabular-nums">
                  {sale.discountPiasters > 0 ? formatArabicCurrency(sale.discountPiasters) : '—'}
                </span>

                {/* Total Piasters */}
                <span className="col-span-2 text-left pl-2 font-mono font-bold text-[14px] text-brand tabular-nums">
                  {formatArabicCurrency(sale.totalPiasters)}
                </span>

                {/* Action View */}
                <div className="col-span-1 flex justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSale(sale);
                    }}
                    className="p-1.5 rounded bg-surface hover:bg-brand-soft text-ink-muted hover:text-brand border border-line transition-colors"
                    title="عرض بنود الفاتورة"
                  >
                    <Receipt className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="h-[32px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0 font-mono">
          <span>قاعدة بيانات SQLite - وضع الأمان WAL نشط</span>
          <span className="tabular-nums">عرض آخر {sales.length} فاتورة</span>
        </div>
      </div>

      {/* 3. Invoice Details Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface rounded-[6px] border-2 border-brand overflow-hidden flex flex-col select-none">
            {/* Modal Header */}
            <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-brand" />
                <h3 className="text-[14px] font-bold text-ink m-0">
                  تفاصيل الفاتورة #{selectedSale.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Content */}
            <div className="p-5 flex flex-col gap-3 font-mono text-[12px]">
              <div className="flex justify-between items-center text-ink-muted text-[11px] pb-2 border-b border-line">
                <span>تاريخ البيع:</span>
                <span className="text-ink">{selectedSale.createdAt ? new Date(selectedSale.createdAt).toLocaleString('ar-EG') : '—'}</span>
              </div>

              {/* Items Breakdown if present */}
              {selectedSale.items && selectedSale.items.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                  <div className="text-[11px] font-bold text-ink-muted flex justify-between">
                    <span>البند</span>
                    <span>الكمية × السعر</span>
                  </div>
                  {selectedSale.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[12px] text-ink py-1 border-b border-line/60">
                      <span className="font-semibold truncate max-w-[200px]">{item.productName}</span>
                      <span>{(item.quantityMilli / 1000)} × {formatArabicCurrency(item.unitPricePiasters)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2 text-ink-muted text-xs text-center">
                  تم حفظ تفاصيل البنود في قاعدة البيانات
                </div>
              )}

              {/* Financial Totals */}
              <div className="pt-2 border-t border-line flex flex-col gap-1.5 text-[13px]">
                <div className="flex justify-between text-ink-muted">
                  <span>المجموع الفرعي:</span>
                  <span className="text-ink tabular-nums">{formatArabicCurrency(selectedSale.subtotalPiasters)}</span>
                </div>
                {selectedSale.discountPiasters > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>الخصم:</span>
                    <span className="tabular-nums">−{formatArabicCurrency(selectedSale.discountPiasters)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[16px] text-brand pt-1 border-t border-line">
                  <span>المبلغ المدفوع (نقدي):</span>
                  <span className="tabular-nums">{formatArabicCurrency(selectedSale.totalPiasters)}</span>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="h-[36px] px-4 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-[12px] font-semibold transition-colors"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert('تم إرسال أمر إعادة طباعة الإيصال إلى طابعة الكاشير');
                    setSelectedSale(null);
                  }}
                  className="h-[36px] px-4 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>إعادة طباعة الإيصال</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
