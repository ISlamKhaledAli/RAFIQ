import type { Env, Store } from './types.ts';
import { sha256Hex, timingSafeEqual, verifySessionToken } from './crypto.ts';

export async function authenticateSyncRequest(
  request: Request,
  env: Env
): Promise<{ store: Store } | { error: Response }> {
  const storeId = request.headers.get('X-Store-Id');
  const apiKey = request.headers.get('X-Api-Key');

  if (!storeId || !apiKey) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Missing X-Store-Id or X-Api-Key authentication headers' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const store = await env.DB.prepare(
    'SELECT * FROM stores WHERE id = ?'
  )
    .bind(storeId)
    .first<Store>();

  if (!store) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Store not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  if (store.is_active !== 1) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Store account is disabled or inactive' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const computedHash = await sha256Hex(apiKey);
  if (!timingSafeEqual(computedHash, store.api_key_hash)) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Invalid API Key' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Enforce central license-server kill-switch via Shared KV if bound
  const entitlementError = await checkCloudStoreEntitlement(store.slug, env);
  if (entitlementError) {
    return { error: entitlementError };
  }

  return { store };
}

/**
 * Hot-Path Central Governance Gate (Design Doc Section 8.1.1):
 * Checks shared KV (`store-license:{slug}`) written by rafiq-license-server.
 * Returns null if allowed (or KV not bound in local dev), or a 403 Response if disabled/expired.
 */
export async function checkCloudStoreEntitlement(
  slug: string,
  env: Env
): Promise<Response | null> {
  if (!env.STORE_LICENSES || !slug) return null;
  try {
    const raw = await env.STORE_LICENSES.get(`store-license:${slug.toLowerCase()}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { enabled?: boolean; expires_at?: string | null };
    const isExpired = Boolean(entry.expires_at) && new Date(entry.expires_at!) < new Date();
    if (entry.enabled === false || isExpired) {
      return new Response(
        JSON.stringify({
          error: 'هذا المتجر الإلكتروني غير متاح حالياً. يرجى التواصل مع إدارة المحل.',
          code: 'STORE_LICENSE_INACTIVE',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    // Non-fatal: fail open to D1 store.is_active check on malformed KV entry
  }
  return null;
}

export async function authenticateOwnerRequest(
  request: Request,
  env: Env
): Promise<{ store: Store } | { error: Response }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: new Response(
        JSON.stringify({
          error: 'يرجى تسجيل الدخول بمفتاح الترخيص والـ PIN أولاً لإتمام هذا الإجراء.',
          code: 'AUTH_REQUIRED',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const token = authHeader.substring(7).trim();
  const secret = env.APP_SECRET || 'rafiq_default_owner_jwt_secret_key_32bytes!';
  const payload = await verifySessionToken(token, secret);

  if (!payload || !payload.store_id) {
    return {
      error: new Response(
        JSON.stringify({
          error: 'انتهت جلسة تسجيل الدخول أو مفتاح الجلسة غير صالح. يرجى تسجيل الدخول مرة أخرى.',
          code: 'SESSION_EXPIRED',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const store = await env.DB.prepare(
    'SELECT * FROM stores WHERE id = ?'
  )
    .bind(payload.store_id)
    .first<Store>();

  if (!store || store.is_active !== 1) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Store not found or inactive' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { store };
}
