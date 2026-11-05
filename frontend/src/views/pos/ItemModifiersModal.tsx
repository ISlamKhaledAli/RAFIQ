import React, { useState, useEffect, useMemo } from 'react';
import { X, Sliders, Check, MessageSquare } from 'lucide-react';
import type { ModifierGroup, ModifierOption, SaleItemModifier } from '../../types/cafe';
import { formatArabicCurrency } from '../../utils/money';
import { RequiredMark } from '../../components/RequiredMark';

interface ItemModifiersModalProps {
  isOpen: boolean;
  productName: string;
  basePricePiasters: number;
  groups: ModifierGroup[];
  initialModifiers?: SaleItemModifier[];
  initialNotes?: string;
  onClose: () => void;
  onConfirm: (selectedModifiers: SaleItemModifier[], notes: string) => void;
}

export const ItemModifiersModal: React.FC<ItemModifiersModalProps> = ({
  isOpen,
  productName,
  basePricePiasters,
  groups,
  initialModifiers,
  initialNotes,
  onClose,
  onConfirm,
}) => {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, ModifierOption[]>>({});
  const [notes, setNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError(null);
    setNotes(initialNotes || '');

    const initMap: Record<string, ModifierOption[]> = {};
    groups.forEach((g) => {
      const activeOpts = (g.options || []).filter((o) => o.isActive !== false);
      if (initialModifiers && initialModifiers.length > 0) {
        const matched = activeOpts.filter((o) =>
          initialModifiers.some((im) => im.optionId === o.id)
        );
        initMap[g.id] = matched;
      } else {
        const defaults = activeOpts.filter((o) => o.isDefault);
        if (g.selectionType === 'single') {
          initMap[g.id] = defaults.length > 0 ? [defaults[0]] : (g.isRequired && activeOpts.length > 0 ? [activeOpts[0]] : []);
        } else {
          initMap[g.id] = defaults;
        }
      }
    });
    setSelectedByGroup(initMap);
  }, [isOpen, groups, initialModifiers, initialNotes]);

  const extraTotalPiasters = useMemo(() => {
    let sum = 0;
    Object.values(selectedByGroup).forEach((opts) => {
      opts.forEach((o) => {
        sum += Math.round(o.extraPricePiasters || 0);
      });
    });
    return sum;
  }, [selectedByGroup]);

  if (!isOpen) return null;

  const toggleOption = (group: ModifierGroup, opt: ModifierOption) => {
    setValidationError(null);
    setSelectedByGroup((prev) => {
      const current = prev[group.id] || [];
      const exists = current.some((o) => o.id === opt.id);

      if (group.selectionType === 'single') {
        if (exists && !group.isRequired) {
          return { ...prev, [group.id]: [] };
        }
        return { ...prev, [group.id]: [opt] };
      }

      // Multiple selection
      if (exists) {
        return { ...prev, [group.id]: current.filter((o) => o.id !== opt.id) };
      }
      const maxAllowed = group.maxSelections > 0 ? group.maxSelections : 99;
      if (current.length >= maxAllowed) {
        setValidationError(`الحد الأقصى للاختيار في مجموعة «${group.name}» هو ${maxAllowed}`);
        return prev;
      }
      return { ...prev, [group.id]: [...current, opt] };
    });
  };

  const handleConfirm = () => {
    for (const g of groups) {
      const chosen = selectedByGroup[g.id] || [];
      const minReq = g.isRequired ? Math.max(1, g.minSelections || 1) : (g.minSelections || 0);
      if (chosen.length < minReq) {
        setValidationError(`يرجى اختيار ${minReq} على الأقل في مجموعة «${g.name}»`);
        return;
      }
    }

    const flatModifiers: SaleItemModifier[] = [];
    groups.forEach((g) => {
      const chosen = selectedByGroup[g.id] || [];
      chosen.forEach((o) => {
        flatModifiers.push({
          optionId: o.id,
          groupName: g.name,
          optionName: o.name,
          extraPricePiasters: Math.round(o.extraPricePiasters || 0),
          quantityMilli: 1000,
        });
      });
    });

    onConfirm(flatModifiers, notes.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none" dir="rtl">
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-ink dark:text-ink-dark">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand-dark-soft border border-brand/30 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="t-modal-title text-ink dark:text-ink-dark">تخصيص الصنف والإضافات: {productName}</h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
                السعر الأساسي: {formatArabicCurrency(basePricePiasters)}
                {extraTotalPiasters > 0 && ` • إضافات: +${formatArabicCurrency(extraTotalPiasters)}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {validationError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-danger/10 dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs font-black">
            {validationError}
          </div>
        )}

        {/* Modifier Groups */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {groups.map((group) => {
            const chosen = selectedByGroup[group.id] || [];
            const activeOptions = (group.options || []).filter((o) => o.isActive !== false);
            return (
              <div key={group.id} className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-ink dark:text-ink-dark">{group.name}{group.isRequired && <> <RequiredMark /></>}</span>
                  </div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold">
                    {group.selectionType === 'single' ? 'اختيار واحد' : `اختيار متعدد (حتى ${group.maxSelections || 5})`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {activeOptions.map((opt) => {
                    const isSelected = chosen.some((c) => c.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleOption(group, opt)}
                        className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright border-brand dark:border-brand-bright shadow-xs dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                            : 'bg-surface dark:bg-surface-dark-3 border-line dark:border-line-dark text-ink dark:text-ink-dark hover:border-brand/50 dark:hover:border-brand-bright/50'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-black">{opt.name}</div>
                          <div className={`text-micro font-bold ${isSelected ? 'text-white/90 dark:text-brand-bright/90' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                            {opt.extraPricePiasters > 0
                              ? `+ ${formatArabicCurrency(opt.extraPricePiasters)}`
                              : 'بدون تكلفة إضافية'}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Special Kitchen Notes */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-black text-ink dark:text-ink-dark">
              <MessageSquare className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
              <span>ملاحظات خاصة للتحضير (تُطبع في بون المطبخ والبار):</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: بدون ثلج، سكر خفيف، تسوية زيادة، صوص خارجي..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 focus:outline-none focus:border-brand dark:focus:border-brand-bright"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between shrink-0">
          <div>
            <div className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold">سعر الوحدة شامل الإضافات:</div>
            <div className="text-base font-black text-brand dark:text-brand-bright">
              {formatArabicCurrency(basePricePiasters + extraTotalPiasters)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-2.5 rounded-xl bg-brand dark:bg-brand-bright text-white dark:text-surface-dark text-xs font-black hover:opacity-95 flex items-center gap-1.5 cursor-pointer transition-opacity"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد وإضافة للسلة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
