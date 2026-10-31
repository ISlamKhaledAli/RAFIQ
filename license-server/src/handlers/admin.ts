import type { Env, LicenseRecord, LicenseType, ActivationLogRecord, ReleaseRecord } from '../types.ts';
import { validateAdminSecret } from '../auth.ts';
import { 
  generateOfflineSupportCode,
  generateRootSessionToken,
  generatePinRecoveryToken,
  generateClockResetToken,
  computeFingerprintTag
} from '../crypto.ts';
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
      JSON.stringify({ success: true, licenses: licenses.results || [], data: licenses.results || [] }),
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
      set_days?: number;
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
    } else if (body.set_days !== undefined && Number(body.set_days) >= 0) {
      const days = Number(body.set_days);
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + days);
      newExpiresAt = baseDate.toISOString();
      newType = days >= 365 ? 'annual' : (days >= 30 ? 'monthly' : 'trial');
      if (days === 0) {
        newStatus = 'expired';
      } else if (newStatus === 'expired') {
        newStatus = 'active';
      }
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
      JSON.stringify({ success: true, logs: logs.results || [], data: logs.results || [] }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 9. POST /api/admin/generate-support-code - Generate cryptographically signed offline code
  // Handles custom duration without CHECK constraint failure and links seamlessly to existing license if available
  if (request.method === 'POST' && url.pathname === '/api/admin/generate-support-code') {
    const body = await request.json<{
      device_fingerprint: string;
      license_type?: string;
      days?: number;
      shop_name?: string;
      license_id?: string;
    }>();

    if (!body.device_fingerprint || !body.device_fingerprint.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: 'بصمة الجهاز (Device Fingerprint) مطلوبة' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const safeDays = Math.max(1, Math.floor(Number(body.days) || (body.license_type === 'lifetime' ? 9999 : 7)));
    let licType: LicenseType = 'annual';
    let expiresAt: string | null = null;

    if (body.license_type === 'lifetime' || safeDays >= 9000) {
      licType = 'lifetime';
      expiresAt = null;
    } else if (body.license_type === 'trial' || safeDays <= 14) {
      licType = 'trial';
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + safeDays);
      expiresAt = expDate.toISOString();
    } else if (safeDays <= 31) {
      licType = 'monthly';
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + safeDays);
      expiresAt = expDate.toISOString();
    } else {
      licType = 'annual';
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + safeDays);
      expiresAt = expDate.toISOString();
    }

    const cleanFp = body.device_fingerprint.trim().toUpperCase();
    const cleanShop = body.shop_name && body.shop_name.trim() ? body.shop_name.trim() : 'جهاز أوفلاين';

    try {
      // Find matching existing license if license_id passed or by machine_fingerprint
      let existingLic: LicenseRecord | null = null;
      if (body.license_id) {
        existingLic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?')
          .bind(body.license_id)
          .first<LicenseRecord>();
      }
      if (!existingLic) {
        existingLic = await env.DB.prepare('SELECT * FROM licenses WHERE machine_fingerprint = ?')
          .bind(cleanFp)
          .first<LicenseRecord>();
      }

      const licenseKey = existingLic ? existingLic.license_key : generateLicenseKey();
      const finalShop = existingLic && existingLic.shop_name ? existingLic.shop_name : cleanShop;

      const supportCode = await generateOfflineSupportCode(
        cleanFp,
        licType,
        safeDays,
        env.LICENSE_PRIVATE_KEY,
        finalShop,
        licenseKey
      );

      if (existingLic) {
        await env.DB.prepare(
          `UPDATE licenses 
           SET status = 'active', 
               machine_fingerprint = ?, 
               license_type = ?, 
               expires_at = ?, 
               shop_name = ?, 
               updated_at = datetime('now') 
           WHERE id = ?`
        ).bind(cleanFp, licType, expiresAt, finalShop, existingLic.id).run();
      } else {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO licenses (id, license_key, shop_name, owner_phone, license_type, status, machine_fingerprint, max_devices, activated_at, expires_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, 'active', ?, 1, datetime('now'), ?, 'ترخيص صادر بكود دعم أوفلاين (RFQ-SUP)', datetime('now'), datetime('now'))`
        ).bind(id, licenseKey, finalShop, licType, cleanFp, expiresAt).run();
      }

      // Log in activation_logs
      try {
        const logId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO activation_logs (id, license_key, machine_fingerprint, action, status, failure_reason, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, 'activate', 'success', 'توليد كود دعم فني أوفلاين من لوحة المشرف', 'admin_portal', 'admin', datetime('now'))`
        ).bind(logId, licenseKey, cleanFp).run();
      } catch {}

      return new Response(
        JSON.stringify({
          success: true,
          message: 'تم توليد كود الدعم الفني وتسجيل الترخيص بالنظام بنجاح',
          support_code: supportCode,
          license_key: licenseKey,
          device_fingerprint: cleanFp,
          license_type: licType,
          days: safeDays,
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

  // 10. POST /api/admin/root-session - Challenge-Response Developer Root Access (SEC-01)
  if (request.method === 'POST' && url.pathname === '/api/admin/root-session') {
    const body = await request.json<{
      license_id?: string;
      challenge_code?: string;
      challenge?: string;
      manual_fingerprint?: string;
      device_fingerprint?: string;
    }>();

    const challengeCode = (body.challenge_code || body.challenge || '').trim();
    if (!challengeCode) {
      return new Response(
        JSON.stringify({ success: false, message: 'كود التحدي الظاهر على شاشة العميل مطلوب' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    let targetFp = (body.manual_fingerprint || body.device_fingerprint || '').trim().toUpperCase();
    let licenseKey = '';
    let shopName = 'جلسة دعم فني للمطور';

    if (body.license_id) {
      const lic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?')
        .bind(body.license_id)
        .first<LicenseRecord>();
      if (lic) {
        if (lic.machine_fingerprint) targetFp = lic.machine_fingerprint.trim().toUpperCase();
        licenseKey = lic.license_key;
        shopName = lic.shop_name;
      }
    }

    if (!targetFp) {
      return new Response(
        JSON.stringify({ success: false, message: 'هذا الترخيص غير مربوط بأي جهاز بعد. يرجى إدخال بصمة الجهاز يدوياً.' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const rawChallenge = challengeCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rawChallenge.length >= 10) {
      const tagInChallenge = rawChallenge.slice(-2);
      const expectedTag = await computeFingerprintTag(targetFp);
      if (tagInChallenge !== expectedTag) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'CHALLENGE_MISMATCH',
            message: 'كود التحدي لا يطابق بصمة جهاز هذا الترخيص! تأكد من اختيار المنشأة الصحيحة أو أدخل البصمة يدوياً.'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }
    }

    try {
      const rootToken = await generateRootSessionToken(
        targetFp,
        rawChallenge,
        licenseKey,
        shopName,
        env.LICENSE_PRIVATE_KEY
      );

      try {
        const logId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO activation_logs (id, license_key, machine_fingerprint, action, status, failure_reason, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, 'verify', 'success', 'إصدار تصريح دخول Root للمطور', 'admin_portal', 'admin', datetime('now'))`
        ).bind(logId, licenseKey || 'ROOT_SESSION', targetFp).run();
      } catch {}

      return new Response(
        JSON.stringify({
          success: true,
          message: 'تم إصدار تصريح الدعم الفني Root بنجاح',
          root_token: rootToken,
          session_token: rootToken,
          shop_name: shopName,
          device_fingerprint: targetFp,
          expires_in_seconds: 900
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إصدار تصريح Root';
      return new Response(
        JSON.stringify({ success: false, message: msg }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  // 11. POST /api/admin/licenses/:id/recovery-code - Owner PIN Recovery Token (SEC-02)
  const recoveryMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/recovery-code$/);
  if (request.method === 'POST' && recoveryMatch) {
    const licenseId = recoveryMatch[1];
    const lic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?')
      .bind(licenseId)
      .first<LicenseRecord>();

    if (!lic) {
      return new Response(
        JSON.stringify({ success: false, message: 'سجل الترخيص غير موجود' }),
        { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    if (!lic.machine_fingerprint) {
      return new Response(
        JSON.stringify({ success: false, message: 'هذا الترخيص غير مربوط بأي جهاز بعد ولا يمكن استعادة PIN المالك له' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    try {
      const recToken = await generatePinRecoveryToken(
        lic.machine_fingerprint,
        lic.license_key,
        lic.shop_name,
        env.LICENSE_PRIVATE_KEY
      );

      try {
        const logId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO activation_logs (id, license_key, machine_fingerprint, action, status, failure_reason, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, 'verify', 'success', 'توليد كود استعادة PIN المالك', 'admin_portal', 'admin', datetime('now'))`
        ).bind(logId, lic.license_key, lic.machine_fingerprint).run();
      } catch {}

      return new Response(
        JSON.stringify({
          success: true,
          message: 'تم توليد كود استعادة PIN المالك بنجاح',
          recovery_code: recToken,
          shop_name: lic.shop_name,
          owner_phone: lic.owner_phone,
          device_fingerprint: lic.machine_fingerprint
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل توليد كود الاستعادة';
      return new Response(
        JSON.stringify({ success: false, message: msg }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  // 12. POST /api/admin/licenses/:id/clock-reset - Clock Rollback Unlock Token (BUG-06)
  const clockMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/clock-reset$/);
  if (request.method === 'POST' && clockMatch) {
    const licenseId = clockMatch[1];
    const lic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?')
      .bind(licenseId)
      .first<LicenseRecord>();

    if (!lic || !lic.machine_fingerprint) {
      return new Response(
        JSON.stringify({ success: false, message: 'الترخيص غير موجود أو غير مربوط بجهاز' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    try {
      const clockToken = await generateClockResetToken(
        lic.machine_fingerprint,
        lic.license_key,
        lic.shop_name,
        env.LICENSE_PRIVATE_KEY
      );

      try {
        const logId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO activation_logs (id, license_key, machine_fingerprint, action, status, failure_reason, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, 'verify', 'success', 'توليد كود فك حظر تراجع الساعة', 'admin_portal', 'admin', datetime('now'))`
        ).bind(logId, lic.license_key, lic.machine_fingerprint).run();
      } catch {}

      return new Response(
        JSON.stringify({
          success: true,
          message: 'تم توليد كود فك حظر الساعة بنجاح',
          clock_reset_code: clockToken,
          reset_code: clockToken,
          shop_name: lic.shop_name,
          device_fingerprint: lic.machine_fingerprint
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل توليد كود فك حظر الساعة';
      return new Response(
        JSON.stringify({ success: false, message: msg }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  
  // ==========================================
  // RELEASES & UPDATE ENTITLEMENT MANAGEMENT
  // ==========================================

  // 12. GET /api/admin/releases - List all releases
  if (request.method === 'GET' && url.pathname === '/api/admin/releases') {
    const releases = await env.DB.prepare(
      'SELECT * FROM app_releases ORDER BY release_date DESC, created_at DESC LIMIT 100'
    ).all<ReleaseRecord>();

    return new Response(
      JSON.stringify({ success: true, releases: releases.results || [] }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 13. POST /api/admin/releases - Publish new release
  if (request.method === 'POST' && url.pathname === '/api/admin/releases') {
    const body = await request.json<{
      version: string;
      release_date?: string;
      title?: string;
      changelog?: string;
      download_url: string;
      sha256: string;
      file_size_bytes?: number;
      is_mandatory?: boolean;
      is_published?: boolean;
    }>();

    if (!body.version || !body.download_url || !body.sha256) {
      return new Response(
        JSON.stringify({ success: false, message: 'بيانات رقم الإصدار ورابط التحميل وبصمة الهاش (SHA-256) إلزامية' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const id = crypto.randomUUID();
    const cleanVersion = body.version.trim().replace(/^[vV]/, '');
    const releaseDate = body.release_date ? body.release_date.trim() : new Date().toISOString().slice(0, 10);
    const title = body.title && body.title.trim() ? body.title.trim() : ('إصدار رفيق v' + cleanVersion);
    const changelog = body.changelog && body.changelog.trim() ? body.changelog.trim() : 'تحسينات عامة واستقرار إضافي للنظام.';
    const downloadUrl = body.download_url.trim();
    const sha256 = body.sha256.trim().toUpperCase();
    const fileSizeBytes = Number(body.file_size_bytes) || 0;
    const isMandatory = body.is_mandatory ? 1 : 0;
    const isPublished = body.is_published !== undefined ? (body.is_published ? 1 : 0) : 1;

    // Check if version already exists
    const existing = await env.DB.prepare('SELECT id FROM app_releases WHERE version = ?').bind(cleanVersion).first();
    if (existing) {
      return new Response(
        JSON.stringify({ success: false, message: 'رقم هذا الإصدار مسجل مسبقاً في قائمة التحديثات' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    await env.DB.prepare(
      `INSERT INTO app_releases (id, version, release_date, title, changelog, download_url, sha256, file_size_bytes, is_mandatory, is_published, min_client_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '1.0.0', datetime('now'), datetime('now'))`
    ).bind(
      id, cleanVersion, releaseDate, title, changelog, downloadUrl, sha256, fileSizeBytes, isMandatory, isPublished
    ).run();

    return new Response(
      JSON.stringify({ success: true, message: 'تم نشر حزمة الإصدار الجديد بنجاح', id, version: cleanVersion }),
      { status: 201, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 14. POST /api/admin/releases/:id/toggle - Toggle release published state (Emergency Kill Switch)
  const toggleRelMatch = url.pathname.match(/^\/api\/admin\/releases\/([^/]+)\/toggle$/);
  if (request.method === 'POST' && toggleRelMatch) {
    const relId = toggleRelMatch[1];
    const rel = await env.DB.prepare('SELECT * FROM app_releases WHERE id = ?').bind(relId).first<ReleaseRecord>();
    if (!rel) {
      return new Response(
        JSON.stringify({ success: false, message: 'الإصدار غير موجود' }),
        { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const newPublished = rel.is_published === 1 ? 0 : 1;
    await env.DB.prepare("UPDATE app_releases SET is_published = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(newPublished, relId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: newPublished === 1 ? 'تم تفعيل نشر الإصدار للعملاء' : 'تم إيقاف نشر الإصدار فورياً للعملاء (Emergency Stop)',
        is_published: newPublished
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 15. POST /api/admin/releases/:id/delete - Delete release record
  const delRelMatch = url.pathname.match(/^\/api\/admin\/releases\/([^/]+)\/delete$/);
  if (request.method === 'POST' && delRelMatch) {
    const relId = delRelMatch[1];
    await env.DB.prepare('DELETE FROM app_releases WHERE id = ?').bind(relId).run();
    return new Response(
      JSON.stringify({ success: true, message: 'تم حذف سجل الإصدار بنجاح' }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 16. POST /api/admin/licenses/:id/toggle-updates - Toggle license update entitlement
  const toggleLicUpdMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/toggle-updates$/);
  if (request.method === 'POST' && toggleLicUpdMatch) {
    const licId = toggleLicUpdMatch[1];
    const lic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(licId).first<LicenseRecord>();
    if (!lic) {
      return new Response(
        JSON.stringify({ success: false, message: 'الترخيص غير موجود' }),
        { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const newCan = lic.can_receive_updates === 1 ? 0 : 1;
    await env.DB.prepare("UPDATE licenses SET can_receive_updates = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(newCan, licId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: newCan === 1 ? 'تم تفعيل استلام التحديثات الهوائية لهذا المحل' : 'تم إيقاف استلام التحديثات الهوائية لهذا المحل',
        can_receive_updates: newCan
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 17. POST /api/admin/licenses/:id/extend-updates - Extend update entitlement period
  const extLicUpdMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/extend-updates$/);
  if (request.method === 'POST' && extLicUpdMatch) {
    const licId = extLicUpdMatch[1];
    const body = await request.json<{ days?: number; lifetime?: boolean }>();
    const lic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(licId).first<LicenseRecord>();
    if (!lic) {
      return new Response(
        JSON.stringify({ success: false, message: 'الترخيص غير موجود' }),
        { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    let newUntil: string | null = null;
    if (body.lifetime) {
      newUntil = null;
    } else if (body.days && Number(body.days) > 0) {
      let base = new Date();
      if (lic.updates_until) {
        const cur = new Date(lic.updates_until);
        if (cur > base) base = cur;
      }
      base.setDate(base.getDate() + Number(body.days));
      newUntil = base.toISOString();
    }

    await env.DB.prepare("UPDATE licenses SET can_receive_updates = 1, updates_until = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(newUntil, licId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم تمديد فترة التحديثات الهوائية بنجاح',
        updates_until: newUntil,
        can_receive_updates: 1
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
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
