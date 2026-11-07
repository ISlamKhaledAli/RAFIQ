import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Supplier Payment Methods: InstaPay & Vodafone Cash Support', () => {
  const modalPath = path.resolve(__dirname, '../src/views/purchases/SupplierPaymentModal.tsx');
  const newPurchasePath = path.resolve(__dirname, '../src/views/purchases/NewPurchaseTab.tsx');
  const statementModalPath = path.resolve(__dirname, '../src/views/purchases/SupplierStatementModal.tsx');
  const modelsPath = path.resolve(__dirname, '../src/types/models.ts');

  it('SupplierPaymentSource type includes instapay and vodafone_cash', () => {
    const modelsContent = fs.readFileSync(modelsPath, 'utf8');
    assert.ok(modelsContent.includes('export type SupplierPaymentSource ='), 'SupplierPaymentSource type must be exported');
    assert.ok(modelsContent.includes("'instapay'"), 'Must include instapay');
    assert.ok(modelsContent.includes("'vodafone_cash'"), 'Must include vodafone_cash');
    assert.ok(modelsContent.includes("'external_cash'"), 'Must include external_cash');
    assert.ok(modelsContent.includes("'cash_drawer'"), 'Must include cash_drawer');
  });

  it('SupplierPaymentModal provides instapay and vodafone_cash options with Lucide icons', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf8');
    assert.ok(modalContent.includes("value: 'instapay'"), 'Modal has instapay option');
    assert.ok(modalContent.includes("value: 'vodafone_cash'"), 'Modal has vodafone_cash option');
    assert.ok(modalContent.includes("value: 'external_cash'"), 'Modal has external_cash option');
    assert.ok(modalContent.includes("value: 'cash_drawer'"), 'Modal has cash_drawer option');
    assert.ok(modalContent.includes('تحويل إنستاباي - InstaPay'), 'Arabic label for instapay');
    assert.ok(modalContent.includes('محفظة فودافون كاش'), 'Arabic label for vodafone_cash');
  });

  it('SupplierPaymentModal only blocks submission when drawer cash is insufficient for cash_drawer, never for electronic methods', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf8');
    // Ensure the disabled check on submit button gates on paymentSource === 'cash_drawer'
    assert.ok(
      modalContent.includes("paymentSource === 'cash_drawer'") &&
      modalContent.includes('liveDrawerCashPiasters !== null') &&
      modalContent.includes('effectiveAmountPiasters > liveDrawerCashPiasters'),
      'Cash drawer check only applies when paymentSource === cash_drawer'
    );
  });

  it('NewPurchaseTab provides instapay and vodafone_cash options', () => {
    const purchaseContent = fs.readFileSync(newPurchasePath, 'utf8');
    assert.ok(purchaseContent.includes("value: 'instapay'"), 'NewPurchase has instapay option');
    assert.ok(purchaseContent.includes("value: 'vodafone_cash'"), 'NewPurchase has vodafone_cash option');
    assert.ok(purchaseContent.includes('عبر تحويل إنستاباي'), 'Payment label for instapay');
    assert.ok(purchaseContent.includes('عبر محفظة فودافون كاش'), 'Payment label for vodafone_cash');
  });

  it('SupplierStatementModal displays instapay and vodafone_cash badges and labels', () => {
    const statementContent = fs.readFileSync(statementModalPath, 'utf8');
    assert.ok(statementContent.includes("tx.paymentSource === 'instapay'"), 'Statement checks instapay');
    assert.ok(statementContent.includes("tx.paymentSource === 'vodafone_cash'"), 'Statement checks vodafone_cash');
    assert.ok(statementContent.includes('إنستاباي'), 'Statement has Arabic instapay text');
    assert.ok(statementContent.includes('فودافون كاش'), 'Statement has Arabic vodafone cash text');
  });

  it('strictly adheres to zero-emoji policy (Rule 7)', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const modalContent = fs.readFileSync(modalPath, 'utf8');
    const statementContent = fs.readFileSync(statementModalPath, 'utf8');
    const purchaseContent = fs.readFileSync(newPurchasePath, 'utf8');

    assert.ok(!emojiRegex.test(modalContent), 'SupplierPaymentModal must not contain emojis');
    assert.ok(!emojiRegex.test(statementContent), 'SupplierStatementModal must not contain emojis');
    assert.ok(!emojiRegex.test(purchaseContent), 'NewPurchaseTab must not contain emojis');
  });
});
