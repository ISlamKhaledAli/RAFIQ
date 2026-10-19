import React, { useState, useEffect } from 'react';
import { Printer, X, FileText } from 'lucide-react';
import type { Customer, CustomerLedgerEntry } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';

export interface CustomerReceiptVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  entry: CustomerLedgerEntry | null;
}

export const CustomerReceiptVoucherModal: React.FC<CustomerReceiptVoucherModalProps> = ({
  isOpen,
  onClose,
  customer,
  entry,
}) => {
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !customer || !entry) return null;

  const handlePrint = () => {
    window.print();
  };

  const voucherNumber = entry.id.replace('led_', '').toUpperCase();
  const amountPiasters = Math.abs(entry.amountPiasters);
  const balanceAfterPiasters = entry.balanceAfterPiasters;
  const balanceBeforePiasters = balanceAfterPiasters + amountPiasters;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4 print:p-0 print:bg-white print:static"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 print:shadow-none print:border-none print:max-h-none print:w-full">
        {/* Header (Hidden in Print) */}
        <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span className="text-sm font-bold text-ink dark:text-ink-dark">سند قبض نقدي (إيصال استلام نقدية)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPrintMode('thermal')}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] cursor-pointer ${
                  printMode === 'thermal' ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs' : 'text-ink-muted dark:text-ink-dark-muted'
                }`}
              >
                بون كاشير (80mm)
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('a4')}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] cursor-pointer ${
                  printMode === 'a4' ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs' : 'text-ink-muted dark:text-ink-dark-muted'
                }`}
              >
                ورقة A4
              </button>
            </div>

            <button onClick={onClose} className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Preview Sheet */}
        <div className="flex-1 overflow-y-auto p-4 bg-canvas dark:bg-canvas-dark flex justify-center print:p-0 print:bg-white">
          <div
            className={`bg-white text-black p-5 shadow-md border border-neutral-300 font-sans ${
              printMode === 'thermal' ? 'w-[320px] text-xs' : 'w-full text-sm'
            } print:w-full print:shadow-none print:border-none`}
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b-2 border-black mb-3">
              <h2 className="text-base font-extrabold mb-0.5">رفيق لنقاط البيع وإدارة المتاجر</h2>
              <div className="inline-block px-3 py-1 bg-neutral-100 border border-neutral-300 rounded font-bold text-xs mt-1">
                سند قبض نقدية #{voucherNumber}
              </div>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">
                التاريخ: {new Date(entry.createdAt).toLocaleString('ar-EG-u-nu-latn')}
              </p>
            </div>

            {/* Customer & Amount Details Box */}
            <div className="bg-neutral-50 p-3 rounded border border-neutral-300 mb-3 space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-neutral-200 pb-1.5">
                <span className="font-semibold text-neutral-600">وصلنا من السيد / العميل:</span>
                <span className="font-bold text-sm">{customer.name}</span>
              </div>
              {customer.phone && (
                <div className="flex justify-between items-center border-b border-neutral-200 pb-1.5">
                  <span className="font-semibold text-neutral-600">رقم الهاتف:</span>
                  <span className="font-mono">{customer.phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-b border-neutral-200 pb-1.5">
                <span className="font-semibold text-neutral-600">المبلغ المقبوض:</span>
                <span className="font-extrabold font-mono text-base text-emerald-800">
                  {formatArabicCurrency(amountPiasters)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-0.5">
                <span className="font-semibold text-neutral-600">البيان وملاحظات السند:</span>
                <span className="font-medium text-neutral-800 text-right max-w-[200px]">
                  {entry.notes || 'سداد نقدي لحساب الآجل'}
                </span>
              </div>
            </div>

            {/* Balance Accounting Breakdown */}
            <div className="border border-neutral-300 rounded p-2.5 mb-4 text-xs bg-neutral-50 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-600">الرصيد السابق قبل السداد:</span>
                <span className="font-mono font-bold">{formatArabicCurrency(balanceBeforePiasters)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>المبلغ المسدد نقداً:</span>
                <span className="font-mono font-bold">- {formatArabicCurrency(amountPiasters)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-300 pt-1 font-bold">
                <span>الرصيد المتبقي بعد السداد:</span>
                <span className="font-mono text-neutral-900">
                  {balanceAfterPiasters > 0
                    ? `${formatArabicCurrency(balanceAfterPiasters)} (عليه)`
                    : balanceAfterPiasters < 0
                    ? `${formatArabicCurrency(Math.abs(balanceAfterPiasters))} (له)`
                    : 'خالص تماماً (0.00 ج.م)'}
                </span>
              </div>
            </div>

            {/* Signatures */}
            <div className="pt-3 border-t border-neutral-300 grid grid-cols-2 gap-4 text-center text-[11px] text-neutral-600">
              <div>
                <span className="block font-bold">المستلم (الكاشير)</span>
                <span className="block mt-6 border-b border-neutral-400 w-24 mx-auto"></span>
              </div>
              <div>
                <span className="block font-bold">توقيع العميل / الدافع</span>
                <span className="block mt-6 border-b border-neutral-400 w-24 mx-auto"></span>
              </div>
            </div>

            <div className="mt-4 pt-2 border-t border-dashed border-neutral-300 text-center text-[9px] text-neutral-400">
              نظام رفيق لإدارة المتاجر ونقاط البيع - سند موثق بدفتر الأستاذ
            </div>
          </div>
        </div>

        {/* Footer Actions (Hidden in Print) */}
        <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-t border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0 print:hidden">
          <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-mono">
            رقم السند: #{voucherNumber}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 rounded-lg bg-paid text-white text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة سند القبض</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
