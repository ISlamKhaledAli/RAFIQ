import { CATALOGUE_MANIFEST_SHA256 } from '../types/catalogue.ts';
import type { CatalogueManifest, CatalogueRecord, CataloguePage } from '../types/catalogue.ts';

async function hash(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function handleCatalogueMock(action: string, payload: unknown): Promise<CataloguePage> {
  if (action === 'templates:seedProducts') throw new Error('LEGACY_CATALOGUE_DISABLED');
  if (action !== 'catalogue:getReference') throw new Error('CATALOGUE_NATIVE_HOST_REQUIRED: المعاينة والتطبيق يحتاجان مضيف سطح المكتب؛ المتصفح للعرض فقط');
  const params = payload as { page?: number; pageSize?: number; query?: string; category?: string };
  const page = params?.page ?? 1, pageSize = params?.pageSize ?? 25;
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
    throw new Error('CATALOGUE_INVALID_PAGE');
  const manifestResponse = await fetch('/catalogue/manifest.json');
  if (!manifestResponse.ok) throw new Error('CATALOGUE_PACK_UNAVAILABLE');
  const manifestBytes = await manifestResponse.arrayBuffer();
  if (await hash(manifestBytes) !== CATALOGUE_MANIFEST_SHA256) throw new Error('CATALOGUE_MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as CatalogueManifest;
  const response = await fetch('/catalogue/reference.json');
  if (!response.ok) throw new Error('CATALOGUE_PACK_UNAVAILABLE');
  const bytes = await response.arrayBuffer();
  if (await hash(bytes) !== manifest.datasetSha256) throw new Error('CATALOGUE_DATASET_HASH_MISMATCH');
  const records = (JSON.parse(new TextDecoder().decode(bytes)) as CatalogueRecord[]).filter(record =>
    (!params?.category || record.category === params.category) &&
    `${record.nameOriginal} ${record.brand} ${record.gtin}`.toLowerCase().includes((params?.query ?? '').toLowerCase()));
  return { manifest, records: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize };
}
