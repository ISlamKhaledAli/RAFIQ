/**
 * Admin Dashboard HTML Layout & Modals
 * Zero Emojis - Pure Crisp Lucide SVG Icons
 */
export const adminTemplate = `
  <!-- Login Modal Overlay -->
  <div id="login-screen">
    <div class="login-box">
      <div>
        <h3>
          <svg class="icon icon-lg" style="color:var(--emerald);" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>تسجيل الدخول للإدارة</span>
        </h3>
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
        <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.67-6.67"/></svg>
        <span>تحديث</span>
      </button>
      <button class="btn-top" onclick="logout()" style="color:#fca5a5;">
        <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>خروج</span>
      </button>
    </div>
  </header>

  <main class="app-container">

    <!-- Top Navigation Tabs (Separating Licenses & Audit Logs) -->
    <div class="tabs-nav-wrapper">
      <div class="tabs-nav">
        <button class="nav-tab active" id="tabBtnLicenses" onclick="switchMainTab('licenses')">
          <svg class="icon" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
          <span>قائمة التراخيص الصادرة</span>
          <span class="tab-badge" id="badgeLicensesCount">0</span>
        </button>

        <button class="nav-tab" id="tabBtnLogs" onclick="switchMainTab('logs')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
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
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
        </div>

        <div class="kpi-box kpi-active">
          <div class="kpi-info">
            <span class="kpi-label">النشطة والمفعلة</span>
            <span class="kpi-value" id="kpi-active">0</span>
          </div>
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
        </div>

        <div class="kpi-box kpi-pending">
          <div class="kpi-info">
            <span class="kpi-label">قيد انتظار التفعيل</span>
            <span class="kpi-value" id="kpi-pending">0</span>
          </div>
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
        </div>

        <div class="kpi-box kpi-disabled">
          <div class="kpi-info">
            <span class="kpi-label">معطلة أو منتهية</span>
            <span class="kpi-value" id="kpi-disabled">0</span>
          </div>
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
        </div>
      </div>

      <!-- Section: Create License Panel -->
      <div class="panel panel-form" style="overflow: visible;">
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
                  <option value="7">تجريبي (7 أيام)</option>
                  <option value="3">تجريبي (3 أيام)</option>
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

              <button type="submit" class="btn-create">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>إصدار الرمز</span>
              </button>
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
            <svg class="icon search-icon-inside" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="searchInput" oninput="onLicenseFilterChange()" placeholder="بحث باسم المنشأة، الهاتف، رمز الترخيص، أو بصمة الجهاز...">
          </div>

          <div class="filters">
            <button class="filter-tab active" onclick="setLicenseFilter('all', this)">
              <span>الكل</span>
              <span class="filter-count" id="count-lic-all">0</span>
            </button>
            <button class="filter-tab" onclick="setLicenseFilter('active', this)">
              <span>النشطة</span>
              <span class="filter-count" id="count-lic-active">0</span>
            </button>
            <button class="filter-tab" onclick="setLicenseFilter('pending', this)">
              <span>في الانتظار</span>
              <span class="filter-count" id="count-lic-pending">0</span>
            </button>
            <button class="filter-tab" onclick="setLicenseFilter('disabled', this)">
              <span>المعطلة</span>
              <span class="filter-count" id="count-lic-disabled">0</span>
            </button>
            <button class="filter-tab" onclick="setLicenseFilter('expired', this)">
              <span>المنتهية</span>
              <span class="filter-count" id="count-lic-expired">0</span>
            </button>
          </div>
        </div>

        <div class="table-responsive-container">
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

        <!-- Licenses Pagination Bar with Custom Dropdown (No default OS Select) -->
        <div class="pagination-bar" id="licensesPaginationBar">
          <div class="pagination-info">
            <span id="licensesPaginationText">عرض 0 إلى 0 من 0 ترخيص</span>
            <span>|</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span>عرض:</span>
              <div class="custom-dropdown-container" id="licensesCustomDropdown">
                <button type="button" class="custom-dropdown-trigger" onclick="toggleCustomDropdown('licenses', event)">
                  <span id="licensesPageSizeLabel">15 ترخيص</span>
                  <svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="custom-dropdown-menu" id="licensesDropdownMenu">
                  <div class="custom-dropdown-item" onclick="choosePageSize('licenses', 10, '10 تراخيص')">
                    <span>10 تراخيص</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item selected" onclick="choosePageSize('licenses', 15, '15 ترخيص')">
                    <span>15 ترخيص</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item" onclick="choosePageSize('licenses', 25, '25 ترخيص')">
                    <span>25 ترخيص</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item" onclick="choosePageSize('licenses', 50, '50 ترخيص')">
                    <span>50 ترخيص</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item" onclick="choosePageSize('licenses', 100, '100 ترخيص')">
                    <span>100 ترخيص</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
              </div>
            </div>
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
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
          </div>
        </div>

        <div class="kpi-box kpi-active">
          <div class="kpi-info">
            <span class="kpi-label">حركات ناجحة</span>
            <span class="kpi-value" id="kpi-logs-success">0</span>
          </div>
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
        </div>

        <div class="kpi-box kpi-disabled">
          <div class="kpi-info">
            <span class="kpi-label">محاولات مرفوضة</span>
            <span class="kpi-value" id="kpi-logs-failed">0</span>
          </div>
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
        </div>

        <div class="kpi-box">
          <div class="kpi-info">
            <span class="kpi-label">الأجهزة المفحوصة</span>
            <span class="kpi-value" id="kpi-logs-devices">0</span>
          </div>
          <div class="kpi-icon-box">
            <svg class="icon icon-lg" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
          </div>
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
            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.67-6.67"/></svg>
            <span>تحديث السجل</span>
          </button>
        </div>

        <!-- Logs Filter Toolbar -->
        <div class="table-bar">
          <div class="search-box">
            <svg class="icon search-icon-inside" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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

        <div class="table-responsive-container">
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

        <!-- Logs Pagination Bar with Custom Dropdown -->
        <div class="pagination-bar" id="logsPaginationBar">
          <div class="pagination-info">
            <span id="logsPaginationText">عرض 0 إلى 0 من 0 حركة</span>
            <span>|</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span>عرض:</span>
              <div class="custom-dropdown-container" id="logsCustomDropdown">
                <button type="button" class="custom-dropdown-trigger" onclick="toggleCustomDropdown('logs', event)">
                  <span id="logsPageSizeLabel">15 حركة</span>
                  <svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="custom-dropdown-menu" id="logsDropdownMenu">
                  <div class="custom-dropdown-item" onclick="choosePageSize('logs', 10, '10 حركات')">
                    <span>10 حركات</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item selected" onclick="choosePageSize('logs', 15, '15 حركة')">
                    <span>15 حركة</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item" onclick="choosePageSize('logs', 25, '25 حركة')">
                    <span>25 حركة</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item" onclick="choosePageSize('logs', 50, '50 حركة')">
                    <span>50 حركة</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-dropdown-item" onclick="choosePageSize('logs', 100, '100 حركة')">
                    <span>100 حركة</span>
                    <svg class="icon icon-sm custom-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
              </div>
            </div>
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
        <h4>
          <svg class="icon" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span>تسليم الترخيص للعميل</span>
        </h4>
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
        <button class="btn-row btn-row-share" onclick="copyShareText()">
          <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>نسخ الرسالة</span>
        </button>
        <button class="btn-row btn-row-share" id="shareWhatsAppBtn" onclick="openWhatsApp()">
          <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>إرسال واتساب</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: Device Fingerprint & Cloud Recovery (HWID & Disaster Recovery) -->
  <div class="modal-overlay" id="deviceModal">
    <div class="modal-card" style="max-width:560px;">
      <div class="modal-header">
        <h4>
          <svg class="icon" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span>معاينة بصمة الجهاز وكود الاسترجاع السحابي</span>
        </h4>
        <button class="modal-close" onclick="closeModal('deviceModal')">&times;</button>
      </div>
      <div class="modal-body">
        <!-- License Header Banner -->
        <div style="background:#f8fafc; border:1px solid var(--border); border-radius:var(--radius-lg); padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="font-size:11px; font-weight:800; color:var(--text-muted);">المنشأة:</div>
            <div id="devModalShopName" style="font-weight:900; color:var(--primary); font-size:14px;"></div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:800; color:var(--text-muted);">رمز الترخيص:</div>
            <div id="devModalLicKey" style="font-family:monospace; font-weight:900; color:var(--emerald); font-size:13px;"></div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:800; color:var(--text-muted);">حالة الربط:</div>
            <div id="devModalBindStatus"></div>
          </div>
        </div>

        <!-- Machine HWID Fingerprint Box -->
        <div class="field">
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>بصمة الجهاز المربوط (Hardware ID / HWID)</span>
            <span style="font-size:11px; color:var(--text-muted); font-weight:600;">مشتقة من المعالج واللوحة الأم للنظام</span>
          </label>
          <div style="position:relative;">
            <div id="devModalFpBox" style="font-family:monospace; font-size:12px; background:#0f172a; color:#38bdf8; padding:12px 14px; border-radius:8px; line-height:1.6; word-break:break-all; user-select:all; border:1px solid #1e293b; min-height:46px;"></div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:6px;">
            <button class="btn-row" id="devModalCopyFpBtn" onclick="copyDeviceFingerprint()">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>نسخ البصمة كاملة</span>
            </button>
          </div>
        </div>

        <!-- Cloud Emergency Recovery Key Box -->
        <div class="field" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--radius-lg); padding:14px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <svg class="icon" style="color:#16a34a;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style="font-weight:900; font-size:13px; color:#14532d;">كود الاسترجاع السحابي للطوارئ (Master Recovery Key)</span>
          </div>
          <p style="font-size:11.5px; color:#166534; line-height:1.5; margin-bottom:10px;">
            إذا تلف جهاز العميل أو احترق وأراد استرجاع نسخته الاحتياطية على جهاز جديد، زوده بهذا المفتاح في شاشة الاسترجاع لفك تشفير البيانات فوراً:
          </p>
          <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #86efac; border-radius:6px; padding:8px 12px;">
            <span id="devModalRecoveryKeyBox" style="font-family:monospace; font-size:15px; font-weight:900; color:#047857; letter-spacing:0.5px;"></span>
            <button class="btn-row btn-row-share" onclick="copyRecoveryKey()">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>نسخ المفتاح</span>
            </button>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <button class="btn-row" onclick="closeModal('deviceModal')">إغلاق</button>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-row btn-row-share" id="devModalWhatsAppBtn" onclick="openDeviceRecoveryWhatsApp()">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>إرسال بيانات الاسترجاع للعميل</span>
          </button>
          <button class="btn-row btn-row-danger" id="devModalUnlinkBtn" onclick="unlinkFromDeviceModal()">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
            <span>فك ربط الجهاز</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Extend / Edit -->
  <div class="modal-overlay" id="editModal">
    <div class="modal-card">
      <div class="modal-header">
        <h4>
          <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>تعديل وتمديد صلاحية الترخيص</span>
        </h4>
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
`;
