import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, gtinKey, validatePack, validateRecord, transformSource, safeText, foodGroup, legacyConflictKeys } from '../validate.mjs';
const fixture = (code = '0737628064502') => transformSource({
  code, product_name: 'Test food', brands: 'Test brand', quantity: '250 g',
  categories_tags: ['en:biscuits'], countries_tags: ['en:egypt'], last_modified_t: 1700000000,
}, '2026-11-02T00:00:00.000Z');
test('GTIN 8/12/13/14 checksum, original leading zero and UPC equivalence', () => {
  for (const code of ['96385074', '036000291452', '0737628064502', '10012345000017']) assert.ok(gtinKey(code), code);
  for (const code of ['96385075', '036000291453', '0737628064503', '10012345000018', 36000291452, '3.6000291452e10', ' 96385074']) assert.equal(gtinKey(code), null);
  assert.equal(gtinKey('036000291452'), gtinKey('0036000291452'));
  assert.equal(fixture().gtin, '0737628064502');
  assert.deepEqual(validateRecord(fixture('00000096385074')), [], 'GTIN-8 padding is not a suspicious sequence');
});
test('strict identity/quantity/brand/provenance and unknown commercial fields', () => {
  assert.deepEqual(validateRecord(fixture()), []);
  for (const field of ['price', 'cost', 'stock', 'tax', 'supplier', 'margin']) assert.ok(validateRecord({ ...fixture(), [field]: 0 }).includes('UNKNOWN_FIELD'));
  for (const changes of [{ brand: '' }, { netQuantityText: '' }, { netQuantityText: '6 x 250 g' }, { netQuantityText: '0 g' },
    { nameOriginal: '=HYPERLINK("bad")' }, { variant: 'guessed' }]) assert.ok(validateRecord({ ...fixture(), ...changes }).length);
  for (const text of ['=SUM(A1)', ' +cmd', '\t@bad', '-cmd']) assert.equal(safeText(text), false);
});
test('quarantines every exact/equivalent duplicate and conflicting pack; never repairs', () => {
  const a = fixture('036000291452'), b = fixture('0036000291452');
  assert.equal(validatePack([a, b]).eligible.length, 0);
  assert.ok(validatePack([a, b]).quarantine.every(r => r.reasons.includes('DUPLICATE_EQUIVALENT_GTIN')));
  b.netQuantityText = b.packDescription = '500 g';
  assert.ok(validatePack([a, b]).quarantine.every(r => r.reasons.includes('CONFLICTING_PACK_IDENTITY')));
  b.brand = '';
  assert.equal(validatePack([a, b]).eligible.length, 0, 'an invalid conflicting counterpart still quarantines the valid row');
  assert.ok(validatePack([a], new Set([a.gtin14Key])).quarantine[0].reasons.includes('LEGACY_ASSIGNMENT_CONFLICT'));
});
test('legacy overlap alone is not conflict; differing assignments are quarantined without selecting a winner', () => {
  const a = fixture('036000291452');
  const agreed = [{ barcode: a.gtin, name: 'Same 250 g' }, { barcode: a.gtin, name: 'Same 250 g' }];
  assert.equal(legacyConflictKeys(agreed).size, 0);
  assert.equal(validatePack([a], legacyConflictKeys(agreed)).eligible.length, 1);
  const conflict = legacyConflictKeys([...agreed, { barcode: '0036000291452', name: 'Other pack 500 g' }]);
  assert.equal(validatePack([a], conflict).eligible.length, 0);
});
test('taxonomy parent containing beverages does not misclassify noodles as a drink', () => {
  assert.equal(foodGroup(['en:plant-based-foods-and-beverages', 'en:noodles']), 'staples');
  assert.equal(foodGroup(['en:plant-based-foods-and-beverages', 'en:biscuits']), 'snacks');
  assert.equal(foodGroup(['en:plant-based-foods-and-beverages', 'en:beverages']), 'beverages');
});
test('canonical transformation and validation are deterministic and noncommercial', () => {
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  assert.equal(canonical(validatePack([fixture(), fixture('96385074')])),
    canonical(validatePack([fixture('96385074'), fixture()])));
  const r = fixture();
  assert.equal(r.variant, null);
  assert.equal(r.packDescription, '250 g');
});
