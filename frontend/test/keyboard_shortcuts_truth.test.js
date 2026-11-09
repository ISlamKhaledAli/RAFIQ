import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const modal = read('src', 'components', 'KeyboardShortcutsModal.tsx');
const posKeys = read('src', 'views', 'pos', 'usePosShortcuts.ts');
const app = read('src', 'App.tsx');
const undo = read('src', 'components', 'UndoToast.tsx');
const receipt = read('src', 'components', 'ReceiptModal.tsx');

const documentedKeys = [...modal.matchAll(/\bkey: '([^']+)'/g)].map((m) => m[1]);

describe('the keyboard cheat-sheet only lists keys the code really handles', () => {
  it('every F-key on the cashier screen is handled by usePosShortcuts', () => {
    for (const f of ['F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) {
      assert.ok(documentedKeys.some((k) => k.split(' / ').includes(f)), `${f} is documented`);
      assert.ok(posKeys.includes(`e.key === '${f}'`), `${f} is handled in usePosShortcuts`);
    }
    assert.match(posKeys, /e\.ctrlKey && e\.key\.toLowerCase\(\) === 'q'/);
    assert.match(posKeys, /e\.key\.toLowerCase\(\) === 'n'/);
    assert.match(posKeys, /e\.key === '\/'/);
  });

  it('Alt+1..9, F5/Ctrl+R and F1-to-cashier are handled globally in App', () => {
    for (let n = 1; n <= 9; n++) assert.ok(app.includes(`e.key === '${n}'`), `Alt+${n}`);
    assert.match(app, /e\.key === 'F5' \|\| \(e\.ctrlKey && \(e\.key\.toLowerCase\(\) === 'r'/);
    assert.match(app, /e\.key === 'F1' && activeTab !== 'pos'/);
  });

  it('none of the keys that do not exist anywhere is documented', () => {
    for (const gone of ['+ / -', 'Del', 'Space', 'Ctrl + F', 'Alt+B', 'Alt+I', 'Alt+M', 'Alt + 6 / Alt + 7', 'Ctrl + N']) {
      assert.ok(!modal.includes(`'${gone}'`) && !modal.includes(`/ ${gone}'`), `${gone} must not be documented`);
    }
    assert.ok(!/زر البدائل \/ Alt/.test(modal) && !/Alt\+(B|I|M)/.test(modal));
  });

  it('F10 is described as InstaPay (not Visa), and F4 as the invoice discount', () => {
    assert.ok(!/بالفيزا|البطاقة البنكية/.test(modal), 'F10 no longer pays by card');
    assert.match(modal, /key: 'F10',\n\s+label: 'دفع فوري بإنستاباي'/);
    assert.match(modal, /key: 'F4',\n\s+label: 'خصم على الفاتورة'/);
    assert.match(modal, /key: 'F3',\n\s+label: 'تعديل كمية أو وزن آخر صنف'/);
  });

  it('alt-number screens are listed only when their feature is on', () => {
    assert.match(modal, /isEnabled\('feature_epay_services'\)[\s\S]*Alt \+ 7/);
    assert.match(modal, /isEnabled\('feature_insurance'\)[\s\S]*Alt \+ 8/);
    assert.match(modal, /feature_digital_wallets[\s\S]*Alt \+ 6/);
  });
});

describe('key conflicts between handlers are resolved', () => {
  it('F9 only pays: the undo toast answers Ctrl+Z alone', () => {
    const handler = undo.slice(undo.indexOf('const handleKeyDown'), undo.indexOf("window.addEventListener('keydown'")).replace(/\/\/.*$/gm, '');
    assert.ok(!handler.includes('F9'), 'undo must not listen to F9');
    assert.match(handler, /e\.ctrlKey && e\.key\.toLowerCase\(\) === 'z'/);
    assert.ok(!/Ctrl\+Z أو F9/.test(undo));
    assert.match(receipt, /e\.key === 'F9'/, 'F9 still prints inside the receipt preview');
  });

  it('F11 is the return key on the cashier screen and fullscreen elsewhere (never both)', () => {
    const f11 = app.slice(app.indexOf("// 2. F11 toggles fullscreen"), app.indexOf('// 3. If NOT on POS view'));
    assert.match(f11, /if \(activeTab === 'pos'\) return;/);
    assert.ok(f11.indexOf("activeTab === 'pos'") < f11.indexOf('handleToggleFullscreen'));
    assert.match(posKeys, /e\.key === 'F11'[\s\S]*setIsReturnModalOpen\(true\)/);
    assert.ok(app.includes('F11 خارج شاشة البيع'));
  });
});

describe('cheat-sheet styling follows the design tokens', () => {
  it('no palette colour classes and every icon colour has a dark pair', () => {
    assert.ok(!/text-(purple|slate|gray|blue|red|green|emerald)-\d/.test(modal));
    assert.ok(!modal.includes('text-purple-600'));
    for (const m of modal.matchAll(/<(Pill|Shirt|Scale|Sparkles) className="[^"]*text-(paid|warn|brand)(?! dark)[^"]*"/g)) {
      assert.ok(/dark:text-/.test(m[0]), `missing dark pair: ${m[0]}`);
    }
  });
});

describe('F1 is only advertised where it works', () => {
  it('the help-guide buttons outside the cashier screen do not claim F1 (there F1 returns to the cashier)', () => {
    for (const rel of [['views', 'purchases', 'PurchasesInvoicesTab.tsx'], ['views', 'ProductsView.tsx'], ['views', 'SalesHistoryView.tsx']]) {
      assert.ok(!/title="[^"]*\(F1\)"/.test(read('src', ...rel)), `${rel.join('/')} must not claim F1`);
    }
    assert.match(read('src', 'views', 'pos', 'PosFooterBar.tsx'), /دليل اختصارات لوحة المفاتيح الكامل \(F1\)/);
  });
});


describe('the header shows the real store activity only when there is one, and no scale chip', () => {
  it('the activity label comes from the store-type registry and has no generic fallback badge', () => {
    assert.match(modal, /const label = findStoreTypeLabel\(activityType\);/);
    assert.ok(!modal.includes('أنشطة التجزئة العامة'), 'a shop without a specific activity shows no badge');
    assert.match(modal, /\{storeBadge\.label && \(/);
    assert.ok(!modal.includes('أصناف وميزان إلكتروني'), 'the scale flag must not rename the shop activity');
    const filter = read('src', 'utils', 'categoryIconFilter.ts');
    assert.match(filter, /supermarket: 'سوبر ماركت'/);
  });

  it('the scale feature only gates its shortcut row: no scale chip in the header', () => {
    assert.match(modal, /const isWeighing = isEnabled\('feature_scale_weight'\);/);
    assert.ok(!modal.includes('الميزان الإلكتروني مفعّل'));
    assert.match(modal, /if \(isWeighing\) \{\n\s+storeShortcuts\.push\(\{\n\s+key: 'مسح'/);
  });

  it('pharmacy and clothing keep their own gating', () => {
    assert.match(modal, /const isPharmacy = storeType === 'pharmacy' \|\| isEnabled\('feature_pharmacy'\);/);
    assert.match(modal, /const isClothing = !isPharmacy && \(storeType === 'clothing_apparel' \|\| isEnabled\('feature_matrix_variants'\)\);/);
  });
});
