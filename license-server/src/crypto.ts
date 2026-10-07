import type { ActivationTokenPayload } from './types.ts';

/**
 * Base64URL encode a string or Uint8Array
 */
export function base64UrlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL decode to string
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Import HMAC key from secret string
 */
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Create a cryptographically signed JWT-format activation token
 */
export async function signActivationToken(
  payload: ActivationTokenPayload,
  secret: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const key = await getCryptoKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${message}.${encodedSignature}`;
}

/**
 * Verify an activation token and return payload if valid
 */
export async function verifyActivationToken(
  token: string,
  secret: string,
  ignoreExpiration = false
): Promise<{ valid: boolean; payload?: ActivationTokenPayload; isExpired?: boolean; error?: string }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'صيغة التوكن غير صحيحة' };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const message = `${encodedHeader}.${encodedPayload}`;

    // Decode signature
    let base64 = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const sigBinary = atob(base64);
    const signatureBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      signatureBytes[i] = sigBinary.charCodeAt(i);
    }

    const key = await getCryptoKey(secret);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(message)
    );

    if (!isValid) {
      return { valid: false, error: 'التوقيع الرقمي للتوكن غير صالح (تم التلاعب به)' };
    }

    const payload: ActivationTokenPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const isExpired = Boolean(payload.exp && payload.exp < Math.floor(Date.now() / 1000));

    // Check expiration if present and not explicitly ignored
    if (!ignoreExpiration && isExpired) {
      return { valid: false, payload, isExpired: true, error: 'انتهت صلاحية توكن التفعيل' };
    }

    return { valid: true, payload, isExpired };
  } catch {
    return { valid: false, error: 'فشل فك تشفير وفحص التوكن' };
  }
}

/**
 * Master offline secret for signing offline support codes (Identical to C# Desktop host)
 */
export const OFFLINE_MASTER_SECRET = 'RafiqPOS_Master_Secret_Offline_2026_Secure';

/**
 * Generate cryptographically signed offline support code for air-gapped retail devices
 * Output format: RFQ-SUP-{TypeChar}{DaysHex}-{SigHex12}
 */
export async function generateOfflineSupportCode(
  deviceFingerprint: string,
  licenseType: string,
  days: number
): Promise<string> {
  if (!deviceFingerprint || !deviceFingerprint.trim()) {
    throw new Error('بصمة الجهاز (Device Fingerprint) مطلوبة');
  }

  let typeChar = 'A';
  let finalDays = days;
  if (licenseType === 'lifetime' || finalDays >= 9000) {
    typeChar = 'L';
    finalDays = 9999;
  } else if (licenseType === 'trial') {
    typeChar = 'T';
  } else if (licenseType === 'monthly' || finalDays <= 31) {
    typeChar = 'M';
  } else {
    typeChar = 'A';
  }

  const daysHex = finalDays.toString(16).toUpperCase().padStart(4, '0');
  const payload = `${deviceFingerprint.trim().toUpperCase()}:${typeChar}${daysHex}`;

  const key = await getCryptoKey(OFFLINE_MASTER_SECRET);
  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );

  const sigBytes = new Uint8Array(sigBuffer);
  let sigHex = '';
  for (let i = 0; i < 6; i++) {
    sigHex += sigBytes[i].toString(16).toUpperCase().padStart(2, '0');
  }

  return `RFQ-SUP-${typeChar}${daysHex}-${sigHex}`;
}

