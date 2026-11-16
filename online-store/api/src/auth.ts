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

  return { store };
}

export async function authenticateOwnerRequest(
  request: Request,
  env: Env
): Promise<{ store: Store } | { error: Response }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Missing or malformed Authorization header' }),
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
        JSON.stringify({ error: 'Invalid or expired session token' }),
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
