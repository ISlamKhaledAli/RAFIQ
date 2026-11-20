import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Building2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Download,
  ShieldAlert,
  X,
  Phone,
  Mail,
  MapPin,
  Hash,
  Pencil,
  FileSpreadsheet,
  FolderOpen,
  Landmark,
  Smartphone,
  FolderTree,
  Package,
  Trash2
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useAuth } from '../../context/useAuth';
import { useDataSubscription } from '../../utils/eventBus';
import { AppButton } from '../../components/AppButton';
import { SearchInput } from '../../components/SearchInput';
import { CustomSelect } from '../../components/CustomSelect';
import { PaginationBar } from '../../components/PaginationBar';
import { DateFilterControl } from '../../components/DateFilterControl';
import { ClearFiltersButton } from '../../components/ClearFiltersButton';
import {
  useDateFilter,
  useToday,
  matchesDateFilter,
  isDateFilterActive,
  describeDateFilter,
  getDateFilterKey,
  parseDateToLocalDateStr,
  toLocalDateString,
} from '../../utils/dateFilter';
import { formatArabicCurrency } from '../../utils/money';
import { RequiredMark } from '../../components/RequiredMark';
import { formatPhoneDisplay } from '../../utils/phoneFormat';
import { useMotionPanel } from '../../hooks/useMotionPanel';
import type {
  InsuranceCompany,
  InsuranceContract,
  InsuranceMember,
  InsuranceClaimBatch,
  InsuranceClaimLine,
  InsuranceExclusion
} from '../../types/insurance';
import type { DigitalAccount, Category } from '../../types/models';

interface CompanyIdentityRow {
  key: string;
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  ltr: boolean;
}

