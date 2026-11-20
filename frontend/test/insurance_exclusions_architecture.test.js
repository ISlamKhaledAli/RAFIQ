import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const insuranceContractsViewPath = path.resolve(__dirname, '../src/views/insurance/InsuranceContractsView.tsx');
const insuranceTypesPath = path.resolve(__dirname, '../src/types/insurance.ts');
const insuranceModelPath = path.resolve(__dirname, '../../desktop/Models/Insurance.cs');
const insuranceRepoPath = path.resolve(__dirname, '../../desktop/Repositories/InsuranceRepository.cs');
const insuranceTestRunnerPath = path.resolve(__dirname, '../../desktop/Services/InsuranceTestRunner.cs');

describe('Senior Architecture: منظومة استثناءات فئات وأصناف عقود التأمين الطبي', () => {
  it('1. InsuranceContractsView supports dual exclusions (Categories & Specific Products) with dedicated sub-tabs and counters', () => {
    const code = fs.readFileSync(insuranceContractsViewPath, 'utf8');

    // Section title & description
    assert.match(code, /استثناءات التغطية التأمينية \(تحمل المريض 100%\)/);
    assert.match(code, /حدد الفئات أو الأصناف الفردية التي لا يشملها هذا العقد/);

    // State for exclusions editor
    assert.match(code, /const \[availableCategories, setAvailableCategories\] = useState<Category\[\]>\(\[\]\);/);
    assert.match(code, /const \[exclusionSubTab, setExclusionSubTab\] = useState<'categories' \| 'products'>\('categories'\);/);
    assert.match(code, /const \[selectedCategoryIdToAdd, setSelectedCategoryIdToAdd\] = useState<string>\(''\);/);
    assert.match(code, /const \[productSearchTerm, setProductSearchTerm\] = useState<string>\(''\);/);

    // Sub-tab switcher for both categories and products
    assert.match(code, /استثناء فئات كاملة/);
    assert.match(code, /استثناء أصناف محددة/);

    // Category exclusion logic and custom select
    assert.match(code, /handleAddCategoryExclusion/);
    assert.match(code, /<CustomSelect[\s\S]*?placeholder="اختر فئة لإضافتها لقائمة الاستثناءات\.\.\."/);
    assert.match(code, /تلميح سريع: استثناء فئة مستحضرات التجميل تلقائياً/);

    // Product live search and add logic
    assert.match(code, /handleProductSearchChange/);
    assert.match(code, /handleAddProductExclusion/);
    assert.match(code, /handleRemoveExclusion/);
    assert.match(code, /products:search/);

    // Displays exclusions count badge on company cards
    assert.match(code, /استثناءات:/);
    assert.match(code, /تغطية شاملة/);
  });

  it('2. Enforces Zero Emojis and Design Token Compliance in InsuranceContractsView', () => {
    const code = fs.readFileSync(insuranceContractsViewPath, 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(code), false, 'InsuranceContractsView must not contain emojis (Rule 7)');
    assert.equal(/<select[\s>]/.test(code), false, 'InsuranceContractsView must not use native <select> (Rule 6)');
  });

  it('3. TypeScript and C# Models include full exclusion metadata (ProductBarcode & ProductPricePiasters)', () => {
    const tsCode = fs.readFileSync(insuranceTypesPath, 'utf8');
    assert.match(tsCode, /productBarcode\?: string \| null;/);
    assert.match(tsCode, /productPricePiasters\?: number \| null;/);

    const csCode = fs.readFileSync(insuranceModelPath, 'utf8');
    assert.match(csCode, /\[JsonProperty\("productBarcode"\)\]/);
    assert.match(csCode, /\[JsonProperty\("productPricePiasters"\)\]/);
  });

  it('4. InsuranceRepository in C# safeguards SQLite foreign keys with DBNull and resolves exclusions accurately', () => {
    const repoCode = fs.readFileSync(insuranceRepoPath, 'utf8');

    // Null/whitespace guard against SQLite FK errors
    assert.match(repoCode, /string\.IsNullOrWhiteSpace\(ex\.CategoryId\) \? DBNull\.Value : \(object\)ex\.CategoryId\.Trim\(\)/);
    assert.match(repoCode, /string\.IsNullOrWhiteSpace\(ex\.ProductId\) \? DBNull\.Value : \(object\)ex\.ProductId\.Trim\(\)/);

    // Left join products to fetch barcode and price
    assert.match(repoCode, /p\.barcode AS product_barcode/);
    assert.match(repoCode, /p\.price_piasters AS product_price_piasters/);

    // CalculateSplit priority: specific product exclusion first, then category, then cosmetic fallback
    assert.match(repoCode, /excludedProductIds\.Contains\(it\.ProductId\)/);
    assert.match(repoCode, /الصنف مستثنى صراحة من تغطية العقد/);
    assert.match(repoCode, /excludedCategoryIds\.Contains\(prodCatId\)/);
    assert.match(repoCode, /تصنيف الصنف \(\{0\}\) مستثنى من تغطية العقد/);
  });

  it('5. InsuranceTestRunner exercises combined category and specific product exclusions', () => {
    const testCode = fs.readFileSync(insuranceTestRunnerPath, 'utf8');

    // Dual exclusion contract test
    assert.match(testCode, /cnt_bupa_dual/);
    assert.match(testCode, /حفظ واسترجاع عقد يجمع بين استثناء فئة وصنف محدد/);
    assert.match(testCode, /إجمالي سلة الاستثناء المزدوج 47,000 قرش/);
    assert.match(testCode, /إجمالي الأصناف المستثناة 42,000 قرش/);
    assert.match(testCode, /إجمالي الأصناف المغطاة 5,000 قرش/);
    assert.match(testCode, /تطابق المجموع النهائي في الاستثناء المزدوج/);
  });
});
