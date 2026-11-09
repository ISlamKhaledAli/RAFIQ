import { LOGO_DATA_URI } from './logoAsset.ts';

/**
 * Admin Dashboard HTML Layout & Modals
 * Zero Emojis - Pure Crisp Lucide SVG Icons - Apple & Google SaaS Polish
 */
export const adminTemplate = `
  <!-- ========================================================================= -->
  <!-- 0. LOGIN GATE (Glassmorphic Admin Secret Protection)                      -->
  <!-- ========================================================================= -->
  <div id="login-screen" class="login-overlay" style="display: none;">
    <div class="login-card">
      <div class="login-logo-box">
        <img src="${LOGO_DATA_URI}" alt="شعار رفيق" class="w-full h-full object-contain select-none" />
      </div>
      <div>
        <h3 class="login-title">تسجيل الدخول للإدارة المركزية</h3>
        <p class="login-subtitle">نظام رفيق — إدارة التراخيص والأسطول السحابي</p>
      </div>
      <div id="loginError" style="display:none;" class="login-error-box"></div>
      <form class="login-form" onsubmit="event.preventDefault(); handleLogin(event);">
        <div>
          <label class="login-label" for="loginSecretInput">كلمة سر المشرف (Admin Secret):</label>
          <div class="login-input-wrap">
            <input type="password" id="loginSecretInput" onkeydown="if(event.key==='Enter'||event.keyCode===13){event.preventDefault();handleLogin(event);}" placeholder="أدخل كلمة السر..." class="login-input" autocomplete="current-password">
            <button type="button" id="btnToggleLoginPw" onclick="toggleLoginPassword()" class="login-pw-toggle" title="إظهار / إخفاء كلمة السر">
              <svg id="loginEyeIcon" class="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <button type="button" id="btnLoginSubmit" onclick="handleLogin(event)" class="login-btn">
          <span>دخول للنظام</span>
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </form>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- 1. TOP APP BAR (Modern Apple Frosted Glass + Crisp Rafiq Brand)          -->
  <!-- ========================================================================= -->
  <header id="app-header" class="bg-[#00372d] text-white px-3 sm:px-6 flex items-center justify-between shadow-lg shadow-emerald-950/20 border-b border-emerald-900/60 sticky top-0 z-50 h-[64px] sm:h-[76px]">
    
    <!-- Right (RTL Start): Pure Crisp Rafiq Logo & Brand Title -->
    <div class="flex items-center gap-2.5 sm:gap-3 select-none min-w-0">
      <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/10 p-1 border border-white/15 shadow-md shadow-emerald-950/30 flex items-center justify-center shrink-0">
        <img src="${LOGO_DATA_URI}" alt="شعار رفيق" class="w-full h-full object-contain select-none" />
      </div>
      <div class="flex flex-col text-right min-w-0">
        <div class="flex items-center gap-1.5 sm:gap-2">
          <span class="text-sm sm:text-base lg:text-lg font-black tracking-tight text-white whitespace-nowrap leading-tight">نظام رفيق</span>
          <span class="hidden sm:inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-900/80 border border-emerald-600/40 text-[9px] sm:text-[11px] font-bold text-emerald-200 shadow-xs whitespace-nowrap">الإدارة المركزية</span>
        </div>
        <span class="hidden md:block text-[11px] text-emerald-200/80 font-medium whitespace-nowrap">بوابة إدارة التراخيص والأسطول السحابي</span>
      </div>
    </div>

    <!-- Left (RTL End): Refresh + Primary CTA + Admin Profile + Logout -->
    <div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">

      <!-- Live Refresh Data Button -->
      <button onclick="refreshCurrentView()" class="h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition border border-white/15 shadow-xs shrink-0" title="تحديث السجلات">
        <svg id="refresh-icon" class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-200 transition-transform duration-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.67-6.67"/></svg>
      </button>

      <!-- Primary Action CTA (Adaptive Text on small screens) -->
      <button onclick="openUnifiedLicenseModal('online')" class="h-9 sm:h-11 px-2.5 sm:px-5 rounded-xl bg-gradient-to-l from-emerald-500 to-[#006d41] hover:from-emerald-400 hover:to-[#004d3f] text-white font-black text-xs sm:text-sm transition flex items-center gap-1.5 shadow-md border border-emerald-400/40 active:scale-95 shrink-0">
        <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        <span class="hidden sm:inline">إصدار ترخيص جديد</span>
        <span class="sm:hidden text-xs">إصدار</span>
      </button>

      <!-- Admin Status Avatar (Apple Identity Pill - Hidden on Mobile) -->
      <div class="hidden sm:flex h-9 sm:h-11 px-2.5 sm:px-3.5 rounded-xl bg-white/10 border border-white/15 items-center gap-2 sm:gap-3 shadow-xs shrink-0">
        <div class="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-emerald-700 to-emerald-500 border border-emerald-300/40 flex items-center justify-center font-bold text-xs text-white shadow-xs shrink-0">
          IK
        </div>
        <div class="hidden xl:block text-right">
          <div class="text-xs font-black text-white leading-tight">ISlam Khaled Ali</div>
          <div class="text-[10px] text-emerald-300 font-bold mt-0.5">Root Admin</div>
        </div>
      </div>

      <!-- Logout Button -->
      <button onclick="logout()" class="h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 text-rose-300 flex items-center justify-center transition border border-rose-400/30 shadow-xs shrink-0" title="تسجيل الخروج">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>

    </div>

  </header>

  <!-- ========================================================================= -->
  <!-- 2. MAIN APP FRAME: 100% FULL-HEIGHT SIDEBAR + WORKSPACE                   -->
  <!-- ========================================================================= -->
  <div id="app-layout-body" class="flex flex-row items-stretch w-full min-h-[calc(100vh-60px)] relative">

    <!-- Mobile Drawer Backdrop -->
    <div id="sidebar-backdrop" onclick="toggleSidebarMobile(false)" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 hidden md:hidden transition-opacity duration-200"></div>

    <!-- ----------------------------------------------------------------------- -->
    <!-- COLLAPSIBLE SIDEBAR: FULL 100% VIEWPORT HEIGHT, ZERO GAP                -->
    <!-- ----------------------------------------------------------------------- -->
    <aside id="app-sidebar" class="text-white shadow-xl border-l border-emerald-950/40 z-40 w-72 max-w-[85vw]">
      
      <!-- Top Navigation Links -->
      <div class="p-3.5 space-y-1.5 overflow-y-auto overflow-x-hidden flex-1">
        
        <!-- Sidebar Header with Single Clean Collapse Control -->
        <div class="sidebar-header-box px-3.5 py-2.5 flex items-center justify-between text-xs text-emerald-300/80 font-bold border-b border-white/10 mb-2">
          <span class="sidebar-label font-bold text-slate-200">القائمة الرئيسية</span>
          <button type="button" onclick="toggleSidebarMobile(false)" class="p-1.5 rounded-lg hover:bg-white/10 text-emerald-300 md:hidden transition flex items-center justify-center" title="إغلاق القائمة">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button type="button" onclick="toggleSidebarDesktop()" id="btn-sidebar-toggle" class="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 text-emerald-300 transition items-center justify-center focus:outline-none" title="طي / توسيع القائمة الجانبية">
            <svg id="sidebar-collapse-icon" class="w-4 h-4 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <!-- Nav Item 1: Licenses & Subscriptions (Default Active) -->
        <button onclick="switchMainTab('licenses')" id="tabBtnLicenses" title="التراخيص والمنشآت" class="sidebar-nav-btn w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs sm:text-sm font-bold transition bg-[#006d41] text-white shadow-sm border border-emerald-400/30 group active:scale-[0.98]">
          <div class="flex items-center gap-3 min-w-0">
            <svg class="w-5 h-5 text-emerald-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
            <span class="sidebar-label whitespace-nowrap">التراخيص والمنشآت</span>
          </div>
          <span id="badgeLicensesCount" class="sidebar-label text-xs bg-emerald-950/80 text-emerald-200 px-2 py-0.5 rounded-full font-mono shrink-0">0</span>
        </button>


        <!-- Nav Item 3: OTA Releases & Fleet -->
        <button onclick="switchMainTab('releases')" id="tabBtnReleases" title="التحديثات الهوائية (OTA)" class="sidebar-nav-btn w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs sm:text-sm font-bold transition text-emerald-100/75 hover:bg-white/10 hover:text-white group active:scale-[0.98]">
          <div class="flex items-center gap-3 min-w-0">
            <svg class="w-5 h-5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span class="sidebar-label whitespace-nowrap">التحديثات الهوائية (OTA)</span>
          </div>
          <span id="badgeReleasesCount" class="sidebar-label text-xs bg-cyan-950/80 text-cyan-200 px-2 py-0.5 rounded-full font-mono shrink-0">v1.1.0</span>
        </button>

        <!-- Nav Item 4: Audit Logs -->
        <button onclick="switchMainTab('logs')" id="tabBtnLogs" title="سجل التدقيق والأمان" class="sidebar-nav-btn w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs sm:text-sm font-bold transition text-emerald-100/75 hover:bg-white/10 hover:text-white group active:scale-[0.98]">
          <div class="flex items-center gap-3 min-w-0">
            <svg class="w-5 h-5 text-slate-400 shrink-0 group-hover:text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
            <span class="sidebar-label whitespace-nowrap">سجل التدقيق والأمان</span>
          </div>
          <span id="badgeLogsCount" class="sidebar-label text-xs bg-white/10 text-emerald-300 px-2 py-0.5 rounded-full font-mono shrink-0">0</span>
        </button>
      </div>

    </aside>

    <!-- ----------------------------------------------------------------------- -->
    <!-- MAIN WORKSPACE STAGE (Fluid, Responsive, Modern SaaS Polish)            -->
    <!-- ----------------------------------------------------------------------- -->
    <main id="app-main-stage" class="custom-scroll p-3 sm:p-5 lg:p-7 space-y-5 min-w-0 w-full pb-24 md:pb-8">
      
      <!-- Top Title Bar (Clean, Zero Redundant Breadcrumbs) -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2.5 border-b border-slate-200/80">
        <div>
          <h1 id="header-main-title" class="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span>سجل التراخيص ومفاتيح الأسطول التجاري</span>
          </h1>
          <p id="header-breadcrumb-title" class="text-xs text-slate-500 font-medium mt-0.5">إدارة التراخيص السحابية والأوفلاين وربط الأجهزة</p>
        </div>
      </div>

      <!-- ===================================================================== -->
      <!-- VIEW 1: LICENSES & SUBSCRIBERS WORKSPACE (Default View)              -->
      <!-- ===================================================================== -->
      <div id="licensesView" class="space-y-5" style="display:flex; flex-direction:column;">

        <!-- 4 Modern KPI Cards (Responsive Grid: 2 cols on mobile/split, 4 cols on desktop) -->
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4.5">
          
          <!-- Card 1: Total Licenses -->
          <div class="bg-white/90 backdrop-blur-md border border-slate-200/80 hover:border-emerald-500/30 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
            <div class="flex items-center justify-between text-slate-600 text-xs sm:text-sm font-black mb-2">
              <span>إجمالي التراخيص</span>
              <div class="p-1.5 rounded-xl bg-slate-100 text-slate-700">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
            </div>
            <div id="kpi-total" class="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight font-mono">0</div>
            <div class="text-xs text-slate-500 font-bold mt-1">كافة المتاجر المسجلة بالدليل</div>
          </div>

          <!-- Card 2: Active & Verified -->
          <div class="bg-white/90 backdrop-blur-md border border-emerald-100/90 hover:border-emerald-500/40 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
            <div class="flex items-center justify-between text-emerald-800 text-xs sm:text-sm font-black mb-2">
              <span>النشطة والمفعلة</span>
              <div class="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
            </div>
            <div id="kpi-active" class="text-2xl sm:text-3xl lg:text-4xl font-black text-emerald-700 tracking-tight font-mono">0</div>
            <div id="kpi-active-sub" class="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>تراخيص عاملة بنجاح</span>
            </div>
          </div>

          <!-- Card 3: Pending Activation -->
          <div class="bg-white/90 backdrop-blur-md border border-blue-100/90 hover:border-blue-500/40 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
            <div class="flex items-center justify-between text-blue-800 text-xs sm:text-sm font-black mb-2">
              <span>في الانتظار (لم تفعل)</span>
              <div class="p-1.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            </div>
            <div id="kpi-pending" class="text-2xl sm:text-3xl lg:text-4xl font-black text-blue-600 tracking-tight font-mono">0</div>
            <div class="text-xs text-blue-500 font-bold mt-1">رموز مسلمة بانتظار التثبيت</div>
          </div>

          <!-- Card 4: Disabled / Expired -->
          <div class="bg-white/90 backdrop-blur-md border border-rose-100/90 hover:border-rose-500/40 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
            <div class="flex items-center justify-between text-rose-800 text-xs sm:text-sm font-black mb-2">
              <span>معطلة أو منتهية</span>
              <div class="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
            </div>
            <div id="kpi-disabled" class="text-2xl sm:text-3xl lg:text-4xl font-black text-rose-600 tracking-tight font-mono">0</div>
            <div class="text-xs text-rose-500 font-bold mt-1">تتطلب متابعة أو تجديد</div>
          </div>

        </div>

        <!-- Modern Search & Filter Bar with Dual-View Switcher -->
        <div class="bg-white/90 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          <!-- Search Field -->
          <div class="relative flex-1 min-w-[200px]">
            <svg class="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="searchInput" oninput="handleSearch(this.value)" placeholder="بحث بالمنشأة، الهاتف، الكود، HWID..." class="w-full pr-11 pl-4 h-11 sm:h-12 text-sm sm:text-base font-bold rounded-xl border border-slate-200/90 focus:border-[#006d41]">
          </div>

          <!-- Controls: Filter Chips + View Mode Switcher -->
          <div class="flex items-center justify-between sm:justify-end gap-2 overflow-x-auto custom-scroll pb-1 sm:pb-0">
            
            <!-- Modern Filter Chips -->
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="setFilter('all', this)" id="filter-chip-all" class="filter-chip active px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black bg-[#00372d] text-white transition whitespace-nowrap shadow-xs active:scale-95">الكل</button>
              <button onclick="setFilter('active', this)" id="filter-chip-active" class="filter-chip px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black text-slate-600 hover:bg-slate-100 transition whitespace-nowrap active:scale-95">النشطة</button>
              <button onclick="setFilter('pending', this)" id="filter-chip-pending" class="filter-chip px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black text-slate-600 hover:bg-slate-100 transition whitespace-nowrap active:scale-95">الانتظار</button>
              <button onclick="setFilter('disabled', this)" id="filter-chip-disabled" class="filter-chip px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black text-slate-600 hover:bg-slate-100 transition whitespace-nowrap active:scale-95">معطلة</button>
            </div>

            <!-- View Switcher (Cards vs Table) -->
            <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
              <button type="button" onclick="setViewMode('cards')" id="btn-view-cards" class="px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1.5 text-slate-600 hover:text-slate-900" title="عرض البطاقات">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
                <span class="hidden sm:inline">بطاقات</span>
              </button>
              <button type="button" onclick="setViewMode('table')" id="btn-view-table" class="px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1.5 bg-white text-slate-900 shadow-xs" title="عرض الجدول">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                <span class="hidden sm:inline">جدول</span>
              </button>
            </div>

          </div>

        </div>

        <!-- ===================================================================== -->
        <!-- DUAL-MODE DATA ENGINE: CARDS FOR FLUID VIEW, TABLE FOR WIDE VIEW     -->
        <!-- ===================================================================== -->

        <!-- A. CARDS VIEW (Fully responsive, perfect for mobile, tablet & split screens) -->
        <div id="licenses-cards-wrapper" class="hidden space-y-3">
          <div id="licensesCardsContainer" class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5 sm:gap-6">
            <!-- Dynamically generated cards inserted here -->
          </div>
        </div>

        <!-- B. DESKTOP ENTERPRISE DATA TABLE (With safe min-width & horizontal scroll) -->
        <div id="licenses-table-wrapper" class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scroll w-full">
            <table class="w-full text-right border-collapse text-sm min-w-[960px]">
              <thead class="bg-slate-100/90 text-slate-700 font-black border-b border-slate-200 sticky top-0 backdrop-blur-md text-xs sm:text-sm tracking-wide">
                <tr>
                  <th class="px-4 py-4 text-center w-12 font-mono">#</th>
                  <th class="px-4 py-4">رمز الترخيص (KEY)</th>
                  <th class="px-4 py-4">المنشأة والنشاط</th>
                  <th class="px-4 py-4">رقم الهاتف</th>
                  <th class="px-4 py-4">نوع الصلاحية</th>
                  <th class="px-4 py-4">تاريخ الصلاحية والمتبقي</th>
                  <th class="px-4 py-4 text-center">الحالة</th>
                  <th class="px-4 py-4 font-mono">الجهاز المرتبط (HWID)</th>
                  <th class="px-4 py-4 text-center w-28">الإجراءات</th>
                </tr>
              </thead>
              <tbody id="licensesTableBody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- Dynamically generated desktop table rows inserted here -->
              </tbody>
            </table>
          </div>

          <!-- Table Pagination Footer -->
          <div id="licensesPaginationBar" class="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div id="licensesPaginationText">عرض 0 إلى 0 من أصل 0 ترخيص</div>
            <div id="licensesPaginationControls" class="flex items-center gap-1"></div>
          </div>

        </div>

      </div>

      <!-- ===================================================================== -->
      <!-- VIEW 2: AUDIT LOGS (Cloud Verification Audit Trail)                   -->
      <!-- ===================================================================== -->
      <div id="logsView" class="hidden space-y-5" style="display:none; flex-direction:column;">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-black text-[#00372d]">سجل تدقيق التفعيل والتحقق (Audit Trail)</h2>
            <p class="text-xs text-slate-500">توثيق مباشر ومفصل لجميع استدعاءات التفعيل والتحقق وفك الربط مع الـ IP وبصمة الجهاز</p>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="logsSearchInput" oninput="handleLogsSearch(this.value)" placeholder="بحث في السجل..." class="text-xs py-1.5 px-3 rounded-xl border border-slate-200">
            <button onclick="loadLogs()" class="px-3.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.67-6.67"/></svg>
              <span>تحديث</span>
            </button>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scroll w-full">
            <table class="w-full text-right border-collapse text-xs min-w-[750px]">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/80">
                <tr>
                  <th class="px-4 py-3 text-center w-12 font-mono">#</th>
                  <th class="px-4 py-3">تاريخ ووقت الحركة</th>
                  <th class="px-4 py-3">الحدث / العملية</th>
                  <th class="px-4 py-3">رمز الترخيص</th>
                  <th class="px-4 py-3">عنوان IP والمتصفح</th>
                  <th class="px-4 py-3">بصمة الجهاز (HWID)</th>
                  <th class="px-4 py-3 text-center">النتيجة</th>
                </tr>
              </thead>
              <tbody id="logsTableBody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- Dynamically populated rows -->
              </tbody>
            </table>
          </div>

          <!-- Logs Pagination Footer -->
          <div id="logsPaginationBar" class="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div id="logsPaginationText">عرض 0 إلى 0 من أصل 0 حركة</div>
            <div id="logsPaginationControls" class="flex items-center gap-1"></div>
          </div>
        </div>
      </div>


      <!-- ===================================================================== -->
      <!-- VIEW 4: OTA RELEASES & FLEET MANAGEMENT                              -->
      <!-- ===================================================================== -->
      <div id="releasesView" class="hidden space-y-5" style="display:none; flex-direction:column;">
        <div class="flex items-center justify-end">
          <button onclick="openModal('publishReleaseModal')" class="h-11 px-5 bg-[#006d41] hover:bg-[#005634] text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center gap-2 shadow-xs cursor-pointer active:scale-95">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            <span>نشر تحديث جديد</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scroll w-full">
            <table class="w-full text-right border-collapse text-xs min-w-[850px]">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/80">
                <tr>
                  <th class="px-4 py-3 text-center w-12 font-mono">#</th>
                  <th class="px-4 py-3 font-mono">الإصدار (Version)</th>
                  <th class="px-4 py-3">عنوان التحديث والملاحظات</th>
                  <th class="px-4 py-3 font-mono">بصمة SHA-256 والحجم</th>
                  <th class="px-4 py-3 text-center">النوع</th>
                  <th class="px-4 py-3 text-center">حالة النشر</th>
                  <th class="px-4 py-3 text-center w-36">مفتاح الطوارئ (Kill Switch)</th>
                </tr>
              </thead>
              <tbody id="releasesTableBody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- Dynamically populated rows -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </main>

  </div>

  <!-- ========================================================================= -->
  <!-- MODALS CONTAINER (Zero Stuck Modals - Pure Bulletproof CSS)                -->
  <!-- ========================================================================= -->

  <!-- Modal 1: Unified Issue License Modal (Online & Offline) -->
  <div id="unifiedLicenseModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-5 sm:p-7 max-w-xl w-full space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-base font-black text-slate-900 flex items-center gap-2">
          <svg class="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
          <span id="unifiedModalHeaderTitle">إصدار ترخيص تجاري جديد</span>
        </h3>
        <button type="button" onclick="closeModal('unifiedLicenseModal')" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Segmented Toggle: Online Cloud License vs Offline HWID License -->
      <div class="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
        <button type="button" id="btnToggleLicOnline" onclick="switchLicenseCreateMode('online')" class="py-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 bg-white text-[#00372d] shadow-xs cursor-pointer">
          <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
          <span>ترخيص سحابي أونلاين</span>
        </button>
        <button type="button" id="btnToggleLicOffline" onclick="switchLicenseCreateMode('offline')" class="py-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer">
          <svg class="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span>ترخيص أوفلاين بالبصمة</span>
        </button>
      </div>
      <input type="hidden" id="newLicMode" value="online">

      <form novalidate onsubmit="handleCreateLicense(event)" class="space-y-3.5 text-right">
        <div id="newLicHwidWrapper" style="display:none;">
          <label class="block text-xs font-bold text-slate-700 mb-1">بصمة جهاز العميل (Device Fingerprint / HWID) *:</label>
          <input type="text" id="newLicHwidInput" placeholder="مثال: 78BFEBFB000806EA..." class="w-full font-mono text-xs text-left" dir="ltr">
          <span class="text-[10px] text-slate-400 mt-1 block">الكود المشفر سيتم توقيعه بمفتاح RSA ويعمل أوفلاين على هذا الجهاز تحديداً بدون إنترنت</span>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة أو المحل التجاري *:</label>
          <input type="text" id="shopName" required placeholder="مثال: هايبر ماركت البركة" class="w-full">
        </div>
        <div id="newLicPhoneWrapper">
          <label class="block text-xs font-bold text-slate-700 mb-1">رقم هاتف المالك (للتواصل وإرسال الكود):</label>
          <input type="text" id="ownerPhone" placeholder="01012345678" class="w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">نوع وخطة الصلاحية:</label>
          <div class="custom-select-container" id="wrapper-durationSelect">
            <input type="hidden" id="durationSelect" value="lifetime">
            <button type="button" class="custom-select-trigger" onclick="toggleCustomSelect('durationSelect', event)">
              <span class="custom-select-label">دائم مدى الحياة (Lifetime License)</span>
              <svg class="custom-select-chevron w-4 h-4 text-[#006D41] transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="options-durationSelect" class="custom-select-options hidden">
              <div class="custom-option selected" data-value="lifetime" onclick="selectCustomOption('durationSelect', 'lifetime', 'دائم مدى الحياة (Lifetime License)', event)">
                <span>دائم مدى الحياة (Lifetime License)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="365" onclick="selectCustomOption('durationSelect', '365', 'اشتراك سنوي (365 يوم / سنة كاملة)', event)">
                <span>اشتراك سنوي (365 يوم / سنة كاملة)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="180" onclick="selectCustomOption('durationSelect', '180', 'اشتراك نصف سنوي (180 يوم / 6 أشهر)', event)">
                <span>اشتراك نصف سنوي (180 يوم / 6 أشهر)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="90" onclick="selectCustomOption('durationSelect', '90', 'اشتراك ربع سنوي (90 يوم / 3 أشهر)', event)">
                <span>اشتراك ربع سنوي (90 يوم / 3 أشهر)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="30" onclick="selectCustomOption('durationSelect', '30', 'اشتراك شهري (30 يوم)', event)">
                <span>اشتراك شهري (30 يوم)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="14" onclick="selectCustomOption('durationSelect', '14', 'فترة تجريبية (14 يوم)', event)">
                <span>فترة تجريبية (14 يوم)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="7" onclick="selectCustomOption('durationSelect', '7', 'فترة تجريبية سريعة (7 أيام)', event)">
                <span>فترة تجريبية سريعة (7 أيام)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="custom" onclick="selectCustomOption('durationSelect', 'custom', 'تحديد عدد أيام مخصص...', event)">
                <span>تحديد عدد أيام مخصص...</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
          </div>
        </div>
        <div id="customDaysWrapper" style="display:none;">
          <label class="block text-xs font-bold text-slate-700 mb-1">عدد الأيام المخصصة:</label>
          <input type="number" id="customDaysInput" min="1" max="9999" placeholder="مثال: 60" class="w-full">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">ملاحظات داخلية (اختياري):</label>
          <textarea id="notesInput" rows="2" placeholder="أي ملاحظات خاصة بالعميل أو الموزع..." class="w-full"></textarea>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('unifiedLicenseModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إلغاء</button>
          <button type="submit" id="btnSubmitNewLicense" class="w-full sm:w-auto px-6 py-2.5 bg-[#006d41] hover:bg-[#005634] text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-2">
            <span id="btnSubmitNewLicenseText">إصدار وحفظ الترخيص</span>
          </button>
        </div>
      </form>

      <!-- Result Box for New License -->
      <div id="newLicResultBox" style="display:none;" class="p-3 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-2 mt-3">
        <div class="flex items-center justify-between text-xs font-bold text-emerald-900">
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span id="newLicResultTitle">تم إصدار الترخيص بنجاح!</span>
          </span>
        </div>
        <div class="flex items-center gap-2">
          <input type="text" id="newLicResultCode" readonly class="w-full font-mono text-xs font-bold bg-slate-900 text-sky-300 p-2.5 rounded-xl border border-slate-800 select-all text-left" dir="ltr" onclick="this.select()">
          <button type="button" onclick="copyFromInput('newLicResultCode', 'كود الترخيص')" class="px-3 py-2 bg-[#00372d] hover:bg-[#00261f] text-white font-bold rounded-xl text-xs transition shrink-0 flex items-center gap-1 cursor-pointer">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>نسخ</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal 2: Edit License Modal -->
  <div id="editModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-5 sm:p-7 max-w-xl w-full space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-base font-black text-slate-900 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>تعديل بيانات وصلاحية الترخيص</span>
        </h3>
        <button type="button" onclick="closeModal('editModal')" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <form novalidate onsubmit="handleEditLicense(event)" class="space-y-3.5 text-right">
        <input type="hidden" id="editLicenseId">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة:</label>
          <input type="text" id="editShopName" required class="w-full">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف:</label>
          <input type="text" id="editOwnerPhone" class="w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">إجراء الصلاحية والاشتراك:</label>
          <div class="custom-select-container" id="wrapper-editExtendAction">
            <input type="hidden" id="editExtendAction" value="none">
            <button type="button" class="custom-select-trigger" onclick="toggleCustomSelect('editExtendAction', event)">
              <span class="custom-select-label">الإبقاء على الصلاحية الحالية بدون تغيير</span>
              <svg class="custom-select-chevron w-4 h-4 text-[#006D41] transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="options-editExtendAction" class="custom-select-options hidden">
              <div class="custom-option selected" data-value="none" onclick="selectCustomOption('editExtendAction', 'none', 'الإبقاء على الصلاحية الحالية بدون تغيير', event)">
                <span>الإبقاء على الصلاحية الحالية بدون تغيير</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>

              <!-- تمديد الصلاحية -->
              <div class="px-2 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-50/80 rounded mt-1">تمديد وإضافة مدة (+)</div>
              <div class="custom-option" data-value="add_365" onclick="selectCustomOption('editExtendAction', 'add_365', 'تمديد الصلاحية (+365 يوم / سنة)', event)">
                <span>تمديد الصلاحية (+365 يوم / سنة)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="add_180" onclick="selectCustomOption('editExtendAction', 'add_180', 'تمديد الصلاحية (+180 يوم / 6 أشهر)', event)">
                <span>تمديد الصلاحية (+180 يوم / 6 أشهر)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="add_90" onclick="selectCustomOption('editExtendAction', 'add_90', 'تمديد الصلاحية (+90 يوم / 3 أشهر)', event)">
                <span>تمديد الصلاحية (+90 يوم / 3 أشهر)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="add_30" onclick="selectCustomOption('editExtendAction', 'add_30', 'تمديد الصلاحية (+30 يوم / شهر)', event)">
                <span>تمديد الصلاحية (+30 يوم / شهر)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="add_7" onclick="selectCustomOption('editExtendAction', 'add_7', 'تمديد تجريبي (+7 أيام)', event)">
                <span>تمديد تجريبي (+7 أيام)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="add_custom" onclick="selectCustomOption('editExtendAction', 'add_custom', 'إضافة عدد أيام مخصص (+X)...', event)">
                <span>إضافة عدد أيام مخصص (+X)...</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>

              <!-- إعادة تعيين الفترة من اليوم -->
              <div class="px-2 py-1 text-[10px] font-bold text-amber-800 bg-amber-50/80 rounded mt-1">إعادة تعيين الفترة وتصفير السابق</div>
              <div class="custom-option text-amber-900" data-value="set_exact" onclick="selectCustomOption('editExtendAction', 'set_exact', 'إعادة تعيين الفترة (تحديد عدد الأيام من اليوم)...', event)">
                <span>إعادة تعيين الفترة (تحديد عدد الأيام من اليوم)...</span>
                <svg class="custom-option-check w-4 h-4 text-amber-700 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option text-rose-700" data-value="set_expire_now" onclick="selectCustomOption('editExtendAction', 'set_expire_now', 'إنهاء الصلاحية فوراً (جعل الترخيص منتهياً)', event)">
                <span>إنهاء الصلاحية فوراً (جعل الترخيص منتهياً)</span>
                <svg class="custom-option-check w-4 h-4 text-rose-600 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>

              <!-- ترقية دائم -->
              <div class="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-50 rounded mt-1">ترقية خاصة</div>
              <div class="custom-option" data-value="set_lifetime" onclick="selectCustomOption('editExtendAction', 'set_lifetime', 'ترقية إلى ترخيص دائم مدى الحياة (Lifetime)', event)">
                <span>ترقية إلى ترخيص دائم مدى الحياة (Lifetime)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
          </div>
        </div>
        <div id="editCustomDaysWrapper" style="display:none;" class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <label id="editCustomDaysLabel" class="block text-xs font-bold text-slate-700">عدد الأيام المخصصة:</label>
          <input type="number" id="editCustomDaysInput" min="0" max="9999" placeholder="مثال: 90" class="w-full">
          <p id="editCustomDaysHint" class="text-[11px] text-slate-500 font-medium"></p>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية:</label>
          <textarea id="editNotes" rows="2" class="w-full"></textarea>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('editModal'); deleteLicense(document.getElementById('editLicenseId').value, document.getElementById('editShopName').value);" class="w-full sm:w-auto px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer">
            <svg class="w-4 h-4 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>حذف الترخيص</span>
          </button>
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button type="button" onclick="closeModal('editModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إلغاء</button>
            <button type="submit" class="w-full sm:w-auto px-6 py-2.5 bg-[#006d41] hover:bg-[#005634] text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-xs cursor-pointer active:scale-95 text-center">حفظ التعديلات</button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 3: Device HWID Modal -->
  <div id="deviceModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-5 sm:p-7 max-w-xl w-full space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2.5">
          <svg class="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span>تفاصيل وبصمة الجهاز المرتبط</span>
        </h3>
        <button type="button" onclick="closeModal('deviceModal')" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="space-y-3.5 text-xs sm:text-sm">
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
          <div>
            <span class="text-slate-400 block mb-0.5 text-xs font-semibold">اسم المنشأة:</span>
            <strong id="devModalShopName" class="text-sm font-bold text-slate-800"></strong>
          </div>
          <div>
            <span class="text-slate-400 block mb-0.5 text-xs font-semibold">رمز الترخيص:</span>
            <strong id="devModalLicKey" class="text-sm font-mono font-bold text-emerald-800 select-all"></strong>
          </div>
        </div>
        <div id="devModalFpBox" class="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
          <span class="text-slate-600 font-bold block mb-1 text-xs">بصمة الجهاز المربوطة (Machine HWID):</span>
          <div id="devModalFp" class="font-mono text-xs sm:text-sm text-slate-800 break-all select-all font-semibold bg-white p-2.5 rounded-lg border border-slate-200/80"></div>
        </div>
      </div>

      <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-slate-100">
        <button type="button" onclick="closeModal('deviceModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إغلاق</button>
        <button type="button" id="devModalUnbindBtn" class="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          <span>فك ربط الجهاز (نقل الترخيص)</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Modal 4: Share / WhatsApp Modal -->
  <div id="shareModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-5 sm:p-7 max-w-xl w-full space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2.5">
          <svg class="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span>مشاركة بيانات الترخيص مع العميل</span>
        </h3>
        <button type="button" onclick="closeModal('shareModal')" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="space-y-3">
        <textarea id="shareTextarea" rows="9" readonly class="w-full text-xs sm:text-sm font-sans p-3.5 sm:p-4 bg-slate-50 text-slate-800 rounded-xl border border-slate-200 select-all leading-relaxed focus:bg-white transition custom-scroll" style="min-height: 190px;"></textarea>
      </div>

      <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-slate-100">
        <button type="button" onclick="closeModal('shareModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إلغاء</button>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button type="button" onclick="copyShareText()" class="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>نسخ الرسالة</span>
          </button>
          <button type="button" onclick="openWhatsAppChat()" class="flex-1 sm:flex-initial px-5 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            <span>إرسال واتساب</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal 5: Publish Release Modal -->
  <div id="publishReleaseModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-5 sm:p-7 max-w-xl sm:max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto custom-scroll">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-base sm:text-lg font-black text-slate-900">نشر تحديث هوائي جديد (Publish OTA Release)</h3>
        <button type="button" onclick="closeModal('publishReleaseModal')" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <form novalidate onsubmit="handlePublishRelease(event)" class="space-y-3.5 text-right">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">رقم الإصدار (Version) *:</label>
            <input type="text" id="pubVersion" required placeholder="مثال: 1.1.0" class="w-full font-mono text-xs sm:text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">تاريخ الإصدار:</label>
            <input type="date" id="pubDate" required class="w-full text-xs sm:text-sm">
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">عنوان التحديث *:</label>
          <input type="text" id="pubTitle" required placeholder="تحديث الأمان والأداء السحابي" class="w-full text-xs sm:text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">رابط الحزمة (Package URL):</label>
          <input type="url" id="pubUrl" placeholder="https://cdn.rafiqpos.com/updates/v1.1.0.pkg" class="w-full font-mono text-xs sm:text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">بصمة SHA-256 للحزمة:</label>
          <input type="text" id="pubSha" placeholder="a1b2c3d4..." class="w-full font-mono text-xs sm:text-sm">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">حجم الحزمة (بالميجابايت):</label>
            <input type="number" step="0.1" id="pubSize" placeholder="15.5" class="w-full text-xs sm:text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">تحديث إجباري؟</label>
            <div class="custom-select-container" id="wrapper-pubMandatory">
            <input type="hidden" id="pubMandatory" value="0">
            <button type="button" class="custom-select-trigger" onclick="toggleCustomSelect('pubMandatory', event)">
              <span class="custom-select-label">اختياري (موصى به)</span>
              <svg class="custom-select-chevron w-4 h-4 text-[#006D41] transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="options-pubMandatory" class="custom-select-options hidden">
              <div class="custom-option selected" data-value="0" onclick="selectCustomOption('pubMandatory', '0', 'اختياري (موصى به)', event)">
                <span>اختياري (موصى به)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="1" onclick="selectCustomOption('pubMandatory', '1', 'إجباري وحرج', event)">
                <span>إجباري وحرج</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
          </div>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">سجل التغييرات (Changelog):</label>
          <textarea id="pubChangelog" rows="3" placeholder="- تحسين سرعة البحث...\n- إصلاح مشكلة الطباعة..." class="w-full text-xs sm:text-sm"></textarea>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('publishReleaseModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إلغاء</button>
          <button type="submit" class="w-full sm:w-auto px-6 py-2.5 bg-[#006d41] hover:bg-[#005634] text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-xs cursor-pointer active:scale-95 text-center">نشر التحديث الآن</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 6: Extend Updates Modal -->
  <div id="extendUpdatesModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-5 sm:p-7 max-w-md sm:max-w-lg w-full space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-base sm:text-lg font-black text-slate-900">تمديد اشتراك التحديثات</h3>
        <button type="button" onclick="closeModal('extendUpdatesModal')" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form novalidate onsubmit="handleExtendUpdates(event)" class="space-y-3.5 text-right">
        <input type="hidden" id="extUpdLicId">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">مدة التمديد:</label>
          <div class="custom-select-container" id="wrapper-extUpdDuration">
            <input type="hidden" id="extUpdDuration" value="365">
            <button type="button" class="custom-select-trigger" onclick="toggleCustomSelect('extUpdDuration', event)">
              <span class="custom-select-label">سنة كاملة (365 يوم)</span>
              <svg class="custom-select-chevron w-4 h-4 text-[#006D41] transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="options-extUpdDuration" class="custom-select-options hidden">
              <div class="custom-option selected" data-value="365" onclick="selectCustomOption('extUpdDuration', '365', 'سنة كاملة (365 يوم)', event)">
                <span>سنة كاملة (365 يوم)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="180" onclick="selectCustomOption('extUpdDuration', '180', '6 أشهر (180 يوم)', event)">
                <span>6 أشهر (180 يوم)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="30" onclick="selectCustomOption('extUpdDuration', '30', 'شهر واحد (30 يوم)', event)">
                <span>شهر واحد (30 يوم)</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="custom-option" data-value="lifetime" onclick="selectCustomOption('extUpdDuration', 'lifetime', 'تحديثات دائمة مدى الحياة', event)">
                <span>تحديثات دائمة مدى الحياة</span>
                <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal('extendUpdatesModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إلغاء</button>
          <button type="submit" class="w-full sm:w-auto px-6 py-2.5 bg-[#006d41] hover:bg-[#005634] text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-xs cursor-pointer active:scale-95 text-center">تمديد الآن</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 7: Confirm Modal (Fully Accessible & Always Closable) -->
  <div id="confirmModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card p-6 sm:p-8 max-w-md w-full space-y-4 text-center">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shadow-xs">
        <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div>
        <h4 id="confirmModalTitle" class="text-base sm:text-lg font-black text-slate-900">تأكيد العملية</h4>
        <p id="confirmModalMessage" class="text-xs sm:text-sm text-slate-500 font-medium mt-1.5 leading-relaxed">هل أنت متأكد من تنفيذ هذا الإجراء؟</p>
      </div>
      <div class="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5 pt-3 border-t border-slate-100">
        <button type="button" onclick="closeModal('confirmModal')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs sm:text-sm hover:bg-slate-50 transition cursor-pointer text-center">إلغاء</button>
        <button type="button" id="confirmModalActionBtn" class="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-xs cursor-pointer active:scale-95 text-center">تأكيد ومتابعة</button>
      </div>
    </div>
  </div>

  <!-- Modal 8: Offline Rescue & Support Modal (All-in-One Field Support Hub) -->
  <div id="offlineRescueModal" style="display:none !important;" class="modal-backdrop hidden">
    <div class="modal-card max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col text-right overflow-hidden shadow-2xl rounded-[22px] border border-slate-200 bg-white">
      
      <!-- Modal Header (Compact, Sleek, Unified) -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0 bg-white rounded-t-[22px]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 border border-purple-200/60 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-black text-slate-900 leading-tight">أدوات الإنقاذ والدعم الفني الميداني</h3>
            <p class="text-[11px] text-slate-400 font-medium mt-0.5">حل تحديات شاشة الكاشير، استعادة PIN، فك قفل الساعة، وجلسات المطور</p>
          </div>
        </div>
        <button type="button" onclick="closeModal('offlineRescueModal')" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Scrollable Modal Body -->
      <div class="p-4 sm:p-5 pb-8 sm:pb-10 overflow-y-auto flex-1 space-y-3.5 custom-scroll">

      <!-- License Context Banner -->
      <div id="rescueLicenseBanner" class="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs min-w-0 overflow-hidden">
        <div class="flex items-center gap-3">
          <div class="space-y-0.5">
            <span class="text-[10px] text-emerald-800 font-bold block">المنشأة:</span>
            <strong id="rescueShopNameDisplay" class="text-emerald-950 font-black text-xs">سوبرماركت البركة</strong>
          </div>
          <div class="w-px h-6 bg-emerald-200"></div>
          <div class="space-y-0.5">
            <span class="text-[10px] text-emerald-800 font-bold block">رمز الترخيص:</span>
            <span id="rescueLicenseKeyDisplay" class="font-mono text-emerald-900 font-bold text-xs select-all">RFQ-XXXX-XXXX</span>
          </div>
        </div>
        <div class="space-y-0.5 text-left">
          <span class="text-[10px] text-emerald-800 font-bold block text-right">بصمة الجهاز (HWID):</span>
          <span id="rescueHwidDisplay" class="font-mono text-[11px] text-emerald-900 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 select-all block break-all text-left [overflow-wrap:anywhere] max-w-full" dir="ltr">...</span>
        </div>
      </div>

      <!-- Pending Unbound Warning (shown if license is not bound yet) -->
      <div id="rescueUnboundAlert" style="display:none;" class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>هذا الترخيص جديد ولم يتم تفعيله بعد على كمبيوتر العميل (بانتظار التفعيل). إذا كان الجهاز معطلاً أوفلاين، أدخل بصمة جهازه أدناه.</span>
      </div>

      <!-- 3 Primary Rescue Tool Cards (Spacious, Zero-Cramping Grid) -->
      <div class="grid grid-cols-3 gap-1.5 sm:gap-2.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold">
        <button type="button" id="btnRescueTabRootSession" onclick="switchRescueSubTab('root-session')" class="p-2 sm:p-3 rounded-xl text-center transition flex flex-col items-center justify-center gap-1 sm:gap-1.5 bg-white text-purple-900 shadow-xs cursor-pointer border border-purple-200/50">
          <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          </div>
          <span class="font-black text-[11px] sm:text-xs leading-none truncate w-full">جلسة مطور</span>
          <span class="hidden sm:block text-[10px] text-purple-700/70 font-normal">فتح وضع المطور 15 دقيقة</span>
        </button>

        <button type="button" id="btnRescueTabPinRecovery" onclick="switchRescueSubTab('pin-recovery')" class="p-2 sm:p-3 rounded-xl text-center transition flex flex-col items-center justify-center gap-1 sm:gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer border border-transparent">
          <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <span class="font-black text-[11px] sm:text-xs leading-none truncate w-full">استعادة PIN</span>
          <span class="hidden sm:block text-[10px] text-slate-400 font-normal">تصفير رمز PIN للكاشير</span>
        </button>

        <button type="button" id="btnRescueTabClockReset" onclick="switchRescueSubTab('clock-reset')" class="p-2 sm:p-3 rounded-xl text-center transition flex flex-col items-center justify-center gap-1 sm:gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer border border-transparent">
          <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          </div>
          <span class="font-black text-[11px] sm:text-xs leading-none truncate w-full">فك قفل الساعة</span>
          <span class="hidden sm:block text-[10px] text-slate-400 font-normal">فك تلاعب التاريخ والوقت</span>
        </button>
      </div>

      <!-- Tool 1: Developer Root Session (SEC-01) -->
      <div id="rescueSecRootSession" class="space-y-3">
        <div class="bg-purple-50 p-3 rounded-xl border border-purple-200/80 text-[11px] text-purple-900 leading-relaxed">
          حل تحدي التشفير المؤقت (HMAC-SHA256 Challenge) لفتح صلاحيات وضع المطور لمدة 15 دقيقة على شاشة الكاشير.
        </div>
        
        <!-- Known Bound HWID Badge -->
        <div id="rootBoundFpBox" class="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 min-w-0 overflow-hidden">
          <span class="text-slate-500 font-bold shrink-0">بصمة جهاز العميل (مثبتة تلقائياً):</span>
          <span id="rootBoundFpDisplay" class="font-mono font-bold text-slate-800 select-all break-all text-left [overflow-wrap:anywhere] text-[11px] leading-tight block max-w-full" dir="ltr"></span>
        </div>

        <form novalidate onsubmit="handleRootSessionChallenge(event)" class="space-y-3">
          <div id="rootUnboundFpBox" style="display:none;">
            <label class="block text-xs font-bold text-slate-700 mb-1">بصمة الجهاز (HWID) *:</label>
            <input type="text" id="rootManualFpInput" placeholder="أدخل بصمة الجهاز الظاهرة على شاشة العميل..." class="w-full font-mono text-xs text-left" dir="ltr">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">كود التحدي الظاهر على شاشة العميل (Challenge Code) *:</label>
            <input type="text" id="rootChallengeInput" required placeholder="مثال: 7WA8-G7J2-0B أو RFQ-DBG-..." class="w-full font-mono text-xs text-left font-bold" dir="ltr">
          </div>
          <button type="submit" id="btnRootSubmit" class="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <span>توليد رمز الاستجابة المؤقت (15 دقيقة)</span>
          </button>
        </form>

        <!-- Result Box 1 -->
        <div id="rootSessionResultBox" style="display:none;" class="p-3.5 bg-purple-50 rounded-2xl border border-purple-300 space-y-2">
          <div class="flex items-center justify-between text-xs font-bold text-purple-900">
            <span class="flex items-center gap-1.5">
              <svg class="w-4 h-4 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>تم توليد رمز جلسة المطور بنجاح!</span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="rootSessionResultToken" readonly class="w-full font-mono text-xs font-bold bg-slate-900 text-purple-300 p-2.5 rounded-xl border border-slate-800 select-all text-left" dir="ltr" onclick="this.select()">
            <button type="button" onclick="copyFromInput('rootSessionResultToken', 'رمز جلسة المطور')" class="px-3 py-2.5 bg-purple-900 hover:bg-purple-950 text-white font-bold rounded-xl text-xs transition shrink-0 flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>نسخ الرمز</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tool 2: PIN Recovery (SEC-02) -->
      <div id="rescueSecPinRecovery" style="display:none;" class="space-y-3">
        <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-900 leading-relaxed">
          حل كود تحدي PIN الظاهر للكاشير لفتح النظام وتصفير الرمز السري في حالات نسيان كلمة المرور.
        </div>

        <div id="pinBoundNotice" class="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1.5 min-w-0 overflow-hidden">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 min-w-0">
            <span class="font-bold shrink-0">بصمة الجهاز المربوطة:</span>
            <span id="pinBoundFpDisplay" class="font-mono font-bold text-emerald-800 select-all break-all text-left [overflow-wrap:anywhere] text-[11px] leading-tight block max-w-full" dir="ltr"></span>
          </div>
          <div class="text-[11px] text-emerald-700">الترخيص مربوط ومحقق بالسيرفر، انقر أدناه لتوليد كود فك PIN فوراً بنقرة واحدة.</div>
        </div>

        <form novalidate onsubmit="handleDirectPinRecovery(event)" class="space-y-3">
          <div id="pinUnboundInputBox" style="display:none;">
            <label class="block text-xs font-bold text-slate-700 mb-1">كود تحدي PIN أو بصمة الجهاز *:</label>
            <input type="text" id="directRecCodeInput" placeholder="أدخل بصمة الجهاز أو كود التحدي..." class="w-full font-mono text-xs text-left font-bold" dir="ltr">
          </div>
          <button type="submit" id="btnPinRecoverySubmit" class="w-full py-2.5 bg-[#006d41] hover:bg-[#005634] text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>توليد رمز استعادة PIN فوراً</span>
          </button>
        </form>

        <!-- Result Box 2 -->
        <div id="pinRecoveryResultBox" style="display:none;" class="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-2">
          <div class="flex items-center justify-between text-xs font-bold text-emerald-900">
            <span class="flex items-center gap-1.5">
              <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>تم توليد كود استعادة PIN بنجاح!</span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="pinRecoveryResultToken" readonly class="w-full font-mono text-xs font-bold bg-slate-900 text-emerald-300 p-2.5 rounded-xl border border-slate-800 select-all text-left" dir="ltr" onclick="this.select()">
            <button type="button" onclick="copyFromInput('pinRecoveryResultToken', 'رمز استعادة PIN')" class="px-3 py-2.5 bg-[#00372d] hover:bg-[#00261f] text-white font-bold rounded-xl text-xs transition shrink-0 flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>نسخ الرمز</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tool 3: Clock Reset (BUG-06) -->
      <div id="rescueSecClockReset" style="display:none;" class="space-y-3">
        <div class="bg-blue-50 p-3 rounded-xl border border-blue-200/80 text-[11px] text-blue-900 leading-relaxed">
          فك قفل التلاعب بالتاريخ والتوقيت في بيئة العميل الأوفلاين وإعادة مزامنة ساعة النظام.
        </div>

        <div id="clockBoundNotice" class="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1.5 min-w-0 overflow-hidden">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 min-w-0">
            <span class="font-bold shrink-0">بصمة الجهاز المربوطة:</span>
            <span id="clockBoundFpDisplay" class="font-mono font-bold text-blue-800 select-all break-all text-left [overflow-wrap:anywhere] text-[11px] leading-tight block max-w-full" dir="ltr"></span>
          </div>
          <div class="text-[11px] text-blue-700">الترخيص مربوط ومحقق بالسيرفر، انقر أدناه لتوليد كود فك حظر الساعة فوراً.</div>
        </div>

        <form novalidate onsubmit="handleClockReset(event)" class="space-y-3">
          <div id="clockUnboundInputBox" style="display:none;">
            <label class="block text-xs font-bold text-slate-700 mb-1">كود ساعة العميل أو بصمة الجهاز *:</label>
            <input type="text" id="clockResetCodeInput" placeholder="أدخل بصمة الجهاز أو كود ساعة العميل..." class="w-full font-mono text-xs text-left font-bold" dir="ltr">
          </div>
          <button type="submit" id="btnClockResetSubmit" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
            <span>توليد كود فك حظر الساعة فوراً</span>
          </button>
        </form>

        <!-- Result Box 3 -->
        <div id="clockResetResultBox" style="display:none;" class="p-3.5 bg-blue-50 rounded-2xl border border-blue-300 space-y-2">
          <div class="flex items-center justify-between text-xs font-bold text-blue-900">
            <span class="flex items-center gap-1.5">
              <svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>تم توليد رمز فك حظر الساعة بنجاح!</span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="clockResetResultToken" readonly class="w-full font-mono text-xs font-bold bg-slate-900 text-sky-300 p-2.5 rounded-xl border border-slate-800 select-all text-left" dir="ltr" onclick="this.select()">
            <button type="button" onclick="copyFromInput('clockResetResultToken', 'رمز ضبط الساعة')" class="px-3 py-2.5 bg-blue-900 hover:bg-blue-950 text-white font-bold rounded-xl text-xs transition shrink-0 flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>نسخ الرمز</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Collapsible Section: Optional Offline RSA License Generator -->
      <div class="pt-2 border-t border-slate-100">
        <button type="button" id="btnToggleOfflineCodeSec" onclick="toggleOfflineSupportCodeSection()" class="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 font-bold text-xs flex items-center justify-between transition cursor-pointer">
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span>توليد كود تفعيل أوفلاين بديل (RFQ-SUP) مشفر بالبصمة</span>
          </span>
          <svg id="offlineSecChevron" class="w-4 h-4 text-slate-400 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        <div id="rescueSecOfflineCode" style="display:none;" class="space-y-3 pt-3">
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
            توليد كود ترخيص فوري موقع رقمياً بمفتاح RSA يعمل أوفلاين للأجهزة غير المتصلة بالإنترنت.
          </div>
          <form novalidate onsubmit="handleGenerateSupportCode(event)" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">بصمة جهاز العميل (Device Fingerprint / HWID) *:</label>
                <input type="text" id="offlineDeviceFp" required placeholder="مثال: 78BFEBFB000806EA..." class="w-full font-mono text-xs text-left" dir="ltr">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة أو المحل:</label>
                <input type="text" id="offlineShopName" placeholder="سوبرماركت البركة" class="w-full text-xs">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">نوع وخطة الصلاحية *:</label>
              <div class="custom-select-container" id="wrapper-offlineDurationSelect">
                <input type="hidden" id="offlineDurationSelect" value="lifetime">
                <button type="button" class="custom-select-trigger" onclick="toggleCustomSelect('offlineDurationSelect', event)">
                  <span class="custom-select-label">دائم مدى الحياة (Lifetime)</span>
                  <svg class="custom-select-chevron w-4 h-4 text-[#006D41] transition-transform duration-200 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div id="options-offlineDurationSelect" class="custom-select-options hidden">
                  <div class="custom-option selected" data-value="lifetime" onclick="selectCustomOption('offlineDurationSelect', 'lifetime', 'دائم مدى الحياة (Lifetime)', event)">
                    <span>دائم مدى الحياة (Lifetime)</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-option" data-value="365" onclick="selectCustomOption('offlineDurationSelect', '365', 'اشتراك سنوي (365 يوم / سنة)', event)">
                    <span>اشتراك سنوي (365 يوم / سنة)</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-option" data-value="180" onclick="selectCustomOption('offlineDurationSelect', '180', 'اشتراك نصف سنوي (180 يوم / 6 أشهر)', event)">
                    <span>اشتراك نصف سنوي (180 يوم / 6 أشهر)</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-option" data-value="90" onclick="selectCustomOption('offlineDurationSelect', '90', 'اشتراك ربع سنوي (90 يوم / 3 أشهر)', event)">
                    <span>اشتراك ربع سنوي (90 يوم / 3 أشهر)</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-option" data-value="30" onclick="selectCustomOption('offlineDurationSelect', '30', 'اشتراك شهري (30 يوم)', event)">
                    <span>اشتراك شهري (30 يوم)</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-option" data-value="14" onclick="selectCustomOption('offlineDurationSelect', '14', 'فترة تجريبية (14 يوم)', event)">
                    <span>فترة تجريبية (14 يوم)</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="custom-option" data-value="custom" onclick="selectCustomOption('offlineDurationSelect', 'custom', 'مدة مخصصة (أيام محددة)...', event)">
                    <span>مدة مخصصة (أيام محددة)...</span>
                    <svg class="custom-option-check w-4 h-4 text-[#006D41] hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
              </div>
            </div>
            <div id="offlineCustomDaysWrapper" style="display:none;">
              <label class="block text-xs font-bold text-slate-700 mb-1">عدد الأيام المخصصة:</label>
              <input type="number" id="offlineCustomDaysInput" min="1" max="9999" placeholder="مثال: 60" class="w-full text-xs">
            </div>
            <button type="submit" id="btnGenSupport" class="w-full py-2.5 bg-[#006d41] hover:bg-[#005634] text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
              <span>توليد كود الدعم الأوفلاين المشفر</span>
            </button>
          </form>

          <!-- Result Box Offline Code -->
          <div id="offlineResultBox" style="display:none;" class="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-2">
            <div class="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>تم توليد كود التفعيل بنجاح!</span>
              </span>
              <span id="offlineRegisteredKeyDisplay" class="font-mono text-[11px] text-emerald-800"></span>
            </div>
            <div class="flex items-center gap-2">
              <input type="text" id="offlineResultCode" readonly class="w-full font-mono text-xs font-bold bg-slate-900 text-sky-300 p-2.5 rounded-xl border border-slate-800 select-all text-left" dir="ltr" onclick="this.select()">
              <button type="button" onclick="copyOfflineResultCode()" class="px-3 py-2.5 bg-[#00372d] hover:bg-[#00261f] text-white font-bold rounded-xl text-xs transition shrink-0 flex items-center gap-1 cursor-pointer">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>نسخ الكود</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- Modal Footer (Compact & Seamless) -->
      <div class="flex items-center justify-end px-5 py-2.5 border-t border-slate-100 shrink-0 bg-slate-50/60 rounded-b-[22px]">
        <button type="button" onclick="closeModal('offlineRescueModal')" class="px-5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 hover:border-slate-300 transition cursor-pointer text-center shadow-2xs">إغلاق</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast" style="display:none !important;"></div>
  <!-- ========================================================================= -->
  <!-- 8. MOBILE BOTTOM NAVIGATION DOCK (Thumb-Friendly Native Mobile Feel)       -->
  <!-- ========================================================================= -->
  <nav id="mobile-bottom-nav">
    <button type="button" onclick="switchMainTab('licenses')" id="bottomNavLicenses" class="mobile-bottom-tab active" title="التراخيص والمنشآت">
      <div class="mobile-bottom-tab-icon">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
      </div>
      <span class="mobile-bottom-tab-label">التراخيص</span>
    </button>
    <button type="button" onclick="switchMainTab('releases')" id="bottomNavReleases" class="mobile-bottom-tab" title="التحديثات الهوائية (OTA)">
      <div class="mobile-bottom-tab-icon">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <span class="mobile-bottom-tab-label">التحديثات</span>
    </button>
    <button type="button" onclick="switchMainTab('logs')" id="bottomNavLogs" class="mobile-bottom-tab" title="سجل التدقيق والأمان">
      <div class="mobile-bottom-tab-icon">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </div>
      <span class="mobile-bottom-tab-label">السجل</span>
    </button>
  </nav>

`;
