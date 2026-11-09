/**
 * Admin Dashboard Design Tokens & CSS Styles
 * Identity: Forest Green #00372d & Emerald #006d41
 */
export const adminStyles = `    :root {
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
      --shadow-md: 0 4px 14px rgba(0,0,0,0.06);
      --shadow-lg: 0 10px 25px rgba(0,55,45,0.12), 0 2px 6px rgba(0,0,0,0.04);
      --radius-xl: 16px;
      --radius-lg: 12px;
      --radius-md: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', 'IBM Plex Sans Arabic', 'Cairo', 'Readex Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; line-height: 1.5; font-size: 14px; font-weight: 500; }

    /* Crisp SVG Icons */
    .icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      stroke-width: 2.2;
      stroke: currentColor;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .icon-sm { width: 13px; height: 13px; stroke-width: 2.3; }
    .icon-lg { width: 22px; height: 22px; stroke-width: 2; }

    /* Top Bar */
    .topbar {
      background-color: var(--primary);
      color: white;
      padding: 12px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
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
      margin-inline-start: 4px;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }
    .nav-tab.active .tab-badge {
      background: var(--emerald);
      color: #ffffff;
    }
    .tab-text-short {
      display: none;
    }
    .tab-text-full {
      display: inline;
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
      box-shadow: var(--shadow-sm);
      overflow: visible;
    }
    .panel-form {
      overflow: visible !important;
    }
    .panel-table {
      overflow: hidden;
    }
    .panel-header {
      padding: 16px 22px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafbfc;
      border-top-left-radius: var(--radius-xl);
      border-top-right-radius: var(--radius-xl);
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
      overflow: visible !important;
    }

    /* Creation Form Layout */
    .create-grid {
      display: grid;
      grid-template-columns: 2fr 1.3fr 1.5fr 1fr auto;
      gap: 14px;
      align-items: flex-end;
      overflow: visible !important;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
    }
    .field label {
      font-size: 11.5px;
      font-weight: 800;
      color: #334155;
    }
    .field input, .field select {
      height: 40px;
      padding: 0 14px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      background: #fff;
      transition: border-color 0.15s, box-shadow 0.15s;
      font-family: inherit;
    }
    .field input:focus, .field select:focus {
      outline: none;
      border-color: var(--emerald);
      box-shadow: 0 0 0 3px rgba(0,109,65,0.14);
    }
    .field select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23006D41' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: left 14px center;
      background-size: 16px;
      padding-left: 38px;
      cursor: pointer;
    }

    /* Rafiq POS Custom Luxury Select Component */
    .rafiq-select {
      position: relative;
      width: 100%;
      user-select: none;
      z-index: 10;
    }
    .rafiq-select.open {
      z-index: 1000 !important;
    }
    .rafiq-select-trigger {
      width: 100%;
      height: 40px;
      padding: 0 14px;
      background: #ffffff;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
      font-family: inherit;
    }
    .rafiq-select-trigger:hover {
      border-color: var(--emerald-border);
      background: #fafcfb;
    }
    .rafiq-select.open .rafiq-select-trigger,
    .rafiq-select-trigger:focus {
      border-color: var(--emerald);
      box-shadow: 0 0 0 3px rgba(0, 109, 65, 0.14);
    }
    .rafiq-select-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 700;
      color: var(--text);
    }
    .rafiq-select-arrow {
      width: 16px;
      height: 16px;
      stroke: var(--emerald);
      stroke-width: 2.5;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.2s ease;
      flex-shrink: 0;
      margin-right: 8px;
    }
    .rafiq-select.open .rafiq-select-arrow {
      transform: rotate(180deg);
    }
    .rafiq-select-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      background: #ffffff;
      border: 1.5px solid var(--emerald-border);
      border-radius: var(--radius-lg);
      box-shadow: 0 16px 36px rgba(0, 55, 45, 0.22), 0 4px 12px rgba(0,0,0,0.08);
      z-index: 9999 !important;
      max-height: 280px;
      overflow-y: auto;
      padding: 6px;
      display: none;
      animation: rafiqSelectFade 0.15s ease-out;
    }
    .rafiq-select-menu.open-up {
      top: auto;
      bottom: calc(100% + 6px);
      box-shadow: 0 -16px 36px rgba(0, 55, 45, 0.22), 0 -4px 12px rgba(0,0,0,0.08);
    }
    @keyframes rafiqSelectFade {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .rafiq-select.open .rafiq-select-menu {
      display: block;
    }
    .rafiq-select-option {
      padding: 9px 12px;
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      border-radius: var(--radius-md);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.12s ease;
    }
    .rafiq-select-option:hover {
      background: var(--emerald-soft);
      color: var(--emerald);
    }
    .rafiq-select-option.selected {
      background: var(--emerald);
      color: #ffffff;
    }
    .rafiq-select-option.selected:hover {
      background: var(--primary);
      color: #ffffff;
    }
    .rafiq-select-option .check-icon {
      width: 15px;
      height: 15px;
      stroke: currentColor;
      stroke-width: 2.5;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
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
      width: 360px;
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-icon-inside {
      position: absolute;
      right: 12px;
      pointer-events: none;
      color: var(--text-muted);
    }
    .search-box input {
      width: 100%;
      height: 38px;
      padding: 0 14px 0 14px;
      padding-right: 36px;
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
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: #eef2f1;
      padding: 3px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
    }
    .filter-tab {
      background: transparent;
      border: 1px solid transparent;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 800;
      color: var(--text-muted);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      user-select: none;
      white-space: nowrap;
    }
    .filter-tab:hover {
      color: var(--primary);
      background: rgba(255, 255, 255, 0.6);
    }
    .filter-tab.active {
      background: white;
      color: var(--emerald);
      border-color: rgba(0, 109, 65, 0.15);
      box-shadow: 0 2px 6px rgba(0, 55, 45, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
      transform: scale(1.02);
    }
    .filter-tab.active.danger {
      background: white;
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.2);
      box-shadow: 0 2px 6px rgba(220, 38, 38, 0.08);
    }
    .filter-tab.active.success {
      background: white;
      color: var(--emerald);
      border-color: rgba(0, 109, 65, 0.2);
      box-shadow: 0 2px 6px rgba(0, 109, 65, 0.08);
    }
    .filter-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      font-size: 10.5px;
      font-weight: 800;
      font-family: ui-monospace, monospace;
      border-radius: 9999px;
      background: #dce1dc;
      color: #52605d;
      transition: all 0.2s ease;
    }
    .filter-tab.active .filter-count {
      background: var(--emerald-soft);
      color: var(--emerald);
      border: 1px solid var(--emerald-border);
    }
    .filter-tab.active.danger .filter-count {
      background: var(--danger-bg);
      color: var(--danger);
      border: 1px solid var(--danger-border);
    }
    .filter-tab.active.success .filter-count {
      background: var(--emerald-soft);
      color: var(--emerald);
      border: 1px solid var(--emerald-border);
    }

    /* Table Smooth Staggered Row Animation */
    @keyframes tableRowSlideIn {
      0% {
        opacity: 0;
        transform: translateY(8px);
      }
      100% {
        opacity: 1;
        transform: none;
      }
    }
    .table-row-animated {
      animation: tableRowSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      animation-delay: calc(var(--delay, 0) * 30ms);
    }

    /* Sleek Custom Scrollbar & Min-Height (Prevents Content Jumping) */
    .table-responsive-container {
      min-height: 420px;
      overflow-x: auto;
      overflow-y: visible;
      padding-bottom: 90px;
      scrollbar-width: thin;
      scrollbar-color: #006D41 #E6F2ED;
      -webkit-overflow-scrolling: touch;
      position: relative;
    }
    .table-responsive-container::-webkit-scrollbar {
      height: 7px;
    }
    .table-responsive-container::-webkit-scrollbar-track {
      background: #E6F2ED;
      border-radius: 9999px;
      border: 1px solid #DCE1DC;
    }
    .table-responsive-container::-webkit-scrollbar-thumb {
      background-color: #006D41;
      border-radius: 9999px;
      border: 1.5px solid transparent;
      background-clip: padding-box;
    }
    .table-responsive-container::-webkit-scrollbar-thumb:hover {
      background-color: #004D3F;
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
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 800;
      color: #475569;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
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
      padding: 4px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: 0.01em;
    }
    .pill-active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .pill-pending { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
    .pill-disabled { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .pill-expired { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    /* Action Types Pills for Logs */
    .action-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11.5px;
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
      padding: 5px 10px;
      font-size: 11.5px;
      font-weight: 800;
      color: #334155;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
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
    .btn-row-device {
      color: #0f766e;
      border-color: #99f6e4;
      background: #f0fdfa;
    }
    .btn-row-device:hover {
      background: #ccfbf1;
      border-color: #5eead4;
    }
    .btn-row-root {
      color: #7c3aed;
      border-color: #ddd6fe;
      background: #f5f3ff;
      font-weight: 700;
    }
    .btn-row-root:hover {
      background: #ede9fe;
      border-color: #c4b5fd;
    }
    .root-otp-box {
      background: #0f172a;
      border: 2px solid #8b5cf6;
      border-radius: var(--radius-lg);
      padding: 18px 24px;
      text-align: center;
      margin: 16px 0;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.25);
    }
    .root-otp-number {
      font-size: 34px;
      font-family: monospace;
      font-weight: 900;
      letter-spacing: 8px;
      color: #38bdf8;
      text-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
    }

    /* Table Row Stacking for Dropdown Menus */
    tbody tr.has-open-menu {
      position: relative !important;
      z-index: 1000 !important;
      transform: none !important;
    }
    tbody tr.has-open-menu td {
      position: relative !important;
      z-index: 1000 !important;
    }

    /* Actions Dropdown Menu - Luxury Senior Engineered */
    .dropdown-actions {
      position: relative;
      display: inline-block;
    }
    .dropdown-actions.open {
      position: relative !important;
      z-index: 10000 !important;
    }
    .btn-actions-menu {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      color: var(--primary);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-actions-menu:hover,
    .btn-actions-menu.active {
      background: #f0fdf4;
      border-color: var(--emerald);
      color: var(--emerald);
      box-shadow: 0 2px 10px rgba(0, 109, 65, 0.14);
    }
    tr.has-open-menu {
      position: relative;
      z-index: 9999;
      transform: none !important;
      animation: none !important;
    }
    tr.has-open-menu td {
      position: relative;
      z-index: 9999;
    }
    .actions-dropdown-menu {
      position: fixed;
      min-width: 235px;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      box-shadow: 0 16px 36px rgba(0, 55, 45, 0.22), 0 4px 14px rgba(0,0,0,0.12);
      z-index: 9999999;
      padding: 6px;
      display: none;
      text-align: right;
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: #006D41 #E6F2ED;
      overscroll-behavior: contain;
    }
    .actions-dropdown-menu::-webkit-scrollbar {
      width: 5px;
    }
    .actions-dropdown-menu::-webkit-scrollbar-track {
      background: #E6F2ED;
      border-radius: 9999px;
    }
    .actions-dropdown-menu::-webkit-scrollbar-thumb {
      background: #006D41;
      border-radius: 9999px;
    }
    .actions-dropdown-menu::-webkit-scrollbar-thumb:hover {
      background: #004D3F;
    }
    .actions-dropdown-menu.show {
      display: block;
    }
    .actions-dropdown-menu.show.placement-bottom {
      transform-origin: top right;
      animation: menuFadeInDown 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .actions-dropdown-menu.show.placement-top {
      transform-origin: bottom right;
      animation: menuFadeInUp 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes menuFadeInDown {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes menuFadeInUp {
      from { opacity: 0; transform: translateY(6px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .actions-menu-item {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
      text-align: right;
    }
    .actions-menu-item:hover {
      background: #f1f5f9;
      color: var(--primary);
    }
    .actions-menu-item.item-root {
      color: #7c3aed;
    }
    .actions-menu-item.item-root:hover {
      background: #f5f3ff;
      color: #6d28d9;
    }
    .actions-menu-item.item-recovery {
      color: #0f766e;
    }
    .actions-menu-item.item-recovery:hover {
      background: #f0fdfa;
      color: #0d9488;
    }
    .actions-menu-item.item-danger {
      color: #b91c1c;
    }
    .actions-menu-item.item-danger:hover {
      background: #fef2f2;
      color: #dc2626;
    }
    .actions-menu-divider {
      height: 1px;
      background: #e2e8f0;
      margin: 4px 0;
    }
    .btn-fp-badge {
      background: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: monospace;
      font-weight: 700;
      color: #0f766e;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .btn-fp-badge:hover {
      background: #ccfbf1;
      border-color: #2dd4bf;
      transform: translateY(-1px);
      box-shadow: 0 2px 5px rgba(15,118,110,0.12);
    }

    /* ========================================== */
    /* CUSTOM LUXURY PAGE SIZE DROPDOWN (Zero OS) */
    /* ========================================== */
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
      gap: 12px;
    }
    
    .custom-dropdown-container {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .custom-dropdown-trigger {
      height: 32px;
      padding: 0 12px;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 12px;
      font-weight: 800;
      color: var(--primary);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
    }
    .custom-dropdown-trigger:hover {
      background: #f1f5f4;
      border-color: var(--emerald);
    }
    .custom-dropdown-menu {
      position: absolute;
      bottom: calc(100% + 6px);
      right: 0;
      min-width: 140px;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 6px;
      z-index: 50;
      display: none;
      flex-direction: column;
      gap: 2px;
      animation: popupOpen 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .custom-dropdown-menu.show {
      display: flex;
    }
    @keyframes popupOpen {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .custom-dropdown-item {
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.1s, color 0.1s;
    }
    .custom-dropdown-item:hover {
      background: #f1f5f4;
      color: var(--primary);
    }
    .custom-dropdown-item.selected {
      background: var(--emerald-soft);
      color: var(--emerald);
      font-weight: 900;
    }
    .custom-dropdown-check {
      color: var(--emerald);
      opacity: 0;
    }
    .custom-dropdown-item.selected .custom-dropdown-check {
      opacity: 1;
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
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* Legacy Modal Classes (Deprecated - See Bulletproof Modal System below) */
    .modal-header {
      background: var(--primary);
      color: white;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top-left-radius: var(--radius-xl);
      border-top-right-radius: var(--radius-xl);
    }
    .modal-header h4 {
      font-size: 14.5px;
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 8px;
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
      overflow: visible !important;
    }
    .modal-footer {
      padding: 14px 20px;
      background: #f8fafc;
      border-bottom-left-radius: var(--radius-xl);
      border-bottom-right-radius: var(--radius-xl);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      border-top: 1px solid var(--border);
    }

    /* Login Screen & Luxury Security Gateway */
    #login-screen,
    .login-overlay {
      display: none;
      position: fixed !important;
      inset: 0 !important;
      background: radial-gradient(ellipse at 50% 25%, #004d3f 0%, #00372d 45%, #001813 100%) !important;
      z-index: 99999 !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 24px 16px !important;
      box-sizing: border-box !important;
      overflow-y: auto !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
    }

    .login-card,
    .login-box {
      background: #ffffff !important;
      border-radius: 24px !important;
      padding: 38px 32px 32px 32px !important;
      width: 100% !important;
      max-width: 420px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 20px !important;
      box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 109, 65, 0.15) !important;
      box-sizing: border-box !important;
      position: relative !important;
      text-align: center !important;
      margin: auto !important;
    }

    .login-logo-box {
      width: 68px !important;
      height: 68px !important;
      border-radius: 20px !important;
      background: linear-gradient(135deg, #e6f2ed 0%, #d8ece4 100%) !important;
      padding: 10px !important;
      border: 1.5px solid rgba(0, 109, 65, 0.25) !important;
      box-shadow: 0 8px 20px -4px rgba(0, 109, 65, 0.2) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 auto 4px auto !important;
    }

    .login-title,
    .login-box h3 {
      font-size: 20px !important;
      font-weight: 900 !important;
      color: #00372d !important;
      margin: 0 0 6px 0 !important;
      line-height: 1.3 !important;
      letter-spacing: -0.3px !important;
      display: block !important;
    }

    .login-subtitle,
    .login-box p {
      font-size: 13px !important;
      font-weight: 500 !important;
      color: #52605d !important;
      line-height: 1.55 !important;
      margin: 0 !important;
      display: block !important;
    }

    .login-error-box,
    #loginError {
      padding: 10px 14px !important;
      border-radius: 12px !important;
      background: #fff1f2 !important;
      border: 1.5px solid #fecdd3 !important;
      color: #be123c !important;
      font-size: 12.5px !important;
      font-weight: 700 !important;
      text-align: center !important;
      line-height: 1.4 !important;
      box-sizing: border-box !important;
    }

    .login-form {
      display: flex !important;
      flex-direction: column !important;
      gap: 16px !important;
      text-align: right !important;
      width: 100% !important;
      margin: 0 !important;
    }

    .login-label {
      display: block !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
      margin-bottom: 8px !important;
      text-align: right !important;
    }

    .login-input-wrap {
      position: relative !important;
      width: 100% !important;
      display: flex !important;
      align-items: center !important;
    }

    .login-input {
      width: 100% !important;
      height: 48px !important;
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 14px !important;
      padding: 0 44px 0 16px !important;
      font-size: 15px !important;
      font-weight: 600 !important;
      color: #0f172a !important;
      background-color: #f8fafc !important;
      transition: all 0.2s ease !important;
      box-sizing: border-box !important;
      font-family: inherit !important;
      text-align: right !important;
    }

    .login-input:focus {
      outline: none !important;
      background-color: #ffffff !important;
      border-color: #006d41 !important;
      box-shadow: 0 0 0 4px rgba(0, 109, 65, 0.14) !important;
    }

    .login-pw-toggle {
      position: absolute !important;
      left: 12px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      background: transparent !important;
      border: none !important;
      padding: 6px !important;
      cursor: pointer !important;
      color: #94a3b8 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 8px !important;
      transition: color 0.15s ease !important;
    }

    .login-pw-toggle:hover {
      color: #006d41 !important;
    }

    .login-btn,
    .login-box button {
      width: 100% !important;
      height: 48px !important;
      border-radius: 14px !important;
      background: linear-gradient(135deg, #006d41 0%, #004d3f 100%) !important;
      color: #ffffff !important;
      font-size: 15px !important;
      font-weight: 800 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      border: none !important;
      cursor: pointer !important;
      box-shadow: 0 4px 14px rgba(0, 109, 65, 0.3) !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      font-family: inherit !important;
      text-decoration: none !important;
    }

    .login-btn:hover,
    .login-box button:hover {
      background: linear-gradient(135deg, #007a4a 0%, #005a49 100%) !important;
      box-shadow: 0 6px 20px rgba(0, 109, 65, 0.4) !important;
      transform: translateY(-1px) !important;
    }

    .login-btn:active,
    .login-box button:active {
      transform: scale(0.98) !important;
    }

    .login-btn:disabled,
    .login-box button:disabled {
      opacity: 0.7 !important;
      cursor: not-allowed !important;
      transform: none !important;
    }

    /* Master Toast Notification System: Top-Anchored, Never Clipped, Universal Visibility */
    #toast {
      position: fixed !important;
      top: 24px !important;
      left: 50% !important;
      bottom: auto !important;
      right: auto !important;
      transform: translateX(-50%) !important;
      z-index: 10000000 !important;
      display: none;
      align-items: center !important;
      gap: 10px !important;
      padding: 12px 20px !important;
      border-radius: 16px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.15) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      max-width: 520px !important;
      width: fit-content !important;
      animation: toastDrop 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    }
    @keyframes toastDrop {
      0% { opacity: 0; transform: translate(-50%, -14px) scale(0.96); }
      100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    }
    @media (max-width: 640px) {
      #toast {
        top: 14px !important;
        left: 12px !important;
        right: 12px !important;
        bottom: auto !important;
        transform: none !important;
        margin: 0 auto !important;
        max-width: calc(100vw - 24px) !important;
        width: fit-content !important;
        padding: 10px 16px !important;
        font-size: 12px !important;
        border-radius: 14px !important;
      }
      @keyframes toastDrop {
        0% { opacity: 0; transform: translateY(-12px) scale(0.96); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
    }

    /* Helper Components & Responsive Enhancements */
    .tabs-nav-extra {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-master-root {
      background: #f5f3ff;
      color: #7c3aed;
      border: 1px solid #ddd6fe;
      padding: 6px 14px;
      border-radius: var(--radius-md);
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .btn-master-root:hover {
      background: #ede9fe;
      border-color: #c4b5fd;
    }
    .tabs-nav-version {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--text-muted);
      white-space: nowrap;
    }
    .logs-filters-group {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .device-modal-banner {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .modal-footer-split {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .modal-footer-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .direct-rec-input-group {
      display: flex;
      gap: 8px;
    }

    /* ======================================================== */
    /* RESPONSIVE DESIGN SYSTEM (Desktop -> Tablet -> Mobile)    */
    /* ======================================================== */

    /* Tablet & Medium Screens (<= 1024px) */
    @media (max-width: 1024px) {
      .app-container {
        padding: 0 16px;
        margin: 16px auto;
        gap: 16px;
      }
      .kpi-row {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .create-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .create-grid .btn-create {
        grid-column: 1 / -1;
        width: 100%;
        justify-content: center;
        height: 42px;
      }
    }

    /* Small Tablets & Mobile Landscape (<= 768px) */
    @media (max-width: 768px) {
      /* Top Bar */
      .topbar {
        padding: 10px 14px;
        flex-wrap: nowrap;
        gap: 8px;
      }
      .topbar-brand {
        gap: 10px;
        min-width: 0;
      }
      .brand-mark {
        font-size: 13px;
        padding: 5px 10px;
      }
      .brand-title {
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .brand-sub {
        font-size: 10.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .topbar-actions {
        gap: 6px;
        flex-shrink: 0;
      }
      .sys-pill {
        padding: 4px 8px;
        font-size: 11px;
      }
      .btn-top {
        padding: 5px 10px;
        font-size: 11.5px;
      }

      /* Container */
      .app-container {
        padding: 0 10px;
        margin: 10px auto;
        gap: 12px;
      }

      /* Tabs Nav */
      .tabs-nav-wrapper {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }
      .tabs-nav {
        display: flex;
        width: 100%;
        padding: 5px;
        gap: 6px;
        border-radius: var(--radius-xl);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .tabs-nav::-webkit-scrollbar {
        display: none;
      }
      .nav-tab {
        flex: 1 1 auto;
        min-width: fit-content;
        justify-content: center;
        padding: 8px 14px;
        font-size: 12.5px;
        white-space: nowrap;
        gap: 6px;
      }
      .tab-text-short {
        display: inline;
      }
      .tab-text-full {
        display: none;
      }
      .tabs-nav-extra {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        width: 100%;
      }
      .btn-master-root {
        width: 100%;
        justify-content: center;
        padding: 9px 14px;
        font-size: 12.5px;
      }
      .tabs-nav-version {
        text-align: center;
        font-size: 10.5px;
      }

      /* Panels */
      .panel-header {
        padding: 12px 14px;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      .panel-body {
        padding: 14px 12px;
      }

      /* Form */
      .create-grid {
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .create-grid .btn-create {
        grid-column: 1;
        width: 100%;
        height: 44px;
        font-size: 14px;
        justify-content: center;
      }
      .field input, .field select, .rafiq-select-trigger {
        height: 42px;
        font-size: 14px;
      }

      /* Table Toolbar & Search */
      .table-bar {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 12px 12px;
      }
      .search-box {
        width: 100%;
      }
      .search-box input {
        height: 40px;
        font-size: 13px;
      }
      .filters {
        width: 100%;
        max-width: 100%;
        display: flex;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding: 3px;
        border-radius: var(--radius-md);
      }
      .filters::-webkit-scrollbar {
        display: none;
      }
      .filter-tab {
        flex-shrink: 0;
        padding: 6px 11px;
        font-size: 11.5px;
      }
      .logs-filters-group {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      /* Responsive Table Container */
      .table-responsive-container {
        min-height: 320px;
        padding-bottom: 75px;
      }
      th, td {
        padding: 10px 10px;
        font-size: 12px;
      }
      .key-text {
        font-size: 12px;
        padding: 2px 6px;
      }
      .btn-icon-copy {
        padding: 3px 6px;
        font-size: 10.5px;
      }
      .btn-actions-menu {
        padding: 5px 9px;
        font-size: 11px;
      }
      .actions-dropdown-menu {
        max-width: min(250px, calc(100vw - 28px));
      }

      /* Pagination Bar */
      .pagination-bar {
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
      }
      .pagination-info {
        width: 100%;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 11.5px;
      }
      .pagination-controls {
        width: 100%;
        justify-content: center;
        flex-wrap: wrap;
        gap: 4px;
      }
      .page-btn {
        min-width: 36px;
        height: 36px;
        font-size: 12.5px;
      }
        justify-content: center;
        font-size: 13px;
        margin: 0;
      }
      .modal-footer-split {
        flex-direction: column-reverse !important;
      }
      .modal-footer-actions {
        width: 100%;
        flex-direction: column;
      }
      .device-modal-banner {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        padding: 10px 12px;
      }
      .root-otp-number {
        font-size: clamp(22px, 7vw, 32px) !important;
        letter-spacing: clamp(4px, 1.8vw, 8px) !important;
      }
      .root-otp-box {
        padding: 12px 14px;
        margin: 10px 0;
      }
      .direct-rec-input-group {
        flex-direction: column;
        gap: 8px;
      }
      .direct-rec-input-group .btn-create {
        width: 100%;
        height: 42px;
        justify-content: center;
      }
    }

    /* Small Mobile Phones (<= 480px) */
    @media (max-width: 480px) {
      .topbar {
        padding: 8px 10px;
      }
      .brand-mark {
        font-size: 12px;
        padding: 4px 8px;
      }
      .brand-title {
        font-size: 13px;
      }
      .brand-sub {
        display: none;
      }
      .sys-pill-text {
        display: none;
      }
      .sys-pill {
        padding: 5px;
      }
      .btn-top {
        padding: 5px 8px;
        font-size: 11px;
      }
      .btn-top-label {
        font-size: 11px;
      }

      /* KPI Box Compact */
      .kpi-row {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      .kpi-box {
        padding: 10px 10px;
        border-radius: var(--radius-md);
      }
      .kpi-label {
        font-size: 10px;
      }
      .kpi-value {
        font-size: 18px;
      }
      .kpi-icon-box {
        width: 32px;
        height: 32px;
        border-radius: 6px;
      }
      .kpi-icon-box .icon {
        width: 15px;
        height: 15px;
      }

      /* Login Screen */
      #login-screen,
      .login-overlay {
        padding: 14px !important;
      }
      .login-card,
      .login-box {
        padding: 26px 18px 22px 18px !important;
        border-radius: 20px !important;
        gap: 16px !important;
      }
      .login-title,
      .login-box h3 {
        font-size: 17px !important;
      }
      .login-subtitle,
      .login-box p {
        font-size: 12px !important;
      }
      .login-btn,
      .login-box button {
        height: 46px !important;
        font-size: 14px !important;
      }

      /* Toast managed centrally by Master Toast System */
    }

    /* Extra Narrow Devices (<= 340px) */
    @media (max-width: 340px) {
      .kpi-row {
        grid-template-columns: 1fr;
      }
      .btn-top-label {
        display: none;
      }
    }
    /* ========================================================================= */
    /* BULLETPROOF MODAL SYSTEM: SAFE SPACER CENTERING + ZERO-CLIPPING GUARANTEE */
    /* ========================================================================= */
    .modal-backdrop, .modal-overlay {
      position: fixed !important;
      inset: 0 !important;
      background-color: rgba(15, 23, 42, 0.75) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      z-index: 9999 !important;
      display: none !important;
      padding: clamp(16px, 3.5vh, 32px) clamp(12px, 3vw, 24px) !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      opacity: 0;
      transition: opacity 0.18s ease-in-out;
    }
    .modal-backdrop.active, .modal-overlay.active {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      min-height: 100% !important;
      opacity: 1 !important;
    }
    /* Pure Flex Auto-Centering: margin: auto perfectly centers small modals and prevents flex top-clipping on large modals */
    .modal-card {
      position: relative !important;
      margin: auto !important;
      background-color: #ffffff !important;
      border-radius: 22px !important;
      box-shadow: 0 25px 65px -15px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(226, 232, 240, 0.9) !important;
      border: 1px solid rgba(226, 232, 240, 0.9) !important;
      animation: zoomInModal 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      width: 100% !important;
      flex-shrink: 0 !important;
      overflow: visible !important;
    }
    /* Specific modals that have edge-to-edge fixed header & footer: clip cleanly to border radius */
    #offlineRescueModal .modal-card,
    .modal-card.modal-card-clipped {
      overflow: hidden !important;
    }
    @media (max-width: 640px) {
      .modal-backdrop, .modal-overlay {
        padding: 12px 10px !important;
      }
      .modal-card {
        border-radius: 18px !important;
        margin: 0 !important;
        max-width: 100% !important;
      }
    }
    @keyframes zoomInModal {
      0% { opacity: 0; transform: scale(0.96) translateY(6px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* Custom Validation Error Highlight (Replaces Clunky Native Browser Tooltips) */
    .field-invalid,
    input.field-invalid,
    select.field-invalid,
    textarea.field-invalid {
      border-color: #ef4444 !important;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18) !important;
      background-color: #fef2f2 !important;
      animation: fieldShake 0.28s cubic-bezier(0.36, 0.07, 0.19, 0.97) both !important;
    }
    @keyframes fieldShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-4px); }
      40%, 80% { transform: translateX(4px); }
    }

    /* Custom Select System (Tailored, Zero-Ugly-Defaults, Floating Dropdowns) */
    .custom-select-container {
      position: relative !important;
      width: 100% !important;
    }
    .custom-select-trigger {
      width: 100% !important;
      min-height: 46px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 10px 16px !important;
      background-color: #ffffff !important;
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 12px !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #0f172a !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
      text-align: right !important;
    }
    .custom-select-trigger:hover {
      border-color: #006d41 !important;
      background-color: #fbfdfc !important;
    }
    .custom-select-trigger:focus,
    .custom-select-container.open .custom-select-trigger {
      border-color: #006d41 !important;
      box-shadow: 0 0 0 3px rgba(0, 109, 65, 0.12) !important;
      outline: none !important;
    }
    .custom-select-options {
      position: absolute !important;
      top: calc(100% + 6px) !important;
      left: 0 !important;
      right: 0 !important;
      max-height: 260px !important;
      overflow-y: auto !important;
      background: #ffffff !important;
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 14px !important;
      box-shadow: 0 20px 40px -4px rgba(0, 0, 0, 0.28) !important;
      z-index: 99999 !important;
      padding: 6px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 2px !important;
      scrollbar-width: thin !important;
      scrollbar-color: #006D41 #E6F2ED !important;
    }
    .custom-select-options::-webkit-scrollbar {
      width: 6px !important;
    }
    .custom-select-options {
      scrollbar-width: thin !important;
      scrollbar-color: #006D41 rgba(0, 55, 45, 0.05) !important;
      padding-inline-start: 8px !important;
      padding-inline-end: 6px !important;
    }
    .custom-select-options::-webkit-scrollbar-track {
      background: rgba(0, 55, 45, 0.05) !important;
      border-radius: 9999px !important;
      border: none !important;
      margin: 4px !important;
    }
    .custom-select-options::-webkit-scrollbar-thumb {
      background: #006D41 !important;
      border-radius: 9999px !important;
      border: 1px solid transparent !important;
      background-clip: padding-box !important;
    }
    .custom-select-options::-webkit-scrollbar-thumb:hover {
      background: #004D3F !important;
    }
    .custom-select-options.hidden {
      display: none !important;
    }
    .custom-option {
      padding: 10px 14px !important;
      border-radius: 10px !important;
      font-size: 13.5px !important;
      font-weight: 700 !important;
      color: #1e293b !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      transition: background 0.12s ease !important;
      user-select: none !important;
    }
    .custom-option:hover {
      background-color: #f1f5f9 !important;
      color: #006d41 !important;
    }
    .custom-option.selected {
      background-color: #e8f5ed !important;
      color: #006d41 !important;
      font-weight: 800 !important;
    }

    
    /* Floating Action Dropdown Menu (Cards & Table Rows) */
    .floating-action-dropdown {
      position: fixed !important;
      z-index: 99999 !important;
      width: 280px !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.08) !important;
      padding: 8px !important;
      animation: menuPop 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
      overflow: hidden !important;
      pointer-events: auto !important;
    }
    @keyframes menuPop {
      0% { opacity: 0; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }
    .menu-item {
      width: 100% !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 11px 14px !important;
      border-radius: 10px !important;
      background: transparent !important;
      border: none !important;
      text-align: right !important;
      cursor: pointer !important;
      font-size: 13.5px !important;
      font-weight: 700 !important;
      font-family: inherit !important;
      transition: background 0.12s ease !important;
      user-select: none !important;
    }
    .menu-item:hover {
      background-color: #f1f5f9 !important;
    }

    /* ========================================================================= */
    /* LUXURY RAFIQ POS BRAND SCROLLBAR SYSTEM (Emerald / Forest Identity)       */
    /* ========================================================================= */
    html {
      scroll-behavior: smooth;
    }
    ::-webkit-scrollbar {
      width: 7px !important;
      height: 7px !important;
    }
    *::-webkit-scrollbar-button,
    ::-webkit-scrollbar-button,
    *::-webkit-scrollbar-button:single-button,
    *::-webkit-scrollbar-button:vertical:decrement,
    *::-webkit-scrollbar-button:vertical:increment,
    *::-webkit-scrollbar-button:horizontal:decrement,
    *::-webkit-scrollbar-button:horizontal:increment {
      display: none !important;
      width: 0px !important;
      height: 0px !important;
      background: transparent !important;
    }
    ::-webkit-scrollbar-corner {
      background: transparent !important;
    }
    ::-webkit-scrollbar-track,
    .custom-scroll::-webkit-scrollbar-track,
    textarea::-webkit-scrollbar-track {
      background: rgba(0, 55, 45, 0.05) !important;
      border-radius: 9999px !important;
      border: none !important;
      margin: 3px !important;
    }
    ::-webkit-scrollbar-thumb,
    .custom-scroll::-webkit-scrollbar-thumb,
    textarea::-webkit-scrollbar-thumb {
      background: #006D41 !important;
      border-radius: 9999px !important;
      border: 1px solid transparent !important;
      background-clip: padding-box !important;
      transition: background 0.15s ease !important;
    }
    ::-webkit-scrollbar-thumb:hover,
    .custom-scroll::-webkit-scrollbar-thumb:hover,
    textarea::-webkit-scrollbar-thumb:hover {
      background: #004D3F !important;
    }
    ::-webkit-scrollbar-thumb:active,
    .custom-scroll::-webkit-scrollbar-thumb:active,
    textarea::-webkit-scrollbar-thumb:active {
      background: #00261f !important;
    }

    /* Dark surface scrollbars (Sidebar, Dark Nav, Dark Headers) */
    #sidebar::-webkit-scrollbar-track,
    #app-sidebar::-webkit-scrollbar-track,
    .dark-scroll::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.25) !important;
      border-radius: 9999px !important;
    }
    #sidebar::-webkit-scrollbar-thumb,
    #app-sidebar::-webkit-scrollbar-thumb,
    .dark-scroll::-webkit-scrollbar-thumb {
      background: #10b981 !important;
      border-radius: 9999px !important;
    }
    #sidebar::-webkit-scrollbar-thumb:hover,
    #app-sidebar::-webkit-scrollbar-thumb:hover,
    .dark-scroll::-webkit-scrollbar-thumb:hover {
      background: #34d399 !important;
    }

    /* Firefox Standards */
    * {
      scrollbar-width: thin !important;
      scrollbar-color: #006D41 #E6F2ED !important;
    }
    #sidebar, #app-sidebar, .dark-scroll {
      scrollbar-color: #10b981 rgba(0, 0, 0, 0.25) !important;
    }

    /* Dedicated Custom Scroll Container (Modals & Panels) */
    .custom-scroll {
      scrollbar-width: thin !important;
      scrollbar-color: #006D41 #E6F2ED !important;
    }
    .custom-scroll::-webkit-scrollbar {
      width: 6px !important;
      height: 6px !important;
    }
    .custom-scroll::-webkit-scrollbar-track {
      background: #E6F2ED !important;
      border-radius: 9999px !important;
      border: 1px solid #DCE1DC !important;
      margin: 3px !important;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
      background: #006D41 !important;
      border-radius: 9999px !important;
      border: 1px solid transparent !important;
      background-clip: padding-box !important;
      transition: background 0.15s ease !important;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
      background: #004D3F !important;
    }

    /* Master Application Layout: Side-by-Side Flex on Desktop, Zero Vertical Offset */
    html, body {
      min-height: 100vh !important;
      min-height: 100dvh !important;
      overflow-x: hidden !important;
      width: 100% !important;
      max-width: 100vw !important;
    }
    body {
      display: flex !important;
      flex-direction: column !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    #app-header {
      height: 76px !important;
      flex-shrink: 0 !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      z-index: 50 !important;
      display: flex !important;
    }
    @media (max-width: 640px) {
      #app-header {
        height: 64px !important;
      }
    }
    #app-layout-body {
      display: flex !important;
      flex-direction: row !important;
      align-items: stretch !important;
      flex: 1 1 auto !important;
      width: 100% !important;
      margin-top: 76px !important;
      min-height: calc(100vh - 76px) !important;
      min-height: calc(100dvh - 76px) !important;
      background-color: var(--bg) !important;
      position: relative !important;
    }
    @media (max-width: 640px) {
      #app-layout-body {
        margin-top: 64px !important;
        min-height: calc(100vh - 64px) !important;
        min-height: calc(100dvh - 64px) !important;
      }
    }
    /* Desktop Sidebar & Stage (Screen >= 768px Only) */
    @media (min-width: 768px) {
      #app-sidebar {
        position: fixed !important;
        top: 76px !important;
        right: 0 !important;
        bottom: 0 !important;
        height: calc(100vh - 76px) !important;
        height: calc(100dvh - 76px) !important;
        max-height: calc(100vh - 76px) !important;
        flex-shrink: 0 !important;
        background-color: #00372d !important;
        display: flex !important;
        flex-direction: column !important;
        width: 288px !important;
        align-self: flex-start !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        z-index: 40 !important;
        transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      #app-main-stage {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        width: calc(100% - 288px) !important;
        margin-inline-start: 288px !important;
        margin-right: 288px !important;
        margin-left: 0 !important;
        background-color: var(--bg) !important;
        transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1), margin 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      /* Instant Zero-Flicker Collapsed Sidebar */
      html.sb-collapsed #app-sidebar,
      #app-sidebar.collapsed {
        width: 72px !important;
      }
      html.sb-collapsed #app-main-stage {
        margin-inline-start: 72px !important;
        margin-right: 72px !important;
        margin-left: 0 !important;
        width: calc(100% - 72px) !important;
      }
      html.sb-collapsed #app-sidebar .sidebar-label,
      html.sb-collapsed #app-sidebar .sidebar-badge {
        display: none !important;
      }
      html.sb-collapsed #app-sidebar #sidebar-collapse-icon {
        transform: rotate(180deg) !important;
      }
      html.sb-collapsed #app-sidebar .sidebar-header-box {
        justify-content: center !important;
        padding: 12px 0 !important;
      }
      html.sb-collapsed #app-sidebar .p-3\.5 {
        padding: 12px 10px !important;
      }
      html.sb-collapsed #app-sidebar .sidebar-nav-btn {
        width: 48px !important;
        height: 48px !important;
        margin: 6px auto !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 14px !important;
      }
      html.sb-collapsed #app-sidebar .sidebar-nav-btn > div {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        gap: 0 !important;
      }
      html.sb-collapsed #app-sidebar .sidebar-nav-btn svg {
        margin: 0 auto !important;
        display: block !important;
        width: 22px !important;
        height: 22px !important;
        flex-shrink: 0 !important;
      }
    }

    /* PC Side Dock Only / Mobile Bottom Dock Only */
    @media (min-width: 768px) {
      #mobile-bottom-nav {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        height: 0 !important;
        opacity: 0 !important;
      }
      #app-sidebar {
        display: flex !important;
      }
    }
    @media (max-width: 767px) {
      #app-sidebar, #sidebar-backdrop {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        width: 0 !important;
      }
      html.sb-collapsed #app-main-stage,
      #app-main-stage {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        margin-inline-start: 0 !important;
        margin-right: 0 !important;
        margin-left: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        background-color: var(--bg) !important;
        padding-bottom: calc(90px + env(safe-area-inset-bottom, 0px)) !important;
      }
      #mobile-bottom-nav {
        display: flex !important;
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: calc(64px + env(safe-area-inset-bottom, 0px)) !important;
        padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        padding-left: 8px !important;
        padding-right: 8px !important;
        background: #00372d !important;
        background: linear-gradient(180deg, #00372d 0%, #00261f 100%) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.15) !important;
        box-shadow: 0 -4px 25px rgba(0, 0, 0, 0.45) !important;
        z-index: 50 !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: space-around !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        -webkit-user-select: none !important;
        user-select: none !important;
      }

      .mobile-bottom-tab {
        flex: 1 1 0% !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        height: 100% !important;
        max-height: 64px !important;
        padding: 6px 0 !important;
        gap: 2px !important;
        background: transparent !important;
        border: none !important;
        outline: none !important;
        cursor: pointer !important;
        color: rgba(209, 250, 229, 0.65) !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        -webkit-tap-highlight-color: transparent !important;
        user-select: none !important;
        position: relative !important;
        box-sizing: border-box !important;
        text-decoration: none !important;
      }

      .mobile-bottom-tab:active {
        transform: scale(0.92) !important;
      }

      .mobile-bottom-tab-icon {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 48px !important;
        height: 28px !important;
        border-radius: 14px !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        color: rgba(209, 250, 229, 0.65) !important;
      }

      .mobile-bottom-tab-icon svg {
        width: 20px !important;
        height: 20px !important;
        stroke: currentColor !important;
        stroke-width: 2.2 !important;
        transition: transform 0.2s ease, stroke 0.2s ease !important;
      }

      .mobile-bottom-tab-label {
        font-size: 11px !important;
        font-weight: 600 !important;
        line-height: 1.1 !important;
        color: rgba(209, 250, 229, 0.65) !important;
        letter-spacing: -0.2px !important;
        transition: all 0.2s ease !important;
        white-space: nowrap !important;
      }

      .mobile-bottom-tab.active .mobile-bottom-tab-icon {
        background-color: rgba(0, 109, 65, 0.92) !important;
        color: #34d399 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15) !important;
        transform: translateY(-1px) !important;
      }

      .mobile-bottom-tab.active .mobile-bottom-tab-icon svg {
        color: #a7f3d0 !important;
        stroke: #a7f3d0 !important;
        stroke-width: 2.4 !important;
        transform: scale(1.05) !important;
      }

      .mobile-bottom-tab.active .mobile-bottom-tab-label {
        color: #ffffff !important;
        font-weight: 800 !important;
      }
    }

    /* High-Readability Enterprise Form Inputs */
    input[type="text"], input[type="password"], input[type="number"], input[type="url"], input[type="date"], textarea {
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 12px !important;
      padding: 10px 14px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #0f172a !important;
      background-color: #ffffff !important;
      transition: all 0.15s ease !important;
      font-family: inherit !important;
    }
    input[type="text"]:focus, input[type="password"]:focus, input[type="number"]:focus, input[type="url"]:focus, input[type="date"]:focus, textarea:focus {
      outline: none !important;
      border-color: #006d41 !important;
      box-shadow: 0 0 0 3px rgba(0, 109, 65, 0.14) !important;
    }

    /* Bulletproof Text Wrapping & HWID Breaking on Mobile */
    .break-all,
    #rescueHwidDisplay,
    #rootBoundFpDisplay,
    #pinBoundFpDisplay,
    #clockBoundFpDisplay {
      word-break: break-all !important;
      overflow-wrap: anywhere !important;
      white-space: normal !important;
      max-width: 100% !important;
      min-width: 0 !important;
      display: block !important;
    }
    .break-words {
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
    }

    /* Enterprise Textarea Styling */
    textarea {
      resize: none !important;
      scrollbar-width: thin !important;
      scrollbar-color: #006D41 rgba(0, 55, 45, 0.05) !important;
    }
    textarea::-webkit-scrollbar {
      width: 6px !important;
    }
    textarea::-webkit-scrollbar-track {
      background: rgba(0, 55, 45, 0.05) !important;
      border-radius: 9999px !important;
    }
    textarea::-webkit-scrollbar-thumb {
      background: #006D41 !important;
      border-radius: 9999px !important;
    }
    textarea::-webkit-scrollbar-thumb:hover {
      background: #004D3F !important;
    }
  `;
