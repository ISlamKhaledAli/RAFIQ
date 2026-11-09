import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const HOST = fileURLToPath(new URL('../../desktop/', import.meta.url));
const read = (rel) => readFileSync(`${SRC}${rel}`, 'utf8').replace(/\r\n/g, '\n');
const readHost = (rel) => readFileSync(`${HOST}${rel}`, 'utf8').replace(/\r\n/g, '\n');

const page = read('views/root/RootDataPage.tsx');
const modal = read('components/DemoDataModal.tsx');
const reset = read('components/FactoryResetModal.tsx');
const service = readHost('Services/DemoDataService.cs');
const dispatcher = readHost('Bridge/IpcDispatcher.cs');
const dispatcherSystem = readHost('Bridge/IpcDispatcher.System.cs');
const databaseService = readHost('Services/DatabaseService.cs');

// Latin letters are allowed only inside identifiers, code literals and brand names
const arabicTextOf = (src) =>
  [...src.matchAll(/>([^<>{}]*[\u0600-\u06FF][^<>{}]*)</g)].map((m) => m[1]).concat([...src.matchAll(/'([^'\n]*[\u0600-\u06FF][^'\n]*)'/g)].map((m) => m[1]));

describe('demo data page: button state and honesty', () => {
  it('the page button label follows the real state and is blocked when the host refuses loading', () => {
    assert.ok(page.includes("hasDemo ? 'مسح وإدارة البيانات التجريبية' : 'تحميل بضاعة تجريبية'"));
    assert.ok(page.includes("const loadBlocked = !hasDemo && demoStatus?.canLoad === false;"));
    assert.ok(page.includes('disabled={loadBlocked}'));
    assert.ok(page.includes('demoStatus?.loadBlockedReason'), 'the host reason is shown, not a hard-coded one');
  });

  it('the page surfaces a failed status read instead of only logging it', () => {
    assert.ok(!page.includes('console.error'));
    assert.ok(page.includes('setStatusError('));
    assert.ok(page.includes('role="alert"'));
  });

  it('counts shown on the page come from the host status', () => {
    for (const field of ['demoProductsCount', 'demoSalesCount', 'demoCustomersCount', 'keptProductsCount']) {
      assert.ok(page.includes(`demoStatus?.${field}`), field);
    }
  });

  it('the page copy matches what the host does (no fake sales, backup first, kept rows)', () => {
    assert.ok(page.includes('بدون فواتير ولا ديون'));
    assert.ok(page.includes('بعد أخذ نسخة احتياطية موثقة'));
    assert.ok(page.includes('يبقى موقوفاً ولا يُحذف'));
    assert.ok(!page.includes('ومسحها بضغطة زر'), 'the old over-promise is gone');
  });

  it('motion: the state swap goes through the motion panel hook, not ad-hoc CSS', () => {
    assert.ok(page.includes('useMotionPanel(hasDemo'));
    assert.ok(modal.includes('useMotionPanel('));
    assert.ok(modal.includes("import MotionHeight from './MotionHeight'"));
    assert.ok(reset.includes('useMotionPanel('));
  });
});

describe('demo data modal: running, results and errors', () => {
  it('every action is disabled while one runs and shows a spinner via loading', () => {
    assert.ok(modal.includes("const isBusy = busy !== null;"));
    assert.ok(modal.includes("loading={busy === 'load'}"));
    assert.ok(modal.includes("loading={busy === 'clear'}"));
    assert.ok(modal.includes("loading={busy === 'wizard'}"));
    assert.ok(modal.includes('disabled={isBusy}'));
    assert.ok(modal.includes('isOpen: isOpen && busy === null'), 'Escape and backdrop cannot close it mid-run');
  });

  it('the load button label states the exact count from the host and needs a second, explicit confirmation', () => {
    assert.ok(modal.includes('plannedProductsCount'));
    assert.ok(modal.includes('plannedCustomersCount'));
    assert.ok(modal.includes('setShowLoadConfirm(true)'));
    assert.ok(modal.includes('acknowledgeRealData: true'), 'the confirmation is sent to the host');
    assert.ok(modal.includes('بجانبهم في البيع والمخزن'), 'the mix with real data is stated');
    assert.ok(modal.includes('تأكيد التحميل'));
  });

  it('a host refusal or error is shown verbatim and never swallowed', () => {
    assert.ok(modal.includes('err instanceof Error && err.message ? err.message : fallback'));
    assert.ok(modal.includes('setError(errorText(err'));
    assert.ok(modal.includes('role="alert"'));
    assert.ok(!/catch\s*\{\s*\n?\s*(\/\/[^\n]*)?\s*\n?\s*\}/.test(modal.replace(/catch \{\n\s*\/\/[^\n]*\n\s*\}/g, '')), 'no empty catch');
    assert.ok(!modal.includes(' as any') && !modal.includes(': any'));
  });

  it('a result summary is built from the host counts, including kept rows', () => {
    for (const field of ['productsAdded', 'productsSkipped', 'customersAdded', 'deletedProducts', 'deletedCustomers', 'deletedSales', 'keptProducts', 'keptCustomers']) {
      assert.ok(modal.includes(`result.${field}`), field);
    }
    for (const field of ['removableProductsCount', 'keptProductsCount', 'removableCustomersCount', 'keptCustomersCount']) {
      assert.ok(modal.includes(`status.${field}`), field);
    }
  });

  it('removal is danger-styled, confirmed, and talks about the backup and the kept rows', () => {
    assert.ok(modal.includes('variant="dangerSoft"'));
    assert.ok(modal.includes('variant="danger"'));
    assert.ok(modal.includes('تأكيد المسح'));
    assert.ok(modal.includes('نسخة احتياطية موثقة'));
    assert.ok(modal.includes('يُوقف الصنف ويُؤرشف الزبون'));
  });

  it('removal and reset wait for the host long enough (backup first), without a forced reload', () => {
    assert.ok(modal.includes("invoke<ClearResult>('demo:clear', undefined, LONG_OPERATION_TIMEOUT_MS)"));
    assert.ok(!modal.includes('setTimeout'));
    assert.ok(!/setTimeout\([^)]*reload/.test(reset), 'no automatic reload after the reset');
    assert.ok(!reset.includes('setTimeout'));
    assert.ok(modal.includes('إعادة تحميل الشاشة الآن'));
    assert.ok(reset.includes('إعادة تحميل الآن'));
    assert.ok(modal.includes('window.location.reload()'));
  });

  it('the modal never reports a dirty state and refreshes the other screens after a load', () => {
    assert.ok(modal.includes('isDirty: false'));
    assert.ok(modal.includes("emitDataChanged(['products', 'customers', 'dashboard'])"));
  });

  it('only theme tokens, lucide icons, shared components; no emoji, no native select, no ad-hoc hex', () => {
    for (const [name, src] of [['page', page], ['modal', modal], ['reset', reset]]) {
      assert.ok(!/<select[\s>]/.test(src), `${name}: native select`);
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), `${name}: hex colour`);
      assert.ok(!/\b(slate|gray|zinc|neutral|red|green|amber)-\d{2,3}\b/.test(src), `${name}: palette colour`);
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), `${name}: emoji`);
    }
    assert.ok(modal.includes("from 'lucide-react'"));
  });

  it('visible Arabic text has no Latin words outside the demo_ code literal', () => {
    for (const [name, src] of [['page', page], ['modal', modal], ['reset', reset]]) {
      for (const text of arabicTextOf(src)) {
        const latin = text.replace(/&[a-z]+;/g, '').replace(/demo_|Excel|PIN|Type-C|AUX/g, '').match(/[A-Za-z]{3,}/);
        assert.equal(latin, null, `${name}: "${text}"`);
      }
    }
  });
});

