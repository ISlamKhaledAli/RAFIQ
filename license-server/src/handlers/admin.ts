import type { Env, LicenseRecord, LicenseType, ActivationLogRecord } from '../types.ts';
import { validateAdminSecret } from '../auth.ts';

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

  // 1. GET /api/admin/licenses - List all licenses
  if (request.method === 'GET' && url.pathname === '/api/admin/licenses') {
    const licenses = await env.DB.prepare(
      'SELECT * FROM licenses ORDER BY created_at DESC LIMIT 200'
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

    let newShopName = body.shop_name ? body.shop_name.trim() : existing.shop_name;
    let newPhone = body.owner_phone !== undefined ? (body.owner_phone ? body.owner_phone.trim() : null) : existing.owner_phone;
    let newNotes = body.notes !== undefined ? body.notes.trim() : existing.notes;
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

  // 8. GET /api/admin/logs - Recent activation logs
  if (request.method === 'GET' && url.pathname === '/api/admin/logs') {
    const logs = await env.DB.prepare(
      'SELECT * FROM activation_logs ORDER BY created_at DESC LIMIT 50'
    ).all<ActivationLogRecord>();

    return new Response(
      JSON.stringify({ success: true, count: logs.results.length, data: logs.results }),
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

/**
 * Professional, clean Arabic Admin UI matching Rafiq POS Identity
 */
function serveAdminHtml(): Response {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="author" content="ISlam Khaled Ali">
  <meta name="copyright" content="Copyright © 2026 ISlam Khaled Ali. All rights reserved.">
  <title>لوحة إدارة تراخيص رفيق POS — تطوير: ISlam Khaled Ali</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #00372d;
      --emerald: #006d41;
      --emerald-dark: #002b23;
      --emerald-light: #10b981;
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --danger: #dc2626;
      --danger-bg: #fef2f2;
      --warning: #d97706;
      --warning-bg: #fffbeb;
      --success-bg: #f0fdf4;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', -apple-system, sans-serif; }
    body { background-color: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

    /* Top Bar */
    .topbar {
      background-color: var(--primary);
      color: white;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-mark {
      background-color: #00523a;
      color: #6ee7b7;
      font-weight: 900;
      font-size: 15px;
      padding: 6px 12px;
      border-radius: 6px;
      letter-spacing: 0.5px;
      border: 1px solid rgba(110,231,183,0.3);
    }
    .brand-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.2px;
    }
    .brand-sub {
      font-size: 11px;
      color: #a7f3d0;
      font-weight: 500;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sys-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #d1fae5;
    }
    .sys-pill-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #10b981;
    }
    .btn-top {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s;
    }
    .btn-top:hover {
      background: rgba(255,255,255,0.2);
    }

    /* Container */
    .app-container {
      max-width: 1400px;
      margin: 20px auto;
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* KPI Summary Row */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    .kpi-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
    }
    .kpi-value {
      font-size: 26px;
      font-weight: 900;
      color: var(--text);
      line-height: 1.1;
    }
    .kpi-active .kpi-value { color: var(--emerald); }
    .kpi-pending .kpi-value { color: var(--warning); }
    .kpi-disabled .kpi-value { color: var(--danger); }

    /* Panels / Cards */
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafbfc;
    }
    .panel-title {
      font-size: 14px;
      font-weight: 800;
      color: var(--primary);
    }
    .panel-desc {
      font-size: 11.5px;
      color: var(--text-muted);
    }
    .panel-body {
      padding: 18px;
    }

    /* Creation Form Layout */
    .create-grid {
      display: grid;
      grid-template-columns: 2fr 1.2fr 1.5fr 1fr auto;
      gap: 12px;
      align-items: flex-end;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .field label {
      font-size: 11.5px;
      font-weight: 700;
      color: #334155;
    }
    .field input, .field select {
      height: 38px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      background: #fff;
    }
    .field input:focus, .field select:focus {
      outline: none;
      border-color: var(--emerald);
      box-shadow: 0 0 0 2px rgba(0,109,65,0.12);
    }
    .btn-create {
      height: 38px;
      background: var(--emerald);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 0 20px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .btn-create:hover {
      background: var(--primary);
    }

    /* Table Toolbar */
    .table-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      border-bottom: 1px solid var(--border);
      gap: 12px;
      background: #fff;
    }
    .search-box {
      width: 320px;
    }
    .search-box input {
      width: 100%;
      height: 34px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 12.5px;
    }
    .filters {
      display: flex;
      gap: 4px;
      background: #f1f5f9;
      padding: 3px;
      border-radius: 6px;
    }
    .filter-tab {
      background: transparent;
      border: none;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
    }
    .filter-tab.active {
      background: white;
      color: var(--primary);
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      padding: 10px 14px;
      font-size: 11.5px;
      font-weight: 800;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      white-space: nowrap;
    }
    tbody tr:hover {
      background: #fafbfc;
    }

    /* Key Box - Compact & strictly one line */
    .key-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .key-text {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 800;
      color: var(--primary);
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .btn-icon-copy {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      cursor: pointer;
    }
    .btn-icon-copy:hover {
      background: #e2e8f0;
      color: var(--text);
    }

    /* Status Pills */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
    }
    .pill-active { background: #dcfce7; color: #166534; }
    .pill-pending { background: #fef9c3; color: #854d0e; }
    .pill-disabled { background: #fee2e2; color: #991b1b; }
    .pill-expired { background: #f1f5f9; color: #475569; }

    /* Countdown Badge for <24h Expiry */
    .countdown-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #fff1f2;
      color: #be123c;
      border: 1px solid #fecdd3;
      padding: 2px 7px;
      border-radius: 6px;
      font-family: monospace;
      font-weight: 800;
      font-size: 11.5px;
      margin-inline-start: 6px;
    }
    .pulse-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #e11d48;
      animation: countdownPulse 1.2s infinite;
    }
    @keyframes countdownPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.8); }
    }

    /* Action buttons in rows */
    .row-actions {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .btn-row {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11.5px;
      font-weight: 700;
      color: #334155;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .btn-row:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .btn-row-danger {
      color: #b91c1c;
      border-color: #fecaca;
    }
    .btn-row-danger:hover {
      background: #fef2f2;
    }
    .btn-row-share {
      color: #15803d;
      border-color: #bbf7d0;
      background: #f0fdf4;
    }
    .btn-row-share:hover {
      background: #dcfce7;
    }

    /* Modal System */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      z-index: 50;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-card {
      background: white;
      border-radius: 10px;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .modal-header {
      background: var(--primary);
      color: white;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h4 {
      font-size: 14px;
      font-weight: 800;
    }
    .modal-close {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
    }
    .modal-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .modal-footer {
      padding: 12px 18px;
      background: #f8fafc;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Login Screen */
    #login-screen {
      display: none;
      position: fixed;
      inset: 0;
      background: #0f172a;
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-box {
      background: white;
      border-radius: 10px;
      padding: 28px;
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .login-box h3 {
      font-size: 18px;
      font-weight: 900;
      color: var(--primary);
    }
    .login-box p {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Notification Toast */
    #toast {
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: #0f172a;
      color: white;
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 700;
      display: none;
      z-index: 999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    @media (max-width: 900px) {
      .kpi-row { grid-template-columns: repeat(2, 1fr); }
      .create-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <!-- Login Modal Overlay -->
  <div id="login-screen">
    <div class="login-box">
      <div>
        <h3>تسجيل الدخول للإدارة</h3>
        <p>يرجى إدخال كلمة سر المشرف للوصول إلى لوحة إدارة التراخيص.</p>
      </div>
      <form onsubmit="handleLogin(event)" style="display:flex; flex-direction:column; gap:12px;">
        <div class="field">
          <label>كلمة سر الإدارة (Admin Secret Key):</label>
          <input type="password" id="loginSecretInput" required placeholder="أدخل كلمة السر...">
        </div>
        <button type="submit" class="btn-create" style="justify-content:center; width:100%;">دخول للنظام</button>
      </form>
    </div>
  </div>

  <!-- Header -->
  <header class="topbar">
    <div class="topbar-brand">
      <div class="brand-mark">RFQ</div>
      <div>
        <div class="brand-title">لوحة إدارة تراخيص رفيق POS</div>
        <div class="brand-sub">بوابة إدارة التراخيص المركزية — تطوير: ISlam Khaled Ali</div>
      </div>
    </div>

    <div class="topbar-actions">
      <div class="sys-pill">
        <div class="sys-pill-dot"></div>
        <span>السيرفر السحابي: متصل</span>
      </div>
      <button class="btn-top" onclick="loadLicenses()">تحديث</button>
      <button class="btn-top" onclick="logout()" style="color:#fca5a5;">خروج</button>
    </div>
  </header>

  <main class="app-container">

    <!-- KPI Summary Row -->
    <div class="kpi-row">
      <div class="kpi-box">
        <span class="kpi-label">إجمالي التراخيص</span>
        <span class="kpi-value" id="kpi-total">0</span>
      </div>
      <div class="kpi-box kpi-active">
        <span class="kpi-label">النشطة والمفعلة</span>
        <span class="kpi-value" id="kpi-active">0</span>
      </div>
      <div class="kpi-box kpi-pending">
        <span class="kpi-label">قيد انتظار التفعيل</span>
        <span class="kpi-value" id="kpi-pending">0</span>
      </div>
      <div class="kpi-box kpi-disabled">
        <span class="kpi-label">معطلة أو منتهية</span>
        <span class="kpi-value" id="kpi-disabled">0</span>
      </div>
    </div>

    <!-- Section 1: Create License -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">إصدار رمز ترخيص جديد لمنشأة أو نشاط</div>
          <div class="panel-desc">توليد مفتاح ترخيص معتمد وتحديد مدة الصلاحية ليتم تسليمه لصاحب المنشأة</div>
        </div>
      </div>
      <div class="panel-body">
        <form onsubmit="handleCreate(event)">
          <div class="create-grid">
            <div class="field">
              <label>اسم المنشأة أو النشاط التجاري *</label>
              <input type="text" id="shopName" required placeholder="مثال: أسواق الأمانة، مطعم الصفا، محل البرنس...">
            </div>

            <div class="field">
              <label>رقم هاتف المالك / المسؤول</label>
              <input type="text" id="ownerPhone" placeholder="010xxxxxxxx" dir="ltr" style="text-align:right;">
            </div>

            <div class="field">
              <label>نوع وصلاحية الترخيص *</label>
              <select id="durationSelect" onchange="toggleCustomDays()">
                <option value="lifetime" selected>دائم مدى الحياة (Lifetime)</option>
                <option value="365">سنوي (365 يوم)</option>
                <option value="180">نصف سنوي (180 يوم)</option>
                <option value="90">ربع سنوي (90 يوم)</option>
                <option value="30">شهري (30 يوم)</option>
                <option value="14">تجريبي (14 يوم)</option>
                <option value="custom">مدة مخصصة (أيام محددة)...</option>
              </select>
            </div>

            <div class="field" id="customDaysWrapper" style="display:none;">
              <label>عدد الأيام</label>
              <input type="number" id="customDaysInput" min="1" max="3650" placeholder="مثلاً: 60">
            </div>

            <div class="field">
              <label>ملاحظات إضافية</label>
              <input type="text" id="notesInput" placeholder="رقم الإيصال، اسم المندوب...">
            </div>

            <button type="submit" class="btn-create">إصدار الرمز</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Section 2: Licenses Table -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">قائمة التراخيص الصادرة</div>
          <div class="panel-desc">متابعة المنشآت المسجلة، تسليم الرموز، تمديد الصلاحية، وفك ربط الأجهزة</div>
        </div>
      </div>

      <div class="table-bar">
        <div class="search-box">
          <input type="text" id="searchInput" oninput="applyFilters()" placeholder="بحث باسم المنشأة، الهاتف، رمز الترخيص، أو بصمة الجهاز (HWID)...">
        </div>

        <div class="filters">
          <button class="filter-tab active" onclick="setFilter('all', this)">الكل</button>
          <button class="filter-tab" onclick="setFilter('active', this)">النشطة</button>
          <button class="filter-tab" onclick="setFilter('pending', this)">في الانتظار</button>
          <button class="filter-tab" onclick="setFilter('disabled', this)">المعطلة</button>
          <button class="filter-tab" onclick="setFilter('expired', this)">المنتهية</button>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>رمز الترخيص (Key)</th>
              <th>المنشأة</th>
              <th>الهاتف</th>
              <th>نوع الصلاحية</th>
              <th>تاريخ الصلاحية والمتبقي</th>
              <th>الحالة</th>
              <th>الجهاز المرتبط</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody id="licensesTableBody">
            <tr>
              <td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">
                جارٍ تحميل البيانات من السيرفر السحابي...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Section 3: Audit Logs -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">سجل حركات وتدقيق التفعيل (Audit Logs)</div>
          <div class="panel-desc">توثيق مباشر لعمليات التفعيل والتحقق من الأجهزة مع الـ IP</div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>التاريخ والوقت</th>
              <th>رمز الترخيص</th>
              <th>العملية</th>
              <th>الحالة</th>
              <th>النتيجة</th>
              <th>عنوان IP</th>
            </tr>
          </thead>
          <tbody id="logsTableBody">
            <tr>
              <td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">
                جارٍ تحميل السجلات...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <!-- Modal: Handover Slip -->
  <div class="modal-overlay" id="shareModal">
    <div class="modal-card">
      <div class="modal-header">
        <h4>تسليم الترخيص للعميل</h4>
        <button class="modal-close" onclick="closeModal('shareModal')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5;">
          تم توليد رسالة التسليم متضمنة رمز التفعيل الخاص بالمنشأة وطريقة التفعيل:
        </p>

        <div style="background:#f8fafc; border:1px solid var(--border); border-radius:6px; padding:12px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:4px;">رمز الترخيص:</div>
          <div id="shareKeyDisplay" style="font-family:monospace; font-size:18px; font-weight:900; color:var(--emerald); margin-bottom:10px;"></div>
          <textarea id="shareTextarea" readonly style="width:100%; height:120px; font-size:12px; border:1px solid #cbd5e1; border-radius:4px; padding:8px; resize:none;"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-row" onclick="closeModal('shareModal')">إغلاق</button>
        <button class="btn-row btn-row-share" onclick="copyShareText()">نسخ الرسالة</button>
        <button class="btn-row btn-row-share" id="shareWhatsAppBtn" onclick="openWhatsApp()">إرسال واتساب</button>
      </div>
    </div>
  </div>

  <!-- Modal: Extend / Edit -->
  <div class="modal-overlay" id="editModal">
    <div class="modal-card">
      <div class="modal-header">
        <h4>تعديل وتمديد صلاحية الترخيص</h4>
        <button class="modal-close" onclick="closeModal('editModal')">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="editLicenseId">

        <div class="field">
          <label>اسم المنشأة أو النشاط</label>
          <input type="text" id="editShopName" required>
        </div>

        <div class="field">
          <label>رقم هاتف المالك</label>
          <input type="text" id="editOwnerPhone" dir="ltr" style="text-align:right;">
        </div>

        <div class="field">
          <label>الصلاحية الحالية</label>
          <div id="editCurrentExpDisplay" style="font-size:12.5px; font-weight:800; color:var(--primary); padding:4px 0;"></div>
        </div>

        <div class="field">
          <label>إجراء التمديد</label>
          <select id="editExtendAction" onchange="toggleEditCustomDays()">
            <option value="none" selected>بدون تغيير الصلاحية (تعديل البيانات فقط)</option>
            <option value="7">+ تمديد 7 أيام (أسبوع)</option>
            <option value="14">+ تمديد 14 يوم (أسبوعين)</option>
            <option value="30">+ تمديد 30 يوم (شهر)</option>
            <option value="90">+ تمديد 90 يوم (3 أشهر)</option>
            <option value="180">+ تمديد 180 يوم (6 أشهر)</option>
            <option value="365">+ تمديد 365 يوم (سنة كاملة)</option>
            <option value="custom">فترة مخصصة (تحديد عدد الأيام)...</option>
            <option value="lifetime">ترقية إلى دائم مدى الحياة (Lifetime)</option>
          </select>
        </div>

        <div class="field" id="editCustomDaysWrapper" style="display:none;">
          <label>عدد أيام التمديد المخصصة</label>
          <input type="number" id="editCustomDaysInput" min="1" max="3650" placeholder="مثلاً: 15 أو 45 أو 60 يوم">
        </div>

        <div class="field">
          <label>ملاحظات</label>
          <input type="text" id="editNotes">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-row" onclick="closeModal('editModal')">إلغاء</button>
        <button class="btn-create" onclick="submitEdit()">حفظ التعديل</button>
      </div>
    </div>
  </div>

  <!-- Modal: Confirm Action -->
  <div class="modal-overlay" id="confirmModal">
    <div class="modal-card" style="max-width:380px;">
      <div class="modal-header">
        <h4 id="confirmModalTitle">تأكيد الإجراء</h4>
        <button class="modal-close" onclick="closeModal('confirmModal')">&times;</button>
      </div>
      <div class="modal-body">
        <p id="confirmModalMessage" style="font-size:13px; line-height:1.5; color:#334155; font-weight:600;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn-row" onclick="closeModal('confirmModal')">تراجع</button>
        <button class="btn-create" id="confirmModalActionBtn">تأكيد</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast"></div>

  <script>
    const DEFAULT_SECRET = 'rafiq_admin_super_secret_2026';
    let allLicenses = [];
    let currentFilter = 'all';
    let currentShareData = null;

    function getSecret() {
      return localStorage.getItem('rafiq_admin_secret') || sessionStorage.getItem('rafiq_admin_secret') || '';
    }

    function setSecret(sec) {
      localStorage.setItem('rafiq_admin_secret', sec);
    }

    function checkAuth() {
      const sec = getSecret();
      const screen = document.getElementById('login-screen');
      if (!sec) {
        screen.style.display = 'flex';
        document.getElementById('loginSecretInput').value = DEFAULT_SECRET;
        return false;
      }
      screen.style.display = 'none';
      return true;
    }

    function handleLogin(e) {
      e.preventDefault();
      const val = document.getElementById('loginSecretInput').value.trim();
      if (!val) return;
      setSecret(val);
      document.getElementById('login-screen').style.display = 'none';
      loadLicenses();
    }

    function logout() {
      showConfirm(
        'تسجيل الخروج',
        'هل تريد قفل لوحة التحكم وتسجيل الخروج؟',
        () => {
          localStorage.removeItem('rafiq_admin_secret');
          sessionStorage.removeItem('rafiq_admin_secret');
          location.reload();
        }
      );
    }

    function showToast(text, isError = false) {
      const t = document.getElementById('toast');
      t.textContent = text;
      t.style.background = isError ? '#991b1b' : '#065f46';
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2800);
    }

    function openModal(id) { document.getElementById(id).style.display = 'flex'; }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }

    function showConfirm(title, message, onConfirm) {
      document.getElementById('confirmModalTitle').textContent = title;
      document.getElementById('confirmModalMessage').textContent = message;
      document.getElementById('confirmModalActionBtn').onclick = () => {
        closeModal('confirmModal');
        onConfirm();
      };
      openModal('confirmModal');
    }

    function toggleCustomDays() {
      const val = document.getElementById('durationSelect').value;
      const w = document.getElementById('customDaysWrapper');
      if (val === 'custom') {
        w.style.display = 'flex';
        document.getElementById('customDaysInput').focus();
      } else {
        w.style.display = 'none';
      }
    }

    async function loadLicenses() {
      if (!checkAuth()) return;

      try {
        const res = await fetch('/api/admin/licenses', {
          headers: { 'X-Admin-Secret': getSecret() }
        });

        if (res.status === 401) {
          localStorage.removeItem('rafiq_admin_secret');
          checkAuth();
          return;
        }

        const data = await res.json();
        if (!data.success) {
          showToast('فشل جلب البيانات: ' + data.message, true);
          return;
        }

        allLicenses = data.data || [];
        updateMetrics();
        applyFilters();
        loadLogs();
      } catch (err) {
        showToast('خطأ في الاتصال بالخادم: ' + err.message, true);
      }
    }

    function updateMetrics() {
      document.getElementById('kpi-total').textContent = allLicenses.length;
      const now = new Date();
      let active = 0, pending = 0, disabled = 0;

      allLicenses.forEach(l => {
        const isExp = l.expires_at && new Date(l.expires_at) < now;
        if (l.status === 'disabled' || l.status === 'expired' || isExp) {
          disabled++;
        } else if (l.status === 'active') {
          active++;
        } else if (l.status === 'pending') {
          pending++;
        }
      });

      document.getElementById('kpi-active').textContent = active;
      document.getElementById('kpi-pending').textContent = pending;
      document.getElementById('kpi-disabled').textContent = disabled;
    }

    function setFilter(f, btn) {
      currentFilter = f;
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    }

    function applyFilters() {
      const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
      const now = new Date();

      const list = allLicenses.filter(l => {
        const isExp = l.expires_at && new Date(l.expires_at) < now;
        if (currentFilter === 'active' && (l.status !== 'active' || isExp)) return false;
        if (currentFilter === 'pending' && l.status !== 'pending') return false;
        if (currentFilter === 'disabled' && l.status !== 'disabled') return false;
        if (currentFilter === 'expired' && (!isExp && l.status !== 'expired')) return false;

        if (q) {
          const matchKey = l.license_key.toLowerCase().includes(q);
          const matchShop = l.shop_name.toLowerCase().includes(q);
          const matchPhone = (l.owner_phone || '').includes(q);
          const matchFp = (l.machine_fingerprint || '').toLowerCase().includes(q);
          if (!matchKey && !matchShop && !matchPhone && !matchFp) return false;
        }
        return true;
      });

      renderTable(list);
    }

    function renderTable(list) {
      const tbody = document.getElementById('licensesTableBody');
      tbody.innerHTML = '';

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted);">لا توجد سجلات تطابق الفلتر أو البحث</td></tr>';
        return;
      }

      const now = new Date();

      list.forEach(lic => {
        const tr = document.createElement('tr');

        // Remaining Days calculation & Countdown
        let expText = '<span style="color:#059669; font-weight:800;">دائم مدى الحياة</span>';
        let isExpired = false;
        if (lic.expires_at) {
          const expDate = new Date(lic.expires_at);
          const diffMs = expDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const dateStr = expDate.toISOString().split('T')[0];

          if (diffMs <= 0) {
            isExpired = true;
            expText = '<span style="color:#dc2626; font-weight:700;">' + dateStr + ' (منتهي)</span>';
          } else if (diffMs <= 24 * 60 * 60 * 1000) {
            expText = '<span>' + dateStr + ' <span class="countdown-badge" data-expires="' + lic.expires_at + '"><span class="pulse-dot"></span><span class="countdown-text">جارٍ الحساب...</span></span></span>';
          } else {
            expText = '<span>' + dateStr + ' <small style="color:#059669; font-weight:700;">(متبقي ' + diffDays + ' يوم)</small></span>';
          }
        }

        // Status pill
        let statusHtml = '<span class="pill pill-pending">في الانتظار</span>';
        if (lic.status === 'disabled') {
          statusHtml = '<span class="pill pill-disabled">معطل</span>';
        } else if (isExpired || lic.status === 'expired') {
          statusHtml = '<span class="pill pill-expired">منتهي الصلاحية</span>';
        } else if (lic.status === 'active') {
          statusHtml = '<span class="pill pill-active">مفعل ونشط</span>';
        }

        // Hardware device info
        const fpDisplay = lic.machine_fingerprint 
          ? '<span style="font-family:monospace; font-size:11px; color:#0f766e;" title="' + lic.machine_fingerprint + '">' + lic.machine_fingerprint.substring(0, 16) + '...</span>' 
          : '<span style="color:var(--text-muted); font-size:11.5px;">غير مربوط</span>';

        tr.innerHTML = \`
          <td>
            <div class="key-cell">
              <span class="key-text">\${lic.license_key}</span>
              <button class="btn-icon-copy" onclick="copyKey('\${lic.license_key}')" title="نسخ المفتاح">نسخ</button>
            </div>
          </td>
          <td>
            <div style="font-weight:800; color:var(--primary);">\${lic.shop_name}</div>
          </td>
          <td>
            <div style="font-family:monospace; font-size:12px;">\${lic.owner_phone || '-'}</div>
          </td>
          <td>
            <span style="font-weight:700;">\${translateType(lic.license_type, lic.expires_at)}</span>
          </td>
          <td>\${expText}</td>
          <td>\${statusHtml}</td>
          <td>\${fpDisplay}</td>
          <td>
            <div class="row-actions">
              <button class="btn-row btn-row-share" onclick="openShareModal('\${lic.id}')" title="تسليم المفتاح للعميل">تسليم</button>
              <button class="btn-row" onclick="openEditModal('\${lic.id}')" title="تمديد وتعديل">تمديد</button>
              \${lic.machine_fingerprint ? \`
                <button class="btn-row" onclick="resetDevice('\${lic.id}', '\${lic.shop_name}')" title="فك ربط الجهاز لنقله لكمبيوتر جديد">فك ربط</button>
              \` : ''}
              \${lic.status === 'active' ? \`
                <button class="btn-row btn-row-danger" onclick="toggleStatus('\${lic.id}', '\${lic.shop_name}', 'revoke')" title="إيقاف">إيقاف</button>
              \` : \`
                <button class="btn-row" onclick="toggleStatus('\${lic.id}', '\${lic.shop_name}', 'activate')" title="تشغيل">تفعيل</button>
              \`}
              <button class="btn-row btn-row-danger" onclick="deleteLicense('\${lic.id}', '\${lic.shop_name}')" title="حذف">حذف</button>
            </div>
          </td>
        \`;

        tbody.appendChild(tr);
      });

      updateCountdowns();
    }

    function updateCountdowns() {
      const now = Date.now();
      document.querySelectorAll('.countdown-badge').forEach(el => {
        const expiresAt = el.getAttribute('data-expires');
        if (!expiresAt) return;
        const target = new Date(expiresAt).getTime();
        const diff = target - now;
        const textEl = el.querySelector('.countdown-text');
        if (!textEl) return;
        if (diff <= 0) {
          const parent = el.parentElement;
          if (parent) {
            parent.innerHTML = '<span style="color:#dc2626; font-weight:700;">' + new Date(expiresAt).toISOString().split('T')[0] + ' (منتهي)</span>';
          }
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        textEl.textContent = 'متبقي ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      });
    }

    setInterval(updateCountdowns, 1000);

    function translateType(type, expiresAt) {
      if (!expiresAt || type === 'lifetime') return 'دائم';
      if (type === 'annual') return 'سنوي';
      if (type === 'monthly') return 'شهري';
      if (type === 'trial') return 'تجريبي';
      return type;
    }

    function copyKey(key) {
      navigator.clipboard.writeText(key);
      showToast('تم نسخ رمز الترخيص: ' + key);
    }

    async function handleCreate(e) {
      e.preventDefault();
      const shop_name = document.getElementById('shopName').value.trim();
      const owner_phone = document.getElementById('ownerPhone').value.trim();
      const durVal = document.getElementById('durationSelect').value;
      const notes = document.getElementById('notesInput').value.trim();

      let days_valid = 0;
      let license_type = 'lifetime';

      if (durVal === 'custom') {
        days_valid = parseInt(document.getElementById('customDaysInput').value) || 30;
      } else if (durVal !== 'lifetime') {
        days_valid = parseInt(durVal);
      }

      try {
        const res = await fetch('/api/admin/licenses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': getSecret()
          },
          body: JSON.stringify({
            shop_name,
            owner_phone,
            license_type,
            days_valid,
            notes
          })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        showToast('تم إصدار رمز الترخيص بنجاح');
        document.getElementById('shopName').value = '';
        document.getElementById('ownerPhone').value = '';
        document.getElementById('notesInput').value = '';
        document.getElementById('customDaysWrapper').style.display = 'none';
        document.getElementById('durationSelect').value = 'lifetime';
        
        await loadLicenses();
        if (data.license && data.license.id) {
          openShareModal(data.license.id);
        }
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    function openShareModal(id) {
      const lic = allLicenses.find(l => l.id === id);
      if (!lic) return;
      currentShareData = lic;

      document.getElementById('shareKeyDisplay').textContent = lic.license_key;
      
      const phoneDigits = lic.owner_phone ? lic.owner_phone.replace(/\\D/g, '') : '';
      const whatsappBtn = document.getElementById('shareWhatsAppBtn');
      whatsappBtn.style.display = phoneDigits ? 'inline-block' : 'none';

      const message = \`مرحباً بك في نظام رفيق لنقاط البيع (Rafiq POS)

المنشأة: \${lic.shop_name}
رمز تفعيل البرنامج الخاص بكم:
\${lic.license_key}

نوع الصلاحية: \${lic.expires_at ? 'سارٍ حتى ' + lic.expires_at.split('T')[0] : 'ترخيص دائم مدى الحياة (أوفلاين)'}

طريقة التفعيل:
1. افتح برنامج رفيق POS على جهاز الكمبيوتر.
2. اضغط على "ترخيص البرنامج" في الإعدادات أو الشاشة الرئيسية.
3. أدخل الرمز أعلاه واضغط على "تفعيل الترخيص أونلاين".
4. سيعمل البرنامج بعدها أوفلاين تماماً بدون الحاجة للإنترنت.

لأي استفسار أو دعم فني مباشر: 01097782965\`;

      document.getElementById('shareTextarea').value = message;
      openModal('shareModal');
    }

    function copyShareText() {
      const txt = document.getElementById('shareTextarea').value;
      navigator.clipboard.writeText(txt);
      showToast('تم نسخ رسالة التسليم');
    }

    function openWhatsApp() {
      if (!currentShareData || !currentShareData.owner_phone) return;
      const phone = currentShareData.owner_phone.replace(/\\D/g, '');
      const fullPhone = phone.startsWith('0') ? '2' + phone : phone;
      const text = encodeURIComponent(document.getElementById('shareTextarea').value);
      window.open('https://wa.me/' + fullPhone + '?text=' + text, '_blank');
    }

    function openEditModal(id) {
      const lic = allLicenses.find(l => l.id === id);
      if (!lic) return;

      document.getElementById('editLicenseId').value = lic.id;
      document.getElementById('editShopName').value = lic.shop_name;
      document.getElementById('editOwnerPhone').value = lic.owner_phone || '';
      document.getElementById('editExtendAction').value = 'none';
      document.getElementById('editCustomDaysWrapper').style.display = 'none';
      document.getElementById('editCustomDaysInput').value = '';

      let expText = 'دائم مدى الحياة';
      if (lic.expires_at) {
        expText = lic.expires_at.split('T')[0];
      }
      document.getElementById('editCurrentExpDisplay').textContent = expText;

      openModal('editModal');
    }

    function toggleEditCustomDays() {
      const val = document.getElementById('editExtendAction').value;
      const w = document.getElementById('editCustomDaysWrapper');
      if (val === 'custom') {
        w.style.display = 'block';
        document.getElementById('editCustomDaysInput').focus();
      } else {
        w.style.display = 'none';
      }
    }

    async function submitEdit() {
      const id = document.getElementById('editLicenseId').value;
      const shop_name = document.getElementById('editShopName').value.trim();
      const owner_phone = document.getElementById('editOwnerPhone').value.trim();
      const notes = document.getElementById('editNotes').value.trim();
      const action = document.getElementById('editExtendAction').value;

      const payload = { shop_name, owner_phone, notes };
      if (action === 'lifetime') {
        payload.set_lifetime = true;
      } else if (action === 'custom') {
        const customDays = parseInt(document.getElementById('editCustomDaysInput').value);
        if (!customDays || customDays <= 0) {
          showToast('يرجى إدخال عدد أيام تمديد صحيح (1 فأكثر)', true);
          return;
        }
        payload.days_to_add = customDays;
      } else if (action !== 'none') {
        payload.days_to_add = parseInt(action);
      }

      try {
        const res = await fetch('/api/admin/licenses/' + id + '/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': getSecret()
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        closeModal('editModal');
        showToast('تم حفظ التعديلات بنجاح');
        loadLicenses();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    function toggleStatus(id, shop, action) {
      const isRevoke = action === 'revoke';
      showConfirm(
        isRevoke ? 'إيقاف الترخيص' : 'تفعيل الترخيص',
        isRevoke 
          ? 'هل تريد إيقاف ترخيص (' + shop + ')؟ سيتوقف البرنامج عن العمل عند العميل.' 
          : 'هل تريد إعادة تشغيل وتفعيل ترخيص (' + shop + ')؟',
        async () => {
          try {
            const res = await fetch('/api/admin/licenses/' + id + '/' + action, {
              method: 'POST',
              headers: { 'X-Admin-Secret': getSecret() }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            showToast(data.message);
            loadLicenses();
          } catch (err) {
            showToast('خطأ: ' + err.message, true);
          }
        }
      );
    }

    function resetDevice(id, shop) {
      showConfirm(
        'فك ربط الجهاز',
        'فك ربط الجهاز يتيح لمنشأة (' + shop + ') تفعيل نفس الرمز على جهاز كمبيوتر جديد. هل تريد فك الربط الآن؟',
        async () => {
          try {
            const res = await fetch('/api/admin/licenses/' + id + '/reset-device', {
              method: 'POST',
              headers: { 'X-Admin-Secret': getSecret() }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            showToast(data.message);
            loadLicenses();
          } catch (err) {
            showToast('خطأ: ' + err.message, true);
          }
        }
      );
    }

    function deleteLicense(id, shop) {
      showConfirm(
        'حذف الترخيص',
        'هل تريد حذف ترخيص (' + shop + ') نهائياً من النظام؟',
        async () => {
          try {
            const res = await fetch('/api/admin/licenses/' + id + '/delete', {
              method: 'POST',
              headers: { 'X-Admin-Secret': getSecret() }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            showToast('تم حذف الترخيص');
            loadLicenses();
          } catch (err) {
            showToast('خطأ: ' + err.message, true);
          }
        }
      );
    }

    async function loadLogs() {
      try {
        const res = await fetch('/api/admin/logs', {
          headers: { 'X-Admin-Secret': getSecret() }
        });
        const data = await res.json();
        if (!data.success) return;

        const tbody = document.getElementById('logsTableBody');
        tbody.innerHTML = '';
        if (!data.data || data.data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">لا توجد حركات تدقيق حتى الآن</td></tr>';
          return;
        }

        data.data.forEach(log => {
          const tr = document.createElement('tr');
          const isSuccess = log.status === 'success';
          tr.innerHTML = \`
            <td style="font-size:12px; color:var(--text-muted);">\${log.created_at}</td>
            <td><code style="font-weight:700; color:var(--primary); font-family:monospace;">\${log.license_key}</code></td>
            <td><strong>\${translateAction(log.action)}</strong></td>
            <td><span class="pill \${isSuccess ? 'pill-active' : 'pill-disabled'}">\${isSuccess ? 'ناجح' : 'فشل'}</span></td>
            <td>\${translateReason(log.failure_reason)}</td>
            <td><code style="font-size:11.5px; color:var(--text-muted); font-family:monospace;">\${log.ip_address || '-'}</code></td>
          \`;
          tbody.appendChild(tr);
        });
      } catch (_) {}
    }

    function translateAction(a) {
      if (a === 'activate') return 'تفعيل';
      if (a === 'verify') return 'فحص دوري';
      if (a === 'reset') return 'فك ربط';
      if (a === 'revoke') return 'إيقاف';
      return a;
    }

    function translateReason(r) {
      if (!r) return '<span style="color:#059669; font-weight:700;">تم بنجاح</span>';
      if (r === 'DEVICE_MISMATCH') return '<span style="color:#dc2626; font-weight:700;">مربوط بجهاز آخر</span>';
      if (r === 'LICENSE_DISABLED') return '<span style="color:#dc2626; font-weight:700;">الترخيص معطل</span>';
      if (r === 'LICENSE_EXPIRED') return '<span style="color:#475569; font-weight:700;">انتهت الصلاحية</span>';
      return r;
    }

    window.onload = loadLicenses;
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
