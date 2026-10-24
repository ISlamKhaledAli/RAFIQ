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
  Search,
  Package,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useAuth } from '../../context/useAuth';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import type { CustomerPatientInfo, ChronicMedication } from '../../types/patient';
import type { Product } from '../../types/models';

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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newDailyQty, setNewDailyQty] = useState<string>('1');
  const [newSupplyDays, setNewSupplyDays] = useState<string>('30');
  const [newFirstDueDate, setNewFirstDueDate] = useState<string>('');
  const [newMedNotes, setNewMedNotes] = useState<string>('');
  const [deletingMedId, setDeletingMedId] = useState<string | null>(null);

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
      // Set default next due date to today + 30 days
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setNewFirstDueDate(d.toISOString().split('T')[0]);
    }
  }, [isOpen, loadData]);

  // Product Search for Adding Chronic Med
  const handleProductSearch = async (val: string) => {
    const q = normalizeArabicNumerals(val);
    setProductSearch(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearchingProduct(true);
    try {
      const results = await invoke<Product[]>('products:search', { query: q });
      setSearchResults(results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearchingProduct(false);
    }
  };

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setProductSearch(p.name);
    setSearchResults([]);
  };

  // Add Chronic Medication
  const handleAddChronicMed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setStatusMessage({ text: 'يرجى اختيار الصنف الدوائي أولاً', type: 'error' });
      return;
    }

    const dailyQtyPieces = parseFloat(newDailyQty) || 1;
    const dailyMilli = Math.round(dailyQtyPieces * 1000);
    const supplyDays = parseInt(newSupplyDays, 10) || 30;

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
        setSelectedProduct(null);
        setProductSearch('');
        setNewMedNotes('');
        setIsAddingMed(false);
        setStatusMessage({ text: `تم تسجيل دواء "${saved.productName}" ضمن قائمة الأدوية المزمنة للمريض`, type: 'success' });
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
        setStatusMessage({ text: 'تم حفظ الملف الطبي للمريض بنجاح وتحديث سجل الحساسية السريرية', type: 'success' });
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
                <h3 className="font-bold text-sm sm:text-base text-ink dark:text-ink-dark">
                  الملف الطبي للمريض: {customerName}
                </h3>
                {calculatedAge !== null && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 dark:bg-brand-bright/10 text-brand dark:text-brand-bright border border-brand/20">
                    {calculatedAge} سنة
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                {customerPhone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3" />
                    {customerPhone}
                  </span>
                )}
                <span>•</span>
                <span>متابعة الأمراض المزمنة والاستحقاق والحساسية الدوائية</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
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
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-mono font-bold">
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
                    <span>الحساسية الدوائية المسجلة (Clinical Drug Allergies)</span>
                  </label>
                  <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
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
                  <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted ml-1">
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
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-danger text-white border border-danger'
                            : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:border-danger/40'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
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
                    <span>الأمراض المزمنة والحالة الصحية (Chronic Conditions)</span>
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
                  <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted ml-1">
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
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-warn text-white border border-warn'
                            : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:border-warn/40'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
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
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-1.5 h-10 px-5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>حفظ الملف الطبي للمريض</span>
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              {/* Header Action: Add Medication Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink dark:text-ink-dark">
                    قائمة الأدوية المزمنة المسجلة للصرف الدوري
                  </h4>
                  <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5">
                    السيستم يحسب مواعيد الاستحقاق القادمة تلقائياً وينبهك قبل نفاد دواء المريض
                  </p>
                </div>

                {canEdit && !isAddingMed && (
                  <button
                    type="button"
                    onClick={() => setIsAddingMed(true)}
                    className="flex items-center gap-1 h-8 px-3 bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright rounded-xl text-xs font-bold transition-all hover:bg-brand hover:text-white cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة دواء مزمن</span>
                  </button>
                )}
              </div>

              {/* Add Medication Card */}
              {isAddingMed && (
                <form
                  onSubmit={handleAddChronicMed}
                  className="p-4 bg-surface-2 dark:bg-surface-dark-2 border border-brand/20 dark:border-brand-bright/30 rounded-xl space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-line dark:border-line-dark">
                    <span className="text-xs font-bold text-brand dark:text-brand-bright flex items-center gap-1.5">
                      <Plus className="w-4 h-4" />
                      تسجيل دواء مزمن جديد للمريض
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingMed(false);
                        setSelectedProduct(null);
                        setProductSearch('');
                      }}
                      className="text-ink-muted hover:text-ink cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Product Search */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                      الصنف الدوائي *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ابحث باسم الدواء أو الباركود..."
                        value={productSearch}
                        onChange={(e) => void handleProductSearch(e.target.value)}
                        className="w-full h-9 px-3 pr-8 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                      />
                      <Search className="w-3.5 h-3.5 text-ink-muted absolute right-3 top-2.5 pointer-events-none" />
                      {isSearchingProduct && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand absolute left-3 top-2.5" />
                      )}
                    </div>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-lg z-20">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProduct(p)}
                            className="p-2.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer text-xs flex items-center justify-between border-b border-line/40 dark:border-line-dark/40 last:border-b-0"
                          >
                            <span className="font-bold text-ink dark:text-ink-dark">{p.name}</span>
                            <span className="font-mono text-paid dark:text-paid-bright font-bold">
                              {formatArabicCurrency(p.pricePiasters)}
                            </span>
                          </div>
                        ))}
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
                        step="0.5"
                        min="0.25"
                        value={newDailyQty}
                        onChange={(e) => setNewDailyQty(e.target.value)}
                        className="w-full h-9 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold"
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
                        className="w-full h-9 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold"
                        placeholder="30 يوم"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                        تاريخ الاستحقاق الأول
                      </label>
                      <input
                        type="date"
                        value={newFirstDueDate}
                        onChange={(e) => setNewFirstDueDate(e.target.value)}
                        className="w-full h-9 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold"
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
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingMed(false);
                        setSelectedProduct(null);
                        setProductSearch('');
                      }}
                      className="h-8.5 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs font-bold text-ink-muted cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !selectedProduct}
                      className="h-8.5 px-4 bg-brand hover:bg-brand-hover text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>تأكيد الإضافة</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Chronic Meds Table */}
              {chronicMeds.length === 0 ? (
                <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted border border-dashed border-line dark:border-line-dark rounded-xl">
                  <Package className="w-10 h-10 text-ink-muted/30 mx-auto mb-2" />
                  <p className="text-xs font-bold">لا يوجد أدوية مزمنة مسجلة لهذا المريض حتى الآن</p>
                  <p className="text-[11px] text-ink-muted/70 mt-1">
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
                                <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">
                                  {m.notes}
                                </span>
                              )}
                            </td>

                            {/* Daily Dose */}
                            <td className="py-3 px-3 text-center font-mono font-bold">
                              {(m.dailyQtyMilli / 1000).toFixed(1)} قرص / يوم
                            </td>

                            {/* Last Dispensed */}
                            <td className="py-3 px-3 text-center text-ink-muted font-mono text-[11px]">
                              {m.lastDispensedAt ? m.lastDispensedAt.split(' ')[0] : '---'}
                            </td>

                            {/* Next Due Date & Status Badge */}
                            <td className="py-3 px-3 text-center">
                              {m.nextDueDate ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                                    isOverdue
                                      ? 'bg-danger-soft text-danger border border-danger/30'
                                      : isDueSoon
                                      ? 'bg-warn-soft text-warn border border-warn/30'
                                      : 'bg-paid-soft text-paid border border-paid/30'
                                  }`}
                                >
                                  <Clock className="w-3 h-3" />
                                  {m.nextDueDate}
                                </span>
                              ) : (
                                <span className="text-ink-muted/50">غير محدد</span>
                              )}
                            </td>

                            {/* Available Stock */}
                            <td className="py-3 px-3 text-center font-mono">
                              <span
                                className={`font-bold ${
                                  (m.stockQuantityMilli || 0) <= 0
                                    ? 'text-danger font-bold'
                                    : 'text-ink dark:text-ink-dark'
                                }`}
                              >
                                {((m.stockQuantityMilli || 0) / 1000).toFixed(0)} علبة
                              </span>
                            </td>

                            {/* Actions */}
                            {canEdit && (
                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMed(m.id, m.productName || 'الدواء')}
                                  disabled={deletingMedId === m.id}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-danger hover:bg-danger-soft border border-transparent hover:border-danger/30 cursor-pointer"
                                  title="حذف من أدوية المريض المزمنة"
                                >
                                  {deletingMedId === m.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-danger" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-ink-muted dark:text-ink-dark-muted">
            <Activity className="w-3.5 h-3.5 text-brand" />
            <span>معرف العميل الطبي: {customerId}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8.5 px-4 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-xl text-xs font-bold text-ink dark:text-ink-dark transition-colors cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
