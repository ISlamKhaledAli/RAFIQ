import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source guards: account cards show the identity info clearly, and the form pop-ups are wide enough.
const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const wallets = read('views/wallets/WalletsView.tsx');
const epay = read('views/epay/EpayView.tsx');
const insurance = read('views/insurance/InsuranceContractsView.tsx');

const between = (src, from, to) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `missing marker: ${from}`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `missing end marker: ${to}`);
  return src.slice(a, b);
};

const accountCard = between(wallets, 'const identityRows = getAccountIdentityRows(acc);', '{(canFund || canManageAccounts) && (');
const identityHelper = between(wallets, 'interface AccountIdentityRow', 'export const WalletsView');
const accountModal = between(wallets, '{isAccountModalOpen && (', 'MODAL: CANCEL / REVERSE WALLET TRANSACTION');
const fundingModal = between(wallets, '{isFundingModalOpen && (', '5. MODAL: ADD / EDIT ACCOUNT');
const cancelModal = wallets.slice(wallets.indexOf('MODAL: CANCEL / REVERSE WALLET TRANSACTION'));
const terminalCard = between(epay, '{terminals.map((term) => (', '{(canFund || canManageTerminals) && (');
const epayFunding = between(epay, '{/* MODAL: FUNDING TERMINAL */}', '{/* MODAL: ADD / EDIT TERMINAL */}');
const epayTerminal = between(epay, '{/* MODAL: ADD / EDIT TERMINAL */}', '{/* MODAL: PRINT RECEIPT */}');
const epayCancel = epay.slice(epay.indexOf('{/* MODAL: CANCEL / VOID TRANSACTION */}'));
const companyCard = between(insurance, '{companies.map((comp) => {', '{/* Tab 2: Members Directory */}');
const insuranceModals = insurance.slice(insurance.indexOf('{/* Modal: Company */}'));

