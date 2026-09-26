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

  return safeStringCompare(providedKey, env.ADMIN_SECRET);
}

/**
 * Timing-safe string equality check
 */
function safeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
