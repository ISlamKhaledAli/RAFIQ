import type { Env, LicenseRecord } from '../types.ts';
import { validateClientApiKey } from '../auth.ts';
import { verifyActivationToken, signActivationToken } from '../crypto.ts';

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  if (!validateClientApiKey(request, env)) {
    return new Response(
      JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'غير مصرح به' }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  let body: { token?: string; license_key?: string; machine_fingerprint?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, code: 'BAD_REQUEST', message: 'JSON غير صالح' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const token = (body.token || '').trim();
  const rawKey = (body.license_key || '').trim().toUpperCase();
  const machineFingerprint = (body.machine_fingerprint || '').trim();

  let licenseKey = rawKey;
  let tokenFingerprint = '';

  // 1. If token is provided, verify its HMAC signature (allowing expired tokens so we can renew/verify them against D1)
  if (token) {
    const verification = await verifyActivationToken(token, env.TOKEN_SIGNING_SECRET, true /* ignoreExpiration */);
    if (!verification.valid || !verification.payload) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          code: 'INVALID_TOKEN',
          message: verification.error || 'التوكن غير صالح أو تم التلاعب به',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    licenseKey = verification.payload.sub;
    tokenFingerprint = verification.payload.fp;

    // Validate machine fingerprint binding against token payload if provided
    if (machineFingerprint && tokenFingerprint && tokenFingerprint !== machineFingerprint) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          code: 'FINGERPRINT_MISMATCH',
          message: 'التوكن لا يطابق بصمة هذا الجهاز',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  if (!licenseKey) {
    return new Response(
      JSON.stringify({ success: false, code: 'MISSING_TOKEN', message: 'توكن التفعيل أو رمز الترخيص مطلوب' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 2. Check real-time status in D1 database
  const license = await env.DB.prepare('SELECT * FROM licenses WHERE license_key = ?')
    .bind(licenseKey)
    .first<LicenseRecord>();

  if (!license) {
    return new Response(
      JSON.stringify({
        success: false,
        valid: false,
        code: 'LICENSE_NOT_FOUND',
        message: 'سجل الترخيص لم يعد موجوداً في النظام',
      }),
      { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // Validate device binding against database
  if (machineFingerprint && license.machine_fingerprint && license.machine_fingerprint !== machineFingerprint) {
    return new Response(
      JSON.stringify({
        success: false,
        valid: false,
        code: 'DEVICE_MISMATCH',
        message: 'هذا الترخيص مفعّل ومربوط بجهاز آخر',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  if (license.status === 'disabled') {
    return new Response(
      JSON.stringify({
        success: false,
        valid: false,
        code: 'LICENSE_REVOKED',
        message: 'تم إيقاف هذا الترخيص من قبل الإدارة',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // Expiration validation
  const isExpired = license.status === 'expired' || (Boolean(license.expires_at) && new Date(license.expires_at!) < new Date());
  if (isExpired) {
    if (license.status !== 'expired') {
      await env.DB.prepare("UPDATE licenses SET status = 'expired', updated_at = datetime('now') WHERE id = ?")
        .bind(license.id)
        .run();
    }
    return new Response(
      JSON.stringify({
        success: false,
        valid: false,
        code: 'LICENSE_EXPIRED',
        message: 'انتهت فترة صلاحية هذا الترخيص',
        details: {
          license_key: license.license_key,
          shop_name: license.shop_name,
          status: 'expired',
          license_type: license.license_type,
          expires_at: license.expires_at,
        },
      }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // If database status was 'expired' but expiration date is now in the future (e.g. admin extended it), restore active status
  if (license.status !== 'active') {
    await env.DB.prepare("UPDATE licenses SET status = 'active', updated_at = datetime('now') WHERE id = ?")
      .bind(license.id)
      .run();
    license.status = 'active';
  }

  // 3. Issue refreshed JWT token reflecting the current expiration date
  const boundFp = license.machine_fingerprint || machineFingerprint || tokenFingerprint;
  const expTimestamp = license.expires_at ? Math.floor(new Date(license.expires_at).getTime() / 1000) : null;
  const freshToken = await signActivationToken(
    {
      iss: 'rafiq-license-server',
      sub: license.license_key,
      fp: boundFp,
      shop: license.shop_name,
      type: license.license_type,
      iat: Math.floor(Date.now() / 1000),
      exp: expTimestamp,
    },
    env.TOKEN_SIGNING_SECRET
  );

  return new Response(
    JSON.stringify({
      success: true,
      valid: true,
      message: 'الترخيص سارٍ ومعتمد لهذا الجهاز',
      token: freshToken,
      license: {
        key: license.license_key,
        shop_name: license.shop_name,
        type: license.license_type,
        status: 'active',
        activated_at: license.activated_at,
        expires_at: license.expires_at,
      },
      details: {
        license_key: license.license_key,
        shop_name: license.shop_name,
        status: 'active',
        license_type: license.license_type,
        expires_at: license.expires_at,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}
