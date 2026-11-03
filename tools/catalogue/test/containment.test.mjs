import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sha256 } from '../validate.mjs';
test('all old exporters fail explicitly before touching any preserved artifact', () => {
  const inventory = JSON.parse(readFileSync('frontend/public/catalogue/legacy-quarantine.json'));
  const before = inventory.artifacts.map(a => [a.path, sha256(readFileSync(a.path))]);
  for (const script of ['generate_excel_catalogs.js', 'generate_pharma_catalog.js', 'build_master_pharma_template.js'])
    assert.throws(() => execFileSync(process.execPath, [resolve('tools', script)], { stdio: 'pipe' }),
      error => error.status !== 0 && error.stderr.toString().includes('LEGACY_CATALOGUE_DISABLED'));
  for (const [path, hash] of before) assert.equal(sha256(readFileSync(path)), hash, path);
});
