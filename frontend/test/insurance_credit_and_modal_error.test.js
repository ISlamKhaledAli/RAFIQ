import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const insuranceContractsViewPath = path.resolve(__dirname, '../src/views/insurance/InsuranceContractsView.tsx');
const paymentModalPath = path.resolve(__dirname, '../src/components/PaymentModal.tsx');
const posViewPath = path.resolve(__dirname, '../src/views/PosView.tsx');
const salesHistoryViewPath = path.resolve(__dirname, '../src/views/SalesHistoryView.tsx');
const receiptLayoutPath = path.resolve(__dirname, '../src/utils/receiptLayout.ts');
const saleServicePath = path.resolve(__dirname, '../../desktop/Services/SaleService.cs');
const saleRepoPath = path.resolve(__dirname, '../../desktop/Repositories/SaleRepository.cs');
const printerServicePath = path.resolve(__dirname, '../../desktop/Services/PrinterService.cs');

describe('Insurance Claims, Modal Error Visibility & Patient Co-pay Credit Audit', () => {
  it('Issue 1: InsuranceContractsView renders modalError inside modals and clears on close/cancel', () => {
    const code = fs.readFileSync(insuranceContractsViewPath, 'utf8');

    // modalError state must exist
    assert.match(code, /const \[modalError, setModalError\] = useState<string \| null>\(null\);/);
    assert.match(code, /const renderModalError = \(\) =>/);

    // renderModalError must be rendered inside batch creation and other modals
    assert.match(code, /\{renderModalError\(\)\}/);

    // Validation inside handleCreateBatch must use setModalError rather than background setError
    assert.match(code, /setModalError\('يرجى تحديد فاتورة واحدة على الأقل لإدراجها في المطالبة'\)/);

    // Modals must clear modalError when closed or cancelled
    assert.match(code, /setShowBatchModal\(false\);\s*setModalError\(null\);/);
  });

  it('Issue 2: PaymentModal allocates patient co-pay to credit and displays clear debt notice', () => {
    const code = fs.readFileSync(paymentModalPath, 'utf8');

    // Accepts insuranceClaim prop
    assert.match(code, /insuranceClaim\?: InsuranceClaimLine \| null/);

    // Allocates patientPiasters to credit
    assert.match(code, /creditAmt\s*=\s*insuranceClaim\s*\?\s*insuranceClaim\.patientPiasters/);
    assert.match(code, /amountPiasters:\s*creditAmt/);

    // Displays insurance summary card with breakdown
    assert.match(code, /روشتة تأمين:/);
    assert.match(code, /تغطية التأمين:/);
    assert.match(code, /تحمل المريض:/);
  });

  it('Issue 2: PosView partitions insurance and patient credit/cash payments properly', () => {
    const code = fs.readFileSync(posViewPath, 'utf8');

    // Passes insuranceClaim to PaymentModal
    assert.match(code, /insuranceClaim=\{activeInsuranceClaim\}/);

    // handleFastCashCheckout preserves credit method when activeInsuranceClaim is present
    assert.match(code, /const isCredit = paymentMethod === 'credit';/);
    assert.match(code, /amountPiasters:\s*activeInsuranceClaim \? activeInsuranceClaim\.patientPiasters : 0/);

    // handleConfirmPayment correctly builds dual payment breakdown (insurance company + patient share)
    assert.match(code, /method:\s*'insurance',\s*amountPiasters:\s*activeInsuranceClaim\.companyPiasters/);
    assert.match(code, /method:\s*'credit',\s*amountPiasters:\s*activeInsuranceClaim\.patientPiasters/);

    // Retains partial patient payments (cash + credit) entered in PaymentModal
    assert.match(code, /const patientPayments = paymentsToSend\.filter\(p => p\.method !== 'insurance'\);/);
    assert.match(code, /hasCredit && hasNonCreditPatient/);
    assert.match(code, /finalPaymentMethod = 'multi';/);
  });

  it('Issue 2: SaleService in C# calculates patient credit debt and does not zero debt or mark cash payment', () => {
    const code = fs.readFileSync(saleServicePath, 'utf8');

    // Detects patient credit payment and calculates creditDue
    assert.match(code, /bool isCreditMethod =/);
    assert.match(code, /hasCreditPayment = true;/);
    assert.match(code, /long creditDue = Math\.Max\(0, split\.PatientPiasters/);

    // PaidPiasters only includes non-credit payments (insurance company coverage)
    assert.match(code, /sale\.PaidPiasters = totalNonCreditInPayments;/);

    // Expected debt check matches sumCredit
    assert.match(code, /long expectedDebt = Math\.Max\(0, sale\.TotalPiasters - \(sale\.PaidPiasters - sale\.ServiceFeePiasters\)\);/);
  });

  it('Issue 3: SalesHistoryView has insurance status filter, search matching, badges, and breakdown modal', () => {
    const code = fs.readFileSync(salesHistoryViewPath, 'utf8');

    // Filter by insurance
    assert.match(code, /statusFilter === 'insurance'/);
    assert.match(code, /فواتير تأمين/);

    // Search query matches company name, patient name, and card number
    assert.match(code, /s\.insuranceClaim\?\.companyName/);
    assert.match(code, /s\.insuranceClaim\?\.patientName/);
    assert.match(code, /s\.insuranceClaim\?\.memberNo/);

    // Table rows display insurance badges and totals
    assert.match(code, /تأمين طبي/);
    assert.match(code, /تحمل آجل/);
    assert.match(code, /تأمين:.*مريض:/);

    // Details modal shows Insurance Details Card and breakdown
    assert.match(code, /بيانات التعاقد والتأمين الطبي/);
    assert.match(code, /تغطية شركة التأمين \(مطالبة معتمدة\)/);
    assert.match(code, /حصة تحمل المريض المطلوبة/);
  });

  it('Issue 3: SaleRepository loads and maps insurance claim details on sales queries', () => {
    const code = fs.readFileSync(saleRepoPath, 'utf8');

    // Left join insurance_claim_lines in GetRecentSales and SearchSales
    assert.match(code, /LEFT JOIN insurance_claim_lines icl ON icl\.sale_id = s\.id/);
    assert.match(code, /insurance_company_name/);
    assert.match(code, /insurance_patient_name/);

    // Populates sale.InsuranceClaim
    assert.match(code, /sale\.InsuranceClaim =/);
  });

  it('Issue 3: Thermal prints and receipt layout include insurance badge and coverage deduction', () => {
    const printerCode = fs.readFileSync(printerServicePath, 'utf8');
    const layoutCode = fs.readFileSync(receiptLayoutPath, 'utf8');

    // PrinterService
    assert.match(printerCode, /تأمين طبي - تعاقد/);
    assert.match(printerCode, /تغطية شركة التأمين/);
    assert.match(printerCode, /تحمل المريض المطلوب/);

    // ReceiptLayout
    assert.match(layoutCode, /تأمين طبي - تعاقد/);
    assert.match(layoutCode, /تغطية شركة التأمين/);
    assert.match(layoutCode, /تحمل المريض المطلوب/);
  });

  it('Strict Invariants: Zero emojis and no native select in touched components', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(fs.readFileSync(insuranceContractsViewPath, 'utf8')), false);
    assert.equal(emojiRegex.test(fs.readFileSync(paymentModalPath, 'utf8')), false);
    assert.equal(emojiRegex.test(fs.readFileSync(salesHistoryViewPath, 'utf8')), false);

    assert.equal(/<select[\s>]/.test(fs.readFileSync(insuranceContractsViewPath, 'utf8')), false);
    assert.equal(/<select[\s>]/.test(fs.readFileSync(paymentModalPath, 'utf8')), false);
    assert.equal(/<select[\s>]/.test(fs.readFileSync(salesHistoryViewPath, 'utf8')), false);
  });
});
