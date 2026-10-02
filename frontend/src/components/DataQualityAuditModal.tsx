import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, 
  Search, 
  Printer, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  Tag, 
  Barcode, 
  Coins, 
  TrendingDown, 
  Boxes, 
  Layers, 
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DataQualityReport, DataQualityIssueItem, DataQualityIssueType, BulkGenerateBarcodesResult, AssignBarcodeResult } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { rafiqAlert } from '../utils/dialogService';

interface DataQualityAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFixProduct?: (productId: string) => void;
  onProductUpdated?: () => void;
}

export const DataQualityAuditModal: React.FC<DataQualityAuditModalProps> = ({
  isOpen,
  onClose,
  onFixProduct,
  onProductUpdated
}) => {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | DataQualityIssueType>('all');
  const [isBulkGenerating, setIsBulkGenerating] = useState<boolean>(false);
  const [assigningProductId, setAssigningProductId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<DataQualityReport>('reports:getDataQuality');
      if (res) {
        setReport(res);
      }
    } catch (err: unknown) {
      console.error('Failed to load data quality report', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBulkGenerateBarcodes = async () => {
    try {
      setIsBulkGenerating(true);
      const res = await invoke<BulkGenerateBarcodesResult>('products:bulkGenerateInternalBarcodes');
      if (res && res.success) {
        await loadData();
        onProductUpdated?.();
        await rafiqAlert({
          title: 'تم التوليد بنجاح',
          message: `تم بنجاح توليد وتعيين باركود داخلي قياسي (EAN-13) لـ ${res.count} صنف ناقص! تم تحديث تقرير الجودة.`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'تنبيه',
          message: res?.message || 'فشلت عملية توليد الباركودات.',
          variant: 'warning'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'خطأ',
        message: `حدث خطأ أثناء التوليد: ${msg}`,
        variant: 'error'
      });
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleQuickAssignBarcode = async (productId: string) => {
    try {
      setAssigningProductId(productId);
      const res = await invoke<AssignBarcodeResult>('products:assignInternalBarcode', { productId });
      if (res && res.success) {
        await loadData();
        onProductUpdated?.();
        await rafiqAlert({
          title: 'تم تعيين الباركود',
          message: `تم بنجاح تعيين الباركود الداخلي ${res.barcode} للصنف!`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'تنبيه',
          message: res?.message || 'فشل تعيين الباركود للصنف.',
          variant: 'warning'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'خطأ',
        message: `حدث خطأ أثناء تعيين الباركود: ${msg}`,
        variant: 'error'
      });
    } finally {
      setAssigningProductId(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  const filteredIssues = useMemo(() => {
    if (!report || !report.issues) return [];
    let list = report.issues;

    if (activeFilter !== 'all') {
      list = list.filter(item => item.issueType === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => 
        (item.productName && item.productName.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q)) ||
        (item.issueTitle && item.issueTitle.toLowerCase().includes(q))
      );
    }

    return list;
  }, [report, activeFilter, searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const score = report?.healthScorePercent ?? 100;
  const isExcellent = score >= 90;
  const isFair = score >= 70 && score < 90;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 print:p-0 print:bg-white print:static">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:max-h-none print:w-full">
        
        {/* Header (hidden in print) */}
        <div className="px-6 py-4 bg-brand-dark text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-6 h-6 text-paid-soft" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">تقرير فحص صحة وجودة بيانات الكتالوج</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-white/15 text-white">
                  فحص تلقائي شامل
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                حصر الأصناف ناقصة التكلفة، بلا باركود، بلا تصنيف، مكررات الباركود، والأرصدة السالبة مع إمكانية التصحيح المباشر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="إعادة فحص البيانات وتحديث التقرير"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث الفحص</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-brand hover:bg-white/90 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة التقرير</span>
            </button>

            <button 
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-canvas print:p-0 print:bg-white">
          
          {/* Health Score Summary Banner */}
          <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xs ${
            isExcellent 
              ? 'bg-paid-soft/50 border-paid/20 text-ink' 
              : isFair 
              ? 'bg-amber-50 border-amber-200 text-ink' 
              : 'bg-rose-50 border-rose-200 text-ink'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black font-mono text-xl shadow-xs border ${
                isExcellent 
                  ? 'bg-paid text-white border-paid' 
                  : isFair 
                  ? 'bg-amber-600 text-white border-amber-600' 
                  : 'bg-[#b23a2e] text-white border-[#b23a2e]'
              }`}>
                {score}%
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-ink">
                    مؤشر اكتمال وصحة البيانات بالمحل
                  </h3>
                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                    isExcellent 
                      ? 'bg-paid text-white' 
                      : isFair 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-[#b23a2e] text-white'
                  }`}>
                    {isExcellent ? 'بيانات ممتازة ومكتملة' : isFair ? 'بيانات مقبولة وبحاجة لمراجعة' : 'تتطلب تصحيحاً عاجلاً'}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  تم فحص <strong>{report?.totalProductsAudited ?? 0}</strong> صنف نشط • وجد <strong>{report?.healthyProductsCount ?? 0}</strong> صنف سليم 100% • يوجد <strong>{report?.totalIssuesCount ?? 0}</strong> ملاحظة تتطلب التدقيق
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs shrink-0 font-medium">
              <div className="bg-surface px-3 py-2 rounded-xl border border-line shadow-2xs text-center min-w-[90px]">
                <span className="block text-[10px] text-ink-muted">إجمالي الأصناف</span>
                <span className="font-mono font-bold text-sm text-ink">{report?.totalProductsAudited ?? 0}</span>
              </div>
              <div className="bg-surface px-3 py-2 rounded-xl border border-line shadow-2xs text-center min-w-[90px]">
                <span className="block text-[10px] text-paid font-bold">أصناف سليمة</span>
                <span className="font-mono font-bold text-sm text-paid">{report?.healthyProductsCount ?? 0}</span>
              </div>
              <div className="bg-surface px-3 py-2 rounded-xl border border-line shadow-2xs text-center min-w-[90px]">
                <span className="block text-[10px] text-[#b23a2e] font-bold">ملاحظات ومشاكل</span>
                <span className="font-mono font-bold text-sm text-[#b23a2e]">{report?.totalIssuesCount ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Quick Category Filter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-brand text-white border-brand shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-brand-dark'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>كل المشاكل</span>
                <Boxes className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className="text-base font-black font-mono leading-none block">
                {report?.totalIssuesCount ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('missing_cost')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'missing_cost'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-amber-500'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>بدون تكلفة</span>
                <Coins className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className={`text-base font-black font-mono leading-none block ${activeFilter === 'missing_cost' ? 'text-white' : 'text-amber-700'}`}>
                {report?.missingCostCount ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('missing_barcode')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'missing_barcode'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-amber-500'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>بدون باركود</span>
                <Barcode className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className={`text-base font-black font-mono leading-none block ${activeFilter === 'missing_barcode' ? 'text-white' : 'text-amber-700'}`}>
                {report?.missingBarcodeCount ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('negative_stock')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'negative_stock'
                  ? 'bg-[#b23a2e] text-white border-[#b23a2e] shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>رصيد سالب</span>
                <TrendingDown className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className={`text-base font-black font-mono leading-none block ${activeFilter === 'negative_stock' ? 'text-white' : 'text-[#b23a2e]'}`}>
                {report?.negativeStockCount ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('duplicate_barcode')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'duplicate_barcode'
                  ? 'bg-[#b23a2e] text-white border-[#b23a2e] shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>باركود مكرر</span>
                <AlertTriangle className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className={`text-base font-black font-mono leading-none block ${activeFilter === 'duplicate_barcode' ? 'text-white' : 'text-[#b23a2e]'}`}>
                {report?.duplicateBarcodeCount ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('missing_category')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'missing_category'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>بدون تصنيف</span>
                <Layers className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className={`text-base font-black font-mono leading-none block ${activeFilter === 'missing_category' ? 'text-white' : 'text-blue-700'}`}>
                {report?.missingCategoryCount ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('price_below_cost')}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                activeFilter === 'price_below_cost'
                  ? 'bg-[#b23a2e] text-white border-[#b23a2e] shadow-xs'
                  : 'bg-surface border-line text-ink hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>أقل من التكلفة</span>
                <Tag className="w-3.5 h-3.5 opacity-80" />
              </div>
              <span className={`text-base font-black font-mono leading-none block ${activeFilter === 'price_below_cost' ? 'text-white' : 'text-[#b23a2e]'}`}>
                {report?.priceBelowCostCount ?? 0}
              </span>
            </button>
          </div>

          {/* Search Bar & Result Count */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-line print:hidden">
            <div className="relative w-full sm:w-96">
              <input
                type="text"
                placeholder="ابحث بالاسم أو الباركود أو التصنيف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-4 pr-9 text-xs bg-surface-2 border border-line rounded-lg focus:outline-hidden focus:border-brand text-ink"
              />
              <Search className="w-4 h-4 text-ink-muted absolute right-3 top-2.5" />
            </div>

            <div className="text-xs text-ink-muted font-bold self-end sm:self-center">
              عرض <strong className="text-ink font-mono">{filteredIssues.length}</strong> ملاحظة من إجمالي <strong className="text-ink font-mono">{report?.totalIssuesCount ?? 0}</strong>
            </div>
          </div>

          {/* Quick Bulk Barcode Generation Banner (Feature #119 / Story 108) */}
          {(activeFilter === 'missing_barcode' || activeFilter === 'all') && (report?.missingBarcodeCount ?? 0) > 0 && (
            <div className="bg-brand-soft border border-brand/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center shrink-0">
                  <Barcode className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink leading-tight">
                    يوجد <strong className="font-mono text-brand font-black">{report?.missingBarcodeCount}</strong> صنف بدون باركود في الكتالوج
                  </h4>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    يمكنك توليد باركودات داخلية قياسية موحدة (EAN-13 مع بادئة GS1: 200 ورقم تحقق Modulo 10) لجميع الأصناف الناقصة دفعة واحدة.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleBulkGenerateBarcodes()}
                disabled={isBulkGenerating || loading}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Barcode className="w-4 h-4" />
                <span>{isBulkGenerating ? 'جاري التوليد للجميع...' : `توليد باركود لجميع النواقص (${report?.missingBarcodeCount})`}</span>
              </button>
            </div>
          )}

          {/* Issues Table */}
          <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-surface-2 text-ink border-b border-line font-bold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">الصنف والباركود</th>
                    <th className="py-3 px-4">نوع المشكلة</th>
                    <th className="py-3 px-4">الحالة الحالية</th>
                    <th className="py-3 px-4">الإجراء المقترح</th>
                    <th className="py-3 px-4 text-center print:hidden">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-ink-muted">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand mb-2" />
                        <span>جاري فحص وتدقيق بيانات الكتالوج والمخزون...</span>
                      </td>
                    </tr>
                  ) : filteredIssues.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-paid-soft text-paid flex items-center justify-center mx-auto mb-2">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <p className="font-bold text-sm text-ink">
                          {report && report.totalIssuesCount === 0 
                            ? 'ممتاز! كافة أصناف وبيانات الكتالوج مكتملة وسليمة 100%' 
                            : 'لا توجد ملاحظات تطابق معايير الفلترة المحددة'}
                        </p>
                        <p className="text-xs text-ink-muted mt-1">
                          {report && report.totalIssuesCount === 0
                            ? 'لا توجد أصناف ناقصة التكلفة أو بدون باركود أو أرصدة سالبة.'
                            : 'جرب تغيير كلمة البحث أو اختيار تصنيف آخر.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredIssues.map((issue: DataQualityIssueItem, idx: number) => {
                      const isCritical = issue.severity === 'critical';
                      const isWarning = issue.severity === 'warning';

                      return (
                        <tr key={`${issue.productId}-${issue.issueType}-${idx}`} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-3 px-4 text-center font-mono text-ink-muted font-bold">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-ink">{issue.productName}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-ink-muted font-mono">
                              <span>باركود: {issue.barcode || 'بلا باركود'}</span>
                              <span>•</span>
                              <span>قسم: {issue.categoryName || 'غير محدد'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              isCritical
                                ? 'bg-rose-50 text-[#b23a2e] border-rose-200'
                                : isWarning
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {isCritical && <AlertTriangle className="w-3 h-3 shrink-0" />}
                              <span>{issue.issueTitle}</span>
                            </span>
                            <div className="text-[10.5px] text-ink-muted mt-1 leading-tight max-w-xs">
                              {issue.issueDescription}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[11px] font-mono tabular-nums">
                            <div>الرصيد: <strong className={issue.stockMilli < 0 ? 'text-[#b23a2e]' : 'text-ink'}>{(issue.stockMilli / 1000).toFixed( issue.unit === 'kg' ? 3 : 0 )} {issue.unit === 'kg' ? 'كجم' : 'ق'}</strong></div>
                            <div>التكلفة: <strong className={issue.costPiasters <= 0 ? 'text-amber-700 font-bold' : 'text-ink'}>{formatArabicCurrency(issue.costPiasters)}</strong></div>
                            <div>البيع: <strong className="text-ink">{formatArabicCurrency(issue.pricePiasters)}</strong></div>
                          </td>
                          <td className="py-3 px-4 text-xs text-ink-muted leading-relaxed max-w-sm">
                            <span className="font-semibold text-ink block mb-0.5">التصحيح المقترح:</span>
                            {issue.suggestedFix}
                          </td>
                          <td className="py-3 px-4 text-center print:hidden">
                            <div className="flex items-center justify-center gap-1.5">
                              {issue.issueType === 'missing_barcode' && (
                                <button
                                  type="button"
                                  onClick={() => void handleQuickAssignBarcode(issue.productId)}
                                  disabled={assigningProductId === issue.productId}
                                  className="px-2.5 py-1.5 bg-paid text-white hover:bg-paid/90 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                                  title="توليد وتعيين باركود داخلي قياسي فوراً لهذا الصنف"
                                >
                                  <Barcode className="w-3.5 h-3.5" />
                                  <span>{assigningProductId === issue.productId ? '...' : 'توليد كود'}</span>
                                </button>
                              )}
                              {onFixProduct && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onFixProduct(issue.productId);
                                  }}
                                  className="px-3 py-1.5 bg-brand text-white hover:bg-brand-dark rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                                  title="فتح شاشة تعديل الصنف مباشرة"
                                >
                                  <span>تصحيح</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-surface border-t border-line flex items-center justify-between shrink-0 print:hidden text-xs text-ink-muted font-bold">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-paid animate-pulse" />
            <span>الفحص يضمن سلامة الحسابات والأرباح ودقة قراءة الماسح الضوئي بنسبة 100%</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-2 hover:bg-surface border border-line text-ink rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
