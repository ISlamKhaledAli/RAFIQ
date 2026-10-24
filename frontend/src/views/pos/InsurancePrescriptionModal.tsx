import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, 
  FileText, 
  UserCheck, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Search, 
  Percent, 
  Check, 
  Trash2, 
  Info
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { CustomSelect } from '../../components/CustomSelect';
import { formatArabicCurrency } from '../../utils/money';
import type { 
  InsuranceCompany, 
  InsuranceContract, 
  InsuranceMember, 
  InsuranceCalculationResult, 
  InsuranceClaimLine 
} from '../../types/insurance';
import type { CartItem } from './types';

interface InsurancePrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  currentClaim?: InsuranceClaimLine | null;
  onApplyClaim: (claim: InsuranceClaimLine, calcResult: InsuranceCalculationResult) => void;
  onRemoveClaim?: () => void;
}

export const InsurancePrescriptionModal: React.FC<InsurancePrescriptionModalProps> = ({
  isOpen,
  onClose,
  cart,
  currentClaim,
  onApplyClaim,
  onRemoveClaim,
}) => {
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [contracts, setContracts] = useState<InsuranceContract[]>([]);
  const [members, setMembers] = useState<InsuranceMember[]>([]);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [memberNo, setMemberNo] = useState<string>('');
  const [patientName, setPatientName] = useState<string>('');
  const [approvalNo, setApprovalNo] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  
  const [matchedMember, setMatchedMember] = useState<InsuranceMember | null>(null);
  const [calcResult, setCalcResult] = useState<InsuranceCalculationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 1. Initial Load of Companies & Contracts
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setErrorMsg('');
      try {
        const [compList, contList] = await Promise.all([
          invoke<InsuranceCompany[]>('insurance:getCompanies'),
          invoke<InsuranceContract[]>('insurance:getContracts', { activeOnly: true }),
        ]);
        if (!isMounted) return;

        const activeComps = (compList || []).filter((c) => c.isActive);
        setCompanies(activeComps);
        setContracts(contList || []);

        if (currentClaim) {
          setSelectedCompanyId(currentClaim.companyId);
          setSelectedContractId(currentClaim.contractId);
          setMemberNo(currentClaim.memberNo || '');
          setPatientName(currentClaim.patientName || '');
          setApprovalNo(currentClaim.approvalNo || '');
        } else if (activeComps.length > 0) {
          const firstComp = activeComps[0];
          setSelectedCompanyId(firstComp.id);
          const firstCompContracts = (contList || []).filter((c) => c.companyId === firstComp.id);
          if (firstCompContracts.length > 0) {
            setSelectedContractId(firstCompContracts[0].id);
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg(err instanceof Error ? err.message : 'فشل تحميل بيانات التأمين');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentClaim]);

  // 2. Filter contracts by selected company
  const availableContracts = contracts.filter((c) => c.companyId === selectedCompanyId);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (availableContracts.length > 0 && !availableContracts.some((c) => c.id === selectedContractId)) {
      setSelectedContractId(availableContracts[0].id);
    } else if (availableContracts.length === 0) {
      setSelectedContractId('');
    }
  }, [selectedCompanyId, availableContracts, selectedContractId]);

  // 3. Load Members for selected contract
  useEffect(() => {
    if (!selectedContractId) {
      setMembers([]);
      return;
    }
    let isMounted = true;
    async function loadMembers() {
      try {
        const memberList = await invoke<InsuranceMember[]>('insurance:getMembersByContract', { contractId: selectedContractId });
        if (isMounted) {
          setMembers(memberList || []);
        }
      } catch {
        if (isMounted) setMembers([]);
      }
    }
    void loadMembers();
    return () => {
      isMounted = false;
    };
  }, [selectedContractId]);

  // 4. Match Member when MemberNo or Members list changes
  useEffect(() => {
    if (!memberNo.trim()) {
      setMatchedMember(null);
      return;
    }
    const cleanNo = memberNo.trim().toLowerCase();
    const found = members.find((m) => m.memberNo.toLowerCase() === cleanNo || (m.nationalId && m.nationalId.toLowerCase() === cleanNo));
    if (found) {
      setMatchedMember(found);
      setPatientName(found.memberName);
    } else {
      setMatchedMember(null);
    }
  }, [memberNo, members]);

  // 5. Calculate Split in real-time
  const runCalculateSplit = useCallback(async () => {
    if (!selectedContractId || cart.length === 0) {
      setCalcResult(null);
      return;
    }

    setCalculating(true);
    setErrorMsg('');
    try {
      const itemsPayload = cart.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        categoryId: null,
        pricePiasters: i.unitPricePiasters,
        quantityMilli: i.quantityMilli,
      }));

      const res = await invoke<InsuranceCalculationResult>('insurance:calculateSplit', {
        contractId: selectedContractId,
        items: itemsPayload,
      });
      setCalcResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل حساب حصص التأمين');
    } finally {
      setCalculating(false);
    }
  }, [selectedContractId, cart]);

  useEffect(() => {
    if (isOpen && selectedContractId && cart.length > 0) {
      void runCalculateSplit();
    }
  }, [isOpen, selectedContractId, cart, runCalculateSplit]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!selectedContractId) {
      setErrorMsg('يرجى اختيار العقد الطبي');
      return;
    }
    if (!memberNo.trim()) {
      setErrorMsg('يرجى إدخال رقم بطاقة / عضوية المشترك');
      return;
    }
    if (!patientName.trim()) {
      setErrorMsg('يرجى إدخال اسم المريض / المشترك');
      return;
    }
    if (!calcResult) {
      setErrorMsg('يرجى الانتظار حتى اكتمال حساب الحصص المالية');
      return;
    }

    const currentCompany = companies.find((c) => c.id === selectedCompanyId);
    const currentContract = contracts.find((c) => c.id === selectedContractId);

    const claimLine: InsuranceClaimLine = {
      id: currentClaim?.id || '',
      saleId: currentClaim?.saleId || '',
      companyId: selectedCompanyId,
      companyName: currentCompany?.name || '',
      contractId: selectedContractId,
      contractName: currentContract?.name || '',
      memberId: matchedMember?.id || null,
      memberNo: memberNo.trim(),
      patientName: patientName.trim(),
      approvalNo: approvalNo.trim() || (doctorName.trim() ? `د/ ${doctorName.trim()}` : null),
      totalInvoicePiasters: calcResult.totalInvoicePiasters,
      coveredPiasters: calcResult.coveredPiasters,
      patientPiasters: calcResult.patientPiasters,
      companyPiasters: calcResult.companyPiasters,
      status: currentClaim?.status || 'pending',
    };

    onApplyClaim(claimLine, calcResult);
    onClose();
  };

  const selectedContractObj = contracts.find((c) => c.id === selectedContractId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div 
        className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center text-brand dark:text-brand-bright">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                <span>تطبيق روشتة التأمين الطبي والتعاقدات</span>
                {currentClaim && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-paid-soft text-paid border border-paid-border">
                    تعديل روشتة سابقة
                  </span>
                )}
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                فصل حصة المريض عن مطالبة شركة التأمين آلياً بأعلى دقة مالية
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-danger-soft border border-danger-border rounded-xl text-danger flex items-center gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="py-10 text-center text-ink-muted">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30 text-ink-muted" />
              <p className="text-sm font-bold">سلة المشتريات فارغة</p>
              <p className="text-xs">أضف الأدوية والمستلزمات إلى السلة أولاً لتطبيق الروشتة التأمينية عليها</p>
            </div>
          ) : (
            <>
              {/* Row 1: Company & Contract Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                    شركة التأمين / الجهة المتعاقدة
                  </label>
                  <CustomSelect
                    value={selectedCompanyId}
                    onChange={(val) => setSelectedCompanyId(val)}
                    options={companies.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                    placeholder="اختر شركة التأمين..."
                    disabled={loading || companies.length === 0}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                    العقد الطبي والفئة
                  </label>
                  <CustomSelect
                    value={selectedContractId}
                    onChange={(val) => setSelectedContractId(val)}
                    options={availableContracts.map((c) => ({
                      value: c.id,
                      label: `${c.name} (تحمل المريض: ${(c.patientShareBps / 100).toFixed(0)}%)`,
                    }))}
                    placeholder={availableContracts.length === 0 ? 'لا توجد عقود نشطة لهذه الشركة' : 'اختر العقد الطبي...'}
                    disabled={loading || availableContracts.length === 0}
                  />
                </div>
              </div>

              {/* Row 2: Member Details */}
              <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-2">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>بيانات المشترك والبطاقة الطبية</span>
                  </span>
                  {selectedContractObj && (
                    <span className="text-[11px] font-semibold text-brand dark:text-brand-bright bg-brand-soft px-2 py-0.5 rounded-md border border-brand/20">
                      نسبة التحمل: {(selectedContractObj.patientShareBps / 100).toFixed(0)}%
                      {selectedContractObj.capPerInvoicePiasters && selectedContractObj.capPerInvoicePiasters > 0 && (
                        <span> | حد الفاتورة: {formatArabicCurrency(selectedContractObj.capPerInvoicePiasters)}</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-ink-muted mb-1">
                      رقم العضوية / رقم البطاقة الطبية *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={memberNo}
                        onChange={(e) => setMemberNo(e.target.value)}
                        placeholder="أدخل أو امسح الباركود للكارنيه..."
                        className="w-full h-9 px-3 pl-8 text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink font-mono font-bold focus:outline-none focus:border-brand"
                      />
                      <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-3 pointer-events-none" />
                    </div>
                    {matchedMember ? (
                      <p className="mt-1 text-[10px] text-paid font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>مشترك مسجل: {matchedMember.memberName}</span>
                        {matchedMember.validTo && <span>(صالح حتى: {matchedMember.validTo})</span>}
                      </p>
                    ) : (
                      memberNo.trim() && (
                        <p className="mt-1 text-[10px] text-ink-muted flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          <span>رقم غير محفوظ، يمكنك كتابة اسم المريض يدوياً أدناه</span>
                        </p>
                      )
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-ink-muted mb-1">
                      اسم المريض / المشترك *
                    </label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="الاسم الثلاثي أو الرباعي للمشترك..."
                      className="w-full h-9 px-3 text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink font-bold focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-ink-muted mb-1">
                      رقم الموافقة الطبية (Medical Approval No)
                    </label>
                    <input
                      type="text"
                      value={approvalNo}
                      onChange={(e) => setApprovalNo(e.target.value)}
                      placeholder="رقم الموافقة إن وجدت أو اترك فارغاً..."
                      className="w-full h-9 px-3 text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink font-mono focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-ink-muted mb-1">
                      اسم الطبيب المعالج / العيادة
                    </label>
                    <input
                      type="text"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      placeholder="اسم الطبيب أو جهة التحويل..."
                      className="w-full h-9 px-3 text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Financial Summary & Calculation Split Preview */}
              <div className="bg-surface border border-line dark:border-line-dark rounded-xl p-3.5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-paid" />
                    <span>توزيع الحصص المالية للفاتورة الحالية</span>
                  </span>
                  {calculating && (
                    <span className="text-[10px] text-ink-muted animate-pulse">جاري حساب الحصص...</span>
                  )}
                </div>

                {calcResult ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-surface-2 dark:bg-surface-dark-2 p-2 rounded-lg border border-line dark:border-line-dark">
                        <span className="block text-[10px] text-ink-muted font-bold">إجمالي الفاتورة</span>
                        <span className="text-xs font-black text-ink dark:text-ink-dark font-mono">
                          {formatArabicCurrency(calcResult.totalInvoicePiasters)}
                        </span>
                      </div>

                      <div className="bg-surface-2 dark:bg-surface-dark-2 p-2 rounded-lg border border-line dark:border-line-dark">
                        <span className="block text-[10px] text-ink-muted font-bold">المبلغ المغطى</span>
                        <span className="text-xs font-black text-ink dark:text-ink-dark font-mono">
                          {formatArabicCurrency(calcResult.coveredPiasters)}
                        </span>
                        {calcResult.excludedPiasters > 0 && (
                          <span className="block text-[9px] text-danger font-medium">
                            مستبعد: {formatArabicCurrency(calcResult.excludedPiasters)}
                          </span>
                        )}
                      </div>

                      <div className="bg-brand-soft/70 dark:bg-brand-dark-soft p-2 rounded-lg border border-brand/20">
                        <span className="block text-[10px] text-brand dark:text-brand-bright font-bold">
                          تحمل المريض (كاش)
                        </span>
                        <span className="text-sm font-black text-brand-dark dark:text-brand-bright font-mono">
                          {formatArabicCurrency(calcResult.patientPiasters)}
                        </span>
                      </div>

                      <div className="bg-paid-soft/70 dark:bg-paid-dark-soft p-2 rounded-lg border border-paid/20">
                        <span className="block text-[10px] text-paid dark:text-paid-bright font-bold">
                          مطالبة الشركة (آجل)
                        </span>
                        <span className="text-sm font-black text-paid dark:text-paid-bright font-mono">
                          {formatArabicCurrency(calcResult.companyPiasters)}
                        </span>
                      </div>
                    </div>

                    {calcResult.capApplied && (
                      <div className="p-2 bg-warn-soft border border-warn/30 rounded-lg text-warn text-[11px] font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          تم تطبيق الحد الأقصى للمطالبة في الفاتورة: تم تحويل الفائض ({formatArabicCurrency(calcResult.capExcessPiasters)}) إلى حصة المريض.
                        </span>
                      </div>
                    )}

                    {/* Item Coverages breakdown */}
                    <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden">
                      <div className="bg-surface-2 dark:bg-surface-dark-2 px-3 py-1.5 text-[11px] font-bold text-ink-muted flex justify-between">
                        <span>تفصيل تغطية بنود السلة ({calcResult.itemCoverages.length} أصناف)</span>
                      </div>
                      <div className="divide-y divide-line dark:divide-line-dark max-h-36 overflow-y-auto">
                        {calcResult.itemCoverages.map((item, idx) => (
                          <div key={idx} className="px-3 py-1.5 text-xs flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${item.isCovered ? 'bg-paid' : 'bg-danger'}`} />
                              <span className="truncate text-ink font-medium">{item.productName}</span>
                              {!item.isCovered && item.exclusionReason && (
                                <span className="text-[10px] text-danger bg-danger-soft px-1.5 py-0.2 rounded border border-danger-border shrink-0">
                                  {item.exclusionReason}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                              <span className="text-ink-muted">الإجمالي: {formatArabicCurrency(item.lineTotalPiasters)}</span>
                              <span className="text-brand font-bold">مريض: {formatArabicCurrency(item.patientPiasters)}</span>
                              <span className="text-paid font-bold">شركة: {formatArabicCurrency(item.companyPiasters)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-ink-muted">
                    اختر العقد الطبي لمعاينة توزيع الحصص
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between">
          <div>
            {currentClaim && onRemoveClaim && (
              <button
                type="button"
                onClick={() => {
                  onRemoveClaim();
                  onClose();
                }}
                className="h-9 px-3 bg-danger-soft hover:bg-danger/20 text-danger border border-danger-border rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إلغاء التأمين من الفاتورة</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 bg-surface hover:bg-surface-3 text-ink border border-line rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={loading || calculating || cart.length === 0 || !selectedContractId || !calcResult}
              className="h-9 px-5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>تطبيق الروشتة على الفاتورة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
