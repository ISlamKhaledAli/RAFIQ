import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseExcelOrCsvFile } from '../src/utils/excelImport.ts';
import { getAutoTopicsForAction } from '../src/bridge/ipc.ts';
import {
  buildImportOutcome,
  countCreatedCategories,
  resolveCategoryFilter,
} from '../src/views/products/importRefresh.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const productsView = read('../src/views/ProductsView.tsx');
const importModal = read('../src/components/ExcelImportModal.tsx');
const hostDispatcher = read('../../desktop/Bridge/IpcDispatcher.cs');

describe('catalog mutations invalidate every consumer', () => {
  it('an Excel import refreshes products, sections and dashboard counters', () => {
    for (const action of ['products:importBatch', 'excel:importProducts']) {
      const topics = getAutoTopicsForAction(action);
      for (const topic of ['products', 'categories', 'dashboard']) {
        assert.ok(topics.includes(topic), `${action} must emit ${topic}`);
      }
    }
  });

  it('actions that add, remove or move products also refresh the section list and its counts', () => {
    for (const action of ['products:save', 'products:delete', 'products:bulkDelete', 'products:clearAll']) {
      const topics = getAutoTopicsForAction(action);
      assert.ok(topics.includes('products') && topics.includes('categories') && topics.includes('dashboard'), action);
    }
  });

  it('section changes refresh the sections and the product lists that show them', () => {
    for (const action of ['categories:save', 'categories:archive', 'categories:reorder']) {
      assert.deepEqual(getAutoTopicsForAction(action), ['categories', 'products'], action);
    }
  });

  it('stock, price, unit, barcode, location and batch mutations refresh products and dashboard', () => {
    for (const action of [
      'products:bulkUpdateMinStock',
      'products:applyBulkPriceAdjustment',
      'products:revertBulkPriceAdjustment',
      'products:assignInternalBarcode',
      'products:rebaseUnit',
      'products:rebaseBaseUnit',
      'inventory:adjustStock',
      'inventory:recordPurchase',
      'productUnits:save',
      'productUnits:setBase',
      'packaging:saveLevels',
      'locations:save',
      'locations:assignProduct',
      'variants:createMatrix',
      'batch:save',
      'pharma:applyStocktaking',
    ]) {
      const topics = getAutoTopicsForAction(action);
      assert.ok(topics.includes('products') && topics.includes('dashboard'), `${action} -> ${topics.join(',')}`);
    }
  });

  it('every catalog mutation that the license gate blocks maps to a data-changed topic', () => {
    const readVerb = /^(get|list|search|find|calculate|preview|check|verify|is|has|run|generate)/;
    const actions = [...hostDispatcher.matchAll(/\{ "((?:products|categories|productUnits|locations):[A-Za-z]+)",/g)]
      .map((m) => m[1])
      .filter((a) => !readVerb.test(a.split(':')[1]));
    assert.ok(actions.length >= 10, `parsed ${actions.length} host actions`);
    for (const action of actions) {
      assert.ok(getAutoTopicsForAction(action).includes('products'), `${action} does not invalidate products`);
    }
  });

  it('read-only product and category queries never emit', () => {
    for (const action of ['products:search', 'products:getAll', 'categories:getAll', 'products:previewBulkPriceAdjustment']) {
      assert.deepEqual(getAutoTopicsForAction(action), [], action);
    }
  });
});

describe('selected section stays valid after the sections change', () => {
  const cats = [{ id: 'cat_a' }, { id: 'cat_b' }];

  it('keeps all and existing selections', () => {
    assert.equal(resolveCategoryFilter('all', cats), 'all');
    assert.equal(resolveCategoryFilter('cat_b', cats), 'cat_b');
  });

  it('falls back to all when the selected section no longer exists', () => {
    assert.equal(resolveCategoryFilter('cat_gone', cats), 'all');
    assert.equal(resolveCategoryFilter('cat_a', []), 'all');
  });
});

describe('import outcome', () => {
  const before = [{ id: 'cat_general' }];
  const after = [{ id: 'cat_general' }, { id: 'cat_n1' }, { id: 'cat_n2' }];

  it('uses the host category count when present, including zero', () => {
    assert.equal(countCreatedCategories(1, before, after), 1);
    assert.equal(countCreatedCategories(0, before, after), 0);
  });

  it('falls back to comparing the lists for a host without the field', () => {
    assert.equal(countCreatedCategories(undefined, before, after), 2);
    assert.equal(countCreatedCategories(undefined, after, after), 0);
  });

  it('maps the host response and tolerates an empty one', () => {
    assert.deepEqual(
      buildImportOutcome(
        { createdCount: 5, updatedCount: 2, skippedCount: 1, categoriesCreatedCount: 2, categoriesRestoredCount: 1, errors: ['row 3'] },
        before,
        after,
      ),
      { added: 5, updated: 2, skipped: 1, categoriesCreated: 2, categoriesRestored: 1, notes: ['row 3'] },
    );
    assert.deepEqual(buildImportOutcome(null, before, before), {
      added: 0, updated: 0, skipped: 0, categoriesCreated: 0, categoriesRestored: 0, notes: [],
    });
  });
});

describe('ProductsView and the import modal reload after an import', () => {
  it('the modal awaits the view reload before it shows the result, and only closes from the result actions', () => {
    const invokeAt = importModal.indexOf("'products:importBatch'");
    const awaitAt = importModal.indexOf('await onImported()');
    const outcomeAt = importModal.indexOf('setImportOutcome(');
    assert.ok(invokeAt > 0 && awaitAt > invokeAt && outcomeAt > awaitAt);
    const handler = importModal.slice(invokeAt, importModal.indexOf('const isDirty'));
    assert.ok(!handler.includes('onClose()'), 'the modal must stay open to show the result');
    assert.match(importModal, /عرض الأصناف المستوردة/);
    assert.match(importModal, /onClick=\{onViewImported\}/);
  });

  it('the view reloads sections and products (awaited) and validates the selected section', () => {
    const start = productsView.indexOf('const handleProductsImported');
    const body = productsView.slice(start, productsView.indexOf('const handleViewImportedProducts'));
    assert.ok(start > 0);
    assert.match(body, /await fetchCategoriesList\(\)/);
    assert.match(body, /resolveCategoryFilter\(selectedCategoryFilter, fresh\)/);
    assert.match(body, /await loadProducts\(/);
    assert.match(productsView, /onImported=\{handleProductsImported\}/);
    assert.match(productsView, /onViewImported=\{handleViewImportedProducts\}/);
  });

  it('a refreshed section list also resets a section filter that disappeared', () => {
    const fetchAt = productsView.indexOf('const fetchCategoriesList');
    const fetchBody = productsView.slice(fetchAt, productsView.indexOf('const handleProductsImported'));
    assert.match(fetchBody, /setSelectedCategoryFilter\(\(prev\) => resolveCategoryFilter\(prev, res\)\)/);
  });

  it('viewing the imported products clears every filter and reloads the first page', () => {
    const start = productsView.indexOf('const handleViewImportedProducts');
    const body = productsView.slice(start, start + 600);
    for (const call of ["setShowExcelImportModal(false)", "setSearchQuery('')", 'setCurrentPage(1)', "setStockStatusFilter('all')", "setSelectedCategoryFilter('all')", "loadProducts('', 1, pageSize, 'all', 'all')"]) {
      assert.ok(body.includes(call), call);
    }
  });

  it('the products view listens to the sections topic as well as the products topic', () => {
    assert.match(productsView, /useDataSubscription\(\['categories', 'all'\]/);
    assert.match(productsView, /useDataSubscription\(\['products', 'all'\]/);
  });
});

describe('sheet names and sections', () => {
  const fileFor = (sheetName) => {
    const rows = [['اسم الصنف', 'الباركود', 'القسم', 'سعر البيع'], ['شامبو', '6221111000011', 'عناية شخصية', 95]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    return new File([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })], 'items.xlsx');
  };

  it('the default sheet names of English and Arabic Excel do not become sections', async () => {
    for (const sheetName of ['Sheet1', 'ورقة1', 'ورقة 2']) {
      const rows = await parseExcelOrCsvFile(fileFor(sheetName));
      assert.equal(rows.length, 1, sheetName);
      assert.equal(rows[0].categoryName, 'عناية شخصية', sheetName);
    }
  });

  it('a named sheet is still the section of its rows', async () => {
    const rows = await parseExcelOrCsvFile(fileFor('منظفات'));
    assert.equal(rows[0].categoryName, 'منظفات');
  });
});

describe('host reports the sections an import created', () => {
  it('BatchImportResult exposes additive category counters filled by the importer', () => {
    const model = read('../../desktop/Models/BatchImportModels.cs');
    const importer = read('../../desktop/Repositories/ProductRepository.Import.cs');
    assert.match(model, /JsonProperty\("categoriesCreatedCount"\)/);
    assert.match(model, /JsonProperty\("categoriesRestoredCount"\)/);
    assert.match(importer, /result\.CategoriesCreatedCount\+\+/);
    assert.match(importer, /result\.CategoriesRestoredCount\+\+/);
  });
});
