import type { Env, LicenseRecord } from '../types.ts';
import { validateClientApiKey } from '../auth.ts';
import { verifyActivationToken } from '../crypto.ts';

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  if (!validateClientApiKey(request, env)) {
    return new Response(
      JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'غير مصرح به' }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  let body: { token?: string; machine_fingerprint?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, code: 'BAD_REQUEST', message: 'JSON غير صالح' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const token = (body.token || '').trim();
  const machineFingerprint = (body.machine_fingerprint || '').trim();

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, code: 'MISSING_TOKEN', message: 'توكن التفعيل مطلوب' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 1. Verify cryptographic token signature
  const verification = await verifyActivationToken(token, env.TOKEN_SIGNING_SECRET);
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

  const payload = verification.payload;

  // 2. Validate machine fingerprint binding
  if (machineFingerprint && payload.fp !== machineFingerprint) {
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

  // 3. Check real-time status in D1 database
  const license = await env.DB.prepare('SELECT * FROM licenses WHERE license_key = ?')
    .bind(payload.sub)
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

  return new Response(
    JSON.stringify({
      success: true,
      valid: true,
      message: 'الترخيص سارٍ وصالح للاستخدام',
      details: {
        license_key: license.license_key,
        shop_name: license.shop_name,
        status: license.status,
        license_type: license.license_type,
        expires_at: license.expires_at,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}
