import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from '../../bridge/ipc';
import type { Customer } from '../../types/models';
import { rafiqAlert } from '../../utils/dialogService';

/**
 * Quick "register a new customer" flow shared by every checkout dialog (cash, InstaPay, wallet).
 * `onCustomerCreated` receives the new (or chosen duplicate) customer id so the dialog can select it.
 */
export function useQuickAddCustomer(customers: Customer[], onCustomerCreated: (id: string) => void) {
  const [newlyAddedCustomers, setNewlyAddedCustomers] = useState<Customer[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  // The saved customer is usable at once, before the parent list reloads from the database
  const localCustomers = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) {
      if (c && c.id) map.set(c.id, c);
    }
    for (const c of newlyAddedCustomers) {
      if (c && c.id) map.set(c.id, c);
    }
    return Array.from(map.values());
  }, [customers, newlyAddedCustomers]);

  // Reconcile newlyAddedCustomers once the updated list arrives from the database
  useEffect(() => {
    if (newlyAddedCustomers.length > 0) {
      const existingIds = new Set(customers.map((c) => c.id));
      setNewlyAddedCustomers((prev) => prev.filter((c) => !existingIds.has(c.id)));
    }
  }, [customers, newlyAddedCustomers.length]);

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
    setQuickName('');
    setQuickPhone('');
  }, []);

  const resetQuickAdd = useCallback(() => {
    setNewlyAddedCustomers([]);
    closeQuickAdd();
  }, [closeQuickAdd]);

  const duplicateQuickCustomer = useMemo(() => {
    const clean = quickPhone.trim().replace(/[\s-]/g, '');
    if (clean.length < 7) return null;
    return localCustomers.find((c) => (c.phone || '').trim().replace(/[\s-]/g, '') === clean) || null;
  }, [quickPhone, localCustomers]);

  const handleQuickAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickName.trim() || quickSaving) return;
    setQuickSaving(true);
    try {
      const saved = await invoke<Customer>('customers:save', {
        name: quickName.trim(),
        phone: quickPhone.trim(),
        balancePiasters: 0,
        creditLimitPiasters: 100000,
      });
      if (saved) {
        setNewlyAddedCustomers((prev) => (prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]));
        onCustomerCreated(saved.id);
        closeQuickAdd();
      }
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل حفظ العميل',
        message: err instanceof Error ? err.message : 'تعذر حفظ العميل',
        variant: 'error',
      });
    } finally {
      setQuickSaving(false);
    }
  };

  const selectDuplicateCustomer = (customer: Customer) => {
    onCustomerCreated(customer.id);
    closeQuickAdd();
  };

  return {
    localCustomers,
    showQuickAdd,
    openQuickAdd: () => setShowQuickAdd(true),
    closeQuickAdd,
    resetQuickAdd,
    quickName,
    setQuickName,
    quickPhone,
    setQuickPhone,
    quickSaving,
    hasQuickAddInput: Boolean(quickName.trim() || quickPhone.trim()),
    duplicateQuickCustomer,
    handleQuickAddCustomer,
    selectDuplicateCustomer,
  };
}
