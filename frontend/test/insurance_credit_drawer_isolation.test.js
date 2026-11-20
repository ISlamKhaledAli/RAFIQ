import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const posViewPath = path.resolve(__dirname, '../src/views/PosView.tsx');
const saleServicePath = path.resolve(__dirname, '../../desktop/Services/SaleService.cs');
const drawerCalcPath = path.resolve(__dirname, '../../desktop/Services/DrawerCashCalculator.cs');
const dailyClosingPath = path.resolve(__dirname, '../../desktop/Services/DailyClosingService.cs');
const shiftRepoPath = path.resolve(__dirname, '../../desktop/Repositories/ShiftRepository.cs');
const reportsServicePath = path.resolve(__dirname, '../../desktop/Services/ReportsService.cs');
const migrationPath = path.resolve(__dirname, '../../desktop/Database/MigrationRunner.OnlineStore.cs');

describe('Senior Architecture Invariant: Insurance Credit Sale Drawer Isolation (Zero Cash Leak)', () => {
  it('1. PosView classifies insurance credit sales as paymentMethod insurance, preventing credit cash misattribution', () => {
    const code = fs.readFileSync(posViewPath, 'utf8');

    // When activeInsuranceClaim is present, pure credit patient co-pay defaults to 'insurance' (not 'credit')
    assert.match(code, /if \(hasCredit && hasNonCreditPatient\) \{\s*finalPaymentMethod = 'multi';\s*\} else \{\s*finalPaymentMethod = 'insurance';\s*\}/);
    assert.match(code, /paymentMethod: activeInsuranceClaim \? 'insurance' : \(isCredit \? 'credit' : paymentMethod\)/);
  });

  it('2. SaleService in C# enforces sale.PaymentMethod = "insurance" for any sale with an attached insurance claim', () => {
    const code = fs.readFileSync(saleServicePath, 'utf8');

    assert.match(code, /sale\.PaymentMethod = "insurance";/);
  });

  it('3. DrawerCashCalculator isolates insurance corporate receivables from physical cash drawer', () => {
    const code = fs.readFileSync(drawerCalcPath, 'utf8');

    // Drawer cash query must check for insurance claim lines and payments table insurance records
    assert.match(code, /WHEN s\.payment_method = 'insurance'\s+OR EXISTS \(SELECT 1 FROM insurance_claim_lines icl WHERE icl\.sale_id = s\.id\)\s+OR EXISTS \(SELECT 1 FROM payments p WHERE p\.sale_id = s\.id AND p\.method = 'insurance'\)/);

    // Credit sales with payment breakdown in payments table must only add cash rows to drawer
    assert.match(code, /WHEN s\.payment_method = 'credit' THEN\s+CASE\s+WHEN EXISTS \(SELECT 1 FROM payments p WHERE p\.sale_id = s\.id\) THEN/);
  });

  it('4. DailyClosingService isolates insurance sales from cash sales and counts them under insurance_sales', () => {
    const code = fs.readFileSync(dailyClosingPath, 'utf8');

    assert.match(code, /WHEN s\.payment_method IN \('multi', 'insurance'\)\s+OR EXISTS \(SELECT 1 FROM insurance_claim_lines icl WHERE icl\.sale_id = s\.id\)\s+OR EXISTS \(SELECT 1 FROM payments p WHERE p\.sale_id = s\.id AND p\.method = 'insurance'\)/);
    assert.match(code, /AS insurance_sales/);
  });

  it('5. ShiftRepository and ReportsService include insurance sales in multi-split logic', () => {
    const shiftCode = fs.readFileSync(shiftRepoPath, 'utf8');
    const reportsCode = fs.readFileSync(reportsServicePath, 'utf8');

    assert.match(shiftCode, /WHEN s\.payment_method IN \('multi', 'insurance'\)/);
    assert.match(reportsCode, /WHEN s\.payment_method IN \('multi', 'insurance'\)/);
  });

  it('6. Migration 68 retrofits historical insurance sales saved with payment_method credit', () => {
    const code = fs.readFileSync(migrationPath, 'utf8');

    assert.match(code, /ApplyMigration68/);
    assert.match(code, /UPDATE sales\s+SET payment_method = 'insurance'\s+WHERE payment_method = 'credit'/);
    assert.match(code, /VALUES \(68, 'Retrofit Insurance Sales Payment Method & Cash Drawer Isolation \(Feature #189\)'/);
  });
});
