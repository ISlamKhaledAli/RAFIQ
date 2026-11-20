import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HeartPulse,
  Pill,
  AlertTriangle,
  Calendar,
  Plus,
  Trash2,
  Save,
  Check,
  Clock,
  Activity,
  X,
  Loader2,
  Phone,
  Package,
} from 'lucide-react';
import { SearchInput } from '../../components/SearchInput';
import { invoke } from '../../bridge/ipc';
import { useAuth } from '../../context/useAuth';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { formatPhoneDisplay } from '../../utils/phoneFormat';
import type { CustomerPatientInfo, ChronicMedication } from '../../types/patient';
import { extractProducts, type Product } from '../../types/models';
import { RequiredMark } from '../../components/RequiredMark';

import { AppButton } from '../../components/AppButton';
import MotionHeight from '../../components/MotionHeight';
import { useMotionPanel } from '../../hooks/useMotionPanel';
interface PatientProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  onProfileUpdated?: () => void;
}

const COMMON_ALLERGIES = [
  'بنسلين',
  'سلفا',
  'أسبرين',
  'إيبوبروفين',
  'باراسيتامول',
  'سيبروفلوكساسين',
];

const COMMON_CONDITIONS = [
  'ضغط الدم المرتفع',
  'السكري من النوع الثاني',
  'السكري من النوع الأول',
  'أمراض القلب والشرايين',
  'قصور الكلى',
  'حساسية الصدر / الربو',
  'قرحة المعدة',
];

const GENDER_OPTIONS: SelectOption[] = [
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
  { value: '', label: 'غير محدد' },
];

