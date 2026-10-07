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

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', -apple-system, sans-serif; }
    body { background-color: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; line-height: 1.5; }

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
        transform: translateY(0);
      }
    }
    .table-row-animated {
      animation: tableRowSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-delay: calc(var(--delay, 0) * 30ms);
    }

    /* Sleek Custom Scrollbar & Min-Height (Prevents Content Jumping) */
    .table-responsive-container {
      min-height: 420px;
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
      -webkit-overflow-scrolling: touch;
      position: relative;
    }
    .table-responsive-container::-webkit-scrollbar {
      height: 6px;
    }
    .table-responsive-container::-webkit-scrollbar-track {
      background: #f8fafc;
      border-radius: 9999px;
    }
    .table-responsive-container::-webkit-scrollbar-thumb {
      background-color: #cbd5e1;
      border-radius: 9999px;
      border: 1px solid #f8fafc;
    }
    .table-responsive-container::-webkit-scrollbar-thumb:hover {
      background-color: #94a3b8;
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

    /* Modal System */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(2px);
      z-index: 60;
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
      overflow: visible !important;
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
      display: flex;
      align-items: center;
      gap: 8px;
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
    }`;
