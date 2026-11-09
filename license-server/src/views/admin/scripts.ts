/**
 * Admin Dashboard Client-side Interactivity, Filtering & API Handlers
 * Zero Emojis - Pure Lucide SVGs - Enterprise Security & Responsiveness
 */
export const adminScripts = `
    function escapeHtml(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    // State Variables
    var activeMainTab = 'licenses'; // 'licenses' | 'logs' | 'offline' | 'releases'
    var currentViewMode = 'cards';   // 'cards' | 'table'
    var userViewPreference = null;  // user explicitly picked cards/table
    var allLicenses = [];
    var allLogs = [];
    var allReleases = [];
    var currentShareData = null;
    var currentRescueLicId = null;

    // Licenses Filter & Pagination State
    var currentLicenseFilter = 'all';
    var licenseSearchQuery = '';
    var licensesCurrentPage = 1;
    var licensesPageSize = 12;
    var filteredLicensesCache = [];

    // Logs Filter & Pagination State
    var logsSearchQuery = '';
    var logsCurrentPage = 1;
    var logsPageSize = 15;
    var filteredLogsCache = [];

    // ==========================================
    // AUTHENTICATION & SESSION HANDLING
    // ==========================================
    function getSecret() {
      return localStorage.getItem('rafiq_admin_secret') || sessionStorage.getItem('rafiq_admin_secret') || '';
    }

    function setSecret(sec) {
      localStorage.setItem('rafiq_admin_secret', sec);
    }

    function hideLoginScreen() {
      var screen = document.getElementById('login-screen');
      if (screen) {
        screen.classList.add('hidden');
        screen.style.setProperty('display', 'none', 'important');
      }
    }

    function showLoginScreen() {
      var screen = document.getElementById('login-screen');
      if (screen) {
        screen.classList.remove('hidden');
        screen.style.setProperty('display', 'flex', 'important');
      }
    }

    function checkAuth() {
      var sec = getSecret();
      if (!sec) {
        document.documentElement.classList.remove('is-auth');
        showLoginScreen();
        return false;
      }
      document.documentElement.classList.add('is-auth');
      hideLoginScreen();
      return true;
    }

    function toggleLoginPassword() {
      var inp = document.getElementById('loginSecretInput');
      var icon = document.getElementById('loginEyeIcon');
      if (!inp) return;
      if (inp.type === 'password') {
        inp.type = 'text';
        if (icon) icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        inp.type = 'password';
        if (icon) icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    }

    async function handleLogin(e) {
      if (e) {
        try {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        } catch (_) {}
      }
      var input = document.getElementById('loginSecretInput');
      var btn = document.getElementById('btnLoginSubmit');
      var errBox = document.getElementById('loginError');
      var val = (input ? input.value : '').trim();
      if (!val) {
        if (input) input.focus();
        return false;
      }

      if (errBox) {
        errBox.style.display = 'none';
        errBox.textContent = '';
      }
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>جاري التحقق من كلمة السر...</span>';
      }

      try {
        var res = await fetch('/api/admin/licenses', {
          headers: { 'X-Admin-Secret': val }
        });

        if (res.status === 401 || !res.ok) {
          if (errBox) {
            errBox.textContent = 'كلمة السر غير صحيحة. يرجى التأكد وإعادة المحاولة.';
            errBox.style.display = 'block';
          } else {
            showToast('كلمة سر الإدارة غير صحيحة', true);
          }
          if (input) {
            input.focus();
            input.select();
          }
          return false;
        }

        var data = await res.json();
        if (data && data.success) {
          setSecret(val);
          document.documentElement.classList.add('is-auth');
          hideLoginScreen();
          showToast('تم تسجيل الدخول بنجاح!');
          
          allLicenses = data.data || data.licenses || [];
          var badge = document.getElementById('badgeLicensesCount');
          if (badge) badge.textContent = allLicenses.length;
          
          initDashboard();
          return false;
        } else {
          if (errBox) {
            errBox.textContent = (data && data.message) ? data.message : 'فشل تسجيل الدخول';
            errBox.style.display = 'block';
          }
          return false;
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'حدث خطأ في الاتصال بالسيرفر: ' + (err.message || 'خطأ غير معروف');
          errBox.style.display = 'block';
        }
        return false;
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>دخول للنظام</span><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>';
        }
      }
    }

    function logout() {
      showConfirm(
        'تسجيل الخروج',
        'هل تريد قفل لوحة التحكم وتسجيل الخروج الآن؟',
        function() {
          localStorage.removeItem('rafiq_admin_secret');
          sessionStorage.removeItem('rafiq_admin_secret');
          document.documentElement.classList.remove('is-auth');
          location.reload();
        }
      );
    }

    // ==========================================
    // NOTIFICATIONS & MODALS (Zero Stuck Modals)
    // ==========================================
    function showToast(text, isError) {
      var t = document.getElementById('toast');
      if (!t) return;
      var iconSvg = isError
        ? '<svg class="w-4 h-4 text-rose-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg class="w-4 h-4 text-emerald-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      t.innerHTML = iconSvg + '<span>' + text + '</span>';
      t.className = isError 
        ? 'fixed top-5 left-1/2 -translate-x-1/2 z-[10000000] px-4 py-2.5 rounded-2xl bg-rose-950 text-rose-100 text-xs sm:text-sm font-bold shadow-2xl border border-rose-500/40 flex items-center gap-2.5 max-w-[92vw] sm:max-w-md backdrop-blur-md'
        : 'fixed top-5 left-1/2 -translate-x-1/2 z-[10000000] px-4 py-2.5 rounded-2xl bg-[#002922] text-emerald-100 text-xs sm:text-sm font-bold shadow-2xl border border-emerald-500/40 flex items-center gap-2.5 max-w-[92vw] sm:max-w-md backdrop-blur-md';
      t.classList.remove('hidden');
      t.style.setProperty('display', 'flex', 'important');
      t.style.setProperty('z-index', '1000000', 'important');
      if (window._toastTimeout) clearTimeout(window._toastTimeout);
      window._toastTimeout = setTimeout(function() {
        t.classList.add('hidden');
        t.style.setProperty('display', 'none', 'important');
      }, 3500);
    }

    function markInputInvalid(inputEl, message) {
      if (!inputEl) return;
      inputEl.classList.add('field-invalid');
      try { inputEl.focus(); } catch (_) {}
      if (message) {
        showToast(message, true);
      }
      var clearInvalid = function() {
        inputEl.classList.remove('field-invalid');
        inputEl.removeEventListener('input', clearInvalid);
        inputEl.removeEventListener('change', clearInvalid);
      };
      inputEl.addEventListener('input', clearInvalid);
      inputEl.addEventListener('change', clearInvalid);
    }

    // Global form validation interceptor (Enforces custom styling, zero default tooltips)
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      var requiredInputs = form.querySelectorAll('input[required], textarea[required], select[required]');
      for (var i = 0; i < requiredInputs.length; i++) {
        var inp = requiredInputs[i];
        if (inp.offsetParent !== null && !inp.value.trim()) {
          e.preventDefault();
          e.stopPropagation();
          var fieldLabel = '';
          var labelEl = form.querySelector('label[for="' + inp.id + '"]') || (inp.closest('div') ? inp.closest('div').querySelector('label') : null);
          if (labelEl) {
            fieldLabel = labelEl.textContent.replace(/[*:]/g, '').trim();
          }
          var msg = fieldLabel ? ('يرجى ملء ' + fieldLabel + ' أولاً للمتابعة') : 'يرجى ملء هذا الحقل المطلوب أولاً للمتابعة';
          markInputInvalid(inp, msg);
          return false;
        }
      }
    }, true);

    function openModal(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollTop = 0;
      el.classList.remove('hidden');
      el.classList.add('active');
      el.style.setProperty('display', 'flex', 'important');
      document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active');
      el.classList.add('hidden');
      el.style.setProperty('display', 'none', 'important');
      if (!document.querySelector('.modal-backdrop.active')) {
        document.body.style.overflow = '';
      }
    }

    function showConfirm(title, message, onConfirm) {
      var titleEl = document.getElementById('confirmModalTitle');
      var msgEl = document.getElementById('confirmModalMessage');
      var btn = document.getElementById('confirmModalActionBtn');
      if (titleEl) titleEl.textContent = title || 'تأكيد العملية';
      if (msgEl) msgEl.textContent = message || 'هل أنت متأكد من تنفيذ هذا الإجراء؟';
      if (btn) {
        btn.onclick = function() {
          closeModal('confirmModal');
          if (typeof onConfirm === 'function') {
            try { onConfirm(); } catch (err) { console.error('Confirm action error:', err); }
          }
        };
      }
      openModal('confirmModal');
    }

    // Modal Global Escape Key & Backdrop Click Handlers
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.active').forEach(function(m) {
          closeModal(m.id);
        });
      }
    });

    document.addEventListener('click', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
        closeModal(e.target.id);
      }
    });

    // ==========================================
    // NAVIGATION & TAB SWITCHING
    // ==========================================
    function switchMainTab(tab) {
      if (tab === 'offline') {
        openRescueModal(null);
        return;
      }
      activeMainTab = tab;
      var tabs = [
        { id: 'licenses', el: document.getElementById('licensesView'), btn: document.getElementById('tabBtnLicenses') },
        { id: 'logs', el: document.getElementById('logsView'), btn: document.getElementById('tabBtnLogs') },
        { id: 'releases', el: document.getElementById('releasesView'), btn: document.getElementById('tabBtnReleases') }
      ];

      tabs.forEach(function(t) {
        if (!t.el) return;
        if (t.id === tab) {
          t.el.classList.remove('hidden');
          t.el.style.setProperty('display', 'flex', 'important');
        } else {
          t.el.classList.add('hidden');
          t.el.style.setProperty('display', 'none', 'important');
        }
      });

      var titleEl = document.getElementById('header-main-title');
      var subEl = document.getElementById('header-breadcrumb-title');

      // Update Nav Buttons Styles
      var defaultNavClasses = 'sidebar-nav-btn w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs sm:text-sm font-bold transition text-emerald-100/75 hover:bg-white/10 hover:text-white group active:scale-[0.98]';
      var activeNavClasses = 'sidebar-nav-btn w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs sm:text-sm font-bold transition bg-[#006d41] text-white shadow-sm border border-emerald-400/30 group active:scale-[0.98]';

      tabs.forEach(function(t) {
        if (t.btn) {
          t.btn.className = t.id === tab ? activeNavClasses : defaultNavClasses;
        }
      });

      // Update Mobile Bottom Nav Active Classes
      var bLicenses = document.getElementById('bottomNavLicenses');
      var bReleases = document.getElementById('bottomNavReleases');
      var bLogs = document.getElementById('bottomNavLogs');

      function updateBottomBtn(btn, isActive) {
        if (!btn) return;
        var icon = btn.querySelector('svg');
        var text = btn.querySelector('.mobile-bottom-tab-label') || btn.querySelector('span');
        if (isActive) {
          btn.classList.add('active');
          if (icon) {
            icon.classList.add('scale-105');
          }
          if (text) {
            text.classList.add('text-white', 'font-black');
            text.classList.remove('text-emerald-100/70', 'font-medium');
          }
        } else {
          btn.classList.remove('active');
          if (icon) {
            icon.classList.remove('scale-105');
          }
          if (text) {
            text.classList.remove('text-white', 'font-black');
            text.classList.add('text-emerald-100/70', 'font-medium');
          }
        }
      }

      updateBottomBtn(bLicenses, tab === 'licenses');
      updateBottomBtn(bReleases, tab === 'releases');
      updateBottomBtn(bLogs, tab === 'logs');

      // Update Header Titles
      if (tab === 'licenses') {
        if (titleEl) titleEl.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span><span>سجل التراخيص ومفاتيح الأسطول التجاري</span>';
        if (subEl) subEl.textContent = 'إدارة التراخيص السحابية والأوفلاين وربط الأجهزة';
        if (allLicenses.length === 0) loadLicenses();
      } else if (tab === 'logs') {
        if (titleEl) titleEl.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span><span>سجل التدقيق والأمان السحابي (Audit Logs)</span>';
        if (subEl) subEl.textContent = 'توثيق كامل لحركات التفعيل والتحقق وفك الربط مع الـ IP';
        loadLogs();
      } else if (tab === 'releases') {
        if (titleEl) titleEl.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-cyan-500 shrink-0"></span><span>التحديثات الهوائية (OTA Fleet Management)</span>';
        if (subEl) subEl.textContent = 'نشر وتوزيع حزم التحديث والتحكم بمفتاح الطوارئ (Kill Switch)';
        loadReleases();
      }

      // Close mobile drawer on navigation
      toggleSidebarMobile(false);
    }

    async function refreshCurrentView() {
      var icon = document.getElementById('refresh-icon');
      if (icon) icon.classList.add('animate-spin');
      showToast('جاري تحديث البيانات من السيرفر...');
      try {
        if (activeMainTab === 'licenses') {
          await loadLicenses();
        } else if (activeMainTab === 'logs') {
          await loadLogs();
        } else if (activeMainTab === 'releases') {
          await loadReleases();
        }
        showToast('تم تحديث البيانات بنجاح!');
      } catch (err) {
        showToast('فشل تحديث البيانات، يرجى المحاولة ثانية', true);
      } finally {
        if (icon) setTimeout(function() { icon.classList.remove('animate-spin'); }, 500);
      }
    }

    // ==========================================
    // SIDEBAR TOGGLES & AUTO-RESPONSIVENESS
    // ==========================================
    function setSidebarCollapsedState(collapsed) {
      var isMobile = window.innerWidth < 768;
      if (isMobile) {
        document.documentElement.classList.remove('sb-collapsed');
        var sbMobile = document.getElementById('app-sidebar');
        if (sbMobile) sbMobile.classList.remove('collapsed');
        return;
      }
      var sb = document.getElementById('app-sidebar');
      var icon = document.getElementById('sidebar-collapse-icon');
      if (collapsed) {
        document.documentElement.classList.add('sb-collapsed');
        if (sb) sb.classList.add('collapsed');
        if (icon) icon.style.transform = 'rotate(180deg)';
      } else {
        document.documentElement.classList.remove('sb-collapsed');
        if (sb) sb.classList.remove('collapsed');
        if (icon) icon.style.transform = 'rotate(0deg)';
      }
    }

    function toggleSidebarDesktop() {
      var isCollapsed = !document.documentElement.classList.contains('sb-collapsed');
      setSidebarCollapsedState(isCollapsed);
      localStorage.setItem('rafiq_sidebar_collapsed', isCollapsed ? '1' : '0');
    }

    function toggleSidebarMobile(force) {
      var sb = document.getElementById('app-sidebar');
      var backdrop = document.getElementById('sidebar-backdrop');
      if (!sb || !backdrop) return;

      var shouldOpen = force !== undefined ? force : !sb.classList.contains('mobile-open');
      if (shouldOpen) {
        sb.classList.remove('collapsed');
        sb.classList.add('mobile-open');
        backdrop.classList.remove('hidden');
        backdrop.style.opacity = '1';
        backdrop.style.pointerEvents = 'auto';
      } else {
        sb.classList.remove('mobile-open');
        backdrop.style.opacity = '0';
        backdrop.style.pointerEvents = 'none';
        setTimeout(function() { backdrop.classList.add('hidden'); }, 200);
      }
    }

    function handleWindowResize() {
      var width = window.innerWidth;
      
      // Auto-collapse sidebar on medium desktop screens, reset on mobile
      if (width < 768) {
        setSidebarCollapsedState(false);
      } else if (width < 1100) {
        var userPref = localStorage.getItem('rafiq_sidebar_collapsed');
        if (userPref === null || userPref === '1') {
          setSidebarCollapsedState(true);
        }
      }

      // Auto-switch to cards view on narrow screens (< 1024px) unless explicitly chosen
      if (!userViewPreference) {
        try {
          userViewPreference = localStorage.getItem('rafiq_admin_view_mode');
        } catch (_) {}
      }
      if (!userViewPreference) {
        if (width < 1024 && currentViewMode !== 'cards') {
          setViewMode('cards', false);
        } else if (width >= 1024 && currentViewMode !== 'table') {
          setViewMode('table', false);
        }
      }
    }
    window.addEventListener('resize', handleWindowResize);

    // ==========================================
    // DUAL-MODE VIEW SWITCHER (Cards vs Table)
    // ==========================================
    function setViewMode(mode, isUserExplicit) {
      currentViewMode = mode;
      if (isUserExplicit) {
        userViewPreference = mode;
        try {
          localStorage.setItem('rafiq_admin_view_mode', mode);
        } catch (_) {}
      }
      var cardsWrap = document.getElementById('licenses-cards-wrapper');
      var tableWrap = document.getElementById('licenses-table-wrapper');
      var btnCards = document.getElementById('btn-view-cards');
      var btnTable = document.getElementById('btn-view-table');

      if (mode === 'cards') {
        if (cardsWrap) cardsWrap.classList.remove('hidden');
        if (tableWrap) tableWrap.classList.add('hidden');
        if (btnCards) {
          btnCards.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-white text-slate-900 shadow-xs';
        }
        if (btnTable) {
          btnTable.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 text-slate-600 hover:text-slate-900';
        }
        renderLicensesCards();
      } else {
        if (cardsWrap) cardsWrap.classList.add('hidden');
        if (tableWrap) tableWrap.classList.remove('hidden');
        if (btnTable) {
          btnTable.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-white text-slate-900 shadow-xs';
        }
        if (btnCards) {
          btnCards.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 text-slate-600 hover:text-slate-900';
        }
        renderLicensesTable();
      }
    }

    // ==========================================
    // LICENSES API & DATA RENDERING
    // ==========================================
    async function loadLicenses() {
      if (!checkAuth()) return;

      try {
        var res = await fetch('/api/admin/licenses?_t=' + Date.now(), {
          headers: {
            'X-Admin-Secret': getSecret(),
            'Cache-Control': 'no-cache, no-store'
          }
        });

        if (res.status === 401) {
          localStorage.removeItem('rafiq_admin_secret');
          checkAuth();
          return;
        }

        var data = await res.json();
        if (!data.success) {
          showToast('فشل جلب البيانات: ' + data.message, true);
          return;
        }

        allLicenses = data.data || [];
        var badge = document.getElementById('badgeLicensesCount');
        if (badge) badge.textContent = allLicenses.length;

        updateLicenseMetrics();
        applyLicenseFilters();
      } catch (err) {
        showToast('خطأ في الاتصال بالسيرفر: ' + err.message, true);
      }
    }

    function updateLicenseMetrics() {
      var kpiTotal = document.getElementById('kpi-total');
      var kpiActive = document.getElementById('kpi-active');
      var kpiPending = document.getElementById('kpi-pending');
      var kpiDisabled = document.getElementById('kpi-disabled');

      if (kpiTotal) kpiTotal.textContent = allLicenses.length;

      var now = new Date();
      var active = 0, pending = 0, disabled = 0;

      allLicenses.forEach(function(l) {
        var isExp = l.expires_at && new Date(l.expires_at) < now;
        if (l.status === 'disabled' || l.status === 'expired' || isExp) {
          disabled++;
        } else if (l.status === 'active') {
          active++;
        } else if (l.status === 'pending') {
          pending++;
        }
      });

      if (kpiActive) kpiActive.textContent = active;
      if (kpiPending) kpiPending.textContent = pending;
      if (kpiDisabled) kpiDisabled.textContent = disabled;

      var subActive = document.getElementById('kpi-active-sub');
      if (subActive && allLicenses.length > 0) {
        var pct = Math.round((active / allLicenses.length) * 100);
        subActive.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>' + pct + '% نسبة التشغيل الفعلية</span>';
      }

      // Update Filter Chips Labels
      var chipAll = document.getElementById('filter-chip-all');
      var chipActive = document.getElementById('filter-chip-active');
      var chipPending = document.getElementById('filter-chip-pending');
      var chipDisabled = document.getElementById('filter-chip-disabled');

      if (chipAll) chipAll.textContent = 'الكل (' + allLicenses.length + ')';
      if (chipActive) chipActive.textContent = 'النشطة (' + active + ')';
      if (chipPending) chipPending.textContent = 'الانتظار (' + pending + ')';
      if (chipDisabled) chipDisabled.textContent = 'معطلة (' + disabled + ')';
    }

    function setFilter(filter, btn) {
      currentLicenseFilter = filter;
      document.querySelectorAll('.filter-chip').forEach(function(c) {
        c.className = 'filter-chip px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition whitespace-nowrap active:scale-95';
      });
      if (btn) {
        btn.className = 'filter-chip active px-3 py-1.5 rounded-xl text-xs font-bold bg-[#00372d] text-white transition whitespace-nowrap shadow-xs active:scale-95';
      }
      licensesCurrentPage = 1;
      applyLicenseFilters();
    }

    function handleSearch(val) {
      licenseSearchQuery = (val || '').trim().toLowerCase();
      licensesCurrentPage = 1;
      applyLicenseFilters();
    }

    function applyLicenseFilters() {
      var now = new Date();
      filteredLicensesCache = allLicenses.filter(function(lic) {
        // Status filter
        var isExp = lic.expires_at && new Date(lic.expires_at) < now;
        if (currentLicenseFilter === 'active' && (lic.status !== 'active' || isExp)) return false;
        if (currentLicenseFilter === 'pending' && lic.status !== 'pending') return false;
        if (currentLicenseFilter === 'disabled' && lic.status !== 'disabled' && !isExp) return false;

        // Search Query filter
        if (licenseSearchQuery) {
          var matchShop = (lic.shop_name || '').toLowerCase().indexOf(licenseSearchQuery) !== -1;
          var matchKey = (lic.license_key || '').toLowerCase().indexOf(licenseSearchQuery) !== -1;
          var matchPhone = (lic.owner_phone || '').toLowerCase().indexOf(licenseSearchQuery) !== -1;
          var matchHwid = (lic.machine_fingerprint || '').toLowerCase().indexOf(licenseSearchQuery) !== -1;
          if (!matchShop && !matchKey && !matchPhone && !matchHwid) return false;
        }

        return true;
      });

      renderLicensesTable();
      renderLicensesCards();
    }

    // ==========================================
    // CUSTOM SELECT (DROPDOWN) COMPONENT ENGINE
    // ==========================================
    function setCustomSelectValue(id, value) {
      var input = document.getElementById(id);
      if (input) input.value = value;
      var wrapper = document.getElementById('wrapper-' + id);
      if (!wrapper) return;
      var trigger = wrapper.querySelector('.custom-select-trigger span');
      var options = wrapper.querySelectorAll('.custom-option');
      options.forEach(function(opt) {
        if (opt.getAttribute('data-value') === value) {
          opt.classList.add('selected');
          var check = opt.querySelector('.custom-option-check');
          if (check) check.classList.remove('hidden');
          if (trigger) trigger.textContent = opt.querySelector('span') ? opt.querySelector('span').textContent.trim() : opt.textContent.trim();
        } else {
          opt.classList.remove('selected');
          var check = opt.querySelector('.custom-option-check');
          if (check) check.classList.add('hidden');
        }
      });
    }

    function selectCustomOption(id, value, label, e) {
      if (e) {
        try {
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (typeof e.preventDefault === 'function') e.preventDefault();
        } catch (_) {}
      }
      var input = document.getElementById(id);
      if (input) {
        input.value = value;
        try {
          var ev = new Event('change', { bubbles: true });
          input.dispatchEvent(ev);
        } catch (_) {}
      }
      var wrapper = document.getElementById('wrapper-' + id);
      if (wrapper) {
        var trigger = wrapper.querySelector('.custom-select-trigger span');
        if (trigger) trigger.textContent = label;
        var options = wrapper.querySelectorAll('.custom-option');
        options.forEach(function(opt) {
          var check = opt.querySelector('.custom-option-check');
          if (opt.getAttribute('data-value') === value) {
            opt.classList.add('selected');
            if (check) check.classList.remove('hidden');
          } else {
            opt.classList.remove('selected');
            if (check) check.classList.add('hidden');
          }
        });
        var menu = document.getElementById('options-' + id);
        if (menu) menu.classList.add('hidden');
        var chevron = wrapper.querySelector('.custom-select-chevron');
        if (chevron) chevron.classList.remove('rotate-180');
      }

      // Context callbacks
      if (id === 'durationSelect') toggleCustomDays();
      if (id === 'offlineDurationSelect') toggleOfflineCustomDays();
      if (id === 'editExtendAction') toggleEditCustomDays();
    }

    function toggleCustomSelect(id, e) {
      if (e) {
        try {
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (typeof e.preventDefault === 'function') e.preventDefault();
        } catch (_) {}
      }
      var menu = document.getElementById('options-' + id);
      var wrapper = document.getElementById('wrapper-' + id);
      if (!menu) return;
      var isClosed = menu.classList.contains('hidden');

      // Close all other custom selects
      document.querySelectorAll('.custom-select-options').forEach(function(m) {
        m.classList.add('hidden');
      });
      document.querySelectorAll('.custom-select-chevron').forEach(function(c) {
        c.classList.remove('rotate-180');
      });
      document.querySelectorAll('.custom-select-container').forEach(function(w) {
        w.classList.remove('open');
      });

      if (isClosed) {
        menu.classList.remove('hidden');
        if (wrapper) {
          wrapper.classList.add('open');
          var chevron = wrapper.querySelector('.custom-select-chevron');
          if (chevron) chevron.classList.add('rotate-180');

          // Smart auto-flip upward if select is near bottom of viewport/modal
          var rect = wrapper.getBoundingClientRect();
          var spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < 280 && rect.top > 240) {
            menu.style.top = 'auto';
            menu.style.bottom = 'calc(100% + 6px)';
          } else {
            menu.style.top = 'calc(100% + 6px)';
            menu.style.bottom = 'auto';
          }
        }
      }
    }

    // Close custom dropdowns on document click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.custom-select-container')) {
        document.querySelectorAll('.custom-select-options').forEach(function(m) {
          m.classList.add('hidden');
        });
        document.querySelectorAll('.custom-select-chevron').forEach(function(c) {
          c.classList.remove('rotate-180');
        });
        document.querySelectorAll('.custom-select-container').forEach(function(w) {
          w.classList.remove('open');
        });
      }
    });

    // ==========================================
    // FLOATING ACTION DROPDOWN MENU HANDLER
    // ==========================================
    var activeActionDropdown = null;

    function closeActionMenu() {
      if (activeActionDropdown) {
        if (activeActionDropdown.parentNode) {
          activeActionDropdown.parentNode.removeChild(activeActionDropdown);
        }
        activeActionDropdown = null;
      }
    }

    function toggleActionMenu(licId, btnElement, e) {
      if (e) {
        try {
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (typeof e.preventDefault === 'function') e.preventDefault();
        } catch (_) {}
      }

      if (activeActionDropdown && activeActionDropdown._btn === btnElement) {
        closeActionMenu();
        return;
      }
      closeActionMenu();

      var lic = allLicenses.find(function(l) { return l.id === licId; });
      if (!lic) return;

      var rect = btnElement.getBoundingClientRect();
      var menu = document.createElement('div');
      menu.className = 'floating-action-dropdown';
      menu._btn = btnElement;
      menu._openTime = Date.now();
      menu.style.position = 'fixed';
      menu.style.zIndex = '99999';
      menu.style.width = '260px';
      menu.style.backgroundColor = '#ffffff';

      var isRevoke = lic.status !== 'disabled';
      var statusAction = isRevoke ? 'revoke' : 'activate';
      var statusTitle = isRevoke ? 'إيقاف وتعطيل الترخيص' : 'إعادة تفعيل الترخيص';
      var statusDesc = isRevoke ? 'منع البرنامج من العمل على الجهاز مؤقتاً' : 'إتاحة التشغيل والتحقق السحابي فوراً';
      var statusClass = isRevoke ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50';
      var statusIcon = isRevoke
        ? '<svg class="w-4 h-4 text-rose-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg class="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

      menu.innerHTML = [
        '<div class="p-1.5 space-y-1 text-right">',
        '  <button type="button" data-id="' + escapeHtml(lic.id) + '" class="menu-item text-slate-800 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer" onclick="closeActionMenu(); openShareModal(this.dataset.id);">',
        '    <svg class="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
        '    <div class="flex-1 text-right">',
        '      <div class="leading-tight font-bold">مشاركة واتساب والبيانات</div>',
        '      <div class="text-[10px] text-slate-400 font-normal mt-0.5">إرسال كود التفعيل ورسالة الترحيب</div>',
        '    </div>',
        '  </button>',
        '  <button type="button" data-id="' + escapeHtml(lic.id) + '" class="menu-item text-slate-800 hover:bg-blue-50 hover:text-blue-800 cursor-pointer" onclick="closeActionMenu(); openEditModal(this.dataset.id);">',
        '    <svg class="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        '    <div class="flex-1 text-right">',
        '      <div class="leading-tight font-bold">تعديل وتمديد الصلاحية</div>',
        '      <div class="text-[10px] text-slate-400 font-normal mt-0.5">تعديل اسم المنشأة أو تجديد الاشتراك</div>',
        '    </div>',
        '  </button>',
        '  <button type="button" data-id="' + escapeHtml(lic.id) + '" data-name="' + escapeHtml(lic.shop_name) + '" class="menu-item text-slate-800 hover:bg-amber-50 hover:text-amber-800 cursor-pointer" onclick="closeActionMenu(); resetDevice(this.dataset.id, this.dataset.name);">',
        '    <svg class="w-4 h-4 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
        '    <div class="flex-1 text-right">',
        '      <div class="leading-tight font-bold">فك ربط بصمة الجهاز</div>',
        '      <div class="text-[10px] text-slate-400 font-normal mt-0.5">تصفير البصمة لنقل الترخيص لكمبيوتر آخر</div>',
        '    </div>',
        '  </button>',
        '  <button type="button" data-id="' + escapeHtml(lic.id) + '" class="menu-item text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer" onclick="closeActionMenu(); openRescueModal(this.dataset.id);">',
        '    <svg class="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        '    <div class="flex-1 text-right">',
        '      <div class="leading-tight font-bold text-emerald-900">أدوات الإنقاذ والدعم الفني</div>',
        '      <div class="text-[10px] text-slate-400 font-normal mt-0.5">كود أوفلاين، فك قفل الساعة، وجلسة المطور</div>',
        '    </div>',
        '  </button>',
        '  <div class="h-px bg-slate-100 my-1"></div>',
        '  <button type="button" data-id="' + escapeHtml(lic.id) + '" data-name="' + escapeHtml(lic.shop_name) + '" data-action="' + statusAction + '" class="menu-item ' + statusClass + ' cursor-pointer" onclick="closeActionMenu(); toggleStatus(this.dataset.id, this.dataset.name, this.dataset.action);">',
        '    ' + statusIcon,
        '    <div class="flex-1 text-right">',
        '      <div class="leading-tight font-bold">' + statusTitle + '</div>',
        '      <div class="text-[10px] opacity-75 font-normal mt-0.5">' + statusDesc + '</div>',
        '    </div>',
        '  </button>',
        '  <div class="h-px bg-slate-100 my-1"></div>',
        '  <button type="button" data-id="' + escapeHtml(lic.id) + '" data-name="' + escapeHtml(lic.shop_name) + '" class="menu-item text-rose-700 hover:bg-rose-50 hover:text-rose-800 cursor-pointer" onclick="closeActionMenu(); deleteLicense(this.dataset.id, this.dataset.name);">',
        '    <svg class="w-4 h-4 text-rose-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
        '    <div class="flex-1 text-right">',
        '      <div class="leading-tight font-bold text-rose-700">حذف الترخيص نهائياً</div>',
        '      <div class="text-[10px] text-rose-400 font-normal mt-0.5">مسح السجل من قاعدة البيانات السحابية</div>',
        '    </div>',
        '  </button>',
        '</div>'
      ].join('');

      document.body.appendChild(menu);

      var menuWidth = 250;
      var menuHeight = 340;
      var top = rect.bottom + 6;
      var left = rect.right - menuWidth;

      if (top + menuHeight > window.innerHeight && rect.top > menuHeight) {
        top = rect.top - menuHeight - 6;
      }
      if (left < 10) left = 10;
      if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
      activeActionDropdown = menu;
    }

    document.addEventListener('click', function(e) {
      if (activeActionDropdown && !activeActionDropdown.contains(e.target) && !e.target.closest('.action-menu-btn')) {
        closeActionMenu();
      }
    });

    window.addEventListener('scroll', function(e) {
      if (activeActionDropdown) {
        if (Date.now() - (activeActionDropdown._openTime || 0) < 250) return;
        if (!e.target || !activeActionDropdown.contains(e.target)) {
          closeActionMenu();
        }
      }
    }, true);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeActionMenu();
    });

    // A. Render Desktop Table View
    function renderLicensesTable() {
      var tbody = document.getElementById('licensesTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      var totalItems = filteredLicensesCache.length;
      var totalPages = Math.ceil(totalItems / licensesPageSize) || 1;
      if (licensesCurrentPage > totalPages) licensesCurrentPage = totalPages;
      if (licensesCurrentPage < 1) licensesCurrentPage = 1;

      var startIndex = (licensesCurrentPage - 1) * licensesPageSize;
      var endIndex = Math.min(startIndex + licensesPageSize, totalItems);
      var pageSlice = filteredLicensesCache.slice(startIndex, endIndex);

      // Update Pagination Text
      var pagText = document.getElementById('licensesPaginationText');
      if (pagText) {
        pagText.textContent = totalItems === 0 
          ? 'لا توجد تراخيص تطابق البحث' 
          : 'عرض ' + (startIndex + 1) + ' إلى ' + endIndex + ' من أصل ' + totalItems + ' ترخيص';
      }

      renderPaginationControls('licensesPaginationControls', licensesCurrentPage, totalPages, function(page) {
        licensesCurrentPage = page;
        renderLicensesTable();
      });

      if (pageSlice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400 font-bold text-xs">لا توجد تراخيص مطابقة للفلتر المحدد</td></tr>';
        return;
      }

      var now = new Date();
      pageSlice.forEach(function(lic, idx) {
        var tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        var rowNumber = startIndex + idx + 1;
        var isExp = lic.expires_at && new Date(lic.expires_at) < now;

        // Remaining Days calculation
        var expHtml = '<span class="text-emerald-700 font-bold">دائم مدى الحياة</span>';
        if (lic.expires_at) {
          var expDate = new Date(lic.expires_at);
          var diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          var dateStr = expDate.toISOString().split('T')[0];
          if (diffDays <= 0) {
            expHtml = '<span class="text-rose-600 font-bold">' + dateStr + ' (منتهي)</span>';
          } else {
            expHtml = '<span>' + dateStr + ' <small class="text-emerald-700 font-bold">(متبقي ' + diffDays + ' يوم)</small></span>';
          }
        }

        // Status Pill
        var statusHtml = '<span class="pill pill-pending">في الانتظار</span>';
        if (lic.status === 'disabled') {
          statusHtml = '<span class="pill pill-disabled">معطل</span>';
        } else if (isExp) {
          statusHtml = '<span class="pill pill-disabled">منتهي</span>';
        } else if (lic.status === 'active') {
          statusHtml = '<span class="pill pill-active"><span class="pulse-dot"></span>نشط ومفعل</span>';
        }

        // Plan Pill
        var typeClasses = {
          lifetime: 'pill-lifetime',
          annual: 'pill-annual',
          monthly: 'pill-monthly',
          trial: 'pill-trial'
        };
        var typeLabels = {
          lifetime: 'دائم',
          annual: 'سنوي',
          monthly: 'شهري',
          trial: 'تجريبي'
        };
        var planPill = '<span class="pill ' + (typeClasses[lic.license_type] || 'pill-trial') + '">' + (typeLabels[lic.license_type] || lic.license_type) + '</span>';

        // HWID display
        var hwidHtml = lic.machine_fingerprint
          ? '<span class="font-mono text-xs sm:text-sm text-slate-800 font-bold cursor-pointer hover:text-emerald-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" data-id="' + escapeHtml(lic.id) + '" onclick="openDeviceModal(this.dataset.id)">...' + escapeHtml(lic.machine_fingerprint.slice(-14)) + '</span>'
          : '<span class="text-slate-400 text-xs font-semibold">بانتظار التفعيل</span>';

        tr.innerHTML = [
          '<td class="px-4 py-4 text-center font-mono text-slate-500 font-bold text-xs sm:text-sm">' + rowNumber + '</td>',
          '<td class="px-4 py-4">',
          '  <div class="flex items-center gap-2 font-mono font-black text-slate-900 text-sm sm:text-base">',
          '    <span>' + escapeHtml(lic.license_key) + '</span>',
          '    <button data-key="' + escapeHtml(lic.license_key) + '" onclick="copyKey(this.dataset.key, this)" class="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition" title="نسخ الكود">',
          '      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
          '    </button>',
          '  </div>',
          '</td>',
          '<td class="px-4 py-4 font-black text-slate-900 text-sm sm:text-base">' + escapeHtml(lic.shop_name) + '</td>',
          '<td class="px-4 py-4 font-mono font-bold text-slate-700 text-xs sm:text-sm">' + (lic.owner_phone ? escapeHtml(lic.owner_phone) : '<span class="text-slate-400">-</span>') + '</td>',
          '<td class="px-4 py-4">' + planPill + '</td>',
          '<td class="px-4 py-4 font-mono font-bold text-xs sm:text-sm">' + expHtml + '</td>',
          '<td class="px-4 py-4 text-center">' + statusHtml + '</td>',
          '<td class="px-4 py-4 font-mono">' + hwidHtml + '</td>',
          '<td class="px-4 py-4 text-center">',
          '  <button type="button" data-id="' + escapeHtml(lic.id) + '" onclick="toggleActionMenu(this.dataset.id, this, event)" class="action-menu-btn inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-black text-xs sm:text-sm shadow-xs transition cursor-pointer mx-auto">',
          '    <span>الإجراءات</span>',
          '    <svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>',
          '  </button>',
          '</td>'
        ].join('');

        tbody.appendChild(tr);
      });
    }

    // B. Render Modern Responsive Cards View (Mobile & Split-Screen Perfect)
    function renderLicensesCards() {
      var container = document.getElementById('licensesCardsContainer');
      if (!container) return;
      container.innerHTML = '';

      var totalItems = filteredLicensesCache.length;
      var totalPages = Math.ceil(totalItems / licensesPageSize) || 1;
      if (licensesCurrentPage > totalPages) licensesCurrentPage = totalPages;
      if (licensesCurrentPage < 1) licensesCurrentPage = 1;

      var startIndex = (licensesCurrentPage - 1) * licensesPageSize;
      var endIndex = Math.min(startIndex + licensesPageSize, totalItems);
      var pageSlice = filteredLicensesCache.slice(startIndex, endIndex);

      // Update Pagination Text
      var pagText = document.getElementById('licensesPaginationText');
      if (pagText) {
        pagText.textContent = totalItems === 0 
          ? 'لا توجد تراخيص تطابق البحث' 
          : 'عرض ' + (startIndex + 1) + ' إلى ' + endIndex + ' من أصل ' + totalItems + ' ترخيص';
      }

      renderPaginationControls('licensesPaginationControls', licensesCurrentPage, totalPages, function(page) {
        licensesCurrentPage = page;
        renderLicensesCards();
      });

      if (pageSlice.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400 font-bold text-xs bg-white rounded-2xl border border-slate-200">لا توجد تراخيص مطابقة للفلتر المحدد</div>';
        return;
      }

      var now = new Date();
      pageSlice.forEach(function(lic) {
        var card = document.createElement('div');
        card.className = 'bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs hover:shadow-md transition-all space-y-4';

        var isExp = lic.expires_at && new Date(lic.expires_at) < now;

        // Plan & Status Pills
        var typeLabels = { lifetime: 'دائم', annual: 'سنوي', monthly: 'شهري', trial: 'تجريبي' };
        var typeClasses = { lifetime: 'pill-lifetime', annual: 'pill-annual', monthly: 'pill-monthly', trial: 'pill-trial' };
        var planPill = '<span class="pill ' + (typeClasses[lic.license_type] || 'pill-trial') + '">' + (typeLabels[lic.license_type] || lic.license_type) + '</span>';

        var statusHtml = '<span class="pill pill-pending">في الانتظار</span>';
        if (lic.status === 'disabled') {
          statusHtml = '<span class="pill pill-disabled">معطل</span>';
        } else if (isExp) {
          statusHtml = '<span class="pill pill-disabled">منتهي</span>';
        } else if (lic.status === 'active') {
          statusHtml = '<span class="pill pill-active"><span class="pulse-dot"></span>نشط ومفعل</span>';
        }

        // Validity text
        var validityText = 'صلاحية مفتوحة (دائم)';
        if (lic.expires_at) {
          var expDate = new Date(lic.expires_at);
          var diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          validityText = diffDays <= 0 ? 'منتهي الصلاحية' : 'متبقي ' + diffDays + ' يوم (' + expDate.toISOString().split('T')[0] + ')';
        }

        card.innerHTML = [
          '<div class="flex items-start justify-between pb-3 border-b border-slate-100 gap-3">',
          '  <div>',
          '    <h4 class="font-black text-slate-900 text-base sm:text-lg leading-snug">' + escapeHtml(lic.shop_name) + '</h4>',
          '    <div class="text-xs text-slate-500 font-bold mt-1">' + (lic.notes ? escapeHtml(lic.notes) : 'منشأة تجارية') + '</div>',
          '  </div>',
          '  <div class="flex items-center gap-2 shrink-0">',
          '    ' + planPill,
          '    ' + statusHtml,
          '  </div>',
          '</div>',
          '<div class="space-y-3">',
          '  <div class="flex items-center justify-between bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">',
          '    <span class="text-slate-600 font-black text-xs sm:text-sm">رمز الترخيص:</span>',
          '    <div class="flex items-center gap-2 font-mono font-black text-slate-900 text-sm sm:text-base tracking-wide">',
          '      <span>' + escapeHtml(lic.license_key) + '</span>',
          '      <button data-key="' + escapeHtml(lic.license_key) + '" onclick="copyKey(this.dataset.key, this)" class="p-1.5 rounded-lg bg-white hover:bg-slate-200 text-slate-600 shadow-xs border border-slate-200/80 transition cursor-pointer" title="نسخ الكود">',
          '        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
          '      </button>',
          '    </div>',
          '  </div>',
          '  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">',
          '    <div class="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70">',
          '      <span class="text-slate-500 block text-xs font-bold mb-1">رقم الهاتف:</span>',
          '      <strong class="font-mono text-slate-900 text-xs sm:text-sm font-black block">' + (lic.owner_phone ? escapeHtml(lic.owner_phone) : '-') + '</strong>',
          '    </div>',
          '    <div class="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70">',
          '      <span class="text-slate-500 block text-xs font-bold mb-1">بصمة الجهاز (HWID):</span>',
          '      <strong class="font-mono text-slate-900 text-xs sm:text-sm font-black truncate block" title="' + (lic.machine_fingerprint ? escapeHtml(lic.machine_fingerprint) : '') + '">' + (lic.machine_fingerprint ? '...' + escapeHtml(lic.machine_fingerprint.slice(-14)) : 'بانتظار التفعيل') + '</strong>',
          '    </div>',
          '  </div>',
          '  <div class="flex items-center justify-between text-xs sm:text-sm bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">',
          '    <span class="text-slate-600 font-bold">فترة الصلاحية:</span>',
          '    <span class="font-black ' + (isExp ? 'text-rose-600' : 'text-emerald-700') + '">' + validityText + '</span>',
          '  </div>',
          '</div>',
          '<div class="flex items-center justify-between pt-3 border-t border-slate-100 gap-3">',
          '  <button type="button" data-id="' + escapeHtml(lic.id) + '" onclick="openShareModal(this.dataset.id)" class="flex-1 py-2.5 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 border border-emerald-200/70 shadow-xs cursor-pointer active:scale-95">',
          '    <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
          '    <span>مشاركة سريعة</span>',
          '  </button>',
          '  <button type="button" data-id="' + escapeHtml(lic.id) + '" onclick="toggleActionMenu(this.dataset.id, this, event)" class="action-menu-btn px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95">',
          '    <span>إجراءات</span>',
          '    <svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>',
          '  </button>',
          '</div>'
        ].join('');

        container.appendChild(card);
      });
    }

    // Pagination Controls Helper
    function renderPaginationControls(containerId, currentPage, totalPages, onPageClick) {
      var container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';

      if (totalPages <= 1) return;

      var prevBtn = document.createElement('button');
      prevBtn.className = 'px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-600 disabled:opacity-40 text-xs';
      prevBtn.textContent = 'السابق';
      prevBtn.disabled = currentPage <= 1;
      prevBtn.onclick = function() { onPageClick(currentPage - 1); };
      container.appendChild(prevBtn);

      var maxButtons = 5;
      var startPage = Math.max(1, currentPage - 2);
      var endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      for (var i = startPage; i <= endPage; i++) {
        (function(pageIdx) {
          var pBtn = document.createElement('button');
          pBtn.className = pageIdx === currentPage 
            ? 'px-3 py-1.5 rounded-xl bg-[#00372d] text-white font-bold text-xs shadow-xs'
            : 'px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-600 text-xs';
          pBtn.textContent = pageIdx;
          pBtn.onclick = function() { onPageClick(pageIdx); };
          container.appendChild(pBtn);
        })(i);
      }

      var nextBtn = document.createElement('button');
      nextBtn.className = 'px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-600 disabled:opacity-40 text-xs';
      nextBtn.textContent = 'التالي';
      nextBtn.disabled = currentPage >= totalPages;
      nextBtn.onclick = function() { onPageClick(currentPage + 1); };
      container.appendChild(nextBtn);
    }

    // ==========================================
    // ACTION HANDLERS: CREATE, EDIT, RESET, REVOKE, DELETE
    // ==========================================
    function switchLicenseCreateMode(mode) {
      var isOffline = mode === 'offline';
      var modeInput = document.getElementById('newLicMode');
      if (modeInput) modeInput.value = isOffline ? 'offline' : 'online';

      var btnOnline = document.getElementById('btnToggleLicOnline');
      var btnOffline = document.getElementById('btnToggleLicOffline');
      var hwidWrapper = document.getElementById('newLicHwidWrapper');
      var hwidInput = document.getElementById('newLicHwidInput');
      var phoneWrapper = document.getElementById('newLicPhoneWrapper');
      var submitText = document.getElementById('btnSubmitNewLicenseText');
      var headerTitle = document.getElementById('unifiedModalHeaderTitle');

      if (isOffline) {
        if (btnOffline) {
          btnOffline.className = 'py-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 bg-white text-amber-900 shadow-xs cursor-pointer';
        }
        if (btnOnline) {
          btnOnline.className = 'py-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer bg-transparent shadow-none';
        }
        if (hwidWrapper) hwidWrapper.style.display = 'block';
        if (hwidInput) hwidInput.required = true;
        if (phoneWrapper) phoneWrapper.style.display = 'none';
        if (submitText) submitText.textContent = 'توليد كود التفعيل الأوفلاين المشفر';
        if (headerTitle) headerTitle.textContent = 'توليد ترخيص أوفلاين بالبصمة (RSA)';
      } else {
        if (btnOnline) {
          btnOnline.className = 'py-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 bg-white text-[#00372d] shadow-xs cursor-pointer';
        }
        if (btnOffline) {
          btnOffline.className = 'py-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer bg-transparent shadow-none';
        }
        if (hwidWrapper) hwidWrapper.style.display = 'none';
        if (hwidInput) hwidInput.required = false;
        if (phoneWrapper) phoneWrapper.style.display = 'block';
        if (submitText) submitText.textContent = 'إصدار وحفظ الترخيص السحابي';
        if (headerTitle) headerTitle.textContent = 'إصدار ترخيص تجاري جديد';
      }
    }

    function openUnifiedLicenseModal(type) {
      // 1. Reset all form inputs to prevent stale data
      var shop = document.getElementById('shopName');
      if (shop) shop.value = '';
      var phone = document.getElementById('ownerPhone');
      if (phone) phone.value = '';
      var hwid = document.getElementById('newLicHwidInput');
      if (hwid) hwid.value = '';
      var notes = document.getElementById('notesInput');
      if (notes) notes.value = '';
      var customDays = document.getElementById('customDaysInput');
      if (customDays) customDays.value = '';

      // 2. Hide result box and custom days
      var resBox = document.getElementById('newLicResultBox');
      if (resBox) resBox.style.display = 'none';
      var customWrapper = document.getElementById('customDaysWrapper');
      if (customWrapper) customWrapper.style.display = 'none';

      // 3. Reset select to lifetime
      setCustomSelectValue('durationSelect', 'lifetime');

      // 4. Set requested mode
      switchLicenseCreateMode(type === 'offline' ? 'offline' : 'online');

      openModal('unifiedLicenseModal');
    }

    function toggleCustomDays() {
      var val = document.getElementById('durationSelect').value;
      var w = document.getElementById('customDaysWrapper');
      if (w) w.style.display = val === 'custom' ? 'block' : 'none';
    }

    async function handleCreateLicense(e) {
      e.preventDefault();
      var mode = (document.getElementById('newLicMode') ? document.getElementById('newLicMode').value : 'online') || 'online';
      var shopEl = document.getElementById('shopName');
      var shop = (shopEl ? shopEl.value : '').trim();
      var dur = document.getElementById('durationSelect').value;
      var notes = document.getElementById('notesInput').value.trim();
      var btn = document.getElementById('btnSubmitNewLicense');

      if (!shop) {
        markInputInvalid(shopEl, 'يرجى إدخال اسم المنشأة أو المحل التجاري');
        return;
      }

      var days = 0;
      var licType = 'lifetime';
      if (dur === 'custom') {
        days = parseInt(document.getElementById('customDaysInput').value) || 0;
        licType = 'custom';
      } else if (dur !== 'lifetime') {
        days = parseInt(dur) || 0;
        licType = dur === '365' ? 'annual' : (dur === '30' ? 'monthly' : 'trial');
      }

      if (btn) btn.disabled = true;

      if (mode === 'offline') {
        var hwidEl = document.getElementById('newLicHwidInput');
        var hwid = (hwidEl ? hwidEl.value : '').trim();
        if (!hwid) {
          markInputInvalid(hwidEl, 'يرجى إدخال بصمة جهاز العميل (HWID)');
          if (btn) btn.disabled = false;
          return;
        }

        if (btn) btn.textContent = 'جاري التوليد والتشفير...';
        try {
          var res = await fetch('/api/admin/generate-support-code', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Secret': getSecret()
            },
            body: JSON.stringify({
              device_fingerprint: hwid,
              shop_name: shop,
              license_type: licType,
              days: days || 9999
            })
          });

          var data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.message || 'فشل توليد كود التفعيل الأوفلاين', true);
            return;
          }

          var resBox = document.getElementById('newLicResultBox');
          var resCode = document.getElementById('newLicResultCode');
          var resTitle = document.getElementById('newLicResultTitle');
          if (resCode) resCode.value = data.support_code || data.code;
          if (resTitle) resTitle.textContent = 'تم توليد كود التفعيل الأوفلاين المشفر بنجاح!';
          if (resBox) resBox.style.display = 'block';

          showToast('تم توليد كود التفعيل الأوفلاين بنجاح!');
          loadLicenses();
        } catch (err) {
          showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'توليد كود التفعيل الأوفلاين المشفر';
          }
        }
      } else {
        // Online Cloud License
        var phone = document.getElementById('ownerPhone').value.trim();
        if (btn) btn.textContent = 'جاري الإصدار...';

        try {
          var res = await fetch('/api/admin/licenses', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Secret': getSecret()
            },
            body: JSON.stringify({
              shop_name: shop,
              owner_phone: phone,
              days_valid: days,
              notes: notes
            })
          });

          var data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.message || 'فشل إصدار الترخيص', true);
            return;
          }

          var resBox = document.getElementById('newLicResultBox');
          var resCode = document.getElementById('newLicResultCode');
          var resTitle = document.getElementById('newLicResultTitle');
          if (resCode && data.license) resCode.value = data.license.license_key;
          if (resTitle) resTitle.textContent = 'تم إصدار وحفظ الترخيص السحابي بنجاح!';
          if (resBox) resBox.style.display = 'block';

          showToast('تم إصدار رمز الترخيص السحابي بنجاح!');
          loadLicenses();
        } catch (err) {
          showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'إصدار وحفظ الترخيص السحابي';
          }
        }
      }
    }

    function openEditModal(id) {
      var lic = allLicenses.find(function(l) { return l.id === id; });
      if (!lic) return;
      document.getElementById('editLicenseId').value = lic.id;
      document.getElementById('editShopName').value = lic.shop_name || '';
      document.getElementById('editOwnerPhone').value = lic.owner_phone || '';
      document.getElementById('editNotes').value = lic.notes || '';
      setCustomSelectValue('editExtendAction', 'none');
      toggleEditCustomDays();
      openModal('editModal');
    }

    function toggleEditCustomDays() {
      var val = document.getElementById('editExtendAction').value;
      var w = document.getElementById('editCustomDaysWrapper');
      var lbl = document.getElementById('editCustomDaysLabel');
      var hint = document.getElementById('editCustomDaysHint');
      var inp = document.getElementById('editCustomDaysInput');

      if (val === 'set_exact') {
        if (w) w.style.display = 'block';
        if (lbl) lbl.textContent = 'إعادة تعيين الفترة (عدد الأيام الجديدة ابتداءً من اليوم):';
        if (inp) {
          inp.min = '0';
          inp.placeholder = 'مثال: 30 أو 90 أو 365 (0 = منتهي)';
        }
        if (hint) hint.textContent = 'سيتم إلغاء أي رصيد وقت سابق وتطبيق هذا الرقم مباشرة ابتداءً من اليوم.';
      } else if (val === 'custom' || val === 'add_custom') {
        if (w) w.style.display = 'block';
        if (lbl) lbl.textContent = 'عدد الأيام المراد إضافتها على الرصيد الحالي (+):';
        if (inp) {
          inp.min = '1';
          inp.placeholder = 'مثال: 30';
        }
        if (hint) hint.textContent = 'ستتم إضافة هذه الأيام فوق فترة الترخيص الحالية للمتجر.';
      } else {
        if (w) w.style.display = 'none';
        if (inp) inp.value = '';
        if (hint) hint.textContent = '';
      }
    }

    async function handleEditLicense(e) {
      e.preventDefault();
      var id = document.getElementById('editLicenseId').value;
      var shopEl = document.getElementById('editShopName');
      var shop = (shopEl ? shopEl.value : '').trim();
      var phone = document.getElementById('editOwnerPhone').value.trim();
      var action = document.getElementById('editExtendAction').value;
      var notes = document.getElementById('editNotes').value.trim();

      if (!shop) {
        markInputInvalid(shopEl, 'يرجى إدخال اسم المنشأة');
        return;
      }

      var payload = {
        shop_name: shop,
        owner_phone: phone,
        notes: notes
      };

      if (action === 'set_lifetime') {
        payload.set_lifetime = true;
      } else if (action === 'set_expire_now') {
        payload.set_days = 0;
      } else if (action === 'set_exact') {
        var exactDays = parseInt(document.getElementById('editCustomDaysInput').value);
        if (isNaN(exactDays) || exactDays < 0) {
          showToast('يرجى إدخال عدد أيام صحيح (0 فأكثر)', true);
          return;
        }
        payload.set_days = exactDays;
      } else if (action && action.startsWith('add_') && action !== 'add_custom') {
        payload.days_to_add = parseInt(action.replace('add_', '')) || 0;
      } else if (action === 'custom' || action === 'add_custom') {
        var daysToAdd = parseInt(document.getElementById('editCustomDaysInput').value) || 0;
        if (daysToAdd <= 0) {
          showToast('يرجى إدخال عدد أيام تمديد صحيح (1 فأكثر)', true);
          return;
        }
        payload.days_to_add = daysToAdd;
      }

      try {
        var res = await fetch('/api/admin/licenses/' + id + '/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': getSecret()
          },
          body: JSON.stringify(payload)
        });

        var data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'فشل حفظ التعديلات', true);
          return;
        }

        closeModal('editModal');
        showToast('تم تحديث بيانات وصلاحية الترخيص بنجاح!');
        loadLicenses();
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      }
    }

    function openDeviceModal(id) {
      var lic = allLicenses.find(function(l) { return l.id === id; });
      if (!lic) return;
      document.getElementById('devModalShopName').textContent = lic.shop_name;
      document.getElementById('devModalLicKey').textContent = lic.license_key;
      document.getElementById('devModalFp').textContent = lic.machine_fingerprint || 'لم يتم ربط أي جهاز بعد';
      document.getElementById('devModalUnbindBtn').onclick = function() {
        closeModal('deviceModal');
        resetDevice(lic.id, lic.shop_name);
      };
      openModal('deviceModal');
    }

    function resetDevice(id, name) {
      showConfirm(
        'فك ربط الجهاز',
        'هل تريد بالتأكيد فك ربط جهاز (' + name + ')؟ سيمكن تفعيل الترخيص على جهاز كمبيوتر جديد.',
        async function() {
          try {
            var res = await fetch('/api/admin/licenses/' + id + '/reset-device', {
              method: 'POST',
              headers: { 'X-Admin-Secret': getSecret() }
            });
            var data = await res.json();
            if (data.success) {
              showToast('تم فك ربط الجهاز بنجاح. الترخيص متاح للتفعيل الآن.');
              loadLicenses();
            } else {
              showToast(data.message || 'فشل فك ربط الجهاز', true);
            }
          } catch (err) {
            showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
          }
        }
      );
    }

    function toggleStatus(id, name, action) {
      var isRevoke = action === 'revoke';
      showConfirm(
        isRevoke ? 'إيقاف الترخيص' : 'إعادة تفعيل الترخيص',
        'هل تريد ' + (isRevoke ? 'إيقاف وتعطيل' : 'إعادة تفعيل') + ' ترخيص (' + name + ')؟',
        async function() {
          try {
            var res = await fetch('/api/admin/licenses/' + id + '/' + action, {
              method: 'POST',
              headers: { 'X-Admin-Secret': getSecret() }
            });
            var data = await res.json();
            if (data.success) {
              showToast('تم ' + (isRevoke ? 'إيقاف' : 'تفعيل') + ' الترخيص بنجاح!');
              loadLicenses();
            } else {
              showToast(data.message || 'فشلت العملية', true);
            }
          } catch (err) {
            showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
          }
        }
      );
    }

    function deleteLicense(id, name) {
      showConfirm(
        'حذف الترخيص',
        'تحذير حرج: هل تريد بالتأكيد حذف ترخيص (' + name + ') نهائياً من قاعدة البيانات السحابية؟ لا يمكن التراجع عن هذا الإجراء.',
        async function() {
          try {
            var res = await fetch('/api/admin/licenses/' + id + '/delete', {
              method: 'POST',
              headers: { 'X-Admin-Secret': getSecret() }
            });
            var data = await res.json();
            if (data.success) {
              showToast('تم حذف الترخيص بنجاح.');
              loadLicenses();
            } else {
              showToast(data.message || 'فشل حذف الترخيص', true);
            }
          } catch (err) {
            showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
          }
        }
      );
    }

    // ==========================================
    // SHARE & WHATSAPP
    // ==========================================
    function openShareModal(id) {
      var lic = allLicenses.find(function(l) { return l.id === id; });
      if (!lic) return;
      currentShareData = lic;

      var NL = String.fromCharCode(10);
      var text = [
        'مرحباً ' + lic.shop_name + '،',
        'شكراً لاختياركم نظام رفيق POS لإدارة المتاجر ونقاط البيع.',
        '',
        'تفاصيل الترخيص الخاص بكم:',
        '• اسم المنشأة: ' + lic.shop_name,
        '• رمز الترخيص (Key): ' + lic.license_key,
        '• نوع الخطة: ' + (lic.license_type === 'lifetime' ? 'دائم مدى الحياة' : lic.license_type),
        '',
        'للتفعيل: افتح برنامج رفيق POS على جهاز الكاشير، وأدخل رمز الترخيص عند المطالبة.',
        'فريق الدعم الفني: 01012345678'
      ].join(NL);

      document.getElementById('shareTextarea').value = text;
      openModal('shareModal');
    }

    function copyShareText() {
      var val = document.getElementById('shareTextarea').value;
      navigator.clipboard.writeText(val).then(function() {
        showToast('تم نسخ رسالة الترخيص للحافظة!');
      });
    }

    function openWhatsAppChat() {
      if (!currentShareData) return;
      var text = document.getElementById('shareTextarea').value;
      var phone = (currentShareData.owner_phone || '').replace(/[^0-9]/g, '');
      var fullPhone = phone;
      if (phone.indexOf('01') === 0) fullPhone = '20' + phone.slice(1);
      var url = 'https://wa.me/' + fullPhone + '?text=' + encodeURIComponent(text);
      window.open(url, '_blank');
    }

    function copyKey(key, btn) {
      navigator.clipboard.writeText(key).then(function() {
        showToast('تم نسخ الكود: ' + key);
        if (btn) {
          var orig = btn.innerHTML;
          btn.innerHTML = '<svg class="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(function() { btn.innerHTML = orig; }, 1500);
        }
      });
    }

    // ==========================================
    // LOGS API & RENDERING
    // ==========================================
    async function loadLogs() {
      if (!checkAuth()) return;
      try {
        var res = await fetch('/api/admin/logs?_t=' + Date.now(), {
          headers: {
            'X-Admin-Secret': getSecret(),
            'Cache-Control': 'no-cache, no-store'
          }
        });
        var data = await res.json();
        if (data.success) {
          allLogs = data.data || [];
          var b = document.getElementById('badgeLogsCount');
          if (b) b.textContent = allLogs.length;
          applyLogsFilter();
        }
      } catch (err) {
        showToast('فشل جلب سجلات التدقيق', true);
      }
    }

    function handleLogsSearch(val) {
      logsSearchQuery = (val || '').trim().toLowerCase();
      logsCurrentPage = 1;
      applyLogsFilter();
    }

    function applyLogsFilter() {
      filteredLogsCache = allLogs.filter(function(log) {
        if (logsSearchQuery) {
          var matchKey = (log.license_key || '').toLowerCase().indexOf(logsSearchQuery) !== -1;
          var matchIp = (log.ip_address || '').toLowerCase().indexOf(logsSearchQuery) !== -1;
          var matchAct = (log.action || '').toLowerCase().indexOf(logsSearchQuery) !== -1;
          if (!matchKey && !matchIp && !matchAct) return false;
        }
        return true;
      });
      renderLogsTable();
    }

    function renderLogsTable() {
      var tbody = document.getElementById('logsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      var totalItems = filteredLogsCache.length;
      var totalPages = Math.ceil(totalItems / logsPageSize) || 1;
      if (logsCurrentPage > totalPages) logsCurrentPage = totalPages;
      if (logsCurrentPage < 1) logsCurrentPage = 1;

      var startIndex = (logsCurrentPage - 1) * logsPageSize;
      var endIndex = Math.min(startIndex + logsPageSize, totalItems);
      var pageSlice = filteredLogsCache.slice(startIndex, endIndex);

      var pagText = document.getElementById('logsPaginationText');
      if (pagText) {
        pagText.textContent = totalItems === 0 ? 'لا توجد حركات' : 'عرض ' + (startIndex + 1) + ' إلى ' + endIndex + ' من أصل ' + totalItems + ' حركة';
      }

      renderPaginationControls('logsPaginationControls', logsCurrentPage, totalPages, function(page) {
        logsCurrentPage = page;
        renderLogsTable();
      });

      if (pageSlice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400 font-bold text-xs">لا توجد سجلات تدقيق مطابقة</td></tr>';
        return;
      }

      pageSlice.forEach(function(log, idx) {
        var tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        var isSuccess = log.status === 'success';

        tr.innerHTML = [
          '<td class="px-4 py-3 text-center font-mono text-slate-400">' + (startIndex + idx + 1) + '</td>',
          '<td class="px-4 py-3 font-mono text-slate-500">' + escapeHtml(log.created_at) + '</td>',
          '<td class="px-4 py-3 font-bold ' + (isSuccess ? 'text-slate-800' : 'text-rose-700') + '">' + escapeHtml(log.action) + '</td>',
          '<td class="px-4 py-3 font-mono font-bold text-slate-900">' + (log.license_key ? escapeHtml(log.license_key) : '-') + '</td>',
          '<td class="px-4 py-3 font-mono text-slate-600">' + (log.ip_address ? escapeHtml(log.ip_address) : '-') + '</td>',
          '<td class="px-4 py-3 font-mono text-slate-500 text-[11px]">' + (log.machine_fingerprint ? '...' + escapeHtml(log.machine_fingerprint.slice(-10)) : '-') + '</td>',
          '<td class="px-4 py-3 text-center">',
          '  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ' + (isSuccess ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200') + '">' + escapeHtml(log.status) + '</span>',
          '</td>'
        ].join('');

        tbody.appendChild(tr);
      });
    }

    // ==========================================
    // ALL-IN-ONE OFFLINE RESCUE & SUPPORT MODAL
    // ==========================================
    function openRescueModal(licId, defaultTab) {
      currentRescueLicId = licId || null;

      // 1. Reset all result boxes
      var resBoxes = ['offlineResultBox', 'rootSessionResultBox', 'pinRecoveryResultBox', 'clockResetResultBox'];
      resBoxes.forEach(function(bId) {
        var el = document.getElementById(bId);
        if (el) el.style.setProperty('display', 'none', 'important');
      });

      // 2. Clear output token values
      var outTokens = ['offlineResultCode', 'rootSessionResultToken', 'pinRecoveryResultToken', 'clockResetResultToken'];
      outTokens.forEach(function(tId) {
        var el = document.getElementById(tId);
        if (el) el.value = '';
      });

      // 3. Clear challenge inputs
      var chInput = document.getElementById('rootChallengeInput');
      if (chInput) chInput.value = '';

      // 4. Populate license context or general fallback
      var banner = document.getElementById('rescueLicenseBanner');
      var shopDisplay = document.getElementById('rescueShopNameDisplay');
      var licKeyDisplay = document.getElementById('rescueLicenseKeyDisplay');
      var hwidDisplay = document.getElementById('rescueHwidDisplay');
      var unboundAlert = document.getElementById('rescueUnboundAlert');

      var lic = licId ? allLicenses.find(function(l) { return l.id === licId; }) : null;

      if (lic) {
        if (banner) banner.style.setProperty('display', 'flex', 'important');
        if (shopDisplay) shopDisplay.textContent = lic.shop_name || 'بدون اسم';
        if (licKeyDisplay) licKeyDisplay.textContent = lic.license_key || '—';

        var hwid = (lic.machine_fingerprint || '').trim();

        if (hwid) {
          if (hwidDisplay) hwidDisplay.textContent = hwid;
          if (unboundAlert) unboundAlert.style.setProperty('display', 'none', 'important');

          // Tool 1: SEC-01 Developer Root Session
          var rootBound = document.getElementById('rootBoundFpBox');
          var rootBoundDisp = document.getElementById('rootBoundFpDisplay');
          var rootUnbound = document.getElementById('rootUnboundFpBox');
          if (rootBound) rootBound.style.setProperty('display', 'flex', 'important');
          if (rootBoundDisp) rootBoundDisp.textContent = hwid;
          if (rootUnbound) rootUnbound.style.setProperty('display', 'none', 'important');

          // Tool 2: SEC-02 PIN Recovery
          var pinNotice = document.getElementById('pinBoundNotice');
          var pinBoundDisp = document.getElementById('pinBoundFpDisplay');
          var pinUnbound = document.getElementById('pinUnboundInputBox');
          if (pinNotice) pinNotice.style.setProperty('display', 'block', 'important');
          if (pinBoundDisp) pinBoundDisp.textContent = hwid;
          if (pinUnbound) pinUnbound.style.setProperty('display', 'none', 'important');

          // Tool 3: BUG-06 Clock Reset
          var clockNotice = document.getElementById('clockBoundNotice');
          var clockBoundDisp = document.getElementById('clockBoundFpDisplay');
          var clockUnbound = document.getElementById('clockUnboundInputBox');
          if (clockNotice) clockNotice.style.setProperty('display', 'block', 'important');
          if (clockBoundDisp) clockBoundDisp.textContent = hwid;
          if (clockUnbound) clockUnbound.style.setProperty('display', 'none', 'important');

          // Expandable Offline RSA Generator
          var offlineFpInput = document.getElementById('offlineDeviceFp');
          if (offlineFpInput) offlineFpInput.value = hwid;
          var offlineShopInput = document.getElementById('offlineShopName');
          if (offlineShopInput) offlineShopInput.value = lic.shop_name || '';
        } else {
          // License is pending / unbound
          if (hwidDisplay) hwidDisplay.textContent = 'بانتظار التفعيل (غير مربوط بجهاز)';
          if (unboundAlert) unboundAlert.style.setProperty('display', 'flex', 'important');

          var rootBound = document.getElementById('rootBoundFpBox');
          var rootUnbound = document.getElementById('rootUnboundFpBox');
          if (rootBound) rootBound.style.setProperty('display', 'none', 'important');
          if (rootUnbound) rootUnbound.style.setProperty('display', 'block', 'important');

          var pinNotice = document.getElementById('pinBoundNotice');
          var pinUnbound = document.getElementById('pinUnboundInputBox');
          if (pinNotice) pinNotice.style.setProperty('display', 'none', 'important');
          if (pinUnbound) pinUnbound.style.setProperty('display', 'block', 'important');

          var clockNotice = document.getElementById('clockBoundNotice');
          var clockUnbound = document.getElementById('clockUnboundInputBox');
          if (clockNotice) clockNotice.style.setProperty('display', 'none', 'important');
          if (clockUnbound) clockUnbound.style.setProperty('display', 'block', 'important');

          var offlineFpInput = document.getElementById('offlineDeviceFp');
          if (offlineFpInput) offlineFpInput.value = '';
          var offlineShopInput = document.getElementById('offlineShopName');
          if (offlineShopInput) offlineShopInput.value = lic.shop_name || '';
        }
      } else {
        // No specific license selected (general rescue portal)
        if (banner) banner.style.setProperty('display', 'none', 'important');
        if (unboundAlert) unboundAlert.style.setProperty('display', 'none', 'important');

        var rootBound = document.getElementById('rootBoundFpBox');
        var rootUnbound = document.getElementById('rootUnboundFpBox');
        if (rootBound) rootBound.style.setProperty('display', 'none', 'important');
        if (rootUnbound) rootUnbound.style.setProperty('display', 'block', 'important');

        var pinNotice = document.getElementById('pinBoundNotice');
        var pinUnbound = document.getElementById('pinUnboundInputBox');
        if (pinNotice) pinNotice.style.setProperty('display', 'none', 'important');
        if (pinUnbound) pinUnbound.style.setProperty('display', 'block', 'important');

        var clockNotice = document.getElementById('clockBoundNotice');
        var clockUnbound = document.getElementById('clockUnboundInputBox');
        if (clockNotice) clockNotice.style.setProperty('display', 'none', 'important');
        if (clockUnbound) clockUnbound.style.setProperty('display', 'block', 'important');

        var inputsToClear = ['offlineDeviceFp', 'offlineShopName', 'rootManualFpInput', 'directRecCodeInput', 'clockResetCodeInput', 'rootChallengeInput'];
        inputsToClear.forEach(function(iId) {
          var el = document.getElementById(iId);
          if (el) el.value = '';
        });
      }

      setCustomSelectValue('offlineDurationSelect', 'lifetime');
      toggleOfflineCustomDays();

      switchRescueSubTab(defaultTab || 'root-session');
      openModal('offlineRescueModal');
    }

    function switchRescueSubTab(tabId) {
      var tabs = [
        { id: 'root-session', btn: 'btnRescueTabRootSession', sec: 'rescueSecRootSession' },
        { id: 'pin-recovery', btn: 'btnRescueTabPinRecovery', sec: 'rescueSecPinRecovery' },
        { id: 'clock-reset', btn: 'btnRescueTabClockReset', sec: 'rescueSecClockReset' }
      ];

      tabs.forEach(function(t) {
        var btn = document.getElementById(t.btn);
        var sec = document.getElementById(t.sec);
        if (t.id === tabId) {
          if (sec) sec.style.setProperty('display', 'block', 'important');
          if (btn) {
            btn.classList.add('bg-white', 'shadow-xs');
            btn.classList.remove('border-transparent', 'text-slate-600', 'hover:text-slate-900');
            if (t.id === 'root-session') btn.classList.add('text-purple-900', 'border-purple-200/50');
            else if (t.id === 'pin-recovery') btn.classList.add('text-emerald-900', 'border-emerald-200/50');
            else btn.classList.add('text-blue-900', 'border-blue-200/50');
          }
        } else {
          if (sec) sec.style.setProperty('display', 'none', 'important');
          if (btn) {
            btn.classList.remove('bg-white', 'shadow-xs', 'text-purple-900', 'text-emerald-900', 'text-blue-900', 'border-purple-200/50', 'border-emerald-200/50', 'border-blue-200/50');
            btn.classList.add('text-slate-600', 'hover:text-slate-900', 'border-transparent');
          }
        }
      });
    }

    function toggleOfflineSupportCodeSection() {
      var sec = document.getElementById('rescueSecOfflineCode');
      var chev = document.getElementById('offlineSecChevron');
      if (!sec) return;
      var isHidden = sec.style.display === 'none' || sec.classList.contains('hidden');
      if (isHidden) {
        sec.style.setProperty('display', 'block', 'important');
        sec.classList.remove('hidden');
        if (chev) chev.style.transform = 'rotate(180deg)';
      } else {
        sec.style.setProperty('display', 'none', 'important');
        sec.classList.add('hidden');
        if (chev) chev.style.transform = 'rotate(0deg)';
      }
    }

    function copyFromInput(inputId, label) {
      var input = document.getElementById(inputId);
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value).then(function() {
        showToast('تم نسخ ' + (label || 'الرمز') + ' للحافظة بنجاح!');
      });
    }

    // ==========================================
    // RESCUE & TECH SUPPORT HANDLERS
    // ==========================================
    function toggleOfflineCustomDays() {
      var val = document.getElementById('offlineDurationSelect').value;
      var w = document.getElementById('offlineCustomDaysWrapper');
      if (w) w.style.display = val === 'custom' ? 'block' : 'none';
    }

    async function handleGenerateSupportCode(e) {
      e.preventDefault();
      var fpEl = document.getElementById('offlineDeviceFp');
      var fp = (fpEl ? fpEl.value : '').trim();
      var shop = document.getElementById('offlineShopName').value.trim();
      var durVal = document.getElementById('offlineDurationSelect').value;
      var btn = document.getElementById('btnGenSupport');

      if (!fp) {
        markInputInvalid(fpEl, 'يرجى إدخال بصمة جهاز العميل (HWID)');
        return;
      }

      var licType = 'lifetime';
      var days = 9999;
      if (durVal === 'lifetime') {
        licType = 'lifetime';
        days = 9999;
      } else if (durVal === 'custom') {
        days = parseInt(document.getElementById('offlineCustomDaysInput').value) || 30;
        licType = 'custom';
      } else {
        days = parseInt(durVal) || 30;
        licType = durVal === '365' ? 'annual' : (durVal === '30' ? 'monthly' : 'trial');
      }

      btn.disabled = true;
      btn.textContent = 'جاري التوليد والتشفير...';

      try {
        var res = await fetch('/api/admin/generate-support-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': getSecret()
          },
          body: JSON.stringify({
            device_fingerprint: fp,
            shop_name: shop,
            license_type: licType,
            days: days
          })
        });

        var data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.message || 'فشل توليد كود الدعم', true);
          return;
        }

        document.getElementById('offlineResultCode').value = data.support_code;
        if (data.license_key) {
          var keyDisp = document.getElementById('offlineRegisteredKeyDisplay');
          if (keyDisp) keyDisp.textContent = data.license_key;
        }
        document.getElementById('offlineResultBox').style.setProperty('display', 'block', 'important');
        showToast('تم توليد كود الدعم الفني الأوفلاين بنجاح!');
        loadLicenses();
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'توليد كود الدعم الأوفلاين المشفر';
      }
    }

    function copyOfflineResultCode() {
      var codeInput = document.getElementById('offlineResultCode');
      if (!codeInput || !codeInput.value) return;
      navigator.clipboard.writeText(codeInput.value).then(function() {
        showToast('تم نسخ كود الدعم الفني للحافظة بنجاح!');
      });
    }

    async function handleRootSessionChallenge(e) {
      e.preventDefault();
      var codeEl = document.getElementById('rootChallengeInput');
      var code = (codeEl ? codeEl.value : '').trim();
      var lic = currentRescueLicId ? allLicenses.find(function(l) { return l.id === currentRescueLicId; }) : null;
      var isBound = lic && lic.machine_fingerprint;
      var manualInput = document.getElementById('rootManualFpInput');
      var fp = isBound ? lic.machine_fingerprint : (manualInput ? manualInput.value.trim() : '');

      if (!code) {
        markInputInvalid(codeEl, 'يرجى إدخال كود التحدي الظاهر على شاشة العميل');
        return;
      }
      if (!isBound && !fp) {
        markInputInvalid(manualInput, 'يرجى إدخال بصمة الجهاز (HWID)');
        return;
      }

      var btn = document.getElementById('btnRootSubmit');
      if (btn) btn.disabled = true;
      showToast('جاري توليد رمز جلسة المطور...');

      try {
        var payload = { challenge_code: code };
        if (currentRescueLicId) payload.license_id = currentRescueLicId;
        if (fp) payload.manual_fingerprint = fp;

        var res = await fetch('/api/admin/root-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': getSecret()
          },
          body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (data.success && (data.root_token || data.token || data.session_token)) {
          var tok = data.root_token || data.token || data.session_token;
          var out = document.getElementById('rootSessionResultToken');
          var box = document.getElementById('rootSessionResultBox');
          if (out) out.value = tok;
          if (box) box.style.setProperty('display', 'block', 'important');
          showToast('تم توليد رمز جلسة المطور بنجاح!');
        } else {
          showToast(data.message || 'فشل حساب رمز الاستجابة', true);
        }
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function handleDirectPinRecovery(e) {
      if (e && e.preventDefault) e.preventDefault();
      var lic = currentRescueLicId ? allLicenses.find(function(l) { return l.id === currentRescueLicId; }) : null;
      var isBound = lic && lic.machine_fingerprint;
      var btn = document.getElementById('btnPinRecoverySubmit');
      if (btn) btn.disabled = true;
      showToast('جاري توليد كود استعادة PIN...');

      try {
        var res, data;
        if (isBound) {
          // 1-Click execution using license_id directly
          res = await fetch('/api/admin/licenses/' + currentRescueLicId + '/recovery-code', {
            method: 'POST',
            headers: { 'X-Admin-Secret': getSecret() }
          });
          data = await res.json();
        } else {
          var input = document.getElementById('directRecCodeInput');
          var code = (input ? input.value : '').trim();
          if (!code) {
            markInputInvalid(input, 'يرجى إدخال بصمة الجهاز أو كود التحدي');
            if (btn) btn.disabled = false;
            return;
          }
          res = await fetch('/api/admin/pin-recovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': getSecret() },
            body: JSON.stringify({ device_fingerprint: code, challenge: code })
          });
          data = await res.json();
        }

        if (data.success && (data.recovery_code || data.recovery_token || data.token)) {
          var tok = data.recovery_code || data.recovery_token || data.token;
          var box = document.getElementById('pinRecoveryResultBox');
          var out = document.getElementById('pinRecoveryResultToken');
          if (out) out.value = tok;
          if (box) box.style.setProperty('display', 'block', 'important');
          showToast('تم توليد كود استعادة PIN بنجاح!');
        } else {
          showToast(data.message || 'فشل توليد رمز PIN', true);
        }
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function handleClockReset(e) {
      if (e && e.preventDefault) e.preventDefault();
      var lic = currentRescueLicId ? allLicenses.find(function(l) { return l.id === currentRescueLicId; }) : null;
      var isBound = lic && lic.machine_fingerprint;
      var btn = document.getElementById('btnClockResetSubmit');
      if (btn) btn.disabled = true;
      showToast('جاري توليد رمز فك حظر الساعة...');

      try {
        var res, data;
        if (isBound) {
          // 1-Click execution using license_id directly
          res = await fetch('/api/admin/licenses/' + currentRescueLicId + '/clock-reset', {
            method: 'POST',
            headers: { 'X-Admin-Secret': getSecret() }
          });
          data = await res.json();
        } else {
          var input = document.getElementById('clockResetCodeInput');
          var code = (input ? input.value : '').trim();
          if (!code) {
            markInputInvalid(input, 'يرجى إدخال بصمة الجهاز أو كود ساعة العميل');
            if (btn) btn.disabled = false;
            return;
          }
          res = await fetch('/api/admin/clock-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': getSecret() },
            body: JSON.stringify({ clock_code: code, device_fingerprint: code })
          });
          data = await res.json();
        }

        if (data.success && (data.reset_token || data.clock_reset_code || data.reset_code || data.token)) {
          var tok = data.reset_token || data.clock_reset_code || data.reset_code || data.token;
          var box = document.getElementById('clockResetResultBox');
          var out = document.getElementById('clockResetResultToken');
          if (out) out.value = tok;
          if (box) box.style.setProperty('display', 'block', 'important');
          showToast('تم توليد كود فك حظر الساعة بنجاح!');
        } else {
          showToast(data.message || 'فشل توليد رمز ضبط الساعة', true);
        }
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ==========================================
    // RELEASES & FLEET HANDLERS
    // ==========================================
    async function loadReleases() {
      if (!checkAuth()) return;
      try {
        var res = await fetch('/api/admin/releases?_t=' + Date.now(), {
          headers: {
            'X-Admin-Secret': getSecret(),
            'Cache-Control': 'no-cache, no-store'
          }
        });
        var data = await res.json();
        if (data.success) {
          allReleases = data.data || [];
          var b = document.getElementById('badgeReleasesCount');
          if (b) b.textContent = allReleases.length;
          renderReleasesTable();
        }
      } catch (err) {
        showToast('فشل جلب قائمة التحديثات', true);
      }
    }

    function renderReleasesTable() {
      var tbody = document.getElementById('releasesTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (allReleases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400 font-bold text-xs">لا توجد تحديثات منشورة حتى الآن</td></tr>';
        return;
      }

      allReleases.forEach(function(rel, idx) {
        var tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        var isActive = rel.is_active === 1;

        tr.innerHTML = [
          '<td class="px-4 py-3 text-center font-mono text-slate-400">' + (idx + 1) + '</td>',
          '<td class="px-4 py-3 font-mono font-bold text-slate-900">' + escapeHtml(rel.version) + '</td>',
          '<td class="px-4 py-3 font-bold text-slate-800">' + escapeHtml(rel.title) + '</td>',
          '<td class="px-4 py-3 font-mono text-slate-500 text-[11px]">' + (rel.sha256 ? escapeHtml(rel.sha256.slice(0, 16)) + '...' : '-') + '</td>',
          '<td class="px-4 py-3 text-center">' + (rel.is_mandatory ? '<span class="pill pill-disabled">إجباري</span>' : '<span class="pill pill-pending">اختياري</span>') + '</td>',
          '<td class="px-4 py-3 text-center">' + (isActive ? '<span class="pill pill-active">منشور ونشط</span>' : '<span class="pill pill-disabled">معطل (Kill Switch)</span>') + '</td>',
          '<td class="px-4 py-3 text-center">',
          '  <button data-id="' + escapeHtml(rel.id) + '" data-active="' + (rel.is_active ? '1' : '0') + '" onclick="toggleReleaseStatus(this.dataset.id, this.dataset.active == 1)" class="px-3 py-1 rounded-xl font-bold text-xs transition ' + (isActive ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100') + '">',
          '    ' + (isActive ? 'إيقاف طارئ' : 'إعادة تفعيل'),
          '  </button>',
          '</td>'
        ].join('');

        tbody.appendChild(tr);
      });
    }

    async function handlePublishRelease(e) {
      e.preventDefault();
      var vEl = document.getElementById('pubVersion');
      var tEl = document.getElementById('pubTitle');
      var ver = (vEl ? vEl.value : '').trim();
      var title = (tEl ? tEl.value : '').trim();

      if (!ver) {
        markInputInvalid(vEl, 'يرجى إدخال رقم الإصدار (مثل 1.1.0)');
        return;
      }
      if (!title) {
        markInputInvalid(tEl, 'يرجى إدخال عنوان التحديث الهوائي');
        return;
      }

      var payload = {
        version: ver,
        release_date: document.getElementById('pubDate').value,
        title: title,
        package_url: document.getElementById('pubUrl').value.trim(),
        sha256: document.getElementById('pubSha').value.trim(),
        size_bytes: Math.round((parseFloat(document.getElementById('pubSize').value) || 0) * 1024 * 1024),
        is_mandatory: parseInt(document.getElementById('pubMandatory').value) || 0,
        changelog: document.getElementById('pubChangelog').value.trim()
      };

      try {
        var res = await fetch('/api/admin/releases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': getSecret() },
          body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (data.success) {
          closeModal('publishReleaseModal');
          showToast('تم نشر التحديث الهوائي بنجاح!');
          loadReleases();
        } else {
          showToast(data.message || 'فشل نشر التحديث', true);
        }
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      }
    }

    async function toggleReleaseStatus(id, currentStatus) {
      try {
        var res = await fetch('/api/admin/releases/' + id + '/toggle', {
          method: 'POST',
          headers: { 'X-Admin-Secret': getSecret() }
        });
        var data = await res.json();
        if (data.success) {
          showToast('تم تعديل حالة نشر التحديث بنجاح!');
          loadReleases();
        } else {
          showToast(data.message || 'فشل تبديل الحالة', true);
        }
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال بالسيرفر', true);
      }
    }

    async function handleExtendUpdates(e) {
      e.preventDefault();
      var id = document.getElementById('extUpdLicId').value;
      var dur = document.getElementById('extUpdDuration').value;
      try {
        var res = await fetch('/api/admin/licenses/' + id + '/extend-updates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': getSecret() },
          body: JSON.stringify({ duration: dur })
        });
        var data = await res.json();
        if (data.success) {
          closeModal('extendUpdatesModal');
          showToast('تم تمديد اشتراك التحديثات بنجاح!');
          loadLicenses();
        } else {
          showToast(data.message || 'فشل تمديد الاشتراك', true);
        }
      } catch (err) {
        showToast('حدث خطأ أثناء الاتصال', true);
      }
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================
    function initDashboard() {
      // Restore sidebar state cleanly without overriding
      var isMobile = window.innerWidth < 768;
      var sbState = localStorage.getItem('rafiq_sidebar_collapsed');
      var isSbCollapsed = !isMobile && (sbState !== null ? (sbState === '1') : (window.innerWidth < 1100));
      setSidebarCollapsedState(isSbCollapsed);

      // View mode: restore saved preference, or default based on screen width
      var savedMode = null;
      try {
        savedMode = localStorage.getItem('rafiq_admin_view_mode');
      } catch (_) {}
      if (savedMode === 'cards' || savedMode === 'table') {
        userViewPreference = savedMode;
        setViewMode(savedMode, false);
      } else if (window.innerWidth < 1024) {
        setViewMode('cards', false);
      } else {
        setViewMode('table', false);
      }

      loadLicenses();
    }

    // Auto-boot reliably on DOM ready or immediate if already interactive
    function bootDashboard() {
      if (checkAuth()) {
        initDashboard();
      } else {
        var input = document.getElementById('loginSecretInput');
        if (input) setTimeout(function() { input.focus(); }, 120);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootDashboard);
    } else {
      bootDashboard();
    }
`;
