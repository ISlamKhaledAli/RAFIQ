import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isFormDirty, isSameFormValue, normalizeFormValue } from '../src/utils/dirtyForm.ts';

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe('isFormDirty (pure helper)', () => {
  it('is clean when nothing differs and dirty on a real edit', () => {
    assert.equal(isFormDirty({ name: 'أحمد', phone: '0100' }, { name: 'أحمد', phone: '0100' }), false);
    assert.equal(isFormDirty({ name: 'أحمد', phone: '0100' }, { name: 'أحمد علي', phone: '0100' }), true);
  });

  it('trims strings and treats null, undefined and empty text as the same', () => {
    assert.equal(isFormDirty({ a: null, b: undefined, c: '' }, { a: '', b: '  ', c: undefined }), false);
    assert.equal(isFormDirty({ name: 'علي' }, { name: '  علي  ' }), false);
    assert.equal(isFormDirty({ name: '' }, { name: 'ع' }), true);
  });

  it('compares numeric text with numbers and ignores number formatting', () => {
    assert.equal(isSameFormValue('12.50', 12.5), true);
    assert.equal(isSameFormValue('5.0', '5'), true);
    assert.equal(isSameFormValue('0.50', 0.5), true);
    assert.equal(isSameFormValue('13', 12.5), false);
  });

  it('keeps codes with leading zeros exact', () => {
    assert.equal(isSameFormValue('007', '7'), false);
    assert.equal(isSameFormValue('007', '007'), true);
  });

  it('normalises Arabic and Persian digits', () => {
    assert.equal(isSameFormValue('٠١٠٠١٢٣', '0100123'), true);
    assert.equal(isSameFormValue('١٢٫٥', 12.5), true);
    assert.equal(isSameFormValue('۱۲۳', '123'), true);
    assert.equal(isSameFormValue('٠١٠٠١٢٣', '0100124'), false);
  });

  it('compares flat arrays without regard to order, but not their content', () => {
    assert.equal(isFormDirty({ tags: ['M', 'L'] }, { tags: ['L', 'M'] }), false);
    assert.equal(isFormDirty({ tags: ['M', 'L'] }, { tags: ['M'] }), true);
    assert.equal(isFormDirty({ tags: ['M'] }, { tags: ['M', 'XL'] }), true);
  });

  it('treats a missing key and an unchecked flag as equal but a checked flag as a change', () => {
    assert.equal(isFormDirty({ perms: { a: true } }, { perms: { a: true, b: false } }), false);
    assert.equal(isFormDirty({ perms: { a: true } }, { perms: { a: true, b: true } }), true);
    assert.equal(isFormDirty({ perms: { a: true } }, { perms: { a: false } }), true);
    assert.equal(isFormDirty({ flag: undefined }, { flag: false }), false);
    assert.equal(isFormDirty({ flag: false }, { flag: true }), true);
  });

  it('limits the comparison to the given keys', () => {
    const opened = { username: 'ali', pin: '' };
    const current = { username: 'sara', pin: '' };
    assert.equal(isFormDirty(opened, current, ['pin']), false);
    assert.equal(isFormDirty(opened, current, ['username']), true);
    assert.equal(isFormDirty(opened, current, []), false);
  });

  it('is order-insensitive for object keys', () => {
    assert.equal(normalizeFormValue({ a: 1, b: 2 }), normalizeFormValue({ b: 2, a: 1 }));
  });
});

