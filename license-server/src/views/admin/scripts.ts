/**
 * Admin Dashboard Client-side Interactivity, Filtering & API Handlers
 */
export const adminScripts = `    const DEFAULT_SECRET = 'rafiq_admin_super_secret_2026';
    
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
    // RAFIQ POS LUXURY CUSTOM SELECTS (durationSelect & editExtendAction)
    // ==========================================
    function initCustomSelect(selectId) {
      const origSelect = document.getElementById(selectId);
      if (!origSelect) return;

      origSelect.style.display = 'none';

      const existing = document.getElementById('custom-select-' + selectId);
      if (existing) existing.remove();

      const container = document.createElement('div');
      container.className = 'rafiq-select';
      container.id = 'custom-select-' + selectId;

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'rafiq-select-trigger';

      const selectedOption = origSelect.options[origSelect.selectedIndex] || origSelect.options[0];
      const labelSpan = document.createElement('span');
      labelSpan.className = 'rafiq-select-label';
      labelSpan.textContent = selectedOption ? selectedOption.text : '';

      const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrowSvg.setAttribute('class', 'rafiq-select-arrow');
      arrowSvg.setAttribute('viewBox', '0 0 24 24');
      arrowSvg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';

      trigger.appendChild(labelSpan);
      trigger.appendChild(arrowSvg);

      const menu = document.createElement('div');
      menu.className = 'rafiq-select-menu';

      function renderOptions() {
        menu.innerHTML = '';
        for (let i = 0; i < origSelect.options.length; i++) {
          const opt = origSelect.options[i];
          const isSelected = opt.value === origSelect.value;
          const item = document.createElement('div');
          item.className = 'rafiq-select-option' + (isSelected ? ' selected' : '');
          item.dataset.value = opt.value;

          const textSpan = document.createElement('span');
          textSpan.textContent = opt.text;
          item.appendChild(textSpan);

          if (isSelected) {
            const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            checkSvg.setAttribute('class', 'check-icon');
            checkSvg.setAttribute('viewBox', '0 0 24 24');
            checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
            item.appendChild(checkSvg);
          }

          item.addEventListener('click', (e) => {
            e.stopPropagation();
            origSelect.value = opt.value;
            labelSpan.textContent = opt.text;
            container.classList.remove('open');
            renderOptions();
            origSelect.dispatchEvent(new Event('change', { bubbles: true }));
          });

          menu.appendChild(item);
        }
      }

      renderOptions();

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('open');
        document.querySelectorAll('.rafiq-select.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) {
          const rect = trigger.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < 260 && rect.top > 260) {
            menu.classList.add('open-up');
          } else {
            menu.classList.remove('open-up');
          }
          container.classList.add('open');
        }
      });

      container.appendChild(trigger);
      container.appendChild(menu);
      origSelect.parentNode.insertBefore(container, origSelect.nextSibling);

      origSelect._syncCustom = function() {
        const curOpt = origSelect.options[origSelect.selectedIndex];
        if (curOpt) labelSpan.textContent = curOpt.text;
        renderOptions();
      };
    }

    // ==========================================
    // CUSTOM PAGE SIZE DROPDOWNS (No Default Select)
    // ==========================================
    function toggleCustomDropdown(type, event) {
      if (event) event.stopPropagation();
      const menu = document.getElementById(type === 'licenses' ? 'licensesDropdownMenu' : 'logsDropdownMenu');
      const otherMenu = document.getElementById(type === 'licenses' ? 'logsDropdownMenu' : 'licensesDropdownMenu');
      if (otherMenu) otherMenu.classList.remove('show');
      if (menu) menu.classList.toggle('show');
    }

    function choosePageSize(type, size, label) {
      const isLic = type === 'licenses';
      const menu = document.getElementById(isLic ? 'licensesDropdownMenu' : 'logsDropdownMenu');
      const labelEl = document.getElementById(isLic ? 'licensesPageSizeLabel' : 'logsPageSizeLabel');
      
      if (labelEl) labelEl.textContent = label;

      if (menu) {
        menu.querySelectorAll('.custom-dropdown-item').forEach(item => {
          if (item.textContent.trim().startsWith(String(size))) {
            item.classList.add('selected');
          } else {
            item.classList.remove('selected');
          }
        });
        menu.classList.remove('show');
      }

      if (isLic) {
        licensesPageSize = size;
        licensesCurrentPage = 1;
        renderLicensesTable();
      } else {
        logsPageSize = size;
        logsCurrentPage = 1;
        renderLogsTable();
      }
    }

    // Global listener to close custom dropdowns on click outside
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.rafiq-select.open').forEach(el => el.classList.remove('open'));
      const licDropdown = document.getElementById('licensesCustomDropdown');
      const logsDropdown = document.getElementById('logsCustomDropdown');
      if (licDropdown && !licDropdown.contains(e.target)) {
        const m = document.getElementById('licensesDropdownMenu');
        if (m) m.classList.remove('show');
      }
      if (logsDropdown && !logsDropdown.contains(e.target)) {
        const m = document.getElementById('logsDropdownMenu');
        if (m) m.classList.remove('show');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.rafiq-select.open').forEach(el => el.classList.remove('open'));
      }
    });

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
      let active = 0, pending = 0, disabled = 0, expired = 0;

      allLicenses.forEach(l => {
        const isExp = l.expires_at && new Date(l.expires_at) < now;
        if (l.status === 'disabled') {
          disabled++;
        } else if (l.status === 'expired' || isExp) {
          expired++;
        } else if (l.status === 'active') {
          active++;
        } else if (l.status === 'pending') {
          pending++;
        }
      });

      document.getElementById('kpi-active').textContent = active;
      document.getElementById('kpi-pending').textContent = pending;
      document.getElementById('kpi-disabled').textContent = disabled;

      const elAll = document.getElementById('count-lic-all');
      if (elAll) elAll.textContent = allLicenses.length;
      const elAct = document.getElementById('count-lic-active');
      if (elAct) elAct.textContent = active;
      const elPen = document.getElementById('count-lic-pending');
      if (elPen) elPen.textContent = pending;
      const elDis = document.getElementById('count-lic-disabled');
      if (elDis) elDis.textContent = disabled;
      const elExp = document.getElementById('count-lic-expired');
      if (elExp) elExp.textContent = expired;
    }

    function setLicenseFilter(f, btn) {
      if (currentLicenseFilter === f && licensesCurrentPage === 1) return;
      currentLicenseFilter = f;
      document.querySelectorAll('#licensesView .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      licensesCurrentPage = 1;

      const tbody = document.getElementById('licensesTableBody');
      if (tbody) {
        tbody.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';
        tbody.style.opacity = '0.25';
        tbody.style.transform = 'translateY(4px)';
      }

      setTimeout(() => {
        applyLicenseFilters();
        if (tbody) {
          tbody.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
          tbody.style.opacity = '1';
          tbody.style.transform = 'translateY(0)';
        }
      }, 90);
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

    function goToLicensesPage(p) {
      if (licensesCurrentPage === p) return;
      const tbody = document.getElementById('licensesTableBody');
      if (tbody) {
        tbody.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';
        tbody.style.opacity = '0.25';
        tbody.style.transform = 'translateY(4px)';
      }

      setTimeout(() => {
        licensesCurrentPage = p;
        renderLicensesTable();
        if (tbody) {
          tbody.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
          tbody.style.opacity = '1';
          tbody.style.transform = 'translateY(0)';
        }
      }, 90);
    }

    function renderLicensesTable() {
      const tbody = document.getElementById('licensesTableBody');
      tbody.innerHTML = '';
      tbody.classList.remove('table-fade-in');
      void tbody.offsetWidth;
      tbody.classList.add('table-fade-in');

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
        tr.className = 'table-row-animated';
        tr.style.setProperty('--delay', String(idx));
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
          ? \`<button class="btn-fp-badge" onclick="openDeviceModal('\${lic.id}')" title="معاينة بصمة الجهاز وكود الاسترجاع السحابي">
               <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
               <span>\${lic.machine_fingerprint.substring(0, 14)}...</span>
             </button>\`
          : '<span style="color:var(--text-muted); font-size:11.5px; font-weight:700;">غير مربوط</span>';

        tr.innerHTML = \`
          <td style="font-family:monospace; color:var(--text-muted); font-size:12px; font-weight:700;">\${rowNumber}</td>
          <td>
            <div class="key-cell">
              <span class="key-text">\${lic.license_key}</span>
              <button class="btn-icon-copy" onclick="copyKey('\${lic.license_key}')" title="نسخ المفتاح">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>نسخ</span>
              </button>
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
              <button class="btn-row btn-row-device" onclick="openDeviceModal('\${lic.id}')" title="معاينة بصمة الجهاز وكود الاسترجاع للطوارئ">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span>البصمة</span>
              </button>
              <button class="btn-row btn-row-share" onclick="openShareModal('\${lic.id}')" title="تسليم المفتاح للعميل">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span>تسليم</span>
              </button>
              <button class="btn-row" onclick="openEditModal('\${lic.id}')" title="تمديد وتعديل">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>تمديد</span>
              </button>
              \${lic.machine_fingerprint ? \`
                <button class="btn-row" onclick="resetDevice('\${lic.id}', '\${lic.shop_name}')" title="فك ربط الجهاز لنقله لكمبيوتر جديد">
                  <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                  <span>فك ربط</span>
                </button>
              \` : ''}
              \${lic.status === 'active' ? \`
                <button class="btn-row btn-row-danger" onclick="toggleStatus('\${lic.id}', '\${lic.shop_name}', 'revoke')" title="إيقاف">
                  <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  <span>إيقاف</span>
                </button>
              \` : \`
                <button class="btn-row" onclick="toggleStatus('\${lic.id}', '\${lic.shop_name}', 'activate')" title="تشغيل">
                  <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <span>تفعيل</span>
                </button>
              \`}
              <button class="btn-row btn-row-danger" onclick="deleteLicense('\${lic.id}', '\${lic.shop_name}')" title="حذف">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>حذف</span>
              </button>
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
      if (currentLogsActionFilter === action && logsCurrentPage === 1) return;
      currentLogsActionFilter = action;
      btn.parentElement.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logsCurrentPage = 1;

      const tbody = document.getElementById('logsTableBody');
      if (tbody) {
        tbody.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';
        tbody.style.opacity = '0.25';
        tbody.style.transform = 'translateY(4px)';
      }

      setTimeout(() => {
        applyLogsFilters();
        if (tbody) {
          tbody.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
          tbody.style.opacity = '1';
          tbody.style.transform = 'translateY(0)';
        }
      }, 90);
    }

    function setLogsStatusFilter(status, btn) {
      if (currentLogsStatusFilter === status && logsCurrentPage === 1) return;
      currentLogsStatusFilter = status;
      btn.parentElement.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logsCurrentPage = 1;

      const tbody = document.getElementById('logsTableBody');
      if (tbody) {
        tbody.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';
        tbody.style.opacity = '0.25';
        tbody.style.transform = 'translateY(4px)';
      }

      setTimeout(() => {
        applyLogsFilters();
        if (tbody) {
          tbody.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
          tbody.style.opacity = '1';
          tbody.style.transform = 'translateY(0)';
        }
      }, 90);
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

    function goToLogsPage(p) {
      if (logsCurrentPage === p) return;
      const tbody = document.getElementById('logsTableBody');
      if (tbody) {
        tbody.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out';
        tbody.style.opacity = '0.25';
        tbody.style.transform = 'translateY(4px)';
      }

      setTimeout(() => {
        logsCurrentPage = p;
        renderLogsTable();
        if (tbody) {
          tbody.style.transition = 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
          tbody.style.opacity = '1';
          tbody.style.transform = 'translateY(0)';
        }
      }, 90);
    }

    function renderLogsTable() {
      const tbody = document.getElementById('logsTableBody');
      tbody.innerHTML = '';
      tbody.classList.remove('table-fade-in');
      void tbody.offsetWidth;
      tbody.classList.add('table-fade-in');

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
        tr.className = 'table-row-animated';
        tr.style.setProperty('--delay', String(idx));
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
              <button class="btn-icon-copy" onclick="copyKey('\${log.license_key}')" title="نسخ المفتاح">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>نسخ</span>
              </button>
            </div>
          </td>
          <td>\${actionBadge}</td>
          <td>
            <span class="pill \${isSuccess ? 'pill-active' : 'pill-disabled'}">
              <svg class="icon icon-sm" viewBox="0 0 24 24">
                \${isSuccess 
                  ? '<polyline points="20 6 9 17 4 12"/>' 
                  : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}
              </svg>
              <span>\${isSuccess ? 'ناجح' : 'فشل'}</span>
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

    // Generic Pagination Controls Builder (with SVG Chevrons)
    function renderPaginationControls(containerId, currentPage, totalPages, onPageClick) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';

      if (totalPages <= 1) return;

      // First Button (RTL First is double chevron right)
      const firstBtn = document.createElement('button');
      firstBtn.className = 'page-btn';
      firstBtn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>';
      firstBtn.title = 'الصفحة الأولى';
      firstBtn.disabled = currentPage === 1;
      firstBtn.onclick = () => onPageClick(1);
      container.appendChild(firstBtn);

      // Prev Button (RTL Prev is single chevron right)
      const prevBtn = document.createElement('button');
      prevBtn.className = 'page-btn';
      prevBtn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
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

      // Next Button (RTL Next is single chevron left)
      const nextBtn = document.createElement('button');
      nextBtn.className = 'page-btn';
      nextBtn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
      nextBtn.title = 'الصفحة التالية';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.onclick = () => onPageClick(currentPage + 1);
      container.appendChild(nextBtn);

      // Last Button (RTL Last is double chevron left)
      const lastBtn = document.createElement('button');
      lastBtn.className = 'page-btn';
      lastBtn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>';
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
        document.getElementById('durationSelect')._syncCustom?.();
        
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

    let currentDeviceData = null;

    function openDeviceModal(id) {
      const lic = allLicenses.find(l => l.id === id);
      if (!lic) return;
      currentDeviceData = lic;

      document.getElementById('devModalShopName').textContent = lic.shop_name;
      document.getElementById('devModalLicKey').textContent = lic.license_key;

      const fp = (lic.machine_fingerprint || '').trim();
      const statusEl = document.getElementById('devModalBindStatus');
      const fpBox = document.getElementById('devModalFpBox');
      const copyFpBtn = document.getElementById('devModalCopyFpBtn');
      const unlinkBtn = document.getElementById('devModalUnlinkBtn');
      const recoveryBox = document.getElementById('devModalRecoveryKeyBox');
      const whatsappBtn = document.getElementById('devModalWhatsAppBtn');

      if (fp) {
        statusEl.innerHTML = '<span class="pill pill-active">مربوط بجهاز نشط</span>';
        fpBox.textContent = fp;
        fpBox.style.color = '#38bdf8';
        copyFpBtn.style.display = 'inline-flex';
        unlinkBtn.style.display = 'inline-flex';
        recoveryBox.textContent = lic.license_key;
      } else {
        statusEl.innerHTML = '<span class="pill pill-pending">غير مربوط (متاح للتفعيل)</span>';
        fpBox.textContent = 'لا يوجد جهاز مربوط حالياً بهذا الترخيص. عند تفعيل العميل للبرنامج على جهازه، ستظهر البصمة هنا تلقائياً.';
        fpBox.style.color = '#94a3b8';
        copyFpBtn.style.display = 'none';
        unlinkBtn.style.display = 'none';
        recoveryBox.textContent = lic.license_key;
      }

      const phoneDigits = lic.owner_phone ? lic.owner_phone.replace(/\D/g, '') : '';
      whatsappBtn.style.display = (fp && phoneDigits) ? 'inline-flex' : 'none';

      openModal('deviceModal');
    }

    function copyDeviceFingerprint() {
      if (!currentDeviceData || !currentDeviceData.machine_fingerprint) return;
      navigator.clipboard.writeText(currentDeviceData.machine_fingerprint);
      showToast('تم نسخ بصمة الجهاز كاملة بنجاح');
    }

    function copyRecoveryKey() {
      if (!currentDeviceData) return;
      navigator.clipboard.writeText(currentDeviceData.license_key);
      showToast('تم نسخ مفتاح الاسترجاع بنجاح');
    }

    function unlinkFromDeviceModal() {
      if (!currentDeviceData) return;
      const targetId = currentDeviceData.id;
      const targetShop = currentDeviceData.shop_name;
      closeModal('deviceModal');
      resetDevice(targetId, targetShop);
    }

    function openDeviceRecoveryWhatsApp() {
      if (!currentDeviceData || !currentDeviceData.owner_phone) return;
      let phone = currentDeviceData.owner_phone.replace(/\D/g, '');
      if (phone.startsWith('01')) {
        phone = '2' + phone; // Egypt prefix
      }
      const msg = \`مرحباً بك، فريق دعم رفيق لنقاط البيع (Rafiq POS)

بيانات فك تشفير واسترجاع النسخة الاحتياطية على جهاز جديد:
المنشأة: \${currentDeviceData.shop_name}
رمز الترخيص: \${currentDeviceData.license_key}
مفتاح الاسترجاع وفك التشفير (Master Recovery Key):
\${currentDeviceData.license_key}

خطوات الاسترجاع:
1. قم بتثبيت برنامج رفيق POS على الكمبيوتر الجديد.
2. في شاشة الدخول أو من الإعدادات، اختر "استرجاع نسخة احتياطية".
3. حدد ملف النسخة المشفر من الفلاشة.
4. أدخل مفتاح الاسترجاع أعلاه لفك التشفير واستعادة كافة بيانات المحل والفواتير بنجاح.

لأي استفسار تواصل معنا مباشرة.\`;
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
    }

    function openEditModal(id) {
      const lic = allLicenses.find(l => l.id === id);
      if (!lic) return;

      document.getElementById('editLicenseId').value = lic.id;
      document.getElementById('editShopName').value = lic.shop_name;
      document.getElementById('editOwnerPhone').value = lic.owner_phone || '';
      document.getElementById('editNotes').value = lic.notes || '';
      document.getElementById('editExtendAction').value = 'none';
      document.getElementById('editExtendAction')._syncCustom?.();
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
      initCustomSelect('durationSelect');
      initCustomSelect('editExtendAction');
      loadLicenses();
      loadLogs();
    }

    window.onload = initDashboard;`;
