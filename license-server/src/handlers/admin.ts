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
      'SELECT * FROM licenses ORDER BY created_at DESC LIMIT 100'
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
        JSON.stringify({ success: false, message: 'اسم المحل مطلوب لإنشاء الترخيص' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const id = crypto.randomUUID();
    const licenseKey = generateLicenseKey();
    const licenseType: LicenseType = body.license_type || 'lifetime';
    let expiresAt: string | null = null;

    if (body.days_valid && body.days_valid > 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + body.days_valid);
      expiresAt = expDate.toISOString();
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

  // 3. POST /api/admin/licenses/:id/revoke - Disable license
  const revokeMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    const licenseId = revokeMatch[1];
    await env.DB.prepare("UPDATE licenses SET status = 'disabled', updated_at = datetime('now') WHERE id = ?")
      .bind(licenseId)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: 'تم إيقاف وتعطيل الترخيص بنجاح' }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 4. POST /api/admin/licenses/:id/activate - Re-enable license
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

  // 5. POST /api/admin/licenses/:id/reset-device - Unlink machine fingerprint to transfer license
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
        message: 'تم فك ربط الجهاز بالترخيص بنجاح. يمكن للمحل الآن تفعيله على جهاز جديد.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 6. GET /api/admin/logs - Recent activation logs
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
 * Modern, self-contained Arabic Admin UI for Cloudflare Worker
 */
function serveAdminHtml(): Response {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة إدارة تراخيص رفيق POS</title>
  <style>
    :root {
      --primary: #00372d;
      --primary-light: #006d41;
      --surface: #f7fafc;
      --card: #ffffff;
      --text: #1a202c;
      --muted: #718096;
      --border: #e2e8f0;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif; }
    body { background-color: var(--surface); color: var(--text); padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--border); }
    .logo-area h1 { font-size: 24px; color: var(--primary); font-weight: 800; display: flex; align-items: center; gap: 8px; }
    .logo-badge { background: #e6f4ea; color: var(--primary-light); font-size: 12px; padding: 4px 8px; border-radius: 6px; }
    .auth-bar { display: flex; gap: 8px; align-items: center; }
    input, select, button { padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; }
    input:focus, select:focus { outline: none; border-color: var(--primary-light); box-shadow: 0 0 0 2px rgba(0,109,65,0.15); }
    button { background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 600; transition: background 0.15s; }
    button:hover { background: var(--primary-light); }
    .btn-secondary { background: #e2e8f0; color: var(--text); }
    .btn-secondary:hover { background: #cbd5e0; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-warning { background: var(--warning); color: white; }
    .btn-warning:hover { background: #d97706; }
    .card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 24px; border: 1px solid var(--border); }
    .card h2 { font-size: 18px; margin-bottom: 16px; color: var(--primary); }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) 120px; gap: 12px; align-items: end; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; text-align: right; }
    th { background: #edf2f7; padding: 12px 14px; font-size: 13px; color: var(--muted); font-weight: 700; border-bottom: 2px solid var(--border); }
    td { padding: 14px; font-size: 14px; border-bottom: 1px solid var(--border); }
    tr:hover { background: #f8fafc; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .badge-active { background: #d1fae5; color: #065f46; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-disabled { background: #fee2e2; color: #991b1b; }
    .badge-expired { background: #f3f4f6; color: #4b5563; }
    .key-badge { font-family: monospace; font-size: 15px; font-weight: 700; color: var(--primary); background: #f0fdf4; padding: 4px 8px; border-radius: 6px; letter-spacing: 1px; }
    .fingerprint-text { font-family: monospace; font-size: 11px; color: var(--muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions-cell { display: flex; gap: 6px; }
    .actions-cell button { padding: 6px 10px; font-size: 12px; }
    #status-msg { margin-top: 12px; padding: 10px 14px; border-radius: 8px; display: none; }
    .msg-success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .msg-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-area">
        <h1>رفيق POS <span class="logo-badge">إدارة التراخيص</span></h1>
      </div>
      <div class="auth-bar">
        <input type="password" id="adminSecret" placeholder="كلمة سر الإدارة (Admin Secret)" value="rafiq_admin_super_secret_2026">
        <button onclick="loadLicenses()">تحديث البيانات</button>
      </div>
    </header>

    <div id="status-msg"></div>

    <!-- بطاقة إصدار ترخيص جديد -->
    <div class="card">
      <h2>إصدار رمز ترخيص جديد لمحل</h2>
      <div class="form-row">
        <div class="form-group">
          <label>اسم المحل / السوبرماركت *</label>
          <input type="text" id="newShopName" placeholder="مثال: سوبرماركت الأمانة">
        </div>
        <div class="form-group">
          <label>رقم هاتف المالك</label>
          <input type="text" id="newOwnerPhone" placeholder="010XXXXXXXX">
        </div>
        <div class="form-group">
          <label>نوع الترخيص</label>
          <select id="newLicenseType">
            <option value="lifetime">دائم مدى الحياة (Lifetime)</option>
            <option value="annual">سنوي (365 يوم)</option>
            <option value="trial">تجريبي (30 يوم)</option>
          </select>
        </div>
        <div class="form-group">
          <label>ملاحظات</label>
          <input type="text" id="newNotes" placeholder="ملاحظات العقد...">
        </div>
        <button onclick="createLicense()">إصدار الرمز</button>
      </div>
    </div>

    <!-- جدول التراخيص المسجلة -->
    <div class="card">
      <h2>قائمة تراخيص المحلات (<span id="totalCount">0</span>)</h2>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>رمز الترخيص</th>
              <th>اسم المحل</th>
              <th>الهاتف</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>الجهاز المربوط</th>
              <th>تاريخ التفعيل</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody id="licensesTableBody">
            <tr><td colspan="8" style="text-align: center; color: var(--muted);">جاري تحميل التراخيص...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- سجل آخر محاولات التفعيل -->
    <div class="card">
      <h2>سجل تدقيق التفعيل والمحاولات (آخر 20 عملية)</h2>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>التاريخ والوقت</th>
              <th>الرمز</th>
              <th>الإجراء</th>
              <th>الحالة</th>
              <th>السبب / النتيجة</th>
              <th>عنوان IP</th>
            </tr>
          </thead>
          <tbody id="logsTableBody">
            <tr><td colspan="6" style="text-align: center; color: var(--muted);">اضغط تحديث لتحميل السجل...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    function getSecret() {
      return document.getElementById('adminSecret').value.trim();
    }

    function showMsg(text, isError = false) {
      const el = document.getElementById('status-msg');
      el.style.display = 'block';
      el.className = isError ? 'msg-error' : 'msg-success';
      el.textContent = text;
      setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    async function loadLicenses() {
      const secret = getSecret();
      if (!secret) return showMsg('يرجى إدخال كلمة سر الإدارة', true);

      try {
        const res = await fetch('/api/admin/licenses', {
          headers: { 'X-Admin-Secret': secret }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        document.getElementById('totalCount').textContent = data.data.length;
        const tbody = document.getElementById('licensesTableBody');
        tbody.innerHTML = '';

        if (data.data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">لا توجد تراخيص مسجلة</td></tr>';
          return;
        }

        data.data.forEach(lic => {
          const tr = document.createElement('tr');
          const statusBadges = {
            active: '<span class="badge badge-active">مفعل ونشط</span>',
            pending: '<span class="badge badge-pending">في الانتظار (لم يفعل)</span>',
            disabled: '<span class="badge badge-disabled">معطل / ملغي</span>',
            expired: '<span class="badge badge-expired">منتهي الصلاحية</span>'
          };

          const typeNames = {
            lifetime: 'مدى الحياة',
            annual: 'سنوي',
            monthly: 'شهري',
            trial: 'تجريبي'
          };

          tr.innerHTML = \`
            <td><span class="key-badge">\${lic.license_key}</span></td>
            <td><strong>\${lic.shop_name}</strong></td>
            <td>\${lic.owner_phone || '-'}</td>
            <td>\${typeNames[lic.license_type] || lic.license_type}</td>
            <td>\${statusBadges[lic.status] || lic.status}</td>
            <td>\${lic.machine_fingerprint ? '<span class="fingerprint-text" title="' + lic.machine_fingerprint + '">' + lic.machine_fingerprint.substring(0, 16) + '...</span>' : '<span style="color:var(--muted)">غير مربوط</span>'}</td>
            <td>\${lic.activated_at ? lic.activated_at.split('T')[0] : '-'}</td>
            <td class="actions-cell">
              \${lic.status === 'active' 
                ? '<button class="btn-danger" onclick="revokeLicense(\\'' + lic.id + '\\')">إيقاف</button>' 
                : '<button onclick="activateLicense(\\'' + lic.id + '\\')">تفعيل</button>'}
              \${lic.machine_fingerprint 
                ? '<button class="btn-warning" onclick="resetDevice(\\'' + lic.id + '\\')">فك ربط الجهاز</button>' 
                : ''}
            </td>
          \`;
          tbody.appendChild(tr);
        });

        loadLogs();
      } catch (err) {
        showMsg('فشل جلب التراخيص: ' + err.message, true);
      }
    }

    async function createLicense() {
      const secret = getSecret();
      const shopName = document.getElementById('newShopName').value.trim();
      const ownerPhone = document.getElementById('newOwnerPhone').value.trim();
      const licenseType = document.getElementById('newLicenseType').value;
      const notes = document.getElementById('newNotes').value.trim();

      if (!shopName) return showMsg('يرجى كتابة اسم المحل', true);

      let daysValid = 0;
      if (licenseType === 'annual') daysValid = 365;
      if (licenseType === 'trial') daysValid = 30;

      try {
        const res = await fetch('/api/admin/licenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
          body: JSON.stringify({ shop_name: shopName, owner_phone: ownerPhone, license_type: licenseType, days_valid: daysValid, notes })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        showMsg('تم إصدار رمز الترخيص: ' + data.license.license_key);
        document.getElementById('newShopName').value = '';
        document.getElementById('newOwnerPhone').value = '';
        document.getElementById('newNotes').value = '';
        loadLicenses();
      } catch (err) {
        showMsg('خطأ في إصدار الترخيص: ' + err.message, true);
      }
    }

    async function revokeLicense(id) {
      if (!confirm('هل أنت متأكد من رغبتك في إيقاف هذا الترخيص؟ سيتوقف البرنامج عن العمل عند المحل.')) return;
      try {
        const res = await fetch('/api/admin/licenses/' + id + '/revoke', {
          method: 'POST',
          headers: { 'X-Admin-Secret': getSecret() }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showMsg(data.message);
        loadLicenses();
      } catch (err) {
        showMsg('خطأ: ' + err.message, true);
      }
    }

    async function activateLicense(id) {
      try {
        const res = await fetch('/api/admin/licenses/' + id + '/activate', {
          method: 'POST',
          headers: { 'X-Admin-Secret': getSecret() }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showMsg(data.message);
        loadLicenses();
      } catch (err) {
        showMsg('خطأ: ' + err.message, true);
      }
    }

    async function resetDevice(id) {
      if (!confirm('فك ربط الجهاز يتيح لصاحب المحل استخدام الرمز على جهاز كمبيوتر جديد. هل تريد المتابعة؟')) return;
      try {
        const res = await fetch('/api/admin/licenses/' + id + '/reset-device', {
          method: 'POST',
          headers: { 'X-Admin-Secret': getSecret() }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showMsg(data.message);
        loadLicenses();
      } catch (err) {
        showMsg('خطأ: ' + err.message, true);
      }
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
        if (data.data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد سجلات تدقيق حتى الآن</td></tr>';
          return;
        }

        data.data.forEach(log => {
          const tr = document.createElement('tr');
          const isSuccess = log.status === 'success';
          tr.innerHTML = \`
            <td>\${log.created_at}</td>
            <td><code>\${log.license_key}</code></td>
            <td><strong>\${log.action}</strong></td>
            <td><span class="badge \${isSuccess ? 'badge-active' : 'badge-disabled'}">\${log.status}</span></td>
            <td>\${log.failure_reason || 'ناجح'}</td>
            <td><code>\${log.ip_address || '-'}</code></td>
          \`;
          tbody.appendChild(tr);
        });
      } catch (_) {}
    }

    // Load initial list on page load
    window.onload = loadLicenses;
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
