import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

const readSrc = (rel) => fs.readFileSync(path.join(srcDir, rel), 'utf-8');

describe('Senior Architecture: تعديل سعر بيع الصنف يدوياً أثناء البيع (pos.price_override)', () => {
  it('1. ItemPriceOverrideModal follows senior standards and invariants', () => {
    const modal = readSrc('views/pos/ItemPriceOverrideModal.tsx');

    // Zero Emojis check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(modal), false, 'ItemPriceOverrideModal must have zero emojis');

    // Design Tokens & Dark Mode check
    assert.ok(modal.includes('bg-surface dark:bg-surface-dark'), 'Must use themed surface token');
    assert.ok(modal.includes('border-line dark:border-line-dark'), 'Must use themed line token');
    assert.ok(modal.includes('text-ink dark:text-ink-dark'), 'Must use themed ink token');
    assert.ok(modal.includes('text-paid dark:text-paid-bright'), 'Must use themed paid token for discounts');
    assert.ok(modal.includes('text-warn dark:text-warn-bright'), 'Must use themed warn token for warnings');

    // Integer Financial Arithmetic & MoneyInput
    assert.ok(modal.includes('MoneyInput'), 'Must use MoneyInput component');
    assert.ok(modal.includes('calculateLineTotal'), 'Must use integer calculateLineTotal');
    assert.ok(modal.includes('formatArabicCurrency'), 'Must format currency properly');

    // Below Cost Warning
    assert.ok(modal.includes('isBelowCost'), 'Must calculate isBelowCost condition');
    assert.ok(modal.includes('سعر البيع الجديد أقل من تكلفة شراء الصنف'), 'Must alert when price is below cost');

    // Supervisor Authorization Guard
    assert.ok(modal.includes('canOverridePrice'), 'Must check canOverridePrice permission');
    assert.ok(modal.includes('onRequestSupervisor'), 'Must request supervisor PIN when user lacks permission');
    assert.ok(modal.includes('مطلوب PIN'), 'Must show supervisor PIN notice when needed');

    // Restore Original Catalog Price
    assert.ok(modal.includes('onResetToCatalogPrice'), 'Must support restoring original catalog price');
    assert.ok(modal.includes('استعادة الأصلي'), 'Must have button to reset to catalog price');
  });

  it('2. PosCartTable renders interactive price override and modification indicator', () => {
    const table = readSrc('views/pos/PosCartTable.tsx');

    assert.ok(table.includes('onOpenPriceOverride?: (index: number) => void;'), 'PosCartTableProps must include onOpenPriceOverride');
    assert.ok(table.includes('isPriceOverridden'), 'Must track whether price is overridden from catalog');
    assert.ok(table.includes('catalogPricePiasters'), 'Must check catalogPricePiasters against unitPricePiasters');
    assert.ok(table.includes('معدل'), 'Must display "معدل" badge when price is overridden');
    assert.ok(table.includes('Pencil'), 'Must display subtle Pencil icon on hover for editable price');
  });

  it('3. usePosShortcuts supports Alt+P / Alt+ح shortcut for selected cart item', () => {
    const shortcuts = readSrc('views/pos/usePosShortcuts.ts');

    assert.ok(shortcuts.includes('onOpenPriceOverride'), 'usePosShortcuts must accept onOpenPriceOverride prop');
    assert.ok(shortcuts.includes("e.altKey && (e.key.toLowerCase() === 'p' || e.key === 'ح')"), 'Must trigger on Alt+P or Alt+ح');
  });

  it('4. KeyboardShortcutsModal documents Alt+P shortcut for users', () => {
    const shortcutsModal = readSrc('components/KeyboardShortcutsModal.tsx');

    assert.ok(shortcutsModal.includes('Alt + P'), 'Shortcuts guide must document Alt + P');
    assert.ok(shortcutsModal.includes('تعديل سعر بيع الصنف المحدد'), 'Must describe price override shortcut');
  });

  it('5. PosView wires ItemPriceOverrideModal with atomic updates and supervisor PIN', () => {
    const pos = readSrc('views/PosView.tsx');

    assert.ok(pos.includes('ItemPriceOverrideModal'), 'PosView must import ItemPriceOverrideModal');
    assert.ok(pos.includes('isPriceOverrideModalOpen'), 'PosView must track isPriceOverrideModalOpen');
    assert.ok(pos.includes('handleApplyItemPriceOverride'), 'PosView must have handleApplyItemPriceOverride handler');
    assert.ok(pos.includes('handleResetToCatalogPrice'), 'PosView must have handleResetToCatalogPrice handler');
    assert.ok(pos.includes('canOverridePrice'), 'Must pass canOverridePrice to ItemPriceOverrideModal');
    assert.ok(pos.includes('موافقة المشرف على تعديل سعر صنف'), 'Supervisor prompt must have clear Arabic title');
  });
});

