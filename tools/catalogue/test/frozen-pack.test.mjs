import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, sha256, transformSource, validatePack, legacyConflictKeys } from '../validate.mjs';
const directory = new URL('../../../frontend/public/catalogue/', import.meta.url);
const read = name => readFileSync(new URL(name, directory));
test('frozen real records trace to Egypt-tagged raw metadata and all distributable hashes', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const [path, hash] of Object.entries(manifest.files)) assert.equal(sha256(read(path)), hash, path);
  const reference = JSON.parse(read('reference.json'));
  assert.equal(sha256(read('reference.json')), manifest.datasetSha256);
  assert.equal(reference.length, manifest.eligibleCount);
  const result = validatePack(reference);
  assert.equal(result.quarantine.length, 0);
  const conflicts = legacyConflictKeys(JSON.parse(read('legacy-quarantine.json')).knownRows);
  assert.ok(reference.every(record => !conflicts.has(record.gtin14Key)));
  const source = manifest.source.responses.flatMap(r => {
    const bytes = read(r.file);
    assert.equal(sha256(bytes), r.sha256);
    return JSON.parse(bytes).products;
  });
  const raw = new Map(source.map(r => [sha256(canonical(r)), r]));
  for (const record of reference) {
    const sourceRecord = raw.get(record.provenance.rawRecordSha256);
    assert.ok(sourceRecord.countries_tags.includes('en:egypt'));
    assert.deepEqual(record, transformSource(sourceRecord, manifest.source.retrievedAt));
    assert.equal(typeof record.gtin, 'string');
    assert.equal(JSON.parse(JSON.stringify(record)).gtin, sourceRecord.code);
  }
  assert.equal(Object.values(manifest.coverage).reduce((a, b) => a + b, 0), reference.length);
  console.log(`Actual frozen coverage: ${canonical(manifest.coverage)}; quarantined ${manifest.quarantinedCount}`);
});
