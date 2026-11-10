import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

describe('Shift Alerts & Idle Auto-Lock Invariants', () => {
  const logoutModalSrc = read('components/ShiftLogoutModal.tsx');
  const loginModalSrc = read('components/ShiftLoginModal.tsx');
  const authContextSrc = read('context/AuthContext.tsx');
  const loginScreenSrc = read('views/LoginScreen.tsx');
  const salesPoliciesSrc = read('views/settings/SalesPoliciesTab.tsx');
  const appSrc = read('App.tsx');
  const ipcSrc = read('bridge/ipc.ts');

  it('ShiftLogoutModal: strictly zero emojis', () => {
    assert.ok(!EMOJI_REGEX.test(logoutModalSrc), 'ShiftLogoutModal must contain zero emojis');
  });

  it('ShiftLoginModal: strictly zero emojis', () => {
    assert.ok(!EMOJI_REGEX.test(loginModalSrc), 'ShiftLoginModal must contain zero emojis');
  });

  it('ShiftLogoutModal: contains no ad-hoc hex colors and adheres to design tokens with dark pairs', () => {
    // Assert no raw ad-hoc hex (e.g. #004D3F or #E2E8F0)
    const rawHexMatches = logoutModalSrc.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(rawHexMatches, null, 'ShiftLogoutModal must use semantic tokens, not raw hex');

    // Asserts dark mode classes
    assert.ok(logoutModalSrc.includes('dark:bg-surface-dark'));
    assert.ok(logoutModalSrc.includes('dark:border-line-dark'));
    assert.ok(logoutModalSrc.includes('dark:text-ink-dark'));
  });

  it('ShiftLoginModal: contains no ad-hoc hex colors and adheres to design tokens with dark pairs', () => {
    const rawHexMatches = loginModalSrc.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(rawHexMatches, null, 'ShiftLoginModal must use semantic tokens, not raw hex');

    assert.ok(loginModalSrc.includes('dark:bg-surface-dark'));
    assert.ok(loginModalSrc.includes('dark:border-line-dark'));
    assert.ok(loginModalSrc.includes('dark:text-ink-dark'));
  });

  it('ShiftLogoutModal: has alertdialog role, aria-modal and essential shift actions', () => {
    assert.ok(logoutModalSrc.includes('role="alertdialog"'));
    assert.ok(logoutModalSrc.includes('aria-modal="true"'));
    assert.ok(logoutModalSrc.includes('تقفيل وتشميع الوردية'));
    assert.ok(logoutModalSrc.includes('الخروج مع إبقاء الوردية'));
    assert.ok(logoutModalSrc.includes('formatArabicCurrency'));
    assert.ok(logoutModalSrc.includes('formatDateTime'));
  });

  it('ShiftLoginModal: has alertdialog role, aria-modal and essential shift notice actions', () => {
    assert.ok(loginModalSrc.includes('role="alertdialog"'));
    assert.ok(loginModalSrc.includes('aria-modal="true"'));
    assert.ok(loginModalSrc.includes('متابعة العمل'));
    assert.ok(loginModalSrc.includes('عرض تفاصيل الوردية'));
    assert.ok(loginModalSrc.includes('isSameCashier'));
    assert.ok(loginModalSrc.includes('formatArabicCurrency'));
  });

  it('App.tsx: wires ShiftLogoutModal and ShiftLoginModal properly', () => {
    assert.ok(appSrc.includes('ShiftLogoutModal'));
    assert.ok(appSrc.includes('ShiftLoginModal'));
    assert.ok(appSrc.includes('isShiftLogoutWarningOpen'));
    assert.ok(appSrc.includes('shiftLoginNotice'));
    assert.ok(appSrc.includes('shifts:getActive'));
  });

  it('Inactivity / Idle Auto-Lock: AuthContext and LoginScreen handle reason and zero timeout', () => {
    assert.ok(authContextSrc.includes('rafiq_logout_reason'));
    assert.ok(authContextSrc.includes('rafiq:idle-timeout-changed'));
    assert.ok(authContextSrc.includes('idleTimeoutMinutes >= 0'));
    assert.ok(loginScreenSrc.includes('rafiq_logout_reason'));
    assert.ok(loginScreenSrc.includes('logoutReason === \'idle\''));
  });

  it('SalesPoliciesTab: exposes idle auto-lock configuration via CustomSelect (no raw select)', () => {
    assert.ok(salesPoliciesSrc.includes('قفل الشاشة التلقائي عند الخمول'));
    assert.ok(salesPoliciesSrc.includes('CustomSelect'));
    assert.ok(!salesPoliciesSrc.includes('<select'), 'Must never use native HTML select');
    assert.ok(salesPoliciesSrc.includes('security:setIdleTimeout'));
  });

  it('IPC bridge: supports idleTimeoutMinutes in getStatus and setIdleTimeout with 0', () => {
    assert.ok(ipcSrc.includes('idleTimeoutMinutes: mockIdleTimeoutMinutes'));
    assert.ok(ipcSrc.includes('typeof payload?.minutes === \'number\' ? payload.minutes : 15'));
  });
});
