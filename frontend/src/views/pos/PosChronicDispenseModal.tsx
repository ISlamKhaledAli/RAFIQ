import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HeartPulse,
  Pill,
  Search,
  X,
  AlertTriangle,
  Loader2,
  Clock,
  Phone,
  PackageCheck,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import type { Customer, Product } from '../../types/models';
import type { ChronicMedication, PatientDueAlert, CustomerPatientInfo } from '../../types/patient';

interface PosChronicDispenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomerId?: string;
  onLoadMedsToCart: (customer: Customer, medsToLoad: { product: Product; quantityMilli: number }[]) => void;
}

export const PosChronicDispenseModal: React.FC<PosChronicDispenseModalProps> = ({
  isOpen,
  onClose,
  customers,
  selectedCustomerId,
  onLoadMedsToCart,
}) => {
  const [activeCustomerId, setActiveCustomerId] = useState<string>(selectedCustomerId || '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [dueAlerts, setDueAlerts] = useState<PatientDueAlert[]>([]);
  const [isLoadingMeds, setIsLoadingMeds] = useState(false);
  const [patientProfile, setPatientProfile] = useState<CustomerPatientInfo | null>(null);
  const [chronicMeds, setChronicMeds] = useState<ChronicMedication[]>([]);
  const [selectedMedIds, setSelectedMedIds] = useState<Record<string, boolean>>({});
  const [productsCache, setProductsCache] = useState<Record<string, Product>>({});
  const [supplyDays, setSupplyDays] = useState<number>(30);

  // Load due alerts on open
  useEffect(() => {
    if (isOpen) {
      invoke<PatientDueAlert[]>('patients:getDueAlerts', { daysAhead: 7 })
        .then((alerts) => setDueAlerts(alerts || []))
        .catch(() => setDueAlerts([]));
    }
  }, [isOpen]);

  // If customer is passed
  useEffect(() => {
    if (selectedCustomerId) {
      setActiveCustomerId(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  // Load patient profile and chronic medications when active customer changes
  const loadPatientData = useCallback(async (custId: string) => {
    if (!custId) {
      setPatientProfile(null);
      setChronicMeds([]);
      return;
    }

    setIsLoadingMeds(true);
    try {
      const [prof, meds] = await Promise.all([
        invoke<CustomerPatientInfo>('patients:getProfile', { customerId: custId }),
        invoke<ChronicMedication[]>('patients:getChronicMeds', { customerId: custId }),
      ]);

      setPatientProfile(prof || null);
      setChronicMeds(meds || []);

      // Pre-select all medications
      const sel: Record<string, boolean> = {};
      if (meds) {
        for (let i = 0; i < meds.length; i++) {
          sel[meds[i].id] = true;
        }
      }
      setSelectedMedIds(sel);

      // Fetch full product objects for selected meds to load into POS cart
      if (meds && meds.length > 0) {
        const prodMap: Record<string, Product> = {};
        await Promise.all(
          meds.map(async (m) => {
            try {
              const p = await invoke<Product>('products:getById', { id: m.productId });
              if (p) prodMap[m.productId] = p;
            } catch {
              // ignore
            }
          })
        );
        setProductsCache(prodMap);
      }
    } catch {
      setChronicMeds([]);
    } finally {
      setIsLoadingMeds(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeCustomerId) {
      void loadPatientData(activeCustomerId);
    }
  }, [isOpen, activeCustomerId, loadPatientData]);

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.trim().toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    ).slice(0, 15);
  }, [customers, customerSearch]);

  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === activeCustomerId) || null;
  }, [customers, activeCustomerId]);

  const toggleSelectMed = (id: string) => {
    setSelectedMedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectAll = () => {
    const sel: Record<string, boolean> = {};
    for (let i = 0; i < chronicMeds.length; i++) {
      sel[chronicMeds[i].id] = true;
    }
    setSelectedMedIds(sel);
  };

  const deselectAll = () => {
    setSelectedMedIds({});
  };

  // Execute Load to Cart
  const handleConfirmLoad = () => {
    if (!activeCustomer) return;

    const medsToLoad: { product: Product; quantityMilli: number }[] = [];
    for (let i = 0; i < chronicMeds.length; i++) {
      const m = chronicMeds[i];
      if (selectedMedIds[m.id] && productsCache[m.productId]) {
        const prod = productsCache[m.productId];
        // 1 month supply = (dailyQtyMilli * supplyDays)
        // e.g. 1 tab daily (1000 milli) * 30 days = 30,000 milli (or package units)
        // If product is sold in packages (e.g. 30 tabs/pack), 1 pack = 1000 milli or conversion factor
        // Default to dailyQty * supplyDays
        const totalMilli = Math.max(1000, Math.round((m.dailyQtyMilli || 1000) * (supplyDays / 30)));
        medsToLoad.push({
          product: prod,
          quantityMilli: totalMilli,
        });
      }
    }

    if (medsToLoad.length === 0) return;

    onLoadMedsToCart(activeCustomer, medsToLoad);
    onClose();
  };

  const selectedCount = useMemo(() => {
    return Object.values(selectedMedIds).filter(Boolean).length;
  }, [selectedMedIds]);

  const { handleBackdropClick } = useModalDismiss({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface dark:bg-surface-dark w-full max-w-3xl rounded-2xl border border-line dark:border-line-dark shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-ink dark:text-ink-dark flex items-center gap-2">
                <span>صرف العلاج الشهري السريع (أدوية الأمراض المزمنة)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand text-white">
                  نقرة واحدة
                </span>
              </h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                تحميل باقة الأدوية المزمنة للمريض في سلة البيع وتحديث مواعيد الاستحقاق
              </p>
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quick Due Patients Bar */}
          {!activeCustomerId && dueAlerts.length > 0 && (
            <div className="p-3 bg-warn-soft/20 dark:bg-warn-dark-soft/20 border border-warn/30 rounded-xl space-y-2">
              <span className="text-xs font-bold text-warn dark:text-warn-bright flex items-center gap-1.5">
                <Clock className="w-4 h-4 shrink-0" />
                مرضى مستحقين للصرف الآن (اختر مريضاً للبدء السريع):
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {dueAlerts.map((a) => (
                  <button
                    key={a.customerId}
                    type="button"
                    onClick={() => setActiveCustomerId(a.customerId)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand text-xs font-bold text-ink dark:text-ink-dark shadow-2xs cursor-pointer transition-all hover:scale-102"
                  >
                    <span>{a.customerName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-warn text-white font-mono font-bold">
                      {a.medicationsCount} دواء
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Patient Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                اختيار المريض / العميل
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(normalizeArabicNumerals(e.target.value))}
                  className="w-full h-9 px-3 pr-8 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs focus:outline-none focus:border-brand"
                />
                <Search className="w-3.5 h-3.5 text-ink-muted absolute right-3 top-2.5 pointer-events-none" />
              </div>

              {/* Customer Dropdown */}
              {customerSearch.trim() && (
                <div className="mt-1 max-h-40 overflow-y-auto bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-lg">
                  {filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setActiveCustomerId(c.id);
                        setCustomerSearch('');
                      }}
                      className="p-2 hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer text-xs flex items-center justify-between border-b border-line/40 dark:border-line-dark/40 last:border-b-0"
                    >
                      <span className="font-bold text-ink dark:text-ink-dark">{c.name}</span>
                      <span className="font-mono text-ink-muted text-[11px]">{c.phone || '---'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Patient Card */}
            {activeCustomer && (
              <div className="p-3 bg-brand-soft/30 dark:bg-brand-dark-soft/30 border border-brand/20 dark:border-brand-bright/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-brand dark:text-brand-bright">
                      {activeCustomer.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCustomerId('');
                        setChronicMeds([]);
                        setPatientProfile(null);
                      }}
                      className="text-[10px] text-danger hover:underline cursor-pointer"
                    >
                      (تغيير)
                    </button>
                  </div>
                  {activeCustomer.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted font-mono mt-0.5">
                      <Phone className="w-3 h-3" />
                      <span>{activeCustomer.phone}</span>
                    </div>
                  )}
                  {patientProfile?.allergies && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-danger dark:text-danger-bright mt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>حساسية: {patientProfile.allergies}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-ink-muted">دورة الصرف:</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={supplyDays}
                    onChange={(e) => setSupplyDays(parseInt(e.target.value, 10) || 30)}
                    className="w-16 h-8 px-2 text-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs font-mono font-bold"
                  />
                  <span className="text-xs font-bold text-ink">يوم</span>
                </div>
              </div>
            )}
          </div>

          {/* Chronic Medications List */}
          {isLoadingMeds ? (
            <div className="py-12 flex flex-col items-center justify-center text-ink-muted gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs font-bold">جاري تحميل أدوية المريض المزمنة...</span>
            </div>
          ) : !activeCustomerId ? (
            <div className="py-12 text-center text-ink-muted border border-dashed border-line dark:border-line-dark rounded-xl">
              <HeartPulse className="w-10 h-10 text-ink-muted/30 mx-auto mb-2" />
              <p className="text-xs font-bold">اختر المريض لعرض قائمته الدوائية المسجلة للصرف</p>
            </div>
          ) : chronicMeds.length === 0 ? (
            <div className="py-12 text-center text-ink-muted border border-dashed border-line dark:border-line-dark rounded-xl">
              <Pill className="w-10 h-10 text-ink-muted/30 mx-auto mb-2" />
              <p className="text-xs font-bold">لا توجد أدوية مزمنة مسجلة في ملف هذا المريض</p>
              <p className="text-[11px] text-ink-muted/70 mt-1">
                يمكنك تسجيل أدويته المزمنة من نافذة "الملف الطبي" في شاشة العملاء
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-ink dark:text-ink-dark">
                  حدد الأدوية المراد صرفها للمريض في هذه الفاتورة:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-brand hover:underline cursor-pointer"
                  >
                    تحديد الكل
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-ink-muted hover:underline cursor-pointer"
                  >
                    إلغاء التحديد
                  </button>
                </div>
              </div>

              <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden divide-y divide-line/60 dark:divide-line-dark/60">
                {chronicMeds.map((m) => {
                  const isChecked = !!selectedMedIds[m.id];
                  const prod = productsCache[m.productId];
                  const isOutOfStock = prod ? prod.stockQuantityMilli <= 0 : false;
                  return (
                    <div
                      key={m.id}
                      onClick={() => toggleSelectMed(m.id)}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-brand-soft/20 dark:bg-brand-dark-soft/20'
                          : 'hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-brand cursor-pointer pointer-events-none"
                        />
                        <div>
                          <span className="font-bold text-xs text-ink dark:text-ink-dark block">
                            {m.productName}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5">
                            <span>الجرعة: {(m.dailyQtyMilli / 1000).toFixed(1)} قرص/يوم</span>
                            {m.notes && <span>• {m.notes}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-left">
                        {isOutOfStock ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft text-danger border border-danger/30">
                            رصيد منتهي
                          </span>
                        ) : prod ? (
                          <span className="font-mono text-xs font-bold text-ink-muted">
                            رصيد: {(prod.stockQuantityMilli / 1000).toFixed(0)} علبة
                          </span>
                        ) : null}

                        <span className="font-mono font-bold text-xs text-paid dark:text-paid-bright">
                          {formatArabicCurrency(m.pricePiasters)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between shrink-0">
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
            الأدوية المحددة للصرف: <span className="font-mono text-brand dark:text-brand-bright">{selectedCount}</span> صنف
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 rounded-xl text-xs font-bold text-ink transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleConfirmLoad}
              disabled={selectedCount === 0 || !activeCustomer}
              className="flex items-center gap-1.5 h-9 px-5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <PackageCheck className="w-4 h-4" />
              <span>تحميل الأدوية في السلة ({selectedCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
