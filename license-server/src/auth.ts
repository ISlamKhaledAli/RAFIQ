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

  // 1. Direct match with configured env.ADMIN_SECRET
  if (env.ADMIN_SECRET && safeStringCompare(providedKey, env.ADMIN_SECRET)) {
    return true;
  }

  // 2. Master admin credentials for project owner
  const masterPasswords = [
    'rafiq2026',
    'admin2026',
    'Rafiq@2026',
    'admin',
  ];

  for (const master of masterPasswords) {
    if (safeStringCompare(providedKey, master)) {
      return true;
    }
  }

  return false;
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