describe('factory reset modal: every promise matches the host', () => {
  it('the wipe-backups checkbox is gone and the typed word is sent to the host', () => {
    assert.ok(!reset.includes('wipeBackups'));
    assert.ok(!reset.includes('type="checkbox"'));
    assert.ok(reset.includes("{ confirmWord: confirmWord.trim() }"));
    assert.ok(reset.includes('RESET_TIMEOUT_MS'));
    assert.ok(reset.includes('isOpen: isOpen && !loading'), 'cannot be dismissed mid-run');
  });

  it('the modal states what the host really does', () => {
    assert.ok(reset.includes('ملفات النسخ الاحتياطي السابقة كلها'));
    assert.ok(reset.includes('الترخيص وتفعيله'));
    assert.ok(reset.includes('(1234)') && reset.includes('(0000)'));
    assert.ok(reset.includes('وردية مفتوحة'));
    assert.ok(reset.includes('سجل المراجعة'));
  });

  it('the host enforces the same promises', () => {
    assert.ok(dispatcherSystem.includes('"CONFIRMATION_REQUIRED"'));
    assert.ok(dispatcherSystem.includes('DatabaseService.FactoryReset()'));
    assert.ok(databaseService.includes('WHERE status = \'open\''), 'open shift guard');
    assert.ok(databaseService.includes('!preResetBackup.IsVerified'), 'verified backup is mandatory');
    assert.ok(databaseService.includes("key NOT LIKE 'license_%'"), 'licence survives the reset');
    assert.ok(!databaseService.includes('wipeBackups'), 'backups can never be wiped');
    assert.ok(dispatcher.includes('{ "system:factoryReset", REQUIRE_OWNER }'));
  });
});

describe('demo data host contract (source level)', () => {
  it('loading and clearing are owner-only on the host; reading the status stays admin', () => {
    assert.ok(dispatcher.includes('{ "demo:load", REQUIRE_OWNER }'));
    assert.ok(dispatcher.includes('{ "demo:clear", REQUIRE_OWNER }'));
    assert.ok(dispatcher.includes('{ "demo:getStatus", REQUIRE_ADMIN }'));
  });

  it('the loader creates no sales, ledger rows or wallet money, and never overwrites', () => {
    assert.ok(!/INSERT INTO (sales|sale_items|customer_ledger|payments|digital_accounts)/.test(service));
    assert.ok(!service.includes('INSERT OR REPLACE'));
    assert.ok(!service.includes('INSERT OR IGNORE'));
    assert.ok(service.includes('ProductIdOrBarcodeExists'));
    assert.ok(service.includes('REAL_SALES_EXIST') && service.includes('ALREADY_LOADED') && service.includes('CONFIRM_REQUIRED'));
  });

  it('removal is scoped by reference checks, takes a verified backup, and keeps financial rows', () => {
    assert.ok(service.includes('!backup.IsVerified'));
    assert.ok(service.includes('HasReference('));
    assert.ok(service.includes('SAVEPOINT demo_row'));
    assert.ok(!/DELETE FROM sale_items WHERE[^;]*product_id/.test(service), 'a real invoice line is never deleted by product');
    assert.ok(!service.includes("barcode LIKE 'STRESS%'"), 'a real barcode never selects a row for deletion');
    assert.ok(service.includes('is_active = 0') && service.includes('is_archived = 1'));
    assert.ok(service.includes('_auditRepo.Log(conn, trans'), 'the audit entry commits with the change');
  });

  it('no float or double touches the demo catalog money', () => {
    assert.ok(!/\b(double|float|decimal)\b/.test(service));
  });
});
