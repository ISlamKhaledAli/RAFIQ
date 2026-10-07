import type { Env, LicenseRecord, LicenseType, ActivationLogRecord } from '../types.ts';
import { validateAdminSecret } from '../auth.ts';
import { generateOfflineSupportCode } from '../crypto.ts';
import { serveAdminHtml } from '../views/admin/index.ts';
/**
 * Handle Admin API & Dashboard
 */
export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // Serve Admin HTML Dashboard on GET /admin
  if (request.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    return serveAdminHtml();
  }

  // All Admin API endpoints require admin authentication
  if (!validateAdminSecret(request, env)) {
    return new Response(
      JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'كلمة سر الإدارة غير صحيحة أو مفقودة' }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 1. GET /api/admin/licenses - List all licenses (up to 1000)
  if (request.method === 'GET' && url.pathname === '/api/admin/licenses') {
    const licenses = await env.DB.prepare(
      'SELECT * FROM licenses ORDER BY created_at DESC LIMIT 1000'
    ).all<LicenseRecord>();

    return new Response(
      JSON.stringify({ success: true, count: licenses.results.length, data: licenses.results }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 2. POST /api/admin/licenses - Create a new license
  if (request.method === 'POST' && url.pathname === '/api/admin/licenses') {
    const body = await request.json<{
      shop_name: string;
      owner_phone?: string;
      license_type?: LicenseType;
      days_valid?: number;
      notes?: string;
    }>();

    if (!body.shop_name || !body.shop_name.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: 'اسم المنشأة أو النشاط مطلوب' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const id = crypto.randomUUID();
    const licenseKey = generateLicenseKey();
    let licenseType: LicenseType = body.license_type || 'lifetime';
    let expiresAt: string | null = null;

    const daysValid = Number(body.days_valid) || 0;
    if (daysValid > 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + daysValid);
      expiresAt = expDate.toISOString();
      licenseType = daysValid >= 365 ? 'annual' : (daysValid >= 30 ? 'monthly' : 'trial');
    } else {
      licenseType = 'lifetime';
    }

    await env.DB.prepare(
      `INSERT INTO licenses (id, license_key, shop_name, owner_phone, license_type, status, max_devices, expires_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      id,
      licenseKey,
      body.shop_name.trim(),
      body.owner_phone ? body.owner_phone.trim() : null,
      licenseType,
      expiresAt,
      body.notes ? body.notes.trim() : null
    ).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم إصدار رمز الترخيص الجديد بنجاح',
        license: {
          id,
          license_key: licenseKey,
          shop_name: body.shop_name.trim(),
          license_type: licenseType,
          status: 'pending',
          expires_at: expiresAt,
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 3. POST /api/admin/licenses/:id/update - Update license & extend duration
  const updateMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/update$/);
  if (request.method === 'POST' && updateMatch) {
    const licenseId = updateMatch[1];
    const body = await request.json<{
      shop_name?: string;
      owner_phone?: string;
      days_to_add?: number;
      set_lifetime?: boolean;
      notes?: string;
    }>();

    const existing = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?')
      .bind(licenseId)
      .first<LicenseRecord>();

    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, message: 'الترخيص غير موجود' }),
        { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const newShopName = body.shop_name ? body.shop_name.trim() : existing.shop_name;
    const newPhone = body.owner_phone !== undefined ? (body.owner_phone ? body.owner_phone.trim() : null) : existing.owner_phone;
    const newNotes = body.notes !== undefined ? body.notes.trim() : existing.notes;
    let newExpiresAt = existing.expires_at;
    let newType = existing.license_type;
    let newStatus = existing.status;

    if (body.set_lifetime) {
      newExpiresAt = null;
      newType = 'lifetime';
      if (newStatus === 'expired') newStatus = 'active';
    } else if (body.days_to_add && Number(body.days_to_add) > 0) {
      const days = Number(body.days_to_add);
      let baseDate = new Date();
      if (existing.expires_at) {
        const curExp = new Date(existing.expires_at);
        if (curExp > baseDate) {
          baseDate = curExp;
        }
      }
      baseDate.setDate(baseDate.getDate() + days);
      newExpiresAt = baseDate.toISOString();
      if (newStatus === 'expired') newStatus = 'active';
      if (newType === 'lifetime') newType = 'annual';
    }

    await env.DB.prepare(
      `UPDATE licenses 
       SET shop_name = ?, 
           owner_phone = ?, 
           license_type = ?, 
           status = ?, 
           expires_at = ?, 
           notes = ?, 
           updated_at = datetime('now') 
       WHERE id = ?`
    ).bind(
      newShopName,
      newPhone,
      newType,
      newStatus,
      newExpiresAt,
      newNotes,
      licenseId
    ).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم تحديث الترخيص وتمديد الصلاحية بنجاح',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 4. POST /api/admin/licenses/:id/revoke - Disable license
  const revokeMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    const licenseId = revokeMatch[1];
    await env.DB.prepare("UPDATE licenses SET status = 'disabled', updated_at = datetime('now') WHERE id = ?")
      .bind(licenseId)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'تم إيقاف الترخيص بنجاح' }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 5. POST /api/admin/licenses/:id/activate - Re-enable license
  const activateMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/activate$/);
  if (request.method === 'POST' && activateMatch) {
    const licenseId = activateMatch[1];
    await env.DB.prepare("UPDATE licenses SET status = 'active', updated_at = datetime('now') WHERE id = ?")
      .bind(licenseId)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'تم تفعيل الترخيص بنجاح' }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 6. POST /api/admin/licenses/:id/reset-device - Unlink machine fingerprint to transfer license
  const resetMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/reset-device$/);
  if (request.method === 'POST' && resetMatch) {
    const licenseId = resetMatch[1];
    await env.DB.prepare(
      "UPDATE licenses SET machine_fingerprint = NULL, status = 'pending', updated_at = datetime('now') WHERE id = ?"
    )
      .bind(licenseId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم فك ربط الجهاز بالترخيص بنجاح. يمكن تفعيله على جهاز جديد الآن.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 7. POST /api/admin/licenses/:id/delete - Delete license
  const deleteMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/delete$/);
  if (request.method === 'POST' && deleteMatch) {
    const licenseId = deleteMatch[1];
    await env.DB.prepare('DELETE FROM licenses WHERE id = ?')
      .bind(licenseId)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'تم حذف الترخيص' }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 8. GET /api/admin/logs - Recent activation logs (up to 1000)
  if (request.method === 'GET' && url.pathname === '/api/admin/logs') {
    const logs = await env.DB.prepare(
      'SELECT * FROM activation_logs ORDER BY created_at DESC LIMIT 1000'
    ).all<ActivationLogRecord>();

    return new Response(
      JSON.stringify({ success: true, count: logs.results.length, data: logs.results }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 9. POST /api/admin/generate-support-code - Generate cryptographically signed offline code for air-gapped devices
  if (request.method === 'POST' && url.pathname === '/api/admin/generate-support-code') {
    const body = await request.json<{
      device_fingerprint: string;
      license_type?: string;
      days?: number;
    }>();

    if (!body.device_fingerprint || !body.device_fingerprint.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: 'بصمة الجهاز (Device Fingerprint) مطلوبة' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const licType = body.license_type || 'trial';
    const days = Number(body.days) || (licType === 'lifetime' ? 9999 : 7);

    try {
      const supportCode = await generateOfflineSupportCode(
        body.device_fingerprint.trim(),
        licType,
        days
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: 'تم توليد كود الدعم الفني المشفر للأجهزة بدون إنترنت بنجاح',
          support_code: supportCode,
          device_fingerprint: body.device_fingerprint.trim().toUpperCase(),
          license_type: licType,
          days: days,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل توليد الكود';
      return new Response(
        JSON.stringify({ success: false, message: msg }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ success: false, message: 'المسار غير موجود' }),
    { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}

/**
 * Generate human-friendly license key: RFQ-XXXX-XXXX-XXXX
 */
function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude 0, 1, I, O to prevent confusion
  function part(len: number) {
    let res = '';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < len; i++) {
      res += chars[bytes[i] % chars.length];
    }
    return res;
  }
  return `RFQ-${part(4)}-${part(4)}-${part(4)}`;
}

