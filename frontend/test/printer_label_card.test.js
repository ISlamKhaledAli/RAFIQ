import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const tab = read('../src/views/settings/PrinterSettingsTab.tsx');
const cardStart = tab.indexOf('{/* Barcode label printer and sticker size */}');
const card = tab.slice(cardStart, tab.indexOf('{/* Right: Automation & Drawer Toggles */}'));

describe('barcode label card on the printer settings page', () => {
  it('sits in the left/first column next to the receipt printer, not under the whole page grid', () => {
    const gridStart = tab.indexOf('xl:grid-cols-2 gap-x-8');
    const rightColumn = tab.indexOf('{/* Right: Automation & Drawer Toggles */}');
    assert.ok(gridStart > 0 && cardStart > gridStart && cardStart < rightColumn, 'inside the first column of the page grid');
    assert.ok(!tab.includes('Feature #57: Barcode Label Printer Settings'), 'the old full-width section is gone');
  });

  it('keeps the same state, handlers and saved keys', () => {
    assert.ok(card.includes('value={labelPrinter}') && card.includes('onChange={(val) => setLabelPrinter(val)}'));
    assert.ok(card.includes('setLabelPaperSize(opt.value)'));
    assert.ok(card.includes('onClick={handleTestLabel}') && card.includes('loading={labelTestPrinting}') && card.includes('disabled={printersList.length === 0}'), 'the test button is disabled while printing (loading) or without printers');
    assert.ok(tab.includes("invoke<{ success: boolean; message: string; printerUsed: string }>('printer:testLabel'"));
    assert.ok(tab.includes('printerName: labelPrinter || selectedPrinter') && tab.includes('paperSize: labelPaperSize'));
    const extras = read('../src/views/settings/usePrinterExtras.ts');
    assert.ok(extras.includes('default_label_printer_name: labelPrinter') && extras.includes('labelPaperSize'));
    assert.ok(extras.includes('[labelPrinter, labelPaperSize]'), 'dirty tracking still covers both choices');
  });

  it('offers every size the host knows as a visual option card with a selected state', () => {
    for (const v of ['38x25', '40x30', '50x25', '50x30', '50x40', 'a4_24', 'a4_40']) assert.ok(tab.includes(`value: '${v}'`), v);
    assert.ok(card.includes('role="radiogroup"') && card.includes('role="radio"') && card.includes('aria-checked={isSelected}'));
    assert.ok(card.includes('ring-1 ring-brand/30') && card.includes('<CheckCircle'));
    assert.ok(card.includes('<LabelSizePreview option={opt} />'));
    assert.ok(!card.includes('<select'), 'no native select');
  });

  it('shows the printer that will really be used, in the same order as the host', () => {
    assert.ok(tab.includes("labelPrinter ? 'chosen' : selectedPrinter ? 'receipt' : 'windows'"));
    assert.ok(tab.includes('labelPrinter || selectedPrinter || printersList.find((p) => p.isDefault)?.name'));
    const cs = read('../../desktop/Services/BarcodeLabelService.cs');
    const chosen = cs.indexOf('"default_label_printer_name"');
    const receipt = cs.indexOf('"default_printer_name"');
    const windows = cs.indexOf('new PrinterSettings().PrinterName');
    assert.ok(chosen > 0 && chosen < receipt && receipt < windows);
  });

  it('is responsive and token-only: stacks when narrow, no hex colors or emoji', () => {
    assert.ok(card.includes('grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(card) && !/\p{Extended_Pictographic}/u.test(card));
    assert.ok(/text-ink dark:text-ink-dark/.test(card) && !/\b(slate|gray)-\d/.test(card));
  });

  it('the save bar stays one full-width block after the kitchen routing and still carries the guard ref', () => {
    const kot = tab.indexOf('Feature #198: Kitchen & Bar KOT Printer Routing');
    const save = tab.indexOf('ref={saveBarRef}');
    assert.ok(kot > 0 && save > kot);
    assert.equal(tab.split('ref={saveBarRef}').length - 1, 1);
    assert.ok(tab.includes('onClick={() => void onSavePrinterSettings()}') && tab.includes('<UnsavedChangesChip dirty={dirty} />'));
  });
});