describe('wallets account cards: identity block', () => {
  it('shows labelled holder, phone and InstaPay address rows, each only when the field exists', () => {
    assert.match(accountCard, /acc\.holderName && \(/);
    assert.match(accountCard, /اسم صاحب الحساب/);
    assert.match(accountCard, /identityRows\.map\(\(row\) =>/);
    assert.match(accountCard, /row\.kind === 'phone' \? <Phone className="w-3\.5 h-3\.5" \/> : <AtSign className="w-3\.5 h-3\.5" \/>/);
    assert.match(identityHelper, /label = hasPhoneRow \? 'رقم الحساب' : isInstapay \? 'رقم الهاتف' : 'رقم المحفظة'/);
    assert.match(identityHelper, /label: isInstapay \? 'عنوان إنستاباي' : 'معرف إضافي'/);
  });

  it('shows phone AND address together for InstaPay (phone first) by using both stored values', () => {
    assert.match(identityHelper, /receivingNumbers\(acc\)/);
    assert.match(identityHelper, /\[primary, secondary\]\.filter\(\(v\) => v !== ''\)/);
    assert.match(identityHelper, /isNumericAccountValue\(b\)\) - Number\(isNumericAccountValue\(a\)\)/);
    assert.doesNotMatch(accountCard, /acc\.identifier \|\| acc\.phoneNumber/);
  });

  it('values are LTR tabular numbers, text-sm bold; phone never wraps, address wraps, holder truncates, all with a title tooltip', () => {
    assert.match(accountCard, /dir="ltr"\s+className=\{`min-w-0 text-left text-sm font-bold font-mono tabular-nums[^`]*whitespace-nowrap[^`]*break-all/);
    assert.match(accountCard, /title=\{row\.display\}/);
    assert.match(accountCard, /title=\{acc\.holderName\}/);
  });

  it('falls back only when there is no phone and no address, with an add button gated by the manage permission', () => {
    assert.match(accountCard, /identityRows\.length === 0 && \(/);
    assert.match(accountCard, /لم يُسجل رقم هاتف ولا عنوان إنستاباي بعد/);
    assert.match(accountCard, /canManageAccounts && \(\s*<AppButton variant="soft" size="xs" icon=\{Plus\}[^>]*onClick=\{\(\) => handleOpenAccountModal\(acc\)\}>\s*أضِف/);
    assert.equal(wallets.includes('بدون رقم مسجل'), false);
  });

  it('keeps the balance, limits and the footer actions, and never prints a balance inside the identity block', () => {
    assert.match(accountCard, /الرصيد الفعلي:/);
    assert.match(accountCard, /حد يومي:/);
    assert.match(accountCard, /حد شهري:/);
    const identity = between(accountCard, 'data-testid="account-identity"', 'الرصيد الفعلي:');
    assert.doesNotMatch(identity, /balancePiasters/);
  });

  it('card grids go to 3 columns only from xl so the identity rows have room at 1024', () => {
    assert.match(wallets, /grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3\.5">\s*\{accounts\.map/);
    assert.match(epay, /grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3\.5">\s*\{terminals\.map/);
    assert.match(insurance, /grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">\s*\{companies\.map/);
  });

  it('has no copy button on the cards', () => {
    assert.doesNotMatch(accountCard, /Copy|clipboard/i);
  });
});

describe('pop-up widths', () => {
  it('account add/edit modal is max-w-2xl, 2 columns from sm, body scrolls and header/footer stay', () => {
    assert.match(accountModal, /rounded-2xl shadow-2xl max-w-2xl w-full max-h-\[calc\(100vh-2rem\)\] flex flex-col overflow-hidden/);
    assert.doesNotMatch(accountModal, /max-w-lg/);
    assert.match(accountModal, /grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4/);
    assert.match(accountModal, /flex-1 min-h-0 overflow-y-auto/);
    assert.match(accountModal, /shrink-0/);
  });

  it('account modal keeps its field order', () => {
    const order = ['اختر البنك المرتبط بـ إنستاباي', 'اسم الحساب أو المحفظة في البرنامج', 'اسم صاحب الحساب:', 'رقم الهاتف المسجل بإنستاباي', 'عنوان الدفع اللحظي', 'الرصيد الافتتاحي', 'الحساب الرئيسي', 'الحد الأقصى اليومي', 'الحد الأقصى الشهري', 'ملاحظات إضافية'];
    let last = -1;
    for (const t of order) {
      const at = accountModal.indexOf(t);
      assert.ok(at > last, `${t} out of order`);
      last = at;
    }
  });

  it('funding and cancel modals are widened', () => {
    assert.match(fundingModal, /max-w-xl w-full max-h-\[calc\(100vh-2rem\)\]/);
    assert.match(fundingModal, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
    assert.doesNotMatch(fundingModal, /max-w-md/);
    assert.match(cancelModal, /max-w-lg w-full/);
    assert.doesNotMatch(cancelModal, /max-w-md/);
  });

  it('epay modals: terminal form max-w-2xl with 2 columns, funding max-w-xl, scrolling body and visible footer', () => {
    assert.match(epayTerminal, /max-w-2xl w-full[^"]*max-h-\[calc\(100vh-2rem\)\] flex flex-col overflow-hidden/);
    assert.match(epayTerminal, /grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4/);
    assert.match(epayTerminal, /flex-1 min-h-0 overflow-y-auto/);
    assert.match(epayTerminal, /px-6 py-4 border-t[^"]*shrink-0/);
    assert.match(epayFunding, /max-w-xl w-full[^"]*max-h-\[calc\(100vh-2rem\)\]/);
    assert.match(epayFunding, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
    assert.match(epayCancel, /max-w-lg w-full/);
  });

  it('insurance form modals are max-w-2xl+ and scroll inside', () => {
    const company = between(insuranceModals, '{/* Modal: Company */}', '{/* Modal: Contract */}');
    const contract = between(insuranceModals, '{/* Modal: Contract */}', '{/* Modal: Member */}');
    const member = between(insuranceModals, '{/* Modal: Member */}', '{/* Modal: Create Batch */}');
    const batch = between(insuranceModals, '{/* Modal: Create Batch */}', '{/* Modal: Settle Batch */}');
    const settle = insuranceModals.slice(insuranceModals.indexOf('{/* Modal: Settle Batch */}'));
    for (const m of [company, contract, member, settle]) {
      assert.match(m, /w-full max-w-2xl max-h-\[calc\(100vh-2rem\)\] flex flex-col/);
      assert.match(m, /p-6 space-y-4 flex-1 min-h-0 overflow-y-auto/);
      assert.doesNotMatch(m, /max-w-(md|lg)\b/);
      assert.match(m, /grid grid-cols-1 sm:grid-cols-2 gap-4/);
    }
    assert.match(batch, /w-full max-w-3xl/);
  });
});

describe('epay and insurance cards: identity rows', () => {
  it('terminal card shows the terminal code as a labelled LTR row only when it exists', () => {
    assert.match(terminalCard, /term\.terminalCode && \(/);
    assert.match(terminalCard, /كود الماكينة/);
    assert.match(terminalCard, /dir="ltr"[^>]*tabular-nums/);
    assert.match(terminalCard, /title=\{term\.terminalCode\}/);
    assert.equal(terminalCard.includes("'---'"), false);
  });

  it('company card shows phone, email, tax number and address rows when they exist', () => {
    const helper = between(insurance, 'const companyIdentityRows', 'export type InsuranceSubTab');
    for (const label of ['رقم الهاتف', 'البريد الإلكتروني', 'البطاقة الضريبية', 'العنوان']) assert.ok(helper.includes(label), label);
    for (const field of ['comp.phone', 'comp.email', 'comp.taxNumber', 'comp.address']) assert.ok(helper.includes(field), field);
    assert.match(companyCard, /identityRows\.map\(\(row\) =>/);
    assert.match(companyCard, /title=\{row\.value\}/);
  });
});

describe('touched blocks: theme discipline', () => {
  const blocks = [accountCard, accountModal, fundingModal, cancelModal, terminalCard, epayFunding, epayTerminal, epayCancel, companyCard, insuranceModals];
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it('has no hex colours, no emoji and no native select', () => {
    for (const b of blocks) {
      assert.doesNotMatch(b, /(?:^|[\s"'`])#[0-9a-fA-F]{6}\b/);
      assert.doesNotMatch(b, emoji);
      assert.doesNotMatch(b, /<select[\s>]/);
    }
  });

  it('has no slate/gray/zinc palette colours', () => {
    for (const b of blocks) assert.doesNotMatch(b, /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone)-\d/);
  });

  it('every text-ink / text-ink-muted in the cancel modals has a dark pair', () => {
    for (const b of [cancelModal, epayCancel]) {
      const classes = [...b.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
      for (const c of classes) {
        if (/(^|\s)text-ink(-muted)?(\s|$)/.test(c)) assert.match(c, /dark:text-ink/, c);
        if (/(^|\s)text-(danger|paid)(\s|$)/.test(c)) assert.match(c, /dark:text-(danger|paid)-bright/, c);
      }
    }
  });
});
