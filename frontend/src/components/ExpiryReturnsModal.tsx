import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  RotateCcw, 
  Trash2, 
  FileText, 
  Printer, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Building2, 
  Users, 
  Clock, 
  Search,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { CustomSelect } from './CustomSelect';
import { useDataSubscription } from '../utils/eventBus';
import type { 
  ExpiryReturnableBatch, 
  ExpiredWriteOff, 
  ExpiredWriteOffCertificate 
} from '../types/pharma';
import type { Supplier } from '../types/models';

interface ExpiryReturnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const ExpiryReturnsModal: React.FC<ExpiryReturnsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'returns' | 'writeoff' | 'history'>('returns');

  // Suppliers list for filtering
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');

  // Tab 1: Expiry Returns
  const [returnableBatches, setReturnableBatches] = useState<ExpiryReturnableBatch[]>([]);
  const [selectedBatchesMap, setSelectedBatchesMap] = useState<Record<string, { selected: boolean; returnQty: number }>>({});
  const [returnNotes, setReturnNotes] = useState('');
  const [isLoadingReturns, setIsLoadingReturns] = useState(false);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // Tab 2: Write-off execution
  const [expiredBatches, setExpiredBatches] = useState<ExpiryReturnableBatch[]>([]);
  const [selectedWriteOffMap, setSelectedWriteOffMap] = useState<Record<string, { selected: boolean; writeOffQty: number }>>({});
  const [committeeMembers, setCommitteeMembers] = useState('د. صيدلي مدير الصيدلية - الصيدلي المسؤول');
  const [writeOffReason, setWriteOffReason] = useState('بضاعة منتهية الصلاحية تماماً وغير قابلة للارتجاع');
  const [writeOffNotes, setWriteOffNotes] = useState('');
  const [isLoadingExpired, setIsLoadingExpired] = useState(false);
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState(false);
  const [currentCertificate, setCurrentCertificate] = useState<ExpiredWriteOffCertificate | null>(null);

  // Tab 3: History of write-offs
  const [writeOffHistory, setWriteOffHistory] = useState<ExpiredWriteOff[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Notifications
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // 1. Load initial suppliers and tab data
  const loadSuppliers = useCallback(async () => {
    try {
      const list = await invoke<Supplier[]>('suppliers:getAll', { includeInactive: false });
      setSuppliers(Array.isArray(list) ? list : []);
    } catch {
      // non-blocking
    }
  }, []);

  const loadReturnableBatches = useCallback(async () => {
    setIsLoadingReturns(true);
    try {
      const supId = selectedSupplierId === 'all' ? undefined : selectedSupplierId;
      const batches = await invoke<ExpiryReturnableBatch[]>('pharma:getExpiryReturnableBatches', { supplierId: supId });
      const safeBatches = Array.isArray(batches) ? batches : [];
      setReturnableBatches(safeBatches);

      // Auto-populate map with batch maximums
      const newMap: Record<string, { selected: boolean; returnQty: number }> = {};
      safeBatches.forEach(b => {
        newMap[b.batchId] = { selected: false, returnQty: b.quantityMilli / 1000 };
      });
      setSelectedBatchesMap(newMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل تشغيلات المرتجعات';
      showStatus(msg, 'error');
    } finally {
      setIsLoadingReturns(false);
    }
  }, [selectedSupplierId]);

  const loadExpiredBatches = useCallback(async () => {
    setIsLoadingExpired(true);
    try {
      const batches = await invoke<ExpiryReturnableBatch[]>('pharma:getExpiredBatches');
      const safeBatches = Array.isArray(batches) ? batches : [];
      setExpiredBatches(safeBatches);

      const newMap: Record<string, { selected: boolean; writeOffQty: number }> = {};
      safeBatches.forEach(b => {
        newMap[b.batchId] = { selected: false, writeOffQty: b.quantityMilli / 1000 };
      });
      setSelectedWriteOffMap(newMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل التشغيلات المنتهية';
      showStatus(msg, 'error');
    } finally {
      setIsLoadingExpired(false);
    }
  }, []);

  const loadWriteOffHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const history = await invoke<ExpiredWriteOff[]>('pharma:getExpiredWriteOffs', { limit: 100 });
      setWriteOffHistory(Array.isArray(history) ? history : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل سجل محاضر الإعدام';
      showStatus(msg, 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadSuppliers();
    }
  }, [isOpen, loadSuppliers]);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'returns') void loadReturnableBatches();
      if (activeTab === 'writeoff') void loadExpiredBatches();
      if (activeTab === 'history') void loadWriteOffHistory();
    }
  }, [isOpen, activeTab, loadReturnableBatches, loadExpiredBatches, loadWriteOffHistory]);

  useDataSubscription(['products', 'purchases', 'all'], () => {
    if (!isOpen) return;
    if (activeTab === 'returns') void loadReturnableBatches();
    else if (activeTab === 'writeoff') void loadExpiredBatches();
    else if (activeTab === 'history') void loadWriteOffHistory();
  });

  // Tab 1 Calculations
  const selectedReturnItems = useMemo(() => {
    return returnableBatches.filter(b => selectedBatchesMap[b.batchId]?.selected);
  }, [returnableBatches, selectedBatchesMap]);

  const returnSummary = useMemo(() => {
    let totalEstimatedRefund = 0;
    let totalQty = 0;
    selectedReturnItems.forEach(b => {
      const qty = selectedBatchesMap[b.batchId]?.returnQty || (b.quantityMilli / 1000);
      totalQty += qty;
      const creditFactor = (b.creditBps || 10000) / 10000;
      totalEstimatedRefund += Math.round(qty * b.unitCostPiasters * creditFactor);
    });
    return {
      count: selectedReturnItems.length,
      totalQty,
      totalEstimatedRefund,
    };
  }, [selectedReturnItems, selectedBatchesMap]);

  // Tab 1 Action: Create Purchase Return
  const handleCreateReturnDraft = async () => {
    if (selectedReturnItems.length === 0) {
      showStatus('يرجى تحديد تشغيلة واحدة على الأقل لعمل المرتجع', 'warning');
      return;
    }

    // Must be for a single supplier
    const distinctSuppliers = Array.from(new Set(selectedReturnItems.map(i => i.supplierId).filter(Boolean)));
    if (distinctSuppliers.length === 0) {
      showStatus('التشغيلات المحددة غير مربوطة بمورد مسجل لإنشاء مرتجع مشتريات له', 'error');
      return;
    }
    if (distinctSuppliers.length > 1) {
      showStatus('يرجى تحديد تشغيلات تخص مورداً واحداً فقط في المرتجع الواحد', 'warning');
      return;
    }

    const targetSupplierId = distinctSuppliers[0];
    setIsSubmittingReturn(true);
    try {
      const itemsPayload = selectedReturnItems.map(b => {
        const qty = selectedBatchesMap[b.batchId]?.returnQty || (b.quantityMilli / 1000);
        return {
          batchId: b.batchId,
          quantityMilli: Math.round(qty * 1000),
          agreedCreditBps: b.creditBps,
        };
      });

      const res = await invoke<{ returnNumber: string; totalPiasters: number }>('pharma:createExpiryReturn', {
        supplierId: targetSupplierId,
        notes: returnNotes.trim() || undefined,
        items: itemsPayload,
      });

      const msg = `تم إنشاء مرتجع المشتريات رقم #${res.returnNumber} بقيمة مستردة ${formatArabicCurrency(res.totalPiasters)} وخصمها من رصيد المورد.`;
      showStatus(msg, 'success');
      if (onSuccess) onSuccess(msg);
      void loadReturnableBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إنشاء مسودة المرتجع';
      showStatus(msg, 'error');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Tab 2 Calculations
  const selectedWriteOffItems = useMemo(() => {
    return expiredBatches.filter(b => selectedWriteOffMap[b.batchId]?.selected);
  }, [expiredBatches, selectedWriteOffMap]);

  const writeOffSummary = useMemo(() => {
    let totalCost = 0;
    let totalQty = 0;
    selectedWriteOffItems.forEach(b => {
      const qty = selectedWriteOffMap[b.batchId]?.writeOffQty || (b.quantityMilli / 1000);
      totalQty += qty;
      totalCost += Math.round(qty * b.unitCostPiasters);
    });
    return {
      count: selectedWriteOffItems.length,
      totalQty,
      totalCost,
    };
  }, [selectedWriteOffItems, selectedWriteOffMap]);

  // Tab 2 Action: Execute Write-off
  const handleExecuteWriteOff = async () => {
    if (selectedWriteOffItems.length === 0) {
      showStatus('يرجى تحديد تشغيلة واحدة على الأقل للإعدام', 'warning');
      return;
    }
    if (!committeeMembers.trim()) {
      showStatus('يرجى كتابة أسماء أعضاء لجنة الإعدام المسؤولين قانونياً', 'warning');
      return;
    }

    setIsSubmittingWriteOff(true);
    try {
      const itemsPayload = selectedWriteOffItems.map(b => {
        const qty = selectedWriteOffMap[b.batchId]?.writeOffQty || (b.quantityMilli / 1000);
        return {
          batchId: b.batchId,
          quantityMilli: Math.round(qty * 1000),
          reason: writeOffReason.trim() || 'إعدام بضاعة تالفة منتهية الصلاحية',
        };
      });

      const cert = await invoke<ExpiredWriteOffCertificate>('pharma:writeOffExpiredBatches', {
        items: itemsPayload,
        committeeMembers: committeeMembers.trim(),
        generalNotes: writeOffNotes.trim() || undefined,
      });

      setCurrentCertificate(cert);
      showStatus(`تم تنفيذ محضر الإعدام رقم #${cert.certificateNumber} بنجاح وخصم الكميات من المخزن.`, 'success');
      if (onSuccess) onSuccess(`تم تنفيذ محضر الإعدام رقم #${cert.certificateNumber}`);
      void loadExpiredBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تنفيذ محضر الإعدام';
      showStatus(msg, 'error');
    } finally {
      setIsSubmittingWriteOff(false);
    }
  };

  const handlePrintCertificate = () => {
    window.print();
  };

  const isDirty = selectedReturnItems.length > 0 || selectedWriteOffItems.length > 0;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'إغلاق إدارة مرتجعات الصلاحية والإعدام؟',
    confirmMessage: 'هناك أصناف محددة للمرتجع أو الإعدام لم يتم تأكيدها بعد. هل تريد الخروج وتجاهل التحديد؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء بالمتابعة',
  });

  if (!isOpen) return null;

  const supplierOptions = [
    { value: 'all', label: 'كل الموردين والشركات' },
    ...suppliers.map(s => ({
      value: s.id,
      label: `${s.name}${s.companyName ? ` (${s.companyName})` : ''}`,
    })),
  ];

  const filteredHistory = writeOffHistory.filter(h => {
    if (!historySearch.trim()) return true;
    const q = historySearch.trim().toLowerCase();
    return (
      h.productName.toLowerCase().includes(q) ||
      (h.batchNumber && h.batchNumber.toLowerCase().includes(q)) ||
      h.writeOffNumber.toLowerCase().includes(q) ||
      (h.committeeMembers && h.committeeMembers.toLowerCase().includes(q))
    );
  });

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 print:p-0 print:bg-white print:static"
      dir="rtl"
    >
      <div 
        className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 print:border-none print:shadow-none print:max-h-none print:w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header (Screen & Print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0 print:border-b-2 print:border-black print:py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center shadow-2xs border border-brand/20 print:hidden">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink dark:text-ink-dark print:text-xl print:font-black">
                  مرتجعات الصلاحية ومحاضر الإعدام الصيدلي
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand dark:bg-brand-soft/20 dark:text-brand-bright border border-brand/20 print:hidden">
                  نظام الصيدلية المعتمد
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted print:text-xs">
                إدارة تواريخ الصلاحية الحرجة للموردين وتوثيق محاضر إعدام الأدوية طبقاً لاشتراطات التفتيش الصيدلي
              </p>
            </div>
          </div>

          {/* Tabs and Action buttons (Hidden on Print) */}
          <div className="flex items-center gap-2 print:hidden">
            <div className="flex bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark">
              <button
                type="button"
                onClick={() => { setActiveTab('returns'); setCurrentCertificate(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'returns'
                    ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مرتجع الموردين</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('writeoff')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'writeoff'
                    ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إعدام البضاعة المنتهية</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('history'); setCurrentCertificate(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>سجل المحاضر</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void requestClose()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Message (Print Hidden) */}
        {statusMessage && (
          <div className={`mx-6 mt-3 p-3 rounded-xl border flex items-center gap-2.5 text-xs print:hidden ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-paid dark:text-paid-bright' 
              : statusMessage.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 text-danger dark:text-danger-bright'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-warn dark:text-warn-bright'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 print:p-0 print:overflow-visible">
          {/* TAB 1: SUPPLIER EXPIRY RETURNS */}
          {activeTab === 'returns' && (
            <div className="space-y-4 print:hidden">
              {/* Supplier Filter & Summary bar */}
              <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="w-56">
                    <label className="text-[11px] font-bold text-ink-muted block mb-1">تصفية حسب المورد:</label>
                    <CustomSelect
                      value={selectedSupplierId}
                      onChange={(val) => setSelectedSupplierId(val)}
                      options={supplierOptions}
                    />
                  </div>
                </div>

                {/* Return Summary Badges */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <div className="px-3.5 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-left">
                    <span className="text-[10px] text-ink-muted block">الأصناف المحددة</span>
                    <span className="text-xs font-bold font-mono text-ink dark:text-ink-dark">
                      {returnSummary.count} تشغيلة ({returnSummary.totalQty.toFixed(0)} علبة)
                    </span>
                  </div>
                  <div className="px-3.5 py-2 rounded-xl bg-paid-soft/50 dark:bg-paid-soft/10 border border-paid/20 text-left">
                    <span className="text-[10px] text-paid block font-bold">القيمة المستردة المقدرة</span>
                    <span className="text-sm font-bold font-mono text-paid dark:text-paid-bright">
                      {formatArabicCurrency(returnSummary.totalEstimatedRefund)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Table of Returnable Batches */}
              <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted sticky top-0 border-b border-line dark:border-line-dark text-[11px]">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={returnableBatches.length > 0 && selectedReturnItems.length === returnableBatches.length}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const newMap = { ...selectedBatchesMap };
                            returnableBatches.forEach(b => {
                              if (newMap[b.batchId]) newMap[b.batchId].selected = checked;
                            });
                            setSelectedBatchesMap(newMap);
                          }}
                          className="rounded border-line text-brand focus:ring-brand cursor-pointer"
                        />
                      </th>
                      <th className="p-3">اسم الصنف الدوائي</th>
                      <th className="p-3 w-28">رقم التشغيلة</th>
                      <th className="p-3 w-28">تاريخ الانتهاء</th>
                      <th className="p-3 w-28">المهلة للمورد</th>
                      <th className="p-3 w-28 text-center">الرصيد / المرتجع</th>
                      <th className="p-3 w-28">سعر الشراء</th>
                      <th className="p-3 w-24">التعويض (%)</th>
                      <th className="p-3 w-28 text-left">المسترد المتوقع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {returnableBatches.map((b) => {
                      const isSelected = selectedBatchesMap[b.batchId]?.selected ?? false;
                      const returnQty = selectedBatchesMap[b.batchId]?.returnQty ?? (b.quantityMilli / 1000);
                      const maxQty = b.quantityMilli / 1000;
                      const refund = Math.round(returnQty * b.unitCostPiasters * ((b.creditBps || 10000) / 10000));

                      return (
                        <tr 
                          key={b.batchId} 
                          className={`hover:bg-surface-2/40 transition-colors ${
                            isSelected ? 'bg-brand-soft/20 dark:bg-brand-soft/10' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedBatchesMap(prev => ({
                                  ...prev,
                                  [b.batchId]: {
                                    selected: e.target.checked,
                                    returnQty: prev[b.batchId]?.returnQty ?? maxQty,
                                  },
                                }));
                              }}
                              className="rounded border-line text-brand focus:ring-brand cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-ink dark:text-ink-dark block">{b.productName}</span>
                            <span className="text-[10px] text-ink-muted flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {b.supplierName || 'مورد غير مسجل'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-ink dark:text-ink-dark">{b.batchNumber}</td>
                          <td className="p-3 font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              b.daysUntilExpiry <= 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300' 
                                : b.daysUntilExpiry <= (b.windowDays || 30)
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-surface-2 text-ink-muted'
                            }`}>
                              {b.expiryDate}
                            </span>
                          </td>
                          <td className="p-3 text-[11px]">
                            {b.daysUntilExpiry <= 0 ? (
                              <span className="text-danger font-bold">منتهي منذ {Math.abs(b.daysUntilExpiry)} يوم</span>
                            ) : (
                              <span className="text-warn font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                باقي {b.daysUntilExpiry} يوم (نافذة {b.windowDays} يوم)
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={returnQty}
                                disabled={!isSelected}
                                onChange={(e) => {
                                  const raw = parseFloat(normalizeArabicNumerals(e.target.value)) || 0;
                                  const val = Math.min(maxQty, Math.max(1, raw));
                                  setSelectedBatchesMap(prev => ({
                                    ...prev,
                                    [b.batchId]: { selected: true, returnQty: val },
                                  }));
                                }}
                                className="w-16 h-8 text-center bg-surface dark:bg-surface-dark border border-line rounded-lg font-mono font-bold text-xs disabled:opacity-50"
                              />
                              <span className="text-[10px] text-ink-muted">/ {maxQty}</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-ink-muted">
                            {formatArabicCurrency(b.unitCostPiasters)}
                          </td>
                          <td className="p-3 font-mono font-bold text-ink dark:text-ink-dark">
                            {(b.creditBps / 100).toFixed(0)}%
                          </td>
                          <td className="p-3 font-mono font-bold text-paid text-left">
                            {formatArabicCurrency(refund)}
                          </td>
                        </tr>
                      );
                    })}
                    {returnableBatches.length === 0 && !isLoadingReturns && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-ink-muted">
                          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-paid opacity-60" />
                          <p className="text-xs font-bold">لا توجد تشغيلات تطابق نافذة استرجاع الصلاحية للموردين حالياً.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Action Bar */}
              <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="ملاحظات المرتجع (تاريخ استلام المندوب، رقم إذن الارتجاع...)"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="w-full sm:w-96 h-10 px-3 bg-surface dark:bg-surface-dark border border-line rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                />

                <button
                  type="button"
                  onClick={() => void handleCreateReturnDraft()}
                  disabled={isSubmittingReturn || selectedReturnItems.length === 0}
                  className="w-full sm:w-auto h-10 px-5 rounded-xl bg-brand dark:bg-brand-bright hover:bg-brand-dark text-white dark:text-surface-dark font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isSubmittingReturn ? 'جاري ترحيل المرتجع...' : 'إنشاء إشعار خصم ومرتجع مشتريات للمورد'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EXPIRED WRITE-OFF */}
          {activeTab === 'writeoff' && (
            <div className="space-y-4">
              {/* If certificate is already generated, show Printable Certificate directly */}
              {currentCertificate ? (
                <div className="space-y-4">
                  {/* Print Controls Header */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between print:hidden">
                    <div className="flex items-center gap-2.5 text-xs text-paid dark:text-paid-bright font-bold">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>تم توثيق محضر الإعدام رقم #{currentCertificate.certificateNumber} وخصم المخزون بنجاح.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePrintCertificate}
                        className="h-9 px-4 rounded-xl bg-brand dark:bg-brand-bright text-white dark:text-surface-dark font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Printer className="w-4 h-4" />
                        <span>طباعة المحضر الرسمي (A4)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentCertificate(null)}
                        className="h-9 px-3 rounded-xl bg-surface dark:bg-surface-dark border border-line text-xs font-bold text-ink-muted hover:text-ink cursor-pointer"
                      >
                        محضر جديد
                      </button>
                    </div>
                  </div>

                  {/* Official A4 Certificate Layout */}
                  <div className="p-8 bg-white text-black border border-gray-300 rounded-2xl print:border-none print:p-0 print:m-0 space-y-6">
                    {/* Header */}
                    <div className="text-center border-b-2 border-black pb-4 space-y-1">
                      <h1 className="text-xl font-black">جمهورية مصر العربية - وزارة الصحة والسكان</h1>
                      <h2 className="text-base font-bold">محضر إعدام وتكهين أدوية ومستحضرات صيدلية منتهية الصلاحية</h2>
                      <div className="flex justify-between items-center text-xs font-mono pt-2">
                        <span>رقم المحضر: {currentCertificate.certificateNumber}</span>
                        <span>التاريخ: {currentCertificate.date}</span>
                      </div>
                    </div>

                    {/* Committee Members */}
                    <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg text-xs space-y-1">
                      <p><span className="font-bold">أعضاء اللجنة المشرفة:</span> {currentCertificate.committeeMembers}</p>
                      {currentCertificate.generalNotes && (
                        <p><span className="font-bold">الملاحظات:</span> {currentCertificate.generalNotes}</p>
                      )}
                    </div>

                    {/* Items Table */}
                    <table className="w-full text-right text-xs border-collapse border border-black">
                      <thead>
                        <tr className="bg-gray-100 border-b border-black">
                          <th className="border border-black p-2 text-center w-10">م</th>
                          <th className="border border-black p-2">اسم الدواء والمستحضر</th>
                          <th className="border border-black p-2 w-28 text-center">التشغيلة</th>
                          <th className="border border-black p-2 w-20 text-center">الكمية</th>
                          <th className="border border-black p-2 w-24 text-left">التكلفة</th>
                          <th className="border border-black p-2 w-28 text-left">الإجمالي</th>
                          <th className="border border-black p-2">سبب الإعدام</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentCertificate.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-300">
                            <td className="border border-black p-2 text-center font-mono">{idx + 1}</td>
                            <td className="border border-black p-2 font-bold">{item.productName}</td>
                            <td className="border border-black p-2 text-center font-mono">{item.batchNumber || '-'}</td>
                            <td className="border border-black p-2 text-center font-mono font-bold">
                              {(item.quantityMilli / 1000).toFixed(0)}
                            </td>
                            <td className="border border-black p-2 text-left font-mono">
                              {formatArabicCurrency(item.unitCostPiasters)}
                            </td>
                            <td className="border border-black p-2 text-left font-mono font-bold">
                              {formatArabicCurrency(item.totalCostPiasters)}
                            </td>
                            <td className="border border-black p-2 text-[11px]">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 font-bold">
                          <td colSpan={3} className="border border-black p-2 text-right">الإجمالي العام للخسارة والتكلفة:</td>
                          <td className="border border-black p-2 text-center font-mono">{currentCertificate.totalItemsCount}</td>
                          <td colSpan={3} className="border border-black p-2 text-left font-mono font-bold">
                            {formatArabicCurrency(currentCertificate.totalCostPiasters)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>

                    {/* Signatures */}
                    <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs font-bold">
                      <div className="space-y-8">
                        <p>الصيدلي المسؤول</p>
                        <p className="text-gray-400 font-normal">.................................</p>
                      </div>
                      <div className="space-y-8">
                        <p>مدير الصيدلية</p>
                        <p className="text-gray-400 font-normal">.................................</p>
                      </div>
                      <div className="space-y-8">
                        <p>مندوب التفتيش / المراقب</p>
                        <p className="text-gray-400 font-normal">.................................</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Write-off Form & Selection */
                <div className="space-y-4 print:hidden">
                  <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-ink dark:text-ink-dark">
                        تشغيلات الأدوية المنتهية الصلاحية تماماً بالمخزن
                      </h4>
                      <p className="text-[11px] text-ink-muted">
                        حدد الأدوية المراد إعدامها وتوثيق محضرها لإسقاطها نهائياً من المخزون بقيد معاكس
                      </p>
                    </div>
                    <div className="px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 text-left">
                      <span className="text-[10px] text-danger block font-bold">خسارة الإعدام المقدرة</span>
                      <span className="text-sm font-bold font-mono text-danger dark:text-danger-bright">
                        {formatArabicCurrency(writeOffSummary.totalCost)}
                      </span>
                    </div>
                  </div>

                  {/* Table of Expired Batches */}
                  <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted sticky top-0 border-b border-line dark:border-line-dark text-[11px]">
                        <tr>
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={expiredBatches.length > 0 && selectedWriteOffItems.length === expiredBatches.length}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const newMap = { ...selectedWriteOffMap };
                                expiredBatches.forEach(b => {
                                  if (newMap[b.batchId]) newMap[b.batchId].selected = checked;
                                });
                                setSelectedWriteOffMap(newMap);
                              }}
                              className="rounded border-line text-brand focus:ring-brand cursor-pointer"
                            />
                          </th>
                          <th className="p-3">اسم الصنف الدوائي</th>
                          <th className="p-3 w-28">رقم التشغيلة</th>
                          <th className="p-3 w-28">تاريخ الانتهاء</th>
                          <th className="p-3 w-32 text-center">الكمية المعدومة</th>
                          <th className="p-3 w-28">تكلفة الشراء</th>
                          <th className="p-3 w-28 text-left">إجمالي التكلفة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-line-dark">
                        {expiredBatches.map((b) => {
                          const isSelected = selectedWriteOffMap[b.batchId]?.selected ?? false;
                          const writeOffQty = selectedWriteOffMap[b.batchId]?.writeOffQty ?? (b.quantityMilli / 1000);
                          const maxQty = b.quantityMilli / 1000;
                          const lineCost = Math.round(writeOffQty * b.unitCostPiasters);

                          return (
                            <tr key={b.batchId} className={isSelected ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setSelectedWriteOffMap(prev => ({
                                      ...prev,
                                      [b.batchId]: {
                                        selected: e.target.checked,
                                        writeOffQty: prev[b.batchId]?.writeOffQty ?? maxQty,
                                      },
                                    }));
                                  }}
                                  className="rounded border-line text-danger focus:ring-danger cursor-pointer"
                                />
                              </td>
                              <td className="p-3 font-bold text-ink dark:text-ink-dark">{b.productName}</td>
                              <td className="p-3 font-mono font-bold text-ink dark:text-ink-dark">{b.batchNumber}</td>
                              <td className="p-3 font-mono text-danger font-bold">{b.expiryDate}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={writeOffQty}
                                    disabled={!isSelected}
                                    onChange={(e) => {
                                      const raw = parseFloat(normalizeArabicNumerals(e.target.value)) || 0;
                                      const val = Math.min(maxQty, Math.max(1, raw));
                                      setSelectedWriteOffMap(prev => ({
                                        ...prev,
                                        [b.batchId]: { selected: true, writeOffQty: val },
                                      }));
                                    }}
                                    className="w-16 h-8 text-center bg-surface dark:bg-surface-dark border border-line rounded-lg font-mono font-bold text-xs disabled:opacity-50"
                                  />
                                  <span className="text-[10px] text-ink-muted">/ {maxQty}</span>
                                </div>
                              </td>
                              <td className="p-3 font-mono text-ink-muted">{formatArabicCurrency(b.unitCostPiasters)}</td>
                              <td className="p-3 font-mono font-bold text-danger text-left">{formatArabicCurrency(lineCost)}</td>
                            </tr>
                          );
                        })}
                        {expiredBatches.length === 0 && !isLoadingExpired && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-ink-muted">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-paid opacity-60" />
                              <p className="text-xs font-bold">المخزن نظيف تماماً ولا توجد بضاعة منتهية الصلاحية حالياً.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Committee Input Fields */}
                  <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                          أعضاء لجنة الإعدام القانونية <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={committeeMembers}
                          onChange={(e) => setCommitteeMembers(e.target.value)}
                          placeholder="مثلاً: د. أحمد فؤاد (مدير) - د. سارة علي (صيدلي)"
                          className="w-full h-10 px-3 bg-surface dark:bg-surface-dark border border-line rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                          سبب الإعدام
                        </label>
                        <input
                          type="text"
                          value={writeOffReason}
                          onChange={(e) => setWriteOffReason(e.target.value)}
                          placeholder="انتهاء تاريخ الصلاحية ورفض المورد الاسترجاع"
                          className="w-full h-10 px-3 bg-surface dark:bg-surface-dark border border-line rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <input
                        type="text"
                        value={writeOffNotes}
                        onChange={(e) => setWriteOffNotes(e.target.value)}
                        placeholder="ملاحظات المحضر (طريقة الإعدام: فرم وطمر صحي، حضور مندوب الوزارة...)"
                        className="flex-1 h-10 px-3 bg-surface dark:bg-surface-dark border border-line rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                      />

                      <button
                        type="button"
                        onClick={() => void handleExecuteWriteOff()}
                        disabled={isSubmittingWriteOff || selectedWriteOffItems.length === 0}
                        className="h-10 px-5 rounded-xl bg-danger hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{isSubmittingWriteOff ? 'جاري توثيق الإعدام...' : 'تنفيذ محضر الإعدام وخصم المخزون'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WRITE-OFF HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4 print:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="ابحث في سجل المحاضر برقم المحضر، اسم الدواء، أو التشغيلة..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-3.5 bg-surface-2 dark:bg-surface-dark-2 border border-line rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <Search className="w-4 h-4 text-ink-muted absolute left-3 top-3" />
                </div>
              </div>

              {/* Table of History */}
              <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden max-h-[55vh] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted sticky top-0 border-b border-line dark:border-line-dark text-[11px]">
                    <tr>
                      <th className="p-3 w-28">رقم المحضر</th>
                      <th className="p-3 w-28">التاريخ</th>
                      <th className="p-3">اسم الدواء والمستحضر</th>
                      <th className="p-3 w-24">التشغيلة</th>
                      <th className="p-3 w-20 text-center">الكمية</th>
                      <th className="p-3 w-28 text-left">الخسارة المالية</th>
                      <th className="p-3">أعضاء اللجنة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {filteredHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-2/40">
                        <td className="p-3 font-mono font-bold text-brand dark:text-brand-bright">{item.writeOffNumber}</td>
                        <td className="p-3 font-mono text-ink-muted text-[11px]">{item.createdAt.slice(0, 10)}</td>
                        <td className="p-3 font-bold text-ink dark:text-ink-dark">{item.productName}</td>
                        <td className="p-3 font-mono">{item.batchNumber || '-'}</td>
                        <td className="p-3 text-center font-mono font-bold">{(item.quantityMilli / 1000).toFixed(0)}</td>
                        <td className="p-3 font-mono font-bold text-danger text-left">
                          {formatArabicCurrency(item.totalCostPiasters)}
                        </td>
                        <td className="p-3 text-ink-muted text-[11px]">{item.committeeMembers || '-'}</td>
                      </tr>
                    ))}
                    {filteredHistory.length === 0 && !isLoadingHistory && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-ink-muted">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs">لا توجد محاضر إعدام سابقة مسجلة.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 3. Footer (Print Hidden) */}
        <div className="px-6 py-3.5 border-t border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 flex items-center justify-between shrink-0 print:hidden">
          <div className="text-[11px] text-ink-muted flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>نظام إثبات محاضر الإعدام معتمد لدى التفتيش الصيدلي وتتبع الصلاحيات</span>
          </div>

          <button
            type="button"
            onClick={() => void requestClose()}
            className="px-4 h-9 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold hover:bg-surface-2 transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
