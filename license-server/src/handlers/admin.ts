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
 * With clean separation between Licenses & Audit Logs, full pagination, and luxury design.
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
      --primary-dark: #00261f;
      --emerald: #006d41;
      --emerald-soft: #eaf5ee;
      --emerald-border: #c4e3d0;
      --emerald-light: #10b981;
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #52605d;
      --danger: #b91c1c;
      --danger-bg: #fef2f2;
      --danger-border: #fecaca;
      --warning: #b45309;
      --warning-bg: #fffbeb;
      --warning-border: #fde68a;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.05);
      --radius-xl: 16px;
      --radius-lg: 12px;
      --radius-md: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', -apple-system, sans-serif; }
    body { background-color: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; line-height: 1.5; }

    /* Top Bar */
    .topbar {
      background-color: var(--primary);
      color: white;
      padding: 12px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }
    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-mark {
      background-color: #004d3f;
      color: #6ee7b7;
      font-weight: 900;
      font-size: 15px;
      padding: 6px 14px;
      border-radius: var(--radius-md);
      letter-spacing: 0.5px;
      border: 1px solid rgba(110,231,183,0.3);
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .brand-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.2px;
    }
    .brand-sub {
      font-size: 11px;
      color: #a7f3d0;
      font-weight: 600;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sys-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 5px 12px;
      border-radius: var(--radius-md);
      font-size: 11.5px;
      font-weight: 700;
      color: #d1fae5;
    }
    .sys-pill-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulseDot 2s infinite;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    .btn-top {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      padding: 6px 14px;
      border-radius: var(--radius-md);
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-top:hover {
      background: rgba(255,255,255,0.2);
      transform: translateY(-1px);
    }

    /* Container */
    .app-container {
      max-width: 1440px;
      margin: 20px auto;
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Top Navigation Tabs (Separating Licenses & Logs) */
    .tabs-nav-wrapper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .tabs-nav {
      display: inline-flex;
      align-items: center;
      background: #eef2f0;
      padding: 5px;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border);
      gap: 6px;
      box-shadow: var(--shadow-sm);
    }
    .nav-tab {
      background: transparent;
      border: none;
      padding: 8px 18px;
      border-radius: var(--radius-lg);
      font-size: 13px;
      font-weight: 800;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .nav-tab:hover:not(.active) {
      color: var(--primary);
      background: rgba(255,255,255,0.6);
    }
    .nav-tab.active {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 8px rgba(0,55,45,0.25);
    }
    .tab-badge {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      font-weight: 900;
      padding: 2px 8px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #475569;
      transition: all 0.2s ease;
    }
    .nav-tab.active .tab-badge {
      background: var(--emerald);
      color: #ffffff;
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
      border-radius: var(--radius-xl);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: var(--shadow-sm);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .kpi-box:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
    .kpi-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .kpi-label {
      font-size: 11.5px;
      font-weight: 800;
      color: var(--text-muted);
    }
    .kpi-value {
      font-size: 26px;
      font-weight: 900;
      color: var(--text);
      line-height: 1.1;
      font-family: ui-monospace, monospace;
    }
    .kpi-icon-box {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      background: #f1f5f4;
      color: var(--text-muted);
    }
    .kpi-active .kpi-value { color: var(--emerald); }
    .kpi-active .kpi-icon-box { background: var(--emerald-soft); color: var(--emerald); border: 1px solid var(--emerald-border); }
    .kpi-pending .kpi-value { color: var(--warning); }
    .kpi-pending .kpi-icon-box { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
    .kpi-disabled .kpi-value { color: var(--danger); }
    .kpi-disabled .kpi-icon-box { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); }

    /* Panels / Cards */
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }
    .panel-header {
      padding: 16px 22px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafbfc;
    }
    .panel-title {
      font-size: 14.5px;
      font-weight: 900;
      color: var(--primary);
    }
    .panel-desc {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .panel-body {
      padding: 20px;
    }

    /* Creation Form Layout */
    .create-grid {
      display: grid;
      grid-template-columns: 2fr 1.3fr 1.5fr 1fr auto;
      gap: 14px;
      align-items: flex-end;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field label {
      font-size: 11.5px;
      font-weight: 800;
      color: #334155;
    }
    .field input, .field select {
      height: 40px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      background: #fff;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .field input:focus, .field select:focus {
      outline: none;
      border-color: var(--emerald);
      box-shadow: 0 0 0 3px rgba(0,109,65,0.12);
    }
    .btn-create {
      height: 40px;
      background: var(--emerald);
      color: white;
      border: none;
      border-radius: var(--radius-lg);
      padding: 0 22px;
      font-size: 13px;
      font-weight: 900;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: background 0.15s, transform 0.1s;
      box-shadow: 0 2px 6px rgba(0,109,65,0.25);
    }
    .btn-create:hover {
      background: var(--primary);
      transform: translateY(-1px);
    }
    .btn-create:active {
      transform: scale(0.98);
    }

    /* Table Toolbar */
    .table-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      gap: 14px;
      background: #fff;
      flex-wrap: wrap;
    }
    .search-box {
      width: 340px;
      position: relative;
    }
    .search-box input {
      width: 100%;
      height: 38px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      font-size: 12.5px;
      font-weight: 600;
      background: #f8fafc;
      transition: all 0.15s;
    }
    .search-box input:focus {
      outline: none;
      background: #fff;
      border-color: var(--emerald);
      box-shadow: 0 0 0 3px rgba(0,109,65,0.1);
    }
    .filters {
      display: flex;
      gap: 4px;
      background: #f1f5f4;
      padding: 4px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
    }
    .filter-tab {
      background: transparent;
      border: none;
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 800;
      color: var(--text-muted);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-tab.active {
      background: white;
      color: var(--primary);
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .filter-tab.active.danger {
      background: var(--danger);
      color: white;
    }
    .filter-tab.active.success {
      background: var(--emerald);
      color: white;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
      font-size: 12.5px;
    }
    th {
      background: #f8fafc;
      padding: 12px 16px;
      font-size: 11.5px;
      font-weight: 800;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      white-space: nowrap;
    }
    tbody tr {
      transition: background-color 0.1s ease;
    }
    tbody tr:hover {
      background: #f8fafc;
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
      font-weight: 900;
      color: var(--primary);
      background: var(--emerald-soft);
      border: 1px solid var(--emerald-border);
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .btn-icon-copy {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 800;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
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
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
    }
    .pill-active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .pill-pending { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
    .pill-disabled { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .pill-expired { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    /* Action Types Pills for Logs */
    .action-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
    }
    .action-activate { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .action-verify { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .action-reset { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .action-revoke { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

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
      font-size: 11px;
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
      border-radius: 6px;
      padding: 4px 9px;
      font-size: 11.5px;
      font-weight: 800;
      color: #334155;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
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

    /* Pagination Footer */
    .pagination-bar {
      padding: 12px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      flex-wrap: wrap;
      gap: 12px;
    }
    .pagination-info {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .pagination-size-select {
      height: 30px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 0 6px;
      color: var(--text);
    }
    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .page-btn {
      min-width: 32px;
      height: 32px;
      padding: 0 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .page-btn:hover:not(:disabled):not(.active) {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    .page-btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Modal System */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(2px);
      z-index: 50;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-card {
      background: white;
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 500px;
      box-shadow: 0 20px 35px rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      overflow: hidden;
      animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalPop {
      0% { opacity: 0; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }
    .modal-header {
      background: var(--primary);
      color: white;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h4 {
      font-size: 14.5px;
      font-weight: 900;
    }
    .modal-close {
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
      opacity: 0.8;
      transition: opacity 0.15s;
    }
    .modal-close:hover { opacity: 1; }
    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .modal-footer {
      padding: 14px 20px;
      background: #f8fafc;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
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
      border-radius: var(--radius-xl);
      padding: 32px;
      width: 100%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .login-box h3 {
      font-size: 19px;
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
      bottom: 24px;
      left: 24px;
      background: #0f172a;
      color: white;
      padding: 12px 22px;
      border-radius: var(--radius-lg);
      font-size: 13px;
      font-weight: 800;
      display: none;
      z-index: 999;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      border: 1px solid rgba(255,255,255,0.15);
      animation: slideUp 0.2s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    @media (max-width: 900px) {
      .kpi-row { grid-template-columns: repeat(2, 1fr); }
      .create-grid { grid-template-columns: 1fr; }
      .search-box { width: 100%; }
    }
  </style>
</head>
<body>

  <!-- Login Modal Overlay -->
  <div id="login-screen">
    <div class="login-box">
      <div>
        <h3>تسجيل الدخول للوحة الإدارة</h3>
        <p>يرجى إدخال كلمة سر المشرف للوصول إلى إدارة التراخيص وسجلات التدقيق.</p>
      </div>
      <form onsubmit="handleLogin(event)" style="display:flex; flex-direction:column; gap:14px;">
        <div class="field">
          <label>كلمة سر الإدارة (Admin Secret Key):</label>
          <input type="password" id="loginSecretInput" required placeholder="أدخل كلمة السر...">
        </div>
        <button type="submit" class="btn-create" style="justify-content:center; width:100%; height:42px;">دخول للنظام</button>
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
      <button class="btn-top" onclick="refreshCurrentView()">
        <span>↻</span>
        <span>تحديث</span>
      </button>
      <button class="btn-top" onclick="logout()" style="color:#fca5a5;">خروج</button>
    </div>
  </header>

  <main class="app-container">

    <!-- Top Navigation Tabs (Separating Licenses & Audit Logs) -->
    <div class="tabs-nav-wrapper">
      <div class="tabs-nav">
        <button class="nav-tab active" id="tabBtnLicenses" onclick="switchMainTab('licenses')">
          <span style="font-size:15px;">🔑</span>
          <span>قائمة التراخيص الصادرة</span>
          <span class="tab-badge" id="badgeLicensesCount">0</span>
        </button>

        <button class="nav-tab" id="tabBtnLogs" onclick="switchMainTab('logs')">
          <span style="font-size:15px;">📋</span>
          <span>سجل حركات وتدقيق التفعيل (Audit Logs)</span>
          <span class="tab-badge" id="badgeLogsCount">0</span>
        </button>
      </div>

      <div style="font-size:11.5px; font-weight:700; color:var(--text-muted);">
        إصدار النظام: <strong style="color:var(--primary);">v1.0 Production</strong> | SQLite Cloudflare D1
      </div>
    </div>

    <!-- ========================================== -->
    <!-- TAB 1: LICENSES VIEW                       -->
    <!-- ========================================== -->
    <div id="licensesView" style="display:flex; flex-direction:column; gap:20px;">
      
      <!-- KPI Summary Row for Licenses -->
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-info">
            <span class="kpi-label">إجمالي التراخيص</span>
            <span class="kpi-value" id="kpi-total">0</span>
          </div>
          <div class="kpi-icon-box">📊</div>
        </div>

        <div class="kpi-box kpi-active">
          <div class="kpi-info">
            <span class="kpi-label">النشطة والمفعلة</span>
            <span class="kpi-value" id="kpi-active">0</span>
          </div>
          <div class="kpi-icon-box">✓</div>
        </div>

        <div class="kpi-box kpi-pending">
          <div class="kpi-info">
            <span class="kpi-label">قيد انتظار التفعيل</span>
            <span class="kpi-value" id="kpi-pending">0</span>
          </div>
          <div class="kpi-icon-box">⏳</div>
        </div>

        <div class="kpi-box kpi-disabled">
          <div class="kpi-info">
            <span class="kpi-label">معطلة أو منتهية</span>
            <span class="kpi-value" id="kpi-disabled">0</span>
          </div>
          <div class="kpi-icon-box">✕</div>
        </div>
      </div>

      <!-- Section: Create License Panel -->
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
                <input type="text" id="shopName" required placeholder="مثال: أسواق الأمانة، سوبرماركت البركة...">
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

      <!-- Section: Licenses Table with Filters & Pagination -->
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">جدول التراخيص الصادرة</div>
            <div class="panel-desc">متابعة المنشآت المسجلة، تسليم الرموز، تمديد الصلاحية، وفك ربط الأجهزة</div>
          </div>
        </div>

        <div class="table-bar">
          <div class="search-box">
            <input type="text" id="searchInput" oninput="onLicenseFilterChange()" placeholder="بحث باسم المنشأة، الهاتف، رمز الترخيص، أو بصمة الجهاز...">
          </div>

          <div class="filters">
            <button class="filter-tab active" onclick="setLicenseFilter('all', this)">الكل</button>
            <button class="filter-tab" onclick="setLicenseFilter('active', this)">النشطة</button>
            <button class="filter-tab" onclick="setLicenseFilter('pending', this)">في الانتظار</button>
            <button class="filter-tab" onclick="setLicenseFilter('disabled', this)">المعطلة</button>
            <button class="filter-tab" onclick="setLicenseFilter('expired', this)">المنتهية</button>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>رمز الترخيص (Key)</th>
                <th>المنشأة</th>
                <th>الهاتف</th>
                <th>نوع الصلاحية</th>
                <th>تاريخ الصلاحية والمتبقي</th>
                <th>الحالة</th>
                <th>الجهاز المرتبط (HWID)</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="licensesTableBody">
              <tr>
                <td colspan="9" style="text-align:center; padding:36px; color:var(--text-muted);">
                  جارٍ تحميل التراخيص من السيرفر السحابي...
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Licenses Pagination Bar -->
        <div class="pagination-bar" id="licensesPaginationBar">
          <div class="pagination-info">
            <span id="licensesPaginationText">عرض 0 إلى 0 من 0 ترخيص</span>
            <span>|</span>
            <label>
              عرض:
              <select class="pagination-size-select" id="licensesPageSizeSelect" onchange="onLicensesPageSizeChange(this.value)">
                <option value="10">10 تراخيص</option>
                <option value="15" selected>15 ترخيص</option>
                <option value="25">25 ترخيص</option>
                <option value="50">50 ترخيص</option>
                <option value="100">100 ترخيص</option>
              </select>
            </label>
          </div>

          <div class="pagination-controls" id="licensesPaginationControls"></div>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- TAB 2: AUDIT LOGS VIEW (Separated)         -->
    <!-- ========================================== -->
    <div id="logsView" style="display:none; flex-direction:column; gap:20px;">

      <!-- KPI Summary Row for Audit Logs -->
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-info">
            <span class="kpi-label">إجمالي الحركات المسجلة</span>
            <span class="kpi-value" id="kpi-logs-total">0</span>
          </div>
          <div class="kpi-icon-box">📋</div>
        </div>

        <div class="kpi-box kpi-active">
          <div class="kpi-info">
            <span class="kpi-label">حركات ناجحة</span>
            <span class="kpi-value" id="kpi-logs-success">0</span>
          </div>
          <div class="kpi-icon-box">✓</div>
        </div>

        <div class="kpi-box kpi-disabled">
          <div class="kpi-info">
            <span class="kpi-label">محاولات مرفوضة</span>
            <span class="kpi-value" id="kpi-logs-failed">0</span>
          </div>
          <div class="kpi-icon-box">✕</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-info">
            <span class="kpi-label">الأجهزة المفحوصة</span>
            <span class="kpi-value" id="kpi-logs-devices">0</span>
          </div>
          <div class="kpi-icon-box">💻</div>
        </div>
      </div>

      <!-- Audit Logs Table Panel -->
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">سجل حركات وتدقيق التفعيل والتحقق (Audit Logs)</div>
            <div class="panel-desc">توثيق مباشر ومفصل لجميع استدعاءات التفعيل والتحقق الدوري وفك الربط مع الـ IP وبصمة الجهاز</div>
          </div>
          <button class="btn-row" onclick="loadLogs()" title="تحديث السجلات الآن">
            <span>↻</span>
            <span>تحديث السجل</span>
          </button>
        </div>

        <!-- Logs Filter Toolbar -->
        <div class="table-bar">
          <div class="search-box">
            <input type="text" id="logsSearchInput" oninput="onLogsFilterChange()" placeholder="بحث برمز الترخيص، عنوان IP، بصمة الجهاز، أو سبب الرفض...">
          </div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <!-- Action Filter -->
            <div class="filters">
              <button class="filter-tab active" onclick="setLogsActionFilter('all', this)">كافة الحركات</button>
              <button class="filter-tab" onclick="setLogsActionFilter('activate', this)">تفعيل (Activate)</button>
              <button class="filter-tab" onclick="setLogsActionFilter('verify', this)">فحص دوري (Verify)</button>
              <button class="filter-tab" onclick="setLogsActionFilter('reset', this)">فك ربط (Reset)</button>
              <button class="filter-tab" onclick="setLogsActionFilter('revoke', this)">إيقاف (Revoke)</button>
            </div>

            <!-- Status Filter -->
            <div class="filters">
              <button class="filter-tab active" onclick="setLogsStatusFilter('all', this)">الكل</button>
              <button class="filter-tab success" onclick="setLogsStatusFilter('success', this)">ناجحة</button>
              <button class="filter-tab danger" onclick="setLogsStatusFilter('failed', this)">فاشلة</button>
            </div>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ والوقت</th>
                <th>رمز الترخيص (Key)</th>
                <th>نوع العملية</th>
                <th>حالة العملية</th>
                <th>تفاصيل النتيجة / سبب الرفض</th>
                <th>عنوان IP</th>
                <th>بصمة الجهاز (HWID)</th>
              </tr>
            </thead>
            <tbody id="logsTableBody">
              <tr>
                <td colspan="8" style="text-align:center; padding:36px; color:var(--text-muted);">
                  جارٍ تحميل سجلات التدقيق...
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Logs Pagination Bar -->
        <div class="pagination-bar" id="logsPaginationBar">
          <div class="pagination-info">
            <span id="logsPaginationText">عرض 0 إلى 0 من 0 حركة</span>
            <span>|</span>
            <label>
              عرض:
              <select class="pagination-size-select" id="logsPageSizeSelect" onchange="onLogsPageSizeChange(this.value)">
                <option value="15" selected>15 حركة</option>
                <option value="25">25 حركة</option>
                <option value="50">50 حركة</option>
                <option value="100">100 حركة</option>
              </select>
            </label>
          </div>

          <div class="pagination-controls" id="logsPaginationControls"></div>
        </div>
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

        <div style="background:#f8fafc; border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px;">
          <div style="font-size:11px; font-weight:800; color:var(--text-muted); margin-bottom:4px;">رمز الترخيص:</div>
          <div id="shareKeyDisplay" style="font-family:monospace; font-size:20px; font-weight:900; color:var(--emerald); margin-bottom:12px;"></div>
          <textarea id="shareTextarea" readonly style="width:100%; height:130px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; padding:10px; resize:none; font-family:inherit;"></textarea>
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
        <p id="confirmModalMessage" style="font-size:13px; line-height:1.5; color:#334155; font-weight:700;"></p>
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
    
    // State
    let activeMainTab = 'licenses'; // 'licenses' | 'logs'
    let allLicenses = [];
    let allLogs = [];
    let currentShareData = null;

    // Licenses Filter & Pagination State
    let currentLicenseFilter = 'all';
    let licensesCurrentPage = 1;
    let licensesPageSize = 15;
    let filteredLicensesCache = [];

    // Logs Filter & Pagination State
    let currentLogsActionFilter = 'all';
    let currentLogsStatusFilter = 'all';
    let logsCurrentPage = 1;
    let logsPageSize = 15;
    let filteredLogsCache = [];

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
      initDashboard();
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

    // Main Tab Switching (Separating Licenses & Logs)
    function switchMainTab(tab) {
      activeMainTab = tab;
      const licView = document.getElementById('licensesView');
      const logsView = document.getElementById('logsView');
      const tabBtnLic = document.getElementById('tabBtnLicenses');
      const tabBtnLogs = document.getElementById('tabBtnLogs');

      if (tab === 'licenses') {
        licView.style.display = 'flex';
        logsView.style.display = 'none';
        tabBtnLic.classList.add('active');
        tabBtnLogs.classList.remove('active');
      } else {
        licView.style.display = 'none';
        logsView.style.display = 'flex';
        tabBtnLic.classList.remove('active');
        tabBtnLogs.classList.add('active');
        if (allLogs.length === 0) {
          loadLogs();
        }
      }
    }

    function refreshCurrentView() {
      if (activeMainTab === 'licenses') {
        loadLicenses();
      } else {
        loadLogs();
      }
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

    // ==========================================
    // LICENSES LOGIC & PAGINATION
    // ==========================================
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
        document.getElementById('badgeLicensesCount').textContent = allLicenses.length;
        updateLicenseMetrics();
        applyLicenseFilters();
      } catch (err) {
        showToast('خطأ في الاتصال بالخادم: ' + err.message, true);
      }
    }

    function updateLicenseMetrics() {
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

    function setLicenseFilter(f, btn) {
      currentLicenseFilter = f;
      document.querySelectorAll('#licensesView .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      licensesCurrentPage = 1;
      applyLicenseFilters();
    }

    function onLicenseFilterChange() {
      licensesCurrentPage = 1;
      applyLicenseFilters();
    }

    function applyLicenseFilters() {
      const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
      const now = new Date();

      filteredLicensesCache = allLicenses.filter(l => {
        const isExp = l.expires_at && new Date(l.expires_at) < now;
        if (currentLicenseFilter === 'active' && (l.status !== 'active' || isExp)) return false;
        if (currentLicenseFilter === 'pending' && l.status !== 'pending') return false;
        if (currentLicenseFilter === 'disabled' && l.status !== 'disabled') return false;
        if (currentLicenseFilter === 'expired' && (!isExp && l.status !== 'expired')) return false;

        if (q) {
          const matchKey = l.license_key.toLowerCase().includes(q);
          const matchShop = l.shop_name.toLowerCase().includes(q);
          const matchPhone = (l.owner_phone || '').includes(q);
          const matchFp = (l.machine_fingerprint || '').toLowerCase().includes(q);
          if (!matchKey && !matchShop && !matchPhone && !matchFp) return false;
        }
        return true;
      });

      renderLicensesTable();
    }

    function onLicensesPageSizeChange(size) {
      licensesPageSize = parseInt(size, 10) || 15;
      licensesCurrentPage = 1;
      renderLicensesTable();
    }

    function goToLicensesPage(p) {
      licensesCurrentPage = p;
      renderLicensesTable();
    }

    function renderLicensesTable() {
      const tbody = document.getElementById('licensesTableBody');
      tbody.innerHTML = '';

      const totalItems = filteredLicensesCache.length;
      const totalPages = Math.ceil(totalItems / licensesPageSize) || 1;

      if (licensesCurrentPage > totalPages) licensesCurrentPage = totalPages;
      if (licensesCurrentPage < 1) licensesCurrentPage = 1;

      const startIndex = (licensesCurrentPage - 1) * licensesPageSize;
      const endIndex = Math.min(startIndex + licensesPageSize, totalItems);
      const pageSlice = filteredLicensesCache.slice(startIndex, endIndex);

      // Render Pagination Info & Controls
      document.getElementById('licensesPaginationText').textContent = 
        totalItems === 0 ? 'لا توجد نتائج' : \`عرض \${startIndex + 1} إلى \${endIndex} من أصل \${totalItems} ترخيص\`;

      renderPaginationControls(
        'licensesPaginationControls',
        licensesCurrentPage,
        totalPages,
        goToLicensesPage
      );

      if (pageSlice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px; font-weight:700;">لا توجد تراخيص تطابق خيارات البحث أو الفلتر المحدد</td></tr>';
        return;
      }

      const now = new Date();

      pageSlice.forEach((lic, idx) => {
        const tr = document.createElement('tr');
        const rowNumber = startIndex + idx + 1;

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
            expText = '<span style="color:#dc2626; font-weight:800;">' + dateStr + ' (منتهي)</span>';
          } else if (diffMs <= 24 * 60 * 60 * 1000) {
            expText = '<span>' + dateStr + ' <span class="countdown-badge" data-expires="' + lic.expires_at + '"><span class="pulse-dot"></span><span class="countdown-text">جارٍ الحساب...</span></span></span>';
          } else {
            expText = '<span>' + dateStr + ' <small style="color:#059669; font-weight:800;">(متبقي ' + diffDays + ' يوم)</small></span>';
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
          ? '<span style="font-family:monospace; font-size:11px; color:#0f766e; font-weight:700;" title="' + lic.machine_fingerprint + '">' + lic.machine_fingerprint.substring(0, 16) + '...</span>' 
          : '<span style="color:var(--text-muted); font-size:11.5px;">غير مربوط</span>';

        tr.innerHTML = \`
          <td style="font-family:monospace; color:var(--text-muted); font-size:12px; font-weight:700;">\${rowNumber}</td>
          <td>
            <div class="key-cell">
              <span class="key-text">\${lic.license_key}</span>
              <button class="btn-icon-copy" onclick="copyKey('\${lic.license_key}')" title="نسخ المفتاح">نسخ</button>
            </div>
          </td>
          <td>
            <div style="font-weight:900; color:var(--primary); font-size:13px;">\${lic.shop_name}</div>
          </td>
          <td>
            <div style="font-family:monospace; font-size:12px; font-weight:700;">\${lic.owner_phone || '-'}</div>
          </td>
          <td>
            <span style="font-weight:800;">\${translateType(lic.license_type, lic.expires_at)}</span>
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

    // ==========================================
    // AUDIT LOGS LOGIC & PAGINATION
    // ==========================================
    async function loadLogs() {
      if (!checkAuth()) return;

      try {
        const res = await fetch('/api/admin/logs', {
          headers: { 'X-Admin-Secret': getSecret() }
        });
        const data = await res.json();
        if (!data.success) {
          showToast('فشل جلب سجلات التدقيق: ' + data.message, true);
          return;
        }

        allLogs = data.data || [];
        document.getElementById('badgeLogsCount').textContent = allLogs.length;
        updateLogsMetrics();
        applyLogsFilters();
      } catch (err) {
        showToast('خطأ في جلب السجلات: ' + err.message, true);
      }
    }

    function updateLogsMetrics() {
      document.getElementById('kpi-logs-total').textContent = allLogs.length;
      let successCount = 0;
      let failedCount = 0;
      const deviceSet = new Set();

      allLogs.forEach(log => {
        if (log.status === 'success') successCount++;
        else failedCount++;
        if (log.machine_fingerprint) deviceSet.add(log.machine_fingerprint);
      });

      document.getElementById('kpi-logs-success').textContent = successCount;
      document.getElementById('kpi-logs-failed').textContent = failedCount;
      document.getElementById('kpi-logs-devices').textContent = deviceSet.size;
    }

    function setLogsActionFilter(action, btn) {
      currentLogsActionFilter = action;
      btn.parentElement.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logsCurrentPage = 1;
      applyLogsFilters();
    }

    function setLogsStatusFilter(status, btn) {
      currentLogsStatusFilter = status;
      btn.parentElement.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logsCurrentPage = 1;
      applyLogsFilters();
    }

    function onLogsFilterChange() {
      logsCurrentPage = 1;
      applyLogsFilters();
    }

    function applyLogsFilters() {
      const q = (document.getElementById('logsSearchInput').value || '').trim().toLowerCase();

      filteredLogsCache = allLogs.filter(log => {
        if (currentLogsActionFilter !== 'all' && log.action !== currentLogsActionFilter) return false;
        if (currentLogsStatusFilter !== 'all' && log.status !== currentLogsStatusFilter) return false;

        if (q) {
          const matchKey = (log.license_key || '').toLowerCase().includes(q);
          const matchIp = (log.ip_address || '').toLowerCase().includes(q);
          const matchFp = (log.machine_fingerprint || '').toLowerCase().includes(q);
          const matchReason = (log.failure_reason || '').toLowerCase().includes(q);
          if (!matchKey && !matchIp && !matchFp && !matchReason) return false;
        }
        return true;
      });

      renderLogsTable();
    }

    function onLogsPageSizeChange(size) {
      logsPageSize = parseInt(size, 10) || 15;
      logsCurrentPage = 1;
      renderLogsTable();
    }

    function goToLogsPage(p) {
      logsCurrentPage = p;
      renderLogsTable();
    }

    function renderLogsTable() {
      const tbody = document.getElementById('logsTableBody');
      tbody.innerHTML = '';

      const totalItems = filteredLogsCache.length;
      const totalPages = Math.ceil(totalItems / logsPageSize) || 1;

      if (logsCurrentPage > totalPages) logsCurrentPage = totalPages;
      if (logsCurrentPage < 1) logsCurrentPage = 1;

      const startIndex = (logsCurrentPage - 1) * logsPageSize;
      const endIndex = Math.min(startIndex + logsPageSize, totalItems);
      const pageSlice = filteredLogsCache.slice(startIndex, endIndex);

      // Render Pagination Info & Controls
      document.getElementById('logsPaginationText').textContent = 
        totalItems === 0 ? 'لا توجد حركات تدقيق' : \`عرض \${startIndex + 1} إلى \${endIndex} من أصل \${totalItems} حركة\`;

      renderPaginationControls(
        'logsPaginationControls',
        logsCurrentPage,
        totalPages,
        goToLogsPage
      );

      if (pageSlice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px; font-weight:700;">لا توجد حركات تدقيق تطابق الفلتر أو البحث</td></tr>';
        return;
      }

      pageSlice.forEach((log, idx) => {
        const tr = document.createElement('tr');
        const rowNumber = startIndex + idx + 1;
        const isSuccess = log.status === 'success';

        let actionBadge = \`<span class="action-badge action-\${log.action}">\${translateAction(log.action)}</span>\`;

        const fpDisplay = log.machine_fingerprint 
          ? \`<span style="font-family:monospace; font-size:11px; color:#0f766e; font-weight:700;" title="\${log.machine_fingerprint}">\${log.machine_fingerprint.substring(0, 16)}...</span>\`
          : '<span style="color:var(--text-muted); font-size:11.5px;">—</span>';

        tr.innerHTML = \`
          <td style="font-family:monospace; color:var(--text-muted); font-size:12px; font-weight:700;">\${rowNumber}</td>
          <td style="font-size:12px; font-family:monospace; color:#334155; font-weight:700;">\${formatLogDate(log.created_at)}</td>
          <td>
            <div class="key-cell">
              <code style="font-weight:900; color:var(--primary); font-family:monospace; font-size:12px;">\${log.license_key}</code>
              <button class="btn-icon-copy" onclick="copyKey('\${log.license_key}')" title="نسخ المفتاح">نسخ</button>
            </div>
          </td>
          <td>\${actionBadge}</td>
          <td>
            <span class="pill \${isSuccess ? 'pill-active' : 'pill-disabled'}">
              \${isSuccess ? '✓ ناجح' : '✕ فشل'}
            </span>
          </td>
          <td>\${translateReason(log.failure_reason)}</td>
          <td>
            <code style="font-size:12px; color:var(--text); font-family:monospace; font-weight:700;">\${log.ip_address || '-'}</code>
          </td>
          <td>\${fpDisplay}</td>
        \`;

        tbody.appendChild(tr);
      });
    }

    // Generic Pagination Controls Builder
    function renderPaginationControls(containerId, currentPage, totalPages, onPageClick) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';

      if (totalPages <= 1) return;

      // First Button
      const firstBtn = document.createElement('button');
      firstBtn.className = 'page-btn';
      firstBtn.textContent = '«';
      firstBtn.title = 'الصفحة الأولى';
      firstBtn.disabled = currentPage === 1;
      firstBtn.onclick = () => onPageClick(1);
      container.appendChild(firstBtn);

      // Prev Button
      const prevBtn = document.createElement('button');
      prevBtn.className = 'page-btn';
      prevBtn.textContent = '‹';
      prevBtn.title = 'الصفحة السابقة';
      prevBtn.disabled = currentPage === 1;
      prevBtn.onclick = () => onPageClick(currentPage - 1);
      container.appendChild(prevBtn);

      // Page Number Buttons (window around current page)
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + 4);

      for (let p = startPage; p <= endPage; p++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = 'page-btn' + (p === currentPage ? ' active' : '');
        pageBtn.textContent = p;
        pageBtn.onclick = () => onPageClick(p);
        container.appendChild(pageBtn);
      }

      // Next Button
      const nextBtn = document.createElement('button');
      nextBtn.className = 'page-btn';
      nextBtn.textContent = '›';
      nextBtn.title = 'الصفحة التالية';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.onclick = () => onPageClick(currentPage + 1);
      container.appendChild(nextBtn);

      // Last Button
      const lastBtn = document.createElement('button');
      lastBtn.className = 'page-btn';
      lastBtn.textContent = '»';
      lastBtn.title = 'الصفحة الأخيرة';
      lastBtn.disabled = currentPage === totalPages;
      lastBtn.onclick = () => onPageClick(totalPages);
      container.appendChild(lastBtn);
    }

    // Helpers
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
            parent.innerHTML = '<span style="color:#dc2626; font-weight:800;">' + new Date(expiresAt).toISOString().split('T')[0] + ' (منتهي)</span>';
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

    function translateAction(a) {
      if (a === 'activate') return 'تفعيل ترخيص';
      if (a === 'verify') return 'فحص دوري';
      if (a === 'reset') return 'فك ربط جهاز';
      if (a === 'revoke') return 'إيقاف ترخيص';
      return a;
    }

    function translateReason(r) {
      if (!r) return '<span style="color:#059669; font-weight:800;">تمت العملية بنجاح</span>';
      if (r === 'DEVICE_MISMATCH') return '<span style="color:#dc2626; font-weight:800;">مربوط بجهاز كمبيوتر آخر</span>';
      if (r === 'LICENSE_DISABLED') return '<span style="color:#dc2626; font-weight:800;">الترخيص معطل من الإدارة</span>';
      if (r === 'LICENSE_EXPIRED') return '<span style="color:#475569; font-weight:800;">انتهت فترة الصلاحية</span>';
      if (r === 'LICENSE_NOT_FOUND') return '<span style="color:#dc2626; font-weight:800;">الرمز غير مسجل بقاعدة البيانات</span>';
      return '<span style="font-weight:700;">' + r + '</span>';
    }

    function formatLogDate(d) {
      if (!d) return '—';
      try {
        const dateObj = new Date(d.replace(' ', 'T') + 'Z');
        if (isNaN(dateObj.getTime())) return d;
        return dateObj.toLocaleString('ar-EG-u-nu-latn', {
          dateStyle: 'short',
          timeStyle: 'medium',
          hour12: true
        });
      } catch (_) {
        return d;
      }
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
      const text = document.getElementById('shareTextarea').value;
      navigator.clipboard.writeText(text);
      showToast('تم نسخ رسالة التسليم بنجاح');
    }

    function openWhatsApp() {
      if (!currentShareData || !currentShareData.owner_phone) return;
      let phone = currentShareData.owner_phone.replace(/\\D/g, '');
      if (phone.startsWith('01')) {
        phone = '2' + phone; // Egypt prefix
      }
      const text = encodeURIComponent(document.getElementById('shareTextarea').value);
      window.open('https://wa.me/' + phone + '?text=' + text, '_blank');
    }

    function openEditModal(id) {
      const lic = allLicenses.find(l => l.id === id);
      if (!lic) return;

      document.getElementById('editLicenseId').value = lic.id;
      document.getElementById('editShopName').value = lic.shop_name;
      document.getElementById('editOwnerPhone').value = lic.owner_phone || '';
      document.getElementById('editNotes').value = lic.notes || '';
      document.getElementById('editExtendAction').value = 'none';
      document.getElementById('editCustomDaysWrapper').style.display = 'none';

      let expStr = 'دائم مدى الحياة';
      if (lic.expires_at) {
        expStr = 'ينتهي في: ' + lic.expires_at.split('T')[0];
      }
      document.getElementById('editCurrentExpDisplay').textContent = expStr;

      openModal('editModal');
    }

    function toggleEditCustomDays() {
      const val = document.getElementById('editExtendAction').value;
      const w = document.getElementById('editCustomDaysWrapper');
      if (val === 'custom') {
        w.style.display = 'flex';
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
      const act = document.getElementById('editExtendAction').value;

      if (!shop_name) {
        showToast('اسم المنشأة مطلوب', true);
        return;
      }

      const payload = { shop_name, owner_phone, notes };

      if (act === 'lifetime') {
        payload.set_lifetime = true;
      } else if (act === 'custom') {
        payload.days_to_add = parseInt(document.getElementById('editCustomDaysInput').value) || 0;
      } else if (act !== 'none') {
        payload.days_to_add = parseInt(act) || 0;
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

        showToast(data.message);
        closeModal('editModal');
        await loadLicenses();
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

    function initDashboard() {
      loadLicenses();
      loadLogs();
    }

    window.onload = initDashboard;
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
