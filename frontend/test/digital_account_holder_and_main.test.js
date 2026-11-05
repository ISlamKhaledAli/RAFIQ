import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source guards: holder name + main account end to end (form, badge, set-main action, checkout card, host registration).
const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');
const readHost = (rel) => readFileSync(fileURLToPath(new URL(`../../desktop/${rel}`, import.meta.url)), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const wallets = read('views/wallets/WalletsView.tsx');
const modal = read('components/DigitalPaymentModal.tsx');
const card = read('components/payment/ReceivingAccountCard.tsx');
const ipc = read('bridge/ipc.ts');
const types = read('types/models.ts');

describe('accounts form: holder name and main account', () => {
  it('has a holder name field with the agreed label, hint and 60 character cap, and no star or optional wording', () => {
    assert.match(wallets, /اسم صاحب الحساب:/);
    assert.match(wallets, /الاسم الذي يظهر للزبون عند التحويل/);
    assert.match(wallets, /id="account-holder-name"[\s\S]{0,300}maxLength=\{60\}/);
    const field = wallets.slice(wallets.indexOf('id="account-holder-name"') - 200, wallets.indexOf('الاسم الذي يظهر للزبون عند التحويل'));
    assert.doesNotMatch(field, /RequiredMark/);
    assert.doesNotMatch(wallets, /اختياري/);
  });

  it('sends holderName and isDefault with the account and loads them when editing', () => {
    assert.match(wallets, /holderName: accountFormHolder\.trim\(\)/);
    assert.match(wallets, /isDefault: accountMainLocked \? true : accountFormIsDefault/);
    assert.match(wallets, /setAccountFormHolder\(acc\.holderName \|\| ''\)/);
    assert.match(wallets, /setAccountFormIsDefault\(acc\.isDefault === true\)/);
  });

  it('counts the new fields in the unsaved-changes check', () => {
    const dirty = wallets.slice(wallets.indexOf('const isAccountDirty'), wallets.indexOf('const { requestClose: requestCloseAccount'));
    assert.match(dirty, /accountFormHolder !== \(editingAccount\.holderName \|\| ''\)/);
    assert.match(dirty, /accountFormIsDefault !== \(editingAccount\.isDefault === true\)/);
  });

  it('has the main-account ToggleSwitch row with the agreed wording', () => {
    assert.match(wallets, /import \{ ToggleSwitch \} from '\.\.\/\.\.\/components\/ToggleSwitch'/);
    assert.match(wallets, /<ToggleSwitch[\s\S]{0,300}disabled=\{accountMainLocked\}/);
    assert.match(wallets, /الحساب الرئيسي \(يظهر في شاشة الدفع\)/);
    assert.match(wallets, /يظهر هذا الحساب للكاشير عند الدفع عبر انستاباي أو المحفظة، ويُسجَّل فيه المبلغ المستلم/);
    assert.doesNotMatch(wallets, /<select/);
  });

  it('forces the first active account of a type (and the current main one) to stay main', () => {
    assert.match(wallets, /const accountMainLocked = !accountHasActivePeer \|\| editingAccount\?\.isDefault === true/);
  });
});

describe('accounts list: badge and one-click main action', () => {
  it('shows the "رئيسي" badge only for isDefault accounts, on theme tokens with dark pair', () => {
    assert.match(wallets, /acc\.isDefault === true && \(/);
    const badge = wallets.slice(wallets.indexOf('data-testid="main-account-badge"') - 400, wallets.indexOf('data-testid="main-account-badge"'));
    assert.match(badge, /bg-brand-soft dark:bg-brand-dark-soft/);
    assert.match(badge, /text-brand-dark dark:text-brand-bright/);
    assert.match(wallets, /<span>رئيسي<\/span>/);
  });

  it('offers اجعله الرئيسي only to account managers on non-main accounts, through the dedicated host action', () => {
    assert.match(wallets, /canManageAccounts && acc\.isDefault !== true && \(/);
    assert.match(wallets, /اجعله الرئيسي/);
    assert.match(wallets, /invoke\('wallets:setDefaultAccount', \{ id: acc\.id \}\)/);
  });

  it('shows the holder name on the account card', () => {
    assert.match(wallets, /\{acc\.holderName && \(/);
  });
});

describe('types and mock bridge', () => {
  it('DigitalAccount carries holderName and isDefault', () => {
    const block = types.slice(types.indexOf('export interface DigitalAccount {'), types.indexOf('export interface DigitalTransaction'));
    assert.match(block, /holderName\?: string;/);
    assert.match(block, /isDefault\?: boolean;/);
  });

  it('mock keeps one main per type, forces the first active one, never keeps an inactive main, and has setDefaultAccount', () => {
    const saveMock = ipc.slice(ipc.indexOf("case 'wallets:saveAccount'"), ipc.indexOf("case 'wallets:deleteAccount'"));
    assert.match(saveMock, /\.slice\(0, 60\)/);
    assert.match(saveMock, /let isDefault = isActive && accData\.isDefault === true/);
    assert.match(saveMock, /a\.accountType === accType && a\.id !== accData\.id\) a\.isDefault = false/);
    assert.match(ipc, /case 'wallets:setDefaultAccount'/);
  });
});

describe('host registration of wallets:setDefaultAccount', () => {
  const dispatcher = readHost('Bridge/IpcDispatcher.cs');
  it('reuses wallets.accounts_manage and is registered as a mutation', () => {
    assert.match(dispatcher, /\{ "wallets:setDefaultAccount", "wallets\.accounts_manage" \}/);
    assert.match(dispatcher, /request\.Action == "wallets:setDefaultAccount"/);
    assert.match(dispatcher, /action == "wallets:setDefaultAccount"/);
  });

  it('is owned by the wallets feature on both sides and invalidates the wallets cache', () => {
    assert.match(readHost('Common/FeatureRegistry.cs'), /"wallets:setDefaultAccount"/);
    assert.match(read('context/featureTypes.ts'), /'wallets:setDefaultAccount'/);
    assert.match(ipc, /action\.startsWith\('wallets:setDefault'\)/);
  });

  it('is handled by the wallets dispatcher under the financial write lock', () => {
    const src = readHost('Bridge/IpcDispatcher.Wallets.cs');
    const block = src.slice(src.indexOf('case "wallets:setDefaultAccount"'), src.indexOf('case "wallets:deleteAccount"'));
    assert.match(block, /lock \(SaleService\.FinancialWriteLock\)/);
    assert.match(block, /repo\.SetDefaultAccount\(accountId\)/);
  });
});

describe('checkout "الحساب المستلم" card', () => {
  const code = stripComments(card);

  it('the dialog picks the account with the shared host-consistent helper, not by list position', () => {
    assert.match(modal, /pickReceivingAccount\(digitalAccounts, targetAccountType\)/);
    assert.doesNotMatch(modal, /digitalAccounts\.find\(/);
  });

  it('shows provider chip, then the big holder name, then the big number, in that order', () => {
    const chip = code.indexOf('digitalProviderLabel(account)');
    const holder = code.indexOf('اسم صاحب الحساب</span>');
    const number = code.indexOf('{numberRows ??');
    assert.ok(chip > 0 && holder > chip && number > holder, 'order chip < holder < number');
  });

  it('holder name is large, bold and brand coloured with a bright dark-mode pair', () => {
    assert.match(code, /text-xl'[\s\S]{0,80}font-black[\s\S]{0,40}text-brand dark:text-brand-bright/);
  });

  it('number is monospace tabular, at least text-2xl for a phone, ltr, selectable', () => {
    assert.match(code, /return 'text-2xl leading-8'/);
    assert.match(code, /dir="ltr"[\s\S]{0,200}font-mono font-black tabular-nums[\s\S]{0,80}select-all/);
  });

  it('has no copy button: the cashier only tells the customer the details', () => {
    assert.doesNotMatch(code, /نسخ|Copy|clipboard|copyToClipboard/);
    assert.doesNotMatch(modal, /navigator\.clipboard/);
  });

  it('InstaPay shows the address and the phone as equal rows, a wallet shows its number', () => {
    assert.match(code, /rows\.push\(\{ label: rowLabel\(numbers\.primary, isInstapay\)/);
    assert.match(code, /rows\.push\(\{ label: rowLabel\(numbers\.secondary, isInstapay\)/);
    assert.match(code, /'عنوان إنستاباي'/);
    assert.match(code, /'رقم الهاتف'/);
    assert.equal((code.match(/data-testid="receiving-number"/g) || []).length, 1, 'one shared row style for every number');
  });

  it('shows the internal account label only as the fallback when there is no holder name', () => {
    assert.doesNotMatch(code, /showAccountLabel/);
    assert.match(code, /\) : \(\s*<div className="min-w-0">\s*\{accountLabel && \(/);
  });

  it('nudges for the holder name only for users who can manage accounts, with a muted (not error) look', () => {
    assert.match(code, /canManageAccounts && \(/);
    const hint = code.slice(code.indexOf('أضف اسم صاحب الحساب') - 200, code.indexOf('أضف اسم صاحب الحساب') + 60);
    assert.match(hint, /text-ink-muted dark:text-ink-dark-muted/);
    assert.doesNotMatch(hint, /danger|warn/);
    assert.match(modal, /hasPermission\('wallets\.accounts_manage'\)/);
  });

  it('does not show the account balance (the customer is paying, the cashier does not need it)', () => {
    assert.doesNotMatch(code, /الرصيد|سيزداد|balancePiasters|formatArabicCurrency|netTotalPiasters/);
  });

  it('keeps the store-handle fallback with the same number rows', () => {
    assert.match(code, /\) : rows\.length > 0 \? \(\s*<div className="flex-1 min-w-0 flex flex-col justify-center">\{numberRows\}<\/div>/);
  });

  it('the dialog keeps its fixed outer box and delegates the account card', () => {
    assert.match(modal, /h-\[min\(38\.8125rem,92vh\)\]/);
    assert.doesNotMatch(modal, /navigator\.clipboard/);
    assert.match(modal, /<ReceivingAccountCard/);
  });

  it('uses theme tokens only: no hex, palette classes, arbitrary px text or native select', () => {
    assert.doesNotMatch(code, /(?:bg|text|border|ring)-\[#/);
    assert.doesNotMatch(code, /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:slate|gray|zinc|neutral|stone|amber|emerald|purple|cyan|red|green|blue|sky|teal|indigo|violet|pink|rose|orange|yellow|lime|fuchsia)-\d{2,3}/);
    assert.doesNotMatch(code, /text-\[\d/);
    assert.doesNotMatch(code, /<select/);
  });
});
