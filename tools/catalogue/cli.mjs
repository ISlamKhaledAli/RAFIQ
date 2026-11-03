import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonical, sha256, legacyConflictKeys, validatePack, validateRecord, transformSource, VERSION } from './validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'frontend/public/catalogue');
const read = path => readFileSync(path);
const save = (name, bytes) => {
  const path = resolve(output, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
};
const json = (name, data) => save(name, canonical(data) + '\n');
const legacyPath = resolve(root, 'tools/final_authentic_catalog.json');
const legacy = JSON.parse(read(legacyPath));
function inventory() {
  const paths = ['tools/final_authentic_catalog.json', 'desktop/Services/StoreCatalogSeeder.cs'];
  for (const dir of readdirSync(root)) {
    if (!dir.includes('Excel')) continue;
    for (const file of readdirSync(resolve(root, dir))) if (/\.xlsx$/i.test(file)) paths.push(`${dir}/${file}`);
  }
  for (const file of readdirSync(resolve(root, 'frontend/public'))) if (/\.xlsx$/i.test(file)) paths.push(`frontend/public/${file}`);
  return {
    schemaVersion: 1, status: 'QUARANTINED_DO_NOT_IMPORT',
    reason: 'Unverified identities, conflicting pack assignments and assumed commercial values; originals preserved in place.',
    artifacts: paths.sort().map(path => ({ path, sha256: sha256(read(resolve(root, path))) })),
    knownRows: [...legacy.map(r => ({ barcode: r.barcode, name: r.name })),
      ...Array.from(read(resolve(root, 'desktop/Services/StoreCatalogSeeder.cs')).toString('utf8')
        .matchAll(/Name\s*=\s*"([^"]+)",\s*Barcode\s*=\s*"([^"]+)"/g), match => ({ barcode: match[2], name: match[1] }))],
  };
}
const get = url => {
  if (!/^https:\/\/(?:world\.openfoodfacts\.org|eg\.openfoodfacts\.org|opendatacommons\.org)\//.test(url)) throw new Error('Public OFF/licence URLs only');
  return execFileSync('curl', ['--fail', '--location', '--retry', '1', '--retry-all-errors', '--retry-delay', '15',
    '--max-time', '180', '--user-agent',
    'RafiqCatalogueMaintainer/1.0 (https://github.com/ISlamKhaledAli/RAFIQ)', url],
  { maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
};
function freeze() {
  const acquisition = JSON.parse(read(resolve(output, 'source/acquisition.json')));
  const records = acquisition.responses.flatMap(r => {
    const bytes = read(resolve(output, r.file));
    if (sha256(bytes) !== r.sha256) throw new Error('Source hash mismatch');
    return JSON.parse(bytes).products;
  });
  const egypt = records.filter(r => r.countries_tags?.includes('en:egypt'));
  const legacyInventory = inventory();
  const checked = validatePack(egypt.map(r => transformSource(r, acquisition.retrievedAt)),
    legacyConflictKeys(legacyInventory.knownRows));
  const groups = ['dairy', 'beverages', 'snacks', 'staples', 'pantry'];
  const selected = [];
  for (let i = 0; selected.length < 500; i++) {
    let added = 0;
    for (const group of groups) {
      const row = checked.eligible.filter(r => r.category === group)[i];
      if (row && selected.length < 500) { selected.push(row); added++; }
    }
    if (!added) break;
  }
  selected.sort((a, b) => a.gtin14Key.localeCompare(b.gtin14Key));
  json('reference.json', selected);
  json('quarantine.json', checked.quarantine);
  json('legacy-quarantine.json', legacyInventory);
  save('transforms/validate.mjs', read(resolve(root, 'tools/catalogue/validate.mjs')));
  save('transforms/cli.mjs', read(fileURLToPath(import.meta.url)));
  save('transforms/schema-v1.json', read(resolve(root, 'tools/catalogue/schema-v1.json')));
  const files = ['reference.json', 'quarantine.json', 'legacy-quarantine.json', 'source/acquisition.json', 'source/acquisition.partial.json',
    'transforms/validate.mjs', 'transforms/cli.mjs', 'transforms/schema-v1.json', 'ATTRIBUTION.md', 'licenses/ODbL-1.0.txt', 'licenses/DbCL-1.0.txt',
    ...acquisition.responses.map(r => r.file)];
  const reasonCounts = {};
  for (const entry of checked.quarantine) for (const reason of entry.reasons)
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  json('manifest.json', {
    schemaVersion: 1, datasetId: `off-egypt-${acquisition.retrievedAt.slice(0, 10)}-v1`,
    datasetSha256: sha256(read(resolve(output, 'reference.json'))), transformerVersion: VERSION,
    validatorVersion: VERSION, source: acquisition, filter: 'countries_tags contains en:egypt; supported food categories; single explicit mass/volume quantity; no inferred pack factor',
    coverage: Object.fromEntries(groups.map(g => [g, selected.filter(r => r.category === g).length])),
    eligibleCount: selected.length, validatedBeforeBound: checked.eligible.length,
    pilotCoverageStatus: selected.length >= 300 && groups.every(g => selected.filter(r => r.category === g).length >= 25)
      ? 'engineering-pilot-target-met' : 'below-engineering-pilot-target',
    acquisitionStatus: acquisition.partial ? 'partial-public-source-blocker' : 'bounded-export',
    legacyComparison: 'Different name assignments for the same normalized GTIN across preserved legacy artifacts are ambiguous and quarantined; legacy data is never identity authority or promotion input.',
    quarantinedCount: checked.quarantine.length, sourceRecords: records.length, egyptRecords: egypt.length,
    quarantineReasonCounts: reasonCounts,
    attribution: 'Open Food Facts contributors — https://world.openfoodfacts.org — ODbL 1.0 / DbCL 1.0. Community reference, not certification.',
    files: Object.fromEntries(files.sort().map(f => [f, sha256(read(resolve(output, f)))])),
  });
  console.log(canonical(JSON.parse(read(resolve(output, 'manifest.json'))).coverage));
}
const command = process.argv[2];
if (command === 'audit-legacy') {
  console.log(canonical(inventory()));
} else if (command === 'quarantine-legacy') {
  json('legacy-quarantine.json', inventory());
} else if (command === 'acquire-licences') {
  if (existsSync(resolve(output, 'manifest.json'))) throw new Error('Frozen pack; do not overwrite licence files in place');
  save('licenses/ODbL-1.0.txt', get('https://opendatacommons.org/licenses/odbl/1-0/index.html'));
  save('licenses/DbCL-1.0.txt', get('https://opendatacommons.org/licenses/dbcl/1-0/index.html'));
} else if (command === 'seal-partial') {
  if (!process.argv[3] || existsSync(resolve(output, 'source/acquisition.json')))
    throw new Error('A bounded blocker reason and an unsealed partial snapshot are required');
  const partial = JSON.parse(read(resolve(output, 'source/acquisition.partial.json')));
  json('source/acquisition.json', { ...partial, completedAt: new Date().toISOString(), partial: true,
    stoppedReason: process.argv[3], snapshot: 'Partial official filtered Egypt export; acquisition UTC window, not complete country coverage',
    userAgent: 'RafiqCatalogueMaintainer/1.0 (https://github.com/ISlamKhaledAli/RAFIQ)' });
  freeze();
} else if (command === 'acquire') {
  if (existsSync(resolve(output, 'source/acquisition.json'))) throw new Error('Snapshot already frozen; use a separately reviewed version, never overwrite in place');
  const partialPath = resolve(output, 'source/acquisition.partial.json');
  const partial = existsSync(partialPath) ? JSON.parse(read(partialPath)) : null;
  const retrievedAt = partial?.retrievedAt ?? new Date().toISOString(), responses = partial?.responses ?? [];
  const failures = [];
  // Filtered official export: bounded pages, at most eight searches/minute.
  for (let page = 1; page <= 50; page++) {
    if (responses.some(r => Number(new URL(r.url).searchParams.get('page')) === page)) continue;
    let url = `https://eg.openfoodfacts.org/cgi/search.pl?action=process&json=1&page_size=100&page=${page}&fields=code,product_name,brands,quantity,categories_tags,countries_tags,last_modified_t`;
    let bytes;
    try { bytes = get(url); }
    catch {
      await new Promise(r => setTimeout(r, 8000));
      url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=egypt&json=1&page_size=100&page=${page}&fields=code,product_name,brands,quantity,categories_tags,countries_tags,last_modified_t`;
      try { bytes = get(url); }
      catch {
        failures.push({ page, reason: 'Official Egypt mirror and filtered world export unavailable after retry/backoff' });
        json('source/acquisition.partial.json', { retrievedAt, responses, failures });
        console.error(`Skipped unavailable official page ${page}; no substitutes or invented records`);
        await new Promise(r => setTimeout(r, 8000));
        continue;
      }
    }
    const parsed = JSON.parse(bytes);
    if (!Array.isArray(parsed.products)) throw new Error('Invalid OFF export response');
    const allowed = ['code', 'product_name', 'brands', 'quantity', 'categories_tags', 'countries_tags', 'last_modified_t', 'ecoscore_tags'];
    if (parsed.products.some(product => Object.keys(product).some(key => !allowed.includes(key))))
      throw new Error('Unexpected source fields; review before freezing');
    const file = `source/egypt-page-${page}.json`;
    save(file, bytes);
    responses.push({ file, url, sha256: sha256(bytes), productCount: parsed.products.length });
    json('source/acquisition.partial.json', { retrievedAt, responses, failures });
    console.log(`Acquired page ${page}: ${parsed.products.length}/${parsed.count}`);
    if (page * Number(parsed.page_size || 1000) >= Number(parsed.count) || parsed.products.length === 0) break;
    await new Promise(r => setTimeout(r, 8000));
  }
  json('source/acquisition.json', { retrievedAt, completedAt: new Date().toISOString(),
    snapshot: 'Bounded live filtered OFF export; acquisition UTC window and product modification times retained',
    userAgent: 'RafiqCatalogueMaintainer/1.0 (https://github.com/ISlamKhaledAli/RAFIQ)', responses, failures });
  save('licenses/ODbL-1.0.txt', get('https://opendatacommons.org/licenses/odbl/1-0/index.html'));
  save('licenses/DbCL-1.0.txt', get('https://opendatacommons.org/licenses/dbcl/1-0/index.html'));
  freeze();
} else if (command === 'freeze') {
  freeze();
} else if (command === 'validate') {
  const manifest = JSON.parse(read(resolve(output, 'manifest.json')));
  for (const [file, hash] of Object.entries(manifest.files))
    if (sha256(read(resolve(output, file))) !== hash) throw new Error(`Hash mismatch: ${file}`);
  const records = JSON.parse(read(resolve(output, 'reference.json')));
  const checked = validatePack(records);
  if (records.some(r => validateRecord(r).length) || checked.quarantine.length ||
      records.length !== manifest.eligibleCount) throw new Error('Invalid reference pack');
  console.log(`Validated ${records.length} candidates; ${canonical(manifest.coverage)}`);
} else {
  throw new Error('Commands: audit-legacy (stdout), quarantine-legacy, acquire/acquire-licences (explicit network), seal-partial REASON/freeze/validate (offline)');
}
