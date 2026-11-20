import type { Env } from '../types.ts';
import { hmacSha256Hex, timingSafeEqual } from '../crypto.ts';

const MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes anti-replay window
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export interface GovernanceWebhookPayload {
  action?: 'upsert' | 'delete';
  store_id?: string | null;
  slug: string;
  previous_slug?: string | null;
  enabled: boolean;
  plan?: string;
  expires_at?: string | null;
  license_key?: string | null;
  shop_name?: string | null;
  owner_phone?: string | null;
  api_key_hash?: string | null;
}

/**
 * Cross-Account Signed Governance Webhook Receiver (Design Doc Section 8.1):
 * Receives HMAC-SHA256 signed kill-switch / plan updates from rafiq-license-server,
 * verifies signature + replay timestamp, writes immediately to Edge KV (`STORE_LICENSES`),
 * and synchronizes `stores.is_active` in D1.
 */
export async function handleGovernanceStoreLicenseWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const secret = (env.GOVERNANCE_WEBHOOK_SECRET || '').trim();
  if (secret.length < 32) {
    return new Response(
      JSON.stringify({
        error: 'Governance webhook secret is not configured on this worker',
        code: 'WEBHOOK_NOT_CONFIGURED',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tsHeader = (request.headers.get('X-Rafiq-Timestamp') || '').trim();
  const sigHeader = (request.headers.get('X-Rafiq-Signature') || '').trim().toLowerCase();

  if (!tsHeader || !sigHeader || !/^\d{9,13}$/.test(tsHeader) || !/^[0-9a-f]{64}$/.test(sigHeader)) {
    return new Response(
      JSON.stringify({ error: 'Missing or malformed governance signature headers', code: 'UNAUTHORIZED' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tsSeconds = parseInt(tsHeader, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return new Response(
      JSON.stringify({ error: 'Webhook timestamp outside allowed window', code: 'REPLAY_REJECTED' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const rawBody = await request.text();
  const expectedSig = await hmacSha256Hex(`${tsHeader}.${rawBody}`, secret);
  if (!timingSafeEqual(expectedSig, sigHeader)) {
    return new Response(
      JSON.stringify({ error: 'Invalid governance webhook signature', code: 'INVALID_SIGNATURE' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let payload: GovernanceWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as GovernanceWebhookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON payload' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const slug = (payload.slug || '').trim().toLowerCase();
  const previousSlug = (payload.previous_slug || '').trim().toLowerCase();
  const action = payload.action === 'delete' ? 'delete' : 'upsert';

  if (!slug || !SLUG_REGEX.test(slug)) {
    return new Response(
      JSON.stringify({ error: 'Invalid or missing store slug' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const nowIso = new Date().toISOString();
  let kvUpdated = false;

  if (env.STORE_LICENSES) {
    if (previousSlug && previousSlug !== slug && SLUG_REGEX.test(previousSlug)) {
      await env.STORE_LICENSES.delete(`store-license:${previousSlug}`);
    }

    if (action === 'delete') {
      await env.STORE_LICENSES.delete(`store-license:${slug}`);
    } else {
      await env.STORE_LICENSES.put(
        `store-license:${slug}`,
        JSON.stringify({
          enabled: Boolean(payload.enabled),
          plan: payload.plan || 'none',
          expires_at: payload.expires_at || null,
          license_key: payload.license_key || null,
          shop_name: payload.shop_name || null,
          updated_at: nowIso,
        })
      );
    }
    kvUpdated = true;
  }

  // Keep D1 stores table auto-provisioned & aligned with central license governance (Single Source of Truth)
  let dbUpdated = false;
  let provisioned = false;
  const activeFlag = action === 'delete' ? 0 : (payload.enabled ? 1 : 0);
  const licenseKey = (payload.license_key || '').trim();
  const storeId = (payload.store_id || '').trim();

  // Locate existing store by license_key, store_id, previous_slug, or current slug
  const existingStore = await env.DB.prepare(`
    SELECT id, slug, license_key, api_key_hash
    FROM stores
    WHERE (? != '' AND license_key = ?)
       OR (? != '' AND id = ?)
       OR (? != '' AND slug = ?)
       OR slug = ?
    LIMIT 1
  `)
    .bind(licenseKey, licenseKey, storeId, storeId, previousSlug, previousSlug, slug)
    .first<{ id: string; slug: string; license_key: string; api_key_hash: string }>();

  if (existingStore) {
    const res = await env.DB.prepare(`
      UPDATE stores
      SET slug = ?,
          name = COALESCE(NULLIF(?, ''), name),
          phone = COALESCE(?, phone),
          whatsapp = COALESCE(?, whatsapp),
          api_key_hash = COALESCE(?, api_key_hash),
          is_active = ?,
          updated_at = ?
      WHERE id = ?
    `)
      .bind(
        slug,
        payload.shop_name?.trim() || '',
        payload.owner_phone || null,
        payload.owner_phone || null,
        payload.api_key_hash || null,
        activeFlag,
        nowIso,
        existingStore.id
      )
      .run();
    dbUpdated = (res?.meta?.changes ?? 0) > 0;
  } else if (action !== 'delete' && activeFlag === 1 && licenseKey && payload.api_key_hash) {
    const newId = storeId || crypto.randomUUID();
    const shopName = (payload.shop_name || '').trim() || slug;
    await env.DB.prepare(`
      INSERT INTO stores (
        id, license_key, slug, name, phone, whatsapp,
        theme_preset, min_order_amount, is_active, is_paused,
        store_type, api_key_hash, sync_version, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'rafiq-official', 0, 1, 0, 'supermarket', ?, 1, ?, ?)
    `)
      .bind(
        newId,
        licenseKey,
        slug,
        shopName,
        payload.owner_phone || null,
        payload.owner_phone || null,
        payload.api_key_hash,
        nowIso,
        nowIso
      )
      .run();
    dbUpdated = true;
    provisioned = true;
  }

  return new Response(
    JSON.stringify({
      success: true,
      action,
      slug,
      enabled: activeFlag === 1,
      kv_updated: kvUpdated,
      db_updated: dbUpdated,
      provisioned,
      synced_at: nowIso,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
