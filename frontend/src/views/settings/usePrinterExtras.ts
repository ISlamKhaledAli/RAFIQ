import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { invoke } from '../../bridge/ipc';
import { rafiqAlert } from '../../utils/dialogService';
import type { CategoryKotRoute, KotRoutingConfig } from '../../types/cafe';

export interface PrinterExtras {
  labelPrinter: string;
  setLabelPrinter: Dispatch<SetStateAction<string>>;
  labelPaperSize: string;
  setLabelPaperSize: Dispatch<SetStateAction<string>>;
  kotKitchenPrinter: string;
  setKotKitchenPrinter: Dispatch<SetStateAction<string>>;
  kotBarPrinter: string;
  setKotBarPrinter: Dispatch<SetStateAction<string>>;
  kotAutoPrintOnSale: boolean;
  setKotAutoPrintOnSale: Dispatch<SetStateAction<boolean>>;
  kotCategoryRoutes: CategoryKotRoute[];
  setKotCategoryRoutes: Dispatch<SetStateAction<CategoryKotRoute[]>>;
  /** true when the barcode-label or kitchen routing choices differ from what is saved */
  dirty: boolean;
  /** Saves both groups; false when any of them failed (each failure is already shown to the user) */
  save: (paperWidth: '80mm' | '57mm' | 'a4') => Promise<boolean>;
}

/**
 * Barcode-label printer and kitchen (KOT) routing choices of the printer settings.
 * They live in the settings page, not in the tab, so a sub-tab switch cannot lose them.
 */
export function usePrinterExtras(showKotPrinter: boolean): PrinterExtras {
  const [labelPrinter, setLabelPrinter] = useState('');
  const [labelPaperSize, setLabelPaperSize] = useState('38x25');
  const [kotKitchenPrinter, setKotKitchenPrinter] = useState('');
  const [kotBarPrinter, setKotBarPrinter] = useState('');
  const [kotAutoPrintOnSale, setKotAutoPrintOnSale] = useState(true);
  const [kotCategoryRoutes, setKotCategoryRoutes] = useState<CategoryKotRoute[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  // Only the newest read may apply its result (a discard can start a second read while the first is running)
  const loadSeq = useRef(0);

  // Kitchen routing is part of the form only while the feature is on
  const snapshot = JSON.stringify(
    showKotPrinter
      ? [labelPrinter, labelPaperSize, kotKitchenPrinter, kotBarPrinter, kotAutoPrintOnSale, kotCategoryRoutes]
      : [labelPrinter, labelPaperSize],
  );
  const dirty = baseline !== null && snapshot !== baseline;

  useEffect(() => {
    if (loaded && baseline === null) setBaseline(snapshot);
  }, [loaded, baseline, snapshot]);

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoaded(false);
    setBaseline(null);
    try {
      const settings = await invoke<Record<string, string>>('settings:getAll');
      if (seq !== loadSeq.current) return;
      if (settings) {
        setLabelPrinter(settings.default_label_printer_name ?? '');
        setLabelPaperSize(settings.default_label_paper_size || '38x25');
      }
    } catch (err: unknown) {
      console.error('Failed to read the label printer settings:', err);
    }
    if (showKotPrinter) {
      try {
        const kotCfg = await invoke<KotRoutingConfig>('printer:getKOTRouting', {});
        if (seq !== loadSeq.current) return;
        if (kotCfg) {
          setKotKitchenPrinter(kotCfg.kitchenPrinterName || '');
          setKotBarPrinter(kotCfg.barPrinterName || '');
          setKotAutoPrintOnSale(kotCfg.autoPrintOnSale !== false);
          setKotCategoryRoutes(kotCfg.categoryRoutes || []);
        }
      } catch (err: unknown) {
        console.error('Failed to read the kitchen printer routing:', err);
      }
    }
    if (seq === loadSeq.current) setLoaded(true);
  }, [showKotPrinter]);

  useEffect(() => {
    void reload();
    return () => {
      loadSeq.current += 1;
    };
  }, [reload]);

  const save = async (paperWidth: '80mm' | '57mm' | 'a4'): Promise<boolean> => {
    const savedSnapshot = snapshot;
    let ok = true;
    try {
      await invoke('settings:updateBatch', {
        settings: {
          default_label_printer_name: labelPrinter,
          default_label_paper_size: labelPaperSize,
        },
      });
    } catch (err: unknown) {
      ok = false;
      void rafiqAlert({
        title: 'فشل حفظ طابعة الملصقات',
        message: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
    if (showKotPrinter) {
      try {
        await invoke('printer:saveKOTRouting', {
          kitchenPrinterName: kotKitchenPrinter,
          barPrinterName: kotBarPrinter,
          paperWidth: paperWidth === '57mm' ? '57mm' : '80mm',
          autoPrintOnSale: kotAutoPrintOnSale,
          singlePrinterCutBetweenStations: true,
          categoryRoutes: kotCategoryRoutes,
        });
      } catch (err: unknown) {
        ok = false;
        void rafiqAlert({
          title: 'فشل حفظ توجيه طابعات المطبخ',
          message: err instanceof Error ? err.message : String(err),
          variant: 'error',
        });
      }
    }
    if (ok) setBaseline(savedSnapshot);
    return ok;
  };

  return {
    labelPrinter,
    setLabelPrinter,
    labelPaperSize,
    setLabelPaperSize,
    kotKitchenPrinter,
    setKotKitchenPrinter,
    kotBarPrinter,
    setKotBarPrinter,
    kotAutoPrintOnSale,
    setKotAutoPrintOnSale,
    kotCategoryRoutes,
    setKotCategoryRoutes,
    dirty,
    save,
  };
}