// Only the identifying fields the company record actually has, each as a labelled row
const companyIdentityRows = (comp: InsuranceCompany): CompanyIdentityRow[] => {
  const rows: CompanyIdentityRow[] = [];
  const phone = (comp.phone ?? '').trim();
  const email = (comp.email ?? '').trim();
  const taxNumber = (comp.taxNumber ?? '').trim();
  const address = (comp.address ?? '').trim();
  if (phone) rows.push({ key: 'phone', label: 'رقم الهاتف', value: phone, Icon: Phone, ltr: true });
  if (email) rows.push({ key: 'email', label: 'البريد الإلكتروني', value: email, Icon: Mail, ltr: true });
  if (taxNumber) rows.push({ key: 'tax', label: 'البطاقة الضريبية', value: taxNumber, Icon: Hash, ltr: true });
  if (address) rows.push({ key: 'address', label: 'العنوان', value: address, Icon: MapPin, ltr: false });
  return rows;
};

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
  const motionPanel = useMotionPanel(activeTab);
  const [_loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null);

  // Data states
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [contracts, setContracts] = useState<InsuranceContract[]>([]);
  const [members, setMembers] = useState<InsuranceMember[]>([]);
  const [batches, setBatches] = useState<InsuranceClaimBatch[]>([]);
  const [pendingClaims, setPendingClaims] = useState<InsuranceClaimLine[]>([]);

  // Selection & Filters
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');

  // Pagination states
  const [membersPage, setMembersPage] = useState<number>(1);
  const [membersPageSize, setMembersPageSize] = useState<number>(25);
  const [batchesPage, setBatchesPage] = useState<number>(1);
  const [batchesPageSize, setBatchesPageSize] = useState<number>(25);

  // Date filters: issued batches list and the pending-claims picker of the new-batch modal
  const { dateFilter: batchesDateFilter, setDateFilter: setBatchesDateFilter, resetDateFilter: resetBatchesDateFilter } = useDateFilter();
  const { dateFilter: claimsDateFilter, setDateFilter: setClaimsDateFilter, resetDateFilter: resetClaimsDateFilter } = useDateFilter();
  // يعيد الرسم عند منتصف الليل فتُعاد قراءة الفترات النسبية (اليوم/أمس/آخر 7 أيام)
  useToday();

  // Modals
  const [showCompanyModal, setShowCompanyModal] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<Partial<InsuranceCompany> | null>(null);

  const [showContractModal, setShowContractModal] = useState<boolean>(false);
  const [editingContract, setEditingContract] = useState<Partial<InsuranceContract> | null>(null);

  // Contract Exclusions Editor State
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [exclusionSubTab, setExclusionSubTab] = useState<'categories' | 'products'>('categories');
  const [selectedCategoryIdToAdd, setSelectedCategoryIdToAdd] = useState<string>('');
  const [productSearchTerm, setProductSearchTerm] = useState<string>('');
  const [productSearchResults, setProductSearchResults] = useState<Array<{ id: string; name: string; barcode?: string; pricePiasters?: number }>>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState<boolean>(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const [showMemberModal, setShowMemberModal] = useState<boolean>(false);
  const [editingMember, setEditingMember] = useState<Partial<InsuranceMember> | null>(null);

  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [newBatchCompanyId, setNewBatchCompanyId] = useState<string>('');
  const [newBatchNumber, setNewBatchNumber] = useState<string>('');
  const [newBatchPeriod, setNewBatchPeriod] = useState<string>(toLocalDateString(new Date()).substring(0, 7));
  const [newBatchNotes, setNewBatchNotes] = useState<string>('');
  const [selectedPendingClaimIds, setSelectedPendingClaimIds] = useState<string[]>([]);

  const [showSettleModal, setShowSettleModal] = useState<boolean>(false);
  const [settlingBatch, setSettlingBatch] = useState<InsuranceClaimBatch | null>(null);
  const [approvedAmountEgp, setApprovedAmountEgp] = useState<string>('');
  const [rejectedAmountEgp, setRejectedAmountEgp] = useState<string>('0');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [deductionTarget, setDeductionTarget] = useState<'expense' | 'patient_debt'>('expense');
  const [receiptTarget, setReceiptTarget] = useState<'none' | 'drawer' | 'digital_account'>('drawer');
  const [receiptAccountId, setReceiptAccountId] = useState<string>('');
  const [digitalAccounts, setDigitalAccounts] = useState<DigitalAccount[]>([]);
  const [showQuickAccountModal, setShowQuickAccountModal] = useState<boolean>(false);
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [newAccountProvider, setNewAccountProvider] = useState<string>('vodafone_cash');
  const [newAccountNumber, setNewAccountNumber] = useState<string>('');
  const [newAccountHolder, setNewAccountHolder] = useState<string>('');
  const [savingNewAccount, setSavingNewAccount] = useState<boolean>(false);
  const [quickAccountError, setQuickAccountError] = useState<string | null>(null);

  const fetchDigitalAccounts = useCallback(async () => {
    try {
      const accs = await invoke<DigitalAccount[]>('wallets:getAccounts', { includeInactive: false });
      if (Array.isArray(accs)) {
        setDigitalAccounts(accs);
        return accs;
      }
    } catch {
      // Non-blocking
    }
    return [];
  }, []);

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compsRes, cntsRes, batchesRes, catsRes] = await Promise.all([
        invoke<InsuranceCompany[]>('insurance:getCompanies', { includeInactive: false }),
        invoke<InsuranceContract[]>('insurance:getContracts', { includeInactive: false }),
        invoke<InsuranceClaimBatch[]>('insurance:getBatches', {}),
        invoke<Category[]>('categories:getAll', { includeArchived: false }).catch(() => []),
        fetchDigitalAccounts(),
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
      if (Array.isArray(catsRes)) {
        setAvailableCategories(catsRes);
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
  }, [activeTab, selectedContractId, memberSearchQuery, newBatchCompanyId, showBatchModal, fetchDigitalAccounts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useDataSubscription(['insurance', 'all'], () => {
    void loadData();
  });

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

  useEffect(() => {
    setMembersPage(1);
  }, [selectedContractId, memberSearchQuery]);

  const paginatedMembers = useMemo(() => {
    const start = (membersPage - 1) * membersPageSize;
    return members.slice(start, start + membersPageSize);
  }, [members, membersPage, membersPageSize]);

  // الدفعات والفواتير المعلقة تُحمَّل كاملة (بلا حد)، لذا الفلترة بالتاريخ هنا آمنة
  // تُحسب عند كل رسم (قوائم صغيرة) كي تُعاد قراءة تاريخ اليوم بعد منتصف الليل (useToday)
  const filteredBatches = batches.filter((b) => matchesDateFilter(b.createdAt, batchesDateFilter));
  const filteredPendingClaims = pendingClaims.filter((c) => matchesDateFilter(c.createdAt, claimsDateFilter));

  const batchesFilterKey = getDateFilterKey(batchesDateFilter);
  useEffect(() => {
    setBatchesPage(1);
  }, [batchesFilterKey]);

  const claimsFilterKey = getDateFilterKey(claimsDateFilter);
  useEffect(() => {
    setSelectedPendingClaimIds([]);
  }, [claimsFilterKey]);

  const paginatedBatches = filteredBatches.slice((batchesPage - 1) * batchesPageSize, batchesPage * batchesPageSize);

  // Company save
  const handleSaveCompany = async () => {
    if (!editingCompany || !editingCompany.name?.trim()) {
      setModalError('يرجى إدخال اسم شركة التأمين');
      return;
    }
    setLoading(true);
    setModalError(null);
    try {
      await invoke('insurance:saveCompany', editingCompany);
      setSuccessMsg('تم حفظ شركة التأمين');
      setShowCompanyModal(false);
      setEditingCompany(null);
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  // Contract save
  const handleSaveContract = async () => {
    if (!editingContract || !editingContract.name?.trim() || !editingContract.companyId) {
      setModalError('يرجى اختيار شركة التأمين وإدخال اسم العقد');
      return;
    }
    setLoading(true);
    setModalError(null);
    try {
      const exclusions = editingContract.exclusions || [];
      const hasCosmeticsExcluded = exclusions.some((e) => {
        if (!e.categoryId) return false;
        const cat = availableCategories.find((c) => c.id === e.categoryId);
        return cat && (cat.name.includes('تجميل') || cat.name.toLowerCase().includes('cosmetic'));
      });
      const contractToSave = {
        ...editingContract,
        exclusions,
        excludesCosmetics: Boolean(editingContract.excludesCosmetics || hasCosmeticsExcluded),
      };
      await invoke('insurance:saveContract', contractToSave);
      setSuccessMsg('تم حفظ عقد التأمين بنجاح');
      closeContractModal();
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  const handleProductSearchChange = (val: string) => {
    setProductSearchTerm(val);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    const trimmed = val.trim();
    if (!trimmed) {
      setProductSearchResults([]);
      setIsSearchingProduct(false);
      return;
    }
    setIsSearchingProduct(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await invoke<{ products?: Array<{ id: string; name: string; barcode?: string; pricePiasters?: number }> } | Array<{ id: string; name: string; barcode?: string; pricePiasters?: number }>>('products:search', {
          query: trimmed,
          limit: 8,
        });
        const prods = Array.isArray(res) ? res : res?.products || [];
        setProductSearchResults(prods);
      } catch {
        setProductSearchResults([]);
      } finally {
        setIsSearchingProduct(false);
      }
    }, 250);
  };

  const handleAddCategoryExclusion = (catId: string) => {
    if (!editingContract || !catId) return;
    const current = editingContract.exclusions || [];
    if (current.some((e) => e.categoryId === catId)) return;
    const targetCat = availableCategories.find((c) => c.id === catId);
    const newExcl: InsuranceExclusion = {
      categoryId: catId,
      categoryName: targetCat?.name || 'تصنيف',
      productId: null,
      productName: null,
    };
    setEditingContract({
      ...editingContract,
      exclusions: [...current, newExcl],
    });
    setSelectedCategoryIdToAdd('');
  };

  const handleAddProductExclusion = (prod: { id: string; name: string; barcode?: string; pricePiasters?: number }) => {
    if (!editingContract || !prod) return;
    const current = editingContract.exclusions || [];
    if (current.some((e) => e.productId === prod.id)) return;
    const newExcl: InsuranceExclusion = {
      productId: prod.id,
      productName: prod.name,
      productBarcode: prod.barcode || null,
      productPricePiasters: prod.pricePiasters || null,
      categoryId: null,
      categoryName: null,
    };
    setEditingContract({
      ...editingContract,
      exclusions: [...current, newExcl],
    });
    setProductSearchTerm('');
    setProductSearchResults([]);
  };

  const handleRemoveExclusion = (index: number) => {
    if (!editingContract) return;
    const current = editingContract.exclusions || [];
    setEditingContract({
      ...editingContract,
      exclusions: current.filter((_, idx) => idx !== index),
    });
  };

  const openNewContractModal = (companyId: string) => {
    setEditingContract({
      companyId,
      patientShareBps: 2000,
      excludesCosmetics: false,
      isActive: true,
      exclusions: [],
    });
    setSelectedCategoryIdToAdd('');
    setProductSearchTerm('');
    setProductSearchResults([]);
    setExclusionSubTab('categories');
    setModalError(null);
    setShowContractModal(true);
  };

  const openEditContractModal = (cnt: InsuranceContract) => {
    setEditingContract({
      ...cnt,
      exclusions: Array.isArray(cnt.exclusions) ? [...cnt.exclusions] : [],
    });
    setSelectedCategoryIdToAdd('');
    setProductSearchTerm('');
    setProductSearchResults([]);
    setExclusionSubTab('categories');
    setModalError(null);
    setShowContractModal(true);
  };

  const closeContractModal = () => {
    setShowContractModal(false);
    setEditingContract(null);
    setModalError(null);
    setSelectedCategoryIdToAdd('');
    setProductSearchTerm('');
    setProductSearchResults([]);
    setExclusionSubTab('categories');
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  // Member save
  const handleSaveMember = async () => {
    if (!editingMember || !editingMember.memberName?.trim() || !editingMember.memberNo?.trim() || !editingMember.contractId) {
      setModalError('يرجى استيفاء اسم المشترك، رقم الكارنيه، واختيار العقد');
      return;
    }
    setLoading(true);
    setModalError(null);
    try {
      await invoke('insurance:saveMember', editingMember);
      setSuccessMsg('تم تسجيل المشترك');
      setShowMemberModal(false);
      setEditingMember(null);
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  // Create Batch
  const handleCreateBatch = async () => {
    if (!newBatchCompanyId || !newBatchNumber.trim() || !newBatchPeriod) {
      setModalError('يرجى اختيار الشركة وإدخال رقم المطالبة والشهر');
      return;
    }
    if (selectedPendingClaimIds.length === 0) {
      setModalError('يرجى تحديد فاتورة واحدة على الأقل لإدراجها في المطالبة');
      return;
    }
    setLoading(true);
    setModalError(null);
    try {
      await invoke('insurance:createBatch', {
        companyId: newBatchCompanyId,
        batchNumber: newBatchNumber.trim(),
        periodMonth: newBatchPeriod,
        notes: newBatchNotes,
        claimLineIds: selectedPendingClaimIds,
      });
      setSuccessMsg('تم إصدار دفعة المطالبة الشهرية');
      setShowBatchModal(false);
      setSelectedPendingClaimIds([]);
      setNewBatchNumber('');
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'حدث خطأ أثناء إصدار المطالبة');
    } finally {
      setLoading(false);
    }
  };

  // Open Settle Modal with Pre-fill
  const handleOpenSettleModal = async (batch: InsuranceClaimBatch) => {
    setSettlingBatch(batch);
    const isAlreadySettled = (batch.settledAmountPiasters > 0 || batch.rejectedAmountPiasters > 0 || batch.status === 'settled' || batch.status === 'partially_settled');
    setApprovedAmountEgp(isAlreadySettled ? (batch.settledAmountPiasters / 100).toString() : (batch.totalAmountPiasters / 100).toString());
    setRejectedAmountEgp(isAlreadySettled ? (batch.rejectedAmountPiasters / 100).toString() : '0');
    setRejectionReason(batch.rejectionReason || '');
    if (batch.settlementDeductionTarget) {
      setDeductionTarget(batch.settlementDeductionTarget);
    } else {
      setDeductionTarget('expense');
    }
    setReceiptTarget(batch.settlementReceiptTarget || 'drawer');
    setReceiptAccountId(batch.settlementReceiptAccountId || '');
    setModalError(null);
    setShowSettleModal(true);

    const accs = await fetchDigitalAccounts();
    if ((!batch.settlementReceiptAccountId || batch.settlementReceiptAccountId === '') && accs && accs.length > 0) {
      const def = accs.find(a => a.isDefault) || accs[0];
      setReceiptAccountId(def.id);
    }
  };

  // Settle Batch
  const handleSettleBatch = async () => {
    if (!settlingBatch) return;
    const appAmt = Math.round(parseFloat(approvedAmountEgp || '0') * 100);
    const rejAmt = Math.round(parseFloat(rejectedAmountEgp || '0') * 100);

    if (appAmt < 0 || rejAmt < 0) {
      setModalError('المبالغ المدخلة لا يمكن أن تكون سالبة');
      return;
    }
    if (appAmt + rejAmt !== settlingBatch.totalAmountPiasters) {
      setModalError(`مجموع المعتمد والمرفوض (${((appAmt + rejAmt) / 100).toFixed(2)} ج.م) يجب أن يطابق إجمالي المطالبة (${(settlingBatch.totalAmountPiasters / 100).toFixed(2)} ج.م)`);
      return;
    }

    if (appAmt > 0 && receiptTarget === 'digital_account' && !receiptAccountId) {
      setModalError('يرجى اختيار الحساب الرقمي أو المحفظة التي تم استلام المبلغ عليها.');
      return;
    }

    const isEdit = settlingBatch.status === 'settled' || settlingBatch.status === 'partially_settled';
    setLoading(true);
    setModalError(null);
    try {
      await invoke('insurance:settleBatch', {
        batchId: settlingBatch.id,
        approvedAmountPiasters: appAmt,
        rejectedAmountPiasters: rejAmt,
        rejectionReason: rejAmt > 0 ? rejectionReason : undefined,
        deductionTarget: deductionTarget,
        receiptTarget: receiptTarget,
        receiptAccountId: receiptTarget === 'digital_account' ? receiptAccountId : null,
      });
      setSuccessMsg(isEdit ? 'تم تحديث تسوية المطالبة وتوريد المبالغ بنجاح' : 'تمت تسوية المطالبة وتوريد المبالغ بنجاح');
      setShowSettleModal(false);
      setSettlingBatch(null);
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'حدث خطأ أثناء التسوية');
    } finally {
      setLoading(false);
    }
  };

  // Export Excel
  const handleExportExcel = async (batch: InsuranceClaimBatch) => {
    try {
      const sanitizedBatchNum = (batch.batchNumber || batch.id).replace(/[/\\?%*:|"<>]/g, '-');
      const defaultFileName = `مطالبة_تأمين_${sanitizedBatchNum}_${batch.period || ''}.xlsx`;

      const dialogRes = await invoke<{ filePath?: string; cancelled: boolean }>('system:showSaveFileDialog', {
        title: `تحديد مكان حفظ ملف مطالبة التأمين (${batch.batchNumber})`,
        defaultFileName,
        filter: 'ملفات إكسل (*.xlsx)|*.xlsx|جميع الملفات (*.*)|*.*',
        defaultExt: 'xlsx'
      });

      if (dialogRes?.cancelled || !dialogRes?.filePath) {
        return; // إلغاء صريح من المستخدم
      }

      setLoading(true);
      const res = await invoke<{ path: string }>('insurance:exportBatchExcel', {
        batchId: batch.id,
        filePath: dialogRes.filePath
      });

      if (res && res.path) {
        setExportedFilePath(res.path);
        setSuccessMsg(`تم تصدير ملف الإكسل بنجاح إلى: ${res.path}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تصدير الإكسل');
    } finally {
      setLoading(false);
    }
  };

  const renderModalError = () => {
    if (!modalError) return null;
    return (
      <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs rounded-xl flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{modalError}</span>
        </div>
        <button
          type="button"
          onClick={() => setModalError(null)}
          className="text-danger dark:text-danger-bright hover:opacity-75 transition-opacity"
          aria-label="إغلاق التنبيه"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div {...motionPanel} className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark overflow-hidden">
      {/* Top Header */}
      <div className="motion-static bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand dark:text-brand-bright" />
            <h1 className="t-page-title text-ink dark:text-ink-dark">منظومة التأمين الطبي والتعاقدات ومطالبات الشركات</h1>
          </div>
          <p className="text-sm text-ink-muted dark:text-ink-dark-muted mt-1">
            إدارة العقود ونسب التحمل ومطالبات الشركات والفوترة الشهرية وتسوية الرفوضات الطبية
          </p>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="motion-static grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 pb-2">
        <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark shadow-sm">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted text-xs">
            <span>شركات التأمين المتعاقدة</span>
            <Building2 className="w-4 h-4 text-brand" />
          </div>
          <div className="text-2xl font-bold text-ink dark:text-ink-dark mt-2">{companies.length}</div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">شركة معتمدة بالدليل</div>
        </div>

        <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark shadow-sm">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted text-xs">
            <span>عقود وفئات التغطية</span>
            <FileText className="w-4 h-4 text-paid dark:text-paid-bright" />
          </div>
          <div className="text-2xl font-bold text-ink dark:text-ink-dark mt-2">{contracts.length}</div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">عقد تأميني ساري</div>
        </div>

        <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark shadow-sm">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted text-xs">
            <span>فواتير معلقة للشركات</span>
            <AlertCircle className="w-4 h-4 text-warn dark:text-warn-bright" />
          </div>
          <div className="text-2xl font-bold text-warn dark:text-warn-bright mt-2">{totalPendingCount}</div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">فاتورة بانتظار التجميع بمطالبة</div>
        </div>

        <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark shadow-sm">
          <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted text-xs">
            <span>مستحقات التأمين المعلقة</span>
            <CheckCircle2 className="w-4 h-4 text-brand dark:text-brand-bright" />
          </div>
          <div className="text-2xl font-bold text-brand dark:text-brand-bright mt-2">
            {(totalPendingClaimsPiasters / 100).toFixed(2)} <span className="text-sm font-normal">ج.م</span>
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">مبالغ مستحقة لدى الشركات</div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-2 p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright text-sm rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <AppButton variant="subtle" size="xs" icon={X} aria-label="إغلاق" onClick={() => setError(null)} />
        </div>
      )}

      {successMsg && (
        <div className="mx-6 mt-2 p-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 text-paid dark:text-paid-bright text-sm rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
            <span className="truncate">{successMsg}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {exportedFilePath && (
              <>
                <AppButton
                  variant="secondary"
                  size="xs"
                  icon={FileSpreadsheet}
                  onClick={async () => {
                    try {
                      await invoke('system:openPath', { path: exportedFilePath });
                    } catch {
                      // Handled quietly
                    }
                  }}
                >
                  فتح الملف
                </AppButton>
                <AppButton
                  variant="secondary"
                  size="xs"
                  icon={FolderOpen}
                  onClick={async () => {
                    try {
                      await invoke('system:showInFolder', { path: exportedFilePath });
                    } catch {
                      // Handled quietly
                    }
                  }}
                >
                  عرض في المجلد
                </AppButton>
              </>
            )}
            <AppButton
              variant="subtle"
              size="xs"
              icon={X}
              aria-label="إغلاق"
              onClick={() => {
                setSuccessMsg(null);
                setExportedFilePath(null);
              }}
            />
          </div>
        </div>
      )}



      {/* Tab 1: Companies & Contracts */}
      {activeTab === 'companies' && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="t-section-title text-ink dark:text-ink-dark">دليل شركات التأمين الطبي المتعاقدة</h2>
            {canManageContracts && (
              <AppButton
                variant="primary"
                size="md"
                icon={Plus}
                onClick={() => {
                  setEditingCompany({ isActive: true });
                  setShowCompanyModal(true);
                }}
              >
                إضافة شركة تأمين
              </AppButton>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {companies.map((comp) => {
              const compContracts = contracts.filter((c) => c.companyId === comp.id);
              const identityRows = companyIdentityRows(comp);
              return (
                <div key={comp.id} className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-sm overflow-hidden flex flex-col justify-between">
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="t-card-title text-ink dark:text-ink-dark">{comp.name}</h3>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright">
                        نشط
                      </span>
                    </div>

                    {identityRows.length > 0 && (
                      <div className="mt-3 rounded-xl border border-line dark:border-line-dark px-3 py-2 flex flex-col gap-1.5 min-w-0" data-testid="company-identity">
                        {identityRows.map((row) => (
                          <div key={row.key} className="flex items-center justify-between gap-3 min-w-0" data-testid={`company-${row.key}-row`}>
                            <span className="shrink-0 flex items-center gap-1.5 text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
                              <row.Icon className="w-3.5 h-3.5" />
                              <span>{row.label}</span>
                            </span>
                            <span
                              dir={row.ltr ? 'ltr' : undefined}
                              className={`min-w-0 text-sm font-bold text-ink dark:text-ink-dark leading-snug ${row.ltr ? 'text-left font-mono tabular-nums break-all' : 'break-words'}`}
                              title={row.value}
                            >
                              {row.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 text-xs text-ink-muted dark:text-ink-dark-muted">
                      <div className="flex items-center gap-1.5 text-brand dark:text-brand-bright font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>مطالبات معلقة: {((comp.pendingClaimsPiasters || 0) / 100).toFixed(2)} ج.م</span>
                      </div>
                    </div>

                    {/* Contracts list inside company card */}
                    <div className="mt-4 pt-3 border-t border-line/60 dark:border-line-dark">
                      <div className="text-xs font-bold text-ink dark:text-ink-dark mb-2">الفئات والعقود:</div>
                      {compContracts.length === 0 ? (
                        <div className="text-xs text-ink-muted dark:text-ink-dark-muted italic">لا توجد عقود مسجلة لهذه الشركة بعد</div>
                      ) : (
                        <div className="space-y-1.5">
                          {compContracts.map((cnt) => (
                            <div key={cnt.id} className="p-2 bg-surface-2 dark:bg-surface-dark-2 rounded-lg text-xs flex items-center justify-between gap-2">
                              <div>
                                <span className="font-medium text-ink dark:text-ink-dark">{cnt.name}</span>
                                <div className="text-micro text-ink-muted dark:text-ink-dark-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span>تحمل المريض: {(cnt.patientShareBps / 100).toFixed(0)}%</span>
                                  {cnt.capPerInvoicePiasters ? <span>| سقف: {(cnt.capPerInvoicePiasters / 100).toFixed(0)} ج.م</span> : null}
                                  {cnt.exclusions && cnt.exclusions.length > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-soft/80 dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold">
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>
                                        استثناءات: {cnt.exclusions.filter((e) => e.categoryId).length > 0 ? `${cnt.exclusions.filter((e) => e.categoryId).length} فئة` : ''}
                                        {cnt.exclusions.filter((e) => e.categoryId).length > 0 && cnt.exclusions.filter((e) => e.productId).length > 0 ? ' و ' : ''}
                                        {cnt.exclusions.filter((e) => e.productId).length > 0 ? `${cnt.exclusions.filter((e) => e.productId).length} صنف` : ''}
                                      </span>
                                    </span>
                                  ) : cnt.excludesCosmetics ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-soft/80 dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold">
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>يستثني التجميل</span>
                                    </span>
                                  ) : (
                                    <span className="text-paid dark:text-paid-bright font-medium">| تغطية شاملة</span>
                                  )}
                                </div>
                              </div>
                              {canManageContracts && (
                                <AppButton
                                  variant="secondary"
                                  size="xs"
                                  icon={Pencil}
                                  className="shrink-0"
                                  onClick={() => openEditContractModal(cnt)}
                                >
                                  تعديل
                                </AppButton>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-surface-2 dark:bg-surface-dark-2 px-5 py-3 border-t border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-2">
                    {canManageContracts && (
                      <AppButton
                        variant="soft"
                        size="sm"
                        icon={Plus}
                        onClick={() => openNewContractModal(comp.id)}
                      >
                        إضافة عقد فئة جديدة
                      </AppButton>
                    )}
                    {canManageContracts && (
                      <AppButton
                        variant="secondary"
                        size="sm"
                        icon={Pencil}
                        onClick={() => {
                          setEditingCompany(comp);
                          setShowCompanyModal(true);
                        }}
                      >
                        تعديل الشركة
                      </AppButton>
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
            <div className="flex items-center gap-x-8 gap-y-3 w-full sm:w-auto">
              <SearchInput
                size="md"
                value={memberSearchQuery}
                onChange={setMemberSearchQuery}
                placeholder="بحث برقم الكارنيه أو اسم المريض..."
                ariaLabel="بحث في المشتركين"
                className="w-full sm:w-96"
              />

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

            <AppButton
              variant="primary"
              size="md"
              icon={Plus}
              className="shrink-0"
              onClick={() => {
                setEditingMember({ contractId: contracts[0]?.id || '', isActive: true });
                setShowMemberModal(true);
              }}
            >
              تسجيل مشترك جديد
            </AppButton>
          </div>

          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-sm overflow-hidden">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold border-b border-line dark:border-line-dark">
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
              <tbody className="divide-y divide-line/60 dark:divide-line-dark">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-muted dark:text-ink-dark-muted">
                      لا يوجد مشتركون مسجلون وفق معايير البحث الحالية
                    </td>
                  </tr>
                ) : (
                  paginatedMembers.map((mem) => (
                    <tr key={mem.id} className="hover:bg-canvas/50 dark:hover:bg-surface-dark-2/50">
                      <td className="py-3 px-4 font-mono font-bold text-brand dark:text-brand-bright">{mem.memberNo}</td>
                      <td className="py-3 px-4 font-medium text-ink dark:text-ink-dark">{mem.memberName}</td>
                      <td className="py-3 px-4 text-xs text-ink-muted dark:text-ink-dark-muted">
                        <div>{mem.companyName}</div>
                        <div className="text-ink dark:text-ink-dark font-medium">{mem.contractName}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-ink-muted dark:text-ink-dark-muted">{mem.nationalId || '-'}</td>
                      <td className="py-3 px-4 text-xs text-ink dark:text-ink-dark">{formatPhoneDisplay(mem.phone) || '-'}</td>
                      <td className="py-3 px-4 text-xs text-ink dark:text-ink-dark">{mem.validTo || 'غير محدد'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${mem.isActive ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid' : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright'}`}>
                          {mem.isActive ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <PaginationBar
              currentPage={membersPage}
              pageSize={membersPageSize}
              totalCount={members.length}
              onPageChange={setMembersPage}
              onPageSizeChange={(newSize) => {
                setMembersPageSize(newSize);
                setMembersPage(1);
              }}
              pageSizeOptions={[25, 50, 100]}
              itemLabel="مشترك"
              className="rounded-none border-x-0 border-b-0 border-t"
            />
          </div>
        </div>
      )}

      {/* Tab 3: Monthly Batches */}
      {activeTab === 'batches' && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="t-section-title text-ink dark:text-ink-dark">دليل المطالبات الشهرية المجمعة للشركات</h2>
            {canManageClaims && (
              <AppButton
                variant="primary"
                size="md"
                icon={Plus}
                onClick={() => {
                  setError(null);
                  setModalError(null);
                  setNewBatchCompanyId(companies[0]?.id || '');
                  setNewBatchNumber(`CLM-${toLocalDateString(new Date()).substring(0, 7)}-${Math.floor(Math.random() * 900 + 100)}`);
                  resetClaimsDateFilter();
                  setSelectedPendingClaimIds([]);
                  setShowBatchModal(true);
                }}
              >
                إصدار دفعة مطالبة مجمعة
              </AppButton>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">تاريخ إصدار الدفعة:</span>
            <DateFilterControl value={batchesDateFilter} onChange={setBatchesDateFilter} size="sm" />
            <ClearFiltersButton
              active={isDateFilterActive(batchesDateFilter)}
              onClick={resetBatchesDateFilter}
              label="إلغاء الفلترة"
            />
          </div>

          <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-sm overflow-hidden">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold border-b border-line dark:border-line-dark">
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
              <tbody className="divide-y divide-line/60 dark:divide-line-dark">
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-ink-muted dark:text-ink-dark-muted">
                      {batches.length === 0 ? (
                        'لم يتم إنشاء أي مطالبات مجمعة حتى الآن'
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <span>لا توجد مطالبات مجمعة صادرة في الفترة ({describeDateFilter(batchesDateFilter)})</span>
                          <AppButton variant="secondary" size="sm" onClick={resetBatchesDateFilter}>
                            عرض كل المطالبات
                          </AppButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-canvas/50 dark:hover:bg-surface-dark-2/50">
                      <td className="py-3 px-4 font-mono font-bold text-ink dark:text-ink-dark">
                        <div>{batch.batchNumber}</div>
                        <div className="text-micro font-normal text-ink-muted dark:text-ink-dark-muted">{parseDateToLocalDateStr(batch.createdAt) || ''}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-ink dark:text-ink-dark">{batch.companyName}</td>
                      <td className="py-3 px-4 text-xs font-mono text-ink-muted dark:text-ink-dark-muted">{batch.period}</td>
                      <td className="py-3 px-4 text-center font-bold">{batch.totalClaimsCount}</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-brand dark:text-brand-bright">
                        {(batch.totalAmountPiasters / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono text-paid dark:text-paid-bright">
                        {(batch.settledAmountPiasters / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono text-danger dark:text-danger-bright">
                        {(batch.rejectedAmountPiasters / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                            batch.status === 'settled'
                              ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid'
                              : batch.status === 'partially_settled'
                              ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright'
                              : batch.status === 'submitted'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark'
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
                          <AppButton
                            variant="subtle"
                            size="xs"
                            icon={Download}
                            aria-label="تصدير كشف إكسل رسمي"
                            title="تصدير كشف إكسل وتحديد مكان الحفظ"
                            onClick={() => handleExportExcel(batch)}
                          />
                          {canSettleClaims && (
                            <AppButton
                              variant={batch.status === 'settled' || batch.status === 'partially_settled' ? 'secondary' : 'primary'}
                              size="xs"
                              icon={batch.status === 'settled' || batch.status === 'partially_settled' ? Pencil : undefined}
                              title={batch.status === 'settled' || batch.status === 'partially_settled' ? 'تعديل بيانات التسوية' : 'تسجيل تسوية المطالبة'}
                              onClick={() => handleOpenSettleModal(batch)}
                            >
                              {batch.status === 'settled' || batch.status === 'partially_settled' ? 'تعديل التسوية' : 'تسوية'}
                            </AppButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <PaginationBar
              currentPage={batchesPage}
              pageSize={batchesPageSize}
              totalCount={filteredBatches.length}
              onPageChange={setBatchesPage}
              onPageSizeChange={(newSize) => {
                setBatchesPageSize(newSize);
                setBatchesPage(1);
              }}
              pageSizeOptions={[25, 50, 100]}
              itemLabel="دفعة مطالبة"
              className="rounded-none border-x-0 border-b-0 border-t"
            />
          </div>
        </div>
      )}

      {/* Tab 4: Settlements */}
      {activeTab === 'settlement' && (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="bg-surface dark:bg-surface-dark p-5 rounded-xl border border-line dark:border-line-dark shadow-sm">
            <h3 className="t-card-title text-ink dark:text-ink-dark mb-2">قواعد وضوابط تسوية الرفوضات الطبية</h3>
            <p className="text-sm text-ink-muted dark:text-ink-dark-muted leading-relaxed">
              وفق المعايير المالية المحاسبية لنقاط البيع، عند استلام إشعار سداد مطالبة شركة التأمين متضمناً خصومات أو
              رفوضات لأدوية غير مطابقة للبروتوكول:
              يتم ترحيل المرفوضات تلقائياً كـ <strong>قيد مصروفات وخسائر تأمين</strong> لحماية حسابات
              المحل ومنع أي عجز أو تلاعب في عهدة الكاشير وصندوق الخزينة.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batches
              .filter((b) => b.status === 'submitted' || b.status === 'open')
              .map((b) => (
                <div key={b.id} className="bg-surface dark:bg-surface-dark p-5 rounded-xl border border-line dark:border-line-dark shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-brand">{b.batchNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">بانتظار التسوية</span>
                    </div>
                    <div className="text-base font-bold text-ink dark:text-ink-dark mt-2">{b.companyName}</div>
                    <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">فترة المطالبة: {b.period} | عدد الفواتير: {b.totalClaimsCount}</div>
                    <div className="text-xl font-bold text-ink dark:text-ink-dark mt-4">
                      {(b.totalAmountPiasters / 100).toFixed(2)} <span className="text-xs font-normal">ج.م</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-line dark:border-line-dark flex justify-end">
                    <AppButton
                      variant="primary"
                      size="md"
                      onClick={() => handleOpenSettleModal(b)}
                    >
                      تسجيل إشعار التسوية
                    </AppButton>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Modal: Company */}
      {showCompanyModal && editingCompany && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 text-ink dark:text-ink-dark">
            <div className="px-6 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark">
                {editingCompany.id ? 'تعديل بيانات شركة التأمين' : 'إضافة شركة تأمين جديدة'}
              </h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => setShowCompanyModal(false)} />
            </div>
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {renderModalError()}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">اسم شركة التأمين <RequiredMark /></label>
                <input
                  type="text"
                  value={editingCompany.name || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  placeholder="مثال: شركة بوبا للتأمين الطبي"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    value={editingCompany.phone || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                    placeholder="0225550000"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">رقم التسجيل الضريبي</label>
                  <input
                    type="text"
                    value={editingCompany.taxNumber || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, taxNumber: e.target.value })}
                    placeholder="123-456-789"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">العنوان / الملاحظات</label>
                <textarea
                  rows={2}
                  value={editingCompany.notes || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="md" onClick={() => { setShowCompanyModal(false); setModalError(null); }}>
                إلغاء
              </AppButton>
              <AppButton variant="primary" size="md" onClick={handleSaveCompany}>
                حفظ الشركة
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Contract */}
      {showContractModal && editingContract && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 text-ink dark:text-ink-dark">
            <div className="px-6 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark">
                {editingContract.id ? 'تعديل عقد وفئة التأمين' : 'إضافة عقد فئة جديد'}
              </h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={closeContractModal} />
            </div>
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {renderModalError()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">شركة التأمين</label>
                  <CustomSelect
                    value={editingContract.companyId || ''}
                    onChange={(val) => setEditingContract({ ...editingContract, companyId: val })}
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">اسم العقد / الفئة <RequiredMark /></label>
                  <input
                    type="text"
                    value={editingContract.name || ''}
                    onChange={(e) => setEditingContract({ ...editingContract, name: e.target.value })}
                    placeholder="مثال: فئة الذهب - تغطية 80%"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">نسبة تحمل المريض (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={((editingContract.patientShareBps || 0) / 100).toString()}
                    onChange={(e) => {
                      const pct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                      setEditingContract({ ...editingContract, patientShareBps: Math.round(pct * 100) });
                    }}
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                  />
                  <div className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1">
                    تحمل الشركة: {100 - (editingContract.patientShareBps || 0) / 100}%
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">سقف تغطية الفاتورة (ج.م)</label>
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
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                  />
                </div>
              </div>

              {/* Exclusions Management Section */}
              <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark space-y-3.5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-line dark:border-line-dark">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-ink dark:text-ink-dark">
                      <ShieldAlert className="w-4 h-4 text-warn" />
                      <span>استثناءات التغطية التأمينية (تحمل المريض 100%)</span>
                    </div>
                    <p className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5">
                      حدد الفئات أو الأصناف الفردية التي لا يشملها هذا العقد ويدفعها العميل بالكامل
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                      {(editingContract.exclusions || []).filter((e) => e.categoryId).length} فئة
                    </span>
                    <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                      {(editingContract.exclusions || []).filter((e) => e.productId).length} صنف
                    </span>
                  </div>
                </div>

                {/* Sub-tabs / Switcher */}
                <div className="flex items-center gap-1 p-1 bg-surface dark:bg-surface-dark-3 rounded-lg border border-line dark:border-line-dark">
                  <button
                    type="button"
                    onClick={() => setExclusionSubTab('categories')}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      exclusionSubTab === 'categories'
                        ? 'bg-brand text-white dark:bg-brand-bright dark:text-surface-dark shadow-2xs'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>استثناء فئات كاملة ({(editingContract.exclusions || []).filter((e) => e.categoryId).length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExclusionSubTab('products')}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      exclusionSubTab === 'products'
                        ? 'bg-brand text-white dark:bg-brand-bright dark:text-surface-dark shadow-2xs'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>استثناء أصناف محددة ({(editingContract.exclusions || []).filter((e) => e.productId).length})</span>
                  </button>
                </div>

                {/* Sub-tab 1: Categories */}
                {exclusionSubTab === 'categories' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomSelect
                          value={selectedCategoryIdToAdd}
                          onChange={setSelectedCategoryIdToAdd}
                          placeholder="اختر فئة لإضافتها لقائمة الاستثناءات..."
                          options={availableCategories
                            .filter((c) => !(editingContract.exclusions || []).some((e) => e.categoryId === c.id))
                            .map((c) => ({ value: c.id, label: c.name }))}
                        />
                      </div>
                      <AppButton
                        variant="secondary"
                        size="sm"
                        icon={Plus}
                        disabled={!selectedCategoryIdToAdd}
                        onClick={() => handleAddCategoryExclusion(selectedCategoryIdToAdd)}
                      >
                        استثناء الفئة
                      </AppButton>
                    </div>

                    {/* Cosmetic Category Quick-add Shortcut */}
                    {(() => {
                      const cosmeticCat = availableCategories.find(
                        (c) => c.name.includes('تجميل') || c.name.toLowerCase().includes('cosmetic')
                      );
                      const isCosmeticAlreadyExcluded = cosmeticCat && (editingContract.exclusions || []).some((e) => e.categoryId === cosmeticCat.id);
                      if (!cosmeticCat || isCosmeticAlreadyExcluded) return null;
                      return (
                        <div className="flex items-center justify-between p-2 bg-warn-soft/40 dark:bg-warn-dark-soft/30 rounded-lg border border-warn/20">
                          <span className="text-micro text-ink dark:text-ink-dark font-medium">
                            تلميح سريع: استثناء فئة مستحضرات التجميل تلقائياً
                          </span>
                          <AppButton
                            variant="secondary"
                            size="xs"
                            icon={Plus}
                            onClick={() => handleAddCategoryExclusion(cosmeticCat.id)}
                          >
                            استثناء التجميل
                          </AppButton>
                        </div>
                      );
                    })()}

                    {/* Excluded Categories Chips */}
                    {(() => {
                      const catExclusions = (editingContract.exclusions || []).filter((e) => e.categoryId);
                      if (catExclusions.length === 0) {
                        return (
                          <div className="py-3 text-center text-xs text-ink-muted dark:text-ink-dark-muted border border-dashed border-line dark:border-line-dark rounded-lg">
                            لا توجد فئات مستثناة — كافة فئات المنتجات مشمولة بنسبة التغطية
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                          {catExclusions.map((ex) => {
                            const originalIdx = (editingContract.exclusions || []).indexOf(ex);
                            const catName = ex.categoryName || availableCategories.find((c) => c.id === ex.categoryId)?.name || 'فئة مستثناة';
                            return (
                              <span
                                key={ex.categoryId}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-xs font-bold text-ink dark:text-ink-dark shadow-2xs"
                              >
                                <FolderTree className="w-3.5 h-3.5 text-warn shrink-0" />
                                <span>{catName}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExclusion(originalIdx)}
                                  className="hover:text-danger text-ink-muted dark:text-ink-dark-muted transition-colors cursor-pointer"
                                  title="إلغاء استثناء الفئة"
                                  aria-label="إلغاء استثناء الفئة"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Sub-tab 2: Products */}
                {exclusionSubTab === 'products' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={productSearchTerm}
                        onChange={(e) => handleProductSearchChange(e.target.value)}
                        placeholder="ابحث بالاسم أو الباركود لإضافة صنف فردي للاستثناء..."
                        className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright placeholder:text-ink-muted/50"
                      />
                      {productSearchTerm && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearchTerm('');
                            setProductSearchResults([]);
                          }}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-0.5 cursor-pointer"
                          title="مسح البحث"
                          aria-label="مسح البحث"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Dropdown Results */}
                      {productSearchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-line dark:divide-line-dark">
                          {productSearchResults.map((prod) => {
                            const isAlreadyExcluded = (editingContract.exclusions || []).some((e) => e.productId === prod.id);
                            return (
                              <button
                                key={prod.id}
                                type="button"
                                disabled={isAlreadyExcluded}
                                onClick={() => handleAddProductExclusion(prod)}
                                className={`w-full p-2.5 text-right flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                  isAlreadyExcluded
                                    ? 'opacity-50 cursor-not-allowed bg-surface-2 dark:bg-surface-dark-2'
                                    : 'hover:bg-brand-soft dark:hover:bg-brand-dark-soft'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Package className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                                  <div className="truncate">
                                    <span className="font-bold text-ink dark:text-ink-dark block truncate">{prod.name}</span>
                                    {prod.barcode && (
                                      <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono">{prod.barcode}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {prod.pricePiasters != null && prod.pricePiasters > 0 && (
                                    <span className="font-mono text-micro text-paid dark:text-paid-bright font-bold">
                                      {formatArabicCurrency(prod.pricePiasters)}
                                    </span>
                                  )}
                                  {isAlreadyExcluded ? (
                                    <span className="text-micro text-warn dark:text-warn-bright font-bold">مستثنى بالفعل</span>
                                  ) : (
                                    <span className="text-micro text-brand dark:text-brand-bright font-bold flex items-center gap-0.5">
                                      <Plus className="w-3 h-3" /> إضافة
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {isSearchingProduct && (
                        <div className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1 px-1">
                          جاري البحث في قاعدة الأصناف...
                        </div>
                      )}
                    </div>

                    {/* Excluded Products List */}
                    {(() => {
                      const prodExclusions = (editingContract.exclusions || []).filter((e) => e.productId);
                      if (prodExclusions.length === 0) {
                        return (
                          <div className="py-3 text-center text-xs text-ink-muted dark:text-ink-dark-muted border border-dashed border-line dark:border-line-dark rounded-lg">
                            لا توجد أصناف فردية مستثناة — استخدم حقل البحث أعلاه لإدراج أصناف بالاسم أو الباركود
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {prodExclusions.map((ex) => {
                            const originalIdx = (editingContract.exclusions || []).indexOf(ex);
                            return (
                              <div
                                key={ex.productId}
                                className="p-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg flex items-center justify-between gap-2 text-xs shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Package className="w-3.5 h-3.5 text-warn shrink-0" />
                                  <span className="font-medium text-ink dark:text-ink-dark truncate">{ex.productName}</span>
                                  {ex.productBarcode && (
                                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono bg-surface-2 dark:bg-surface-dark-2 px-1.5 py-0.5 rounded">
                                      {ex.productBarcode}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {ex.productPricePiasters != null && ex.productPricePiasters > 0 && (
                                    <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                                      {formatArabicCurrency(ex.productPricePiasters)}
                                    </span>
                                  )}
                                  <AppButton
                                    variant="subtle"
                                    size="xs"
                                    icon={Trash2}
                                    onClick={() => handleRemoveExclusion(originalIdx)}
                                    title="إلغاء استثناء الصنف"
                                    aria-label="إلغاء استثناء الصنف"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="md" onClick={closeContractModal}>
                إلغاء
              </AppButton>
              <AppButton variant="primary" size="md" onClick={handleSaveContract}>
                حفظ العقد
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Member */}
      {showMemberModal && editingMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 text-ink dark:text-ink-dark">
            <div className="px-6 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark">تسجيل مشترك تأمين جديد</h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => setShowMemberModal(false)} />
            </div>
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {renderModalError()}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">العقد التأميني</label>
                <CustomSelect
                  value={editingMember.contractId || ''}
                  onChange={(val) => setEditingMember({ ...editingMember, contractId: val })}
                  options={contracts.map((c) => ({ value: c.id, label: `${c.companyName || ''} - ${c.name}` }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">اسم المشترك / المريض <RequiredMark /></label>
                  <input
                    type="text"
                    value={editingMember.memberName || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, memberName: e.target.value })}
                    placeholder="مثال: أحمد محمد كمال"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">رقم الكارنيه / العضوية <RequiredMark /></label>
                  <input
                    type="text"
                    value={editingMember.memberNo || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, memberNo: e.target.value })}
                    placeholder="مثال: CARD-100234"
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                  />
                </div>

                <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">الرقم القومي</label>
                    <input
                      type="text"
                      value={editingMember.nationalId || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, nationalId: e.target.value })}
                      placeholder="14 رقم"
                      className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">رقم الهاتف</label>
                    <input
                      type="text"
                      value={editingMember.phone || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                      placeholder="010..."
                      className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                  </div>
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="md" onClick={() => { setShowMemberModal(false); setModalError(null); }}>
                إلغاء
              </AppButton>
              <AppButton variant="primary" size="md" onClick={handleSaveMember}>
                حفظ المشترك
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Batch */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh] text-ink dark:text-ink-dark">
            <div className="px-6 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark">إصدار دفعة مطالبة مجمعة لشركة التأمين</h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => { setShowBatchModal(false); setModalError(null); }} />
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {renderModalError()}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">شركة التأمين</label>
                  <CustomSelect
                    value={newBatchCompanyId}
                    onChange={(val) => {
                      setNewBatchCompanyId(val);
                      setSelectedPendingClaimIds([]);
                      setModalError(null);
                    }}
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">رقم المطالبة <RequiredMark /></label>
                  <input
                    type="text"
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">فترة المطالبة (شهر/سنة) <RequiredMark /></label>
                  <input
                    type="month"
                    value={newBatchPeriod}
                    onChange={(e) => setNewBatchPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">ملاحظات على المطالبة:</label>
                <input
                  type="text"
                  value={newBatchNotes}
                  onChange={(e) => setNewBatchNotes(e.target.value)}
                  placeholder="ملاحظات أو تعليمات خاصة للمطالبة..."
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
              </div>

              {/* Pending claims selection table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-ink dark:text-ink-dark">الفواتير المعلقة القابلة للإدراج: <RequiredMark /></label>
                  <AppButton
                    variant="soft"
                    size="xs"
                    onClick={() => {
                      if (filteredPendingClaims.length > 0 && selectedPendingClaimIds.length === filteredPendingClaims.length) {
                        setSelectedPendingClaimIds([]);
                      } else {
                        setSelectedPendingClaimIds(filteredPendingClaims.map((p) => p.id));
                      }
                    }}
                    disabled={filteredPendingClaims.length === 0}
                  >
                    {filteredPendingClaims.length > 0 && selectedPendingClaimIds.length === filteredPendingClaims.length ? 'إلغاء تحديد الكل' : 'تحديد جميع الفواتير'}
                  </AppButton>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">تاريخ الفاتورة:</span>
                  <DateFilterControl value={claimsDateFilter} onChange={setClaimsDateFilter} size="sm" />
                  <ClearFiltersButton
                    active={isDateFilterActive(claimsDateFilter)}
                    onClick={resetClaimsDateFilter}
                    label="إلغاء الفلترة"
                  />
                </div>

                <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold border-b border-line dark:border-line-dark sticky top-0">
                      <tr>
                        <th className="p-2 text-center w-10">#</th>
                        <th className="p-2">رقم الفاتورة</th>
                        <th className="p-2">التاريخ</th>
                        <th className="p-2">المريض</th>
                        <th className="p-2">رقم الكارنيه</th>
                        <th className="p-2 text-left">مبلغ المطالبة (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 dark:divide-line-dark">
                      {filteredPendingClaims.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-ink-muted dark:text-ink-dark-muted">
                            {pendingClaims.length === 0
                              ? 'لا توجد أي فواتير معلقة لهذه الشركة'
                              : `لا توجد فواتير معلقة في الفترة (${describeDateFilter(claimsDateFilter)})`}
                          </td>
                        </tr>
                      ) : (
                        filteredPendingClaims.map((clm) => {
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
                              className={`cursor-pointer ${isChecked ? 'bg-brand-soft/40 dark:bg-brand-dark-soft/50' : 'hover:bg-canvas dark:hover:bg-surface-dark-2'}`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                />
                              </td>
                              <td className="p-2 font-mono font-bold">#{clm.invoiceNumber}</td>
                              <td className="p-2 font-mono text-ink-muted dark:text-ink-dark-muted">{parseDateToLocalDateStr(clm.createdAt) || '-'}</td>
                              <td className="p-2 font-medium">{clm.patientName}</td>
                              <td className="p-2 font-mono">{clm.memberNo}</td>
                              <td className="p-2 text-left font-mono font-bold text-brand dark:text-brand-bright">
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
            <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between shrink-0">
              <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
                المحدد: <strong className="text-ink dark:text-ink-dark">{selectedPendingClaimIds.length}</strong> فاتورة
              </div>
              <div className="flex items-center gap-2">
                <AppButton variant="secondary" size="md" onClick={() => { setShowBatchModal(false); setModalError(null); }}>
                  إلغاء
                </AppButton>
                <AppButton variant="primary" size="md" onClick={handleCreateBatch}>
                  إصدار المطالبة الرسمية
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Settle Batch */}
      {showSettleModal && settlingBatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 text-ink dark:text-ink-dark">
            <div className="px-6 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
              <h3 className="t-card-title text-ink dark:text-ink-dark">
                {settlingBatch.status === 'settled' || settlingBatch.status === 'partially_settled'
                  ? 'تعديل تسوية مطالبة التأمين'
                  : 'تسوية مطالبة شركة التأمين'}
              </h3>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => setShowSettleModal(false)} />
            </div>
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {renderModalError()}
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-xs space-y-1 text-ink dark:text-ink-dark">
                <div>الشركة: <strong>{settlingBatch.companyName}</strong></div>
                <div>رقم الدفعة: <strong>{settlingBatch.batchNumber}</strong></div>
                <div>إجمالي المطالبة: <strong className="text-brand font-mono">{(settlingBatch.totalAmountPiasters / 100).toFixed(2)} ج.م</strong></div>
              </div>

              {(settlingBatch.status === 'settled' || settlingBatch.status === 'partially_settled') && (
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300">
                  تعديل تسوية معتمدة مسبقاً (المعتمد الحالي: {(settlingBatch.settledAmountPiasters / 100).toFixed(2)} ج.م | المرفوض الحالي: {(settlingBatch.rejectedAmountPiasters / 100).toFixed(2)} ج.م). سيتم تحديث قيود الرفوضات والأرباح تلقائياً دون تكرار.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-paid dark:text-paid-bright mb-1">المبلغ المعتمد والمسدد (ج.م)</label>
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
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-paid dark:text-paid-bright font-bold font-mono focus:outline-none focus:border-paid"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-danger dark:text-danger-bright mb-1">المبلغ المرفوض (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rejectedAmountEgp}
                    onChange={(e) => setRejectedAmountEgp(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-danger dark:text-danger-bright font-bold font-mono focus:outline-none focus:border-danger"
                  />
                </div>
              </div>

              {parseFloat(rejectedAmountEgp || '0') > 0 && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">سبب الرفض الطبي</label>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="مثال: دواء غير مطابق لبروتوكول العلاج أو نقص موافقة"
                      className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">جهة تحميل الرفض (معالجة العجز)</label>
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

              {/* وجهة توريد المبلغ المعتمد */}
              {parseFloat(approvedAmountEgp || '0') > 0 && (
                <div className="space-y-3 pt-3 border-t border-line dark:border-line-dark">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark">
                      أين تم استلام وتوريد المبلغ المعتمد؟
                    </label>
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted">
                      وجهة النقدية في الخزينة
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* 1. درج الكاشير */}
                    <button
                      type="button"
                      onClick={() => setReceiptTarget('drawer')}
                      className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                        receiptTarget === 'drawer'
                          ? 'border-paid bg-paid-soft/50 dark:bg-paid-dark-soft ring-1 ring-paid text-ink dark:text-ink-dark'
                          : 'border-line dark:border-line-dark hover:border-line-hover bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <span className="text-xs font-bold flex items-center gap-1.5 text-ink dark:text-ink-dark">
                          <Landmark className="w-4 h-4 text-paid" />
                          درج الكاشير
                        </span>
                        {receiptTarget === 'drawer' && (
                          <CheckCircle2 className="w-4 h-4 text-paid shrink-0" />
                        )}
                      </div>
                      <p className="text-micro leading-relaxed text-ink-muted dark:text-ink-dark-muted">
                        إيداع نقدي فوري بالدرج في الوردية المفتوحة حالياً.
                      </p>
                    </button>

                    {/* 2. محفظة أو إنستاباي */}
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptTarget('digital_account');
                        if (!receiptAccountId && digitalAccounts.length > 0) {
                          const def = digitalAccounts.find(a => a.isDefault) || digitalAccounts[0];
                          setReceiptAccountId(def.id);
                        }
                      }}
                      className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                        receiptTarget === 'digital_account'
                          ? 'border-brand bg-brand-soft/50 dark:bg-brand-dark ring-1 ring-brand text-ink dark:text-ink-dark'
                          : 'border-line dark:border-line-dark hover:border-line-hover bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <span className="text-xs font-bold flex items-center gap-1.5 text-ink dark:text-ink-dark">
                          <Smartphone className="w-4 h-4 text-brand" />
                          محفظة / إنستاباي
                        </span>
                        {receiptTarget === 'digital_account' && (
                          <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                        )}
                      </div>
                      <p className="text-micro leading-relaxed text-ink-muted dark:text-ink-dark-muted">
                        إيداع بحساب رقمي (فودافون كاش، إنستاباي...).
                      </p>
                    </button>

                    {/* 3. بدون توريد بالبرنامج */}
                    <button
                      type="button"
                      onClick={() => setReceiptTarget('none')}
                      className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                        receiptTarget === 'none'
                          ? 'border-line-hover bg-surface-2 dark:bg-surface-dark-3 ring-1 ring-line-hover text-ink dark:text-ink-dark'
                          : 'border-line dark:border-line-dark hover:border-line-hover bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <span className="text-xs font-bold flex items-center gap-1.5 text-ink dark:text-ink-dark">
                          <Building2 className="w-4 h-4 text-ink-muted" />
                          خارجي / بنكي
                        </span>
                        {receiptTarget === 'none' && (
                          <CheckCircle2 className="w-4 h-4 text-ink-muted shrink-0" />
                        )}
                      </div>
                      <p className="text-micro leading-relaxed text-ink-muted dark:text-ink-dark-muted">
                        استلام بنكي/شيك خارجي لا يؤثر على نقدية البرنامج.
                      </p>
                    </button>
                  </div>

                  {/* تفاصيل الحساب الرقمي إن تم اختياره */}
                  {receiptTarget === 'digital_account' && (
                    <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-ink dark:text-ink-dark">
                          اختر الحساب أو المحفظة الرقمية المستلم عليها:
                        </label>
                        <AppButton
                          variant="secondary"
                          size="xs"
                          icon={Plus}
                          onClick={() => {
                            setNewAccountName('');
                            setNewAccountNumber('');
                            setNewAccountHolder('');
                            setNewAccountProvider('vodafone_cash');
                            setQuickAccountError(null);
                            setShowQuickAccountModal(true);
                          }}
                        >
                          إضافة حساب جديد
                        </AppButton>
                      </div>

                      {digitalAccounts.length === 0 ? (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                          <span>لا توجد محافظ أو حسابات إنستاباي مسجلة بعد.</span>
                          <AppButton
                            variant="primary"
                            size="xs"
                            icon={Plus}
                            onClick={() => {
                              setNewAccountName('');
                              setNewAccountNumber('');
                              setNewAccountHolder('');
                              setNewAccountProvider('vodafone_cash');
                              setQuickAccountError(null);
                              setShowQuickAccountModal(true);
                            }}
                          >
                            إضافة حساب الآن
                          </AppButton>
                        </div>
                      ) : (
                        <CustomSelect
                          value={receiptAccountId}
                          onChange={(val) => setReceiptAccountId(val)}
                          options={digitalAccounts.map((acc) => {
                            const phoneOrId = acc.phoneNumber || acc.identifier || '';
                            const typeLabel = acc.accountType === 'instapay' ? 'إنستاباي' : 'محفظة';
                            return {
                              value: acc.id,
                              label: `${acc.name} (${typeLabel}${phoneOrId ? ' - ' + phoneOrId : ''}) — الرصيد: ${(acc.balancePiasters / 100).toFixed(2)} ج.م`,
                            };
                          })}
                        />
                      )}
                    </div>
                  )}

                  {/* ملاحظة أمان التعديل المالي */}
                  {(settlingBatch.status === 'settled' || settlingBatch.status === 'partially_settled') && (
                    <div className="p-2.5 bg-surface-2 dark:bg-surface-dark-3 rounded-lg border border-line dark:border-line-dark text-micro text-ink-muted dark:text-ink-dark-muted flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-brand shrink-0" />
                      <span>
                        حماية الحسابات: عند حفظ التعديل، يقوم النظام تلقائياً وبأمان مالي تام بإلغاء التوريد السابق (من الدرج أو المحفظة السابقة) وتطبيق التوريد الجديد دون أي عجز أو تلاعب.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2 shrink-0">
              <AppButton variant="secondary" size="md" onClick={() => { setShowSettleModal(false); setModalError(null); }}>
                إلغاء
              </AppButton>
              <AppButton variant="primary" size="md" onClick={handleSettleBatch}>
                {settlingBatch.status === 'settled' || settlingBatch.status === 'partially_settled' ? 'حفظ تعديل التسوية' : 'اعتماد التسوية'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Digital Account Modal */}
      {showQuickAccountModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 text-ink dark:text-ink-dark">
            <div className="px-5 py-3.5 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-brand" />
                إضافة حساب أو محفظة إلكترونية
              </h4>
              <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={() => setShowQuickAccountModal(false)} />
            </div>
            <div className="p-5 space-y-3">
              {quickAccountError && (
                <div className="p-2.5 bg-danger-soft text-danger dark:text-danger-bright rounded-lg text-xs">
                  {quickAccountError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                  اسم الحساب أو المحفظة <RequiredMark />
                </label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="مثال: فودافون كاش الصيدلية أو إنستاباي الكاشير"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                  نوع ومزوّد الخدمة
                </label>
                <CustomSelect
                  value={newAccountProvider}
                  onChange={(val) => setNewAccountProvider(val)}
                  options={[
                    { value: 'vodafone_cash', label: 'فودافون كاش' },
                    { value: 'instapay', label: 'إنستاباي' },
                    { value: 'orange_cash', label: 'أورنج كاش' },
                    { value: 'etisalat_cash', label: 'اتصالات كاش' },
                    { value: 'we_pay', label: 'وي باي' },
                    { value: 'bank_account', label: 'حساب بنكي' },
                    { value: 'other', label: 'أخرى' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                  رقم الهاتف أو الحساب
                </label>
                <input
                  type="text"
                  value={newAccountNumber}
                  onChange={(e) => setNewAccountNumber(e.target.value)}
                  placeholder="مثال: 01012345678 أو username@instapay"
                  dir="ltr"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand text-right"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                  اسم صاحب الحساب
                </label>
                <input
                  type="text"
                  value={newAccountHolder}
                  onChange={(e) => setNewAccountHolder(e.target.value)}
                  placeholder="الاسم المسجل على المحفظة أو الحساب"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowQuickAccountModal(false)}>
                إلغاء
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                disabled={savingNewAccount || !newAccountName.trim()}
                onClick={async () => {
                  if (!newAccountName.trim()) {
                    setQuickAccountError('اسم الحساب أو المحفظة مطلوب.');
                    return;
                  }
                  setSavingNewAccount(true);
                  setQuickAccountError(null);
                  try {
                    const accType = newAccountProvider === 'instapay' ? 'instapay' : 'wallet';
                    const createdAcc = await invoke<DigitalAccount>('wallets:saveAccount', {
                      name: newAccountName.trim(),
                      holderName: newAccountHolder.trim(),
                      type: accType,
                      provider: newAccountProvider,
                      accountNumber: newAccountNumber.trim(),
                      phoneNumber: newAccountNumber.trim(),
                      isDefault: digitalAccounts.length === 0,
                      isActive: true,
                    });
                    const updatedList = await fetchDigitalAccounts();
                    if (createdAcc && createdAcc.id) {
                      setReceiptAccountId(createdAcc.id);
                    } else if (updatedList.length > 0) {
                      setReceiptAccountId(updatedList[updatedList.length - 1].id);
                    }
                    setShowQuickAccountModal(false);
                  } catch (err: unknown) {
                    setQuickAccountError(err instanceof Error ? err.message : 'فشل في حفظ الحساب.');
                  } finally {
                    setSavingNewAccount(false);
                  }
                }}
              >
                {savingNewAccount ? 'جاري الحفظ...' : 'حفظ الحساب'}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
