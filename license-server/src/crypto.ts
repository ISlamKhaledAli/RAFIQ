import type { ActivationTokenPayload, LicenseType } from './types.ts';

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
 * License tokens are signed with RSA (RS256, Audit F-04/F-15).
 * The private key exists only as the Worker secret LICENSE_PRIVATE_KEY (PKCS#8 PEM).
 * The desktop app embeds only the public key, so it can verify licenses but never mint them.
 */
const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64UrlToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  if (!privateKeyPem) {
    throw new Error('LICENSE_PRIVATE_KEY is not configured');
  }
  return await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), RS256, true, ['sign']);
}

async function derivePublicKey(privateKeyPem: string): Promise<CryptoKey> {
  const privateKey = await importPrivateKey(privateKeyPem);
  const jwk = (await crypto.subtle.exportKey('jwk', privateKey)) as JsonWebKey;
  return await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    RS256,
    false,
    ['verify']
  );
}

/**
 * Computes a 2-character hex verification tag from a device fingerprint.
 * Used in Challenge-Response to instantly catch wrong shop selection before signing.
 */
export async function computeFingerprintTag(fp: string): Promise<string> {
  const clean = (fp || '').trim().toUpperCase();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
  const bytes = new Uint8Array(hash);
  return bytes[0].toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Create an RS256-signed JWT activation token
 */
export async function signActivationToken(
  payload: ActivationTokenPayload,
  privateKeyPem: string
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const message = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(RS256, key, new TextEncoder().encode(message));
  return `${message}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify an RS256 activation token and return its payload if the signature is valid
 */
export async function verifyActivationToken(
  token: string,
  privateKeyPem: string,
  ignoreExpiration = false
): Promise<{ valid: boolean; payload?: ActivationTokenPayload; isExpired?: boolean; error?: string }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'صيغة التوكن غير صحيحة' };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string };
    if (header.alg !== 'RS256') {
      return { valid: false, error: 'خوارزمية توقيع التوكن غير مدعومة' };
    }

    const key = await derivePublicKey(privateKeyPem);
    const isValid = await crypto.subtle.verify(
      RS256,
      key,
      base64UrlToBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );

    if (!isValid) {
      return { valid: false, error: 'التوقيع الرقمي للتوكن غير صالح (تم التلاعب به)' };
    }

    const payload: ActivationTokenPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const isExpired = Boolean(payload.exp && payload.exp < Math.floor(Date.now() / 1000));

    if (!ignoreExpiration && isExpired) {
      return { valid: false, payload, isExpired: true, error: 'انتهت صلاحية توكن التفعيل' };
    }

    return { valid: true, payload, isExpired };
  } catch {
    return { valid: false, error: 'فشل فك تشفير وفحص التوكن' };
  }
}

/**
 * Generate an RS256-signed offline support code for air-gapped retail devices.
 * Output format: RFQ-SUP-{signed JWT bound to the device fingerprint}
 */
export async function generateOfflineSupportCode(
  deviceFingerprint: string,
  licenseType: string,
  days: number,
  privateKeyPem: string,
  shopName = '',
  customLicenseKey?: string
): Promise<string> {
  if (!deviceFingerprint || !deviceFingerprint.trim()) {
    throw new Error('بصمة الجهاز (Device Fingerprint) مطلوبة');
  }

  const now = Math.floor(Date.now() / 1000);
  let type: LicenseType = 'annual';
  let exp: number | null = null;
  const safeDays = Math.max(1, Math.floor(Number(days) || 1));

  if (licenseType === 'lifetime' || safeDays >= 9000) {
    type = 'lifetime';
    exp = null;
  } else if (licenseType === 'trial' || safeDays <= 14) {
    type = 'trial';
    exp = now + safeDays * 86400;
  } else if (licenseType === 'monthly' || safeDays <= 31) {
    type = 'monthly';
    exp = now + safeDays * 86400;
  } else {
    type = 'annual';
    exp = now + safeDays * 86400;
  }

  const subKey = customLicenseKey && customLicenseKey.trim() 
    ? customLicenseKey.trim() 
    : `SUPPORT-${crypto.randomUUID()}`;

  const token = await signActivationToken(
    {
      iss: 'rafiq-license-server',
      sub: subKey,
      fp: deviceFingerprint.trim().toUpperCase(),
      shop: shopName,
      type,
      iat: now,
      exp,
      kind: 'support',
      jti: crypto.randomUUID(),
    },
    privateKeyPem
  );

  return `RFQ-SUP-${token}`;
}

/**
 * Generate an RS256-signed Root Session Challenge-Response token.
 * Output format: RFQ-ROOT-{signed JWT with 15m expiration & challenge nonce}
 */
export async function generateRootSessionToken(
  deviceFingerprint: string,
  challengeNonce: string,
  licenseKey: string,
  shopName: string,
  privateKeyPem: string
): Promise<string> {
  if (!deviceFingerprint || !deviceFingerprint.trim()) {
    throw new Error('بصمة الجهاز مطلوبة لتوليد تصريح Root');
  }
  if (!challengeNonce || !challengeNonce.trim()) {
    throw new Error('كود التحدي من شاشة العميل مطلوب');
  }

  const cleanFp = deviceFingerprint.trim().toUpperCase();
  const cleanNonce = challengeNonce.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 900; // 15 minutes validity

  const token = await signActivationToken(
    {
      iss: 'rafiq-license-server',
      sub: licenseKey || `ROOT-${cleanNonce}`,
      fp: cleanFp,
      shop: shopName || 'جلسة دعم فني للمطور',
      type: 'lifetime',
      iat: now,
      exp,
      kind: 'root_session',
      nonce: cleanNonce,
      jti: crypto.randomUUID(),
    },
    privateKeyPem
  );

  return `RFQ-ROOT-${token}`;
}

/**
 * Generate an RS256-signed Owner PIN Reset token.
 * Output format: RFQ-REC-{signed JWT with 24h expiration & unique JTI}
 */
export async function generatePinRecoveryToken(
  deviceFingerprint: string,
  licenseKey: string,
  shopName: string,
  privateKeyPem: string
): Promise<string> {
  if (!deviceFingerprint || !deviceFingerprint.trim()) {
    throw new Error('بصمة الجهاز مطلوبة لتوليد كود استعادة كلمة السر');
  }

  const cleanFp = deviceFingerprint.trim().toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400; // 24 hours validity

  const token = await signActivationToken(
    {
      iss: 'rafiq-license-server',
      sub: licenseKey || `RECOVERY-${crypto.randomUUID()}`,
      fp: cleanFp,
      shop: shopName || 'استعادة كلمة السر',
      type: 'lifetime',
      iat: now,
      exp,
      kind: 'pin_reset',
      jti: crypto.randomUUID(),
    },
    privateKeyPem
  );

  return `RFQ-REC-${token}`;
}

/**
 * Generate an RS256-signed Clock Reset token.
 * Output format: RFQ-TIME-{signed JWT with 24h expiration & server UTC timestamp}
 */
export async function generateClockResetToken(
  deviceFingerprint: string,
  licenseKey: string,
  shopName: string,
  privateKeyPem: string
): Promise<string> {
  if (!deviceFingerprint || !deviceFingerprint.trim()) {
    throw new Error('بصمة الجهاز مطلوبة لتوليد كود فك حظر الساعة');
  }

  const cleanFp = deviceFingerprint.trim().toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400; // 24 hours validity

  const token = await signActivationToken(
    {
      iss: 'rafiq-license-server',
      sub: licenseKey || `CLOCK-${crypto.randomUUID()}`,
      fp: cleanFp,
      shop: shopName || 'فك حظر ساعة الجهاز',
      type: 'lifetime',
      iat: now,
      exp,
      kind: 'clock_reset',
      jti: crypto.randomUUID(),
    },
    privateKeyPem
  );

  return `RFQ-TIME-${token}`;
}
