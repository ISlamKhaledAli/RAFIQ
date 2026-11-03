import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildBlankMerchantTemplate, parseExcelOrCsvFile, assertMerchantWorkbook, validateImportRows } from '../src/utils/excelImport.ts';
import { selectionErrors, requiresBelowCostConfirmation, editCatalogueSelection } from '../src/types/catalogue.ts';
import { handleCatalogueMock } from '../src/bridge/catalogueMocks.ts';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const file = workbook => {
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return { arrayBuffer: async () => buffer };
};
test('production blank merchant template round-trips with headers/instructions only', async () => {
  const workbook = buildBlankMerchantTemplate(XLSX);
  assert.deepEqual(workbook.SheetNames, ['قالب المنتجات', 'تعليمات']);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['قالب المنتجات'], { header: 1 });
  assert.equal(rows.length, 1);
  for (const sheet of Object.values(workbook.Sheets))
    for (const [key, value] of Object.entries(sheet))
      if (!key.startsWith('!')) { assert.equal(value.f, undefined); assert.equal(value.t, 's'); }
  await assert.rejects(parseExcelOrCsvFile(file(workbook)), /لم يتم العثور على أي صفوف/);
});
test('ordinary merchant import stays functional and preserves text barcode/explicit price', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['اسم الصنف', 'الباركود', 'سعر البيع', 'سعر التكلفة'],
    ['منتج التاجر الخاص', '0036000291452', '12.34', '10.05'],
  ]), 'قالب المنتجات');
  const rows = await parseExcelOrCsvFile(file(workbook));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].barcode, '0036000291452');
  assert.equal(rows[0].pricePounds, 12.34);
  assert.equal(rows[0].costPounds, 10.05);
  assert.equal(rows[0].stockQuantity, null);
});
test('independent merchant workbook may share a catalogue identity without proving legacy origin', async () => {
  const inventory = JSON.parse(readFileSync(new URL('../public/catalogue/legacy-quarantine.json', import.meta.url)));
  const workbook = XLSX.utils.book_new();
  const name = 'ريد بول مشروب طاقة 250 ml';
  assert.ok(inventory.knownRows.some(row => row.barcode === '90162602' && row.name === name));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['اسم الصنف', 'الباركود', 'سعر البيع', 'سعر التكلفة'],
    [name, '90162602', '79.25', '63.11'],
  ]), 'قالب المنتجات');
  const bytes = await file(workbook).arrayBuffer();
  const hash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
  assert.ok(!inventory.artifacts.some(artifact => artifact.sha256 === hash));
  const rows = await parseExcelOrCsvFile({ arrayBuffer: async () => bytes });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, name);
  assert.equal(rows[0].barcode, '90162602');
  assert.equal(rows[0].pricePounds, 79.25);
  assert.equal(rows[0].costPounds, 63.11);
  assert.equal(rows[0].stockQuantity, null);
  const [validated] = validateImportRows(rows, [], []);
  assert.notEqual(validated.status, 'error');
  assert.equal(validated.payload.pricePiasters, 7925);
  assert.equal(validated.payload.costPiasters, 6311);
  assert.equal(validated.payload.stockQuantityMilli, null);
});
test('rejects original artifact hashes and explicit reference formats, not common identity pairs', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/catalogue/legacy-quarantine.json', import.meta.url)));
  const bytes = readFileSync(new URL(`../../${manifest.artifacts.find(a => a.path === 'tools/final_authentic_catalog.json').path}`, import.meta.url));
  const empty = XLSX.utils.book_new();
  await assert.rejects(assertMerchantWorkbook(XLSX, empty, bytes), /LEGACY_CATALOGUE_DISABLED/);
  const originalWorkbook = manifest.artifacts.find(artifact => artifact.path.endsWith('.xlsx') && artifact.path.includes('01_'));
  assert.ok(originalWorkbook);
  const workbookBytes = readFileSync(new URL(`../../${originalWorkbook.path}`, import.meta.url));
  await assert.rejects(parseExcelOrCsvFile({ arrayBuffer: async () => workbookBytes }), /LEGACY_CATALOGUE_DISABLED/);
  for (const marker of ['rafiq-reference-v1', 'recordId']) {
    const ref = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(ref, XLSX.utils.aoa_to_sheet([[marker, 'gtin14Key', 'اسم الصنف'], ['off:123', '123', 'name']]), 'renamed');
    await assert.rejects(parseExcelOrCsvFile(file(ref)), /REFERENCE_REVIEW_REQUIRED/);
  }
  const referenceJson = readFileSync(new URL('../public/catalogue/reference.json', import.meta.url));
  await assert.rejects(parseExcelOrCsvFile({ arrayBuffer: async () => referenceJson }), /REFERENCE_REVIEW_REQUIRED/);
});
test('merchant confirmation requires entered money and exact scan/pack; zero cost is opt-in', () => {
  const record = { recordId: 'off:036000291452', gtin: '036000291452', packDescription: '250 g' };
  const selection = { recordId: record.recordId, confirmedBarcode: record.gtin, confirmedPack: '250 g',
    identityConfirmed: true, pricesConfirmed: true, belowCostConfirmed: false, zeroCostConfirmed: false,
    salePricePiasters: 1234, costPiasters: 1005, categoryId: 'category' };
  assert.deepEqual(selectionErrors(selection, record), []);
  for (const patch of [{ salePricePiasters: null }, { salePricePiasters: 1.5 }, { costPiasters: null },
    { costPiasters: 0 }, { confirmedBarcode: '0036000291452' }, { confirmedPack: '500 g' },
    { pricesConfirmed: false }, { identityConfirmed: false }, { categoryId: '' }])
    assert.ok(selectionErrors({ ...selection, ...patch }, record).length);
  assert.deepEqual(selectionErrors({ ...selection, costPiasters: 0, zeroCostConfirmed: true }, record), []);
});
test('below-cost reference prices need their own confirmation, not PricesConfirmed', () => {
  const record = { recordId: 'off:036000291452', gtin: '036000291452', packDescription: '250 g' };
  const selection = { recordId: record.recordId, confirmedBarcode: record.gtin, confirmedPack: '250 g',
    identityConfirmed: true, pricesConfirmed: true, belowCostConfirmed: false, zeroCostConfirmed: false,
    salePricePiasters: 100, costPiasters: 200, categoryId: 'category' };
  assert.ok(selectionErrors(selection, record).length, 'generic price confirmation must not authorize a loss');
  const missingFlag = { ...selection };
  delete missingFlag.belowCostConfirmed;
  assert.ok(selectionErrors(missingFlag, record).length);
  assert.deepEqual(selectionErrors({ ...selection, belowCostConfirmed: true }, record), []);
  assert.deepEqual(selectionErrors({ ...selection, salePricePiasters: 200 }, record), []);
  assert.equal(requiresBelowCostConfirmation({ ...selection, costPiasters: null }), false);
});
test('editing either price revokes loss approval, preview and final confirmation through the UI production helper', () => {
  const approved = { recordId: 'off:036000291452', confirmedBarcode: '036000291452', confirmedPack: '250 g',
    identityConfirmed: true, pricesConfirmed: true, belowCostConfirmed: true, zeroCostConfirmed: false,
    salePricePiasters: 100, costPiasters: 200, categoryId: 'category' };
  for (const patch of [{ salePricePiasters: 150 }, { costPiasters: 250 }, { salePricePiasters: 300 },
    { costPiasters: null }, { salePricePiasters: 150, belowCostConfirmed: true }]) {
    const updated = editCatalogueSelection(approved, patch);
    assert.equal(updated.selection.belowCostConfirmed, false);
    assert.equal(updated.selection.pricesConfirmed, false);
    assert.equal(updated.preview, null);
    assert.equal(updated.applyConfirmed, false);
    assert.equal(updated.selection.salePricePiasters, patch.salePricePiasters ?? approved.salePricePiasters);
    assert.equal(updated.selection.costPiasters, 'costPiasters' in patch ? patch.costPiasters : approved.costPiasters);
  }
  assert.equal(approved.belowCostConfirmed, true, 'the previous selection is not mutated');
  const newlyApproved = editCatalogueSelection({ ...approved, belowCostConfirmed: false }, { belowCostConfirmed: true });
  assert.equal(newlyApproved.selection.belowCostConfirmed, true);
  assert.equal(newlyApproved.preview, null);
  assert.equal(newlyApproved.applyConfirmed, false);
});
test('browser mock never pretends authoritative preview, application or legacy seed succeeded', async () => {
  for (const action of ['catalogue:preview', 'catalogue:apply']) await assert.rejects(handleCatalogueMock(action, {}), /NATIVE_HOST_REQUIRED/);
  await assert.rejects(handleCatalogueMock('templates:seedProducts', {}), /LEGACY_CATALOGUE_DISABLED/);
});
test('browser production browse checks pinned local assets, pagination, search and tampering offline', async () => {
  const originalFetch = globalThis.fetch;
  let corrupt = '';
  globalThis.fetch = async url => {
    assert.ok(['/catalogue/manifest.json', '/catalogue/reference.json'].includes(url));
    const bytes = readFileSync(new URL(`../public${url}`, import.meta.url));
    return new Response(corrupt === url ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes);
  };
  try {
    const first = await handleCatalogueMock('catalogue:getReference', { page: 1, pageSize: 3 });
    const second = await handleCatalogueMock('catalogue:getReference', { page: 2, pageSize: 3 });
    assert.equal(first.records.length, 3);
    assert.equal(second.records.length, 3);
    assert.ok(first.records.every(a => second.records.every(b => b.recordId !== a.recordId)));
    const searched = await handleCatalogueMock('catalogue:getReference', { query: first.records[0].gtin });
    assert.equal(searched.total, 1);
    await assert.rejects(handleCatalogueMock('catalogue:getReference', { page: 0 }), /INVALID_PAGE/);
    corrupt = '/catalogue/manifest.json';
    await assert.rejects(handleCatalogueMock('catalogue:getReference', {}), /MANIFEST_HASH_MISMATCH/);
    corrupt = '/catalogue/reference.json';
    await assert.rejects(handleCatalogueMock('catalogue:getReference', {}), /DATASET_HASH_MISMATCH/);
  } finally { globalThis.fetch = originalFetch; }
});
