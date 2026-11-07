import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');
const profileTab = read('views/settings/StoreProfileTab.tsx');
const policiesTab = read('views/settings/SalesPoliciesTab.tsx');
const settingsView = read('views/SettingsView.tsx');
const signatureField = read('views/root/SignatureImageField.tsx');
const rootReceipt = read('views/root/RootReceiptPage.tsx');
const ipc = read('bridge/ipc.ts');

describe('store settings screens: dead settings are gone, live ones still saved', () => {
  it('the cashier name setting (nothing reads it) is no longer edited or written', () => {
    for (const [name, src] of [['StoreProfileTab', profileTab], ['SettingsView', settingsView]]) {
      assert.ok(!/cashier_name|cashierName|CashierName/.test(src), `${name} still handles cashier_name`);
    }
    assert.ok(!ipc.includes("cashier_name: 'كاشير (1)'"), 'mock defaults still seed cashier_name');
  });

  it('the logo variant and the fee-percent placeholders (nothing reads them) are no longer written', () => {
    for (const dead of ['logo_variant', 'logoVariant', 'rafiq_logo_variant', 'instapay_fee_percent', 'vodafone_cash_fee_percent']) {
      assert.ok(!settingsView.includes(dead), `SettingsView still handles ${dead}`);
      assert.ok(!profileTab.includes(dead), `StoreProfileTab still handles ${dead}`);
    }
  });

  it('the fake "wide logo" choice is gone: the printer always prints the square default', () => {
    assert.ok(!profileTab.includes('شعار عريض'));
  });

  it('every live store key is still saved by the profile save; root-only and wallet keys are not', () => {
    const start = settingsView.indexOf('const handleSave = async');
    const end = settingsView.indexOf('const handleSavePolicies');
    const body = settingsView.slice(start, end);
    for (const key of [
      'store_name', 'store_phone', 'store_address', 'tax_number', 'receipt_header', 'receipt_footer',
      'show_receipt_logo', 'receipt_show_cashier', 'receipt_show_invoice_number', 'receipt_show_paid', 'receipt_show_change', 'store_logo_url',
    ]) {
      assert.ok(body.includes(`${key}:`), `${key} is saved by the profile save`);
    }
    for (const gone of ['developer_signature', 'store_instapay_address', 'store_wallet_number', 'isRoot']) {
      assert.ok(!body.includes(gone), `the owner profile save never sends ${gone}`);
    }
  });

  it('save buttons stay disabled until something changed', () => {
    assert.ok(profileTab.includes('disabled={saveLoading || hasTextError || !dirty}'));
    assert.ok(policiesTab.includes('disabled={!creditLimitDirty || saveLoading}'));
    assert.ok(settingsView.includes('profileBaseline === null || profileSnapshot !== profileBaseline'));
  });

  it('the receipt preview follows the configured paper width and keeps the multi-line editors', () => {
    assert.ok(profileTab.includes("paperWidth === '57mm' ? '57mm' : '80mm'"));
    assert.ok(settingsView.includes('paperWidth={paperWidth}'));
    assert.ok(profileTab.includes('rows={2}') && profileTab.includes('rows={3}'));
  });

  it('the cashier-name switch is a dirty-aware setting, loaded with default ON and drives the live preview', () => {
    assert.ok(profileTab.includes('إظهار اسم الكاشير في الوصل'));
    assert.ok(profileTab.includes('يُطبع اسم الكاشير الذي أتمّ البيع تلقائياً.'));
    assert.ok(profileTab.includes('showCashier: showReceiptCashier'), 'the preview follows the switch immediately');
    assert.ok(profileTab.includes('الأسماء والأصناف في المعاينة أمثلة فقط، والوصل الحقيقي يطبع بيانات الفاتورة الفعلية.'));
    assert.ok(settingsView.includes("setShowReceiptCashier(settings.receipt_show_cashier !== '0')"), 'a missing key means ON');
    assert.ok(settingsView.includes("receipt_show_cashier: showReceiptCashier ? '1' : '0'"));
    const snapshot = settingsView.slice(settingsView.indexOf('const profileSnapshot'), settingsView.indexOf('const profileDirty'));
    assert.ok(snapshot.includes('showReceiptCashier'), 'toggling it makes the save bar dirty');
    assert.ok(ipc.includes("receipt_show_cashier: '1'"), 'mock defaults');
  });

  it('the invoice-number, paid and change switches follow the cashier-name precedent end to end', () => {
    const switches = [
      ['receipt_show_invoice_number', 'showReceiptInvoiceNumber', 'setShowReceiptInvoiceNumber', 'showInvoiceNumber', 'إظهار رقم الفاتورة في الوصل'],
      ['receipt_show_paid', 'showReceiptPaid', 'setShowReceiptPaid', 'showPaid', 'إظهار المدفوع في الوصل'],
      ['receipt_show_change', 'showReceiptChange', 'setShowReceiptChange', 'showChange', 'إظهار الباقي للعميل في الوصل'],
    ];
    const snapshot = settingsView.slice(settingsView.indexOf('const profileSnapshot'), settingsView.indexOf('const profileDirty'));
    const receiptModal = read('components/ReceiptModal.tsx');
    const rootPage = rootReceipt;
    for (const [key, state, setter, option, title] of switches) {
      assert.ok(profileTab.includes(title), `${key}: switch title`);
      assert.ok(profileTab.includes(`${option}: ${state}`), `${key}: the preview follows the switch immediately`);
      assert.ok(profileTab.includes(`onChange={(next) => ${setter}?.(next)}`), `${key}: switch wiring`);
      assert.ok(settingsView.includes(`${setter}(settings.${key} !== '0')`), `${key}: a missing key means ON`);
      assert.ok(settingsView.includes(`${key}: ${state} ? '1' : '0'`), `${key}: saved as 1/0`);
      assert.ok(snapshot.includes(state), `${key}: toggling it makes the save bar dirty`);
      assert.ok(settingsView.includes(`${setter}={${setter}}`), `${key}: passed to the tab`);
      assert.ok(ipc.includes(`${key}: '1'`), `${key}: mock default`);
      assert.ok(receiptModal.includes(`${option}: liveSettings.${key} !== '0'`), `${key}: the POS receipt reads it`);
      assert.ok(rootPage.includes(`${option}: s.${key} !== '0'`) && rootPage.includes(`${option}: store.${option}`), `${key}: the root preview reads it`);
    }
  });

  it('an empty footer prints nothing and the hint says so', () => {
    assert.ok(profileTab.includes('لو تُرك فارغاً لا يُطبع شيء.'));
    assert.ok(!profileTab.includes('DEFAULT_RECEIPT_THANKS'), 'no hidden fallback text in the editor');
    assert.ok(settingsView.includes('setReceiptFooter(resolveReceiptFooter(settings.receipt_footer))'), 'an untouched old default footer shows as the plain thanks line, so what you see is what prints');
  });

  it('the store InstaPay address / wallet number card is gone from the store profile (legacy values keep working in the payment modal)', () => {
    for (const [name, src] of [['StoreProfileTab', profileTab], ['SettingsView', settingsView]]) {
      assert.ok(!/store_instapay_address|store_wallet_number|storeInstapayAddress|storeWalletNumber|الدفع الإلكتروني المباشر/.test(src), `${name} still handles the direct-payment card`);
    }
    const modal = read('components/DigitalPaymentModal.tsx');
    assert.ok(modal.includes('store_instapay_address') && modal.includes('store_wallet_number'), 'stored values still feed the checkout fallback');
    assert.ok(read('views/wallets/WalletsView.tsx').includes('accounts'), 'the wallets screen owns the accounts');
  });

  it('the root-only signature page: visibility switch, text, and the image control with three actions', () => {
    const card = rootReceipt;
    assert.ok(card.includes('title="توقيع المطور أسفل الوصل"'));
    assert.ok(card.includes('title="إظهار توقيع الإيصال"') && card.includes('يظهر أسفل كل وصل: صورة ثم أسطر النص.'));
    assert.ok(/<SignatureImageField\s+value=\{image\}/.test(card));
    assert.ok(card.includes('تُطبع الصورة فوق هذه الأسطر، ويسمح بأربعة أسطر.'), 'the text hint is accurate');
    assert.ok(!card.includes('السطر الأول يُطبع غامقاً'), 'no stale bold-first-line hint');
    assert.ok(!profileTab.includes('SignatureImageField') && !profileTab.includes('توقيع المطور أسفل الوصل'), 'the owner profile has no signature card');
    for (const label of ['إضافة صورة', 'إرجاع الافتراضية', 'بدون صور']) {
      assert.ok(signatureField.includes(`<span>${label}</span>`) || signatureField.includes(`'${label}'`), `${label} action`);
    }
    assert.ok(signatureField.includes('تتحول الصورة تلقائياً إلى أبيض وأسود وتُقص حوافها لتناسب الطابعة الحرارية.'));
    assert.ok(signatureField.includes('تُختار صورة واحدة عشوائياً لكل فاتورة، وتظهر نفس الصورة عند إعادة طباعة نفس الفاتورة.'), 'the random-per-invoice note');
    assert.ok(signatureField.includes('accept={SIGNATURE_IMAGE_ACCEPT}') && signatureField.includes('type="file"'));
    assert.ok(/<input[^>]*\bmultiple\b/.test(signatureField), 'several files at once');
    assert.ok(signatureField.includes('جاري تجهيز الصورة...') && signatureField.includes('role="alert"'), 'processing state and visible error');
    assert.ok(signatureField.includes('الحد الأقصى ${MAX_SIGNATURE_IMAGES} صور') && signatureField.includes('current.length >= MAX_SIGNATURE_IMAGES'), 'the 8-image cap message');
    assert.ok(signatureField.includes('SIGNATURE_IMAGE_LIST_MAX_CHARS') && signatureField.includes('مجموع حجم الصور كبير'), 'the total length cap refuses the image with a message');
    assert.ok(signatureField.includes('commit(current)') && signatureField.includes('problems.push('), 'successful files are kept, per-file errors are listed');
    assert.ok(signatureField.includes('aria-label="حذف الصورة"') && signatureField.includes('Trash2') && signatureField.includes('w-11 h-11'), 'a 44px remove button on every tile (the default included)');
    assert.ok(signatureField.includes("'الافتراضية'") && signatureField.includes('removeAt(index)'), 'the default tile is labelled and removable like the others');
    assert.ok(signatureField.includes('reset([SIGNATURE_IMAGE_DEFAULT])') && signatureField.includes('reset([])'), 'default and none actions');
    assert.ok(signatureField.includes("'صورة واحدة'") && signatureField.includes("'صورتان'") && signatureField.includes("'صورتين'"), 'natural Arabic counts');
    assert.ok(signatureField.includes('تُختار واحدة عشوائياً من ${pool === 2 ?') && signatureField.includes('لكل فاتورة'), 'the caption counts the real pool: "picked at random from N images"');
    assert.ok(signatureField.includes('const pool = sizes.reduce') && signatureField.includes('item === SIGNATURE_IMAGE_DEFAULT ? builtIns.length : 1'), 'the default entry is one tile but counts every built-in image');
    assert.ok(signatureField.includes('+{sizes[index] - 1}') && signatureField.includes('countLabel(sizes[index])'), 'the default tile shows a +N chip and its image count');
    assert.ok(signatureField.includes('عرض الصورة التالية في معاينة الوصل') && signatureField.includes('else if (selectedIndex + 1 < end) onSelect(selectedIndex + 1);'), 'clicking the default tile steps through its images');
    assert.ok(signatureField.includes('current.length >= MAX_SIGNATURE_IMAGES'), 'the 8-entry cap counts the default entry as one');
    assert.ok(signatureField.includes('بدون صورة') && signatureField.includes('ImageOff'), 'empty-list placeholder');
    assert.ok(signatureField.includes('onClick={() => clickTile(index)}') && rootReceipt.includes('signatureImageIndex: previewImageIndex'), 'clicking a tile previews that image on the sample receipt');
    assert.ok(signatureField.includes('aria-pressed'), 'the current mode is visibly selected');
    assert.ok(signatureField.includes('h-11'), '44px buttons');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|text-\[\d+px\]|amber-|red-|gray-|slate-/.test(signatureField), 'theme tokens only');
    assert.ok(signatureField.includes('dark:'), 'dark pairs');
  });

  it('visibility and image load with safe defaults on the root page, are dirty-tracked and saved only there', () => {
    assert.ok(rootReceipt.includes("s.developer_signature_visible !== '0'"), 'missing key means visible');
    assert.ok(rootReceipt.includes("s.developer_signature_image ?? ''"), 'missing key means the built-in banner');
    assert.ok(rootReceipt.includes('const snapshot = JSON.stringify([normalizeReceiptText(signature), visible, image])'), 'text, switch and image drive the save bar');
    assert.ok(rootReceipt.includes('disabled={saving || !!signatureError || !dirty}'), 'save stays disabled until something changed');
    const save = rootReceipt.slice(rootReceipt.indexOf("invoke('settings:save'"), rootReceipt.indexOf('setBaseline(snapshot)'));
    for (const key of ["developer_signature: normalizeReceiptText(signature)", "developer_signature_visible: visible ? '1' : '0'", 'developer_signature_image: image']) {
      assert.ok(save.includes(key), `${key} is saved by the root page`);
    }
    assert.ok(!/store_name|receipt_header|store_logo_url/.test(save), 'the root page never re-sends owner keys');
    assert.equal(settingsView.split('developer_signature_image').length - 1, 1, 'SettingsView only reads the image for the owner preview');
    assert.ok(!settingsView.includes("'developer_signature"), 'SettingsView never saves a signature key');
    assert.ok(/signatureVisible: visible,\s*signatureImage: image/.test(rootReceipt), 'the live preview uses the unsaved form state');
    assert.ok(ipc.includes("developer_signature_visible: '1'") && ipc.includes("developer_signature_image: ''"), 'mock defaults');
  });

  it('policy warnings show only in the risky state', () => {
    assert.ok(policiesTab.includes('warning={allowNegativeStock ?'));
    assert.ok(policiesTab.includes('warning={requireOpenShiftToSell ? null :'));
  });

  it('pharmacy toggles talk to the host in its own format and stop when the save fails', () => {
    assert.ok(policiesTab.includes('toHostMandatoryFields(next)'));
    assert.ok(policiesTab.includes('parseMandatoryFields(res)'));
    assert.ok(policiesTab.includes('setMandatoryFields(previous)'));
  });

  it('new screens use the shared look: no native select, no ad-hoc pixel text sizes', () => {
    const rootFiles = ['RootConsoleView', 'RootStatusPage', 'RootReceiptPage', 'RootFeaturesPage', 'RootDevicesPage', 'RootDataPage'].map((f) => [f, read(`views/root/${f}.tsx`)]);
    for (const [name, src] of [['StoreProfileTab', profileTab], ['SalesPoliciesTab', policiesTab], ['settingsParts', read('views/settings/settingsParts.tsx')], ...rootFiles]) {
      assert.ok(!/<select/.test(src), `${name} uses a native select`);
      assert.ok(!/text-\[\d+px\]/.test(src), `${name} uses an arbitrary text size`);
    }
  });
});
