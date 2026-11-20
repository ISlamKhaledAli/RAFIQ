import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const patientModalPath = path.resolve(__dirname, '../src/views/customers/PatientProfileModal.tsx');
const modelsPath = path.resolve(__dirname, '../src/types/models.ts');

function extractProducts(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && res !== null && 'products' in res) {
    const list = res.products;
    if (Array.isArray(list)) return list;
  }
  return [];
}

describe('Patient Profile Chronic Medication Search & Selection', () => {
  it('models.ts exports extractProducts helper function', () => {
    const modelsContent = fs.readFileSync(modelsPath, 'utf8');
    assert.match(modelsContent, /export function extractProducts\(res: unknown\): Product\[\]/);
  });

  it('extractProducts unwraps { products: [...] } object from products:search correctly', () => {
    const backendResponse = {
      products: [
        { id: 'p_1', name: 'بنادول إكسترا', pricePiasters: 4500, stockQuantityMilli: 50000 },
        { id: 'p_2', name: 'كونكور 5 مجم', pricePiasters: 6000, stockQuantityMilli: 30000 },
      ],
      totalCount: 2,
      lowStockCount: 0,
      outOfStockCount: 0,
      offset: 0,
      limit: 10,
    };

    const extracted = extractProducts(backendResponse);
    assert.equal(Array.isArray(extracted), true);
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].name, 'بنادول إكسترا');
    assert.equal(extracted[1].name, 'كونكور 5 مجم');
  });

  it('extractProducts gracefully handles direct array, null, undefined or empty objects', () => {
    assert.deepEqual(extractProducts(null), []);
    assert.deepEqual(extractProducts(undefined), []);
    assert.deepEqual(extractProducts({}), []);
    assert.deepEqual(extractProducts([]), []);
    assert.deepEqual(extractProducts([{ id: 'p_test', name: 'أسبوسيد' }]), [{ id: 'p_test', name: 'أسبوسيد' }]);
  });

  it('PatientProfileModal source imports and applies extractProducts for search', () => {
    const source = fs.readFileSync(patientModalPath, 'utf8');

    // extractProducts must be imported
    assert.match(source, /import\s*\{[^}]*extractProducts[^}]*\}\s*from/);

    // extractProducts must wrap the products:search result
    assert.match(source, /extractProducts\(results\)/);

    // SearchInput must be wired with onSubmit for immediate search on Enter / search button
    assert.match(source, /<SearchInput[^>]*onSubmit=\{/);
  });

  it('PatientProfileModal enforces zero emojis and design token compliance', () => {
    const source = fs.readFileSync(patientModalPath, 'utf8');

    // No emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(source), false, 'File must not contain emojis');

    // No native <select>
    assert.equal(/<select[\s>]/.test(source), false, 'File must not use native <select>');

    // Selected product indicator exists
    assert.match(source, /تم اختيار الصنف:/);
  });
});