export const PatientProfileModal: React.FC<PatientProfileModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerPhone,
  onProfileUpdated,
}) => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('patients.edit');

  const [activeTab, setActiveTab] = useState<'profile' | 'chronic'>('profile');
  const [isLoading, setIsLoading] = useState(false);
  const motionPanel = useMotionPanel(isLoading ? 'loading' : activeTab);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Profile Form State
  const [birthYear, setBirthYear] = useState<string>('');
  const [gender, setGender] = useState<string>('male');
  const [allergies, setAllergies] = useState<string>('');
  const [chronicConditions, setChronicConditions] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Chronic Meds State
  const [chronicMeds, setChronicMeds] = useState<ChronicMedication[]>([]);
  const [isAddingMed, setIsAddingMed] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newDailyQty, setNewDailyQty] = useState<string>('1');
  const [newSupplyDays, setNewSupplyDays] = useState<string>('30');
  const [newFirstDueDate, setNewFirstDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [newMedNotes, setNewMedNotes] = useState<string>('');
  const [deletingMedId, setDeletingMedId] = useState<string | null>(null);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Load Data
  const loadData = useCallback(async () => {
    if (!customerId) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const [profileData, medsData] = await Promise.all([
        invoke<CustomerPatientInfo>('patients:getProfile', { customerId }),
        invoke<ChronicMedication[]>('patients:getChronicMeds', { customerId }),
      ]);

      if (profileData) {
        setBirthYear(profileData.birthYear ? profileData.birthYear.toString() : '');
        setGender(profileData.gender || 'male');
        setAllergies(profileData.allergies || '');
        setChronicConditions(profileData.chronicConditions || '');
        setNotes(profileData.notes || '');
      }

      setChronicMeds(medsData || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل بيانات الملف الطبي للمريض';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
      const d = new Date();
      d.setDate(d.getDate() + 30);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setNewFirstDueDate(`${y}-${m}-${day}`);
    }
  }, [isOpen, loadData]);

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setProductSearch(p.name);
    setSearchResults([]);
    setHasSearched(false);
  };

  // Immediate Product Search (on Enter or search button click)
  const executeProductSearch = async (val: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const q = normalizeArabicNumerals(val).trim();
    if (!q) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearchingProduct(false);
      return;
    }

    setIsSearchingProduct(true);
    setHasSearched(true);
    try {
      const results = await invoke<unknown>('products:search', { query: q, limit: 10, includeCounts: false });
      const prods = extractProducts(results);
      setSearchResults(prods);
      if (prods.length === 1 && !selectedProduct) {
        handleSelectProduct(prods[0]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearchingProduct(false);
    }
  };

  // Debounced Product Search while typing
  const handleProductSearchChange = (val: string) => {
    setProductSearch(val);
    const q = normalizeArabicNumerals(val);
    if (selectedProduct && selectedProduct.name !== q) {
      setSelectedProduct(null);
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearchingProduct(false);
      return;
    }

    setIsSearchingProduct(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await invoke<unknown>('products:search', { query: q.trim(), limit: 10, includeCounts: false });
        const prods = extractProducts(results);
        setSearchResults(prods);
        setHasSearched(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearchingProduct(false);
      }
    }, 250);
  };

  const resetMedForm = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsAddingMed(false);
    setSelectedProduct(null);
    setProductSearch('');
    setSearchResults([]);
    setHasSearched(false);
    setNewMedNotes('');
    setNewDailyQty('1');
    setNewSupplyDays('30');
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setNewFirstDueDate(`${y}-${m}-${day}`);
  };

  // Add Chronic Medication
  const handleAddChronicMed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setStatusMessage({ text: 'يرجى اختيار الصنف الدوائي أولاً', type: 'error' });
      return;
    }

    const parsedQty = parseFloat(normalizeArabicNumerals(newDailyQty));
    if (!newDailyQty.trim() || isNaN(parsedQty) || parsedQty <= 0) {
      setStatusMessage({ text: 'يرجى إدخال جرعة يومية صحيحة أكبر من الصفر (مثال: 1 أو 2 أو 0.5)', type: 'error' });
      return;
    }

    const supplyDays = parseInt(normalizeArabicNumerals(newSupplyDays), 10);
    if (!newSupplyDays.trim() || isNaN(supplyDays) || supplyDays <= 0) {
      setStatusMessage({ text: 'يرجى إدخال دورة صرف صحيحة بالأيام (مثال: 30)', type: 'error' });
      return;
    }

    if (!newFirstDueDate) {
      setStatusMessage({ text: 'يرجى تحديد تاريخ أول استحقاق لصرف الدواء', type: 'error' });
      return;
    }

    const dailyMilli = Math.round(parsedQty * 1000);

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const newMed: Partial<ChronicMedication> = {
        customerId,
        productId: selectedProduct.id,
        dailyQtyMilli: dailyMilli,
        daysSupply: supplyDays,
        nextDueDate: newFirstDueDate || undefined,
        notes: newMedNotes.trim() || undefined,
      };

      const saved = await invoke<ChronicMedication>('patients:saveChronicMed', newMed);
      if (saved) {
        setChronicMeds((prev) => [...prev, saved]);
        resetMedForm();
        setStatusMessage({ text: `تم تسجيل دواء "${saved.productName || selectedProduct.name}" ضمن قائمة الأدوية المزمنة للمريض`, type: 'success' });
        if (onProfileUpdated) onProfileUpdated();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إضافة الدواء المزمن';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Chronic Medication
  const handleDeleteMed = async (id: string, name: string) => {
    if (!canEdit) return;
    setDeletingMedId(id);
    setStatusMessage(null);
    try {
      const ok = await invoke<boolean>('patients:deleteChronicMed', { id });
      if (ok) {
        setChronicMeds((prev) => prev.filter((m) => m.id !== id));
        setStatusMessage({ text: `تم حذف "${name}" من قائمة الأدوية المزمنة`, type: 'success' });
        if (onProfileUpdated) onProfileUpdated();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حذف الدواء المزمن';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setDeletingMedId(null);
    }
  };

  // Save General Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setIsSaving(true);
    setStatusMessage(null);
    try {
      let bYear: number | null = null;
      if (birthYear.trim()) {
        const parsedYear = parseInt(normalizeArabicNumerals(birthYear), 10);
        if (!isNaN(parsedYear)) {
          bYear = parsedYear;
        }
      }

      const info: CustomerPatientInfo = {
        customerId,
        birthYear: bYear,
        gender,
        allergies: allergies.trim() || undefined,
        chronicConditions: chronicConditions.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await invoke<CustomerPatientInfo>('patients:saveProfile', info);
      if (res) {
        setStatusMessage({ text: 'تم حفظ الملف الطبي للمريض', type: 'success' });
        if (onProfileUpdated) onProfileUpdated();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حفظ الملف الطبي';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate approximate age
  const calculatedAge = useMemo(() => {
    if (!birthYear) return null;
    const y = parseInt(normalizeArabicNumerals(birthYear), 10);
    if (isNaN(y) || y < 1900) return null;
    return new Date().getFullYear() - y;
  }, [birthYear]);

  // Clickable Allergy Pill Adder
  const toggleAllergyPill = (pillText: string) => {
    if (!canEdit) return;
    const list = allergies
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(pillText)) {
      setAllergies(list.filter((x) => x !== pillText).join('، '));
    } else {
      list.push(pillText);
      setAllergies(list.join('، '));
    }
  };

  // Clickable Condition Pill Adder
  const toggleConditionPill = (pillText: string) => {
    if (!canEdit) return;
    const list = chronicConditions
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(pillText)) {
      setChronicConditions(list.filter((x) => x !== pillText).join('، '));
    } else {
      list.push(pillText);
      setChronicConditions(list.join('، '));
    }
  };

  const { handleBackdropClick } = useModalDismiss({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface dark:bg-surface-dark w-full max-w-3xl rounded-2xl border border-line dark:border-line-dark shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="t-modal-title text-ink dark:text-ink-dark">
                  الملف الطبي للمريض: {customerName}
                </h3>
                {calculatedAge !== null && (
                  <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-brand/10 dark:bg-brand-bright/10 text-brand dark:text-brand-bright border border-brand/20">
                    {calculatedAge} سنة
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                {customerPhone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3" />
                    {formatPhoneDisplay(customerPhone)}
                  </span>
                )}
                <span>•</span>
                <span>متابعة الأمراض المزمنة والاستحقاق والحساسية الدوائية</span>
              </div>
            </div>
          </div>

          <AppButton variant="subtle" size="sm" icon={X} onClick={onClose} aria-label="إغلاق" />
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-2 border-b border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'border-brand text-brand dark:text-brand-bright bg-surface dark:bg-surface-dark rounded-t-lg'
                : 'border-transparent text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>السجل الطبي والحساسية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chronic')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'chronic'
                ? 'border-brand text-brand dark:text-brand-bright bg-surface dark:bg-surface-dark rounded-t-lg'
                : 'border-transparent text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
            }`}
          >
            <Pill className="w-4 h-4" />
            <span>الأدوية المزمنة ومواعيد الصرف</span>
            <span className="px-1.5 py-0.2 rounded-full text-micro bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-mono font-bold">
              {chronicMeds.length}
            </span>
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 mx-5 mt-3 rounded-xl border text-xs font-bold flex items-center gap-2 shrink-0 animate-in fade-in ${
              statusMessage.type === 'success'
                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid/30'
                : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger/30'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <MotionHeight className="flex-1 overflow-y-auto p-5">
        <div {...motionPanel} className="space-y-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-brand dark:text-brand-bright" />
              <span className="text-xs font-bold">جاري تحميل الملف الطبي للمريض...</span>
            </div>
          ) : activeTab === 'profile' ? (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Row 1: Birth year & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                    سنة الميلاد (لتقدير الجرعات والعمر)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="مثال: 1975"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      disabled={!canEdit}
                      min="1900"
                      max={new Date().getFullYear()}
                      className="w-full h-10 px-3 pr-9 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-brand dark:focus:border-brand-bright disabled:opacity-60"
                    />
                    <Calendar className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                    النوع / الجنس
                  </label>
                  <CustomSelect
                    options={GENDER_OPTIONS}
                    value={gender}
                    onChange={(val) => setGender(val)}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              {/* Row 2: Allergies */}
              <div className="p-3.5 bg-danger-soft/20 dark:bg-danger-dark-soft/20 border border-danger/20 dark:border-danger/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-danger dark:text-danger-bright">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>الحساسية الدوائية المسجلة</span>
                  </label>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted">
                    مهم: يتم إطلاق تنبيه تحذيري عند صرف أي دواء يحتوي عليها
                  </span>
                </div>

                <textarea
                  rows={2}
                  placeholder="اكتب المواد أو العائلات الدوائية التي يتحسس منها المريض مفصولة بفواصل (مثال: بنسلين، سلفا، أسبرين)..."
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  disabled={!canEdit}
                  className="w-full p-2.5 bg-surface dark:bg-surface-dark border border-danger/30 rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:ring-1 focus:ring-danger disabled:opacity-60"
                />

                {/* Quick Allergen Pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted ml-1">
                    إضافة سريعة:
                  </span>
                  {COMMON_ALLERGIES.map((item) => {
                    const isSelected = allergies.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleAllergyPill(item)}
                        disabled={!canEdit}
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-micro font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-danger text-white dark:bg-danger-dark-soft dark:text-danger-bright dark:ring-1 dark:ring-inset dark:ring-danger-bright/40 border border-danger'
                            : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:border-danger/40'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3 inline me-1 shrink-0" /> : <Plus className="w-3 h-3 inline me-1 shrink-0" />}
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Chronic Conditions */}
              <div className="p-3.5 bg-warn-soft/20 dark:bg-warn-dark-soft/20 border border-warn/20 dark:border-warn/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-warn dark:text-warn-bright">
                    <Activity className="w-4 h-4 shrink-0" />
                    <span>الأمراض المزمنة والحالة الصحية</span>
                  </label>
                </div>

                <textarea
                  rows={2}
                  placeholder="اكتب الأمراض المزمنة للمريض (مثال: ضغط، سكر، قصور كلوي)..."
                  value={chronicConditions}
                  onChange={(e) => setChronicConditions(e.target.value)}
                  disabled={!canEdit}
                  className="w-full p-2.5 bg-surface dark:bg-surface-dark border border-warn/30 rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:ring-1 focus:ring-warn disabled:opacity-60"
                />

                {/* Quick Condition Pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted ml-1">
                    أشهر الحالات:
                  </span>
                  {COMMON_CONDITIONS.map((item) => {
                    const isSelected = chronicConditions.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleConditionPill(item)}
                        disabled={!canEdit}
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-micro font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40 border border-warn-bright'
                            : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:border-warn/40'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3 inline me-1 shrink-0" /> : <Plus className="w-3 h-3 inline me-1 shrink-0" />}
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: General Notes */}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                  ملاحظات صيدلانية وسريرية خاصة
                </label>
                <textarea
                  rows={2}
                  placeholder="أي تعليمات إضافية بخصوص التاريخ العلاجي، الطبيب المعالج، أو تعليمات الجرعات..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canEdit}
                  className="w-full p-2.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright disabled:opacity-60"
                />
              </div>

              {/* Save Button */}
              {canEdit && (
                <div className="pt-2 flex justify-end">
                  <AppButton type="submit" variant="primary" icon={Save} loading={isSaving}>
                    حفظ الملف الطبي للمريض
                  </AppButton>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              {/* Header Action: Add Medication Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="t-label text-ink dark:text-ink-dark">
                    قائمة الأدوية المزمنة المسجلة للصرف الدوري
                  </h4>
                  <p className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5">
                    السيستم يحسب مواعيد الاستحقاق القادمة تلقائياً وينبهك قبل نفاد دواء المريض
                  </p>
                </div>

                {canEdit && !isAddingMed && (
                  <AppButton variant="soft" size="sm" icon={Plus} onClick={() => setIsAddingMed(true)}>
                    إضافة دواء مزمن
                  </AppButton>
                )}
              </div>

              {/* Add Medication Card */}
              {isAddingMed && (
                <form
                  onSubmit={handleAddChronicMed}
                  noValidate
                  className="p-4 bg-surface-2 dark:bg-surface-dark-2 border border-brand/20 dark:border-brand-bright/30 rounded-xl space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-line dark:border-line-dark">
                    <span className="text-xs font-bold text-brand dark:text-brand-bright flex items-center gap-1.5">
                      <Plus className="w-4 h-4" />
                      تسجيل دواء مزمن جديد للمريض
                    </span>
                    <AppButton
                      variant="subtle"
                      size="xs"
                      icon={X}
                      onClick={resetMedForm}
                      aria-label="إغلاق"
                    />
                  </div>

                  {/* Product Search */}
                  <div ref={searchContainerRef} className="relative">
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                      الصنف الدوائي <RequiredMark />
                    </label>
                    <SearchInput
                      size="sm"
                      value={productSearch}
                      onChange={handleProductSearchChange}
                      onSubmit={(val) => void executeProductSearch(val)}
                      onClear={() => {
                        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                        setProductSearch('');
                        setSelectedProduct(null);
                        setSearchResults([]);
                        setHasSearched(false);
                      }}
                      placeholder="ابحث باسم الدواء أو الباركود..."
                      ariaLabel="بحث عن دواء"
                      trailing={isSearchingProduct ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand dark:text-brand-bright shrink-0" /> : undefined}
                    />

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-lg z-30 divide-y divide-line/40 dark:divide-line-dark/40">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProduct(p)}
                            className="p-2.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer text-xs flex items-center justify-between transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                              <div>
                                <span className="font-bold text-ink dark:text-ink-dark block">{p.name}</span>
                                {p.barcode && (
                                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono block">
                                    باركود: {p.barcode}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-left font-mono shrink-0">
                              <span className="text-paid dark:text-paid-bright font-bold block">
                                {formatArabicCurrency(p.pricePiasters)}
                              </span>
                              <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">
                                الرصيد: {((p.stockQuantityMilli || 0) / 1000).toFixed(0)} علبة
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No Results Feedback */}
                    {hasSearched && !isSearchingProduct && searchResults.length === 0 && productSearch.trim().length > 0 && !selectedProduct && (
                      <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-lg z-30 text-center text-xs text-ink-muted dark:text-ink-dark-muted">
                        لم يتم العثور على أدوية مطابقة لبحثك
                      </div>
                    )}

                    {/* Selected Product Banner */}
                    {selectedProduct && (
                      <div className="mt-2 p-2.5 rounded-xl bg-paid-soft/50 dark:bg-paid-dark-soft/50 border border-paid/20 dark:border-paid/30 flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-paid text-white flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-ink dark:text-ink-dark">
                              تم اختيار الصنف: {selectedProduct.name}
                            </div>
                            <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono flex items-center gap-2.5 mt-0.5">
                              {selectedProduct.barcode && <span>باركود: {selectedProduct.barcode}</span>}
                              <span>السعر: {formatArabicCurrency(selectedProduct.pricePiasters)}</span>
                              <span>الرصيد: {((selectedProduct.stockQuantityMilli || 0) / 1000).toFixed(0)} علبة</span>
                            </div>
                          </div>
                        </div>
                        <AppButton
                          variant="subtle"
                          size="xs"
                          icon={X}
                          onClick={() => {
                            setSelectedProduct(null);
                            setProductSearch('');
                          }}
                          aria-label="إلغاء اختيار الدواء"
                        />
                      </div>
                    )}
                  </div>

                  {/* Daily Dosing & Supply Days */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                        الجرعة اليومية (عدد الوحدات)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={newDailyQty}
                        onChange={(e) => setNewDailyQty(e.target.value)}
                        className="w-full h-9 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                        placeholder="مثال: 1 أو 2"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                        دورة الصرف (بالأيام)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={newSupplyDays}
                        onChange={(e) => setNewSupplyDays(e.target.value)}
                        className="w-full h-9 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                        placeholder="30 يوم"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                        تاريخ الاستحقاق الأول
                      </label>
                      <CustomDatePicker
                        value={newFirstDueDate}
                        onChange={(val) => setNewFirstDueDate(val)}
                        placeholder="اختر تاريخ الاستحقاق"
                        size="md"
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Medication Notes */}
                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                      تعليمات الجرعة (تطبع على ملصق العبوة)
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: قرص واحد بعد الإفطار وقرص قبل النوم..."
                      value={newMedNotes}
                      onChange={(e) => setNewMedNotes(e.target.value)}
                      className="w-full h-9 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    <AppButton
                      variant="secondary"
                      size="sm"
                      onClick={resetMedForm}
                    >
                      إلغاء
                    </AppButton>
                    <AppButton type="submit" variant="primary" size="sm" icon={Check} loading={isSaving} disabled={!selectedProduct}>
                      تأكيد الإضافة
                    </AppButton>
                  </div>
                </form>
              )}

              {/* Chronic Meds Table */}
              {chronicMeds.length === 0 ? (
                <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted border border-dashed border-line dark:border-line-dark rounded-xl">
                  <Package className="w-10 h-10 text-ink-muted/30 mx-auto mb-2" />
                  <p className="text-xs font-bold">لا يوجد أدوية مزمنة مسجلة لهذا المريض حتى الآن</p>
                  <p className="text-micro text-ink-muted/70 mt-1">
                    اضغط على "إضافة دواء مزمن" لتسجيل علاجه الدوري ومتابعة استحقاقاته
                  </p>
                </div>
              ) : (
                <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted font-bold border-b border-line dark:border-line-dark">
                      <tr>
                        <th className="py-2.5 px-3">الدواء</th>
                        <th className="py-2.5 px-3 text-center">الجرعة اليومية</th>
                        <th className="py-2.5 px-3 text-center">آخر صرف</th>
                        <th className="py-2.5 px-3 text-center">الصرف القادم</th>
                        <th className="py-2.5 px-3 text-center">الرصيد المتاح</th>
                        {canEdit && <th className="py-2.5 px-3 text-center">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 dark:divide-line-dark/60">
                      {chronicMeds.map((m) => {
                        const isOverdue = m.nextDueDate && new Date(m.nextDueDate) < new Date();
                        const isDueSoon = m.nextDueDate && Math.ceil((new Date(m.nextDueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 3;
                        return (
                          <tr key={m.id} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40">
                            {/* Product Name & Notes */}
                            <td className="py-3 px-3">
                              <span className="font-bold text-ink dark:text-ink-dark block">
                                {m.productName}
                              </span>
                              {m.notes && (
                                <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">
                                  {m.notes}
                                </span>
                              )}
                            </td>

                            {/* Daily Dose */}
                            <td className="py-3 px-3 text-center font-mono font-bold">
                              {(m.dailyQtyMilli / 1000).toFixed(1)} قرص / يوم
                            </td>

                            {/* Last Dispensed */}
                            <td className="py-3 px-3 text-center text-ink-muted dark:text-ink-dark-muted font-mono text-xs">
                              {m.lastDispensedAt ? m.lastDispensedAt.split(' ')[0] : '---'}
                            </td>

                            {/* Next Due Date & Status Badge */}
                            <td className="py-3 px-3 text-center">
                              {m.nextDueDate ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-micro ${
                                    isOverdue
                                      ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/30'
                                      : isDueSoon
                                      ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/30'
                                      : 'bg-paid-soft dark:bg-paid-dark-soft text-paid border border-paid/30'
                                  }`}
                                >
                                  <Clock className="w-3 h-3" />
                                  {m.nextDueDate}
                                </span>
                              ) : (
                                <span className="text-ink-muted/50 dark:text-ink-dark-muted/50">غير محدد</span>
                              )}
                            </td>

                            {/* Available Stock */}
                            <td className="py-3 px-3 text-center font-mono">
                              <span
                                className={`font-bold ${
                                  (m.stockQuantityMilli || 0) <= 0
                                    ? 'text-danger dark:text-danger-bright font-bold'
                                    : 'text-ink dark:text-ink-dark'
                                }`}
                              >
                                {((m.stockQuantityMilli || 0) / 1000).toFixed(0)} علبة
                              </span>
                            </td>

                            {/* Actions */}
                            {canEdit && (
                              <td className="py-3 px-3 text-center">
                                <AppButton
                                  variant="dangerSubtle"
                                  size="xs"
                                  icon={Trash2}
                                  loading={deletingMedId === m.id}
                                  onClick={() => handleDeleteMed(m.id, m.productName || 'الدواء')}
                                  title="حذف من أدوية المريض المزمنة"
                                  aria-label="حذف من أدوية المريض المزمنة"
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        </MotionHeight>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center shrink-0">
          <div className="flex items-center gap-2 text-micro text-ink-muted dark:text-ink-dark-muted">
            <Activity className="w-3.5 h-3.5 text-brand" />
            <span>معرف العميل الطبي: {customerId}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
