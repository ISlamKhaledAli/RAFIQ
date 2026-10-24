import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Download,
  RefreshCw,
  ShieldAlert,
  X,
  Phone
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useAuth } from '../../context/useAuth';
import { CustomSelect } from '../../components/CustomSelect';
import type {
  InsuranceCompany,
  InsuranceContract,
  InsuranceMember,
  InsuranceClaimBatch,
  InsuranceClaimLine
} from '../../types/insurance';

export type InsuranceSubTab = 'companies' | 'members' | 'batches' | 'settlement';

interface InsuranceContractsViewProps {
  isActive?: boolean;
  activeSubTab?: InsuranceSubTab;
  onSubTabChange?: (tab: InsuranceSubTab) => void;
}

export const InsuranceContractsView: React.FC<InsuranceContractsViewProps> = ({
  isActive: _isActive = true,
  activeSubTab,
  onSubTabChange: _onSubTabChange,
}) => {
  const { hasPermission } = useAuth();
  const [internalTab, setInternalTab] = useState<InsuranceSubTab>(activeSubTab || 'companies');

  useEffect(() => {
    if (activeSubTab) {
      setInternalTab(activeSubTab);
    }
  }, [activeSubTab]);

  const activeTab = activeSubTab || internalTab;
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data states
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [contracts, setContracts] = useState<InsuranceContract[]>([]);
  const [members, setMembers] = useState<InsuranceMember[]>([]);
  const [batches, setBatches] = useState<InsuranceClaimBatch[]>([]);
  const [pendingClaims, setPendingClaims] = useState<InsuranceClaimLine[]>([]);

  // Selection & Filters
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');

  // Modals
  const [showCompanyModal, setShowCompanyModal] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<Partial<InsuranceCompany> | null>(null);

  const [showContractModal, setShowContractModal] = useState<boolean>(false);
  const [editingContract, setEditingContract] = useState<Partial<InsuranceContract> | null>(null);

  const [showMemberModal, setShowMemberModal] = useState<boolean>(false);
  const [editingMember, setEditingMember] = useState<Partial<InsuranceMember> | null>(null);

  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [newBatchCompanyId, setNewBatchCompanyId] = useState<string>('');
  const [newBatchNumber, setNewBatchNumber] = useState<string>('');
  const [newBatchPeriod, setNewBatchPeriod] = useState<string>(new Date().toISOString().substring(0, 7));
  const [newBatchNotes, setNewBatchNotes] = useState<string>('');
  const [selectedPendingClaimIds, setSelectedPendingClaimIds] = useState<string[]>([]);

  const [showSettleModal, setShowSettleModal] = useState<boolean>(false);
  const [settlingBatch, setSettlingBatch] = useState<InsuranceClaimBatch | null>(null);
  const [approvedAmountEgp, setApprovedAmountEgp] = useState<string>('');
  const [rejectedAmountEgp, setRejectedAmountEgp] = useState<string>('0');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [deductionTarget, setDeductionTarget] = useState<'expense' | 'patient_debt'>('expense');

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compsRes, cntsRes, batchesRes] = await Promise.all([
        invoke<InsuranceCompany[]>('insurance:getCompanies', { includeInactive: false }),
        invoke<InsuranceContract[]>('insurance:getContracts', { includeInactive: false }),
        invoke<InsuranceClaimBatch[]>('insurance:getBatches', {}),
      ]);

      if (Array.isArray(compsRes)) {
        setCompanies(compsRes);
      }
      if (Array.isArray(cntsRes)) {
        setContracts(cntsRes);
      }
      if (Array.isArray(batchesRes)) {
        setBatches(batchesRes);
      }

      if (activeTab === 'members') {
        const memRes = await invoke<InsuranceMember[]>('insurance:getMembers', {
          contractId: selectedContractId || undefined,
          search: memberSearchQuery || undefined,
        });
        if (Array.isArray(memRes)) {
          setMembers(memRes);
        }
      }

      if (activeTab === 'batches' || showBatchModal) {
        const pendingRes = await invoke<InsuranceClaimLine[]>('insurance:getPendingClaims', {
          companyId: newBatchCompanyId || undefined,
        });
        if (Array.isArray(pendingRes)) {
          setPendingClaims(pendingRes);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر تحميل بيانات التأمين الطبي';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedContractId, memberSearchQuery, newBatchCompanyId, showBatchModal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManageContracts = hasPermission ? hasPermission('insurance.manage_contracts') : false;
  const canManageClaims = hasPermission ? hasPermission('insurance.claims.manage') : false;
  const canSettleClaims = hasPermission ? hasPermission('insurance.claims.settle') : false;

  // Stats calculation
  const totalPendingClaimsPiasters = useMemo(() => {
    return companies.reduce((sum, c) => sum + (c.pendingClaimsPiasters || 0), 0);
  }, [companies]);

  const totalPendingCount = useMemo(() => {
    return companies.reduce((sum, c) => sum + (c.pendingClaimsCount || 0), 0);
  }, [companies]);

  // Company save
  const handleSaveCompany = async () => {
    if (!editingCompany || !editingCompany.name?.trim()) {
      setError('يرجى إدخال اسم شركة التأمين');
      return;
    }
    setLoading(true);
    try {
      await invoke('insurance:saveCompany', editingCompany);
      setSuccessMsg('تم حفظ بيانات شركة التأمين بنجاح');
      setShowCompanyModal(false);
      setEditingCompany(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  // Contract save
  const handleSaveContract = async () => {
    if (!editingContract || !editingContract.name?.trim() || !editingContract.companyId) {
      setError('يرجى اختيار شركة التأمين وإدخال اسم العقد');
      return;
    }
    setLoading(true);
    try {
      await invoke('insurance:saveContract', editingContract);
      setSuccessMsg('تم حفظ عقد التأمين بنجاح');
      setShowContractModal(false);
      setEditingContract(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  // Member save
  const handleSaveMember = async () => {
    if (!editingMember || !editingMember.memberName?.trim() || !editingMember.memberNo?.trim() || !editingMember.contractId) {
      setError('يرجى استيفاء اسم المشترك، رقم الكارنيه، واختيار العقد');
      return;
    }
    setLoading(true);
    try {
      await invoke('insurance:saveMember', editingMember);
      setSuccessMsg('تم تسجيل بيانات المشترك بنجاح');
      setShowMemberModal(false);
      setEditingMember(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  // Create Batch
  const handleCreateBatch = async () => {
    if (!newBatchCompanyId || !newBatchNumber.trim() || !newBatchPeriod) {
      setError('يرجى اختيار الشركة وإدخال رقم المطالبة والشهر');
      return;
    }
    if (selectedPendingClaimIds.length === 0) {
      setError('يرجى تحديد فاتورة واحدة على الأقل لإدراجها في المطالبة');
      return;
    }
    setLoading(true);
    try {
      await invoke('insurance:createBatch', {
        companyId: newBatchCompanyId,
        batchNumber: newBatchNumber.trim(),
        periodMonth: newBatchPeriod,
        notes: newBatchNotes,
        claimLineIds: selectedPendingClaimIds,
      });
      setSuccessMsg('تم إصدار دفعة المطالبة الشهرية بنجاح');
      setShowBatchModal(false);
      setSelectedPendingClaimIds([]);
      setNewBatchNumber('');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إصدار المطالبة');
    } finally {
      setLoading(false);
    }
  };

  // Settle Batch
  const handleSettleBatch = async () => {
    if (!settlingBatch) return;
    const appAmt = Math.round(parseFloat(approvedAmountEgp || '0') * 100);
    const rejAmt = Math.round(parseFloat(rejectedAmountEgp || '0') * 100);

    if (appAmt < 0 || rejAmt < 0) {
      setError('المبالغ المدخلة لا يمكن أن تكون سالبة');
      return;
    }
    if (appAmt + rejAmt !== settlingBatch.totalAmountPiasters) {
      setError(`مجموع المعتمد والمرفوض (${((appAmt + rejAmt) / 100).toFixed(2)} ج.م) يجب أن يطابق إجمالي المطالبة (${(settlingBatch.totalAmountPiasters / 100).toFixed(2)} ج.م)`);
      return;
    }

    setLoading(true);
    try {
      await invoke('insurance:settleBatch', {
        batchId: settlingBatch.id,
        approvedAmountPiasters: appAmt,
        rejectedAmountPiasters: rejAmt,
        rejectionReason: rejAmt > 0 ? rejectionReason : undefined,
        deductionTarget: deductionTarget,
      });
      setSuccessMsg('تمت تسوية المطالبة واعتماد الأرصدة وترحيل الرفوضات بنجاح');
      setShowSettleModal(false);
      setSettlingBatch(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء التسوية');
    } finally {
      setLoading(false);
    }
  };

  // Export Excel
  const handleExportExcel = async (batchId: string) => {
    setLoading(true);
    try {
      const res = await invoke<{ path: string }>('insurance:exportBatchExcel', { batchId });
      if (res && res.path) {
        setSuccessMsg(`تم تصدير ملف الإكسل الرسمي بنجاح في: ${res.path}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تصدير الإكسل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden">
      {/* Top Header */}
      <div className="bg-surface border-b border-line px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand" />
            <h1 className="text-xl font-bold text-ink">منظومة التأمين الطبي والتعاقدات ومطالبات الشركات</h1>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            إدارة العقود ونسب التحمل ومطالبات الشركات والفوترة الشهرية وتسوية الرفوضات الطبية
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="px-3 py-2 bg-surface-2 hover:bg-line text-ink rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 border border-line"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand' : ''}`} />
            تحديث البيانات
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 pb-2">
        <div className="bg-surface p-4 rounded-xl border border-line shadow-sm">
          <div className="flex items-center justify-between text-ink-muted text-xs">
            <span>شركات التأمين المتعاقدة</span>
            <Building2 className="w-4 h-4 text-brand" />
          </div>
          <div className="text-2xl font-bold text-ink mt-2">{companies.length}</div>
          <div className="text-xs text-ink-muted mt-1">شركة معتمدة بالدليل</div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line shadow-sm">
          <div className="flex items-center justify-between text-ink-muted text-xs">
            <span>عقود وفئات التغطية</span>
            <FileText className="w-4 h-4 text-paid" />
          </div>
          <div className="text-2xl font-bold text-ink mt-2">{contracts.length}</div>
          <div className="text-xs text-ink-muted mt-1">عقد تأميني ساري</div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line shadow-sm">
          <div className="flex items-center justify-between text-ink-muted text-xs">
            <span>فواتير معلقة للشركات</span>
            <AlertCircle className="w-4 h-4 text-warn" />
          </div>
          <div className="text-2xl font-bold text-warn mt-2">{totalPendingCount}</div>
          <div className="text-xs text-ink-muted mt-1">فاتورة بانتظار التجميع بمطالبة</div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line shadow-sm">
          <div className="flex items-center justify-between text-ink-muted text-xs">
            <span>مستحقات التأمين المعلقة</span>
            <CheckCircle2 className="w-4 h-4 text-brand" />
          </div>
          <div className="text-2xl font-bold text-brand mt-2">
            {(totalPendingClaimsPiasters / 100).toFixed(2)} <span className="text-sm font-normal">ج.م</span>
          </div>
          <div className="text-xs text-ink-muted mt-1">مبالغ مستحقة لدى الشركات</div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-2 p-3 bg-red-50 border border-red-200 text-danger text-sm rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-danger hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mx-6 mt-2 p-3 bg-paid-soft border border-paid/20 text-paid text-sm rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-paid hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}



      {/* Tab 1: Companies & Contracts */}
      {activeTab === 'companies' && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">دليل شركات التأمين الطبي المتعاقدة</h2>
            {canManageContracts && (
              <button
                onClick={() => {
                  setEditingCompany({ isActive: true });
                  setShowCompanyModal(true);
                }}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                إضافة شركة تأمين
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((comp) => {
              const compContracts = contracts.filter((c) => c.companyId === comp.id);
              return (
                <div key={comp.id} className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden flex flex-col justify-between">
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-ink text-base">{comp.name}</h3>
                        {comp.taxNumber && (
                          <div className="text-xs text-ink-muted mt-0.5">البطاقة الضريبية: {comp.taxNumber}</div>
                        )}
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-paid-soft text-paid">
                        نشط
                      </span>
                    </div>

                    <div className="mt-4 space-y-1.5 text-xs text-ink-muted">
                      {comp.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{comp.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{compContracts.length} عقد تأميني معتمد</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-brand font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>مطالبات معلقة: {((comp.pendingClaimsPiasters || 0) / 100).toFixed(2)} ج.م</span>
                      </div>
                    </div>

                    {/* Contracts list inside company card */}
                    <div className="mt-4 pt-3 border-t border-line/60">
                      <div className="text-xs font-bold text-ink mb-2">الفئات والعقود:</div>
                      {compContracts.length === 0 ? (
                        <div className="text-xs text-ink-muted italic">لا توجد عقود مسجلة لهذه الشركة بعد</div>
                      ) : (
                        <div className="space-y-1.5">
                          {compContracts.map((cnt) => (
                            <div key={cnt.id} className="p-2 bg-surface-2 rounded-lg text-xs flex items-center justify-between">
                              <div>
                                <span className="font-medium text-ink">{cnt.name}</span>
                                <div className="text-[11px] text-ink-muted">
                                  تحمل المريض: {(cnt.patientShareBps / 100).toFixed(0)}%
                                  {cnt.capPerInvoicePiasters ? ` | سقف: ${(cnt.capPerInvoicePiasters / 100).toFixed(0)} ج.م` : ''}
                                  {cnt.excludesCosmetics ? ' | يستثني التجميل' : ''}
                                </div>
                              </div>
                              {canManageContracts && (
                                <button
                                  onClick={() => {
                                    setEditingContract(cnt);
                                    setShowContractModal(true);
                                  }}
                                  className="text-brand hover:underline font-medium text-[11px]"
                                >
                                  تعديل
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-surface-2 px-5 py-3 border-t border-line flex items-center justify-between">
                    {canManageContracts && (
                      <button
                        onClick={() => {
                          setEditingContract({ companyId: comp.id, patientShareBps: 2000, excludesCosmetics: true, isActive: true });
                          setShowContractModal(true);
                        }}
                        className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        إضافة عقد فئة جديدة
                      </button>
                    )}
                    {canManageContracts && (
                      <button
                        onClick={() => {
                          setEditingCompany(comp);
                          setShowCompanyModal(true);
                        }}
                        className="text-xs text-ink-muted hover:text-ink font-medium"
                      >
                        تعديل الشركة
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Members Directory */}
      {activeTab === 'members' && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-ink-muted absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder="بحث برقم الكارنيه أو اسم المريض..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="w-64">
                <CustomSelect
                  value={selectedContractId}
                  onChange={(val) => setSelectedContractId(val)}
                  options={[
                    { value: '', label: 'كافة العقود والفئات' },
                    ...contracts.map((c) => ({ value: c.id, label: `${c.companyName || ''} - ${c.name}` })),
                  ]}
                />
              </div>
            </div>

            <button
              onClick={() => {
                setEditingMember({ contractId: contracts[0]?.id || '', isActive: true });
                setShowMemberModal(true);
              }}
              className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              تسجيل مشترك جديد
            </button>
          </div>

          <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface-2 text-ink font-bold border-b border-line">
                <tr>
                  <th className="py-3 px-4">رقم الكارنيه / العضوية</th>
                  <th className="py-3 px-4">اسم المريض / المشترك</th>
                  <th className="py-3 px-4">الشركة والعقد</th>
                  <th className="py-3 px-4">الرقم القومي</th>
                  <th className="py-3 px-4">الهاتف</th>
                  <th className="py-3 px-4">تاريخ الصلاحية</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-muted">
                      لا يوجد مشتركون مسجلون وفق معايير البحث الحالية
                    </td>
                  </tr>
                ) : (
                  members.map((mem) => (
                    <tr key={mem.id} className="hover:bg-canvas/50">
                      <td className="py-3 px-4 font-mono font-bold text-brand">{mem.memberNo}</td>
                      <td className="py-3 px-4 font-medium text-ink">{mem.memberName}</td>
                      <td className="py-3 px-4 text-xs text-ink-muted">
                        <div>{mem.companyName}</div>
                        <div className="text-ink font-medium">{mem.contractName}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-ink-muted">{mem.nationalId || '-'}</td>
                      <td className="py-3 px-4 text-xs">{mem.phone || '-'}</td>
                      <td className="py-3 px-4 text-xs">{mem.validTo || 'غير محدد'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${mem.isActive ? 'bg-paid-soft text-paid' : 'bg-red-50 text-danger'}`}>
                          {mem.isActive ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Monthly Batches */}
      {activeTab === 'batches' && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">دليل المطالبات الشهرية المجمعة للشركات</h2>
            {canManageClaims && (
              <button
                onClick={() => {
                  setNewBatchCompanyId(companies[0]?.id || '');
                  setNewBatchNumber(`CLM-${new Date().toISOString().substring(0, 7)}-${Math.floor(Math.random() * 900 + 100)}`);
                  setShowBatchModal(true);
                }}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                إصدار دفعة مطالبة مجمعة
              </button>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface-2 text-ink font-bold border-b border-line">
                <tr>
                  <th className="py-3 px-4">رقم الدفعة</th>
                  <th className="py-3 px-4">شركة التأمين</th>
                  <th className="py-3 px-4">فترة المطالبة</th>
                  <th className="py-3 px-4 text-center">عدد الفواتير</th>
                  <th className="py-3 px-4 text-left">إجمالي المطالبة (ج.م)</th>
                  <th className="py-3 px-4 text-left">المعتمد (ج.م)</th>
                  <th className="py-3 px-4 text-left">المرفوض (ج.م)</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-ink-muted">
                      لم يتم إنشاء أي مطالبات مجمعة حتى الآن
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-canvas/50">
                      <td className="py-3 px-4 font-mono font-bold text-ink">{batch.batchNumber}</td>
                      <td className="py-3 px-4 font-medium text-ink">{batch.companyName}</td>
                      <td className="py-3 px-4 text-xs font-mono">{batch.period}</td>
                      <td className="py-3 px-4 text-center font-bold">{batch.totalClaimsCount}</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-brand">
                        {(batch.totalAmountPiasters / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono text-paid">
                        {(batch.settledAmountPiasters / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono text-danger">
                        {(batch.rejectedAmountPiasters / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                            batch.status === 'settled'
                              ? 'bg-paid-soft text-paid'
                              : batch.status === 'partially_settled'
                              ? 'bg-warn/10 text-warn'
                              : batch.status === 'submitted'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-surface-2 text-ink'
                          }`}
                        >
                          {batch.status === 'settled'
                            ? 'مسددة بالكامل'
                            : batch.status === 'partially_settled'
                            ? 'تسوية جزئية'
                            : batch.status === 'submitted'
                            ? 'مقدمة للشركة'
                            : batch.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleExportExcel(batch.id)}
                            title="تصدير كشف إكسل رسمي"
                            className="p-1.5 hover:bg-surface-2 rounded text-paid"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canSettleClaims && batch.status !== 'settled' && (
                            <button
                              onClick={() => {
                                setSettlingBatch(batch);
                                setApprovedAmountEgp((batch.totalAmountPiasters / 100).toString());
                                setRejectedAmountEgp('0');
                                setRejectionReason('');
                                setShowSettleModal(true);
                              }}
                              className="px-2.5 py-1 bg-brand-soft text-brand hover:bg-brand hover:text-white rounded text-xs font-medium transition-colors"
                            >
                              تسوية
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Settlements */}
      {activeTab === 'settlement' && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="bg-surface p-5 rounded-xl border border-line shadow-sm">
            <h3 className="font-bold text-ink text-base mb-2">قواعد وضوابط تسوية الرفوضات الطبية</h3>
            <p className="text-sm text-ink-muted leading-relaxed">
              وفق المعايير المالية المحاسبية لنقاط البيع، عند استلام إشعار سداد مطالبة شركة التأمين متضمناً خصومات أو
              رفوضات لأدوية غير مطابقة للبروتوكول:
              يتم ترحيل المرفوضات تلقائياً كـ <strong>قيد مصروفات وخسائر تأمين (Contra-Entry)</strong> لحماية حسابات
              المحل ومنع أي عجز أو تلاعب في عهدة الكاشير وصندوق الخزينة.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batches
              .filter((b) => b.status === 'submitted' || b.status === 'open')
              .map((b) => (
                <div key={b.id} className="bg-surface p-5 rounded-xl border border-line shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-brand">{b.batchNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">بانتظار التسوية</span>
                    </div>
                    <div className="text-base font-bold text-ink mt-2">{b.companyName}</div>
                    <div className="text-xs text-ink-muted mt-1">فترة المطالبة: {b.period} | عدد الفواتير: {b.totalClaimsCount}</div>
                    <div className="text-xl font-bold text-ink mt-4">
                      {(b.totalAmountPiasters / 100).toFixed(2)} <span className="text-xs font-normal">ج.م</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-line flex justify-end">
                    <button
                      onClick={() => {
                        setSettlingBatch(b);
                        setApprovedAmountEgp((b.totalAmountPiasters / 100).toString());
                        setRejectedAmountEgp('0');
                        setRejectionReason('');
                        setShowSettleModal(true);
                      }}
                      className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      تسجيل إشعار التسوية
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Modal: Company */}
      {showCompanyModal && editingCompany && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2">
              <h3 className="font-bold text-ink text-base">
                {editingCompany.id ? 'تعديل بيانات شركة التأمين' : 'إضافة شركة تأمين جديدة'}
              </h3>
              <button onClick={() => setShowCompanyModal(false)} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">اسم شركة التأمين *</label>
                <input
                  type="text"
                  value={editingCompany.name || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  placeholder="مثال: شركة بوبا للتأمين الطبي"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={editingCompany.phone || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                  placeholder="0225550000"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">رقم التسجيل الضريبي</label>
                <input
                  type="text"
                  value={editingCompany.taxNumber || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, taxNumber: e.target.value })}
                  placeholder="123-456-789"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">العنوان / الملاحظات</label>
                <textarea
                  rows={2}
                  value={editingCompany.notes || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCompanyModal(false)}
                className="px-4 py-2 border border-line rounded-lg text-sm font-medium text-ink hover:bg-surface"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveCompany}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
              >
                حفظ الشركة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Contract */}
      {showContractModal && editingContract && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2">
              <h3 className="font-bold text-ink text-base">
                {editingContract.id ? 'تعديل عقد وفئة التأمين' : 'إضافة عقد فئة جديد'}
              </h3>
              <button onClick={() => setShowContractModal(false)} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">شركة التأمين *</label>
                <CustomSelect
                  value={editingContract.companyId || ''}
                  onChange={(val) => setEditingContract({ ...editingContract, companyId: val })}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">اسم العقد / الفئة *</label>
                <input
                  type="text"
                  value={editingContract.name || ''}
                  onChange={(e) => setEditingContract({ ...editingContract, name: e.target.value })}
                  placeholder="مثال: فئة VIP الذهب - تغطية 80%"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">نسبة تحمل المريض (%) *</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={((editingContract.patientShareBps || 0) / 100).toString()}
                    onChange={(e) => {
                      const pct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                      setEditingContract({ ...editingContract, patientShareBps: Math.round(pct * 100) });
                    }}
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand font-mono"
                  />
                  <div className="text-[11px] text-ink-muted mt-1">
                    تحمل الشركة: {100 - (editingContract.patientShareBps || 0) / 100}%
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">سقف تغطية الفاتورة (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingContract.capPerInvoicePiasters ? (editingContract.capPerInvoicePiasters / 100).toString() : ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEditingContract({
                        ...editingContract,
                        capPerInvoicePiasters: isNaN(val) ? null : Math.round(val * 100),
                      });
                    }}
                    placeholder="بدون سقف"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-surface-2 rounded-lg border border-line">
                <input
                  type="checkbox"
                  id="chkCosmetics"
                  checked={editingContract.excludesCosmetics ?? true}
                  onChange={(e) => setEditingContract({ ...editingContract, excludesCosmetics: e.target.checked })}
                  className="rounded border-line text-brand focus:ring-brand w-4 h-4"
                />
                <label htmlFor="chkCosmetics" className="text-xs font-bold text-ink cursor-pointer">
                  استثناء مستحضرات التجميل تلقائياً (تحمل المريض 100%)
                </label>
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-end gap-2">
              <button
                onClick={() => setShowContractModal(false)}
                className="px-4 py-2 border border-line rounded-lg text-sm font-medium text-ink hover:bg-surface"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveContract}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
              >
                حفظ العقد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Member */}
      {showMemberModal && editingMember && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2">
              <h3 className="font-bold text-ink text-base">تسجيل مشترك تأمين جديد</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">العقد التأميني *</label>
                <CustomSelect
                  value={editingMember.contractId || ''}
                  onChange={(val) => setEditingMember({ ...editingMember, contractId: val })}
                  options={contracts.map((c) => ({ value: c.id, label: `${c.companyName || ''} - ${c.name}` }))}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">اسم المشترك / المريض *</label>
                <input
                  type="text"
                  value={editingMember.memberName || ''}
                  onChange={(e) => setEditingMember({ ...editingMember, memberName: e.target.value })}
                  placeholder="مثال: أحمد محمد كمال"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">رقم الكارنيه / العضوية *</label>
                <input
                  type="text"
                  value={editingMember.memberNo || ''}
                  onChange={(e) => setEditingMember({ ...editingMember, memberNo: e.target.value })}
                  placeholder="مثال: CARD-100234"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">الرقم القومي</label>
                  <input
                    type="text"
                    value={editingMember.nationalId || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, nationalId: e.target.value })}
                    placeholder="14 رقم"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    value={editingMember.phone || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                    placeholder="010..."
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-end gap-2">
              <button
                onClick={() => setShowMemberModal(false)}
                className="px-4 py-2 border border-line rounded-lg text-sm font-medium text-ink hover:bg-surface"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveMember}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
              >
                حفظ المشترك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Batch */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2">
              <h3 className="font-bold text-ink text-base">إصدار دفعة مطالبة مجمعة لشركة التأمين</h3>
              <button onClick={() => setShowBatchModal(false)} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">شركة التأمين *</label>
                  <CustomSelect
                    value={newBatchCompanyId}
                    onChange={(val) => {
                      setNewBatchCompanyId(val);
                      setSelectedPendingClaimIds([]);
                    }}
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">رقم المطالبة *</label>
                  <input
                    type="text"
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">فترة المطالبة (شهر/سنة) *</label>
                  <input
                    type="month"
                    value={newBatchPeriod}
                    onChange={(e) => setNewBatchPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">ملاحظات على المطالبة (اختياري):</label>
                <input
                  type="text"
                  value={newBatchNotes}
                  onChange={(e) => setNewBatchNotes(e.target.value)}
                  placeholder="ملاحظات أو تعليمات خاصة للمطالبة..."
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              {/* Pending claims selection table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-ink">الفواتير المعلقة القابلة للإدراج:</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPendingClaimIds.length === pendingClaims.length) {
                        setSelectedPendingClaimIds([]);
                      } else {
                        setSelectedPendingClaimIds(pendingClaims.map((p) => p.id));
                      }
                    }}
                    className="text-xs text-brand font-bold hover:underline"
                  >
                    {selectedPendingClaimIds.length === pendingClaims.length ? 'إلغاء تحديد الكل' : 'تحديد جميع الفواتير'}
                  </button>
                </div>

                <div className="border border-line rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-surface-2 text-ink font-bold border-b border-line sticky top-0">
                      <tr>
                        <th className="p-2 text-center w-10">#</th>
                        <th className="p-2">رقم الفاتورة</th>
                        <th className="p-2">المريض</th>
                        <th className="p-2">رقم الكارنيه</th>
                        <th className="p-2 text-left">مبلغ المطالبة (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {pendingClaims.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-ink-muted">
                            لا توجد أي فواتير معلقة لهذه الشركة
                          </td>
                        </tr>
                      ) : (
                        pendingClaims.map((clm) => {
                          const isChecked = selectedPendingClaimIds.includes(clm.id);
                          return (
                            <tr
                              key={clm.id}
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedPendingClaimIds(selectedPendingClaimIds.filter((id) => id !== clm.id));
                                } else {
                                  setSelectedPendingClaimIds([...selectedPendingClaimIds, clm.id]);
                                }
                              }}
                              className={`cursor-pointer ${isChecked ? 'bg-brand-soft/40' : 'hover:bg-canvas'}`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded border-line text-brand focus:ring-brand"
                                />
                              </td>
                              <td className="p-2 font-mono font-bold">#{clm.invoiceNumber}</td>
                              <td className="p-2 font-medium">{clm.patientName}</td>
                              <td className="p-2 font-mono">{clm.memberNo}</td>
                              <td className="p-2 text-left font-mono font-bold text-brand">
                                {(clm.companyPiasters / 100).toFixed(2)}
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
            <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-between">
              <div className="text-xs text-ink-muted">
                المحدد: <strong className="text-ink">{selectedPendingClaimIds.length}</strong> فاتورة
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 border border-line rounded-lg text-sm font-medium text-ink hover:bg-surface"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreateBatch}
                  className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
                >
                  إصدار المطالبة الرسمية
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Settle Batch */}
      {showSettleModal && settlingBatch && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2">
              <h3 className="font-bold text-ink text-base">تسوية مطالبة شركة التأمين</h3>
              <button onClick={() => setShowSettleModal(false)} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-surface-2 rounded-xl border border-line text-xs space-y-1">
                <div>الشركة: <strong>{settlingBatch.companyName}</strong></div>
                <div>رقم الدفعة: <strong>{settlingBatch.batchNumber}</strong></div>
                <div>إجمالي المطالبة: <strong className="text-brand font-mono">{(settlingBatch.totalAmountPiasters / 100).toFixed(2)} ج.م</strong></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-paid mb-1">المبلغ المعتمد والمسدد (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={approvedAmountEgp}
                    onChange={(e) => {
                      const appVal = parseFloat(e.target.value) || 0;
                      setApprovedAmountEgp(e.target.value);
                      const totalEgp = settlingBatch.totalAmountPiasters / 100;
                      const diff = Math.max(0, totalEgp - appVal);
                      setRejectedAmountEgp(diff.toFixed(2));
                    }}
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-paid font-bold font-mono focus:outline-none focus:border-paid"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-danger mb-1">المبلغ المرفوض (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rejectedAmountEgp}
                    onChange={(e) => setRejectedAmountEgp(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-danger font-bold font-mono focus:outline-none focus:border-danger"
                  />
                </div>
              </div>

              {parseFloat(rejectedAmountEgp || '0') > 0 && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">سبب الرفض الطبي</label>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="مثال: دواء غير مطابق لبروتوكول العلاج أو نقص موافقة"
                      className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">جهة تحميل الرفض (معالجة العجز)</label>
                    <CustomSelect
                      value={deductionTarget}
                      onChange={(val) => setDeductionTarget(val as 'expense' | 'patient_debt')}
                      options={[
                        { value: 'expense', label: 'قيد مصروفات وخسائر تأمين (يوثق تلقائياً)' },
                        { value: 'patient_debt', label: 'مديونية مؤجلة على حساب المريض' },
                      ]}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSettleModal(false)}
                className="px-4 py-2 border border-line rounded-lg text-sm font-medium text-ink hover:bg-surface"
              >
                إلغاء
              </button>
              <button
                onClick={handleSettleBatch}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
              >
                اعتماد التسوية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
