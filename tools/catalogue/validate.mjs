import { createHash } from 'node:crypto';

export const VERSION = 'rafiq-off-egypt-v1';
export const canonical = value => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function gtinKey(code) {
  if (typeof code !== 'string' || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return null;
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) sum += Number(code[i]) * weight;
  return (10 - sum % 10) % 10 === Number(code.at(-1)) ? code.padStart(14, '0') : null;
}
export function safeText(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) return false;
  if (['=', '+', '@', '-'].includes(value.trimStart()[0])) return false;
  return Array.from(value).every(character => {
    const code = character.charCodeAt(0);
    return code >= 32 || code === 9 || code === 10;
  });
}
const recordKeys = ['schemaVersion', 'recordId', 'gtin', 'gtin14Key', 'nameOriginal', 'brand',
  'variant', 'netQuantityText', 'packDescription', 'category', 'provenance'];
const provenanceKeys = ['source', 'sourceRecordId', 'sourceUrl', 'sourceModifiedAt', 'retrievedAt',
  'rawRecordSha256', 'databaseLicense', 'contentsLicense'];
export function validateRecord(r) {
  const errors = [];
  if (!r || typeof r !== 'object') return ['INVALID_RECORD'];
  if (Object.keys(r).some(k => !recordKeys.includes(k))) errors.push('UNKNOWN_FIELD');
  if (r.schemaVersion !== 1 || r.recordId !== `off:${r.gtin}`) errors.push('INVALID_RECORD_ID');
  if (!gtinKey(r.gtin) || gtinKey(r.gtin) !== r.gtin14Key) errors.push('INVALID_GTIN');
  if (typeof r.gtin === 'string' && (!r.gtin.replace(/^0+/, '') ||
      /^(\d)\1{5}/.test(r.gtin.replace(/^0+/, '')) || /(?:0123456|1234567|2345678|9876543)/.test(r.gtin))) errors.push('SUSPICIOUS_SEQUENCE');
  for (const k of ['nameOriginal', 'brand', 'netQuantityText', 'packDescription', 'category'])
    if (!safeText(r[k])) errors.push(`MISSING_OR_UNSAFE_${k.toUpperCase()}`);
  if (!['dairy', 'beverages', 'snacks', 'staples', 'pantry'].includes(r.category)) errors.push('UNSUPPORTED_FOOD_GROUP');
  if (!/^\d+(?:[.,]\d+)?\s*(?:mg|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|cl|dl|l|lit(?:er|re)s?|جم|غ|كجم|كغ|مل|لتر)$/i.test(r.netQuantityText ?? ''))
    errors.push('AMBIGUOUS_QUANTITY');
  else {
    const quantity = Number(r.netQuantityText.match(/^[\d.,]+/)[0].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push('NONPOSITIVE_QUANTITY');
  }
  if (r.packDescription !== r.netQuantityText || r.variant !== null) errors.push('UNSUPPORTED_PACK_OR_VARIANT');
  const p = r.provenance;
  if (!p || Object.keys(p).some(k => !provenanceKeys.includes(k)) ||
      p.source !== 'openfoodfacts' || p.sourceRecordId !== r.gtin ||
      p.sourceUrl !== `https://world.openfoodfacts.org/product/${r.gtin}` ||
      p.databaseLicense !== 'ODbL-1.0' || p.contentsLicense !== 'DbCL-1.0' ||
      !/^[a-f0-9]{64}$/.test(p.rawRecordSha256 ?? '') ||
      !Number.isFinite(Date.parse(p.retrievedAt)) || !Number.isFinite(Date.parse(p.sourceModifiedAt)))
    errors.push('INVALID_PROVENANCE');
  return errors;
}
export function legacyConflictKeys(rows) {
  const assignments = new Map();
  for (const row of rows) {
    const key = gtinKey(row.barcode);
    if (!key) continue;
    const names = assignments.get(key) ?? new Set();
    names.add(row.name.trim().toLowerCase().replace(/\s+/g, ' '));
    assignments.set(key, names);
  }
  return new Set([...assignments].filter(([, names]) => names.size > 1).map(([key]) => key));
}
export function validatePack(records, conflictingLegacyKeys = new Set()) {
  const buckets = new Map(), eligible = [], quarantine = [];
  for (const record of records) {
    const reasons = validateRecord(record);
    if (conflictingLegacyKeys.has(gtinKey(record.gtin))) reasons.push('LEGACY_ASSIGNMENT_CONFLICT');
    if (!gtinKey(record.gtin)) { quarantine.push({ record, reasons }); continue; }
    const key = gtinKey(record.gtin);
    const bucket = buckets.get(key) ?? [];
    bucket.push({ record, reasons });
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length > 1) {
      const signature = r => canonical({ name: r.nameOriginal, brand: r.brand, quantity: r.netQuantityText, pack: r.packDescription });
      const conflict = new Set(bucket.map(entry => signature(entry.record))).size > 1;
      for (const entry of bucket) quarantine.push({ record: entry.record,
        reasons: [...entry.reasons, conflict ? 'CONFLICTING_PACK_IDENTITY' : 'DUPLICATE_EQUIVALENT_GTIN'] });
    } else if (bucket[0].reasons.length) quarantine.push(bucket[0]);
    else eligible.push(bucket[0].record);
  }
  eligible.sort((a, b) => a.gtin14Key.localeCompare(b.gtin14Key));
  quarantine.sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
  return { eligible, quarantine };
}
export function foodGroup(tags = []) {
  const groups = [
    ['dairy', /^en:(?:dairies|milks|cheeses|yogurts|fermented-milk-products)$/],
    ['beverages', /^en:(?:beverages|waters|juices|juices-and-nectars|teas|coffees)$/],
    ['snacks', /^en:(?:biscuits|biscuits-and-cakes|chocolates|confectioneries|snacks|chips|crisps|cakes)$/],
    ['staples', /^en:(?:cereals|cereals-and-potatoes|cereals-and-their-products|pastas|rices|legumes|legumes-and-their-products|noodles|breads|flours)$/],
    ['pantry', /^en:(?:sauces|spreads|honeys|oils|vegetable-oils|condiments|canned-foods|jams)$/],
  ];
  return groups.find(([, re]) => tags.some(t => re.test(t)))?.[0] ?? null;
}
export function transformSource(raw, retrievedAt) {
  const gtin = raw.code;
  return {
    schemaVersion: 1, recordId: `off:${gtin}`, gtin, gtin14Key: gtinKey(gtin),
    nameOriginal: raw.product_name, brand: raw.brands, variant: null,
    netQuantityText: raw.quantity, packDescription: raw.quantity, category: foodGroup(raw.categories_tags),
    provenance: {
      source: 'openfoodfacts', sourceRecordId: gtin, sourceUrl: `https://world.openfoodfacts.org/product/${gtin}`,
      sourceModifiedAt: Number.isSafeInteger(raw.last_modified_t) && raw.last_modified_t > 0
        ? new Date(raw.last_modified_t * 1000).toISOString() : null,
      retrievedAt, rawRecordSha256: sha256(canonical(raw)),
      databaseLicense: 'ODbL-1.0', contentsLicense: 'DbCL-1.0',
    },
  };
}
