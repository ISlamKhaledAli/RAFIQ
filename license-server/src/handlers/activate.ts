import type { Env, ActivateRequest, LicenseRecord } from '../types.ts';
import { validateClientApiKey } from '../auth.ts';
import { signActivationToken } from '../crypto.ts';

export async function handleActivate(request: Request, env: Env): Promise<Response> {
  // 1. Verify Client API Key
  if (!validateClientApiKey(request, env)) {
    return new Response(
      JSON.stringify({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'مفتاح الاتصال بسيرفر التراخيص غير مصرح به أو مفقود',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 2. Parse and Validate Request Payload
  let body: ActivateRequest;
  try {
    body = await request.json<ActivateRequest>();
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        code: 'BAD_REQUEST',
        message: 'بيانات الطلب غير صالحة (JSON غير صحيح)',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const licenseKey = (body.license_key || '').trim().toUpperCase();
  const machineFingerprint = (body.machine_fingerprint || '').trim();
  const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  if (!licenseKey || !machineFingerprint) {
    return new Response(
      JSON.stringify({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'رمز الترخيص وبصمة الجهاز كلاهما مطلوب لإتمام التفعيل',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // Helper to log audit events
  async function logAudit(
    action: 'activate' | 'reactivate' | 'verify' | 'revoke' | 'transfer',
    status: 'success' | 'failed',
    failureReason: string | null
  ) {
    try {
      const logId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO activation_logs (id, license_key, machine_fingerprint, action, status, failure_reason, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(logId, licenseKey, machineFingerprint, action, status, failureReason, ipAddress, userAgent).run();
    } catch (e) {
      console.error('Failed to write activation audit log:', e);
    }
  }

  // 3. Query Database for License Record
  const license = await env.DB.prepare('SELECT * FROM licenses WHERE license_key = ?')
    .bind(licenseKey)
    .first<LicenseRecord>();

  if (!license) {
    await logAudit('activate', 'failed', 'LICENSE_NOT_FOUND');
    return new Response(
      JSON.stringify({
        success: false,
        code: 'LICENSE_NOT_FOUND',
        message: 'رمز الترخيص غير موجود في النظام. يرجى التأكد من الرمز المكتوب.',
      }),
      { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 4. Check Disabled State
  if (license.status === 'disabled') {
    await logAudit('activate', 'failed', 'LICENSE_DISABLED');
    return new Response(
      JSON.stringify({
        success: false,
        code: 'LICENSE_DISABLED',
        message: 'تم إيقاف هذا الترخيص من قبل إدارة رفيق. يرجى التواصل مع الدعم الفني.',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 5. Check Expiration
  if (license.status === 'expired' || (license.expires_at && new Date(license.expires_at) < new Date())) {
    if (license.status !== 'expired') {
      await env.DB.prepare("UPDATE licenses SET status = 'expired', updated_at = datetime('now') WHERE id = ?")
        .bind(license.id)
        .run();
    }
    await logAudit('activate', 'failed', 'LICENSE_EXPIRED');
    return new Response(
      JSON.stringify({
        success: false,
        code: 'LICENSE_EXPIRED',
        message: 'انتهت فترة صلاحية هذا الترخيص.',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 6. Handle Device Binding
  let isReactivation = false;
  if (license.status === 'active') {
    if (license.machine_fingerprint === machineFingerprint) {
      // Same device requesting reactivation / reinstall
      isReactivation = true;
    } else {
      // Bound to a different device!
      await logAudit('activate', 'failed', 'DEVICE_MISMATCH');
      return new Response(
        JSON.stringify({
          success: false,
          code: 'DEVICE_MISMATCH',
          message: 'هذا الترخيص مفعّل ومربوط بجهاز آخر بالفعل. لنقله إلى هذا الجهاز، يرجى التواصل مع الدعم الفني لفك الربط.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  // 7. Activate if Pending
  let activatedTime = license.activated_at;
  if (license.status === 'pending') {
    activatedTime = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE licenses 
       SET status = 'active', 
           machine_fingerprint = ?, 
           activated_at = datetime('now'), 
           updated_at = datetime('now') 
       WHERE id = ?`
    ).bind(machineFingerprint, license.id).run();
  }

  // 8. Generate Cryptographically Signed Token
  const expTimestamp = license.expires_at ? Math.floor(new Date(license.expires_at).getTime() / 1000) : null;
  const token = await signActivationToken(
    {
      iss: 'rafiq-license-server',
      sub: license.license_key,
      fp: machineFingerprint,
      shop: license.shop_name,
      type: license.license_type,
      iat: Math.floor(Date.now() / 1000),
      exp: expTimestamp,
    },
    env.TOKEN_SIGNING_SECRET
  );

  await logAudit(isReactivation ? 'reactivate' : 'activate', 'success', null);

  return new Response(
    JSON.stringify({
      success: true,
      message: isReactivation
        ? 'تمت إعادة إصدار توكن التفعيل بنجاح لهذا الجهاز'
        : 'تم تفعيل الترخيص وربط النسخة بهذا الجهاز بنجاح',
      token,
      license: {
        key: license.license_key,
        shop_name: license.shop_name,
        type: license.license_type,
        status: 'active',
        activated_at: activatedTime,
        expires_at: license.expires_at,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}