describe('UserManagerModal dirty detection', () => {
  const source = read('components/UserManagerModal.tsx');

  it('no longer treats any pre-filled value as a change', () => {
    assert.ok(!/Boolean\(\s*username\.trim\(\)\s*\|\|\s*displayName\.trim\(\)\s*\|\|\s*pin\.trim\(\)/.test(source));
    assert.ok(!/username\.trim\(\) \|\|\s*\n\s*displayName\.trim\(\) \|\|\s*\n\s*pin\.trim\(\)/.test(source));
  });

  it('compares the current form with a snapshot taken when the form opened', () => {
    assert.match(source, /isFormDirty<StaffFormValues>\(\s*formBaseline,/);
    assert.match(source, /DIRTY_FIELDS_BY_MODE\[formMode\]/);
    assert.match(source, /setFormBaseline\(values\)/);
  });

  it('watches only the fields of the open mode', () => {
    assert.match(source, /edit: \['username', 'displayName', 'role', 'isActive'\]/);
    assert.match(source, /permissions: \['permissions'\]/);
    assert.match(source, /credentials: \['pin', 'confirmPin', 'currentCredential'\]/);
    assert.match(source, /ownerGrade: \['ownerGrade'\]/);
  });

  it('resets every field when a form starts or closes', () => {
    assert.match(source, /applyFormValues\(\{ \.\.\.EMPTY_FORM_VALUES, \.\.\.values \}\)/);
    assert.match(source, /applyFormValues\(EMPTY_FORM_VALUES\)/);
    for (const handler of ['handleStartAdd', 'handleStartEdit', 'handleStartPermissions', 'handleStartOwnerGrade', 'handleStartCredentials']) {
      const start = source.indexOf(`const ${handler} =`);
      assert.ok(start > 0, handler);
      assert.match(source.slice(start, start + 1200), /openForm\(/, handler);
    }
  });

  it('closes the form only through closeForm so no state outlives it', () => {
    assert.equal((source.match(/setFormMode\('none'\)/g) || []).length, 1);
  });
});

describe('fixed false-positive sites', () => {
  it('CategoryManagerModal: the rename row is dirty only when the name differs', () => {
    const source = read('components/CategoryManagerModal.tsx');
    assert.ok(!/editingId !== null\)/.test(source.replace(/\(editingId !== null && /, '')));
    assert.match(source, /isSameFormValue\(editingName, editingOriginalName\)/);
  });

  it('ExpenseModal: opening the cancel panel is not a change until a reason or PIN is typed', () => {
    const source = read('components/ExpenseModal.tsx');
    assert.match(source, /cancellingExpenseId !== null && Boolean\(cancelReason\.trim\(\) \|\| managerPin\.trim\(\)\)/);
  });

  it('CustomerFormModal: compares with the customer being edited', () => {
    const source = read('views/customers/CustomerFormModal.tsx');
    assert.match(source, /name: editingCustomer\?\.name/);
    assert.match(source, /isFormDirty\(/);
    assert.ok(!/Boolean\(name\.trim\(\) \|\| phone\.trim\(\)/.test(source));
  });

  it('SupplierFormModal: snapshot at open', () => {
    const source = read('views/purchases/SupplierFormModal.tsx');
    assert.match(source, /useFormBaseline\(isOpen, form\)/);
    assert.ok(!/form\.notes\.trim\(\) \|\|/.test(source));
  });

  it('SupplierPaymentModal: the pre-filled balance is the baseline', () => {
    const source = read('views/purchases/SupplierPaymentModal.tsx');
    assert.match(source, /useFormBaseline\(isOpen, \{ paymentAmountPiasters, paymentNotes \}/);
    assert.ok(!/const isDirty = paymentAmountPiasters > 0/.test(source));
  });

  it('LicenseModal: the loaded key is not a change and inputs are cleared on open', () => {
    const source = read('components/LicenseModal.tsx');
    assert.match(source, /isSameFormValue\(inputKey, license\?\.licenseKey\)/);
    assert.match(source, /setSupportCode\(''\);\s*\n\s*setTransferReason\(''\);/);
  });

  it('DailyClosingModal: the expected cash pre-filled by the preview is the baseline', () => {
    const source = read('components/DailyClosingModal.tsx');
    assert.match(source, /actualCashPiasters !== prefilledCashPiasters/);
    assert.ok(!/actualCashPiasters > 0 \|\| Boolean\(notes/.test(source));
  });

  it('QuickItemsManagerModal: snapshot taken by both openers', () => {
    const source = read('components/QuickItemsManagerModal.tsx');
    assert.equal((source.match(/setFormBaseline\(/g) || []).length, 2);
    assert.match(source, /isFormDirty\(formBaseline,/);
  });

  it('QuickAddProductModal: the pre-filled name and price are the baseline', () => {
    const source = read('components/QuickAddProductModal.tsx');
    assert.match(source, /name: initialName, priceEgp: initialPriceEgp/);
    assert.match(source, /setVariantSize\(''\);/);
  });

  it('BarcodeLabelModal: the queue it opened with is the baseline', () => {
    const source = read('components/BarcodeLabelModal.tsx');
    assert.match(source, /isFormDirty\(\{ queue: labelQueueSignature\(openedQueue\) \}/);
    assert.ok(!/const isDirty = queue\.length > 0/.test(source));
  });

  it('ProductVariantMatrixModal: dirty is measured from the opened matrix, not from "has cells"', () => {
    const source = read('components/ProductVariantMatrixModal.tsx');
    assert.match(source, /const isDirty = isFormDirty\(/);
    assert.ok(!/parentName\.trim\(\) \|\| activeCells\.length > 0/.test(source));
  });

  it('ItemDiscountModal: the existing line discount is the baseline', () => {
    const source = read('components/ItemDiscountModal.tsx');
    assert.match(source, /initialInputValue/);
    assert.ok(!/inputValue\.trim\(\) !== '' && inputValue\.trim\(\) !== '0'/.test(source));
  });

  it('StockAdjustmentModal, VoidInvoiceModal, ShiftModal: inputs reset on every opening', () => {
    assert.match(read('components/StockAdjustmentModal.tsx'), /setActualStockInput\(''\);/);
    assert.match(read('components/VoidInvoiceModal.tsx'), /setSupervisorPin\(''\);/);
    assert.match(read('components/ShiftModal.tsx'), /setCashInAmountPiasters\(0\);\s*\n\s*setCashInCustomReason\(''\);/);
  });

  it('MigrationWizardModal: choosing a step is not a change', () => {
    const source = read('components/MigrationWizardModal.tsx');
    assert.ok(!/step !== 'role_select' && step !== 'reconcile_step';/.test(source));
    assert.match(source, /step === 'import_step' && Boolean\(packagePath\.trim\(\) \|\| recoveryCode\.trim\(\) \|\| inspectResult\)/);
  });

  it('BulkMinStockModal and BulkPriceAdjustmentModal: defaults are the baseline', () => {
    const minStock = read('views/products/BulkMinStockModal.tsx');
    assert.match(minStock, /useFormBaseline\(isOpen, bulkMinStockValue\)/);
    assert.ok(!/bulkMinStockValue > 0;/.test(minStock));
    const price = read('views/products/BulkPriceAdjustmentModal.tsx');
    assert.match(price, /useFormBaseline\(isOpen, adjustmentValues\)/);
    assert.ok(!/percentageValue\.trim\(\) \|\| amountValue\.trim\(\)/.test(price));
  });

  it('BatchesTab: the quantity is compared as a number, not as text', () => {
    assert.match(read('views/products/BatchesTab.tsx'), /!isSameFormValue\(adjustQtyInput, initialQty\)/);
  });

  it('WalletsView: one snapshot for add and edit, no default name counted as typing', () => {
    const source = read('views/wallets/WalletsView.tsx');
    assert.match(source, /setAccountFormBaseline\(values\)/);
    assert.match(source, /isFormDirty<AccountFormValues>\(accountFormBaseline,/);
    assert.ok(!/accountFormBalance > 0 \|\|/.test(source));
  });

  it('EpayView: the suggested top-up amount is the baseline', () => {
    const source = read('views/epay/EpayView.tsx');
    assert.match(source, /useFormBaseline\(isFundingModalOpen, \{ fundingAmountPiasters, fundingNotes \}\)/);
    assert.ok(!/return fundingAmountPiasters > 0 \|\| fundingNotes/.test(source));
  });
});
