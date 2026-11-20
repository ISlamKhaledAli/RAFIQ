import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modalPath = path.resolve(__dirname, '../src/views/pos/InsurancePrescriptionModal.tsx');
const posViewPath = path.resolve(__dirname, '../src/views/PosView.tsx');
const saleModelPath = path.resolve(__dirname, '../../desktop/Models/Sale.cs');
const insuranceRepoPath = path.resolve(__dirname, '../../desktop/Repositories/InsuranceRepository.cs');

describe('Insurance Prescription Pricing & Co-pay Calculation (Senior POS Audit)', () => {
  it('InsurancePrescriptionModal maps cart items with unitPricePiasters, totalPiasters, and pricePiasters', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must map both unitPricePiasters and totalPiasters so backend CalculateSplit never receives 0
    assert.match(code, /unitPricePiasters:\s*i\.unitPricePiasters/);
    assert.match(code, /totalPiasters:\s*i\.totalPiasters/);
    assert.match(code, /pricePiasters:\s*i\.unitPricePiasters/);
  });

  it('SaleItem in C# includes PricePiasters alias fallback mapping to UnitPricePiasters', () => {
    const code = fs.readFileSync(saleModelPath, 'utf8');

    // JsonProperty("pricePiasters") must exist as a fallback for UnitPricePiasters
    assert.match(code, /\[JsonProperty\("pricePiasters"\)\]/);
    assert.match(code, /public long PricePiasters/);
  });

  it('InsuranceRepository CalculateSplit has database price fallback when unitPrice is zero', () => {
    const code = fs.readFileSync(insuranceRepoPath, 'utf8');

    // Query must retrieve price_piasters as fallback safeguard
    assert.match(code, /SELECT category_id,\s*price_piasters FROM products WHERE id = @pid/);
    assert.match(code, /it\.UnitPricePiasters = Convert\.ToInt64\(reader\["price_piasters"\]\);/);
  });

  it('PosView automatically keeps activeInsuranceClaim in sync when cart changes', () => {
    const code = fs.readFileSync(posViewPath, 'utf8');

    // Auto-sync effect must be present
    assert.match(code, /grossSubtotalPiasters !== activeInsuranceClaim\.totalInvoicePiasters/);
    assert.match(code, /insurance:calculateSplit/);
  });

  it('ensures zero emojis and design token compliance in InsurancePrescriptionModal', () => {
    const code = fs.readFileSync(modalPath, 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(code), false, 'File must not contain emojis');
    assert.equal(/<select[\s>]/.test(code), false, 'File must not use native <select>');
  });
});
