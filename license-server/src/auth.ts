import type { Env } from './types.ts';

/**
 * Validate that incoming request has a valid client APP_API_KEY
 */
export function validateClientApiKey(request: Request, env: Env): boolean {
  const headerKey = request.headers.get('x-rafiq-api-key');
  const authHeader = request.headers.get('authorization');
  let bearerKey: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerKey = authHeader.substring(7).trim();
  }

  const providedKey = headerKey || bearerKey;
  if (!providedKey) {
    return false;
  }

  // Constant-time comparison for security
  return safeStringCompare(providedKey, env.APP_API_KEY);
}

export const MIN_ADMIN_SECRET_LENGTH = 32;

/**
 * Validate that incoming request has valid admin credentials
 */
export function validateAdminSecret(request: Request, env: Env): boolean {
  const headerKey = request.headers.get('x-admin-secret');
  const authHeader = request.headers.get('authorization');
  let bearerKey: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerKey = authHeader.substring(7).trim();
  }

  const providedKey = headerKey || bearerKey;
  if (!providedKey) {
    return false;
  }

  // Only the configured Worker secret is accepted; weak or missing secrets disable admin access.
  const adminSecret = env.ADMIN_SECRET;
  if (typeof adminSecret !== 'string' || adminSecret.length < MIN_ADMIN_SECRET_LENGTH) {
    return false;
  }

  return safeStringCompare(providedKey, adminSecret);
}

/**
 * Timing-safe string equality check
 */
function safeStringCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  // Always iterate over the longer input so timing does not reveal the expected length.
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}
